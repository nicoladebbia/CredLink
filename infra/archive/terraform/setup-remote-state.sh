#!/bin/bash
# Terraform Remote State Setup Script
# 
# This script automates the creation of S3 bucket and DynamoDB table
# for Terraform remote state management with locking.
#
# Usage: ./setup-remote-state.sh [aws-profile] [region]
#
# Example: ./setup-remote-state.sh default us-east-1

set -e

# Configuration
AWS_PROFILE="${1:-default}"
AWS_REGION="${2:-us-east-1}"
TABLE_NAME="credlink-terraform-locks"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Terraform Remote State Setup${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Get AWS Account ID
echo -e "${YELLOW}→ Getting AWS Account ID...${NC}"
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --profile "$AWS_PROFILE" --query Account --output text 2>/dev/null)

if [ -z "$AWS_ACCOUNT_ID" ]; then
    echo -e "${RED}✗ Failed to get AWS Account ID${NC}"
    echo -e "${RED}  Make sure AWS CLI is configured with: aws configure --profile $AWS_PROFILE${NC}"
    exit 1
fi

BUCKET_NAME="credlink-terraform-state-${AWS_ACCOUNT_ID}"

echo -e "${GREEN}✓ AWS Account ID: $AWS_ACCOUNT_ID${NC}"
echo -e "${GREEN}✓ Using Profile: $AWS_PROFILE${NC}"
echo -e "${GREEN}✓ Region: $AWS_REGION${NC}"
echo -e "${GREEN}✓ Bucket Name: $BUCKET_NAME${NC}"
echo ""

# Check if bucket already exists
echo -e "${YELLOW}→ Checking if S3 bucket exists...${NC}"
if aws s3api head-bucket --bucket "$BUCKET_NAME" --profile "$AWS_PROFILE" 2>/dev/null; then
    echo -e "${GREEN}✓ Bucket already exists${NC}"
else
    echo -e "${YELLOW}→ Creating S3 bucket...${NC}"
    if [ "$AWS_REGION" = "us-east-1" ]; then
        aws s3api create-bucket \
            --bucket "$BUCKET_NAME" \
            --region "$AWS_REGION" \
            --profile "$AWS_PROFILE"
    else
        aws s3api create-bucket \
            --bucket "$BUCKET_NAME" \
            --region "$AWS_REGION" \
            --create-bucket-configuration LocationConstraint="$AWS_REGION" \
            --profile "$AWS_PROFILE"
    fi
    echo -e "${GREEN}✓ Bucket created${NC}"
fi

# Enable versioning
echo -e "${YELLOW}→ Enabling bucket versioning...${NC}"
aws s3api put-bucket-versioning \
    --bucket "$BUCKET_NAME" \
    --versioning-configuration Status=Enabled \
    --profile "$AWS_PROFILE"
echo -e "${GREEN}✓ Versioning enabled${NC}"

# Enable encryption
echo -e "${YELLOW}→ Enabling server-side encryption...${NC}"
aws s3api put-bucket-encryption \
    --bucket "$BUCKET_NAME" \
    --server-side-encryption-configuration '{
        "Rules": [{
            "ApplyServerSideEncryptionByDefault": {
                "SSEAlgorithm": "AES256"
            },
            "BucketKeyEnabled": true
        }]
    }' \
    --profile "$AWS_PROFILE"
echo -e "${GREEN}✓ Encryption enabled${NC}"

# Block public access
echo -e "${YELLOW}→ Blocking public access...${NC}"
aws s3api put-public-access-block \
    --bucket "$BUCKET_NAME" \
    --public-access-block-configuration \
        "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true" \
    --profile "$AWS_PROFILE"
echo -e "${GREEN}✓ Public access blocked${NC}"

# Enable bucket lifecycle policy for old versions
echo -e "${YELLOW}→ Setting up lifecycle policy for old versions...${NC}"
aws s3api put-bucket-lifecycle-configuration \
    --bucket "$BUCKET_NAME" \
    --lifecycle-configuration '{
        "Rules": [{
            "Id": "DeleteOldVersions",
            "Status": "Enabled",
            "NoncurrentVersionExpiration": {
                "NoncurrentDays": 90
            },
            "AbortIncompleteMultipartUpload": {
                "DaysAfterInitiation": 7
            }
        }]
    }' \
    --profile "$AWS_PROFILE"
echo -e "${GREEN}✓ Lifecycle policy configured${NC}"

# Check if DynamoDB table exists
echo -e "${YELLOW}→ Checking if DynamoDB table exists...${NC}"
if aws dynamodb describe-table --table-name "$TABLE_NAME" --region "$AWS_REGION" --profile "$AWS_PROFILE" 2>/dev/null > /dev/null; then
    echo -e "${GREEN}✓ DynamoDB table already exists${NC}"
else
    echo -e "${YELLOW}→ Creating DynamoDB table for state locking...${NC}"
    aws dynamodb create-table \
        --table-name "$TABLE_NAME" \
        --attribute-definitions AttributeName=LockID,AttributeType=S \
        --key-schema AttributeName=LockID,KeyType=HASH \
        --billing-mode PAY_PER_REQUEST \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE" \
        --tags Key=Project,Value=CredLink Key=ManagedBy,Value=Terraform Key=Purpose,Value=StateLocking
    
    echo -e "${YELLOW}  Waiting for table to be active...${NC}"
    aws dynamodb wait table-exists \
        --table-name "$TABLE_NAME" \
        --region "$AWS_REGION" \
        --profile "$AWS_PROFILE"
    
    echo -e "${GREEN}✓ DynamoDB table created${NC}"
fi

# Enable point-in-time recovery for DynamoDB
echo -e "${YELLOW}→ Enabling point-in-time recovery for DynamoDB...${NC}"
aws dynamodb update-continuous-backups \
    --table-name "$TABLE_NAME" \
    --point-in-time-recovery-specification PointInTimeRecoveryEnabled=true \
    --region "$AWS_REGION" \
    --profile "$AWS_PROFILE" 2>/dev/null || echo -e "${YELLOW}  (Point-in-time recovery may already be enabled)${NC}"
echo -e "${GREEN}✓ Point-in-time recovery enabled${NC}"

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Remote State Infrastructure Ready!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo ""
echo -e "1. Update backend.tf to use S3 backend:"
echo -e "   ${YELLOW}sed -i.bak 's/backend \"local\"/backend \"s3\"/' backend.tf${NC}"
echo ""
echo -e "2. Uncomment the S3 backend configuration in backend.tf"
echo ""
echo -e "3. Update the bucket name in backend.tf:"
echo -e "   ${YELLOW}bucket = \"$BUCKET_NAME\"${NC}"
echo ""
echo -e "4. Initialize Terraform with state migration:"
echo -e "   ${YELLOW}terraform init -migrate-state${NC}"
echo ""
echo -e "5. Verify remote state is working:"
echo -e "   ${YELLOW}terraform state list${NC}"
echo ""
echo -e "${GREEN}Configuration:${NC}"
echo -e "  Bucket:         ${GREEN}$BUCKET_NAME${NC}"
echo -e "  DynamoDB Table: ${GREEN}$TABLE_NAME${NC}"
echo -e "  Region:         ${GREEN}$AWS_REGION${NC}"
echo -e "  Account ID:     ${GREEN}$AWS_ACCOUNT_ID${NC}"
echo ""
