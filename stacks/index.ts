import {aws_dynamodb as dynamodb, Duration, Stack, StackProps} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import * as iam from "aws-cdk-lib/aws-iam";

class EngageMintStack extends Stack {
    constructor(scope: Construct, id: string, props?: StackProps) {
        super(scope, id, props);

        // Create the Registered Users Table
        const registeredUsersTable = new dynamodb.Table(this, 'EngageMintRegisteredUsersTable', {
            partitionKey: { name: 'ticker', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'twitter_id', type: dynamodb.AttributeType.STRING },
            tableName: 'engagemint-registered_users_table',
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // or PROVISIONED
        });

        // Adding a Global Secondary Index (GSI)
        registeredUsersTable.addGlobalSecondaryIndex({
            indexName: 'seiWalletAddressIndex',
            partitionKey: { name: 'sei_wallet_address', type: dynamodb.AttributeType.STRING },
            // Optional, add sort key for GSI
            // sortKey: { name: 'yourSortKeyName', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL
        });

        // Create the Project Configuration Table
        const projectConfigurationTable = new dynamodb.Table(this, 'EngageMintProjectConfigurationTable', {
            partitionKey: { name: 'ticker', type: dynamodb.AttributeType.STRING },
            tableName: 'engagemint-project_configuration_table',
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        });

        // Create the Epoch Leaderboard Table
        const epochLeaderboardTable = new dynamodb.Table(this, 'EpochLeaderboardTable', {
            partitionKey: { name: 'ticker_epoch_composite', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'total_points', type: dynamodb.AttributeType.NUMBER },
            tableName: 'engagemint-epoch_leaderboard_table',
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
        });

        // Adding a Global Secondary Index (GSI) for user_account_id
        epochLeaderboardTable.addGlobalSecondaryIndex({
            indexName: 'UserAccountIdIndex',
            partitionKey: { name: 'user_account_id', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL
        });

        // Query for bucket where lambda code is stored
        const bucket = s3.Bucket.fromBucketName(this, 'EngageMintBucket', 'engagemint');

        // Define an IAM role for the Lambda function
        const lambdaRole = new iam.Role(this, 'EngageMintIndexerLambdaExecutionRole', {
            assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        });

        // Attach the DynamoDB access policy to the role
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ['dynamodb:Query', 'dynamodb:Scan', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem'],
            resources: [registeredUsersTable.tableArn, epochLeaderboardTable.tableArn, projectConfigurationTable.tableArn],
        }));

        // Define the Lambda function
        const lambdaFunction = new lambda.Function(this, 'IndexerFunction', {
            runtime: lambda.Runtime.NODEJS_18_X,
            functionName: 'engagemint-indexer',
            code: lambda.Code.fromBucket(bucket, `infra/indexer/${process.env.INDEXER_GIT_HASH}.zip`),
            handler: 'lambda/handler.handler',
            timeout: Duration.minutes(15),
            role: lambdaRole,
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

export default EngageMintStack;
