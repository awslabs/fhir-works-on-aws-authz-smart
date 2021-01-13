/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { UnauthorizedError } from 'fhir-works-on-aws-interface';
import jwksClient, { JwksClient } from 'jwks-rsa';

import { KeyObject } from 'crypto';
// eslint-disable-next-line import/no-unresolved
import fromKeyLike from 'jose/jwk/from_key_like';
// eslint-disable-next-line import/no-unresolved
import SignJWT from 'jose/jwt/sign';
// eslint-disable-next-line import/no-unresolved
import generateKeyPair from 'jose/util/generate_key_pair';

import {
    hasReferenceToResource,
    FhirResource,
    getFhirResource,
    getFhirUser,
    verifyJwtToken,
} from './smartAuthorizationHelper';

describe('getFhirUser', () => {
    test('valid fhirUser', () => {
        expect(getFhirUser('https://fhirServer.com/Practitioner/1234')).toEqual({
            hostname: 'https://fhirServer.com/',
            id: '1234',
            resourceType: 'Practitioner',
        });
    });
    test('invalid fhirUser', () => {
        expect(() => {
            getFhirUser('invalidFhirUser');
        }).toThrowError(new UnauthorizedError("Requester's identity is in the incorrect format"));
    });
});
describe('getFhirResource', () => {
    const defaultHostname = 'http://default.com';
    test('valid fhirResource', () => {
        expect(getFhirResource('https://fhirServer.com/Practitioner/1234', defaultHostname)).toEqual({
            hostname: 'https://fhirServer.com/',
            id: '1234',
            resourceType: 'Practitioner',
        });
        expect(getFhirResource('https://fhirServer1234.com/Organization/1234', defaultHostname)).toEqual({
            hostname: 'https://fhirServer1234.com/',
            id: '1234',
            resourceType: 'Organization',
        });
    });
    test('valid fhirResource; With default hostname', () => {
        expect(getFhirResource('Practitioner/1234', defaultHostname)).toEqual({
            hostname: defaultHostname,
            id: '1234',
            resourceType: 'Practitioner',
        });
        expect(getFhirResource('Organization/1234', defaultHostname)).toEqual({
            hostname: defaultHostname,
            id: '1234',
            resourceType: 'Organization',
        });
    });
    test('invalid fhirResource', () => {
        expect(() => {
            getFhirResource('bad.hostname/Practitioner/1234', defaultHostname);
        }).toThrowError(new UnauthorizedError('Resource is in the incorrect format'));
        expect(() => {
            getFhirResource('invalidFhirResource', defaultHostname);
        }).toThrowError(new UnauthorizedError('Resource is in the incorrect format'));
    });
});

describe('hasReferenceToResource', () => {
    const fhirUser: FhirResource = {
        hostname: 'https://fhirServer.com/',
        id: '1234',
        resourceType: 'Practitioner',
    };
    test('hostName does not match apiUrl', () => {
        expect(hasReferenceToResource(fhirUser, {}, 'fakeApiServer')).toEqual(false);
    });
    test('resourceType is Practitioner', () => {
        expect(hasReferenceToResource(fhirUser, {}, 'https://fhirServer.com/')).toEqual(true);
    });
    describe('fhirUser resourceType matches resourceType of resource', () => {
        const patientFhirUser: FhirResource = {
            hostname: 'https://fhirServer.com/',
            id: '1234',
            resourceType: 'Patient',
        };
        test('fhirUser id matches resource id', () => {
            expect(
                hasReferenceToResource(
                    patientFhirUser,
                    { resourceType: 'Patient', id: '1234' },
                    'https://fhirServer.com/',
                ),
            ).toEqual(true);
        });
        test('fhirUser referenced in resource', () => {
            expect(
                hasReferenceToResource(
                    patientFhirUser,
                    { resourceType: 'Patient', id: '1', reference: 'Patient/1234' },
                    'https://fhirServer.com/',
                ),
            ).toEqual(true);
        });
    });
});

describe('verifyJwt', () => {
    const kid = 'abcd1234';

    let privateKey: KeyObject;
    let client: JwksClient;

    beforeAll(async () => {
        const keyPair = await generateKeyPair('RS256');
        const { publicKey } = keyPair;
        privateKey = <KeyObject>keyPair.privateKey;
        const jwk = { ...(await fromKeyLike(publicKey)), kid };
        client = jwksClient({
            jwksUri: 'http://exampleAuthServer.com/oauth2',
            getKeysInterceptor: cb => {
                // @ts-ignore
                return cb(null, [jwk]);
            },
        });
    });

    function getDefaultPayload(iat: number, exp: number) {
        return {
            ver: 1,
            jti: 'AT.6a7kncTCpu1X9eo2QhH1z_WLUK4TyV43n_9I6kZNwPY',
            iss: 'https://exampleAuthServer.com/oauth2',
            aud: 'api://default',
            iat,
            exp,
            cid: '0oa8muazKSyk9gP5y5d5',
            uid: '00u85ozwjjWRd17PB5d5',
            scp: ['fhirUser', 'openid', 'profile', 'launch/encounter', 'patient/Patient.read'],
            sub: 'test@test.com',
            fhirUser: 'Practitioner/1234',
        };
    }

    async function getSignedJwt(payload: any) {
        return new SignJWT(payload).setProtectedHeader({ alg: 'RS256', type: 'JWT', kid }).sign(privateKey);
    }

    test('JWT is valid and verified', async () => {
        const payload = getDefaultPayload(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 10);
        const jwt = await getSignedJwt(payload);
        return expect(
            verifyJwtToken(jwt, 'api://default', 'https://exampleAuthServer.com/oauth2', client),
        ).resolves.toEqual(payload);
    });

    test('jwt expired', async () => {
        const payload = getDefaultPayload(Math.floor(Date.now() / 1000) - 10, Math.floor(Date.now() / 1000) - 1);
        const jwt = await getSignedJwt(payload);

        return expect(
            verifyJwtToken(jwt, 'api://default', 'https://exampleAuthServer.com/oauth2', client),
        ).rejects.toThrowError(new UnauthorizedError('Error validating the validity of the access_token'));
    });

    test('invalid jwt', () => {
        const token = 'abc';

        return expect(
            verifyJwtToken(token, 'api://default', 'https://exampleAuthServer.com/oauth2', client),
        ).rejects.toThrowError(new UnauthorizedError('Error validating the validity of the access_token'));
    });

    test('aud is incorrect', async () => {
        const payload = getDefaultPayload(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 10);
        const jwt = await getSignedJwt(payload);
        return expect(
            verifyJwtToken(jwt, 'fakeAud', 'https://exampleAuthServer.com/oauth2', client),
        ).rejects.toThrowError(new UnauthorizedError('Error validating the validity of the access_token'));
    });

    test('iss is incorrect', async () => {
        const payload = getDefaultPayload(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 10);
        const jwt = await getSignedJwt(payload);
        return expect(verifyJwtToken(jwt, 'api://default', 'fakeIss', client)).rejects.toThrowError(
            new UnauthorizedError('Error validating the validity of the access_token'),
        );
    });
});
