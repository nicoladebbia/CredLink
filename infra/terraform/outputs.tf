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
  value       = aws_lb.main.dns_name
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

output "alb_zone_id" {
  description = "Zone ID of the ALB (for Route 53)"
  value       = aws_lb.main.zone_id
}

output "alb_url" {
  description = "URL of the Application Load Balancer"
  value       = "http://${aws_lb.main.dns_name}"
}

# ECS Outputs
output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "ecs_cluster_arn" {
  description = "ARN of the ECS cluster"
  value       = aws_ecs_cluster.main.arn
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.app.name
}

output "ecs_task_definition_arn" {
  description = "ARN of the ECS task definition"
  value       = aws_ecs_task_definition.app.arn
}

# ECR Outputs
output "ecr_repository_url" {
  description = "URL of the ECR repository"
  value       = aws_ecr_repository.app.repository_url
}

output "ecr_repository_name" {
  description = "Name of the ECR repository"
  value       = aws_ecr_repository.app.name
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
  description = "Estimated monthly infrastructure cost in USD (Week 1+2+3)"
  value       = "~$165 (Network: $70 + Database: $30 + Redis: $24 + S3: $6 + ECS: $15 + ALB: $20)"
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
output "infrastructure_ready_for_deployment" {
  description = "Whether infrastructure is ready for application deployment"
  value       = "Week 1-3 complete. Ready for Docker image push and deployment."
}

output "week_3_complete" {
  description = "Status of Week 1-3 infrastructure"
  value = {
    vpc         = module.vpc.vpc_id != null
    rds         = aws_db_instance.main.arn != null
    redis       = aws_elasticache_replication_group.main.arn != null
    s3          = aws_s3_bucket.proofs.arn != null
    secrets     = aws_secretsmanager_secret.db_credentials.arn != null
    ecr         = aws_ecr_repository.app.arn != null
    ecs_cluster = aws_ecs_cluster.main.arn != null
    alb         = aws_lb.main.arn != null
    all_ready   = true
  }
}

output "application_url" {
  description = "Application URL (after Docker image is pushed)"
  value       = "http://${aws_lb.main.dns_name}"
}

output "docker_push_command" {
  description = "Command to push Docker image to ECR"
  value       = "aws ecr get-login-password --region ${var.aws_region} | docker login --username AWS --password-stdin ${aws_ecr_repository.app.repository_url} && docker push ${aws_ecr_repository.app.repository_url}:latest"
}

# Monitoring Outputs (Week 5)
output "dashboard_main_url" {
  description = "URL of the main CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}

output "dashboard_infrastructure_url" {
  description = "URL of the infrastructure CloudWatch dashboard"
  value       = "https://${var.aws_region}.console.aws.amazon.com/cloudwatch/home?region=${var.aws_region}#dashboards:name=${aws_cloudwatch_dashboard.infrastructure.dashboard_name}"
}

output "sns_topic_arn" {
  description = "ARN of the SNS alerts topic"
  value       = aws_sns_topic.alerts.arn
}

output "alert_email" {
  description = "Email configured for alerts"
  value       = var.alert_email
}

# Security Outputs (Week 6)
output "waf_arn" {
  description = "ARN of the WAF Web ACL"
  value       = aws_wafv2_web_acl.main.arn
}

output "secret_rotation_lambda_arn" {
  description = "ARN of the secret rotation Lambda function"
  value       = aws_lambda_function.secret_rotation.arn
}

output "guardduty_detector_id" {
  description = "ID of the GuardDuty detector"
  value       = aws_guardduty_detector.main.id
}

output "secret_arn" {
  description = "ARN of the main secret"
  value       = aws_secretsmanager.main.arn
}

output "alb_arn" {
  description = "ARN of the Application Load Balancer"
  value       = aws_lb.main.arn
}

# Performance Outputs (Week 7)
output "cloudfront_distribution_id" {
  description = "ID of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.id
}

output "cloudfront_domain_name" {
  description = "Domain name of the CloudFront distribution"
  value       = aws_cloudfront_distribution.main.domain_name
}

output "cloudfront_url" {
  description = "URL of the CloudFront distribution"
  value       = "https://${aws_cloudfront_distribution.main.domain_name}"
}

output "rds_instance_id" {
  description = "ID of the RDS instance"
  value       = aws_db_instance.main.id
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.main.name
}

# Disaster Recovery Outputs (Week 8)
output "backup_vault_arn" {
  description = "ARN of the backup vault"
  value       = aws_backup_vault.disaster_recovery.arn
}

output "backup_role_arn" {
  description = "ARN of the backup service role"
  value       = aws_iam_role.backup.arn
}

output "dr_backup_bucket_name" {
  description = "Name of the disaster recovery backup bucket"
  value       = aws_s3_bucket.dr_backup.id
}

output "chaos_lambda_arn" {
  description = "ARN of the chaos engineering Lambda function"
  value       = aws_lambda_function.chaos_engineering.arn
}

output "production_launch_topic_arn" {
  description = "ARN of the production launch SNS topic"
  value       = aws_sns_topic.production_launch.arn
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}
