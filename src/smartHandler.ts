/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import {
    Authorization,
    VerifyAccessTokenRequest,
    AuthorizationBundleRequest,
    AllowedResourceTypesForOperationRequest,
    UnauthorizedError,
    ReadResponseAuthorizedRequest,
    WriteRequestAuthorizedRequest,
    AccessBulkDataJobRequest,
    BatchReadWriteRequest,
    BASE_R4_RESOURCES,
    FhirVersion,
    BASE_STU3_RESOURCES,
    GetSearchFilterBasedOnIdentityRequest,
    SearchFilter,
    clone,
} from 'fhir-works-on-aws-interface';
import get from 'lodash/get';
import { JwksClient } from 'jwks-rsa';
import { SMARTConfig, UserIdentity } from './smartConfig';
import {
    convertScopeToSmartScope,
    filterOutUnusableScope,
    getScopes,
    getValidOperationsForScopeTypeAndAccessType,
    isScopeSufficient,
    SEARCH_OPERATIONS,
} from './smartScopeHelper';
import {
    getFhirResource,
    getFhirUser,
    getJwksClient,
    verifyJwtToken,
    introspectJwtToken,
    hasAccessToResource,
    hasSystemAccess,
    isFhirUserAdmin,
} from './smartAuthorizationHelper';
import getComponentLogger from './loggerBuilder';

const logger = getComponentLogger();

// eslint-disable-next-line import/prefer-default-export
export class SMARTHandler implements Authorization {
    /**
     * If a fhirUser is of these resourceTypes they will be able to READ & WRITE without having to meet the reference criteria
     */
    private readonly adminAccessTypes: string[];

    /**
     * If a fhirUser is of these resourceTypes they will be able to do bulk data operations
     */
    private readonly bulkDataAccessTypes: string[];

    private readonly version: number = 1.0;

    private readonly config: SMARTConfig;

    private readonly apiUrl: string;

    private readonly fhirVersion: FhirVersion;

    private readonly isUserScopeAllowedForSystemExport: boolean;

    private readonly jwksClient?: JwksClient;

    /**
     * @param apiUrl URL of this FHIR service. Will be used to determine if a requestor is from this FHIR server or not
     * when the request does not include a fhirServiceBaseUrl
     * @param adminAccessTypes a fhirUser from these resourceTypes they will be able to READ & WRITE without having to meet the reference criteria
     * @param bulkDataAccessTypes a fhirUser from these resourceTypes they will be able to do bulk data operations
     */
    constructor(
        config: SMARTConfig,
        apiUrl: string,
        fhirVersion: FhirVersion,
        adminAccessTypes = [],
        bulkDataAccessTypes = ['Practitioner'],
        isUserScopeAllowedForSystemExport = false,
    ) {
        if (config.version !== this.version) {
            throw Error('Authorization configuration version does not match handler version');
        }
        this.config = config;
        this.apiUrl = apiUrl;
        this.fhirVersion = fhirVersion;
        this.adminAccessTypes = adminAccessTypes;
        this.bulkDataAccessTypes = bulkDataAccessTypes;
        this.isUserScopeAllowedForSystemExport = isUserScopeAllowedForSystemExport;
        if (this.config.jwksEndpoint && !this.config.tokenIntrospection) {
            this.jwksClient = getJwksClient(this.config.jwksEndpoint, this.config.jwksHeaders);
        }
    }

