# Demo environment variable values
# Minimal configuration for testing

# Environment basics
env = "demo"
project = "credlink"
owner = "nicola"

# AWS configuration
aws_region = "us-east-1"

# Storage configuration
use_r2 = false  # Use S3 for now since we have AWS credentials
storage_bucket_name = "credlink-demo-storage-nicola"

# Worker configuration
worker_script_name = "worker.js"

# Cost configuration
enable_cost_tags = true

# Basic monitoring
health_check_urls = [
  "https://httpbin.org/status/200"  # Use a test endpoint
]
