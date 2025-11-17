#!/bin/bash

# C2PA Survival Verification Script
# Tests if C2PA manifest survives through content delivery pipelines

set -euo pipefail

# Configuration
TIMEOUT=30
USER_AGENT="C2Concierge-Survival-Validator/1.0"
VERBOSE=${VERBOSE:-0}

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

log_debug() {
    if [[ "$VERBOSE" == "1" ]]; then
        echo -e "${BLUE}[DEBUG]${NC} $1"
    fi
}

# Usage information
usage() {
    cat << EOF
C2PA Survival Verification Tool

USAGE:
    $0 <URL> [EXPECTED_MANIFEST_URL]

ARGUMENTS:
    URL                    URL to test for C2PA manifest survival
    EXPECTED_MANIFEST_URL  Expected manifest URL (optional, will try to detect)

OPTIONS:
    -v, --verbose          Enable verbose output
    -t, --timeout SECONDS  Request timeout (default: 30)
    -h, --help            Show this help message

EXAMPLES:
    $0 https://example.com/test-image.jpg
    $0 https://example.com/test-image.jpg https://cdn.example.com/manifests/test-123.json
    $0 -v -t 60 https://example.com/test-image.jpg

EXIT CODES:
    0  Manifest survived (embedded, linked, or remote accessible)
    1  Manifest lost or inaccessible
    2  Invalid arguments or network error
    3  Timeout during verification

EOF
}

# Parse command line arguments
parse_args() {
    URL=""
    EXPECTED_MANIFEST=""
    TIMEOUT=30
    VERBOSE=0

    while [[ $# -gt 0 ]]; do
        case $1 in
            -v|--verbose)
                VERBOSE=1
                shift
                ;;
            -t|--timeout)
                TIMEOUT="$2"
                shift 2
                ;;
            -h|--help)
                usage
                exit 0
                ;;
            -*)
                log_error "Unknown option: $1"
                usage
                exit 2
                ;;
            *)
                if [[ -z "$URL" ]]; then
                    URL="$1"
                elif [[ -z "$EXPECTED_MANIFEST" ]]; then
                    EXPECTED_MANIFEST="$1"
                else
                    log_error "Too many arguments"
                    usage
                    exit 2
                fi
                shift
                ;;
        esac
    done

    if [[ -z "$URL" ]]; then
        log_error "URL is required"
        usage
        exit 2
    fi
}

# Make HTTP request with timeout
http_request() {
    local url="$1"
    local method="${2:-GET}"
    local headers="${3:-}"
    
    log_debug "Making $method request to: $url"
    
    local curl_cmd=(
        curl -s -w "%{http_code}|%{time_total}|%{size_download}"
        -m "$TIMEOUT"
        -A "$USER_AGENT"
    )

    if [[ -n "$headers" ]]; then
        curl_cmd+=(-H "$headers")
    fi

    curl_cmd+=("$url")

    local result
    result=$("${curl_cmd[@]}" 2>/dev/null || echo "000|0|0")
    
    echo "$result"
}

# Check if manifest is embedded in HTML
check_embedded_manifest() {
    local url="$1"
    log_debug "Checking for embedded manifest in: $url"
    
    local result
    result=$(http_request "$url")
    
    local http_code="${result%%|*}"
    result="${result#*|}"
    local time_total="${result%%|*}"
    local size_download="${result#*|}"
    
    if [[ "$http_code" != "200" ]]; then
        log_warning "Failed to fetch content: HTTP $http_code"
        return 1
    fi
    
    # Get the actual content
    local content
    content=$(curl -s -m "$TIMEOUT" -A "$USER_AGENT" "$url" 2>/dev/null || echo "")
    
    if [[ -z "$content" ]]; then
        log_warning "Empty content received"
        return 1
    fi
    
    # Check for C2PA manifest indicators
    local manifest_indicators=0
    
    # Check for JSON-LD script with C2PA context
    if echo "$content" | grep -q '"@context"[^>]*"https://schema.org"'; then
        ((manifest_indicators++))
        log_debug "Found JSON-LD with schema.org context"
    fi
    
    # Check for C2PA-specific fields
    if echo "$content" | grep -q -E "(c2pa|provenance|manifest)"; then
        ((manifest_indicators++))
        log_debug "Found C2PA/provenance keywords"
    fi
    
    # Check for Link tags with C2PA manifest
    if echo "$content" | grep -q -E 'rel=["\']?c2pa-manifest["\']?'; then
        ((manifest_indicators++))
        log_debug "Found C2PA manifest link tag"
    fi
    
    if [[ $manifest_indicators -ge 2 ]]; then
        log_success "Embedded manifest detected ($manifest_indicators indicators)"
        return 0
    else
        log_debug "No embedded manifest found ($manifest_indicators indicators)"
        return 1
    fi
}

