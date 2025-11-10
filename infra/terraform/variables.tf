# CredLink Infrastructure Variables
# Configure these based on your environment

variable "aws_region" {
  description = "AWS region for infrastructure deployment"
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Environment name (development, staging, production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["development", "staging", "production"], var.environment)
    error_message = "Environment must be development, staging, or production."
  }
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
  default     = "credlink"
}

# Network Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "availability_zones_count" {
  description = "Number of availability zones to use"
  type        = number
  default     = 2

  validation {
    condition     = var.availability_zones_count >= 2 && var.availability_zones_count <= 3
    error_message = "Must use 2-3 availability zones for production."
  }
}

# Application Configuration
variable "app_port" {
  description = "Port the application listens on"
  type        = number
  default     = 3001
}

variable "health_check_path" {
  description = "Health check endpoint path"
  type        = string
  default     = "/health"
}

# ECS Configuration
variable "ecs_task_cpu" {
  description = "CPU units for ECS task (256 = 0.25 vCPU)"
  type        = number
  default     = 256
}

variable "ecs_task_memory" {
  description = "Memory for ECS task in MB"
  type        = number
  default     = 512
}

variable "ecs_desired_count" {
  description = "Desired number of ECS tasks"
  type        = number
  default     = 2

  validation {
    condition     = var.ecs_desired_count >= 2
    error_message = "Must run at least 2 tasks for high availability."
  }
}

variable "ecs_max_count" {
  description = "Maximum number of ECS tasks for auto-scaling"
  type        = number
  default     = 10
}

# Database Configuration
variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t3.micro"
}

variable "db_allocated_storage" {
  description = "Allocated storage for RDS in GB"
  type        = number
  default     = 20
}

variable "db_backup_retention_days" {
  description = "Number of days to retain automated backups"
  type        = number
  default     = 30

  validation {
    condition     = var.db_backup_retention_days >= 7
    error_message = "Must retain backups for at least 7 days in production."
  }
}

variable "db_multi_az" {
  description = "Enable Multi-AZ deployment for RDS"
  type        = bool
  default     = true
}

# Redis Configuration
variable "redis_node_type" {
  description = "ElastiCache Redis node type"
  type        = string
  default     = "cache.t3.micro"
}

variable "redis_num_cache_nodes" {
  description = "Number of cache nodes in Redis cluster"
  type        = number
  default     = 2
}

# S3 Configuration
variable "s3_lifecycle_glacier_days" {
  description = "Days until objects transition to Glacier"
  type        = number
  default     = 90
}

variable "s3_lifecycle_expiration_days" {
  description = "Days until objects are deleted (0 = never)"
  type        = number
  default     = 365
}

# Monitoring Configuration
variable "enable_enhanced_monitoring" {
  description = "Enable enhanced CloudWatch monitoring"
  type        = bool
  default     = true
}

variable "alarm_email" {
  description = "Email address for CloudWatch alarms"
  type        = string
  default     = "ops@credlink.com"
}

# Cost Management
variable "cost_alert_threshold" {
  description = "Monthly cost alert threshold in USD"
  type        = number
  default     = 200
}

# Tags
variable "tags" {
  description = "Tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "CredLink"
    ManagedBy   = "Terraform"
    Environment = "production"
  }
}

variable "alert_email" {
  description = "Email address for alert notifications"
  type        = string
  default     = "alerts@credlink.com"
  
  validation {
    condition     = can(regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", var.alert_email))
    error_message = "The alert_email must be a valid email address."
  }
}
