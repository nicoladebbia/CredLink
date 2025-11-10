#!/bin/bash

# Phase 35 Public Survival Leaderboard - Build Script
# Production build with maximum security and optimization

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
BUILD_DIR="$PROJECT_ROOT/dist"
ARTIFACTS_DIR="$PROJECT_ROOT/artifacts"
LOG_FILE="$PROJECT_ROOT/build.log"

# Build settings
NODE_ENV=${NODE_ENV:-production}
BUILD_TARGET=${BUILD_TARGET:-node18}
MINIFY=${MINIFY:-true}
SOURCE_MAPS=${SOURCE_MAPS:-false}
ANALYZE=${ANALYZE:-false}

# Security settings
SECURITY_AUDIT=${SECURITY_AUDIT:-true}
LICENSE_CHECK=${LICENSE_CHECK:-true}
VULNERABILITY_THRESHOLD=${VULNERABILITY_THRESHOLD:-moderate}

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Pre-build checks
check_prerequisites() {
    log "Checking build prerequisites..."
    
    # Check Node.js version
    NODE_VERSION=$(node --version | cut -d'v' -f2)
    REQUIRED_NODE_VERSION="18.0.0"
    
    if ! node -e "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_NODE_VERSION') ? 0 : 1)" 2>/dev/null; then
        error "Node.js version $NODE_VERSION is required. Found: $NODE_VERSION"
    fi
    
    # Check npm version
    if ! command -v npm &> /dev/null; then
        error "npm is required but not installed"
    fi
    
    # Check TypeScript
    if ! command -v npx tsc &> /dev/null; then
        error "TypeScript compiler not found"
    fi
    
    # Check required tools
    local required_tools=("git" "curl" "sha256sum")
    for tool in "${required_tools[@]}"; do
        if ! command -v "$tool" &> /dev/null; then
            error "Required tool not found: $tool"
        fi
    done
    
    success "Prerequisites check passed"
}

# Clean previous build
clean_build() {
    log "Cleaning previous build..."
    
    if [[ -d "$BUILD_DIR" ]]; then
        rm -rf "$BUILD_DIR"
        log "Removed existing build directory"
    fi
    
    if [[ -d "$ARTIFACTS_DIR" ]]; then
        rm -rf "$ARTIFACTS_DIR"
        log "Removed existing artifacts directory"
    fi
    
    # Clean node_modules if requested
    if [[ "${CLEAN_MODULES:-false}" == "true" ]]; then
        rm -rf "$PROJECT_ROOT/node_modules"
        log "Removed node_modules"
    fi
    
    success "Build environment cleaned"
}

# Install dependencies
install_dependencies() {
    log "Installing dependencies..."
    
    # Use npm ci for production builds (faster and more reliable)
    if [[ -f "$PROJECT_ROOT/package-lock.json" ]]; then
        npm ci --production=false
    else
        npm install
    fi
    
    success "Dependencies installed"
}

# Run security audit
run_security_audit() {
    if [[ "$SECURITY_AUDIT" != "true" ]]; then
        log "Skipping security audit"
        return 0
    fi
    
    log "Running security audit..."
    
    # Run npm audit
    local audit_output
    audit_output=$(npm audit --json 2>/dev/null || echo '{"vulnerabilities":{}}')
    
    # Check for vulnerabilities
    local vuln_count
    vuln_count=$(echo "$audit_output" | jq -r '.metadata.vulnerabilities.total // 0')
    
    if [[ "$vuln_count" -gt 0 ]]; then
        warning "Found $vuln_count vulnerabilities"
        
        # Check severity
        local high_vulns
        local critical_vulns
        high_vulns=$(echo "$audit_output" | jq -r '.vulnerabilities | to_entries | map(select(.value.severity == "high")) | length')
        critical_vulns=$(echo "$audit_output" | jq -r '.vulnerabilities | to_entries | map(select(.value.severity == "critical")) | length')
        
        if [[ "$critical_vulns" -gt 0 ]]; then
            error "Found $critical_vulns critical vulnerabilities. Build aborted."
        elif [[ "$high_vulns" -gt 0 && "$VULNERABILITY_THRESHOLD" == "low" ]]; then
            error "Found $high_vulns high vulnerabilities. Build aborted."
        else
            warning "Continuing build with vulnerabilities"
        fi
    else
        success "No vulnerabilities found"
    fi
}

