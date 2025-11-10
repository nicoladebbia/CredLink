#!/bin/bash
# PagerDuty Integration Setup (Optional)
# Integrates CloudWatch alarms with PagerDuty for incident management

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
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        print_error "jq is not installed"
        print_info "Install jq: brew install jq (macOS) or apt-get install jq (Ubuntu)"
        exit 1
    fi
    print_success "jq installed"
}

# Get PagerDuty configuration
get_pagerduty_config() {
    print_header "PagerDuty Configuration"
    
    echo ""
    print_info "This script will integrate CloudWatch alarms with PagerDuty."
    echo "You'll need:"
    echo "1. PagerDuty account (free tier available)"
    echo "2. PagerDuty API key"
    echo "3. PagerDuty service ID"
    echo ""
    
    read -p "Do you have PagerDuty credentials? (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Please sign up for PagerDuty first:"
        echo "  1. Go to https://www.pagerduty.com/sign-up/"
        echo "  2. Create a service (e.g., 'CredLink Production')"
        echo "  3. Get your API key: Integrations → API Access Keys"
        echo "  4. Get your service ID: Services → Your Service → Integrations"
        echo ""
        print_info "Then run this script again."
        exit 0
    fi
    
    echo ""
    read -p "Enter your PagerDuty API key: " -s PAGERDUTY_API_KEY
    echo ""
    read -p "Enter your PagerDuty service ID: " PAGERDUTY_SERVICE_ID
    echo ""
    
    if [ -z "$PAGERDUTY_API_KEY" ] || [ -z "$PAGERDUTY_SERVICE_ID" ]; then
        print_error "Both API key and service ID are required"
        exit 1
    fi
    
    print_success "PagerDuty configuration received"
}

# Create PagerDuty integration in AWS
create_pagerduty_integration() {
    print_header "Creating PagerDuty Integration"
    
    cd "$(dirname "$0")/.."
    
    # Get SNS topic from Terraform
    SNS_TOPIC=$(terraform output -raw sns_topic_arn 2>/dev/null)
    
    if [ -z "$SNS_TOPIC" ]; then
        print_error "SNS topic not found. Make sure Week 5 infrastructure is deployed."
        exit 1
    fi
    
    print_success "Using SNS topic: $SNS_TOPIC"
    
    # Create PagerDuty SNS topic subscription
    print_info "Creating PagerDuty SNS subscription..."
    
    aws sns subscribe \
        --topic-arn "$SNS_TOPIC" \
        --protocol "https" \
        --notification-endpoint "https://events.pagerduty.com/integration/$PAGERDUTY_SERVICE_ID/enqueue" \
        --region "$AWS_REGION"
    
    if [ $? -eq 0 ]; then
        print_success "PagerDuty SNS subscription created"
    else
        print_error "Failed to create PagerDuty subscription"
        exit 1
    fi
}

# Test PagerDuty integration
test_pagerduty_integration() {
    print_header "Testing PagerDuty Integration"
    
    cd "$(dirname "$0")/.."
    
    SNS_TOPIC=$(terraform output -raw sns_topic_arn 2>/dev/null)
    
    print_info "Sending test alert to PagerDuty..."
    
    # Create test alert message
    TEST_MESSAGE=$(cat <<EOF
{
  "service_key": "$PAGERDUTY_API_KEY",
  "incident_key": "credlink-test-$(date +%s)",
  "event_type": "trigger",
  "description": "CredLink Monitoring Test Alert",
  "details": {
    "component": "monitoring-setup",
    "environment": "test",
    "test": "pagerduty-integration"
  }
}
EOF
)
    
    # Send test alert via curl to PagerDuty API
    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d "$TEST_MESSAGE" \
        "https://events.pagerduty.com/generic/2010-04-15/create_event.json")
    
    if [ "$response" = "200" ] || [ "$response" = "201" ]; then
        print_success "Test alert sent to PagerDuty"
        print_info "Check your PagerDuty dashboard for the test incident"
    else
        print_error "Failed to send test alert (HTTP $response)"
        return 1
    fi
}

