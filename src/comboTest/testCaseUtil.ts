import * as path from 'path';
import { SystemOperation, TypeOperation } from 'fhir-works-on-aws-interface';
import { writeFileSync } from 'fs';
import { json2csvAsync } from 'json-2-csv';
import { UserIdentity } from '../smartConfig';
import { convertNAtoUndefined, getFhirUserObject, getFhirUserType, scopeRule } from './testStubs';
import { filterOutUnusableScope } from '../smartScopeHelper';

// TODO: Change name of the file to include .test, then exlucd it from running in project.json
// eslint-disable-next-line import/no-extraneous-dependencies
const { load } = require('csv-load-sync');

const OUTPUT_FOLDER_NAME = 'output';

export interface BaseCsvRow {
    operation: string;
    fhirUser?: string;
    patientContext?: string;
    resourceType?: string;
}

export default class TestCaseUtil<CsvRow extends BaseCsvRow> {
    private readonly csvFilePath: string;

    private readonly outputFilePath: string;

    constructor(csvFilePath: string, outputFilePath: string) {
        this.csvFilePath = csvFilePath;
        this.outputFilePath = outputFilePath;
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

            const fhirUserClaim = getFhirUserType(row.fhirUser);
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

    // eslint-disable-next-line class-methods-use-this
    async writeTestResultsToCsv(
        testResults: { testCase: any; testResult: any }[],
        keysToOutput: { field: string; title: string | undefined }[],
    ) {
        if (process.env.GENERATE_CSV_FOR_REVIEW !== 'true') {
            return;
        }

        const csv = await json2csvAsync(testResults, { keys: keysToOutput });
        writeFileSync(path.join(__dirname, `./${OUTPUT_FOLDER_NAME}/${this.outputFilePath}.csv`), csv, {
            flag: 'w',
        });
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
