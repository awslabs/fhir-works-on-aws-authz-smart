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

    constructor(config: SMARTConfig, apiUrl: string) {
        if (config.version !== this.version) {
            throw Error('Authorization configuration version does not match handler version');
        }
        this.config = config;
        this.apiUrl = apiUrl;
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
        let response;
        try {
            response = await axios.get(this.config.userInfoEndpoint, {
                headers: { Authorization: `Bearer ${request.accessToken}` },
            });
        } catch (e) {
            console.error('Post to authZUserInfoUrl failed', e);
        }

        // const response: any = {
        //     data: {
        //         fhirUser: 'https://API_URL.com/Practitioner/123',
        //         sub: 'fakeSub1',
        //     },
        // };

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

    private getScopes(decoded: any): string[] {
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

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
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
            // https://github.com/awslabs/fhir-works-on-aws-routing/blob/mainline/src/router/bundle/bundleParser.ts#L71
            // search-system, patch, vread not supported
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

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
    async getAllowedResourceTypesForOperation(request: AllowedResourceTypesForOperationRequest): Promise<string[]> {
        const { scopes } = request.userIdentity;
        const { scopeRule } = this.config;
        let validOperations: (TypeOperation | SystemOperation)[] = [];
        scopes.forEach((scope: string) => {
            let match = scope.match(SMARTHandler.LAUNCH_SCOPE_REGEX);
            if (!match) {
                match = scope.match(SMARTHandler.CLINICAL_SCOPE_REGEX);
            }
            if (match !== null) {
                const { scopeType } = match.groups!;
                if (scopeType === 'launch') {
                    const { launchType } = match.groups!;
                    // TODO: should launch have access to only certain resourceTypes?
                    if (['patient', 'encounter'].includes(launchType)) {
                        validOperations = validOperations.concat(scopeRule[scopeType][<LaunchType>launchType]);
                    } else if (!launchType) {
                        validOperations = validOperations.concat(scopeRule[scopeType].launch);
                    }
                } else if (['patient', 'user', 'system'].includes(scopeType)) {
                    const { accessType } = match.groups!;
                    validOperations = validOperations.concat(
                        this.getValidOperationsForScope(<ScopeType>scopeType, accessType),
                    );
                }
            }
        });
        validOperations = [...new Set(validOperations)];
        console.log('validOperations', validOperations);
        return validOperations;
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
        const { scopeRule } = this.config;
        for (let i = 0; i < scopes.length; i += 1) {
            const scope = scopes[i];
            let match = scope.match(SMARTHandler.LAUNCH_SCOPE_REGEX);
            if (!match) {
                match = scope.match(SMARTHandler.CLINICAL_SCOPE_REGEX);
            }
            if (match !== null) {
                const { scopeType } = match.groups!;
                let validOperations: (TypeOperation | SystemOperation)[] = [];
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
                    // transaction operations do not have a resourceType
                    if (operation === 'transaction') {
                        validOperations = this.getValidOperationsForScope(<ScopeType>scopeType, '*');
                    }
                    if (resourceType) {
                        if (scopeResourceType === '*' || scopeResourceType === resourceType) {
                            validOperations = this.getValidOperationsForScope(<ScopeType>scopeType, accessType);
                        }
                    } else if (scopeResourceType === '*') {
                        validOperations = this.getValidOperationsForScope(<ScopeType>scopeType, accessType);
                    }
                }
                if (validOperations.includes(operation)) return true;
            }
        }
        return false;
    }

    private getValidOperationsForScope(scopeType: ScopeType, accessType: string) {
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
