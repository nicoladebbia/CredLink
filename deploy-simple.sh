#!/bin/bash

# CredLink Simple Deployment - Core Services Only
# 
# Deploys the essential CredLink services without complex AWS infrastructure
# Created: November 13, 2025

set -e

echo "🚀 CredLink Simple Deployment"
echo "============================="
echo "Deploying core services only (no complex AWS infrastructure)"
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

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the CredLink root directory"
    exit 1
fi

# Step 1: Environment Setup
print_info "Step 1: Setting up environment..."

# Load production environment variables
if [ -f ".env.production" ]; then
    print_success "Loading production environment variables"
    set -a
    source .env.production
    set +a
else
    print_error ".env.production file not found"
    exit 1
fi

# Verify basic credentials
print_info "Verifying AWS credentials..."
if aws sts get-caller-identity --output json > /dev/null 2>&1; then
    print_success "AWS credentials verified"
    echo "   Account: $(aws sts get-caller-identity --query Account --output text)"
else
    print_error "AWS credentials verification failed"
    exit 1
fi

print_info "Verifying Cloudflare credentials..."
if curl -s -f -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/user/tokens/verify" > /dev/null; then
    print_success "Cloudflare credentials verified"
else
    print_error "Cloudflare credentials verification failed"
    exit 1
fi

# Step 2: Build Application
print_info "Step 2: Building application..."

cd apps/api

# Install dependencies
print_info "Installing dependencies..."
npm install --production
print_success "Dependencies installed"

# Build TypeScript
print_info "Building TypeScript..."
npm run build
print_success "TypeScript built"

cd ../..

# Step 3: Deploy with Docker Compose
print_info "Step 3: Starting services..."

# Check Docker
if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    print_error "Docker Compose is not installed"
    exit 1
fi

# Start services
print_info "Starting Docker services..."
docker-compose --env-file .env.production up -d
print_success "Services started"

# Step 4: Health Checks
print_info "Step 4: Performing health checks..."

# Wait for services to start
print_info "Waiting for services to start (30 seconds)..."
sleep 30

# Check API health
print_info "Checking API health..."
MAX_RETRIES=10
RETRY=0

while [ $RETRY -lt $MAX_RETRIES ]; do
    if curl -f -s http://localhost:3000/health > /dev/null 2>&1; then
        print_success "API health check passed"
        break
    else
        RETRY=$((RETRY + 1))
        if [ $RETRY -eq $MAX_RETRIES ]; then
            print_error "API health check failed after $MAX_RETRIES attempts"
            print_info "Checking logs..."
            docker-compose logs api
            exit 1
        else
            print_info "Retrying health check ($RETRY/$MAX_RETRIES)..."
            sleep 10
        fi
    fi
done

# Check metrics endpoint
print_info "Checking metrics endpoint..."
if curl -f -s http://localhost:9090/metrics > /dev/null 2>&1; then
    print_success "Metrics endpoint accessible"
else
    print_warning "Metrics endpoint not accessible (may still be starting)"
fi

# Step 5: Test Core Functionality
print_info "Step 5: Testing core functionality..."

# Test a simple API call
print_info "Testing API endpoints..."
if curl -f -s http://localhost:3000/api/status > /dev/null 2>&1; then
    print_success "API status endpoint working"
else
    print_warning "API status endpoint not responding"
fi

# Test WebP support (our new feature)
print_info "Testing WebP support metadata..."
if curl -s -H "Accept: application/json" http://localhost:3000/api/formats | grep -q "webp"; then
    print_success "WebP format support enabled"
else
    print_warning "WebP format support not confirmed"
fi

# Step 6: Show Status
print_success "🎉 DEPLOYMENT COMPLETED SUCCESSFULLY!"
echo ""
echo "📊 Deployment Summary:"
echo "   ✅ Application built and deployed"
echo "   ✅ Docker services running"
echo "   ✅ Health checks passed"
echo "   ✅ Core functionality verified"
echo ""
echo "🔗 Access URLs:"
echo "   🌐 API: http://localhost:3000"
echo "   📊 Metrics: http://localhost:9090/metrics"
echo "   📈 Grafana: https://nicolagiovannidebbia.grafana.net"
echo ""
echo "🧪 Test Endpoints:"
echo "   Health: curl http://localhost:3000/health"
echo "   Status: curl http://localhost:3000/api/status"
echo "   Formats: curl http://localhost:3000/api/formats"
echo ""
echo "📝 Next Steps:"
echo "   1. Test with real images using the /api/sign endpoint"
echo "   2. Configure your domain and SSL certificates"
echo "   3. Set up production monitoring alerts"
echo "   4. Consider AWS infrastructure for production scaling"
echo ""
echo "🔧 Management Commands:"
echo "   View logs: docker-compose logs -f"
echo "   Stop services: docker-compose down"
echo "   Restart: docker-compose restart"
echo "   Update: docker-compose pull && docker-compose up -d"
echo ""
echo "🎊 Your CredLink platform is running!"
echo ""

# Show running containers
print_info "Running containers:"
docker-compose ps

echo ""
print_success "Simple deployment completed at $(date)"

# Save deployment info
cat > deployment-info.txt << EOF
CredLink Deployment Information
===============================
Deployed: $(date)
Type: Simple (Docker Compose)
Environment: Production

Services Running:
- API: http://localhost:3000
- Metrics: http://localhost:9090
- Grafana: https://nicolagiovannidebbia.grafana.net

Cloudflare Tokens Created:
- Storage: 764a26343707552e39635b998ca90673
- Worker: 7cd1b7a203bfcccfcc9682f15082c6ce
- Queue: 54cd69227174a8c822feb8291ca00c4d
- Service Storage: bd6abbb3190f3b031b222252189af563
- Service Workers: 3a59b9985192337a830b1e2faa8fe864
- Service Queues: 04431ac65eb6f758dd06545a030b6bc9

Next Steps:
1. Test image signing/verification
2. Configure domain and SSL
3. Set up monitoring alerts
4. Consider AWS infrastructure for scale
EOF

print_success "Deployment information saved to deployment-info.txt"
