import { VerifyAccessTokenRequest } from 'fhir-works-on-aws-interface';
import { SMARTHandler } from '../smartHandler';
import * as smartAuthorizationHelper from '../smartAuthorizationHelper';
import * as testStubs from './testStubs';
import CsvUtil from './csvUtil';


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
    isUserScopeAllowedForSystemExport: boolean;
}

export interface BulkDataAuth {
    operation:
    | 'initiate-export'
    | 'initiate-import'
    | 'get-status-export'
    | 'get-status-import'
    | 'cancel-export'
    | 'cancel-import';
    exportType?: 'system' | 'group' | 'patient';
    importResources?: string[];
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
const csvUtil = new CsvUtil<CsvRow>('./params/VerifyAccessToken-BulkDataAuth-params.csv');
const csv = csvUtil.loadCsv({
    isUserScopeAllowedForSystemExport: (s: string) => s === 'true',
    fhirServiceBaseUrl: (s: string) => (s === 'N/A') ? undefined : s,
});

const clonedScopeRule = testStubs.scopeRule();
const testCasesFromCSV: any[] = [];


const testCases: any[] = [];
csv.forEach((row, index) => {
    const result: any = {};
    const bulkDataAuth: any = {
        operation: row['BulkDataAuth.operation'],
        exportType: row['BulkDataAuth.exportType'],
    };
    result.testName = `Combo Test Row ${index}`;
    result.request = {
        accessToken: 'fake',
        operation: row.operation,
        resourceType: row.resourceType || '',
        bulkDataAuth,
        fhirServiceBaseUrl: row.fhirServiceBaseUrl,
    };
    result.decodedAccessToken = {
        ...testStubs.baseAccessNoScopes,
        scp: getScopesFromResult(row),
        fhirUser: row.fhirUser,
    };
    result.isUserScopeAllowedForSystemExport = row.isUserScopeAllowedForSystemExport;
    if (row.patientContext) {
        result.decodedAccessToken = {
            ...result.decodedAccessToken,
            ...row.patientContext,
        }
    }
    testCases.push([JSON.stringify(result, null, 2), result]);
});

describe('verifyAccessToken-combo', () => {
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
    })

});