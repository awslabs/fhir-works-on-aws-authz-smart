import { BulkDataAuth, clone } from 'fhir-works-on-aws-interface';
import { ScopeRule } from './smartConfig';
import {
    areScopesSufficient,
    convertScopeToSmartScope,
    getJwksClient,
    getScopes,
    getValidOperationsForScopeTypeAndAccessType,
    verifyJwtToken,
} from './smartScopeHelper';

const scopeRule: ScopeRule = {
    patient: {
        read: [],
        write: [],
    },
    user: {
        read: [],
        write: [],
    },
    system: {
        read: [],
        write: [],
    },
    launch: {
        launch: [],
        patient: [],
        encounter: [],
    },
};
const areScopesSufficientCases: string[][] = [['user'], ['patient']];
describe.each(areScopesSufficientCases)('%s: areScopesSufficient', (scopeType: string) => {
    test('scope is sufficient to read Observation: Scope with resourceType "Observation" should be able to read "Observation" resources', () => {
        const clonedScopeRule = clone(scopeRule);
        clonedScopeRule[scopeType].read = ['read'];

        expect(areScopesSufficient([`${scopeType}/Observation.read`], 'read', clonedScopeRule, 'Observation')).toEqual(
            true,
        );
    });

    test('scope is sufficient to read Observation: Scope with resourceType "*" should be able to read "Observation" resources', () => {
        const clonedScopeRule = clone(scopeRule);
        clonedScopeRule[scopeType].read = ['read'];

        expect(areScopesSufficient([`${scopeType}/*.read`], 'read', clonedScopeRule, 'Observation')).toEqual(true);
    });

    test('scope is NOT sufficient to read Observation because scopeRule does not allow read operation', () => {
        const clonedScopeRule = clone(scopeRule);
        clonedScopeRule[scopeType].read = ['search-type'];

        expect(areScopesSufficient([`${scopeType}/Medication.read`], 'read', clonedScopeRule, 'Observation')).toEqual(
            false,
        );
    });

    test('scope is NOT sufficient to read Observation because resourceType does not match', () => {
        const clonedScopeRule = clone(scopeRule);
        clonedScopeRule[scopeType].read = ['read'];

        expect(areScopesSufficient([`${scopeType}/Medication.read`], 'read', clonedScopeRule, 'Observation')).toEqual(
            false,
        );
    });

    test('scope is sufficient for bulk data access with "user" scopeType but not "patient" scopeType', () => {
        const clonedScopeRule = clone(scopeRule);
        clonedScopeRule[scopeType].read = ['read'];
        const bulkDataAuth: BulkDataAuth = { operation: 'initiate-export', exportType: 'system' };

        // Only scopeType of user has bulkDataAccess
        expect(areScopesSufficient([`${scopeType}/*.read`], 'read', clonedScopeRule, undefined, bulkDataAuth)).toEqual(
            scopeType === 'user',
        );
    });

    test('scope is NOT sufficient for bulk data access: Scope needs to have resourceType "*"', () => {
        const clonedScopeRule = clone(scopeRule);
        clonedScopeRule[scopeType].read = ['read'];

        const bulkDataAuth: BulkDataAuth = { operation: 'initiate-export', exportType: 'system' };
        expect(
            areScopesSufficient([`${scopeType}/Observation.read`], 'read', clonedScopeRule, undefined, bulkDataAuth),
        ).toEqual(false);
    });
});

describe('getScopes', () => {
    test('scope type delimited by space', () => {
        expect(getScopes('space', 'launch/encounter user/*.read')).toEqual(['launch/encounter', 'user/*.read']);
    });
    test('scope type as array', () => {
        expect(getScopes('array', ['launch/encounter', 'user/*.read'])).toEqual(['launch/encounter', 'user/*.read']);
    });
});

describe('getValidOperationsForScopeTypeAndAccessType', () => {
    const clonedScopeRule = clone(scopeRule);
    clonedScopeRule.user = {
        read: ['read'],
        write: ['create'],
    };
    test('read scope', () => {
        const validOperations = getValidOperationsForScopeTypeAndAccessType('user', 'read', clonedScopeRule);
        expect(validOperations).toEqual(['read']);
    });

    test('write scope', () => {
        const validOperations = getValidOperationsForScopeTypeAndAccessType('user', 'write', clonedScopeRule);
        expect(validOperations).toEqual(['create']);
    });

    test('* scope', () => {
        const validOperations = getValidOperationsForScopeTypeAndAccessType('user', '*', clonedScopeRule);
        expect(validOperations).toEqual(['read', 'create']);
    });
});

