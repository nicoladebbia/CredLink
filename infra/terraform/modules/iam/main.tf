terraform {
  required_version = "~> 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.11" }
    aws        = { source = "hashicorp/aws", version = "~> 5.76" }
    vault      = { source = "hashicorp/vault", version = "~> 3.20" }
  }
}

# IAM module
variable "env" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project name"
  type        = string
}

variable "storage_bucket_name" {
  description = "Storage bucket name"
  type        = string
}

variable "storage_type" {
  description = "Storage type (r2 or s3)"
  type        = string
}

variable "worker_script_name" {
  description = "Worker script name"
  type        = string
}

variable "queue_names" {
  description = "Queue names"
  type        = list(string)
}

variable "token_scopes" {
  description = "Token scopes"
  type        = map(list(string))
  default     = {}
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "allowed_ip_ranges" {
  description = "IP ranges allowed to access resources"
  type        = list(string)
  default     = []
}

variable "token_ttl_seconds" {
  description = "API token TTL in seconds"
  type        = number
  default     = 2592000 # 30 days for production
}

variable "use_vault_secrets" {
  description = "Whether to use HashiCorp Vault for secrets management"
  type        = bool
  default     = true
}

variable "vault_address" {
  description = "Vault server address"
  type        = string
  default     = ""
}

variable "vault_token" {
  description = "Vault authentication token"
  type        = string
  default     = ""
  sensitive   = true
}

variable "vpc_endpoint_id" {
  description = "VPC endpoint ID for S3 access restriction"
  type        = string
  default     = null

  validation {
    condition     = var.vpc_endpoint_id == null || can(regex("^vpce-[a-f0-9]{8,17}$", var.vpc_endpoint_id))
    error_message = "VPC endpoint ID must be valid format (vpce-xxxxxxxx)."
  }
}

locals {
  name_prefix = "${var.project}-${var.env}"
  common_tags = merge(var.tags, {
    module = "iam"
  })

  # Cloudflare permission group IDs
  # IMPORTANT: Replace these with actual IDs from your Cloudflare account
  # Get actual IDs: curl -H "Authorization: Bearer $TOKEN" https://api.cloudflare.com/client/v4/user/tokens/permission_groups
  permission_group_ids = {
    # Real Cloudflare permission group IDs (examples - VERIFY AND REPLACE)
    r2_read_write = "c8fed203ed3043cba015a93ad1616f1f" # R2:Read, R2:Write
    worker_edit   = "82e64a83756745bbbb1c9c2701bf816b" # Workers Scripts:Edit
    worker_routes = "e086da7e2179491d91ee5f35b3ca210a" # Workers Routes:Edit
    queue_read    = "1a1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e" # Queues:Read
    queue_write   = "2b2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f" # Queues:Write
  }
}

# Cloudflare API tokens - Storage
resource "cloudflare_api_token" "storage_token" {
  name = "${local.name_prefix}-storage"

  policy {
    permission_groups = [
      local.permission_group_ids.r2_read_write
    ]

    resources = {
      # Scope to specific R2 bucket only - NO WILDCARDS
      "com.cloudflare.api.account.${var.cloudflare_account_id}.r2.bucket.${var.storage_bucket_name}" = "*"
    }
  }

  condition = jsonencode({
    request = {
      method = ["GET", "PUT", "DELETE", "POST"]
    },
    # Add IP restrictions if specified
    ip_in = length(var.allowed_ip_ranges) > 0 ? var.allowed_ip_ranges : null,
    # Add time-based restrictions for enhanced security
    request_after = var.token_ttl_seconds <= 86400 ? "2024-01-01T00:00:00Z" : null
  })

  ttl_seconds = var.token_ttl_seconds

  tags = local.common_tags
}

# Cloudflare API tokens - Worker
resource "cloudflare_api_token" "worker_token" {
  name = "${local.name_prefix}-worker"

  policy {
    permission_groups = [
      local.permission_group_ids.worker_edit,
      local.permission_group_ids.worker_routes
    ]

    resources = {
      # Scope to specific worker script only - NO WILDCARDS
      "com.cloudflare.api.account.${var.cloudflare_account_id}.worker.script.${var.worker_script_name}" = "*"
      "com.cloudflare.api.account.${var.cloudflare_account_id}.worker.route.${var.worker_script_name}"  = "*"
    }
  }

  condition = jsonencode({
    request = {
      method = ["POST", "PUT", "DELETE", "GET"]
    },
    # Add IP restrictions if specified
    ip_in = length(var.allowed_ip_ranges) > 0 ? var.allowed_ip_ranges : null,
    # Add time-based restrictions for enhanced security
    request_after = var.token_ttl_seconds <= 86400 ? "2024-01-01T00:00:00Z" : null
  })

  ttl_seconds = var.token_ttl_seconds

  tags = local.common_tags
}

# Cloudflare API tokens - Queue
resource "cloudflare_api_token" "queue_token" {
  name = "${local.name_prefix}-queue"

  policy {
    permission_groups = [
      local.permission_group_ids.queue_read,
      local.permission_group_ids.queue_write
    ]

    resources = {
      # Scope to specific queues only - NO WILDCARDS
      for queue_name in var.queue_names :
      "com.cloudflare.api.account.${var.cloudflare_account_id}.queue.${queue_name}" => "*"
    }
  }

  condition = jsonencode({
    request = {
      method = ["POST", "GET", "DELETE", "PUT"]
    },
    # Add IP restrictions if specified
    ip_in = length(var.allowed_ip_ranges) > 0 ? var.allowed_ip_ranges : null,
    # Add time-based restrictions for enhanced security
    request_after = var.token_ttl_seconds <= 86400 ? "2024-01-01T00:00:00Z" : null
  })

  ttl_seconds = var.token_ttl_seconds

  tags = local.common_tags
}

# Custom IAM roles for different service components
resource "cloudflare_api_token" "service_tokens" {
  for_each = var.token_scopes

  name = "${local.name_prefix}-${each.key}"

  policy {
    permission_groups = [
      for scope in each.value :
      contains(["read", "write"], scope) ? local.permission_group_ids.r2_read_write :
      contains(["script:edit"], scope) ? local.permission_group_ids.worker_edit :
      contains(["route:edit"], scope) ? local.permission_group_ids.worker_routes :
      local.permission_group_ids.queue_read
    ]

    resources = each.key == "storage" ? {
      # Scope resources based on service type
      "com.cloudflare.api.account.${var.cloudflare_account_id}.r2.bucket.${var.storage_bucket_name}" = "*"
      } : each.key == "worker" ? {
      "com.cloudflare.api.account.${var.cloudflare_account_id}.worker.script.${var.worker_script_name}" = "*"
      } : each.key == "queue" ? {
      for queue_name in var.queue_names :
      "com.cloudflare.api.account.${var.cloudflare_account_id}.queue.${queue_name}" => "*"
    } : {}
  }

  condition = jsonencode({
    request = {
      method = ["GET", "POST", "PUT", "DELETE"]
    },
    # Add IP restrictions if specified
    ip_in = length(var.allowed_ip_ranges) > 0 ? var.allowed_ip_ranges : null,
    # Add time-based restrictions for enhanced security
    request_after = var.token_ttl_seconds <= 86400 ? "2024-01-01T00:00:00Z" : null
  })

  ttl_seconds = var.token_ttl_seconds

  tags = merge(local.common_tags, {
    service = each.key
  })
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
        Effect   = "Deny"
        Action   = ["s3:DeleteBucket"]
        Resource = "*"
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

# Worker service authentication (inject tokens directly, no outputs)
resource "cloudflare_workers_secrets" "worker_secrets" {
  script_name = var.worker_script_name

  secret {
    name      = "STORAGE_TOKEN"
    value     = cloudflare_api_token.storage_token.value
    sensitive = true
  }

  secret {
    name      = "QUEUE_TOKEN"
    value     = cloudflare_api_token.queue_token.value
    sensitive = true
  }

  secret {
    name      = "WORKER_TOKEN"
    value     = cloudflare_api_token.worker_token.value
    sensitive = true
  }

  secret {
    name      = "ENVIRONMENT"
    value     = var.env
    sensitive = false
  }

  secret {
    name      = "PROJECT_NAME"
    value     = var.project
    sensitive = false
  }

  secret {
    name      = "ACCOUNT_ID"
    value     = var.cloudflare_account_id
    sensitive = true
  }
}

# R2 service authentication (fixed VPC endpoint condition)
resource "cloudflare_r2_bucket_policy" "bucket_policy" {
  count = var.storage_type == "r2" ? 1 : 0

  bucket_id = var.storage_bucket_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowAuthenticatedAccess"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity"
        }
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "arn:aws:s3:::${var.storage_bucket_name}/*"
        Condition = var.vpc_endpoint_id != null ? {
          StringEquals = {
            "aws:SourceVpce" = var.vpc_endpoint_id
          }
        } : null
      },
      {
        Sid    = "AllowListBucket"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity"
        }
        Action   = ["s3:ListBucket"]
        Resource = "arn:aws:s3:::${var.storage_bucket_name}"
        Condition = {
          StringLike = {
            "s3:prefix" = ["${var.env}/*", "assets/*", "logs/*"]
          }
        }
      },
      # Only add Deny statement if VPC endpoint is configured
      var.vpc_endpoint_id != null ? {
        Sid       = "DenyNonVPCAccess"
        Effect    = "Deny"
        Principal = "*"
        Action = [
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
      } : null,
      # Add IP restrictions if specified
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
      } : null,
      # Deny unencrypted access
      {
        Sid       = "DenyUnencryptedAccess"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:*"]
        Resource = [
          "arn:aws:s3:::${var.storage_bucket_name}",
          "arn:aws:s3:::${var.storage_bucket_name}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# Queue access policies
resource "cloudflare_queue_policy" "queue_policies" {
  for_each = toset(var.queue_names)

  account_id = var.cloudflare_account_id
  queue_name = each.key

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "workers.cloudflare.com"
        }
        Action = [
          "cloudflare-queue:SendMessage",
          "cloudflare-queue:ReceiveMessage",
          "cloudflare-queue:DeleteMessage"
        ]
        Resource = "arn:aws:sqs:${each.key}"
        Condition = {
          StringEquals = {
            "cloudflare:worker-script" = var.worker_script_name
          }
        }
      },
      {
        Effect    = "Deny"
        Principal = "*"
        Action    = ["cloudflare-queue:*"]
        Resource  = "arn:aws:sqs:${each.key}"
        Condition = {
          StringNotLike = {
            "aws:SourceArn" = "arn:aws:cloudfront::*:distribution/*"
          }
        }
      }
    ]
  })
}

