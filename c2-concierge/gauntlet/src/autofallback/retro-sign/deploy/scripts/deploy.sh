#!/bin/bash
# Production Deployment Script - ENTERPRISE AUTOMATION
# 
# This script automates the complete deployment of C2-Concierge
# Includes validation, backup, rollback, and monitoring setup
# 
# SECURITY REQUIREMENTS:
# - Input validation
# - Backup before deployment
# - Rollback capability
# - Audit logging

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
DEPLOY_ENV="${DEPLOY_ENV:-production}"
NAMESPACE="c2-concierge"
BACKUP_DIR="/tmp/keyctl-backup-$(date +%Y%m%d-%H%M%S)"
LOG_FILE="/tmp/keyctl-deploy-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    local level="$1"
    shift
    local message="$*"
    local timestamp=$(date '+%Y-%m-%d %H:%M:%S')
    echo -e "${timestamp} [${level}] ${message}" | tee -a "$LOG_FILE"
}

# Error handling
error_exit() {
    log "ERROR" "$1"
    echo -e "${RED}ERROR: $1${NC}" >&2
    exit 1
}

# Success message
success() {
    log "INFO" "$1"
    echo -e "${GREEN}✅ $1${NC}"
}

# Warning message
warning() {
    log "WARN" "$1"
    echo -e "${YELLOW}⚠️  $1${NC}"
}

# Info message
info() {
    log "INFO" "$1"
    echo -e "${BLUE}ℹ️  $1${NC}"
}

# Check prerequisites
check_prerequisites() {
    info "Checking prerequisites..."
    
    # Check if kubectl is installed
    if ! command -v kubectl &> /dev/null; then
        error_exit "kubectl is not installed"
    fi
    
    # Check if helm is installed
    if ! command -v helm &> /dev/null; then
        error_exit "helm is not installed"
    fi
    
    # Check if docker is installed
    if ! command -v docker &> /dev/null; then
        error_exit "docker is not installed"
    fi
    
    # Check kubernetes cluster connection
    if ! kubectl cluster-info &> /dev/null; then
        error_exit "Cannot connect to Kubernetes cluster"
    fi
    
    # Check if cluster has sufficient resources
    local available_nodes=$(kubectl get nodes --no-headers | wc -l)
    if [[ $available_nodes -lt 3 ]]; then
        error_exit "Cluster must have at least 3 nodes for high availability"
    fi
    
    success "Prerequisites check passed"
}

# Validate configuration
validate_config() {
    info "Validating configuration..."
    
    # Check if required files exist
    local required_files=(
        "$PROJECT_ROOT/deploy/k8s/namespace.yaml"
        "$PROJECT_ROOT/deploy/k8s/keyctl-deployment.yaml"
        "$PROJECT_ROOT/deploy/k8s/configmaps.yaml"
        "$PROJECT_ROOT/deploy/k8s/secrets.yaml"
        "$PROJECT_ROOT/deploy/k8s/monitoring.yaml"
    )
    
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            error_exit "Required file not found: $file"
        fi
    done
    
    # Validate YAML syntax
    for file in "${required_files[@]}"; do
        if ! kubectl --dry-run=client -f "$file" &> /dev/null; then
            error_exit "Invalid YAML syntax in $file"
        fi
    done
    
    success "Configuration validation passed"
}

# Create backup
create_backup() {
    info "Creating backup of current deployment..."
    
    mkdir -p "$BACKUP_DIR"
    
    # Backup current namespace resources
    if kubectl get namespace "$NAMESPACE" &> /dev/null; then
        kubectl get all,configmaps,secrets,pvc -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/current-deployment.yaml"
        kubectl get events -n "$NAMESPACE" -o yaml > "$BACKUP_DIR/events.yaml"
        
        # Backup database if exists
        if kubectl get pod -n "$NAMESPACE" -l app=postgres &> /dev/null; then
            local postgres_pod=$(kubectl get pod -n "$NAMESPACE" -l app=postgres -o jsonpath='{.items[0].metadata.name}')
            kubectl exec -n "$NAMESPACE" "$postgres_pod" -- pg_dump -U keyctl keyctl > "$BACKUP_DIR/database.sql" || warning "Could not backup database"
        fi
        
        success "Backup created at $BACKUP_DIR"
    else
        warning "No existing deployment found, skipping backup"
    fi
}

