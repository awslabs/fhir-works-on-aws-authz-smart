/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import axios from 'axios';
import jwt from 'jsonwebtoken';
import MockAdapter from 'axios-mock-adapter';
import {
    VerifyAccessTokenRequest,
    ReadResponseAuthorizedRequest,
    SystemOperation,
    TypeOperation,
    UnauthorizedError,
    WriteRequestAuthorizedRequest,
    AccessBulkDataJobRequest,
    AllowedResourceTypesForOperationRequest,
    BASE_R4_RESOURCES,
    AuthorizationBundleRequest,
    GetSearchFilterBasedOnIdentityRequest,
} from 'fhir-works-on-aws-interface';

import * as smartAuthorizationHelper from './smartAuthorizationHelper';
import { SMARTHandler } from './smartHandler';
import { SMARTConfig, ScopeRule } from './smartConfig';
import { getScopes } from './smartScopeHelper';
import { getFhirResource, getFhirUser } from './smartAuthorizationHelper';

jest.mock('jsonwebtoken');

const scopeRule = (): ScopeRule => ({
    patient: {
        read: ['read', 'vread', 'search-type', 'search-system', 'history-instance', 'history-type', 'history-system'],
        write: ['update', 'patch', 'create'],
    },
    user: {
        read: ['read', 'vread', 'search-type', 'search-system', 'history-instance', 'history-type', 'history-system'],
        write: ['create', 'update', 'delete', 'patch', 'transaction', 'batch'],
    },
});

const expectedAud = 'api://default';
const expectedIss = 'https://dev-6460611.okta.com/oauth2/default';
const baseAuthZConfig = (): SMARTConfig => ({
    version: 1.0,
    scopeKey: 'scp',
    scopeRule: scopeRule(),
    expectedAudValue: expectedAud,
    expectedIssValue: expectedIss,
    fhirUserClaimPath: 'fhirUser',
    launchContextPathPrefix: 'ext.launch_response_',
    jwksEndpoint: `${expectedIss}/jwks`,
});
const apiUrl = 'https://fhir.server.com/dev';
const id = 'id';
const patientId = `Patient/${id}`;
const practitionerId = `Practitioner/${id}`;
const patientIdentity = `${apiUrl}/${patientId}`;
const practitionerIdentity = `${apiUrl}/${practitionerId}`;
const externalPractitionerIdentity = `${apiUrl}/test/${practitionerId}`;
const patientFhirResource = getFhirUser(patientIdentity);
const practitionerFhirResource = getFhirUser(practitionerIdentity);
const externalPractitionerFhirResource = getFhirUser(externalPractitionerIdentity);
const sub = 'test@test.com';

const patientContext: any = {
    ext: { launch_response_patient: patientIdentity },
};
const patientFhirUser: any = {
    fhirUser: patientIdentity,
};
const practitionerFhirUser: any = {
    fhirUser: practitionerIdentity,
};

const baseAccessNoScopes: any = {
    ver: 1,
    jti: 'AT.6a7kncTCpu1X9eo2QhH1z_WLUK4TyV43n_9I6kZNwPY',
    iss: expectedIss,
    aud: expectedAud,
    iat: Math.floor(Date.now() / 1000) - 1,
    exp: Math.floor(Date.now() / 1000) + 60 * 60,
    cid: '0oa8muazKSyk9gP5y5d5',
    uid: '00u85ozwjjWRd17PB5d5',
    sub,
};

