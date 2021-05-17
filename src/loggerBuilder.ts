import { makeLogger } from 'fhir-works-on-aws-interface';

const componentLogger = makeLogger({
    component: 'auth-smart',
});

export default function getComponentLogger(): any {
    return componentLogger;
}