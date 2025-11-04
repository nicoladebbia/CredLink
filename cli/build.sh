#!/bin/bash

# Cross-platform build script for C2 Concierge CLI
set -euo pipefail

VERSION="1.0.0"
OUTPUT_DIR="bin"
BINARY_NAME="c2c"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Validate build environment
validate_build_env() {
    if ! command -v go &> /dev/null; then
        echo -e "${RED}✗ Go is not installed or not in PATH${NC}" >&2
        exit 1
    fi
    
    if ! command -v date &> /dev/null; then
        echo -e "${RED}✗ date command not found${NC}" >&2
        exit 1
    fi
    
    # Check Go version
    go_version=$(go version | awk '{print $3}' | sed 's/go//')
    if [[ $(printf '%s\n' "1.22" "$go_version" | sort -V | head -n1) != "1.22" ]]; then
        echo -e "${RED}✗ Go version 1.22 or higher required, found: $go_version${NC}" >&2
        exit 1
    fi
}

# Secure build timestamp generation
get_build_timestamp() {
    # Use UTC time and format to prevent command injection
    date -u '+%Y-%m-%d_%H:%M:%S' 2>/dev/null || date -u '+%Y-%m-%dT%H:%M:%SZ' 2>/dev/null || echo "unknown"
}

echo -e "${GREEN}Building C2 Concierge CLI v${VERSION}${NC}"

# Validate environment before building
validate_build_env

# Create output directory with secure permissions
mkdir -p -m 0755 "$OUTPUT_DIR"

# Function to build for a platform
build_platform() {
    local os=$1
    local arch=$2
    local suffix=$3
    local ext=$4
    
    echo -e "${YELLOW}Building for ${os}/${arch}...${NC}"
    
    # Build with security hardening flags
    CGO_ENABLED=0 GOOS="$os" GOARCH="$arch" go build \
        -ldflags="-s -w -X main.version=${VERSION} -X main.buildTime=$(get_build_timestamp)" \
        -trimpath \
        -o "${OUTPUT_DIR}/${BINARY_NAME}${suffix}${ext}" \
        .
    
    if [ $? -eq 0 ]; then
        # Set secure file permissions
        chmod 0755 "${OUTPUT_DIR}/${BINARY_NAME}${suffix}${ext}"
        echo -e "${GREEN}✓ Build successful: ${BINARY_NAME}${suffix}${ext}${NC}"
    else
        echo -e "${RED}✗ Build failed for ${os}/${arch}${NC}" >&2
        exit 1
    fi
}

# Build for all platforms
echo "Building for all target platforms..."

# Linux x86_64 (static)
build_platform "linux" "amd64" "-linux-amd64" ""

# Windows x64
build_platform "windows" "amd64" "-windows-amd64" ".exe"

# macOS Intel
build_platform "darwin" "amd64" "-darwin-amd64" ""

# macOS Apple Silicon
build_platform "darwin" "arm64" "-darwin-arm64" ""

# Create macOS universal binary
echo -e "${YELLOW}Creating macOS universal binary...${NC}"
if command -v lipo &> /dev/null; then
    if [ -f "${OUTPUT_DIR}/${BINARY_NAME}-darwin-amd64" ] && [ -f "${OUTPUT_DIR}/${BINARY_NAME}-darwin-arm64" ]; then
        lipo -create \
            "${OUTPUT_DIR}/${BINARY_NAME}-darwin-amd64" \
            "${OUTPUT_DIR}/${BINARY_NAME}-darwin-arm64" \
            -output "${OUTPUT_DIR}/${BINARY_NAME}-darwin-universal"
        
        chmod 0755 "${OUTPUT_DIR}/${BINARY_NAME}-darwin-universal"
        echo -e "${GREEN}✓ Universal binary created: ${BINARY_NAME}-darwin-universal${NC}"
    else
        echo -e "${RED}✗ macOS binaries not found for universal binary creation${NC}" >&2
        exit 1
    fi
else
    echo -e "${YELLOW}⚠ lipo not available, skipping universal binary${NC}"
fi

# Build current platform for development
echo -e "${YELLOW}Building for current platform...${NC}"
CGO_ENABLED=0 go build -trimpath -o "${OUTPUT_DIR}/${BINARY_NAME}" .
chmod 0755 "${OUTPUT_DIR}/${BINARY_NAME}"
echo -e "${GREEN}✓ Development build: ${BINARY_NAME}${NC}"

# Create release packages
echo -e "${YELLOW}Creating release packages...${NC}"
mkdir -p -m 0755 "${OUTPUT_DIR}/release"

# Linux package
if [ -f "${OUTPUT_DIR}/${BINARY_NAME}-linux-amd64" ]; then
    tar -czf "${OUTPUT_DIR}/release/${BINARY_NAME}-v${VERSION}-linux-amd64.tar.gz" \
        -C "${OUTPUT_DIR}" "${BINARY_NAME}-linux-amd64"
fi

# Windows package
if [ -f "${OUTPUT_DIR}/${BINARY_NAME}-windows-amd64.exe" ]; then
    cd "${OUTPUT_DIR}" && zip -q "release/${BINARY_NAME}-v${VERSION}-windows-amd64.zip" \
        "${BINARY_NAME}-windows-amd64.exe" && cd ..
fi

# macOS package
if [ -f "${OUTPUT_DIR}/${BINARY_NAME}-darwin-universal" ]; then
    tar -czf "${OUTPUT_DIR}/release/${BINARY_NAME}-v${VERSION}-darwin-universal.tar.gz" \
        -C "${OUTPUT_DIR}" "${BINARY_NAME}-darwin-universal"
fi

# Display build summary
echo -e "${GREEN}Build completed successfully!${NC}"
echo ""
echo "Built binaries:"
ls -la "${OUTPUT_DIR}/${BINARY_NAME}"* 2>/dev/null || echo "No binaries found"

echo ""
echo "Release packages:"
ls -la "${OUTPUT_DIR}/release/"* 2>/dev/null || echo "No release packages found"

echo ""
echo -e "${GREEN}To test the CLI, run: ${OUTPUT_DIR}/${BINARY_NAME} --help${NC}"
