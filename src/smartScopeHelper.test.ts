import { BulkDataAuth, clone } from 'fhir-works-on-aws-interface';

import { ScopeRule } from './smartConfig';
import {
    areScopesSufficient,
    convertScopeToSmartScope,
    getScopes,
    getValidOperationsForScopeTypeAndAccessType,
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
