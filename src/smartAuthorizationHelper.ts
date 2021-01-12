import { KeyValueMap, UnauthorizedError } from 'fhir-works-on-aws-interface';
import jwksClient, { JwksClient } from 'jwks-rsa';
import { decode, verify } from 'jsonwebtoken';
import { IdentityType } from './smartConfig';

export const FHIR_USER_REGEX = /^(?<hostname>(http|https):\/\/([A-Za-z0-9\-\\.:%$_]*\/)+)(?<resourceType>Person|Practitioner|RelatedPerson|Patient)\/(?<id>[A-Za-z0-9\-.]+)$/;

export interface FhirUser {
    hostname: string;
    resourceType: IdentityType;
    id: string;
}
export function getFhirUser(userIdentity: KeyValueMap, fhirUserClaimKey: string): FhirUser {
    const fhirUserValue = userIdentity[fhirUserClaimKey];
    const match = fhirUserValue.match(FHIR_USER_REGEX);
    if (match) {
        const { hostname, resourceType, id } = match.groups!;
        return { hostname, resourceType, id };
    }
    throw new UnauthorizedError("Requester's identity is in the incorrect format");
}

function isLocalUserInJsonAsReference(jsonStr: string, fhirUser: FhirUser) {
    return (
        jsonStr.includes(`"reference":"${fhirUser.hostname}${fhirUser.resourceType}/${fhirUser.id}"`) ||
        jsonStr.includes(`"reference":"${fhirUser.resourceType}/${fhirUser.id}"`)
    );
}

export function authorizeResource(fhirUser: FhirUser, resource: any, apiUrl: string): boolean {
    const jsonStr = JSON.stringify(resource);
    if (fhirUser.hostname !== apiUrl) {
        // If requester is not from this FHIR Server they must be a fully qualified reference
        return jsonStr.includes(`"reference":"${fhirUser.hostname}${fhirUser.resourceType}/${fhirUser.id}"`);
    }
    if (fhirUser.resourceType === 'Practitioner') {
        return true;
    }
    if (fhirUser.resourceType === resource.resourceType) {
        // Attempting to look up its own record
        return fhirUser.id === resource.id || isLocalUserInJsonAsReference(jsonStr, fhirUser);
    }
    return isLocalUserInJsonAsReference(jsonStr, fhirUser);
}
export function getJwksClient(jwksUri: string): JwksClient {
    return jwksClient({
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 600000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri,
    });
}

export async function verifyJwtToken(
    token: string,
    expectedAudValue: string,
    expectedIssValue: string,
    client: JwksClient,
) {
    const decodedAccessToken = decode(token, { complete: true });
    if (decodedAccessToken === null || typeof decodedAccessToken === 'string') {
        throw new UnauthorizedError('invalid access token');
    }
    const { kid } = decodedAccessToken.header;
    if (!kid) {
        throw new UnauthorizedError('JWT verification failed. JWT "kid" attribute is required in the header');
    }
    const { aud, iss } = decodedAccessToken.payload;
    const audArray = Array.isArray(aud) ? aud : [aud];

    // verify aud & iss
    if (!audArray.includes(expectedAudValue) || expectedIssValue !== iss) {
        console.error('aud or iss is not matching');
        throw new UnauthorizedError('Error validating the validity of the access_token');
    }
    try {
        const key = await client.getSigningKeyAsync(kid);
        return verify(token, key.getPublicKey());
    } catch (e) {
        throw new UnauthorizedError(e.message);
    }
}
