#!/bin/bash

# C2 Concierge Offline Verification Kit - Cross-Platform Build Script
# Builds and packages the offline verification kit for macOS, Windows, and Linux

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/.."
DIST_DIR="${PROJECT_ROOT}/dist"
BUILD_DIR="${PROJECT_ROOT}/target"

# Version information
VERSION="${1:-1.0.0}"
BUILD_DATE=$(date +%Y-%m-%d)
GIT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")

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

# Check dependencies
check_dependencies() {
    log_info "Checking build dependencies..."
    
    local missing_deps=()
    
    # Check for Rust
    if ! command -v cargo >/dev/null 2>&1; then
        missing_deps+=("cargo")
    fi
    
    # Check for zstd
    if ! command -v zstd >/dev/null 2>&1; then
        missing_deps+=("zstd")
    fi
    
    # Check for tar
    if ! command -v tar >/dev/null 2>&1; then
        missing_deps+=("tar")
    fi
    
    # Check for zip (for Windows)
    if ! command -v zip >/dev/null 2>&1; then
        missing_deps+=("zip")
    fi
    
    if [[ ${#missing_deps[@]} -gt 0 ]]; then
        log_error "Missing dependencies: ${missing_deps[*]}"
        log_info "Please install the missing dependencies and try again."
        exit 1
    fi
    
    log_success "All dependencies found"
}

# Clean previous builds
clean_builds() {
    log_info "Cleaning previous builds..."
    
    if [[ -d "${DIST_DIR}" ]]; then
        rm -rf "${DIST_DIR}"
    fi
    
    if [[ -d "${BUILD_DIR}" ]]; then
        rm -rf "${BUILD_DIR}"
    fi
    
    mkdir -p "${DIST_DIR}"
    
    log_success "Build directory cleaned"
}

# Build for Linux
build_linux() {
    log_info "Building for Linux (x86_64)..."
    
    # Set target triple for Linux
    export TARGET=x86_64-unknown-linux-gnu
    
    # Build release binary
    cargo build --release --target "${TARGET}"
    
    # Verify binary was created
    local binary="${BUILD_DIR}/${TARGET}/release/c2c-offline"
    if [[ ! -f "${binary}" ]]; then
        log_error "Linux binary not found at ${binary}"
        return 1
    fi
    
    # Strip binary for smaller size
    strip "${binary}" 2>/dev/null || true
    
    log_success "Linux binary built"
}

# Build for macOS
build_macos() {
    log_info "Building for macOS (x86_64)..."
    
    # Set target triple for macOS
    export TARGET=x86_64-apple-darwin
    
    # Build release binary
    cargo build --release --target "${TARGET}"
    
    # Verify binary was created
    local binary="${BUILD_DIR}/${TARGET}/release/c2c-offline"
    if [[ ! -f "${binary}" ]]; then
        log_error "macOS binary not found at ${binary}"
        return 1
    fi
    
    # Strip binary for smaller size
    strip "${binary}" 2>/dev/null || true
    
    log_success "macOS binary built"
}

# Build for Windows
build_windows() {
    log_info "Building for Windows (x86_64)..."
    
    # Set target triple for Windows
    export TARGET=x86_64-pc-windows-gnu
    
    # Build release binary
    cargo build --release --target "${TARGET}"
    
    # Verify binary was created
    local binary="${BUILD_DIR}/${TARGET}/release/c2c-offline.exe"
    if [[ ! -f "${binary}" ]]; then
        log_error "Windows binary not found at ${binary}"
        return 1
    fi
    
    log_success "Windows binary built"
}

# Package Linux distribution
package_linux() {
    log_info "Packaging Linux distribution..."
    
    local package_name="c2c-offline-linux-x86_64-${VERSION}"
    local package_dir="${DIST_DIR}/${package_name}"
    local archive_file="${DIST_DIR}/${package_name}.tar.gz"
    
    # Create package directory
    mkdir -p "${package_dir}/bin"
    mkdir -p "${package_dir}/badge-offline"
    mkdir -p "${package_dir}/trustpacks"
    mkdir -p "${package_dir}/samples"
    mkdir -p "${package_dir}/docs"
    
    # Copy binary
    cp "${BUILD_DIR}/x86_64-unknown-linux-gnu/release/c2c-offline" "${package_dir}/bin/"
    chmod +x "${package_dir}/bin/c2c-offline"
    
    # Copy badge viewer
    cp -r "${PROJECT_ROOT}/badge-offline"/* "${package_dir}/badge-offline/"
    
    # Copy samples and documentation
    cp -r "${PROJECT_ROOT}/samples"/* "${package_dir}/samples/" 2>/dev/null || true
    cp -r "${PROJECT_ROOT}/docs"/* "${package_dir}/docs/" 2>/dev/null || true
    
    # Create Linux-specific files
    cat > "${package_dir}/README.md" << EOF
# C2 Concierge Offline Verification Kit - Linux x86_64

Version: ${VERSION}
Build Date: ${BUILD_DATE}
Git Commit: ${GIT_COMMIT}

## Quick Start

\`\`\`bash
# Make binary executable
chmod +x bin/c2c-offline

# Verify an asset offline
./bin/c2c-offline verify ./samples/embedded.jpg --trust ./trustpacks/trustpack-2025-11-02.tar.zst --no-network

# Generate report with QR code
./bin/c2c-offline report ./samples/embedded.jpg --trust ./trustpacks/trustpack-2025-11-02.tar.zst --out ./report.html --qr
\`\`\`

## Requirements

- Linux x86_64
- glibc 2.17 or later
- No network connection required

## Security

- Network access is disabled by design
- All verification happens offline
- Trust packs are signed and verified

For detailed documentation, see the \`docs/\` directory.
EOF
    
    # Create archive
    cd "${DIST_DIR}"
    tar -czf "${archive_file}" "${package_name}"
    
    # Generate checksum
    sha256sum "${archive_file}" > "${archive_file}.sha256"
    
    log_success "Linux package created: ${archive_file}"
}

# Package macOS distribution
package_macos() {
    log_info "Packaging macOS distribution..."
    
    local package_name="c2c-offline-macos-x86_64-${VERSION}"
    local package_dir="${DIST_DIR}/${package_name}"
    local archive_file="${DIST_DIR}/${package_name}.tar.gz"
    
    # Create package directory
    mkdir -p "${package_dir}/bin"
    mkdir -p "${package_dir}/badge-offline"
    mkdir -p "${package_dir}/trustpacks"
    mkdir -p "${package_dir}/samples"
    mkdir -p "${package_dir}/docs"
    
    # Copy binary
    cp "${BUILD_DIR}/x86_64-apple-darwin/release/c2c-offline" "${package_dir}/bin/"
    chmod +x "${package_dir}/bin/c2c-offline"
    
    # Copy badge viewer
    cp -r "${PROJECT_ROOT}/badge-offline"/* "${package_dir}/badge-offline/"
    
    # Copy samples and documentation
    cp -r "${PROJECT_ROOT}/samples"/* "${package_dir}/samples/" 2>/dev/null || true
    cp -r "${PROJECT_ROOT}/docs"/* "${package_dir}/docs/" 2>/dev/null || true
    
    # Create macOS-specific files
    cat > "${package_dir}/README.md" << EOF
# C2 Concierge Offline Verification Kit - macOS x86_64

Version: ${VERSION}
Build Date: ${BUILD_DATE}
Git Commit: ${GIT_COMMIT}

## Quick Start

\`\`\`bash
# Verify an asset offline
./bin/c2c-offline verify ./samples/embedded.jpg --trust ./trustpacks/trustpack-2025-11-02.tar.zst --no-network

# Generate report with QR code
./bin/c2c-offline report ./samples/embedded.jpg --trust ./trustpacks/trustpack-2025-11-02.tar.zst --out ./report.html --qr
\`\`\`

## Requirements

- macOS 10.15 (Catalina) or later
- Intel x86_64 processor
- No network connection required

## Security

- Network access is disabled by design
- All verification happens offline
- Trust packs are signed and verified
- Code signed and notarized (production builds)

For detailed documentation, see the \`docs/\` directory.
EOF
    
    # Create archive
    cd "${DIST_DIR}"
    tar -czf "${archive_file}" "${package_name}"
    
    # Generate checksum
    sha256sum "${archive_file}" > "${archive_file}.sha256"
    
    log_success "macOS package created: ${archive_file}"
}

# Package Windows distribution
package_windows() {
    log_info "Packaging Windows distribution..."
    
    local package_name="c2c-offline-windows-x86_64-${VERSION}"
    local package_dir="${DIST_DIR}/${package_name}"
    local archive_file="${DIST_DIR}/${package_name}.zip"
    
    # Create package directory
    mkdir -p "${package_dir}/bin"
    mkdir -p "${package_dir}/badge-offline"
    mkdir -p "${package_dir}/trustpacks"
    mkdir -p "${package_dir}/samples"
    mkdir -p "${package_dir}/docs"
    
    # Copy binary
    cp "${BUILD_DIR}/x86_64-pc-windows-gnu/release/c2c-offline.exe" "${package_dir}/bin/"
    
    # Copy badge viewer
    cp -r "${PROJECT_ROOT}/badge-offline"/* "${package_dir}/badge-offline/"
    
    # Copy samples and documentation
    cp -r "${PROJECT_ROOT}/samples"/* "${package_dir}/samples/" 2>/dev/null || true
    cp -r "${PROJECT_ROOT}/docs"/* "${package_dir}/docs/" 2>/dev/null || true
    
    # Create Windows-specific files
    cat > "${package_dir}/README.md" << EOF
# C2 Concierge Offline Verification Kit - Windows x86_64

Version: ${VERSION}
Build Date: ${BUILD_DATE}
Git Commit: ${GIT_COMMIT}

## Quick Start

\`\`\`cmd
REM Verify an asset offline
bin\\c2c-offline.exe verify samples\\embedded.jpg --trust trustpacks\\trustpack-2025-11-02.tar.zst --no-network

REM Generate report with QR code
bin\\c2c-offline.exe report samples\\embedded.jpg --trust trustpacks\\trustpack-2025-11-02.tar.zst --out report.html --qr
\`\`\`

## Requirements

- Windows 10 (version 1903) or later
- x86_64 processor
- No network connection required

## Security

- Network access is disabled by design
- All verification happens offline
- Trust packs are signed and verified
- Code signed (production builds)

For detailed documentation, see the \`docs/\` directory.
EOF
    
    # Create ZIP archive
    cd "${DIST_DIR}"
    zip -r "${archive_file}" "${package_name}"
    
    # Generate checksum
    sha256sum "${archive_file}" > "${archive_file}.sha256"
    
    log_success "Windows package created: ${archive_file}"
}

# Create combined distribution
create_combined_distribution() {
    log_info "Creating combined distribution..."
    
    local combined_dir="${DIST_DIR}/c2c-offline-${VERSION}"
    local combined_archive="${DIST_DIR}/c2c-offline-${VERSION}.tar.gz"
    
    mkdir -p "${combined_dir}"
    
    # Copy all platform packages
    cp "${DIST_DIR}"/*.tar.gz "${combined_dir}/" 2>/dev/null || true
    cp "${DIST_DIR}"/*.zip "${combined_dir}/" 2>/dev/null || true
    cp "${DIST_DIR}"/*.sha256 "${combined_dir}/" 2>/dev/null || true
    
    # Create combined README
    cat > "${combined_dir}/README.md" << EOF
# C2 Concierge Offline Verification Kit - All Platforms

Version: ${VERSION}
Build Date: ${BUILD_DATE}
Git Commit: ${GIT_COMMIT}

## Platform Packages

- \`c2c-offline-linux-x86_64-${VERSION}.tar.gz\` - Linux x86_64
- \`c2c-offline-macos-x86_64-${VERSION}.tar.gz\` - macOS x86_64
- \`c2c-offline-windows-x86_64-${VERSION}.zip\` - Windows x86_64

## Verification

Each package includes a \`.sha256\` file for integrity verification:

\`\`\`bash
# Verify Linux package
sha256sum -c c2c-offline-linux-x86_64-${VERSION}.tar.gz.sha256

# Verify macOS package
sha256sum -c c2c-offline-macos-x86_64-${VERSION}.tar.gz.sha256
\`\`\`

## Quick Start

1. Download the appropriate package for your platform
2. Extract the archive
3. Follow the platform-specific README instructions
4. Verify assets offline without network access

## Security Features

- **Air-gapped operation**: No network access required
- **RFC 3161 timestamps**: Offline timestamp verification
- **Signed trust packs**: Cryptographically verified trust roots
- **QR code reports**: Online re-check capability
- **Cross-platform**: Windows, macOS, Linux support

For detailed documentation and API reference, see individual platform packages.
EOF
    
    # Create combined archive
    cd "${DIST_DIR}"
    tar -czf "${combined_archive}" "c2c-offline-${VERSION}"
    
    # Generate combined checksum
    sha256sum "${combined_archive}" > "${combined_archive}.sha256"
    
    log_success "Combined distribution created: ${combined_archive}"
}

# Generate build report
# Generate build report
generate_build_report() {
    log_info "Generating build report..."
    
    local report_file="${DIST_DIR}/build-report.json"
    
    cat > "${report_file}" << 'JSONEOF'
{
  "build_info": {
    "version": "${VERSION}",
    "build_date": "${BUILD_DATE}",
    "git_commit": "${GIT_COMMIT}",
    "builder": "C2 Concierge Offline Verification Kit Build Script v1.0.0"
  },
  "platforms": {
    "linux": {
      "target": "x86_64-unknown-linux-gnu",
      "package": "c2c-offline-linux-x86_64-${VERSION}.tar.gz",
      "binary": "c2c-offline",
      "status": "built"
    },
    "macos": {
      "target": "x86_64-apple-darwin",
      "package": "c2c-offline-macos-x86_64-${VERSION}.tar.gz",
      "binary": "c2c-offline",
      "status": "built"
    },
    "windows": {
      "target": "x86_64-pc-windows-gnu",
      "package": "c2c-offline-windows-x86_64-${VERSION}.zip",
      "binary": "c2c-offline.exe",
      "status": "built"
    }
  },
  "artifacts": []
}
JSONEOF
    
    log_success "Build report generated: ${report_file}"
}

# Main execution
main() {
    log_info "Starting cross-platform build for C2 Concierge Offline Verification Kit v${VERSION}"
    
    # Check dependencies
    check_dependencies
    
    # Clean builds
    clean_builds
    
    # Build for all platforms
    build_linux
    build_macos
    build_windows
    
    # Package distributions
    package_linux
    package_macos
    package_windows
    
    # Generate checksums
    generate_checksums
    
    # Create combined distribution
    create_combined_distribution
    
    # Generate build report
    generate_build_report
    
    log_success "Cross-platform build completed successfully"
}

# Run main function
main "$@"
