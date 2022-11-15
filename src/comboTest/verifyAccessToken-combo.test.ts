// import { BulkDataAuth, SystemOperation, TypeOperation } from 'fhir-works-on-aws-interface';
// import * as fs from 'fs';
// import { filterOutUnusableScope } from './smartScopeHelper';
import * as path from 'path';
import { VerifyAccessTokenRequest } from 'fhir-works-on-aws-interface';
import { SMARTHandler } from '../smartHandler';
import * as smartAuthorizationHelper from '../smartAuthorizationHelper';
import * as testStubs from './testStubs';

// const sync = require('csv-parse/lib/sync');

const { load } = require('csv-load-sync');

interface CsvRow {
    patientContext: object | undefined;
    fhirUser: string | undefined;
    operation: string;
    resourceType: string | undefined;
    id: string;
    vid: string;
    fhirServiceBaseUrl: string;
    'patient/Patient.read': string;
    'patient/Patient.write': string;
    'patient/MedicationRequest.read': string;
    'patient/MedicationRequest.write': string;
    'patient/Binary.read': string;
    'patient/Binary.write': string;
    'user/Patient.read': string;
    'user/Patient.write': string;
    'user/MedicationRequest.read': string;
    'user/MedicationRequest.write': string;
    'user/Binary.read: string': string;
    'user/Binary.write': string;
    'system/Patient.read': string;
    'system/Patient.write': string;
    'system/MedicationRequest.read': string;
    'system/MedicationRequest.write': string;
    'system/Binary.read': string;
    'system/Binary.write': string;
}

const getScopesFromResult = (result: any) => {
    const scopes: string[] = [];
    Object.entries(result).forEach(([key, value]) => {
        if (key.startsWith('system/') || key.startsWith('user/') || (key.startsWith('patient/') && value === key)) {
            scopes.push(key);
        }
    });
    return scopes;
};

// TODO : use path to get the right path
const csv: CsvRow[] = load(path.resolve(__dirname, './params/VerifyAccessToken-NoBulkDataAuth-params.csv'), {
    convert: {
        isUserScopeAllowedForSystemExport: (s: string) => s === 'true',
        resourceType: (s: string) => (s === 'N/A') ? undefined : s,
        fhirUser: (s: string) => testStubs.getFhirUserType(s),
        patientContext: (s: string) => (s === 'N/A') ? undefined : testStubs.patientContext,
    },
});
const clonedScopeRule = testStubs.scopeRule();
const testCasesFromCSV: any[] = [];
// [
//     'Read and Write Access: initiate-export',
//     {
//         accessToken: 'fake',
//         operation: 'read',
//         resourceType: '',
//         bulkDataAuth: { exportType: 'system', operation: 'initiate-export' },
//     },
//     { ...baseAccessNoScopes, scp: ['user/*.*', 'patient/*.write'], ...practitionerFhirUser },
// ]
const testCases: any[] = [];
csv.forEach((row, index) => {
    const result: any = {};

    result.testName = `Combo Test Row ${index}`;
    result.request = {
        accessToken: 'fake',
        operation: row.operation,
        resourceType: row.resourceType || '',
        bulkDataAuth: undefined,
    };
    result.decodedAccessToken = {
        ...testStubs.baseAccessNoScopes,
        scp: getScopesFromResult(row),
        fhirUser: row.fhirUser,
    };
    if (row.patientContext) {
        result.decodedAccessToken = {
            ...result.decodedAccessToken,
            ...row.patientContext,
        }
    }
    testCases.push([JSON.stringify(result, null, 2), result]);
});

// End TODO

describe('verifyAccessToken-combo', () => {
    // Example array of test cases
    // TODO: next step is to convert csv file loaded to follow the same format
    // const cases: (string | boolean | VerifyAccessTokenRequest | any)[][] = [
    //     [
    //         'Read and Write Access: initiate-export',
    //         {
    //             accessToken: 'fake',
    //             operation: 'read',
    //             resourceType: '',
    //             bulkDataAuth: { exportType: 'system', operation: 'initiate-export' },
    //         },
    //         { ...testStubs.baseAccessNoScopes, scp: ['user/*.*', 'patient/*.write'], ...testStubs.practitionerFhirUser },
    //     ],
    //     [
    //         'Read and Write Access: initiate-export',
    //         {
    //             accessToken: 'fake',
    //             operation: 'read',
    //             resourceType: '',
    //             bulkDataAuth: { exportType: 'system', operation: 'initiate-export' },
    //         },
    //         { ...testStubs.baseAccessNoScopes, scp: ['user/*.*', 'patient/*.write'], ...testStubs.patientFhirUser },
    //     ],
    //     [
    //         'Read and Write Access: initiate-export',
    //         {
    //             accessToken: 'fake',
    //             operation: 'read',
    //             resourceType: '',
    //             bulkDataAuth: { exportType: 'system', operation: 'initiate-export' },
    //         },
    //         { ...testStubs.baseAccessNoScopes, scp: ['user/*.*', 'patient/*.write'], ...testStubs.patientContext },
    //     ],
    // ];

    const authZConfig = testStubs.baseAuthZConfig();
    const authZHandler: SMARTHandler = new SMARTHandler(authZConfig, testStubs.apiUrl, '4.0.1', undefined, undefined, true);
    test.each(testCases)('CASE: %s', async (testCaseString, testCase) => {
        const authZHandlerWithAnotherApiURL: SMARTHandler = new SMARTHandler(
            authZConfig,
            'https://some-server.com',
            '4.0.1',
            undefined,
            undefined,
            true,
        );

        const requestWithFhirServiceBaseUrl = { ...testCase.request, fhirServiceBaseUrl: testStubs.apiUrl };

        // Handling mocking modules when code is in TS: https://stackoverflow.com/a/60693903/14310364
        jest.spyOn(smartAuthorizationHelper, 'verifyJwtToken').mockImplementation(() =>
            Promise.resolve(testCase.decodedAccessToken),
        );

        // TODO: Snapshot contains timestamp, need to update logic to static or it fails on rerun
        try {
            await expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>testCase.request)).resolves.toMatchSnapshot();
        } catch (e) {
            expect(e).toMatchSnapshot();
        }

        try {
            await expect(
                authZHandlerWithAnotherApiURL.verifyAccessToken(
                    <VerifyAccessTokenRequest>requestWithFhirServiceBaseUrl,
                ),
            ).resolves.toMatchSnapshot();
        } catch (e) {
            expect(e).toMatchSnapshot();
        }
    });
});
