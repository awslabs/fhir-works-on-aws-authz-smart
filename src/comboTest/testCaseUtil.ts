import * as path from 'path';
import * as testStubs from './testStubs';
import { UserIdentity } from '../smartConfig';
import { getFhirUserObject, scopeRule } from './testStubs';
import { filterOutUnusableScope } from '../smartScopeHelper';

// TODO: Change name of the file to include .test, then exlucd it from running in project.json
const { load } = require('csv-load-sync');

export default class TestCaseUtil<GenericCsvRow> {
    private readonly csvFilePath: string;

    constructor(csvFilePath: string) {
        this.csvFilePath = csvFilePath;
    }

    loadTestCase(csvConvert?: any): { csvRow: GenericCsvRow; userIdentity: UserIdentity }[] {
        const csvRow: GenericCsvRow[] = load(path.resolve(__dirname, this.csvFilePath), {
            convert: {
                resourceType: (s: string) => (s === 'N/A' ? undefined : s),
                fhirUser: (s: string) => testStubs.getFhirUserType(s),
                patientContext: (s: string) => (s === 'N/A' ? undefined : testStubs.patientContext),
                ...csvConvert,
            },
        });
        const testCases: { csvRow: GenericCsvRow; userIdentity: UserIdentity }[] = [];
        csvRow.forEach((row) => {
            const scopes = this.getScopesFromResult(row);
            const userIdentity: UserIdentity = {
                scopes,
            };

            const fhirUserClaim = (row as any).fhirUser;
            const patientContextClaim = (row as any).patientContext;

            console.log(scopes);

            const usableScopes = filterOutUnusableScope(
                scopes,
                scopeRule(),
                (row as any).operation,
                false,
                (row as any).resourceType,
                undefined,
                patientContextClaim,
                fhirUserClaim,
            );

            if (fhirUserClaim && usableScopes.some((scope) => scope.startsWith('user/'))) {
                userIdentity.fhirUserObject = getFhirUserObject(fhirUserClaim);
            }
            if (patientContextClaim && usableScopes.some((scope) => scope.startsWith('patient/'))) {
                userIdentity.patientLaunchContext = getFhirUserObject(patientContextClaim);
            }
            userIdentity.usableScopes = usableScopes;
            testCases.push({ csvRow: row, userIdentity });
        });
        return testCases;
    }

    writeTestResultsToCsv(testResults: { testCase: any; testResult: any }[]) {
        console.log(testResults);
        // TODO
    }

    getScopesFromResult = (result: GenericCsvRow) => {
        const scopes: string[] = [];
        Object.entries(result).forEach(([key, value]) => {
            if ((key.startsWith('system/') || key.startsWith('user/') || key.startsWith('patient/')) && value === key) {
                scopes.push(key);
            }
        });
        return scopes;
    };
}
