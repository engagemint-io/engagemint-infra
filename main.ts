import {ApiStack, DynamoDBStack, IndexerStack} from "./stacks";
import {App} from "aws-cdk-lib";

const app = new App();

const defaultStackProps = { env: { region: process.env.AWS_REGION } };

new DynamoDBStack(app, "engagemint-dynamodb-stack", defaultStackProps);
new ApiStack(app, "engagemint-api-stack", defaultStackProps);
new IndexerStack(app, "engagemint-indexer-stack", defaultStackProps);

app.synth();
