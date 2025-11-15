# AWS Secrets Manager Module
# Manages API keys and other sensitive credentials for CredLink

terraform {
  required_version = ">= 1.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# API Keys Secret
resource "aws_secretsmanager_secret" "api_keys" {
  name_prefix             = "${var.project_name}-${var.environment}-api-keys-"
  description            = "API keys for CredLink service authentication"
  recovery_window_in_days = var.recovery_window_days

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-api-keys"
    Purpose     = "API Authentication"
    Rotation    = "Manual"
    Environment = var.environment
  })
}

# API Keys Secret Value
resource "aws_secretsmanager_secret_version" "api_keys" {
  secret_id = aws_secretsmanager_secret.api_keys.id
  secret_string = jsonencode({
    apiKeys = var.api_keys_value
    # Format: "key1:client1:ClientName1,key2:client2:ClientName2"
    # Example: "sk_live_abc123:client-acme:ACME Corp,sk_test_xyz789:client-test:Test Client"
  })

  lifecycle {
    ignore_changes = [secret_string]
  }
}

# Enable automatic rotation (optional)
resource "aws_secretsmanager_secret_rotation" "api_keys" {
  count = var.enable_rotation ? 1 : 0

  secret_id           = aws_secretsmanager_secret.api_keys.id
  rotation_lambda_arn = var.rotation_lambda_arn

  rotation_rules {
    automatically_after_days = var.rotation_days
  }
}

# IAM Policy for ECS Task to read API keys
resource "aws_iam_policy" "secrets_read" {
  name_prefix = "${var.project_name}-${var.environment}-secrets-read-"
  description = "Allow reading API keys from Secrets Manager"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = [
          aws_secretsmanager_secret.api_keys.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = [
          var.kms_key_arn != null ? var.kms_key_arn : "arn:aws:kms:${data.aws_region.current.name}:${data.aws_caller_identity.current.account_id}:alias/aws/secretsmanager"
        ]
        Condition = {
          StringEquals = {
            "kms:ViaService" = "secretsmanager.${data.aws_region.current.name}.amazonaws.com"
          }
        }
      }
    ]
  })

  tags = var.tags
}

# Attach policy to ECS task execution role
resource "aws_iam_role_policy_attachment" "ecs_secrets" {
  count = var.ecs_task_execution_role_name != null ? 1 : 0

  role       = var.ecs_task_execution_role_name
  policy_arn = aws_iam_policy.secrets_read.arn
}

# CloudWatch Alarms for secret access
resource "aws_cloudwatch_log_metric_filter" "secret_access_denied" {
  count = var.enable_monitoring ? 1 : 0

  name           = "${var.project_name}-${var.environment}-secret-access-denied"
  log_group_name = var.application_log_group_name
  pattern        = "{ $.error = \"AccessDeniedException\" && $.requestedSecret = \"${aws_secretsmanager_secret.api_keys.arn}\" }"

  metric_transformation {
    name      = "SecretAccessDenied"
    namespace = "CredLink/Security"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "secret_access_denied" {
  count = var.enable_monitoring ? 1 : 0

  alarm_name          = "${var.project_name}-${var.environment}-secret-access-denied"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "SecretAccessDenied"
  namespace           = "CredLink/Security"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "Alert when secret access is denied"
  alarm_actions       = var.alarm_sns_topic_arn != null ? [var.alarm_sns_topic_arn] : []

  tags = var.tags
}

# Data sources
data "aws_region" "current" {}
data "aws_caller_identity" "current" {}
