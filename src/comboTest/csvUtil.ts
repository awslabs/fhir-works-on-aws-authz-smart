import * as path from 'path';
import * as testStubs from './testStubs';

const { load } = require('csv-load-sync');

export default class CsvUtil<CsvHeader>
{

    private csvFilePath: string;

    /**
     *
     */
    constructor(csvFilePath: string) {
        this.csvFilePath = csvFilePath;
    }

    loadCsv(csvConvert?: any): CsvHeader[] {
        const result: CsvHeader[] = load(path.resolve(__dirname, this.csvFilePath), {
            convert: {
                resourceType: (s: string) => (s === 'N/A') ? undefined : s,
                fhirUser: (s: string) => testStubs.getFhirUserType(s),
                patientContext: (s: string) => (s === 'N/A' ? undefined : testStubs.patientContext),
                ...csvConvert,
            },
        });
        return result;
    }
}
