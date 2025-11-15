# Terraform Remote State Setup Guide

## Current Status

⚠️ **Currently using LOCAL backend** - This is NOT suitable for production!

### Local Backend Limitations

| Issue | Impact | Risk Level |
|-------|--------|------------|
| No team collaboration | Only one person can work on infrastructure | 🔴 HIGH |
| No state locking | Concurrent changes corrupt state | 🔴 CRITICAL |
| No backup | State loss = infrastructure loss | 🔴 CRITICAL |
| No versioning | Can't rollback changes | 🟡 MEDIUM |
| Manual process | Human error prone | 🟡 MEDIUM |

---

## ✅ Solution: S3 Remote State with DynamoDB Locking

### Benefits

✅ **Encrypted storage** - State encrypted at rest with AES-256  
✅ **State versioning** - 90-day version retention for rollback  
✅ **State locking** - DynamoDB prevents concurrent modifications  
✅ **Team collaboration** - Multiple team members can safely work  
✅ **Automatic backup** - S3 versioning provides built-in backups  
✅ **Audit trail** - S3 logging tracks all state access  

---

## 🚀 Quick Setup (5 minutes)

### Option 1: Automated Setup (Recommended)

```bash
# From infra/terraform directory
./setup-remote-state.sh

# Follow the on-screen instructions
```

### Option 2: Manual Setup

#### Step 1: Create Infrastructure

```bash
# Set your AWS account ID
export AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
export BUCKET_NAME="credlink-terraform-state-${AWS_ACCOUNT_ID}"

# Create S3 bucket
aws s3api create-bucket \
  --bucket "$BUCKET_NAME" \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket "$BUCKET_NAME" \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket "$BUCKET_NAME" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      },
      "BucketKeyEnabled": true
    }]
  }'

# Block public access
aws s3api put-public-access-block \
  --bucket "$BUCKET_NAME" \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# Create DynamoDB table for locking
aws dynamodb create-table \
  --table-name credlink-terraform-locks \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

#### Step 2: Enable S3 Backend

Edit `backend.tf`:

1. **Comment out** the local backend:
```hcl
# terraform {
#   backend "local" {
#     path = "./terraform.tfstate"
#   }
# }
```

2. **Uncomment** the S3 backend:
```hcl
terraform {
  backend "s3" {
    bucket         = "credlink-terraform-state-002893232481"  # Update with your account ID
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "credlink-terraform-locks"
    workspace_key_prefix = "workspaces"
  }
}
```

#### Step 3: Migrate State

```bash
# Initialize with state migration
terraform init -migrate-state

# Terraform will ask to copy state to new backend
# Type "yes" to confirm
```

#### Step 4: Verify

```bash
# Verify state is in S3
aws s3 ls s3://credlink-terraform-state-${AWS_ACCOUNT_ID}/production/

# Verify Terraform can read state
terraform state list

# Test locking
terraform plan  # Should acquire and release lock automatically
```

---

## 🔒 Security Features

### Encryption

| Component | Encryption Type | Details |
|-----------|----------------|---------|
| S3 Bucket | AES-256 | Server-side encryption at rest |
| State File | AES-256 | Encrypted before upload |
| DynamoDB | AES-256 | Encrypted at rest |
| Transit | TLS 1.2+ | All API calls encrypted in transit |

### Access Control

**Recommended IAM Policy for Terraform:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetBucketVersioning"
      ],
      "Resource": "arn:aws:s3:::credlink-terraform-state-*"
    },
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": "arn:aws:s3:::credlink-terraform-state-*/*/terraform.tfstate"
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:GetItem",
        "dynamodb:PutItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/credlink-terraform-locks"
    }
  ]
}
```

### Versioning & Lifecycle

- **Version Retention:** 90 days for old versions
- **Lifecycle Policy:** Automatically deletes versions older than 90 days
- **Point-in-Time Recovery:** Enabled on DynamoDB table
- **Multipart Upload Cleanup:** Aborts incomplete uploads after 7 days

