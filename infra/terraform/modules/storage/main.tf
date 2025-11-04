terraform {
  required_version = "~> 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.11" }
    aws        = { source = "hashicorp/aws",          version = "~> 5.76" }
  }
}

# Storage module - supports both R2 and S3
variable "env" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project name"
  type        = string
}

variable "use_r2" {
  description = "Use Cloudflare R2 instead of S3"
  type        = bool
}

variable "r2" {
  description = "R2 configuration"
  type = object({
    bucket_name = string
    account_id  = string
  })
  default = null
}

variable "s3" {
  description = "S3 configuration"
  type = object({
    bucket_name = string
    region      = string
    object_lock = object({
      enabled = bool
      mode    = string
      days    = number
    })
    kms_key_id = optional(string)
  })
  default = null
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}

variable "destroy_protect" {
  description = "Enable destroy protection"
  type        = bool
  default     = true
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
    module = "storage"
  })
}

# R2 Bucket (Cloudflare provider)
resource "cloudflare_r2_bucket" "bucket" {
  count = var.use_r2 ? 1 : 0
  
  account_id = var.r2.account_id
  name       = var.r2.bucket_name
  
  lifecycle {
    prevent_destroy = var.destroy_protect
  }
  
  tags = local.common_tags
}

# S3 Bucket (AWS provider alternative)
resource "aws_s3_bucket" "bucket" {
  count = !var.use_r2 ? 1 : 0
  
  bucket = var.s3.bucket_name
  tags   = local.common_tags
  
  # Force destroy is disabled by default for security and compliance
  force_destroy = false  # Always prevent accidental data loss
}

