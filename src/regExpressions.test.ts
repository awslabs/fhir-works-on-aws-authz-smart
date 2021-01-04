/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

import { CLINICAL_SCOPE_REGEX, LAUNCH_SCOPE_REGEX } from './smartScopeHelper';
import { FHIR_USER_REGEX } from './smartAuthorizationHelper';

describe('CLINICAL_SCOPE_REGEX', () => {
    const testCases = [
        ['patient', 'Patient', 'read', true],
        ['user', 'Patient', 'read', true],
        ['system', 'Patient', 'read', true],
        ['patient', 'Patient', 'write', true],
        ['patient', 'Patient', '*', true],
        ['patient', 'Observation', 'read', true],
        ['patient', 'FakeResource', 'write', true],
        ['patient', '*', 'write', true],
        ['patient', 'uncapitalizedResource', 'write', false],
        ['fake', 'Patient', 'write', false],
        ['patient', 'Patient', 'fake', false],
        ['patient', 'Patient1', '*', false],
        ['', 'Patient', 'read', false],
        ['patient', '', 'read', false],
        ['patient', 'Patient', '', false],
    ];
    test.each(testCases)('CASE: %p/%p.%p; expect: %p', async (scopeType, scopeResourceType, accessType, isSuccess) => {
        const expectedStr = `${scopeType}/${scopeResourceType}.${accessType}`;
        const actualMatch = expectedStr.match(CLINICAL_SCOPE_REGEX);
        if (isSuccess) {
            expect(actualMatch).toBeTruthy();
            expect(actualMatch!.groups).toBeTruthy();
            expect(actualMatch!.groups!.scopeType).toEqual(scopeType);
            expect(actualMatch!.groups!.scopeResourceType).toEqual(scopeResourceType);
            expect(actualMatch!.groups!.accessType).toEqual(accessType);
        } else {
            expect(actualMatch).toBeFalsy();
        }
    });
    const uniqueTestCases = [
        ['patient.Patient/read'],
        ['plain old wrong'],
        ['patient/Patient.read patient/Patient.read'],
        ['launch/patient'],
        ['patient.Patient/read '],
    ];
    test.each(uniqueTestCases)('CASE: %p; expect: false', async scope => {
        const actualMatch = scope.match(CLINICAL_SCOPE_REGEX);
        expect(actualMatch).toBeFalsy();
    });
});
describe('LAUNCH_SCOPE_REGEX', () => {
    const testCases = [
        ['launch', 'patient', true],
        ['launch', 'encounter', true],
        ['Launch', 'encounter', false],
        ['launch', 'Encounter', false],
        ['launch1', 'encounter', false],
        ['launch', 'encounter1', false],
        ['launch', '', false],
        ['', 'encounter', false],
    ];
    test.each(testCases)('CASE: %p/%p; expect: %p', async (scopeType, launchType, isSuccess) => {
        const expectedStr = `${scopeType}/${launchType}`;
        const actualMatch = expectedStr.match(LAUNCH_SCOPE_REGEX);
        if (isSuccess) {
            expect(actualMatch).toBeTruthy();
            expect(actualMatch!.groups).toBeTruthy();
            expect(actualMatch!.groups!.scopeType).toEqual(scopeType);
            expect(actualMatch!.groups!.launchType).toEqual(launchType);
        } else {
            expect(actualMatch).toBeFalsy();
        }
    });
    const uniqueTestCases = [
        ['patient/Patient.read'],
        ['launch.encounter'],
        ['plain old wrong'],
        ['launch/encounter launch/encounter'],
        ['launch/encounter '],
    ];
    test.each(uniqueTestCases)('CASE: %p; expect: false', async scope => {
        const actualMatch = scope.match(LAUNCH_SCOPE_REGEX);
        expect(actualMatch).toBeFalsy();
    });
});
describe('FHIR_USER_REGEX', () => {
    const testCases = [
        ['https://fhir.server.com/dev/', 'Patient', 'id', true],
        ['http://fhir.server.com/dev/', 'Patient', 'id', true],
        ['http://fhir.server.com/dev-.:/%/$/2/', 'Patient', 'id', true],
        ['http://localhost/projectname/', 'Patient', 'id', true],
        ['http://127.0.0.1/project_name/', 'Patient', 'id', true],
        ['https://127.0.0.1:8080/project_name/', 'Patient', 'id', true],
        ['https://fhir.server.com/dev/', 'Practitioner', 'id', true],
        ['https://fhir.server.com/dev/', 'RelatedPerson', 'id', true],
        ['https://fhir.server.com/dev/', 'Person', 'id', true],
        ['https://fhir.server.com/dev/', 'Patient', 'idID1234-123.aBc', true],
        ['', 'Patient', 'id', false],
        ['https://fhir.server.com/dev/', '', 'id', false],
        ['https://fhir.server.com/dev/', 'Patient', '', false],
        ['fhir.server.com/dev/', 'Patient', 'id', false],
        ['https://fhir.server.com/dev', 'Patient', 'id', false],
        ['127.0.0.1/project_name', 'Patient', 'id', false],
        ['https://fhir.server.com/dev/', 'Observation', 'id', false],
        ['https://fhir.server.com/dev/', 'Patient', 'i_d', false],
        ['https://fhir.server.com/dev/', 'Patient', 'i#d', false],
        ['https://fhir.server.com/dev/', 'Patient', 'id ', false],
        [' https://fhir.server.com/dev/', 'Patient', 'id', false],
    ];
    test.each(testCases)('CASE: %p%p/%p; expect: %p', async (hostname, resourceType, id, isSuccess) => {
        for (let i = 0; i < testCases.length; i += 1) {
            const expectedStr = `${hostname}${resourceType}/${id}`;
            const actualMatch = expectedStr.match(FHIR_USER_REGEX);
            if (isSuccess) {
                expect(actualMatch).toBeTruthy();
                expect(actualMatch!.groups).toBeTruthy();
                expect(actualMatch!.groups!.hostname).toEqual(hostname);
                expect(actualMatch!.groups!.resourceType).toEqual(resourceType);
                expect(actualMatch!.groups!.id).toEqual(id);
            } else {
                expect(actualMatch).toBeFalsy();
            }
        }
    });
    const uniqueTestCases = [
        ['patient/Patient.read'],
        ['launch/encounter'],
        ['just-an-id-1234'],
        ['Patient'],
        ['https://fhir.server.com/dev/'],
    ];
    test.each(uniqueTestCases)('CASE: %p; expect: false', async scope => {
        const actualMatch = scope.match(FHIR_USER_REGEX);
        expect(actualMatch).toBeFalsy();
    });
});
