import json
import os
import logging

# Configure logging
logger = logging.getLogger()
logger.setLevel(os.getenv('LOG_LEVEL', 'INFO'))

def handler(event, context):
    """
    Lambda function to handle S3 events for security monitoring
    """
    try:
        logger.info(f"Received S3 event: {json.dumps(event)}")
        
        # Process S3 event records
        for record in event['Records']:
            bucket_name = record['s3']['bucket']['name']
            object_key = record['s3']['object']['key']
            event_name = record['eventName']
            event_time = record['eventTime']
            
            logger.info(f"S3 Event: {event_name} on bucket {bucket_name} for object {object_key} at {event_time}")
            
            # Add your custom event processing logic here
            # For example: send notifications, update metrics, etc.
        
        return {
            'statusCode': 200,
            'body': json.dumps('S3 events processed successfully')
        }
        
    except Exception as e:
        logger.error(f"Error processing S3 event: {str(e)}")
        raise e
