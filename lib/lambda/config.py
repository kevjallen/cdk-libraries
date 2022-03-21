import json
import os
from urllib import request

def handler(event, context):
  application = os.environ['CONFIG_APP']
  configuration = os.environ['CONFIG_NAME']
  environment = os.environ['CONFIG_ENV']
  
  config_url = f'http://localhost:2772/applications/{application}'
  config_url += f'/environments/{environment}/configurations/{configuration}'

  response = request.urlopen(config_url)

  return {
    'body': response.read(),
    'headers': {
      'Content-Type': 'application/json'
    },
    'isBase64Encoded': False,
    'statusCode': response.getcode()
  }
