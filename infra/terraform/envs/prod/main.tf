terraform {
  required_version = "~> 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.11" }
    aws        = { source = "hashicorp/aws", version = "~> 5.76" }
    helm       = { source = "hashicorp/helm", version = "~> 2.16" }
    kubernetes = { source = "hashicorp/kubernetes", version = "~> 2.35" }
  }

  backend "local" {
    path = "./terraform.tfstate"
  }
}

provider "cloudflare" {
  api_token = var.cloudflare_api_token
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

# TEMPORARILY COMMENTED - FOCUSING ON IAM MODULE ONLY
# Storage module (R2 or S3)
# module "storage" {
#   source = "../../modules/storage"
#   ...
# }

# Worker relay module
# module "worker_relay" {
#   source = "../../modules/worker_relay"
#   ...
# }

# Queues module
# module "queues" {
#   source = "../../modules/queues"
#   ...
# }

# Monitors module
# module "monitors" {
#   source = "../../modules/monitors"
#   ...
# }

# IAM module - STANDALONE TEST
module "iam" {
  source = "../../modules/iam"

  env     = var.env
  project = var.project

  # Cloudflare configuration
  cloudflare_account_id         = var.cloudflare_account_id
  cloudflare_permission_groups = {
    r2_read_write = "c8fed203ed3043cba015a93ad1616f1f"
    worker_edit   = "82e64a83756745bbbb1c9c2701bf816b"
    worker_routes = "e086da7e2179491d91ee5f35b3ca210a"
    queue_read    = "1a1e1e1e1e1e1e1e1e1e1e1e1e1e1e1e"
    queue_write   = "2b2f2f2f2f2f2f2f2f2f2f2f2f2f2f2f"
  }

  # Storage permissions - HARDCODED FOR TEST
  storage_bucket_name = "${local.name_prefix}-manifests"
  storage_type        = "r2"

  # Worker permissions - HARDCODED FOR TEST
  worker_script_name = "${local.name_prefix}-relay"

  # Queue permissions - EMPTY FOR TEST
  queue_names = []

  # Token scopes
  token_scopes = [
    {
      name = "storage"
      permissions = ["r2:read", "r2:write"]
    },
    {
      name = "workers"
      permissions = ["worker:read", "worker:write"]
    },
    {
      name = "queues"
      permissions = ["queue:read", "queue:write"]
    }
  ]

  tags = local.common_tags
}

# Cost module - COMMENTED FOR TEST
# module "cost" {
#   source = "../../modules/cost"
#   ...
# }

# OpenTelemetry Collector - COMMENTED FOR TEST
# module "otel" {
#   count  = var.enable_otel_collector ? 1 : 0
#   source = "../../modules/otel"
#   ...
# }
