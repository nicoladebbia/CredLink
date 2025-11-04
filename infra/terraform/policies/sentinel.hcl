# Sentinel Policies for Terraform
# Phase 45 - Terraform & Infra Blueprints (v1.2)

# Policy: Deny public S3 buckets
policy "deny-public-s3" {
  description = "S3 buckets must not be publicly accessible"
  
  # Rule to check for public access blocks
  rule {
    when = true
    condition {
      query = "aws_s3_bucket"
      attr  = "force_destroy"
      op    = "eq"
      value = true
    }
    message = "S3 bucket force_destroy must be false for security"
  }
  
  rule {
    when = true
    condition {
      query = "aws_s3_bucket_public_access_block"
      attr  = "block_public_acls"
      op    = "ne"
      value = true
    }
    message = "S3 buckets must block public ACLs"
  }
  
  rule {
    when = true
    condition {
      query = "aws_s3_bucket_public_access_block"
      attr  = "block_public_policy"
      op    = "ne"
      value = true
    }
    message = "S3 buckets must block public policies"
  }
}

# Policy: Require KMS encryption for S3
policy "require-s3-encryption" {
  description = "S3 buckets must use KMS encryption"
  
  rule {
    when = true
    condition {
      query = "aws_s3_bucket_server_side_encryption_configuration"
      attr  = "rule.0.apply_server_side_encryption_by_default.sse_algorithm"
      op    = "ne"
      value = "aws:kms"
    }
    message = "S3 buckets must use KMS encryption (aws:kms)"
  }
}

# Policy: Enforce Object Lock for production
policy "require-object-lock-prod" {
  description = "Production S3 buckets must have Object Lock enabled"
  
  rule {
    when = {
      attribute = "tags.env"
      condition = "eq"
      value     = "prod"
    }
    condition {
      query = "aws_s3_bucket_object_lock_configuration"
      attr  = "object_lock_enabled"
      op    = "ne"
      value = true
    }
    message = "Production S3 buckets must have Object Lock enabled"
  }
}

# Policy: Deny force_destroy on protected resources
policy "deny-force-destroy-protected" {
  description = "Protected resources cannot have force_destroy enabled"
  
  rule {
    when = true
    condition {
      query = "aws_s3_bucket"
      attr  = "force_destroy"
      op    = "eq"
      value = true
    }
    message = "S3 buckets cannot have force_destroy enabled when Object Lock is configured"
  }
}

# Policy: Require cost allocation tags
policy "require-cost-tags" {
  description = "All resources must have cost allocation tags"
  
  rule {
    when = true
    condition {
      query = "tags"
      attr  = "env"
      op    = "empty"
    }
    message = "Resources must have an 'env' tag for cost allocation"
  }
  
  rule {
    when = true
    condition {
      query = "tags"
      attr  = "cost_center"
      op    = "empty"
    }
    message = "Resources must have a 'cost_center' tag for cost allocation"
  }
  
  rule {
    when = true
    condition {
      query = "tags"
      attr  = "owner"
      op    = "empty"
    }
    message = "Resources must have an 'owner' tag for cost allocation"
  }
}

# Policy: Require monitoring configuration
policy "require-monitoring" {
  description = "Production resources must have monitoring configured"
  
  rule {
    when = {
      attribute = "tags.env"
      condition = "eq"
      value     = "prod"
    }
    condition {
      query = "cloudflare_monitor"
      op    = "empty"
    }
    message = "Production environments must have monitoring configured"
  }
}

# Policy: Enforce least privilege IAM
policy "least-privilege-iam" {
  description = "IAM policies must follow least privilege principle"
  
  rule {
    when = true
    condition {
      query = "aws_iam_policy"
      attr  = "policy.Statement.0.Action"
      op    = "contains"
      value = "*"
    }
    message = "IAM policies should not use wildcard actions (*)"
  }
}

# Policy: Require secure worker configurations
policy "require-secure-workers" {
  description = "Cloudflare Workers must have secure configurations"
  
  rule {
    when = true
    condition {
      query = "cloudflare_worker_script"
      attr  = "compatibility_date"
      op    = "lt"
      value = "2024-01-01"
    }
    message = "Workers must use a recent compatibility date (>= 2024-01-01)"
  }
}

# Policy: Deny insecure TLS configurations
policy "require-secure-tls" {
  description = "TLS configurations must be secure"
  
  rule {
    when = true
    condition {
      query = "aws_lb_listener"
      attr  = "protocol"
      op    = "ne"
      value = "HTTPS"
    }
    message = "Load balancer listeners must use HTTPS protocol"
  }
}

# Policy: Require backup configuration
policy "require-backup-prod" {
  description = "Production resources must have backup configured"
  
  rule {
    when = {
      attribute = "tags.env"
      condition = "eq"
      value     = "prod"
    }
    condition {
      query = "aws_ebs_volume"
      attr  = "tags.backup"
      op    = "ne"
      value = "enabled"
    }
    message = "Production EBS volumes must have backup enabled"
  }
}

# Policy: Enforce naming conventions
policy "naming-conventions" {
  description = "Resources must follow naming conventions"
  
  rule {
    when = true
    condition {
      query = "aws_s3_bucket"
      attr  = "bucket"
      op    = "not_match"
      value = "^[a-z0-9][a-z0-9-]*[a-z0-9]$"
    }
    message = "S3 bucket names must follow naming conventions (lowercase, alphanumeric, hyphens)"
  }
  
  rule {
    when = true
    condition {
      query = "cloudflare_worker_script"
      attr  = "name"
      op    = "not_match"
      value = "^[a-z0-9][a-z0-9-]*[a-z0-9]$"
    }
    message = "Worker script names must follow naming conventions (lowercase, alphanumeric, hyphens)"
  }
}

# Policy: Require resource limits
policy "require-resource-limits" {
  description = "Resources must have appropriate limits configured"
  
  rule {
    when = true
    condition {
      query = "cloudflare_queue"
      attr  = "message_retention_seconds"
      op    = "gt"
      value = 1209600  # 14 days max
    }
    message = "Queue message retention should not exceed 14 days"
  }
  
  rule {
    when = true
    condition {
      query = "aws_s3_bucket_lifecycle_configuration"
      attr  = "rule.0.transition.0.days"
      op    = "lt"
      value = 30
    }
    message = "S3 lifecycle transitions should not be earlier than 30 days"
  }
}
