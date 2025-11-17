import boto3
import json
import logging
import os
import secrets
import string

logger = logging.getLogger()
logger.setLevel(logging.INFO)

def lambda_handler(event, context):
    """Secret Rotation Lambda Handler"""
    
    arn = event['SecretId']
    token = event['ClientRequestToken']
    step = event['Step']
    
    # Setup clients
    secrets_client = boto3.client('secretsmanager')
    rds_client = boto3.client('rds')
    
    # Get metadata
    metadata = secrets_client.describe_secret(SecretId=arn)
    
    if 'RotationEnabled' in metadata and not metadata['RotationEnabled']:
        logger.error("Secret rotation is not enabled for %s", arn)
        raise ValueError("Secret rotation is not enabled")
    
    # Get versions
    versions = metadata['VersionIdsToStages']
    
    if token not in versions:
        logger.error("Secret version %s not found for %s", token, arn)
        raise ValueError("Secret version not found")
    
    if 'AWSCURRENT' in versions[token]:
        logger.info("Secret version %s already set as current for %s", token, arn)
        return
    elif 'AWSPENDING' not in versions[token]:
        logger.error("Secret version %s not set as pending for %s", token, arn)
        raise ValueError("Secret version not marked as pending")
    
    # Execute rotation step
    if step == 'createSecret':
        create_secret(secrets_client, arn, token)
    elif step == 'setSecret':
        set_secret(secrets_client, rds_client, arn, token)
    elif step == 'testSecret':
        test_secret(secrets_client, rds_client, arn, token)
    elif step == 'finishSecret':
        finish_secret(secrets_client, arn, token)
    else:
        raise ValueError("Invalid step parameter")

def create_secret(secrets_client, arn, token):
    """Create a new secret"""
    
    try:
        # Get current secret
        current_secret = json.loads(
            secrets_client.get_secret_value(
                SecretId=arn,
                VersionStage='AWSCURRENT'
            )['SecretString']
        )
        
        # Generate new password
        new_password = generate_password()
        
        # Create new secret with same structure but new password
        new_secret = current_secret.copy()
        new_secret['password'] = new_password
        
        # Put the new secret
        secrets_client.put_secret_value(
            SecretId=arn,
            ClientRequestToken=token,
            SecretString=json.dumps(new_secret),
            VersionStages=['AWSPENDING']
        )
        
        logger.info("Successfully created new secret version for %s", arn)
        
    except Exception as e:
        logger.error("Error creating secret: %s", str(e))
        raise e

def set_secret(secrets_client, rds_client, arn, token):
    """Set the secret in RDS"""
    
    try:
        # Get pending secret
        pending_secret = json.loads(
            secrets_client.get_secret_value(
                SecretId=arn,
                VersionId=token,
                VersionStage='AWSPENDING'
            )['SecretString']
        )
        
        # Get DB instance identifier from secret or environment
        db_instance_id = os.environ.get('DB_INSTANCE_ID')
        if not db_instance_id:
            # Try to extract from secret ARN or assume default
            db_instance_id = 'credlink-production-db'
        
        # Modify RDS instance with new password
        rds_client.modify_db_instance(
            DBInstanceIdentifier=db_instance_id,
            MasterUserPassword=pending_secret['password'],
            ApplyImmediately=True
        )
        
        logger.info("Successfully updated RDS password for %s", db_instance_id)
        
    except Exception as e:
        logger.error("Error setting secret in RDS: %s", str(e))
        raise e

def test_secret(secrets_client, rds_client, arn, token):
    """Test the new secret by connecting to RDS"""
    
    try:
        # Get pending secret
        pending_secret = json.loads(
            secrets_client.get_secret_value(
                SecretId=arn,
                VersionId=token,
                VersionStage='AWSPENDING'
            )['SecretString']
        )
        
        # Test database connection
        import pymysql
        
        connection = pymysql.connect(
            host=pending_secret['host'],
            user=pending_secret['username'],
            password=pending_secret['password'],
            database=pending_secret.get('dbname', 'postgres'),
            connect_timeout=5
        )
        
        # Execute a simple query
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            result = cursor.fetchone()
            
        connection.close()
        
        if result[0] == 1:
            logger.info("Successfully tested database connection with new secret")
        else:
            raise ValueError("Database test query failed")
            
    except Exception as e:
        logger.error("Error testing secret: %s", str(e))
        raise e

def finish_secret(secrets_client, arn, token):
    """Finish the rotation by moving the new secret to current"""
    
    try:
        # Get current secret version
        current_version = secrets_client.describe_secret(SecretId=arn)
        
        # Find current version ID
        current_version_id = None
        for version_id, stages in current_version['VersionIdsToStages'].items():
            if 'AWSCURRENT' in stages:
                current_version_id = version_id
                break
        
        # Remove AWSCURRENT from old version
        if current_version_id:
            secrets_client.update_secret_version_stage(
                SecretId=arn,
                VersionStage='AWSCURRENT',
                MoveToVersionId=token,
                RemoveFromVersionId=current_version_id
            )
        
        # Add AWSPREVIOUS to old version
        if current_version_id:
            secrets_client.update_secret_version_stage(
                SecretId=arn,
                VersionStage='AWSPREVIOUS',
                MoveToVersionId=current_version_id
            )
        
        logger.info("Successfully finished secret rotation for %s", arn)
        
    except Exception as e:
        logger.error("Error finishing secret rotation: %s", str(e))
        raise e

def generate_password(length=32):
    """Generate a secure random password"""
    
    # Define character sets
    lowercase = string.ascii_lowercase
    uppercase = string.ascii_uppercase
    digits = string.digits
    special = '!@#$%^&*()_+-=[]{}|;:,.<>?'
    
    # Ensure at least one character from each set
    password = [
        secrets.choice(lowercase),
        secrets.choice(uppercase),
        secrets.choice(digits),
        secrets.choice(special)
    ]
    
    # Fill the rest with random characters from all sets
    all_chars = lowercase + uppercase + digits + special
    for _ in range(length - 4):
        password.append(secrets.choice(all_chars))
    
    # Shuffle the password
    secrets.SystemRandom().shuffle(password)
    
    return ''.join(password)
