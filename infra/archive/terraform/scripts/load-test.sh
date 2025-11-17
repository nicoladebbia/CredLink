#!/bin/bash
# Load Testing with k6
# Performance testing for the CredLink application

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_header() {
    echo -e "${BLUE}============================================${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}============================================${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

print_info() {
    echo -e "${YELLOW}ℹ️  $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Configuration
VUS=${VUS:-50}              # Virtual users
DURATION=${DURATION:-60}    # Test duration in seconds
RAMP_UP=${RAMP_UP:-30}      # Ramp up time in seconds
TARGET_URL=${TARGET_URL:-""}  # Target URL for testing

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check k6
    if ! command -v k6 &> /dev/null; then
        print_error "k6 is not installed"
        print_info "Install k6: https://k6.io/docs/getting-started/installation/"
        print_info "macOS: brew install k6"
        print_info "Ubuntu: apt-get install k6"
        exit 1
    fi
    print_success "k6 installed"
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        print_error "jq is not installed"
        print_info "Install jq: brew install jq (macOS) or apt-get install jq (Ubuntu)"
        exit 1
    fi
    print_success "jq installed"
    
    # Check curl
    if ! command -v curl &> /dev/null; then
        print_error "curl is not installed"
        exit 1
    fi
    print_success "curl installed"
}

# Get target URL from Terraform or user input
get_target_url() {
    print_header "Getting Target URL"
    
    if [ -z "$TARGET_URL" ]; then
        # Try to get from Terraform
        cd "$(dirname "$0")/.."
        
        if [ -f "terraform.tfstate" ]; then
            ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "")
            if [ -n "$ALB_DNS" ]; then
                TARGET_URL="http://$ALB_DNS"
                print_success "Found ALB URL from Terraform: $TARGET_URL"
            else
                print_error "Could not get ALB URL from Terraform"
                read -p "Enter target URL (e.g., http://example.com): " TARGET_URL
            fi
        else
            print_warning "Terraform state not found"
            read -p "Enter target URL (e.g., http://example.com): " TARGET_URL
        fi
    else
        print_success "Using provided target URL: $TARGET_URL"
    fi
    
    if [ -z "$TARGET_URL" ]; then
        print_error "Target URL is required"
        exit 1
    fi
    
    # Test connectivity
    print_info "Testing connectivity to $TARGET_URL..."
    if curl -f -s "$TARGET_URL/health" > /dev/null; then
        print_success "Target is reachable"
    else
        print_error "Target is not reachable at $TARGET_URL/health"
        exit 1
    fi
}

# Create k6 test script
create_test_script() {
    print_header "Creating Load Test Script"
    
    cat > load-test.js << 'EOF'
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate } from 'k6/metrics';

// Custom metrics
export let errorRate = new Rate('errors');

// Test configuration
export let options = {
  stages: [
    { duration: '30s', target: 10 },   // Ramp up to 10 users
    { duration: '1m', target: 10 },    // Stay at 10 users
    { duration: '30s', target: 50 },   // Ramp up to 50 users
    { duration: '2m', target: 50 },    // Stay at 50 users
    { duration: '30s', target: 100 },  // Ramp up to 100 users
    { duration: '2m', target: 100 },   // Stay at 100 users
    { duration: '30s', target: 0 },    // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<500'],  // 95% of requests under 500ms
    http_req_failed: ['rate<0.1'],     // Less than 10% errors
    errors: ['rate<0.1'],              // Custom error rate
  },
};

const BASE_URL = __ENV.TARGET_URL;

export function setup() {
  console.log(`Starting load test against: ${BASE_URL}`);
  
  // Test health endpoint
  let healthResponse = http.get(`${BASE_URL}/health`);
  check(healthResponse, {
    'health check status is 200': (r) => r.status === 200,
  });
  
  return { base_url: BASE_URL };
}

