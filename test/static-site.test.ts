import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Template } from 'aws-cdk-lib/assertions';
import StaticSite, { getBucketProps } from '../lib/static-site';

const testAccountId = '111111111111';

const testBucketName = 'test-bucket';

const testDomainName = 'example.com';

const testHostedZoneId = 'Z23ABC4XYZL05B';

const testStackName = 'StaticSite';

describe('StaticSite', () => {
  test('can not make bucket objects public', () => {
    const stack = new cdk.Stack(new cdk.App(), 'Stack');

    new StaticSite(stack, testStackName);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::S3::Bucket', {
      PublicAccessBlockConfiguration: {
        BlockPublicAcls: true,
        BlockPublicPolicy: true,
        IgnorePublicAcls: true,
        RestrictPublicBuckets: true,
      },
    });
  });
  test('can create a site with a failover bucket', () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Stack', {
      env: {
        account: testAccountId,
        region: 'us-east-2',
      },
    });
    const failoverStack = new cdk.Stack(app, 'FailoverStack', {
      env: {
        account: testAccountId,
        region: 'us-east-1',
      },
    });
    const bucketName = testBucketName;
    new s3.Bucket(failoverStack, 'SecondaryBucket', {
      ...getBucketProps(true),
      bucketName,
    });

    const staticSite = new StaticSite(stack, testStackName, {
      secondaryBucket: {
        region: failoverStack.region,
        bucketName,
      },
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        Origins: [
          {
            DomainName: {
              'Fn::GetAtt': [
                cdk.Stack.of(staticSite).getLogicalId(
                  staticSite.primaryBucket.node.defaultChild as cdk.CfnElement,
                ),
                'RegionalDomainName',
              ],
            },
          },
          {
            DomainName: {
              'Fn::Join': [
                '',
                [
                  `${testBucketName}.s3.us-east-1.`,
                  {
                    Ref: 'AWS::URLSuffix',
                  },
                ],
              ],
            },
          },
        ],
      },
    });
  });
  test('can create a site with a dns record', () => {
    const stack = new cdk.Stack(new cdk.App(), 'Stack');
    const domainName = testDomainName;
    const hostedZoneId = testHostedZoneId;
    const subdomain = 'www';

    const staticSite = new StaticSite(stack, testStackName, {
      domainName,
      hostedZoneId,
      subdomain,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Route53::RecordSet', {
      AliasTarget: {
        DNSName: {
          'Fn::GetAtt': [
            stack.getLogicalId(
              staticSite.distribution.node.defaultChild as cdk.CfnElement,
            ),
            'DomainName',
          ],
        },
      },
      HostedZoneId: hostedZoneId,
    });
  });
  test('can create a site with an existing cert', () => {
    const stack = new cdk.Stack(new cdk.App(), 'Stack');
    const certificateName = 'hello-world-12345';
    const certificateArn = `arn:aws:acm:${stack.region}:${stack.account}`
      + `:certificate/${certificateName}`;
    const hostedZoneId = testHostedZoneId;

    new StaticSite(stack, testStackName, {
      certificateArn,
      hostedZoneId,
      domainName: testDomainName,
    });

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::CloudFront::Distribution', {
      DistributionConfig: {
        ViewerCertificate: {
          AcmCertificateArn: {
            'Fn::Join': [
              '',
              [
                'arn:aws:acm:',
                {
                  Ref: 'AWS::Region',
                },
                ':',
                {
                  Ref: 'AWS::AccountId',
                },
                `:certificate/${certificateName}`,
              ],
            ],
          },
        },
      },
    });
  });
});
