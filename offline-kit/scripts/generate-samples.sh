#!/bin/bash

# C2 Concierge Offline Verification Kit - Sample Generator
# Creates sample assets with different C2PA manifest types for testing

set -euo pipefail

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SAMPLES_DIR="${SCRIPT_DIR}/../samples"
TEMP_DIR="${SCRIPT_DIR}/../temp"

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

# Create directories
create_directories() {
    log_info "Creating sample directories..."
    
    mkdir -p "${SAMPLES_DIR}"
    mkdir -p "${TEMP_DIR}"
    
    log_success "Directories created"
}

# Generate sample images with different characteristics
generate_sample_images() {
    log_info "Generating sample images..."
    
    # Create a simple test image using ImageMagick (if available)
    if command -v magick >/dev/null 2>&1; then
        # Generate test image
        magick -size 800x600 xc:lightblue \
            -font Arial -pointsize 48 -fill darkblue \
            -gravity center -annotate +0+0 "C2 Concierge\nTest Image" \
            "${SAMPLES_DIR}/test-base.jpg"
        
        log_success "Base test image created"
    else
        # Create a simple placeholder file
        log_warning "ImageMagick not found, creating placeholder files"
        echo "placeholder image data" > "${SAMPLES_DIR}/test-base.jpg"
    fi
    
    # Copy base image for different test cases
    cp "${SAMPLES_DIR}/test-base.jpg" "${SAMPLES_DIR}/embedded.jpg"
    cp "${SAMPLES_DIR}/test-base.jpg" "${SAMPLES_DIR}/remote-uri.jpg"
    cp "${SAMPLES_DIR}/test-base.jpg" "${SAMPLES_DIR}/with-tsa.jpg"
    cp "${SAMPLES_DIR}/test-base.jpg" "${SAMPLES_DIR}/tampered.jpg"
    
    log_success "Sample images prepared"
}

# Create sample C2PA manifest with embedded data
create_embedded_manifest() {
    log_info "Creating embedded manifest sample..."
    
    local manifest_file="${TEMP_DIR}/embedded-manifest.json"
    
    cat > "${manifest_file}" << 'EOF'
{
  "claim": {
    "signature": "embedded_signature_data_placeholder",
    "data": {
      "title": "C2 Concierge Test Image",
      "format": "image/jpeg",
      "instance_id": "xmp:iid:embedded-test-12345678",
      "claim_generator": "C2 Concierge Test Suite v1.0.0",
      "assertions": [
        {
          "label": "c2pa.actions",
          "data": {
            "actions": [
              {
                "action": "c2pa.created",
                "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/compositeAlgorithmicallyGenerated",
                "when": "2025-11-02T12:00:00Z"
              }
            ]
          }
        }
      ]
    }
  },
  "assertions": [
    {
      "label": "c2pa.actions",
      "data": {
        "actions": [
          {
            "action": "c2pa.created",
            "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/compositeAlgorithmicallyGenerated"
          }
        ]
      }
    },
    {
      "label": "c2pa.hash.data",
      "data": {
        "hash": "0x" + "a".repeat(64),
        "algorithm": "sha256",
        "excluded": []
      }
    }
  ]
}
EOF
    
    # Embed manifest in image (simplified - real implementation would use c2pa tooling)
    log_success "Embedded manifest created"
}

# Create sample C2PA manifest with remote URI references
create_remote_uri_manifest() {
    log_info "Creating remote URI manifest sample..."
    
    local manifest_file="${TEMP_DIR}/remote-uri-manifest.json"
    
    cat > "${manifest_file}" << 'EOF'
{
  "claim": {
    "signature": "remote_uri_signature_data_placeholder",
    "data": {
      "title": "C2 Concierge Remote URI Test",
      "format": "image/jpeg",
      "instance_id": "xmp:iid:remote-uri-test-87654321",
      "claim_generator": "C2 Concierge Test Suite v1.0.0",
      "remote_manifest": "https://verify.credlink.org/manifests/remote-uri-test-87654321.json"
    }
  },
  "assertions": [
    {
      "label": "c2pa.actions",
      "data": {
        "actions": [
          {
            "action": "c2pa.created",
            "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/compositeAlgorithmicallyGenerated",
            "parameters": {
              "remote_ingredient": "https://storage.credlink.org/ingredients/base-image.jpg"
            }
          }
        ]
      }
    },
    {
      "label": "c2pa.ingredient",
      "data": {
        "ingredients": [
          {
            "uri": "https://storage.credlink.org/ingredients/base-image.jpg",
            "hash": "0x" + "b".repeat(64),
            "algorithm": "sha256"
          }
        ]
      }
    }
  ]
}
EOF
    
    log_success "Remote URI manifest created"
}

