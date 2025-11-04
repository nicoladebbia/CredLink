# Storage module variables

variable "env" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project name"
  type        = string
}

variable "use_r2" {
  description = "Use Cloudflare R2 instead of S3"
  type        = bool
}

variable "r2" {
  description = "R2 configuration"
  type = object({
    bucket_name = string
    account_id  = string
  })
  default = null
}

variable "s3" {
  description = "S3 configuration"
  type = object({
    bucket_name = string
    region      = string
    object_lock = object({
      enabled = bool
      mode    = string
      days    = number
    })
    kms_key_id = optional(string)
  })
  default = null
}

variable "vpc_id" {
  description = "VPC ID for Lambda security group"
  type        = string
  default     = ""
}

variable "lambda_subnet_ids" {
  description = "List of subnet IDs for Lambda VPC configuration"
  type        = list(string)
  default     = []
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}

variable "destroy_protect" {
  description = "Enable destroy protection"
  type        = bool
  default     = true
}
