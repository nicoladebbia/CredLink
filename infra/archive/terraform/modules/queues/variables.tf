# Queues module variables

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
  type = list(object({
    name        = string
    type        = string
    binding     = optional(string, "")
    max_retries = optional(number, 3)
    timeout     = optional(number, 300)
  }))
  default = []
}

variable "worker_script_name" {
  description = "Worker script name for bindings"
  type        = string
}

variable "cloudflare_account_id" {
  description = "Cloudflare account ID"
  type        = string
  sensitive   = true
}

