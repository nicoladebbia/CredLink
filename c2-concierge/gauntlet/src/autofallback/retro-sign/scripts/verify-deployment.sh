#!/bin/bash

# C2PA Phase 10 Deployment Verification Script
# Validates that all components are properly deployed and functional

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="http://localhost:3001"
VIDEO_DEMO_URL="http://localhost:3002"
AUDIO_DEMO_URL="http://localhost:3003"
TIMEOUT=30

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Test HTTP endpoint
test_endpoint() {
    local url="$1"
    local description="$2"
    local expected_status="${3:-200}"
    
    log_info "Testing $description: $url"
    
    if curl -f -s -m "$TIMEOUT" -o /dev/null -w "%{http_code}" "$url" | grep -q "$expected_status"; then
        log_success "✓ $description is responding"
        return 0
    else
        log_error "✗ $description is not responding"
        return 1
    fi
}

# Test API endpoints
test_api_endpoints() {
    log_info "Testing API endpoints..."
    
    local api_tests=(
        "$API_URL/health:API Health Check"
        "$API_URL/:API Root"
        "$API_URL/api/v1/verify/video?asset_url=test.mp4:Video Verification Endpoint"
        "$API_URL/api/v1/verify/audio?asset_url=test.mp3:Audio Verification Endpoint"
    )
    
    local failed_tests=0
    
    for test in "${api_tests[@]}"; do
        local url="${test%%:*}"
        local desc="${test##*:}"
        
        if ! test_endpoint "$url" "$desc"; then
            ((failed_tests++))
        fi
    done
    
    if [ $failed_tests -eq 0 ]; then
        log_success "All API endpoints are responding correctly"
        return 0
    else
        log_error "$failed_tests API endpoints failed"
        return 1
    fi
}

# Test demo pages
test_demo_pages() {
    log_info "Testing demo pages..."
    
    local demo_tests=(
        "$VIDEO_DEMO_URL:Video HLS Demo"
        "$AUDIO_DEMO_URL:Audio Demo"
    )
    
    local failed_tests=0
    
    for test in "${demo_tests[@]}"; do
        local url="${test%%:*}"
        local desc="${test##*:}"
        
        if ! test_endpoint "$url" "$desc"; then
            ((failed_tests++))
        fi
    done
    
    if [ $failed_tests -eq 0 ]; then
        log_success "All demo pages are responding correctly"
        return 0
    else
        log_error "$failed_tests demo pages failed"
        return 1
    fi
}

# Test Docker services
test_docker_services() {
    log_info "Testing Docker services..."
    
    local services=(
        "c2pa-api"
        "c2pa-redis"
        "c2pa-postgres"
    )
    
    local running_services=0
    
    for service in "${services[@]}"; do
        if docker-compose ps "$service" | grep -q "Up"; then
            log_success "✓ $service is running"
            ((running_services++))
        else
            log_warning "✗ $service is not running"
        fi
    done
    
    if [ $running_services -gt 0 ]; then
        log_success "$running_services Docker services are running"
        return 0
    else
        log_error "No Docker services are running"
        return 1
    fi
}

# Test component files
test_component_files() {
    log_info "Testing component files..."
    
    local component_files=(
        "packages/badge-video/dist/index.js:Badge Video Component"
        "packages/player-hooks/dist/hlsjs-plugin.js:HLS.js Plugin"
        "packages/player-hooks/dist/verify.worker.js:Verification Worker"
        "packages/sw-relay/dist/sw.js:Service Worker"
        "apps/api/dist/index.js:API Server"
    )
    
    local missing_files=0
    
    for file_info in "${component_files[@]}"; do
        local file="${file_info%%:*}"
        local desc="${file_info##*:}"
        
        if [ -f "$file" ]; then
            log_success "✓ $desc exists"
        else
            log_error "✗ $desc missing: $file"
            ((missing_files++))
        fi
    done
    
    if [ $missing_files -eq 0 ]; then
        log_success "All component files are present"
        return 0
    else
        log_error "$missing_files component files missing"
        return 1
    fi
}

# Test package configurations
test_package_configs() {
    log_info "Testing package configurations..."
    
    local config_files=(
        "package.json:Root Package"
        "packages/badge-video/package.json:Badge Video Package"
        "packages/player-hooks/package.json:Player Hooks Package"
        "packages/sw-relay/package.json:Service Worker Package"
        "apps/api/package.json:API Package"
        "tsconfig.json:TypeScript Config"
        "docker-compose.yml:Docker Compose"
        ".env.example:Environment Template"
    )
    
    local missing_configs=0
    
    for config_info in "${config_files[@]}"; do
        local config="${config_info%%:*}"
        local desc="${config_info##*:}"
        
        if [ -f "$config" ]; then
            log_success "✓ $desc exists"
        else
            log_error "✗ $desc missing: $config"
            ((missing_configs++))
        fi
    done
    
    if [ $missing_configs -eq 0 ]; then
        log_success "All configuration files are present"
        return 0
    else
        log_error "$missing_configs configuration files missing"
        return 1
    fi
}

