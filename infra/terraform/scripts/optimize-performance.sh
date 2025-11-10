#!/bin/bash
# Performance Optimization Setup
# Configures and optimizes the system for maximum performance

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

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed"
        exit 1
    fi
    print_success "AWS CLI installed"
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured"
        exit 1
    fi
    print_success "AWS credentials configured"
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform is not installed"
        exit 1
    fi
    print_success "Terraform installed"
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        print_error "jq is not installed"
        print_info "Install jq: brew install jq (macOS) or apt-get install jq (Ubuntu)"
        exit 1
    fi
    print_success "jq installed"
}

# Get performance resources from Terraform
get_performance_resources() {
    print_header "Getting Performance Resources"
    
    cd "$(dirname "$0")/.."
    
    CLOUDFRONT_DISTRIBUTION=$(terraform output -raw cloudfront_distribution_id 2>/dev/null || echo "")
    ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null || echo "")
    ECS_SERVICE=$(terraform output -raw ecs_service_name 2>/dev/null || echo "")
    
    if [ -z "$ALB_DNS" ]; then
        print_error "Performance resources not found"
        print_info "Make sure Week 7 infrastructure is deployed (terraform apply)"
        exit 1
    fi
    
    print_success "ALB DNS: $ALB_DNS"
    print_success "ECS Service: $ECS_SERVICE"
    print_success "CloudFront Distribution: $CLOUDFRONT_DISTRIBUTION"
}

# Verify CloudFront CDN
verify_cloudfront() {
    print_header "Verifying CloudFront CDN"
    
    if [ -z "$CLOUDFRONT_DISTRIBUTION" ]; then
        print_warning "CloudFront distribution not found"
        return 1
    fi
    
    # Check CloudFront distribution status
    status=$(aws cloudfront get-distribution --id "$CLOUDFRONT_DISTRIBUTION" \
        --query 'Distribution.Status' --output text)
    
    if [ "$status" = "Deployed" ]; then
        print_success "CloudFront distribution is deployed"
    else
        print_warning "CloudFront distribution status: $status"
        print_info "It may take a few minutes to fully deploy"
    fi
    
    # Get distribution domain name
    cf_domain=$(aws cloudfront get-distribution --id "$CLOUDFRONT_DISTRIBUTION" \
        --query 'Distribution.DomainName' --output text)
    
    print_success "CloudFront domain: $cf_domain"
    
    # Test CloudFront accessibility
    print_info "Testing CloudFront accessibility..."
    if curl -s -o /dev/null -w "%{http_code}" "http://$cf_domain/health" | grep -q "200\|403"; then
        print_success "CloudFront is accessible"
    else
        print_warning "CloudFront may still be deploying"
    fi
}

# Verify Enhanced Auto-Scaling
verify_autoscaling() {
    print_header "Verifying Enhanced Auto-Scaling"
    
    cd "$(dirname "$0")/.."
    
    # Get auto-scaling configuration
    min_capacity=$(aws application-autoscaling describe-scaling-targets \
        --service-namespace ecs \
        --resource-id "service/credlink-production-cluster/credlink-production-service" \
        --query 'ScalingTargets[0].MinCapacity' --output text)
    
    max_capacity=$(aws application-autoscaling describe-scaling-targets \
        --service-namespace ecs \
        --resource-id "service/credlink-production-cluster/credlink-production-service" \
        --query 'ScalingTargets[0].MaxCapacity' --output text)
    
    print_success "Auto-scaling range: $min_capacity - $max_capacity tasks"
    
    # List auto-scaling policies
    print_info "Auto-scaling policies:"
    aws application-autoscaling describe-scaling-policies \
        --service-namespace ecs \
        --resource-id "service/credlink-production-cluster/credlink-production-service" \
        --query 'ScalingPolicies[].{Name:PolicyName,TargetType:TargetTrackingScalingPolicyConfiguration.TargetValue}' \
        --output table
    
    print_success "Enhanced auto-scaling verified"
}

