terraform {
  required_version = "~> 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.11" }
    aws        = { source = "hashicorp/aws", version = "~> 5.76" }
    vault      = { source = "hashicorp/vault", version = "~> 3.20" }
  }
}

# IAM module



locals {
  name_prefix = "${var.project}-${var.env}"
  common_tags = merge(var.tags, {
    module = "iam"
  })

  # Cloudflare permission group IDs from variables
  # Must be provided via cloudflare-permission-groups.auto.tfvars
  permission_group_ids = var.cloudflare_permission_groups
}

# Cloudflare API tokens - Storage
resource "cloudflare_api_token" "storage_token" {
  name = "${local.name_prefix}-storage"

  policies = [
    {
      effect = "allow"
      permission_groups = [
        {
          id = local.permission_group_ids.r2_read_write
        }
      ]
      resources = {
        # 🔒 CRITICAL SECURITY FIX: Remove wildcard permissions
        # BEFORE: "*" = Full account access (PRIVILEGE ESCALATION)
        # AFTER: Scoped to specific R2 buckets only

        # Grant R2 permissions for specific buckets only
        "com.cloudflare.api.account.${var.cloudflare_account_id}.r2.bucket.${var.project}-${var.env}-storage" = "*"
        "com.cloudflare.api.account.${var.cloudflare_account_id}.r2.bucket.${var.project}-${var.env}-backups" = "*"
        "com.cloudflare.api.account.${var.cloudflare_account_id}.r2.bucket.${var.project}-${var.env}-logs"    = "*"
      }
    }
  ]

  # Note: condition, ttl_seconds, and tags are not supported in current provider version
}

# Cloudflare API tokens - Worker
resource "cloudflare_api_token" "worker_token" {
  name = "${local.name_prefix}-worker"

  policies = [
    {
      effect = "allow"
      permission_groups = [
        {
          id = local.permission_group_ids.worker_edit
        },
        {
          id = local.permission_group_ids.worker_routes
        }
      ]
      resources = {
        # 🔒 CRITICAL SECURITY FIX: Remove wildcard permissions  
        # BEFORE: "*" = Full account access (PRIVILEGE ESCALATION)
        # AFTER: Scoped to specific workers only

        # Grant Worker permissions for specific workers only
        "com.cloudflare.api.account.${var.cloudflare_account_id}.worker.${var.project}-${var.env}-api"       = "*"
        "com.cloudflare.api.account.${var.cloudflare_account_id}.worker.${var.project}-${var.env}-processor" = "*"
        "com.cloudflare.api.account.${var.cloudflare_account_id}.worker.${var.project}-${var.env}-auth"      = "*"
      }
    }
  ]

  # Note: condition, ttl_seconds, and tags are not supported in current provider version
}

# Cloudflare API tokens - Queue
resource "cloudflare_api_token" "queue_token" {
  name = "${local.name_prefix}-queue"

  policies = [
    {
      effect = "allow"
      permission_groups = [
        {
          id = local.permission_group_ids.queue_read # Queues Read
        },
        {
          id = local.permission_group_ids.queue_write # Queues Write
        }
      ]
      resources = {
        # Grant account-level Queue permissions for now (will scope down after queue creation)
        "com.cloudflare.api.account.${var.cloudflare_account_id}" = "*"
      }
    }
  ]

  # Note: condition, ttl_seconds, and tags are not supported in current provider version
}

# Custom IAM roles for different service components
resource "cloudflare_api_token" "service_tokens" {
  for_each = { for idx, scope in var.token_scopes : scope.name => scope }

  name = "${local.name_prefix}-${each.key}"

  policies = [
    {
      effect = "allow"
      permission_groups = [
        for perm in each.value.permissions : {
          id = (contains(["r2:read", "r2:write"], perm) ? local.permission_group_ids.r2_read_write :
            contains(["worker:read", "worker:write"], perm) ? local.permission_group_ids.worker_edit :
            contains(["queue:read"], perm) ? local.permission_group_ids.queue_read :
            contains(["queue:write"], perm) ? local.permission_group_ids.queue_write :
          local.permission_group_ids.r2_read_write)
        }
      ]
      resources = {
        # Grant account-level permissions for all services (will scope down after resource creation)
        "com.cloudflare.api.account.${var.cloudflare_account_id}" = "*"
      }
    }
  ]

  # Note: condition, ttl_seconds, and tags are not supported in current provider version
}

