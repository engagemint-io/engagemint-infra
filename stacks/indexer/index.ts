import {Duration, Stack, StackProps} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { aws_s3 as s3 } from 'aws-cdk-lib';

class IndexerStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Query for bucket where lambda code is stored
        const bucket = s3.Bucket.fromBucketName(this, 'EngageMintBucket', 'engagemint');

        // Define the Lambda function
        const lambdaFunction = new lambda.Function(this, 'IndexerFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            functionName: 'engagemint-indexer',
            code: lambda.Code.fromBucket(bucket, 'infra/indexer/lambda.zip'),
            handler: 'lambda/handler.handler',
            timeout: Duration.minutes(15),
        });

        // Define the cron schedule - e.g., every 12 hours
        const schedule = events.Schedule.expression('cron(0 */12 * * ? *)');

        // Define the event rule to trigger the Lambda
        new events.Rule(this, 'Rule', {
            schedule: schedule,
            ruleName: 'engagemint-indexer-rule',
            targets: [new targets.LambdaFunction(lambdaFunction)],
        });
    }
}

export default IndexerStack;
