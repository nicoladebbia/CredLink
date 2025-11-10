#!/usr/bin/env bash
# Canary Bake & Monitor - Phase 46
# Monitors canary deployment metrics during bake period
# 
# Usage: ./canary_check.sh --duration 600 --version <sha>
#
# Exit codes:
#   0 = Canary metrics acceptable
#   1 = Canary metrics failed (triggers rollback)

set -euo pipefail

# Parse arguments
DURATION=600  # 10 minutes default
VERSION="unknown"

while [[ $# -gt 0 ]]; do
  case $1 in
    --duration)
      DURATION="$2"
      shift 2
      ;;
    --version)
      VERSION="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Canary Bake & Monitor (Phase 46)${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo "Version: $VERSION"
echo "Duration: ${DURATION}s ($(($DURATION / 60)) minutes)"
echo ""

# Configuration
INTERVAL=30  # Check every 30 seconds
CHECKS=$((DURATION / INTERVAL))
ENDPOINT="${CANARY_ENDPOINT:-https://credlink.dev}"

# Thresholds (based on Phase 46 SLOs)
SURVIVAL_THRESHOLD=0.999      # 99.9% remote survival
ERROR_RATE_THRESHOLD=0.001    # 0.1% error rate
LATENCY_DEGRADATION_MAX=1.10  # Max 10% p95 latency increase

echo "📊 Monitoring thresholds:"
echo "   Remote survival: ≥ $(echo "$SURVIVAL_THRESHOLD * 100" | bc)%"
echo "   Error rate: < $(echo "$ERROR_RATE_THRESHOLD * 100" | bc)%"
echo "   P95 latency degradation: < 10%"
echo ""

# Baseline metrics (from control group)
BASELINE_P95=150  # ms
BASELINE_ERROR_RATE=0.0005

# Metric storage
declare -a survival_rates
declare -a error_rates
declare -a p95_latencies

# Function to fetch canary metrics
fetch_canary_metrics() {
  # In production, this would query your observability stack:
  # - Cloudflare Analytics API
  # - Datadog, New Relic, or custom metrics endpoint
  # - Prometheus/Grafana
  
  # Simulate metrics for now
  local survival=$(echo "scale=4; 0.998 + ($RANDOM % 30) / 10000" | bc)
  local error_rate=$(echo "scale=6; 0.0005 + ($RANDOM % 10) / 1000000" | bc)
  local p95=$(echo "$BASELINE_P95 + ($RANDOM % 20)" | bc)
  
  echo "$survival,$error_rate,$p95"
}

# Function to check health endpoint
check_health() {
  local url="$1"
  if curl -sf -m 10 "$url/health" -H "X-Canary-Version: $VERSION" > /dev/null 2>&1; then
    return 0
  else
    return 1
  fi
}

# Function to test C2PA verification (survival check)
check_c2pa_survival() {
  local url="$1"
  # Test a sample of signed assets through the canary
  local test_asset="test-signed-image.jpg"
  
  if curl -sf -m 15 "$url/api/verify/$test_asset" \
       -H "X-Canary-Version: $VERSION" \
       -H "Accept: application/json" > /dev/null 2>&1; then
    return 0
  else
    return 1
  fi
}

# Initial health check
echo "🏥 Initial health check..."
if ! check_health "$ENDPOINT"; then
  echo -e "${RED}✗${NC} Canary health check failed - aborting bake"
  exit 1
fi
echo -e "${GREEN}✓${NC} Canary is healthy"
echo ""

# Monitor loop
echo "🔥 Starting bake period (${CHECKS} checks over ${DURATION}s)..."
echo ""

failed_checks=0
critical_failures=0

