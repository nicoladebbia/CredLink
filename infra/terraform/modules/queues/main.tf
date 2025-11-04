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

# Cloudflare Queues
resource "cloudflare_queue" "queues" {
  for_each = {
    for q in var.queues : q.name => q
  }

  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-${each.value.name}"

  message_retention_seconds  = 345600 # 4 days default
  visibility_timeout_seconds = each.value.timeout
}

# Worker queue bindings
resource "cloudflare_worker_queue_binding" "bindings" {
  for_each = {
    for q in var.queues : q.name => q
  }

  script_name  = var.worker_script_name
  binding_name = upper(each.value.name)

  queue = cloudflare_queue.queues[each.value.name].name

  batch_size       = 10
  max_retries      = each.value.max_retries
  max_wait_time_ms = 30000
}
