# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [2.2.0](https://github.com/awslabs/fhir-works-on-aws-authz-smart/compare/v2.1.1...v2.2.0) (2021-08-17)


### Features

* use fhirServiceBaseUrl from requests if present ([#50](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/50)) ([31f951a](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/31f951a660b4f9f4f4ad52b95670063f175868b2)), closes [#45](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/45)

### [2.1.1](https://github.com/awslabs/fhir-works-on-aws-authz-smart/compare/v2.1.0...v2.1.1) (2021-08-16)


### Bug Fixes

* Correctly pass params in url for introspect jwt flow ([#48](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/48)) ([d67b693](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/d67b6932f5a1a0bbe6c340bd340bc2351068adbf))

## [2.1.0](https://github.com/awslabs/fhir-works-on-aws-authz-smart/compare/v2.0.0...v2.1.0) (2021-07-23)


### Features

* allow regex in SMARTConfig.expectedAudValue ([#43](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/43)) ([2442856](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/244285606d70d7bed1a37a6bc19d32063af036ec))
* allow token introspection as an authz option ([#44](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/44)) ([f123621](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/f123621a4f65819f89e161ec3fbba1ac46301f41))


### Bug Fixes

* support system scope ([#46](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/46)) ([7ae2f49](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/7ae2f49cd20e933e45d40b9e518b8ec72c3d61b6))

## [2.0.0](https://github.com/awslabs/fhir-works-on-aws-authz-smart/compare/v1.0.1...v2.0.0) (2021-06-24)

### ⚠ BREAKING CHANGES

* Renamed `fhirUserClaimKey` to `fhirUserClaimPath` and `launchContextKeyPrefix` to `launchContextPathPrefix` in `SMARTConfig`
* You must now define how you want to handle the `system` scope found in ScopeRule

### Features

- Add support for `system` scope ([#41](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/41)) ([2229ce8](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/2229ce8a7c3cc4398756628e8cff68c488db6a5c))
- Allow paths for fhirUser and launch claims ([#40](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/40)) ([332806d](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/332806dbeff80c929f36b01c699cf0dac65cea01))

### [1.0.1](https://github.com/awslabs/fhir-works-on-aws-authz-smart/compare/v1.0.0...v1.0.1) (2021-05-18)

## [1.0.0](https://github.com/awslabs/fhir-works-on-aws-authz-smart/compare/v0.1.3...v1.0.0) (2021-02-12)

- Major version bump! :rocket:

### [0.1.3](https://github.com/awslabs/fhir-works-on-aws-authz-smart/compare/v0.1.2...v0.1.3) (2021-02-11)

### Features

- make reference checking more restrictive and abide by FHIR ([#22](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/22)) ([ca3d574](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/ca3d5740bf1d229eb92ec4f5795dede96d1671ae))
- make smartHandler more configurable ([#24](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/24)) ([503ef8a](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/503ef8a3a34ad2b4e65765292273e341cb493b0a))

### [0.1.2](https://github.com/awslabs/fhir-works-on-aws-authz-smart/compare/v0.1.0...v0.1.2) (2021-01-27)

### Bug Fixes

- correctly name references ([#19](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/19)) ([8564ff2](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/8564ff2529c9fff9091b375c9c15e0df4ddfefcf))
- interface update; Add id to search filter ([#20](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/20)) ([a04b375](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/a04b375bcf43b5958baa846c533fb0c5ca62485e))

### [0.1.1](https://github.com/awslabs/fhir-works-on-aws-authz-smart/compare/v0.1.0...v0.1.1) (2021-01-20)

#### Fixes

- chore: change REGEX hostname not to include `/`

### 0.1.0 (2021-01-14)

#### Features

- Begin implementation of SMART on FHIR ([#1](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/1)) ([4f07589](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/4f075893da0b6a49a96acb054ea5fd21401c6046))
- Support string array in OAuth aud claim and add new test cases ([#2](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/2)) ([8273f16](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/8273f1624531488cf47c470b6918d6e58b2bbdec))
- Implement new interface ([#4](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/4)) ([a41cdc6](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/a41cdc681b60143fd6c4dd977789bb5ceaf51886)), closes [#5](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/5)
- Add support for GetSearchFilterBasedOnIdentity ([#9](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/9)) ([ce1a489](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/ce1a48994146d20ab4efac633d3d4db5f14ec201))
- Implement patient scope; remove system & launch scopes ([#13](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/13)) ([cc9cbb2](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/cc9cbb24304e88dd777d1610c7da32cf389e42bf))
- Validate JWT token using public jwks ([#14](https://github.com/awslabs/fhir-works-on-aws-authz-smart/issues/14)) ([8e577a8](https://github.com/awslabs/fhir-works-on-aws-authz-smart/commit/8e577a83d0da907c8eb7401113283162b7525900))

### [0.0.1] - 2020-11-06

#### Added

- Initial launch! :rocket:
