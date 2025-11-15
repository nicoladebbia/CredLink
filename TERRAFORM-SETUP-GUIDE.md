# Terraform Setup Guide - Final Configuration

**Status:** 🟡 **READY - Configuration Required**  
**Estimated Time:** 30-60 minutes  
**Priority:** 🔴 **CRITICAL** - Required for production deployment

---

## 🎯 **What's Already Done** ✅

The following Terraform issues have been **fixed programmatically**:

1. ✅ **Hardcoded Permission Group IDs Removed**
   - Fixed `queue_read` and `queue_write` IDs in `main.tf`
   - Now properly references variables from `cloudflare-permission-groups.auto.tfvars`

2. ✅ **IAM Permissions Scoped**
   - Already using least-privilege principle
   - Proper conditions on S3 policies
   - Account-scoped Cloudflare tokens

3. ✅ **No Sensitive Outputs**
   - Token IDs exposed (not secret values)
   - All sensitive values properly marked
   - Vault paths commented out

4. ✅ **VPC Endpoint Validation**
   - Proper regex validation in `variables.tf`
   - Clear error messages for invalid formats

---

## 🔧 **What Needs Your Input** (30-60 minutes)

### **Step 1: Get Your Cloudflare Credentials** (10 minutes)

You need three pieces of information from Cloudflare:

#### **A. Zone ID** (Your domain)
```bash
# Method 1: From Cloudflare Dashboard
# 1. Log in to https://dash.cloudflare.com
# 2. Select your domain
# 3. Scroll down to "API" section on the right
# 4. Copy "Zone ID"

# Method 2: Using API
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  https://api.cloudflare.com/client/v4/zones | jq -r '.result[] | "\(.name): \(.id)"'
```

**Format:** 32-character hex string  
**Example:** `1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d`

#### **B. Account ID**
```bash
# Method 1: From Cloudflare Dashboard
# 1. Log in to https://dash.cloudflare.com
# 2. Go to any zone
# 3. Look at the URL: https://dash.cloudflare.com/<ACCOUNT_ID>/...
# 4. Or go to Account Home → Right sidebar shows Account ID

# Method 2: Using API
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  https://api.cloudflare.com/client/v4/accounts | jq -r '.result[] | "\(.name): \(.id)"'
```

**Format:** 32-character hex string  
**Example:** `a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6`

#### **C. Permission Group IDs**
```bash
# Get all available permission groups
curl -H "Authorization: Bearer YOUR_API_TOKEN" \
  https://api.cloudflare.com/client/v4/user/tokens/permission_groups | \
  jq -r '.result[] | "\(.name): \(.id)"' | sort

# Look for these specific permissions and copy their IDs:
# - Workers R2 Storage:Read
# - Workers R2 Storage:Edit
# - Workers Scripts:Read
# - Workers Scripts:Edit
# - Workers Routes:Edit
# - Queues:Read
# - Queues:Write
```

**Save the IDs you need** - you'll use them in the next step.

---

### **Step 2: Configure Terraform Variables** (15 minutes)

#### **A. Root Module Variables**

Create or update `/Users/nicoladebbia/Code_Ideas/CredLink/infra/terraform/terraform.tfvars`:

```hcl
# Project Configuration
project = "credlink"
env     = "production"  # or "staging", "dev"
region  = "us-east-1"   # Your AWS region

# Cloudflare Configuration
cloudflare_account_id = "PASTE_YOUR_ACCOUNT_ID_HERE"
cloudflare_zone_id    = "PASTE_YOUR_ZONE_ID_HERE"

# Storage Configuration
storage_type = "r2"  # or "s3" for AWS S3
storage_bucket_name = "credlink-proofs-production"

# Optional: VPC Endpoint (if using)
# vpc_endpoint_id = "vpce-1a2b3c4d"

# Tags
tags = {
  Project     = "CredLink"
  Environment = "production"
  ManagedBy   = "terraform"
  Owner       = "your-team-name"
}
```

#### **B. IAM Module Variables**

The file `/Users/nicoladebbia/Code_Ideas/CredLink/infra/terraform/modules/iam/cloudflare-permission-groups.auto.tfvars` already exists. **Update it** with your real permission group IDs:

