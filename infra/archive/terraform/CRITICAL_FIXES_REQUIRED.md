# 🔴 CRITICAL SECURITY FIXES REQUIRED - IMMEDIATE ACTION

**Status**: BLOCKING PRODUCTION DEPLOYMENT  
**Priority**: P0 - CRITICAL  
**Timeline**: Must be fixed within 24 hours

---

## ⚠️ DO NOT DEPLOY TO PRODUCTION UNTIL THESE ARE FIXED ⚠️

The following vulnerabilities are **CRITICAL** and will result in:
- Complete IAM bypass
- Credential exposure
- Unauthorized access to all resources
- Potential data breach

---

## 🔴 CRITICAL FIX #1: Replace Placeholder Permission Group IDs

**File**: `infra/terraform/modules/iam/main.tf`  
**Lines**: 66, 93, 120  
**Current Status**: ❌ BROKEN - Using invalid placeholder IDs

### The Problem
```terraform
# CURRENT CODE - DOES NOT WORK
permission_groups = [
  {
    id = "0a000000000000000000000000000000"  # FAKE ID
    included_permissions = lookup(var.token_scopes, "storage", ["read", "write"])
  }
]
```

These IDs are placeholders and **DO NOT EXIST** in Cloudflare. Any tokens created will either:
1. Fail to create
2. Have no permissions
3. Have unpredictable permissions

### Required Fix

You must obtain the actual Cloudflare permission group IDs from your Cloudflare account:

```bash
# Get actual permission group IDs
curl -X GET "https://api.cloudflare.com/client/v4/user/tokens/permission_groups" \
  -H "Authorization: Bearer YOUR_API_TOKEN" \
  -H "Content-Type: application/json"
```

Then update the code:

```terraform
# FIXED CODE - Use actual IDs from your Cloudflare account
resource "cloudflare_api_token" "storage_token" {
  name = "${local.name_prefix}-storage"
  
  policy {
    permission_groups = [
      "c8fed203ed3043cba015a93ad1616f1f"  # R2 Read/Write (EXAMPLE - GET YOUR ACTUAL ID)
    ]
    
    resources = {
      "com.cloudflare.api.account.${var.cloudflare_account_id}" = "*"
    }
  }
  
  condition = {
    request_ip = {
      in = [var.allowed_ip_ranges]  # Add IP restrictions
    }
  }
  
  not_before = timestamp()
  expires_on = timeadd(timestamp(), "720h")  # 30 days
}
```

**Common Cloudflare Permission Group IDs** (verify these for your account):
- R2 Read: `c8fed203ed3043cba015a93ad1616f1f`
- R2 Write: `c8fed203ed3043cba015a93ad1616f1f`
- Workers Script Edit: `82e64a83756745bbbb1c9c2701bf816b`
- Workers Route Edit: `e086da7e2179491d91ee5f35b3ca210a`

---

## 🔴 CRITICAL FIX #2: Remove Token Values from Outputs

**File**: `infra/terraform/modules/iam/main.tf`  
**Lines**: 325-336  
**Current Status**: ❌ LEAKING CREDENTIALS

### The Problem
```terraform
# CURRENT CODE - EXPOSES SECRETS
output "tokens" {
  description = "Generated API tokens"
  value = {
    storage = cloudflare_api_token.storage_token.value  # EXPOSED IN STATE
    worker  = cloudflare_api_token.worker_token.value   # EXPOSED IN STATE
    queue   = cloudflare_api_token.queue_token.value    # EXPOSED IN STATE
  }
  sensitive = true  # NOT ENOUGH - still in state file
}
```

Even with `sensitive = true`, these values are stored in:
- Terraform state file (readable by anyone with access)
- Terraform Cloud/Enterprise logs
- CI/CD system logs
- Local state files in version control

### Required Fix - Option A: Use External Secrets Manager (RECOMMENDED)

```terraform
# Install Vault provider
terraform {
  required_providers {
    vault = {
      source  = "hashicorp/vault"
      version = "~> 3.20"
    }
  }
}

# Store tokens in Vault
resource "vault_kv_secret_v2" "cloudflare_tokens" {
  mount = "secret"
  name  = "cloudflare/${var.env}/tokens"
  
  data_json = jsonencode({
    storage_token = cloudflare_api_token.storage_token.value
    worker_token  = cloudflare_api_token.worker_token.value
    queue_token   = cloudflare_api_token.queue_token.value
  })
}

# Only output token IDs, not values
output "token_ids" {
  description = "API token IDs (not secret values)"
  value = {
    storage = cloudflare_api_token.storage_token.id
    worker  = cloudflare_api_token.worker_token.id
    queue   = cloudflare_api_token.queue_token.id
  }
}

output "vault_path" {
  description = "Vault path where token values are stored"
  value       = vault_kv_secret_v2.cloudflare_tokens.path
}
```

### Required Fix - Option B: Use AWS Secrets Manager

