/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import axios from 'axios';
import MockAdapter from 'axios-mock-adapter';
import {
    VerifyAccessTokenRequest,
    ReadResponseAuthorizedRequest,
    SystemOperation,
    TypeOperation,
    UnauthorizedError,
    WriteRequestAuthorizedRequest,
    clone,
    AccessBulkDataJobRequest,
    AllowedResourceTypesForOperationRequest,
    BASE_R4_RESOURCES,
    AuthorizationBundleRequest,
    GetSearchFilterBasedOnIdentityRequest,
} from 'fhir-works-on-aws-interface';
import { decode } from 'jsonwebtoken';
import { SMARTHandler } from './smartHandler';
import { SMARTConfig, ScopeRule } from './smartConfig';

const allReadOperations: (TypeOperation | SystemOperation)[] = [
    'read',
    'vread',
    'search-type',
    'search-system',
    'history-instance',
    'history-type',
    'history-system',
];

const allWriteOperations: (TypeOperation | SystemOperation)[] = [
    'create',
    'update',
    'delete',
    'patch',
    'transaction',
    'batch',
];

const scopeRule: ScopeRule = {
    patient: {
        read: allReadOperations,
        write: ['update', 'patch', 'create'],
    },
    user: {
        read: allReadOperations,
        write: [],
    },
    system: {
        read: allReadOperations,
        write: allWriteOperations,
    },
    launch: {
        launch: allReadOperations,
        patient: allReadOperations,
        encounter: allReadOperations,
    },
};

const noFHIRScopesAccess: string =
    'eyJraWQiOiJETmJFNVpJalFmR2FJTEY3RlBmZHVZMjdCQ1R0THZ0QTVCTGRlWUFQcFFRIiwiYWxnIjoiUlMyNTYifQ.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbImZoaXJVc2VyIiwib3BlbmlkIiwicHJvZmlsZSJdLCJzdWIiOiJzbWF5ZGE0NEBnbWFpbC5jb20iLCJmaGlyVXNlciI6IlBhdGllbnQvMTIzNCJ9.wvziVAfCAM3Lmg2xeiZ991fuKtVSIY7uJItBCYfOc_fNceZzCitMTRhbBFBR65C9qPemmJOGgnVIWsy2fWwkWqIS9f4jhYW5VstmxsJpZDpJFi1Junrhb3kFzTQr80yP3unGlQMLv91x4E4RWcmXOr0akh9Z7PuO2M0LUwup4riix4X2do-nqepVp-7PTd-t3AqC8ohK5_vrPbi4YFKOtp7TJEfSm251OMI_TaXr0o83Gr8i25QITo8uZE87mIlWw9Y84mETos2U8fpYfHE1rvTev1zu5Qu38DCZeuppDnftvTvOfZY25TbdjzrUEUNypVGro38UxVoLh9d5rGZZxw';
