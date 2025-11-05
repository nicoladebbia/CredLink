terraform {
  required_version = "~> 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.11" }
    aws        = { source = "hashicorp/aws", version = "~> 5.76" }
  }
}

# Cost module


locals {
  name_prefix = "${var.project}-${var.env}"
  cost_tags = {
    env         = var.env
    owner       = var.owner
    cost_center = var.cost_center
    system      = var.project
    created_by  = "terraform"
    managed_by  = "c2c-platform"
  }
  common_tags = merge(local.cost_tags, var.tags)
}

# AWS Cost Explorer configuration
resource "aws_ce_cost_allocation_tag" "tags" {
  count = var.enable_aws_cost_allocation ? length(local.cost_tags) : 0

  tag_key = keys(local.cost_tags)[count.index]
  status  = "Active"
}

# AWS Budgets for cost monitoring
resource "aws_budgets_budget" "monthly_budget" {
  count = var.enable_aws_cost_allocation ? 1 : 0

  name         = "${local.name_prefix}-monthly-budget"
  budget_type  = "COST"
  limit_amount = var.monthly_budget_limit
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  cost_filter {
    name = "TagKeyValue"
    values = [
      for k, v in local.cost_tags : "${k}=${v}"
    ]
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_notification_emails
  }

  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.budget_notification_emails
  }

  tags = local.common_tags
}

# AWS Cost and Usage Report
resource "aws_cur_report_definition" "cost_usage_report" {
  count = var.enable_aws_cost_allocation ? 1 : 0

  report_name                = "${local.name_prefix}-cost-usage-report"
  time_unit                  = "HOURLY"
  format                     = "Parquet"
  compression                = "GZIP"
  additional_schema_elements = ["RESOURCES"]

  s3_bucket {
    bucket = var.cost_report_bucket_name
    prefix = "${local.name_prefix}/cost-reports/"
  }

  s3_region = var.aws_region

  tags = local.common_tags
}

# Cloudflare cost tracking via analytics
resource "cloudflare_r2_bucket_policy" "cost_tracking" {
  count = var.enable_cloudflare_cost_tags ? 1 : 0

  bucket_id = var.r2_bucket_name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "CostTracking"
        Effect = "Allow"
        Principal = {
          Service = "analytics"
        }
        Action = [
          "s3:GetObject",
          "s3:ListBucket"
        ]
        Resource = [
          "arn:aws:s3:::${var.r2_bucket_name}",
          "arn:aws:s3:::${var.r2_bucket_name}/*"
        ]
      }
    ]
  })
}

# Cost monitoring dashboard
resource "cloudflare_dashboard" "cost_dashboard" {
  count = var.enable_cloudflare_cost_tags ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-cost-monitoring"

  widgets = [
    {
      title = "Monthly Cost Trend"
      type  = "cost_trend"
      query = "cost.monthly_trend"
    },
    {
      title = "Cost by Service"
      type  = "cost_by_service"
      query = "cost.by_service"
    },
    {
      title = "Cost by Environment"
      type  = "cost_by_env"
      query = "cost.by_env"
    }
  ]

  tags = local.common_tags
}

# Cost alert notifications
resource "cloudflare_notification_policy" "cost_alerts" {
  count = var.enable_cloudflare_cost_tags ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-cost-alerts"

  enabled = true

  filters = {
    cost_threshold = var.cost_alert_threshold
  }

  alert_channels = [
    {
      type   = "email"
      target = var.cost_alert_email
    }
  ]
}

# Resource usage tracking
resource "cloudflare_analytics_engine" "usage_tracking" {
  count = var.enable_cloudflare_cost_tags ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-usage-tracking"

  retention_seconds = 7776000 # 90 days

  tags = local.common_tags
}

# Variables for cost configuration
variable "monthly_budget_limit" {
  description = "Monthly budget limit in USD"
  type        = number
  default     = 1000
}

variable "budget_notification_emails" {
  description = "Email addresses for budget notifications"
  type        = list(string)
  default     = []
}

variable "cost_report_bucket_name" {
  description = "S3 bucket name for cost reports"
  type        = string
  default     = ""
}

variable "cost_alert_threshold" {
  description = "Cost alert threshold in USD"
  type        = number
  default     = 500
}

variable "cost_alert_email" {
  description = "Email for cost alerts"
  type        = string
  default     = ""
}

variable "r2_bucket_name" {
  description = "R2 bucket name for cost tracking"
  type        = string
  default     = ""
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}

# Outputs
output "cost_tags" {
  description = "Applied cost tags"
  value       = local.cost_tags
}

output "budget_arn" {
  description = "AWS budget ARN"
  value       = var.enable_aws_cost_allocation ? aws_budgets_budget.monthly_budget[0].arn : null
}

output "cost_report_name" {
  description = "Cost and usage report name"
  value       = var.enable_aws_cost_allocation ? aws_cur_report_definition.cost_usage_report[0].report_name : null
}

output "dashboard_url" {
  description = "Cost monitoring dashboard URL"
  value       = var.enable_cloudflare_cost_tags ? "https://dash.cloudflare.com/${var.cloudflare_account_id}/analytics/dashboards/${cloudflare_dashboard.cost_dashboard[0].id}" : null
}

output "analytics_engine_id" {
  description = "Analytics engine ID for usage tracking"
  value       = var.enable_cloudflare_cost_tags ? cloudflare_analytics_engine.usage_tracking[0].id : null
}
