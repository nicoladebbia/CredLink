# Secrets Module Variables

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "environment" {
  description = "Environment name (dev, staging, prod)"
  type        = string
}

variable "api_keys_value" {
  description = "API keys in format: key1:client1:Name1,key2:client2:Name2"
  type        = string
  sensitive   = true

  validation {
    condition     = can(regex("^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:[^,]+", var.api_keys_value))
    error_message = "API keys must be in format: key:clientId:name or key:clientId:name,key2:clientId2:name2"
  }
}

variable "recovery_window_days" {
  description = "Number of days to retain deleted secrets for recovery"
  type        = number
  default     = 7

  validation {
    condition     = var.recovery_window_days >= 7 && var.recovery_window_days <= 30
    error_message = "Recovery window must be between 7 and 30 days"
  }
}

variable "enable_rotation" {
  description = "Enable automatic secret rotation"
  type        = bool
  default     = false
}

variable "rotation_lambda_arn" {
  description = "ARN of Lambda function for secret rotation"
  type        = string
  default     = null
}

variable "rotation_days" {
  description = "Days between automatic rotations"
  type        = number
  default     = 30
}

variable "kms_key_arn" {
  description = "KMS key ARN for envelope encryption (optional, uses AWS managed key if null)"
  type        = string
  default     = null
}

variable "ecs_task_execution_role_name" {
  description = "Name of ECS task execution role to attach secrets policy to"
  type        = string
  default     = null
}

variable "enable_monitoring" {
  description = "Enable CloudWatch monitoring and alarms"
  type        = bool
  default     = true
}

variable "application_log_group_name" {
  description = "CloudWatch log group name for application logs"
  type        = string
  default     = null
}

variable "alarm_sns_topic_arn" {
  description = "SNS topic ARN for CloudWatch alarms"
  type        = string
  default     = null
}

variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default     = {}
}
