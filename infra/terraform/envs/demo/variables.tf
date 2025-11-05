# Demo environment variables
variable "project" {
  description = "Project name"
  type        = string
  default     = "c2c"
}

variable "env" {
  description = "Environment name"
  type        = string
  default     = "demo"
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

variable "additional_tags" {
  description = "Additional resource tags"
  type        = map(string)
  default     = {}
}

# Cloudflare configuration
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


# AWS configuration (for S3 alternative)
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

# Storage configuration
variable "use_r2" {
  description = "Use Cloudflare R2 instead of S3"
  type        = bool
  default     = true
}

variable "storage_destroy_protect" {
  description = "Enable destroy protection for storage"
  type        = bool
  default     = true
}

# Worker configuration
variable "worker_routes" {
  description = "Worker routes configuration"
  type        = list(string)
  default = [
    "demo.c2concierge.com/manifest/*",
    "demo.c2concierge.com/api/*"
  ]
}


# Queue configuration
variable "queue_definitions" {
  description = "Queue definitions"
  type = map(object({
    message_retention_seconds  = optional(number, 345600) # 4 days
    visibility_timeout_seconds = optional(number, 30)
    dead_letter_queue_enabled  = optional(bool, false)
  }))
  default = {
    "verify-queue" = {
      message_retention_seconds  = 345600
      visibility_timeout_seconds = 30
    }
    "sign-queue" = {
      message_retention_seconds  = 345600
      visibility_timeout_seconds = 30
    }
  }
}

# Health check configuration
variable "health_check_urls" {
  description = "Health check URLs"
  type        = list(string)
  default = [
    "https://demo.c2concierge.com/health/cache",
    "https://demo.c2concierge.com/health/rehydration"
  ]
}

variable "alert_channels" {
  description = "Alert channel configurations"
  type = map(object({
    type   = string
    target = string
  }))
  default = {
    "email" = {
      type   = "email"
      target = "alerts@c2concierge.com"
    }
  }
}

# IAM configuration
variable "iam_token_scopes" {
  description = "IAM token scopes"
  type        = map(list(string))
  default = {
    "storage" = ["read", "write"]
    "worker"  = ["script:edit", "route:edit"]
    "queue"   = ["read", "write"]
  }
}

# Cost configuration
variable "enable_cost_tags" {
  description = "Enable cost allocation tags"
  type        = bool
  default     = true
}

# OpenTelemetry configuration
variable "enable_otel_collector" {
  description = "Enable OpenTelemetry Collector"
  type        = bool
  default     = false
}

variable "kubeconfig_path" {
  description = "Path to kubeconfig file"
  type        = string
  default     = "~/.kube/config"
}

variable "otel_collector_config" {
  description = "OpenTelemetry Collector configuration"
  type        = any
  default     = {}
}

variable "otlp_endpoint" {
  description = "OTLP endpoint for telemetry export"
  type        = string
  default     = ""
}

variable "otlp_api_key" {
  description = "OTLP API key for authentication"
  type        = string
  default     = ""
  sensitive   = true
}

# VPC configuration for Lambda functions
variable "vpc_id" {
  description = "VPC ID for Lambda functions"
  type        = string
  default     = ""
}

variable "lambda_subnet_ids" {
  description = "List of subnet IDs for Lambda functions"
  type        = list(string)
  default     = []
}
