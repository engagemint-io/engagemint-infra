import {aws_dynamodb as dynamodb, Duration, Stack, StackProps} from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as events from 'aws-cdk-lib/aws-events';
import * as apigatewayv2 from 'aws-cdk-lib/aws-apigatewayv2';
import * as apigatewayv2integrations from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import { aws_s3 as s3 } from 'aws-cdk-lib';
import * as iam from "aws-cdk-lib/aws-iam";
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

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
            sortKey: { name: 'user_account_id', type: dynamodb.AttributeType.STRING },
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

        lambdaRole.addManagedPolicy(iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AWSLambdaBasicExecutionRole'));

        // Attach the DynamoDB access policy to the role
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ['dynamodb:Query', 'dynamodb:Scan', 'dynamodb:Query', 'dynamodb:GetItem', 'dynamodb:PutItem', 'dynamodb:DescribeTable', 'dynamodb:CreateItem', 'dynamodb:UpdateItem', 'dynamodb:DeleteItem', 'dynamodb:BatchWriteItem'],
            resources: [registeredUsersTable.tableArn, epochLeaderboardTable.tableArn, projectConfigurationTable.tableArn],
        }));

        // Add Secrets Manager permissions
        lambdaRole.addToPolicy(new iam.PolicyStatement({
            actions: ['secretsmanager:GetSecretValue'],
            resources: ['arn:aws:secretsmanager:us-west-2:189176372795:secret:engagemint-x-credentials-KPhnTp'],
        }));

        // Define the Lambda function
        const lambdaFunction = new lambda.Function(this, 'EngageMintIndexerFunction', {
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

        //MARK: HTTP API Gateway V2

        // Define the Lambda function for the API
        const apiLambda = new lambda.Function(this, 'ApiLambdaHandler', {
            runtime: lambda.Runtime.NODEJS_18_X,
            functionName: 'engagemint-api-handler',
            code: lambda.Code.fromBucket(bucket, `infra/api/${process.env.API_GIT_HASH}.zip`),
            handler: 'buildApi/handler.handler',
            role: lambdaRole,
        });

        // Create the HTTP API Gateway
        const httpApi = new apigatewayv2.HttpApi(this, 'EngageMintHttpApi', {
            apiName: 'EngageMintHttpApi',
            description: "HTTP API for EngageMint Service",
            createDefaultStage: true,
        });

        // Add a single route to any route with ANY method
        httpApi.addRoutes({
            path: '/{proxy+}',
            methods: [apigatewayv2.HttpMethod.ANY],
            integration: new apigatewayv2integrations.HttpLambdaIntegration('EngageMintLambdaIntegration', apiLambda),
        });

        // MARK: DNS Settings

        // Define the domain name
        const DOMAIN_NAME = 'api.engagemint.io';
        const HOSTED_ZONE_ID = 'Z027969021D985X3AZJAI';

        const hostedZone = route53.HostedZone.fromHostedZoneAttributes(this, 'EngageMintHostedZone', {
            hostedZoneId: HOSTED_ZONE_ID,
            zoneName: 'engagemint.io',
        });

        // Create a TLS certificate
        const certificate = new acm.Certificate(this, 'EngageMintApiCertificate', {
            domainName: DOMAIN_NAME,
            validation: acm.CertificateValidation.fromDns(hostedZone),
        });

        // Create a custom domain for the API Gateway
        const apiDomainName = new apigatewayv2.DomainName(this, 'EngageMintApiDomainName', {
            domainName: DOMAIN_NAME,
            certificate: certificate,
        });

        // Associate the domain name with the HTTP API
        new apigatewayv2.ApiMapping(this, 'EngageMintApiMapping', {
            api: httpApi,
            domainName: apiDomainName,
            stage: httpApi.defaultStage,
        });

        // Create a Route 53 A record to point to the API Gateway custom domain
        new route53.ARecord(this, 'EngageMintApiDomainAliasRecord', {
            zone: hostedZone,
            target: route53.RecordTarget.fromAlias(new route53targets.ApiGatewayv2DomainProperties(
                apiDomainName.regionalDomainName,
                apiDomainName.regionalHostedZoneId
            )),
            recordName: DOMAIN_NAME,
        });

    }
}

export default EngageMintStack;