const audStringWrongAccess: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdHFxcSIsImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbImZoaXJVc2VyIiwib3BlbmlkIiwicHJvZmlsZSIsInBhdGllbnQvKi4qIl0sInN1YiI6InNtYXlkYTQ0QGdtYWlsLmNvbSIsImZoaXJVc2VyIjoiUGF0aWVudC8xMjM0In0.7SWjgXwiHdZHH9p3GX6ef994ZdPO3XLC2St-HSIpuCA';
const audArrayWrongAccess: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjpbImFwaTovL2RlZmF1bHRxcXEiXSwiaWF0IjoxNjAzMTE4MTM4LCJleHAiOjE2MDMxMjE3MzgsImNpZCI6IjBvYThtdWF6S1N5azlnUDV5NWQ1IiwidWlkIjoiMDB1ODVvendqaldSZDE3UEI1ZDUiLCJzY3AiOlsiZmhpclVzZXIiLCJvcGVuaWQiLCJwcm9maWxlIiwicGF0aWVudC8qLioiXSwic3ViIjoic21heWRhNDRAZ21haWwuY29tIiwiZmhpclVzZXIiOiJQYXRpZW50LzEyMzQifQ.oSOQuWe-hW6SS8rjczDijBsws9sNHNwwK7eiTnfE1Uw';
const audArrayValidAccess: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjpbImFwaTovL2RlZmF1bHRxcXEiLCJhcGk6Ly9kZWZhdWx0Il0sImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbImZoaXJVc2VyIiwib3BlbmlkIiwicHJvZmlsZSIsImxhdW5jaC9lbmNvdW50ZXIiLCJwYXRpZW50L1BhdGllbnQucmVhZCIsInBhdGllbnQvT2JzZXJ2YXRpb24ucmVhZCJdLCJzdWIiOiJzbWF5ZGE0NEBnbWFpbC5jb20iLCJmaGlyVXNlciI6IlBhdGllbnQvMTIzNCJ9.p9yVl9xYXhin-xMgpxWaWlot1yj0qrMTZxfnqLPv6tA';
const issWrongAccess: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL2Zha2UvZGVmYXVsdCIsImF1ZCI6ImFwaTovL2RlZmF1bHQiLCJpYXQiOjE2MDMxMTgxMzgsImV4cCI6MTYwMzEyMTczOCwiY2lkIjoiMG9hOG11YXpLU3lrOWdQNXk1ZDUiLCJ1aWQiOiIwMHU4NW96d2pqV1JkMTdQQjVkNSIsInNjcCI6WyJmaGlyVXNlciIsIm9wZW5pZCIsInByb2ZpbGUiLCJwYXRpZW50LyouKiJdLCJzdWIiOiJzbWF5ZGE0NEBnbWFpbC5jb20iLCJmaGlyVXNlciI6IlBhdGllbnQvMTIzNCJ9.KD39_myQqMW5lckO4iS_XAU9Ygs59t5i70EZFFTxe7U';
const launchAccess: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbImZoaXJVc2VyIiwib3BlbmlkIiwicHJvZmlsZSIsImxhdW5jaCJdLCJzdWIiOiJzbWF5ZGE0NEBnbWFpbC5jb20iLCJmaGlyVXNlciI6IlBhdGllbnQvMTIzNCJ9.d7bx2yTIVVuqgxclrJe-TOfRuslTKi5np4hM_B6VQ_o';
const launchPatientAccess: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbImZoaXJVc2VyIiwib3BlbmlkIiwicHJvZmlsZSIsImxhdW5jaC9wYXRpZW50Il0sInN1YiI6InNtYXlkYTQ0QGdtYWlsLmNvbSIsImZoaXJVc2VyIjoiUGF0aWVudC8xMjM0In0.0pXNJUUCUyIfCkbMnyA6c68YT1Yk9gdgy_54gCIvwMI';
const launchEncounterAccess: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbImZoaXJVc2VyIiwib3BlbmlkIiwicHJvZmlsZSIsImxhdW5jaC9lbmNvdW50ZXIiXSwic3ViIjoic21heWRhNDRAZ21haWwuY29tIiwiZmhpclVzZXIiOiJQYXRpZW50LzEyMzQifQ.Nl6yRFGCFnSXszg9kBHS4sbMQio7YnOUajGWOkaLdUA';
const manyReadAccess: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbImZoaXJVc2VyIiwib3BlbmlkIiwicHJvZmlsZSIsImxhdW5jaC9lbmNvdW50ZXIiLCJwYXRpZW50L1BhdGllbnQucmVhZCIsInBhdGllbnQvT2JzZXJ2YXRpb24ucmVhZCJdLCJzdWIiOiJzbWF5ZGE0NEBnbWFpbC5jb20iLCJmaGlyVXNlciI6IlBhdGllbnQvMTIzNCJ9.k_uqVL_uXo49ETrhSwaNXw0LYDadvt4LJuwrKh-0FJo';
const practitionerUserAllAccess: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbImZoaXJVc2VyIiwib3BlbmlkIiwicHJvZmlsZSIsImxhdW5jaC9lbmNvdW50ZXIiLCJwYXRpZW50L1BhdGllbnQucmVhZCIsInBhdGllbnQvT2JzZXJ2YXRpb24ucmVhZCIsInVzZXIvKi4qIl0sInN1YiI6InNtYXlkYTQ0QGdtYWlsLmNvbSIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyLzEyMzQifQ.hUvJkUw108XDDw7n6KrRvKbzMWSfp84kt4-qqKCRXA4';
const practitionerUserReadAccess: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbImZoaXJVc2VyIiwib3BlbmlkIiwicHJvZmlsZSIsImxhdW5jaC9lbmNvdW50ZXIiLCJwYXRpZW50L1BhdGllbnQucmVhZCIsInBhdGllbnQvT2JzZXJ2YXRpb24ucmVhZCIsInVzZXIvKi5yZWFkIl0sInN1YiI6InNtYXlkYTQ0QGdtYWlsLmNvbSIsImZoaXJVc2VyIjoiUHJhY3RpdGlvbmVyLzEyMzQifQ.85sfPi7_PoNS4zhUeoQWv-dvEUQSwga-h77DT6SXH_M';
const manyWriteAccess: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbImZoaXJVc2VyIiwib3BlbmlkIiwicHJvZmlsZSIsInVzZXIvUGF0aWVudC53cml0ZSIsInN5c3RlbS9PYnNlcnZhdGlvbi53cml0ZSIsInBhdGllbnQvKi53cml0ZSJdLCJzdWIiOiJzbWF5ZGE0NEBnbWFpbC5jb20iLCJmaGlyVXNlciI6IlBhdGllbnQvMTIzNCJ9.tRx8pf60I98vUJI7Q87sZkvI24ii6ADQ_jSw88Q42EY';
const allSysAccess: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjpbInN5c3RlbS8qLioiXSwic3ViIjoic21heWRhNDRAZ21haWwuY29tIiwiZmhpclVzZXIiOiJQYXRpZW50LzEyMzQifQ.prsPxDrXt3vg1WpKJCLSHm9bFItL3wItYMb8Hvk6K3I';
const manyReadAccessScopeSpaces: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjoiZmhpclVzZXIgb3BlbmlkIHByb2ZpbGUgbGF1bmNoL2VuY291bnRlciBwYXRpZW50L1BhdGllbnQucmVhZCBwYXRpZW50L09ic2VydmF0aW9uLnJlYWQiLCJzdWIiOiJzbWF5ZGE0NEBnbWFpbC5jb20iLCJmaGlyVXNlciI6IlBhdGllbnQvMTIzNCJ9.XXzFDtWFUreMDg39xTDlC3cNBc6TVZZ6i4IRD-6RcOA';
const manyReadAccessScopeSpacesJustLaunch: string =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ2ZXIiOjEsImp0aSI6IkFULjZhN2tuY1RDcHUxWDllbzJRaEgxel9XTFVLNFR5VjQzbl85STZrWk53UFkiLCJpc3MiOiJodHRwczovL2Rldi02NDYwNjExLm9rdGEuY29tL29hdXRoMi9kZWZhdWx0IiwiYXVkIjoiYXBpOi8vZGVmYXVsdCIsImlhdCI6MTYwMzExODEzOCwiZXhwIjoxNjAzMTIxNzM4LCJjaWQiOiIwb2E4bXVhektTeWs5Z1A1eTVkNSIsInVpZCI6IjAwdTg1b3p3ampXUmQxN1BCNWQ1Iiwic2NwIjoiZmhpclVzZXIgb3BlbmlkIHByb2ZpbGUgbGF1bmNoIiwic3ViIjoic21heWRhNDRAZ21haWwuY29tIiwiZmhpclVzZXIiOiJQYXRpZW50LzEyMzQifQ.mExtrUuJhXRaKlpJ72-3CrsX5CezkYC-tVY1dg4frlw';
const expectedAud = 'api://default';
const expectedIss = 'https://dev-6460611.okta.com/oauth2/default';
const authZConfig: SMARTConfig = {
    version: 1.0,
    scopeKey: 'scp',
    scopeValueType: 'array',
    scopeRule,
    expectedAudValue: expectedAud,
    expectedIssValue: expectedIss,
    fhirUserClaimKey: 'fhirUser',
    userInfoEndpoint: `${expectedIss}/userInfo`,
};
const apiUrl = 'https://fhir.server.com/dev/';
const patientId = 'Patient/1234';
const patientIdentityWithoutScopes = { [authZConfig.fhirUserClaimKey]: `${apiUrl}${patientId}` };
const practitionerIdentityWithoutScopes = { [authZConfig.fhirUserClaimKey]: `${apiUrl}Practitioner/1234` };
const externalPractitionerIdentityWithoutScopes = { [authZConfig.fhirUserClaimKey]: `${apiUrl}test/Practitioner/1234` };

