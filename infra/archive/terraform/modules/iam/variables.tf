# IAM module variables

variable "env" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project name"
  type        = string
}

variable "storage_bucket_name" {
  description = "Storage bucket name"
  type        = string
}

variable "storage_type" {
  description = "Storage type (s3 or r2)"
  type        = string
}

variable "worker_script_name" {
  description = "Worker script name"
  type        = string
}

variable "queue_names" {
  description = "List of queue names"
  type        = list(string)
  default     = []
}

variable "token_scopes" {
  description = "Token scopes configuration"
  type = list(object({
    name        = string
    permissions = list(string)
  }))
  default = []
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
}



variable "allowed_ip_ranges" {
  description = "IP ranges allowed to access resources"
  type        = list(string)
  default     = []
}

variable "token_ttl_seconds" {
  description = "API token TTL in seconds"
  type        = number
  default     = 3600
}

variable "use_vault_secrets" {
  description = "Whether to use HashiCorp Vault for secrets management"
  type        = bool
  default     = true
}

variable "vault_address" {
  description = "Vault server address"
  type        = string
  default     = ""
}

variable "vault_token" {
  description = "Vault authentication token"
  type        = string
  default     = ""
  sensitive   = true
}

variable "vpc_endpoint_id" {
  description = "VPC endpoint ID for S3 access restriction (e.g., vpce-0abcd1234efgh5678). Must be a valid VPC endpoint ID if provided."
  type        = string
  default     = null

  validation {
    condition = (
      var.vpc_endpoint_id == null ||
      can(regex("^vpce-[a-f0-9]{8}$", var.vpc_endpoint_id)) ||
      can(regex("^vpce-[a-f0-9]{17}$", var.vpc_endpoint_id))
    )
    error_message = "VPC endpoint ID must be in format 'vpce-XXXXXXXX' or 'vpce-XXXXXXXXXXXXXXXXX' (8 or 17 hex characters). Do not use placeholder IDs like 'vpce-1a2b3c4d'."
  }
}

variable "cloudflare_permission_groups" {
  description = <<EOT
Cloudflare permission group IDs for API tokens.
IMPORTANT: These must be real IDs from your Cloudflare account.
Get actual IDs: curl -H "Authorization: Bearer YOUR_TOKEN" https://api.cloudflare.com/client/v4/user/tokens/permission_groups
See cloudflare-permission-groups.auto.tfvars.example for details.
EOT
  type = object({
    r2_read_write = string
    worker_edit   = string
    worker_routes = string
    queue_read    = string
    queue_write   = string
  })

  validation {
    condition = alltrue([
      for k, v in var.cloudflare_permission_groups :
      length(v) == 32 && can(regex("^[a-f0-9]{32}$", v))
    ])
    error_message = "All permission group IDs must be 32-character hexadecimal strings. Please replace placeholder IDs with real Cloudflare permission group IDs."
  }
}