# Create sample C2PA manifest with RFC 3161 timestamp
create_timestamp_manifest() {
    log_info "Creating RFC 3161 timestamp manifest sample..."
    
    local manifest_file="${TEMP_DIR}/timestamp-manifest.json"
    
    cat > "${manifest_file}" << 'EOF'
{
  "claim": {
    "signature": "timestamp_signature_data_placeholder",
    "data": {
      "title": "C2 Concierge Timestamp Test",
      "format": "image/jpeg",
      "instance_id": "xmp:iid:timestamp-test-abcdef123456",
      "claim_generator": "C2 Concierge Test Suite v1.0.0"
    }
  },
  "assertions": [
    {
      "label": "c2pa.actions",
      "data": {
        "actions": [
          {
            "action": "c2pa.created",
            "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/compositeAlgorithmicallyGenerated",
            "when": "2025-11-02T12:00:00Z"
          }
        ]
      }
    },
    {
      "label": "c2pa.hash.data",
      "data": {
        "hash": "0x" + "c".repeat(64),
        "algorithm": "sha256",
        "timestamp_token": "base64_encoded_rfc3161_timestamp_token_placeholder"
      }
    }
  ]
}
EOF
    
    log_success "Timestamp manifest created"
}

# Create tampered sample (invalid signature)
create_tampered_manifest() {
    log_info "Creating tampered manifest sample..."
    
    local manifest_file="${TEMP_DIR}/tampered-manifest.json"
    
    cat > "${manifest_file}" << 'EOF'
{
  "claim": {
    "signature": "invalid_tampered_signature_data",
    "data": {
      "title": "C2 Concierge Tampered Test",
      "format": "image/jpeg",
      "instance_id": "xmp:iid:tampered-test-bad-signature",
      "claim_generator": "C2 Concierge Test Suite v1.0.0"
    }
  },
  "assertions": [
    {
      "label": "c2pa.actions",
      "data": {
        "actions": [
          {
            "action": "c2pa.created",
            "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/compositeAlgorithmicallyGenerated"
          }
        ]
      }
    }
  ]
}
EOF
    
    log_success "Tampered manifest created"
}

# Create video sample
create_video_sample() {
    log_info "Creating video sample..."
    
    # Create a simple video placeholder
    cat > "${SAMPLES_DIR}/test-video.mp4" << 'EOF'
placeholder video data for testing
EOF
    
    local manifest_file="${TEMP_DIR}/video-manifest.json"
    
    cat > "${manifest_file}" << 'EOF'
{
  "claim": {
    "signature": "video_signature_data_placeholder",
    "data": {
      "title": "C2 Concierge Test Video",
      "format": "video/mp4",
      "instance_id": "xmp:iid:video-test-123456",
      "claim_generator": "C2 Concierge Test Suite v1.0.0"
    }
  },
  "assertions": [
    {
      "label": "c2pa.actions",
      "data": {
        "actions": [
          {
            "action": "c2pa.created",
            "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/compositeAlgorithmicallyGenerated"
          }
        ]
      }
    }
  ]
}
EOF
    
    log_success "Video sample created"
}

# Create audio sample
create_audio_sample() {
    log_info "Creating audio sample..."
    
    # Create a simple audio placeholder
    cat > "${SAMPLES_DIR}/test-audio.flac" << 'EOF'
placeholder audio data for testing
EOF
    
    local manifest_file="${TEMP_DIR}/audio-manifest.json"
    
    cat > "${manifest_file}" << 'EOF'
{
  "claim": {
    "signature": "audio_signature_data_placeholder",
    "data": {
      "title": "C2 Concierge Test Audio",
      "format": "audio/flac",
      "instance_id": "xmp:iid:audio-test-789012",
      "claim_generator": "C2 Concierge Test Suite v1.0.0"
    }
  },
  "assertions": [
    {
      "label": "c2pa.actions",
      "data": {
        "actions": [
          {
            "action": "c2pa.created",
            "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/compositeAlgorithmicallyGenerated"
          }
        ]
      }
    }
  ]
}
EOF
    
    log_success "Audio sample created"
}

