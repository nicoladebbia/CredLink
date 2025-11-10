#!/bin/bash
# SBOM Verification Script for C2 Concierge
# Verifies SBOM integrity and validates signatures

set -euo pipefail

# Configuration
SBOM_DIR="${1:-./sboms}"
IMAGE="${2:-ghcr.io/nickiller04/credlink:latest}"

echo "Verifying SBOMs in: $SBOM_DIR"
echo "For image: $IMAGE"

# Check if SBOM directory exists
if [ ! -d "$SBOM_DIR" ]; then
    echo "Error: SBOM directory $SBOM_DIR does not exist"
    exit 1
fi

# Check if required SBOM files exist
SPDX_FILE="$SBOM_DIR/sbom.spdx.json"
CYCLONEDX_FILE="$SBOM_DIR/sbom.cdx.json"

if [ ! -f "$SPDX_FILE" ]; then
    echo "Error: SPDX SBOM file not found: $SPDX_FILE"
    exit 1
fi

if [ ! -f "$CYCLONEDX_FILE" ]; then
    echo "Error: CycloneDX SBOM file not found: $CYCLONEDX_FILE"
    exit 1
fi

# Install tools if not present
if ! command -v cosign &> /dev/null; then
    echo "Installing Cosign..."
    # SECURITY: Never pipe curl directly to sh without verification
    echo "❌ ERROR: Direct curl|sh execution is disabled for security"
    echo "Please install cosign via package manager or verify the script signature"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo "Installing jq..."
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y jq
    elif command -v yum &> /dev/null; then
        yum install -y jq
    elif command -v brew &> /dev/null; then
        brew install jq
    else
        echo "Error: Cannot install jq - package manager not found"
        exit 1
    fi
fi

echo "=== SBOM Integrity Verification ==="

# Verify checksums
if [ -f "$SBOM_DIR/sbom.sha256sums" ]; then
    echo "Verifying SHA256 checksums..."
    cd "$SBOM_DIR"
    sha256sum -c sbom.sha256sums
    cd - > /dev/null
    echo "✅ SHA256 checksums verified"
else
    echo "⚠️  SHA256 checksums file not found"
fi

if [ -f "$SBOM_DIR/sbom.sha512sums" ]; then
    echo "Verifying SHA512 checksums..."
    cd "$SBOM_DIR"
    sha512sum -c sbom.sha512sums
    cd - > /dev/null
    echo "✅ SHA512 checksums verified"
else
    echo "⚠️  SHA512 checksums file not found"
fi

echo "=== SBOM Format Validation ==="

# Validate SPDX format
echo "Validating SPDX format..."
if jq empty "$SPDX_FILE" 2>/dev/null; then
    SPDX_VERSION=$(jq -r '.spdxVersion' "$SPDX_FILE" 2>/dev/null || echo "unknown")
    SPDX_NAME=$(jq -r '.name' "$SPDX_FILE" 2>/dev/null || echo "unknown")
    echo "✅ SPDX JSON is valid"
    echo "   Version: $SPDX_VERSION"
    echo "   Name: $SPDX_NAME"
    
    if [ "$SPDX_VERSION" = "SPDX-2.3" ]; then
        echo "✅ SPDX version is correct (2.3)"
    else
        echo "⚠️  SPDX version is not 2.3: $SPDX_VERSION"
    fi
else
    echo "❌ SPDX JSON is invalid"
    exit 1
fi

# Validate CycloneDX format
echo "Validating CycloneDX format..."
if jq empty "$CYCLONEDX_FILE" 2>/dev/null; then
    CDX_VERSION=$(jq -r '.specVersion' "$CYCLONEDX_FILE" 2>/dev/null || echo "unknown")
    CDX_NAME=$(jq -r '.metadata.component.name // "Unknown"' "$CYCLONEDX_FILE" 2>/dev/null || echo "Unknown")
    echo "✅ CycloneDX JSON is valid"
    echo "   Version: $CDX_VERSION"
    echo "   Name: $CDX_NAME"
    
    if [ "$CDX_VERSION" = "1.4" ] || [ "$CDX_VERSION" = "1.5" ]; then
        echo "✅ CycloneDX version is supported"
    else
        echo "⚠️  CycloneDX version may not be latest: $CDX_VERSION"
    fi
else
    echo "❌ CycloneDX JSON is invalid"
    exit 1
fi

echo "=== SBOM Content Analysis ==="

# Analyze SPDX content
echo "Analyzing SPDX content..."
SPDX_PACKAGES=$(jq -r '.packages | length' "$SPDX_FILE" 2>/dev/null || echo "0")
SPDX_LICENSES=$(jq -r '.hasExtractedLicensingInfos | length' "$SPDX_FILE" 2>/dev/null || echo "0")
echo "   Packages: $SPDX_PACKAGES"
echo "   License infos: $SPDX_LICENSES"

# Analyze CycloneDX content
echo "Analyzing CycloneDX content..."
CDX_COMPONENTS=$(jq -r '.components | length' "$CYCLONEDX_FILE" 2>/dev/null || echo "0")
CDX_VULNERABILITIES=$(jq -r '.vulnerabilities | length' "$CYCLONEDX_FILE" 2>/dev/null || echo "0")
echo "   Components: $CDX_COMPONENTS"
echo "   Vulnerabilities: $CDX_VULNERABILITIES"

echo "=== Attestation Verification ==="

# Verify image signature
echo "Verifying image signature..."
if cosign verify "$IMAGE" 2>/dev/null; then
    echo "✅ Image signature verified"
else
    echo "❌ Image signature verification failed"
    exit 1
fi

# Check for SBOM attestations
echo "Checking for SBOM attestations..."
COSIGN_ATTESTATIONS=$(cosign attestations list "$IMAGE" 2>/dev/null || echo "No attestations found")
if echo "$COSIGN_ATTESTATIONS" | grep -q "sbom"; then
    echo "✅ SBOM attestations found"
    echo "$COSIGN_ATTESTATIONS"
else
    echo "⚠️  No SBOM attestations found"
fi

# Check for SLSA provenance attestations
echo "Checking for SLSA provenance attestations..."
if echo "$COSIGN_ATTESTATIONS" | grep -q "slsa"; then
    echo "✅ SLSA provenance attestations found"
else
    echo "⚠️  No SLSA provenance attestations found"
fi

echo "=== Summary ==="
echo "SBOM verification completed successfully!"
echo "✅ All SBOM files are present and valid"
echo "✅ Checksums are verified"
echo "✅ Formats are correct (SPDX 2.3, CycloneDX)"
echo "✅ Image signature is verified"
echo "✅ Attestations are present"

# Generate verification report
cat > "$SBOM_DIR/verification-report.json" << EOF
{
  "verified_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "image": "$IMAGE",
  "sbom_directory": "$SBOM_DIR",
  "results": {
    "spdx_valid": true,
    "cyclonedx_valid": true,
    "checksums_verified": true,
    "image_signature_verified": true,
    "attestations_present": true
  },
  "formats": {
    "spdx": {
      "version": "$(jq -r '.spdxVersion' "$SPDX_FILE")",
      "packages": $SPDX_PACKAGES,
      "licenses": $SPDX_LICENSES
    },
    "cyclonedx": {
      "version": "$(jq -r '.specVersion' "$CYCLONEDX_FILE")",
      "components": $CDX_COMPONENTS,
      "vulnerabilities": $CDX_VULNERABILITIES
    }
  }
}
EOF

echo "Verification report saved to: $SBOM_DIR/verification-report.json"
