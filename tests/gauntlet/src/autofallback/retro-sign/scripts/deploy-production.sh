#!/bin/bash

# Production deployment script for C2 Concierge Retro-Sign
# This script handles zero-downtime deployments with proper health checks

set -euo pipefail

# Configuration
PROJECT_NAME="c2c-retro-sign"
DOCKER_REGISTRY="your-registry.com"
IMAGE_TAG="${IMAGE_TAG:-latest}"
ENVIRONMENT="${ENVIRONMENT:-production}"
BACKUP_ENABLED="${BACKUP_ENABLED:-true}"
HEALTH_CHECK_TIMEOUT="${HEALTH_CHECK_TIMEOUT:-300}"
ROLLBACK_ENABLED="${ROLLBACK_ENABLED:-true}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] SUCCESS:${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')] WARNING:${NC} $1"
}

log_error() {
    echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')] ERROR:${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed"
        exit 1
    fi
    
    # Check kubectl if using Kubernetes
    if [[ "${USE_KUBERNETES:-false}" == "true" ]]; then
        if ! command -v kubectl &> /dev/null; then
            log_error "kubectl is not installed"
            exit 1
        fi
    fi
    
    # Check environment variables
    local required_vars=("AWS_REGION" "AWS_ACCESS_KEY_ID" "AWS_SECRET_ACCESS_KEY" "AWS_S3_BUCKET")
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Environment variable $var is not set"
            exit 1
        fi
    done
    
    log_success "Prerequisites check passed"
}

# Create backup before deployment
create_backup() {
    if [[ "$BACKUP_ENABLED" != "true" ]]; then
        log "Backup is disabled, skipping..."
        return 0
    fi
    
    log "Creating backup before deployment..."
    
    # Create application backup
    if docker-compose exec -T c2c-retro-sign /app/c2c backup create --description "Pre-deployment backup $(date)"; then
        log_success "Application backup created successfully"
    else
        log_error "Failed to create application backup"
        if [[ "$ROLLBACK_ENABLED" == "true" ]]; then
            log_warning "Continuing with deployment (rollback available)"
        else
            exit 1
        fi
    fi
    
    # Create database backup
    if docker-compose exec -T c2c-retro-sign /app/c2c db backup; then
        log_success "Database backup created successfully"
    else
        log_error "Failed to create database backup"
        if [[ "$ROLLBACK_ENABLED" == "true" ]]; then
            log_warning "Continuing with deployment (rollback available)"
        else
            exit 1
        fi
    fi
}

# Build and push Docker image
build_and_push() {
    log "Building Docker image..."
    
    # Build image
    if docker build -t "${PROJECT_NAME}:${IMAGE_TAG}" .; then
        log_success "Docker image built successfully"
    else
        log_error "Failed to build Docker image"
        exit 1
    fi
    
    # Tag for registry
    if docker tag "${PROJECT_NAME}:${IMAGE_TAG}" "${DOCKER_REGISTRY}/${PROJECT_NAME}:${IMAGE_TAG}"; then
        log_success "Docker image tagged for registry"
    else
        log_error "Failed to tag Docker image"
        exit 1
    fi
    
    # Push to registry
    if docker push "${DOCKER_REGISTRY}/${PROJECT_NAME}:${IMAGE_TAG}"; then
        log_success "Docker image pushed to registry"
    else
        log_error "Failed to push Docker image"
        exit 1
    fi
}

# Deploy application
deploy_application() {
    log "Deploying application..."
    
    # Update Docker Compose file with new image tag
    sed -i.bak "s|image: ${PROJECT_NAME}:.*|image: ${DOCKER_REGISTRY}/${PROJECT_NAME}:${IMAGE_TAG}|g" docker-compose.prod.yml
    
    # Pull new images
    if docker-compose -f docker-compose.prod.yml pull; then
        log_success "New images pulled successfully"
    else
        log_error "Failed to pull new images"
        # Restore backup of compose file
        mv docker-compose.prod.yml.bak docker-compose.prod.yml
        exit 1
    fi
    
    # Deploy with zero downtime
    if [[ "${USE_KUBERNETES:-false}" == "true" ]]; then
        deploy_kubernetes
    else
        deploy_docker_compose
    fi
}