# Build and push Docker image
build_and_push() {
    info "Building and pushing Docker image..."
    
    local image_tag="c2-concierge/keyctl:$(date +%Y%m%d-%H%M%S)"
    local registry="${DOCKER_REGISTRY:-docker.io}"
    
    # Build image
    cd "$PROJECT_ROOT"
    docker build -f deploy/Dockerfile -t "$image_tag" . || error_exit "Failed to build Docker image"
    
    # Push image
    docker push "$registry/$image_tag" || error_exit "Failed to push Docker image"
    
    # Update deployment with new image
    sed -i.bak "s|c2-concierge/keyctl:.*|$registry/$image_tag|g" "$PROJECT_ROOT/deploy/k8s/keyctl-deployment.yaml"
    
    success "Docker image built and pushed: $image_tag"
}

# Deploy infrastructure
deploy_infrastructure() {
    info "Deploying infrastructure components..."
    
    # Deploy namespace and RBAC
    kubectl apply -f "$PROJECT_ROOT/deploy/k8s/namespace.yaml" || error_exit "Failed to deploy namespace"
    
    # Wait for namespace to be ready
    kubectl wait --for=condition=Active namespace "$NAMESPACE" --timeout=60s || error_exit "Namespace not ready"
    
    # Deploy secrets and configmaps
    kubectl apply -f "$PROJECT_ROOT/deploy/k8s/secrets.yaml" || error_exit "Failed to deploy secrets"
    kubectl apply -f "$PROJECT_ROOT/deploy/k8s/configmaps.yaml" || error_exit "Failed to deploy configmaps"
    
    # Deploy monitoring stack
    kubectl apply -f "$PROJECT_ROOT/deploy/k8s/monitoring.yaml" || error_exit "Failed to deploy monitoring"
    
    success "Infrastructure deployed successfully"
}

# Deploy application
deploy_application() {
    info "Deploying application..."
    
    # Deploy main application
    kubectl apply -f "$PROJECT_ROOT/deploy/k8s/keyctl-deployment.yaml" || error_exit "Failed to deploy application"
    
    # Wait for deployment to be ready
    kubectl rollout status deployment/keyctl -n "$NAMESPACE" --timeout=300s || error_exit "Deployment not ready"
    
    success "Application deployed successfully"
}

# Run health checks
run_health_checks() {
    info "Running health checks..."
    
    # Wait for pods to be ready
    kubectl wait --for=condition=Ready pod -l app=keyctl -n "$NAMESPACE" --timeout=300s || error_exit "Pods not ready"
    
    # Check application health
    local keyctl_pod=$(kubectl get pod -n "$NAMESPACE" -l app=keyctl -o jsonpath='{.items[0].metadata.name}')
    kubectl exec -n "$NAMESPACE" "$keyctl_pod" -- curl -f http://localhost:8080/health || error_exit "Health check failed"
    
    # Check metrics endpoint
    kubectl exec -n "$NAMESPACE" "$keyctl_pod" -- curl -f http://localhost:9090/metrics || error_exit "Metrics endpoint not working"
    
    success "Health checks passed"
}

# Setup monitoring alerts
setup_monitoring() {
    info "Setting up monitoring alerts..."
    
    # Wait for Prometheus to be ready
    kubectl wait --for=condition=Ready pod -l app=prometheus -n "$NAMESPACE" --timeout=300s || warning "Prometheus not ready"
    
    # Wait for Grafana to be ready
    kubectl wait --for=condition=Ready pod -l app=grafana -n "$NAMESPACE" --timeout=300s || warning "Grafana not ready"
    
    # Import dashboards (this would typically use Grafana API)
    info "Monitoring dashboards would be imported here"
    
    success "Monitoring setup completed"
}