```hcl
# Current file location:
# /Users/nicoladebbia/Code_Ideas/CredLink/infra/terraform/modules/iam/cloudflare-permission-groups.auto.tfvars

cloudflare_permission_groups = {
  # REPLACE these with your actual Cloudflare permission group IDs
  # Get them using: curl -H "Authorization: Bearer YOUR_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/permission_groups | jq
  
  r2_read_write = "YOUR_R2_READ_WRITE_PERMISSION_ID"
  worker_edit   = "YOUR_WORKER_EDIT_PERMISSION_ID"
  worker_routes = "YOUR_WORKER_ROUTES_PERMISSION_ID"
  queue_read    = "YOUR_QUEUE_READ_PERMISSION_ID"
  queue_write   = "YOUR_QUEUE_WRITE_PERMISSION_ID"
}
```

**Quick command to update:**
```bash
cd /Users/nicoladebbia/Code_Ideas/CredLink/infra/terraform/modules/iam

# Edit the file
vim cloudflare-permission-groups.auto.tfvars

# Or use sed to replace placeholders
# sed -i '' 's/YOUR_R2_READ_WRITE_PERMISSION_ID/actual-id-here/g' cloudflare-permission-groups.auto.tfvars
```

---

### **Step 3: Validate Configuration** (5 minutes)

```bash
cd /Users/nicoladebbia/Code_Ideas/CredLink/infra/terraform

# Initialize Terraform
terraform init

# Validate syntax
terraform validate

# See what will be created
terraform plan

# Look for errors - should show resources to be created, not errors
```

**Expected Output:**
```
✅ Success! The configuration is valid.
✅ Plan: XX to add, 0 to change, 0 to destroy.
```

---

### **Step 4: Deploy!** (10 minutes)

```bash
cd /Users/nicoladebbia/Code_Ideas/CredLink/infra/terraform

# Apply the configuration
terraform apply

# Review the plan
# Type 'yes' when ready

# Wait for completion (5-10 minutes)
```

**What Gets Created:**
- 🔑 6 Cloudflare API tokens (storage, worker, queue, custom services)
- 🔐 IAM roles and policies for AWS (if using S3)
- 📊 Security metadata outputs
- ✅ Compliance status outputs

---

## 🚨 **Common Issues and Solutions**

### **Issue 1: "Invalid Cloudflare Account ID"**
```
Error: Invalid account ID format
```

**Solution:** Ensure your account ID is a 32-character hex string (0-9, a-f). No dashes or special characters.

```bash
# Verify format
echo "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6" | grep -E '^[a-f0-9]{32}$'
# Should output the ID if valid
```

---

### **Issue 2: "Permission Group ID Not Found"**
```
Error: Permission group ID 'REPLACE_WITH_YOUR...' is invalid
```

**Solution:** You forgot to replace the placeholder IDs. Follow Step 1C above to get real IDs.

---

### **Issue 3: "Insufficient Permissions"**
```
Error: Authentication error
```

**Solution:** Your Cloudflare API token doesn't have the right permissions. Create a new token with:
- Account:Read
- Account Resources:Edit
- API Tokens:Edit

---

### **Issue 4: "VPC Endpoint Invalid"**
```
Error: VPC endpoint ID must be in format 'vpce-XXXXXXXX'
```

**Solution:** Either:
- Remove `vpc_endpoint_id` from `terraform.tfvars` if not using VPC endpoints
- Or provide a valid VPC endpoint ID in format `vpce-XXXXXXXX` (8 hex chars) or `vpce-XXXXXXXXXXXXXXXXX` (17 hex chars)

---

## 📋 **Configuration Checklist**

### **Before You Start:**
- [ ] Have Cloudflare account with active zone
- [ ] Have Cloudflare API token with proper permissions
- [ ] Have AWS credentials configured (if using S3)
- [ ] Have `terraform` CLI installed (v1.9+)

### **Configuration Steps:**
- [ ] Step 1: Retrieved Cloudflare zone ID
- [ ] Step 1: Retrieved Cloudflare account ID
- [ ] Step 1: Retrieved permission group IDs
- [ ] Step 2: Updated `terraform.tfvars`
- [ ] Step 2: Updated `cloudflare-permission-groups.auto.tfvars`
- [ ] Step 3: Ran `terraform init` successfully
- [ ] Step 3: Ran `terraform validate` successfully
- [ ] Step 3: Ran `terraform plan` - no errors
- [ ] Step 4: Ran `terraform apply` - resources created

