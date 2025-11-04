terraform {
  required_version = "~> 1.9"
  required_providers {
    cloudflare = { source = "cloudflare/cloudflare", version = "~> 5.11" }
  }
}

# Worker relay module
variable "env" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project name"
  type        = string
}

variable "zone_id" {
  description = "Cloudflare zone ID"
  type        = string
}

variable "script_name" {
  description = "Worker script name"
  type        = string
}

variable "routes" {
  description = "Worker routes"
  type        = list(string)
}


variable "static_assets_enabled" {
  description = "Enable static assets upload"
  type        = bool
  default     = false
}

variable "worker_config" {
  description = "Worker configuration"
  type = object({
    compatibility_date  = string
    compatibility_flags = list(string)
    placement = object({
      mode = string
    })
  })
  default = {
    compatibility_date  = "2024-01-01"
    compatibility_flags = ["nodejs_compat", "streams_enable_constructors"]
    placement = {
      mode = "smart"
    }
  }
}

variable "storage_bucket_name" {
  description = "Storage bucket name"
  type        = string
}

variable "storage_type" {
  description = "Storage type (r2 or s3)"
  type        = string
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}

variable "rate_limiting" {
  description = "Rate limiting configuration"
  type = object({
    enabled             = bool
    requests_per_minute = number
    burst_size          = number
    allowed_countries   = list(string)
    blocked_countries   = list(string)
    allowed_ip_ranges   = list(string)
    blocked_ip_ranges   = list(string)
    rate_limit_response = object({
      status_code = number
      message     = string
      retry_after = number
    })
    geo_blocking_enabled = bool
    ip_whitelist_enabled = bool
  })
  default = {
    enabled             = true
    requests_per_minute = 1000
    burst_size          = 100
    allowed_countries   = []
    blocked_countries   = []
    allowed_ip_ranges   = []
    blocked_ip_ranges   = []
    rate_limit_response = {
      status_code = 429
      message     = "Rate limit exceeded. Please try again later."
      retry_after = 60
    }
    geo_blocking_enabled = false
    ip_whitelist_enabled = false
  }
}

variable "security_headers" {
  description = "Security headers configuration"
  type = object({
    strict_transport_security = bool
    content_type_options      = bool
    frame_options             = bool
    xss_protection            = bool
    referrer_policy           = string
    permissions_policy        = string
  })
  default = {
    strict_transport_security = true
    content_type_options      = true
    frame_options             = true
    xss_protection            = true
    referrer_policy           = "strict-origin-when-cross-origin"
    permissions_policy        = "geolocation=(), microphone=(), camera=()"
  }
}

locals {
  common_tags = merge(var.tags, {
    module = "worker_relay"
  })
}

# Worker script
resource "cloudflare_worker_script" "script" {
  name    = var.script_name
  content = fileexists("${path.module}/templates/worker.js") ? file("${path.module}/templates/worker.js") : local.default_worker_script

  compatibility_date  = var.worker_config.compatibility_date
  compatibility_flags = var.worker_config.compatibility_flags

  placement {
    mode = var.worker_config.placement.mode
  }

  tags = local.common_tags
}

# Worker routes
resource "cloudflare_worker_route" "routes" {
  for_each = toset(var.routes)

  zone_id     = var.zone_id
  pattern     = each.value
  script_name = cloudflare_worker_script.script.name
}

# Static assets (v5.11+ support)
resource "cloudflare_workers_kv_namespace" "assets" {
  count = var.static_assets_enabled ? 1 : 0

  title   = "${var.script_name}-assets"
  binding = "ASSETS"
}

# Worker secret for storage credentials
resource "cloudflare_worker_secret" "storage_credentials" {
  name        = "STORAGE_CREDENTIALS"
  script_name = cloudflare_worker_script.script.name
  secret_text = jsonencode({
    bucket_name = var.storage_bucket_name
    type        = var.storage_type
    environment = var.env
    project     = var.project
    # Additional credentials would be injected here
  })
}

