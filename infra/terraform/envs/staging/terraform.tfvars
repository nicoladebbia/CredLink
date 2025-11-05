# Staging environment variable values
# Minimal configuration for testing

# Environment basics
env         = "staging"
project     = "credlink"
owner       = "nicola"
cost_center = "staging-001"

# Cloudflare configuration (set via TF_VAR environment variables)
# cloudflare_api_token and cloudflare_account_id are set via GitHub secrets

# AWS configuration
aws_region = "us-east-1"

# Storage configuration
use_r2 = false # Use S3 for now since we have AWS credentials

# Cost configuration
enable_cost_tags = true

# Basic monitoring
health_check_urls = [
  "https://httpbin.org/status/200" # Use a test endpoint
]
