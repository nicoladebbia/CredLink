# Phase 48 - Compliance v2 API Documentation

## Overview

The Compliance v2 API provides REST endpoints for generating unified compliance packs, managing retention policies, and monitoring compliance status across EU, UK, US, and Brazil regulatory requirements.

## Base URL

```
Production: https://api.credlink.com/v1
Development: http://localhost:3000
```

## Authentication

All API requests require authentication using Bearer tokens:

```
Authorization: Bearer <your-api-token>
```

## API Endpoints

### 1. Generate Compliance Pack

**Endpoint:** `POST /compliance/pack`

**Description:** Generates a unified compliance pack with regional appendices for the specified tenant and period.

**Request Body:**
```json
{
  "tenant_id": "acme-news",
  "period": "2025-10",
  "regions": ["EU", "UK", "US", "BR"],
  "include_samples": 25,
  "format": "both",
  "dry_run": false
}
```

**Parameters:**
- `tenant_id` (string, required): Unique tenant identifier
- `period` (string, required): Reporting period in YYYY-MM format
- `regions` (array, required): Array of regions ("EU", "UK", "US", "BR")
- `include_samples` (integer, optional): Number of sample assets to include (0-100, default: 25)
- `format` (string, optional): Output format - "pdf", "json", or "both" (default: "both")
- `dry_run` (boolean, optional): Generate pack without persisting (default: false)

**Response:**
```json
{
  "status": "ok",
  "pack_url_pdf": "https://storage.credlink.com/packs/acme-news/2025-10.pdf",
  "pack_url_json": "https://storage.credlink.com/packs/acme-news/2025-10.json",
  "template_versions": {
    "eu_ai": "1.1.0",
    "dsa26": "1.2.0",
    "uk_osa": "1.0.2",
    "us_ftc": "1.0.1",
    "br_lgpd": "1.0.0"
  },
  "generated_at": "2025-11-05T12:00:00.000Z"
}
```

**Error Response:**
```json
{
  "error": "Validation Error",
  "message": "Request validation failed",
  "details": [
    {
      "field": "period",
      "message": "Period must be in YYYY-MM format",
      "code": "INVALID_FORMAT"
    }
  ]
}
```

### 2. Get Retention Policy

**Endpoint:** `POST /compliance/retention`

**Description:** Calculates the strictest-wins retention policy for the specified regions.

**Request Body:**
```json
{
  "tenant_id": "acme-news",
  "regions": ["EU", "BR"],
  "existing_legal_hold": false
}
```

**Parameters:**
- `tenant_id` (string, required): Unique tenant identifier
- `regions` (array, required): Array of regions ("EU", "UK", "US", "BR")
- `existing_legal_hold` (boolean, optional): Whether legal hold is already active (default: false)

**Response:**
```json
{
  "tenant_id": "acme-news",
  "regions": ["EU", "BR"],
  "retention_days": 730,
  "legal_hold": true,
  "purge_scheduled": "2027-11-05T12:00:00.000Z",
  "worm_storage_enabled": true,
  "dsr_hooks_enabled": true,
  "last_updated": "2025-11-05T12:00:00.000Z"
}
```

### 3. Get Compliance Status

**Endpoint:** `GET /compliance/status/{tenant_id}`

**Description:** Retrieves the current compliance status and configuration for a tenant.

**Query Parameters:**
- `regions` (string, optional): Comma-separated list of regions to filter by

**Response:**
```json
{
  "tenant_id": "acme-news",
  "regions": ["EU", "UK", "US", "BR"],
  "status": "active",
  "last_pack_generated": "2025-10-01T00:00:00Z",
  "next_pack_scheduled": "2025-11-01T00:00:00Z",
  "retention_policy": {
    "tenant_id": "acme-news",
    "regions": ["EU", "UK", "US", "BR"],
    "retention_days": 730,
    "legal_hold": true,
    "purge_scheduled": "2027-11-05T12:00:00.000Z",
    "worm_storage_enabled": true,
    "dsr_hooks_enabled": true,
    "last_updated": "2025-11-05T12:00:00.000Z"
  },
  "template_versions": {
    "eu_ai": "1.1.0",
    "dsa26": "1.2.0",
    "uk_osa": "1.0.2",
    "us_ftc": "1.0.1",
    "br_lgpd": "1.0.0"
  },
  "compliance_score": 98.5,
  "alerts": [
    {
      "type": "info",
      "message": "Monthly compliance pack scheduled for November 1",
      "timestamp": "2025-11-05T12:00:00.000Z"
    }
  ]
}
```

### 4. Get Available Templates

**Endpoint:** `GET /compliance/templates`

**Description:** Retrieves available compliance assertion templates, optionally filtered by region.

**Query Parameters:**
- `region` (string, optional): Filter templates by region ("EU", "UK", "US", "BR")

**Response:**
```json
{
  "templates": {
    "cai.disclosure": {
      "label": "cai.disclosure",
      "data": {
        "ai_generated": "boolean",
        "ai_altered": "boolean",
        "disclosure_text_id": "string",
        "locale": "string",
        "visible_badge": "boolean"
      },
      "regions": ["EU"],
      "regulation": "AI Act 2024/1689 Art. 50",
      "version": "1.1.0"
    },
    "ads.transparency": {
      "label": "ads.transparency",
      "data": {
        "sponsor": "string",
        "why_targeted": "string",
        "main_params": "array"
      },
      "regions": ["EU"],
      "regulation": "DSA 2022/2065 Arts. 26/27/39",
      "version": "1.2.0"
    }
  },
  "total_count": 6,
  "region": "EU"
}
```

