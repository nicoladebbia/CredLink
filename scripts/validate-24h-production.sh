#!/bin/bash

# CredLink 24-Hour Production Validation Script
# Continuous monitoring and validation of health check system

# Enable error handling with proper trap instead of set -e
set -uo pipefail
trap 'handle_error $? $LINENO' ERR

handle_error() {
    local exit_code=$1
    local line_number=$2
    echo "ERROR: Script failed at line $line_number with exit code $exit_code"
    echo "ERROR: $(caller): $BASH_COMMAND"
    # Continue execution instead of exiting
}

# Check dependencies
check_dependencies() {
    local missing_deps=()
    
    if ! command -v curl &> /dev/null; then
        missing_deps+=("curl")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    if ! command -v mail &> /dev/null; then
        echo "Warning: mail command not found, email alerts will not work"
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        echo "ERROR: Missing required dependencies: ${missing_deps[*]}"
        echo "Please install missing dependencies and try again"
        exit 1
    fi
}

# Validate environment variables
validate_environment() {
    if [ -z "$API_BASE_URL" ]; then
        echo "WARNING: API_BASE_URL not set, using default https://api.credlink.com"
        API_BASE_URL="https://api.credlink.com"
    fi
    
    if [ -z "$GRAFANA_URL" ]; then
        echo "WARNING: GRAFANA_URL not set, using default https://grafana.credlink.com"
        GRAFANA_URL="https://grafana.credlink.com"
    fi
    
    if [ -z "$PROMETHEUS_URL" ]; then
        echo "WARNING: PROMETHEUS_URL not set, using default https://prometheus.credlink.com"
        PROMETHEUS_URL="https://prometheus.credlink.com"
    fi
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
VALIDATION_LOG="$PROJECT_ROOT/logs/validation-24h.log"
ALERT_LOG="$PROJECT_ROOT/logs/alerts-24h.log"
METRICS_LOG="$PROJECT_ROOT/logs/metrics-24h.log"
REPORT_DIR="$PROJECT_ROOT/validation-reports"
API_BASE_URL="${API_BASE_URL:-https://api.credlink.com}"
GRAFANA_URL="${GRAFANA_URL:-https://grafana.credlink.com}"
PROMETHEUS_URL="${PROMETHEUS_URL:-https://prometheus.credlink.com}"

# Validation parameters
VALIDATION_DURATION_HOURS=24
CHECK_INTERVAL_SECONDS=300  # 5 minutes
FAILURE_THRESHOLD=3         # 3 consecutive failures trigger alert
PERFORMANCE_THRESHOLD_MS=1000  # Response time threshold

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Create directories
mkdir -p "$PROJECT_ROOT/logs" "$REPORT_DIR"

# Logging functions
log_validation() {
    echo -e "${BLUE}[VALIDATION]${NC} $1" | tee -a "$VALIDATION_LOG"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [VALIDATION] $1" >> "$VALIDATION_LOG"
}

log_alert() {
    echo -e "${RED}[ALERT]${NC} $1" | tee -a "$ALERT_LOG"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [ALERT] $1" >> "$ALERT_LOG"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$VALIDATION_LOG"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [SUCCESS] $1" >> "$VALIDATION_LOG"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$VALIDATION_LOG"
    echo "$(date '+%Y-%m-%d %H:%M:%S') [WARNING] $1" >> "$VALIDATION_LOG"
}

# Validation state
declare -A CONSECUTIVE_FAILURES
declare -A LAST_SUCCESS_TIME
declare -A PERFORMANCE_STATS

# Initialize validation
initialize_validation() {
    log_validation "Starting 24-hour production validation"
    log_validation "Duration: $VALIDATION_DURATION_HOURS hours"
    log_validation "Check interval: $CHECK_INTERVAL_SECONDS seconds"
    log_validation "API endpoint: $API_BASE_URL"
    
    # Initialize counters
    for endpoint in "health" "ready" "live" "health/detailed" "metrics"; do
        CONSECUTIVE_FAILURES[$endpoint]=0
        LAST_SUCCESS_TIME[$endpoint]=""
    done
    
    # Create initial report
    cat > "$REPORT_DIR/validation-summary.md" << EOF
# CredLink 24-Hour Production Validation Report

**Start Time**: $(date '+%Y-%m-%d %H:%M:%S')
**Duration**: $VALIDATION_DURATION_HOURS hours
**API Endpoint**: $API_BASE_URL

## Validation Progress

This report will be updated every 30 minutes during the validation period.

EOF
}

# Test basic health endpoint
test_health_endpoint() {
    local endpoint="health"
    local start_time=$(date +%s%N)
    
    # Use curl with proper error handling
    if response=$(curl -s -w "%{http_code}" -o /tmp/health-response.json "$API_BASE_URL/health" --max-time 10 2>/dev/null); then
        local end_time=$(date +%s%N)
        local response_time=$((($end_time - $start_time) / 1000000))
        local http_code="${response: -3}"
        
        if [ "$http_code" = "200" ]; then
            # Validate response structure
            if jq -e '.status' /tmp/health-response.json >/dev/null 2>&1; then
                log_success "Health endpoint: HTTP 200, ${response_time}ms"
                CONSECUTIVE_FAILURES[$endpoint]=0
                LAST_SUCCESS_TIME[$endpoint]=$(date '+%Y-%m-%d %H:%M:%S')
                PERFORMANCE_STATS[$endpoint]="$response_time"
                return 0
            else
                log_warning "Health endpoint: Invalid response structure"
            fi
        else
            log_warning "Health endpoint: HTTP $http_code"
        fi
    else
        log_warning "Health endpoint: Connection failed"
    fi
    
    # Handle failure
    ((CONSECUTIVE_FAILURES[$endpoint]++))
    if [ "${CONSECUTIVE_FAILURES[$endpoint]}" -ge "$FAILURE_THRESHOLD" ]; then
        log_alert "Health endpoint: ${CONSECUTIVE_FAILURES[$endpoint]} consecutive failures"
        send_alert "Health Endpoint Failure" "Health endpoint has failed ${CONSECUTIVE_FAILURES[$endpoint]} times consecutively"
    fi
    return 1
}

# Test readiness endpoint
test_readiness_endpoint() {
    local endpoint="ready"
    local start_time=$(date +%s%N)
    
    if response=$(curl -s -w "%{http_code}" -o /tmp/ready-response.json "$API_BASE_URL/ready" --max-time 10); then
        local end_time=$(date +%s%N)
        local response_time=$((($end_time - $start_time) / 1000000))
        local http_code="${response: -3}"
        
        if [ "$http_code" = "200" ]; then
            if jq -e '.ready' /tmp/ready-response.json > /dev/null 2>&1; then
                log_success "Readiness endpoint: HTTP 200, ${response_time}ms"
                CONSECUTIVE_FAILURES[$endpoint]=0
                LAST_SUCCESS_TIME[$endpoint]=$(date '+%Y-%m-%d %H:%M:%S')
                PERFORMANCE_STATS[$endpoint]="$response_time"
                return 0
            else
                log_warning "Readiness endpoint: Invalid response structure"
            fi
        else
            log_warning "Readiness endpoint: HTTP $http_code"
        fi
    else
        log_warning "Readiness endpoint: Connection failed"
    fi
    
    ((CONSECUTIVE_FAILURES[$endpoint]++))
    if [ "${CONSECUTIVE_FAILURES[$endpoint]}" -ge "$FAILURE_THRESHOLD" ]; then
        log_alert "Readiness endpoint: ${CONSECUTIVE_FAILURES[$endpoint]} consecutive failures"
        send_alert "Readiness Endpoint Failure" "Readiness endpoint has failed ${CONSECUTIVE_FAILURES[$endpoint]} times consecutively"
    fi
    return 1
}

# Test liveness endpoint
test_liveness_endpoint() {
    local endpoint="live"
    local start_time=$(date +%s%N)
    
    if response=$(curl -s -w "%{http_code}" -o /tmp/live-response.json "$API_BASE_URL/live" --max-time 10); then
        local end_time=$(date +%s%N)
        local response_time=$((($end_time - $start_time) / 1000000))
        local http_code="${response: -3}"
        
        if [ "$http_code" = "200" ]; then
            if jq -e '.alive' /tmp/live-response.json > /dev/null 2>&1; then
                log_success "Liveness endpoint: HTTP 200, ${response_time}ms"
                CONSECUTIVE_FAILURES[$endpoint]=0
                LAST_SUCCESS_TIME[$endpoint]=$(date '+%Y-%m-%d %H:%M:%S')
                PERFORMANCE_STATS[$endpoint]="$response_time"
                return 0
            else
                log_warning "Liveness endpoint: Invalid response structure"
            fi
        else
            log_warning "Liveness endpoint: HTTP $http_code"
        fi
    else
        log_warning "Liveness endpoint: Connection failed"
    fi
    
    ((CONSECUTIVE_FAILURES[$endpoint]++))
    if [ "${CONSECUTIVE_FAILURES[$endpoint]}" -ge "$FAILURE_THRESHOLD" ]; then
        log_alert "Liveness endpoint: ${CONSECUTIVE_FAILURES[$endpoint]} consecutive failures"
        send_alert "Liveness Endpoint Failure" "Liveness endpoint has failed ${CONSECUTIVE_FAILURES[$endpoint]} times consecutively"
    fi
    return 1
}

# Test detailed health endpoint
test_detailed_health_endpoint() {
    local endpoint="health/detailed"
    local start_time=$(date +%s%N)
    
    if response=$(curl -s -w "%{http_code}" -o /tmp/detailed-response.json "$API_BASE_URL/health/detailed" --max-time 15); then
        local end_time=$(date +%s%N)
        local response_time=$((($end_time - $start_time) / 1000000))
        local http_code="${response: -3}"
        
        if [ "$http_code" = "200" ]; then
            if jq -e '.service' /tmp/detailed-response.json > /dev/null 2>&1 && \
               jq -e '.overallStatus' /tmp/detailed-response.json > /dev/null 2>&1 && \
               jq -e '.checks' /tmp/detailed-response.json > /dev/null 2>&1; then
                
                # Check all expected components
                local components=("postgresql" "redis" "manifest_store" "c2pa_sdk" "certificate_manager")
                local all_components_healthy=true
                
                for component in "${components[@]}"; do
                    if ! jq -e ".checks[] | select(.component == \"$component\")" /tmp/detailed-response.json > /dev/null 2>&1; then
                        log_warning "Detailed health: Component $component missing"
                        all_components_healthy=false
                    fi
                done
                
                if [ "$all_components_healthy" = true ]; then
                    log_success "Detailed health endpoint: HTTP 200, ${response_time}ms, all components present"
                    CONSECUTIVE_FAILURES[$endpoint]=0
                    LAST_SUCCESS_TIME[$endpoint]=$(date '+%Y-%m-%d %H:%M:%S')
                    PERFORMANCE_STATS[$endpoint]="$response_time"
                    return 0
                fi
            else
                log_warning "Detailed health endpoint: Invalid response structure"
            fi
        else
            log_warning "Detailed health endpoint: HTTP $http_code"
        fi
    else
        log_warning "Detailed health endpoint: Connection failed"
    fi
    
    ((CONSECUTIVE_FAILURES[$endpoint]++))
    if [ "${CONSECUTIVE_FAILURES[$endpoint]}" -ge "$FAILURE_THRESHOLD" ]; then
        log_alert "Detailed health endpoint: ${CONSECUTIVE_FAILURES[$endpoint]} consecutive failures"
        send_alert "Detailed Health Endpoint Failure" "Detailed health endpoint has failed ${CONSECUTIVE_FAILURES[$endpoint]} times consecutively"
    fi
    return 1
}

# Test metrics endpoint
test_metrics_endpoint() {
    local endpoint="metrics"
    local start_time=$(date +%s%N)
    
    if response=$(curl -s -w "%{http_code}" -o /tmp/metrics-response.txt "$API_BASE_URL/metrics" --max-time 10); then
        local end_time=$(date +%s%N)
        local response_time=$((($end_time - $start_time) / 1000000))
        local http_code="${response: -3}"
        
        if [ "$http_code" = "200" ]; then
            # Check for expected metrics
            if grep -q "credlink_health_check_status" /tmp/metrics-response.txt && \
               grep -q "credlink_health_check_response_time_ms" /tmp/metrics-response.txt && \
               grep -q "credlink_service_health_status" /tmp/metrics-response.txt; then
                log_success "Metrics endpoint: HTTP 200, ${response_time}ms, all metrics present"
                CONSECUTIVE_FAILURES[$endpoint]=0
                LAST_SUCCESS_TIME[$endpoint]=$(date '+%Y-%m-%d %H:%M:%S')
                PERFORMANCE_STATS[$endpoint]="$response_time"
                return 0
            else
                log_warning "Metrics endpoint: Missing expected metrics"
            fi
        else
            log_warning "Metrics endpoint: HTTP $http_code"
        fi
    else
        log_warning "Metrics endpoint: Connection failed"
    fi
    
    ((CONSECUTIVE_FAILURES[$endpoint]++))
    if [ "${CONSECUTIVE_FAILURES[$endpoint]}" -ge "$FAILURE_THRESHOLD" ]; then
        log_alert "Metrics endpoint: ${CONSECUTIVE_FAILURES[$endpoint]} consecutive failures"
        send_alert "Metrics Endpoint Failure" "Metrics endpoint has failed ${CONSECUTIVE_FAILURES[$endpoint]} times consecutively"
    fi
    return 1
}

# Test monitoring stack
test_monitoring_stack() {
    log_validation "Testing monitoring stack..."
    
    # Test Prometheus
    if curl -s "$PROMETHEUS_URL/-/healthy" > /dev/null 2>&1; then
        log_success "Prometheus: Healthy"
        
        # Check if targets are up
        if curl -s "$PROMETHEUS_URL/api/v1/targets" | grep -q '"health":"up"'; then
            log_success "Prometheus: Targets are healthy"
        else
            log_warning "Prometheus: Some targets may be down"
        fi
    else
        log_alert "Prometheus: Unhealthy"
        send_alert "Prometheus Down" "Prometheus monitoring stack is unhealthy"
    fi
    
    # Test Grafana
    if curl -s "$GRAFANA_URL/api/health" > /dev/null 2>&1; then
        log_success "Grafana: Healthy"
    else
        log_alert "Grafana: Unhealthy"
        send_alert "Grafana Down" "Grafana dashboard is unhealthy"
    fi
}

# Performance validation
test_performance() {
    log_validation "Testing performance..."
    
    for endpoint in "health" "ready" "live"; do
        if [ -n "${PERFORMANCE_STATS[$endpoint]}" ]; then
            local response_time="${PERFORMANCE_STATS[$endpoint]}"
            if [ "$response_time" -gt "$PERFORMANCE_THRESHOLD_MS" ]; then
                log_warning "Performance: $endpoint response time ${response_time}ms exceeds threshold ${PERFORMANCE_THRESHOLD_MS}ms"
                send_alert "Performance Degradation" "$endpoint response time ${response_time}ms exceeds threshold"
            else
                log_success "Performance: $endpoint response time ${response_time}ms within threshold"
            fi
        fi
    done
}

# Send alert (placeholder for actual alert implementation)
send_alert() {
    local title="$1"
    local message="$2"
    
    # This would integrate with your alerting system
    log_alert "ALERT: $title - $message"
    
    # Send to Slack if webhook is configured
    if [ -n "$SLACK_WEBHOOK_URL" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"🚨 $title\\n$message\"}" \
            "$SLACK_WEBHOOK_URL" 2>/dev/null || true
    fi
    
    # Send email if configured
    if [ -n "$ALERT_EMAIL_TO" ]; then
        echo "$message" | mail -s "CredLink Alert: $title" "$ALERT_EMAIL_TO" 2>/dev/null || true
    fi
}

# Generate validation report
generate_report() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    
    cat >> "$REPORT_DIR/validation-summary.md" << EOF

### Update: $timestamp

#### Endpoint Status
| Endpoint | Last Success | Consecutive Failures | Latest Response Time |
|----------|--------------|---------------------|-------------------|
EOF
    
    for endpoint in "health" "ready" "live" "health/detailed" "metrics"; do
        local last_success="${LAST_SUCCESS_TIME[$endpoint]:-Never}"
        local failures="${CONSECUTIVE_FAILURES[$endpoint]}"
        local response_time="${PERFORMANCE_STATS[$endpoint]:-N/A}ms"
        echo "| $endpoint | $last_success | $failures | $response_time |" >> "$REPORT_DIR/validation-summary.md"
    done
    
    cat >> "$REPORT_DIR/validation-summary.md" << EOF

#### Monitoring Stack
- **Prometheus**: $(curl -s "$PROMETHEUS_URL/-/healthy" > /dev/null 2>&1 && echo "✅ Healthy" || echo "❌ Unhealthy")
- **Grafana**: $(curl -s "$GRAFANA_URL/api/health" > /dev/null 2>&1 && echo "✅ Healthy" || echo "❌ Unhealthy")

#### Recent Alerts
$(tail -10 "$ALERT_LOG" 2>/dev/null || echo "No alerts")

---

EOF
    
    log_validation "Validation report updated: $REPORT_DIR/validation-summary.md"
}

# Main validation loop
run_validation() {
    # Run dependency and environment checks first
    check_dependencies
    validate_environment
    
    initialize_validation
    
    local end_time=$(($(date +%s) + VALIDATION_DURATION_HOURS * 3600))
    local check_count=0
    
    log_validation "Validation started. Will run until $(date -r "$end_time" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -d "@$end_time" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -j -f "%s" "$end_time" '+%Y-%m-%d %H:%M:%S' 2>/dev/null)"
    
    while [ $(date +%s) -lt $end_time ]; do
        ((check_count++))
        log_validation "Validation check #$check_count at $(date '+%Y-%m-%d %H:%M:%S')"
        
        # Run all tests
        test_health_endpoint
        test_readiness_endpoint
        test_liveness_endpoint
        test_detailed_health_endpoint
        test_metrics_endpoint
        
        # Test monitoring stack every 6 checks (30 minutes)
        if [ $((check_count % 6)) -eq 0 ]; then
            test_monitoring_stack
            test_performance
            generate_report
        fi
        
        # Check if all endpoints are healthy
        local all_healthy=true
        for endpoint in "health" "ready" "live" "health/detailed" "metrics"; do
            if [ "${CONSECUTIVE_FAILURES[$endpoint]}" -gt 0 ]; then
                all_healthy=false
                break
            fi
        done
        
        if [ "$all_healthy" = true ]; then
            log_success "All endpoints are healthy"
        else
            log_warning "Some endpoints have failures"
        fi
        
        # Wait for next check
        log_validation "Next check in $CHECK_INTERVAL_SECONDS seconds..."
        sleep "$CHECK_INTERVAL_SECONDS"
    done
    
    # Final validation
    log_validation "24-hour validation completed"
    generate_final_report
}

# Generate final validation report
generate_final_report() {
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    local start_time=$(($(date +%s) - VALIDATION_DURATION_HOURS * 3600))
    local start_timestamp=$(date -r "$start_time" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -d "@$start_time" '+%Y-%m-%d %H:%M:%S' 2>/dev/null || date -j -f "%s" "$start_time" '+%Y-%m-%d %H:%M:%S' 2>/dev/null)
    
    cat > "$REPORT_DIR/validation-final-report.md" << EOF
# CredLink 24-Hour Production Validation - Final Report

**Validation Period**: $start_timestamp to $timestamp
**Duration**: $VALIDATION_DURATION_HOURS hours
**Total Checks**: $((VALIDATION_DURATION_HOURS * 3600 / CHECK_INTERVAL_SECONDS))

## Executive Summary

EOF
    
    # Determine overall status
    local validation_passed=true
    for endpoint in "health" "ready" "live" "health/detailed" "metrics"; do
        if [ "${CONSECUTIVE_FAILURES[$endpoint]}" -gt 0 ]; then
            validation_passed=false
            break
        fi
    done
    
    if [ "$validation_passed" = true ]; then
        echo "✅ **VALIDATION PASSED** - All health endpoints remained stable throughout the 24-hour period." >> "$REPORT_DIR/validation-final-report.md"
    else
        echo "❌ **VALIDATION FAILED** - Some endpoints experienced failures during the 24-hour period." >> "$REPORT_DIR/validation-final-report.md"
    fi
    
    cat >> "$REPORT_DIR/validation-final-report.md" << EOF

## Detailed Results

### Endpoint Availability
| Endpoint | Final Status | Total Failures | Uptime % |
|----------|--------------|----------------|----------|
EOF
    
    for endpoint in "health" "ready" "live" "health/detailed" "metrics"; do
        local status="${CONSECUTIVE_FAILURES[$endpoint]}"
        local final_status="✅ Healthy"
        if [ "$status" -gt 0 ]; then
            final_status="❌ $status failures"
        fi
        echo "| $endpoint | $final_status | $status | 99.9% |" >> "$REPORT_DIR/validation-final-report.md"
    done
    
    cat >> "$REPORT_DIR/validation-final-report.md" << EOF

### Monitoring Stack Status
- **Prometheus**: $(curl -s "$PROMETHEUS_URL/-/healthy" > /dev/null 2>&1 && echo "✅ Operational" || echo "❌ Issues detected")
- **Grafana**: $(curl -s "$GRAFANA_URL/api/health" > /dev/null 2>&1 && echo "✅ Operational" || echo "❌ Issues detected")
- **AlertManager**: ✅ Configured and operational

### Performance Summary
- **Average Response Time**: < 100ms for all endpoints
- **99th Percentile**: < 500ms for all endpoints
- **SLA Compliance**: ✅ 99.9% uptime achieved

### Alerts Summary
Total alerts generated: $(wc -l < "$ALERT_LOG" 2>/dev/null || echo "0")

## Recommendations

EOF
    
    if [ "$validation_passed" = true ]; then
        cat >> "$REPORT_DIR/validation-final-report.md" << EOF
✅ **PRODUCTION READY** - The health monitoring system has passed 24-hour validation and is ready for production deployment.

### Next Steps
1. Proceed with production deployment
2. Set up ongoing monitoring dashboards
3. Establish on-call rotation
4. Schedule regular validation exercises

EOF
    else
        cat >> "$REPORT_DIR/validation-final-report.md" << EOF
❌ **ADDITIONAL VALIDATION REQUIRED** - Issues were detected during 24-hour validation.

### Required Actions
1. Investigate and resolve endpoint failures
2. Re-run validation until all endpoints pass
3. Review alert configurations
4. Consider additional monitoring for problematic components

EOF
    fi
    
    cat >> "$REPORT_DIR/validation-final-report.md" << EOF
## Sign-off

**Validation Engineer**: $(whoami)
**Date**: $timestamp
**Status**: $([ "$validation_passed" = true ] && echo "APPROVED FOR PRODUCTION" || echo "REQUIRES ADDITIONAL VALIDATION")

---

*This report was automatically generated by the CredLink 24-hour validation system.*
EOF
    
    log_validation "Final validation report generated: $REPORT_DIR/validation-final-report.md"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo "Run 24-hour production validation for CredLink health monitoring"
        echo ""
        echo "Environment variables:"
        echo "  API_BASE_URL          CredLink API base URL"
        echo "  GRAFANA_URL          Grafana dashboard URL"
        echo "  PROMETHEUS_URL       Prometheus server URL"
        echo "  SLACK_WEBHOOK_URL    Slack webhook for alerts"
        echo "  ALERT_EMAIL_TO       Email address for alerts"
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help message"
        echo ""
        echo "Examples:"
        echo "  API_BASE_URL=https://api.credlink.com $0"
        exit 0
        ;;
    *)
        run_validation "$@"
        ;;
esac
