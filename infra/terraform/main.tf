# CredLink Infrastructure - Main Terraform Configuration
# Phase 4: Production Infrastructure Deployment

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state storage in S3
  # Uncomment after creating the S3 bucket
  # backend "s3" {
  #   bucket         = "credlink-terraform-state"
  #   key            = "production/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "credlink-terraform-locks"
  # }
}

# AWS Provider Configuration
provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Project     = "CredLink"
      ManagedBy   = "Terraform"
      Environment = var.environment
      CostCenter  = "Engineering"
    }
  }
}

# Data source for availability zones
data "aws_availability_zones" "available" {
  state = "available"
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# Data source for current AWS region
data "aws_region" "current" {}

#---------------------------------------------------
# VPC Module - Network Infrastructure
#---------------------------------------------------

module "vpc" {
  source = "./modules/vpc"

  project_name     = var.project_name
  environment      = var.environment
  vpc_cidr         = var.vpc_cidr
  az_count         = var.availability_zones_count
  enable_flow_logs = var.enable_enhanced_monitoring

  tags = var.tags
}

#---------------------------------------------------
# Placeholder for additional resources
# These will be added in subsequent weeks:
# - ECS Cluster (Week 3)
# - RDS Database (Week 2)
# - ElastiCache Redis (Week 2)
# - S3 Buckets (Week 2)
# - Application Load Balancer (Week 3)
# - ECR Repository (Week 3)
#---------------------------------------------------
