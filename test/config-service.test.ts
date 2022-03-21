import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';
import ConfigService from '../lib/config-service';

const testApplicationId = 'hello';

const testConfigProfileId = 'world';

const testEnvironmentId = '12345';

const testOtherAccountId = '111111111111';

function makeConfigService(): ConfigService {
  const stack = new cdk.Stack(new cdk.App(), 'Stack');
  return new ConfigService(stack, 'ConfigService', {
    applicationId: testApplicationId,
    configProfileId: testConfigProfileId,
    environmentId: testEnvironmentId,
    layerVersionArn:
      'arn:aws:lambda:us-east-2:728743619870:layer:AWS-AppConfig-Extension:49',
    restApiProps: {
      deployOptions: {
        stageName: 'api',
      },
    },
  });
}

describe('ConfigService', () => {
  let appConfigService: ConfigService;
  beforeEach(() => {
    appConfigService = makeConfigService();
  });
  test('can assume an iam role from another account', () => {
    const roleStack = new cdk.Stack(undefined, undefined, {
      env: {
        account: testOtherAccountId,
        region: 'us-east-2',
      },
    });
    const roleName = 'test_role';
    const role = new iam.Role(roleStack, 'Role', {
      assumedBy: new iam.AccountPrincipal(
        cdk.Stack.of(appConfigService).account,
      ),
      roleName,
    });
    appConfigService.assumeSessionAccessRole(role.roleArn);

    const template = Template.fromStack(cdk.Stack.of(appConfigService));
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Resource: {
              'Fn::Join': [
                '',
                [
                  'arn:',
                  {
                    Ref: 'AWS::Partition',
                  },
                  `:iam::${testOtherAccountId}:role/${roleName}`,
                ],
              ],
            },
          },
        ],
      },
    });
  });
});