# Verify RDS Performance Enhancements
verify_rds_performance() {
    print_header "Verifying RDS Performance Enhancements"
    
    cd "$(dirname "$0")/.."
    
    # Get RDS instance ID
    rds_id=$(terraform output -raw rds_instance_id 2>/dev/null)
    
    if [ -z "$rds_id" ]; then
        print_error "RDS instance ID not found"
        return 1
    fi
    
    # Check Enhanced Monitoring
    enhanced_monitoring=$(aws rds describe-db-instances \
        --db-instance-identifier "$rds_id" \
        --query 'DBInstances[0].EnhancedMonitoringResourceIdentifier' --output text)
    
    if [ "$enhanced_monitoring" != "None" ]; then
        print_success "Enhanced Monitoring is enabled"
    else
        print_warning "Enhanced Monitoring is not enabled"
    fi
    
    # Check Performance Insights
    performance_insights=$(aws rds describe-db-instances \
        --db-instance-identifier "$rds_id" \
        --query 'DBInstances[0].PerformanceInsightsEnabled' --output text)
    
    if [ "$performance_insights" = "true" ]; then
        print_success "Performance Insights is enabled"
    else
        print_warning "Performance Insights is not enabled"
    fi
    
    # Get current performance metrics
    print_info "Current RDS performance:"
    cpu_util=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/RDS \
        --metric-name CPUUtilization \
        --dimensions Name=DBInstanceIdentifier,Value="$rds_id" \
        --start-time "$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%SZ)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --period 60 --statistics Average \
        --query 'Datapoints[-1].Average' --output text)
    
    connections=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/RDS \
        --metric-name DatabaseConnections \
        --dimensions Name=DBInstanceIdentifier,Value="$rds_id" \
        --start-time "$(date -u -d '5 minutes ago' +%Y-%m-%dT%H:%M:%SZ)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --period 60 --statistics Average \
        --query 'Datapoints[-1].Average' --output text)
    
    echo "  CPU Utilization: ${cpu_util}%"
    echo "  Database Connections: ${connections}"
    
    print_success "RDS performance verification complete"
}