export default function(data) {
  const base_url = data.base_url;
  
  // Test health endpoint (20% of requests)
  if (Math.random() < 0.2) {
    let healthResponse = http.get(`${base_url}/health`);
    let healthOk = check(healthResponse, {
      'health status is 200': (r) => r.status === 200,
      'health response time < 100ms': (r) => r.timings.duration < 100,
    });
    errorRate.add(!healthOk);
    sleep(1);
    return;
  }
  
  // Test sign endpoint (40% of requests)
  if (Math.random() < 0.5) {
    let signPayload = JSON.stringify({
      document: "This is a test document for signing",
      metadata: {
        title: "Test Document",
        author: "Load Test",
        timestamp: new Date().toISOString()
      }
    });
    
    let signParams = {
      headers: {
        'Content-Type': 'application/json',
      },
    };
    
    let signResponse = http.post(`${base_url}/sign`, signPayload, signParams);
    let signOk = check(signResponse, {
      'sign status is 200': (r) => r.status === 200,
      'sign response time < 2000ms': (r) => r.timings.duration < 2000,
      'sign has signature_id': (r) => r.json('signature_id') !== undefined,
    });
    errorRate.add(!signOk);
    sleep(1);
    return;
  }
  
  // Test verify endpoint (40% of requests)
  let testSignatureId = "test-signature-id";
  let verifyPayload = JSON.stringify({
    signature_id: testSignatureId,
    document: "This is a test document for verification"
  });
  
  let verifyParams = {
    headers: {
      'Content-Type': 'application/json',
    },
  };
  
  let verifyResponse = http.post(`${base_url}/verify`, verifyPayload, verifyParams);
  let verifyOk = check(verifyResponse, {
    'verify status is 200 or 404': (r) => r.status === 200 || r.status === 404,
    'verify response time < 1000ms': (r) => r.timings.duration < 1000,
  });
  errorRate.add(!verifyOk);
  sleep(1);
}

export function teardown(data) {
  console.log('Load test completed');
}
EOF

    print_success "Load test script created"
}

# Run smoke test
run_smoke_test() {
    print_header "Running Smoke Test"
    
    print_info "Running light smoke test to verify functionality..."
    
    # Run k6 smoke test
    k6 run --vus 5 --duration 30s \
        --env TARGET_URL="$TARGET_URL" \
        --out json=smoke-test-results.json \
        load-test.js
    
    if [ $? -eq 0 ]; then
        print_success "Smoke test passed"
    else
        print_error "Smoke test failed"
        print_info "Check the application before running full load test"
        exit 1
    fi
    
    # Show smoke test results
    print_info "Smoke Test Results:"
    if [ -f "smoke-test-results.json" ]; then
        requests=$(jq '.metrics.http_reqs.count' smoke-test-results.json)
        errors=$(jq '.metrics.http_req_failed.rate' smoke-test-results.json)
        avg_duration=$(jq '.metrics.http_req_duration.avg' smoke-test-results.json)
        p95_duration=$(jq '.metrics.http_req_duration["p(95)"]' smoke-test-results.json)
        
        echo "  Requests: $requests"
        echo "  Error Rate: $(echo "$errors * 100" | bc -l | cut -d. -f1)%"
        echo "  Avg Duration: ${avg_duration}ms"
        echo "  P95 Duration: ${p95_duration}ms"
    fi
}

# Run load test
run_load_test() {
    print_header "Running Load Test"
    
    print_info "Configuration:"
    echo "  Virtual Users: $VUS"
    echo "  Duration: ${DURATION}s"
    echo "  Ramp Up: ${RAMP_UP}s"
    echo "  Target: $TARGET_URL"
    echo ""
    
    print_warning "This will generate significant load on the application"
    read -p "Do you want to continue? (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Load test cancelled"
        exit 0
    fi
    
    # Run the load test
    print_info "Starting load test..."
    
    k6 run --vus "$VUS" --duration "${DURATION}s" \
        --env TARGET_URL="$TARGET_URL" \
        --out json=load-test-results.json \
        --out influxdb=http://localhost:8086/k6 \
        load-test.js
    
    if [ $? -eq 0 ]; then
        print_success "Load test completed successfully"
    else
        print_warning "Load test completed with some issues"
        print_info "Check the results below"
    fi
}

