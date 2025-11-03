#!/bin/bash

# Phase 34 Spec Watch System - Build Script
# C2PA Specification Tracking and Contribution System v1.1.0

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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

# Build configuration
BUILD_DIR="dist"
SOURCE_DIR="src"
ARTIFACTS_DIR="artifacts"

# Clean previous build
log_info "Cleaning previous build..."
rm -rf "$BUILD_DIR"
rm -rf "$ARTIFACTS_DIR"

# Create necessary directories
log_info "Creating build directories..."
mkdir -p "$BUILD_DIR"
mkdir -p "$ARTIFACTS_DIR/gauntlet"
mkdir -p "$ARTIFACTS_DIR/issues"
mkdir -p "$ARTIFACTS_DIR/reports"
mkdir -p "$ARTIFACTS_DIR/traces"

# Install dependencies
log_info "Installing dependencies..."
npm ci --production=false

# Run type checking
log_info "Running TypeScript type checking..."
npx tsc --noEmit --skipLibCheck

# Run linting
log_info "Running ESLint..."
npx eslint "$SOURCE_DIR" --ext .ts --max-warnings=0

# Run tests
log_info "Running tests..."
npm test

# Build TypeScript
log_info "Building TypeScript..."
npx tsc --build

# Copy configuration files
log_info "Copying configuration files..."
cp package.json "$BUILD_DIR/"
cp .env.example "$BUILD_DIR/"
cp -r src/config "$BUILD_DIR/"

# Generate API documentation (optional)
if command -v typedoc &> /dev/null; then
    log_info "Generating API documentation..."
    npx typedoc --out docs/api "$SOURCE_DIR"
fi

# Validate build
log_info "Validating build..."
if [ ! -f "$BUILD_DIR/index.js" ]; then
    log_error "Build validation failed - main entry point not found"
    exit 1
fi

# Check dependencies
log_info "Checking for security vulnerabilities..."
npm audit --audit-level=moderate

# Generate build metadata
log_info "Generating build metadata..."
BUILD_METADATA=$(cat <<EOF
{
  "build_time": "$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)",
  "build_version": "$(node -p "require('./package.json').version")",
  "git_commit": "$(git rev-parse HEAD 2>/dev/null || echo 'unknown')",
  "git_branch": "$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo 'unknown')",
  "node_version": "$(node --version)",
  "npm_version": "$(npm --version)",
  "typescript_version": "$(npx tsc --version)"
}
EOF
)

echo "$BUILD_METADATA" > "$BUILD_DIR/build-metadata.json"

# Create distribution package
log_info "Creating distribution package..."
DIST_NAME="c2pa-spec-watch-$(node -p "require('./package.json').version")-$(date +%Y%m%d-%H%M%S).tar.gz"
tar -czf "$DIST_NAME" -C "$BUILD_DIR" .

log_success "Build completed successfully!"
log_info "Build artifacts:"
log_info "  - Build directory: $BUILD_DIR"
log_info "  - Distribution package: $DIST_NAME"
log_info "  - Build metadata: $BUILD_DIR/build-metadata.json"

# Display build summary
echo
log_success "Build Summary:"
echo "  Version: $(node -p "require('./package.json').version")"
echo "  Built at: $(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)"
echo "  Git commit: $(git rev-parse --short HEAD 2>/dev/null || echo 'unknown')"
echo "  Node.js: $(node --version)"
echo "  TypeScript: $(npx tsc --version)"

# Development instructions
if [ "${NODE_ENV:-}" = "development" ]; then
    echo
    log_info "Development instructions:"
    echo "  - Start development server: npm run dev"
    echo "  - Run tests: npm test"
    echo "  - Run gauntlet: npm run run-gauntlet"
    echo "  - Generate report: npm run generate-report"
fi

echo
log_success "Phase 34 Spec Watch System build complete!"
