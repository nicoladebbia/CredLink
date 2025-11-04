# Terraform Configuration Examples
# Phase 45 - Terraform & Infra Blueprints (v1.2)

# Example: Complete demo environment deployment
# This example shows how to deploy all components for a demo environment

terraform {
  required_version = "~> 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.11" }
    aws        = { source = "hashicorp/aws", version = "~> 5.76" }
  }

  backend "local" {
    path = "./terraform.tfstate"
  }
}

provider "cloudflare" {
  api_token  = var.cloudflare_api_token
  account_id = var.cloudflare_account_id
}

provider "aws" {
  region = var.aws_region
}

locals {
  name_prefix = "${var.project}-${var.env}"
  tags = {
    env         = var.env
    project     = var.project
    owner       = var.owner
    cost_center = var.cost_center
    created_by  = "terraform"
  }
}

# Storage module with R2
module "storage" {
  source = "../../modules/storage"

  env     = var.env
  project = var.project
  use_r2  = true

  r2 = {
    bucket_name = "${local.name_prefix}-manifests"
    account_id  = var.cloudflare_account_id
  }

  tags            = local.tags
  destroy_protect = true
}

# Worker relay module
module "worker_relay" {
  source = "../../modules/worker_relay"

  env     = var.env
  project = var.project

  zone_id     = var.cloudflare_zone_id
  script_name = "${local.name_prefix}-relay"

  routes = [
    "${var.env}.c2concierge.com/manifest/*",
    "${var.env}.c2concierge.com/api/*"
  ]

  static_dir            = "../../apps/worker/dist"
  static_assets_enabled = true

  worker_config = {
    compatibility_date  = "2024-01-01"
    compatibility_flags = ["nodejs_compat"]
    placement = {
      mode = "smart"
    }
  }

  storage_bucket_name = module.storage.bucket_name
  storage_type        = "r2"

  tags = local.tags
}

# Queues module
module "queues" {
  source = "../../modules/queues"

  env     = var.env
  project = var.project

  queues = {
    "verify-queue" = {
      message_retention_seconds  = 345600 # 4 days
      visibility_timeout_seconds = 30
      dead_letter_queue_enabled  = true
    }
    "sign-queue" = {
      message_retention_seconds  = 345600
      visibility_timeout_seconds = 30
      dead_letter_queue_enabled  = false
    }
  }

  worker_script_name = module.worker_relay.script_name

  tags = local.tags
}

# Monitors module
module "monitors" {
  source = "../../modules/monitors"

  env     = var.env
  project = var.project

  health_checks = [
    "https://${var.env}.c2concierge.com/health/cache",
    "https://${var.env}.c2concierge.com/health/rehydration",
    "https://${var.env}.c2concierge.com/health/worker"
  ]

  alert_channels = {
    "email" = {
      type   = "email"
      target = "alerts@c2concierge.com"
    }
  }

  worker_health_path = "/health"

  tags = local.tags
}

# IAM module
module "iam" {
  source = "../../modules/iam"

  env     = var.env
  project = var.project

  storage_bucket_name = module.storage.bucket_name
  storage_type        = "r2"
  worker_script_name  = module.worker_relay.script_name
  queue_names         = module.queues.queue_names

  token_scopes = {
    "storage" = ["read", "write"]
    "worker"  = ["script:edit", "route:edit"]
    "queue"   = ["read", "write"]
  }

  tags = local.tags
}

# Cost module
module "cost" {
  source = "../../modules/cost"

  env         = var.env
  project     = var.project
  owner       = var.owner
  cost_center = var.cost_center

  enable_cloudflare_cost_tags = true

  tags = local.tags
}

# Example: OpenTelemetry Collector for staging
module "otel" {
  count  = var.env == "staging" ? 1 : 0
  source = "../../modules/otel"

  env     = var.env
  project = var.project

  kubeconfig_path = var.kubeconfig_path
  namespace       = "${local.name_prefix}-otel"

  collector_config = {
    receivers = [
      {
        otlp = {
          protocols = {
            grpc = {
              endpoint = "0.0.0.0:4317"
            }
            http = {
              endpoint = "0.0.0.0:4318"
            }
          }
        }
      }
    ]

    processors = [
      {
        batch = {}
      },
      {
        memory_limiter = {
          limit_mib = 512
        }
      },
      {
        resource = {
          attributes = [
            {
              key   = "environment"
              value = var.env
            },
            {
              key   = "project"
              value = var.project
            }
          ]
        }
      }
    ]

    exporters = [
      {
        otlp = {
          endpoint = var.otlp_endpoint
          headers = {
            "api-key" = var.otlp_api_key
          }
        }
      }
    ]

    service = {
      pipelines = {
        traces = {
          receivers  = ["otlp"]
          processors = ["memory_limiter", "batch", "resource"]
          exporters  = ["otlp"]
        }
        metrics = {
          receivers  = ["otlp"]
          processors = ["memory_limiter", "batch", "resource"]
          exporters  = ["otlp"]
        }
      }
    }
  }