# Check licenses
check_licenses() {
    if [[ "$LICENSE_CHECK" != "true" ]]; then
        log "Skipping license check"
        return 0
    fi
    
    log "Checking package licenses..."
    
    # Install license checker if not present
    if ! command -v license-checker &> /dev/null; then
        npm install -g license-checker
    fi
    
    # Check licenses
    local license_output
    license_output=$(license-checker --json --excludePrivatePackages 2>/dev/null || echo '{}')
    
    # Check for problematic licenses
    local problematic_licenses
    problematic_licenses=$(echo "$license_output" | jq -r 'to_entries | map(select(.value.licenses | test("GPL|AGPL|LGPL"))) | .[].key' || echo '')
    
    if [[ -n "$problematic_licenses" ]]; then
        warning "Found potentially problematic licenses:"
        echo "$problematic_licenses" | while read -r pkg; do
            warning "  - $pkg"
        done
    else
        success "All licenses are acceptable"
    fi
}

# Compile TypeScript
compile_typescript() {
    log "Compiling TypeScript..."
    
    # Set environment variables
    export NODE_ENV="$NODE_ENV"
    
    # Run TypeScript compiler with strict settings
    local tsc_args=(
        --project "$PROJECT_ROOT/tsconfig.json"
        --outDir "$BUILD_DIR"
        --rootDir "$PROJECT_ROOT/src"
        --declaration
        --declarationMap
        --sourceMap "$SOURCE_MAPS"
        --removeComments "$MINIFY"
        --noEmitOnError
        --strict
        --noImplicitAny
        --noImplicitReturns
        --noFallthroughCasesInSwitch
        --noUncheckedIndexedAccess
        --noImplicitOverride
    )
    
    if ! npx tsc "${tsc_args[@]}" 2>&1 | tee -a "$LOG_FILE"; then
        error "TypeScript compilation failed"
    fi
    
    success "TypeScript compilation completed"
}

# Copy static files
copy_static_files() {
    log "Copying static files..."
    
    # Create necessary directories
    mkdir -p "$BUILD_DIR/public"
    mkdir -p "$BUILD_DIR/config"
    mkdir -p "$BUILD_DIR/docs"
    
    # Copy public assets
    if [[ -d "$PROJECT_ROOT/public" ]]; then
        cp -r "$PROJECT_ROOT/public/"* "$BUILD_DIR/public/"
        log "Copied public assets"
    fi
    
    # Copy configuration files
    if [[ -f "$PROJECT_ROOT/.env.example" ]]; then
        cp "$PROJECT_ROOT/.env.example" "$BUILD_DIR/"
        log "Copied environment example"
    fi
    
    # Copy documentation
    if [[ -d "$PROJECT_ROOT/docs" ]]; then
        cp -r "$PROJECT_ROOT/docs/"* "$BUILD_DIR/docs/"
        log "Copied documentation"
    fi
    
    # Copy package.json for production
    cp "$PROJECT_ROOT/package.json" "$BUILD_DIR/"
    
    # Install only production dependencies
    cd "$BUILD_DIR"
    npm ci --production
    cd "$PROJECT_ROOT"
    
    success "Static files copied"
}

# Optimize build
optimize_build() {
    if [[ "$MINIFY" != "true" ]]; then
        log "Skipping build optimization"
        return 0
    fi
    
    log "Optimizing build..."
    
    # Minify JavaScript files (if terser is available)
    if command -v npx terser &> /dev/null; then
        find "$BUILD_DIR" -name "*.js" -not -path "*/node_modules/*" | while read -r file; do
            npx terser "$file" -o "$file" --compress --mangle 2>/dev/null || true
        done
        log "JavaScript files minified"
    fi
    
    # Generate bundle analysis (if requested)
    if [[ "$ANALYZE" == "true" ]]; then
        if command -v npx webpack-bundle-analyzer &> /dev/null; then
            log "Generating bundle analysis..."
            # This would require webpack configuration
            warning "Bundle analysis requires webpack configuration"
        fi
    fi
    
    success "Build optimization completed"
}

# Generate build metadata
generate_metadata() {
    log "Generating build metadata..."
    
    local metadata_file="$BUILD_DIR/build-metadata.json"
    local git_commit
    local git_branch
    local build_time
    local build_user
    
    git_commit=$(git rev-parse HEAD 2>/dev/null || echo "unknown")
    git_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
    build_time=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
    build_user=$(whoami)
    
    cat > "$metadata_file" << EOF
{
  "build": {
    "version": "1.1.0",
    "timestamp": "$build_time",
    "user": "$build_user",
    "node_version": "$(node --version)",
    "npm_version": "$(npm --version)"
  },
  "git": {
    "commit": "$git_commit",
    "branch": "$git_branch",
    "dirty": $(git diff --quiet 2>/dev/null && echo "false" || echo "true")
  },
  "environment": {
    "node_env": "$NODE_ENV",
    "build_target": "$BUILD_TARGET",
    "minify": $MINIFY,
    "source_maps": $SOURCE_MAPS
  }
}
EOF
    
    success "Build metadata generated"
}

