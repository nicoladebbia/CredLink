terraform {
  required_version = "~> 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.11" }
    aws        = { source = "hashicorp/aws", version = "~> 5.76" }
    helm       = { source = "hashicorp/helm", version = "~> 2.16" }
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.35" }
  }

  backend "remote" {
    organization = "c2concierge"
    workspaces = {
      name = "c2c-prod"
    }
  }
}

provider "cloudflare" {
  api_token  = var.cloudflare_api_token
  account_id = var.cloudflare_account_id
}

provider "aws" {
  region = var.aws_region

  dynamic "default_tags" {
    for_each = var.enable_cost_tags ? [1] : []
    content {
      tags = local.cost_tags
    }
  }
}

locals {
  name_prefix = "${var.project}-${var.env}"
  cost_tags = {
    env         = var.env
    owner       = var.owner
    cost_center = var.cost_center
    system      = var.project
  }
  common_tags = merge(local.cost_tags, var.additional_tags)
}

# Storage module (R2 or S3)
module "storage" {
  source = "../../modules/storage"

  env     = var.env
  project = var.project

  use_r2 = var.use_r2

  # R2 configuration
  r2 = var.use_r2 ? {
    bucket_name = "${local.name_prefix}-manifests"
    account_id  = var.cloudflare_account_id
  } : null

  # S3 configuration (alternative)
  s3 = !var.use_r2 ? {
    bucket_name = "${local.name_prefix}-manifests"
    region      = var.aws_region

    # Object Lock configuration for delete protection
    object_lock = {
      enabled = true
      mode    = "COMPLIANCE"
      days    = 2555 # 7 years for compliance
    }

    # KMS encryption
    kms_key_id = var.kms_key_id
  } : null

  # VPC configuration for Lambda functions
  vpc_id            = var.vpc_id
  lambda_subnet_ids = var.lambda_subnet_ids

  tags            = local.common_tags
  destroy_protect = var.storage_destroy_protect
}

# Worker relay module
module "worker_relay" {
  source = "../../modules/worker_relay"

  env     = var.env
  project = var.project

  zone_id     = var.cloudflare_zone_id
  script_name = "${local.name_prefix}-relay"

  routes = var.worker_routes

  # Static assets (v5.11+ support)
  static_dir            = var.worker_static_dir
  static_assets_enabled = var.worker_static_assets_enabled

  # Worker configuration
  worker_config = {
    compatibility_date  = "2024-01-01"
    compatibility_flags = ["nodejs_compat"]
    placement = {
      mode = "smart"
    }
  }

  # Storage integration
  storage_bucket_name = module.storage.bucket_name
  storage_type        = var.use_r2 ? "r2" : "s3"

  tags = local.common_tags
}

# Queues module
module "queues" {
  source = "../../modules/queues"

  env     = var.env
  project = var.project

  queues = var.queue_definitions

  # Worker bindings
  worker_script_name = module.worker_relay.script_name

  tags = local.common_tags
}

# Monitors module
module "monitors" {
  source = "../../modules/monitors"

  env     = var.env
  project = var.project

  health_checks  = var.health_check_urls
  alert_channels = var.alert_channels

  # Worker health endpoints
  worker_health_path = "/health"

  tags = local.common_tags
}

# IAM module
module "iam" {
  source = "../../modules/iam"

  env     = var.env
  project = var.project

  # Storage permissions
  storage_bucket_name = module.storage.bucket_name
  storage_type        = var.use_r2 ? "r2" : "s3"

  # Worker permissions
  worker_script_name = module.worker_relay.script_name

  # Queue permissions
  queue_names = module.queues.queue_names

  # Token scopes
  token_scopes = var.iam_token_scopes

  tags = local.common_tags
}

# Cost module
module "cost" {
  source = "../../modules/cost"

  env         = var.env
  project     = var.project
  owner       = var.owner
  cost_center = var.cost_center

  # AWS cost allocation
  enable_aws_cost_allocation = !var.use_r2 && var.enable_cost_tags
  aws_region                 = var.aws_region

  # Cloudflare cost tracking
  enable_cloudflare_cost_tags = var.enable_cost_tags

  tags = local.common_tags
}

# OpenTelemetry Collector (Kubernetes)
module "otel" {
  count  = var.enable_otel_collector ? 1 : 0
  source = "../../modules/otel"

  env     = var.env
  project = var.project

  # Kubernetes configuration
  kubeconfig_path = var.kubeconfig_path
  namespace       = "${local.name_prefix}-otel"

  # Collector configuration
  collector_config = var.otel_collector_config

  # Export destinations
  otlp_endpoint = var.otlp_endpoint
  otlp_api_key  = var.otlp_api_key

  tags = local.common_tags
}
