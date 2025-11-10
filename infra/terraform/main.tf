# CredLink Infrastructure - Main Terraform Configuration
# Phase 4: Production Infrastructure Deployment

terraform {
  required_version = ">= 1.5.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.5"
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
# Security Groups - Week 2
#---------------------------------------------------

# Security Group for RDS PostgreSQL
resource "aws_security_group" "rds" {
  name_prefix = "${var.project_name}-${var.environment}-rds-"
  description = "Security group for RDS PostgreSQL database"
  vpc_id      = module.vpc.vpc_id

  # Allow PostgreSQL from ECS tasks (will be created in Week 3)
  ingress {
    description     = "PostgreSQL from private subnets"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    cidr_blocks     = [for subnet in module.vpc.private_subnet_ids : data.aws_subnet.private[subnet].cidr_block]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-rds-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Security Group for ElastiCache Redis
resource "aws_security_group" "redis" {
  name_prefix = "${var.project_name}-${var.environment}-redis-"
  description = "Security group for ElastiCache Redis"
  vpc_id      = module.vpc.vpc_id

  # Allow Redis from ECS tasks
  ingress {
    description     = "Redis from private subnets"
    from_port       = 6379
    to_port         = 6379
    protocol        = "tcp"
    cidr_blocks     = [for subnet in module.vpc.private_subnet_ids : data.aws_subnet.private[subnet].cidr_block]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-redis-sg"
    }
  )

  lifecycle {
    create_before_destroy = true
  }
}

# Data source for subnet CIDR blocks
data "aws_subnet" "private" {
  for_each = toset(module.vpc.private_subnet_ids)
  id       = each.value
}

#---------------------------------------------------
# RDS PostgreSQL - Week 2
#---------------------------------------------------

# Random password for RDS
resource "random_password" "db_password" {
  length  = 32
  special = true
}

# Store database credentials in Secrets Manager
resource "aws_secretsmanager_secret" "db_credentials" {
  name_prefix             = "${var.project_name}-${var.environment}-db-"
  description             = "Database credentials for RDS PostgreSQL"
  recovery_window_in_days = 7

  tags = var.tags
}

resource "aws_secretsmanager_secret_version" "db_credentials" {
  secret_id = aws_secretsmanager_secret.db_credentials.id
  secret_string = jsonencode({
    username = "credlink_admin"
    password = random_password.db_password.result
    engine   = "postgres"
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name
  })
}

# RDS PostgreSQL Instance
resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-${var.environment}-db"

  # Engine Configuration
  engine               = "postgres"
  engine_version       = "15.4"
  instance_class       = var.db_instance_class
  allocated_storage    = var.db_allocated_storage
  max_allocated_storage = var.db_allocated_storage * 5
  storage_type         = "gp3"
  storage_encrypted    = true

  # Database Configuration
  db_name  = "credlink"
  username = "credlink_admin"
  password = random_password.db_password.result

  # Network Configuration
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]
  publicly_accessible    = false
  multi_az               = var.db_multi_az

  # Backup Configuration
  backup_retention_period = var.db_backup_retention_days
  backup_window          = "03:00-04:00"
  maintenance_window     = "mon:04:00-mon:05:00"
  skip_final_snapshot    = var.environment != "production"
  final_snapshot_identifier = var.environment == "production" ? "${var.project_name}-${var.environment}-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}" : null

  # Monitoring
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled    = var.enable_enhanced_monitoring
  monitoring_interval             = var.enable_enhanced_monitoring ? 60 : 0
  monitoring_role_arn             = var.enable_enhanced_monitoring ? aws_iam_role.rds_monitoring[0].arn : null

  # Parameter Group
  parameter_group_name = aws_db_parameter_group.main.name

  # Deletion Protection
  deletion_protection = var.environment == "production"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-db"
    }
  )

  depends_on = [aws_cloudwatch_log_group.rds]
}