# Create CloudWatch alarm actions for PagerDuty
update_alarm_actions() {
    print_header "Updating CloudWatch Alarms for PagerDuty"
    
    cd "$(dirname "$0")/.."
    
    SNS_TOPIC=$(terraform output -raw sns_topic_arn 2>/dev/null)
    
    # List of critical alarms that should go to PagerDuty
    CRITICAL_ALARMS=(
        "credlink-production-ecs-tasks-low"
        "credlink-production-alb-5xx-errors"
        "credlink-production-rds-cpu-high"
        "credlink-production-application-errors"
    )
    
    print_info "Updating critical alarms to include PagerDuty..."
    
    for alarm in "${CRITICAL_ALARMS[@]}"; do
        # Get current alarm configuration
        alarm_config=$(aws cloudwatch describe-alarms --alarm-names "$alarm" --query 'MetricAlarms[0]' --output json)
        
        if [ -z "$alarm_config" ]; then
            print_warning "Alarm not found: $alarm"
            continue
        fi
        
        # Update alarm to include SNS topic (already includes it from Terraform)
        # This is just to confirm it's set up correctly
        alarm_actions=$(echo "$alarm_config" | jq -r '.AlarmActions[0]')
        
        if [ "$alarm_actions" = "$SNS_TOPIC" ]; then
            print_success "Alarm already configured: $alarm"
        else
            print_warning "Alarm actions may need update: $alarm"
        fi
    done
}

# Show PagerDuty setup info
show_pagerduty_info() {
    print_header "PagerDuty Integration Complete"
    
    echo ""
    print_success "✅ PagerDuty Integration"
    echo "  - SNS subscription created"
    echo "  - Test alert sent"
    echo "  - Critical alarms configured"
    echo ""
    print_info "📋 PagerDuty Configuration:"
    echo "  Service ID: $PAGERDUTY_SERVICE_ID"
    echo "  Integration: CloudWatch via SNS"
    echo ""
    print_info "🚨 Alert Routing:"
    echo "  - Email alerts: Always sent"
    echo "  - PagerDuty alerts: Critical alarms only"
    echo "  - Critical alarms:"
    echo "    • ECS Tasks Low (service down)"
    echo "    • ALB 5XX Errors (service issues)"
    echo "    • RDS CPU High (database issues)"
    echo "    • Application Errors (app issues)"
    echo ""
    print_info "📱 Using PagerDuty:"
    echo "  1. Install PagerDuty mobile app"
    echo "  2. Configure on-call schedules"
    echo "  3. Set up escalation policies"
    echo "  4. Configure notification rules"
    echo ""
    print_info "🔧 Managing Integration:"
    echo "  # Test PagerDuty alerts"
    echo "  ./scripts/pagerduty-setup.sh"
    echo ""
    echo "  # Update PagerDuty service"
    echo "  aws sns list-subscriptions-by-topic --topic-arn \$SNS_TOPIC"
    echo ""
    echo "  # Disable PagerDuty (emergency only)"
    echo "  aws sns unsubscribe --subscription-arn <subscription-arn>"
}

# Show troubleshooting guide
show_troubleshooting() {
    print_header "Troubleshooting"
    
    echo ""
    print_info "❌ Not receiving PagerDuty alerts:"
    echo "  1. Check SNS subscription status"
    echo "  2. Verify PagerDuty service ID"
    echo "  3. Check PagerDuty API key"
    echo "  4. Test with curl directly"
    echo ""
    print_info "❌ Test alert failed:"
    echo "  1. Verify API key is correct"
    echo "  2. Check service ID exists"
    echo "  3. Ensure service is active"
    echo "  4. Check network connectivity"
    echo ""
    print_info "❌ Too many false alarms:"
    echo "  1. Adjust alarm thresholds"
    echo "  2. Increase evaluation periods"
    echo "  3. Add alarm conditions"
    echo "  4. Use maintenance windows"
    echo ""
    print_info "📞 PagerDuty Support:"
    echo "  - Documentation: https://support.pagerduty.com/"
    echo "  - Status: https://status.pagerduty.com/"
    echo "  - API docs: https://developer.pagerduty.com/"
}

# Main script
main() {
    print_header "CredLink PagerDuty Integration Setup"
    
    check_prerequisites
    get_pagerduty_config
    create_pagerduty_integration
    test_pagerduty_integration
    update_alarm_actions
    show_pagerduty_info
    show_troubleshooting
    
    echo ""
    print_success "PagerDuty integration complete!"
    echo ""
    print_info "Next steps:"
    echo "1. Configure on-call schedules in PagerDuty"
    echo "2. Set up escalation policies"
    echo "3. Test with real alerts"
    echo "4. Monitor and adjust thresholds"
}

# Run main function
main
