<<<<<<< HEAD
import { BatchReadWriteRequest, SystemOperation, TypeOperation } from 'fhir-works-on-aws-interface';
=======
import { BatchReadWriteRequest } from 'fhir-works-on-aws-interface';
>>>>>>> origin
import { FhirResource, ScopeRule, SMARTConfig } from '../smartConfig';
import { getFhirUser } from '../smartAuthorizationHelper';
import { validPatient, validPatientObservation } from '../smartHandler.test';

export const scopeRule = (): ScopeRule => ({
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
export const expectedAud = 'api://default';
export const expectedIss = 'https://dev-6460611.okta.com/oauth2/default';
export const baseAuthZConfig = (): SMARTConfig => ({
    version: 1.0,
    scopeKey: 'scp',
    scopeRule: scopeRule(),
    expectedAudValue: expectedAud,
    expectedIssValue: expectedIss,
    fhirUserClaimPath: 'fhirUser',
    launchContextPathPrefix: 'ext.launch_response_',
    jwksEndpoint: `${expectedIss}/jwks`,
});
export const apiUrl = 'https://fhir.server.com/dev';
export const fakeUrl = 'https://random.server.com/dev';
export const id = 'id';
export const patientId = `Patient/${id}`;
export const practitionerId = `Practitioner/${id}`;
export const patientIdentity = `${apiUrl}/${patientId}`;
export const practitionerIdentity = `${apiUrl}/${practitionerId}`;
export const sub = 'test@test.com';

export const patientContext: any = {
    ext: { launch_response_patient: patientIdentity },
};
export const patientFhirUser: any = {
    fhirUser: patientIdentity,
};
export const practitionerFhirUser: any = {
    fhirUser: practitionerIdentity,
};

export const SEARCH_OPERATIONS: (TypeOperation | SystemOperation)[] = [
    'search-type',
    'search-system',
    'history-type',
    'history-instance',
    'history-system',
];

export const baseAccessNoScopes: any = {
    ver: 1,
    jti: 'AT.6a7kncTCpu1X9eo2QhH1z_WLUK4TyV43n_9I6kZNwPY',
    iss: expectedIss,
    aud: expectedAud,
    iat: 1668546607,
    exp: 2668546607,
    cid: '0oa8muazKSyk9gP5y5d5',
    uid: '00u85ozwjjWRd17PB5d5',
    sub,
};

const validCondition: any = {
    resourceType: 'Condition',
    id: 'example',
    text: {
        status: 'generated',
        div: '<div xmlns="http://www.w3.org/1999/xhtml">Severe burn of left ear (Date: 24-May 2012)</div>',
    },
    clinicalStatus: {
        coding: [
            {
                system: 'http://terminology.hl7.org/CodeSystem/condition-clinical',
                code: 'active',
            },
        ],
    },
    verificationStatus: {
        coding: [
            {
                system: 'http://terminology.hl7.org/CodeSystem/condition-ver-status',
                code: 'confirmed',
            },
        ],
    },
    category: [
        {
            coding: [
                {
                    system: 'http://terminology.hl7.org/CodeSystem/condition-category',
                    code: 'encounter-diagnosis',
                    display: 'Encounter Diagnosis',
                },
                {
                    system: 'http://snomed.info/sct',
                    code: '439401001',
                    display: 'Diagnosis',
                },
            ],
        },
    ],
    severity: {
        coding: [
            {
                system: 'http://snomed.info/sct',
                code: '24484000',
                display: 'Severe',
            },
        ],
    },
    code: {
        coding: [
            {
                system: 'http://snomed.info/sct',
                code: '39065001',
                display: 'Burn of ear',
            },
        ],
        text: 'Burnt Ear',
    },
    bodySite: [
        {
            coding: [
                {
                    system: 'http://snomed.info/sct',
                    code: '49521004',
                    display: 'Left external ear structure',
                },
            ],
            text: 'Left Ear',
        },
    ],
    subject: {
        reference: patientIdentity,
    },
    onsetDateTime: '2012-05-24',
};

export const getFhirUserType = (fhirUser: string | undefined): string | undefined => {
    if (fhirUser === 'practitionerFhirUser') {
        return practitionerIdentity;
    }
    if (fhirUser === 'patientFhirUser' || fhirUser === 'patientIdentity') {
        return patientIdentity;
    }
    return undefined;
};

export const getFhirUserObject = (fhirUser: string | undefined): FhirResource | undefined => {
    if (fhirUser === 'practitionerFhirUser') {
        return getFhirUser(practitionerIdentity);
    }
    if (fhirUser === 'patientFhirUser' || fhirUser === 'patientIdentity') {
        return getFhirUser(patientIdentity);
    }
    return undefined;
};

export const convertNAtoUndefined = (s: string) => (s === 'N/A' ? undefined : s);

export const convertToBaseUrl = (url: string): string | undefined => {
    if (url === 'matchUrl') {
        return apiUrl;
    }
    if (url === 'nonMatchUrl') {
        return fakeUrl;
    }
    return undefined;
};

export type ResourceBodyDescription =
    | 'matchObservation'
    | 'unmatchCondition'
    | 'matchPatient'
    | 'unmatchPatient'
    | 'patientReferencePractitioner';

export const getResourceBody = (resourceBodyDescription: ResourceBodyDescription) => {
    switch (resourceBodyDescription) {
        case 'matchObservation':
            return validPatientObservation;
        case 'unmatchCondition':
            return {
                ...validCondition,
                subject: {
                    reference: `${apiUrl}/another-id`,
                },
            };
        case 'matchPatient':
            return validPatient;
        case 'unmatchPatient':
            return { ...validPatient, id: 'another-id' };
        case 'patientReferencePractitioner':
            return { ...validPatient, generalPractitioner: { reference: practitionerIdentity } };
        default:
            return undefined;
    }
};

export const getResourceType = (resourceBodyDescription: ResourceBodyDescription | undefined) => {
    if (!resourceBodyDescription) {
        return undefined;
    }
    switch (resourceBodyDescription) {
        case 'matchObservation':
            return 'Observation';
        case 'unmatchCondition':
            return 'Condition';
        default:
            return 'Patient';
    }
};

export const getReadResponse = (operation: string) => {
    if (SEARCH_OPERATIONS.includes(operation as TypeOperation | SystemOperation)) {
        return {
            total: 4,
            entry: generateBundle(),
        };
    }
    // check if we want to return a medicationRequest, Condition, or Patient resource and return
    // the appropriate resource
    return { ...validCondition, subject: undefined };
};

export const generateBundle = (): BatchReadWriteRequest[] => {
    return [
        {
            operation: 'create',
            resourceType: 'Observation',
            id: validPatientObservation.id,
            resource: validPatientObservation,
            // references generated as per this method in routing: https://github.com/awslabs/fhir-works-on-aws-routing/blob/mainline/src/router/bundle/bundleParser.ts#L328
            references: [
                {
                    resourceType: 'Patient',
                    id: patientId,
                    vid: '1',
                    rootUrl: apiUrl,
                    referenceFullUrl: patientIdentity,
                    referencePath: 'subject',
                },
            ],
        },
        {
            operation: 'create',
            resourceType: 'Condition',
            id: validCondition.id,
            resource: { ...validCondition, subject: undefined }, // remove reference to patient
        },
        {
            operation: 'read',
            resourceType: 'Patient',
            id,
            resource: undefined,
        },
        {
            operation: 'read',
            resourceType: 'Patient',
            id: 'PatientNotSameId',
            resource: undefined,
        },
    ];
};
