# C2PA Audit Tool

Forensic-grade C2PA manifest diff and lineage analysis tool that makes provenance changes obvious and defensible. Built with strict adherence to the C2PA 2.2 specification.

## 🎯 Purpose

Deliver a comprehensive audit solution for C2PA manifests that provides:
- **Forensic-grade diff analysis** of manifest changes
- **Lineage reconstruction** with validation status visualization
- **Spec-compliant validation** with exact error codes
- **Multiple output formats** for human and machine consumption
- **Evidence pack export** for audit trails

## 🚀 Features

### Core Capabilities
- **Semantic Diff**: Human-readable comparison of manifest fields with spec references
- **JSON Patch**: RFC 6902 compliant patch operations for programmatic use
- **Merge Patch**: RFC 7386 merge patches for simple updates
- **Lineage Analysis**: Visual DAG of manifest relationships and validation status
- **Raw Manifest Access**: 1-click access to original manifest JSON data

### Validation Engine
- **Spec-Compliant Codes**: Uses exact validation codes from C2PA 2.2 specification
- **Deep Spec Links**: Every validation result links to relevant spec sections
- **Comprehensive Checks**: Signature, timestamp, assertion, and ingredient validation
- **Redaction Handling**: Proper validation of allowed vs disallowed redactions

### Performance & Security
- **SLO Compliance**: ≤400ms for semantic diff, ≤600ms for lineage (p95)
- **Memory Safety**: Bounded data structures to prevent DoS attacks
- **Secure Architecture**: No eval(), CSP enforcement, SRI on scripts
- **Canonical JSON**: JCS (RFC 8785) for stable hashing and comparison

## 📦 Installation

### Prerequisites
- Node.js 20.0.0 or higher
- TypeScript 5.3.3 or higher
- pnpm (recommended) or npm

### Build from Source
```bash
# Clone repository
git clone https://github.com/Nickiller04/CredLink.git
cd CredLink/apps/c2pa-audit

# Install dependencies
pnpm install

# Build the application
pnpm build

# Run tests
pnpm test
```

## 🖥️ Usage

### Web UI
Start the server and access the web interface:
```bash
# Start API server with UI
pnpm start

# Or with custom port/host
pnpm start --port 8080 --host 127.0.0.1
```

Open http://localhost:3000/ui/ to access the web interface.

### CLI Interface

#### Basic Diff Analysis
```bash
# Compare two manifests
c2c-audit diff --base manifest1.c2pa --target manifest2.c2pa

# Output to file
c2c-audit diff --base asset1.jpg --target asset2.jpg --out diff.json

# Generate specific format
c2c-audit diff --base manifest1.json --target manifest2.json --format json-patch
```

#### Lineage Analysis
```bash
# Analyze manifest lineage
c2c-audit lineage --asset complex-asset.jpg

# Limit recursion depth
c2c-audit lineage --asset asset.jpg --max-depth 5

# Include redaction details
c2c-audit lineage --asset asset.jpg --include-redactions
```

#### Raw Manifest Extraction
```bash
# Extract raw manifest data
c2c-audit open-raw --asset asset.jpg

# Export to directory with JUMBF map
c2c-audit open-raw --asset asset.jpg --out ./output --include-jumbf
```

#### Validation
```bash
# Validate single manifest
c2c-audit validate --manifest asset.c2pa --verbose

# Get manifest information
c2c-audit info --manifest asset.jpg
```

### API Usage

#### Diff Analysis
```bash
curl -X POST http://localhost:3000/audit/diff \\
  -H "Content-Type: application/json" \\
  -d '{
    "base": {"manifest_url": "https://example.com/manifest1.c2pa"},
    "target": {"manifest_url": "https://example.com/manifest2.c2pa"},
    "format": ["semantic", "json-patch", "lineage"]
  }'
```

#### File Upload
```bash
curl -X POST http://localhost:3000/audit/diff/upload \\
  -F "base=@manifest1.c2pa" \\
  -F "target=@manifest2.c2pa"
```

#### Evidence Pack Export
```bash
curl -X POST http://localhost:3000/audit/evidence-pack \\
  -H "Content-Type: application/json" \\
  -d '{
    "base": {"asset_url": "https://example.com/asset1.jpg"},
    "target": {"asset_url": "https://example.com/asset2.jpg"}
  }' \\
  -o evidence-pack.json
```

## 📊 Output Formats

### Semantic Diff
Human-readable diff with spec references:
```json
{
  "base": {"manifest_hash": "...", "signer_key_id": "..."},
  "target": {"manifest_hash": "...", "signer_key_id": "..."},
  "signer_diff": {"chain_trust": "trusted→trusted", "algorithm": "ES256→ES256"},
  "tsa_diff": {"provider": "DigiCert→GlobalSign", "genTime_diff_ms": 523},
  "assertions_added": [{"label": "c2pa.training", "path": "#/assertions/7"}],
  "assertions_removed": [{"label": "c2pa.rights.v2", "redacted": true}],
  "validation_codes": {
    "base": ["signingCredential.trusted", "assertion.hashedURI.match"],
    "target": ["signingCredential.trusted", "timestamp.trusted"]
  }
}
```

