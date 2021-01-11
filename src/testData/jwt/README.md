The files in this directory are used to create JWT and verify JWT. JWT are needed for testing the method `verifyJwtToken` inside of the file `smartScopeHelper.ts`


You can use `testPrivateKey.pem` to sign a JWT.

You can then use `publicJwks.json` to validate the JWT that was signed by the correct private key.

Example code to sign a JWT


```
const jwt = require('jsonwebtoken');
const fs = require('fs');

const privateKey = fs.readFileSync('testPrivateKey.pem');
var token = jwt.sign({
  "ver": 1,
  "jti": "AT.6a7kncTCpu1X9eo2QhH1z_WLUK4TyV43n_9I6kZNwPY",
  "iss": "https://exampleAuthServer.com/oauth2",
  "aud": "api://default",
  "iat": Math.floor(Date.now() / 1000),
  "exp": Math.floor(Date.now() /1000) + 1,
  "cid": "0oa8muazKSyk9gP5y5d5",
  "uid": "00u85ozwjjWRd17PB5d5",
  "scp": [
    "fhirUser",
    "openid",
    "profile",
    "launch/encounter",
    "patient/Patient.read",
  ],
  "sub": "test@test.com",
  "fhirUser": "Practitioner/1234"
}, privateKey, {algorithm: 'RS256', header: {kid: 'abcd1234', alg: 'RS256'}});

console.log(token);
```