const validPatient = {
    resourceType: 'Patient',
    id,
    meta: {
        versionId: '1',
        lastUpdated: '2020-06-28T12:03:29.421+00:00',
    },
    name: [
        {
            given: ['JONNY'],
        },
    ],
    gender: 'male',
    birthDate: '1972-10-13',
    address: [
        {
            city: 'Ruppertshofen',
        },
    ],
};
const validPatientObservation = {
    resourceType: 'Observation',
    id: '1274045',
    meta: {
        versionId: '1',
        lastUpdated: '2020-06-28T12:55:47.134+00:00',
    },
    status: 'final',
    code: {
        coding: [
            {
                system: 'http://loinc.org',
                code: '15074-8',
                display: 'Glucose [Moles/volume] in Blood',
            },
        ],
    },
    subject: {
        reference: patientIdentity,
        display: 'JONNY',
    },
    effectivePeriod: {
        start: '2013-04-02T09:30:10+01:00',
    },
    issued: '2013-04-03T15:30:10+01:00',
    valueQuantity: {
        value: 6.3,
        unit: 'mmol/l',
        system: 'http://unitsofmeasure.org',
        code: 'mmol/L',
    },
    interpretation: [
        {
            coding: [
                {
                    system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                    code: 'H',
                    display: 'High',
                },
            ],
        },
    ],
    referenceRange: [
        {
            low: {
                value: 3.1,
                unit: 'mmol/l',
                system: 'http://unitsofmeasure.org',
                code: 'mmol/L',
            },
            high: {
                value: 6.2,
                unit: 'mmol/l',
                system: 'http://unitsofmeasure.org',
                code: 'mmol/L',
            },
        },
    ],
};
const validPatientEncounter = {
    resourceType: 'Encounter',
    id: '1339909',
    meta: {
        versionId: '1',
        lastUpdated: '2019-02-06T19:32:37.166+00:00',
    },
    status: 'finished',
    class: {
        code: 'WELLNESS',
    },
    type: [
        {
            coding: [
                {
                    system: 'http://snomed.info/sct',
                    code: '185349003',
                    display: 'Encounter for check up (procedure)',
                },
            ],
            text: 'Encounter for check up (procedure)',
        },
    ],
    subject: {
        reference: patientId,
    },
    participant: [
        {
            individual: {
                reference: externalPractitionerIdentity,
            },
        },
    ],
    period: {
        start: '2011-12-22T21:49:35-05:00',
        end: '2011-12-22T22:19:35-05:00',
    },
    serviceProvider: {
        reference: 'Organization/1339537',
    },
};

const mock = new MockAdapter(axios);
beforeEach(() => {
    jest.restoreAllMocks();
    expect.assertions(1);
});
afterEach(() => {
    mock.reset();
});

describe('constructor', () => {
    test('ERROR: Attempt to create a handler to support a new config version', async () => {
        expect(() => {
            // eslint-disable-next-line no-new
            new SMARTHandler(
                {
                    ...baseAuthZConfig(),
                    version: 2.0,
                },
                apiUrl,
                '4.0.1',
            );
        }).toThrow(new Error('Authorization configuration version does not match handler version'));
    });
});

function getExpectedUserIdentity(decodedAccessToken: any): any {
    const expectedUserIdentity = decodedAccessToken;
    expectedUserIdentity.scopes = getScopes(decodedAccessToken.scp);
    const usableScopes = expectedUserIdentity.scopes.filter(
        (scope: string) => scope.startsWith('user/') || scope.startsWith('patient/'),
    );
    if (decodedAccessToken.fhirUser && usableScopes.some((scope: string) => scope.startsWith('user/'))) {
        expectedUserIdentity.fhirUserObject = getFhirUser(decodedAccessToken.fhirUser);
    }
    if (
        decodedAccessToken.ext &&
        decodedAccessToken.ext.launch_response_patient &&
        usableScopes.some((scope: string) => scope.startsWith('patient/'))
    ) {
        expectedUserIdentity.patientLaunchContext = getFhirResource(
            decodedAccessToken.ext.launch_response_patient,
            apiUrl,
        );
    }
    return expectedUserIdentity;
}

