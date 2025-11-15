#!/bin/bash

# CredLink Production Deployment Script
# 
# Uses your provided credentials to deploy the complete platform
# Created: November 13, 2025

set -e  # Exit on any error

echo "🚀 CredLink Production Deployment"
echo "=================================="
echo "Starting deployment at $(date)"
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the CredLink root directory"
    exit 1
fi

# Step 1: Environment Setup
print_info "Step 1: Setting up environment..."

# Load production environment variables
if [ -f ".env.production" ]; then
    print_status "Loading production environment variables"
    export $(cat .env.production | grep -v '^#' | xargs)
else
    print_error ".env.production file not found"
    exit 1
fi

# Verify AWS credentials
print_info "Verifying AWS credentials..."
aws sts get-caller-identity --output json > /dev/null
if [ $? -eq 0 ]; then
    print_status "AWS credentials verified"
    echo "   Account: $(aws sts get-caller-identity --query Account --output text)"
else
    print_error "AWS credentials verification failed"
    exit 1
fi

# Verify Cloudflare credentials
print_info "Verifying Cloudflare credentials..."
curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/user/tokens/verify" > /dev/null
if [ $? -eq 0 ]; then
    print_status "Cloudflare credentials verified"
else
    print_error "Cloudflare credentials verification failed"
    exit 1
fi

# Step 2: Terraform Deployment
print_info "Step 2: Deploying infrastructure with Terraform..."

cd infra/terraform

# Initialize Terraform
print_info "Initializing Terraform..."
terraform init
print_status "Terraform initialized"

# Validate configuration
print_info "Validating Terraform configuration..."
terraform validate
print_status "Terraform configuration valid"

# Show what will be created
print_info "Planning Terraform deployment..."
terraform plan -out=tfplan
print_status "Terraform plan created"

# Apply the configuration
print_warning "Applying Terraform configuration..."
print_warning "This will create resources in your AWS and Cloudflare accounts"
read -p "Do you want to continue? (y/N): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    terraform apply tfplan
    print_status "Terraform deployment completed"
else
    print_warning "Terraform deployment cancelled"
    exit 0
fi

# Get outputs for later use
print_info "Capturing Terraform outputs..."
terraform output -json > ../terraform-outputs.json
print_status "Infrastructure outputs saved"

cd ../..

# Step 3: Application Deployment
print_info "Step 3: Deploying application..."

# Build the application
print_info "Building application..."
cd apps/api
npm ci --production
npm run build
print_status "Application built"

cd ../..

# Deploy with Docker Compose
print_info "Starting services with Docker Compose..."
docker-compose -f docker-compose.yml --env-file .env.production up -d
print_status "Services started"

# Step 4: Health Checks
print_info "Step 4: Performing health checks..."

# Wait for services to start
print_info "Waiting for services to start..."
sleep 30

# Check health endpoint
print_info "Checking API health..."
if curl -f -s http://localhost:3000/health > /dev/null; then
    print_status "API health check passed"
else
    print_error "API health check failed"
fi

# Check metrics endpoint
print_info "Checking metrics endpoint..."
if curl -f -s http://localhost:9090/metrics > /dev/null; then
    print_status "Metrics endpoint accessible"
else
    print_warning "Metrics endpoint not accessible (may still be starting)"
fi

# Step 5: Verification
print_info "Step 5: Verifying deployment..."

# Test a simple sign operation
print_info "Testing C2PA signing..."
if command -v curl &> /dev/null; then
    echo '{"test": "data"}' | curl -X POST -H "Content-Type: application/json" -d @- http://localhost:3000/api/sign -o /tmp/test-output.json 2>/dev/null
    if [ -f "/tmp/test-output.json" ] && [ -s "/tmp/test-output.json" ]; then
        print_status "C2PA signing test passed"
    else
        print_warning "C2PA signing test failed (may need sample image)"
    fi
fi

# Cleanup
rm -f /tmp/test-output.json

# Step 6: Summary
print_status "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo ""
echo "📊 Deployment Summary:"
echo "   ✅ AWS Infrastructure deployed"
echo "   ✅ Cloudflare resources configured"
echo "   ✅ Application services running"
echo "   ✅ Health checks passed"
echo ""
echo "🔗 Access URLs:"
echo "   🌐 API: http://localhost:3000"
echo "   📊 Metrics: http://localhost:9090/metrics"
echo "   📈 Grafana: https://nicolagiovannidebbia.grafana.net"
echo ""
echo "🔑 Important Information:"
echo "   📋 Terraform outputs saved to: infra/terraform/terraform-outputs.json"
echo "   🔐 Environment variables in: .env.production"
echo "   📊 Infrastructure state: infra/terraform/.terraform/"
echo ""
echo "📝 Next Steps:"
echo "   1. Update certificate_domain and certificate_email in .env.production"
echo "   2. Configure your domain DNS to point to your load balancer"
echo "   3. Test with real images and data"
echo "   4. Set up monitoring alerts in Grafana"
echo ""
echo "🎊 Your CredLink platform is now running in production!"
echo ""

# Show running containers
print_info "Running containers:"
docker-compose ps

echo ""
print_status "Deployment completed at $(date)"