```terraform
# Store in AWS Secrets Manager
resource "aws_secretsmanager_secret" "cloudflare_tokens" {
  name = "${var.project}-${var.env}-cloudflare-tokens"
  
  tags = merge(local.common_tags, {
    security_classification = "confidential"
  })
}

resource "aws_secretsmanager_secret_version" "cloudflare_tokens" {
  secret_id = aws_secretsmanager_secret.cloudflare_tokens.id
  
  secret_string = jsonencode({
    storage_token = cloudflare_api_token.storage_token.value
    worker_token  = cloudflare_api_token.worker_token.value
    queue_token   = cloudflare_api_token.queue_token.value
  })
}

# Only output ARN, not values
output "secrets_arn" {
  description = "AWS Secrets Manager ARN for Cloudflare tokens"
  value       = aws_secretsmanager_secret.cloudflare_tokens.arn
}
```

### Required Fix - Option C: Direct Injection (TEMPORARY ONLY)

```terraform
# REMOVE the output entirely
# output "tokens" { ... }  # DELETE THIS

# Instead, inject directly into Workers Secrets (already done)
resource "cloudflare_workers_secrets" "worker_secrets" {
  script_name = var.worker_script_name
  
  secret {
    name      = "STORAGE_TOKEN"
    value     = cloudflare_api_token.storage_token.value
    sensitive = true
  }
  
  # ... rest of secrets
}

# Workers will get tokens directly, no need to output them
```

---

## 🔴 CRITICAL FIX #3: Remove Wildcard Resource Permissions

**File**: `infra/terraform/modules/iam/main.tf`  
**Lines**: 72, 99, 126  
**Current Status**: ❌ EXCESSIVE PERMISSIONS

### The Problem
```terraform
# CURRENT CODE - TOO PERMISSIVE
resources = {
  "com.cloudflare.api.account.${var.cloudflare_account_id}" = "*"  # ALL RESOURCES
}
```

This grants access to **EVERY RESOURCE** in your Cloudflare account, including:
- All R2 buckets
- All Workers
- All Queues
- All DNS zones
- All analytics data
- All billing information

### Required Fix

```terraform
# FIXED CODE - Scope to specific resources
resource "cloudflare_api_token" "storage_token" {
  name = "${local.name_prefix}-storage"
  
  policy {
    permission_groups = ["c8fed203ed3043cba015a93ad1616f1f"]
    
    resources = {
      # Scope to ONLY the specific R2 bucket
      "com.cloudflare.api.account.${var.cloudflare_account_id}.r2.bucket.${var.storage_bucket_name}" = "*"
    }
  }
  
  # Add IP restrictions
  condition = {
    request_ip = {
      in = [
        "10.0.0.0/8",      # Internal network
        "YOUR.VPC.IP/32"   # Your VPC NAT gateway
      ]
    }
  }
}

resource "cloudflare_api_token" "worker_token" {
  name = "${local.name_prefix}-worker"
  
  policy {
    permission_groups = ["82e64a83756745bbbb1c9c2701bf816b"]
    
    resources = {
      # Scope to ONLY the specific worker script
      "com.cloudflare.api.account.${var.cloudflare_account_id}.worker.script.${var.worker_script_name}" = "*"
    }
  }
}

resource "cloudflare_api_token" "queue_token" {
  name = "${local.name_prefix}-queue"
  
  policy {
    permission_groups = ["queue-read-write-id"]
    
    resources = {
      # Scope to ONLY the specific queues
      for queue_name in var.queue_names :
      "com.cloudflare.api.account.${var.cloudflare_account_id}.queue.${queue_name}" => "*"
    }
  }
}
```

---

## 🔴 CRITICAL FIX #4: Fix VPC Endpoint Condition

**File**: `infra/terraform/modules/iam/main.tf`  
**Line**: 257  
**Current Status**: ❌ INVALID PLACEHOLDER

### The Problem
```terraform
# CURRENT CODE - FAKE VPC ENDPOINT
Condition = {
  StringNotEquals = {
    "aws:SourceVpce" = "vpce-1a2b3c4d"  # DOES NOT EXIST
  }
}
```

This VPC endpoint ID is a placeholder and doesn't exist. The Deny statement will never trigger, allowing access from anywhere.

### Required Fix - Option A: Use Actual VPC Endpoint

```terraform
# Add variable for VPC endpoint
variable "vpc_endpoint_id" {
  description = "VPC endpoint ID for S3 access restriction"
  type        = string
  default     = null
  
  validation {
    condition     = var.vpc_endpoint_id == null || can(regex("^vpce-[a-f0-9]{8,17}$", var.vpc_endpoint_id))
    error_message = "VPC endpoint ID must be valid format (vpce-xxxxxxxx)."
  }
}

# Update bucket policy
resource "cloudflare_r2_bucket_policy" "bucket_policy" {
  count = var.storage_type == "r2" ? 1 : 0
  
  bucket_id = var.storage_bucket_name
  policy    = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowAuthenticatedAccess"
        Effect    = "Allow"
        Principal = {
          AWS = "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity"
        }
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.storage_bucket_name}",
          "arn:aws:s3:::${var.storage_bucket_name}/*"
        ]
      },
      # Only add Deny statement if VPC endpoint is configured
      var.vpc_endpoint_id != null ? {
        Sid       = "DenyNonVPCAccess"
        Effect    = "Deny"
        Principal = "*"
        Action    = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "arn:aws:s3:::${var.storage_bucket_name}/*"
        Condition = {
          StringNotEquals = {
            "aws:SourceVpce" = var.vpc_endpoint_id
          }
        }
      } : null
    ]
  })
}
```

