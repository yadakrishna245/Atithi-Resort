#!/usr/bin/env node
import * as cdk from 'aws-cdk-lib';
import { AtithiPlatformStack } from '../lib/platform-stack';
import { AtithiWebStack } from '../lib/web-stack';

const app = new cdk.App();

const stage = app.node.tryGetContext('stage') ?? process.env['STAGE'] ?? 'dev';

/**
 * ap-south-1 (Mumbai) is the primary region: lowest latency to Indian users
 * and keeps personal data in India, as committed in docs/11.
 */
const env: cdk.Environment = {
  account: process.env['CDK_DEFAULT_ACCOUNT'],
  region: process.env['CDK_DEFAULT_REGION'] ?? 'ap-south-1',
};

const platform = new AtithiPlatformStack(app, `AtithiPlatform-${stage}`, {
  env,
  stage,
  description: 'Atithi: data, auth and API (DynamoDB, Cognito, Lambda, HTTP API)',
});

/**
 * CloudFront certificates must live in us-east-1, so the web stack is
 * cross-region-enabled. Without a custom domain it deploys in the main region.
 */
new AtithiWebStack(app, `AtithiWeb-${stage}`, {
  env,
  stage,
  apiUrl: platform.apiUrl,
  userPoolId: platform.userPoolId,
  userPoolClientId: platform.userPoolClientId,
  crossRegionReferences: true,
  description: 'Atithi: static web app (S3 + CloudFront)',
});

cdk.Tags.of(app).add('Project', 'Atithi');
cdk.Tags.of(app).add('Stage', stage);
cdk.Tags.of(app).add('ManagedBy', 'CDK');

app.synth();