const validPatient = {
    resourceType: 'Patient',
    id: '1234',
    meta: {
        versionId: '1',
        lastUpdated: '2020-06-28T12:03:29.421+00:00',
    },
    name: [
        {
            given: ['JONNY'],
        },
    ],
    gender: 'male',
    birthDate: '1972-10-13',
    address: [
        {
            city: 'Ruppertshofen',
        },
    ],
};
const validPatientObservation = {
    resourceType: 'Observation',
    id: '1274045',
    meta: {
        versionId: '1',
        lastUpdated: '2020-06-28T12:55:47.134+00:00',
    },
    status: 'final',
    code: {
        coding: [
            {
                system: 'http://loinc.org',
                code: '15074-8',
                display: 'Glucose [Moles/volume] in Blood',
            },
        ],
    },
    subject: {
        reference: patientIdentityWithoutScopes[authZConfig.fhirUserClaimKey],
        display: 'JONNY',
    },
    effectivePeriod: {
        start: '2013-04-02T09:30:10+01:00',
    },
    issued: '2013-04-03T15:30:10+01:00',
    valueQuantity: {
        value: 6.3,
        unit: 'mmol/l',
        system: 'http://unitsofmeasure.org',
        code: 'mmol/L',
    },
    interpretation: [
        {
            coding: [
                {
                    system: 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                    code: 'H',
                    display: 'High',
                },
            ],
        },
    ],
    referenceRange: [
        {
            low: {
                value: 3.1,
                unit: 'mmol/l',
                system: 'http://unitsofmeasure.org',
                code: 'mmol/L',
            },
            high: {
                value: 6.2,
                unit: 'mmol/l',
                system: 'http://unitsofmeasure.org',
                code: 'mmol/L',
            },
        },
    ],
};
const validPatientEncounter = {
    resourceType: 'Encounter',
    id: '1339909',
    meta: {
        versionId: '1',
        lastUpdated: '2019-02-06T19:32:37.166+00:00',
    },
    status: 'finished',
    class: {
        code: 'WELLNESS',
    },
    type: [
        {
            coding: [
                {
                    system: 'http://snomed.info/sct',
                    code: '185349003',
                    display: 'Encounter for check up (procedure)',
                },
            ],
            text: 'Encounter for check up (procedure)',
        },
    ],
    subject: {
        reference: patientId,
    },
    participant: [
        {
            individual: {
                reference: externalPractitionerIdentityWithoutScopes[authZConfig.fhirUserClaimKey],
            },
        },
    ],
    period: {
        start: '2011-12-22T21:49:35-05:00',
        end: '2011-12-22T22:19:35-05:00',
    },
    serviceProvider: {
        reference: 'Organization/1339537',
    },
};

