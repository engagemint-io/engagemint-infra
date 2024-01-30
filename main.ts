import {App} from "aws-cdk-lib";
import EngageMintStack from "./stacks";

const app = new App();

console.log('INDEXER_GIT_HASH', process.env.INDEXER_GIT_HASH);
const defaultStackProps = { env: { region: process.env.AWS_REGION || 'us-west-2' } };

new EngageMintStack(app, "engagemint-stack", defaultStackProps);

app.synth();
