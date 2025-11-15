#!/bin/bash

# CredLink Setup Verification Script
# 
# Verifies all your credentials and configurations are correct
# Created: November 13, 2025

set -e

echo "🔍 CredLink Setup Verification"
echo "=============================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Load environment
if [ -f ".env.production" ]; then
    set -a
    source .env.production
    set +a
    print_success "Environment variables loaded"
else
    print_error ".env.production file not found"
    exit 1
fi

echo "🔑 Checking Credentials..."
echo ""

# AWS Credentials Check
print_info "Checking AWS credentials..."
if aws sts get-caller-identity > /dev/null 2>&1; then
    AWS_ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
    AWS_USER=$(aws sts get-caller-identity --query Arn --output text | cut -d/ -f2)
    print_success "AWS credentials valid"
    echo "   Account: $AWS_ACCOUNT"
    echo "   User: $AWS_USER"
    
    if [ "$AWS_ACCOUNT" = "002893232481" ]; then
        print_success "Using correct AWS account"
    else
        print_warning "Using different AWS account than expected"
    fi
else
    print_error "AWS credentials invalid"
fi

echo ""

# Cloudflare Credentials Check
print_info "Checking Cloudflare credentials..."
CF_RESPONSE=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/user/tokens/verify")
if echo "$CF_RESPONSE" | grep -q '"success":true'; then
    print_success "Cloudflare API token valid"
    
    # Check account ID
    CF_ACCOUNT=$(curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/accounts" | jq -r '.result[0].id // "not found"')
    if [ "$CF_ACCOUNT" = "$CLOUDFLARE_ACCOUNT_ID" ]; then
        print_success "Cloudflare account ID matches"
    else
        print_warning "Cloudflare account ID mismatch"
        echo "   Expected: $CLOUDFLARE_ACCOUNT_ID"
        echo "   Found: $CF_ACCOUNT"
    fi
    
    # List available zones (domains)
    print_info "Available Cloudflare zones:"
    curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/zones" | \
        jq -r '.result[] | "   \(.name): \(.id)"' 2>/dev/null || echo "   No zones found or jq not available"
    
else
    print_error "Cloudflare API token invalid"
fi

echo ""

# Terraform Configuration Check
print_info "Checking Terraform configuration..."
cd infra/terraform

if [ -f "terraform.tfvars" ]; then
    print_success "Terraform variables file exists"
    
    # Check if variables are set
    if grep -q "REPLACE" terraform.tfvars; then
        print_warning "Terraform variables contain placeholders"
    else
        print_success "Terraform variables configured"
    fi
else
    print_error "Terraform variables file missing"
fi

if [ -f "modules/iam/cloudflare-permission-groups.auto.tfvars" ]; then
    print_success "Cloudflare permission groups configured"
else
    print_error "Cloudflare permission groups file missing"
fi

# Validate Terraform
if terraform validate > /dev/null 2>&1; then
    print_success "Terraform configuration valid"
else
    print_error "Terraform configuration invalid"
    terraform validate
fi

cd ../..

echo ""

# Application Files Check
print_info "Checking application files..."

if [ -f "apps/api/package.json" ]; then
    print_success "API package.json exists"
else
    print_error "API package.json missing"
fi

if [ -f "docker-compose.yml" ]; then
    print_success "Docker Compose configuration exists"
else
    print_error "Docker Compose configuration missing"
fi

if command -v docker &> /dev/null; then
    print_success "Docker is available"
else
    print_error "Docker not installed or not in PATH"
fi

if command -v docker-compose &> /dev/null; then
    print_success "Docker Compose is available"
else
    print_error "Docker Compose not installed or not in PATH"
fi

echo ""

# Grafana Check
print_info "Checking Grafana access..."
if curl -s -f "https://nicolagiovannidebbia.grafana.net/api/health" > /dev/null 2>&1; then
    print_success "Grafana instance accessible"
else
    print_warning "Grafana instance not accessible (may need login)"
fi

echo ""

# Summary
echo "📊 Verification Summary:"
echo ""

# Count successes and errors
TOTAL_CHECKS=12
PASSED_CHECKS=0

# Simple check count (you could make this more sophisticated)
if aws sts get-caller-identity > /dev/null 2>&1; then ((PASSED_CHECKS++)); fi
if curl -s -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" "https://api.cloudflare.com/client/v4/user/tokens/verify" | grep -q '"success":true'; then ((PASSED_CHECKS++)); fi
if [ -f "infra/terraform/terraform.tfvars" ]; then ((PASSED_CHECKS++)); fi
if [ -f "infra/terraform/modules/iam/cloudflare-permission-groups.auto.tfvars" ]; then ((PASSED_CHECKS++)); fi
if cd infra/terraform && terraform validate > /dev/null 2>&1; then cd ../.. && ((PASSED_CHECKS++)); else cd ../..; fi
if [ -f "apps/api/package.json" ]; then ((PASSED_CHECKS++)); fi
if [ -f "docker-compose.yml" ]; then ((PASSED_CHECKS++)); fi
if command -v docker &> /dev/null; then ((PASSED_CHECKS++)); fi
if command -v docker-compose &> /dev/null; then ((PASSED_CHECKS++)); fi
if [ -f ".env.production" ]; then ((PASSED_CHECKS++)); fi
if [ -f "deploy-production.sh" ]; then ((PASSED_CHECKS++)); fi
if command -v terraform &> /dev/null; then ((PASSED_CHECKS++)); fi

PERCENTAGE=$((PASSED_CHECKS * 100 / TOTAL_CHECKS))

echo "   Checks Passed: $PASSED_CHECKS/$TOTAL_CHECKS ($PERCENTAGE%)"

if [ $PERCENTAGE -ge 90 ]; then
    print_success "Setup verification PASSED - Ready for deployment!"
elif [ $PERCENTAGE -ge 70 ]; then
    print_warning "Setup verification PARTIAL - Some issues to address"
else
    print_error "Setup verification FAILED - Major issues to fix"
fi

echo ""
echo "🚀 Next Steps:"
if [ $PERCENTAGE -ge 90 ]; then
    echo "   ✅ Run: ./deploy-production.sh"
else
    echo "   ⚠️  Fix the issues above before deploying"
fi

echo ""
echo "📁 Important Files Created:"
echo "   🔐 .env.production - Environment variables"
echo "   🏗️  infra/terraform/terraform.tfvars - Terraform variables"
echo "   🔑 infra/terraform/modules/iam/cloudflare-permission-groups.auto.tfvars - Permission groups"
echo "   🚀 deploy-production.sh - Deployment script"
echo "   🔍 verify-setup.sh - This verification script"

echo ""
echo "✨ Verification completed at $(date)"