const mock = new MockAdapter(axios);
beforeEach(() => {
    expect.assertions(1);
});
afterEach(() => {
    mock.reset();
});
describe('constructor', () => {
    test('ERROR: Attempt to create a handler to support a new config version', async () => {
        expect(() => {
            // eslint-disable-next-line no-new
            new SMARTHandler(
                {
                    ...authZConfig,
                    version: 2.0,
                },
                apiUrl,
                '4.0.1',
            );
        }).toThrow(new Error('Authorization configuration version does not match handler version'));
    });
});
function addScopeToUserIdentity(partialIdentity: any, accessToken: string) {
    const identity = clone(partialIdentity);
    const decoded: any = decode(accessToken);
    identity.scopes = Array.isArray(decoded!.scp) ? decoded!.scp : decoded!.scp.split(' ');
    return identity;
}

describe('verifyAccessToken; scopes are in an array', () => {
    const arrayScopesCases: (string | boolean | VerifyAccessTokenRequest)[][] = [
        ['aud_failure', { accessToken: audStringWrongAccess, operation: 'create', resourceType: 'Patient' }, false],
        ['iss_failure', { accessToken: issWrongAccess, operation: 'create', resourceType: 'Patient' }, false],
        ['no_fhir_scopes', { accessToken: noFHIRScopesAccess, operation: 'create', resourceType: 'Patient' }, false],
        ['launch_scope', { accessToken: launchAccess, operation: 'create', resourceType: 'Patient' }, false],
        ['launch/patient', { accessToken: launchPatientAccess, operation: 'search-system' }, true],
        [
            'launch/encounter',
            { accessToken: launchEncounterAccess, operation: 'read', resourceType: 'Patient', id: '123' },
            true,
        ],
        [
            'manyRead_Write',
            { accessToken: manyReadAccess, operation: 'update', resourceType: 'Patient', id: '12' },
            false,
        ],
        [
            'manyRead_Read',
            { accessToken: manyReadAccess, operation: 'vread', resourceType: 'Observation', id: '1', vid: '1' },
            true,
        ],
        [
            'manyRead_search',
            { accessToken: manyReadAccess, operation: 'search-type', resourceType: 'Observation' },
            true,
        ],
        [
            'manyWrite_Read',
            { accessToken: manyWriteAccess, operation: 'read', resourceType: 'Patient', id: '12' },
            false,
        ],
        [
            'manyWrite_Write_transaction. system scope does have access to transaction',
            { accessToken: manyWriteAccess, operation: 'transaction' },
            true,
        ],
        [
            'manyRead_withSpaceScope',
            {
                accessToken: manyReadAccessScopeSpaces,
                operation: 'vread',
                resourceType: 'Observation',
                id: '1',
                vid: '1',
            },
            false,
        ],
        [
            'manyWrite_Write_create',
            { accessToken: manyWriteAccess, operation: 'create', resourceType: 'Patient' },
            true,
        ],
        ['sys_read', { accessToken: allSysAccess, operation: 'read', resourceType: 'Patient', id: '12' }, true],
        ['sys_transaction', { accessToken: allSysAccess, operation: 'transaction' }, true],
        ['sys_history', { accessToken: allSysAccess, operation: 'history-system' }, true],
        ['sys_fakeType', { accessToken: allSysAccess, operation: 'create', resourceType: 'Fake' }, true],
    ];

    const authZHandler: SMARTHandler = new SMARTHandler(authZConfig, apiUrl, '4.0.1');
    test.each(arrayScopesCases)('CASE: %p', (_firstArg, request, isValid) => {
        mock.onGet(authZConfig.userInfoEndpoint).reply(200, patientIdentityWithoutScopes);
        if (!isValid) {
            return expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).rejects.toThrowError(
                UnauthorizedError,
            );
        }
        const identity = addScopeToUserIdentity(
            patientIdentityWithoutScopes,
            (<VerifyAccessTokenRequest>request).accessToken,
        );
        return expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).resolves.toEqual(identity);
    });
});

describe('verifyAccessToken; System level export requests', () => {
    const arrayScopesCases: (string | boolean | VerifyAccessTokenRequest)[][] = [
        [
            'Read and Write Access: initiate-export',
            {
                accessToken: practitionerUserAllAccess,
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'initiate-export' },
            },
            true,
        ],
        [
            'Read Access: initiate-export',
            {
                accessToken: practitionerUserReadAccess,
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'initiate-export' },
            },
            true,
        ],
        [
            'Read and Write Access: get-status-export',
            {
                accessToken: practitionerUserAllAccess,
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'get-status-export' },
            },
            true,
        ],
        [
            'Read and Write Access: cancel-export',
            {
                accessToken: practitionerUserAllAccess,
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'cancel-export' },
            },
            true,
        ],
        [
            'No User read access: initiate-export',
            {
                accessToken: manyReadAccess,
                operation: 'read',
                resourceType: '',
                bulkDataAuth: { exportType: 'system', operation: 'cancel-export' },
            },
            false,
        ],
    ];

    const authZHandler: SMARTHandler = new SMARTHandler(authZConfig, apiUrl, '4.0.1');
    test.each(arrayScopesCases)('CASE: %p', (_firstArg, request, isValid) => {
        mock.onGet(authZConfig.userInfoEndpoint).reply(200, practitionerIdentityWithoutScopes);
        if (!isValid) {
            return expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).rejects.toThrowError(
                UnauthorizedError,
            );
        }
        const identity = addScopeToUserIdentity(
            practitionerIdentityWithoutScopes,
            (<VerifyAccessTokenRequest>request).accessToken,
        );
        return expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).resolves.toEqual(identity);
    });
});

