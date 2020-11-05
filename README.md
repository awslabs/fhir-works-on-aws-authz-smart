# fhir-works-on-aws-authz-smart

## Purpose

Please visit [fhir-works-on-aws-deployment](https://github.com/awslabs/fhir-works-on-aws-deployment) for overall vision of the project and for more context.

This package is an implementation of the authorization interface from the [FHIR Works interface](https://github.com/awslabs/fhir-works-on-aws-interface). It uses the [SMART on FHIR specification](https://docs.smarthealthit.org/) to authorize users and what they request.

To use and deploy this component (with the other 'out of the box' components) please follow the overall [README](https://github.com/awslabs/fhir-works-on-aws-deployment)

## Infrastructure

This package assumes certain infrastructure:

- An [OAuth2](https://oauth.net/2/) [OpenID Connect](https://openid.net/connect/) authorization server already exists and is used as or in conjunction with an identity provider.
  - This server complies with the [SMART on FHIR specification](https://docs.smarthealthit.org/)
- The identity provider has a user claim (either `fhirUser` or `profile`) representing who this user is in context to this EHR.
  - For example if a user signs in and their `fhirUser` claim is `Patient/1234`. This means that Patient resource 1234 is the record of the signed in user.

## Usage

For usage please add this package to your `package.json` file and install as a dependency. For usage examples please see the deployment component's [package.json](https://github.com/awslabs/fhir-works-on-aws-deployment/blob/authz-smart/package.json)

### Configuration

This SMART implementation is meant to be flexible. It acheives this through the [SMARTConfig](./src/smartConfig.ts). This FHIR server knows the auhtorization server by the configuration defined as OauthStrategy in the [fhirConfig.ts](https://github.com/awslabs/fhir-works-on-aws-interface/blob/mainline/src/fhirConfig.ts).

### SMART on FHIR scope rules

Within the [SMARTConfig](./src/smartConfig.ts) you can see an example implementation of a ScopeRule. The ScopeRule lays what what operations a scope gives access to. For example for the `user/*.write` scope may give 'create' access but not 'update'.

For a working example please see [authZConfig.ts](https://github.com/awslabs/fhir-works-on-aws-deployment/blob/authz-smart/src/authZConfig.ts) in the deployment package

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
