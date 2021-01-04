import { UnauthorizedError } from 'fhir-works-on-aws-interface';
import { authorizeResource, FhirUser, getFhirUser } from './smartAuthorizationHelper';

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
        test('fhirUser id matches resource id', () => {
            const patientFhirUser: FhirUser = {
                hostname: 'https://fhirServer.com/',
                id: '1234',
                resourceType: 'Patient',
            };
            expect(
                authorizeResource(patientFhirUser, { resourceType: 'Patient', id: '1234' }, 'https://fhirServer.com/'),
            ).toEqual(true);
        });
        test('fhirUser referenced in resource', () => {
            const patientFhirUser: FhirUser = {
                hostname: 'https://fhirServer.com/',
                id: '1234',
                resourceType: 'Patient',
            };
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
