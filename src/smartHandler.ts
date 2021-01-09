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
    clone,
    BatchReadWriteRequest,
    BASE_R4_RESOURCES,
    FhirVersion,
    BASE_STU3_RESOURCES,
    GetSearchFilterBasedOnIdentityRequest,
    SearchFilter,
} from 'fhir-works-on-aws-interface';
import axios from 'axios';
import { SMARTConfig, UserIdentity } from './smartConfig';
import {
    convertScopeToSmartScope,
    filterScopes,
    getScopes,
    getValidOperationsForScopeTypeAndAccessType,
    isScopeSufficient,
    SEARCH_OPERATIONS,
} from './smartScopeHelper';
import { authorizeResource, getFhirResource, getFhirUser } from './smartAuthorizationHelper';

// eslint-disable-next-line import/prefer-default-export
export class SMARTHandler implements Authorization {
    private readonly adminAccessTypes: string[] = ['Practitioner'];

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

    async verifyAccessToken(request: VerifyAccessTokenRequest): Promise<UserIdentity> {
        // The access_token will be verified by hitting the authZUserInfoUrl (token introspection)
        // Decoding first to determine if it passes scope & claims check first
        const decoded = decode(request.accessToken, { json: true }) || {};
        const { aud, iss } = decoded;
        const audArray = Array.isArray(aud) ? aud : [aud];
        const fhirUserClaim = decoded[this.config.fhirUserClaimKey];
        const patientContextClaim = decoded[`${this.config.launchContextKeyPrefix}patient`];

        // verify aud & iss
        if (!audArray.includes(this.config.expectedAudValue) || this.config.expectedIssValue !== iss) {
            console.error('aud or iss is not matching');
            throw new UnauthorizedError('Error validating the validity of the access_token');
        }

        // get just the scopes that apply to this request
        const scopes = getScopes(decoded[this.config.scopeKey]);
        const usableScopes = filterScopes(
            scopes,
            this.config.scopeRule,
            request.operation,
            request.resourceType,
            request.bulkDataAuth,
            patientContextClaim,
            fhirUserClaim,
        );
        if (!usableScopes.length) {
            console.error('User supplied scopes are insufficient', {
                usableScopes,
                operation: request.operation,
                resourceType: request.resourceType,
            });
            throw new UnauthorizedError('access_token does not have permission for requested operation');
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

        if (!response) {
            throw new UnauthorizedError('access_token cannot be verified');
        } else if (request.bulkDataAuth) {
            if (!response.data[this.config.fhirUserClaimKey]) {
                throw new UnauthorizedError('User does not have permission for requested operation');
            }
            const fhirUser = getFhirUser(response.data[this.config.fhirUserClaimKey]);
            if (fhirUser.hostname !== this.apiUrl || !this.adminAccessTypes.includes(fhirUser.resourceType)) {
                throw new UnauthorizedError('User does not have permission for requested operation');
            }
        }

        const userIdentity: UserIdentity = clone(response.data);
        if (fhirUserClaim && usableScopes.some(scope => scope.startsWith('user/'))) {
            userIdentity.fhirUserObject = getFhirUser(fhirUserClaim);
        }
        if (patientContextClaim && usableScopes.some(scope => scope.startsWith('patient/'))) {
            userIdentity.patientLaunchContext = getFhirResource(patientContextClaim, this.apiUrl);
        }
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
        const values: string[] = [];
        const { fhirUserObject, patientLaunchContext } = request.userIdentity;

        if (fhirUserObject) {
            const { hostname, resourceType, id } = fhirUserObject;
            if (resourceType === 'Practitioner') {
                return [];
            }
            values.push(`${hostname}${resourceType}/${id}`);
            if (hostname === this.apiUrl) {
                values.push(`${resourceType}/${id}`);
            }
        }

        if (patientLaunchContext) {
            const { hostname, resourceType, id } = patientLaunchContext;
            values.push(`${hostname}${resourceType}/${id}`);
            if (hostname === this.apiUrl) {
                values.push(`${resourceType}/${id}`);
            }
        }

        // Create a SearchFilter to limit access to only resources that are referring to the requesting user and/or context
        return [
            {
                key: '_reference',
                value: values,
                comparisonOperator: '==',
                logicalOperator: 'OR', // logicalOperator can be either 'AND' or 'OR' since value is an array of one string
            },
        ];
    }

    async isBundleRequestAuthorized(request: AuthorizationBundleRequest): Promise<void> {
        const { scopes, fhirUserObject, patientLaunchContext } = request.userIdentity;
        let usableScopes: string[] = [];
        if (fhirUserObject) {
            usableScopes = usableScopes.concat(scopes.filter((scope: string) => scope.startsWith('user/')));
        }
        if (patientLaunchContext) {
            usableScopes = usableScopes.concat(scopes.filter((scope: string) => scope.startsWith('patient/')));
        }
        request.requests.forEach((req: BatchReadWriteRequest) => {
            if (
                !usableScopes.some((scope: string) =>
                    isScopeSufficient(scope, this.config.scopeRule, req.operation, req.resourceType),
                )
            ) {
                console.error('User supplied scopes are insufficient', {
                    usableScopes,
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
                // We only get allowedResourceTypes for ClinicalSmartScope
                const clinicalSmartScope = convertScopeToSmartScope(scope);
                const validOperations = getValidOperationsForScopeTypeAndAccessType(
                    clinicalSmartScope.scopeType,
                    clinicalSmartScope.accessType,
                    this.config.scopeRule,
                );
                if (validOperations.includes(request.operation)) {
                    const allowedResourcesForScope: string[] =
                        this.fhirVersion === '4.0.1' ? BASE_R4_RESOURCES : BASE_STU3_RESOURCES;
                    const scopeResourceType = clinicalSmartScope.resourceType;
                    if (scopeResourceType === '*') {
                        return allowedResourcesForScope;
                    }
                    if (allowedResourcesForScope.includes(scopeResourceType)) {
                        allowedResources = allowedResources.concat(scopeResourceType);
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
        const { fhirUserObject, patientLaunchContext } = request.userIdentity;
        const { operation, readResponse } = request;
        // If request is a search treat the readResponse as a bundle
        if (SEARCH_OPERATIONS.includes(operation)) {
            const entries = (readResponse.entry ?? []).filter(
                (entry: { resource: any }) =>
                    (fhirUserObject && authorizeResource(fhirUserObject, entry.resource, this.apiUrl)) ||
                    (patientLaunchContext && authorizeResource(patientLaunchContext, entry.resource, this.apiUrl)),
            );
            return { ...readResponse, entry: entries };
        }
        // If request is != search treat the readResponse as just a resource
        if (
            (fhirUserObject && authorizeResource(fhirUserObject, readResponse, this.apiUrl)) ||
            (patientLaunchContext && authorizeResource(patientLaunchContext, readResponse, this.apiUrl))
        ) {
            return readResponse;
        }

        throw new UnauthorizedError('User does not have permission for requested resource');
    }

    async isWriteRequestAuthorized(request: WriteRequestAuthorizedRequest): Promise<void> {
        const { fhirUserObject, patientLaunchContext } = request.userIdentity;
        // If fhirUser is Admin or has reference to object in request
        if (
            fhirUserObject &&
            ((fhirUserObject.hostname === this.apiUrl && this.adminAccessTypes.includes(fhirUserObject.resourceType)) ||
                authorizeResource(fhirUserObject, request.resourceBody, this.apiUrl))
        ) {
            return;
        }
        // If patientLaunchContext has reference to object in request
        if (patientLaunchContext && authorizeResource(patientLaunchContext, request.resourceBody, this.apiUrl)) {
            return;
        }

        throw new UnauthorizedError('User does not have permission for requested operation');
    }
}