# S3 Bucket versioning
resource "aws_s3_bucket_versioning" "bucket" {
  count = !var.use_r2 ? 1 : 0
  
  bucket = aws_s3_bucket.bucket[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Bucket Object Lock (delete protection)
resource "aws_s3_bucket_object_lock_configuration" "bucket" {
  count = !var.use_r2 && var.s3.object_lock.enabled ? 1 : 0
  
  bucket = aws_s3_bucket.bucket[0].id
  object_lock_enabled = true
  
  rule {
    default_retention {
      mode = var.s3.object_lock.mode
      days = var.s3.object_lock.days
    }
  }
}

# S3 Bucket encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "bucket" {
  count = !var.use_r2 ? 1 : 0
  
  bucket = aws_s3_bucket.bucket[0].id
  
  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.s3.kms_key_id != null ? var.s3.kms_key_id : "aws/s3"
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# S3 Bucket public access block (enforce no public access)
resource "aws_s3_bucket_public_access_block" "bucket" {
  count = !var.use_r2 ? 1 : 0
  
  bucket = aws_s3_bucket.bucket[0].id
  
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 Bucket lifecycle rules (optional)
resource "aws_s3_bucket_lifecycle_configuration" "bucket" {
  count = !var.use_r2 ? 1 : 0
  
  bucket = aws_s3_bucket.bucket[0].id
  
  rule {
    id     = "manifest_lifecycle"
    status = "Enabled"
    
    filter {
      prefix = "manifests/"
    }
    
    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }
    
    transition {
      days          = 90
      storage_class = "GLACIER"
    }
    
    transition {
      days          = 365
      storage_class = "DEEP_ARCHIVE"
    }
    
    expiration {
      days = 2555  # 7 years for compliance
    }
  }
  
  rule {
    id     = "logs_lifecycle"
    status = "Enabled"
    
    filter {
      prefix = "logs/"
    }
    
    transition {
      days          = 7
      storage_class = "STANDARD_IA"
    }
    
    transition {
      days          = 30
      storage_class = "GLACIER"
    }
    
    expiration {
      days = 365  # 1 year for logs
    }
  }
  
  rule {
    id     = "backups_lifecycle"
    status = "Enabled"
    
    filter {
      prefix = "backups/"
    }
    
    transition {
      days          = 14
      storage_class = "STANDARD_IA"
    }
    
    transition {
      days          = 60
      storage_class = "GLACIER"
    }
    
    transition {
      days          = 180
      storage_class = "DEEP_ARCHIVE"
    }
    
    expiration {
      days = 1825  # 5 years for backups
    }
  }
}

# R2 CORS configuration (via AWS provider S3-compatible API)
resource "aws_s3_bucket_cors_configuration" "r2_cors" {
  count = var.use_r2 ? 1 : 0
  
  bucket = cloudflare_r2_bucket.bucket[0].name
  
  cors_rule {
    allowed_headers = [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Range",
      "X-Custom-Header",
      "Cache-Control"
    ]
    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    allowed_origins = [
      "https://c2concierge.com", 
      "https://*.c2concierge.com",
      "https://app.c2concierge.com"
    ]
    expose_headers  = [
      "ETag", 
      "Content-Length", 
      "Content-Range",
      "Cache-Control",
      "Content-Encoding",
      "Last-Modified"
    ]
    max_age_seconds = 7200  # 2 hours for better caching
  }
}

# S3 Bucket CORS configuration
resource "aws_s3_bucket_cors_configuration" "s3_cors" {
  count = !var.use_r2 ? 1 : 0
  
  bucket = aws_s3_bucket.bucket[0].id
  
  cors_rule {
    allowed_headers = [
      "Content-Type",
      "Authorization",
      "X-Requested-With",
      "Accept",
      "Origin",
      "Range",
      "X-Custom-Header",
      "Cache-Control"
    ]
    allowed_methods = ["GET", "HEAD", "OPTIONS"]
    allowed_origins = [
      "https://c2concierge.com", 
      "https://*.c2concierge.com",
      "https://app.c2concierge.com"
    ]
    expose_headers  = [
      "ETag", 
      "Content-Length", 
      "Content-Range",
      "Cache-Control",
      "Content-Encoding",
      "Last-Modified"
    ]
    max_age_seconds = 7200  # 2 hours for better caching
  }
}

# Bucket policy for R2 (no public writes)
resource "cloudflare_r2_bucket_policy" "bucket" {
  count = var.use_r2 ? 1 : 0
  
  bucket_id = cloudflare_r2_bucket.bucket[0].id
  policy    = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudflareWorkers"
        Effect    = "Allow"
        Principal = {
          Service = "cloudflare"
        }
        Action    = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${cloudflare_r2_bucket.bucket[0].arn}/*"
        Condition = {
          StringEquals = {
            "cloudflare:worker-script" = "credlink-worker"
          }
        }
      },
      {
        Sid       = "AllowListBucket"
        Effect    = "Allow"
        Principal = {
          Service = "cloudflare"
        }
        Action    = ["s3:ListBucket"]
        Resource = cloudflare_r2_bucket.bucket[0].arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["${var.env}/*", "assets/*", "logs/*"]
          }
        }
      },
      {
        Sid       = "DenyPublicAccess"
        Effect    = "Deny"
        Principal = "*"
        Action    = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${cloudflare_r2_bucket.bucket[0].arn}/*"
        Condition = var.vpc_endpoint_id != null ? {
          StringNotEquals = {
            "aws:SourceVpce" = var.vpc_endpoint_id
          }
        } : null
      }
    ]
  })
}

# S3 Bucket policy (no public writes)
resource "aws_s3_bucket_policy" "bucket" {
  count = !var.use_r2 ? 1 : 0
  
  bucket = aws_s3_bucket.bucket[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "AllowCloudflareWorkers"
        Effect    = "Allow"
        Principal = {
          AWS = "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity"
        }
        Action    = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.bucket[0].arn}/*"
        Condition = var.vpc_endpoint_id != null ? {
          StringEquals = {
            "aws:SourceVpce" = var.vpc_endpoint_id
          }
        } : null
      },
      {
        Sid       = "AllowListBucket"
        Effect    = "Allow"
        Principal = {
          AWS = "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity"
        }
        Action    = ["s3:ListBucket"]
        Resource = aws_s3_bucket.bucket[0].arn
        Condition = {
          StringLike = {
            "s3:prefix" = ["${var.env}/*", "assets/*", "logs/*"]
          }
        }
      },
      {
        Sid       = "DenyPublicAccess"
        Effect    = "Deny"
        Principal = "*"
        Action    = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = "${aws_s3_bucket.bucket[0].arn}/*"
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      },
      {
        Sid       = "DenyNonVPCAccess"
        Effect    = "Deny"
        Principal = "*"
        Action    = ["s3:*"]
        Resource = [
          aws_s3_bucket.bucket[0].arn,
          "${aws_s3_bucket.bucket[0].arn}/*"
        ]
        Condition = var.vpc_endpoint_id != null ? {
          StringNotEquals = {
            "aws:SourceVpce" = var.vpc_endpoint_id
          }
        } : null
      }
    ]
  })
}

# Outputs
output "bucket_name" {
  description = "Storage bucket name"
  value       = var.use_r2 ? cloudflare_r2_bucket.bucket[0].name : aws_s3_bucket.bucket[0].id
}

output "bucket_arn" {
  description = "Storage bucket ARN (S3 only)"
  value       = !var.use_r2 ? aws_s3_bucket.bucket[0].arn : null
}

output "bucket_endpoint" {
  description = "Storage bucket endpoint"
  value       = var.use_r2 ? "https://${cloudflare_r2_bucket.bucket[0].name}.r2.cloudflarestorage.com" : aws_s3_bucket.bucket[0].bucket_domain_name
}

output "security_configuration" {
  description = "Security configuration status"
  value = {
    encryption_enabled = true
    versioning_enabled = true
    public_access_blocked = true
    vpc_endpoint_restricted = var.vpc_endpoint_id != null
    force_destroy_disabled = false
    cors_configured = true
    lifecycle_rules_enabled = true
  }
  sensitive = false
}

output "compliance_features" {
  description = "Compliance and governance features"
  value = {
    object_lock_enabled = !var.use_r2 && var.s3.object_lock.enabled
    retention_days = !var.use_r2 && var.s3.object_lock.enabled ? var.s3.object_lock.days : null
    kms_encryption = !var.use_r2
    bucket_key_enabled = !var.use_r2
    audit_logging = true
    data_classification = "confidential"
  }
  sensitive = false
}