### JSON Patch (RFC 6902)
Programmatic diff operations:
```json
[
  {"op":"replace","path":"/claim/signature/alg","value":"ES256"},
  {"op":"remove","path":"/assertions/3"},
  {"op":"add","path":"/assertions/-","value":{"label":"c2pa.rights.v2","data":{...}}}
]
```

### Lineage Graph
Visual and programmatic lineage representation:
```json
{
  "nodes": [
    {
      "id": "manifest-hash-1",
      "label": "thumbprint...2024-01-01T00:00:00.000Z",
      "status": "validated",
      "validation_codes": ["signingCredential.trusted"]
    }
  ],
  "edges": [
    {
      "source": "manifest-hash-1",
      "target": "manifest-hash-2",
      "relationship": "parentOf",
      "status": {"valid": true, "codes": ["ingredient.claimSignature.match"]}
    }
  ],
  "validation_summary": {
    "total_nodes": 5,
    "validated_nodes": 4,
    "warning_nodes": 1,
    "failed_nodes": 0,
    "overall_status": "validated_with_warnings"
  }
}
```

### Evidence Pack
Complete audit export:
```json
{
  "base_raw": "...",
  "target_raw": "...",
  "semantic_diff": {...},
  "lineage_graph": {...},
  "verification_transcript": {
    "base_verification": [...],
    "target_verification": [...],
    "timestamps": {...}
  },
  "exported_at": "2024-01-01T00:00:00.000Z"
}
```

## 🧪 Validation Codes

The tool uses exact validation codes from the C2PA 2.2 specification:

### Signature Validation
- `signingCredential.trusted` - Signing credential is trusted
- `signingCredential.untrusted` - Signing credential is not trusted
- `signingCredential.revoked` - Signing credential has been revoked
- `signingCredential.expired` - Signing credential has expired
- `signature.valid` - Signature is cryptographically valid
- `signature.invalid` - Signature is invalid
- `signature.algorithmNotAllowed` - Signature algorithm is not allowed

### Timestamp Validation
- `timestamp.trusted` - RFC 3161 timestamp is trusted
- `timestamp.untrusted` - Timestamp is not trusted
- `timestamp.invalid` - Timestamp is invalid
- `timestamp.missing` - No timestamp evidence present

### Assertion Validation
- `assertion.hashedURI.match` - Assertion hash matches hashed URI
- `assertion.hashedURI.mismatch` - Assertion hash does not match hashed URI
- `assertion.missing` - Required assertion is missing
- `assertion.notRedacted` - Assertion is not redacted
- `assertion.invalidRedaction` - Assertion redaction is not allowed
- `assertion.redactionAllowed` - Assertion redaction is allowed

### Ingredient Validation
- `ingredient.claimSignature.match` - Ingredient claim signature matches
- `ingredient.claimSignature.mismatch` - Ingredient claim signature mismatch
- `ingredient.manifestMissing` - Ingredient manifest is missing
- `ingredient.validationFailed` - Ingredient validation failed

### Manifest Validation
- `manifest.structureValid` - Manifest structure is valid
- `manifest.structureInvalid` - Manifest structure is invalid
- `manifest.versionSupported` - Manifest version is supported
- `manifest.versionUnsupported` - Manifest version is not supported

## 🔒 Security Considerations

### Threat Model
The tool is designed with the following security considerations:
- **No Trust Assumptions**: All manifests are validated against trust anchors
- **Timing Attack Prevention**: Uses constant-time comparisons for sensitive data
- **Memory Safety**: Implements bounds checking and memory limits (100MB max)
- **Input Validation**: Strict validation of all inputs and manifests
- **Secure Defaults**: Deny-by-default for algorithms and certificates
- **SSRF Protection**: URL validation with private IP blocking
- **XSS Prevention**: HTML sanitization and CSP enforcement
- **DoS Protection**: Rate limiting (100 req/min), timeout controls, size limits

### Hardening Measures
- **Content Security Policy**: Strict CSP with nonce-based script execution
- **Security Headers**: X-Content-Type-Options, X-Frame-Options, HSTS, etc.
- **No Dynamic Code**: No use of eval() or Function() constructor
- **Input Sanitization**: All user inputs sanitized and validated
- **Output Encoding**: Proper HTML escaping to prevent XSS
- **Rate Limiting**: 100 requests per minute per IP
- **File Upload Security**: Type validation, size limits, filename sanitization
- **Path Traversal Protection**: Path sanitization and validation
- **Request Timeouts**: 30-60 second timeouts to prevent hanging

### Cryptographic Security
- **Approved Algorithms**: ES256, ES384, ES512, PS256, PS384, PS512, RS256, RS384, RS512
- **Certificate Validation**: Full chain validation against trusted anchors
- **Timestamp Validation**: RFC 3161 timestamp verification
- **Hash Algorithms**: SHA-256, SHA-384, SHA-512 only
- **Revocation Checking**: Certificate revocation status validation

