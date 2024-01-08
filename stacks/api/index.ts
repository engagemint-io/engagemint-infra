import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';

class ApiStack extends Stack {
    constructor(scope: Construct, name: string, props?: StackProps) {
        super(scope, name, props);

        // Define your API stack resources here
    }
}

export default ApiStack;
