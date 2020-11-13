/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

export interface AuthStrategy {
    /**
     * Validates access for a given access token, fhirUser claim, and all the userinfo
     * @param decodedAccessToken
     * @param fhirUser
     * @param userinfo
     * @throws UnauthorizedError
     */
    validateAccess(
        decodedAccessToken: { [k: string]: any },
        userinfo: { [k: string]: any },
        fhirUser: string,
    ): Promise<void>;
}
