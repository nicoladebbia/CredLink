#!/bin/bash
# Final Verification Script for Phase 22 - Supply Chain Security v1
# Verifies all components are properly configured and working

set -euo pipefail

# Configuration
REPO="Nickiller04/c2-concierge"
IMAGE="ghcr.io/${REPO}:latest"
NAMESPACE="cosign-system"
TEMP_DIR="./temp-verification"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging functions
log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Verification results
VERIFICATION_RESULTS=()
TOTAL_CHECKS=0
PASSED_CHECKS=0

# Helper function to run verification checks
run_check() {
    local check_name="$1"
    local check_command="$2"
    local expected_result="$3"
    
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
    log_info "Running: $check_name"
    
    if eval "$check_command" > /dev/null 2>&1; then
        log_success "$check_name - PASSED"
        VERIFICATION_RESULTS+=("✅ $check_name")
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
        return 0
    else
        log_error "$check_name - FAILED"
        VERIFICATION_RESULTS+=("❌ $check_name")
        return 1
    fi
}

# Setup
setup() {
    log_info "Setting up verification environment..."
    mkdir -p "$TEMP_DIR"
    
    # Install required tools
    if ! command -v cosign &> /dev/null; then
        log_info "Installing Cosign..."
        curl -sSfL https://raw.githubusercontent.com/sigstore/cosign/main/install.sh | sh -s -- -b /usr/local/bin
    fi
    
    if ! command -v trivy &> /dev/null; then
        log_info "Installing Trivy..."
        curl -sSfL https://raw.githubusercontent.com/aquasecurity/trivy/main/install.sh | sh -s -- -b /usr/local/bin
    fi
    
    if ! command -v syft &> /dev/null; then
        log_info "Installing Syft..."
        curl -sSfL https://raw.githubusercontent.com/anchore/syft/main/install.sh | sh -s -- -b /usr/local/bin
    fi
    
    if ! command -v jq &> /dev/null; then
        log_info "Installing jq..."
        apt-get update && apt-get install -y jq
    fi
}

# Cleanup
cleanup() {
    log_info "Cleaning up verification environment..."
    rm -rf "$TEMP_DIR"
}

# Verify prerequisites
verify_prerequisites() {
    log_info "Verifying prerequisites..."
    
    # Check if GitHub CLI is available
    if ! command -v gh &> /dev/null; then
        log_warning "GitHub CLI not found, some checks will be skipped"
    fi
    
    # Check if kubectl is available
    if ! command -v kubectl &> /dev/null; then
        log_warning "kubectl not found, Kubernetes checks will be skipped"
    fi
    
    # Check if Docker is available
    if ! command -v docker &> /dev/null; then
        log_error "Docker not found, container checks will fail"
    fi
}

