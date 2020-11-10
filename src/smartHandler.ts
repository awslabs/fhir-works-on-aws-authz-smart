/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { decode } from 'jsonwebtoken';
import {
    Authorization,
    AuthorizationRequest,
    AuthorizationBundleRequest,
    AllowedResourceTypesForOperationRequest,
    SystemOperation,
    TypeOperation,
    UnauthorizedError,
    ReadResponseAuthorizedRequest,
    WriteRequestAuthorizedRequest,
} from 'fhir-works-on-aws-interface';
import axios from 'axios';
import { LaunchType, ScopeType, SMARTConfig } from './smartConfig';

// eslint-disable-next-line import/prefer-default-export
export class SMARTHandler implements Authorization {
    static readonly CLINICAL_SCOPE_REGEX = /^(?<scopeType>patient|user|system)\/(?<scopeResourceType>[a-zA-Z]+|\*)\.(?<accessType>read|write|\*)$/;

    static readonly LAUNCH_SCOPE_REGEX = /^(?<scopeType>launch)(\/(?<launchType>patient|encounter))?$/;

    private readonly version: number = 1.0;

    private readonly config: SMARTConfig;

    constructor(config: SMARTConfig) {
        if (config.version !== this.version) {
            throw Error('Authorization configuration version does not match handler version');
        }
        this.config = config;
    }

    async isAuthorized(request: AuthorizationRequest): Promise<void> {
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
        let scopes: string[] = [];
        if (this.config.scopeValueType === 'space' && typeof decoded[this.config.scopeKey] === 'string') {
            scopes = decoded[this.config.scopeKey].split(' ');
        } else if (this.config.scopeValueType === 'array' && Array.isArray(decoded[this.config.scopeKey])) {
            scopes = decoded[this.config.scopeKey];
        }
        if (!this.isScopeSufficient(scopes, request.operation, request.resourceType)) {
            console.error(
                `User supplied scopes are insuffiecient\nscopes: ${scopes}\noperation: ${request.operation}\nresourceType: ${request.resourceType}`,
            );
            throw new UnauthorizedError('User does not have permission for requested operation');
        }

        // Verify token
        let response;
        try {
            response = await axios.post(
                this.config.authZUserInfoUrl,
                {},
                { headers: { Authorization: `Bearer ${request.accessToken}` } },
            );
        } catch (e) {
            console.error('Post to authZUserInfoUrl failed', e);
        }
        if (!response || !response.data[this.config.expectedFhirUserClaimKey]) {
            console.error(`result from AuthZ did not have ${this.config.expectedFhirUserClaimKey} claim`);
            throw new UnauthorizedError("Cannot determine requester's identity");
        }
    }

    async isBundleRequestAuthorized(request: AuthorizationBundleRequest): Promise<void> {
        // TODO this is stubbed for now
        await this.isAuthorized({ accessToken: request.accessToken, operation: 'transaction' });
    }

    async getAllowedResourceTypesForOperation(request: AllowedResourceTypesForOperationRequest): Promise<string[]> {
        // TODO this is stubbed for now
        await this.isAuthorized({ accessToken: request.accessToken, operation: request.operation });
        return [];
    }

    async authorizeAndFilterReadResponse(request: ReadResponseAuthorizedRequest): Promise<any> {
        // TODO this is stubbed for now
        await this.isAuthorized({ accessToken: request.accessToken, operation: request.operation });
        return request.readResponse;
    }

    async isWriteRequestAuthorized(request: WriteRequestAuthorizedRequest): Promise<void> {
        // TODO this is stubbed for now
        await this.isAuthorized({ accessToken: request.accessToken, operation: request.operation });
    }

    private isScopeSufficient(
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
                    if (resourceType) {
                        if (scopeResourceType === '*' || scopeResourceType === resourceType) {
                            validOperations = this.getValidOperation(<ScopeType>scopeType, accessType);
                        }
                    } else if (scopeResourceType === '*') {
                        validOperations = this.getValidOperation(<ScopeType>scopeType, accessType);
                    }
                }
                const isAuthorized = validOperations.includes(operation);
                if (isAuthorized) return true;
            }
        }
        return false;
    }

    private getValidOperation(scopeType: ScopeType, accessType: string) {
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
