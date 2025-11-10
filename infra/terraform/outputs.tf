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

# ECS Outputs
output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = try(aws_ecs_cluster.main[0].name, "not_created")
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = try(aws_ecs_service.app[0].name, "not_created")
}

# Database Outputs
output "rds_endpoint" {
  description = "RDS instance endpoint"
  value       = try(aws_db_instance.main[0].endpoint, "not_created")
  sensitive   = true
}

output "rds_database_name" {
  description = "Name of the RDS database"
  value       = try(aws_db_instance.main[0].db_name, "not_created")
}

# Redis Outputs
output "redis_endpoint" {
  description = "ElastiCache Redis endpoint"
  value       = try(aws_elasticache_cluster.main[0].cache_nodes[0].address, "not_created")
  sensitive   = true
}

output "redis_port" {
  description = "ElastiCache Redis port"
  value       = try(aws_elasticache_cluster.main[0].cache_nodes[0].port, 6379)
}

# S3 Outputs
output "proofs_bucket_name" {
  description = "Name of the S3 bucket for proof storage"
  value       = try(aws_s3_bucket.proofs[0].id, "not_created")
}

output "proofs_bucket_arn" {
  description = "ARN of the S3 bucket for proof storage"
  value       = try(aws_s3_bucket.proofs[0].arn, "not_created")
}

# ECR Outputs
output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = try(aws_ecr_repository.app[0].repository_url, "not_created")
}

# Secrets Manager Outputs
output "secrets_manager_arn" {
  description = "ARN of the database credentials secret"
  value       = try(aws_secretsmanager_secret.db_credentials[0].arn, "not_created")
  sensitive   = true
}

# CloudWatch Outputs
output "log_group_name" {
  description = "Name of the CloudWatch log group"
  value       = try(aws_cloudwatch_log_group.app[0].name, "not_created")
}

# Cost Tracking
output "monthly_estimated_cost_usd" {
  description = "Estimated monthly infrastructure cost in USD"
  value       = "~75-150 (depends on traffic)"
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
  value       = try("postgresql://${aws_db_instance.main[0].username}@${aws_db_instance.main[0].endpoint}/${aws_db_instance.main[0].db_name}", "not_created")
  sensitive   = true
}

output "redis_url" {
  description = "Redis connection URL"
  value       = try("redis://${aws_elasticache_cluster.main[0].cache_nodes[0].address}:${aws_elasticache_cluster.main[0].cache_nodes[0].port}", "not_created")
  sensitive   = true
}

# Infrastructure Status
output "infrastructure_ready" {
  description = "Whether infrastructure is ready for application deployment"
  value       = try(module.vpc.vpc_id != null && aws_ecs_cluster.main[0].id != null, false)
}
