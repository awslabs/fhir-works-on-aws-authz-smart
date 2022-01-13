/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { FhirVersion, UnauthorizedError } from 'fhir-works-on-aws-interface';
import jwksClient, { JwksClient, Headers } from 'jwks-rsa';
import { decode, verify } from 'jsonwebtoken';
import axios from 'axios';
import resourceReferencesMatrixV4 from './schema/fhirResourceReferencesMatrix.v4.0.1.json';
import resourceReferencesMatrixV3 from './schema/fhirResourceReferencesMatrix.v3.0.1.json';
import { FhirResource, IntrospectionOptions } from './smartConfig';
import getComponentLogger from './loggerBuilder';

export const FHIR_USER_REGEX =
    /^(?<hostname>(http|https):\/\/([A-Za-z0-9\-\\.:%$_/])+)\/(?<resourceType>Person|Practitioner|RelatedPerson|Patient)\/(?<id>[A-Za-z0-9\-.]+)$/;
export const FHIR_RESOURCE_REGEX =
    /^((?<hostname>(http|https):\/\/([A-Za-z0-9\-\\.:%$_/])+)\/)?(?<resourceType>[A-Z][a-zA-Z]+)\/(?<id>[A-Za-z0-9\-.]+)$/;

const GENERIC_ERR_MESSAGE = 'Invalid access token';

export function getFhirUser(fhirUserValue: string): FhirResource {
    const match = fhirUserValue.match(FHIR_USER_REGEX);
    if (match) {
        const { hostname, resourceType, id } = match.groups!;
        return { hostname, resourceType, id };
    }
    throw new UnauthorizedError("Requester's identity is in the incorrect format");
}
export function getFhirResource(resourceValue: string, defaultHostname: string): FhirResource {
    const match = resourceValue.match(FHIR_RESOURCE_REGEX);
    if (match) {
        const { resourceType, id } = match.groups!;
        const hostname = match.groups!.hostname ?? defaultHostname;
        return { hostname, resourceType, id };
    }
    throw new UnauthorizedError('Resource is in the incorrect format');
}

const logger = getComponentLogger();

// isRequestorReferenced(
// practitioner id
//     [`${resourceType}/${id}`, `${hostname}/${resourceType}/${id}`],
// practitioner
//     resourceType,
//     sourceResource,
//     fhirVersion,
// )
function isRequestorReferenced(
    requestorIds: string[],
    requestorResourceType: string,
    sourceResource: any,
    fhirVersion: FhirVersion,
): boolean {
    console.log('inside isRequestorReferenced function.');
    console.log(
        'requestorIds: ',
        requestorIds,
        'requestorResourceType: ',
        requestorResourceType,
        'sourceResource: ',
        sourceResource,
        'fhirVersion: ',
        fhirVersion,
    );
    const sourceResourceType = sourceResource.resourceType;

    // if patientOrgclaim exist : it is already checked in hasAccessToResource function
    // if sourceResourceType == 'DetectedIssue' and extention exist? and url = 'http://resmed.com/fhir/core/StructureDefinition/PatientOrganization' then select the valueReference
    // if valueReference.reference in requestorIds list
    // then return true

    if (sourceResourceType === 'DetectedIssue' && 'extension' in sourceResource) {
        console.log('DetectedIssue resource consist of extension');
        const result = sourceResource.extension.filter((obj: { url: string }) => {
            return obj.url === 'http://resmed.com/fhir/core/StructureDefinition/PatientOrganization';
        });

        if (result.length !==0 && requestorIds.includes(result[0].valueReference.reference)) {
            console.log('result: ', result);
            return true;
        }
    }

    let matrix: any;
    if (fhirVersion === '4.0.1') {
        matrix = resourceReferencesMatrixV4;
    } else if (fhirVersion === '3.0.1') {
        matrix = resourceReferencesMatrixV3;
    } else {
        throw new Error('Unsupported FHIR version detected');
    }
    let possiblePaths: string[] = [];
    //  detectedIssue resource and Patient resource
    if (matrix[sourceResourceType] && matrix[sourceResourceType][requestorResourceType]) {
        // ["patient"]
        possiblePaths = matrix[sourceResourceType][requestorResourceType];
    }

    console.log('possiblePaths: ', possiblePaths);
    console.log('sourceResource.extension: ', sourceResource.extension);
    console.log('sourceResource.extension[1]: ', sourceResource.extension[1]);
    console.log('sourceResource.extension[1].valueReference: ', sourceResource.extension[1].valueReference);

    // The paths within the FHIR resources may contain arrays so we must check if array at every level
    return possiblePaths.some((path) => {
        const pathComponents: string[] = path.split('.');
        let tempResource = sourceResource;
        let rootQueue = [];
        let nextQueue = [tempResource[pathComponents[0]]];
        for (let i = 1; i < pathComponents.length; i += 1) {
            rootQueue = nextQueue;
            nextQueue = [];

            while (rootQueue.length > 0) {
                tempResource = rootQueue.shift();
                if (tempResource) {
                    if (Array.isArray(tempResource)) {
                        // eslint-disable-next-line no-loop-func
                        tempResource.forEach((x) => {
                            nextQueue.push(x[pathComponents[i]]);
                        });
                    } else {
                        nextQueue.push(tempResource[pathComponents[i]]);
                    }
                }
            }
        }
        console.log('rootQueue: ', rootQueue);
        console.log('nextQueue: ', nextQueue);

        return nextQueue.flat().some((x) => {
            // x=patient, x.reference =  , requestorIds would be patientOrgsClaim or patientLaunchContext
            return x && x.reference && requestorIds.includes(x.reference);
        });
    });
}

