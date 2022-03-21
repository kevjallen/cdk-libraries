import * as cdk from 'aws-cdk-lib';
import * as config from 'aws-cdk-lib/aws-appconfig';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Construct } from 'constructs';

export type AddEnvironmentOptions
  = Omit<config.CfnEnvironmentProps, 'applicationId'>

export type AddConfigurationProfileOptions
  = Omit<config.CfnConfigurationProfileProps, 'applicationId'>

export interface SessionAccessPolicyStatementOptions {
    environmentId: string

    configProfileId?: string
  }

export interface AddSessionAccessRoleOptions
  extends SessionAccessPolicyStatementOptions {
    principal: iam.IPrincipal
  }

export default class AppConfig extends Construct {
  public readonly applicationId: string;

  constructor(scope: Construct, id: string, props: config.CfnApplicationProps) {
    super(scope, id);

    this.applicationId = new config.CfnApplication(this, id, props).ref;
  }

  addConfigurationProfile(id: string, options: AddConfigurationProfileOptions) {
    const configurationProfile = new config.CfnConfigurationProfile(this, id, {
      ...options,
      applicationId: this.applicationId,
    });
    return configurationProfile.ref;
  }

  addEnvironment(id: string, options: AddEnvironmentOptions) {
    const environment = new config.CfnEnvironment(this, id, {
      ...options,
      applicationId: this.applicationId,
    });
    return environment.ref;
  }

  addSessionAccessRole(id: string, options: AddSessionAccessRoleOptions) {
    const sessionAccessRole = new iam.Role(this, id, {
      assumedBy: options.principal,
    });
    sessionAccessRole.addToPolicy(
      this.getSessionAccessPolicyStatement(options),
    );
    return sessionAccessRole;
  }

  getSessionAccessPolicyStatement(options: SessionAccessPolicyStatementOptions) {
    return new iam.PolicyStatement({
      actions: [
        'appconfig:StartConfigurationSession',
        'appconfig:GetLatestConfiguration',
      ],
      resources: [
        cdk.Arn.format(
          {
            resource: 'application',
            resourceName: `${this.applicationId}`
              + `/environment/${options.environmentId}`
              + `/configuration/${options.configProfileId || '*'}`,
            service: 'appconfig',
          },
          cdk.Stack.of(this),
        ),
      ],
    });
  }
}
