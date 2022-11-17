import { FhirResource, ScopeRule, SMARTConfig } from '../smartConfig';
import { getFhirUser } from '../smartAuthorizationHelper';

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

// TODO: update iat, exp timestamps
// iat: Math.floor(Date.now() / 1000) - 1,
// exp: Math.floor(Date.now() / 1000) + 60 * 60,
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

export const getFhirUserType = (fhirUser: string): string | undefined => {
    if (fhirUser === 'practitionerFhirUser') {
        return practitionerIdentity;
    }
    if (fhirUser === 'patientFhirUser') {
        return patientIdentity;
    }
    return undefined;
};

export const getFhirUserObject = (fhirUser: string): FhirResource | undefined => {
    if (fhirUser === 'practitionerFhirUser') {
        return getFhirUser(practitionerIdentity);
    }
    if (fhirUser === 'patientFhirUser' || fhirUser === 'patientIdentity') {
        return getFhirUser(patientIdentity);
    }
    return undefined;
};

export const convertNAtoUndefined = (s: string) => (s === 'N/A' ? undefined : s);
