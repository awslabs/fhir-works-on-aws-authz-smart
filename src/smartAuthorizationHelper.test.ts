import { UnauthorizedError } from 'fhir-works-on-aws-interface';
import jwksClient from 'jwks-rsa';
import { authorizeResource, FhirUser, getFhirUser, verifyJwtToken } from './smartAuthorizationHelper';
import publicJwks from './testData/jwt/publicJwks.json';

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
    const client = jwksClient({
        jwksUri: 'http://fake-auth-server.com',
        getKeysInterceptor: cb => {
            // @ts-ignore
            return cb(null, publicJwks.keys);
        },
    });
    test('JWT is valid and verified', async () => {
        const token =
            'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImFiY2QxMjM0In0.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2V4YW1wbGVBdXRoU2VydmVyLmNvbS9vYXV0aDIiLCJhdWQiOiJhcGk6Ly9kZWZhdWx0IiwiaWF0IjoxNjEwMTQ0MjcyLCJleHAiOjMzMTQ2MTQ0MjcyLCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbImZoaXJVc2VyIiwib3BlbmlkIiwicHJvZmlsZSIsImxhdW5jaC9lbmNvdW50ZXIiLCJwYXRpZW50L1BhdGllbnQucmVhZCJdLCJzdWIiOiJ0ZXN0QHRlc3QuY29tIiwiZmhpclVzZXIiOiJQcmFjdGl0aW9uZXIvMTIzNCJ9.KsR46wCk63dSzd1rwd1jqnuggxsuv8jgmpIiRA_KzE8kd1Y-dleApctIsHEz9alUUBiwmNWjiLSdO7VAjFYuWEUrlVJ3sJ_GXH0PIBWW2lW_cXPFrnbEw0NoLhWX7qBubYXcU3s5enj_bLXft-GBXOC89ZJudK_za-6-zCBlUkrN8K1oUxvbPg6rTz3IXQifupnwjwXj1PywkCvVDK_kIcBfn1a8TCFHpq-vdE2y91xT0QqUCH87d11IPJ_UIqOY9M5L-JiXC7diY4VTv0cBPUele3Dn3FskwCK76nGyUFDwxsi36dz1xFrRDdHo3KzmbHs0cevAYBANImlJARyD3w';

        const expectedDecodedToken = {
            ver: 1,
            jti: 'AT.6a7kncTCpu1X9eo2QhH1z_WLUK4TyV43n_9I6kZNwPY',
            iss: 'https://exampleAuthServer.com/oauth2',
            aud: 'api://default',
            iat: 1610144272,
            exp: 33146144272,
            cid: '0oa8muazKSyk9gP5y5d5',
            uid: '00u85ozwjjWRd17PB5d5',
            scp: ['fhirUser', 'openid', 'profile', 'launch/encounter', 'patient/Patient.read'],
            sub: 'test@test.com',
            fhirUser: 'Practitioner/1234',
        };
        return expect(verifyJwtToken(token, client)).resolves.toEqual(expectedDecodedToken);
    });

    test('jwt expired', async () => {
        const token =
            'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6ImFiY2QxMjM0In0.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYxMDE0NDU0MywiZXhwIjoxNjEwMTQ0NTQ0LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbImZoaXJVc2VyIiwib3BlbmlkIiwicHJvZmlsZSIsImxhdW5jaC9lbmNvdW50ZXIiLCJwYXRpZW50L1BhdGllbnQucmVhZCIsInBhdGllbnQvT2JzZXJ2YXRpb24ucmVhZCIsInVzZXIvKi5yZWFkIl0sInN1YiI6InNtYXlkYTQ0QGdtYWlsLmNvbSIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyLzEyMzQifQ.fGnPiCByLEmCcGIoZUyr8_KZVcoCF706x1e7Gay4bqMzM1piEc2AIjg6bdgws2BhRbgXFvuOPGm7ob8qe9jSZGhcuVq0FVJiwLlZNHrUMESRlf29BQPzF6UZ8xYjDsXy7kWpdXziitFKVrBKm4WbYsQx8oJ4DKHr42MoQSS5qAkZWjy2GXiTPhl2DHcd5niEpgc9Qz2uuoNmoFMs8qAs0Rh9aYrTBQzGYzOvhspH_dwavTCLwTbqhwkRerFSHqlWcjMGdJIa9_vZgyAQMLF5sNs5Ub48RqdQ41m4z8SFHJk1hbBHUrLC896g1yavipEL_oYxPk9kq4t8IOnSZ0RGzg';

        return expect(verifyJwtToken(token, client)).rejects.toThrowError(new UnauthorizedError('jwt expired'));
    });

    test('invalid jwt', async () => {
        const token = 'abc';

        return expect(verifyJwtToken(token, client)).rejects.toThrowError(
            new UnauthorizedError('invalid access token'),
        );
    });
});