### **Post-Deployment:**
- [ ] Noted output values (token IDs, role ARNs)
- [ ] Stored sensitive values securely (use `terraform output -json > outputs.json`)
- [ ] Updated application configuration with new token IDs
- [ ] Tested API connectivity
- [ ] Verified Cloudflare tokens work

---

## 🎯 **Quick Start (TL;DR)**

```bash
# 1. Get Cloudflare IDs
curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.cloudflare.com/client/v4/zones | jq -r '.result[0].id'

curl -H "Authorization: Bearer YOUR_TOKEN" \
  https://api.cloudflare.com/client/v4/accounts | jq -r '.result[0].id'

# 2. Update files
cd /Users/nicoladebbia/Code_Ideas/CredLink/infra/terraform
vim terraform.tfvars  # Add zone_id, account_id

cd modules/iam
vim cloudflare-permission-groups.auto.tfvars  # Add permission IDs

# 3. Deploy
cd /Users/nicoladebbia/Code_Ideas/CredLink/infra/terraform
terraform init
terraform validate
terraform plan
terraform apply

# 4. Done! 🎉
```

---

## 🔒 **Security Best Practices**

### **DO:**
✅ Store `terraform.tfvars` in `.gitignore` (already done)  
✅ Use Terraform Cloud or S3 backend for state (setup script ready)  
✅ Enable MFA on Cloudflare account  
✅ Rotate API tokens every 90 days  
✅ Review IAM policies regularly  
✅ Use least-privilege principle  

### **DON'T:**
❌ Commit `.tfvars` files with credentials  
❌ Share API tokens in Slack/email  
❌ Use wildcards in production IAM policies  
❌ Store state files in version control  
❌ Use root account credentials  

---

## 📊 **What This Enables**

Once Terraform is configured and deployed, you'll have:

1. **Secure API Token Management**
   - Separate tokens for storage, workers, queues
   - Proper scoping and least-privilege access
   - Automatic token lifecycle management

2. **Infrastructure as Code**
   - Reproducible deployments
   - Version-controlled infrastructure
   - Easy rollback and disaster recovery

3. **Compliance and Audit**
   - Complete audit trail
   - Security metadata tracking
   - Compliance status reporting

4. **Production Readiness**
   - Enterprise-grade security
   - Scalable architecture
   - Monitoring and alerting

---

## 🆘 **Need Help?**

### **Option 1: Skip Terraform for MVP**
If you want to deploy quickly without Terraform:

```bash
# Manually create Cloudflare API tokens in dashboard
# https://dash.cloudflare.com/profile/api-tokens

# Set environment variables
export CLOUDFLARE_STORAGE_TOKEN="your-token-here"
export CLOUDFLARE_WORKER_TOKEN="your-token-here"
export CLOUDFLARE_QUEUE_TOKEN="your-token-here"

# Deploy application
docker-compose up -d
```

**Pros:** Quick deployment (5 minutes)  
**Cons:** Manual token management, no IaC benefits

### **Option 2: Use Terraform (Recommended)**
Follow this guide (30-60 minutes setup, enterprise-grade result)

### **Option 3: Terraform Cloud**
Use Terraform Cloud for easier state management:
```bash
terraform login
terraform init -migrate-state
```

---

## ✅ **Completion Criteria**

You're done when:
- ✅ `terraform apply` completes without errors
- ✅ All API tokens created in Cloudflare dashboard
- ✅ IAM roles visible in AWS console (if using S3)
- ✅ `terraform output` shows token IDs and ARNs
- ✅ Application can authenticate with Cloudflare

---

## 🎊 **After Completion**

Run this to verify everything works:

```bash
# Check Terraform state
terraform show | grep cloudflare_api_token

# Test Cloudflare connectivity
curl -H "Authorization: Bearer $(terraform output -raw storage_token_value 2>/dev/null || echo $CLOUDFLARE_STORAGE_TOKEN)" \
  https://api.cloudflare.com/client/v4/accounts

# Deploy application
cd /Users/nicoladebbia/Code_Ideas/CredLink
docker-compose up -d

# Test API
curl http://localhost:3000/health
```

**Expected:** ✅ All endpoints return 200 OK

---

**Document Version:** 1.0  
**Last Updated:** November 13, 2025, 4:40 PM UTC-05:00  
**Estimated Time:** 30-60 minutes  
**Status:** 🟡 Ready for configuration  
**Next Step:** Follow Step 1 to get your Cloudflare credentials