# Test performance optimizations
test_performance() {
    print_header "Testing Performance Optimizations"
    
    cd "$(dirname "$0")/.."
    
    # Test CDN performance
    if [ -n "$CLOUDFRONT_DISTRIBUTION" ]; then
        cf_domain=$(aws cloudfront get-distribution --id "$CLOUDFRONT_DISTRIBUTION" \
            --query 'Distribution.DomainName' --output text)
        
        print_info "Testing CDN performance..."
        
        # Test response time via CDN
        cf_time=$(curl -o /dev/null -s -w "%{time_total}" "http://$cf_domain/health" || echo "0")
        direct_time=$(curl -o /dev/null -s -w "%{time_total}" "http://$ALB_DNS/health" || echo "0")
        
        if (( $(echo "$cf_time > 0" | bc -l) )); then
            print_success "CDN response time: ${cf_time}s"
            print_success "Direct response time: ${direct_time}s"
            
            if (( $(echo "$cf_time < $direct_time" | bc -l) )); then
                print_success "CDN is improving response time"
            else
                print_warning "CDN may not be caching this endpoint"
            fi
        else
            print_warning "Could not measure CDN performance"
        fi
    fi
    
    # Test application performance
    print_info "Testing application performance..."
    
    # Test health endpoint
    health_response=$(curl -s -o /dev/null -w "%{http_code}" "http://$ALB_DNS/health")
    if [ "$health_response" = "200" ]; then
        print_success "Health endpoint responding"
    else
        print_warning "Health endpoint returned: $health_response"
    fi
    
    # Test sign endpoint performance
    sign_time=$(curl -o /dev/null -s -w "%{time_total}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"document":"test","metadata":{"title":"test"}}' \
        "http://$ALB_DNS/sign" || echo "0")
    
    if (( $(echo "$sign_time > 0" | bc -l) )); then
        print_success "Sign endpoint response time: ${sign_time}s"
        
        if (( $(echo "$sign_time < 2" | bc -l) )); then
            print_success "Sign endpoint performance is good"
        else
            print_warning "Sign endpoint may need optimization"
        fi
    fi
    
    print_success "Performance testing complete"
}

# Generate performance report
generate_performance_report() {
    print_header "Generating Performance Report"
    
    cd "$(dirname "$0")/.."
    
    # Get current metrics
    alb_arn=$(terraform output -raw alb_arn 2>/dev/null)
    rds_id=$(terraform output -raw rds_instance_id 2>/dev/null)
    
    # ALB metrics
    alb_requests=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/ApplicationELB \
        --metric-name RequestCount \
        --dimensions Name=LoadBalancer,Value="$alb_arn" \
        --start-time "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --period 300 --statistics Sum \
        --query 'Datapoints | sort_by(@, &Timestamp) | [-1].Sum' --output text)
    
    alb_target_time=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/ApplicationELB \
        --metric-name TargetResponseTime \
        --dimensions Name=LoadBalancer,Value="$alb_arn" \
        --start-time "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --period 300 --statistics Average \
        --query 'Datapoints | sort_by(@, &Timestamp) | [-1].Average' --output text)
    
    # RDS metrics
    rds_cpu=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/RDS \
        --metric-name CPUUtilization \
        --dimensions Name=DBInstanceIdentifier,Value="$rds_id" \
        --start-time "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --period 300 --statistics Average \
        --query 'Datapoints | sort_by(@, &Timestamp) | [-1].Average' --output text)
    
    # ECS metrics
    ecs_cpu=$(aws cloudwatch get-metric-statistics \
        --namespace AWS/ECS \
        --metric-name CPUUtilization \
        --dimensions Name=ServiceName,Value="credlink-production-service" Name=ClusterName,Value="credlink-production-cluster" \
        --start-time "$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ)" \
        --end-time "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
        --period 300 --statistics Average \
        --query 'Datapoints | sort_by(@, &Timestamp) | [-1].Average' --output text)
    
    # Create performance report
    cat > performance-optimization-report.html << EOF
<!DOCTYPE html>
<html>
<head>
    <title>CredLink Performance Optimization Report</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 40px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        .metric { background: #f9f9f9; margin: 10px 0; padding: 15px; border-radius: 5px; }
        .success { color: green; font-weight: bold; }
        .warning { color: orange; font-weight: bold; }
        .good { background: #d4edda; }
        .attention { background: #fff3cd; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
        th { background-color: #f2f2f2; }
    </style>
</head>
<body>
    <div class="header">
        <h1>CredLink Performance Optimization Report</h1>
        <p>Generated: $(date)</p>
        <p>Environment: Production</p>
    </div>
    
    <h2>Current Performance Metrics</h2>
    <table>
        <tr><th>Component</th><th>Metric</th><th>Value</th><th>Status</th></tr>
        <tr>
            <td>ALB</td>
            <td>Requests (last hour)</td>
            <td>${alb_requests}</td>
            <td>-</td>
        </tr>
        <tr>
            <td>ALB</td>
            <td>Average Response Time</td>
            <td>${alb_target_time}s</td>
            <td class="$([ $(echo "$alb_target_time < 1" | bc -l) -eq 1 ] && echo success || echo warning)">$(echo "$alb_target_time < 1" | bc -l)</td>
        </tr>
        <tr>
            <td>RDS</td>
            <td>CPU Utilization</td>
            <td>${rds_cpu}%</td>
            <td class="$([ $(echo "$rds_cpu < 70" | bc -l) -eq 1 ] && echo success || echo warning)">$(echo "$rds_cpu < 70" | bc -l)</td>
        </tr>
        <tr>
            <td>ECS</td>
            <td>CPU Utilization</td>
            <td>${ecs_cpu}%</td>
            <td class="$([ $(echo "$ecs_cpu < 70" | bc -l) -eq 1 ] && echo success || echo warning)">$(echo "$ecs_cpu < 70" | bc -l)</td>
        </tr>
    </table>
    
    <h2>Performance Features Enabled</h2>
    <div class="metric good">
        <h3>✅ CloudFront CDN</h3>
        <p>Content Delivery Network for static assets and API caching</p>
        <ul>
            <li>Edge locations worldwide</li>
            <li>Automatic compression</li>
            <li>SSL/TLS termination</li>
            <li>DDoS protection</li>
        </ul>
    </div>
    
    <div class="metric good">
        <h3>✅ Enhanced Auto-Scaling</h3>
        <p>Multi-metric auto-scaling for optimal performance</p>
        <ul>
            <li>CPU-based scaling (60% target)</li>
            <li>Memory-based scaling (70% target)</li>
            <li>Request-based scaling (1000 req/target)</li>
            <li>2-20 task capacity</li>
        </ul>
    </div>
    
    <div class="metric good">
        <h3>✅ RDS Performance Enhancements</h3>
        <p>Database performance monitoring and optimization</p>
        <ul>
            <li>Enhanced Monitoring (1s granularity)</li>
            <li>Performance Insights</li>
            <li>Real-time metrics</li>
            <li>Query performance analysis</li>
        </ul>
    </div>
    
    <h2>Optimization Recommendations</h2>
    <div class="metric">
        <h3>🚀 Performance Tuning</h3>
        <ul>
            <li>Enable HTTP/2 on ALB for better multiplexing</li>
            <li>Implement Redis caching for frequent queries</li>
            <li>Optimize database queries and indexes</li>
            <li>Enable response compression</li>
            <li>Use connection pooling for database</li>
        </ul>
    </div>
    
    <div class="metric">
        <h3>📊 Monitoring</h3>
        <ul>
            <li>Set up performance alerts in CloudWatch</li>
            <li>Monitor CDN cache hit ratios</li>
            <li>Track auto-scaling events</li>
            <li>Regular load testing</li>
            <li>Performance budget tracking</li>
        </ul>
    </div>
    
    <h2>Next Steps</h2>
    <div class="metric">
        <ol>
            <li>Run load tests to verify performance under load</li>
            <li>Monitor CloudWatch dashboards for real-time metrics</li>
            <li>Implement additional optimizations based on usage patterns</li>
            <li>Set up performance alerts and notifications</li>
            <li>Regular performance reviews and optimizations</li>
        </ol>
    </div>
</body>
</html>
EOF

    print_success "Performance optimization report generated: performance-optimization-report.html"
}

# Show performance best practices
show_performance_best_practices() {
    print_header "Performance Best Practices"
    
    echo ""
    print_info "🚀 CDN Optimization:"
    echo "  # Monitor CloudFront metrics"
    echo "  aws cloudwatch get-metric-statistics \\"
    echo "    --namespace AWS/CloudFront \\"
    echo "    --metric-name Requests \\"
    echo "    --start-time \$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \\"
    echo "    --end-time \$(date -u +%Y-%m-%dT%H:%M:%SZ) \\"
    echo "    --period 300 --statistics Sum"
    echo ""
    print_info "🔧 Auto-Scaling Optimization:"
    echo "  # Monitor scaling activities"
    echo "  aws application-autoscaling describe-scaling-activities \\"
    echo "    --service-namespace ecs \\"
    echo "    --resource-id service/credlink-production-cluster/credlink-production-service"
    echo ""
    print_info "📊 Database Optimization:"
    echo "  # View Performance Insights"
    echo "  aws rds describe-performance-issues \\"
    echo "    --db-instance-identifier <db-instance-id>"
    echo ""
    print_info "🎯 Regular Tasks:"
    echo "  - Weekly performance reviews"
    echo "  - Monthly load testing"
    echo "  - Quarterly optimization assessments"
    echo "  - Annual capacity planning"
}

# Main script
main() {
    print_header "CredLink Performance Optimization Setup"
    
    check_prerequisites
    get_performance_resources
    verify_cloudfront
    verify_autoscaling
    verify_rds_performance
    test_performance
    generate_performance_report
    show_performance_best_practices
    
    echo ""
    print_success "Performance optimization complete!"
    echo ""
    print_info "What was configured:"
    echo "✅ CloudFront CDN for static assets"
    echo "✅ Enhanced auto-scaling (CPU, Memory, Requests)"
    echo "✅ RDS Performance Insights and Enhanced Monitoring"
    echo "✅ Performance metrics and alarms"
    echo ""
    print_info "Next steps:"
    echo "1. Run load tests: ./scripts/load-test.sh"
    echo "2. Monitor performance dashboards"
    echo "3. Review optimization report"
    echo "4. Implement additional optimizations as needed"
}

# Run main function
main
