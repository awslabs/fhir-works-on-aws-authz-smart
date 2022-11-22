import { AllowedResourceTypesForOperationRequest } from 'fhir-works-on-aws-interface';
import { SMARTHandler } from '../smartHandler';
import * as smartAuthorizationHelper from '../smartAuthorizationHelper';
import * as testStubs from './testStubs';
import TestCaseUtil, { BaseCsvRow } from './testCaseUtil';
import { convertNAtoUndefined } from './testStubs';

interface CsvRow extends BaseCsvRow {
    'patient/Patient.': string
    'patient/Patient.*': string
    'patient/Observation.': string
    'patient/Observation.*': string
    'patient/Consideration.': string
    'patient/Consideration.*': string
    'user/Patient.': string
    'user/Patient.*': string
    'user/Observation.': string
    'user/Observation.*': string
    'user/Consideration.': string
    'user/Consideration.*': string
    'system/Patient.': string
    'system/Patient.*': string
    'system/Observation.': string
    'system/Observation.*': string
    'system/Consideration.': string
    'system/Consideration.*': string
}

const testCaseUtil = new TestCaseUtil<CsvRow>(
    './params/getAllowedResourceTypesForOperation-params.csv',
    'GetAllowedResourceTypesForOperation'
);

const loadAndPrepareTestCases = (): any[] => {
    const testCases: any[] = [];
    const csv = testCaseUtil.loadTestCase({
        fhirServiceBaseUrl: (s: string) => convertNAtoUndefined(s),
    });
    csv.forEach((inputRow, index) => {
        const testCase: any = {};
        const row = inputRow.csvRow;
        testCase.testName = `Combo Test Row ${index}`;
        testCase.request = {
            userIdentity: inputRow.userIdentity,
            // userIdentity: {
            //     scopes: testCaseUtil.getScopesFromResult(row),
            // },
            // fhirServiceBaseUrl: testStubs.convertToBaseUrl(row.fhirServiceBaseUrl),
            operation: row.operation,
            // resourceType: row.resourceType,
        };
        // testCase.decodedAccessToken = {
        //     ...testStubs.baseAccessNoScopes,
        //     scp: testCaseUtil.getScopesFromResult(row),
        //     fhirUser: testStubs.getFhirUserType(row.fhirUser),
        // };
        // if (row.patientContext) {
        //     testCase.decodedAccessToken = {
        //         ...testCase.decodedAccessToken,
        //         ...testStubs.patientContext,
        //     };
        // }
        testCases.push([JSON.stringify(testCase, null, 2), testCase]);
    });
    return testCases;
};


describe('getAllowedResourceTypesForOperation-combo', () => {
    const testResults: any[] = [];
    const keysToOutput: any[] = [
        { field: 'testName', title: 'Test Number' },
        { field: 'request.operation', title: 'Operation' },
        { field: 'request.userIdentity.scopes', title: ' Scopes' },
        { field: 'testResult', title: 'Allowed Resources' },
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
        // jest.spyOn(smartAuthorizationHelper, 'verifyJwtToken').mockImplementation(() =>
        //     Promise.resolve(testCase.decodedAccessToken),
        // );
        let testResult: any;
        try {
            testResult = await authZHandler.getAllowedResourceTypesForOperation(<AllowedResourceTypesForOperationRequest>testCase.request);
            //console.log(testResult)
            expect(testResult).toMatchSnapshot();
        } catch (e) {
            // TODO: append errors to output file
            testResult = { message: (e as Error).message };
            expect(e).toMatchSnapshot();
        }
        testResults.push({ ...testCase, testResult });
    });
});
