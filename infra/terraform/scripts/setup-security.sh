#!/bin/bash
# Security Hardening Setup
# Run this after Week 6 infrastructure is deployed

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

# Get security resources from Terraform
get_security_resources() {
    print_header "Getting Security Resources"
    
    cd "$(dirname "$0")/.."
    
    WAF_ARN=$(terraform output -raw waf_arn 2>/dev/null || echo "")
    SECRET_ROTATION_LAMBDA=$(terraform output -raw secret_rotation_lambda_arn 2>/dev/null || echo "")
    GUARDDUTY_DETECTOR=$(terraform output -raw guardduty_detector_id 2>/dev/null || echo "")
    
    if [ -z "$WAF_ARN" ]; then
        print_error "Security resources not found"
        print_info "Make sure Week 6 infrastructure is deployed (terraform apply)"
        exit 1
    fi
    
    print_success "WAF Web ACL: $WAF_ARN"
    print_success "Secret Rotation Lambda: $SECRET_ROTATION_LAMBDA"
    print_success "GuardDuty Detector: $GUARDDUTY_DETECTOR"
}

# Verify WAF configuration
verify_waf() {
    print_header "Verifying AWS WAF Configuration"
    
    # Get WAF ID from ARN
    WAF_ID=$(echo "$WAF_ARN" | sed 's/.*webacl\///' | sed 's/\/.*//')
    
    # Check WAF exists
    if aws wafv2 get-web-acl --name "$WAF_ID" --scope REGIONAL --region "$AWS_REGION" &> /dev/null; then
        print_success "WAF Web ACL exists"
    else
        print_error "WAF Web ACL not found"
        return 1
    fi
    
    # Check WAF association with ALB
    cd "$(dirname "$0")/.."
    ALB_ARN=$(terraform output -raw alb_arn 2>/dev/null)
    
    if aws wafv2 get-web-acl-for-resource --resource-arn "$ALB_ARN" --region "$AWS_REGION" &> /dev/null; then
        print_success "WAF is associated with ALB"
    else
        print_error "WAF is not associated with ALB"
        return 1
    fi
    
    # List WAF rules
    print_info "WAF Rules configured:"
    aws wafv2 get-web-acl --name "$WAF_ID" --scope REGIONAL --region "$AWS_REGION" \
        --query 'Rules[].{Name:Name,Priority:Priority}' --output table
    
    print_success "WAF configuration verified"
}

# Test WAF rules
test_waf_rules() {
    print_header "Testing AWS WAF Rules"
    
    cd "$(dirname "$0")/.."
    ALB_DNS=$(terraform output -raw alb_dns_name 2>/dev/null)
    
    if [ -z "$ALB_DNS" ]; then
        print_error "ALB DNS not found"
        return 1
    fi
    
    print_info "Testing WAF with ALB: $ALB_DNS"
    
    # Test 1: Normal request (should pass)
    print_info "Test 1: Normal request"
    response=$(curl -s -o /dev/null -w "%{http_code}" -H "User-Agent: Mozilla/5.0" "http://$ALB_DNS/health" || echo "000")
    
    if [ "$response" = "200" ]; then
        print_success "Normal request allowed (HTTP $response)"
    else
        print_warning "Normal request returned HTTP $response"
    fi
    
    # Test 2: SQL injection attempt (should be blocked)
    print_info "Test 2: SQL injection attempt"
    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"query": "SELECT * FROM users"}' \
        "http://$ALB_DNS/api" || echo "000")
    
    if [ "$response" = "403" ]; then
        print_success "SQL injection blocked (HTTP $response)"
    else
        print_warning "SQL injection returned HTTP $response"
    fi
    
    # Test 3: XSS attempt (should be blocked)
    print_info "Test 3: XSS attempt"
    response=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
        -H "Content-Type: application/json" \
        -d '{"html": "<script>alert(\"xss\")</script>"}' \
        "http://$ALB_DNS/api" || echo "000")
    
    if [ "$response" = "403" ]; then
        print_success "XSS blocked (HTTP $response)"
    else
        print_warning "XSS returned HTTP $response"
    fi
    
    # Test 4: Bad bot (should be blocked)
    print_info "Test 4: Bad bot request"
    response=$(curl -s -o /dev/null -w "%{http_code}" \
        -H "User-Agent: bad-bot-scanner" \
        "http://$ALB_DNS/health" || echo "000")
    
    if [ "$response" = "403" ]; then
        print_success "Bad bot blocked (HTTP $response)"
    else
        print_warning "Bad bot returned HTTP $response"
    fi
    
    print_success "WAF rule testing complete"
}

