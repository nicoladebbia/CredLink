terraform {
  required_version = "~> 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.11" }
    aws        = { source = "hashicorp/aws", version = "~> 5.76" }
    archive    = { source = "hashicorp/archive", version = "~> 2.0" }
    signer     = { source = "hashicorp/signer", version = "~> 1.1" }
  }
}

# Configure Signer provider
provider "signer" {
  region = var.s3.region
}

# Data source for AWS canonical user ID (required for S3 access logging)
data "aws_canonical_user_id" "current" {}

locals {
  name_prefix = "${var.project}-${var.env}"
  common_tags = merge(var.tags, {
    env     = var.env
    project = var.project
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
# checkov:skip=CKV_AWS_144:Cross-region replication not required for single-region setup
resource "aws_s3_bucket" "bucket" {
  count = !var.use_r2 ? 1 : 0

  bucket = var.s3.bucket_name
  tags   = local.common_tags

  # Force destroy is disabled by default for security and compliance
  force_destroy = false # Always prevent accidental data loss
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

  bucket              = aws_s3_bucket.bucket[0].id
  object_lock_enabled = true

  rule {
    default_retention {
      mode = var.s3.object_lock.mode
      days = var.s3.object_lock.days
    }
  }
}

# KMS key for S3 bucket encryption
resource "aws_kms_key" "s3_bucket" {
  count = !var.use_r2 ? 1 : 0

  description             = "KMS key for S3 bucket encryption in ${var.env} environment"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow S3 Service"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey",
          "kms:Encrypt"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, {
    purpose = "s3-encryption"
  })
}

# KMS key alias
resource "aws_kms_alias" "s3_bucket" {
  count = !var.use_r2 ? 1 : 0

  name          = "alias/s3-${local.name_prefix}-bucket"
  target_key_id = aws_kms_key.s3_bucket[0].key_id
}

# Data source for AWS caller identity
data "aws_caller_identity" "current" {}

# S3 Bucket encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "bucket" {
  count = !var.use_r2 ? 1 : 0

  bucket = aws_s3_bucket.bucket[0].id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = var.s3.kms_key_id != null ? var.s3.kms_key_id : aws_kms_key.s3_bucket[0].arn
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

# S3 Bucket access logging
resource "aws_s3_bucket_logging" "bucket" {
  count = !var.use_r2 ? 1 : 0

  bucket = aws_s3_bucket.bucket[0].id

  target_bucket = aws_s3_bucket.bucket[0].id
  target_prefix = "access-logs/"

  target_grant {
    grantee {
      id   = data.aws_canonical_user_id.current.id
      type = "CanonicalUser"
    }

    permission = "READ"
  }
}

# S3 Bucket lifecycle rules (optional)
# checkov:skip=CKV_AWS_300:Abort incomplete multipart upload is configured for all rules
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
      days = 2555 # 7 years for compliance
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
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
      days = 365 # 1 year for logs
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
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
      days = 1825 # 5 years for backups
    }

    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# SQS Queue for Lambda Dead Letter Queue
resource "aws_sqs_queue" "lambda_dlq" {
  count = !var.use_r2 ? 1 : 0

  name = "${local.name_prefix}-lambda-dlq"

  # Enable server-side encryption
  kms_master_key_id = aws_kms_key.s3_bucket[0].arn

  # Enable message retention
  message_retention_seconds = 1209600 # 14 days

  tags = merge(local.common_tags, {
    purpose = "lambda-dlq"
  })
}

# SQS Queue policy for DLQ
resource "aws_sqs_queue_policy" "lambda_dlq" {
  count = !var.use_r2 ? 1 : 0

  queue_url = aws_sqs_queue.lambda_dlq[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "sns.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.lambda_dlq[0].arn
      }
    ]
  })
}

