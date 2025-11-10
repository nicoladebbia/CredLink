#---------------------------------------------------
# Disaster Recovery - Week 8
#---------------------------------------------------

# Backup Vault for cross-region backup
resource "aws_backup_vault" "disaster_recovery" {
  name          = "${var.project_name}-${var.environment}-dr-vault"
  kms_key_arn   = aws_kms_key.backup.arn
  encryption_key_arn = aws_kms_key.backup.arn

  tags = var.tags
}

# KMS key for backup encryption
resource "aws_kms_key" "backup" {
  description             = "KMS key for disaster recovery backup encryption"
  deletion_window_in_days = 7
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
        Sid    = "Allow AWS Backup"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
        Action = [
          "kms:Decrypt",
          "kms:DescribeKey",
          "kms:Encrypt",
          "kms:GenerateDataKey*",
          "kms:ReEncrypt*"
        ]
        Resource = "*"
      }
    ]
  })

  tags = var.tags
}

resource "aws_kms_alias" "backup" {
  name          = "alias/${var.project_name}-${var.environment}-backup"
  target_key_id = aws_kms_key.backup.key_id
}

# Backup Plan for RDS
resource "aws_backup_plan" "rds" {
  name = "${var.project_name}-${var.environment}-rds-backup-plan"

  rule {
    name              = "daily_backups"
    target_vault_arn  = aws_backup_vault.disaster_recovery.arn
    schedule          = "cron(0 2 ? * * *)"  # Daily at 2 AM UTC

    lifecycle {
      delete_after = 30  # Keep for 30 days
    }

    recovery_point_tags = {
      Environment = var.environment
      Project     = var.project_name
      BackupType  = "Daily"
    }
  }

  rule {
    name              = "weekly_backups"
    target_vault_arn  = aws_backup_vault.disaster_recovery.arn
    schedule          = "cron(0 3 ? * 1 *)"  # Weekly on Sunday at 3 AM UTC

    lifecycle {
      delete_after = 90  # Keep for 90 days
    }

    recovery_point_tags = {
      Environment = var.environment
      Project     = var.project_name
      BackupType  = "Weekly"
    }
  }

  rule {
    name              = "monthly_backups"
    target_vault_arn  = aws_backup_vault.disaster_recovery.arn
    schedule          = "cron(0 4 1 * ? *)"  # Monthly on 1st at 4 AM UTC

    lifecycle {
      delete_after = 365  # Keep for 1 year
    }

    recovery_point_tags = {
      Environment = var.environment
      Project     = var.project_name
      BackupType  = "Monthly"
    }
  }

  tags = var.tags
}

# Backup Selection for RDS
resource "aws_backup_selection" "rds" {
  iam_role_arn = aws_iam_role.backup.arn
  name         = "${var.project_name}-${var.environment}-rds-selection"
  plan_id      = aws_backup_plan.rds.id

  resources = [
    aws_db_instance.main.arn
  ]

  selection_tag {
    type  = "STRING_EQUALS"
    key   = "Environment"
    value = var.environment
  }
}

# Backup Plan for S3
resource "aws_backup_plan" "s3" {
  name = "${var.project_name}-${var.environment}-s3-backup-plan"

  rule {
    name              = "daily_s3_backups"
    target_vault_arn  = aws_backup_vault.disaster_recovery.arn
    schedule          = "cron(0 1 ? * * *)"  # Daily at 1 AM UTC

    lifecycle {
      delete_after = 30  # Keep for 30 days
    }

    recovery_point_tags = {
      Environment = var.environment
      Project     = var.project_name
      BackupType  = "S3-Daily"
    }
  }

  tags = var.tags
}

# Backup Selection for S3
resource "aws_backup_selection" "s3" {
  iam_role_arn = aws_iam_role.backup.arn
  name         = "${var.project_name}-${var.environment}-s3-selection"
  plan_id      = aws_backup_plan.s3.id

  resources = [
    aws_s3_bucket.proofs.arn
  ]

  selection_tag {
    type  = "STRING_EQUALS"
    key   = "Environment"
    value = var.environment
  }
}

# IAM Role for AWS Backup
resource "aws_iam_role" "backup" {
  name = "${var.project_name}-${var.environment}-backup-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "backup_service_role" {
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForBackup"
  role       = aws_iam_role.backup.name
}

#---------------------------------------------------
# Cross-Region Replication - Week 8
#---------------------------------------------------

# S3 bucket for cross-region backup
resource "aws_s3_bucket" "dr_backup" {
  provider = aws.backup_region
  bucket   = "${var.project_name}-${var.environment}-dr-backup-${random_string.bucket_suffix.result}"

  tags = var.tags
}