# Worker secret for API configuration
resource "cloudflare_worker_secret" "api_config" {
  name        = "API_CONFIG"
  script_name = cloudflare_worker_script.script.name
  secret_text = jsonencode({
    env     = var.env
    project = var.project
    version = "1.0.0"
  })
}

# Worker secret for rate limiting configuration
resource "cloudflare_worker_secret" "rate_limiting_config" {
  name        = "RATE_LIMITING_CONFIG"
  script_name = cloudflare_worker_script.script.name
  secret_text = jsonencode({
    enabled              = var.rate_limiting.enabled
    requests_per_minute  = var.rate_limiting.requests_per_minute
    burst_size           = var.rate_limiting.burst_size
    allowed_countries    = var.rate_limiting.allowed_countries
    blocked_countries    = var.rate_limiting.blocked_countries
    allowed_ip_ranges    = var.rate_limiting.allowed_ip_ranges
    blocked_ip_ranges    = var.rate_limiting.blocked_ip_ranges
    rate_limit_response  = var.rate_limiting.rate_limit_response
    geo_blocking_enabled = var.rate_limiting.geo_blocking_enabled
    ip_whitelist_enabled = var.rate_limiting.ip_whitelist_enabled
  })
}

# Worker secret for security headers configuration
resource "cloudflare_worker_secret" "security_headers_config" {
  name        = "SECURITY_HEADERS_CONFIG"
  script_name = cloudflare_worker_script.script.name
  secret_text = jsonencode({
    strict_transport_security = var.security_headers.strict_transport_security
    content_type_options      = var.security_headers.content_type_options
    frame_options             = var.security_headers.frame_options
    xss_protection            = var.security_headers.xss_protection
    referrer_policy           = var.security_headers.referrer_policy
    permissions_policy        = var.security_headers.permissions_policy
  })
}

# Worker domain (optional custom domain)
resource "cloudflare_workers_kv_namespace" "cache" {
  title   = "${var.script_name}-cache"
  binding = "CACHE"
}

# Default worker script template
locals {
  default_worker_script = <<-EOT
    export default {
      async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // Health check endpoint
        if (url.pathname === '/health') {
          return new Response(JSON.stringify({
            status: 'healthy',
            timestamp: new Date().toISOString(),
            env: env.API_CONFIG
          }), {
            headers: { 'Content-Type': 'application/json' }
          });
        }
        
        // Manifest handling
        if (url.pathname.startsWith('/manifest/')) {
          return handleManifest(request, env);
        }
        
        // API routing
        if (url.pathname.startsWith('/api/')) {
          return handleAPI(request, env);
        }
        
        return new Response('Not Found', { status: 404 });
      }
    };
    
    async function handleManifest(request, env) {
      // Manifest storage and retrieval logic
      const storage = env.STORAGE_CREDENTIALS;
      
      if (request.method === 'GET') {
        return new Response(JSON.stringify({
          manifest_id: 'demo-manifest',
          status: 'verified'
        }), {
          headers: { 
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600'
          }
        });
      }
      
      if (request.method === 'PUT') {
        // Store manifest logic
        return new Response('Manifest stored', { status: 201 });
      }
      
      return new Response('Method Not Allowed', { status: 405 });
    }
    
    async function handleAPI(request, env) {
      // API endpoint handling
      return new Response(JSON.stringify({
        message: 'C2 Concierge API',
        version: '1.0.0'
      }), {
        headers: { 'Content-Type': 'application/json' }
      });
    }
  EOT
}

# Outputs
output "script_name" {
  description = "Worker script name"
  value       = cloudflare_worker_script.script.name
}

output "worker_url" {
  description = "Worker URL"
  value       = "https://${var.script_name}.${var.zone_id}.workers.dev"
}

output "routes" {
  description = "Worker routes"
  value       = cloudflare_worker_route.routes[*].pattern
}