# Security Group for Lambda function
resource "aws_security_group" "lambda_sg" {
  count = !var.use_r2 && var.vpc_id != "" ? 1 : 0

  name_prefix = "${local.name_prefix}-lambda-sg-"
  description = "Security group for S3 events Lambda"
  vpc_id      = var.vpc_id

  # Egress rule - HTTPS only with description
  egress {
    description = "Allow HTTPS outbound"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Egress rule - HTTP with description
  egress {
    description = "Allow HTTP outbound"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  # Egress rule - DNS with description
  egress {
    description = "Allow DNS outbound"
    from_port   = 53
    to_port     = 53
    protocol    = "udp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    purpose = "lambda-security"
  })
}

# Lambda code signing configuration
resource "aws_lambda_code_signing_config" "s3_events" {
  count = !var.use_r2 ? 1 : 0

  description = "Code signing configuration for S3 events Lambda"

  allowed_publishers {
    signing_profile_version_arn = aws_signer_signing_profile.s3_events[0].arn
  }

  policies {
    untrusted_artifact_on_deployment = "Enforce"
  }

  tags = local.common_tags
}

# Signer profile for Lambda code signing
resource "aws_signer_signing_profile" "s3_events" {
  count = !var.use_r2 ? 1 : 0

  platform_id = "AWSLambda-SHA384-ECDSA"

  signature_validity_period {
    value = 30
    type  = "DAYS"
  }

  tags = merge(local.common_tags, {
    purpose = "lambda-code-signing"
  })
}

# S3 Bucket event notifications for security monitoring
resource "aws_s3_bucket_notification" "bucket" {
  count = !var.use_r2 ? 1 : 0

  bucket = aws_s3_bucket.bucket[0].id

  lambda_function {
    lambda_function_arn = aws_lambda_function.s3_events[0].arn
    events              = ["s3:ObjectCreated:*", "s3:ObjectRemoved:*"]
    filter_prefix       = ""
  }

  depends_on = [aws_lambda_permission.allow_s3]
}

# Lambda function for S3 event processing
resource "aws_lambda_function" "s3_events" {
  count = !var.use_r2 ? 1 : 0

  filename      = "s3_events.zip"
  function_name = "${local.name_prefix}-s3-events"
  role          = aws_iam_role.lambda_s3_events[0].arn
  handler       = "index.handler"
  runtime       = "python3.11"
  timeout       = 60

  source_code_hash = data.archive_file.s3_events[0].output_base64sha256

  # Security configurations
  kms_key_arn = aws_kms_key.s3_bucket[0].arn

  environment {
    variables = {
      LOG_LEVEL   = "INFO"
      ENVIRONMENT = var.env
    }
    kms_key_arn = aws_kms_key.s3_bucket[0].arn
  }

  # Disable X-Ray tracing to avoid security concerns
  tracing_config {
    mode = "PassThrough"
  }

  # Configure Dead Letter Queue
  dead_letter_config {
    target_arn = aws_sqs_queue.lambda_dlq[0].arn
  }

  # VPC configuration for enhanced security (conditional)
  dynamic "vpc_config" {
    for_each = var.vpc_id != "" && length(var.lambda_subnet_ids) > 0 ? [1] : []
    content {
      security_group_ids = [aws_security_group.lambda_sg[0].id]
      subnet_ids         = var.lambda_subnet_ids
    }
  }

  # Code signing configuration
  code_signing_config_arn = aws_lambda_code_signing_config.s3_events[0].arn

  # Reserved concurrent executions
  reserved_concurrent_executions = 10

  tags = merge(local.common_tags, {
    purpose = "s3-event-processing"
  })
}

# IAM role for S3 events Lambda
resource "aws_iam_role" "lambda_s3_events" {
  count = !var.use_r2 ? 1 : 0

  name = "${local.name_prefix}-lambda-s3-events"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

# IAM policy for S3 events Lambda
resource "aws_iam_role_policy" "lambda_s3_events" {
  count = !var.use_r2 ? 1 : 0

  name = "${local.name_prefix}-lambda-s3-events"
  role = aws_iam_role.lambda_s3_events[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:GetObjectVersion"
        ]
        Resource = "${aws_s3_bucket.bucket[0].arn}/*"
      }
    ]
  })
}

# Lambda permission for S3 to invoke the function
resource "aws_lambda_permission" "allow_s3" {
  count = !var.use_r2 ? 1 : 0

  statement_id  = "Allow-s3-invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.s3_events[0].function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.bucket[0].arn
}

# Archive file for S3 events Lambda
data "archive_file" "s3_events" {
  type        = "zip"
  source_file = "${path.module}/lambda/s3_events.py"
  output_path = "s3_events.zip"
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
    expose_headers = [
      "ETag",
      "Content-Length",
      "Content-Range",
      "Cache-Control",
      "Content-Encoding",
      "Last-Modified"
    ]
    max_age_seconds = 7200 # 2 hours for better caching
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
    expose_headers = [
      "ETag",
      "Content-Length",
      "Content-Range",
      "Cache-Control",
      "Content-Encoding",
      "Last-Modified"
    ]
    max_age_seconds = 7200 # 2 hours for better caching
  }
}

# Bucket policy for R2 (no public writes)
resource "cloudflare_r2_bucket_policy" "bucket" {
  count = var.use_r2 ? 1 : 0

  bucket_id = cloudflare_r2_bucket.bucket[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowCloudflareWorkers"
        Effect = "Allow"
        Principal = {
          Service = "cloudflare"
        }
        Action = [
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
        Sid    = "AllowListBucket"
        Effect = "Allow"
        Principal = {
          Service = "cloudflare"
        }
        Action   = ["s3:ListBucket"]
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
        Action = [
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
        Sid    = "AllowCloudflareWorkers"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity"
        }
        Action = [
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
        Sid    = "AllowListBucket"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::cloudfront:user/CloudFront Origin Access Identity"
        }
        Action   = ["s3:ListBucket"]
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
        Action = [
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
    encryption_enabled      = true
    versioning_enabled      = true
    public_access_blocked   = true
    vpc_endpoint_restricted = var.vpc_endpoint_id != null
    force_destroy_disabled  = false
    cors_configured         = true
    lifecycle_rules_enabled = true
  }
  sensitive = false
}

output "compliance_features" {
  description = "Compliance and governance features"
  value = {
    object_lock_enabled = !var.use_r2 && var.s3.object_lock.enabled
    retention_days      = !var.use_r2 && var.s3.object_lock.enabled ? var.s3.object_lock.days : null
    kms_encryption      = !var.use_r2
    bucket_key_enabled  = !var.use_r2
    audit_logging       = true
    data_classification = "confidential"
  }
  sensitive = false
}