// patientOrgsClaim, sourceResource, apiUrl, fhirVersion
// export function isPatientOrgClaimReferencedInDetectedIssue

// hasReferenceToResource(patientLaunchContext, sourceResource, apiUrl, fhirVersion)
export function hasReferenceToResource(
    requestorId: FhirResource,
    sourceResource: any,
    apiUrl: string,
    fhirVersion: FhirVersion,
): boolean {
    // add some logs to display.
    console.log('inside hasReferenceToResource function.');
    console.log('requestorId: ', requestorId, 'sourceResource: ', sourceResource);
    const { hostname, resourceType, id } = requestorId;
    if (hostname !== apiUrl) {
        // If requester is not from this FHIR Server they must be a fully qualified reference
        return isRequestorReferenced([`${hostname}/${resourceType}/${id}`], resourceType, sourceResource, fhirVersion);
    }

    return (
        // checking if the practiotioner id is equal to particular deletedIssue resource id
        (resourceType === sourceResource.resourceType && id === sourceResource.id) ||
        isRequestorReferenced(
            [`${resourceType}/${id}`, `${hostname}/${resourceType}/${id}`],
            resourceType,
            sourceResource,
            fhirVersion,
        )
    );
}

export function isFhirUserAdmin(fhirUser: FhirResource, adminAccessTypes: string[], apiUrl: string): boolean {
    console.log('inside isFhirUserAdmin function.');
    return apiUrl === fhirUser.hostname && adminAccessTypes.includes(fhirUser.resourceType);
}

/**
 * @param usableScopes this should be usableScope set from the `verifyAccessToken` method
 * @param resourceType the type of the resource we are trying to access
 * @returns if there is a usable system scope for this request
 */
export function hasSystemAccess(usableScopes: string[], resourceType: string): boolean {
    console.log('inside hasSystemAccess function.');
    return usableScopes.some(
        (scope: string) => scope.startsWith('system/*') || scope.startsWith(`system/${resourceType}`),
    );
}

