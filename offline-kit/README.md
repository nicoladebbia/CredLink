# C2 Concierge Offline Verification Kit

## Purpose
A self-contained, air-gapped verification kit for courtrooms, secure newsrooms, and crisis operations. Verifies C2PA manifests against a bundled trust-root snapshot without network access.

## Architecture
```
offline-kit/
├── bin/                          # CLI binaries (static)
│   ├── c2c-offline-darwin.zip
│   ├── c2c-offline-linux.tar.gz
│   └── c2c-offline-win.zip
├── badge-offline/                # Static badge viewer
│   ├── index.html
│   ├── app.js
│   ├── c2pa.wasm
│   └── styles.css
├── trustpacks/                   # Signed trust bundles
│   └── trustpack-2025-11-02.tar.zst
├── samples/                      # Demo corpus
│   ├── embedded.jpg
│   ├── remote-uri.webp
│   ├── hls.m3u8
│   ├── audio.flac
│   └── with-tsa.jpg
├── docs/                         # Documentation
└── tests/                        # Acceptance tests
```

## Features
- **Zero Network**: Hard-disabled HTTP(S) in CLI and badge
- **RFC 3161 Timestamps**: Offline timestamp verification
- **Trust Packs**: Signed, updatable trust root bundles
- **QR Reports**: Local reports with QR codes for online recheck
- **Cross-Platform**: macOS, Windows, Linux support

## Quick Start
```bash
# Verify asset offline
./c2c-offline verify ./samples/embedded.jpg --trust ./trustpacks/trustpack-2025-11-02.tar.zst --no-network

# Generate report with QR code
./c2c-offline report ./samples/embedded.jpg --out ./report.html --qr

# Update trust pack from USB
./c2c-offline trust update ./trustpack-2026-01-15.tar.zst
```

## Security Level
Maximum security hardening with air-gap operation and deterministic verification.
