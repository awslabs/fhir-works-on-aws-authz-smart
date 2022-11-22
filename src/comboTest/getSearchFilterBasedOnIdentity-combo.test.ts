import { GetSearchFilterBasedOnIdentityRequest } from 'fhir-works-on-aws-interface';
import { SMARTHandler } from '../smartHandler';
import * as smartAuthorizationHelper from '../smartAuthorizationHelper';
import * as testStubs from './testStubs';
import TestCaseUtil, { BaseCsvRow } from './testCaseUtil';
import { convertNAtoUndefined } from './testStubs';

interface CsvRow extends BaseCsvRow {
    id: string;
    vid: string;
    fhirServiceBaseUrl: string;
    resourceType: string;
    'patient/Patient.read': string
    'patient/Patient.*': string
    'patient/Observation.read': string
    'patient/Observation.*': string
    'patient/Binary.read': string
    'patient/Binary.*': string
    'user/Patient.read': string
    'user/Patient.*': string
    'user/Observation.read': string
    'user/Observation.*': string
    'user/Binary.read': string
    'user/Binary.*': string
    'system/Patient.read': string
    'system/Patient.*': string
    'system/Observation.read': string
    'system/Observation.*': string
    'system/Binary.read': string
    'system/Binary.*': string
}

const testCaseUtil = new TestCaseUtil<CsvRow>('./params/GetSearchFilterBasedOnIdentity-params.csv', 'GetSearchFilterBasedOnIdentity');

const loadAndPrepareTestCases = (): any[] => {
    const testCases: any[] = [];
    const csv = testCaseUtil.loadTestCase({
        isUserScopeAllowedForSystemExport: (s: string) => s === 'true',
        fhirServiceBaseUrl: (s: string) => convertNAtoUndefined(s),
    });
    csv.forEach((inputRow, index) => {
        const testCase: any = {};

        const row = inputRow.csvRow;
        //TODO: get usable scopes
        const scopes = testCaseUtil.getScopesFromResult(row)
        testCase.testName = `Combo Test Row ${index}`;
        testCase.request = {
            userIdentity: {
                ...testStubs.baseAccessNoScopes,
                scopes: scopes,
                usableScopes: scopes,
                patientLaunchContext: testStubs.getFhirUserType(row.fhirUser),
                fhirUserObject: testStubs.getFhirUserType(row.fhirUser),
            },
            fhirServiceBaseUrl: testStubs.convertToBaseUrl(row.fhirServiceBaseUrl),
            operation: row.operation,
            resourceType: row.resourceType,
        };
        testCase.decodedAccessToken = {
            ...testStubs.baseAccessNoScopes,
            scp: testCaseUtil.getScopesFromResult(row),
            fhirUser: testStubs.getFhirUserType(row.fhirUser),
        };
        if (row.patientContext) {
            testCase.decodedAccessToken = {
                ...testCase.decodedAccessToken,
                ...testStubs.patientContext,
            };
        }
        testCases.push([JSON.stringify(testCase, null, 2), testCase]);
    });
    return testCases;
};


describe('getSearchFilterBasedOnIdentity-combo', () => {
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
        await testCaseUtil.writeTestResultsToCsv(testResults, keysToOutput);
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
        // jest.spyOn(smartAuthorizationHelper, 'verifyJwtToken').mockImplementation(() =>
        //     Promise.resolve(testCase.decodedAccessToken),
        // );
        jest.spyOn(smartAuthorizationHelper, 'verifyJwtToken').mockImplementation(() =>
            Promise.resolve(testCase.decodedAccessToken),
        );
        let testResult: any;
        try {
            testResult = await authZHandler.getSearchFilterBasedOnIdentity(<GetSearchFilterBasedOnIdentityRequest>testCase.request);

            expect(testResult).toMatchSnapshot();
        } catch (e) {
            // TODO: append errors to output file
            testResult = { message: (e as Error).message };
            expect(e).toMatchSnapshot();
        }
        testResults.push({ ...testCase, ...testResult });
    });
});