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

variable "queue_name" {
  description = "Queue name"
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
  description = "VPC endpoint ID for S3 access restriction"
  type        = string
  default     = null
}