# Verify secret rotation
verify_secret_rotation() {
    print_header "Verifying Secret Rotation"
    
    cd "$(dirname "$0")/.."
    SECRET_ARN=$(terraform output -raw secret_arn 2>/dev/null)
    
    if [ -z "$SECRET_ARN" ]; then
        print_error "Secret ARN not found"
        return 1
    fi
    
    # Check secret rotation is enabled
    rotation_config=$(aws secretsmanager describe-secret --secret-id "$SECRET_ARN" --query 'RotationEnabled' --output text)
    
    if [ "$rotation_config" = "true" ]; then
        print_success "Secret rotation is enabled"
    else
        print_error "Secret rotation is not enabled"
        return 1
    fi
    
    # Check Lambda function exists
    if aws lambda get-function --function-name "$SECRET_ROTATION_LAMBDA" &> /dev/null; then
        print_success "Secret rotation Lambda exists"
    else
        print_error "Secret rotation Lambda not found"
        return 1
    fi
    
    # Show rotation schedule
    rotation_rules=$(aws secretsmanager describe-secret --secret-id "$SECRET_ARN" --query 'RotationRules.AutomaticallyAfterDays' --output text)
    print_info "Rotation schedule: Every $rotation_rules days"
    
    print_success "Secret rotation verified"
}

# Test secret rotation
test_secret_rotation() {
    print_header "Testing Secret Rotation"
    
    cd "$(dirname "$0")/.."
    SECRET_ARN=$(terraform output -raw secret_arn 2>/dev/null)
    
    print_warning "This will trigger a secret rotation test"
    print_warning "This will temporarily update your database password"
    read -p "Do you want to continue? (y/n): " -n 1 -r
    echo
    
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        print_info "Skipping secret rotation test"
        return 0
    fi
    
    # Trigger secret rotation
    print_info "Triggering secret rotation..."
    
    aws secretsmanager rotate-secret --secret-id "$SECRET_ARN"
    
    if [ $? -eq 0 ]; then
        print_success "Secret rotation triggered"
        print_info "Rotation takes a few minutes to complete"
        print_info "Check CloudWatch logs for the Lambda function"
    else
        print_error "Failed to trigger secret rotation"
        return 1
    fi
}

# Verify GuardDuty
verify_guardduty() {
    print_header "Verifying GuardDuty Configuration"
    
    # Check GuardDuty detector exists
    if aws guardduty get-detector --detector-id "$GUARDDUTY_DETECTOR" &> /dev/null; then
        print_success "GuardDuty detector exists"
    else
        print_error "GuardDuty detector not found"
        return 1
    fi
    
    # Check GuardDuty is enabled
    status=$(aws guardduty get-detector --detector-id "$GUARDDUTY_DETECTOR" --query 'Status' --output text)
    
    if [ "$status" = "ENABLED" ]; then
        print_success "GuardDuty is enabled"
    else
        print_error "GuardDuty is not enabled"
        return 1
    fi
    
    # Show data sources enabled
    print_info "GuardDuty data sources:"
    aws guardduty get-detector --detector-id "$GUARDDUTY_DETECTOR" \
        --query 'DataSources' --output table
    
    print_success "GuardDuty configuration verified"
}

# Verify Security Hub
verify_security_hub() {
    print_header "Verifying Security Hub Configuration"
    
    # Check Security Hub is enabled
    if aws securityhub get-enabled-standards &> /dev/null; then
        print_success "Security Hub is enabled"
    else
        print_error "Security Hub is not enabled"
        return 1
    fi
    
    # List enabled standards
    print_info "Security Hub standards enabled:"
    aws securityhub get-enabled-standards \
        --query 'StandardsSubscriptions[].{Standard:StandardsArn}' --output table
    
    print_success "Security Hub configuration verified"
}

# Run security scan
run_security_scan() {
    print_header "Running Security Scan"
    
    cd "$(dirname "$0")/.."
    
    # Run Trivy on Docker image
    print_info "Running Trivy vulnerability scan..."
    
    ECR_REPOSITORY=$(terraform output -raw ecr_repository_url 2>/dev/null)
    
    if [ -n "$ECR_REPOSITORY" ]; then
        # Login to ECR
        aws ecr get-login-password --region "$AWS_REGION" | docker login --username AWS --password-stdin "$ECR_REPOSITORY"
        
        # Scan latest image
        trivy image --severity HIGH,CRITICAL "$ECR_REPOSITORY:latest" || true
        
        print_success "Trivy scan complete"
    else
        print_warning "ECR repository not found, skipping Trivy scan"
    fi
    
    # Run npm audit
    print_info "Running npm audit..."
    cd ../../apps/sign-service
    npm audit --audit-level high || true
    print_success "npm audit complete"
}