    async verifyAccessToken(request: VerifyAccessTokenRequest): Promise<UserIdentity> {
        let decodedToken: any;
        if (this.config.tokenIntrospection) {
            decodedToken = await introspectJwtToken(
                request.accessToken,
                this.config.expectedAudValue,
                this.config.expectedIssValue,
                this.config.tokenIntrospection,
            );
        } else if (this.jwksClient) {
            decodedToken = await verifyJwtToken(
                request.accessToken,
                this.config.expectedAudValue,
                this.config.expectedIssValue,
                this.jwksClient,
            );
        } else {
            throw Error(
                `Authorization configuration not properly set up. Either 'tokenIntrospection' or 'jwksEndpoint' must be present`,
            );
        }
        const fhirUserClaim = get(decodedToken, this.config.fhirUserClaimPath);
        const patientContextClaim = get(decodedToken, `${this.config.launchContextPathPrefix}patient`);
        const patientOrgsClaim = get(decodedToken, `patientOrgs`);
        const fhirServiceBaseUrl = request.fhirServiceBaseUrl ?? this.apiUrl;

        // get just the scopes that apply to this request
        const scopes = getScopes(decodedToken[this.config.scopeKey]);
        const usableScopes = filterOutUnusableScope(
            scopes,
            this.config.scopeRule,
            request.operation,
            this.isUserScopeAllowedForSystemExport,
            request.resourceType,
            request.bulkDataAuth,
            patientContextClaim,
            fhirUserClaim,
        );
        if (!usableScopes.length) {
            logger.warn('User supplied scopes are insufficient', {
                usableScopes,
                operation: request.operation,
                resourceType: request.resourceType,
            });
            throw new UnauthorizedError('access_token does not have permission for requested operation');
        }
        const userIdentity: UserIdentity = clone(decodedToken);

        if (request.bulkDataAuth) {
            if (!userIdentity.sub) {
                logger.error('A JWT token is without a `sub` claim; we cannot process the bulk action without one.');
                throw new UnauthorizedError('User does not have permission for requested operation');
            }
            if (
                !usableScopes.some((scope: string) => {
                    return scope.startsWith('system');
                })
            ) {
                // if requestor is relying on the "user" scope we need to verify they are coming from the correct endpoint & resourceType
                const fhirUser = getFhirUser(fhirUserClaim);
                if (
                    fhirUser.hostname !== fhirServiceBaseUrl ||
                    !this.bulkDataAccessTypes.includes(fhirUser.resourceType)
                ) {
                    throw new UnauthorizedError('User does not have permission for requested operation');
                }
            }
        }

        if (fhirUserClaim && usableScopes.some((scope) => scope.startsWith('user/'))) {
            userIdentity.fhirUserObject = getFhirUser(fhirUserClaim);
        }

        if (patientOrgsClaim) {
            if (Array.isArray(patientOrgsClaim)) {
                userIdentity.patientOrgs = patientOrgsClaim.map((eachOrg: string) =>
                    getFhirResource(eachOrg, fhirServiceBaseUrl),
                );
            } else {
                throw new UnauthorizedError('patientOrgs claim contains incorrect data type value');
            }
        }

        if (patientContextClaim && usableScopes.some((scope) => scope.startsWith('patient/'))) {
            userIdentity.patientLaunchContext = getFhirResource(patientContextClaim, fhirServiceBaseUrl);
        }
        userIdentity.scopes = scopes;
        userIdentity.usableScopes = usableScopes;
        return userIdentity;
    }

    // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
    async isAccessBulkDataJobAllowed(request: AccessBulkDataJobRequest): Promise<void> {
        if (request.userIdentity.sub !== request.jobOwnerId) {
            throw new UnauthorizedError('User does not have permission to access this Bulk Data Export job');
        }
    }

    async getSearchFilterBasedOnIdentity(request: GetSearchFilterBasedOnIdentityRequest): Promise<SearchFilter[]> {
        const references: Set<string> = new Set();
        const ids: Set<string> = new Set();
        const { fhirUserObject, patientLaunchContext, usableScopes, patientOrgs } = request.userIdentity;
        const fhirServiceBaseUrl = request.fhirServiceBaseUrl ?? this.apiUrl;

        if (hasSystemAccess(usableScopes, '')) {
            return [];
        }

        if (fhirUserObject) {
            const { hostname, resourceType, id } = fhirUserObject;
            if (isFhirUserAdmin(fhirUserObject, this.adminAccessTypes, fhirServiceBaseUrl)) {
                // if an admin do not add limiting search filters
                return [];
            }
            references.add(`${hostname}/${resourceType}/${id}`);
            if (hostname === fhirServiceBaseUrl) {
                references.add(`${resourceType}/${id}`);
            }
            if (request.resourceType && request.resourceType === resourceType) {
                ids.add(id);
            }
        }

        if (patientOrgs) {
            /* eslint-disable-next-line */
            for (const eachOrg of patientOrgs) {
                const { hostname, resourceType, id } = eachOrg;
                references.add(`${hostname}/${resourceType}/${id}`);
                if (hostname === fhirServiceBaseUrl) {
                    references.add(`${resourceType}/${id}`);
                }
                if (request.resourceType && request.resourceType === resourceType) {
                    ids.add(id);
                }
            }
        }

        if (patientLaunchContext) {
            const { hostname, resourceType, id } = patientLaunchContext;
            references.add(`${hostname}/${resourceType}/${id}`);
            if (hostname === fhirServiceBaseUrl) {
                references.add(`${resourceType}/${id}`);
            }
            if (request.resourceType && request.resourceType === resourceType) {
                ids.add(id);
            }
        }

        // Create a SearchFilter to limit access to only resources that are referring to the requesting user and/or context
        const filters: SearchFilter[] = [];
        if (references.size > 0) {
            filters.push({
                key: '_references',
                value: [...references],
                comparisonOperator: '==',
                logicalOperator: 'OR',
            });
        }
        if (ids.size > 0) {
            filters.push({
                key: 'id',
                value: [...ids],
                comparisonOperator: '==',
                logicalOperator: 'OR',
            });
        }

        return filters;
    }