describe('verifyAccessToken; scopes are space delimited', () => {
    const spaceScopesCases: (string | boolean | VerifyAccessTokenRequest)[][] = [
        [
            'manyRead_Write',
            { accessToken: manyReadAccessScopeSpaces, operation: 'update', resourceType: 'Patient', id: '12' },
            false,
        ],
        [
            'manyRead_Read',
            {
                accessToken: manyReadAccessScopeSpaces,
                operation: 'vread',
                resourceType: 'Observation',
                id: '1',
                vid: '1',
            },
            true,
        ],
        [
            'manyRead_search',
            { accessToken: manyReadAccessScopeSpaces, operation: 'search-type', resourceType: 'Observation' },
            true,
        ],
        [
            'manyRead_launchScopeOnly',
            {
                accessToken: manyReadAccessScopeSpacesJustLaunch,
                operation: 'read',
                resourceType: 'Observation',
                id: '1',
            },
            true,
        ],
        [
            'manyRead_withArrayScope',
            { accessToken: manyReadAccess, operation: 'vread', resourceType: 'Observation', id: '1', vid: '1' },
            false,
        ],
    ];

    const authZHandler: SMARTHandler = new SMARTHandler(
        {
            ...authZConfig,
            scopeValueType: 'space',
        },
        apiUrl,
        '4.0.1',
    );

    test.each(spaceScopesCases)('CASE: %p', async (_firstArg, request, isValid) => {
        mock.onGet(authZConfig.userInfoEndpoint).reply(200, patientIdentityWithoutScopes);
        if (!isValid) {
            await expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).rejects.toThrowError(
                UnauthorizedError,
            );
        } else {
            const identity = addScopeToUserIdentity(
                patientIdentityWithoutScopes,
                (<VerifyAccessTokenRequest>request).accessToken,
            );
            await expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).resolves.toEqual(identity);
        }
    });
});

describe('verifyAccessToken; aud is in an array', () => {
    const arrayAUDCases: (string | boolean | VerifyAccessTokenRequest)[][] = [
        [
            'aud_not_in_array',
            { accessToken: audArrayWrongAccess, operation: 'search-type', resourceType: 'Observation' },
            false,
        ],
        [
            'aud_in_array',
            { accessToken: audArrayValidAccess, operation: 'search-type', resourceType: 'Observation' },
            true,
        ],
    ];

    const authZHandler: SMARTHandler = new SMARTHandler(
        {
            ...authZConfig,
            scopeValueType: 'array',
        },
        apiUrl,
        '4.0.1',
    );

    test.each(arrayAUDCases)('CASE: %p', async (_firstArg, request, isValid) => {
        mock.onGet(authZConfig.userInfoEndpoint).reply(200, patientIdentityWithoutScopes);
        if (!isValid) {
            await expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).rejects.toThrowError(
                UnauthorizedError,
            );
        } else {
            const identity = addScopeToUserIdentity(
                patientIdentityWithoutScopes,
                (<VerifyAccessTokenRequest>request).accessToken,
            );
            await expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).resolves.toEqual(identity);
        }
    });
});

describe("verifyAccessToken; AuthZ's userInfo interactions", () => {
    const apiCases: (string | boolean | VerifyAccessTokenRequest | number | any)[][] = [
        [
            '200; success',
            { accessToken: manyReadAccess, operation: 'search-type', resourceType: 'Observation' },
            200,
            patientIdentityWithoutScopes,
            true,
        ],
        [
            '202; success',
            { accessToken: manyWriteAccess, operation: 'create', resourceType: 'Patient' },
            202,
            patientIdentityWithoutScopes,
            true,
        ],
        [
            '4XX; failure',
            { accessToken: manyWriteAccess, operation: 'create', resourceType: 'Patient' },
            403,
            {},
            false,
        ],
        [
            '5XX; failure',
            { accessToken: manyWriteAccess, operation: 'create', resourceType: 'Patient' },
            500,
            {},
            false,
        ],
        [
            'Cannot find claim',
            { accessToken: allSysAccess, operation: 'read', resourceType: 'Patient', id: '12' },
            200,
            { stuff: '1234' },
            false,
        ],
        [
            'Claim regex does not match',
            { accessToken: allSysAccess, operation: 'read', resourceType: 'Patient', id: '12' },
            200,
            { [authZConfig.fhirUserClaimKey]: '1234' },
            false,
        ],
    ];

    const authZHandler: SMARTHandler = new SMARTHandler(authZConfig, apiUrl, '4.0.1');
    test.each(apiCases)('CASE: %p', async (_firstArg, request, authRespCode, authRespBody, isValid) => {
        mock.onGet(authZConfig.userInfoEndpoint).reply(<number>authRespCode, authRespBody);
        if (!isValid) {
            await expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).rejects.toThrowError(
                UnauthorizedError,
            );
        } else {
            const identity = addScopeToUserIdentity(authRespBody, (<VerifyAccessTokenRequest>request).accessToken);
            await expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>request)).resolves.toEqual(identity);
        }
    });
    test('CASE: network error', async () => {
        mock.onGet(authZConfig.userInfoEndpoint).networkError();
        await expect(authZHandler.verifyAccessToken(<VerifyAccessTokenRequest>apiCases[0][1])).rejects.toThrowError(
            UnauthorizedError,
        );
    });
});

