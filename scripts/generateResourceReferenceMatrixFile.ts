/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */

/*
This scripts generates the JSON files at src/schema. Before running the script download the JSON FHIR definition package and copy
the profiles-resources.json file into this directory.

It is recommended to install ts-node to execute .ts files in the command line
> npm install -g ts-node

You can download the latest FHIR definition from https://www.hl7.org/fhir/downloads.html or find older FHIR versions at http://hl7.org/fhir/directory.html

Run the script:
> cd to this current directory
> ts-node generateResourceReferenceMatrixFile.ts <fhirVersion>
*/

import * as fs from 'fs';

interface Type {
    code: string;
    targetProfile: string[];
}
interface Element {
    id: string;
    type: Type[];
}

interface Result {
    [sourceResourceType: string]: { [requestorResourceType: string]: string[] };
}

const readProfileFile = (path: string): any[] => {
    const data = JSON.parse(fs.readFileSync(path, { encoding: 'utf8' }));
    return data.entry.map((x: any) => x.resource);
};

const compile = (resources: any[], fhirVersion: string) => {
    const filter = resources.filter(
        resource => resource.baseDefinition === 'http://hl7.org/fhir/StructureDefinition/DomainResource',
    );

    const result: Result = {};
    if (fhirVersion.startsWith('4')) {
        filter.forEach(resource => {
            return resource.snapshot.element
                .filter((element: Element) => element.type && element.type[0].code === 'Reference')
                .forEach((element: Element) =>
                    element.type[0].targetProfile.forEach((target: string) => {
                        const sourceType = resource.type;
                        const requestorType = target.replace('http://hl7.org/fhir/StructureDefinition/', '');
                        const path = element.id.replace(`${resource.type}.`, '').replace('[x]', '');

                        if (!result[sourceType]) {
                            result[sourceType] = {};
                        }
                        if (!result[sourceType][requestorType]) {
                            result[sourceType][requestorType] = [];
                        }
                        result[sourceType][requestorType].push(path);
                    }),
                );
        });
    } else if (fhirVersion.startsWith('3')) {
        filter.forEach(resource => {
            return resource.snapshot.element
                .filter((element: Element) => !!element.type)
                .forEach((element: Element) => {
                    return element.type
                        .filter((type: Type) => type.code === 'Reference' && !!type.targetProfile)
                        .forEach((type: Type) => {
                            const sourceType = resource.type;
                            const path = element.id.replace(`${resource.type}.`, '').replace('[x]', '');
                            const requestorType = String(type.targetProfile).replace(
                                'http://hl7.org/fhir/StructureDefinition/',
                                '',
                            );

                            if (!result[sourceType]) {
                                result[sourceType] = {};
                            }
                            if (!result[sourceType][requestorType]) {
                                result[sourceType][requestorType] = [];
                            }
                            result[sourceType][requestorType].push(path);
                        });
                });
        });
    }
    return result;
};

const run = async () => {
    const args = process.argv.slice(2);
    if (!args[0]) {
        console.log('Error. Missing fhirVersion parameter');
        console.log('Usage: ts-node run.ts <fhirVersion>');
    }
    const fhirVersion = args[0];
    console.log('reading file');
    const resources = readProfileFile(`${fhirVersion}-profiles-resources.json`);
    console.log('compiling file');
    const compiledReferences = compile(resources, fhirVersion);
    console.log('writing compiled output');
    fs.writeFileSync(
        `../src/schema/fhirResourceReferencesMatrix.v${fhirVersion}.json`,
        JSON.stringify(compiledReferences),
    );
};

run()
    .then(console.log)
    .catch(console.error);
