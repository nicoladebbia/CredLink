# IAM module outputs
#
# SECURITY NOTE: API token values are NOT output to avoid credential leakage via Terraform state files.
# Instead, use one of these secure methods to retrieve tokens:
#
# 1. HashiCorp Vault (recommended for production):
#    terraform output -json | jq -r '.api_token_id.value' | xargs -I {} \
#    vault kv put secret/cloudflare/api-token id={}
#
# 2. AWS Secrets Manager:
#    aws secretsmanager create-secret --name credlink/api-token \
#    --secret-string "$(terraform output -raw api_token_id)"
#
# 3. Manual retrieval (development only):
#    terraform show -json | jq -r '.values.root_module.child_modules[].resources[] | select(.type=="cloudflare_api_token") | .values.value'

output "api_token_ids" {
  description = "IDs of the API tokens (use these to reference the tokens, NOT the token values)"
  value = merge(
    {
      storage = cloudflare_api_token.storage_token.id
      worker  = cloudflare_api_token.worker_token.id
      queue   = cloudflare_api_token.queue_token.id
    },
    {
      for k, v in cloudflare_api_token.service_tokens : "service_${k}" => v.id
    }
  )
}

# REMOVED: api_token_value output
# Reason: Storing sensitive tokens in Terraform state is a security risk.
# Use secrets management tools (Vault, AWS Secrets Manager) instead.
# See comments above for secure retrieval methods.

# Service accounts not implemented yet
# output "service_account_ids" {
#   description = "List of service account IDs"
#   value       = [for sa in cloudflare_service_account.service_account : sa.id]
# }
