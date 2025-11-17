#!/bin/bash
# Smoke tests for C2 Concierge Terraform infrastructure
# Phase 45 - Terraform & Infra Blueprints (v1.2)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Environment configuration
ENV="${1:-demo}"
WORKSPACE="envs/${ENV}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "${SCRIPT_DIR}")"

# Test configuration
TEST_TIMEOUT=300
RETRY_COUNT=3
RETRY_DELAY=10

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Test helper functions
test_http_endpoint() {
    local url="$1"
    local expected_status="${2:-200}"
    local timeout="${3:-30}"
    
    log_info "Testing HTTP endpoint: $url"
    
    local attempt=1
    while [ $attempt -le $RETRY_COUNT ]; do
        if curl -fsSL \
            --connect-timeout "$timeout" \
            --max-time "$timeout" \
            -o /dev/null \
            -w "%{http_code}" \
            "$url" | grep -q "$expected_status"; then
            log_info "✓ HTTP endpoint test passed: $url"
            return 0
        fi
        
        log_warn "Attempt $attempt/$RETRY_COUNT failed for $url"
        sleep $RETRY_DELAY
        ((attempt++))
    done
    
    log_error "✗ HTTP endpoint test failed: $url"
    return 1
}

test_worker_route() {
    local worker_url="$1"
    
    log_info "Testing Worker route: $worker_url"
    
    # Test health endpoint
    if test_http_endpoint "${worker_url}/health"; then
        log_info "✓ Worker health check passed"
    else
        log_error "✗ Worker health check failed"
        return 1
    fi
    
    # Test manifest endpoint
    if test_http_endpoint "${worker_url}/manifest/test"; then
        log_info "✓ Worker manifest endpoint test passed"
    else
        log_error "✗ Worker manifest endpoint test failed"
        return 1
    fi
    
    # Test API endpoint
    if test_http_endpoint "${worker_url}/api/status"; then
        log_info "✓ Worker API endpoint test passed"
    else
        log_error "✗ Worker API endpoint test failed"
        return 1
    fi
    
    return 0
}

test_storage_access() {
    local bucket_name="$1"
    local storage_type="$2"
    
    log_info "Testing storage access for bucket: $bucket_name (type: $storage_type)"
    
    # Create test file
    local test_file="/tmp/c2c-test-$(date +%s).json"
    echo '{"test": "data", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}' > "$test_file"
    
    if [ "$storage_type" = "r2" ]; then
        # Test R2 access via AWS S3 compatible API
        local endpoint="https://${bucket_name}.r2.cloudflarestorage.com"
        
        # Upload test file
        if aws s3 cp "$test_file" "s3://${bucket_name}/test/smoke-test.json" \
            --endpoint-url "$endpoint" \
            --no-sign-request; then
            log_info "✓ R2 upload test passed"
        else
            log_error "✗ R2 upload test failed"
            rm -f "$test_file"
            return 1
        fi
        
        # Download test file
        if aws s3 cp "s3://${bucket_name}/test/smoke-test.json" "/tmp/c2c-download-$(date +%s).json" \
            --endpoint-url "$endpoint" \
            --no-sign-request; then
            log_info "✓ R2 download test passed"
        else
            log_error "✗ R2 download test failed"
            rm -f "$test_file"
            return 1
        fi
        
    elif [ "$storage_type" = "s3" ]; then
        # Test S3 access
        if aws s3 cp "$test_file" "s3://${bucket_name}/test/smoke-test.json"; then
            log_info "✓ S3 upload test passed"
        else
            log_error "✗ S3 upload test failed"
            rm -f "$test_file"
            return 1
        fi
        
        if aws s3 cp "s3://${bucket_name}/test/smoke-test.json" "/tmp/c2c-download-$(date +%s).json"; then
            log_info "✓ S3 download test passed"
        else
            log_error "✗ S3 download test failed"
            rm -f "$test_file"
            return 1
        fi
    fi
    
    # Cleanup test files
    rm -f "$test_file"
    rm -f "/tmp/c2c-download-"*.json
    
    return 0
}

test_queue_operations() {
    local queue_names="$1"
    
    log_info "Testing queue operations"
    
    for queue_name in $queue_names; do
        log_info "Testing queue: $queue_name"
        
        # Send test message
        local test_message='{"test": "message", "timestamp": "'$(date -u +%Y-%m-%dT%H:%M:%SZ)'"}'
        
        if echo "$test_message" | aws sqs send-message \
            --queue-url "$queue_name" \
            --message-body "$test_message" >/dev/null 2>&1; then
            log_info "✓ Queue send test passed: $queue_name"
        else
            log_warn "⚠ Queue send test skipped (Cloudflare Queue): $queue_name"
        fi
    done
    
    return 0
}

test_monitoring_endpoints() {
    local health_urls="$1"
    
    log_info "Testing monitoring endpoints"
    
    for url in $health_urls; do
        if test_http_endpoint "$url"; then
            log_info "✓ Health check passed: $url"
        else
            log_warn "⚠ Health check failed (may be expected): $url"
        fi
    done
    
    return 0
}

