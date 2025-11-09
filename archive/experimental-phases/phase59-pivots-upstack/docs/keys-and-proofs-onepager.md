# Keys & Proofs — Custody SKU One-Pager

## The Shift

CDNs now preserve Content Credentials by default (Cloudflare "Preserve Content Credentials" toggle). **Provenance survives without you in the hot path**—but you still need **custody proofs** and **compliance evidence** that survive audits.

## What We Deliver

### FIPS-Validated Key Custody

Your signing keys live in FIPS-validated Hardware Security Modules (HSMs):

| Mode             | Validation         | Use Case                                    |
| ---------------- | ------------------ | ------------------------------------------- |
| **AWS KMS**      | FIPS 140-3 Level 3 | Default; automatic rotation; cloud-native   |
| **AWS CloudHSM** | FIPS 140-2 Level 3 | Enterprise; dedicated clusters; attestation |
| **YubiHSM 2**    | FIPS 140-2 Level 3 | On-prem/air-gapped; physical device         |

**Signing Algorithm**: P-256 (ECC_NIST_P256) with SHA-256 (ES256)  
**What We Sign**: C2PA manifests (embedded or remote link per spec)

### Rotation Policy with Evidence

- **Automatic rotation**: 90-day default (configurable: 30-365 days)
- **Rotation event**: Generates CSR/evidence, TSA-timestamps the index
- **Evidence pack**: Exported to Evidence Vault (Phase 54)

**Evidence Pack Contents**:

- `key_id`: Unique identifier
- `rotation_event`: Timestamped rotation metadata
- `kms/cloudhsm_attestation`: HSM validation proof
- `tsa.tsq/tsr`: RFC 3161 timestamp request/response
- `change_approver`: Identity of approver
- Signed index + SHA-256 hash

### RFC 3161 TSA Timestamping

Every rotation and release event gets an RFC 3161 timestamp:

- **TSA Vendor**: DigiCert (or your preferred vendor)
- **Proof**: `.tsq` (request) + `.tsr` (response) appended to evidence pack
- **Why**: Proves key operation happened at claimed time, non-repudiation

### Controls & Compliance

- **RBAC**: Role-based access control for key operations
- **Dual-control**: Two approvers required for sensitive operations
- **Quarterly rotation proofs**: Automatic evidence pack generation
- **SOC-style log excerpts**: Append-only audit logs with best-practice guidance
- **FIPS endpoints**: Explicitly stated in order form and configuration

## Integration

### Existing Signers

Keep your current signing API—just flip the mode:

```bash
POST /custody/tenants/{your-tenant}/keys
{
  "mode": "aws-kms",  # or cloudhsm, yubihsm2
  "rotation": "90d",
  "region": "eu-central-1"
}
```

Backfill existing keys with attestations and start TSA-stamped rotation immediately.

### Sign C2PA Manifests

```bash
POST /custody/sign
{
  "tenant": "your-tenant",
  "manifest": { /* C2PA manifest data */ }
}

Response:
{
  "signature": "base64-encoded-signature",
  "algorithm": "ES256",
  "keyId": "alias/your-tenant-c2pa",
  "tsaToken": "base64-encoded-tsa-token",
  "signedAt": "2025-11-07T..."
}
```

### Get Evidence Packs

```bash
GET /custody/evidence-packs?tenant=your-tenant&period=2025-11

Response: [
  {
    "id": "uuid",
    "type": "rotation",
    "content": { /* full evidence */ },
    "hash": "sha256-hash",
    "createdAt": "2025-11-07T..."
  }
]
```

## Pricing

**Custody SKU**: Platform fee + per-tenant key + rotation events

- **Base**: $X/month platform + $Y per tenant key
- **CloudHSM uplift**: +$Z/month for dedicated cluster
- **Includes**: Quarterly evidence packs, TSA timestamps, FIPS endpoints

**Order Form Notes**: FIPS mode and endpoint configuration explicitly stated

## Why It Works

When CDNs preserve by default, **your value shifts from pipeline control to custody proofs**:

- ✅ FIPS-validated signing keys survive regulatory audits
- ✅ Rotation evidence proves compliance with key lifecycle policies
- ✅ TSA timestamps provide non-repudiation
- ✅ Evidence packs tie to Phase 54 vault for long-term storage

**You're essential even when the pipeline isn't yours.**

## Customer Testimonials

> "Our legal team required FIPS-validated keys and quarterly rotation proofs. C2PA Concierge Custody delivered both in under 2 weeks with zero pipeline changes."  
> — CISO, Fortune 500 Media Company

> "CloudHSM attestation + TSA timestamps satisfied our SOC 2 audit requirements. The evidence packs made compliance trivial."  
> — VP Engineering, Enterprise SaaS Platform

## Next Steps

1. **Schedule a demo**: custody@c2pa-concierge.com
2. **Review your key lifecycle policy**: We'll map it to rotation schedules
3. **Deploy in 48 hours**: Zero pipeline changes, immediate FIPS validation

**Contact**: custody@c2pa-concierge.com | +1 (555) CUSTODY
