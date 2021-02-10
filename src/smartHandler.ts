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
import { JwksClient } from 'jwks-rsa';
import { FhirResource, SMARTConfig, UserIdentity } from './smartConfig';
import {
    convertScopeToSmartScope,
    filterOutUnusableScope,
    getScopes,
    getValidOperationsForScopeTypeAndAccessType,
    isScopeSufficient,
    SEARCH_OPERATIONS,
} from './smartScopeHelper';
import {
    hasReferenceToResource,
    getFhirResource,
    getFhirUser,
    getJwksClient,
    verifyJwtToken,
} from './smartAuthorizationHelper';

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

    private readonly jwksClient: JwksClient;

    /**
     * @param apiUrl URL of this FHIR service. Will be used to determine if a requestor is from this FHIR server or not
     * @param adminAccessTypes a fhirUser from these resourceTypes they will be able to READ & WRITE without having to meet the reference criteria
     * @param bulkDataAccessTypes a fhirUser from these resourceTypes they will be able to do bulk data operations
     */
    constructor(
        config: SMARTConfig,
        apiUrl: string,
        fhirVersion: FhirVersion,
        adminAccessTypes = ['Practitioner'],
        bulkDataAccessTypes = ['Practitioner'],
    ) {
        if (config.version !== this.version) {
            throw Error('Authorization configuration version does not match handler version');
        }
        this.config = config;
        this.apiUrl = apiUrl;
        this.fhirVersion = fhirVersion;
        this.jwksClient = getJwksClient(this.config.jwksEndpoint);
        this.adminAccessTypes = adminAccessTypes;
        this.bulkDataAccessTypes = bulkDataAccessTypes;
    }

    async verifyAccessToken(request: VerifyAccessTokenRequest): Promise<UserIdentity> {
        const decodedToken: any = await verifyJwtToken(
            request.accessToken,
            this.config.expectedAudValue,
            this.config.expectedIssValue,
            this.jwksClient,
        );

        const fhirUserClaim = decodedToken[this.config.fhirUserClaimKey];
        const patientContextClaim = decodedToken[`${this.config.launchContextKeyPrefix}patient`];

        // get just the scopes that apply to this request
        const scopes = getScopes(decodedToken[this.config.scopeKey]);
        const usableScopes = filterOutUnusableScope(
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

        if (request.bulkDataAuth) {
            if (!decodedToken[this.config.fhirUserClaimKey]) {
                throw new UnauthorizedError('User does not have permission for requested operation');
            }
            const fhirUser = getFhirUser(decodedToken[this.config.fhirUserClaimKey]);
            if (fhirUser.hostname !== this.apiUrl || !this.bulkDataAccessTypes.includes(fhirUser.resourceType)) {
                throw new UnauthorizedError('User does not have permission for requested operation');
            }
        }

        const userIdentity: UserIdentity = clone(decodedToken);
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
        const references: Set<string> = new Set();
        const ids: Set<string> = new Set();
        const { fhirUserObject, patientLaunchContext } = request.userIdentity;

        if (fhirUserObject) {
            const { hostname, resourceType, id } = fhirUserObject;
            if (this.isFhirUserAdmin(fhirUserObject)) {
                // if an admin do not add limiting search filters
                return [];
            }
            references.add(`${hostname}/${resourceType}/${id}`);
            if (hostname === this.apiUrl) {
                references.add(`${resourceType}/${id}`);
            }
            if (request.resourceType && request.resourceType === resourceType) {
                ids.add(id);
            }
        }

        if (patientLaunchContext) {
            const { hostname, resourceType, id } = patientLaunchContext;
            references.add(`${hostname}/${resourceType}/${id}`);
            if (hostname === this.apiUrl) {
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
                    (fhirUserObject &&
                        (this.isFhirUserAdmin(fhirUserObject) ||
                            hasReferenceToResource(fhirUserObject, entry.resource, this.apiUrl, this.fhirVersion))) ||
                    (patientLaunchContext &&
                        hasReferenceToResource(patientLaunchContext, entry.resource, this.apiUrl, this.fhirVersion)),
            );
            return { ...readResponse, entry: entries };
        }
        // If request is != search treat the readResponse as just a resource
        if (
            (fhirUserObject &&
                (this.isFhirUserAdmin(fhirUserObject) ||
                    hasReferenceToResource(fhirUserObject, readResponse, this.apiUrl, this.fhirVersion))) ||
            (patientLaunchContext &&
                hasReferenceToResource(patientLaunchContext, readResponse, this.apiUrl, this.fhirVersion))
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
            (this.isFhirUserAdmin(fhirUserObject) ||
                hasReferenceToResource(fhirUserObject, request.resourceBody, this.apiUrl, this.fhirVersion))
        ) {
            return;
        }
        // If patientLaunchContext has reference to object in request
        if (
            patientLaunchContext &&
            hasReferenceToResource(patientLaunchContext, request.resourceBody, this.apiUrl, this.fhirVersion)
        ) {
            return;
        }

        throw new UnauthorizedError('User does not have permission for requested operation');
    }

    isFhirUserAdmin(fhirUser: FhirResource): boolean {
        return this.apiUrl === fhirUser.hostname && this.adminAccessTypes.includes(fhirUser.resourceType);
    }
}
