import { Stack, StackProps } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { aws_dynamodb as dynamodb } from 'aws-cdk-lib';

class DynamoDBStack extends Stack {
    constructor(scope: Construct, name: string, _props?: StackProps) {
        super(scope, name, _props);

        const table = new dynamodb.Table(this, 'RegisteredUsersTable', {
            partitionKey: { name: 'twitter_id', type: dynamodb.AttributeType.STRING },
            sortKey: { name: 'ticker', type: dynamodb.AttributeType.STRING },
            tableName: 'registered_users_table',
            billingMode: dynamodb.BillingMode.PAY_PER_REQUEST, // or PROVISIONED
        });

        // Adding a Global Secondary Index (GSI)
        table.addGlobalSecondaryIndex({
            indexName: 'seiWalletAddressIndex',
            partitionKey: { name: 'sei_wallet_address', type: dynamodb.AttributeType.STRING },
            // Optional, add sort key for GSI
            // sortKey: { name: 'yourSortKeyName', type: dynamodb.AttributeType.STRING },
            projectionType: dynamodb.ProjectionType.ALL
        });

    }
}

export default DynamoDBStack;
