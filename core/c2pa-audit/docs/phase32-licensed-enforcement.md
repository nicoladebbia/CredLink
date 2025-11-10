# Phase 32 — Licensed Content Enforcement Hooks (v1.1)

## Overview

Phase 32 implements C2PA-compliant non-DRM guardrails for licensed content enforcement. The system encodes license terms as first-class assertions, surfaces them in the C2-badge, and emits privacy-safe verification events that partners can consume to implement soft-blocking or review workflows.

## Architecture

### Core Components

1. **License Metadata Encoder** (`src/core/license-metadata.ts`)
   - Creates and validates `c2pa.metadata` assertions
   - Canonicalizes license URIs to standard forms
   - Supports Creative Commons and commercial licenses

2. **Verify Events System** (`src/core/verify-events.ts`)
   - HMAC-signed webhook event delivery
   - Replay attack prevention and timestamp validation
   - Exponential backoff retry logic

3. **License Enforcement API** (`src/api/license-enforcement.ts`)
   - Asset verification endpoint
   - Partner webhook management
   - Appeal processing system

4. **C2 Badge Component** (`src/ui/c2-badge.ts`)
   - License-aware UI with soft-block states
   - Preview degradation effects
   - Appeal flow integration

5. **CMS/CDN Adapters** (`src/integrations/cms-adapters.ts`)
   - WordPress plugin hooks
   - Shopify theme app extension
   - Cloudflare Worker for manifest injection

## Implementation Details

### License Metadata Assertion

The `c2pa.metadata` assertion carries licensing information in standardized format:

```typescript
{
  "label": "c2pa.metadata",
  "data": {
    "license": {
      "license_uri": "https://creativecommons.org/licenses/by/4.0/",
      "rights_page": "https://publisher.example.com/licensing/asset-123",
      "licensor_name": "Publisher, Inc.",
      "usage_terms": "Editorial use only; no AI training"
    }
  }
}
```

### Webhook Security

Events are signed using HMAC-SHA256 with the following header format:
```
C2-Signature: t=1730649600,v1=hex(hmac_sha256(secret, t + "." + body))
```

Security features:
- 5-minute timestamp skew tolerance
- 10-minute replay cache
- Idempotency key handling
- Exponential backoff retry (up to 24h)

### Badge States

1. **OK** - License verified and context allowed
2. **WARN** - License found but reuse unverified
   - Shows warning banner
   - Applies preview degradation (scale + blur)
   - Displays "View license / Provide proof" CTA
3. **BLOCK** - Hard block for partner-enforced contexts only

## Configuration

### Partner Configuration

```typescript
{
  "partner_id": "pub-42",
  "allow_origins": ["https://newsroom.example", "https://cdn.partner.example"],
  "enforce": ["https://paywalled.example"],
  "webhooks": [
    {
      "url": "https://partner.example.com/c2/events",
      "secret": "base64-32B-secret",
      "filters": ["reuse.detected", "softblock.triggered"]
    }
  ]
}
```

### Badge Policy

```typescript
{
  "preview_degrade": {
    "warn": { "scale": 0.4, "blur_px": 6 },
    "block": { "scale": 0.2, "blur_px": 12 }
  },
  "cta": {
    "warn": "View license / Provide proof",
    "block": "License required for this use"
  }
}
```

## API Endpoints

### POST /verify
Verify asset and return license information.

**Request:**
```json
{
  "asset_url": "https://cdn.example.com/image.jpg",
  "context": {
    "request_origin": "https://example.com",
    "referrer": "https://example.com/page"
  }
}
```

**Response:**
```json
{
  "result": "warn",
  "license": {
    "license_uri": "https://creativecommons.org/licenses/by/4.0/",
    "rights_page": "https://publisher.example.com/licensing/asset-123",
    "permission_level": "restricted"
  },
  "manifest_hash": "sha256:3b8a...d10",
  "action": {
    "show_badge": true,
    "badge_state": "warn",
    "preview_degrade": { "scale": 0.4, "blur_px": 6 }
  }
}
```

### POST /appeals
Submit appeal for license enforcement.

**Request:**
```json
{
  "asset_id": "pub-42:img-8842",
  "manifest_hash": "sha256:3b8a...d10",
  "claim": "I purchased license ABC from publisher"
}
```

### GET /events
Export events as NDJSON stream.

**Query Parameters:**
- `from` - ISO 8601 start date
- `to` - ISO 8601 end date
- `type` - Event type filter

## Event Types

### verify.started
Server began verification process.

### verify.completed
Verification completed with results and signals.

### reuse.detected
Asset detected on unapproved origin or context.

**Payload:**
```json
{
  "id": "evt_01HV...QZ",
  "type": "reuse.detected",
  "created": "2025-11-03T15:00:00Z",
  "asset": {
    "asset_id": "pub-42:img-8842",
    "manifest_hash": "sha256:3b8a...d10",
    "variant_uri": "https://cdn.example.com/i/8842?w=1200"
  },
  "license": {
    "license_uri": "https://publisher.example.com/licenses/contract-77",
    "rights_page": "https://publisher.example.com/licensing/asset-8842"
  },
  "context": {
    "request_origin": "https://unrelated-blog.example",
    "referrer": "https://unrelated-blog.example/post/123"
  },
  "reason": "origin_not_in_allowlist"
}
```

