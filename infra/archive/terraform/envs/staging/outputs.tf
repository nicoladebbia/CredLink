# Staging environment outputs
output "storage_bucket_name" {
  description = "Storage bucket name"
  value       = module.storage.bucket_name
}

output "storage_bucket_arn" {
  description = "Storage bucket ARN (S3 only)"
  value       = module.storage.bucket_arn
}

output "storage_type" {
  description = "Storage type (r2 or s3)"
  value       = var.use_r2 ? "r2" : "s3"
}

output "worker_script_name" {
  description = "Worker script name"
  value       = module.worker_relay.script_name
}

output "worker_url" {
  description = "Worker URL"
  value       = module.worker_relay.worker_url
}

output "worker_routes" {
  description = "Worker routes"
  value       = module.worker_relay.routes
}

output "queue_names" {
  description = "Queue names"
  value       = module.queues.queue_names
}

output "queue_urls" {
  description = "Queue URLs (S3 SQS only)"
  value       = module.queues.queue_urls
}

output "monitor_ids" {
  description = "Monitor IDs"
  value       = module.monitors.monitor_ids
}

output "iam_token_ids" {
  description = "IAM token IDs (not secret values)"
  value       = module.iam.token_ids
}

output "vault_path" {
  description = "Vault path where token values are stored"
  value       = module.iam.vault_path
}

output "iam_roles" {
  description = "IAM role ARNs"
  value       = module.iam.role_arns
}

output "cost_tags" {
  description = "Applied cost tags"
  value       = local.cost_tags
}

output "otel_collector_endpoint" {
  description = "OpenTelemetry Collector endpoint"
  value       = var.enable_otel_collector ? module.otel[0].collector_endpoint : null
}
