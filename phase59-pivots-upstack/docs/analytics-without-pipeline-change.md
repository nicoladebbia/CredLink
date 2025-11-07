# Analytics Without Pipeline Change — Demo

## The Reality

Cloudflare, Cloudinary, and other CDNs now offer "Preserve Content Credentials" toggles. **Your content survives without you in the hot path**—but you still need:

1. **Visibility**: Where does provenance break?
2. **Compliance**: AI Act Art. 50 disclosure counts, DSA transparency
3. **Benchmarking**: How do different stacks perform?

## What We Ingest

### Third-Party Verifiers

- **CAI Verify**: Export results as JSON/CSV
- **Vendor Verifiers**: Custom verify tools (API or file drops)
- **CDN Settings**: Cloudflare "Preserve Content Credentials" toggle status
- **HTTP Headers**: Link headers for remote manifest discovery

### Example: CAI Verify Export

```json
{
  "asset_id": "image-123.jpg",
  "verify_result": "pass",
  "manifest_type": "embedded",
  "provider": "cf-images",
  "timestamp": "2025-11-07T12:00:00Z"
}
```

## Demo Flow

### Step 1: Ingest Verify Results

```bash
POST /ingest/verify
{
  "source": "cai-verify",
  "asset_id": "image-123.jpg",
  "result": "pass",
  "manifest": "embedded",
  "provider": "cf-images",
  "route": "/images/processed",
  "ts": "2025-11-07T12:00:00Z"
}

Response:
{
  "id": "uuid",
  "assetHash": "sha256-hash",
  "result": "pass",
  "manifestDiscovery": "embedded",
  "ingestedAt": "2025-11-07T12:00:01Z"
}
```

### Step 2: View Survival Dashboard

```bash
GET /analytics/survival?tenant=your-tenant&period=2025-11

Response:
{
  "tenantId": "your-tenant",
  "period": "2025-11",
  "overall": {
    "total": 10000,
    "passed": 9200,
    "survivalRate": 92.0
  },
  "byManifest": [
    {
      "manifestType": "embedded",
      "total": 6000,
      "passed": 5800,
      "survivalRate": 96.67
    },
    {
      "manifestType": "link",
      "total": 4000,
      "passed": 3400,
      "survivalRate": 85.0
    }
  ],
  "byProvider": [
    {
      "provider": "cf-images",
      "total": 5000,
      "passed": 4900,
      "survivalRate": 98.0
    },
    {
      "provider": "cloudinary",
      "total": 3000,
      "passed": 2700,
      "survivalRate": 90.0
    },
    {
      "provider": "imgix",
      "total": 2000,
      "passed": 1600,
      "survivalRate": 80.0
    }
  ],
  "byRoute": [
    {
      "route": "/images/processed",
      "total": 4000,
      "passed": 3950,
      "survivalRate": 98.75
    },
    {
      "route": "/images/optimized",
      "total": 3000,
      "passed": 2850,
      "survivalRate": 95.0
    }
  ],
  "performance": {
    "verifyP95": 150
  }
}
```

**Key Insights**:

- ✅ **98% survival** on Cloudflare Images (preserve toggle enabled)
- ⚠️ **80% survival** on Imgix (no preserve support)
- ✅ **Embedded manifests** survive better (96.67%) than remote links (85%)

### Step 3: Generate Compliance Pack

```bash
GET /compliance/pack?tenant=your-tenant&period=2025-11&regions=EU,UK

Response:
{
  "id": "uuid",
  "tenantId": "your-tenant",
  "period": "2025-11",
  "regions": ["EU", "UK"],
  "aiAct": {
    "article50": {
      "totalDisclosures": 10000,
      "embeddedDisclosures": 6000,
      "remoteDisclosures": 4000
    }
  },
  "dsa": {
    "adTransparencyCount": 250
  },
  "benchmarking": {
    "cdnPreserve": [
      {
        "provider": "cf-images",
        "total": 5000,
        "preservedCount": 4900,
        "preserveRate": 98.0
      },
      {
        "provider": "cloudflare",
        "total": 3000,
        "preservedCount": 2850,
        "preserveRate": 95.0
      }
    ]
  },
  "generatedAt": "2025-11-07T12:00:00Z"
}
```

