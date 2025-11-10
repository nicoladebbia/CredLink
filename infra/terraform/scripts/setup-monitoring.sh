#!/bin/bash
# Setup Monitoring and Alerting
# Run this after Week 5 infrastructure is deployed

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
}

# Get monitoring resources from Terraform
get_monitoring_resources() {
    print_header "Getting Monitoring Resources"
    
    cd "$(dirname "$0")/.."
    
    DASHBOARD_MAIN=$(terraform output -raw dashboard_main_url 2>/dev/null)
    DASHBOARD_INFRA=$(terraform output -raw dashboard_infrastructure_url 2>/dev/null)
    SNS_TOPIC=$(terraform output -raw sns_topic_arn 2>/dev/null)
    ALERT_EMAIL=$(terraform output -raw alert_email 2>/dev/null)
    
    if [ -z "$DASHBOARD_MAIN" ]; then
        print_error "Monitoring resources not found"
        print_info "Make sure Week 5 infrastructure is deployed (terraform apply)"
        exit 1
    fi
    
    print_success "Main dashboard: $DASHBOARD_MAIN"
    print_success "Infrastructure dashboard: $DASHBOARD_INFRA"
    print_success "Alerts topic: $SNS_TOPIC"
    print_success "Alert email: $ALERT_EMAIL"
}

# Verify dashboards exist
verify_dashboards() {
    print_header "Verifying CloudWatch Dashboards"
    
    DASHBOARD_NAME=$(echo "$DASHBOARD_MAIN" | sed 's/.*name=//')
    
    if aws cloudwatch get-dashboard --dashboard-name "$DASHBOARD_NAME" &> /dev/null; then
        print_success "Main dashboard exists"
    else
        print_error "Main dashboard not found"
        return 1
    fi
    
    INFRA_DASHBOARD_NAME=$(echo "$DASHBOARD_INFRA" | sed 's/.*name=//')
    
    if aws cloudwatch get-dashboard --dashboard-name "$INFRA_DASHBOARD_NAME" &> /dev/null; then
        print_success "Infrastructure dashboard exists"
    else
        print_error "Infrastructure dashboard not found"
        return 1
    fi
}

# Verify alarms exist
verify_alarms() {
    print_header "Verifying CloudWatch Alarms"
    
    ALARM_NAMES=(
        "credlink-production-ecs-cpu-high"
        "credlink-production-ecs-memory-high"
        "credlink-production-ecs-tasks-low"
        "credlink-production-alb-5xx-errors"
        "credlink-production-alb-response-time-high"
        "credlink-production-rds-cpu-high"
        "credlink-production-rds-connections-high"
        "credlink-production-redis-cpu-high"
        "credlink-production-application-errors"
    )
    
    for alarm in "${ALARM_NAMES[@]}"; do
        if aws cloudwatch describe-alarms --alarm-names "$alarm" --query 'MetricAlarms[0].AlarmName' --output text 2>/dev/null | grep -q "$alarm"; then
            print_success "Alarm: $alarm"
        else
            print_error "Alarm not found: $alarm"
        fi
    done
}

# Test SNS subscription
test_sns() {
    print_header "Testing SNS Alert Subscription"
    
    print_info "Sending test alert to $ALERT_EMAIL"
    
    aws sns publish \
        --topic-arn "$SNS_TOPIC" \
        --subject "CredLink Monitoring Test" \
        --message "This is a test alert from CredLink monitoring setup. If you receive this email, alerts are configured correctly." \
        --region "$AWS_REGION"
    
    if [ $? -eq 0 ]; then
        print_success "Test alert sent successfully"
        print_info "Check your email ($ALERT_EMAIL) for the test alert"
    else
        print_error "Failed to send test alert"
        return 1
    fi
}

# Create custom metrics
create_custom_metrics() {
    print_header "Creating Custom Application Metrics"
    
    print_info "Creating log metric filters for application monitoring..."
    
    # These are already created by Terraform, just verifying
    METRIC_FILTERS=(
        "credlink-production-errors"
        "credlink-production-sign-ops"
        "credlink-production-verify-ops"
    )
    
    for filter in "${METRIC_FILTERS[@]}"; do
        if aws logs describe-metric-filters --filter-name "$filter" --query 'metricFilters[0].filterName' --output text 2>/dev/null | grep -q "$filter"; then
            print_success "Metric filter: $filter"
        else
            print_error "Metric filter not found: $filter"
        fi
    done
}