### Security Audit
Run comprehensive security audit:
```bash
pnpm security:audit
```

See [SECURITY.md](./SECURITY.md) for complete security policy and vulnerability reporting.

## 📈 Performance

### Service Level Objectives
- **Semantic Diff**: ≤400ms p95 for typical manifests
- **Lineage Analysis**: ≤600ms p95 for ≤10 nodes
- **JSON Patch Generation**: ≤200ms p95
- **Merge Patch Generation**: ≤200ms p95

### Optimization Techniques
- JCS canonicalization caching
- Streaming parsing for large assertion blobs
- Lazy loading of thumbnails and non-critical data
- Parallel validation of assertions and ingredients
- Memory-efficient data structures

### Benchmarks
Typical performance on standard hardware:
- Small manifest (~10 assertions): 50-100ms
- Medium manifest (~50 assertions): 150-300ms
- Large manifest (~200 assertions): 300-400ms
- Complex lineage (10 nodes): 400-600ms

## 🧪 Testing

### Unit Tests
```bash
# Run all unit tests
pnpm test

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test src/tests/canonicalizer.test.ts
```

### Acceptance Tests
The tool includes three critical incident scenarios:

1. **Tamper Detection**: Assertion bytes altered
   - Expected: `assertion.hashedURI.mismatch`, red lineage node
   - Test: `src/tests/acceptance.test.ts` - Scenario 1

2. **Re-encoding Detection**: Asset transformed, manifest untouched
   - Expected: Valid signature, content binding evaluation
   - Test: `src/tests/acceptance.test.ts` - Scenario 2

3. **License Redaction**: Intentional redaction via spec rules
   - Expected: `assertion.redactionAllowed`, green lineage node
   - Test: `src/tests/acceptance.test.ts` - Scenario 3

### Integration Tests
```bash
# Test API endpoints
pnpm test:api

# Test CLI commands
pnpm test:cli

# Test UI components
pnpm test:ui
```

## 🔧 Configuration

### Environment Variables
```bash
# Server configuration
PORT=3000
HOST=0.0.0.0

# Trust anchors
TRUST_ANCHORS_PATH=/path/to/trust-anchors.pem

# Logging
LOG_LEVEL=info
LOG_FORMAT=json

# Security
MAX_FILE_SIZE=104857600  # 100MB
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=900000  # 15 minutes
```

### Trust Anchors
Configure trusted certificate anchors:
```json
{
  "trust_anchors": [
    {
      "subject": "CN=DigiCert TSA Root CA",
      "public_key": "base64-encoded-public-key",
      "thumbprint": "sha256-hash"
    }
  ]
}
```

## 📚 API Reference

### Endpoints

#### `POST /audit/diff`
Generate diff between two manifests.

**Request:**
```json
{
  "base": {"manifest_url": "https://..."},
  "target": {"manifest_url": "https://..."},
  "format": ["semantic", "json-patch", "merge-patch", "lineage"]
}
```

**Response:** See Output Formats section

#### `POST /audit/diff/upload`
Upload files for diff analysis.

**Request:** multipart/form-data with `base` and `target` files

#### `POST /audit/lineage`
Analyze manifest lineage.

**Request:**
```json
{
  "asset": {"asset_url": "https://..."},
  "maxDepth": 10
}
```

#### `POST /audit/evidence-pack`
Export complete evidence pack.

#### `GET /audit/raw/:url`
Fetch raw manifest JSON.

#### `GET /audit/validation-codes`
Get validation code reference.

### Response Codes
- `200` - Success
- `400` - Bad request (invalid parameters)
- `422` - Validation error (manifest validation failed)
- `500` - Internal server error

## 🤝 Contributing

### Development Setup
```bash
# Clone and setup
git clone https://github.com/Nickiller04/CredLink.git
cd CredLink/apps/c2pa-audit
pnpm install

# Development mode
pnpm dev

# Run tests
pnpm test

# Lint code
pnpm lint

# Format code
pnpm format
```

### Code Standards
- TypeScript with strict mode
- ESLint for linting
- Prettier for formatting
- Vitest for testing
- Conventional commits

### Submitting Changes
1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Ensure all tests pass
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details.

## 🙏 Acknowledgments

- **C2PA Specification**: https://spec.c2pa.org/
- **RFC 3161**: Time-Stamp Protocol
- **RFC 6902**: JSON Patch
- **RFC 7386**: JSON Merge Patch
- **RFC 8785**: JSON Canonicalization Scheme

## 🔗 Related Projects

- **c2patool**: Command-line tool for C2PA manifests
- **c2pa-rs**: Rust implementation of C2PA
- **CAI Examples**: Sample manifests for testing

## 📞 Support

- **Issues**: https://github.com/Nickiller04/CredLink/issues
- **Discussions**: https://github.com/Nickiller04/CredLink/discussions
- **Specification**: https://spec.c2pa.org/

---

**⚠️ Important**: This tool analyzes provenance data but cannot verify content authenticity. "Provenance ≠ Truth" - always verify content through multiple trusted sources.
