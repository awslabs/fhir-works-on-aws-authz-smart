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
    GetSearchFilterBasedOnIdentityRequest,
    SearchFilter,
} from 'fhir-works-on-aws-interface';
import axios from 'axios';
import { IdentityType, SMARTConfig, ClinicalSmartScope } from './smartConfig';
import {
    areScopesSufficient,
    convertScopeToSmartScope,
    getScopes,
    getValidOperationsForScopeTypeAndAccessType,
    SEARCH_OPERATIONS,
} from './smartScopeHelper';
import { authorizeResource, FHIR_USER_REGEX, getFhirUser } from './smartAuthorizeHelper';

// eslint-disable-next-line import/prefer-default-export
export class SMARTHandler implements Authorization {
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
        const scopes = getScopes(this.config.scopeValueType, decoded[this.config.scopeKey]);
        if (
            !areScopesSufficient(
                scopes,
                request.operation,
                this.config.scopeRule,
                request.resourceType,
                request.bulkDataAuth,
            )
        ) {
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
        } else if (!response.data[fhirUserClaimKey].match(FHIR_USER_REGEX)) {
            console.error(`User identity found does not conform to the expected format: ${FHIR_USER_REGEX}`);
            throw new UnauthorizedError("Requester's identity is in the incorrect format");
        } else if (request.bulkDataAuth) {
            const fhirUser = getFhirUser(response.data, this.config.fhirUserClaimKey);
            if (fhirUser.hostname !== this.apiUrl || !this.adminAccessTypes.includes(fhirUser.resourceType)) {
                throw new UnauthorizedError('User does not have permission for requested operation');
            }
        }

        const userIdentity = clone(response.data);
        userIdentity.scopes = scopes;
        return userIdentity;
    }

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
    async isAccessBulkDataJobAllowed(request: AccessBulkDataJobRequest): Promise<void> {
        if (request.userIdentity.sub !== request.jobOwnerId) {
            throw new UnauthorizedError('User does not have permission to access this Bulk Data Export job');
        }
    }

    async getSearchFilterBasedOnIdentity(request: GetSearchFilterBasedOnIdentityRequest): Promise<SearchFilter[]> {
        const fhirUser = getFhirUser(request.userIdentity, this.config.fhirUserClaimKey);
        const { hostname, resourceType, id } = fhirUser;

        // Create a SearchFilter to limit access to only resources that are referring to the requesting user
        if (resourceType !== 'Practitioner') {
            const searchFilter: SearchFilter = {
                key: '_reference',
                value: [`${hostname}${resourceType}/${id}`],
                comparisonOperator: '==',
                logicalOperator: 'OR', // logicalOperator can be either 'AND' or 'OR' since value is an array of one string
            };
            if (hostname === this.apiUrl) {
                searchFilter.value = [`${resourceType}/${id}`, `${hostname}${resourceType}/${id}`];
            }
            return [searchFilter];
        }

        return [];
    }

    async isBundleRequestAuthorized(request: AuthorizationBundleRequest): Promise<void> {
        const { scopes } = request.userIdentity;
        request.requests.forEach((req: BatchReadWriteRequest) => {
            if (!areScopesSufficient(scopes, req.operation, this.config.scopeRule, req.resourceType)) {
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
                const smartScope = convertScopeToSmartScope(scope);
                // We only get allowedResourceTypes for ClinicalSmartScope
                if (['patient', 'user', 'system'].includes(smartScope.scopeType)) {
                    const clinicalSmartScope = <ClinicalSmartScope>smartScope;
                    const validOperations = getValidOperationsForScopeTypeAndAccessType(
                        clinicalSmartScope.scopeType,
                        clinicalSmartScope.accessType,
                        this.config.scopeRule,
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
        const fhirUser = getFhirUser(request.userIdentity, this.config.fhirUserClaimKey);
        const { operation, readResponse } = request;
        // If request is a search treat the readResponse as a bundle
        if (SEARCH_OPERATIONS.includes(operation)) {
            const entries = (readResponse.entry ?? []).filter((entry: { resource: any }) =>
                authorizeResource(fhirUser, entry.resource, this.apiUrl),
            );
            return { ...readResponse, entry: entries };
        }
        // If request is != search treat the readResponse as just a resource
        if (!authorizeResource(fhirUser, readResponse, this.apiUrl)) {
            throw new UnauthorizedError('User does not have permission for requested resource');
        }

        return readResponse;
    }

    async isWriteRequestAuthorized(request: WriteRequestAuthorizedRequest): Promise<void> {
        const fhirUser = getFhirUser(request.userIdentity, this.config.fhirUserClaimKey);
        if (fhirUser.hostname !== this.apiUrl || !this.typesWithWriteAccess.includes(fhirUser.resourceType)) {
            throw new UnauthorizedError('User does not have permission for requested operation');
        }
    }
}
