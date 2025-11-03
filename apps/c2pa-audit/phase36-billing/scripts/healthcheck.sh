#!/bin/bash

# Health check script for Phase 36 Billing System
# This script performs comprehensive health checks on all system components

set -euo pipefail

# Configuration
HEALTH_URL="${HEALTH_URL:-http://localhost:3002/health}"
TIMEOUT="${TIMEOUT:-10}"
RETRIES="${RETRIES:-3}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1" >&2
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

# Check HTTP endpoint
check_http() {
    local url="$1"
    local timeout="$2"
    local retries="$3"
    
    for ((i=1; i<=retries; i++)); do
        if curl -f -s --max-time "$timeout" "$url" >/dev/null 2>&1; then
            return 0
        fi
        if [[ $i -lt $retries ]]; then
            sleep 2
        fi
    done
    
    return 1
}

# Check Redis connection
check_redis() {
    local redis_host="${REDIS_HOST:-localhost}"
    local redis_port="${REDIS_PORT:-6379}"
    local redis_password="${REDIS_PASSWORD:-}"
    
    if command -v redis-cli >/dev/null 2>&1; then
        local cmd="redis-cli -h $redis_host -p $redis_port"
        if [[ -n "$redis_password" ]]; then
            cmd="$cmd -a $redis_password"
        fi
        
        if $cmd ping >/dev/null 2>&1; then
            log "Redis connection: OK"
            return 0
        else
            log_error "Redis connection: FAILED"
            return 1
        fi
    else
        log_warning "redis-cli not available, skipping Redis check"
        return 0
    fi
}

# Check environment variables
check_environment() {
    local required_vars=(
        "NODE_ENV"
        "JWT_SECRET"
        "API_KEY_SECRET"
        "STRIPE_SECRET_KEY"
        "REDIS_HOST"
    )
    
    local missing_vars=()
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            missing_vars+=("$var")
        fi
    done
    
    if [[ ${#missing_vars[@]} -eq 0 ]]; then
        log "Environment variables: OK"
        return 0
    else
        log_error "Missing environment variables: ${missing_vars[*]}"
        return 1
    fi
}

# Check disk space
check_disk_space() {
    local threshold="${DISK_THRESHOLD:-90}"
    local usage
    usage=$(df / | awk 'NR==2 {print $5}' | sed 's/%//')
    
    if [[ $usage -lt $threshold ]]; then
        log "Disk space: OK (${usage}% used)"
        return 0
    else
        log_error "Disk space: CRITICAL (${usage}% used, threshold: ${threshold}%)"
        return 1
    fi
}

# Check memory usage
check_memory() {
    local threshold="${MEMORY_THRESHOLD:-90}"
    local usage
    usage=$(free | awk 'NR==2{printf "%.0f", $3*100/$2}')
    
    if [[ $usage -lt $threshold ]]; then
        log "Memory usage: OK (${usage}% used)"
        return 0
    else
        log_error "Memory usage: CRITICAL (${usage}% used, threshold: ${threshold}%)"
        return 1
    fi
}

# Main health check function
main() {
    log "Starting Phase 36 Billing System health check..."
    
    local exit_code=0
    
    # Check HTTP health endpoint
    log "Checking HTTP health endpoint..."
    if check_http "$HEALTH_URL" "$TIMEOUT" "$RETRIES"; then
        log "HTTP health endpoint: OK"
    else
        log_error "HTTP health endpoint: FAILED"
        exit_code=1
    fi
    
    # Check Redis
    log "Checking Redis connection..."
    if ! check_redis; then
        exit_code=1
    fi
    
    # Check environment
    log "Checking environment variables..."
    if ! check_environment; then
        exit_code=1
    fi
    
    # Check disk space
    log "Checking disk space..."
    if ! check_disk_space; then
        exit_code=1
    fi
    
    # Check memory
    log "Checking memory usage..."
    if ! check_memory; then
        exit_code=1
    fi
    
    # Final result
    if [[ $exit_code -eq 0 ]]; then
        log "Health check: PASSED"
        exit 0
    else
        log_error "Health check: FAILED"
        exit 1
    fi
}

# Run main function
main "$@"