# Run tests
run_tests() {
    if [[ "${SKIP_TESTS:-false}" == "true" ]]; then
        log "Skipping tests"
        return 0
    fi
    
    log "Running tests..."
    
    # Run unit tests
    if ! npm run test 2>&1 | tee -a "$LOG_FILE"; then
        error "Tests failed"
    fi
    
    # Run type checking
    if ! npm run type-check 2>&1 | tee -a "$LOG_FILE"; then
        error "Type checking failed"
    fi
    
    success "All tests passed"
}

# Generate build hash
generate_build_hash() {
    log "Generating build hash..."
    
    local hash_file="$BUILD_DIR/build.sha256"
    local build_hash
    
    # Generate hash of all build files
    build_hash=$(find "$BUILD_DIR" -type f -not -path "*/node_modules/*" -exec sha256sum {} \; | sort | sha256sum | cut -d' ' -f1)
    
    echo "$build_hash" > "$hash_file"
    
    success "Build hash: $build_hash"
}

# Create distribution package
create_package() {
    log "Creating distribution package..."
    
    local package_name="phase35-leaderboard-${NODE_ENV}-$(date +%Y%m%d-%H%M%S).tar.gz"
    local package_path="$PROJECT_ROOT/$package_name"
    
    # Create tarball
    cd "$BUILD_DIR"
    tar -czf "$package_path" .
    cd "$PROJECT_ROOT"
    
    # Generate package hash
    local package_hash
    package_hash=$(sha256sum "$package_path" | cut -d' ' -f1)
    
    echo "$package_hash" > "$package_path.sha256"
    
    success "Distribution package created: $package_name"
    success "Package hash: $package_hash"
}

# Main build function
main() {
    log "Starting Phase 35 Leaderboard build..."
    log "Environment: $NODE_ENV"
    log "Target: $BUILD_TARGET"
    
    # Initialize log
    echo "Phase 35 Leaderboard Build Log - $(date)" > "$LOG_FILE"
    
    # Run build steps
    check_prerequisites
    clean_build
    install_dependencies
    run_security_audit
    check_licenses
    run_tests
    compile_typescript
    copy_static_files
    optimize_build
    generate_metadata
    generate_build_hash
    create_package
    
    success "Build completed successfully!"
    log "Build artifacts located in: $BUILD_DIR"
    log "Build log available at: $LOG_FILE"
    
    # Display build summary
    echo
    echo "=== Build Summary ==="
    echo "Version: 1.1.0"
    echo "Environment: $NODE_ENV"
    echo "Target: $BUILD_TARGET"
    echo "Minify: $MINIFY"
    echo "Source Maps: $SOURCE_MAPS"
    echo "Security Audit: $SECURITY_AUDIT"
    echo "Build Directory: $BUILD_DIR"
    echo "Package: $(ls -1 "$PROJECT_ROOT"/phase35-leaderboard-*.tar.gz | head -1)"
    echo "===================="
}

# Handle script arguments
case "${1:-build}" in
    "clean")
        clean_build
        ;;
    "deps")
        install_dependencies
        ;;
    "test")
        run_tests
        ;;
    "audit")
        run_security_audit
        ;;
    "build")
        main
        ;;
    "help"|"-h"|"--help")
        echo "Usage: $0 [command]"
        echo
        echo "Commands:"
        echo "  build   - Full production build (default)"
        echo "  clean   - Clean build artifacts"
        echo "  deps    - Install dependencies"
        echo "  test    - Run tests"
        echo "  audit   - Run security audit"
        echo "  help    - Show this help"
        echo
        echo "Environment Variables:"
        echo "  NODE_ENV              - Build environment (default: production)"
        echo "  BUILD_TARGET          - Target platform (default: node18)"
        echo "  MINIFY                - Minify code (default: true)"
        echo "  SOURCE_MAPS           - Generate source maps (default: false)"
        echo "  SECURITY_AUDIT        - Run security audit (default: true)"
        echo "  LICENSE_CHECK         - Check licenses (default: true)"
        echo "  SKIP_TESTS            - Skip tests (default: false)"
        echo "  CLEAN_MODULES         - Clean node_modules (default: false)"
        ;;
    *)
        error "Unknown command: $1. Use '$0 help' for usage."
        ;;
esac
