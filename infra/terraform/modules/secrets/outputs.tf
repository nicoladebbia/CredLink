# Secrets Module Outputs

output "api_keys_secret_arn" {
  description = "ARN of the API keys secret"
  value       = aws_secretsmanager_secret.api_keys.arn
}

output "api_keys_secret_name" {
  description = "Name of the API keys secret"
  value       = aws_secretsmanager_secret.api_keys.name
}

output "secrets_read_policy_arn" {
  description = "ARN of IAM policy for reading secrets"
  value       = aws_iam_policy.secrets_read.arn
}

output "secret_version_id" {
  description = "Version ID of the current secret"
  value       = aws_secretsmanager_secret_version.api_keys.version_id
  sensitive   = false
}