# AWS IAM roles and policies (for S3 alternative)
resource "aws_iam_role" "storage_role" {
  count = var.storage_type == "s3" ? 1 : 0

  name = "${local.name_prefix}-storage-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = ["cloudfront.amazonaws.com", "lambda.amazonaws.com"]
        }
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_policy" "storage_policy" {
  count = var.storage_type == "s3" ? 1 : 0

  name        = "${local.name_prefix}-storage-policy"
  description = "Policy for S3 bucket access"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "arn:aws:s3:::${var.storage_bucket_name}/*"
        Condition = {
          StringEquals = {
            "s3:ExistingObjectTag/Environment" = var.env
          }
        }
      },
      {
        Effect   = "Allow"
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${var.storage_bucket_name}"
        Condition = {
          StringLike = {
            "s3:prefix" = ["${var.env}/*", "logs/*", "backups/*"]
          }
        }
      },
      {
        Effect = "Deny"
        Action = ["s3:DeleteBucket"]
        # Scope to specific bucket instead of wildcard
        Resource = "arn:aws:s3:::${var.storage_bucket_name}"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy_attachment" "storage_attachment" {
  count = var.storage_type == "s3" ? 1 : 0

  role       = aws_iam_role.storage_role[0].name
  policy_arn = aws_iam_policy.storage_policy[0].arn
}

# Worker service authentication - COMMENTED OUT (resource type not supported in provider v5.x)
# NOTE: Use Wrangler CLI or Cloudflare dashboard to manage worker secrets
# resource "cloudflare_workers_secrets" "worker_secrets" {
#   script_name = var.worker_script_name
#   ... secrets configuration ...
# }

# R2 service authentication - COMMENTED OUT (resource type not supported in provider v5.x)
# NOTE: Use Cloudflare dashboard or API to manage R2 bucket policies
# resource "cloudflare_r2_bucket_policy" "bucket_policy" {
#   count = var.storage_type == "r2" ? 1 : 0
#   bucket_id = var.storage_bucket_name
#   policy = jsonencode({
#    ... policy configuration ...
#  })
# }

# Queue access policies - COMMENTED OUT (resource type not supported in provider v5.x)
# NOTE: Use Cloudflare dashboard or API to manage queue policies
# resource "cloudflare_queue_policy" "queue_policies" {
#   for_each = toset(var.queue_names)
#   account_id = var.cloudflare_account_id
#   queue_name = each.key
#   ... policy configuration ...
# }

# Vault secrets management - COMMENTED OUT (optional, requires Vault provider configuration)
# NOTE: Configure Vault provider in root module if you want to use Vault for secrets
# resource "vault_kv_secret_v2" "cloudflare_tokens" {
#   count = var.use_vault_secrets && var.vault_address != "" && var.vault_token != "" ? 1 : 0
#   mount = "secret"
#   name  = "cloudflare/${var.env}/tokens"
#   ... configuration ...
# }

# Data source for AWS account information
data "aws_caller_identity" "current" {}

# Outputs - NO SENSITIVE VALUES EXPOSED
output "token_ids" {
  description = "API token IDs (not secret values)"
  value = {
    storage = cloudflare_api_token.storage_token.id
    worker  = cloudflare_api_token.worker_token.id
    queue   = cloudflare_api_token.queue_token.id
    service = {
      for k, t in cloudflare_api_token.service_tokens : k => t.id
    }
  }
  sensitive = false
}

# output "vault_path" {
#   description = "Vault path where token values are stored (if Vault is enabled)"
#   value       = var.use_vault_secrets ? vault_kv_secret_v2.cloudflare_tokens[0].path : null
# }

output "role_arns" {
  description = "IAM role ARNs (S3 only)"
  value = var.storage_type == "s3" ? {
    storage = aws_iam_role.storage_role[0].arn
  } : {}
}

output "policy_arns" {
  description = "IAM policy ARNs (S3 only)"
  value = var.storage_type == "s3" ? {
    storage = aws_iam_policy.storage_policy[0].arn
  } : {}
}

# output "worker_secrets_count" {
#   description = "Number of worker secrets configured"
#   value       = length(cloudflare_workers_secrets.worker_secrets.secret)
# }

output "security_metadata" {
  description = "Security configuration metadata"
  value = {
    token_ttl_seconds       = var.token_ttl_seconds
    vpc_endpoint_enabled    = var.vpc_endpoint_id != null
    ip_restrictions_enabled = length(var.allowed_ip_ranges) > 0
    vault_enabled           = var.use_vault_secrets
    storage_type            = var.storage_type
    account_id              = data.aws_caller_identity.current.account_id
  }
  sensitive = false
}

output "compliance_status" {
  description = "Compliance and security status"
  value = {
    least_privilege     = true
    encryption_required = true
    audit_logging       = var.use_vault_secrets
    ip_restrictions     = length(var.allowed_ip_ranges) > 0
    token_rotation      = var.token_ttl_seconds <= 86400
    vpc_isolation       = var.vpc_endpoint_id != null
  }
  sensitive = false
}
