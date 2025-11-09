# How to Verify Offline

## Overview

The CredLink Offline Verification Kit enables air-gapped verification of C2PA manifests without any network access. This is essential for courtrooms, secure newsrooms, and crisis operations where network connectivity is restricted or prohibited.

## Quick Start

### 1. Extract the Kit

```bash
# Linux/macOS
tar -xzf c2c-offline-{platform}-x86_64-{version}.tar.gz
cd c2c-offline-{platform}-x86_64-{version}

# Windows
# Extract the ZIP file and navigate to the directory
```

### 2. Install Trust Pack

```bash
# Copy trust pack from USB or secure media
cp /path/to/trustpack-2025-11-02.tar.zst ./trustpacks/

# Verify trust pack integrity
./bin/c2c-offline trust status
```

### 3. Verify an Asset

```bash
# Basic verification (no network)
./bin/c2c-offline verify ./samples/embedded.jpg \
  --trust ./trustpacks/trustpack-2025-11-02.tar.zst \
  --no-network

# Generate detailed report with QR code
./bin/c2c-offline report ./samples/embedded.jpg \
  --trust ./trustpacks/trustpack-2025-11-02.tar.zst \
  --out ./verification-report.html \
  --qr
```

## CLI Reference

### verify Command

Verifies an asset file offline without network access.

```bash
./bin/c2c-offline verify <asset_file> --trust <trust_pack> --no-network
```

**Parameters:**
- `asset_file`: Path to the asset file (image, video, audio)
- `--trust`: Path to trust pack (.trustpack.tar.zst)
- `--no-network`: Disable network access (always enforced)

**Exit Codes:**
- `0`: Verified (green)
- `2`: Verified with warnings (yellow)
- `3`: Unverified (red)
- `4`: Unresolved references (grey)
- `10`: Trust pack outdated

**Examples:**

```bash
# Verify image with embedded manifest
./bin/c2c-offline verify ./evidence/photo.jpg \
  --trust ./trustpacks/trustpack-2025-11-02.tar.zst \
  --no-network

# Verify video file
./bin/c2c-offline verify ./video/evidence.mp4 \
  --trust ./trustpacks/trustpack-2025-11-02.tar.zst \
  --no-network

# Verify audio file
./bin/c2c-offline verify ./audio/interview.flac \
  --trust ./trustpacks/trustpack-2025-11-02.tar.zst \
  --no-network
```

### report Command

Generates a detailed local report with QR code for online re-check.

```bash
./bin/c2c-offline report <asset_file> --trust <trust_pack> --out <output_file> --qr
```

**Parameters:**
- `asset_file`: Path to the asset file
- `--trust`: Path to trust pack
- `--out`: Output report file (default: report.html)
- `--qr`: Include QR code (default: true)
- `--format`: Report format (html, json, pdf)

**Examples:**

```bash
# Generate HTML report with QR code
./bin/c2c-offline report ./evidence/photo.jpg \
  --trust ./trustpacks/trustpack-2025-11-02.tar.zst \
  --out ./photo-verification.html \
  --qr

# Generate JSON report for automated processing
./bin/c2c-offline report ./evidence/photo.jpg \
  --trust ./trustpacks/trustpack-2025-11-02.tar.zst \
  --out ./photo-verification.json \
  --format json

# Generate PDF report for archival
./bin/c2c-offline report ./evidence/photo.jpg \
  --trust ./trustpacks/trustpack-2025-11-02.tar.zst \
  --out ./photo-verification.pdf \
  --format pdf
```

### trust Command

Manages trust packs for offline verification.

#### Update Trust Pack

```bash
./bin/c2c-offline trust update <new_trust_pack>
```

**Example:**
```bash
./bin/c2c-offline trust update ./trustpacks/trustpack-2025-12-01.tar.zst
```

#### Check Trust Status

```bash
./bin/c2c-offline trust status
```

**Output:**
```
Trust Status:
  Current Pack: a1b2c3d4e5f6789012345678901234567890abcdef
  As-Of Date: 2025-11-02T00:00:00Z
  Version: 1.0.0
  Issuers: 4
  TSA Roots: 2
  Age: 0 days
```

#### Revert to Previous Trust Pack

```bash
./bin/c2c-offline trust revert <pack_hash>
```

**Example:**
```bash
./bin/c2c-offline trust revert a1b2c3d4e5f6789012345678901234567890abcdef
```

## Badge Offline Viewer

The offline badge viewer provides a web-based interface for verification without network access.

### Using the Badge Viewer

1. **Open the Badge:**
   ```bash
   # Open in default browser
   open ./badge-offline/index.html
   
   # Or serve locally (optional)
   python3 -m http.server 8080 --directory ./badge-offline
   ```

2. **Verify Asset:**
   - Drag and drop asset file onto the drop area
   - Or click to select file
   - View verification results immediately

3. **Interpret Results:**
   - **Green (✅)**: Fully verified and trusted
   - **Yellow (⚠️)**: Verified with warnings (e.g., outdated trust)
   - **Red (❌)**: Invalid signature or tampered content
   - **Grey (🌐)**: Unresolved remote references (offline limitation)

### Badge Features

