import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Construct } from 'constructs';

export type AppConfigRestApiProps
  = Omit<apigateway.LambdaRestApiProps, 'handler'>

export interface ConfigServiceProps {
  applicationId: string
  configProfileId: string
  environmentId: string
  layerVersionArn: string

  configFunctionDescription?: string
  restApiProps?: AppConfigRestApiProps
}

export default class ConfigService extends Construct {
  public readonly configFunction: lambda.Function;

  public readonly restApi: apigateway.LambdaRestApi;

  constructor(scope: Construct, id: string, props: ConfigServiceProps) {
    super(scope, id);

    this.configFunction = new lambda.Function(this, 'ConfigFunction', {
      code: lambda.Code.fromAsset(`${__dirname}/lambda`),
      description: props.configFunctionDescription,
      environment: {
        CONFIG_APP: props.applicationId,
        CONFIG_ENV: props.environmentId,
        CONFIG_NAME: props.configProfileId,
      },
      handler: 'config.handler',
      layers: [
        lambda.LayerVersion.fromLayerVersionArn(
          this,
          'AppConfigLayer',
          props.layerVersionArn,
        ),
      ],
      runtime: lambda.Runtime.PYTHON_3_9,
    });

    this.restApi = new apigateway.LambdaRestApi(this, 'RestApi', {
      handler: this.configFunction,
      ...props.restApiProps,
    });
  }

  assumeSessionAccessRole(sessionAccessRoleArn: string) {
    this.configFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ['sts:AssumeRole'],
        resources: [sessionAccessRoleArn],
      }),
    );
    this.configFunction.addEnvironment(
      'AWS_APPCONFIG_EXTENSION_ROLE_ARN',
      sessionAccessRoleArn,
    );
  }
}