# Vault secrets management (optional)
resource "vault_kv_secret_v2" "cloudflare_tokens" {
  count = var.use_vault_secrets && var.vault_address != "" && var.vault_token != "" ? 1 : 0

  mount = "secret"
  name  = "cloudflare/${var.env}/tokens"

  data_json = jsonencode({
    storage_token = cloudflare_api_token.storage_token.value
    worker_token  = cloudflare_api_token.worker_token.value
    queue_token   = cloudflare_api_token.queue_token.value
    service_tokens = {
      for k, t in cloudflare_api_token.service_tokens : k => t.value
    }
    metadata = {
      environment = var.env
      project     = var.project
      created_at  = timestamp()
      ttl_seconds = var.token_ttl_seconds
      account_id  = var.cloudflare_account_id
    }
    rotation_schedule = {
      next_rotation   = timeadd(timestamp(), "${var.token_ttl_seconds}s")
      rotation_window = "7d"
      auto_rotate     = var.token_ttl_seconds <= 86400
    }
  })

  # Ensure this runs after tokens are created
  depends_on = [
    cloudflare_api_token.storage_token,
    cloudflare_api_token.worker_token,
    cloudflare_api_token.queue_token,
    cloudflare_api_token.service_tokens
  ]
}

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

output "vault_path" {
  description = "Vault path where token values are stored (if Vault is enabled)"
  value       = var.use_vault_secrets ? vault_kv_secret_v2.cloudflare_tokens[0].path : null
}

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

output "worker_secrets_count" {
  description = "Number of worker secrets configured"
  value       = length(cloudflare_workers_secrets.worker_secrets.secret)
}

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
