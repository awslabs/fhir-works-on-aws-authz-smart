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
} from 'fhir-works-on-aws-interface';
import axios from 'axios';
import { IdentityType, LaunchType, ScopeType, SMARTConfig } from './smartConfig';

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
        const scopes = this.getScopes(decoded);
        console.log('request', request);
        console.log('scopes', scopes);
        if (!this.areScopesSufficient(scopes, request.operation, request.resourceType)) {
            console.error(
                `User supplied scopes are insufficient\nscopes: ${scopes}\noperation: ${request.operation}\nresourceType: ${request.resourceType}`,
            );
            throw new UnauthorizedError('User does not have permission for requested operation');
        }

        // verify token
        // let response;
        // try {
        //     response = await axios.get(this.config.userInfoEndpoint, {
        //         headers: { Authorization: `Bearer ${request.accessToken}` },
        //     });
        // } catch (e) {
        //     console.error('Post to authZUserInfoUrl failed', e);
        // }

        // Code for testing locally, code will be deleted before merging
        const response: any = {
            data: {
                fhirUser: 'https://API_URL.com/Practitioner/123',
                sub: 'fakeSub1',
            },
        };

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

    private getScopes(decoded: Record<string, any>): string[] {
        if (this.config.scopeValueType === 'space' && typeof decoded[this.config.scopeKey] === 'string') {
            return decoded[this.config.scopeKey].split(' ');
        }
        if (this.config.scopeValueType === 'array' && Array.isArray(decoded[this.config.scopeKey])) {
            return decoded[this.config.scopeKey];
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
                console.error(
                    `User supplied scopes are insufficient\nscopes: ${scopes}\noperation: ${req.operation}\nresourceType: ${req.resourceType}`,
                );
                throw new UnauthorizedError('Bundle operation is not authorzied');
            }
        });
        const authWritePromises = request.requests.map(req => {
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
            throw new UnauthorizedError('Bundle operation is not authorized');
        }
    }

    async getAllowedResourceTypesForOperation(request: AllowedResourceTypesForOperationRequest): Promise<string[]> {
        console.log('beginning of getAllowedResourceTypesForOperation');
        let allowedResources: string[] = [];
        request.userIdentity.scopes.forEach((scope: string) => {
            const validOperations = this.getValidOperationsForScope(scope);
            console.log('validOperations', validOperations);
            // If the scope allows request.operation, get all the resources allowed for that operation as defined by the requester's scopes
            if (validOperations.includes(request.operation)) {
                const match = scope.match(SMARTHandler.CLINICAL_SCOPE_REGEX);
                if (match !== null) {
                    const { scopeType } = match.groups!;
                    const allowedResourcesForScope: string[] =
                        this.fhirVersion === '4.0.1' ? BASE_R4_RESOURCES : BASE_STU3_RESOURCES;
                    if (['patient', 'user', 'system'].includes(scopeType)) {
                        const { scopeResourceType } = match.groups!;
                        if (scopeResourceType === '*') {
                            allowedResources = allowedResources.concat(allowedResourcesForScope);
                        } else if (allowedResourcesForScope.includes(scopeResourceType)) {
                            allowedResources = allowedResources.concat(scopeResourceType);
                        }
                    }
                }
            }
        });
        allowedResources = [...new Set(allowedResources)];
        console.log('allowedResources', allowedResources);
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
    ): boolean {
        for (let i = 0; i < scopes.length; i += 1) {
            const scope = scopes[i];
            const validOperations: (TypeOperation | SystemOperation)[] = this.getValidOperationsForScope(
                scope,
                resourceType,
                ['transaction', 'batch'].includes(operation),
            );
            if (validOperations.includes(operation)) return true;
        }
        return false;
    }

    private getValidOperationsForScope(
        scope: string,
        resourceType?: string,
        isBundleOperation: boolean = false,
    ): (TypeOperation | SystemOperation)[] {
        console.log('scope, resourceType', scope, resourceType);
        const { scopeRule } = this.config;
        let match = scope.match(SMARTHandler.LAUNCH_SCOPE_REGEX);
        if (!match) {
            match = scope.match(SMARTHandler.CLINICAL_SCOPE_REGEX);
        }
        let validOperations: (TypeOperation | SystemOperation)[] = [];
        if (match !== null) {
            const { scopeType } = match.groups!;
            if (scopeType === 'launch') {
                const { launchType } = match.groups!;
                // TODO: should launch have access to only certain resourceTypes?
                if (['patient', 'encounter'].includes(launchType)) {
                    validOperations = scopeRule[scopeType][<LaunchType>launchType];
                } else if (!launchType) {
                    validOperations = scopeRule[scopeType].launch;
                }
            } else if (['patient', 'user', 'system'].includes(scopeType)) {
                const { scopeResourceType, accessType } = match.groups!;
                // transaction/batch operations do not have a resourceType
                if (isBundleOperation) {
                    console.log('inside isBundleOperation');
                    validOperations = this.getValidOperationsForScopeGivenScopeRule(<ScopeType>scopeType, accessType);
                } else if (resourceType) {
                    if (scopeResourceType === '*' || scopeResourceType === resourceType) {
                        validOperations = this.getValidOperationsForScopeGivenScopeRule(
                            <ScopeType>scopeType,
                            accessType,
                        );
                    }
                } else if (scopeResourceType === '*') {
                    validOperations = this.getValidOperationsForScopeGivenScopeRule(<ScopeType>scopeType, accessType);
                }
            }
        }
        console.log('validOperations', validOperations);
        return validOperations;
    }

    private getValidOperationsForScopeGivenScopeRule(
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