function createEntry(resource: any, searchMode = 'match') {
    return {
        fullUrl: `http://url.org/${resource.resourceType}/${resource.id}`,
        resource,
        search: {
            mode: searchMode,
        },
    };
}
describe('authorizeAndFilterReadResponse', () => {
    const emptySearchResult = {
        resourceType: 'Bundle',
        id: '0694266b-9415-4a69-a6f1-43be974c2c46',
        meta: {
            lastUpdated: '2020-11-20T11:10:48.034+00:00',
        },
        type: 'searchset',
        link: [
            {
                relation: 'self',
                url: 'url.self',
            },
            {
                relation: 'next',
                url: 'url.next',
            },
        ],
        entry: [],
    };
    const searchAllEntitiesMatch = {
        ...emptySearchResult,
        entry: [createEntry(validPatient), createEntry(validPatientObservation), createEntry(validPatientEncounter)],
    };

    const searchSomeEntitiesMatch = {
        ...emptySearchResult,
        entry: [
            createEntry(validPatient),
            createEntry(validPatientObservation),
            createEntry({ ...validPatient, id: 'not-yours' }),
            createEntry({ ...validPatientObservation, subject: 'not-you' }),
            createEntry(validPatientEncounter),
        ],
    };
    const searchNoEntitiesMatch = {
        ...emptySearchResult,
        entry: [
            createEntry({ ...validPatient, id: 'not-yours' }),
            createEntry({ ...validPatientObservation, subject: 'not-you' }),
        ],
    };
    const cases: (string | ReadResponseAuthorizedRequest | boolean | any)[][] = [
        [
            'READ: Patient able to read own record',
            {
                userIdentity: patientIdentityWithoutScopes,
                operation: 'read',
                readResponse: validPatient,
            },
            true,
            validPatient,
        ],
        [
            'READ: Patient able to vread own Observation (uses absolute url)',
            {
                userIdentity: patientIdentityWithoutScopes,
                operation: 'vread',
                readResponse: validPatientObservation,
            },
            true,
            validPatientObservation,
        ],
        [
            'READ: Patient able to vread own Encounter (uses short-reference)',
            {
                userIdentity: patientIdentityWithoutScopes,
                operation: 'read',
                readResponse: validPatientEncounter,
            },
            true,
            validPatientEncounter,
        ],
        [
            'READ: Patient unable to vread non-owned Patient record',
            {
                userIdentity: patientIdentityWithoutScopes,
                operation: 'vread',
                readResponse: { ...validPatient, id: 'not-yours' },
            },
            false,
            {},
        ],
        [
            'READ: Patient unable to read non-direct Observation',
            {
                userIdentity: patientIdentityWithoutScopes,
                operation: 'read',
                readResponse: { ...validPatientObservation, subject: 'not-you' },
            },
            false,
            {},
        ],
        [
            'READ: Practitioner able to read Encounter',
            {
                userIdentity: practitionerIdentityWithoutScopes,
                operation: 'read',
                readResponse: validPatientEncounter,
            },
            true,
            validPatientEncounter,
        ],
        [
            'READ: Practitioner able to read unrelated Observation',
            {
                userIdentity: practitionerIdentityWithoutScopes,
                operation: 'read',
                readResponse: validPatientObservation,
            },
            true,
            validPatientObservation,
        ],
        [
            'READ: external Practitioner able to read Encounter',
            {
                userIdentity: externalPractitionerIdentityWithoutScopes,
                operation: 'read',
                readResponse: validPatientEncounter,
            },
            true,
            validPatientEncounter,
        ],
        [
            'READ: external Practitioner unable to read Observation',
            {
                userIdentity: externalPractitionerIdentityWithoutScopes,
                operation: 'read',
                readResponse: validPatientObservation,
            },
            false,
            {},
        ],
        [
            'SEARCH: Patient able to search for empty result',
            {
                userIdentity: patientIdentityWithoutScopes,
                operation: 'search-system',
                readResponse: emptySearchResult,
            },
            true,
            emptySearchResult,
        ],
        [
            'SEARCH: Patient able to search for own Observation & Patient record',
            {
                userIdentity: patientIdentityWithoutScopes,
                operation: 'search-type',
                readResponse: searchAllEntitiesMatch,
            },
            true,
            searchAllEntitiesMatch,
        ],
        [
            "SEARCH: Patient's history results are filtered to only contain valid entries",
            {
                userIdentity: patientIdentityWithoutScopes,
                operation: 'history-type',
                readResponse: searchSomeEntitiesMatch,
            },
            true,
            searchAllEntitiesMatch,
        ],
        [
            "SEARCH: Patient's history results are all filtered out",
            {
                userIdentity: patientIdentityWithoutScopes,
                operation: 'history-system',
                readResponse: searchNoEntitiesMatch,
            },
            true,
            emptySearchResult,
        ],
        [
            'SEARCH: external Practitioner able to search and filtered to just the encounter',
            {
                userIdentity: externalPractitionerIdentityWithoutScopes,
                operation: 'search-type',
                readResponse: searchAllEntitiesMatch,
            },
            true,
            { ...emptySearchResult, entry: [createEntry(validPatientEncounter)] },
        ],
        [
            'SEARCH: Practitioner able to search and get ALL results',
            {
                userIdentity: practitionerIdentityWithoutScopes,
                operation: 'search-type',
                readResponse: searchAllEntitiesMatch,
            },
            true,
            searchAllEntitiesMatch,
        ],
    ];

    const authZHandler: SMARTHandler = new SMARTHandler(authZConfig, apiUrl, '4.0.1');
    test.each(cases)('CASE: %p', async (_firstArg, request, isValid, respBody) => {
        if (!isValid) {
            await expect(
                authZHandler.authorizeAndFilterReadResponse(<ReadResponseAuthorizedRequest>request),
            ).rejects.toThrowError(UnauthorizedError);
        } else {
            await expect(
                authZHandler.authorizeAndFilterReadResponse(<ReadResponseAuthorizedRequest>request),
            ).resolves.toEqual(respBody);
        }
    });
});
describe('isWriteRequestAuthorized', () => {
    const cases: (string | WriteRequestAuthorizedRequest | boolean)[][] = [
        [
            'Patient unable to write own Encounter',
            {
                userIdentity: patientIdentityWithoutScopes,
                operation: 'create',
                resourceBody: validPatientEncounter,
            },
            false,
        ],
        [
            'Practitioner able to write Patient',
            {
                userIdentity: practitionerIdentityWithoutScopes,
                operation: 'vread',
                resourceBody: validPatient,
            },
            true,
        ],
        [
            'External practitioner unable to write Patient',
            {
                userIdentity: externalPractitionerIdentityWithoutScopes,
                operation: 'vread',
                resourceBody: validPatient,
            },
            false,
        ],
    ];

    const authZHandler: SMARTHandler = new SMARTHandler(authZConfig, apiUrl, '4.0.1');
    test.each(cases)('CASE: %p', async (_firstArg, request, isValid) => {
        if (!isValid) {
            await expect(
                authZHandler.isWriteRequestAuthorized(<WriteRequestAuthorizedRequest>request),
            ).rejects.toThrowError(UnauthorizedError);
        } else {
            await expect(
                authZHandler.isWriteRequestAuthorized(<WriteRequestAuthorizedRequest>request),
            ).resolves.not.toThrow();
        }
    });
});

