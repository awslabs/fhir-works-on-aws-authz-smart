/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { BulkDataAuth, SystemOperation, TypeOperation } from 'fhir-works-on-aws-interface';
import { AccessModifier, ClinicalSmartScope, ScopeRule, ScopeType } from './smartConfig';

export const SEARCH_OPERATIONS: (TypeOperation | SystemOperation)[] = [
    'search-type',
    'search-system',
    'history-type',
    'history-instance',
    'history-system',
];

export const CLINICAL_SCOPE_REGEX = /^(?<scopeType>patient|user)\/(?<scopeResourceType>[A-Z][a-zA-Z]+|\*)\.(?<accessType>read|write|\*)$/;

export function convertScopeToSmartScope(scope: string): ClinicalSmartScope {
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
    accessType: AccessModifier,
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

function getValidOperationsForScope(
    smartScope: ClinicalSmartScope,
    scopeRule: ScopeRule,
    reqOperation: TypeOperation | SystemOperation,
    reqResourceType?: string,
): (TypeOperation | SystemOperation)[] {
    let validOperations: (TypeOperation | SystemOperation)[] = [];
    const { scopeType, resourceType, accessType } = smartScope;
    if (reqResourceType) {
        if (resourceType === '*' || resourceType === reqResourceType) {
            validOperations = getValidOperationsForScopeTypeAndAccessType(scopeType, accessType, scopeRule);
        }
    }
    // 'search-system' and 'history-system' request operation requires '*' for scopeResourceType
    else if (
        (['search-system', 'history-system'].includes(reqOperation) && resourceType === '*') ||
        ['transaction', 'batch'].includes(reqOperation)
    ) {
        validOperations = getValidOperationsForScopeTypeAndAccessType(scopeType, accessType, scopeRule);
    }

    return validOperations;
}

export function getScopes(scopes: string | string[]): string[] {
    if (Array.isArray(scopes)) {
        return scopes;
    }
    if (typeof scopes === 'string') {
        return scopes.split(' ');
    }
    return [];
}

function isSmartScopeSufficientForBulkDataAccess(
    bulkDataAuth: BulkDataAuth,
    smartScope: ClinicalSmartScope,
    scopeRule: ScopeRule,
) {
    const bulkDataRequestHasCorrectScope =
        bulkDataAuth.exportType === 'system' && // As of 2021-01-09 we only support System Level export
        smartScope.scopeType === 'user' &&
        smartScope.resourceType === '*' &&
        ['*', 'read'].includes(smartScope.accessType) &&
        getValidOperationsForScopeTypeAndAccessType(smartScope.scopeType, smartScope.accessType, scopeRule).includes(
            'read',
        );
    return (
        ['initiate-export', 'get-status-export', 'cancel-export'].includes(bulkDataAuth.operation) &&
        bulkDataRequestHasCorrectScope
    );
}

export function isScopeSufficient(
    scope: string,
    scopeRule: ScopeRule,
    reqOperation: TypeOperation | SystemOperation,
    reqResourceType?: string,
    bulkDataAuth?: BulkDataAuth,
): boolean {
    try {
        const smartScope = convertScopeToSmartScope(scope);
        if (bulkDataAuth) {
            if (isSmartScopeSufficientForBulkDataAccess(bulkDataAuth, smartScope, scopeRule)) {
                return true;
            }
        } else {
            const validOperations: (TypeOperation | SystemOperation)[] = getValidOperationsForScope(
                smartScope,
                scopeRule,
                reqOperation,
                reqResourceType,
            );
            if (validOperations.includes(reqOperation)) return true;
        }
    } catch (e) {
        // Caused by trying to convert non-SmartScope to SmartScope, for example converting non-SMART scope 'openid'
    }

    return false;
}

/**
 * Remove scopes that do not have the required information to be useful or unused scopes. For example:
 * - Without the `fhirUser` claim the 'user' scopes cannot be validated
 * - Without the `launch_response_patient` claim the 'patient' scopes cannot be validated
 * - Scopes like profile, launch or fhirUser will be filtered out as well
 */
export function filterOutUnusableScope(
    scopes: string[],
    scopeRule: ScopeRule,
    reqOperation: TypeOperation | SystemOperation,
    reqResourceType?: string,
    bulkDataAuth?: BulkDataAuth,
    patientContext?: string,
    fhirUser?: string,
): string[] {
    return scopes.filter(
        (scope: string) =>
            ((patientContext && scope.startsWith('patient/')) || (fhirUser && scope.startsWith('user/'))) &&
            isScopeSufficient(scope, scopeRule, reqOperation, reqResourceType, bulkDataAuth),
    );
}
