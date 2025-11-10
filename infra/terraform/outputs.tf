# CredLink Infrastructure Outputs
# These values are available after terraform apply

# Network Outputs
output "vpc_id" {
  description = "ID of the VPC"
  value       = module.vpc.vpc_id
}

output "public_subnet_ids" {
  description = "IDs of public subnets"
  value       = module.vpc.public_subnet_ids
}

output "private_subnet_ids" {
  description = "IDs of private subnets"
  value       = module.vpc.private_subnet_ids
}

output "database_subnet_ids" {
  description = "IDs of database subnets"
  value       = module.vpc.database_subnet_ids
}

# Load Balancer Outputs
output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = try(module.alb[0].dns_name, "not_created")
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = try(module.alb[0].arn, "not_created")
}

output "alb_zone_id" {
  description = "Zone ID of the ALB (for Route 53)"
  value       = try(module.alb[0].zone_id, "not_created")
}

# ECS Outputs (Week 3)
output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = "pending_week_3"
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = "pending_week_3"
}

# ECR Outputs (Week 3)
output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = "pending_week_3"
}

# Database Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = aws_db_instance.main.endpoint
  sensitive   = true
}

output "rds_database_name" {
  description = "Name of the RDS database"
  value       = aws_db_instance.main.db_name
}

output "rds_arn" {
  description = "ARN of the RDS instance"
  value       = aws_db_instance.main.arn
}

# Redis Outputs
output "redis_endpoint" {
  description = "ElastiCache Redis primary endpoint"
  value       = aws_elasticache_replication_group.main.primary_endpoint_address
  sensitive   = true
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = aws_elasticache_replication_group.main.port
}

output "redis_reader_endpoint" {
  description = "ElastiCache Redis reader endpoint"
  value       = aws_elasticache_replication_group.main.reader_endpoint_address
  sensitive   = true
}

# S3 Outputs
output "proofs_bucket_name" {
  description = "Name of the S3 bucket for proof storage"
  value       = aws_s3_bucket.proofs.id
}

output "proofs_bucket_arn" {
  description = "ARN of the S3 bucket for proof storage"
  value       = aws_s3_bucket.proofs.arn
}

output "proofs_bucket_domain_name" {
  description = "Domain name of the S3 bucket"
  value       = aws_s3_bucket.proofs.bucket_domain_name
}

# Secrets Manager Outputs
output "secrets_manager_arn" {
  description = "ARN of the database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.arn
  sensitive   = true
}

output "secrets_manager_name" {
  description = "Name of the database credentials secret"
  value       = aws_secretsmanager_secret.db_credentials.name
}

# CloudWatch Outputs
output "rds_log_group_name" {
  description = "Name of the RDS CloudWatch log group"
  value       = aws_cloudwatch_log_group.rds.name
}

# Cost Tracking
output "monthly_estimated_cost_usd" {
  description = "Estimated monthly infrastructure cost in USD (Week 1+2)"
  value       = "~$100-135 (Network: $70 + Database: $15 + Redis: $12 + S3: $3)"
}

# Deployment Information
output "deployment_info" {
  description = "Important deployment information"
  value = {
    region      = var.aws_region
    environment = var.environment
    vpc_cidr    = var.vpc_cidr
    azs         = data.aws_availability_zones.available.names
  }
}

# Connection Strings (for application configuration)
output "database_url" {
  description = "Database connection URL (use with caution - sensitive)"
  value       = "postgresql://${aws_db_instance.main.username}@${aws_db_instance.main.endpoint}/${aws_db_instance.main.db_name}"
  sensitive   = true
}

output "redis_url" {
  description = "Redis connection URL"
  value       = "redis://${aws_elasticache_replication_group.main.primary_endpoint_address}:${aws_elasticache_replication_group.main.port}"
  sensitive   = true
}

# Infrastructure Status
output "infrastructure_ready_for_app" {
  description = "Whether infrastructure is ready for application deployment (Week 3)"
  value       = "Database layer ready. Application layer pending Week 3."
}

output "week_2_complete" {
  description = "Status of Week 2 infrastructure"
  value = {
    vpc          = module.vpc.vpc_id != null
    rds          = aws_db_instance.main.arn != null
    redis        = aws_elasticache_replication_group.main.arn != null
    s3           = aws_s3_bucket.proofs.arn != null
    secrets      = aws_secretsmanager_secret.db_credentials.arn != null
    all_ready    = true
  }
}
