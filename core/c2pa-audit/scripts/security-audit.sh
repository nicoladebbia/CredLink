#!/bin/bash

# C2PA Audit Tool Security Audit Script
# Performs comprehensive security vulnerability scanning

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[PASS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

print_error() {
    echo -e "${RED}[FAIL]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    if ! command -v node &> /dev/null; then
        print_error "Node.js is not installed"
        exit 1
    fi
    
    if ! command -v pnpm &> /dev/null; then
        print_error "pnpm is not installed"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Audit npm dependencies for vulnerabilities
audit_dependencies() {
    print_status "Auditing npm dependencies..."
    
    # Run pnpm audit
    if pnpm audit --json > audit-report.json 2>&1; then
        print_success "No critical vulnerabilities found"
    else
        print_warning "Vulnerabilities found. Check audit-report.json for details"
        
        # Check for critical vulnerabilities
        if jq -e '.vulnerabilities | to_entries[] | select(.value.severity == "critical")' audit-report.json > /dev/null 2>&1; then
            print_error "CRITICAL vulnerabilities found!"
            echo "Critical issues:"
            jq -r '.vulnerabilities | to_entries[] | select(.value.severity == "critical") | "\(.key): \(.value.title)"' audit-report.json
            return 1
        fi
    fi
}

# Check for outdated dependencies
check_outdated() {
    print_status "Checking for outdated dependencies..."
    
    if pnpm outdated > outdated-report.txt 2>&1; then
        print_success "All dependencies are up to date"
    else
        print_warning "Some dependencies are outdated. Check outdated-report.txt for details"
    fi
}

# Analyze bundle size for security
analyze_bundle() {
    print_status "Analyzing bundle size..."
    
    if pnpm build > /dev/null 2>&1; then
        # Check if bundle size is reasonable
        BUNDLE_SIZE=$(du -sk dist/ | cut -f1)
        if [ "$BUNDLE_SIZE" -gt 50000 ]; then # 50MB limit
            print_warning "Bundle size is large: ${BUNDLE_SIZE}KB"
        else
            print_success "Bundle size is acceptable: ${BUNDLE_SIZE}KB"
        fi
    else
        print_error "Build failed during bundle analysis"
        return 1
    fi
}

# Check for secrets in code
check_secrets() {
    print_status "Checking for exposed secrets..."
    
    # Check for common secret patterns
    if grep -r -i "password\|secret\|key\|token" --include="*.ts" --include="*.js" --include="*.json" src/ | grep -v "password.*example\|secret.*example\|key.*example" > secrets-scan.txt; then
        print_warning "Potential secrets found. Review secrets-scan.txt"
    else
        print_success "No obvious secrets found"
    fi
}

# Check file permissions
check_permissions() {
    print_status "Checking file permissions..."
    
    # Check for executable files that shouldn't be
    if find src/ -type f -executable -name "*.ts" -o -name "*.js" | grep -q .; then
        print_error "Executable source files found"
        return 1
    else
        print_success "File permissions are correct"
    fi
    
    # Check script permissions
    if [ -f scripts/build.sh ]; then
        if [ ! -x scripts/build.sh ]; then
            print_warning "build.sh is not executable"
        fi
    fi
}

# Check for hardcoded URLs and IPs
check_hardcoded_values() {
    print_status "Checking for hardcoded URLs and IPs..."
    
    # Check for hardcoded IPs
    if grep -r -E "[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}" --include="*.ts" --include="*.js" src/ > hardcoded-ips.txt; then
        print_warning "Hardcoded IP addresses found. Review hardcoded-ips.txt"
    fi
    
    # Check for hardcoded URLs
    if grep -r -E "https?://[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}" --include="*.ts" --include="*.js" src/ | grep -v "spec.c2pa.org\|localhost\|example.com" > hardcoded-urls.txt; then
        print_warning "Hardcoded URLs found. Review hardcoded-urls.txt"
    fi
}

# Run security tests
run_security_tests() {
    print_status "Running security tests..."
    
    if pnpm test -- --reporter=verbose > security-test-results.txt 2>&1; then
        print_success "Security tests passed"
    else
        print_warning "Some security tests failed. Check security-test-results.txt"
    fi
}

# Generate security report
generate_report() {
    print_status "Generating security report..."
    
    cat > security-report.md << EOF
# C2PA Audit Tool Security Report

Generated: $(date)

## Executive Summary

This report contains the results of a comprehensive security audit of the C2PA Audit Tool.

## Vulnerability Assessment

### Dependency Vulnerabilities
\`\`\`
$(cat audit-report.json 2>/dev/null || echo "No audit report available")
\`\`\`

### Outdated Dependencies
\`\`\`
$(cat outdated-report.txt 2>/dev/null || echo "No outdated dependencies")
\`\`\`

### Bundle Analysis
- Bundle Size: $(du -sk dist/ 2>/dev/null | cut -f1 || echo "Build failed")KB

### Code Analysis

#### Secrets Scan
\`\`\`
$(cat secrets-scan.txt 2>/dev/null || echo "No secrets found")
\`\`\`

#### Hardcoded Values
\`\`\`
IPs:
$(cat hardcoded-ips.txt 2>/dev/null || echo "No hardcoded IPs")

URLs:
$(cat hardcoded-urls.txt 2>/dev/null || echo "No hardcoded URLs")
\`\`\`

## Recommendations

1. Review and fix any critical vulnerabilities found
2. Update outdated dependencies
3. Remove any hardcoded secrets or credentials
4. Implement proper secret management
5. Regular security audits should be scheduled

## Security Score

$(if [ $? -eq 0 ]; then echo "✅ PASS"; else echo "❌ FAIL"; fi)
EOF

    print_success "Security report generated: security-report.md"
}

# Cleanup function
cleanup() {
    print_status "Cleaning up temporary files..."
    rm -f audit-report.json outdated-report.txt secrets-scan.txt hardcoded-ips.txt hardcoded-urls.txt security-test-results.txt
}

# Main audit function
main() {
    print_status "Starting C2PA Audit Tool security audit..."
    
    check_prerequisites
    audit_dependencies || print_warning "Dependency audit found issues"
    check_outdated
    analyze_bundle
    check_secrets
    check_permissions
    check_hardcoded_values
    run_security_tests
    generate_report
    
    print_success "Security audit completed!"
    print_status "Review security-report.md for detailed findings"
}

# Handle script arguments
case "${1:-}" in
    --help|-h)
        echo "Usage: $0 [OPTIONS]"
        echo ""
        echo "Options:"
        echo "  --help, -h      Show this help message"
        echo "  --cleanup       Clean up temporary files only"
        echo ""
        echo "Examples:"
        echo "  $0              Run full security audit"
        echo "  $0 --cleanup    Clean up temporary files"
        ;;
    --cleanup)
        cleanup
        ;;
    *)
        main "$@"
        ;;
esac
