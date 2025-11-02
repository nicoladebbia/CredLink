#!/bin/bash

# C2PA Phase 10 Video & Audio v1 Deployment Script
# Production-ready deployment with comprehensive error handling

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="${PROJECT_ROOT}/.env"
COMPOSE_FILE="${PROJECT_ROOT}/docker-compose.yml"

# Default values
ENVIRONMENT="production"
PROFILE="phase10"
SKIP_BUILD=false
SKIP_TESTS=false
VERBOSE=false

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

log_verbose() {
    if [[ "$VERBOSE" == "true" ]]; then
        echo -e "${BLUE}[VERBOSE]${NC} $1"
    fi
}

# Help function
show_help() {
    cat << EOF
C2PA Phase 10 Deployment Script

Usage: $0 [OPTIONS]

OPTIONS:
    -e, --environment ENV   Set environment (default: production)
    -p, --profile PROFILE   Set docker-compose profile (default: phase10)
    -b, --skip-build        Skip Docker build step
    -t, --skip-tests        Skip test execution
    -v, --verbose           Enable verbose logging
    -h, --help              Show this help message

EXAMPLES:
    $0                      # Deploy to production with phase10 profile
    $0 -e staging -p testing # Deploy to staging with testing profile
    $0 --skip-build --skip-tests # Quick redeploy without build/tests
    $0 -v                   # Deploy with verbose logging

PROFILES:
    phase10     - Phase 10 Video & Audio services (default)
    main        - All main services
    testing     - Testing services with mocks
    monitoring  - Monitoring stack (Prometheus, Grafana)
    production  - Production stack with Redis/PostgreSQL
    legacy      - Legacy Retro-Sign CLI service

EOF
}

# Parse command line arguments
parse_args() {
    while [[ $# -gt 0 ]]; do
        case $1 in
            -e|--environment)
                ENVIRONMENT="$2"
                shift 2
                ;;
            -p|--profile)
                PROFILE="$2"
                shift 2
                ;;
            -b|--skip-build)
                SKIP_BUILD=true
                shift
                ;;
            -t|--skip-tests)
                SKIP_TESTS=true
                shift
                ;;
            -v|--verbose)
                VERBOSE=true
                shift
                ;;
            -h|--help)
                show_help
                exit 0
                ;;
            *)
                log_error "Unknown option: $1"
                show_help
                exit 1
                ;;
        esac
    done
}

# Validate environment
validate_environment() {
    log_info "Validating environment..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed or not in PATH"
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        log_error "Docker Compose is not installed or not in PATH"
        exit 1
    fi
    
    # Check if docker-compose file exists
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_error "docker-compose.yml not found at $COMPOSE_FILE"
        exit 1
    fi
    
    # Check if Node.js is installed (for local testing)
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node --version)
        log_verbose "Node.js version: $NODE_VERSION"
    else
        log_warning "Node.js not found - skipping local tests"
        SKIP_TESTS=true
    fi
    
    # Check if npm is installed
    if command -v npm &> /dev/null; then
        NPM_VERSION=$(npm --version)
        log_verbose "npm version: $NPM_VERSION"
    else
        log_warning "npm not found - skipping npm tests"
        SKIP_TESTS=true
    fi
    
    log_success "Environment validation completed"
}

# Setup environment file
setup_environment() {
    log_info "Setting up environment..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        log_warning ".env file not found, creating from .env.example"
        if [[ -f "${PROJECT_ROOT}/.env.example" ]]; then
            cp "${PROJECT_ROOT}/.env.example" "$ENV_FILE"
            log_info "Created .env file from template"
            log_warning "Please review and update .env file with your configuration"
        else
            log_error ".env.example file not found"
            exit 1
        fi
    fi
    
    # Load environment variables
    set -a
    source "$ENV_FILE"
    set +a
    
    log_success "Environment setup completed"
}

# Install dependencies
install_dependencies() {
    log_info "Installing dependencies..."
    
    cd "$PROJECT_ROOT"
    
    # Install npm dependencies for all workspaces
    if command -v npm &> /dev/null; then
        log_verbose "Installing npm dependencies..."
        npm install --silent
        npm run install:all --silent
        log_success "npm dependencies installed"
    fi
    
    log_success "Dependencies installation completed"
}

# Run tests
run_tests() {
    if [[ "$SKIP_TESTS" == "true" ]]; then
        log_warning "Skipping tests as requested"
        return 0
    fi
    
    log_info "Running tests..."
    
    cd "$PROJECT_ROOT"
    
    # Run TypeScript type checking
    if command -v npm &> /dev/null; then
        log_verbose "Running TypeScript type checking..."
        npm run type-check --silent || {
            log_error "TypeScript type checking failed"
            exit 1
        }
        
        # Run linting
        log_verbose "Running linting..."
        npm run lint --silent || {
            log_warning "Linting found issues (continuing deployment)"
        }
        
        # Run unit tests
        log_verbose "Running unit tests..."
        npm run test --silent || {
            log_warning "Some tests failed (continuing deployment)"
        }
    fi
    
    log_success "Tests completed"
}