# Show monitoring setup
show_monitoring_info() {
    print_header "Monitoring Setup Complete"
    
    echo ""
    print_success "✅ CloudWatch Dashboards"
    echo "  Main Dashboard: $DASHBOARD_MAIN"
    echo "  Infrastructure Dashboard: $DASHBOARD_INFRA"
    echo ""
    print_success "✅ CloudWatch Alarms"
    echo "  - ECS CPU > 80%"
    echo "  - ECS Memory > 85%"
    echo "  - ECS Tasks < 1"
    echo "  - ALB 5XX Errors > 10"
    echo "  - ALB Response Time > 1s"
    echo "  - RDS CPU > 80%"
    echo "  - RDS Connections > 80"
    echo "  - Redis CPU > 80%"
    echo "  - Application Errors > 5"
    echo ""
    print_success "✅ Custom Metrics"
    echo "  - Error Count (from logs)"
    echo "  - Sign Operations (from logs)"
    echo "  - Verify Operations (from logs)"
    echo ""
    print_success "✅ Alert Notifications"
    echo "  SNS Topic: $SNS_TOPIC"
    echo "  Email: $ALERT_EMAIL"
    echo ""
    print_info "Next steps:"
    echo "1. Confirm email subscription (check your email)"
    echo "2. Visit dashboards to monitor your application"
    echo "3. Test alarms by generating load"
    echo "4. Configure PagerDuty if needed (see docs)"
}

# Show how to use monitoring
show_usage_guide() {
    print_header "How to Use Monitoring"
    
    echo ""
    print_info "📊 Viewing Dashboards:"
    echo "  Main Dashboard: $DASHBOARD_MAIN"
    echo "  - Shows ECS, ALB, RDS, Redis metrics"
    echo "  - Real-time performance data"
    echo "  - Error logs table"
    echo ""
    print_info "📊 Infrastructure Dashboard:"
    echo "  Infrastructure Dashboard: $DASHBOARD_INFRA"
    echo "  - Shows NAT Gateway, S3 metrics"
    echo "  - Network and storage monitoring"
    echo ""
    print_info "🚨 Receiving Alerts:"
    echo "  - Email alerts sent to: $ALERT_EMAIL"
    echo "  - PagerDuty integration (optional)"
    echo "  - Slack integration (optional)"
    echo ""
    print_info "📈 Custom Metrics:"
    echo "  - ErrorCount: Number of ERROR logs"
    echo "  - SignOperations: Number of /sign requests"
    echo "  - VerifyOperations: Number of /verify requests"
    echo ""
    print_info "🔧 Managing Alarms:"
    echo "  # List all alarms"
    echo "  aws cloudwatch describe-alarms --output table"
    echo ""
    echo "  # Disable an alarm temporarily"
    echo "  aws cloudwatch disable-alarm-actions --alarm-names <alarm-name>"
    echo ""
    echo "  # Enable alarm actions"
    echo "  aws cloudwatch enable-alarm-actions --alarm-names <alarm-name>"
    echo ""
    print_info "📋 Testing Monitoring:"
    echo "  # Generate load to trigger alarms"
    echo "  hey -n 1000 -c 10 http://<alb-dns>/health"
    echo ""
    echo "  # Check alarm history"
    echo "  aws cloudwatch describe-alarm-history --alarm-name <alarm-name>"
}

# Main script
main() {
    print_header "CredLink Monitoring Setup"
    
    check_prerequisites
    get_monitoring_resources
    verify_dashboards
    verify_alarms
    test_sns
    create_custom_metrics
    show_monitoring_info
    show_usage_guide
    
    echo ""
    print_success "Monitoring setup complete!"
    echo ""
    print_info "Remember to:"
    echo "1. Confirm email subscription"
    echo "2. Visit dashboards regularly"
    echo "3. Monitor alarm notifications"
    echo "4. Adjust thresholds as needed"
}

# Run main function
main