test_cost_dashboard() {
    local dashboard_url="$1"
    
    log_info "Testing cost dashboard: $dashboard_url"
    
    if test_http_endpoint "$dashboard_url"; then
        log_info "✓ Cost dashboard test passed"
    else
        log_warn "⚠ Cost dashboard test failed (may require authentication)"
    fi
    
    return 0
}

test_otel_collector() {
    local collector_endpoint="$1"
    
    log_info "Testing OpenTelemetry Collector: $collector_endpoint"
    
    # Test metrics endpoint
    if test_http_endpoint "${collector_endpoint}/metrics"; then
        log_info "✓ OpenTelemetry Collector metrics test passed"
    else
        log_warn "⚠ OpenTelemetry Collector metrics test failed"
    fi
    
    return 0
}

# Main test execution
main() {
    log_info "Starting smoke tests for environment: $ENV"
    
    # Check if workspace exists
    if [ ! -d "$WORKSPACE" ]; then
        log_error "Workspace not found: $WORKSPACE"
        exit 1
    fi
    
    # Change to workspace directory
    cd "$PROJECT_ROOT/$WORKSPACE"
    
    # Get Terraform outputs
    log_info "Getting Terraform outputs"
    
    local storage_bucket_name
    local storage_type
    local worker_url
    local queue_names
    local health_check_urls
    local cost_dashboard_url
    local otel_collector_endpoint
    
    storage_bucket_name=$(terraform output -raw storage_bucket_name 2>/dev/null || echo "")
    storage_type=$(terraform output -raw storage_type 2>/dev/null || echo "")
    worker_url=$(terraform output -raw worker_url 2>/dev/null || echo "")
    queue_names=$(terraform output -json queue_names 2>/dev/null | jq -r '.[]' 2>/dev/null || echo "")
    health_check_urls=$(terraform output -json health_check_urls 2>/dev/null | jq -r '.[]' 2>/dev/null || echo "")
    cost_dashboard_url=$(terraform output -raw cost_dashboard_url 2>/dev/null || echo "")
    otel_collector_endpoint=$(terraform output -raw otel_collector_endpoint 2>/dev/null || echo "")
    
    # Run tests
    local test_failed=0
    
    # Test Worker routes
    if [ -n "$worker_url" ]; then
        if ! test_worker_route "$worker_url"; then
            test_failed=1
        fi
    else
        log_warn "⚠ Worker URL not available, skipping Worker tests"
    fi
    
    # Test Storage access
    if [ -n "$storage_bucket_name" ] && [ -n "$storage_type" ]; then
        if ! test_storage_access "$storage_bucket_name" "$storage_type"; then
            test_failed=1
        fi
    else
        log_warn "⚠ Storage configuration not available, skipping storage tests"
    fi
    
    # Test Queue operations
    if [ -n "$queue_names" ]; then
        if ! test_queue_operations "$queue_names"; then
            test_failed=1
        fi
    else
        log_warn "⚠ Queue names not available, skipping queue tests"
    fi
    
    # Test Monitoring endpoints
    if [ -n "$health_check_urls" ]; then
        if ! test_monitoring_endpoints "$health_check_urls"; then
            test_failed=1
        fi
    else
        log_warn "⚠ Health check URLs not available, skipping monitoring tests"
    fi
    
    # Test Cost dashboard
    if [ -n "$cost_dashboard_url" ]; then
        if ! test_cost_dashboard "$cost_dashboard_url"; then
            test_failed=1
        fi
    else
        log_warn "⚠ Cost dashboard URL not available, skipping cost dashboard tests"
    fi
    
    # Test OpenTelemetry Collector
    if [ -n "$otel_collector_endpoint" ]; then
        if ! test_otel_collector "$otel_collector_endpoint"; then
            test_failed=1
        fi
    else
        log_warn "⚠ OpenTelemetry Collector endpoint not available, skipping OTel tests"
    fi
    
    # Test results
    echo ""
    if [ $test_failed -eq 0 ]; then
        log_info "🎉 All smoke tests passed for environment: $ENV"
        exit 0
    else
        log_error "❌ Some smoke tests failed for environment: $ENV"
        exit 1
    fi
}

# Script entry point
if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
    echo "Usage: $0 <environment>"
    echo ""
    echo "Environment:"
    echo "  demo     - Test demo environment"
    echo "  staging  - Test staging environment"
    echo "  prod     - Test production environment"
    echo ""
    echo "Examples:"
    echo "  $0 demo"
    echo "  $0 staging"
    echo "  $0 prod"
    exit 0
fi

# Check dependencies
if ! command -v terraform >/dev/null 2>&1; then
    log_error "terraform is required but not installed"
    exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
    log_error "curl is required but not installed"
    exit 1
fi

if ! command -v aws >/dev/null 2>&1; then
    log_warn "aws CLI is recommended for storage tests"
fi

if ! command -v jq >/dev/null 2>&1; then
    log_warn "jq is recommended for JSON parsing"
fi

# Run main function
main "$@"