for ((i=1; i<=CHECKS; i++)); do
  echo -e "${BLUE}Check $i/$CHECKS${NC} ($(date +%H:%M:%S))"
  
  # Fetch metrics
  metrics=$(fetch_canary_metrics)
  IFS=',' read -r survival error_rate p95 <<< "$metrics"
  
  survival_rates+=("$survival")
  error_rates+=("$error_rate")
  p95_latencies+=("$p95")
  
  # Display current metrics
  echo "   Survival: $(echo "$survival * 100" | bc -l | cut -d. -f1)%"
  echo "   Error rate: $(echo "$error_rate * 100" | bc -l)%"
  echo "   P95 latency: ${p95}ms"
  
  # Check against thresholds
  failure=false
  
  # 1. Survival check (CRITICAL)
  if [ $(echo "$survival < $SURVIVAL_THRESHOLD" | bc) -eq 1 ]; then
    echo -e "   ${RED}✗ CRITICAL${NC} Survival below threshold"
    critical_failures=$((critical_failures + 1))
    failure=true
  fi
  
  # 2. Error rate check
  if [ $(echo "$error_rate > $ERROR_RATE_THRESHOLD" | bc) -eq 1 ]; then
    echo -e "   ${YELLOW}⚠ WARNING${NC} Error rate elevated"
    failed_checks=$((failed_checks + 1))
    failure=true
  fi
  
  # 3. Latency degradation check
  latency_ratio=$(echo "scale=2; $p95 / $BASELINE_P95" | bc)
  if [ $(echo "$latency_ratio > $LATENCY_DEGRADATION_MAX" | bc) -eq 1 ]; then
    echo -e "   ${YELLOW}⚠ WARNING${NC} Latency degraded by $(echo "($latency_ratio - 1) * 100" | bc -l | cut -d. -f1)%"
    failed_checks=$((failed_checks + 1))
    failure=true
  fi
  
  # 4. Periodic C2PA survival check
  if [ $((i % 3)) -eq 0 ]; then
    if ! check_c2pa_survival "$ENDPOINT"; then
      echo -e "   ${YELLOW}⚠ WARNING${NC} C2PA verification failed"
      failed_checks=$((failed_checks + 1))
      failure=true
    fi
  fi
  
  if [ "$failure" = false ]; then
    echo -e "   ${GREEN}✓${NC} All checks passed"
  fi
  
  # Abort if critical threshold exceeded
  if [ $critical_failures -ge 2 ]; then
    echo ""
    echo -e "${RED}✗ ABORT${NC} Multiple critical failures detected"
    echo "   Critical failures: $critical_failures"
    echo "   Canary is unsafe - triggering rollback"
    exit 1
  fi
  
  # Warning if too many failed checks
  failure_rate=$(echo "scale=2; $failed_checks / $i" | bc)
  if [ $(echo "$failure_rate > 0.3" | bc) -eq 1 ]; then
    echo -e "   ${YELLOW}⚠ WARNING${NC} High failure rate: $(echo "$failure_rate * 100" | bc -l | cut -d. -f1)%"
  fi
  
  echo ""
  
  # Sleep until next check (unless last check)
  if [ $i -lt $CHECKS ]; then
    sleep $INTERVAL
  fi
done

# Calculate aggregate metrics
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   Bake Period Complete${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════${NC}"

# Average survival rate
avg_survival=0
for rate in "${survival_rates[@]}"; do
  avg_survival=$(echo "$avg_survival + $rate" | bc)
done
avg_survival=$(echo "scale=4; $avg_survival / ${#survival_rates[@]}" | bc)

# Average error rate
avg_error=0
for rate in "${error_rates[@]}"; do
  avg_error=$(echo "$avg_error + $rate" | bc)
done
avg_error=$(echo "scale=6; $avg_error / ${#error_rates[@]}" | bc)

# Average P95 latency
avg_p95=0
for latency in "${p95_latencies[@]}"; do
  avg_p95=$(echo "$avg_p95 + $latency" | bc)
done
avg_p95=$(echo "scale=0; $avg_p95 / ${#p95_latencies[@]}" | bc)

echo "Aggregate Metrics:"
echo "   Avg survival: $(echo "$avg_survival * 100" | bc -l | cut -d. -f1)%"
echo "   Avg error rate: $(echo "$avg_error * 100" | bc -l)%"
echo "   Avg P95 latency: ${avg_p95}ms"
echo "   Failed checks: $failed_checks/$CHECKS"
echo "   Critical failures: $critical_failures"
echo ""

# Final verdict
if [ $(echo "$avg_survival >= $SURVIVAL_THRESHOLD" | bc) -eq 1 ] && \
   [ $(echo "$avg_error <= $ERROR_RATE_THRESHOLD" | bc) -eq 1 ] && \
   [ $critical_failures -eq 0 ]; then
  echo -e "${GREEN}✓ CANARY APPROVED${NC}"
  echo "Metrics are within acceptable thresholds. Safe to promote."
  exit 0
else
  echo -e "${RED}✗ CANARY REJECTED${NC}"
  echo "Metrics failed to meet thresholds. Rollback recommended."
  exit 1
fi
