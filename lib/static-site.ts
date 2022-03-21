import * as cdk from 'aws-cdk-lib';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as targets from 'aws-cdk-lib/aws-route53-targets';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export function getBucketProps(forceDestroy?: boolean) {
  return {
    autoDeleteObjects: forceDestroy,
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    removalPolicy: forceDestroy ? cdk.RemovalPolicy.DESTROY : undefined,
  };
}

interface StaticSiteStackBaseProps extends cdk.StackProps {
  forceDestroy?: boolean
  responseHeaders?: cloudfront.ResponseHeadersPolicy
  secondaryBucket?: s3.BucketAttributes
}

export type StaticSiteStackProps = StaticSiteStackBaseProps & (
  | { domainName?: undefined, subdomain?: undefined } & (
    | { certificateArn?: undefined, hostedZoneId?: undefined }
  )
  | { domainName: string, subdomain?: string } & (
    | { certificateArn: string, hostedZoneId?: string }
    | { hostedZoneId: string, certificateArn?: string }
  )
);

export default class StaticSite extends Construct {
  public readonly distribution: cloudfront.Distribution;

  public readonly oai: cloudfront.OriginAccessIdentity;

  public readonly primaryBucket: s3.IBucket;

  public readonly secondaryBucket: s3.IBucket | undefined;

  constructor(scope: Construct, id: string, props?: StaticSiteStackProps) {
    super(scope, id);

    const siteDomain = (props?.domainName && props.subdomain)
      ? `${props.subdomain}.${props.domainName}`
      : props?.domainName;

    const zone = !props?.hostedZoneId
      ? undefined
      : route53.HostedZone.fromHostedZoneAttributes(
        this,
        'Zone',
        {
          hostedZoneId: props.hostedZoneId,
          zoneName: props.domainName,
        },
      );

    const importedCert = !props?.certificateArn
      ? undefined
      : acm.Certificate.fromCertificateArn(
        this,
        'SiteCertificate',
        props.certificateArn,
      );

    const automaticCert = !(siteDomain && zone && !importedCert)
      ? undefined
      : new acm.DnsValidatedCertificate(
        this,
        'SiteCertificate',
        {
          domainName: siteDomain,
          hostedZone: zone,
          region: 'us-east-1',
        },
      );

    this.oai = new cloudfront.OriginAccessIdentity(this, 'SiteOAI');

    this.primaryBucket = new s3.Bucket(this, 'PrimaryBucket', getBucketProps(
      props?.forceDestroy,
    ));
    this.primaryBucket.addToResourcePolicy(new iam.PolicyStatement({
      actions: ['s3:GetObject'],
      resources: [this.primaryBucket.arnForObjects('*')],
      principals: [new iam.CanonicalUserPrincipal(
        this.oai.cloudFrontOriginAccessIdentityS3CanonicalUserId,
      )],
    }));
    new cdk.CfnOutput(this, 'PrimaryBucketName', {
      value: this.primaryBucket.bucketName,
    });

    const primaryOrigin = new origins.S3Origin(this.primaryBucket, {
      originAccessIdentity: this.oai,
    });

    this.secondaryBucket = !props?.secondaryBucket
      ? undefined
      : s3.Bucket.fromBucketAttributes(
        this,
        'SecondaryBucket',
        props.secondaryBucket,
      );
    if (this.secondaryBucket) {
      new cdk.CfnOutput(this, 'SecondaryBucketName', {
        value: this.secondaryBucket.bucketName,
      });
    }

    const origin = !this.secondaryBucket
      ? primaryOrigin
      : new origins.OriginGroup({
        primaryOrigin,
        fallbackOrigin: new origins.S3Origin(this.secondaryBucket, {
          originAccessIdentity: this.oai,
        }),
      });

    this.distribution = new cloudfront.Distribution(this, 'Distribution', {
      certificate: importedCert || automaticCert,
      defaultBehavior: {
        origin,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: props?.responseHeaders,
      },
      defaultRootObject: 'index.html',
      domainNames: siteDomain ? [siteDomain] : undefined,
    });
    new cdk.CfnOutput(this, 'DistributionId', {
      value: this.distribution.distributionId,
    });

    if (siteDomain && zone) {
      const target = new targets.CloudFrontTarget(this.distribution);
      new route53.ARecord(this, 'SiteAliasRecord', {
        recordName: siteDomain,
        target: route53.RecordTarget.fromAlias(target),
        zone,
      });
    }
  }
}