describe('verifyAccessToken', () => {
    const cases: (string | boolean | VerifyAccessTokenRequest | any)[][] = [
        [
            'no_fhir_scopes',
            { accessToken: 'fake', operation: 'create', resourceType: 'Patient' },
            baseAccessNoScopes,
            false,
        ],
        [
            'launch_scope_create',
            { accessToken: 'fake', operation: 'create', resourceType: 'Patient' },
            { ...baseAccessNoScopes, scp: ['launch'] },
            false,
        ],
        [
            'launch/patient_search',
            { accessToken: 'fake', operation: 'search-system' },
            { ...baseAccessNoScopes, scp: ['launch/patient'] },
            false,
        ],
        [
            'launch/encounter_read',
            { accessToken: 'fake', operation: 'read', resourceType: 'Patient', id: patientId },
            { ...baseAccessNoScopes, scp: ['launch/encounter'] },
            false,
        ],
        [
            'patient_manyRead_Write',
            { accessToken: 'fake', operation: 'update', resourceType: 'Patient', id: patientId },
            { ...baseAccessNoScopes, scp: ['patient/*.read'], ...patientContext },
            false,
        ],
        [
            'patient_manyRead_Read',
            { accessToken: 'fake', operation: 'vread', resourceType: 'Observation', id: '1', vid: '1' },
            { ...baseAccessNoScopes, scp: ['patient/*.read'], ...patientContext },
            true,
        ],
        [
            'patient_ObservationRead_Read',
            { accessToken: 'fake', operation: 'vread', resourceType: 'Observation', id: '1', vid: '1' },
            { ...baseAccessNoScopes, scp: 'patient/Observation.read', ...patientContext },
            true,
        ],
        [
            'patient_manyRead_search',
            { accessToken: 'fake', operation: 'search-type', resourceType: 'Observation' },
            { ...baseAccessNoScopes, scp: 'patient/*.read', ...patientContext },
            true,
        ],
        [
            'patient_manyWrite_Read',
            { accessToken: 'fake', operation: 'read', resourceType: 'Patient', id: patientId },
            { ...baseAccessNoScopes, scp: 'patient/*.write', ...patientContext },
            false,
        ],
        [
            'patient_PatientWrite_create',
            { accessToken: 'fake', operation: 'create', resourceType: 'Patient' },
            { ...baseAccessNoScopes, scp: 'patient/Patient.write', ...patientContext },
            true,
        ],
        [
            'patient_manyWrite_no_context',
            { accessToken: 'fake', operation: 'create', resourceType: 'Patient' },
            { ...baseAccessNoScopes, scp: 'patient/*.*' },
            false,
        ],
        [
            'user_manyRead_Write',
            { accessToken: 'fake', operation: 'update', resourceType: 'Patient', id: patientId },
            { ...baseAccessNoScopes, scp: ['user/*.read'], ...patientFhirUser },
            false,
        ],
        [
            'user_manyRead_Read',
            { accessToken: 'fake', operation: 'vread', resourceType: 'Observation', id: '1', vid: '1' },
            { ...baseAccessNoScopes, scp: ['user/*.read'], ...patientFhirUser },
            true,
        ],
        [
            'user_ObservationRead_Read',
            { accessToken: 'fake', operation: 'vread', resourceType: 'Observation', id: '1', vid: '1' },
            { ...baseAccessNoScopes, scp: 'user/Observation.read', ...patientFhirUser },
            true,
        ],
        [
            'user_manyRead_search',
            { accessToken: 'fake', operation: 'search-type', resourceType: 'Observation' },
            { ...baseAccessNoScopes, scp: 'user/*.read', ...patientFhirUser },
            true,
        ],
        [
            'user_manyWrite_Read',
            { accessToken: 'fake', operation: 'read', resourceType: 'Patient', id: patientId },
            { ...baseAccessNoScopes, scp: 'user/*.write', ...patientFhirUser },
            false,
        ],
        [
            'user_PatientWrite_create',
            { accessToken: 'fake', operation: 'create', resourceType: 'Patient' },
            { ...baseAccessNoScopes, scp: 'user/Patient.write', ...patientFhirUser },
            true,
        ],
        [
            'user_manyWrite_no_context',
            { accessToken: 'fake', operation: 'create', resourceType: 'Patient' },
            { ...baseAccessNoScopes, scp: 'user/*.*' },
            false,
        ],
        [
            'user&patient_manyWrite_Read',
            { accessToken: 'fake', operation: 'read', resourceType: 'Patient', id: patientId },
            { ...baseAccessNoScopes, scp: 'user/*.write patient/*.write', ...patientFhirUser, ...patientContext },
            false,
        ],
        [
            'user&patient_PatientWrite_create',
            { accessToken: 'fake', operation: 'create', resourceType: 'Patient' },
            { ...baseAccessNoScopes, scp: 'user/Patient.write patient/*.write', ...patientFhirUser, ...patientContext },
            true,
        ],
        [
            'user&patient_manyWrite_no context or fhirUser',
            { accessToken: 'fake', operation: 'create', resourceType: 'Patient' },
            { ...baseAccessNoScopes, scp: 'user/*.*  patient/*.write' },
            false,
        ],
    ];

    const authZConfig = baseAuthZConfig();
    const authZHandler: SMARTHandler = new SMARTHandler(authZConfig, apiUrl, '4.0.1');
    test.each(cases)('CASE: %p', async (_firstArg, request, decodedAccessToken, isValid) => {
        // Handling mocking modules when code is in TS: https://stackoverflow.com/a/60693903/14310364
        jest.spyOn(smartAuthorizationHelper, 'verifyJwtToken').mockImplementation(() =>
            Promise.resolve(decodedAccessToken),
        );
        if (!isValid) {
            return expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).rejects.toThrowError(
                UnauthorizedError,
            );
        }
        const expectedUserIdentity = getExpectedUserIdentity(decodedAccessToken);

        return expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).resolves.toMatchObject(
            expectedUserIdentity,
        );
    });
});

