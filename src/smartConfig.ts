/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { TypeOperation, SystemOperation } from 'fhir-works-on-aws-interface';
import { AuthStrategy } from './smartStrategy';

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
     * Per SMART spec this is the 'iss' key found in the access_token
     */
    expectedFhirUserClaimKey: 'fhirUser' | 'profile';
    /**
     * This regex representing what the `fhirUser` claim will become
     */
    fhirUserClaimRegex: RegExp;
    /**
     * OAuth2 standard URL used to verify the access_token and get all user claims
     */
    authZUserInfoUrl: string;
    /**
     * The authorization strategy to use to validate access
     */
    authStrategies: AuthStrategy[];
}

export type AccessModifier = 'read' | 'write';
export type ScopeType = 'patient' | 'user' | 'system';
export type LaunchType = 'patient' | 'encounter';

// Determines what each scope has access to
export type ScopeRule = {
    [scopeType in ScopeType]: AccessRule;
} & {
    launch: LaunchRule;
};
export type AccessRule = {
    [accessType in AccessModifier]: (TypeOperation | SystemOperation)[];
};
export type LaunchRule = {
    [launchType in LaunchType]: (TypeOperation | SystemOperation)[];
} & {
    launch: (TypeOperation | SystemOperation)[];
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
