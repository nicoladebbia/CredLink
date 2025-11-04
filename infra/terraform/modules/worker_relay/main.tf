terraform {
  required_version = "~> 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.11" }
  }
}

locals {
  name_prefix = "${var.project}-${var.env}"
  common_tags = merge(var.tags, {
    env     = var.env
    project = var.project
  })
}

# Cloudflare Worker script
resource "cloudflare_worker_script" "worker" {
  name    = var.script_name
  content = file("${path.module}/templates/worker.js")

  compatibility_date  = var.worker_config.compatibility_date
  compatibility_flags = var.worker_config.compatibility_flags

  placement {
    mode = var.worker_config.placement.mode
  }

  tags = local.common_tags
}

# Worker routes
resource "cloudflare_worker_route" "routes" {
  for_each = var.routes

  zone_id = var.zone_id
  pattern = each.value

  script_name = cloudflare_worker_script.worker.name
}
