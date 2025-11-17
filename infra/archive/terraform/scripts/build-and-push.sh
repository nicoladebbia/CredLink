#!/bin/bash
# Build and Push Docker Image to ECR
# Run this after Week 3 infrastructure is deployed

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
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed"
        echo "Install it from: https://docs.docker.com/get-docker/"
        exit 1
    fi
    print_success "Docker installed"
    
    # Check Docker daemon
    if ! docker info &> /dev/null; then
        print_error "Docker daemon is not running"
        echo "Start Docker Desktop or run: sudo systemctl start docker"
        exit 1
    fi
    print_success "Docker daemon running"
    
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
    print_success "AWS credentials configured"
    
    # Check Terraform
    if ! command -v terraform &> /dev/null; then
        print_error "Terraform is not installed"
        exit 1
    fi
    print_success "Terraform installed"
}

# Get ECR repository URL from Terraform
get_ecr_url() {
    print_header "Getting ECR Repository URL"
    
    cd "$(dirname "$0")/.."
    
    ECR_URL=$(terraform output -raw ecr_repository_url 2>/dev/null)
    
    if [ -z "$ECR_URL" ] || [ "$ECR_URL" == "pending_week_3" ]; then
        print_error "ECR repository not found"
        print_info "Make sure Week 3 infrastructure is deployed (terraform apply)"
        exit 1
    fi
    
    print_success "ECR repository: $ECR_URL"
    
    # Extract region and repository name
    AWS_REGION=$(echo "$ECR_URL" | cut -d'.' -f4)
    ECR_REPO=$(echo "$ECR_URL" | cut -d'/' -f2)
    
    print_info "Region: $AWS_REGION"
    print_info "Repository: $ECR_REPO"
}

# Login to ECR
ecr_login() {
    print_header "Logging into ECR"
    
    aws ecr get-login-password --region "$AWS_REGION" | \
        docker login --username AWS --password-stdin "$ECR_URL"
    
    if [ $? -eq 0 ]; then
        print_success "Logged into ECR"
    else
        print_error "Failed to login to ECR"
        exit 1
    fi
}

# Build Docker image
build_image() {
    print_header "Building Docker Image"
    
    # Go to sign-service directory
    SERVICE_DIR="../../apps/sign-service"
    
    if [ ! -f "$SERVICE_DIR/Dockerfile" ]; then
        print_error "Dockerfile not found at $SERVICE_DIR/Dockerfile"
        exit 1
    fi
    
    print_info "Building image from $SERVICE_DIR"
    
    cd "$SERVICE_DIR"
    
    docker build -t "$ECR_URL:latest" -t "$ECR_URL:$(date +%Y%m%d-%H%M%S)" .
    
    if [ $? -eq 0 ]; then
        print_success "Docker image built successfully"
    else
        print_error "Docker build failed"
        exit 1
    fi
    
    cd - > /dev/null
}

# Push image to ECR
push_image() {
    print_header "Pushing Image to ECR"
    
    print_info "Pushing latest tag..."
    docker push "$ECR_URL:latest"
    
    if [ $? -eq 0 ]; then
        print_success "Image pushed successfully"
    else
        print_error "Failed to push image"
        exit 1
    fi
    
    # Get the timestamped tag
    TIMESTAMP_TAG=$(docker images "$ECR_URL" --format "{{.Tag}}" | grep -E '^[0-9]{8}' | head -n 1)
    
    if [ -n "$TIMESTAMP_TAG" ]; then
        print_info "Pushing timestamped tag: $TIMESTAMP_TAG..."
        docker push "$ECR_URL:$TIMESTAMP_TAG"
    fi
}

# Trigger ECS service update
update_ecs_service() {
    print_header "Updating ECS Service"
    
    ECS_CLUSTER=$(terraform output -raw ecs_cluster_name 2>/dev/null)
    ECS_SERVICE=$(terraform output -raw ecs_service_name 2>/dev/null)
    
    if [ -z "$ECS_CLUSTER" ] || [ -z "$ECS_SERVICE" ]; then
        print_error "ECS cluster or service not found"
        return 1
    fi
    
    print_info "Forcing new deployment of ECS service..."
    
    aws ecs update-service \
        --cluster "$ECS_CLUSTER" \
        --service "$ECS_SERVICE" \
        --force-new-deployment \
        --region "$AWS_REGION" \
        > /dev/null
    
    if [ $? -eq 0 ]; then
        print_success "ECS service update triggered"
        print_info "New tasks will be deployed with the latest image"
        
        # Get ALB URL
        ALB_URL=$(terraform output -raw alb_url 2>/dev/null)
        if [ -n "$ALB_URL" ]; then
            echo ""
            print_success "Application will be available at: $ALB_URL"
            echo ""
            print_info "Wait ~2-3 minutes for new tasks to start and health checks to pass"
        fi
    else
        print_error "Failed to update ECS service"
        return 1
    fi
}

# Show deployment status
check_deployment() {
    print_header "Checking Deployment Status"
    
    ECS_CLUSTER=$(terraform output -raw ecs_cluster_name 2>/dev/null)
    ECS_SERVICE=$(terraform output -raw ecs_service_name 2>/dev/null)
    
    if [ -z "$ECS_CLUSTER" ] || [ -z "$ECS_SERVICE" ]; then
        return
    fi
    
    print_info "Checking ECS service status..."
    
    aws ecs describe-services \
        --cluster "$ECS_CLUSTER" \
        --services "$ECS_SERVICE" \
        --region "$AWS_REGION" \
        --query 'services[0].{RunningCount:runningCount,DesiredCount:desiredCount,Status:status}' \
        --output table
}

# Main script
main() {
    print_header "Build and Push to ECR"
    
    check_prerequisites
    get_ecr_url
    ecr_login
    build_image
    push_image
    
    echo ""
    read -p "Update ECS service with new image? (y/n): " -n 1 -r
    echo
    
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        update_ecs_service
        echo ""
        echo "Waiting 30 seconds before checking status..."
        sleep 30
        check_deployment
    else
        print_info "Skipping ECS service update"
        print_info "To update manually, run:"
        echo "  aws ecs update-service --cluster <cluster> --service <service> --force-new-deployment"
    fi
    
    echo ""
    print_success "Build and push complete!"
    echo ""
    echo "Next steps:"
    echo "1. Wait for ECS tasks to reach RUNNING state"
    echo "2. Check ALB target group health"
    echo "3. Test your application at the ALB URL"
    echo ""
    print_info "Monitor deployment:"
    echo "  aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE"
    echo ""
    print_info "View logs:"
    echo "  aws logs tail /ecs/credlink-production --follow"
}

# Run main function
main