    async isBundleRequestAuthorized(request: AuthorizationBundleRequest): Promise<void> {
        const { scopes, fhirUserObject, patientLaunchContext } = request.userIdentity;
        const usableScopes: string[] = scopes.filter(
            (scope: string) =>
                (patientLaunchContext && scope.startsWith('patient/')) ||
                (fhirUserObject && scope.startsWith('user/')) ||
                scope.startsWith('system/'),
        );

        // Are the scopes the request have good enough for every entry in the bundle?
        request.requests.forEach((req: BatchReadWriteRequest) => {
            if (
                !usableScopes.some((scope: string) =>
                    isScopeSufficient(
                        scope,
                        this.config.scopeRule,
                        req.operation,
                        this.isUserScopeAllowedForSystemExport,
                        req.resourceType,
                    ),
                )
            ) {
                logger.error('User supplied scopes are insufficient', {
                    usableScopes,
                    operation: req.operation,
                    resourceType: req.resourceType,
                });
                throw new UnauthorizedError('An entry within the Bundle is not authorized');
            }
        });

        // Ensure the requestor has access to write this request
        const authWritePromises: Promise<void>[] = request.requests.map((req) => {
            if (['create', 'update', 'patch', 'delete'].includes(req.operation)) {
                return this.isWriteRequestAuthorized(<WriteRequestAuthorizedRequest>{
                    userIdentity: { ...request.userIdentity, usableScopes },
                    operation: req.operation,
                    resourceBody: req.resource,
                    fhirServiceBaseUrl: request.fhirServiceBaseUrl,
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
        const allResourceTypes: string[] = this.fhirVersion === '4.0.1' ? BASE_R4_RESOURCES : BASE_STU3_RESOURCES;
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
                    const scopeResourceType = clinicalSmartScope.resourceType;
                    if (scopeResourceType === '*') {
                        return allResourceTypes;
                    }
                    if (allResourceTypes.includes(scopeResourceType)) {
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
        const { fhirUserObject, patientLaunchContext, patientOrgs, usableScopes } = request.userIdentity;
        const fhirServiceBaseUrl = request.fhirServiceBaseUrl ?? this.apiUrl;

        const { operation, readResponse } = request;
        // If request is a search treat the readResponse as a bundle
        if (SEARCH_OPERATIONS.includes(operation)) {
            const entries: any[] = (readResponse.entry ?? []).filter((entry: { resource: any }) =>
                hasAccessToResource(
                    fhirUserObject,
                    patientLaunchContext,
                    patientOrgs,
                    entry.resource,
                    usableScopes,
                    this.adminAccessTypes,
                    fhirServiceBaseUrl,
                    this.fhirVersion,
                ),
            );
            let numTotal: number = readResponse.total;
            if (!numTotal) {
                numTotal = entries.length;
            } else {
                numTotal -= readResponse.entry.length - entries.length;
            }

            return { ...readResponse, entry: entries, total: numTotal };
        }
        // If request is != search treat the readResponse as just a resource
        if (
            hasAccessToResource(
                fhirUserObject,
                patientLaunchContext,
                patientOrgs,
                readResponse,
                usableScopes,
                this.adminAccessTypes,
                fhirServiceBaseUrl,
                this.fhirVersion,
            )
        ) {
            return readResponse;
        }

        throw new UnauthorizedError('User does not have permission for requested resource');
    }

    async isWriteRequestAuthorized(request: WriteRequestAuthorizedRequest): Promise<void> {
        const { fhirUserObject, patientLaunchContext, patientOrgs, usableScopes } = request.userIdentity;
        const fhirServiceBaseUrl = request.fhirServiceBaseUrl ?? this.apiUrl;
        if (
            hasAccessToResource(
                fhirUserObject,
                patientLaunchContext,
                patientOrgs,
                request.resourceBody,
                usableScopes,
                this.adminAccessTypes,
                fhirServiceBaseUrl,
                this.fhirVersion,
            )
        ) {
            return;
        }

        throw new UnauthorizedError('User does not have permission for requested operation');
    }
}
