/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { decode } from 'jsonwebtoken';
import {
    Authorization,
    VerifyAccessTokenRequest,
    AuthorizationBundleRequest,
    AllowedResourceTypesForOperationRequest,
    SystemOperation,
    TypeOperation,
    UnauthorizedError,
    ReadResponseAuthorizedRequest,
    WriteRequestAuthorizedRequest,
    AccessBulkDataJobRequest,
    KeyValueMap,
    clone,
    BatchReadWriteRequest,
    BASE_R4_RESOURCES,
    FhirVersion,
    BASE_STU3_RESOURCES,
    BulkDataAuth,
} from 'fhir-works-on-aws-interface';
import axios from 'axios';
import {
    IdentityType,
    LaunchType,
    ScopeType,
    SmartScope,
    SMARTConfig,
    AccessModifier,
    LaunchSmartScope,
    ClinicalSmartScope,
} from './smartConfig';

// eslint-disable-next-line import/prefer-default-export
export class SMARTHandler implements Authorization {
    static readonly CLINICAL_SCOPE_REGEX = /^(?<scopeType>patient|user|system)\/(?<scopeResourceType>[A-Z][a-zA-Z]+|\*)\.(?<accessType>read|write|\*)$/;

    static readonly LAUNCH_SCOPE_REGEX = /^(?<scopeType>launch)(\/(?<launchType>patient|encounter))?$/;

    static readonly FHIR_USER_REGEX = /^(?<hostname>(http|https):\/\/([A-Za-z0-9\-\\.:%$_]*\/)+)(?<resourceType>Person|Practitioner|RelatedPerson|Patient)\/(?<id>[A-Za-z0-9\-.]+)$/;

    static readonly SEARCH_OPERATIONS: (TypeOperation | SystemOperation)[] = [
        'history-type',
        'history-instance',
        'search-type',
        'search-system',
        'history-system',
    ];

    private readonly typesWithWriteAccess: IdentityType[] = ['Practitioner'];

    private readonly adminAccessTypes: IdentityType[] = ['Practitioner'];

    private readonly version: number = 1.0;

    private readonly config: SMARTConfig;

    private readonly apiUrl: string;

    private readonly fhirVersion: FhirVersion;

    constructor(config: SMARTConfig, apiUrl: string, fhirVersion: FhirVersion) {
        if (config.version !== this.version) {
            throw Error('Authorization configuration version does not match handler version');
        }
        this.config = config;
        this.apiUrl = apiUrl;
        this.fhirVersion = fhirVersion;
    }

    async verifyAccessToken(request: VerifyAccessTokenRequest): Promise<KeyValueMap> {
        // The access_token will be verified by hitting the authZUserInfoUrl (token introspection)
        // Decoding first to determine if it passes scope & claims check first
        const decoded = decode(request.accessToken, { json: true }) || {};
        const { aud, iss } = decoded;
        const audArray = Array.isArray(aud) ? aud : [aud];

        // verify aud & iss
        if (!audArray.includes(this.config.expectedAudValue) || this.config.expectedIssValue !== iss) {
            console.error('aud or iss is not matching');
            throw new UnauthorizedError('Error validating the validity of the access_token');
        }

        // verify scope
        const scopes = this.getScopes(decoded[this.config.scopeKey]);
        if (!this.areScopesSufficient(scopes, request.operation, request.resourceType, request.bulkDataAuth)) {
            console.error('User supplied scopes are insufficient', {
                scopes,
                operation: request.operation,
                resourceType: request.resourceType,
            });
            throw new UnauthorizedError('User does not have permission for requested operation');
        }

        // verify token
        let response: any;
        try {
            response = await axios.get(this.config.userInfoEndpoint, {
                headers: { Authorization: `Bearer ${request.accessToken}` },
            });
        } catch (e) {
            console.error('Post to authZUserInfoUrl failed', e);
        }

        const { fhirUserClaimKey } = this.config;
        if (!response || !response.data[fhirUserClaimKey]) {
            console.error(`result from AuthZ did not have ${fhirUserClaimKey} claim`);
            throw new UnauthorizedError("Cannot determine requester's identity");
        } else if (!response.data[fhirUserClaimKey].match(SMARTHandler.FHIR_USER_REGEX)) {
            console.error(
                `User identity found does not conform to the expected format: ${SMARTHandler.FHIR_USER_REGEX}`,
            );
            throw new UnauthorizedError("Requester's identity is in the incorrect format");
        } else if (request.bulkDataAuth) {
            const fhirUser = this.getFhirUser(response.data);
            if (fhirUser.hostname !== this.apiUrl || !this.adminAccessTypes.includes(fhirUser.resourceType)) {
                throw new UnauthorizedError('User does not have permission for requested operation');
            }
        }

        const userIdentity = clone(response.data);
        userIdentity.scopes = scopes;
        return userIdentity;
    }

