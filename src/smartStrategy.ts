/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

export interface AuthStrategy {

    /**
     * Verifies the access_token contents
     * @param decodedAccessToken
     * @throws UnauthorizedError
     */
    verifyAccessToken(decodedAccessToken: { [k: string]: any }): Promise<void>;

    /**
     * Verifies the /userinfo contents (which mimics the id_token)
     * @param userinfo
     * @throws UnauthorizedError
     */
    verifyUserInfo(userinfo: { [k: string]: any }): Promise<void>;

    /**
     * Verifies the fhirUser claim
     * @param fhirUser
     * @throws UnauthorizedError
     */
    verifyFhirUserClaim(fhirUser: string): Promise<void>;

    /**
     * Verifies and authorizes access to the ReadResponse
     * @throws UnauthorizedError
     */
    authorizeReadResponse(): Promise<void>;
}