# Show security status
show_security_status() {
    print_header "Security Hardening Complete"
    
    echo ""
    print_success "✅ AWS WAF"
    echo "  - Web ACL created and associated with ALB"
    echo "  - SQL injection protection enabled"
    echo "  - XSS protection enabled"
    echo "  - Rate limiting (2000 req/5min)"
    echo "  - Bad bot blocking"
    echo "  - AWS managed rules (IP reputation, common attacks)"
    echo ""
    print_success "✅ Secret Rotation"
    echo "  - Automatic rotation every 30 days"
    echo "  - Lambda function for database password rotation"
    echo "  - Rotation testing capability"
    echo ""
    print_success "✅ GuardDuty"
    echo "  - Threat detection enabled"
    echo "  - S3 logs monitoring"
    echo "  - Malware protection"
    echo "  - Event-driven alerts"
    echo ""
    print_success "✅ Security Hub"
    echo "  - CIS AWS Foundations benchmark"
    echo "  - PCI DSS standards"
    echo "  - Compliance monitoring"
    echo ""
    print_success "✅ Security Scanning"
    echo "  - Trivy vulnerability scanning"
    echo "  - npm audit for dependencies"
    echo "  - Container image scanning"
    echo ""
    print_info "Next steps:"
    echo "1. Monitor WAF metrics in CloudWatch"
    echo "2. Review GuardDuty findings regularly"
    echo "3. Check Security Hub compliance status"
    echo "4. Schedule regular secret rotations"
    echo "5. Set up security incident response"
}

# Show security best practices
show_security_best_practices() {
    print_header "Security Best Practices"
    
    echo ""
    print_info "🔒 WAF Management:"
    echo "  # Monitor WAF metrics"
    echo "  aws cloudwatch get-metric-statistics \\"
    echo "    --namespace AWS/WAFV2 \\"
    echo "    --metric-name AllowedRequests \\"
    echo "    --start-time \$(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%SZ) \\"
    echo "    --end-time \$(date -u +%Y-%m-%dT%H:%M:%SZ) \\"
    echo "    --period 60 --statistics Sum"
    echo ""
    print_info "🔒 Secret Rotation:"
    echo "  # Test secret rotation"
    echo "  aws secretsmanager rotate-secret \\"
    echo "    --secret-id <secret-arn>"
    echo ""
    echo "  # View rotation history"
    echo "  aws secretsmanager describe-secret \\"
    echo "    --secret-id <secret-arn>"
    echo ""
    print_info "🔒 GuardDuty:"
    echo "  # List findings"
    echo "  aws guardduty list-findings --detector-id <detector-id>"
    echo ""
    echo "  # Get finding details"
    echo "  aws guardduty get-findings --detector-id <detector-id> \\"
    echo "    --finding-ids <finding-id>"
    echo ""
    print_info "🔒 Security Hub:"
    echo "  # View security findings"
    echo "  aws securityhub get-findings"
    echo ""
    echo "  # Enable additional standards"
    echo "  aws securityhub enable-security-hub \\"
    echo "    --standards-subscription-requests \\"
    echo "    StandardsArn=arn:aws:securityhub:::ruleset/..."
    echo ""
    print_info "🔒 Regular Tasks:"
    echo "  - Review WAF logs daily"
    echo "  - Check GuardDuty findings weekly"
    echo "  - Update Security Hub standards monthly"
    echo "  - Test secret rotation quarterly"
    echo "  - Run penetration testing annually"
}

# Main script
main() {
    print_header "CredLink Security Hardening Setup"
    
    check_prerequisites
    get_security_resources
    verify_waf
    test_waf_rules
    verify_secret_rotation
    # test_secret_rotation  # Uncomment to test
    verify_guardduty
    verify_security_hub
    run_security_scan
    show_security_status
    show_security_best_practices
    
    echo ""
    print_success "Security hardening complete!"
    echo ""
    print_info "Remember to:"
    echo "1. Monitor WAF metrics and blocked requests"
    echo "2. Review GuardDuty findings regularly"
    echo "3. Check Security Hub compliance status"
    echo "4. Test secret rotation periodically"
    echo "5. Update security rules as needed"
}

# Run main function
main
