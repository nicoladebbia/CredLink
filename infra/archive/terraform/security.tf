#---------------------------------------------------
# AWS WAF - Week 6
#---------------------------------------------------

# WAFv2 Web ACL
resource "aws_wafv2_web_acl" "main" {
  name        = "${var.project_name}-${var.environment}-waf"
  description = "Web ACL for ${var.project_name} ${var.environment}"
  scope       = "REGIONAL"

  default_action {
    allow {}
  }

  # Rule 1: Block common SQL injection patterns
  rule {
    name     = "BlockSQLInjection"
    priority = 1

    statement {
      sqli_match_statement {
        field_to_match {
          body {}
        }
        text_transformation {
          priority = 0
          type     = "URL_DECODE"
        }
        text_transformation {
          priority = 1
          type     = "HTML_ENTITY_DECODE"
        }
      }
    }

    action {
      block {}
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-waf-sqli"
      sampled_requests_enabled   = true
    }
  }

  # Rule 2: Block common XSS patterns
  rule {
    name     = "BlockXSS"
    priority = 2

    statement {
      xss_match_statement {
        field_to_match {
          body {}
        }
        text_transformation {
          priority = 0
          type     = "URL_DECODE"
        }
        text_transformation {
          priority = 1
          type     = "HTML_ENTITY_DECODE"
        }
      }
    }

    action {
      block {}
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-waf-xss"
      sampled_requests_enabled   = true
    }
  }

  # Rule 3: Rate limiting
  rule {
    name     = "RateLimit"
    priority = 3

    statement {
      rate_based_statement {
        limit              = 2000 # 2000 requests per 5 minutes
        aggregate_key_type = "IP"
      }
    }

    action {
      block {}
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-waf-rate-limit"
      sampled_requests_enabled   = true
    }
  }

  # Rule 4: Block bad bots
  rule {
    name     = "BlockBadBots"
    priority = 4

    statement {
      and_statement {
        statement {
          byte_match_statement {
            field_to_match {
              headers {
                name = "user-agent"
              }
            }
            positional_constraint = "CONTAINS"
            search_string         = "bot"
            text_transformation {
              priority = 0
              type     = "LOWERCASE"
            }
          }
        }
        statement {
          not_statement {
            statement {
              byte_match_statement {
                field_to_match {
                  headers {
                    name = "user-agent"
                  }
                }
                positional_constraint = "CONTAINS"
                search_string         = "googlebot"
                text_transformation {
                  priority = 0
                  type     = "LOWERCASE"
                }
              }
            }
          }
        }
      }
    }

    action {
      block {}
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-waf-bad-bots"
      sampled_requests_enabled   = true
    }
  }

  # Rule 5: Block known bad IPs (managed rule group)
  rule {
    name     = "AWSManagedRulesAmazonIpReputationList"
    priority = 5

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesAmazonIpReputationList"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-waf-ip-reputation"
      sampled_requests_enabled   = true
    }
  }

  # Rule 6: Block common attacks (managed rule group)
  rule {
    name     = "AWSManagedRulesCommonRuleSet"
    priority = 6

    override_action {
      none {}
    }

    statement {
      managed_rule_group_statement {
        name        = "AWSManagedRulesCommonRuleSet"
        vendor_name = "AWS"
      }
    }

    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "${var.project_name}-${var.environment}-waf-common-rules"
      sampled_requests_enabled   = true
    }
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.project_name}-${var.environment}-waf"
    sampled_requests_enabled   = true
  }

  tags = var.tags
}

# Associate WAF with ALB
resource "aws_wafv2_web_acl_association" "alb" {
  resource_arn = aws_lb.main.arn
  web_acl_arn  = aws_wafv2_web_acl.main.arn
}

#---------------------------------------------------
# Secret Rotation - Week 6
#---------------------------------------------------

# Lambda function for secret rotation
resource "aws_iam_role" "secret_rotation" {
  name = "${var.project_name}-${var.environment}-secret-rotation"

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

resource "aws_iam_role_policy" "secret_rotation" {
  name = "${var.project_name}-${var.environment}-secret-rotation"
  role = aws_iam_role.secret_rotation.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:DescribeSecret",
          "secretsmanager:GetSecretValue",
          "secretsmanager:PutSecretValue",
          "secretsmanager:UpdateSecretVersionStage"
        ]
        Resource = [
          aws_secretsmanager.main.arn,
          "${aws_secretsmanager.main.arn}*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "rds:ModifyDBInstance",
          "rds:DescribeDBInstances"
        ]
        Resource = aws_db_instance.main.arn
      },
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      }
    ]
  })
}

# Lambda function for database secret rotation
resource "aws_lambda_function" "secret_rotation" {
  filename      = "secret_rotation.zip"
  function_name = "${var.project_name}-${var.environment}-secret-rotation"
  role          = aws_iam_role.secret_rotation.arn
  handler       = "secret_rotation.lambda_handler"
  runtime       = "python3.9"
  timeout       = 300

  source_code_hash = data.archive_file.secret_rotation.output_base64sha256

  environment {
    variables = {
      SECRET_ARN = aws_secretsmanager.main.arn
    }
  }

  tags = var.tags
}

# Create zip file for Lambda function
data "archive_file" "secret_rotation" {
  type        = "zip"
  source_file = "${path.module}/lambda/secret_rotation.py"
  output_path = "secret_rotation.zip"
}

# Enable automatic secret rotation
resource "aws_secretsmanager_secret_rotation" "main" {
  secret_id           = aws_secretsmanager.main.id
  rotation_lambda_arn = aws_lambda_function.secret_rotation.arn

  rotation_rules {
    automatically_after_days = 30
  }
}

#---------------------------------------------------
# GuardDuty - Week 6
#---------------------------------------------------

# GuardDuty detector
resource "aws_guardduty_detector" "main" {
  enable = true

  datasources {
    s3_logs {
      enable = true
    }
    kubernetes {
      audit_logs {
        enable = true
      }
    }
    malware_protection {
      scan_ec2_instance_with_findings {
        ebs_volumes {
          enable = true
        }
      }
    }
  }

  tags = var.tags
}

# GuardDuty publishing destination
resource "aws_cloudwatch_event_rule" "guardduty" {
  name        = "${var.project_name}-${var.environment}-guardduty"
  description = "Capture GuardDuty findings"

  event_pattern = jsonencode({
    source      = ["aws.guardduty"]
    detail-type = ["GuardDuty Finding"]
  })
}

resource "aws_cloudwatch_event_target" "guardduty" {
  rule      = aws_cloudwatch_event_rule.guardduty.name
  target_id = "SNS"
  arn       = aws_sns_topic.alerts.arn
}

#---------------------------------------------------
# Security Hub - Week 6
#---------------------------------------------------

# Security Hub
resource "aws_securityhub_account" "main" {
  enable = true
}

# Security Hub standards
resource "aws_securityhub_standards_subscription" "cis_aws" {
  standards_arn = "arn:aws:securityhub:::ruleset/cis-aws-foundations-benchmark/v/1.2.0"
}

resource "aws_securityhub_standards_subscription" "pci_dss" {
  standards_arn = "arn:aws:securityhub:::ruleset/pci-dss/v/3.2.1"
}

#---------------------------------------------------
# Placeholder for Week 7-8:
# - Load Testing Configuration
# - Performance Benchmarks
# - Disaster Recovery Testing
# - Chaos Engineering
#---------------------------------------------------
