import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as apigwv2 from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as path from 'node:path';

const BACKEND_SRC = path.join(__dirname, '..', '..', 'backend', 'src');

export interface AtithiPlatformStackProps extends cdk.StackProps {
  stage: string;
}

/**
 * Cost posture of this stack (the brief was "serverless, low cost"):
 *   - No VPC and no NAT Gateway — NAT alone would be ~₹3,000/month idle.
 *   - HTTP API instead of REST API — roughly 70% cheaper per million calls.
 *   - DynamoDB on-demand — pay per request, zero idle cost.
 *   - ARM64 (Graviton) Lambdas — ~20% cheaper than x86 at the same speed.
 *   - Short log retention — CloudWatch Logs is a common silent cost sink.
 *   - Public reads cached at CloudFront so they never reach Lambda twice.
 *
 * At low traffic this sits almost entirely inside the AWS free tier.
 */
export class AtithiPlatformStack extends cdk.Stack {
  readonly apiUrl: string;
  readonly userPoolId: string;
  readonly userPoolClientId: string;
  readonly mediaBucket: s3.Bucket;

  constructor(scope: Construct, id: string, props: AtithiPlatformStackProps) {
    super(scope, id, props);
    const { stage } = props;
    const isProd = stage === 'prod';

    // =======================================================================
    // Data — single DynamoDB table
    // =======================================================================

    const table = new dynamodb.Table(this, 'MainTable', {
      tableName: `atithi-main-${stage}`,
      partitionKey: { name: 'PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'SK', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      encryption: dynamodb.TableEncryption.AWS_MANAGED,
      // Lets us recover from an accidental bad write for 35 days.
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      timeToLiveAttribute: 'expiresAt',
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      deletionProtection: isProd,
    });

    // Lookup by entity id, and a guest's own bookings.
    table.addGlobalSecondaryIndex({
      indexName: 'GSI1',
      partitionKey: { name: 'GSI1PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI1SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // City search, and a partner's own arrivals.
    table.addGlobalSecondaryIndex({
      indexName: 'GSI2',
      partitionKey: { name: 'GSI2PK', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'GSI2SK', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // =======================================================================
    // Media bucket — property photos
    // =======================================================================

    this.mediaBucket = new s3.Bucket(this, 'MediaBucket', {
      bucketName: `atithi-media-${stage}-${this.account}-${this.region}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      versioned: isProd,
      cors: [
        {
          allowedMethods: [s3.HttpMethods.PUT, s3.HttpMethods.POST, s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
          maxAge: 3000,
        },
      ],
      lifecycleRules: [
        { abortIncompleteMultipartUploadAfter: cdk.Duration.days(3) },
        // Photos are read constantly at first, rarely after a few months.
        {
          transitions: [
            { storageClass: s3.StorageClass.INTELLIGENT_TIERING, transitionAfter: cdk.Duration.days(90) },
          ],
        },
      ],
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    // =======================================================================
    // Auth — Cognito
    // =======================================================================

    const userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `atithi-${stage}`,
      selfSignUpEnabled: true,
      // Indian users overwhelmingly sign in by phone; email is optional.
      signInAliases: { phone: true, email: true },
      autoVerify: { phone: true, email: true },
      standardAttributes: {
        phoneNumber: { required: true, mutable: true },
        email: { required: false, mutable: true },
        fullname: { required: false, mutable: true },
      },
      customAttributes: {
        // Comma-separated org ids. Drives partner tenant isolation.
        orgIds: new cognito.StringAttribute({ minLen: 0, maxLen: 512, mutable: true }),
        locale: new cognito.StringAttribute({ minLen: 0, maxLen: 8, mutable: true }),
      },
      passwordPolicy: {
        minLength: 10,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.PHONE_AND_EMAIL,
      mfa: cognito.Mfa.OPTIONAL,
      mfaSecondFactor: { sms: true, otp: true },
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
    });

    // Groups become the `cognito:groups` claim, read by backend/src/lib/auth.ts.
    for (const groupName of [
      'guest',
      'partner_staff',
      'partner_owner',
      'platform_support',
      'platform_admin',
    ]) {
      new cognito.CfnUserPoolGroup(this, `Group-${groupName}`, {
        userPoolId: userPool.userPoolId,
        groupName,
      });
    }

    const userPoolClient = userPool.addClient('WebClient', {
      userPoolClientName: `atithi-web-${stage}`,
      authFlows: { userSrp: true, custom: true },
      // Public SPA client — no secret, tokens are short-lived.
      generateSecret: false,
      accessTokenValidity: cdk.Duration.hours(1),
      idTokenValidity: cdk.Duration.hours(1),
      refreshTokenValidity: cdk.Duration.days(30),
      preventUserExistenceErrors: true,
      enableTokenRevocation: true,
    });

    // =======================================================================
    // Lambda
    // =======================================================================

    const commonEnv: Record<string, string> = {
      STAGE: stage,
      TABLE_NAME: table.tableName,
      MEDIA_BUCKET: this.mediaBucket.bucketName,
      USER_POOL_ID: userPool.userPoolId,
      AI_PROVIDER: process.env['AI_PROVIDER'] ?? 'bedrock',
      // Claude 3.5 Haiku is NOT offered in ap-south-1. Verify availability with
      // `aws bedrock list-foundation-models --region <region>` before changing.
      BEDROCK_MODEL_ID:
        process.env['BEDROCK_MODEL_ID'] ?? 'anthropic.claude-3-haiku-20240307-v1:0',
      BEDROCK_REGION: process.env['BEDROCK_REGION'] ?? 'ap-south-1',
      // OpenAI-compatible providers (OpenAI, or Kimi/Moonshot via OPENAI_BASE_URL).
      // For Kimi: AI_PROVIDER=openai, OPENAI_BASE_URL=https://api.moonshot.ai/v1,
      // OPENAI_MODEL=kimi-k3, and store the key in the AI_API_KEY_SECRET_ID secret.
      OPENAI_MODEL: process.env['OPENAI_MODEL'] ?? 'gpt-4o-mini',
      OPENAI_BASE_URL: process.env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1',
      AI_API_KEY_SECRET_ID: process.env['AI_API_KEY_SECRET_ID'] ?? '',
      AI_MAX_OUTPUT_TOKENS: process.env['AI_MAX_OUTPUT_TOKENS'] ?? '800',
      NODE_OPTIONS: '--enable-source-maps',
    };

    const makeFn = (
      name: string,
      entry: string,
      handler: string,
      opts: { memory?: number; timeout?: number; ai?: boolean } = {},
    ): NodejsFunction => {
      const fn = new NodejsFunction(this, name, {
        functionName: `atithi-${stage}-${name}`,
        entry: path.join(BACKEND_SRC, entry),
        handler,
        runtime: lambda.Runtime.NODEJS_22_X,
        architecture: lambda.Architecture.ARM_64,
        memorySize: opts.memory ?? 512,
        timeout: cdk.Duration.seconds(opts.timeout ?? 15),
        environment: commonEnv,
        logGroup: new logs.LogGroup(this, `${name}-logs`, {
          logGroupName: `/aws/lambda/atithi-${stage}-${name}`,
          retention: isProd ? logs.RetentionDays.ONE_MONTH : logs.RetentionDays.ONE_WEEK,
          removalPolicy: cdk.RemovalPolicy.DESTROY,
        }),
        bundling: {
          minify: true,
          sourceMap: true,
          // CommonJS output: several AWS SDK clients (notably bedrock-runtime)
          // ship CJS that calls require() at load time, which is illegal inside
          // an ESM bundle and crashes the function during init.
          target: 'node22',
          // These clients ship inside the Node 22 runtime; bundling them would
          // only slow cold starts. Anything not listed here is bundled.
          externalModules: [
            '@aws-sdk/client-dynamodb',
            '@aws-sdk/lib-dynamodb',
            '@aws-sdk/client-s3',
            '@aws-sdk/client-secrets-manager',
            '@aws-sdk/client-sns',
            '@aws-sdk/s3-request-presigner',
          ],
        },
      });

      table.grantReadWriteData(fn);

      if (opts.ai) {
        // Bedrock via IAM means no API key to rotate or leak.
        fn.addToRolePolicy(
          new iam.PolicyStatement({
            actions: ['bedrock:InvokeModel'],
            resources: ['*'],
          }),
        );
        if (commonEnv['AI_API_KEY_SECRET_ID']) {
          fn.addToRolePolicy(
            new iam.PolicyStatement({
              actions: ['secretsmanager:GetSecretValue'],
              resources: [
                `arn:aws:secretsmanager:${this.region}:${this.account}:secret:${commonEnv['AI_API_KEY_SECRET_ID']}*`,
              ],
            }),
          );
        }
      }

      return fn;
    };

    // Public, cacheable
    const searchFn = makeFn('search', 'handlers/search.ts', 'searchHandler', { memory: 1024 });
    const naturalSearchFn = makeFn('natural-search', 'handlers/search.ts', 'naturalSearchHandler', {
      memory: 1024,
      // API Gateway HTTP API hard-caps at 29s. Kimi's always-on reasoning is slow
      // (~15-25s), so give the Lambda the full budget up to that ceiling.
      timeout: 29,
      ai: true,
    });
    const getPropertyFn = makeFn('get-property', 'handlers/properties.ts', 'getPropertyHandler');
    const availabilityFn = makeFn('availability', 'handlers/properties.ts', 'getAvailabilityHandler', {
      memory: 1024,
    });
    const reviewsFn = makeFn('list-reviews', 'handlers/properties.ts', 'listReviewsHandler');
    const askFn = makeFn('ask-property', 'handlers/properties.ts', 'askPropertyHandler', {
      memory: 512,
      timeout: 25,
      ai: true,
    });

    // Guest, authenticated
    const createBookingFn = makeFn('create-booking', 'handlers/bookings.ts', 'createBookingHandler', {
      memory: 1024,
      timeout: 25,
    });
    const listBookingsFn = makeFn('list-bookings', 'handlers/bookings.ts', 'listBookingsHandler');
    const getBookingFn = makeFn('get-booking', 'handlers/bookings.ts', 'getBookingHandler');
    const cancelBookingFn = makeFn('cancel-booking', 'handlers/bookings.ts', 'cancelBookingHandler', {
      timeout: 25,
    });
    const createReviewFn = makeFn('create-review', 'handlers/bookings.ts', 'createReviewHandler');

    const getProfileFn = makeFn('get-profile', 'handlers/profile.ts', 'getProfileHandler');
    const updateProfileFn = makeFn('update-profile', 'handlers/profile.ts', 'updateProfileHandler');
    const consentFn = makeFn('record-consent', 'handlers/profile.ts', 'recordConsentHandler');
    const exportDataFn = makeFn('export-data', 'handlers/profile.ts', 'exportMyDataHandler');
    const deleteRequestFn = makeFn('delete-request', 'handlers/profile.ts', 'requestDeletionHandler');

    // Partner
    const listPartnerPropsFn = makeFn('partner-list-properties', 'handlers/partner.ts', 'listPartnerPropertiesHandler');
    const createPropertyFn = makeFn('partner-create-property', 'handlers/partner.ts', 'createPropertyHandler');
    const updatePropertyFn = makeFn('partner-update-property', 'handlers/partner.ts', 'updatePropertyHandler');
    const roomTypeFn = makeFn('partner-room-type', 'handlers/partner.ts', 'upsertRoomTypeHandler');
    const setInventoryFn = makeFn('partner-set-inventory', 'handlers/partner.ts', 'setInventoryHandler', {
      timeout: 29,
    });
    const getInventoryFn = makeFn('partner-get-inventory', 'handlers/partner.ts', 'getInventoryHandler');
    const partnerBookingsFn = makeFn('partner-bookings', 'handlers/partner.ts', 'listPartnerBookingsHandler');
    const partnerBookingFn = makeFn('partner-booking', 'handlers/partner.ts', 'getPartnerBookingHandler');
    const partnerStatusFn = makeFn('partner-booking-status', 'handlers/partner.ts', 'updateBookingStatusHandler');

    this.mediaBucket.grantReadWrite(createPropertyFn);
    this.mediaBucket.grantReadWrite(updatePropertyFn);

    // =======================================================================
    // HTTP API
    // =======================================================================

    const api = new apigwv2.HttpApi(this, 'HttpApi', {
      apiName: `atithi-api-${stage}`,
      corsPreflight: {
        allowOrigins: isProd ? [process.env['WEB_ORIGIN'] ?? 'https://atithi.example'] : ['*'],
        allowMethods: [
          apigwv2.CorsHttpMethod.GET,
          apigwv2.CorsHttpMethod.POST,
          apigwv2.CorsHttpMethod.PUT,
          apigwv2.CorsHttpMethod.PATCH,
          apigwv2.CorsHttpMethod.DELETE,
          apigwv2.CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key'],
        maxAge: cdk.Duration.hours(1),
      },
    });

    /**
     * Cognito JWT authorizer. API Gateway verifies the signature, issuer and
     * audience before our code runs, so handlers can trust the claims.
     */
    const authorizer = new HttpJwtAuthorizer(
      'CognitoAuthorizer',
      `https://cognito-idp.${this.region}.amazonaws.com/${userPool.userPoolId}`,
      { jwtAudience: [userPoolClient.userPoolClientId] },
    );

    const route = (
      routeKey: string,
      fn: NodejsFunction,
      opts: { auth?: boolean } = { auth: true },
    ) => {
      const [method, routePath] = routeKey.split(' ') as [string, string];
      api.addRoutes({
        path: routePath,
        methods: [method as apigwv2.HttpMethod],
        integration: new HttpLambdaIntegration(`Int-${routeKey.replace(/[^\w]/g, '-')}`, fn),
        ...(opts.auth ? { authorizer } : {}),
      });
    };

    // --- Public ---
    route('GET /search', searchFn, { auth: false });
    route('POST /search/natural', naturalSearchFn, { auth: false });
    route('GET /properties/{propertyId}', getPropertyFn, { auth: false });
    route('GET /properties/{propertyId}/availability', availabilityFn, { auth: false });
    route('GET /properties/{propertyId}/reviews', reviewsFn, { auth: false });
    route('POST /properties/{propertyId}/ask', askFn, { auth: false });

    // --- Guest (authenticated) ---
    route('POST /bookings', createBookingFn);
    route('GET /bookings', listBookingsFn);
    route('GET /bookings/{bookingId}', getBookingFn);
    route('POST /bookings/{bookingId}/cancel', cancelBookingFn);
    route('POST /reviews', createReviewFn);

    route('GET /me', getProfileFn);
    route('PATCH /me', updateProfileFn);
    route('POST /me/consents', consentFn);
    route('GET /me/export', exportDataFn);
    route('POST /me/delete-request', deleteRequestFn);

    // --- Partner (authenticated + org-scoped in code) ---
    route('GET /partner/properties', listPartnerPropsFn);
    route('POST /partner/properties', createPropertyFn);
    route('PUT /partner/properties/{propertyId}', updatePropertyFn);
    route('POST /partner/properties/{propertyId}/room-types', roomTypeFn);
    route('PUT /partner/properties/{propertyId}/inventory', setInventoryFn);
    route('GET /partner/properties/{propertyId}/inventory', getInventoryFn);
    route('GET /partner/bookings', partnerBookingsFn);
    route('GET /partner/bookings/{bookingId}', partnerBookingFn);
    route('POST /partner/bookings/{bookingId}/status', partnerStatusFn);

    // =======================================================================
    // Outputs
    // =======================================================================

    this.apiUrl = api.apiEndpoint;
    this.userPoolId = userPool.userPoolId;
    this.userPoolClientId = userPoolClient.userPoolClientId;

    new cdk.CfnOutput(this, 'ApiUrl', { value: api.apiEndpoint });
    new cdk.CfnOutput(this, 'UserPoolId', { value: userPool.userPoolId });
    new cdk.CfnOutput(this, 'UserPoolClientId', { value: userPoolClient.userPoolClientId });
    new cdk.CfnOutput(this, 'TableName', { value: table.tableName });
    new cdk.CfnOutput(this, 'MediaBucketName', { value: this.mediaBucket.bucketName });
  }
}
