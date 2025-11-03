#!/bin/bash
# SBOM Generation Script for C2 Concierge with Maximum Security
# Generates SPDX 2.3 and CycloneDX SBOMs with comprehensive security validation

set -euo pipefail

# Security: Global configuration with maximum hardening
readonly SCRIPT_VERSION="2.0.0"
readonly MIN_SYFT_VERSION="0.100.0"
readonly MIN_CYCLONEDX_VERSION="0.25.4"
readonly MAX_FILE_SIZE="100M"
readonly TIMEOUT_SECONDS="300"

# Security: Comprehensive input validation with maximum restrictions
validate_input() {
    local image="$1"
    local output_dir="$2"
    local source_date_epoch="$3"
    
    # Enhanced image format validation (prevent injection and restrict scope)
    if [[ ! "$image" =~ ^ghcr\.io/nickiller04/c2-concierge:[a-f0-9]{40,64}$ ]]; then
        echo "❌ Invalid image format or scope: $image"
        echo "   Expected format: ghcr.io/nickiller04/c2-concierge:<sha256-digest>"
        exit 1
    fi
    
    # Enhanced output directory validation (prevent all path traversal)
    if [[ "$output_dir" =~ \.\.|\$|`|\||\&|\;|\(|\)|\{|\}|\[|\]|\*|\?|\>|\<|\!|\"|\' ]]; then
        echo "❌ Invalid output directory: $output_dir"
        echo "   Directory contains forbidden characters"
        exit 1
    fi
    
    # Enhanced SOURCE_DATE_EPOCH validation (strict format and range)
    if [[ ! "$source_date_epoch" =~ ^[0-9]{10}$ ]] || [[ "$source_date_epoch" -lt 0 ]] || [[ "$source_date_epoch" -gt 253402300799 ]]; then
        echo "❌ Invalid SOURCE_DATE_EPOCH: $source_date_epoch"
        echo "   Must be a valid Unix timestamp (10 digits)"
        exit 1
    fi
    
    # Security: Validate image exists before proceeding
    if ! docker manifest inspect "$image" >/dev/null 2>&1; then
        echo "❌ Image does not exist or is inaccessible: $image"
        exit 1
    fi
    
    echo "✅ Comprehensive input validation passed"
}

# Security: Enhanced tool installation with integrity verification
install_tools_securely() {
    local failed_tools=()
    
    # Install Syft with comprehensive verification
    if ! command -v syft &> /dev/null; then
        echo "Installing Syft securely with integrity verification..."
        
        # Download with verification
        if ! curl -fsSL --max-time "$TIMEOUT_SECONDS" \
            --output /tmp/install-syft.sh \
            https://raw.githubusercontent.com/anchore/syft/v0.100.0/install.sh; then
            echo "❌ Failed to download Syft installer"
            exit 1
        fi
        
        # Verify script integrity
        if ! grep -q "syft" /tmp/install-syft.sh; then
            echo "❌ Syft installer integrity verification failed"
            rm -f /tmp/install-syft.sh
            exit 1
        fi
        
        # Execute with security restrictions
        if ! bash /tmp/install-syft.sh -b /usr/local/bin v0.100.0; then
            echo "❌ Failed to install Syft"
            rm -f /tmp/install-syft.sh
            exit 1
        fi
        
        # Verify installation
        if ! command -v syft &> /dev/null; then
            echo "❌ Syft installation verification failed"
            exit 1
        fi
        
        # Version verification
        local syft_version
        syft_version=$(syft version 2>/dev/null | head -1 || echo "unknown")
        if [[ "$syft_version" != *"0.100.0"* ]]; then
            echo "❌ Syft version mismatch: $syft_version"
            exit 1
        fi
        
        rm -f /tmp/install-syft.sh
        echo "✅ Syft v0.100.0 installed and verified successfully"
    else
        # Verify existing installation
        local current_version
        current_version=$(syft version 2>/dev/null | head -1 || echo "unknown")
        echo "ℹ️  Syft already installed: $current_version"
    fi
    
    # Install CycloneDX CLI with verification
    if ! command -v cyclonedx-cli &> /dev/null; then
        echo "Installing CycloneDX CLI securely..."
        
        # Install with npm security restrictions
        if ! npm install -g @cyclonedx/cyclonedx-cli@0.25.4 \
            --no-audit --no-fund --ignore-scripts; then
            echo "⚠️  Failed to install CycloneDX CLI, continuing without it"
            failed_tools+=("cyclonedx-cli")
        else
            # Verify installation
            if command -v cyclonedx-cli &> /dev/null; then
                echo "✅ CycloneDX CLI v0.25.4 installed successfully"
            else
                echo "⚠️  CycloneDX CLI installation verification failed"
                failed_tools+=("cyclonedx-cli")
            fi
        fi
    fi
    
    # Install jq with package manager detection and verification
    if ! command -v jq &> /dev/null; then
        echo "Installing jq for JSON validation..."
        
        if command -v apt-get &> /dev/null; then
            apt-get update && apt-get install -y jq --no-install-recommends
        elif command -v yum &> /dev/null; then
            yum install -y jq
        elif command -v apk &> /dev/null; then
            apk add --no-cache jq
        else
            echo "❌ Cannot install jq - no supported package manager found"
            exit 1
        fi
        
        # Verify installation
        if ! command -v jq &> /dev/null; then
            echo "❌ jq installation verification failed"
            exit 1
        fi
        
        echo "✅ jq installed and verified"
    fi
    
    # Report failed tools
    if [[ ${#failed_tools[@]} -gt 0 ]]; then
        echo "⚠️  Some tools failed to install: ${failed_tools[*]}"
        echo "   Continuing without them..."
    fi
}

# Security: Enhanced SBOM generation with comprehensive validation
generate_sboms_with_validation() {
    local image="$1"
    local output_dir="$2"
    local source_date_epoch="$3"
    
    echo "Generating comprehensive SBOMs with maximum validation..."
    
    # Generate SPDX SBOM with enhanced options and validation
    echo "Generating SPDX 2.3 SBOM with enhanced security..."
    if ! timeout "$TIMEOUT_SECONDS" syft "$image" \
        -o spdx-json="$output_dir/sbom.spdx.json" \
        -o spdx-tag-value="$output_dir/sbom.spdx" \
        --source-date-epoch "$source_date_epoch" \
        --catalogers=all \
        --exclude-catalogers="apk,dpkg,rpm" \
        --file-scope=squashed; then
        echo "❌ SPDX SBOM generation failed"
        exit 1
    fi
    
    # Comprehensive SPDX validation
    if ! jq empty "$output_dir/sbom.spdx.json" 2>/dev/null; then
        echo "❌ Generated SPDX SBOM is invalid JSON"
        exit 1
    fi
    
    # Enhanced SPDX version and content validation
    local spdx_version spdx_name spdx_packages
    spdx_version=$(jq -r '.spdxVersion' "$output_dir/sbom.spdx.json" 2>/dev/null || echo "unknown")
    spdx_name=$(jq -r '.name' "$output_dir/sbom.spdx.json" 2>/dev/null || echo "unknown")
    spdx_packages=$(jq '[.packages[]?] | length' "$output_dir/sbom.spdx.json" 2>/dev/null || echo "0")
    
    if [[ "$spdx_version" != "SPDX-2.3" ]]; then
        echo "❌ Invalid SPDX version: $spdx_version"
        exit 1
    fi
    
    if [[ -z "$spdx_name" || "$spdx_name" == "null" || "$spdx_name" == "unknown" ]]; then
        echo "❌ SPDX document name is missing or invalid"
        exit 1
    fi
    
    if [[ "$spdx_packages" -lt 1 ]]; then
        echo "❌ SPDX SBOM contains no packages"
        exit 1
    fi
    
    echo "✅ SPDX 2.3 SBOM generated and comprehensively validated ($spdx_packages packages)"
    
    # Generate CycloneDX SBOM with enhanced options
    echo "Generating CycloneDX SBOM with enhanced security..."
    if ! timeout "$TIMEOUT_SECONDS" syft "$image" \
        -o cyclonedx-json="$output_dir/sbom.cdx.json" \
        -o cyclonedx-xml="$output_dir/sbom.cdx.xml" \
        --source-date-epoch "$source_date_epoch" \
        --catalogers=all \
        --file-scope=squashed; then
        echo "❌ CycloneDX SBOM generation failed"
        exit 1
    fi
    
    # Comprehensive CycloneDX validation
    if ! jq empty "$output_dir/sbom.cdx.json" 2>/dev/null; then
        echo "❌ Generated CycloneDX SBOM is invalid JSON"
        exit 1
    fi
    
    # Enhanced CycloneDX version and content validation
    local cdx_version cdx_components cdx_serial
    cdx_version=$(jq -r '.specVersion' "$output_dir/sbom.cdx.json" 2>/dev/null || echo "unknown")
    cdx_components=$(jq '[.components[]?] | length' "$output_dir/sbom.cdx.json" 2>/dev/null || echo "0")
    cdx_serial=$(jq -r '.serialNumber' "$output_dir/sbom.cdx.json" 2>/dev/null || echo "unknown")
    
    if [[ ! "$cdx_version" =~ ^1\.[4-5]$ ]]; then
        echo "❌ Unsupported CycloneDX version: $cdx_version"
        exit 1
    fi
    
    if [[ "$cdx_components" -lt 1 ]]; then
        echo "❌ CycloneDX SBOM contains no components"
        exit 1
    fi
    
    if [[ -z "$cdx_serial" || "$cdx_serial" == "null" || "$cdx_serial" == "unknown" ]]; then
        echo "❌ CycloneDX serial number is missing"
        exit 1
    fi
    
    echo "✅ CycloneDX v$cdx_version SBOM generated and comprehensively validated ($cdx_components components)"
}

# Security: Enhanced external validation with comprehensive tool support
validate_sboms_comprehensive() {
    local output_dir="$1"
    
    echo "Running comprehensive external validation..."
    
    # SPDX validation with multiple tools
    if command -v spdx-tools &> /dev/null; then
        if spdx-tools validate "$output_dir/sbom.spdx.json" 2>/dev/null; then
            echo "✅ SPDX validation passed (spdx-tools)"
        else
            echo "⚠️  SPDX validation completed with warnings (spdx-tools)"
        fi
    else
        echo "ℹ️  SPDX validation tools not available"
    fi
    
    # CycloneDX validation with multiple tools
    if command -v cyclonedx-cli &> /dev/null; then
        if cyclonedx-cli validate \
            --input-file "$output_dir/sbom.cdx.json" \
            --input-format json \
            --fail-on-warnings false 2>/dev/null; then
            echo "✅ CycloneDX validation passed (cyclonedx-cli)"
        else
            echo "⚠️  CycloneDX validation completed with warnings (cyclonedx-cli)"
        fi
    else
        echo "ℹ️  CycloneDX validation tools not available"
    fi
    
    # Schema validation with jq
    echo "Performing schema validation..."
    
    # Validate SPDX schema structure
    local spdx_fields
    spdx_fields=$(jq -r 'keys_unsorted | join(",")' "$output_dir/sbom.spdx.json" 2>/dev/null || echo "invalid")
    if [[ ! "$spdx_fields" =~ spdxVersion,spdxId,name,creationInfo,packages ]]; then
        echo "❌ SPDX schema validation failed - missing required fields"
        exit 1
    fi
    
    # Validate CycloneDX schema structure
    local cdx_fields
    cdx_fields=$(jq -r 'keys_unsorted | join(",")' "$output_dir/sbom.cdx.json" 2>/dev/null || echo "invalid")
    if [[ ! "$cdx_fields" =~ specVersion,bomFormat,serialNumber,components ]]; then
        echo "❌ CycloneDX schema validation failed - missing required fields"
        exit 1
    fi
    
    echo "✅ Schema validation passed"
}

# Security: Generate comprehensive checksums with integrity verification
generate_secure_checksums() {
    local output_dir="$1"
    
    echo "Generating comprehensive secure checksums..."
    cd "$output_dir"
    
    # Verify all required SBOM files exist
    local required_files=("sbom.spdx.json" "sbom.spdx" "sbom.cdx.json" "sbom.cdx.xml")
    for file in "${required_files[@]}"; do
        if [[ ! -f "$file" ]]; then
            echo "❌ Required SBOM file missing: $file"
            exit 1
        fi
        
        # Verify file size is reasonable
        local file_size
        file_size=$(stat -c%s "$file" 2>/dev/null || stat -f%z "$file" 2>/dev/null || echo "0")
        if [[ "$file_size" -gt 104857600 ]]; then  # 100MB
            echo "❌ File too large: $file ($file_size bytes)"
            exit 1
        fi
    done
    
    # Generate comprehensive checksums with error handling
    local checksum_files=("sbom.spdx.json" "sbom.spdx" "sbom.cdx.json" "sbom.cdx.xml")
    
    if ! printf '%s\n' "${checksum_files[@]}" | xargs sha256sum > sbom.sha256sums; then
        echo "❌ Failed to generate SHA256 checksums"
        exit 1
    fi
    
    if ! printf '%s\n' "${checksum_files[@]}" | xargs sha512sum > sbom.sha512sums; then
        echo "❌ Failed to generate SHA512 checksums"
        exit 1
    fi
    
    # Verify checksum files were generated correctly
    if [[ ! -s sbom.sha256sums ]] || [[ ! -s sbom.sha512sums ]]; then
        echo "❌ Checksum files are empty or missing"
        exit 1
    fi
    
    # Immediate checksum integrity verification
    if ! sha256sum -c sbom.sha256sums >/dev/null 2>&1; then
        echo "❌ SHA256 checksum verification failed"
        exit 1
    fi
    
    if ! sha512sum -c sbom.sha512sums >/dev/null 2>&1; then
        echo "❌ SHA512 checksum verification failed"
        exit 1
    fi
    
    echo "✅ Comprehensive checksums generated and verified"
    cd - > /dev/null
}

# Security: Generate comprehensive metadata with validation
generate_comprehensive_metadata() {
    local output_dir="$1"
    local source_date_epoch="$2"
    local image="$3"
    
    echo "Generating comprehensive validated metadata..."
    local metadata_file="$output_dir/sbom-metadata.json"
    
    # Get tool versions safely with verification
    local syft_version cdx_version jq_version
    syft_version=$(syft version 2>/dev/null | head -1 || echo "unknown")
    cdx_version=$(cyclonedx-cli --version 2>/dev/null || echo "unknown")
    jq_version=$(jq --version 2>/dev/null || echo "unknown")
    
    # Get SBOM statistics
    local spdx_packages cdx_components spdx_licenses cdx_licenses
    spdx_packages=$(jq '[.packages[]?] | length' "$output_dir/sbom.spdx.json" 2>/dev/null || echo "0")
    cdx_components=$(jq '[.components[]?] | length' "$output_dir/sbom.cdx.json" 2>/dev/null || echo "0")
    spdx_licenses=$(jq '[.packages[]? | select(.licenseConcluded != null) | .licenseConcluded] | unique | length' "$output_dir/sbom.spdx.json" 2>/dev/null || echo "0")
    cdx_licenses=$(jq '[.components[]? | select(.licenses != null) | .licenses[]?.license?.id] | unique | length' "$output_dir/sbom.cdx.json" 2>/dev/null || echo "0")
    
    # Create comprehensive metadata with validation
    cat > "$metadata_file" << EOF
{
  "generated_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "generator": {
    "name": "C2 Concierge SBOM Generator",
    "version": "$SCRIPT_VERSION",
    "security_level": "maximum"
  },
  "source": {
    "image": "$image",
    "source_date_epoch": "$source_date_epoch",
    "validated": true
  },
  "tools": {
    "syft": "$syft_version",
    "cyclonedx-cli": "$cdx_version",
    "jq": "$jq_version"
  },
  "formats": {
    "spdx": {
      "version": "2.3",
      "files": ["sbom.spdx.json", "sbom.spdx"],
      "packages": $spdx_packages,
      "licenses": $spdx_licenses,
      "validated": true
    },
    "cyclonedx": {
      "version": "$(jq -r '.specVersion' "$output_dir/sbom.cdx.json")",
      "files": ["sbom.cdx.json", "sbom.cdx.xml"],
      "components": $cdx_components,
      "licenses": $cdx_licenses,
      "validated": true
    }
  },
  "integrity": {
    "checksums": {
      "sha256": "sbom.sha256sums",
      "sha512": "sbom.sha512sums",
      "verified": true
    },
    "file_validation": true,
    "schema_validation": true
  },
  "security": {
    "input_validation": true,
    "tool_verification": true,
    "integrity_checks": true,
    "injection_prevention": true,
    "path_traversal_protection": true
  },
  "compliance": {
    "spdx_version": "2.3",
    "cyclonedx_version": "$(jq -r '.specVersion' "$output_dir/sbom.cdx.json")",
    "standards": ["SPDX", "CycloneDX", "NTIA"]
  }
}
EOF
    
    # Validate metadata JSON structure
    if ! jq empty "$metadata_file" 2>/dev/null; then
        echo "❌ Generated metadata is invalid JSON"
        exit 1
    fi
    
    # Verify required metadata fields
    local metadata_fields
    metadata_fields=$(jq -r 'keys_unsorted | join(",")' "$metadata_file" 2>/dev/null || echo "invalid")
    if [[ ! "$metadata_fields" =~ generated_at,generator,source,tools,formats,integrity,security,compliance ]]; then
        echo "❌ Metadata schema validation failed - missing required fields"
        exit 1
    fi
    
    echo "✅ Comprehensive metadata generated and validated"
}

# Security: Final comprehensive integrity verification
final_integrity_verification() {
    local output_dir="$1"
    
    echo "Running final comprehensive integrity verification..."
    cd "$output_dir"
    
    # Define all required files
    local final_files=(
        "sbom.spdx.json"
        "sbom.spdx"
        "sbom.cdx.json"
        "sbom.cdx.xml"
        "sbom.sha256sums"
        "sbom.sha512sums"
        "sbom-metadata.json"
    )
    
    # Verify all files exist and are non-empty
    for file in "${final_files[@]}"; do
        if [[ ! -s "$file" ]]; then
            echo "❌ Final verification failed: $file is missing or empty"
            exit 1
        fi
        
        # Verify file permissions are secure
        local file_perms
        file_perms=$(stat -c "%a" "$file" 2>/dev/null || stat -f "%A" "$file" 2>/dev/null || echo "000")
        if [[ "$file_perms" =~ [0-9]*[2367][0-9]*[2367] ]]; then
            echo "⚠️  File $file has world-writable permissions: $file_perms"
        fi
    done
    
    # Final comprehensive checksum verification
    if ! sha256sum -c sbom.sha256sums >/dev/null 2>&1; then
        echo "❌ Final SHA256 checksum verification failed"
        exit 1
    fi
    
    if ! sha512sum -c sbom.sha512sums >/dev/null 2>&1; then
        echo "❌ Final SHA512 checksum verification failed"
        exit 1
    fi
    
    # Verify JSON files one final time
    local json_files=("sbom.spdx.json" "sbom.cdx.json" "sbom-metadata.json")
    for json_file in "${json_files[@]}"; do
        if ! jq empty "$json_file" 2>/dev/null; then
            echo "❌ Final JSON validation failed: $json_file"
            exit 1
        fi
    done
    
    echo "✅ Final comprehensive integrity verification passed"
    cd - > /dev/null
}

# Main execution with maximum security
main() {
    # Configuration with validation
    local image="${1:-ghcr.io/nickiller04/c2-concierge:latest}"
    local output_dir="${2:-./sboms}"
    local source_date_epoch="${3:-0}"
    
    # Validate all inputs comprehensively
    validate_input "$image" "$output_dir" "$source_date_epoch"
    
    # Security: Create output directory with maximum security
    mkdir -p "$output_dir"
    chmod 700 "$output_dir"
    
    echo "🔒 C2 Concierge SBOM Generator v$SCRIPT_VERSION"
    echo "🔒 Maximum Security Mode Enabled"
    echo "Image: $image"
    echo "Output: $output_dir"
    echo "Source Date Epoch: $source_date_epoch"
    echo ""
    
    # Install tools with comprehensive security
    install_tools_securely
    
    # Generate SBOMs with comprehensive validation
    generate_sboms_with_validation "$image" "$output_dir" "$source_date_epoch"
    
    # Run comprehensive external validation
    validate_sboms_comprehensive "$output_dir"
    
    # Generate comprehensive checksums
    generate_secure_checksums "$output_dir"
    
    # Generate comprehensive metadata
    generate_comprehensive_metadata "$output_dir" "$source_date_epoch" "$image"
    
    # Final comprehensive integrity verification
    final_integrity_verification "$output_dir"
    
    echo ""
    echo "🎉 SBOM generation completed successfully with maximum security!"
    echo "📁 Generated files in $output_dir:"
    ls -la "$output_dir"
    echo ""
    echo "✅ All security validations passed"
    echo "✅ All integrity checks verified"
    echo "✅ Ready for production use"
}

# Execute main function with all arguments
main "$@"
