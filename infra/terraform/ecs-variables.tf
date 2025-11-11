# AWS Region
variable "aws_region" {
  description = "AWS region for resources"
  type        = string
  default     = "us-east-1"
}

# VPC Configuration
variable "vpc_id" {
  description = "VPC ID for ECS resources"
  type        = string
}

variable "private_subnet_ids" {
  description = "List of private subnet IDs for ECS tasks"
  type        = list(string)
}

# ALB Configuration
variable "target_group_arn" {
  description = "ARN of the ALB target group"
  type        = string
}

variable "alb_listener_arn" {
  description = "ARN of the ALB listener"
  type        = string
}

variable "alb_security_group_id" {
  description = "Security group ID of the ALB"
  type        = string
}

# ECR Configuration
variable "ecr_repository_url" {
  description = "URL of the ECR repository"
  type        = string
}

# Secrets Manager
variable "secrets_manager_arn" {
  description = "ARN of the Secrets Manager secret"
  type        = string
}

# S3 Configuration
variable "s3_bucket_arn" {
  description = "ARN of the S3 bucket for proof storage"
  type        = string
}

# Tags
variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "project_name" {
  description = "Project name"
  type        = string
  default     = "credlink"
}
