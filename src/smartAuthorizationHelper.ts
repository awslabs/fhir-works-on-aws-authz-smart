/*
 *  Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *  SPDX-License-Identifier: Apache-2.0
 */
import { FhirVersion, UnauthorizedError } from 'fhir-works-on-aws-interface';
import jwksClient, { JwksClient } from 'jwks-rsa';
import { decode, verify } from 'jsonwebtoken';
import resourceReferencesMatrixV4 from './schema/fhirResourceReferencesMatrix.v4.0.1.json';
import resourceReferencesMatrixV3 from './schema/fhirResourceReferencesMatrix.v3.0.1.json';
import { FhirResource } from './smartConfig';
import getComponentLogger from './loggerBuilder';

export const FHIR_USER_REGEX = /^(?<hostname>(http|https):\/\/([A-Za-z0-9\-\\.:%$_/])+)\/(?<resourceType>Person|Practitioner|RelatedPerson|Patient)\/(?<id>[A-Za-z0-9\-.]+)$/;
export const FHIR_RESOURCE_REGEX = /^((?<hostname>(http|https):\/\/([A-Za-z0-9\-\\.:%$_/])+)\/)?(?<resourceType>[A-Z][a-zA-Z]+)\/(?<id>[A-Za-z0-9\-.]+)$/;

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

function isRequestorReferenced(
    requestorIds: string[],
    requestorResourceType: string,
    sourceResource: any,
    fhirVersion: FhirVersion,
): boolean {
    const sourceResourceType = sourceResource.resourceType;
    let matrix: any;
    if (fhirVersion === '4.0.1') {
        matrix = resourceReferencesMatrixV4;
    } else if (fhirVersion === '3.0.1') {
        matrix = resourceReferencesMatrixV3;
    } else {
        throw new Error('Unsupported FHIR version detected');
    }
    let possiblePaths: string[] = [];
    if (matrix[sourceResourceType] && matrix[sourceResourceType][requestorResourceType]) {
        possiblePaths = matrix[sourceResourceType][requestorResourceType];
    }

    // The paths within the FHIR resources may contain arrays so we must check if array at every level
    return possiblePaths.some(path => {
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
                        tempResource.forEach(x => {
                            nextQueue.push(x[pathComponents[i]]);
                        });
                    } else {
                        nextQueue.push(tempResource[pathComponents[i]]);
                    }
                }
            }
        }
        return nextQueue.flat().some(x => {
            return x && x.reference && requestorIds.includes(x.reference);
        });
    });
}

export function hasReferenceToResource(
    requestorId: FhirResource,
    sourceResource: any,
    apiUrl: string,
    fhirVersion: FhirVersion,
): boolean {
    const { hostname, resourceType, id } = requestorId;
    if (hostname !== apiUrl) {
        // If requester is not from this FHIR Server they must be a fully qualified reference
        return isRequestorReferenced([`${hostname}/${resourceType}/${id}`], resourceType, sourceResource, fhirVersion);
    }

    return (
        (resourceType === sourceResource.resourceType && id === sourceResource.id) ||
        isRequestorReferenced(
            [`${resourceType}/${id}`, `${hostname}/${resourceType}/${id}`],
            resourceType,
            sourceResource,
            fhirVersion,
        )
    );
}

export function getJwksClient(jwksUri: string): JwksClient {
    return jwksClient({
        cache: true,
        cacheMaxEntries: 5,
        cacheMaxAge: 600000,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri,
    });
}

export async function verifyJwtToken(
    token: string,
    expectedAudValue: string | RegExp,
    expectedIssValue: string,
    client: JwksClient,
) {
    const genericErrorMessage = 'Invalid access token';
    const decodedAccessToken = decode(token, { complete: true });
    if (decodedAccessToken === null || typeof decodedAccessToken === 'string') {
        logger.error('access_token could not be decoded into an object');
        throw new UnauthorizedError(genericErrorMessage);
    }
    const { kid } = decodedAccessToken.header;
    if (!kid) {
        logger.error('JWT verification failed. JWT "kid" attribute is required in the header');
        throw new UnauthorizedError(genericErrorMessage);
    }

    try {
        const key = await client.getSigningKeyAsync(kid);
        return verify(token, key.getPublicKey(), { audience: expectedAudValue, issuer: expectedIssValue });
    } catch (e) {
        logger.error(e.message);
        throw new UnauthorizedError(genericErrorMessage);
    }
}