### 5. Validate Compliance Data

**Endpoint:** `POST /compliance/validate`

**Description:** Validates compliance data against regional requirements before pack generation.

**Request Body:**
```json
{
  "data": {
    "manifests": [...],
    "verify_outcomes": [...],
    "badge_logs": [...],
    "ad_metadata": [...],
    "tsa_receipts": [...]
  },
  "regions": ["EU", "UK"]
}
```

**Response:**
```json
{
  "valid": false,
  "violations": [
    {
      "type": "missing_assertion",
      "message": "Missing required assertion 'cai.disclosure' for region 'EU'"
    },
    {
      "type": "missing_tsa",
      "message": "TSA receipts are missing for signed manifests"
    }
  ]
}
```

### 6. Health Check

**Endpoint:** `GET /health`

**Description:** Returns the health status of the API service.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-11-05T12:00:00.000Z",
  "version": "1.0.0",
  "uptime": 86400
}
```

## Rate Limiting

- **Standard Tier**: 100 requests per minute
- **Premium Tier**: 1000 requests per minute
- **Enterprise Tier**: Unlimited requests

Rate limit headers are included in all responses:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Error Codes

| Code | Description | HTTP Status |
|------|-------------|-------------|
| `INVALID_FORMAT` | Invalid data format provided | 400 |
| `INVALID_REGION` | Unsupported region specified | 400 |
| `MISSING_REQUIRED_FIELD` | Required field is missing | 400 |
| `TENANT_NOT_FOUND` | Tenant does not exist | 404 |
| `PERMISSION_DENIED` | Insufficient permissions | 403 |
| `RATE_LIMIT_EXCEEDED` | Too many requests | 429 |
| `INTERNAL_ERROR` | Internal server error | 500 |

## SDK Examples

### JavaScript/TypeScript

```typescript
import { ComplianceAPIClient } from '@c2/compliance-sdk';

const client = new ComplianceAPIClient({
  baseURL: 'https://api.credlink.com/v1',
  apiKey: 'your-api-key'
});

// Generate compliance pack
const pack = await client.generatePack({
  tenant_id: 'acme-news',
  period: '2025-10',
  regions: ['EU', 'UK', 'US', 'BR'],
  format: 'both'
});

console.log('Pack generated:', pack.pack_url_pdf);
```

### Python

```python
from c2_concierge_sdk import ComplianceClient

client = ComplianceClient(
    base_url='https://api.credlink.com/v1',
    api_key='your-api-key'
)

# Generate compliance pack
pack = client.generate_pack(
    tenant_id='acme-news',
    period='2025-10',
    regions=['EU', 'UK', 'US', 'BR'],
    format='both'
)

print(f'Pack generated: {pack.pack_url_pdf}')
```

### cURL

```bash
# Generate compliance pack
curl -X POST https://api.credlink.com/v1/compliance/pack \
  -H "Authorization: Bearer your-api-key" \
  -H "Content-Type: application/json" \
  -d '{
    "tenant_id": "acme-news",
    "period": "2025-10",
    "regions": ["EU", "UK", "US", "BR"],
    "format": "both"
  }'
```

## Webhooks

### Pack Generation Completed

**Event:** `pack.completed`

**Payload:**
```json
{
  "event": "pack.completed",
  "tenant_id": "acme-news",
  "period": "2025-10",
  "status": "success",
  "pack_url_pdf": "https://storage.credlink.com/packs/acme-news/2025-10.pdf",
  "pack_url_json": "https://storage.credlink.com/packs/acme-news/2025-10.json",
  "generated_at": "2025-11-05T12:00:00.000Z"
}
```

### Compliance Alert

**Event:** `compliance.alert`

**Payload:**
```json
{
  "event": "compliance.alert",
  "tenant_id": "acme-news",
  "alert_type": "warning",
  "message": "Retention policy validation failed",
  "details": {
    "violations": [...]
  },
  "timestamp": "2025-11-05T12:00:00.000Z"
}
```

## Monitoring & Logging

### Metrics Available

- Request count by endpoint
- Response time percentiles
- Error rate by type
- Pack generation success rate
- Retention policy calculations

### Log Format

```json
{
  "timestamp": "2025-11-05T12:00:00.000Z",
  "level": "info",
  "request_id": "req_123456",
  "tenant_id": "acme-news",
  "action": "pack.generated",
  "duration_ms": 2340,
  "status": "success"
}
```

## Security Considerations

1. **Authentication**: All requests must include valid API tokens
2. **Authorization**: Tenants can only access their own data
3. **Encryption**: All data is encrypted in transit and at rest
4. **Audit Logging**: All actions are logged for compliance
5. **Data Privacy**: No personal data is logged or exposed

## Support

- **Documentation**: https://docs.credlink.com
- **Support Email**: support@credlink.com
- **Status Page**: https://status.credlink.com
- **API Versioning**: Current version is v1, backward compatible changes only

## Changelog

### v1.0.0 (2025-11-05)
- Initial release with EU, UK, US, Brazil support
- Unified compliance pack generation
- Strictest-wins retention policy
- Regional assertion templates
- PDF and JSON output formats