### Required Fix - Option B: Use IP Restrictions Instead

```terraform
# If you don't have a VPC endpoint, use IP restrictions
variable "allowed_ip_ranges" {
  description = "IP ranges allowed to access storage"
  type        = list(string)
  default     = []
}

# Update bucket policy
Statement = [
  {
    Sid       = "AllowAuthenticatedAccess"
    Effect    = "Allow"
    Principal = {
      AWS = "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity"
    }
    Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket"]
    Resource = [
      "arn:aws:s3:::${var.storage_bucket_name}",
      "arn:aws:s3:::${var.storage_bucket_name}/*"
    ]
  },
  length(var.allowed_ip_ranges) > 0 ? {
    Sid       = "DenyNonAllowedIPs"
    Effect    = "Deny"
    Principal = "*"
    Action    = ["s3:*"]
    Resource  = "arn:aws:s3:::${var.storage_bucket_name}/*"
    Condition = {
      NotIpAddress = {
        "aws:SourceIp" = var.allowed_ip_ranges
      }
    }
  } : null
]
```

---

## 📋 VERIFICATION CHECKLIST

Before deploying, verify each fix:

### Fix #1: Permission Group IDs
- [ ] Retrieved actual permission group IDs from Cloudflare API
- [ ] Updated all three token resources (storage, worker, queue)
- [ ] Verified IDs match your Cloudflare account
- [ ] Added IP restrictions to token conditions
- [ ] Set appropriate expiration times

### Fix #2: Token Output Removal
- [ ] Implemented external secrets management (Vault or AWS Secrets Manager)
- [ ] Removed token values from all outputs
- [ ] Updated documentation for secret retrieval process
- [ ] Tested secret injection into Workers
- [ ] Verified state file no longer contains token values

### Fix #3: Resource Scoping
- [ ] Replaced all wildcard resource permissions
- [ ] Scoped storage token to specific bucket only
- [ ] Scoped worker token to specific script only
- [ ] Scoped queue token to specific queues only
- [ ] Added IP-based access restrictions
- [ ] Tested tokens have minimum required permissions

### Fix #4: VPC Endpoint
- [ ] Obtained actual VPC endpoint ID OR removed condition
- [ ] Added validation for VPC endpoint format
- [ ] Made VPC endpoint optional with proper null handling
- [ ] Tested bucket policy applies correctly
- [ ] Verified access is restricted as intended

---

## 🧪 TESTING PROCEDURE

After implementing fixes, run these tests:

```bash
# 1. Validate Terraform configuration
cd infra/terraform/envs/staging
terraform init
terraform validate

# 2. Plan and check for errors
terraform plan -out=security-fixes.tfplan

# 3. Review the plan carefully
terraform show security-fixes.tfplan

# 4. Apply in staging first
terraform apply security-fixes.tfplan

# 5. Test IAM tokens work correctly
./scripts/test-iam-tokens.sh staging

# 6. Verify secrets are not in state
terraform show | grep -i "token.*value" && echo "❌ TOKENS STILL IN STATE" || echo "✅ Tokens not in state"

# 7. Test resource access is properly restricted
./scripts/test-resource-access.sh staging

# 8. Run security scan
tfsec .
checkov -d .

# 9. Only after all tests pass, apply to production
cd ../prod
terraform plan
# Manual review required
terraform apply
```

---

## 🚨 ROLLBACK PROCEDURE

If fixes cause issues:

```bash
# 1. Revert Terraform changes
git revert <commit-hash>

# 2. Re-apply previous working state
terraform apply

# 3. Investigate issues
terraform show
terraform state list

# 4. Fix and re-test
```

---

## 📞 ESCALATION

If you encounter issues implementing these fixes:

1. **DO NOT** deploy to production with current code
2. **DO NOT** ignore these vulnerabilities
3. **DO** reach out to security team immediately
4. **DO** document any blockers or questions

---

## ⏱️ TIMELINE

- **Hour 0-4**: Implement Fix #1 (Permission Group IDs)
- **Hour 4-8**: Implement Fix #2 (Secrets Management)
- **Hour 8-12**: Implement Fix #3 (Resource Scoping)
- **Hour 12-16**: Implement Fix #4 (VPC Endpoint)
- **Hour 16-20**: Testing and validation
- **Hour 20-24**: Documentation and deployment to staging
- **After 24h**: Production deployment (after staging validation)

---

**Last Updated**: November 4, 2025  
**Status**: BLOCKING PRODUCTION  
**Next Review**: After all fixes implemented