    private getScopes(scopes: string | string[]): string[] {
        if (this.config.scopeValueType === 'space' && typeof scopes === 'string') {
            return scopes.split(' ');
        }
        if (this.config.scopeValueType === 'array' && Array.isArray(scopes)) {
            return scopes;
        }
        return [];
    }

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
    async isAccessBulkDataJobAllowed(request: AccessBulkDataJobRequest): Promise<void> {
        if (request.userIdentity.sub !== request.jobOwnerId) {
            throw new UnauthorizedError('User does not have permission to access this Bulk Data Export job');
        }
    }

    async isBundleRequestAuthorized(request: AuthorizationBundleRequest): Promise<void> {
        const { scopes } = request.userIdentity;
        request.requests.forEach((req: BatchReadWriteRequest) => {
            if (!this.areScopesSufficient(scopes, req.operation, req.resourceType)) {
                console.error('User supplied scopes are insufficient', {
                    scopes,
                    operation: req.operation,
                    resourceType: req.resourceType,
                });
                throw new UnauthorizedError('An entry within the Bundle is not authorized');
            }
        });

        const authWritePromises: Promise<void>[] = request.requests.map(req => {
            if (['create', 'update', 'patch', 'delete'].includes(req.operation)) {
                return this.isWriteRequestAuthorized(<WriteRequestAuthorizedRequest>{
                    userIdentity: request.userIdentity,
                    operation: req.operation,
                    resourceBody: req.resource,
                });
            }
            return Promise.resolve();
        });

        try {
            await Promise.all(authWritePromises);
        } catch (e) {
            throw new UnauthorizedError('An entry within the Bundle is not authorized');
        }
    }

    async getAllowedResourceTypesForOperation(request: AllowedResourceTypesForOperationRequest): Promise<string[]> {
        let allowedResources: string[] = [];
        for (let i = 0; i < request.userIdentity.scopes.length; i += 1) {
            const scope = request.userIdentity.scopes[i];
            try {
                const smartScope = this.convertScopeToSmartScope(scope);
                // We only get allowedResourceTypes for ClinicalSmartScope
                if (['patient', 'user', 'system'].includes(smartScope.scopeType)) {
                    const clinicalSmartScope = <ClinicalSmartScope>smartScope;
                    const validOperations = this.getValidOperationsForScopeTypeAndAccessType(
                        clinicalSmartScope.scopeType,
                        clinicalSmartScope.accessType,
                    );
                    if (validOperations.includes(request.operation)) {
                        const allowedResourcesForScope: string[] =
                            this.fhirVersion === '4.0.1' ? BASE_R4_RESOURCES : BASE_STU3_RESOURCES;
                        if (['patient', 'user', 'system'].includes(clinicalSmartScope.scopeType)) {
                            const scopeResourceType = clinicalSmartScope.resourceType;
                            if (scopeResourceType === '*') {
                                return allowedResourcesForScope;
                            }
                            if (allowedResourcesForScope.includes(scopeResourceType)) {
                                allowedResources = allowedResources.concat(scopeResourceType);
                            }
                        }
                    }
                }
            } catch (e) {
                // Caused by trying to convert non-SmartScope to SmartScope, for example converting scope 'openid' or 'profile'
            }
        }
        allowedResources = [...new Set(allowedResources)];
        return allowedResources;
    }

    async authorizeAndFilterReadResponse(request: ReadResponseAuthorizedRequest): Promise<any> {
        const fhirUser = this.getFhirUser(request.userIdentity);
        const { operation, readResponse } = request;
        // If request is a search treat the readResponse as a bundle
        if (SMARTHandler.SEARCH_OPERATIONS.includes(operation)) {
            const entries = (readResponse.entry ?? []).filter((entry: { resource: any }) =>
                this.authorizeResource(fhirUser, entry.resource),
            );
            return { ...readResponse, entry: entries };
        }
        // If request is != search treat the readResponse as just a resource
        if (!this.authorizeResource(fhirUser, readResponse)) {
            throw new UnauthorizedError('User does not have permission for requested resource');
        }

        return readResponse;
    }

    async isWriteRequestAuthorized(request: WriteRequestAuthorizedRequest): Promise<void> {
        const fhirUser = this.getFhirUser(request.userIdentity);
        if (fhirUser.hostname !== this.apiUrl || !this.typesWithWriteAccess.includes(fhirUser.resourceType)) {
            throw new UnauthorizedError('User does not have permission for requested operation');
        }
    }

    private authorizeResource(
        fhirUser: { hostname: string; resourceType: IdentityType; id: string },
        resource: any,
    ): boolean {
        const jsonStr = JSON.stringify(resource);
        if (fhirUser.hostname !== this.apiUrl) {
            // If requester is not from this FHIR Server they must be a fully qualified reference
            return jsonStr.includes(`"reference":"${fhirUser.hostname}${fhirUser.resourceType}/${fhirUser.id}"`);
        }
        if (fhirUser.resourceType === 'Practitioner') {
            return true;
        }
        if (fhirUser.resourceType === resource.resourceType) {
            // Attempting to look up its own record
            return fhirUser.id === resource.id || this.isLocalUserInJsonAsReference(jsonStr, fhirUser);
        }
        return this.isLocalUserInJsonAsReference(jsonStr, fhirUser);
    }

