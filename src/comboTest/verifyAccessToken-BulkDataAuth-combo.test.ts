import { VerifyAccessTokenRequest } from 'fhir-works-on-aws-interface';
import { SMARTHandler } from '../smartHandler';
import * as smartAuthorizationHelper from '../smartAuthorizationHelper';
import * as testStubs from './testStubs';
import TestCaseUtil from './testCaseUtil';

interface CsvRow {
    patientContext: object | undefined;
    fhirUser: string | undefined;
    operation: string;
    'BulkDataAuth.operation': string;
    'BulkDataAuth.exportType': string;
    resourceType: string | undefined;
    id: string;
    vid: string;
    fhirServiceBaseUrl: string;
    'patient/Patient.read': string;
    'patient/*.read': string;
    'user/Patient.read': string;
    'user/*.read': string;
    'system/Patient.read': string;
    'system/*.read': string;
    isUserScopeAllowedForSystemExport: boolean;
}
const testcaseUtil = new TestCaseUtil<CsvRow>('./params/VerifyAccessToken-BulkDataAuth-params.csv');

const loadAndPrepareTestCases = () => {
    const testCases: any[] = [];
    const csv = testcaseUtil.loadTestCase({
        isUserScopeAllowedForSystemExport: (s: string) => s === 'true',
        fhirServiceBaseUrl: (s: string) => (s === 'N/A' ? undefined : s),
    });

    csv.forEach((inputRow, index) => {
        const testCase: any = {};
        const row = inputRow.csvRow;
        const bulkDataAuth: any = {
            operation: row['BulkDataAuth.operation'],
            exportType: row['BulkDataAuth.exportType'],
        };
        testCase.testName = `Combo Test Row ${index}`;
        testCase.request = {
            accessToken: 'fake',
            operation: row.operation,
            resourceType: row.resourceType || '',
            bulkDataAuth,
            fhirServiceBaseUrl: row.fhirServiceBaseUrl,
        };
        testCase.decodedAccessToken = {
            ...testStubs.baseAccessNoScopes,
            scp: testcaseUtil.getScopesFromResult(row),
            fhirUser: row.fhirUser,
        };
        testCase.isUserScopeAllowedForSystemExport = row.isUserScopeAllowedForSystemExport;
        if (row.patientContext) {
            testCase.decodedAccessToken = {
                ...testCase.decodedAccessToken,
                ...row.patientContext,
            };
        }
        testCases.push([JSON.stringify(testCase, null, 2), testCase]);
    });
    return testCases;
};

describe('verifyAccessToken-BulkDataAuth-combo', () => {
    const testCases: any[] = loadAndPrepareTestCases();
    const authZConfig = testStubs.baseAuthZConfig();
    const authZHandlerUserScope: SMARTHandler = new SMARTHandler(
        authZConfig,
        testStubs.apiUrl,
        '4.0.1',
        undefined,
        undefined,
        true,
    );
    const authZHandlerNoUserScope: SMARTHandler = new SMARTHandler(
        authZConfig,
        testStubs.apiUrl,
        '4.0.1',
        undefined,
        undefined,
        false,
    );

    test.each(testCases)('CASE: %s', async (testCaseString, testCase) => {
        // Handling mocking modules when code is in TS: https://stackoverflow.com/a/60693903/14310364
        jest.spyOn(smartAuthorizationHelper, 'verifyJwtToken').mockImplementation(() =>
            Promise.resolve(testCase.decodedAccessToken),
        );
        const authZHandler = testCase.isUserScopeAllowedForSystemExport
            ? authZHandlerUserScope
            : authZHandlerNoUserScope;
        // TODO: Snapshot contains timestamp, need to update logic to static or it fails on rerun
        try {
            await expect(
                authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>testCase.request),
            ).resolves.toMatchSnapshot();
        } catch (e) {
            // TODO: append errors to output file
            expect(e).toMatchSnapshot();
        }
    });
});
