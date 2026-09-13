import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as path from 'node:path';

const WEB_DIST = path.join(__dirname, '..', '..', 'frontend', 'dist');

export interface AtithiWebStackProps extends cdk.StackProps {
  stage: string;
  apiUrl: string;
  userPoolId: string;
  userPoolClientId: string;
}

/**
 * Static hosting: S3 (private) behind CloudFront with Origin Access Control.
 *
 * The bucket is never public. CloudFront is the only reader, which removes an
 * entire class of accidental-exposure incidents and is also cheaper, because
 * cached responses never touch S3 or Lambda.
 */
export class AtithiWebStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props: AtithiWebStackProps) {
    super(scope, id, props);
    const { stage } = props;
    const isProd = stage === 'prod';

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      bucketName: `atithi-web-${stage}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      removalPolicy: isProd ? cdk.RemovalPolicy.RETAIN : cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: !isProd,
    });

    /**
     * Security headers applied at the edge rather than in application code, so
     * they cannot be forgotten on a new route.
     */
    const responseHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        contentSecurityPolicy: {
          override: true,
          contentSecurityPolicy: [
            "default-src 'self'",
            "script-src 'self'",
            "style-src 'self' 'unsafe-inline'",
            "img-src 'self' data: blob: https:",
            "font-src 'self' data:",
            `connect-src 'self' ${props.apiUrl} https://cognito-idp.${this.region}.amazonaws.com https://*.s3.${this.region}.amazonaws.com`,
            "frame-ancestors 'none'",
            "base-uri 'self'",
            "form-action 'self'",
          ].join('; '),
        },
        strictTransportSecurity: {
          override: true,
          accessControlMaxAge: cdk.Duration.days(730),
          includeSubdomains: true,
          preload: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { override: true, frameOption: cloudfront.HeadersFrameOption.DENY },
        referrerPolicy: {
          override: true,
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
        },
      },
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      comment: `Atithi web (${stage})`,
      defaultRootObject: 'index.html',
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
        compress: true,
        responseHeadersPolicy: responseHeaders,
      },
      additionalBehaviors: {},
      errorResponses: [
        // SPA routing: unknown paths return index.html, not a 404 page.
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.minutes(5) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: cdk.Duration.minutes(5) },
      ],
      // PriceClass 200 covers India well without paying for the full global edge network.
      priceClass: cloudfront.PriceClass.PRICE_CLASS_200,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableLogging: isProd,
    });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(WEB_DIST)],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
      prune: true,
      memoryLimit: 512,
    });

    new cdk.CfnOutput(this, 'WebUrl', { value: `https://${distribution.distributionDomainName}` });
    new cdk.CfnOutput(this, 'DistributionId', { value: distribution.distributionId });

    // Convenience: the exact values the frontend build needs.
    new cdk.CfnOutput(this, 'FrontendEnv', {
      value: JSON.stringify({
        VITE_API_BASE_URL: props.apiUrl,
        VITE_USER_POOL_ID: props.userPoolId,
        VITE_USER_POOL_CLIENT_ID: props.userPoolClientId,
        VITE_AWS_REGION: this.region,
      }),
    });
  }
}
