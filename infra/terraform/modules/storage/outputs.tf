# Storage module outputs

output "bucket_name" {
  description = "Name of the storage bucket"
  value       = var.use_r2 ? cloudflare_r2_bucket.bucket[0].name : aws_s3_bucket.bucket[0].id
}

output "bucket_arn" {
  description = "ARN of the storage bucket"
  value       = var.use_r2 ? null : aws_s3_bucket.bucket[0].arn
}

output "bucket_domain_name" {
  description = "Domain name of the storage bucket"
  value       = var.use_r2 ? "https://${cloudflare_r2_bucket.bucket[0].name}.r2.cloudflarestorage.com" : aws_s3_bucket.bucket[0].bucket_domain_name
}

output "kms_key_arn" {
  description = "ARN of the KMS key for encryption"
  value       = var.use_r2 ? null : aws_kms_key.s3_bucket[0].arn
}

output "lambda_function_name" {
  description = "Name of the S3 events Lambda function"
  value       = var.use_r2 ? null : aws_lambda_function.s3_events[0].function_name
}

output "lambda_function_arn" {
  description = "ARN of the S3 events Lambda function"
  value       = var.use_r2 ? null : aws_lambda_function.s3_events[0].arn
}
