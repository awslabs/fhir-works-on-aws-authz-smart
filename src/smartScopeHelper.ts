import { BulkDataAuth, SystemOperation, TypeOperation } from 'fhir-works-on-aws-interface';
import {
    AccessModifier,
    ClinicalSmartScope,
    LaunchSmartScope,
    LaunchType,
    ScopeRule,
    ScopeType,
    SmartScope,
} from './smartConfig';

export const SEARCH_OPERATIONS: (TypeOperation | SystemOperation)[] = [
    'history-type',
    'history-instance',
    'search-type',
    'search-system',
    'history-system',
];

export const CLINICAL_SCOPE_REGEX = /^(?<scopeType>patient|user|system)\/(?<scopeResourceType>[A-Z][a-zA-Z]+|\*)\.(?<accessType>read|write|\*)$/;

export const LAUNCH_SCOPE_REGEX = /^(?<scopeType>launch)(\/(?<launchType>patient|encounter))?$/;

export function convertScopeToSmartScope(scope: string): SmartScope {
    const matchLaunchScope = scope.match(LAUNCH_SCOPE_REGEX);
    if (matchLaunchScope) {
        const { launchType } = matchLaunchScope.groups!;
        return {
            scopeType: 'launch',
            launchType: <LaunchType>launchType,
        };
    }
    const matchClinicalScope = scope.match(CLINICAL_SCOPE_REGEX);
    if (matchClinicalScope) {
        const { scopeType, scopeResourceType, accessType } = matchClinicalScope.groups!;

        return {
            scopeType: <ScopeType>scopeType,
            resourceType: scopeResourceType,
            accessType: <AccessModifier>accessType,
        };
    }

    throw new Error('Not a SmartScope');
}

export function getValidOperationsForScopeTypeAndAccessType(
    scopeType: ScopeType,
    accessType: string,
    scopeRule: ScopeRule,
): (TypeOperation | SystemOperation)[] {
    let validOperations: (TypeOperation | SystemOperation)[] = [];
    if (accessType === '*' || accessType === 'read') {
        validOperations = scopeRule[scopeType].read;
    }
    if (accessType === '*' || accessType === 'write') {
        validOperations = validOperations.concat(scopeRule[scopeType].write);
    }
    return validOperations;
}

export function getValidOperationsForScope(
    smartScope: SmartScope,
    scopeRule: ScopeRule,
    reqOperation: TypeOperation | SystemOperation,
    reqResourceType?: string,
): (TypeOperation | SystemOperation)[] {
    let validOperations: (TypeOperation | SystemOperation)[] = [];
    if (smartScope.scopeType === 'launch') {
        const launchSmartScope = <LaunchSmartScope>smartScope;
        // TODO: should launch have access to only certain resourceTypes?
        validOperations = scopeRule.launch[launchSmartScope.launchType ?? 'launch'];
    } else if ((<ClinicalSmartScope>smartScope).scopeType) {
        const clinicalSmartScope = <ClinicalSmartScope>smartScope;
        const { scopeType, resourceType, accessType } = clinicalSmartScope;
        if (reqResourceType) {
            if (resourceType === '*' || resourceType === reqResourceType) {
                validOperations = getValidOperationsForScopeTypeAndAccessType(scopeType, accessType, scopeRule);
            }
        }
        // 'search-system' and 'history-system' request operation requires '*' for scopeResourceType
        else if (['search-system', 'history-system'].includes(reqOperation) && resourceType === '*') {
            validOperations = getValidOperationsForScopeTypeAndAccessType(scopeType, accessType, scopeRule);
        } else if (['transaction', 'batch'].includes(reqOperation)) {
            validOperations = getValidOperationsForScopeTypeAndAccessType(scopeType, accessType, scopeRule);
        }
    }
    return validOperations;
}

// eslint-disable-next-line class-methods-use-this
export function getScopes(scopeValueType: 'space' | 'array', scopes: string | string[]): string[] {
    if (scopeValueType === 'space' && typeof scopes === 'string') {
        return scopes.split(' ');
    }
    if (scopeValueType === 'array' && Array.isArray(scopes)) {
        return scopes;
    }
    return [];
}

export function isSmartScopeSufficientForBulkDataAccess(
    bulkDataAuth: BulkDataAuth,
    smartScope: SmartScope,
    scopeRule: ScopeRule,
) {
    const bulkDataRequestHasCorrectScope =
        bulkDataAuth.exportType === 'system' && // As of 12/9/20 we only support System Level export
        smartScope.scopeType === 'user' &&
        smartScope.resourceType === '*' &&
        ['*', 'read'].includes(smartScope.accessType) &&
        getValidOperationsForScopeTypeAndAccessType(smartScope.scopeType, smartScope.accessType, scopeRule).includes(
            'read',
        );
    if (
        ['initiate-export', 'get-status-export', 'cancel-export'].includes(bulkDataAuth.operation) &&
        bulkDataRequestHasCorrectScope
    ) {
        return true;
    }
    return false;
}

export function areScopesSufficient(
    scopes: string[],
    operation: TypeOperation | SystemOperation,
    scopeRule: ScopeRule,
    resourceType?: string,
    bulkDataAuth?: BulkDataAuth,
): boolean {
    for (let i = 0; i < scopes.length; i += 1) {
        const scope = scopes[i];
        let smartScope: SmartScope | undefined;
        try {
            smartScope = convertScopeToSmartScope(scope);
        } catch (e) {
            // Caused by trying to convert non-SmartScope to SmartScope, for example converting scope 'openid' or 'profile'
            // We don't need to check non-SmartScope
        }
        if (smartScope) {
            if (bulkDataAuth) {
                if (isSmartScopeSufficientForBulkDataAccess(bulkDataAuth, smartScope, scopeRule)) {
                    return true;
                }
            } else {
                const validOperations: (TypeOperation | SystemOperation)[] = getValidOperationsForScope(
                    smartScope,
                    scopeRule,
                    operation,
                    resourceType,
                );
                if (validOperations.includes(operation)) return true;
            }
        }
    }
    return false;
}