# RDS Parameter Group
resource "aws_db_parameter_group" "main" {
  name_prefix = "${var.project_name}-${var.environment}-pg-"
  family      = "postgres15"
  description = "Custom parameter group for CredLink PostgreSQL"

  # Optimize for application workload
  parameter {
    name  = "shared_preload_libraries"
    value = "pg_stat_statements"
  }

  parameter {
    name  = "log_statement"
    value = "all"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # Log queries taking > 1 second
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# CloudWatch Log Group for RDS
resource "aws_cloudwatch_log_group" "rds" {
  name              = "/aws/rds/instance/${var.project_name}-${var.environment}-db/postgresql"
  retention_in_days = 30

  tags = var.tags
}

# IAM Role for RDS Enhanced Monitoring
resource "aws_iam_role" "rds_monitoring" {
  count = var.enable_enhanced_monitoring ? 1 : 0

  name_prefix = "${var.project_name}-${var.environment}-rds-monitoring-"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  count = var.enable_enhanced_monitoring ? 1 : 0

  role       = aws_iam_role.rds_monitoring[0].name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

#---------------------------------------------------
# ElastiCache Redis - Week 2
#---------------------------------------------------

# ElastiCache Subnet Group (already created in VPC module)
# Using: module.vpc.elasticache_subnet_group_name

# ElastiCache Redis Cluster
resource "aws_elasticache_replication_group" "main" {
  replication_group_id       = "${var.project_name}-${var.environment}-redis"
  replication_group_description = "Redis cluster for CredLink"

  engine               = "redis"
  engine_version       = "7.0"
  node_type            = var.redis_node_type
  num_cache_clusters   = var.redis_num_cache_nodes
  port                 = 6379

  # Network Configuration
  subnet_group_name  = module.vpc.elasticache_subnet_group_name
  security_group_ids = [aws_security_group.redis.id]

  # High Availability
  automatic_failover_enabled = var.redis_num_cache_nodes > 1
  multi_az_enabled          = var.redis_num_cache_nodes > 1

  # Backup Configuration
  snapshot_retention_limit = 5
  snapshot_window         = "03:00-05:00"
  maintenance_window      = "mon:05:00-mon:07:00"

  # Encryption
  at_rest_encryption_enabled = true
  transit_encryption_enabled = false # Disable for simplicity, enable in production

  # Parameter Group
  parameter_group_name = aws_elasticache_parameter_group.main.name

  # Notifications
  notification_topic_arn = var.enable_enhanced_monitoring ? aws_sns_topic.redis_notifications[0].arn : null

  tags = var.tags
}

# Redis Parameter Group
resource "aws_elasticache_parameter_group" "main" {
  name_prefix = "${var.project_name}-${var.environment}-redis-"
  family      = "redis7"
  description = "Custom parameter group for CredLink Redis"

  # Optimize for caching workload
  parameter {
    name  = "maxmemory-policy"
    value = "allkeys-lru"
  }

  parameter {
    name  = "timeout"
    value = "300"
  }

  tags = var.tags

  lifecycle {
    create_before_destroy = true
  }
}

# SNS Topic for Redis Notifications
resource "aws_sns_topic" "redis_notifications" {
  count = var.enable_enhanced_monitoring ? 1 : 0

  name_prefix = "${var.project_name}-${var.environment}-redis-"

  tags = var.tags
}

resource "aws_sns_topic_subscription" "redis_email" {
  count = var.enable_enhanced_monitoring ? 1 : 0

  topic_arn = aws_sns_topic.redis_notifications[0].arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

#---------------------------------------------------
# S3 Buckets - Week 2
#---------------------------------------------------

# S3 Bucket for Proof Storage
resource "aws_s3_bucket" "proofs" {
  bucket = "${var.project_name}-${var.environment}-proofs-${data.aws_caller_identity.current.account_id}"

  tags = merge(
    var.tags,
    {
      Name = "${var.project_name}-${var.environment}-proofs"
    }
  )
}

# Enable Versioning
resource "aws_s3_bucket_versioning" "proofs" {
  bucket = aws_s3_bucket.proofs.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Enable Encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "proofs" {
  bucket = aws_s3_bucket.proofs.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Block Public Access
resource "aws_s3_bucket_public_access_block" "proofs" {
  bucket = aws_s3_bucket.proofs.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Lifecycle Policy
resource "aws_s3_bucket_lifecycle_configuration" "proofs" {
  bucket = aws_s3_bucket.proofs.id

  rule {
    id     = "transition-to-glacier"
    status = "Enabled"

    transition {
      days          = var.s3_lifecycle_glacier_days
      storage_class = "GLACIER"
    }

    expiration {
      days = var.s3_lifecycle_expiration_days
    }
  }

  rule {
    id     = "delete-old-versions"
    status = "Enabled"

    noncurrent_version_expiration {
      noncurrent_days = 30
    }
  }
}

# CORS Configuration
resource "aws_s3_bucket_cors_configuration" "proofs" {
  bucket = aws_s3_bucket.proofs.id

  cors_rule {
    allowed_headers = ["*"]
    allowed_methods = ["GET", "HEAD"]
    allowed_origins = ["*"] # Restrict this in production
    max_age_seconds = 3000
  }
}

#---------------------------------------------------
# Placeholder for Week 3 resources:
# - ECR Repository
# - ECS Cluster
# - Task Definition
# - Application Load Balancer
#---------------------------------------------------
