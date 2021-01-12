import { UnauthorizedError } from 'fhir-works-on-aws-interface';
import { hasReferenceToResource, FhirResource, getFhirResource, getFhirUser } from './smartAuthorizationHelper';

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
