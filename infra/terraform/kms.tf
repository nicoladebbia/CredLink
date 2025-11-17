#==================================================
# AWS KMS Key Infrastructure - Step 17 Security Hardening
#==================================================

# Create KMS key for encryption at rest
resource "aws_kms_key" "credlink_master" {
  description             = "CredLink Master Key for encryption at rest"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow RDS to use the key"
        Effect = "Allow"
        Principal = {
          Service = "rds.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      },
      {
        Sid    = "Allow S3 to use the key"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      },
      {
        Sid    = "Allow EBS to use the key"
        Effect = "Allow"
        Principal = {
          Service = "ec2.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name        = "credlink-master-key"
    Environment = var.environment
    Purpose     = "encryption-at-rest"
    ManagedBy   = "terraform"
  })
}

# Create KMS key alias
resource "aws_kms_alias" "credlink_master" {
  name          = "alias/credlink-master"
  target_key_id = aws_kms_key.credlink_master.key_id
}

#==================================================
# KMS Key for Secrets Management
#==================================================

resource "aws_kms_key" "credlink_secrets" {
  description             = "CredLink Secrets Management Key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow Secrets Manager to use the key"
        Effect = "Allow"
        Principal = {
          Service = "secretsmanager.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name        = "credlink-secrets-key"
    Environment = var.environment
    Purpose     = "secrets-management"
    ManagedBy   = "terraform"
  })
}

resource "aws_kms_alias" "credlink_secrets" {
  name          = "alias/credlink-secrets"
  target_key_id = aws_kms_key.credlink_secrets.key_id
}

#==================================================
# KMS Key for Backup Encryption
#==================================================

resource "aws_kms_key" "credlink_backups" {
  description             = "CredLink Backup Encryption Key"
  deletion_window_in_days = 30
  enable_key_rotation     = true

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "Enable IAM User Permissions"
        Effect = "Allow"
        Principal = {
          AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root"
        }
        Action   = "kms:*"
        Resource = "*"
      },
      {
        Sid    = "Allow Backup Service to use the key"
        Effect = "Allow"
        Principal = {
          Service = "backup.amazonaws.com"
        }
        Action = [
          "kms:Encrypt",
          "kms:Decrypt",
          "kms:ReEncrypt*",
          "kms:GenerateDataKey*",
          "kms:DescribeKey"
        ]
        Resource = "*"
      }
    ]
  })

  tags = merge(var.tags, {
    Name        = "credlink-backups-key"
    Environment = var.environment
    Purpose     = "backup-encryption"
    ManagedBy   = "terraform"
  })
}

resource "aws_kms_alias" "credlink_backups" {
  name          = "alias/credlink-backups"
  target_key_id = aws_kms_key.credlink_backups.key_id
}

#==================================================
# Security Outputs
#==================================================

output "kms_master_key_id" {
  description = "KMS Master Key ID for encryption at rest"
  value       = aws_kms_key.credlink_master.key_id
}

output "kms_master_key_arn" {
  description = "KMS Master Key ARN for encryption at rest"
  value       = aws_kms_key.credlink_master.arn
}

output "kms_secrets_key_id" {
  description = "KMS Secrets Key ID"
  value       = aws_kms_key.credlink_secrets.key_id
}

output "kms_secrets_key_arn" {
  description = "KMS Secrets Key ARN"
  value       = aws_kms_key.credlink_secrets.arn
}

output "kms_backups_key_id" {
  description = "KMS Backups Key ID"
  value       = aws_kms_key.credlink_backups.key_id
}

output "kms_backups_key_arn" {
  description = "KMS Backups Key ARN"
  value       = aws_kms_key.credlink_backups.arn
}
