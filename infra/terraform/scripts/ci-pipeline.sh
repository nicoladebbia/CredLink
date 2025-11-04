#!/bin/bash
# CI/CD Pipeline for Terraform Infrastructure
# Phase 45 - Terraform & Infra Blueprints (v1.2)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
ENVIRONMENT="${1:-staging}"
WORKSPACE="envs/${ENVIRONMENT}"
PR_NUMBER="${2:-}"
DRIFT_DETECTION="${DRIFT_DETECTION:-false}"

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${BLUE}[STEP]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    log_step "Checking prerequisites..."
    
    # Check if Terraform is installed
    if ! command -v terraform >/dev/null 2>&1; then
        log_error "Terraform is not installed"
        exit 1
    fi
    
    # Check Terraform version
    local tf_version=$(terraform version -json | jq -r '.terraform_version')
    if [[ "$(printf '%s\n' "1.9.0" "$tf_version" | sort -V | head -n1)" != "1.9.0" ]]; then
        log_error "Terraform version 1.9.0 or higher required, found: $tf_version"
        exit 1
    fi
    
    # Check if workspace exists
    if [ ! -d "$WORKSPACE" ]; then
        log_error "Workspace not found: $WORKSPACE"
        exit 1
    fi
    
    # Check required files
    local required_files=("main.tf" "variables.tf" "outputs.tf")
    for file in "${required_files[@]}"; do
        if [ ! -f "$WORKSPACE/$file" ]; then
            log_error "Required file not found: $WORKSPACE/$file"
            exit 1
        fi
    done
    
    log_info "✓ Prerequisites check passed"
}

# Initialize Terraform
init_terraform() {
    log_step "Initializing Terraform..."
    
    cd "$WORKSPACE"
    
    # Initialize with upgrade and lockfile validation
    terraform init -upgrade -lockfile=readonly
    
    # Validate configuration
    terraform validate
    
    cd ..
    
    log_info "✓ Terraform initialization completed"
}

# Format and lint code
format_and_lint() {
    log_step "Formatting and linting Terraform code..."
    
    # Format all Terraform files
    terraform fmt -recursive
    
    # Check formatting
    if ! terraform fmt -check -recursive; then
        log_error "Terraform files are not properly formatted"
        exit 1
    fi
    
    # Run additional linting if available
    if command -v tflint >/dev/null 2>&1; then
        cd "$WORKSPACE"
        tflint --recursive
        cd ..
    fi
    
    log_info "✓ Code formatting and linting passed"
}

# Security scanning
security_scan() {
    log_step "Running security scan..."
    
    # Run tfsec if available
    if command -v tfsec >/dev/null 2>&1; then
        tfsec "$WORKSPACE" --soft-fail
        log_info "✓ Security scan completed"
    else
        log_warn "tfsec not available, skipping security scan"
    fi
}

# Plan deployment
plan_deployment() {
    log_step "Planning deployment..."
    
    cd "$WORKSPACE"
    
    # Create plan file
    local plan_file="tfplan-$(date +%s).tfplan"
    
    # Run plan with detailed exit code
    terraform plan \
        -detailed-exitcode \
        -var-file="terraform.tfvars" \
        -out="$plan_file"
    
    local exit_code=$?
    
    if [ $exit_code -eq 1 ]; then
        log_error "Terraform plan failed"
        exit 1
    elif [ $exit_code -eq 2 ]; then
        log_warn "Changes detected in plan"
        
        # Show plan summary for PR
        if [ -n "$PR_NUMBER" ]; then
            echo "## Terraform Plan Summary" >> pr-comment.md
            echo '```' >> pr-comment.md
            terraform show "$plan_file" >> pr-comment.md
            echo '```' >> pr-comment.md
        fi
    else
        log_info "No changes detected"
    fi
    
    cd ..
    
    log_info "✓ Deployment planning completed"
}

# Apply deployment
apply_deployment() {
    log_step "Applying deployment..."
    
    cd "$WORKSPACE"
    
    # Find the latest plan file
    local plan_file=$(ls -t tfplan-*.tfplan 2>/dev/null | head -n1)
    
    if [ -z "$plan_file" ]; then
        log_error "No plan file found"
        exit 1
    fi
    
    # Apply the plan
    terraform apply -auto-approve "$plan_file"
    
    cd ..
    
    log_info "✓ Deployment applied successfully"
}