  otlp_endpoint = var.otlp_endpoint
  otlp_api_key  = var.otlp_api_key

  tags = local.tags
}

# Example: Production environment with S3 and enhanced security
module "storage_prod" {
  count  = var.env == "prod" ? 1 : 0
  source = "../../modules/storage"

  env     = var.env
  project = var.project
  use_r2  = false # Use S3 for production

  s3 = {
    bucket_name = "${local.name_prefix}-manifests-prod"
    region      = var.aws_region

    object_lock = {
      enabled = true
      mode    = "COMPLIANCE" # 7-year retention for compliance
      days    = 2555
    }

    kms_key_id = var.kms_key_id
  }

  tags = merge(local.tags, {
    compliance = "true"
    retention  = "7-years"
  })

  destroy_protect = true
}

# Example: Enhanced monitoring for production
module "monitors_prod" {
  count  = var.env == "prod" ? 1 : 0
  source = "../../modules/monitors"

  env     = var.env
  project = var.project

  health_checks = [
    "https://c2concierge.com/health/cache",
    "https://c2concierge.com/health/rehydration",
    "https://c2concierge.com/health/worker",
    "https://api.c2concierge.com/health"
  ]

  alert_channels = {
    "email" = {
      type   = "email"
      target = "alerts@c2concierge.com"
    }
    "slack" = {
      type   = "webhook"
      target = "https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK"
    }
    "pagerduty" = {
      type   = "pagerduty"
      target = var.pagerduty_integration_key
    }
  }

  synthetic_transactions = {
    "manifest-upload" = {
      method = "POST"
      url    = "https://c2concierge.com/api/manifest"
      headers = {
        "Content-Type"  = "application/json"
        "Authorization" = "Bearer ${var.api_token}"
      }
      expected_codes         = [201, 200]
      timeout_seconds        = 30
      check_interval_seconds = 300
    }
    "verification-endpoint" = {
      method                 = "GET"
      url                    = "https://c2concierge.com/api/verify/status"
      expected_codes         = [200]
      expected_body          = "healthy"
      timeout_seconds        = 30
      check_interval_seconds = 60
    }
  }

  worker_health_path = "/health"

  tags = merge(local.tags, {
    monitoring_level = "production"
  })
}

# Example variables
variable "project" {
  description = "Project name"
  type        = string
  default     = "c2c"
}

variable "env" {
  description = "Environment name"
  type        = string
}

variable "owner" {
  description = "Resource owner"
  type        = string
  default     = "c2c-platform"
}

variable "cost_center" {
  description = "Cost center code"
  type        = string
  default     = "cc-045"
}

variable "cloudflare_api_token" {
  description = "Cloudflare API token"
  type        = string
  sensitive   = true
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
  sensitive   = true
}

variable "cloudflare_zone_id" {
  description = "Cloudflare zone ID"
  type        = string
  sensitive   = true
}

variable "aws_region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "kms_key_id" {
  description = "KMS key ID for S3 encryption"
  type        = string
  default     = ""
}

variable "kubeconfig_path" {
  description = "Path to kubeconfig file"
  type        = string
  default     = "~/.kube/config"
}

variable "otlp_endpoint" {
  description = "OTLP endpoint for telemetry export"
  type        = string
  default     = ""
}

variable "otlp_api_key" {
  description = "OTLP API key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "pagerduty_integration_key" {
  description = "PagerDuty integration key"
  type        = string
  default     = ""
  sensitive   = true
}

variable "api_token" {
  description = "API token for synthetic transactions"
  type        = string
  default     = ""
  sensitive   = true
}

# Example outputs
output "storage_bucket_name" {
  description = "Storage bucket name"
  value       = module.storage.bucket_name
}

output "worker_script_name" {
  description = "Worker script name"
  value       = module.worker_relay.script_name
}

output "worker_url" {
  description = "Worker URL"
  value       = module.worker_relay.worker_url
}

output "queue_names" {
  description = "Queue names"
  value       = module.queues.queue_names
}

output "monitor_ids" {
  description = "Monitor IDs"
  value       = module.monitors.monitor_ids
}

output "otel_collector_endpoint" {
  description = "OpenTelemetry Collector endpoint"
  value       = var.env == "staging" ? module.otel[0].collector_endpoint : null
}
