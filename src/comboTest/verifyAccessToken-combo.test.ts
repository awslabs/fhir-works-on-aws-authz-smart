import { VerifyAccessTokenRequest } from 'fhir-works-on-aws-interface';
import { json2csv, json2csvAsync } from 'json-2-csv';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { SMARTHandler } from '../smartHandler';
import * as smartAuthorizationHelper from '../smartAuthorizationHelper';
import * as testStubs from './testStubs';
import TestCaseUtil, { BaseCsvRow } from './testCaseUtil';
import { convertNAtoUndefined } from './testStubs';
let converter = require('json-2-csv');

interface CsvRow extends BaseCsvRow {
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

const testCaseUtil = new TestCaseUtil<CsvRow>('./params/VerifyAccessToken-NoBulkDataAuth-params.csv');

const loadAndPrepareTestCases = (): any[] => {
    const testCases: any[] = [];
    const csv = testCaseUtil.loadTestCase({
        isUserScopeAllowedForSystemExport: (s: string) => s === 'true',
        fhirServiceBaseUrl: (s: string) => convertNAtoUndefined(s),
    });
    csv.forEach((inputRow, index) => {
        const result: any = {};

        console.log(inputRow.userIdentity);

        const row = inputRow.csvRow;
        result.testName = `Combo Test Row ${index}`;
        result.request = {
            accessToken: 'fake',
            operation: row.operation,
            resourceType: row.resourceType || '',
            bulkDataAuth: undefined,
            fhirServiceBaseUrl: row.fhirServiceBaseUrl,
        };
        result.decodedAccessToken = {
            ...testStubs.baseAccessNoScopes,
            scp: testCaseUtil.getScopesFromResult(row),
            fhirUser: row.fhirUser,
        };
        if (row.patientContext) {
            result.decodedAccessToken = {
                ...result.decodedAccessToken,
                ...testStubs.patientContext,
            };
        }
        testCases.push([JSON.stringify(result, null, 2), result]);
    });
    return testCases;
};

describe('verifyAccessToken-combo', () => {
    const testResults: any[] = [];
    const keysToOutput: any[] = [
        { field: 'testName', title: 'Test Number' },
        { field: 'request.operation', title: 'Operation' },
        { field: 'request.resourceType', title: ' Resource' },
        { field: 'decodedAccessToken.fhirUser', title: 'fhirUser' },
        { field: 'decodedAccessToken.ext.launch_response_patient', title: 'Patient in Context' },
        { field: 'message', title: 'Error' },
        { field: 'usableScopes', title: 'Usable Scopes' },
        { field: 'decodedAccessToken.scp', title: 'Scopes' },
    ];

    afterAll(async () => {
        await testCaseUtil.writeTestResultsToCsv(testResults, 'verifyAccessToken', keysToOutput);
    });
    const testCases = loadAndPrepareTestCases();
    const authZConfig = testStubs.baseAuthZConfig();
    const authZHandler: SMARTHandler = new SMARTHandler(
        authZConfig,
        testStubs.apiUrl,
        '4.0.1',
        undefined,
        undefined,
        true,
    );

    test.each(testCases)('CASE: %s', async (testCaseString, testCase) => {
        // Handling mocking modules when code is in TS: https://stackoverflow.com/a/60693903/14310364
        jest.spyOn(smartAuthorizationHelper, 'verifyJwtToken').mockImplementation(() =>
            Promise.resolve(testCase.decodedAccessToken),
        );
        let testResult: any;
        // TODO: Snapshot contains timestamp, need to update logic to static or it fails on rerun
        try {
            testResult = await authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>testCase.request);

            expect(testResult).toMatchSnapshot();
        } catch (e) {
            // TODO: append errors to output file
            testResult = { message: (e as Error).message};
            expect(e).toMatchSnapshot();
        }
        testResults.push({ ...testCase, ...testResult });
    });
});
