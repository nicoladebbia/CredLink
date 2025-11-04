# 🔐 Secrets Setup Guide

This guide explains how to configure the required secrets for the enhanced security features in your CredLink infrastructure.

---

## 📋 Required Secrets

### **Core Infrastructure Secrets** (Required for deployment)
```bash
# Cloudflare Credentials
CLOUDFLARE_API_TOKEN=your-cloudflare-api-token
CLOUDFLARE_ACCOUNT_ID=your-cloudflare-account-id
CLOUDFLARE_ZONE_ID=your-cloudflare-zone-id

# AWS Credentials
AWS_ACCESS_KEY_ID=your-aws-access-key
AWS_SECRET_ACCESS_KEY=your-aws-secret-key
AWS_DEFAULT_REGION=us-east-1
```

### **Enhanced Security Secrets** (Optional but recommended)
```bash
# HashiCorp Vault Integration
VAULT_TOKEN=your-vault-authentication-token
VAULT_ADDRESS=https://vault.yourcompany.com

# Network Security
ALLOWED_IP_RANGES=10.0.0.0/8,192.168.0.0/16,203.0.113.0/24

# Cost Monitoring
INFRACOST_API_KEY=your-infracost-api-key

# Terraform Cloud (if using remote backend)
TF_API_TOKEN=your-terraform-cloud-token
```

---

## 🔧 Setting Up GitHub Secrets

### **1. Navigate to Repository Settings**
1. Go to your GitHub repository
2. Click on **Settings** → **Secrets and variables** → **Actions**

### **2. Add Required Secrets**

#### **Core Secrets** (Must add these first):
```bash
# Cloudflare API Token
Name: CLOUDFLARE_API_TOKEN
Value: [Your Cloudflare API token with R2, Workers, and Queue permissions]

# Cloudflare Account ID  
Name: CLOUDFLARE_ACCOUNT_ID
Value: [Your 32-character Cloudflare account ID]

# Cloudflare Zone ID
Name: CLOUDFLARE_ZONE_ID  
Value: [Your Cloudflare zone ID]

# AWS Access Key ID
Name: AWS_ACCESS_KEY_ID
Value: [Your AWS IAM access key ID]

# AWS Secret Access Key
Name: AWS_SECRET_ACCESS_KEY
Value: [Your AWS IAM secret access key]

# AWS Default Region
Name: AWS_DEFAULT_REGION
Value: us-east-1
```

#### **Optional Security Secrets** (Add when ready):
```bash
# Vault Token
Name: VAULT_TOKEN
Value: [Your HashiCorp Vault token]

# Vault Address
Name: VAULT_ADDRESS
Value: https://vault.yourcompany.com

# Allowed IP Ranges
Name: ALLOWED_IP_RANGES
Value: 10.0.0.0/8,192.168.0.0/16

# Infracost API Key
Name: INFRACOST_API_KEY
Value: [Your Infracost API key]

# Terraform Cloud Token
Name: TF_API_TOKEN
Value: [Your Terraform Cloud API token]
```

---

## 🔑 Getting Required Values

### **Cloudflare API Token**
1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)
2. Click **Create Token**
3. Use **Custom token** with these permissions:
   - **Zone:Zone:Read**
   - **Zone:DNS:Edit** 
   - **Account:Cloudflare R2:Edit**
   - **Account:Account Settings:Read**
   - **User:User Details:Read**
   - **Zone:Page Rules:Edit**
   - **Account:Cloudflare Queues:Edit**

### **Cloudflare Account ID**
1. In Cloudflare Dashboard, scroll to right sidebar
2. Copy **Account ID** (32-character string)

### **Cloudflare Zone ID**
1. In Cloudflare Dashboard, select your domain
2. Scroll to right sidebar  
3. Copy **Zone ID** (32-character string)

### **AWS Credentials**
1. Go to [AWS IAM Console](https://console.aws.amazon.com/iam/)
2. Create a new IAM user with programmatic access
3. Attach these policies:
   - `AmazonS3FullAccess` (for S3 operations)
   - `AmazonCloudWatchFullAccess` (for monitoring)
   - `AWSKeyManagementServicePowerUser` (for KMS)
   - `CloudWatchLogsFullAccess` (for logging)

### **Vault Setup** (Optional)
1. Deploy HashiCorp Vault or use Vault Cloud
2. Enable KV secrets engine:
   ```bash
   vault secrets enable -path=secret kv-v2
   ```
3. Create a token with appropriate permissions
4. Add Vault address and token to GitHub secrets

---

## 🚀 Deployment Steps

### **1. Minimal Deployment** (Core secrets only)
```bash
# Add only the required secrets to GitHub
# Uncomment the core environment variables in .github/workflows/terraform-ci.yml

# Deploy to staging
cd infra/terraform/envs/staging
terraform init
terraform plan -var-file=terraform.tfvars.example
terraform apply
```

### **2. Full Security Deployment** (All secrets)
```bash
# Add all secrets including optional ones
# Uncomment all environment variables in .github/workflows/terraform-ci.yml

# Deploy with full security features
cd infra/terraform/envs/staging
terraform init
terraform plan -var-file=terraform.tfvars.example
terraform apply
```

---

## 🔍 Testing Configuration

### **Verify Core Secrets Work**
```bash
# Test Cloudflare access
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json"

# Test AWS access  
aws sts get-caller-identity
```

### **Verify Optional Secrets**
```bash
# Test Vault access
vault status

# Test IP restrictions (should work from allowed IP)
curl -I https://your-worker.c2concierge.com/api/health
```

---

## ⚠️ Security Considerations

### **Secret Management Best Practices**
1. **Rotate secrets regularly** (every 90 days for API tokens)
2. **Use least privilege** - only grant necessary permissions
3. **Monitor secret usage** in Cloudflare and AWS dashboards
4. **Never commit secrets** to version control
5. **Use separate secrets** for different environments

### **Access Control**
- Limit who can modify GitHub repository secrets
- Use GitHub Organizations for enterprise access control
- Enable audit logging for secret access
- Implement IP restrictions for API access

### **Monitoring**
- Monitor Cloudflare API token usage
- Set up AWS CloudTrail for API auditing  
- Enable GitHub audit logs for secret access
- Set up alerts for unusual secret usage patterns

---

## 🛠️ Troubleshooting

### **Common Issues**

#### **"Context access might be invalid" warnings**
- **Cause**: Secret referenced but not added to repository
- **Fix**: Add the secret to GitHub repository settings
- **Temporary**: Comment out the environment variable until secret is added

#### **"Unable to resolve action" errors**
- **Cause**: GitHub Action version or repository changed
- **Fix**: Update to latest stable version (e.g., `@master` instead of `@v1`)

#### **Permission denied errors**
- **Cause**: Insufficient permissions in API tokens
- **Fix**: Update token permissions in Cloudflare/AWS dashboards

#### **Region/endpoint errors**
- **Cause**: Incorrect region or service endpoints
- **Fix**: Verify AWS region and Cloudflare account settings

---

## 📞 Support

If you encounter issues with secret setup:

1. **Check the logs** in GitHub Actions runs
2. **Verify permissions** in Cloudflare and AWS dashboards  
3. **Test API access** manually using curl/AWS CLI
4. **Review this guide** for missing configuration steps

For additional help:
- Infrastructure team: infra@c2concierge.com
- Security team: security@c2concierge.com

---

**Last Updated**: November 4, 2025  
**Version**: 1.0  
**Status**: Production Ready
