import * as cdk from 'aws-cdk-lib';
import { Template } from 'aws-cdk-lib/assertions';
import * as iam from 'aws-cdk-lib/aws-iam';
import AppConfig from '../lib/app-config';

const testAppConfigId = 'AppConfig';

const testConfigProfileId = 'ConfigurationProfile';
const testConfigProfileName = 'TestConfigurationProfile';

const testEnvironmentId = 'Environment';
const testEnvironmentName = 'TestEnvironment';

function makeAppConfig() : AppConfig {
  const stack = new cdk.Stack(new cdk.App(), 'Stack');
  return new AppConfig(stack, testAppConfigId, {
    name: 'TestAppConfig',
  });
}

function expectedPolicyStatement(appConfig: AppConfig) {
  return {
    Action: [
      'appconfig:StartConfigurationSession',
      'appconfig:GetLatestConfiguration',
    ],
    Effect: 'Allow',
    Resource: {
      'Fn::Join': [
        '',
        [
          'arn:',
          {
            Ref: 'AWS::Partition',
          },
          ':appconfig:',
          {
            Ref: 'AWS::Region',
          },
          ':',
          {
            Ref: 'AWS::AccountId',
          },
          ':application/',
          {
            Ref: cdk.Stack.of(appConfig).getLogicalId(
              appConfig.node.findChild(
                testAppConfigId,
              ) as cdk.CfnElement,
            ),
          },
          '/environment/',
          {
            Ref: cdk.Stack.of(appConfig).getLogicalId(
              appConfig.node.findChild(
                testEnvironmentId,
              ) as cdk.CfnElement,
            ),
          },
          '/configuration/*',
        ],
      ],
    },
  };
}

describe('AppConfig', () => {
  let appConfig: AppConfig;
  beforeEach(() => {
    appConfig = makeAppConfig();
  });
  test('can get a reference to the app config', () => {
    expect(cdk.Token.isUnresolved(appConfig.applicationId)).toBeTruthy();
  });
  test('can add environments to the app config', () => {
    appConfig.addEnvironment(testEnvironmentId, {
      name: testEnvironmentName,
    });

    const template = Template.fromStack(cdk.Stack.of(appConfig));
    template.hasResourceProperties('AWS::AppConfig::Environment', {
      Name: testEnvironmentName,
    });
  });
  test('can add profiles to the app config', () => {
    appConfig.addConfigurationProfile(testConfigProfileId, {
      locationUri: 'hosted',
      name: testConfigProfileName,
    });

    const template = Template.fromStack(cdk.Stack.of(appConfig));
    template.hasResourceProperties('AWS::AppConfig::ConfigurationProfile', {
      LocationUri: 'hosted',
      Name: testConfigProfileName,
    });
  });
  test('can get a statement for session access', () => {
    const environmentId = appConfig.addEnvironment(testEnvironmentId, {
      name: testEnvironmentName,
    });
    const statement = appConfig.getSessionAccessPolicyStatement({
      environmentId,
    });
    expect(cdk.Stack.of(appConfig).resolve(statement.toJSON())).toStrictEqual(
      expectedPolicyStatement(appConfig),
    );
  });
  test('can add a role with session access', () => {
    const environmentId = appConfig.addEnvironment(testEnvironmentId, {
      name: testEnvironmentName,
    });
    const principal = new iam.AccountPrincipal('111111111111');
    const role = appConfig.addSessionAccessRole('SessionAccessRole', {
      environmentId,
      principal,
    });

    const template = Template.fromStack(cdk.Stack.of(appConfig));
    template.hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          {
            Action: 'sts:AssumeRole',
            Effect: 'Allow',
            Principal: {
              AWS: {
                'Fn::Join': [
                  '',
                  [
                    'arn:',
                    {
                      Ref: 'AWS::Partition',
                    },
                    `:iam::${principal.principalAccount}:root`,
                  ],
                ],
              },
            },
          },
        ],
      },
    });
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          expectedPolicyStatement(appConfig),
        ],
      },
      Roles: [
        {
          Ref: cdk.Stack.of(appConfig).getLogicalId(
            role.node.defaultChild as cdk.CfnElement,
          ),
        },
      ],
    });
  });
});
