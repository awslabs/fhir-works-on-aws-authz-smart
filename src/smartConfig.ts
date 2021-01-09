/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { TypeOperation, SystemOperation, KeyValueMap } from 'fhir-works-on-aws-interface';

export type ScopeType = 'patient' | 'user';
export type AccessModifier = 'read' | 'write' | '*';
export type IdentityType = 'Patient' | 'Practitioner' | 'Person ' | 'RelatedPerson';

export interface ClinicalSmartScope {
    scopeType: ScopeType;
    resourceType: string;
    accessType: AccessModifier;
}

export type AccessRule = {
    [accessType in AccessModifier]: (TypeOperation | SystemOperation)[];
};

/**
 * Determines what each scope has access to
 *
 *  @example
 * {
 *      patient: {
 *          read: allReadOperations,
 *          write: [],
 *      },
 *      user: {
 *          read: allReadOperations,
 *          write: ['update', 'patch', 'create'],
 *      },
 *  };
 */
export type ScopeRule = {
    [scopeType in ScopeType]: Omit<AccessRule, '*'>;
};

export type FhirResource = { hostname: string; resourceType: string; id: string };

export interface UserIdentity extends KeyValueMap {
    scopes: string[];
    fhirUserObject?: FhirResource;
    patientLaunchContext?: FhirResource;
}

export interface SMARTConfig {
    version: number;
    /**
     * Within the access_token the scopes are typically sent in the 'scp' or 'scope' key
     */
    scopeKey: string;
    /**
     * Defined more below
     */
    scopeRule: ScopeRule;
    /**
     * Per SMART spec this is the 'aud' key found in the access_token
     */
    expectedAudValue: string;
    /**
     * Per SMART spec this is the 'iss' key found in the access_token
     */
    expectedIssValue: string;
    /**
     * Name of the claim found in the access_token that represents the requestors FHIR Id
     */
    fhirUserClaimKey: 'fhirUser' | 'profile';
    /**
     * Prefix of the claim found in the access_token that represents the requestors launch context
     * @example launch_response_
     */
    launchContextKeyPrefix: string;
    /**
     * OAuth2 standard URL used to verify the access_token and get all user claims
     */
    userInfoEndpoint: string;
}
