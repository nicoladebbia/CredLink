# Secrets Management with AWS Secrets Manager
#
# This file demonstrates proper secrets management instead of hardcoding values

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "${var.project_name}-${var.environment}-db-password"
  description             = "RDS database master password"
  recovery_window_in_days = 7

  tags = {
    Name        = "${var.project_name}-db-password"
    Environment = var.environment
    Terraform   = "true"
  }
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id = aws_secretsmanager_secret.db_password.id
  secret_string = jsonencode({
    username = var.db_username
    password = var.db_password # This should come from TF_VAR or vault, never committed
  })
}

resource "aws_secretsmanager_secret" "jwt_secret" {
  name                    = "${var.project_name}-${var.environment}-jwt-secret"
  description             = "JWT signing secret"
  recovery_window_in_days = 7

  tags = {
    Name        = "${var.project_name}-jwt-secret"
    Environment = var.environment
    Terraform   = "true"
  }
}

resource "aws_secretsmanager_secret_version" "jwt_secret" {
  secret_id = aws_secretsmanager_secret.jwt_secret.id
  secret_string = jsonencode({
    secret = var.jwt_secret # Should be generated and stored in vault
  })
}

resource "aws_secretsmanager_secret" "api_keys" {
  name                    = "${var.project_name}-${var.environment}-api-keys"
  description             = "API Keys and HMAC secrets"
  recovery_window_in_days = 7

  tags = {
    Name        = "${var.project_name}-api-keys"
    Environment = var.environment
    Terraform   = "true"
  }
}

# IAM policy to allow ECS tasks to read secrets
data "aws_iam_policy_document" "secrets_access" {
  statement {
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue",
      "secretsmanager:DescribeSecret"
    ]
    resources = [
      aws_secretsmanager_secret.db_password.arn,
      aws_secretsmanager_secret.jwt_secret.arn,
      aws_secretsmanager_secret.api_keys.arn
    ]
  }
}

resource "aws_iam_policy" "secrets_access" {
  name        = "${var.project_name}-${var.environment}-secrets-access"
  description = "Allow ECS tasks to read secrets"
  policy      = data.aws_iam_policy_document.secrets_access.json
}

# Attach to ECS task role
resource "aws_iam_role_policy_attachment" "ecs_secrets" {
  role       = aws_iam_role.ecs_task_role.name
  policy_arn = aws_iam_policy.secrets_access.arn
}

# Outputs (ARNs only, never the actual secrets)
output "db_password_secret_arn" {
  value       = aws_secretsmanager_secret.db_password.arn
  description = "ARN of the database password secret"
}

output "jwt_secret_arn" {
  value       = aws_secretsmanager_secret.jwt_secret.arn
  description = "ARN of the JWT secret"
}
