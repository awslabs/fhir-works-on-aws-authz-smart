/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { TypeOperation, SystemOperation } from 'fhir-works-on-aws-interface';

export type AccessModifier = 'read' | 'write';
export type ScopeType = 'patient' | 'user' | 'system';
export type LaunchType = 'patient' | 'encounter';
export type IdentityType = 'Patient' | 'Practitioner' | 'Person ' | 'RelatedPerson';

export interface ClinicalSmartScope {
    scopeType: ScopeType;
    resourceType: string;
    accessType: AccessModifier;
}

export interface LaunchSmartScope {
    scopeType: 'launch';
    launchType: LaunchType | undefined;
}

export type SmartScope = ClinicalSmartScope | LaunchSmartScope;

export type AccessRule = {
    [accessType in AccessModifier]: (TypeOperation | SystemOperation)[];
};
export type LaunchRule = {
    [launchType in LaunchType]: (TypeOperation | SystemOperation)[];
} & {
    launch: (TypeOperation | SystemOperation)[];
};

// Determines what each scope has access to
export type ScopeRule = {
    [scopeType in ScopeType]: AccessRule;
} & {
    launch: LaunchRule;
};

/**
 * Example of a scope rule
 * ```typescript
    export const scopeRule: ScopeRule = {
        patient: {
            read: allReadOperations,
            write: [],
        },
        user: {
            read: allReadOperations,
            write: ['update', 'patch', 'create'],
        },
        system: {
            read: allReadOperations,
            write: allWriteOperations,
        },
        launch: {
            launch: allReadOperations,
            patient: allReadOperations,
            encounter: allReadOperations,
        },
    };

 * ```
 */

export interface SMARTConfig {
    version: number;
    /**
     * Within the access_token the scopes are typically sent in the 'scp' or 'scope' key
     */
    scopeKey: string;
    /**
     * The value of the scope key can either be an array or a space seperated string
     */
    scopeValueType: 'array' | 'space';
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
     * Json Web Key Set endpoint used to get the key for verifying access_token
     */
    jwksEndpoint: string;
}