### softblock.triggered
Badge set to warn state with degradation.

### appeal.created
User initiated appeal process.

## Integration Guides

### WordPress Plugin

1. Install the C2PA License Enforcement plugin
2. Configure partner ID and webhook URL
3. Enable preview degradation for unlicensed content
4. Add license verification to content filters

```php
// Add to theme functions.php
add_filter('the_content', 'wp_c2_filter_content');
add_filter('wp_get_attachment_image_attributes', 'wp_c2_filter_attachment');
```

### Shopify Theme App Extension

1. Create theme app extension with C2 badge component
2. Configure store domain and verification settings
3. Add product image verification scripts
4. Enable cart protection for licensed content

```liquid
<!-- Add to product template -->
<div data-c2-badge="true" 
     data-c2-asset-url="{{ product.featured_image | image_url }}"
     data-c2-badge-config='{"position":"top-right","size":"medium"}'>
  {{ product.featured_image | image_url: image_width: 800 | image_tag }}
</div>
```

### Cloudflare Worker

1. Deploy worker script to your zone
2. Configure manifest server and partner ID
3. Set up paths to preserve and process
4. Add webhook URL for event forwarding

```javascript
// wrangler.toml
name = "c2pa-license-worker"
compatibility_date = "2023-10-30"
[vars]
MANIFEST_SERVER = "https://c2.example.com"
PARTNER_ID = "your-partner-id"
```

## License Mapping

### Creative Commons Licenses

| License | URI | Permission Level | Commercial Use | Derivatives |
|---------|-----|------------------|----------------|-------------|
| CC BY 4.0 | https://creativecommons.org/licenses/by/4.0/ | Permissive | ✓ | ✓ |
| CC BY-SA 4.0 | https://creativecommons.org/licenses/by-sa/4.0/ | Permissive | ✓ | ✓ |
| CC BY-ND 4.0 | https://creativecommons.org/licenses/by-nd/4.0/ | Permissive | ✓ | ✗ |
| CC BY-NC 4.0 | https://creativecommons.org/licenses/by-nc/4.0/ | Restricted | ✗ | ✓ |
| CC BY-NC-SA 4.0 | https://creativecommons.org/licenses/by-nc-sa/4.0/ | Restricted | ✗ | ✓ |
| CC BY-NC-ND 4.0 | https://creativecommons.org/licenses/by-nc-nd/4.0/ | Restricted | ✗ | ✗ |
| CC0 1.0 | https://creativecommons.org/publicdomain/zero/1.0/ | Permissive | ✓ | ✓ |

### IPTC Rights Page Mapping

The `rights_page` field mirrors the IPTC "Web Statement of Rights" for ecosystem compatibility with Google Images and other platforms.

## Security Considerations

### Webhook Security
- Use 32-byte random secrets for webhook signatures
- Implement proper signature verification on your endpoints
- Monitor for replay attacks and unusual patterns
- Rotate secrets regularly

### Privacy Protection
- No PII stored in assertions or events
- Asset and manifest hashes used for identification
- Request origin and referrer only when explicitly provided
- All data follows GDPR and privacy regulations

### Rate Limiting
- Implement rate limiting on verification endpoints
- Use exponential backoff for webhook deliveries
- Monitor for abuse and unusual verification patterns

## Testing

### Acceptance Tests

Run the comprehensive test suite:

```bash
npm run test:phase32
```

Test categories:
- License URI canonicalization
- Webhook security validation
- Partner PoC functionality
- Standards compliance
- Integration testing

### Manual Testing

1. Upload signed assets with `c2pa.metadata` assertions
2. Test reuse on unapproved origins
3. Verify webhook event delivery
4. Confirm badge states and preview degradation
5. Test appeal flow and resolution

## Compliance

### C2PA Specification
- Uses `c2pa.metadata` assertions per spec
- Remote manifest injection via Link headers
- JUMBF-compatible assertion format
- CAI Verify SDK integration

### IPTC Standards
- Rights page mapping for ecosystem compatibility
- Standardized license metadata fields
- Cross-platform license recognition

### Industry Standards
- HMAC webhook security (Stripe-style)
- NDJSON event streaming
- RESTful API design
- Privacy-by-design principles

## Troubleshooting

### Common Issues

**Badge not showing:**
- Verify asset has C2PA manifest with `c2pa.metadata` assertion
- Check browser console for JavaScript errors
- Confirm badge script is properly loaded

**Webhook events not received:**
- Verify webhook URL is accessible
- Check signature verification implementation
- Confirm secret matches configuration

**Preview degradation not working:**
- Verify CSS styles are loaded
- Check image element selection
- Confirm degradation settings

### Debug Mode

Enable debug logging:

```javascript
window.C2_DEBUG = true;
```

This will output detailed verification information to the browser console.

## Support

For technical support and questions:
- Documentation: https://docs.credlink.org
- Issues: https://github.com/Nickiller04/CredLink/issues
- Security: security@credlink.org

## License

This implementation is licensed under the MIT License. See LICENSE file for details.
