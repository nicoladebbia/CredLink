# Phase 27: Edge Signer API Specification

## Edge Worker API

### POST /edge-sign
**Content-Type**: application/json

#### Request Body
```json
{
  "asset_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "policy_id": "newsroom-default-v3",
  "assertions": {
    "c2pa.actions": [
      {
        "digitalSourceType": "https://ns.adobe.com/cloud/photoshop",
        "action": "created"
      }
    ],
    "c2pa.training-minims": {
      "limitations": "no-generative-ai"
    }
  },
  "tenant_id": "acme",
  "tsa": true
}
```

#### Alternative: Inline Asset
```json
{
  "asset_inline": "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "policy_id": "newsroom-default-v3",
  "assertions": {...},
  "tenant_id": "acme",
  "tsa": true
}
```

#### Response Body
```json
{
  "manifest_url": "https://manifests.example.com/sha256/e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.c2pa",
  "signing_mode": "edge-tbs+remote-es256",
  "p95_ms": {
    "wasm": 42,
    "kms": 95,
    "total": 151
  },
  "kms_key_id": "arn:aws:kms:us-east-1:123456789012:key/abcd1234-abcd-1234-abcd-1234abcd1234",
  "tsa_token_url": "https://tsa.example.com/tokens/1234567890.tsr"
}
```

#### Error Responses
```json
{
  "error": "Invalid request",
  "message": "asset_sha256 or asset_inline is required",
  "code": "INVALID_REQUEST"
}
```

```json
{
  "error": "KMS rate limit exceeded",
  "message": "Too many signing requests",
  "code": "KMS_RATE_LIMIT",
  "retry_after": 60
}
```

## Configuration

### wrangler.toml
```toml
name = "c2pa-edge-signer"
main = "src/edge_signer.ts"
compatibility_date = "2024-01-01"

[placement]
mode = "smart"

[limits]
cpu_ms = 150

[[routes]]
pattern = "api.example.com/edge-sign"
zone_name = "example.com"

[vars]
ENVIRONMENT = "production"
CENTRAL_SIGNER_URL = "https://signer.example.com"
KMS_REGION = "us-east-1"

[[kv_namespaces]]
binding = "EDGE_CONFIG"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-namespace-id"

[[r2_buckets]]
binding = "MANIFEST_STORE"
bucket_name = "c2pa-manifests"
```

### Environment Variables
```bash
# Central Signer Configuration
CENTRAL_SIGNER_URL=https://signer.example.com
CENTRAL_SIGNER_API_KEY=your-api-key
KMS_REGION=us-east-1

# Feature Flags
EDGE_SIGNER_ENABLED=false
TENANT_ALLOWLIST=acme,testcorp

# Performance Tuning
CPU_TIMEOUT_MS=150
KMS_TIMEOUT_MS=30000
RETRY_ATTEMPTS=3
RETRY_DELAY_MS=1000

# Observability
LOG_LEVEL=info
METRICS_ENABLED=true
TRACE_SAMPLING_RATE=0.1
```

## Headers

### Request Headers
```
Content-Type: application/json
Authorization: Bearer <api-token>
X-Tenant-ID: <tenant-id>
X-Request-ID: <uuid>
```

### Response Headers
```
Content-Type: application/json
X-Request-ID: <uuid>
X-Signing-Mode: edge-tbs+remote-es256
X-CPU-Time-MS: 42
X-KMS-Time-MS: 95
X-Total-Time-MS: 151
Link: <https://manifests.example.com/sha256/...>.c2pa>; rel="c2pa-manifest"
```

## Rate Limiting

### Per-Tenant Limits
- **Burst**: 10 requests per second
- **Sustained**: 100 requests per minute
- **Daily**: 10,000 requests per day

### Global Limits
- **Total**: 1,000 requests per second
- **KMS**: Respects provider quotas
- **Memory**: 100MB concurrent limit

## Security

### Authentication
- **Bearer Token**: API token validation
- **Tenant Validation**: Tenant must be in allowlist
- **Request Signing**: Optional HMAC signature validation

### Validation Rules
- **Asset Size**: Maximum 32 KiB for inline assets
- **TBS Size**: Maximum 16 KiB for canonicalized data
- **Policy ID**: Must match known policy templates
- **Assertions**: Validated against schema

### CORS
```javascript
{
  "origins": ["https://*.example.com"],
  "methods": ["POST", "OPTIONS"],
  "headers": ["Content-Type", "Authorization", "X-Tenant-ID"],
  "max_age": 86400
}
```
