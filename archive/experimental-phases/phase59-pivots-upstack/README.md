# Phase 59 — Pivots Up-Stack (Keys / Analytics)

**Purpose**: When CDNs preserve Content Credentials by default (Cloudflare "Preserve Content Credentials"), move up-stack to custody proofs and analytics that remain essential even when we don't control the pipeline.

## SKU Strategy

### 1. Custody SKU (HSM-first)

Per-tenant signing keys in FIPS-validated HSMs/KMS with rotation evidence packs.

**Key Storage Options**:

- **AWS KMS** (default): FIPS 140-3 validated HSM, automatic rotation
- **AWS CloudHSM**: FIPS mode clusters with attestation
- **YubiHSM 2**: FIPS 140-2, on-prem/air-gapped labs

**What We Sign**: C2PA manifests (embedded or remote link) + RFC 3161 TSA tokens

**Evidence Pack**: key_id, rotation_event, KMS/CloudHSM attestation, TSA.tsq/tsr, change approver, SHA-256 hash

### 2. Analytics-only SKU

Ingest third-party verify results (CAI Verify, vendor verifiers, CDN logs) to produce survival dashboards and compliance packs—no lock-in, ingest-only.

**Inputs**: CAI Verify exports, CDN provenance settings, HTTP headers, verify JSON

**Outputs**:

- Survival dashboards (embed vs remote, by route/provider/theme)
- Compliance packs (AI Act Art. 50, DSA transparency)
- Benchmarking vs public "preserve" capabilities

## Architecture

### Custody Path

```
Key Provisioning → HSM/KMS → P-256 Signing → RFC 3161 TSA → Evidence Pack → Vault
```

### Analytics Path

```
Ingest (CAI Verify/CDN) → Normalize → Dashboards + Compliance Packs
```

## Installation

```bash
# Install dependencies
npm install

# Copy environment template
cp .env.example .env

# Edit .env with your configuration
vi .env

# Setup database
node scripts/setup-custody.js

# Start server
npm start
```

## API Endpoints

### Custody

#### Provision Tenant Key

```bash
POST /custody/tenants/{id}/keys
Content-Type: application/json

{
  "mode": "aws-kms|cloudhsm|yubihsm2",
  "rotation": "90d",
  "region": "eu-central-1"
}
```

#### Rotate Key

```bash
POST /custody/rotate
Content-Type: application/json

{
  "tenant": "acme",
  "key_id": "alias/acme-c2pa",
  "reason": "quarterly"
}
```

#### Get Evidence Packs

```bash
GET /custody/evidence-packs?tenant=acme&period=2025-11
```

### Analytics

#### Ingest Verify Result

```bash
POST /ingest/verify
Content-Type: application/json

{
  "source": "cai-verify|vendor-x",
  "asset_id": "...",
  "result": "pass|fail",
  "manifest": "embedded|link",
  "provider": "cf-images",
  "ts": "..."
}
```

#### Get Survival Analytics

```bash
GET /analytics/survival?tenant=acme&period=2025-11
```

#### Get Compliance Pack

```bash
GET /compliance/pack?tenant=acme&period=2025-11&regions=EU,UK
```

## Migration Paths

### Base → Custody

1. Keep same signer API
2. Flip mode to `kms|cloudhsm|yubihsm2`
3. Backfill keys with attestations
4. Begin TSA-stamped rotation evidence immediately

### Base → Analytics-only

1. Disable signing/badge
2. Continue ingesting verify logs (CAI Verify, CDN settings)
3. Keep survival & compliance reporting flowing

## Testing

```bash
# Run custody tests
npm run test:custody

# Run analytics tests
npm run test:analytics

# Run exit tests
npm run test:exit

# Run all tests
npm test
```

## Key Rotation

Manual rotation:

```bash
npm run rotate:keys
```

Automated rotation (cron):

```bash
# Add to crontab for weekly rotation check
0 0 * * 0 cd /path/to/phase59-pivots-upstack && npm run rotate:keys
```

## Pricing & Packaging

### Custody SKU

- Platform fee + per-tenant key + rotation events
- Optional CloudHSM uplift
- Includes quarterly evidence packs
- FIPS mode/endpoint stated in order form

### Analytics-only SKU

- Subscription + ingestion volume
- Upsell to full product if survival falls

## Exit Criteria (Binary)

1. ✅ New SKUs ≥20% of MRR inside 60 days (combined custody + analytics-only)
2. ✅ At least one enterprise adopts custody with audit acceptance (FIPS mode + rotation evidence pack)
3. ✅ Stable ingestion from third-party verifiers (CAI Verify) mapped to dashboards—no manual rework for a full month

## Security & Compliance

- **FIPS 140-3**: AWS KMS HSMs
- **FIPS 140-2**: YubiHSM 2 (Level 3)
- **RFC 3161**: TSA timestamping for rotation events
- **OWASP Top 10**: Mitigated
- **SOC 2**: Quarterly log excerpts, RBAC, dual-control

## References

- [AWS KMS FIPS 140-3](https://docs.aws.amazon.com/kms/latest/developerguide/fips.html)
- [AWS CloudHSM FIPS](https://docs.aws.amazon.com/cloudhsm/latest/userguide/fips.html)
- [YubiHSM 2 FIPS](https://csrc.nist.gov/projects/cryptographic-module-validation-program)
- [RFC 3161 Timestamping](https://www.ietf.org/rfc/rfc3161.txt)
- [CAI Verify](https://contentcredentials.org/verify)
- [Cloudflare Preserve Content Credentials](https://developers.cloudflare.com/images/transform-images/content-credentials/)
- [C2PA Specification](https://c2pa.org/specifications/specifications/2.0/specs/C2PA_Specification.html)

## Support

For enterprise custody adoption or analytics integration, contact: custody@c2pa-concierge.com
