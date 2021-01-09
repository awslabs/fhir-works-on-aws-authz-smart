import { UnauthorizedError } from 'fhir-works-on-aws-interface';

export const FHIR_USER_REGEX = /^(?<hostname>(http|https):\/\/([A-Za-z0-9\-\\.:%$_]*\/)+)(?<resourceType>Person|Practitioner|RelatedPerson|Patient)\/(?<id>[A-Za-z0-9\-.]+)$/;
export const FHIR_RESOURCE_REGEX = /(?<hostname>^(http|https):\/\/([A-Za-z0-9\-\\.:%$_]*\/)+)?(?<resourceType>[A-Z][a-zA-Z]+)\/(?<id>[A-Za-z0-9\-.]+)$/;

export interface FhirResource {
    hostname: string;
    resourceType: string;
    id: string;
}
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
        // eslint-disable-next-line prefer-const
        let { hostname, resourceType, id } = match.groups!;
        if (!hostname) {
            hostname = defaultHostname;
        }
        return { hostname, resourceType, id };
    }
    throw new UnauthorizedError('Resource is in the incorrect format');
}

function isLocalResourceInJsonAsReference(jsonStr: string, fhirUser: FhirResource): boolean {
    return (
        jsonStr.includes(`"reference":"${fhirUser.hostname}${fhirUser.resourceType}/${fhirUser.id}"`) ||
        jsonStr.includes(`"reference":"${fhirUser.resourceType}/${fhirUser.id}"`)
    );
}

export function authorizeResource(fhirResource: FhirResource, resource: any, apiUrl: string): boolean {
    const jsonStr = JSON.stringify(resource);
    const { hostname, resourceType, id } = fhirResource;
    if (hostname !== apiUrl) {
        // If requester is not from this FHIR Server they must be a fully qualified reference
        return jsonStr.includes(`"reference":"${hostname}${resourceType}/${id}"`);
    }
    if (resourceType === 'Practitioner') {
        return true;
    }
    if (resourceType === resource.resourceType) {
        // Attempting to look up its own record?
        return id === resource.id || isLocalResourceInJsonAsReference(jsonStr, fhirResource);
    }
    return isLocalResourceInJsonAsReference(jsonStr, fhirResource);
}