    // eslint-disable-next-line class-methods-use-this
    private isLocalUserInJsonAsReference(
        jsonStr: string,
        fhirUser: { hostname: string; resourceType: IdentityType; id: string },
    ) {
        return (
            jsonStr.includes(`"reference":"${fhirUser.hostname}${fhirUser.resourceType}/${fhirUser.id}"`) ||
            jsonStr.includes(`"reference":"${fhirUser.resourceType}/${fhirUser.id}"`)
        );
    }

    private getFhirUser(userIdentity: KeyValueMap): { hostname: string; resourceType: IdentityType; id: string } {
        const { fhirUserClaimKey } = this.config;
        const fhirUserValue = userIdentity[fhirUserClaimKey];
        const match = fhirUserValue.match(SMARTHandler.FHIR_USER_REGEX);
        if (match) {
            const { hostname, resourceType, id } = match.groups!;
            return { hostname, resourceType, id };
        }
        throw new UnauthorizedError("Requester's identity is in the incorrect format");
    }

    private areScopesSufficient(
        scopes: string[],
        operation: TypeOperation | SystemOperation,
        resourceType?: string,
        bulkDataAuth?: BulkDataAuth,
    ): boolean {
        for (let i = 0; i < scopes.length; i += 1) {
            const scope = scopes[i];
            let smartScope: SmartScope | undefined;
            try {
                smartScope = this.convertScopeToSmartScope(scope);
            } catch (e) {
                // Caused by trying to convert non-SmartScope to SmartScope, for example converting scope 'openid' or 'profile'
                // We don't need to check non-SmartScope
            }
            if (smartScope) {
                if (bulkDataAuth) {
                    if (this.isSmartScopeSufficientForBulkDataAccess(bulkDataAuth, smartScope)) {
                        return true;
                    }
                } else {
                    const validOperations: (TypeOperation | SystemOperation)[] = this.getValidOperationsForScope(
                        smartScope,
                        operation,
                        resourceType,
                    );
                    if (validOperations.includes(operation)) return true;
                }
            }
        }
        return false;
    }

    private isSmartScopeSufficientForBulkDataAccess(bulkDataAuth: BulkDataAuth, smartScope: SmartScope) {
        const bulkDataRequestHasCorrectScope =
            bulkDataAuth.exportType === 'system' && // As of 12/9/20 we only support System Level export
            smartScope.scopeType === 'user' &&
            smartScope.resourceType === '*' &&
            ['*', 'read'].includes(smartScope.accessType) &&
            this.getValidOperationsForScopeTypeAndAccessType(smartScope.scopeType, smartScope.accessType).includes(
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

    // eslint-disable-next-line class-methods-use-this
    private convertScopeToSmartScope(scope: string): SmartScope {
        const matchLaunchScope = scope.match(SMARTHandler.LAUNCH_SCOPE_REGEX);
        if (matchLaunchScope) {
            const { launchType } = matchLaunchScope.groups!;
            return {
                scopeType: 'launch',
                launchType: <LaunchType>launchType,
            };
        }
        const matchClinicalScope = scope.match(SMARTHandler.CLINICAL_SCOPE_REGEX);
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

    private getValidOperationsForScope(
        smartScope: SmartScope,
        reqOperation: TypeOperation | SystemOperation,
        reqResourceType?: string,
    ): (TypeOperation | SystemOperation)[] {
        const { scopeRule } = this.config;
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
                    validOperations = this.getValidOperationsForScopeTypeAndAccessType(scopeType, accessType);
                }
            }
            // 'search-system' and 'history-system' request operation requires '*' for scopeResourceType
            else if (['search-system', 'history-system'].includes(reqOperation) && resourceType === '*') {
                validOperations = this.getValidOperationsForScopeTypeAndAccessType(scopeType, accessType);
            } else if (['transaction', 'batch'].includes(reqOperation)) {
                validOperations = this.getValidOperationsForScopeTypeAndAccessType(scopeType, accessType);
            }
        }
        return validOperations;
    }

    private getValidOperationsForScopeTypeAndAccessType(
        scopeType: ScopeType,
        accessType: string,
    ): (TypeOperation | SystemOperation)[] {
        let validOperations: (TypeOperation | SystemOperation)[] = [];
        if (accessType === '*' || accessType === 'read') {
            validOperations = this.config.scopeRule[scopeType].read;
        }
        if (accessType === '*' || accessType === 'write') {
            validOperations = validOperations.concat(this.config.scopeRule[scopeType].write);
        }
        return validOperations;
    }
}