# Test performance benchmarks
test_performance() {
    log_info "Testing performance benchmarks..."
    
    # Test API response time
    local start_time=$(date +%s%N)
    if curl -f -s -m "$TIMEOUT" "$API_URL/health" > /dev/null; then
        local end_time=$(date +%s%N)
        local response_time=$(( (end_time - start_time) / 1000000 )) # Convert to milliseconds
        
        if [ $response_time -lt 1000 ]; then
            log_success "✓ API response time: ${response_time}ms (< 1000ms target)"
        else
            log_warning "⚠ API response time: ${response_time}ms (exceeds 1000ms target)"
        fi
    else
        log_error "✗ API health check failed"
        return 1
    fi
    
    # Test component sizes
    local badge_size=$(stat -f%z "packages/badge-video/dist/index.js" 2>/dev/null || stat -c%s "packages/badge-video/dist/index.js" 2>/dev/null || echo "0")
    local worker_size=$(stat -f%z "packages/player-hooks/dist/verify.worker.js" 2>/dev/null || stat -c%s "packages/player-hooks/dist/verify.worker.js" 2>/dev/null || echo "0")
    
    if [ "$badge_size" -lt 100000 ]; then # < 100KB
        log_success "✓ Badge component size: ${badge_size} bytes (< 100KB target)"
    else
        log_warning "⚠ Badge component size: ${badge_size} bytes (exceeds 100KB target)"
    fi
    
    if [ "$worker_size" -lt 50000 ]; then # < 50KB
        log_success "✓ Worker size: ${worker_size} bytes (< 50KB target)"
    else
        log_warning "⚠ Worker size: ${worker_size} bytes (exceeds 50KB target)"
    fi
}

# Test security features
test_security() {
    log_info "Testing security features..."
    
    # Test CORS headers
    local cors_headers=$(curl -s -I "$API_URL/health" | grep -i "access-control-allow-origin" || echo "")
    if [ -n "$cors_headers" ]; then
        log_success "✓ CORS headers are present"
    else
        log_warning "⚠ CORS headers may be missing"
    fi
    
    # Test content security
    local content_type=$(curl -s -I "$API_URL/health" | grep -i "content-type" || echo "")
    if [[ "$content_type" == *"application/json"* ]]; then
        log_success "✓ API returns proper content-type"
    else
        log_warning "⚠ API content-type may be incorrect"
    fi
    
    # Test for security headers
    local security_headers=$(curl -s -I "$API_URL/health" | grep -i -E "(x-frame-options|x-content-type-options)" || echo "")
    if [ -n "$security_headers" ]; then
        log_success "✓ Security headers are present"
    else
        log_warning "⚠ Some security headers may be missing"
    fi
}

# Main verification function
main() {
    echo "🔍 C2PA Phase 10 Deployment Verification"
    echo "=========================================="
    echo
    
    local total_tests=0
    local passed_tests=0
    
    # Run all verification tests
    local tests=(
        "test_package_configs:Package Configuration"
        "test_component_files:Component Files"
        "test_docker_services:Docker Services"
        "test_api_endpoints:API Endpoints"
        "test_demo_pages:Demo Pages"
        "test_performance:Performance Benchmarks"
        "test_security:Security Features"
    )
    
    for test_info in "${tests[@]}"; do
        local test_func="${test_info%%:*}"
        local test_desc="${test_info##*:}"
        
        echo
        log_info "Running: $test_desc"
        ((total_tests++))
        
        if $test_func; then
            ((passed_tests++))
            log_success "$test_desc: PASSED"
        else
            log_error "$test_desc: FAILED"
        fi
    done
    
    echo
    echo "=========================================="
    echo "📊 VERIFICATION SUMMARY"
    echo "=========================================="
    echo "Total Tests: $total_tests"
    echo "Passed: $passed_tests"
    echo "Failed: $((total_tests - passed_tests))"
    echo
    
    if [ $passed_tests -eq $total_tests ]; then
        log_success "🎉 ALL TESTS PASSED - Deployment is ready!"
        echo
        echo "🚀 Access your services:"
        echo "   API Server: $API_URL"
        echo "   Video Demo: $VIDEO_DEMO_URL"
        echo "   Audio Demo: $AUDIO_DEMO_URL"
        echo "   Health Check: $API_URL/health"
        echo
        exit 0
    else
        log_error "❌ SOME TESTS FAILED - Please check the issues above"
        echo
        echo "🔧 Common fixes:"
        echo "   • Run: ./scripts/deploy.sh"
        echo "   • Check: docker-compose --profile phase10 ps"
        echo "   • View logs: docker-compose --profile phase10 logs"
        echo
        exit 1
    fi
}

# Run verification
main "$@"
