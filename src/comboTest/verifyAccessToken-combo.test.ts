// import { BulkDataAuth, SystemOperation, TypeOperation } from 'fhir-works-on-aws-interface';
// import * as fs from 'fs';
// import { filterOutUnusableScope } from './smartScopeHelper';
import * as path from 'path';
import { VerifyAccessTokenRequest } from 'fhir-works-on-aws-interface';
import { ScopeRule, SMARTConfig } from '../smartConfig';
import { SMARTHandler } from '../smartHandler';
import * as smartAuthorizationHelper from '../smartAuthorizationHelper';

// const sync = require('csv-parse/lib/sync');

const { load } = require('csv-load-sync');

const scopeRule = (): ScopeRule => ({
    patient: {
        read: ['read', 'vread', 'search-type', 'search-system', 'history-instance', 'history-type', 'history-system'],
        write: ['create', 'transaction'],
    },
    user: {
        read: ['read', 'vread', 'search-type', 'search-system', 'history-instance', 'history-type', 'history-system'],
        write: ['update', 'patch', 'create', 'delete', 'transaction'],
    },
    system: {
        // "read" allows system export and group export
        read: ['read'],
        write: [],
    },
});

interface CsvRow {
    patientContext: string;
    fhirUser: string;
    operation: string;
    resourceType: string;
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
        if (key.startsWith('system/') || key.startsWith('user/') || (key.startsWith('/patient/') && value === key)) {
            scopes.push(key);
        }
    });
    return scopes;
};
// TODO : use path to get the right path
const csv: CsvRow[] = load(path.resolve(__dirname, './params/VerifyAccessToken-NoBulkDataAuth-params.csv'), {
    convert: {
        isUserScopeAllowedForSystemExport: (s: string) => s === 'true',
    },
});
const clonedScopeRule = scopeRule();
const testCasesFromCSV: any[] = [];
csv.forEach((row) => {
    const testInput: any = {
        scopes: getScopesFromResult(row),
        scopeRule: clonedScopeRule,
        // reqOperation: row.operation as TypeOperation | SystemOperation,
        // isUserScopeAllowedForSystemExport: row.isUserScopeAllowedForSystemExport,
        // reqResourceType: row.reqResourceType,
        bulkDataAuth: undefined,
        patientContext: row.patientContext,
        fhirUser: row.fhirUser,
    };
    testCasesFromCSV.push(testInput);
});

// TODO: Combine common set up to a separate util file
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
// End TODO

describe('verifyAccessToken-combo', () => {
    // Example array of test cases
    // TODO: next step is to convert csv file loaded to follow the same format
    const cases: (string | boolean | VerifyAccessTokenRequest | any)[][] = [
        [
            'Read and Write Access: initiate-export',
            {
                accessToken: 'fake',
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'initiate-export' },
            },
            { ...baseAccessNoScopes, scp: ['user/*.*', 'patient/*.write'], ...practitionerFhirUser },
        ],
        [
            'Read and Write Access: initiate-export',
            {
                accessToken: 'fake',
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'initiate-export' },
            },
            { ...baseAccessNoScopes, scp: ['user/*.*', 'patient/*.write'], ...patientFhirUser },
        ],
        [
            'Read and Write Access: initiate-export',
            {
                accessToken: 'fake',
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'initiate-export' },
            },
            { ...baseAccessNoScopes, scp: ['user/*.*', 'patient/*.write'], ...patientContext },
        ],
    ];

    const authZConfig = baseAuthZConfig();
    const authZHandler: SMARTHandler = new SMARTHandler(authZConfig, apiUrl, '4.0.1', undefined, undefined, true);
    test.each(cases)('CASE: %p', async (_firstArg, request, decodedAccessToken) => {
        const authZHandlerWithAnotherApiURL: SMARTHandler = new SMARTHandler(
            authZConfig,
            'https://some-server.com',
            '4.0.1',
            undefined,
            undefined,
            true,
        );

        const requestWithFhirServiceBaseUrl = { ...request, fhirServiceBaseUrl: apiUrl };

        // Handling mocking modules when code is in TS: https://stackoverflow.com/a/60693903/14310364
        jest.spyOn(smartAuthorizationHelper, 'verifyJwtToken').mockImplementation(() =>
            Promise.resolve(decodedAccessToken),
        );

        // TODO: Snapshot contains timestamp, need to update logic to static or it fails on rerun
        try {
            await expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).resolves.toMatchSnapshot();
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