# Run smoke tests
run_smoke_tests() {
    log_step "Running smoke tests..."
    
    # Run the smoke test script
    if ./scripts/smoke-tests.sh "$ENVIRONMENT"; then
        log_info "✓ Smoke tests passed"
    else
        log_error "Smoke tests failed"
        exit 1
    fi
}

# Drift detection
detect_drift() {
    log_step "Detecting drift..."
    
    cd "$WORKSPACE"
    
    # Create drift detection plan
    terraform plan -detailed-exitcode -var-file="terraform.tfvars" -out=drift-plan.tfplan
    
    local exit_code=$?
    
    if [ $exit_code -eq 2 ]; then
        log_error "Drift detected!"
        
        # Show drift details
        terraform show drift-plan.tfplan
        
        # Create drift report
        echo "## Infrastructure Drift Report" > drift-report.md
        echo "**Environment:** $ENVIRONMENT" >> drift-report.md
        echo "**Timestamp:** $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> drift-report.md
        echo "" >> drift-report.md
        echo '```' >> drift-report.md
        terraform show drift-plan.tfplan >> drift-report.md
        echo '```' >> drift-report.md
        
        # Exit with error for CI
        exit 1
    else
        log_info "✓ No drift detected"
    fi
    
    cd ..
}

# Cost estimation
estimate_costs() {
    log_step "Estimating costs..."
    
    # Run infracost if available
    if command -v infracost >/dev/null 2>&1; then
        cd "$WORKSPACE"
        
        # Generate cost breakdown
        infracost breakdown --path=. \
            --format=table \
            --currency=USD
        
        # Generate cost JSON for CI
        if [ -n "$PR_NUMBER" ]; then
            infracost breakdown --path=. \
                --format=json \
                --out=cost-estimate.json
        fi
        
        cd ..
        log_info "✓ Cost estimation completed"
    else
        log_warn "infracost not available, skipping cost estimation"
    fi
}

# Generate outputs
generate_outputs() {
    log_step "Generating outputs..."
    
    cd "$WORKSPACE"
    
    # Generate JSON outputs
    terraform output -json > outputs.json
    
    # Generate human-readable outputs
    terraform output > outputs.txt
    
    # Generate documentation
    if command -v terraform-docs >/dev/null 2>&1; then
        terraform-docs markdown table . > README.md
    fi
    
    cd ..
    
    log_info "✓ Outputs generated"
}

# Cleanup artifacts
cleanup() {
    log_step "Cleaning up artifacts..."
    
    cd "$WORKSPACE"
    
    # Remove plan files (keep latest)
    ls -t tfplan-*.tfplan | tail -n +2 | xargs rm -f
    
    # Remove drift plan
    rm -f drift-plan.tfplan
    
    cd ..
    
    log_info "✓ Cleanup completed"
}

# Main execution
main() {
    log_info "Starting Terraform CI/CD pipeline for environment: $ENVIRONMENT"
    
    # Execute pipeline steps
    check_prerequisites
    init_terraform
    format_and_lint
    security_scan
    
    if [ "$DRIFT_DETECTION" = "true" ]; then
        detect_drift
    else
        estimate_costs
        plan_deployment
        
        # Only apply if not in PR context
        if [ -z "$PR_NUMBER" ]; then
            apply_deployment
            run_smoke_tests
        fi
    fi
    
    generate_outputs
    cleanup
    
    log_info "🎉 Terraform CI/CD pipeline completed successfully"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 <environment> [pr_number]"
        echo ""
        echo "Environment:"
        echo "  demo     - Deploy demo environment"
        echo "  staging  - Deploy staging environment"
        echo "  prod     - Deploy production environment"
        echo ""
        echo "Options:"
        echo "  pr_number - PR number (for plan-only mode)"
        echo ""
        echo "Environment variables:"
        echo "  DRIFT_DETECTION=true - Enable drift detection mode"
        echo ""
        echo "Examples:"
        echo "  $0 staging"
        echo "  $0 staging 123"
        echo "  DRIFT_DETECTION=true $0 staging"
        exit 0
        ;;
    *)
        main "$@"
        ;;
esac
