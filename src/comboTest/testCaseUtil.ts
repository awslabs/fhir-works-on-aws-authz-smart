import * as path from 'path';
import { SystemOperation, TypeOperation } from 'fhir-works-on-aws-interface';
import { UserIdentity } from '../smartConfig';
import { convertNAtoUndefined, getFhirUserObject, scopeRule } from './testStubs';
import { filterOutUnusableScope } from '../smartScopeHelper';

// TODO: Change name of the file to include .test, then exlucd it from running in project.json
const { load } = require('csv-load-sync');

export interface BaseCsvRow {
    operation: string;
    fhirUser?: string;
    patientContext?: string;
    resourceType?: string;
}

export default class TestCaseUtil<CsvRow extends BaseCsvRow> {
    private readonly csvFilePath: string;

    constructor(csvFilePath: string) {
        this.csvFilePath = csvFilePath;
    }

    loadTestCase(csvConvertRule?: any): { csvRow: CsvRow; userIdentity: UserIdentity }[] {
        const csvRow: CsvRow[] = load(path.resolve(__dirname, this.csvFilePath), {
            convert: {
                resourceType: (s: string) => convertNAtoUndefined(s),
                fhirUser: (s: string) => convertNAtoUndefined(s),
                patientContext: (s: string) => (s === 'N/A' ? undefined : s),
                ...csvConvertRule,
            },
        });
        const testCases: { csvRow: CsvRow; userIdentity: UserIdentity }[] = [];
        csvRow.forEach((row) => {
            const scopes = this.getScopesFromResult(row);
            const userIdentity: UserIdentity = {
                scopes,
            };

            const fhirUserClaim = row.fhirUser;
            const patientContextClaim = row.patientContext;

            const usableScopes = filterOutUnusableScope(
                scopes,
                scopeRule(),
                row.operation as TypeOperation | SystemOperation,
                false,
                row.resourceType,
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

    getScopesFromResult = (result: CsvRow) => {
        const scopes: string[] = [];
        Object.entries(result).forEach(([key, value]) => {
            if ((key.startsWith('system/') || key.startsWith('user/') || key.startsWith('patient/')) && value === key) {
                scopes.push(key);
            }
        });
        return scopes;
    };
}
