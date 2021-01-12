import { UnauthorizedError } from 'fhir-works-on-aws-interface';
import jwksClient from 'jwks-rsa';

import { sign } from 'jsonwebtoken';
import { pem2jwk } from 'pem-jwk';
import {
    hasReferenceToResource,
    FhirResource,
    getFhirResource,
    getFhirUser,
    verifyJwtToken,
} from './smartAuthorizationHelper';

const { generateKeyPairSync } = require('crypto');

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

// TODO Add tests to check aud and iss
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
    function getSignedJwt(payload: any) {
        return sign(payload, privateKey, {
            header: {
                alg: 'RS256',
                typ: 'JWT',
                kid,
            },
        });
    }
    test('JWT is valid and verified', () => {
        const payload = getDefaultPayload(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 10);
        const jwt = getSignedJwt(payload);
        return expect(
            verifyJwtToken(jwt, 'api://default', 'https://exampleAuthServer.com/oauth2', client),
        ).resolves.toEqual(payload);
    });

    test('jwt expired', () => {
        const payload = getDefaultPayload(Math.floor(Date.now() / 1000) - 10, Math.floor(Date.now() / 1000) - 1);
        const jwt = getSignedJwt(payload);

        return expect(
            verifyJwtToken(jwt, 'api://default', 'https://exampleAuthServer.com/oauth2', client),
        ).rejects.toThrowError(new UnauthorizedError('jwt expired'));
    });

    test('invalid jwt', () => {
        const token = 'abc';

        return expect(
            verifyJwtToken(token, 'api://default', 'https://exampleAuthServer.com/oauth2', client),
        ).rejects.toThrowError(new UnauthorizedError('invalid access token'));
    });

    test('aud is incorrect', async () => {
        const payload = getDefaultPayload(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 10);
        const jwt = getSignedJwt(payload);
        return expect(
            verifyJwtToken(jwt, 'fakeAud', 'https://exampleAuthServer.com/oauth2', client),
        ).rejects.toThrowError(new UnauthorizedError('Error validating the validity of the access_token'));
    });

    test('iss is incorrect', async () => {
        const payload = getDefaultPayload(Math.floor(Date.now() / 1000), Math.floor(Date.now() / 1000) + 10);
        const jwt = getSignedJwt(payload);
        return expect(verifyJwtToken(jwt, 'api://default', 'fakeIss', client)).rejects.toThrowError(
            new UnauthorizedError('Error validating the validity of the access_token'),
        );
    });
});
