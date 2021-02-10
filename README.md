# fhir-works-on-aws-authz-smart

## Purpose

Please visit [fhir-works-on-aws-deployment `smart-mainline` branch](https://github.com/awslabs/fhir-works-on-aws-deployment/tree/smart-mainline) for overall vision of the project and for more context.

This package is an implementation of the authorization interface from the [FHIR Works interface](https://github.com/awslabs/fhir-works-on-aws-interface/blob/mainline/src/authorization.ts). It uses the [SMART on FHIR specification](https://docs.smarthealthit.org/) to authorize users and what they request. Requests are authorized by if the requestor or the patient in context is [**referenced**](https://www.hl7.org/fhir/references.html) in the resource in question.

To use and deploy this component (with the other 'out of the box' components) please follow the overall [README](https://github.com/awslabs/fhir-works-on-aws-deployment/tree/smart-mainline)

## Assumptions

This package assumes certain aspects:

- An [OAuth2](https://oauth.net/2/) [OpenID Connect](https://openid.net/connect/) authorization server already exists and is used as or in conjunction with an identity provider.
  - The OAuth2 server complies with the [SMART on FHIR specification](https://docs.smarthealthit.org/)
  - The OAuth2 server has a JSON Web Key Set endpoint used to get the key for verifying incoming access_token
- The identity provider has a user claim (either `fhirUser` or `profile`) representing who this user is in context to this FHIR server. This user must be represented by a fully qualified url in the claim.
  - As an example the `fhirUser` claim should look like: `https://www.fhir.com/Patient/1234`
  - When using `user` scopes it is assumed that the `fhirUser` will be in the access_token to determine who the requestor is
- [`launch` scopes and contextual request](http://www.hl7.org/fhir/smart-app-launch/scopes-and-launch-context/#scopes-for-requesting-context-data) will be handled by the authorization server. 
- Once launch context is given to the authorization server it will be included with a `patient` scope and the Patient's resourceType and id in the `launch_response_patient` claim within the access_token.
  - As an example the `launch_response_patient` claim should look like: `Patient/id`

## Authorization

This packages uses SMART scopes and the references found in the resources as a way to determine access.

### Scopes

This resource server supports [SMART's clinical scopes](http://www.hl7.org/fhir/smart-app-launch/scopes-and-launch-context/#clinical-scope-syntax). There are some assumptions made on the Authorization server and Resource server (this package) relationship:

- For `patient` scopes there must be a `launch_response_patient` claim in the access_token
- For `user` scopes there must be a `fhirUser` claim in the access_token
- The access modifiers `read` and `write` will follow the [SMARTConfig](./src/smartConfig.ts) given

### Attribute Based Access Control (ABAC)

This implementation of the SMART on FHIR specification uses attribute based access control. Access to a resource is given if any of the following are true:

- is the fhirUser making the request considered an Admin (default configuration makes a Practitioner an admin)
- is the fhirUser making the request or the patient in context looking up their own resource (verified via the `resourceType` and `id`)
- is the fhirUser making the request or the patient in context referenced in the resource they are taking action on

What we mean by 'referenced in the resource' is the `reference` fields found in resources. As an illustrative example see the below resource. We can say that the below Patient resource is accessible by:

- Admins of the system
- Patient/example: via resourceType and id check
- Patient/diffPatient: since it is referenced in the `link` field
- Practitioner/DrBell: since it is referenced in the `generalPractitioner` field

```json
{
  "resourceType": "Patient",
  "id": "example",
  "generalPractitioner": [
    {
      "reference": "Practitioner/DrBell"
    }
  ],
  "link": [
    {
      "type": "seealso",
      "other": {
        "reference": "Patient/diffPatient"
      }
    }
  ],
  "address": [
    {
      "period": {
        "start": "1974-12-25"
      },
      "city": "London",
      "use": "home",
      "line": ["221b Baker St"],
      "district": "Marylebone",
      "postalCode": "6XE",
      "text": "221b Baker St, Marylebone, London NW1 6XE, United Kingdom",
      "type": "both"
    }
  ],
  "deceasedBoolean": false,
  "name": [
    {
      "family": "Holmes",
      "given": ["Sherlock"],
      "use": "official"
    }
  ],
  "gender": "male",
  "active": true
}
```

## Usage

For usage please add this package to your `package.json` file and install as a dependency. For usage examples please see the deployment component's [package.json](https://github.com/awslabs/fhir-works-on-aws-deployment/blob/smart-mainline/package.json)

### Configuration

This SMART implementation is meant to be flexible. It achieves this through the [SMARTConfig](./src/smartConfig.ts). This FHIR server knows the authorization server's jwks endpoint by the configuration passed in.

### SMART on FHIR scope rules

Within the [SMARTConfig](./src/smartConfig.ts) you can see an example implementation of a ScopeRule. The ScopeRule lays what operations a scope gives access to. For example for the `user/*.write` scope may give 'create' access but not 'update'.

For a working example please see [authZConfig.ts](https://github.com/awslabs/fhir-works-on-aws-deployment/blob/smart-mainline/src/authZConfig.ts) in the deployment package

## Dependency tree

This package is dependent on:

- [interface component](https://github.com/awslabs/fhir-works-on-aws-interface)
  - This package defines the interface we are trying to use

## Known issues

For known issues please track the issues on the GitHub repository

## Security

See [CONTRIBUTING](CONTRIBUTING.md#security-issue-notifications) for more information.

## License

This project is licensed under the Apache-2.0 License.