# Analyze results
analyze_results() {
    print_header "Analyzing Results"
    
    if [ ! -f "load-test-results.json" ]; then
        print_error "Results file not found"
        return 1
    fi
    
    print_info "Load Test Results:"
    
    # Extract metrics
    requests=$(jq '.metrics.http_reqs.count' load-test-results.json)
    errors=$(jq '.metrics.http_req_failed.rate' load-test-results.json)
    avg_duration=$(jq '.metrics.http_req_duration.avg' load-test-results.json)
    p95_duration=$(jq '.metrics.http_req_duration["p(95)"]' load-test-results.json)
    p99_duration=$(jq '.metrics.http_req_duration["p(99)"]' load-test-results.json)
    max_duration=$(jq '.metrics.http_req_duration.max' load-test-results.json)
    rps=$(jq '.metrics.http_reqs.rate' load-test-results.json)
    
    echo ""
    echo "📊 Performance Metrics:"
    echo "  Total Requests: $requests"
    echo "  Requests/sec: $(echo "$rps" | cut -d. -f1)"
    echo "  Error Rate: $(echo "$errors * 100" | bc -l | cut -d. -f1)%"
    echo "  Avg Response Time: ${avg_duration}ms"
    echo "  P95 Response Time: ${p95_duration}ms"
    echo "  P99 Response Time: ${p99_duration}ms"
    echo "  Max Response Time: ${max_duration}ms"
    
    # Performance assessment
    echo ""
    echo "🎯 Performance Assessment:"
    
    # Error rate assessment
    error_rate_percent=$(echo "$errors * 100" | bc -l)
    if (( $(echo "$error_rate_percent < 1" | bc -l) )); then
        print_success "Error rate: Excellent (<1%)"
    elif (( $(echo "$error_rate_percent < 5" | bc -l) )); then
        print_success "Error rate: Good (<5%)"
    elif (( $(echo "$error_rate_percent < 10" | bc -l) )); then
        print_warning "Error rate: Acceptable (<10%)"
    else
        print_error "Error rate: Poor (>10%)"
    fi
    
    # Response time assessment
    if (( $(echo "$p95_duration < 200" | bc -l) )); then
        print_success "P95 Response Time: Excellent (<200ms)"
    elif (( $(echo "$p95_duration < 500" | bc -l) )); then
        print_success "P95 Response Time: Good (<500ms)"
    elif (( $(echo "$p95_duration < 1000" | bc -l) )); then
        print_warning "P95 Response Time: Acceptable (<1s)"
    else
        print_error "P95 Response Time: Poor (>1s)"
    fi
    
    # Throughput assessment
    if (( $(echo "$rps > 1000" | bc -l) )); then
        print_success "Throughput: Excellent (>1000 RPS)"
    elif (( $(echo "$rps > 500" | bc -l) )); then
        print_success "Throughput: Good (>500 RPS)"
    elif (( $(echo "$rps > 100" | bc -l) )); then
        print_warning "Throughput: Acceptable (>100 RPS)"
    else
        print_error "Throughput: Poor (<100 RPS)"
    fi
}