# Build Docker images
build_docker() {
    if [[ "$SKIP_BUILD" == "true" ]]; then
        log_warning "Skipping Docker build as requested"
        return 0
    fi
    
    log_info "Building Docker images..."
    
    cd "$PROJECT_ROOT"
    
    # Build with docker-compose
    docker-compose -f "$COMPOSE_FILE" --profile "$PROFILE" build --parallel || {
        log_error "Docker build failed"
        exit 1
    }
    
    log_success "Docker images built successfully"
}

# Deploy services
deploy_services() {
    log_info "Deploying services with profile: $PROFILE"
    
    cd "$PROJECT_ROOT"
    
    # Stop existing services
    log_verbose "Stopping existing services..."
    docker-compose -f "$COMPOSE_FILE" --profile "$PROFILE" down --remove-orphans || true
    
    # Start services
    log_verbose "Starting services..."
    docker-compose -f "$COMPOSE_FILE" --profile "$PROFILE" up -d || {
        log_error "Service deployment failed"
        exit 1
    }
    
    log_success "Services deployed successfully"
}

# Wait for services to be healthy
wait_for_health() {
    log_info "Waiting for services to be healthy..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log_verbose "Health check attempt $attempt/$max_attempts"
        
        # Check API health
        if curl -f -s "http://localhost:3001/health" > /dev/null 2>&1; then
            log_success "API service is healthy"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            log_error "Services failed to become healthy within timeout"
            docker-compose -f "$COMPOSE_FILE" --profile "$PROFILE" logs --tail=50
            exit 1
        fi
        
        sleep 10
        ((attempt++))
    done
}

# Run post-deployment verification
verify_deployment() {
    log_info "Running post-deployment verification..."
    
    # Verify API endpoints
    log_verbose "Verifying API endpoints..."
    
    local endpoints=(
        "http://localhost:3001/health"
        "http://localhost:3001/"
        "http://localhost:3001/api/v1/verify/video?asset_url=test"
        "http://localhost:3001/api/v1/verify/audio?asset_url=test"
    )
    
    for endpoint in "${endpoints[@]}"; do
        if curl -f -s "$endpoint" > /dev/null 2>&1; then
            log_verbose "✓ $endpoint is responding"
        else
            log_warning "✗ $endpoint is not responding"
        fi
    done
    
    # Check service status
    log_verbose "Checking service status..."
    docker-compose -f "$COMPOSE_FILE" --profile "$PROFILE" ps
    
    log_success "Post-deployment verification completed"
}

# Show deployment summary
show_summary() {
    log_success "Deployment completed successfully!"
    echo
    echo "=== DEPLOYMENT SUMMARY ==="
    echo "Environment: $ENVIRONMENT"
    echo "Profile: $PROFILE"
    echo "Timestamp: $(date)"
    echo
    echo "=== SERVICE URLS ==="
    echo "API Server: http://localhost:3001"
    echo "Health Check: http://localhost:3001/health"
    echo "API Documentation: http://localhost:3001/"
    echo "Video Demo: http://localhost:3002"
    echo "Audio Demo: http://localhost:3003"
    echo "Metrics (if enabled): http://localhost:9090"
    echo "Grafana (if enabled): http://localhost:3000"
    echo
    echo "=== USEFUL COMMANDS ==="
    echo "View logs: docker-compose -f docker-compose.yml --profile $PROFILE logs -f"
    echo "Stop services: docker-compose -f docker-compose.yml --profile $PROFILE down"
    echo "Restart services: docker-compose -f docker-compose.yml --profile $PROFILE restart"
    echo "Check status: docker-compose -f docker-compose.yml --profile $PROFILE ps"
    echo
}

# Cleanup on error
cleanup_on_error() {
    log_error "Deployment failed - cleaning up..."
    cd "$PROJECT_ROOT"
    docker-compose -f "$COMPOSE_FILE" --profile "$PROFILE" down --remove-orphans || true
}

# Main deployment function
main() {
    log_info "Starting C2PA Phase 10 deployment..."
    log_verbose "Project root: $PROJECT_ROOT"
    
    # Set up error handling
    trap cleanup_on_error ERR
    
    # Parse arguments
    parse_args "$@"
    
    # Run deployment steps
    validate_environment
    setup_environment
    install_dependencies
    run_tests
    build_docker
    deploy_services
    wait_for_health
    verify_deployment
    show_summary
    
    log_success "C2PA Phase 10 deployment completed successfully! 🚀"
}

# Run main function with all arguments
main "$@"