**Compliance Ready**:

- ✅ **AI Act Art. 50**: 10,000 disclosures documented
- ✅ **DSA**: 250 ad transparency strings tracked
- ✅ **Benchmarking**: Cloudflare preserve rate documented

### Step 4: Identify Breakage

```bash
GET /analytics/breakage?tenant=your-tenant&period=2025-11

Response:
{
  "tenantId": "your-tenant",
  "period": "2025-11",
  "breakageByStack": [
    {
      "provider": "imgix",
      "route": "/images/transformed",
      "breakageCount": 400,
      "breakagePercentage": 50.0
    },
    {
      "provider": "cloudinary",
      "route": "/images/compressed",
      "breakageCount": 300,
      "breakagePercentage": 37.5
    }
  ]
}
```

**Action Items**:

- ⚠️ **Imgix**: 50% breakage on `/transformed` route → switch to Cloudflare Images
- ⚠️ **Cloudinary**: 37.5% breakage on `/compressed` → enable preserve setting

## Integration Scenarios

### Scenario 1: CAI Verify + Cloudflare

1. **Enable** Cloudflare "Preserve Content Credentials" toggle
2. **Export** CAI Verify results monthly
3. **Ingest** via `/ingest/verify` endpoint
4. **View** survival dashboard to confirm 95%+ preserve rate

### Scenario 2: Multi-CDN Stack

1. **Test** different CDN providers (Cloudflare, Cloudinary, Imgix)
2. **Ingest** verify results from each
3. **Compare** survival rates in dashboard
4. **Switch** to best-performing stack

### Scenario 3: Compliance Audit

1. **Ingest** verify results for entire audit period
2. **Generate** compliance pack for EU/UK/US
3. **Export** AI Act disclosure counts + DSA transparency strings
4. **Submit** to regulators with full evidence trail

## Cloudflare "Preserve" Context

Cloudflare Images now supports preserving Content Credentials:

```bash
# Enable preserve via Cloudflare API
curl -X PATCH https://api.cloudflare.com/client/v4/accounts/{account}/images/v1/config \
  -H "Authorization: Bearer {token}" \
  -d '{"preserve_content_credentials": true}'
```

**What Changes**:

- ✅ C2PA manifests survive image transformations
- ✅ Remote manifest links preserved in response headers
- ✅ Verify results show "pass" instead of "fail"

**What We Track**:

- Preserve toggle status per account
- Survival rate before/after enabling
- Provider benchmarking

## Pricing

**Analytics-only SKU**: Subscription + ingestion volume

- **Base**: $X/month + $Y per 100k ingested records
- **Upsell**: If survival falls below 90%, upgrade to full Custody SKU

## Why It Works

**No lock-in**: You're not changing your pipeline—just ingesting verify results

**Multi-source**: Works with CAI Verify, vendor tools, CDN logs, custom verifiers

**Compliance-ready**: AI Act Art. 50, DSA transparency, benchmarking—all automated

## Next Steps

1. **Export** your CAI Verify results (JSON or CSV)
2. **Ingest** via our API
3. **View** survival dashboard in 5 minutes
4. **Generate** compliance pack on demand

**Contact**: analytics@c2pa-concierge.com | +1 (555) ANALYTICS

---

## Demo Script (5 minutes)

**Minute 1**: Show CAI Verify export  
**Minute 2**: Ingest via curl  
**Minute 3**: Open survival dashboard  
**Minute 4**: Generate compliance pack  
**Minute 5**: Show Cloudflare preserve toggle impact

**Outcome**: Immediate visibility into provenance survival without touching your pipeline
