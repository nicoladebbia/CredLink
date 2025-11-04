terraform {
  required_version = "~> 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.11" }
  }
}

# Queues module
variable "env" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project name"
  type        = string
}

variable "queues" {
  description = "Queue definitions"
  type = map(object({
    message_retention_seconds  = optional(number, 345600)
    visibility_timeout_seconds = optional(number, 30)
    dead_letter_queue_enabled  = optional(bool, false)
  }))
}

variable "worker_script_name" {
  description = "Worker script name for bindings"
  type        = string
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}

locals {
  name_prefix = "${var.project}-${var.env}"
}

# Cloudflare Queues
resource "cloudflare_queue" "queues" {
  for_each = var.queues

  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-${each.key}"

  message_retention_seconds  = each.value.message_retention_seconds
  visibility_timeout_seconds = each.value.visibility_timeout_seconds
}

# Dead letter queues (optional)
resource "cloudflare_queue" "dead_letter_queues" {
  for_each = {
    for k, v in var.queues : k => v
    if v.dead_letter_queue_enabled
  }

  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-${each.key}-dlq"

  message_retention_seconds  = each.value.message_retention_seconds
  visibility_timeout_seconds = each.value.visibility_timeout_seconds
}

# Worker queue bindings
resource "cloudflare_worker_queue_binding" "bindings" {
  for_each = var.queues

  script_name  = var.worker_script_name
  binding_name = upper(each.key)

  queue = cloudflare_queue.queues[each.key].name

  batch_size       = 10
  max_retries      = 3
  max_wait_time_ms = 30000
}

# Dead letter queue bindings
resource "cloudflare_worker_queue_binding" "dlq_bindings" {
  for_each = {
    for k, v in var.queues : k => v
    if v.dead_letter_queue_enabled
  }

  script_name  = var.worker_script_name
  binding_name = "${upper(each.key)}_DLQ"

  queue = cloudflare_queue.dead_letter_queues[each.key].name

  batch_size       = 5
  max_retries      = 1
  max_wait_time_ms = 15000
}

# Queue metrics and monitoring
resource "cloudflare_queue_metrics" "metrics" {
  for_each = var.queues

  account_id = var.cloudflare_account_id
  queue_name = cloudflare_queue.queues[each.key].name
}

# Queue access policies
resource "cloudflare_queue_policy" "policies" {
  for_each = var.queues

  account_id = var.cloudflare_account_id
  queue_name = cloudflare_queue.queues[each.key].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowWorkerAccess"
        Effect = "Allow"
        Principal = {
          Service = "cloudflare"
        }
        Action = [
          "queue:SendMessage",
          "queue:ReceiveMessage",
          "queue:DeleteMessage"
        ]
        Resource = cloudflare_queue.queues[each.key].arn
      }
    ]
  })
}

# Outputs
output "queue_names" {
  description = "Queue names"
  value       = [for q in cloudflare_queue.queues : q.name]
}

output "queue_urls" {
  description = "Queue URLs"
  value = {
    for k, q in cloudflare_queue.queues : k => "https://api.cloudflare.com/client/v4/accounts/${var.cloudflare_account_id}/queues/${q.id}"
  }
}

output "dead_letter_queue_names" {
  description = "Dead letter queue names"
  value       = [for q in cloudflare_queue.dead_letter_queues : q.name]
}
