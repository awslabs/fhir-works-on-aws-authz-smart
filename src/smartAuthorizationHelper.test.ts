import { UnauthorizedError } from 'fhir-works-on-aws-interface';
import jwksClient from 'jwks-rsa';

import { sign } from 'jsonwebtoken';
import { pem2jwk } from 'pem-jwk';

import { authorizeResource, FhirUser, getFhirUser, verifyJwtToken } from './smartAuthorizationHelper';

const { generateKeyPairSync } = require('crypto');

describe('getFhirUser', () => {
    test('valid fhirUser', () => {
        expect(getFhirUser({ fhirUser: 'https://fhirServer.com/Practitioner/1234' }, 'fhirUser')).toEqual({
            hostname: 'https://fhirServer.com/',
            id: '1234',
            resourceType: 'Practitioner',
        });
    });
    test('invalid fhirUser', () => {
        expect(() => {
            getFhirUser({ fhirUser: 'invalidFhirUser' }, 'fhirUser');
        }).toThrowError(new UnauthorizedError("Requester's identity is in the incorrect format"));
    });
});

describe('authorizeResource', () => {
    const fhirUser: FhirUser = {
        hostname: 'https://fhirServer.com/',
        id: '1234',
        resourceType: 'Practitioner',
    };
    test('hostName does not match apiUrl', () => {
        expect(authorizeResource(fhirUser, {}, 'fakeApiServer')).toEqual(false);
    });
    test('resourceType is Practitioner', () => {
        expect(authorizeResource(fhirUser, {}, 'https://fhirServer.com/')).toEqual(true);
    });
    describe('fhirUser resourceType matches resourceType of resource', () => {
        const patientFhirUser: FhirUser = {
            hostname: 'https://fhirServer.com/',
            id: '1234',
            resourceType: 'Patient',
        };
        test('fhirUser id matches resource id', () => {
            expect(
                authorizeResource(patientFhirUser, { resourceType: 'Patient', id: '1234' }, 'https://fhirServer.com/'),
            ).toEqual(true);
        });
        test('fhirUser referenced in resource', () => {
            expect(
                authorizeResource(
                    patientFhirUser,
                    { resourceType: 'Patient', id: '1', reference: 'Patient/1234' },
                    'https://fhirServer.com/',
                ),
            ).toEqual(true);
        });
    });
});

describe('verifyJwt', () => {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 4096,
        publicKeyEncoding: {
            type: 'spki',
            format: 'pem',
        },
        privateKeyEncoding: {
            type: 'pkcs8',
            format: 'pem',
        },
    });
    console.log('Public Key for JWT');
    console.log(publicKey);

    const kid = 'abcd1234';
    const jwk = { ...pem2jwk(publicKey), kid };
    console.log('jwk', jwk);

    const client = jwksClient({
        jwksUri: 'http://exampleAuthServer.com/oauth2',
        getKeysInterceptor: cb => {
            // @ts-ignore
            return cb(null, [jwk]);
        },
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
    test('JWT is valid and verified', async () => {
        const payload = getDefaultPayload(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 10);
        const jwt = sign(payload, privateKey, {
            header: {
                alg: 'RS256',
                typ: 'JWT',
                kid,
            },
        });
        return expect(
            verifyJwtToken(jwt, 'api://default', 'https://exampleAuthServer.com/oauth2', client),
        ).resolves.toEqual(payload);
    });

    test('jwt expired', async () => {
        const payload = getDefaultPayload(Math.floor(Date.now() / 1000) - 10, Math.floor(Date.now() / 1000) - 1);

        const jwt = sign(payload, privateKey, {
            header: {
                alg: 'RS256',
                typ: 'JWT',
                kid,
            },
        });

        return expect(
            verifyJwtToken(jwt, 'api://default', 'https://exampleAuthServer.com/oauth2', client),
        ).rejects.toThrowError(new UnauthorizedError('jwt expired'));
    });

    test('invalid jwt', async () => {
        const token = 'abc';

        return expect(
            verifyJwtToken(token, 'api://default', 'https://exampleAuthServer.com/oauth2', client),
        ).rejects.toThrowError(new UnauthorizedError('invalid access token'));
    });
});