# Generate HTML report
generate_report() {
    print_header "Generating Performance Report"
    
    if [ ! -f "load-test-results.json" ]; then
        print_error "Results file not found"
        return 1
    fi
    
    # Create HTML report
    cat > performance-report.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>CredLink Performance Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        .metric { background: #f9f9f9; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .success { color: green; }
        .warning { color: orange; }
        .error { color: red; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>CredLink Performance Report</h1>
        <p>Generated: $(date)</p>
        <p>Target: $TARGET_URL</p>
        <p>Configuration: $VUS VUs, ${DURATION}s duration</p>
    </div>
    
    <h2>Performance Metrics</h2>
    <table>
        <tr><th>Metric</th><th>Value</th><th>Status</th></tr>
        <tr>
            <td>Total Requests</td>
            <td>$(jq '.metrics.http_reqs.count' load-test-results.json)</td>
            <td>-</td>
        </tr>
        <tr>
            <td>Requests/sec</td>
            <td>$(jq '.metrics.http_reqs.rate' load-test-results.json | cut -d. -f1)</td>
            <td>-</td>
        </tr>
        <tr>
            <td>Error Rate</td>
            <td>$(echo "$(jq '.metrics.http_req_failed.rate' load-test-results.json) * 100" | bc -l | cut -d. -f2)%</td>
            <td class="$([ $(echo "$(jq '.metrics.http_req_failed.rate' load-test-results.json) * 100 < 5" | bc -l) -eq 1 ] && echo success || echo error)">$(echo "$(jq '.metrics.http_req_failed.rate' load-test-results.json) * 100" | bc -l | cut -d. -f2)%</td>
        </tr>
        <tr>
            <td>Avg Response Time</td>
            <td>$(jq '.metrics.http_req_duration.avg' load-test-results.json)ms</td>
            <td class="$([ $(echo "$(jq '.metrics.http_req_duration.avg' load-test-results.json) < 500" | bc -l) -eq 1 ] && echo success || echo warning)">$(jq '.metrics.http_req_duration.avg' load-test-results.json)ms</td>
        </tr>
        <tr>
            <td>P95 Response Time</td>
            <td>$(jq '.metrics.http_req_duration["p(95)"]' load-test-results.json)ms</td>
            <td class="$([ $(echo "$(jq '.metrics.http_req_duration["p(95)"]' load-test-results.json) < 500" | bc -l) -eq 1 ] && echo success || echo error)">$(jq '.metrics.http_req_duration["p(95)"]' load-test-results.json)ms</td>
        </tr>
        <tr>
            <td>P99 Response Time</td>
            <td>$(jq '.metrics.http_req_duration["p(99)"]' load-test-results.json)ms</td>
            <td>-</td>
        </tr>
    </table>
    
    <h2>Recommendations</h2>
    <div class="metric">
        <h3>Performance Optimization</h3>
        <ul>
            <li>Monitor P95 response times - target under 500ms</li>
            <li>Keep error rate under 5%</li>
            <li>Consider auto-scaling if RPS exceeds 1000</li>
            <li>Enable CloudFront CDN for static assets</li>
            <li>Optimize database queries for slow responses</li>
        </ul>
    </div>
    
    <h2>Next Steps</h2>
    <div class="metric">
        <ul>
            <li>Run tests during different times of day</li>
            <li>Test with different user patterns</li>
            <li>Monitor during actual traffic spikes</li>
            <li>Set up performance alerts in CloudWatch</li>
            <li>Regular performance testing (weekly/monthly)</li>
        </ul>
    </div>
</body>
</html>
EOF

    print_success "HTML report generated: performance-report.html"
}

# Cleanup
cleanup() {
    print_info "Cleaning up temporary files..."
    rm -f load-test.js smoke-test-results.json load-test-results.json
    print_success "Cleanup complete"
}

# Show performance recommendations
show_recommendations() {
    print_header "Performance Recommendations"
    
    echo ""
    print_info "🚀 Performance Optimization:"
    echo "1. Enable CloudFront CDN (already configured in Week 7)"
    echo "2. Use Redis caching for frequent queries"
    echo "3. Optimize database indexes"
    echo "4. Enable HTTP/2 on ALB"
    echo "5. Compress responses (gzip)"
    echo ""
    print_info "📊 Monitoring:"
    echo "1. Set up performance alerts"
    echo "2. Monitor CloudWatch metrics"
    echo "3. Track error rates"
    echo "4. Monitor auto-scaling events"
    echo ""
    print_info "🔧 Load Testing Best Practices:"
    echo "1. Test regularly (weekly/monthly)"
    echo "2. Test different scenarios"
    echo "3. Test during peak hours"
    echo "4. Monitor production during tests"
    echo "5. Have rollback plans ready"
}

# Main script
main() {
    print_header "CredLink Load Testing"
    
    check_prerequisites
    get_target_url
    create_test_script
    run_smoke_test
    run_load_test
    analyze_results
    generate_report
    cleanup
    show_recommendations
    
    echo ""
    print_success "Load testing complete!"
    echo ""
    print_info "Files generated:"
    echo "  - performance-report.html (detailed report)"
    echo ""
    print_info "Next steps:"
    echo "1. Review the performance report"
    echo "2. Implement optimizations if needed"
    echo "3. Set up regular performance testing"
    echo "4. Monitor production performance"
}

# Run main function
main "$@"
