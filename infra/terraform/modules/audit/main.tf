terraform {
  required_version = ">= 1.0"
  required_providers {
    cloudflare = {
      source  = "cloudflare/cloudflare"
      version = "~> 5.11"
    }
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.76"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.39"
    }
    archive = {
      source  = "hashicorp/archive"
      version = "~> 2.0"
    }
  }
}

# Audit logging module
variable "env" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project name"
  type        = string
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

variable "retention_days" {
  description = "Log retention period in days"
  type        = number
  default     = 2555 # 7 years for compliance
}

variable "log_bucket_name" {
  description = "S3 bucket name for audit logs"
  type        = string
}

variable "enable_cloudflare_audit" {
  description = "Enable Cloudflare audit logging"
  type        = bool
  default     = true
}

variable "enable_aws_audit" {
  description = "Enable AWS audit logging"
  type        = bool
  default     = true
}

variable "enable_real_time_alerts" {
  description = "Enable real-time security alerts"
  type        = bool
  default     = true
}

variable "alert_email" {
  description = "Email for security alerts"
  type        = string
  default     = ""
}

variable "alert_webhook" {
  description = "Webhook URL for security alerts"
  type        = string
  default     = ""
}

variable "vpc_id" {
  description = "VPC ID for Lambda function deployment"
  type        = string
  default     = ""
}

variable "lambda_subnet_ids" {
  description = "List of subnet IDs for Lambda function deployment"
  type        = list(string)
  default     = []
}



locals {
  name_prefix = "${var.project}-${var.env}"
  common_tags = merge({
    module     = "audit"
    compliance = "required"
  })
}

# S3 bucket for audit logs
resource "aws_s3_bucket" "audit_logs" {
  count = var.enable_aws_audit ? 1 : 0

  bucket = var.log_bucket_name

  tags = merge(local.common_tags, {
    purpose        = "audit-logging"
    retention_days = var.retention_days
  })
}

