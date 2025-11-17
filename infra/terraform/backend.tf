# Terraform Remote State Configuration
#
# This file configures S3 backend for Terraform state storage with DynamoDB locking.
#
# SETUP INSTRUCTIONS:
# 1. Create S3 bucket for state storage:
#    aws s3api create-bucket \
#      --bucket credlink-terraform-state-${AWS_ACCOUNT_ID} \
#      --region us-east-1
#
# 2. Enable versioning on the bucket:
#    aws s3api put-bucket-versioning \
#      --bucket credlink-terraform-state-${AWS_ACCOUNT_ID} \
#      --versioning-configuration Status=Enabled
#
# 3. Enable encryption:
#    aws s3api put-bucket-encryption \
#      --bucket credlink-terraform-state-${AWS_ACCOUNT_ID} \
#      --server-side-encryption-configuration '{
#        "Rules": [{
#          "ApplyServerSideEncryptionByDefault": {
#            "SSEAlgorithm": "AES256"
#          }
#        }]
#      }'
#
# 4. Block public access:
#    aws s3api put-public-access-block \
#      --bucket credlink-terraform-state-${AWS_ACCOUNT_ID} \
#      --public-access-block-configuration \
#        BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
#
# 5. Create DynamoDB table for state locking:
#    aws dynamodb create-table \
#      --table-name credlink-terraform-locks \
#      --attribute-definitions AttributeName=LockID,AttributeType=S \
#      --key-schema AttributeName=LockID,KeyType=HASH \
#      --billing-mode PAY_PER_REQUEST \
#      --region us-east-1
#
# 6. Copy this file to backend.tf:
#    cp backend.tf.example backend.tf
#
# 7. Update the bucket name with your AWS account ID
#
# 8. Initialize Terraform with the backend:
#    terraform init -migrate-state
#
# IMPORTANT: Add backend.tf to .gitignore if it contains sensitive values

# CURRENT STATUS: Local backend (NOT recommended for production)
#
# ⚠️  WARNING: Local backend has significant limitations:
# - No team collaboration
# - No state locking (concurrent changes can corrupt state)
# - State file can be lost if local machine fails
# - No state versioning/history
# - Manual backup required
#
# RECOMMENDATION: Enable S3 backend for production use
#
# TO ENABLE S3 BACKEND:
# 1. Run the setup script: ./setup-remote-state.sh
# 2. Comment out the local backend below
# 3. Uncomment the S3 backend below
# 4. Run: terraform init -migrate-state
#
# PRODUCTION S3 BACKEND - MANDATORY FOR SECURITY
#
# ⚠️  CRITICAL SECURITY: Local backend exposes infrastructure state
# - State contains secrets, credentials, resource IDs
# - No encryption enables complete system compromise
# - No state locking allows corruption during concurrent operations
#
terraform {
  backend "s3" {
    bucket         = "credlink-terraform-state-002893232481"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true                       # MANDATORY: State encryption at rest
    dynamodb_table = "credlink-terraform-locks" # MANDATORY: State locking

    # Workspace support for multi-environment
    workspace_key_prefix = "workspaces"

    # Enhanced security: KMS envelope encryption
    kms_key_id = null # TODO: Set to KMS key ARN for envelope encryption

    # Security: Role assumption for cross-account access
    # role_arn = "arn:aws:iam::ACCOUNT_ID:role/TerraformRole"
  }
}

# State Locking with DynamoDB
# The DynamoDB table must have a primary key named "LockID" (case-sensitive)
# Terraform automatically creates and removes locks during operations
# If a lock gets stuck, you can manually remove it:
# aws dynamodb delete-item \
#   --table-name credlink-terraform-locks \
#   --key '{"LockID": {"S": "credlink-terraform-state-${AWS_ACCOUNT_ID}/production/terraform.tfstate"}}'
