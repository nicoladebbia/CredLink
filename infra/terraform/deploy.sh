#!/bin/bash
# CredLink Infrastructure Deployment Script
# Phase 4: Production Infrastructure Deployment

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Functions
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

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    print_header "Checking Prerequisites"
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform is not installed"
        echo "Install it from: https://www.terraform.io/downloads"
        exit 1
    fi
    print_success "Terraform installed: $(terraform version -json | jq -r '.terraform_version')"
    
    # Check AWS CLI
    if ! command -v aws &> /dev/null; then
        print_error "AWS CLI is not installed"
        echo "Install it from: https://aws.amazon.com/cli/"
        exit 1
    fi
    print_success "AWS CLI installed"
    
    # Check AWS credentials
    if ! aws sts get-caller-identity &> /dev/null; then
        print_error "AWS credentials not configured"
        echo "Run: aws configure"
        exit 1
    fi
    ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
    print_success "AWS credentials configured (Account: $ACCOUNT_ID)"
    
    # Check jq
    if ! command -v jq &> /dev/null; then
        print_warning "jq not installed (optional but recommended)"
    fi
}

# Initialize Terraform
init_terraform() {
    print_header "Initializing Terraform"
    
    if [ ! -f "terraform.tfvars" ]; then
        print_warning "terraform.tfvars not found"
        echo "Copying terraform.tfvars.example to terraform.tfvars..."
        cp terraform.tfvars.example terraform.tfvars
        print_warning "Please edit terraform.tfvars with your configuration"
        print_warning "Then run this script again"
        exit 0
    fi
    
    terraform init
    print_success "Terraform initialized"
}

# Validate configuration
validate_config() {
    print_header "Validating Configuration"
    
    terraform validate
    print_success "Configuration valid"
}

# Plan deployment
plan_deployment() {
    print_header "Planning Deployment"
    
    terraform plan -out=tfplan
    print_success "Plan created"
    
    echo ""
    print_warning "Review the plan above carefully"
    echo -n "Do you want to continue? (yes/no): "
    read -r response
    
    if [ "$response" != "yes" ]; then
        print_error "Deployment cancelled"
        exit 0
    fi
}

# Apply deployment
apply_deployment() {
    print_header "Applying Deployment"
    
    terraform apply tfplan
    print_success "Infrastructure deployed"
    
    rm -f tfplan
}

# Show outputs
show_outputs() {
    print_header "Deployment Outputs"
    
    echo ""
    echo "VPC ID: $(terraform output -raw vpc_id 2>/dev/null || echo 'N/A')"
    echo "ALB DNS: $(terraform output -raw alb_dns_name 2>/dev/null || echo 'N/A')"
    echo "ECR Repository: $(terraform output -raw ecr_repository_url 2>/dev/null || echo 'N/A')"
    echo ""
    
    print_success "Deployment complete!"
    echo ""
    echo "Next steps:"
    echo "1. Update DNS to point to ALB"
    echo "2. Push Docker image to ECR"
    echo "3. Deploy ECS service"
}

# Destroy infrastructure
destroy_infrastructure() {
    print_header "Destroying Infrastructure"
    
    print_error "This will DELETE all infrastructure"
    echo -n "Are you absolutely sure? Type 'yes' to confirm: "
    read -r response
    
    if [ "$response" != "yes" ]; then
        print_error "Destruction cancelled"
        exit 0
    fi
    
    terraform destroy -auto-approve
    print_success "Infrastructure destroyed"
}

# Main menu
show_menu() {
    echo ""
    print_header "CredLink Infrastructure Deployment"
    echo "1. Deploy infrastructure"
    echo "2. Show current outputs"
    echo "3. Update infrastructure"
    echo "4. Destroy infrastructure"
    echo "5. Exit"
    echo ""
    echo -n "Select an option: "
}

# Main script
main() {
    cd "$(dirname "$0")"
    
    if [ "$1" == "destroy" ]; then
        check_prerequisites
        init_terraform
        destroy_infrastructure
        exit 0
    fi
    
    if [ "$1" == "plan" ]; then
        check_prerequisites
        init_terraform
        validate_config
        terraform plan
        exit 0
    fi
    
    if [ "$1" == "apply" ]; then
        check_prerequisites
        init_terraform
        validate_config
        plan_deployment
        apply_deployment
        show_outputs
        exit 0
    fi
    
    # Interactive mode
    while true; do
        show_menu
        read -r choice
        
        case $choice in
            1)
                check_prerequisites
                init_terraform
                validate_config
                plan_deployment
                apply_deployment
                show_outputs
                ;;
            2)
                terraform output
                ;;
            3)
                check_prerequisites
                validate_config
                plan_deployment
                apply_deployment
                show_outputs
                ;;
            4)
                destroy_infrastructure
                break
                ;;
            5)
                print_success "Goodbye!"
                exit 0
                ;;
            *)
                print_error "Invalid option"
                ;;
        esac
    done
}

# Run main function
main "$@"
