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
describe('areScopesSufficient', () => {
    test('scope is sufficient to read Observation', () => {
        const clonedScopeRule = clone(scopeRule);
        clonedScopeRule.user.read = ['read'];

        expect(areScopesSufficient(['user/Observation.read'], 'read', clonedScopeRule, 'Observation')).toEqual(true);

        expect(areScopesSufficient(['user/*.read'], 'read', clonedScopeRule, 'Observation')).toEqual(true);
    });
    test('scope is NOT sufficient to read Observation', () => {
        const clonedScopeRule = clone(scopeRule);
        clonedScopeRule.user.read = ['read'];

        expect(areScopesSufficient(['user/Medication.read'], 'read', clonedScopeRule, 'Observation')).toEqual(false);
    });

    test('scope is sufficient for bulk data access', () => {
        const clonedScopeRule = clone(scopeRule);
        clonedScopeRule.user.read = ['read'];
        const bulkDataAuth: BulkDataAuth = { operation: 'initiate-export', exportType: 'system' };
        expect(areScopesSufficient(['user/*.read'], 'read', clonedScopeRule, undefined, bulkDataAuth)).toEqual(true);
    });

    test('scope is NOT sufficient for bulk data access', () => {
        const clonedScopeRule = clone(scopeRule);
        clonedScopeRule.user.read = ['read'];
        const bulkDataAuth: BulkDataAuth = { operation: 'initiate-export', exportType: 'system' };
        expect(
            areScopesSufficient(['user/Observation.read'], 'read', clonedScopeRule, undefined, bulkDataAuth),
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