resource "aws_s3_bucket_versioning" "dr_backup" {
  provider = aws.backup_region
  bucket   = aws_s3_bucket.dr_backup.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "dr_backup" {
  provider = aws.backup_region
  bucket   = aws_s3_bucket.dr_backup.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "dr_backup" {
  provider = aws.backup_region
  bucket   = aws_s3_bucket.dr_backup.id

  rule {
    id     = "backup_lifecycle"
    status = "Enabled"

    transition {
      days          = 30
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = 90
      storage_class = "GLACIER"
    }

    expiration {
      days = 2555  # 7 years
    }
  }
}

# S3 replication configuration
resource "aws_s3_bucket_replication_configuration" "main_to_dr" {
  role   = aws_iam_role.s3_replication.arn
  bucket = aws_s3_bucket.proofs.id

  rule {
    id     = "${var.project_name}_${var.environment}_replication"
    status = "Enabled"

    destination {
      bucket        = aws_s3_bucket.dr_backup.arn
      storage_class = "STANDARD"
      account       = data.aws_caller_identity.backup.account_id
    }

    delete_marker_replication {
      status = "Enabled"
    }
  }
}

# IAM role for S3 replication
resource "aws_iam_role" "s3_replication" {
  name = "${var.project_name}-${var.environment}-s3-replication"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "s3_replication" {
  name = "${var.project_name}-${var.environment}-s3-replication"
  role = aws_iam_role.s3_replication.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetReplicationConfiguration",
          "s3:ListBucket"
        ]
        Resource = [
          aws_s3_bucket.proofs.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObjectVersion",
          "s3:GetObjectVersionAcl",
          "s3:GetObjectVersionTagging"
        ]
        Resource = [
          "${aws_s3_bucket.proofs.arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:ReplicateObject",
          "s3:ReplicateDelete",
          "s3:ReplicateTags"
        ]
        Resource = [
          "${aws_s3_bucket.dr_backup.arn}/*"
        ]
      }
    ]
  })
}

#---------------------------------------------------
# Chaos Engineering - Week 8
#---------------------------------------------------

# Lambda function for chaos experiments
resource "aws_iam_role" "chaos_lambda" {
  name = "${var.project_name}-${var.environment}-chaos-lambda"

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

  tags = var.tags
}

resource "aws_iam_role_policy" "chaos_lambda" {
  name = "${var.project_name}-${var.environment}-chaos-lambda"
  role = aws_iam_role.chaos_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "ecs:UpdateService",
          "ecs:DescribeServices",
          "ecs:ListTasks"
        ]
        Resource = "*"
      },
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
          "cloudwatch:PutMetricData"
        ]
        Resource = "*"
      }
    ]
  })
}

resource "aws_lambda_function" "chaos_engineering" {
  filename         = "chaos_engineering.zip"
  function_name    = "${var.project_name}-${var.environment}-chaos-engineering"
  role            = aws_iam_role.chaos_lambda.arn
  handler         = "chaos_engineering.lambda_handler"
  runtime         = "python3.9"
  timeout         = 300

  source_code_hash = data.archive_file.chaos_engineering.output_base64sha256

  environment {
    variables = {
      CLUSTER_NAME = aws_ecs_cluster.main.name
      SERVICE_NAME = aws_ecs_service.main.name
    }
  }

  tags = var.tags
}

# Create zip file for Lambda function
data "archive_file" "chaos_engineering" {
  type        = "zip"
  source_file = "${path.module}/lambda/chaos_engineering.py"
  output_path = "chaos_engineering.zip"
}

#---------------------------------------------------
# Production Launch Checklist - Week 8
#---------------------------------------------------

# SNS topic for production launch events
resource "aws_sns_topic" "production_launch" {
  name = "${var.project_name}-${var.environment}-production-launch"

  tags = var.tags
}

# Email subscription for production launch
resource "aws_sns_topic_subscription" "production_launch_email" {
  topic_arn = aws_sns_topic.production_launch.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

# CloudWatch Events for production launch monitoring
resource "aws_cloudwatch_event_rule" "production_launch" {
  name        = "${var.project_name}-${var.environment}-production-launch"
  description = "Production launch monitoring events"

  event_pattern = jsonencode({
    source      = ["aws.ecs"]
    detail-type = ["ECS Task State Change"]
    detail = {
      clusterArn = [aws_ecs_cluster.main.arn]
      lastStatus = ["RUNNING", "STOPPED"]
    }
  })
}

resource "aws_cloudwatch_event_target" "production_launch" {
  rule      = aws_cloudwatch_event_rule.production_launch.name
  target_id = "SNS"
  arn       = aws_sns_topic.production_launch.arn
}

#---------------------------------------------------
# Random string for unique bucket names
#---------------------------------------------------
resource "random_string" "bucket_suffix" {
  length  = 8
  special = false
  upper   = false
}

#---------------------------------------------------
# Data sources for backup region
#---------------------------------------------------
data "aws_caller_identity" "backup" {
  provider = aws.backup_region
}

#---------------------------------------------------
# Provider for backup region
#---------------------------------------------------
provider "aws" {
  alias  = "backup_region"
  region = var.backup_region

  default_tags {
    tags = var.tags
  }
}
