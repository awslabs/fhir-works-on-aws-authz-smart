import axios from 'axios';
import { UnauthorizedError } from 'fhir-works-on-aws-interface';

export interface AuthStrategy {
    /**
     * Validates the JWT access_token
     * @param accessToken
     * @throws UnauthorizedError
     */
    isTokenValid(accessToken: string): Promise<void>;
}

/**
 * This strategy uses the /userinfo endpoint to verify the `access_token` and get the `fhirUser` claim for further authorization.
 * userinfo endpoint is OIDC compliant: https://openid.net/specs/openid-connect-core-1_0.html#UserInfo
 */
export class UserInfoStrategy implements AuthStrategy {
    private readonly authZUserInfoUrl: string;

    private readonly expectedFhirUserClaimKey: string;

    constructor(authZUserInfoUrl: string, expectedFhirUserClaimKey: string) {
        this.authZUserInfoUrl = authZUserInfoUrl;
        this.expectedFhirUserClaimKey = expectedFhirUserClaimKey;
    }

    async isTokenValid(accessToken: string): Promise<void> {
        let response;
        try {
            response = await axios.post(
                this.authZUserInfoUrl,
                {},
                { headers: { Authorization: `Bearer ${accessToken}` } },
            );
        } catch (e) {
            console.error('Post to authZUserInfoUrl failed', e);
        }
        if (!response || !response.data[this.expectedFhirUserClaimKey]) {
            console.error(`result from AuthZ did not have the '${this.expectedFhirUserClaimKey}' claim`);
            throw new UnauthorizedError("Cannot determine requester's identity");
        }
    }
}