describe('isAccessBulkDataJobAllowed', () => {
    const authZHandler: SMARTHandler = new SMARTHandler(authZConfig, apiUrl, '4.0.1');

    const cases: (string | AccessBulkDataJobRequest | boolean)[][] = [
        [
            'userIdentity and jobOwnerId match',
            {
                userIdentity: {
                    sub: 'abc',
                },
                jobOwnerId: 'abc',
            },
            true,
        ],
        [
            'userIdentity and jobOwnerId does NOT match',
            {
                userIdentity: {
                    sub: 'abc',
                },
                jobOwnerId: 'xyz',
            },
            false,
        ],
    ];

    test.each(cases)('CASE: %p', async (_firstArg, request, isValid) => {
        if (isValid) {
            await expect(
                authZHandler.isAccessBulkDataJobAllowed(<AccessBulkDataJobRequest>request),
            ).resolves.not.toThrow();
        } else {
            await expect(
                authZHandler.isAccessBulkDataJobAllowed(<AccessBulkDataJobRequest>request),
            ).rejects.toThrowError(
                new UnauthorizedError('User does not have permission to access this Bulk Data Export job'),
            );
        }
    });
});

describe('isBundleRequestAuthorized', () => {
    const authZConfigWithSearchTypeScope = clone(authZConfig);
    authZConfigWithSearchTypeScope.scopeRule.user.write = ['create'];
    const authZHandler: SMARTHandler = new SMARTHandler(authZConfigWithSearchTypeScope, apiUrl, '4.0.1');

    const cases: any[][] = [
        [
            'practitioner with user scope to create observation: no error',
            practitionerIdentityWithoutScopes,
            ['user/Observation.write'],
            true,
        ],
        [
            'practitioner without user scope to create observation: Unauthorized Error',
            practitionerIdentityWithoutScopes,
            ['user/Patient.write'],
            false,
        ],
        [
            'patient with user scope to create observation but is not in typesWithWriteAccess: Unauthorized Error',
            patientIdentityWithoutScopes,
            ['user/Observation.write'],
            false,
        ],
    ];
    test.each(cases)('CASE: %p', async (_firstArg, baseIdentity, scopes, isAuthorized) => {
        const userIdentity = clone(baseIdentity);
        userIdentity.scopes = scopes;
        const request: AuthorizationBundleRequest = {
            userIdentity,
            requests: [
                {
                    operation: 'create',
                    resource: {},
                    fullUrl: '',
                    resourceType: 'Observation',
                    id: '160265f7-e8c2-45ca-a1bc-317399e23549',
                },
            ],
        };

        if (!isAuthorized) {
            await expect(authZHandler.isBundleRequestAuthorized(request)).rejects.toThrowError(
                new UnauthorizedError('An entry within the Bundle is not authorized'),
            );
        } else {
            await expect(authZHandler.isBundleRequestAuthorized(request)).resolves.not.toThrow();
        }
    });

    test('Bundle request with first Bundle entry passing and second Bundle entry failing', async () => {
        const userIdentity = clone(practitionerIdentityWithoutScopes);
        // Requester has permission to write Observation but no permission to read Observation
        userIdentity.scopes = ['user/Observation.write'];
        const request: AuthorizationBundleRequest = {
            userIdentity,
            requests: [
                {
                    operation: 'create',
                    resource: {},
                    fullUrl: '',
                    resourceType: 'Observation',
                    id: '160265f7-e8c2-45ca-a1bc-317399e23549',
                },
                {
                    operation: 'read',
                    resource: {},
                    fullUrl: '',
                    resourceType: 'Observation',
                    id: 'fcfe413c-c62d-4097-9e31-02ff6ff523ad',
                },
            ],
        };

        await expect(authZHandler.isBundleRequestAuthorized(request)).rejects.toThrowError(
            new UnauthorizedError('An entry within the Bundle is not authorized'),
        );
    });
});

