# Worker relay module variables

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
  description = "Worker routes configuration"
  type = list(object({
    pattern   = string
    zone_name = optional(string)
  }))
  default = []
}

variable "static_dir" {
  description = "Directory for static assets"
  type        = string
  default     = ""
}

variable "static_assets_enabled" {
  description = "Enable static assets"
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
    compatibility_flags = ["nodejs_compat"]
    placement = {
      mode = "smart"
    }
  }
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