# S3 bucket versioning for audit logs
resource "aws_s3_bucket_versioning" "audit_logs" {
  count = var.enable_aws_audit ? 1 : 0

  bucket = aws_s3_bucket.audit_logs[0].id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 bucket encryption for audit logs
resource "aws_s3_bucket_server_side_encryption_configuration" "audit_logs" {
  count = var.enable_aws_audit ? 1 : 0

  bucket = aws_s3_bucket.audit_logs[0].id

  rule {
    apply_server_side_encryption_by_default {
      kms_master_key_id = aws_kms_key.audit_logs[0].arn
      sse_algorithm     = "aws:kms"
    }
    bucket_key_enabled = true
  }
}

# KMS key for audit log encryption
resource "aws_kms_key" "audit_logs" {
  count = var.enable_aws_audit ? 1 : 0

  description             = "KMS key for audit log encryption"
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
        Sid    = "Allow CloudTrail to encrypt logs"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
        Action = [
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(local.common_tags, {
    purpose = "audit-encryption"
  })
}

resource "aws_kms_alias" "audit_logs" {
  count = var.enable_aws_audit ? 1 : 0

  name          = "alias/${local.name_prefix}-audit-logs"
  target_key_id = aws_kms_key.audit_logs[0].key_id
}

# S3 bucket public access block for audit logs
resource "aws_s3_bucket_public_access_block" "audit_logs" {
  count = var.enable_aws_audit ? 1 : 0

  bucket = aws_s3_bucket.audit_logs[0].id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# S3 bucket lifecycle for audit logs
resource "aws_s3_bucket_lifecycle_configuration" "audit_logs" {
  count = var.enable_aws_audit ? 1 : 0

  bucket = aws_s3_bucket.audit_logs[0].id

  rule {
    id     = "audit_log_retention"
    status = "Enabled"

    filter {
      prefix = "cloudtrail/"
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
      days = var.retention_days
    }

    # Abort incomplete multipart uploads after 7 days
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

# SNS Topic for CloudTrail notifications
resource "aws_sns_topic" "cloudtrail_notifications" {
  count = var.enable_aws_audit ? 1 : 0

  name              = "${local.name_prefix}-cloudtrail-alerts"
  kms_master_key_id = aws_kms_key.audit_logs[0].arn

  tags = merge(local.common_tags, {
    purpose = "cloudtrail-notifications"
  })
}

# CloudTrail for audit logging
resource "aws_cloudtrail" "audit_trail" {
  count = var.enable_aws_audit ? 1 : 0

  name                          = "${local.name_prefix}-audit-trail"
  s3_bucket_name                = aws_s3_bucket.audit_logs[0].id
  s3_key_prefix                 = "cloudtrail/"
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true

  # KMS encryption for CloudTrail logs
  kms_key_id = aws_kms_key.audit_logs[0].arn

  # SNS topic for notifications
  sns_topic_name = aws_sns_topic.cloudtrail_notifications[0].name

  # Enable CloudWatch logging for CloudTrail
  cloud_watch_logs_group_arn = "${aws_cloudwatch_log_group.audit_logs[0].arn}:*"
  cloud_watch_logs_role_arn  = aws_iam_role.cloudtrail_role[0].arn

  event_selector {
    read_write_type           = "All"
    include_management_events = true

    data_resource {
      type   = "AWS::S3::Object"
      values = ["${aws_s3_bucket.audit_logs[0].arn}/"]
    }
  }

  tags = local.common_tags
}

# CloudWatch Log Group for structured logs
resource "aws_cloudwatch_log_group" "audit_logs" {
  count = var.enable_aws_audit ? 1 : 0

  name              = "/aws/${local.name_prefix}/audit"
  retention_in_days = var.retention_days

  # KMS encryption for log data
  kms_key_id = aws_kms_key.audit_logs[0].arn

  tags = local.common_tags
}

# Kinesis Firehose for real-time log processing
resource "aws_kinesis_firehose_delivery_stream" "audit_stream" {
  count = var.enable_aws_audit && var.enable_real_time_alerts ? 1 : 0

  name        = "${local.name_prefix}-audit-stream"
  destination = "extended_s3"

  # KMS encryption for the delivery stream
  kms_encryption_configuration {
    aws_kms_key_arn = aws_kms_key.audit_logs[0].arn
  }

  extended_s3_configuration {
    bucket_arn = aws_s3_bucket.audit_logs[0].arn
    role_arn   = aws_iam_role.firehose_role[0].arn
    prefix     = "real-time/"

    buffering_size     = 5
    buffering_interval = 300

    # S3 encryption configuration
    s3_backup_configuration {
      bucket_arn     = aws_s3_bucket.audit_logs[0].arn
      role_arn       = aws_iam_role.firehose_role[0].arn
      s3_backup_mode = "AllDocuments"

      kms_encryption_configuration {
        aws_kms_key_arn = aws_kms_key.audit_logs[0].arn
      }
    }

    cloudwatch_logging_options {
      enabled         = true
      log_group_name  = aws_cloudwatch_log_group.audit_logs[0].name
      log_stream_name = "firehose-audit-stream"
    }
  }

  tags = local.common_tags
}

# IAM role for Firehose
resource "aws_iam_role" "firehose_role" {
  count = var.enable_aws_audit && var.enable_real_time_alerts ? 1 : 0

  name = "${local.name_prefix}-firehose-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "firehose.amazonaws.com"
        }
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "firehose_policy" {
  count = var.enable_aws_audit && var.enable_real_time_alerts ? 1 : 0

  name = "${local.name_prefix}-firehose-policy"
  role = aws_iam_role.firehose_role[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:AbortMultipartUpload",
          "s3:GetBucketLocation",
          "s3:ListBucket",
          "s3:ListBucketMultipartUploads",
          "s3:PutObject"
        ]
        Resource = [
          aws_s3_bucket.audit_logs[0].arn,
          "${aws_s3_bucket.audit_logs[0].arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "logs:PutLogEvents",
          "logs:CreateLogStream",
          "logs:CreateLogGroup"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = [aws_kms_key.audit_logs[0].arn]
      }
    ]
  })
}

# IAM role for CloudTrail CloudWatch logging
resource "aws_iam_role" "cloudtrail_role" {
  count = var.enable_aws_audit ? 1 : 0

  name = "${local.name_prefix}-cloudtrail-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "cloudtrail.amazonaws.com"
        }
      }
    ]
  })

  tags = merge(local.common_tags, {
    purpose = "cloudtrail-logging"
  })
}

resource "aws_iam_role_policy" "cloudtrail_logging_policy" {
  count = var.enable_aws_audit ? 1 : 0
  role  = aws_iam_role.cloudtrail_role[0].id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.audit_logs[0].arn}:*"
      }
    ]
  })
}

# Lambda function for real-time security alerts
resource "aws_lambda_function" "security_alerts" {
  count = var.enable_aws_audit && var.enable_real_time_alerts ? 1 : 0

  filename      = "security_alerts.zip"
  function_name = "${local.name_prefix}-security-alerts"
  role          = aws_iam_role.lambda_role[0].arn
  handler       = "index.handler"
  runtime       = "python3.11"
  timeout       = 60

  source_code_hash = data.archive_file.security_alerts[0].output_base64sha256

  # Security configurations
  kms_key_arn = aws_kms_key.audit_logs[0].arn

  environment {
    variables = {
      ALERT_EMAIL   = var.alert_email
      ALERT_WEBHOOK = var.alert_webhook
      LOG_LEVEL     = "INFO"
    }
    kms_key_arn = aws_kms_key.audit_logs[0].arn
  }

  # Disable X-Ray tracing to avoid security concerns
  tracing_config {
    mode = "PassThrough"
  }

  # Configure Dead Letter Queue
  dead_letter_config {
    target_arn = aws_sqs_queue.dlq[0].arn
  }

  # VPC configuration for enhanced security
  vpc_config {
    security_group_ids = [aws_security_group.lambda_sg[0].id]
    subnet_ids         = var.lambda_subnet_ids
  }

  tags = merge(local.common_tags, {
    purpose = "security-monitoring"
  })
}

