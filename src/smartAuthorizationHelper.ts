import { KeyValueMap, UnauthorizedError } from 'fhir-works-on-aws-interface';
import { IdentityType } from './smartConfig';

export const FHIR_USER_REGEX = /^(?<hostname>(http|https):\/\/([A-Za-z0-9\-\\.:%$_]*\/)+)(?<resourceType>Person|Practitioner|RelatedPerson|Patient)\/(?<id>[A-Za-z0-9\-.]+)$/;

export interface FhirUser {
    hostname: string;
    resourceType: IdentityType;
    id: string;
}
export function getFhirUser(userIdentity: KeyValueMap, fhirUserClaimKey: string): FhirUser {
    const fhirUserValue = userIdentity[fhirUserClaimKey];
    const match = fhirUserValue.match(FHIR_USER_REGEX);
    if (match) {
        const { hostname, resourceType, id } = match.groups!;
        return { hostname, resourceType, id };
    }
    throw new UnauthorizedError("Requester's identity is in the incorrect format");
}

export function isLocalUserInJsonAsReference(jsonStr: string, fhirUser: FhirUser) {
    return (
        jsonStr.includes(`"reference":"${fhirUser.hostname}${fhirUser.resourceType}/${fhirUser.id}"`) ||
        jsonStr.includes(`"reference":"${fhirUser.resourceType}/${fhirUser.id}"`)
    );
}

export function authorizeResource(fhirUser: FhirUser, resource: any, apiUrl: string): boolean {
    const jsonStr = JSON.stringify(resource);
    if (fhirUser.hostname !== apiUrl) {
        // If requester is not from this FHIR Server they must be a fully qualified reference
        return jsonStr.includes(`"reference":"${fhirUser.hostname}${fhirUser.resourceType}/${fhirUser.id}"`);
    }
    if (fhirUser.resourceType === 'Practitioner') {
        return true;
    }
    if (fhirUser.resourceType === resource.resourceType) {
        // Attempting to look up its own record
        return fhirUser.id === resource.id || isLocalUserInJsonAsReference(jsonStr, fhirUser);
    }
    return isLocalUserInJsonAsReference(jsonStr, fhirUser);
}