# Deploy with Docker Compose
deploy_docker_compose() {
    log "Deploying with Docker Compose..."
    
    # Scale up new containers
    if docker-compose -f docker-compose.prod.yml up -d --scale c2c-retro-sign=2; then
        log_success "New containers started"
    else
        log_error "Failed to start new containers"
        rollback_deployment
        exit 1
    fi
    
    # Wait for health checks
    wait_for_health_checks
    
    # Scale down old containers
    if docker-compose -f docker-compose.prod.yml up -d --scale c2c-retro-sign=1; then
        log_success "Deployment completed successfully"
    else
        log_error "Failed to scale down old containers"
        rollback_deployment
        exit 1
    fi
}

# Deploy with Kubernetes
deploy_kubernetes() {
    log "Deploying with Kubernetes..."
    
    # Apply new deployment
    if kubectl apply -f k8s/; then
        log_success "Kubernetes deployment applied"
    else
        log_error "Failed to apply Kubernetes deployment"
        rollback_deployment
        exit 1
    fi
    
    # Wait for rollout
    if kubectl rollout status deployment/${PROJECT_NAME} --timeout=${HEALTH_CHECK_TIMEOUT}s; then
        log_success "Kubernetes rollout completed"
    else
        log_error "Kubernetes rollout failed"
        rollback_deployment
        exit 1
    fi
}

# Wait for health checks
wait_for_health_checks() {
    log "Waiting for health checks..."
    
    local start_time=$(date +%s)
    local end_time=$((start_time + HEALTH_CHECK_TIMEOUT))
    
    while [[ $(date +%s) -lt $end_time ]]; do
        if curl -f http://localhost:9090/health > /dev/null 2>&1; then
            log_success "Health checks passed"
            return 0
        fi
        
        log "Waiting for application to be healthy..."
        sleep 10
    done
    
    log_error "Health checks timed out after ${HEALTH_CHECK_TIMEOUT} seconds"
    rollback_deployment
    exit 1
}

# Run post-deployment tests
run_post_deployment_tests() {
    log "Running post-deployment tests..."
    
    # Test API endpoints
    local endpoints=(
        "http://localhost:9090/health"
        "http://localhost:8080/metrics"
    )
    
    for endpoint in "${endpoints[@]}"; do
        if curl -f "$endpoint" > /dev/null 2>&1; then
            log_success "Endpoint $endpoint is healthy"
        else
            log_error "Endpoint $endpoint is not responding"
            rollback_deployment
            exit 1
        fi
    done
    
    # Test authentication
    if curl -f -X POST http://localhost:8080/api/auth/login \
         -H "Content-Type: application/json" \
         -d '{"username":"test","password":"test"}' > /dev/null 2>&1; then
        log_success "Authentication endpoint is working"
    else
        log_warning "Authentication test failed (may be expected in production)"
    fi
    
    log_success "Post-deployment tests passed"
}

# Rollback deployment
rollback_deployment() {
    if [[ "$ROLLBACK_ENABLED" != "true" ]]; then
        log_error "Rollback is disabled, deployment failed"
        exit 1
    fi
    
    log_warning "Rolling back deployment..."
    
    # Restore previous Docker Compose file
    if [[ -f docker-compose.prod.yml.bak ]]; then
        mv docker-compose.prod.yml.bak docker-compose.prod.yml
    fi
    
    # Restart with previous configuration
    if docker-compose -f docker-compose.prod.yml up -d; then
        log_success "Rollback completed"
    else
        log_error "Rollback failed - manual intervention required"
        exit 1
    fi
}

# Cleanup
cleanup() {
    log "Cleaning up..."
    
    # Remove backup files
    rm -f docker-compose.prod.yml.bak
    
    # Remove unused Docker images
    if docker image prune -f; then
        log_success "Docker cleanup completed"
    else
        log_warning "Docker cleanup failed"
    fi
}

# Main deployment flow
main() {
    log "Starting production deployment for ${PROJECT_NAME}..."
    
    # Check prerequisites
    check_prerequisites
    
    # Create backup
    create_backup
    
    # Build and push image
    build_and_push
    
    # Deploy application
    deploy_application
    
    # Run post-deployment tests
    run_post_deployment_tests
    
    # Cleanup
    cleanup
    
    log_success "Production deployment completed successfully!"
}

# Handle script interruption
trap 'log_error "Deployment interrupted"; rollback_deployment; exit 1' INT TERM

# Run main function
main "$@"