# Lambda zip file
data "archive_file" "security_alerts" {
  count = var.enable_aws_audit && var.enable_real_time_alerts ? 1 : 0

  type        = "zip"
  source_file = "${path.module}/lambda/security_alerts.py"
  output_path = "security_alerts.zip"
}

# IAM role for Lambda
resource "aws_iam_role" "lambda_role" {
  count = var.enable_aws_audit && var.enable_real_time_alerts ? 1 : 0

  name = "${local.name_prefix}-lambda-security-role"

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

resource "aws_iam_role_policy" "lambda_policy" {
  count = var.enable_aws_audit && var.enable_real_time_alerts ? 1 : 0

  name = "${local.name_prefix}-lambda-security-policy"
  role = aws_iam_role.lambda_role[0].id

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
          "kms:Decrypt"
        ]
        Resource = [aws_kms_key.audit_logs[0].arn]
      }
    ]
  })
}

# EventBridge rule for security events
resource "aws_cloudwatch_event_rule" "security_events" {
  count = var.enable_aws_audit && var.enable_real_time_alerts ? 1 : 0

  name        = "${local.name_prefix}-security-events"
  description = "Capture security-related events"

  event_pattern = jsonencode({
    source      = ["aws.cloudtrail"]
    detail-type = ["AWS API Call via CloudTrail"]
    detail = {
      eventSource = [
        "iam.amazonaws.com",
        "s3.amazonaws.com",
        "kms.amazonaws.com",
        "cloudfront.amazonaws.com"
      ]
      eventName = [
        "DeleteUser",
        "DeleteRole",
        "DeleteBucket",
        "DisableKey",
        "UpdateDistribution"
      ]
    }
  })
}

resource "aws_cloudwatch_event_target" "lambda_target" {
  count = var.enable_aws_audit && var.enable_real_time_alerts ? 1 : 0

  rule      = aws_cloudwatch_event_rule.security_events[0].name
  target_id = "SecurityAlertsLambda"
  arn       = aws_lambda_function.security_alerts[0].arn
}

resource "aws_lambda_permission" "allow_eventbridge" {
  count = var.enable_aws_audit && var.enable_real_time_alerts ? 1 : 0

  statement_id  = "AllowExecutionFromEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.security_alerts[0].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.security_events[0].arn
}

# Dead Letter Queue for Lambda
resource "aws_sqs_queue" "dlq" {
  count = var.enable_aws_audit && var.enable_real_time_alerts ? 1 : 0

  name                       = "${local.name_prefix}-lambda-dlq"
  message_retention_seconds  = 1209600 # 14 days
  visibility_timeout_seconds = 300

  kms_master_key_id       = aws_kms_key.audit_logs[0].arn
  sqs_managed_sse_enabled = false

  tags = merge(local.common_tags, {
    purpose = "lambda-dlq"
  })
}

# Security Group for Lambda
resource "aws_security_group" "lambda_sg" {
  count = var.enable_aws_audit && var.enable_real_time_alerts ? 1 : 0

  name_prefix = "${local.name_prefix}-lambda-"
  description = "Security group for security alerts Lambda"
  vpc_id      = var.vpc_id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(local.common_tags, {
    purpose = "lambda-security"
  })
}

# Cloudflare audit logging (if available)
resource "cloudflare_audit_log" "audit_logs" {
  count = var.enable_cloudflare_audit ? 1 : 0

  account_id = var.cloudflare_account_id

  # Cloudflare audit logging configuration
  # Requires Enterprise plan - configure R2 bucket destinations and log retention
  # Example configuration for production:
  # logpull_enabled = true
  # logpush_jobs = [
  #   {
  #     name = "security-logs"
  #     destination_conf = "s3://your-audit-bucket/path"
  #     fields = ["ClientIP", "ClientRequestHost", "ClientRequestMethod", "ClientRequestURI", "EdgeEndTimestamp", "EdgeResponseBytes", "EdgeResponseStatus", "EdgeStartTimestamp", "RayID"]
  #   }
  # ]
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# Outputs
output "audit_log_bucket_arn" {
  description = "ARN of the audit log S3 bucket"
  value       = var.enable_aws_audit ? aws_s3_bucket.audit_logs[0].arn : null
}

output "audit_log_bucket_name" {
  description = "Name of the audit log S3 bucket"
  value       = var.enable_aws_audit ? aws_s3_bucket.audit_logs[0].id : null
}

output "kms_key_arn" {
  description = "ARN of the KMS key for audit log encryption"
  value       = var.enable_aws_audit ? aws_kms_key.audit_logs[0].arn : null
}

output "cloudtrail_arn" {
  description = "ARN of the CloudTrail"
  value       = var.enable_aws_audit ? aws_cloudtrail.audit_trail[0].arn : null
}

output "lambda_function_arn" {
  description = "ARN of the security alerts Lambda function"
  value       = var.enable_aws_audit && var.enable_real_time_alerts ? aws_lambda_function.security_alerts[0].arn : null
}

output "log_group_name" {
  description = "Name of the CloudWatch log group"
  value       = var.enable_aws_audit ? aws_cloudwatch_log_group.audit_logs[0].name : null
}
