#!/bin/bash

# Quick Health Check Validation for Staging
# Validates all health endpoints are working correctly

set -e

API_BASE_URL="http://localhost:3001"
echo "🏥 Health Check Staging Validation"
echo "================================="
echo "Testing API at: $API_BASE_URL"
echo ""

# Function to test endpoint
test_endpoint() {
    local endpoint=$1
    local expected_status=$2
    local description=$3
    
    echo "Testing $description..."
    
    if response=$(curl -s -w "HTTPSTATUS:%{http_code}" "$API_BASE_URL$endpoint"); then
        http_code=$(echo $response | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
        body=$(echo $response | sed -e 's/HTTPSTATUS:.*//g')
        
        if [ "$http_code" = "$expected_status" ]; then
            echo "✅ $description - HTTP $http_code"
            echo "Response: $body" | jq . 2>/dev/null || echo "Response: $body"
        else
            echo "❌ $description - HTTP $http_code (expected $expected_status)"
            return 1
        fi
    else
        echo "❌ $description - Connection failed"
        return 1
    fi
    
    echo ""
}

# Test all health endpoints
test_endpoint "/health" "200" "Basic Health Check"
test_endpoint "/ready" "200" "Readiness Probe"
test_endpoint "/live" "200" "Liveness Probe"
test_endpoint "/health/detailed" "200" "Detailed Health Check"
test_endpoint "/health/metrics" "200" "Health Metrics"

echo "🎉 All health endpoints validated successfully!"
echo "Health check system is ready for staging deployment."
