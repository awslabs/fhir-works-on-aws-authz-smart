/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { KeyValueMap } from 'fhir-works-on-aws-interface';

export type ScopeType = 'patient' | 'user';
export type AccessModifier = 'read' | 'write' | '*';
export type IdentityType = 'Patient' | 'Practitioner' | 'Person ' | 'RelatedPerson';

export interface ClinicalSmartScope {
    scopeType: ScopeType;
    resourceType: string;
    accessType: AccessModifier;
}

export type AccessRule = {
    read: (
        | 'read'
        | 'vread'
        | 'history-type'
        | 'history-instance'
        | 'search-type'
        | 'transaction'
        | 'batch'
        | 'search-system'
        | 'history-system'
    )[];
    write: ('transaction' | 'batch' | 'create' | 'update' | 'delete' | 'patch')[];
};

/**
 * Determines what each scope has access to do
 * Scope `patient/Patient.read` maps to `scopeRule.patient.read` operations
 *  @example
 * {
 *      patient: {
 *          read: ['read','search-type'],
 *          write: [],
 *      },
 *      user: {
 *          read: ['read','search-type', 'vread'],
 *          write: ['transaction','update', 'patch', 'create'],
 *      },
 *  };
 */
export interface ScopeRule {
    patient: AccessRule;
    user: AccessRule;
}

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
     * Path of the claim found in the access_token that represents the requestors FHIR Id. SMART compliant AuthZ servers should use the `fhirUser` claim, but can use a path if needed.
     * @example fhirUser
     * @example ext.addedClaims.fhirUser
     */
    fhirUserClaimPath: 'fhirUser' | 'profile' | string;
    /**
     * Prefix of the path found in the access_token that represents the requestors launch context. The remaining part of the claim will identify the resource type i.e. `launch_response_patient`
     * @example launch_response_
     * @example ext.launch_response_
     */
    launchContextPathPrefix: string;
    /**
     * Json Web Key Set endpoint used to get the key for verifying access_token
     */
    jwksEndpoint: string;
}