describe('getAllowedResourceTypesForOperation', () => {
    const authZConfigWithSearchTypeScope = clone(authZConfig);
    authZConfigWithSearchTypeScope.scopeRule.user.read = ['search-type'];
    authZConfigWithSearchTypeScope.scopeRule.user.write = [];

    const cases: (string | string[])[][] = [
        [
            'search-type operation: read scope: returns [Patient, Observation]',
            ['user/Patient.read', 'user/Observation.read'],
            'search-type',
            ['Patient', 'Observation'],
        ],
        // if there are duplicated scopeResourceType we return an array with the duplicates removed
        [
            'search-type operation: read scope: duplicated Observation scopeResourceType still returns [Patient, Observation]',
            ['user/Patient.read', 'patient/Observation.read', 'user/Observation.read'],
            'search-type',
            ['Patient', 'Observation'],
        ],
        // getAllowedResourceTypesForOperation returns an empty array because scopeRule user.write does not support any operations
        ['create operation: write scope: returns []', ['user/Patient.write', 'user/Observation.write'], 'created', []],
        // getAllowedResourceTypesForOperation returns an empty array because scopeRule user.read supports 'search-type' operation not 'vread'
        ['vread operation: read scope: returns []', ['user/Patient.read', 'user/Observation.read'], 'vread', []],
        // getAllowedResourceTypesForOperation returns BASE_R4_RESOURCES because resourceScopeType is '*'
        [
            'create operation: read scope: returns [BASE_R4_RESOURCES]',
            ['user/*.read'],
            'search-type',
            BASE_R4_RESOURCES,
        ],
    ];

    const authZHandler: SMARTHandler = new SMARTHandler(authZConfigWithSearchTypeScope, apiUrl, '4.0.1');
    test.each(cases)('CASE: %p', async (_firstArg, scopes, operation, expectedAllowedResources) => {
        const request: AllowedResourceTypesForOperationRequest = {
            userIdentity: {
                scopes,
            },
            operation: <TypeOperation | SystemOperation>operation,
        };

        await expect(authZHandler.getAllowedResourceTypesForOperation(request)).resolves.toEqual(
            expectedAllowedResources,
        );
    });
});

describe('getSearchFilterBasedOnIdentity', () => {
    const authZHandler: SMARTHandler = new SMARTHandler(authZConfig, apiUrl, '4.0.1');
    test('Patient identity', async () => {
        // BUILD
        const userIdentity = clone(patientIdentityWithoutScopes);
        const request: GetSearchFilterBasedOnIdentityRequest = {
            userIdentity,
            operation: 'search-type',
        };

        // OPERATE, CHECK
        const expectedFilter = [
            {
                key: '_reference',
                logicalOperator: 'OR',
                operator: '==',
                value: [patientId, `${apiUrl}${patientId}`],
            },
        ];
        await expect(authZHandler.getSearchFilterBasedOnIdentity(request)).resolves.toEqual(expectedFilter);
    });

    test('Practitioner identity', async () => {
        // BUILD
        const userIdentity = clone(practitionerIdentityWithoutScopes);
        const request: GetSearchFilterBasedOnIdentityRequest = {
            userIdentity,
            operation: 'search-type',
        };

        // OPERATE, CHECK
        const expectedFilter: [] = [];
        await expect(authZHandler.getSearchFilterBasedOnIdentity(request)).resolves.toEqual(expectedFilter);
    });
});