describe('convertScopeToSmartScope', () => {
    test('launchScope', () => {
        const scope = 'launch/encounter';
        expect(convertScopeToSmartScope(scope)).toEqual({
            launchType: 'encounter',
            scopeType: 'launch',
        });
    });
    test('clinicalScope', () => {
        const scope = 'user/Observation.read';
        expect(convertScopeToSmartScope(scope)).toEqual({
            accessType: 'read',
            resourceType: 'Observation',
            scopeType: 'user',
        });
    });
});

test('verifyJwtToken', async () => {
    const incorrectToken =
        'eyJraWQiOiJUNDN3aHBFVTkzamorZk1IaTNzSElDcjFqa0p5MmlJM0QyY2VBSVwvaUJBWT0iLCJhbGciOiJSUzI1NiJ9.eyJzdWIiOiI3NjE5YmRhYy01MjcyLTQ1ZGMtOWRkNy1hM2M5ZmU1YjkyYzUiLCJjb2duaXRvOmdyb3VwcyI6WyJwcmFjdGl0aW9uZXIiXSwiaXNzIjoiaHR0cHM6XC9cL2NvZ25pdG8taWRwLnVzLXdlc3QtMi5hbWF6b25hd3MuY29tXC91cy13ZXN0LTJfek51em0xSmRlIiwidmVyc2lvbiI6MiwiY2xpZW50X2lkIjoiMmhyNDBtMnBhNG5xcHRvZmUxb29tNWNlbWEiLCJldmVudF9pZCI6ImMwNDgzYjUwLTJhZWQtNDE5Ny1hNjg0LWVlYWNhNTJiNzMwMyIsInRva2VuX3VzZSI6ImFjY2VzcyIsInNjb3BlIjoib3BlbmlkIHByb2ZpbGUiLCJhdXRoX3RpbWUiOjE2MTAwNjYzMDksImV4cCI6MTYxMDA2OTkwOSwiaWF0IjoxNjEwMDY2MzA5LCJqdGkiOiI1MDBiZWI3ZC03ZTcwLTQyYzUtOGM3ZS0zZjUxZGJiYjk5MWUiLCJ1c2VybmFtZSI6IndvcmtzaG9wdXNlciJ9.vpg_fjJB7OVlzHycSM4PHufma-ASNLJYgjACfpbwdOqcoRvzyUZONPFMfSkr-lOoZPnMf2g0dHNB_NlSRfgwEOuzvlpulqzXtzuyMSU9cHjbLaWuAX-csrWVGVHY3wf_8AzcdYTLHRet_vBtlbxhAbeHMpSUC-C2QvsgPCqmyMuAhjyaHpfHSwoTRb___kJdHNpZdrUF-JofpP6_MH82Ep_jfXTW4am2m8OuaQsimkbgQ-HtWO8bM0Os_D-hlASpVsvT8FISuaKHjCHowosT1vl2-FABsi8vN0aXFp_n87ks-EU5W7HAwNwFfYLCXhpAeNBN-50v8feKzeWgccs6ig';
    const token =
        'eyJraWQiOiI5NUE5S1hWZTAzeU9MOWdhQlZKZWw1ejhSVHJseC1oTHlta2tyQkhhNWxvIiwiYWxnIjoiUlMyNTYifQ.eyJ2ZXIiOjEsImp0aSI6IkFULklBY1o4SVJ2UTIzdDRJWWEyRVdMek42MHJtWnlrVkdBaDBIcEtqdXV2X0EiLCJpc3MiOiJodHRwczovL2Rldi0xNzgxMTAxLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYxMDEyOTQwMywiZXhwIjoxNjEwMTMzMDAzLCJjaWQiOiIwb2EzZ28xbHJOQUFKeUpMODVkNiIsInVpZCI6IjAwdTJzeW9heWxadDhvWnFvNWQ2Iiwic2NwIjpbInByb2ZpbGUiLCJlbWFpbCIsIm9wZW5pZCJdLCJzdWIiOiJ0aGluZ3V0QGFtYXpvbi5jb20ifQ.K7OlBDFh3hAFh7PAkhyIcLj3wmnfvIRGSIeaBiSbLrF3Gqx6_k_RZegiA4E2KaysaHuik1mJ0r8p-aYBpRJRyUBanz4yKX8He6m0VyTa5IN92jH86zewfB_ad232V3Wr7XTGy9GZUL45sGDcT3eRGqAI6-6y0PazfAn9jsSmbZqrd-2jPWRB0T5tpD-BO7OMBOVrxirVpjQ21l3weUfVgqZn6cmZ-sJwkADamt0nz0nBjIHJvw5LHaMPCFAsDNcAh4ezQ8FmX4NaA6peau0L4HmxnOZsW_JO4YxGQAq7VoxZBjX1lAj4earMYtKfBxf8gVXOFju9B7iKVtUfS-NvpA';
    const client = getJwksClient('https://dev-1781101.okta.com/oauth2/default/v1/keys');
    const result = await verifyJwtToken(token, client);
    console.log(result);
});
