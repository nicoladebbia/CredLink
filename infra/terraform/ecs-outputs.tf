# ECS Cluster Outputs
output "ecs_cluster_id" {
  description = "ID of the ECS cluster"
  value       = aws_ecs_cluster.credlink.id
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.credlink.name
}

# ECS Service Outputs
output "ecs_service_id" {
  description = "ID of the ECS service"
  value       = aws_ecs_service.credlink_api.id
}

output "ecs_service_name" {
  description = "Name of the ECS service"
  value       = aws_ecs_service.credlink_api.name
}

# Task Definition Outputs
output "task_definition_arn" {
  description = "ARN of the task definition"
  value       = aws_ecs_task_definition.credlink_api.arn
}

output "task_definition_family" {
  description = "Family of the task definition"
  value       = aws_ecs_task_definition.credlink_api.family
}

# Security Group Outputs
output "ecs_tasks_security_group_id" {
  description = "Security group ID for ECS tasks"
  value       = aws_security_group.ecs_tasks.id
}

# IAM Role Outputs
output "ecs_execution_role_arn" {
  description = "ARN of the ECS execution role"
  value       = aws_iam_role.ecs_execution_role.arn
}

output "ecs_task_role_arn" {
  description = "ARN of the ECS task role"
  value       = aws_iam_role.ecs_task_role.arn
}

# CloudWatch Log Group Output
output "cloudwatch_log_group_name" {
  description = "Name of the CloudWatch log group"
  value       = aws_cloudwatch_log_group.ecs_logs.name
}