export function hasAccessToResource(
    fhirUserObject: FhirResource,
    patientLaunchContext: FhirResource,

    patientOrgsClaim: FhirResource,

    sourceResource: any,
    usableScopes: string[],
    adminAccessTypes: string[],
    apiUrl: string,
    fhirVersion: FhirVersion,
): boolean {
    console.log('inside hasAccessToResource function.');
    console.log(
        'fhirUserObject: ',
        fhirUserObject,

        'patientLaunchContext: ',
        patientLaunchContext,
        'patientOrgsClaim: ',
        patientOrgsClaim,

        'sourceResource: ',
        sourceResource,
        'usableScopes: ',
        usableScopes,
        'adminAccessTypes: ',
        adminAccessTypes,
        'apiUrl: ',
        apiUrl,
        'fhirVersion: ',
        fhirVersion,
    );
    return (
        hasSystemAccess(usableScopes, sourceResource.resourceType) ||
        // (patientOrgsClaim && isPatientOrgClaimReferencedInDetectedIssue
        (patientOrgsClaim &&
            // isFhirUserAdmin(fhirUserObject, adminAccessTypes, apiUrl) &&
            hasReferenceToResource(patientOrgsClaim, sourceResource, apiUrl, fhirVersion)) ||
        (fhirUserObject &&
            (isFhirUserAdmin(fhirUserObject, adminAccessTypes, apiUrl) ||
                hasReferenceToResource(fhirUserObject, sourceResource, apiUrl, fhirVersion))) ||
        (patientLaunchContext && hasReferenceToResource(patientLaunchContext, sourceResource, apiUrl, fhirVersion))

        // or may be add (patientOrgsClaim && hasReferenceToResource(patientOrgsClaim, sourceResource, apiUrl, fhirVersion))
    );
}
export function getJwksClient(jwksUri: string, headers?: Headers): JwksClient {
    return jwksClient({
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 600000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        requestHeaders: headers,
        jwksUri,
    });
}

export function decodeJwtToken(token: string, expectedAudValue: string | RegExp, expectedIssValue: string) {
    const decodedAccessToken = decode(token, { complete: true });
    if (decodedAccessToken === null || typeof decodedAccessToken === 'string') {
        logger.warn('access_token could not be decoded into an object');
        throw new UnauthorizedError(GENERIC_ERR_MESSAGE);
    }

    const { aud, iss } = decodedAccessToken.payload;

    if (expectedIssValue !== iss) {
        logger.warn('access_token has unexpected `iss`');
        throw new UnauthorizedError(GENERIC_ERR_MESSAGE);
    }

    let audArray: string[] = [];
    if (aud) {
        if (typeof aud === 'string') {
            audArray = [aud];
        } else {
            audArray = aud;
        }
    }
    const audMatch: boolean = audArray.some(
        (audience: string) =>
            (typeof expectedAudValue === 'string' && expectedAudValue === audience) ||
            (expectedAudValue instanceof RegExp && expectedAudValue.test(audience)),
    );
    if (!audMatch) {
        logger.warn('access_token has unexpected `aud`');
        throw new UnauthorizedError(GENERIC_ERR_MESSAGE);
    }

    return decodedAccessToken;
}

export async function verifyJwtToken(
    token: string,
    expectedAudValue: string | RegExp,
    expectedIssValue: string,
    client: JwksClient,
) {
    const decodedAccessToken = decodeJwtToken(token, expectedAudValue, expectedIssValue);
    const { kid } = decodedAccessToken.header;
    if (!kid) {
        logger.warn('JWT verification failed. JWT "kid" attribute is required in the header');
        throw new UnauthorizedError(GENERIC_ERR_MESSAGE);
    }

    try {
        const key = await client.getSigningKeyAsync(kid);
        return verify(token, key.getPublicKey(), { audience: expectedAudValue, issuer: expectedIssValue });
    } catch (e) {
        logger.warn((e as any).message);
        throw new UnauthorizedError(GENERIC_ERR_MESSAGE);
    }
}

export async function introspectJwtToken(
    token: string,
    expectedAudValue: string | RegExp,
    expectedIssValue: string,
    introspectionOptions: IntrospectionOptions,
) {
    // used to verify if `iss` or `aud` is valid
    const decodedTokenPayload = decodeJwtToken(token, expectedAudValue, expectedIssValue).payload;
    const { introspectUrl, clientId, clientSecret } = introspectionOptions;

    // setup basic authentication
    const username = clientId;
    const password = clientSecret;
    const auth = `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;

    try {
        const response = await axios.post(introspectUrl, `token=${token}`, {
            headers: {
                'content-type': 'application/x-www-form-urlencoded',
                accept: 'application/json',
                authorization: auth,
                'cache-control': 'no-cache',
            },
        });
        if (!response.data.active) {
            throw new UnauthorizedError(GENERIC_ERR_MESSAGE);
        }
        return decodedTokenPayload;
    } catch (e) {
        if (axios.isAxiosError(e)) {
            if (e.response) {
                logger.warn(`Status received from introspection call: ${e.response.status}`);
                logger.warn(e.response.data);
            }
        } else {
            logger.warn((e as any).message);
        }
        throw new UnauthorizedError(GENERIC_ERR_MESSAGE);
    }
}