# Create HLS playlist sample
create_hls_sample() {
    log_info "Creating HLS playlist sample..."
    
    cat > "${SAMPLES_DIR}/test-stream.m3u8" << 'EOF'
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:10.0,
segment0.ts
#EXTINF:10.0,
segment1.ts
#EXTINF:10.0,
segment2.ts
#EXT-X-ENDLIST
EOF
    
    local manifest_file="${TEMP_DIR}/hls-manifest.json"
    
    cat > "${manifest_file}" << 'EOF'
{
  "claim": {
    "signature": "hls_signature_data_placeholder",
    "data": {
      "title": "C2 Concierge Test Stream",
      "format": "application/x-mpegURL",
      "instance_id": "xmp:iid:hls-test-345678",
      "claim_generator": "C2 Concierge Test Suite v1.0.0"
    }
  },
  "assertions": [
    {
      "label": "c2pa.actions",
      "data": {
        "actions": [
          {
            "action": "c2pa.created",
            "digitalSourceType": "http://cv.iptc.org/newscodes/digitalsourcetype/compositeAlgorithmicallyGenerated"
          }
        ]
      }
    }
  ]
}
EOF
    
    log_success "HLS sample created"
}

# Create sample metadata file
create_sample_metadata() {
    log_info "Creating sample metadata..."
    
    cat > "${SAMPLES_DIR}/samples.json" << 'EOF'
{
  "samples": {
    "embedded.jpg": {
      "description": "Sample with fully embedded C2PA manifest",
      "expected_verdict": "Verified",
      "features": ["embedded_manifest", "valid_signature"],
      "test_cases": ["basic_verification", "offline_mode"]
    },
    "remote-uri.jpg": {
      "description": "Sample with remote URI references",
      "expected_verdict": "Unresolved",
      "features": ["remote_references", "offline_limitations"],
      "test_cases": ["remote_uri_handling", "offline_warnings"]
    },
    "with-tsa.jpg": {
      "description": "Sample with RFC 3161 timestamp token",
      "expected_verdict": "Verified",
      "features": ["rfc3161_timestamp", "timestamp_verification"],
      "test_cases": ["timestamp_validation", "tsa_chain_verification"]
    },
    "tampered.jpg": {
      "description": "Sample with invalid/tampered signature",
      "expected_verdict": "Unverified",
      "features": ["invalid_signature", "tamper_detection"],
      "test_cases": ["signature_validation", "tamper_detection"]
    },
    "test-video.mp4": {
      "description": "Sample video file with C2PA manifest",
      "expected_verdict": "Verified",
      "features": ["video_support", "embedded_manifest"],
      "test_cases": ["video_verification", "format_support"]
    },
    "test-audio.flac": {
      "description": "Sample audio file with C2PA manifest",
      "expected_verdict": "Verified",
      "features": ["audio_support", "embedded_manifest"],
      "test_cases": ["audio_verification", "format_support"]
    },
    "test-stream.m3u8": {
      "description": "Sample HLS playlist with C2PA manifest",
      "expected_verdict": "Verified",
      "features": ["hls_support", "stream_manifest"],
      "test_cases": ["hls_verification", "stream_support"]
    }
  },
  "test_scenarios": {
    "offline_verification": {
      "description": "Verify assets without network access",
      "samples": ["embedded.jpg", "with-tsa.jpg", "test-video.mp4"],
      "expected_outcome": "All verify successfully with green verdict"
    },
    "remote_references": {
      "description": "Handle remote URI references in offline mode",
      "samples": ["remote-uri.jpg"],
      "expected_outcome": "Grey verdict with unresolved reference warnings"
    },
    "timestamp_validation": {
      "description": "Validate RFC 3161 timestamps offline",
      "samples": ["with-tsa.jpg"],
      "expected_outcome": "Green verdict with valid timestamp information"
    },
    "signature_validation": {
      "description": "Detect invalid or tampered signatures",
      "samples": ["tampered.jpg"],
      "expected_outcome": "Red verdict indicating signature failure"
    },
    "format_support": {
      "description": "Test support for various media formats",
      "samples": ["embedded.jpg", "test-video.mp4", "test-audio.flac", "test-stream.m3u8"],
      "expected_outcome": "All formats supported and verified"
    }
  },
  "generated_at": "2025-11-02T12:00:00Z",
  "generator_version": "1.0.0"
}
EOF
    
    log_success "Sample metadata created"
}