- **Zero Network**: All verification happens locally
- **Drag & Drop**: Intuitive file selection
- **Real-time Results**: Immediate verification feedback
- **QR Codes**: Scan for online re-check when available
- **Detailed Information**: Step-by-step verification breakdown
- **Accessibility**: Full keyboard navigation and screen reader support

## Verification Results

### Understanding Verdicts

#### Verified (Green)
- ✅ Signature chain valid to trusted issuer
- ✅ Content binding integrity verified
- ✅ Timestamp valid (if present)
- ✅ Trust pack current
- ✅ No unresolved references

#### Verified with Warnings (Yellow)
- ⚠️ Core verification passed but with warnings
- ⚠️ Trust pack outdated (>90 days)
- ⚠️ Timestamp verification inconclusive
- ⚠️ Minor validation issues

#### Unverified (Red)
- ❌ Invalid signature or tampered content
- ❌ Content binding failed
- ❌ Signature chain broken
- ❌ Critical validation errors

#### Unresolved (Grey)
- 🌐 Remote references cannot be verified offline
- 🌐 Network-dependent assertions present
- 🌐 External ingredients unreachable

### Report Elements

#### Asset Information
- File path and name
- Asset ID (SHA256)
- Trust pack as-of date
- Network status (DISABLED)

#### Verification Steps
- Manifest extraction and parsing
- Signature chain verification
- Content binding validation
- Timestamp verification (RFC 3161)
- Remote reference detection
- Trust pack freshness check

#### Security Details
- Issuer information and display name
- Certificate validity period
- Timestamp authority details
- Trust pack version and age

#### Warnings and Limitations
- Outdated trust pack warnings
- Unresolved remote references
- Timestamp verification issues
- Offline operation limitations

## Security Considerations

### Air-Gap Operation

The offline kit is designed for maximum security in air-gapped environments:

- **No Network Access**: All network calls are disabled by design
- **Local Verification**: All verification happens on the local machine
- **Signed Trust Packs**: Trust packs are cryptographically signed
- **Immutable Logs**: Verification attempts are logged locally

### Trust Pack Security

- **Vendor Signing**: Trust packs signed with CredLink vendor keys
- **Integrity Verification**: Trust pack signatures verified before use
- **Version Control**: Track trust pack versions and rollback capability
- **Secure Distribution**: Trust packs distributed via secure media

### Data Protection

- **No Data Exfiltration**: No data leaves the secure environment
- **Local Processing**: All processing happens locally
- **Temporary Files**: Temporary files securely cleaned up
- **Memory Protection**: Sensitive data cleared from memory

## Troubleshooting

### Common Issues

#### "Trust pack not found"
```bash
# Solution: Install trust pack
./bin/c2c-offline trust update ./trustpack-2025-11-02.tar.zst
```

#### "Asset file not found"
```bash
# Solution: Check file path
ls -la ./evidence/photo.jpg
./bin/c2c-offline verify ./evidence/photo.jpg --trust ./trustpacks/trustpack-2025-11-02.tar.zst
```

#### "Permission denied"
```bash
# Solution: Make binary executable (Unix systems)
chmod +x ./bin/c2c-offline
```

#### "Signature verification failed"
- **Cause**: Asset tampered or invalid signature
- **Action**: Treat as unverified, investigate source
- **Prevention**: Verify source integrity before use

#### "Trust pack outdated"
```bash
# Solution: Update trust pack from secure source
./bin/c2c-offline trust update ./new-trustpack-2025-12-01.tar.zst
```

### Debug Mode

Enable debug logging for troubleshooting:

```bash
# Set debug environment variable
export RUST_LOG=debug
./bin/c2c-offline verify ./asset.jpg --trust ./trustpack-2025-11-02.tar.zst --no-network
```

### Log Files

Verification logs are stored in:
- Linux/macOS: `~/.c2c-offline/logs/`
- Windows: `%USERPROFILE%\.c2c-offline\logs\`

## Best Practices

### Operational Security

1. **Secure Media**: Transfer assets and trust packs via secure media only
2. **Integrity Verification**: Always verify file integrity before use
3. **Access Control**: Limit access to verification tools and results
4. **Audit Trail**: Maintain logs of all verification activities
5. **Regular Updates**: Update trust packs regularly via secure channels

### Verification Workflow

1. **Preparation**: Install offline kit and trust packs
2. **Integrity Check**: Verify all files are intact
3. **Asset Transfer**: Transfer assets via secure media
4. **Verification**: Verify assets offline
5. **Documentation**: Generate and archive reports
6. **Online Re-check**: Use QR codes when online access is available

### Courtroom Usage

1. **Pre-Trial**: Prepare verification kit and trust packs
2. **Evidence Transfer**: Transfer evidence via secure media
3. **Verification**: Verify evidence integrity in court
4. **Reporting**: Generate reports for the record
5. **Cross-Examination**: Use QR codes for independent verification

## Support

For technical support and security issues:

- **Documentation**: Complete documentation in `docs/` directory
- **Samples**: Test files in `samples/` directory
- **Security**: Report security issues through secure channels
- **Updates**: Trust pack updates via secure distribution

## Version Information

- **Kit Version**: Check with `./bin/c2c-offline version`
- **Trust Pack Version**: Check with `./bin/c2c-offline trust status`
- **Build Information**: Included in verification reports

The offline verification kit maintains strict version control for reproducibility and auditability.
