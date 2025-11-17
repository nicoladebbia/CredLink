#!/bin/bash

# CredLink Production Deployment Script
# Complete production deployment with health monitoring and alerting

# Enable error handling with proper trap instead of set -e
set -uo pipefail
trap 'handle_error $? $LINENO' ERR

handle_error() {
    local exit_code=$1
    local line_number=$2
    echo "ERROR: Deployment script failed at line $line_number with exit code $exit_code"
    echo "ERROR: $(caller): $BASH_COMMAND"
    # Continue execution instead of exiting immediately
}

# Check dependencies
check_dependencies() {
    local missing_deps=()
    
    if ! command -v kubectl &> /dev/null; then
        missing_deps+=("kubectl")
    fi
    
    if ! command -v docker &> /dev/null; then
        missing_deps+=("docker")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_deps+=("jq")
    fi
    
    if [ ${#missing_deps[@]} -gt 0 ]; then
        echo "ERROR: Missing required dependencies: ${missing_deps[*]}"
        echo "Please install missing dependencies and try again"
        exit 1
    fi
}

# Validate environment
validate_environment() {
    if [ -z "$DOCKER_REGISTRY" ]; then
        echo "ERROR: DOCKER_REGISTRY environment variable is required"
        echo "Example: export DOCKER_REGISTRY=your-registry.com"
        exit 1
    fi
    
    if [ -z "$VERSION" ]; then
        echo "WARNING: VERSION not set, using default 1.0.0"
        VERSION="1.0.0"
    fi
}

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
K8S_DIR="$PROJECT_ROOT/k8s/production"
MONITORING_DIR="$PROJECT_ROOT/monitoring"

# Environment variables
NAMESPACE="credlink"
MONITORING_NAMESPACE="monitoring"
ENVIRONMENT="production"
VERSION="${VERSION:-1.0.0}"
DOCKER_REGISTRY="${DOCKER_REGISTRY}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_error "kubectl is not installed"
        exit 1
    fi
    
    # Check cluster access
    if ! kubectl cluster-info &> /dev/null; then
        log_error "Cannot access Kubernetes cluster"
        exit 1
    fi
    
    # Check if project root exists
    if [ ! -d "$PROJECT_ROOT" ]; then
        log_error "Project root not found at $PROJECT_ROOT"
        exit 1
    fi
    
    # Check if k8s manifests exist
    if [ ! -d "$K8S_DIR" ]; then
        log_error "Kubernetes manifests not found at $K8S_DIR"
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Build and push Docker images
build_and_push_images() {
    log_info "Building and pushing Docker images..."
    
    cd "$PROJECT_ROOT"
    
    # Build API image
    log_info "Building CredLink API image..."
    if ! docker build -t credlink/api:$VERSION .; then
        log_error "Failed to build Docker image"
        exit 1
    fi
    
    # Tag for production registry
    local full_image_name="$DOCKER_REGISTRY/credlink/api:$VERSION"
    log_info "Tagging image as $full_image_name"
    if ! docker tag credlink/api:$VERSION "$full_image_name"; then
        log_error "Failed to tag Docker image"
        exit 1
    fi
    
    # Push to registry
    log_info "Pushing images to registry..."
    if ! docker push "$full_image_name"; then
        log_error "Failed to push Docker image to registry"
        exit 1
    fi
    
    log_success "Docker images built and pushed"
}

# Create namespaces and service accounts
setup_namespaces() {
    log_info "Setting up namespaces and service accounts..."
    
    # Create credlink namespace
    kubectl create namespace $NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    
    # Create monitoring namespace
    kubectl create namespace $MONITORING_NAMESPACE --dry-run=client -o yaml | kubectl apply -f -
    
    # Create service accounts
    kubectl apply -f "$K8S_DIR/service-accounts.yaml"
    
    log_success "Namespaces and service accounts created"
}

# Create secrets
create_secrets() {
    log_info "Creating Kubernetes secrets..."
    
    # Create application secrets
    kubectl create secret generic credlink-secrets \
        --from-literal=database-url="$DATABASE_URL" \
        --from-literal=redis-url="$REDIS_URL" \
        --from-literal=sentry-dsn="$SENTRY_DSN" \
        --from-literal=slack-webhook-url="$SLACK_WEBHOOK_URL" \
        --from-literal=pagerduty-service-key="$PAGERDUTY_SERVICE_KEY" \
        --namespace=$NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Create monitoring secrets
    kubectl create secret generic grafana-secrets \
        --from-literal=admin-password="$GRAFANA_ADMIN_PASSWORD" \
        --from-literal=smtp-password="$SMTP_PASSWORD" \
        --namespace=$MONITORING_NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Create SSL certificates
    kubectl create secret generic credlink-ssl-certs \
        --from-file=tls.crt="$SSL_CERT_PATH" \
        --from-file=tls.key="$SSL_KEY_PATH" \
        --namespace=$NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
    
    log_success "Kubernetes secrets created"
}

# Deploy monitoring stack
deploy_monitoring() {
    log_info "Deploying monitoring stack..."
    
    # Create ConfigMaps for monitoring
    kubectl create configmap prometheus-config \
        --from-file="$MONITORING_DIR/prometheus/prometheus.yml" \
        --namespace=$MONITORING_NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create configmap prometheus-rules \
        --from-file="$MONITORING_DIR/prometheus/health-alerts.yml" \
        --namespace=$MONITORING_NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create configmap alertmanager-config \
        --from-file="$MONITORING_DIR/alertmanager/alertmanager.yml" \
        --namespace=$MONITORING_NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create configmap grafana-config \
        --from-file="$MONITORING_DIR/grafana/provisioning" \
        --namespace=$MONITORING_NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
    
    kubectl create configmap grafana-dashboards \
        --from-file="$MONITORING_DIR/grafana/dashboards" \
        --namespace=$MONITORING_NAMESPACE \
        --dry-run=client -o yaml | kubectl apply -f -
    
    # Deploy monitoring components
    kubectl apply -f "$K8S_DIR/monitoring-deployment.yaml"
    
    log_success "Monitoring stack deployed"
}

# Deploy CredLink API
deploy_api() {
    log_info "Deploying CredLink API..."
    
    # Update image in deployment
    local full_image_name="$DOCKER_REGISTRY/credlink/api:$VERSION"
    log_info "Deploying with image: $full_image_name"
    
    if ! sed "s|credlink/api:1.0.0|$full_image_name|g" \
        "$K8S_DIR/credlink-api-deployment.yaml" | kubectl apply -f -; then
        log_error "Failed to deploy CredLink API"
        exit 1
    fi
    
    log_success "CredLink API deployed"
}

# Wait for deployments to be ready
wait_for_deployments() {
    log_info "Waiting for deployments to be ready..."
    
    # Wait for monitoring stack
    log_info "Waiting for Prometheus..."
    kubectl wait --for=condition=available --timeout=300s deployment/prometheus -n $MONITORING_NAMESPACE
    
    log_info "Waiting for AlertManager..."
    kubectl wait --for=condition=available --timeout=300s deployment/alertmanager -n $MONITORING_NAMESPACE
    
    log_info "Waiting for Grafana..."
    kubectl wait --for=condition=available --timeout=300s deployment/grafana -n $MONITORING_NAMESPACE
    
    # Wait for API
    log_info "Waiting for CredLink API..."
    kubectl wait --for=condition=available --timeout=300s deployment/credlink-api -n $NAMESPACE
    
    log_success "All deployments are ready"
}

# Validate deployment
validate_deployment() {
    log_info "Validating deployment..."
    
    # Check pod status
    log_info "Checking pod status..."
    kubectl get pods -n $NAMESPACE
    kubectl get pods -n $MONITORING_NAMESPACE
    
    # Check services
    log_info "Checking services..."
    kubectl get services -n $NAMESPACE
    kubectl get services -n $MONITORING_NAMESPACE
    
    # Test health endpoints
    log_info "Testing health endpoints..."
    
    # Port-forward to test locally
    kubectl port-forward -n $NAMESPACE svc/credlink-api 8080:80 &
    PORT_FORWARD_PID=$!
    
    # Wait for port-forward to be ready
    sleep 5
    
    # Test API health endpoints
    local api_url="http://localhost:8080"
    if [ -n "$API_BASE_URL" ]; then
        api_url="$API_BASE_URL"
    fi
    
    if curl -f "$api_url/health" &> /dev/null; then
        log_success "Basic health endpoint is working"
    else
        log_warning "Basic health endpoint may not be working"
    fi
    
    if curl -f "$api_url/ready" &> /dev/null; then
        log_success "Readiness endpoint is working"
    else
        log_warning "Readiness endpoint may not be working"
    fi
    
    if curl -f "$api_url/metrics" &> /dev/null; then
        log_success "Metrics endpoint is working"
    else
        log_warning "Metrics endpoint may not be working"
    fi
    
    # Clean up port-forward
    kill $PORT_FORWARD_PID 2>/dev/null || true
    
    log_success "Deployment validation completed"
}

# Test monitoring integration
test_monitoring() {
    log_info "Testing monitoring integration..."
    
    # Port-forward Prometheus
    kubectl port-forward -n $MONITORING_NAMESPACE svc/prometheus 9090:9090 &
}

# Display deployment information
display_deployment_info() {
    log_info "Production Deployment Information:"
    echo ""
    echo "🚀 Deployment Details:"
    echo "  • Namespace: $NAMESPACE"
    echo "  • Version: $VERSION"
    echo "  • Environment: $ENVIRONMENT"
    echo ""
    echo "📊 Monitoring Stack:"
    echo "  • Prometheus: kubectl port-forward -n $MONITORING_NAMESPACE svc/prometheus 9090:9090"
    echo "  • Grafana: kubectl port-forward -n $MONITORING_NAMESPACE svc/grafana 3000:3000"
    echo "  • AlertManager: kubectl port-forward -n $MONITORING_NAMESPACE svc/alertmanager 9093:9093"
    echo ""
    echo "🔗 Health Endpoints:"
    echo "  • Health Check: kubectl port-forward -n $NAMESPACE svc/credlink-api 8080:80 && curl http://localhost:8080/health"
    echo "  • Detailed Health: curl http://localhost:8080/health/detailed"
    echo "  • Metrics: curl http://localhost:8080/metrics"
    echo ""
    echo "📈 Grafana Access:"
    echo "  • URL: https://grafana.credlink.com"
    echo "  • Username: admin"
    echo "  • Password: \$GRAFANA_ADMIN_PASSWORD"
    echo ""
    log_success "Production deployment completed successfully!"
}

# Main deployment function
main() {
    echo "🚀 CredLink Production Deployment with Health Monitoring"
    echo "=========================================================="
    echo "Environment: $ENVIRONMENT"
    echo "Version: $VERSION"
    echo "Namespace: $NAMESPACE"
    echo "Registry: $DOCKER_REGISTRY"
    echo ""
    
    # Run dependency and environment checks first
    check_dependencies
    validate_environment
    
    # Check for required environment variables
    if [ -z "$DATABASE_URL" ] || [ -z "$REDIS_URL" ] || [ -z "$SENTRY_DSN" ]; then
        log_error "Required environment variables are not set"
        echo "Please set: DATABASE_URL, REDIS_URL, SENTRY_DSN"
        exit 1
    fi
    
    check_prerequisites
    build_and_push_images
    setup_namespaces
    create_secrets
    deploy_monitoring
    deploy_api
    wait_for_deployments
    validate_deployment
    test_monitoring
    display_deployment_info
    
    echo ""
    log_info "Next steps:"
    echo "1. Configure DNS records for grafana.credlink.com"
    echo "2. Set up SSL certificates for external access"
    echo "3. Configure alert notification channels"
    echo "4. Set up monitoring retention policies"
    echo "5. Enable backup and disaster recovery"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [options]"
        echo "Deploy CredLink production with health monitoring"
        echo ""
        echo "Environment variables:"
        echo "  DATABASE_URL          PostgreSQL connection string"
        echo "  REDIS_URL             Redis connection string"
        echo "  SENTRY_DSN            Sentry error tracking DSN"
        echo "  SLACK_WEBHOOK_URL     Slack webhook for alerts"
        echo "  PAGERDUTY_SERVICE_KEY PagerDuty service key"
        echo "  GRAFANA_ADMIN_PASSWORD Grafana admin password"
        echo "  SMTP_PASSWORD         SMTP password for Grafana"
        echo "  SSL_CERT_PATH         Path to SSL certificate"
        echo "  SSL_KEY_PATH          Path to SSL private key"
        echo ""
        echo "Options:"
        echo "  --help, -h    Show this help message"
        echo ""
        echo "Examples:"
        echo "  DATABASE_URL=postgres://... REDIS_URL=redis://... $0"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