# Check for Link headers with C2PA manifest
check_link_headers() {
    local url="$1"
    log_debug "Checking for C2PA Link headers in: $url"
    
    local result
    result=$(http_request "$url" "HEAD")
    
    local http_code="${result%%|*}"
    
    if [[ "$http_code" != "200" ]]; then
        log_warning "Failed to fetch headers: HTTP $http_code"
        return 1
    fi
    
    # Get the actual headers
    local headers
    headers=$(curl -s -I -m "$TIMEOUT" -A "$USER_AGENT" "$url" 2>/dev/null || echo "")
    
    if [[ -z "$headers" ]]; then
        log_warning "Empty headers received"
        return 1
    fi
    
    log_debug "Response headers:"
    if [[ "$VERBOSE" == "1" ]]; then
        echo "$headers" | sed 's/^/  /'
    fi
    
    # Check for C2PA manifest in Link headers
    local c2pa_links
    c2pa_links=$(echo "$headers" | grep -i "link:" | grep -i "c2pa" || echo "")
    
    if [[ -n "$c2pa_links" ]]; then
        log_success "Found C2PA Link headers:"
        echo "$c2pa_links" | sed 's/^/  /'
        return 0
    else
        log_debug "No C2PA Link headers found"
        return 1
    fi
}

# Extract manifest URL from Link headers
extract_manifest_url() {
    local url="$1"
    log_debug "Extracting manifest URL from: $url"
    
    local headers
    headers=$(curl -s -I -m "$TIMEOUT" -A "$USER_AGENT" "$url" 2>/dev/null || echo "")
    
    local manifest_url
    manifest_url=$(echo "$headers" | grep -i "link:" | grep -i "c2pa" | sed -n 's/.*<\([^>]*\)>.*/\1/p' | head -1)
    
    if [[ -n "$manifest_url" ]]; then
        echo "$manifest_url"
        return 0
    else
        return 1
    fi
}

# Check if remote manifest is accessible
check_remote_manifest() {
    local manifest_url="$1"
    log_debug "Checking remote manifest accessibility: $manifest_url"
    
    local result
    result=$(http_request "$manifest_url")
    
    local http_code="${result%%|*}"
    result="${result#*|}"
    local time_total="${result%%|*}"
    local size_download="${result#*|}"
    
    log_debug "Manifest response: HTTP $http_code, ${time_total}s, ${size_download} bytes"
    
    if [[ "$http_code" == "200" && "$size_download" -gt 0 ]]; then
        log_success "Remote manifest accessible: $manifest_url"
        
        # Validate it's actually a C2PA manifest
        local content
        content=$(curl -s -m "$TIMEOUT" -A "$USER_AGENT" "$manifest_url" 2>/dev/null || echo "")
        
        if echo "$content" | grep -q -E "(c2pa|provenance|manifest|@context)"; then
            log_success "Valid C2PA manifest content detected"
            return 0
        else
            log_warning "Manifest accessible but content doesn't appear to be C2PA"
            return 1
        fi
    else
        log_warning "Remote manifest inaccessible: HTTP $http_code"
        return 1
    fi
}

# Main verification function
verify_survival() {
    local url="$1"
    local expected_manifest="$2"
    
    log_info "Starting C2PA survival verification for: $url"
    log_info "Timeout: ${TIMEOUT}s, User-Agent: $USER_AGENT"
    
    local survival_methods=0
    local manifest_url="$expected_manifest"
    
    # Method 1: Check for embedded manifest
    if check_embedded_manifest "$url"; then
        ((survival_methods++))
    fi
    
    # Method 2: Check for Link headers
    if check_link_headers "$url"; then
        ((survival_methods++))
        
        # Extract manifest URL if not provided
        if [[ -z "$manifest_url" ]]; then
            manifest_url=$(extract_manifest_url "$url" || echo "")
        fi
    fi
    
    # Method 3: Check remote manifest
    if [[ -n "$manifest_url" ]]; then
        if check_remote_manifest "$manifest_url"; then
            ((survival_methods++))
        fi
    fi
    
    # Results
    echo
    log_info "Verification Results:"
    echo "  URL tested: $url"
    echo "  Survival methods found: $survival_methods"
    
    if [[ $survival_methods -gt 0 ]]; then
        echo "  Status: ✅ MANIFEST SURVIVED"
        if [[ -n "$manifest_url" ]]; then
            echo "  Manifest URL: $manifest_url"
        fi
        return 0
    else
        echo "  Status: ❌ MANIFEST LOST"
        echo "  No embedded, linked, or remote manifests found"
        return 1
    fi
}

# Main execution
main() {
    parse_args "$@"
    
    log_info "C2PA Survival Verification Tool v1.0"
    echo
    
    if verify_survival "$URL" "$EXPECTED_MANIFEST"; then
        echo
        log_success "C2PA manifest survived the content pipeline!"
        exit 0
    else
        echo
        log_error "C2PA manifest was lost or is inaccessible!"
        exit 1
    fi
}

# Run if called directly
if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
    main "$@"
fi