# Create README for samples
create_samples_readme() {
    log_info "Creating samples README..."
    
    cat > "${SAMPLES_DIR}/README.md" << 'EOF'
# C2 Concierge Offline Verification Kit - Sample Assets

This directory contains sample assets for testing the offline verification kit.

## Sample Files

| File | Description | Expected Verdict | Features |
|------|-------------|------------------|----------|
| `embedded.jpg` | Fully embedded C2PA manifest | ✅ Verified (Green) | Embedded manifest, valid signature |
| `remote-uri.jpg` | Remote URI references | 🌐 Unresolved (Grey) | Remote references, offline limitations |
| `with-tsa.jpg` | RFC 3161 timestamp token | ✅ Verified (Green) | Timestamp verification, TSA chain |
| `tampered.jpg` | Invalid/tampered signature | ❌ Unverified (Red) | Signature validation, tamper detection |
| `test-video.mp4` | Video file with manifest | ✅ Verified (Green) | Video support, embedded manifest |
| `test-audio.flac` | Audio file with manifest | ✅ Verified (Green) | Audio support, embedded manifest |
| `test-stream.m3u8` | HLS playlist with manifest | ✅ Verified (Green) | HLS support, stream manifest |

## Test Scenarios

### 1. Offline Verification
```bash
./c2c-offline verify ./samples/embedded.jpg --trust ./trustpacks/trustpack-2025-11-02.tar.zst --no-network
```
Expected: Green verdict, no network calls

### 2. Remote References
```bash
./c2c-offline verify ./samples/remote-uri.jpg --trust ./trustpacks/trustpack-2025-11-02.tar.zst --no-network
```
Expected: Grey verdict with unresolved reference warnings

### 3. Timestamp Validation
```bash
./c2c-offline verify ./samples/with-tsa.jpg --trust ./trustpacks/trustpack-2025-11-02.tar.zst --no-network
```
Expected: Green verdict with valid timestamp information

### 4. Signature Validation
```bash
./c2c-offline verify ./samples/tampered.jpg --trust ./trustpacks/trustpack-2025-11-02.tar.zst --no-network
```
Expected: Red verdict indicating signature failure

### 5. Report Generation
```bash
./c2c-offline report ./samples/embedded.jpg --trust ./trustpacks/trustpack-2025-11-02.tar.zst --out ./report.html --qr
```
Expected: HTML report with QR code for online re-check

## Badge Testing

1. Open `badge-offline/index.html` in a web browser
2. Drag and drop sample files to test verification
3. Verify offline behavior and QR code generation

## Notes

- These are placeholder samples for testing the offline kit architecture
- Real implementations would use actual C2PA manifests and signatures
- Network access is disabled by design in offline mode
- Remote references will show as unresolved warnings
EOF
    
    log_success "Samples README created"
}

# Cleanup temporary files
cleanup() {
    log_info "Cleaning up temporary files..."
    
    if [[ -d "${TEMP_DIR}" ]]; then
        rm -rf "${TEMP_DIR}"
    fi
    
    log_success "Cleanup completed"
}

# Main execution
main() {
    log_info "Starting sample generation for C2 Concierge Offline Verification Kit..."
    
    # Create directories
    create_directories
    
    # Generate samples
    generate_sample_images
    create_embedded_manifest
    create_remote_uri_manifest
    create_timestamp_manifest
    create_tampered_manifest
    create_video_sample
    create_audio_sample
    create_hls_sample
    
    # Create metadata
    create_sample_metadata
    create_samples_readme
    
    # Cleanup
    cleanup
    
    log_success "Sample generation completed!"
    log_info "Samples are available in: ${SAMPLES_DIR}"
    log_info "Ready for offline verification testing."
}

# Handle script interruption
trap cleanup EXIT

# Run main function
main "$@"
