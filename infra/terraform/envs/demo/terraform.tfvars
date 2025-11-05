# Demo environment variable values
# Minimal configuration for testing

# Environment basics
env         = "demo"
project     = "credlink"
owner       = "nicola"
cost_center = "demo-001"

# Cloudflare configuration (required)
cloudflare_api_token  = "" # Set via TF_VAR or GitHub secrets
cloudflare_account_id = "" # Set via TF_VAR or GitHub secrets

# AWS configuration
aws_region = "us-east-1"

# Storage configuration
use_r2                  = false # Use S3 for now since we have AWS credentials
storage_destroy_protect = false # Allow destruction in demo

# Cost configuration
enable_cost_tags = true

# Basic monitoring
health_check_urls = [
  "https://httpbin.org/status/200" # Use a test endpoint
]
