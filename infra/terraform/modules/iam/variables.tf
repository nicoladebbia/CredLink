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