describe('verifyAccessToken; System level export requests', () => {
    const arrayScopesCases: (string | boolean | VerifyAccessTokenRequest | any)[][] = [
        [
            'Read and Write Access: initiate-export',
            {
                accessToken: 'fake',
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'initiate-export' },
            },
            { ...baseAccessNoScopes, scp: ['user/*.*', 'patient/*.write'], ...practitionerFhirUser },
            true,
        ],
        [
            'Read Access: initiate-export',
            {
                accessToken: 'fake',
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'initiate-export' },
            },
            { ...baseAccessNoScopes, scp: ['user/*.read', 'patient/*.*'], ...practitionerFhirUser },
            true,
        ],
        [
            'Read and Write Access: get-status-export',
            {
                accessToken: 'fake',
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'get-status-export' },
            },
            { ...baseAccessNoScopes, scp: ['user/*.*'], ...practitionerFhirUser },
            true,
        ],
        [
            'Read and Write Access: cancel-export',
            {
                accessToken: 'fake',
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'cancel-export' },
            },
            { ...baseAccessNoScopes, scp: ['user/*.*'], ...practitionerFhirUser },
            true,
        ],
        [
            'External practitioner: initiate-export; fail',
            {
                accessToken: 'fake',
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'initiate-export' },
            },
            { ...baseAccessNoScopes, scp: ['user/*.*', 'patient/*.write'], fhirUser: externalPractitionerIdentity },
            false,
        ],
        [
            'No User read access: initiate-export',
            {
                accessToken: 'fake',
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'cancel-export' },
            },
            { ...baseAccessNoScopes, scp: ['user/*.write'], ...practitionerFhirUser },
            false,
        ],
        [
            'No User access; Patient only: initiate-export',
            {
                accessToken: 'fake',
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'cancel-export' },
            },
            { ...baseAccessNoScopes, scp: ['patient/*.*'], ...patientContext },
            false,
        ],
    ];

    const authZConfig = baseAuthZConfig();

    const authZHandler: SMARTHandler = new SMARTHandler(authZConfig, apiUrl, '4.0.1');
    test.each(arrayScopesCases)('CASE: %p', (_firstArg, request, decodedAccessToken, isValid) => {
        jest.spyOn(smartAuthorizationHelper, 'verifyJwtToken').mockImplementation(() =>
            Promise.resolve(decodedAccessToken),
        );
        const { decode } = jwt as jest.Mocked<typeof import('jsonwebtoken')>;
        decode.mockReturnValue(<{ [key: string]: any }>decodedAccessToken);
        if (!isValid) {
            return expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).rejects.toThrowError(
                UnauthorizedError,
            );
        }
        const expectedUserIdentity = getExpectedUserIdentity(decodedAccessToken);
        expectedUserIdentity.scp = decodedAccessToken.scp;
        return expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).resolves.toMatchObject(
            expectedUserIdentity,
        );
    });
});