---

## 🛠️ Troubleshooting

### Issue: Lock Timeout

**Symptom:** `Error acquiring the state lock`

**Solution:**
```bash
# Check for stale locks
aws dynamodb scan \
  --table-name credlink-terraform-locks \
  --region us-east-1

# Remove stale lock (use actual LockID from scan)
aws dynamodb delete-item \
  --table-name credlink-terraform-locks \
  --key '{"LockID": {"S": "credlink-terraform-state-ACCOUNT_ID/production/terraform.tfstate"}}'
```

### Issue: State Corruption

**Symptom:** `Error refreshing state: state data in S3 does not have the expected content`

**Solution:**
```bash
# List available versions
aws s3api list-object-versions \
  --bucket credlink-terraform-state-${AWS_ACCOUNT_ID} \
  --prefix production/terraform.tfstate

# Restore previous version (use VersionId from list)
aws s3api copy-object \
  --bucket credlink-terraform-state-${AWS_ACCOUNT_ID} \
  --copy-source credlink-terraform-state-${AWS_ACCOUNT_ID}/production/terraform.tfstate?versionId=VERSION_ID \
  --key production/terraform.tfstate
```

### Issue: Permission Denied

**Symptom:** `Error: error configuring S3 Backend: AccessDenied`

**Solution:**
```bash
# Verify IAM permissions
aws sts get-caller-identity

# Test bucket access
aws s3 ls s3://credlink-terraform-state-${AWS_ACCOUNT_ID}/

# Test DynamoDB access
aws dynamodb describe-table --table-name credlink-terraform-locks
```

---

## 📊 Cost Estimates

| Component | Usage | Cost (Monthly) |
|-----------|-------|----------------|
| S3 Storage | <1GB state | ~$0.02 |
| S3 Requests | ~100 operations | ~$0.01 |
| S3 Versioning | 90 days retention | ~$0.05 |
| DynamoDB | On-demand, <100 requests | ~$0.01 |
| **Total** | | **~$0.10/month** |

💡 **Cost is negligible** compared to benefits of state management!

---

## 🔄 Multi-Environment Setup

### Using Workspaces

```bash
# Create workspaces for different environments
terraform workspace new dev
terraform workspace new staging
terraform workspace new production

# Switch between environments
terraform workspace select production

# State files are stored as:
# s3://bucket/workspaces/dev/terraform.tfstate
# s3://bucket/workspaces/staging/terraform.tfstate
# s3://bucket/workspaces/production/terraform.tfstate
```

### Using Separate State Files

Alternative approach in `backend.tf`:

```hcl
terraform {
  backend "s3" {
    bucket = "credlink-terraform-state-${var.aws_account_id}"
    key    = "${var.environment}/terraform.tfstate"  # dev, staging, prod
    region = "us-east-1"
    encrypt = true
    dynamodb_table = "credlink-terraform-locks"
  }
}
```

---

## ✅ Checklist

Before going to production, verify:

- [ ] S3 bucket created with versioning enabled
- [ ] S3 encryption enabled (AES-256 minimum)
- [ ] S3 public access blocked
- [ ] S3 lifecycle policy configured (90-day retention)
- [ ] DynamoDB table created for locking
- [ ] DynamoDB point-in-time recovery enabled
- [ ] IAM policies configured with least privilege
- [ ] State successfully migrated from local to S3
- [ ] `terraform plan` acquires and releases lock correctly
- [ ] Team members can access remote state
- [ ] Backup and recovery procedure documented
- [ ] Cost alerts configured (optional but recommended)

---

## 📚 Additional Resources

- [Terraform S3 Backend Documentation](https://www.terraform.io/docs/language/settings/backends/s3.html)
- [Best Practices for Terraform State](https://www.terraform.io/docs/language/state/best-practices.html)
- [AWS S3 Security Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html)

---

**Last Updated:** November 13, 2025  
**Status:** Documentation complete, awaiting setup execution
