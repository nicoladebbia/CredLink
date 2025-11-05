# OpenTelemetry Collector module variables

variable "env" {
  description = "Environment name"
  type        = string
}

variable "project" {
  description = "Project name"
  type        = string
}

variable "kubeconfig_path" {
  description = "Path to kubeconfig file"
  type        = string
}

variable "namespace" {
  description = "Kubernetes namespace"
  type        = string
}

variable "enable_otel_collector" {
  description = "Enable OpenTelemetry collector"
  type        = bool
  default     = true
}

variable "otlp_endpoint" {
  description = "OTLP endpoint for telemetry export"
  type        = string
  default     = ""
}

variable "otlp_api_key" {
  description = "OTLP API key for authentication"
  type        = string
  default     = ""
  sensitive   = true
}

variable "tags" {
  description = "Resource tags"
  type        = map(string)
  default     = {}
}

variable "collector_config" {
  description = "OpenTelemetry Collector configuration"
  type        = any
  default     = {}
}
