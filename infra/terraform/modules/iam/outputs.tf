# IAM module outputs

output "api_token_id" {
  description = "ID of the API token"
  value       = cloudflare_api_token.api_token.id
}

output "api_token_value" {
  description = "Value of the API token (sensitive)"
  value       = cloudflare_api_token.api_token.value
  sensitive   = true
}

output "service_account_ids" {
  description = "List of service account IDs"
  value       = [for sa in cloudflare_service_account.service_account : sa.id]
}
