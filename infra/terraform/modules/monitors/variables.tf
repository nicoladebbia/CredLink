# Monitors module variables

variable "env" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project name"
  type        = string
}

variable "health_checks" {
  description = "Health check URLs"
  type = list(object({
    url      = string
    name     = string
    interval = optional(number, 60)
    timeout  = optional(number, 30)
  }))
  default = []
}

variable "alert_channels" {
  description = "Alert channels configuration"
  type = list(object({
    type    = string
    email   = optional(string, "")
    webhook = optional(string, "")
  }))
  default = []
}

variable "worker_health_path" {
  description = "Worker health check path"
  type        = string
  default     = "/health"
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}