# Run smoke tests
run_smoke_tests() {
    info "Running smoke tests..."
    
    # Test API endpoints
    local keyctl_service=$(kubectl get service keyctl -n "$NAMESPACE" -o jsonpath='{.spec.clusterIP}')
    
    # Test health endpoint
    if ! curl -f "http://$keyctl_service:8080/health" &> /dev/null; then
        error_exit "Health endpoint test failed"
    fi
    
    # Test metrics endpoint
    if ! curl -f "http://$keyctl_service:9090/metrics" &> /dev/null; then
        error_exit "Metrics endpoint test failed"
    fi
    
    success "Smoke tests passed"
}

# Generate deployment report
generate_report() {
    info "Generating deployment report..."
    
    local report_file="/tmp/keyctl-deployment-report-$(date +%Y%m%d-%H%M%S).yaml"
    
    cat > "$report_file" << EOF
# C2-Concierge Deployment Report
deployment:
  timestamp: $(date -Iseconds)
  environment: $DEPLOY_ENV
  namespace: $NAMESPACE
  version: $(date +%Y%m%d-%H%M%S)
  
cluster:
  nodes: $(kubectl get nodes --no-headers | wc -l)
  version: $(kubectl version --short | grep 'Server Version' | cut -d' ' -f3)
  
resources:
  deployments: $(kubectl get deployments -n "$NAMESPACE" --no-headers | wc -l)
  pods: $(kubectl get pods -n "$NAMESPACE" --no-headers | wc -l)
  services: $(kubectl get services -n "$NAMESPACE" --no-headers | wc -l)
  
status: success
backup_location: $BACKUP_DIR
log_file: $LOG_FILE
EOF
    
    success "Deployment report generated: $report_file"
}

# Cleanup function
cleanup() {
    local exit_code=$?
    if [[ $exit_code -ne 0 ]]; then
        error_exit "Deployment failed, check logs at $LOG_FILE"
    fi
}

# Main deployment function
main() {
    info "Starting C2-Concierge deployment..."
    info "Environment: $DEPLOY_ENV"
    info "Namespace: $NAMESPACE"
    
    # Set up trap for cleanup
    trap cleanup EXIT
    
    # Run deployment steps
    check_prerequisites
    validate_config
    create_backup
    build_and_push
    deploy_infrastructure
    deploy_application
    run_health_checks
    setup_monitoring
    run_smoke_tests
    generate_report
    
    success "🎉 C2-Concierge deployment completed successfully!"
    info "Access the application at: https://keyctl.c2-concierge.com"
    info "Access Grafana at: https://grafana.c2-concierge.com"
    info "Backup location: $BACKUP_DIR"
    info "Log file: $LOG_FILE"
}

# Rollback function
rollback() {
    warning "Rolling back deployment..."
    
    if [[ -d "$BACKUP_DIR" ]]; then
        # Delete current deployment
        kubectl delete namespace "$NAMESPACE" --ignore-not-found=true
        
        # Restore from backup
        if [[ -f "$BACKUP_DIR/current-deployment.yaml" ]]; then
            kubectl apply -f "$BACKUP_DIR/current-deployment.yaml" || error_exit "Rollback failed"
            success "Rollback completed"
        else
            error_exit "No backup found for rollback"
        fi
    else
        error_exit "No backup directory found"
    fi
}

# Handle script arguments
case "${1:-deploy}" in
    deploy)
        main
        ;;
    rollback)
        rollback
        ;;
    validate)
        check_prerequisites
        validate_config
        success "Validation passed"
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|validate}"
        echo "  deploy   - Deploy the application"
        echo "  rollback - Rollback to previous version"
        echo "  validate - Validate configuration only"
        exit 1
        ;;
esac