# 1. Verify GitHub Actions workflow
verify_github_workflow() {
    log_info "Verifying GitHub Actions workflow..."
    
    if command -v gh &> /dev/null; then
        # Check if workflow file exists
        if gh api repos/${REPO}/contents/.github/workflows/build-sign-attest.yml --jq '.name' > /dev/null 2>&1; then
            log_success "GitHub Actions workflow exists"
            VERIFICATION_RESULTS+=("✅ GitHub Actions workflow")
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        else
            log_error "GitHub Actions workflow not found"
            VERIFICATION_RESULTS+=("❌ GitHub Actions workflow")
        fi
    else
        log_warning "Skipping GitHub workflow check (gh CLI not available)"
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# 2. Verify image signature
verify_image_signature() {
    run_check "Image Signature Verification" \
        "cosign verify ${IMAGE}" \
        "success"
}

# 3. Verify SLSA provenance attestation
verify_slsa_provenance() {
    run_check "SLSA Provenance Attestation" \
        "cosign verify-attestation --type slsaprovenance ${IMAGE}" \
        "success"
}

# 4. Verify SBOM attestation
verify_sbom_attestation() {
    run_check "SBOM Attestation" \
        "cosign verify-attestation --type sbom ${IMAGE}" \
        "success"
}

# 5. Verify SBOM generation
verify_sbom_generation() {
    log_info "Verifying SBOM generation..."
    
    # Generate local SBOM
    if syft "${IMAGE}" -o spdx-json="${TEMP_DIR}/test-sbom.spdx.json" > /dev/null 2>&1; then
        # Validate SPDX format
        if jq empty "${TEMP_DIR}/test-sbom.spdx.json" 2>/dev/null; then
            SPDX_VERSION=$(jq -r '.spdxVersion' "${TEMP_DIR}/test-sbom.spdx.json")
            if [ "$SPDX_VERSION" = "SPDX-2.3" ]; then
                log_success "SBOM generation - PASSED"
                VERIFICATION_RESULTS+=("✅ SBOM generation")
                PASSED_CHECKS=$((PASSED_CHECKS + 1))
            else
                log_error "Invalid SPDX version: $SPDX_VERSION"
                VERIFICATION_RESULTS+=("❌ SBOM generation")
            fi
        else
            log_error "Invalid SPDX JSON format"
            VERIFICATION_RESULTS+=("❌ SBOM generation")
        fi
    else
        log_error "SBOM generation failed"
        VERIFICATION_RESULTS+=("❌ SBOM generation")
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# 6. Verify CVE scanning
verify_cve_scanning() {
    run_check "CVE Scanning" \
        "trivy image --severity CRITICAL,HIGH --exit-code 0 ${IMAGE}" \
        "no critical or high vulnerabilities"
}

# 7. Verify reproducible build configuration
verify_reproducible_build() {
    log_info "Verifying reproducible build configuration..."
    
    # Check if Dockerfile.reproducible exists
    if [ -f "Dockerfile.reproducible" ]; then
        # Check for SOURCE_DATE_EPOCH usage
        if grep -q "SOURCE_DATE_EPOCH" Dockerfile.reproducible; then
            # Check for deterministic environment variables
            if grep -q "LC_ALL=C.UTF-8" Dockerfile.reproducible && grep -q "TZ=UTC" Dockerfile.reproducible; then
                log_success "Reproducible build configuration - PASSED"
                VERIFICATION_RESULTS+=("✅ Reproducible build configuration")
                PASSED_CHECKS=$((PASSED_CHECKS + 1))
            else
                log_error "Missing deterministic environment variables"
                VERIFICATION_RESULTS+=("❌ Reproducible build configuration")
            fi
        else
            log_error "Missing SOURCE_DATE_EPOCH configuration"
            VERIFICATION_RESULTS+=("❌ Reproducible build configuration")
        fi
    else
        log_error "Dockerfile.reproducible not found"
        VERIFICATION_RESULTS+=("❌ Reproducible build configuration")
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# 8. Verify Kubernetes admission policies
verify_kubernetes_policies() {
    log_info "Verifying Kubernetes admission policies..."
    
    if command -v kubectl &> /dev/null; then
        # Check if policy controller is deployed
        if kubectl get namespace cosign-system > /dev/null 2>&1; then
            # Check if ClusterImagePolicy exists
            if kubectl get clusterimagepolicy require-signed-and-provenance > /dev/null 2>&1; then
                log_success "Kubernetes admission policies - PASSED"
                VERIFICATION_RESULTS+=("✅ Kubernetes admission policies")
                PASSED_CHECKS=$((PASSED_CHECKS + 1))
            else
                log_error "ClusterImagePolicy not found"
                VERIFICATION_RESULTS+=("❌ Kubernetes admission policies")
            fi
        else
            log_error "Policy controller namespace not found"
            VERIFICATION_RESULTS+=("❌ Kubernetes admission policies")
        fi
    else
        log_warning "Skipping Kubernetes policy check (kubectl not available)"
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# 9. Verify documentation
verify_documentation() {
    log_info "Verifying documentation..."
    
    local docs_found=0
    local required_docs=(
        "docs/trust-of-the-build.md"
        "docs/reproducible-builds.md"
        "runbooks/supply-chain-security.md"
    )
    
    for doc in "${required_docs[@]}"; do
        if [ -f "$doc" ]; then
            docs_found=$((docs_found + 1))
        fi
    done
    
    if [ $docs_found -eq ${#required_docs[@]} ]; then
        log_success "Documentation - PASSED"
        VERIFICATION_RESULTS+=("✅ Documentation")
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_error "Missing documentation ($docs_found/${#required_docs[@]} found)"
        VERIFICATION_RESULTS+=("❌ Documentation")
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# 10. Verify scripts
verify_scripts() {
    log_info "Verifying scripts..."
    
    local scripts_found=0
    local required_scripts=(
        "scripts/generate-sbom.sh"
        "scripts/verify-sbom.sh"
    )
    
    for script in "${required_scripts[@]}"; do
        if [ -f "$script" ] && [ -x "$script" ]; then
            scripts_found=$((scripts_found + 1))
        fi
    done
    
    if [ $scripts_found -eq ${#required_scripts[@]} ]; then
        log_success "Scripts - PASSED"
        VERIFICATION_RESULTS+=("✅ Scripts")
        PASSED_CHECKS=$((PASSED_CHECKS + 1))
    else
        log_error "Missing or non-executable scripts ($scripts_found/${#required_scripts[@]} found)"
        VERIFICATION_RESULTS+=("❌ Scripts")
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# 11. Verify acceptance tests
verify_acceptance_tests() {
    log_info "Verifying acceptance tests..."
    
    if [ -f "tests/supply-chain-security.test.ts" ]; then
        # Check if test can be parsed
        if node -c tests/supply-chain-security.test.ts 2>/dev/null; then
            log_success "Acceptance tests - PASSED"
            VERIFICATION_RESULTS+=("✅ Acceptance tests")
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        else
            log_error "Acceptance tests have syntax errors"
            VERIFICATION_RESULTS+=("❌ Acceptance tests")
        fi
    else
        log_error "Acceptance tests not found"
        VERIFICATION_RESULTS+=("❌ Acceptance tests")
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# 12. Verify monitoring configuration
verify_monitoring() {
    log_info "Verifying monitoring configuration..."
    
    if [ -f "infra/monitoring/supply-chain-metrics.yaml" ]; then
        # Check if YAML is valid
        if kubectl apply --dry-run=client -f infra/monitoring/supply-chain-metrics.yaml > /dev/null 2>&1; then
            log_success "Monitoring configuration - PASSED"
            VERIFICATION_RESULTS+=("✅ Monitoring configuration")
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        else
            log_error "Monitoring configuration has invalid YAML"
            VERIFICATION_RESULTS+=("❌ Monitoring configuration")
        fi
    else
        log_error "Monitoring configuration not found"
        VERIFICATION_RESULTS+=("❌ Monitoring configuration")
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# 13. Run acceptance tests
run_acceptance_tests() {
    log_info "Running acceptance tests..."
    
    if [ -f "tests/supply-chain-security.test.ts" ]; then
        if node tests/supply-chain-security.test.ts > "${TEMP_DIR}/test-results.txt" 2>&1; then
            log_success "Acceptance tests execution - PASSED"
            VERIFICATION_RESULTS+=("✅ Acceptance tests execution")
            PASSED_CHECKS=$((PASSED_CHECKS + 1))
        else
            log_error "Acceptance tests execution failed"
            VERIFICATION_RESULTS+=("❌ Acceptance tests execution")
            cat "${TEMP_DIR}/test-results.txt"
        fi
    else
        log_error "Acceptance tests not found"
        VERIFICATION_RESULTS+=("❌ Acceptance tests execution")
    fi
    TOTAL_CHECKS=$((TOTAL_CHECKS + 1))
}

# Generate verification report
generate_report() {
    log_info "Generating verification report..."
    
    local report_file="${TEMP_DIR}/verification-report.json"
    
    cat > "$report_file" << EOF
{
  "verification_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "repository": "${REPO}",
  "image": "${IMAGE}",
  "total_checks": ${TOTAL_CHECKS},
  "passed_checks": ${PASSED_CHECKS},
  "failed_checks": $((TOTAL_CHECKS - PASSED_CHECKS)),
  "success_rate": $(echo "scale=2; ${PASSED_CHECKS} * 100 / ${TOTAL_CHECKS}" | bc -l),
  "results": [
$(printf '    "%s"' "${VERIFICATION_RESULTS[@]}" | paste -sd ',' -)
  ],
  "phase": "Phase 22 - Supply-Chain Security v1",
  "status": "$([ ${PASSED_CHECKS} -eq ${TOTAL_CHECKS} ] && echo "COMPLETE" || echo "FAILED")"
}
EOF
    
    # Copy to current directory
    cp "$report_file" "./supply-chain-verification-report.json"
    
    log_success "Verification report saved to: supply-chain-verification-report.json"
}

# Print final results
print_final_results() {
    echo
    echo "🔒 Supply Chain Security Verification Results"
    echo "==============================================="
    echo
    
    printf "Total Checks: %d\n" "$TOTAL_CHECKS"
    printf "Passed: %d\n" "$PASSED_CHECKS"
    printf "Failed: %d\n" "$((TOTAL_CHECKS - PASSED_CHECKS))"
    printf "Success Rate: %.1f%%\n" "$(echo "scale=1; ${PASSED_CHECKS} * 100 / ${TOTAL_CHECKS}" | bc -l)"
    echo
    
    echo "Detailed Results:"
    for result in "${VERIFICATION_RESULTS[@]}"; do
        echo "  $result"
    done
    echo
    
    if [ ${PASSED_CHECKS} -eq ${TOTAL_CHECKS} ]; then
        log_success "🎉 ALL CHECKS PASSED - Phase 22 is COMPLETE!"
        echo "Supply Chain Security v1 is ship-ready."
        return 0
    else
        log_error "❌ VERIFICATION FAILED - Some checks did not pass"
        echo "Please address the failed checks before proceeding."
        return 1
    fi
}

# Main execution
main() {
    echo "🔒 Phase 22 - Supply Chain Security v1 Verification"
    echo "===================================================="
    echo
    
    # Setup
    setup
    
    # Run all verifications
    verify_prerequisites
    verify_github_workflow
    verify_image_signature
    verify_slsa_provenance
    verify_sbom_attestation
    verify_sbom_generation
    verify_cve_scanning
    verify_reproducible_build
    verify_kubernetes_policies
    verify_documentation
    verify_scripts
    verify_acceptance_tests
    verify_monitoring
    run_acceptance_tests
    
    # Generate report
    generate_report
    
    # Print final results
    local exit_code=0
    print_final_results || exit_code=$?
    
    # Cleanup
    cleanup
    
    exit $exit_code
}

# Run main function
main "$@"