function createEntry(resource: any, searchMode = 'match') {
    return {
        fullUrl: `http://url.org/${resource.resourceType}/${resource.id}`,
        resource,
        search: {
            mode: searchMode,
        },
    };
}
describe('authorizeAndFilterReadResponse', () => {
    const emptySearchResult = {
        resourceType: 'Bundle',
        id: '0694266b-9415-4a69-a6f1-43be974c2c46',
        meta: {
            lastUpdated: '2020-11-20T11:10:48.034+00:00',
        },
        type: 'searchset',
        link: [
            {
                relation: 'self',
                url: 'url.self',
            },
            {
                relation: 'next',
                url: 'url.next',
            },
        ],
        entry: [],
    };
    const searchAllEntitiesMatch = {
        ...emptySearchResult,
        entry: [createEntry(validPatient), createEntry(validPatientObservation), createEntry(validPatientEncounter)],
    };

    const searchSomeEntitiesMatch = {
        ...emptySearchResult,
        entry: [
            createEntry(validPatient),
            createEntry(validPatientObservation),
            createEntry({ ...validPatient, id: 'not-yours' }),
            createEntry({ ...validPatientObservation, subject: 'not-you' }),
            createEntry(validPatientEncounter),
        ],
    };
    const searchNoEntitiesMatch = {
        ...emptySearchResult,
        entry: [
            createEntry({ ...validPatient, id: 'not-yours' }),
            createEntry({ ...validPatientObservation, subject: 'not-you' }),
        ],
    };
    const cases: (string | ReadResponseAuthorizedRequest | boolean | any)[][] = [
        [
            'READ: patient & user scope; Patient able to read own record',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read', 'patient/*.read'],
                    fhirUserObject: getFhirUser(`${apiUrl}/Patient/345`),
                    patientLaunchContext: patientFhirResource,
                },
                operation: 'read',
                readResponse: validPatient,
            },
            true,
            validPatient,
        ],
        [
            'READ: patient scope; Patient able to vread own Observation (uses absolute url)',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['patient/*.read'],
                    patientLaunchContext: patientFhirResource,
                },
                operation: 'vread',
                readResponse: validPatientObservation,
            },
            true,
            validPatientObservation,
        ],
        [
            'READ: user scope; Patient able to vread own Encounter (uses short-reference)',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read'],
                    fhirUserObject: patientFhirResource,
                },
                operation: 'read',
                readResponse: validPatientEncounter,
            },
            true,
            validPatientEncounter,
        ],
        [
            'READ: Patient unable to vread non-owned Patient record',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read', 'patient/*.read'],
                    fhirUserObject: patientFhirResource,
                    patientLaunchContext: patientFhirResource,
                },
                operation: 'vread',
                readResponse: { ...validPatient, id: 'not-yours' },
            },
            false,
            {},
        ],
        [
            'READ: Patient unable to read non-direct Observation',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read', 'patient/*.read'],
                    fhirUserObject: patientFhirResource,
                    patientLaunchContext: patientFhirResource,
                },
                operation: 'read',
                readResponse: { ...validPatientObservation, subject: 'not-you' },
            },
            false,
            {},
        ],
        [
            'READ: Practitioner able to read Encounter',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read'],
                    fhirUserObject: practitionerFhirResource,
                },
                operation: 'read',
                readResponse: validPatientEncounter,
            },
            true,
            validPatientEncounter,
        ],
        [
            'READ: Practitioner able to read unrelated Observation',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read'],
                    fhirUserObject: practitionerFhirResource,
                },
                operation: 'read',
                readResponse: validPatientObservation,
            },
            true,
            validPatientObservation,
        ],
        [
            'READ: external Practitioner able to read Encounter',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read'],
                    fhirUserObject: externalPractitionerFhirResource,
                },
                operation: 'read',
                readResponse: validPatientEncounter,
            },
            true,
            validPatientEncounter,
        ],
        [
            'READ: external Practitioner unable to read Observation',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read'],
                    fhirUserObject: externalPractitionerFhirResource,
                },
                operation: 'read',
                readResponse: validPatientObservation,
            },
            false,
            {},
        ],
        [
            'SEARCH: Patient able to search for empty result',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read', 'patient/*.read'],
                    fhirUserObject: patientFhirResource,
                    patientLaunchContext: patientFhirResource,
                },
                operation: 'search-system',
                readResponse: emptySearchResult,
            },
            true,
            emptySearchResult,
        ],
        [
            'SEARCH: patient scope; Patient able to search for own Observation & Patient record',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['patient/*.read'],
                    patientLaunchContext: patientFhirResource,
                },
                operation: 'search-type',
                readResponse: searchAllEntitiesMatch,
            },
            true,
            searchAllEntitiesMatch,
        ],
        [
            "SEARCH: user scope; Patient's history results are filtered to only contain valid entries",
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read', 'fhirUser'],
                    fhirUserObject: patientFhirResource,
                },
                operation: 'history-type',
                readResponse: searchSomeEntitiesMatch,
            },
            true,
            searchAllEntitiesMatch,
        ],
        [
            "SEARCH: both scopes; Patient's history results are all filtered out",
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read', 'patient/*.read'],
                    fhirUserObject: patientFhirResource,
                    patientLaunchContext: patientFhirResource,
                },
                operation: 'history-system',
                readResponse: searchNoEntitiesMatch,
            },
            true,
            emptySearchResult,
        ],
        [
            'SEARCH: user scope; external Practitioner able to search and filtered to just the encounter',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read'],
                    fhirUserObject: externalPractitionerFhirResource,
                },
                operation: 'search-type',
                readResponse: searchAllEntitiesMatch,
            },
            true,
            { ...emptySearchResult, entry: [createEntry(validPatientEncounter)] },
        ],
        [
            'SEARCH: user scope; Practitioner able to search and get ALL results',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.read'],
                    fhirUserObject: practitionerFhirResource,
                },
                operation: 'search-type',
                readResponse: searchAllEntitiesMatch,
            },
            true,
            searchAllEntitiesMatch,
        ],
    ];

    const authZHandler: SMARTHandler = new SMARTHandler(baseAuthZConfig(), apiUrl, '4.0.1');
    test.each(cases)('CASE: %p', async (_firstArg, request, isValid, respBody) => {
        if (!isValid) {
            await expect(
                authZHandler.authorizeAndFilterReadResponse(<ReadResponseAuthorizedRequest>request),
            ).rejects.toThrowError(UnauthorizedError);
        } else {
            await expect(
                authZHandler.authorizeAndFilterReadResponse(<ReadResponseAuthorizedRequest>request),
            ).resolves.toEqual(respBody);
        }
    });
});
describe('isWriteRequestAuthorized', () => {
    const cases: (string | WriteRequestAuthorizedRequest | boolean)[][] = [
        [
            'CREATE: patient scope; Patient able to write own Encounter',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['patient/*.write'],
                    patientLaunchContext: patientFhirResource,
                },
                operation: 'create',
                resourceBody: validPatientEncounter,
            },
            true,
        ],
        [
            'UPDATE: user scope; Practitioner able to write Patient',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.write'],
                    fhirUserObject: practitionerFhirResource,
                },
                operation: 'update',
                resourceBody: validPatient,
            },
            true,
        ],
        [
            'PATCH: user scope; External practitioner able to write Patient',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.write'],
                    fhirUserObject: externalPractitionerFhirResource,
                },
                operation: 'patch',
                resourceBody: { ...validPatient, generalPractitioner: { reference: externalPractitionerIdentity } },
            },
            true,
        ],
        [
            'PATCH: missing user/patient context',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.write', 'patient/*.write'],
                },
                operation: 'patch',
                resourceBody: { ...validPatient, generalPractitioner: { reference: externalPractitionerIdentity } },
            },
            false,
        ],
        [
            'UPDATE: user scope; External practitioner unable to write Patient',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.write'],
                    fhirUserObject: externalPractitionerFhirResource,
                },
                operation: 'update',
                resourceBody: validPatient,
            },
            false,
        ],
    ];

    const authZHandler: SMARTHandler = new SMARTHandler(baseAuthZConfig(), apiUrl, '4.0.1');
    test.each(cases)('CASE: %p', async (_firstArg, request, isValid) => {
        if (!isValid) {
            await expect(
                authZHandler.isWriteRequestAuthorized(<WriteRequestAuthorizedRequest>request),
            ).rejects.toThrowError(UnauthorizedError);
        } else {
            await expect(
                authZHandler.isWriteRequestAuthorized(<WriteRequestAuthorizedRequest>request),
            ).resolves.not.toThrow();
        }
    });
});

describe('isAccessBulkDataJobAllowed', () => {
    const authZHandler: SMARTHandler = new SMARTHandler(baseAuthZConfig(), apiUrl, '4.0.1');

    const cases: (string | AccessBulkDataJobRequest | boolean)[][] = [
        [
            'userIdentity and jobOwnerId match',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.*'],
                    fhirUserObject: practitionerFhirResource,
                },
                jobOwnerId: sub,
            },
            true,
        ],
        [
            'userIdentity and jobOwnerId does NOT match',
            {
                userIdentity: {
                    ...baseAccessNoScopes,
                    scopes: ['user/*.*'],
                    fhirUserObject: practitionerFhirResource,
                },
                jobOwnerId: 'xyz',
            },
            false,
        ],
    ];

    test.each(cases)('CASE: %p', async (_firstArg, request, isValid) => {
        if (isValid) {
            await expect(
                authZHandler.isAccessBulkDataJobAllowed(<AccessBulkDataJobRequest>request),
            ).resolves.not.toThrow();
        } else {
            await expect(
                authZHandler.isAccessBulkDataJobAllowed(<AccessBulkDataJobRequest>request),
            ).rejects.toThrowError(
                new UnauthorizedError('User does not have permission to access this Bulk Data Export job'),
            );
        }
    });
});

describe('isBundleRequestAuthorized', () => {
    const authZConfigWithSearchTypeScope = baseAuthZConfig();
    authZConfigWithSearchTypeScope.scopeRule.user.write = ['create'];
    const authZHandler: SMARTHandler = new SMARTHandler(authZConfigWithSearchTypeScope, apiUrl, '4.0.1');

    const cases: any[][] = [
        [
            'practitioner with user scope: no error',
            {
                ...baseAccessNoScopes,
                scopes: ['user/Observation.write', 'user/*.read', 'fhirUser'],
                fhirUserObject: practitionerFhirResource,
            },
            true,
        ],
        [
            'patient with patient scope: no error',
            {
                ...baseAccessNoScopes,
                scopes: ['patient/*.*', 'profile'],
                patientLaunchContext: patientFhirResource,
            },
            true,
        ],
        [
            'practitioner with patient&user scope: no error',
            {
                ...baseAccessNoScopes,
                scopes: ['user/Observation.write', 'patient/Patient.*', 'openid'],
                fhirUserObject: practitionerFhirResource,
                patientLaunchContext: patientFhirResource,
            },
            true,
        ],
        [
            'patient with user scope to create observation but no read perms: Unauthorized Error',
            {
                ...baseAccessNoScopes,
                scopes: ['user/Observation.write'],
                fhirUserObject: patientFhirResource,
            },
            false,
        ],
        [
            'practitioner with patient scope but no write perms: Unauthorized Error',
            {
                ...baseAccessNoScopes,
                scopes: ['patient/Patient.read'],
                fhirUserObject: practitionerFhirResource,
                patientLaunchContext: patientFhirResource,
            },
            false,
        ],
        [
            'patient with correct scopes; but does not have write access to resource: no error',
            {
                ...baseAccessNoScopes,
                scopes: ['patient/*.*', 'profile'],
                patientLaunchContext: externalPractitionerFhirResource,
            },
            false,
        ],
    ];
    test.each(cases)('CASE: %p', async (_firstArg, userIdentity, isAuthorized) => {
        const request: AuthorizationBundleRequest = {
            userIdentity,
            requests: [
                {
                    operation: 'create',
                    resource: validPatientObservation,
                    fullUrl: '',
                    resourceType: 'Observation',
                    id: '160265f7-e8c2-45ca-a1bc-317399e23549',
                },
                {
                    operation: 'read',
                    resource: patientIdentity,
                    fullUrl: patientIdentity,
                    resourceType: 'Patient',
                    id: '160265f7-e8c2-45ca-a1bc-317399e23548',
                },
            ],
        };

        if (!isAuthorized) {
            await expect(authZHandler.isBundleRequestAuthorized(request)).rejects.toThrowError(
                new UnauthorizedError('An entry within the Bundle is not authorized'),
            );
        } else {
            await expect(authZHandler.isBundleRequestAuthorized(request)).resolves.not.toThrow();
        }
    });
});

describe('getAllowedResourceTypesForOperation', () => {
    const authZConfigWithSearchTypeScope = baseAuthZConfig();
    authZConfigWithSearchTypeScope.scopeRule.user.read = ['search-type'];
    authZConfigWithSearchTypeScope.scopeRule.user.write = [];

    const cases: (string | string[])[][] = [
        [
            'search-type operation: read scope: returns [Patient, Observation]',
            ['user/Patient.read', 'user/Observation.read', 'fhirUser'],
            'search-type',
            ['Patient', 'Observation'],
        ],
        // if there are duplicated scopeResourceType we return an array with the duplicates removed
        [
            'search-type operation: read scope: duplicated Observation scopeResourceType still returns [Patient, Observation]',
            ['launch/patient', 'user/Patient.read', 'patient/Observation.read', 'user/Observation.read', 'launch'],
            'search-type',
            ['Patient', 'Observation'],
        ],
        // getAllowedResourceTypesForOperation returns an empty array because scopeRule user.write does not support any operations
        ['create operation: write scope: returns []', ['user/Patient.write', 'user/Observation.write'], 'created', []],
        // getAllowedResourceTypesForOperation returns an empty array because scopeRule user.read supports 'search-type' operation not 'vread'
        ['vread operation: read scope: returns []', ['user/Patient.read', 'user/Observation.read'], 'vread', []],
        // getAllowedResourceTypesForOperation returns BASE_R4_RESOURCES because resourceScopeType is '*'
        [
            'create operation: read scope: returns [BASE_R4_RESOURCES]',
            ['user/*.read'],
            'search-type',
            BASE_R4_RESOURCES,
        ],
    ];

    const authZHandler: SMARTHandler = new SMARTHandler(authZConfigWithSearchTypeScope, apiUrl, '4.0.1');
    test.each(cases)('CASE: %p', async (_firstArg, scopes, operation, expectedAllowedResources) => {
        const request: AllowedResourceTypesForOperationRequest = {
            userIdentity: {
                scopes,
            },
            operation: <TypeOperation | SystemOperation>operation,
        };

        await expect(authZHandler.getAllowedResourceTypesForOperation(request)).resolves.toEqual(
            expectedAllowedResources,
        );
    });
});

describe('getSearchFilterBasedOnIdentity', () => {
    const authZHandler: SMARTHandler = new SMARTHandler(baseAuthZConfig(), apiUrl, '4.0.1');
    test('Patient context identity', async () => {
        // BUILD
        const userIdentity = {
            ...baseAccessNoScopes,
            scopes: ['patient/*.*', 'user/*.read', 'fhirUser'],
            patientLaunchContext: getFhirResource(patientId, apiUrl),
        };
        const request: GetSearchFilterBasedOnIdentityRequest = {
            userIdentity,
            operation: 'search-type',
            resourceType: 'Encounter',
        };

        // OPERATE, CHECK
        const expectedFilter = [
            {
                key: '_references',
                logicalOperator: 'OR',
                comparisonOperator: '==',
                value: [patientIdentity, patientId],
            },
        ];
        await expect(authZHandler.getSearchFilterBasedOnIdentity(request)).resolves.toEqual(expectedFilter);
    });
    test('User identity', async () => {
        // BUILD
        const userIdentity = {
            ...baseAccessNoScopes,
            scopes: ['patient/*.*', 'user/*.*', 'fhirUser'],
            fhirUserObject: patientFhirResource,
        };
        const request: GetSearchFilterBasedOnIdentityRequest = {
            userIdentity,
            operation: 'search-system',
        };

        // OPERATE, CHECK
        const expectedFilter = [
            {
                key: '_references',
                logicalOperator: 'OR',
                comparisonOperator: '==',
                value: [patientIdentity, patientId],
            },
        ];
        await expect(authZHandler.getSearchFilterBasedOnIdentity(request)).resolves.toEqual(expectedFilter);
    });

    test('User & Patient identity; fhirUser hostname does not match server hostname', async () => {
        // BUILD
        const authZHandlerWithFakeApiUrl: SMARTHandler = new SMARTHandler(
            baseAuthZConfig(),
            'https://fhir.server-2.com/dev',
            '4.0.1',
        );

        const userIdentity = {
            ...baseAccessNoScopes,
            scopes: ['patient/*.*', 'user/*.*', 'fhirUser'],
            patientLaunchContext: patientFhirResource,
            fhirUserObject: patientFhirResource,
        };
        const request: GetSearchFilterBasedOnIdentityRequest = {
            userIdentity,
            operation: 'history-instance',
            resourceType: 'Patient',
            id: '1324',
        };

        // OPERATE, CHECK
        const expectedFilter = [
            {
                key: '_references',
                logicalOperator: 'OR',
                comparisonOperator: '==',
                value: [patientIdentity],
            },
            {
                key: 'id',
                logicalOperator: 'OR',
                comparisonOperator: '==',
                value: [id],
            },
        ];
        await expect(authZHandlerWithFakeApiUrl.getSearchFilterBasedOnIdentity(request)).resolves.toEqual(
            expectedFilter,
        );
    });

    test('Practitioner identity', async () => {
        // BUILD
        const userIdentity = {
            ...baseAccessNoScopes,
            scopes: ['user/*.*', 'fhirUser'],
            fhirUserObject: practitionerFhirResource,
        };
        const request: GetSearchFilterBasedOnIdentityRequest = {
            userIdentity,
            operation: 'search-system',
        };

        // OPERATE, CHECK
        const expectedFilter: [] = [];
        await expect(authZHandler.getSearchFilterBasedOnIdentity(request)).resolves.toEqual(expectedFilter);
    });
    test('External Practitioner identity', async () => {
        // BUILD
        const userIdentity = {
            ...baseAccessNoScopes,
            scopes: ['user/*.*', 'fhirUser'],
            fhirUserObject: externalPractitionerFhirResource,
        };
        const request: GetSearchFilterBasedOnIdentityRequest = {
            userIdentity,
            operation: 'search-type',
            resourceType: 'Patient',
        };

        // OPERATE, CHECK
        const expectedFilter = [
            {
                key: '_references',
                logicalOperator: 'OR',
                comparisonOperator: '==',
                value: [externalPractitionerIdentity],
            },
        ];
        await expect(authZHandler.getSearchFilterBasedOnIdentity(request)).resolves.toEqual(expectedFilter);
    });
});
