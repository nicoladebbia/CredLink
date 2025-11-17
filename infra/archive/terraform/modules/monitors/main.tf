terraform {
  required_version = "~> 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.11" }
  }
}

# Monitors module



locals {
  name_prefix = "${var.project}-${var.env}"
  common_tags = merge(var.tags, {
    module = "monitors"
  })
}

# HTTP health checks
resource "cloudflare_monitor" "health_checks" {
  for_each = toset(var.health_checks)

  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-health-${md5(each.value)}"

  type = "http"

  http_config {
    method = "GET"
    url    = each.value
    headers = {
      User-Agent = "C2Concierge-Monitor/1.0"
    }

    expected_codes = [200]
    expected_body  = "healthy"

    follow_redirects = true

    timeout_seconds = 30
  }

  locations = ["global"]

  check_interval_seconds = 60
  retry_interval_seconds = 30
  max_retries            = 3

  notification_channels = [
    for channel_key, channel in var.alert_channels : {
      type   = channel.type
      target = channel.target
    }
  ]

  tags = local.common_tags
}

# Worker-specific health checks
resource "cloudflare_monitor" "worker_health" {
  count = var.worker_health_path != "" ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-worker-health"

  type = "http"

  http_config {
    method = "GET"
    url    = "https://${var.project}-${var.env}-relay.workers.dev${var.worker_health_path}"
    headers = {
      User-Agent = "C2Concierge-Monitor/1.0"
    }

    expected_codes = [200]

    follow_redirects = true

    timeout_seconds = 30
  }

  locations = ["global"]

  check_interval_seconds = 60
  retry_interval_seconds = 30
  max_retries            = 3

  notification_channels = [
    for channel_key, channel in var.alert_channels : {
      type   = channel.type
      target = channel.target
    }
  ]

  tags = local.common_tags
}

# TCP health checks for storage endpoints
resource "cloudflare_monitor" "storage_tcp" {
  count = var.storage_endpoint != "" ? 1 : 0

  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-storage-tcp"

  type = "tcp"

  tcp_config {
    host = var.storage_endpoint
    port = 443

    timeout_seconds = 30
  }

  locations = ["global"]

  check_interval_seconds = 300
  retry_interval_seconds = 60
  max_retries            = 3

  notification_channels = [
    for channel_key, channel in var.alert_channels : {
      type   = channel.type
      target = channel.target
    }
  ]

  tags = local.common_tags
}

# Synthetic transaction monitors
resource "cloudflare_monitor" "synthetic_transactions" {
  for_each = var.synthetic_transactions

  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-synthetic-${each.key}"

  type = "http"

  http_config {
    method = each.value.method
    url    = each.value.url
    headers = merge({
      User-Agent = "C2Concierge-Monitor/1.0"
    }, each.value.headers)

    expected_codes = each.value.expected_codes
    expected_body  = each.value.expected_body

    follow_redirects = true

    timeout_seconds = each.value.timeout_seconds
  }

  locations = each.value.locations

  check_interval_seconds = each.value.check_interval_seconds
  retry_interval_seconds = each.value.retry_interval_seconds
  max_retries            = each.value.max_retries

  notification_channels = [
    for channel_key, channel in var.alert_channels : {
      type   = channel.type
      target = channel.target
    }
  ]

  tags = merge(local.common_tags, each.value.tags)
}

# Alert notification policies
resource "cloudflare_notification_policy" "policies" {
  for_each = var.alert_channels

  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-alerts-${each.key}"

  enabled = true

  filters = {
    monitor_id = [for m in cloudflare_monitor.health_checks : m.id]
  }

  alert_channels = [
    {
      type   = each.value.type
      target = each.value.target
    }
  ]
}

# Dashboard for monitoring metrics
resource "cloudflare_dashboard" "monitoring" {
  account_id = var.cloudflare_account_id
  name       = "${local.name_prefix}-monitoring"

  widgets = [
    {
      title = "Health Check Status"
      type  = "monitor_status"
      query = "monitor.status"
    },
    {
      title = "Response Time"
      type  = "monitor_response_time"
      query = "monitor.response_time"
    },
    {
      title = "Uptime Percentage"
      type  = "monitor_uptime"
      query = "monitor.uptime"
    }
  ]

  tags = local.common_tags
}

# Variable for storage endpoint (optional)
variable "storage_endpoint" {
  description = "Storage endpoint for TCP health checks"
  type        = string
  default     = ""
}

# Variable for synthetic transactions (optional)
variable "synthetic_transactions" {
  description = "Synthetic transaction definitions"
  type = map(object({
    method                 = string
    url                    = string
    headers                = optional(map(string), {})
    expected_codes         = list(number)
    expected_body          = optional(string, "")
    timeout_seconds        = optional(number, 30)
    locations              = optional(list(string), ["global"])
    check_interval_seconds = optional(number, 300)
    retry_interval_seconds = optional(number, 60)
    max_retries            = optional(number, 3)
    tags                   = optional(map(string), {})
  }))
  default = {}
}


