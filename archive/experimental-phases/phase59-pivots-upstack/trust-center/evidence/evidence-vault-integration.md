# Evidence Vault Integration for Trust Center

## Overview

Integration between Phase 54 Evidence Vault and Phase 60 Trust Center for SOC 2 compliance. Enables one-click access to signed evidence packages, WORM attestations, and audit artifacts.

## Architecture

```
Evidence Vault (Phase 54)          Trust Center (Phase 60)
├── Evidence Packs                 ├── /assets/evidence-exports/
│   ├── Signed Manifests           │   ├── evidence-pack-{date}.zip
│   ├── SHA-256 Hashes             │   ├── evidence-pack-{date}.sig
│   └── RFC 3161 Timestamps        │   └── evidence-index-{date}.json
├── WORM Storage (S3 Object Lock)  │
└── Audit Logs                     ├── /compliance (Trust Center page)
                                   │   └── Links to evidence exports
                                   │
                                   └── /transparency (Trust Center page)
                                       └── Evidence vault statistics
```

## Evidence Export Format

### Structure

```
evidence-pack-20251107/
├── README.md (export metadata)
├── index.json (machine-readable index)
├── index.html (human-readable index)
├── signature.sig (detached signature)
├── manifest.json (SHA-256 of all files)
├── rfc3161-timestamp.tsr (RFC 3161 timestamp)
│
├── authentication/
│   ├── auth-logs-20251101-20251107.jsonl.gz
│   ├── failed-auth-summary.json
│   └── mfa-enrollment-logs.json
│
├── access-control/
│   ├── access-review-2025-Q4.pdf
│   ├── onboarding-tickets/
│   └── offboarding-checklists/
│
├── vulnerability-management/
│   ├── snyk-scans/
│   ├── npm-audit-results/
│   └── remediation-tracking.json
│
├── incident-response/
│   ├── incident-tickets/
│   ├── post-mortems/
│   └── drill-results/
│
├── backups/
│   ├── backup-verification-logs/
│   └── restore-test-results/
│
├── monitoring/
│   ├── uptime-reports/
│   ├── performance-metrics/
│   └── alert-history/
│
└── change-management/
    ├── pull-requests/
    ├── cab-minutes/
    └── deployment-logs/
```

### Metadata (README.md)

```markdown
# Evidence Vault Export

**Export Date**: 2025-11-07T00:00:00Z
**Period**: 2025-11-01 to 2025-11-07
**SOC 2 Audit Period**: 2025-11-01 to 2026-04-30 (Type II)
**Export ID**: EVP-20251107-a3f9c2

## Integrity Verification

- **SHA-256 Manifest**: manifest.json
- **Detached Signature**: signature.sig (ECDSA P-256)
- **RFC 3161 Timestamp**: rfc3161-timestamp.tsr
- **TSA**: DigiCert Timestamp Authority

## Verification Commands

```bash
# Verify manifest integrity
sha256sum -c manifest.json

# Verify signature
openssl dgst -sha256 -verify pubkey.pem -signature signature.sig manifest.json

# Verify RFC 3161 timestamp
openssl ts -verify -in rfc3161-timestamp.tsr -data manifest.json -CAfile tsa-ca.pem
```

## Contents

- Authentication logs (7 days)
- Access control evidence (monthly review)
- Vulnerability scans (weekly)
- Incident response records (all P1/P2/P3)
- Backup verification (weekly tests)
- Monitoring metrics (continuous)
- Change management (all changes)

## Control Coverage

This export provides evidence for the following SOC 2 TSC:
- CC6.1, CC6.2, CC6.3 (Logical Access)
- CC7.1, CC7.2, CC7.3 (System Operations)
- CC8.1 (Change Management)
- A1.2, A1.3 (Availability)

NIST SP 800-53 Rev. 5 controls covered:
- AC-2, AC-3 (Access Control)
- AU-2, AU-3, AU-6 (Audit and Accountability)
- SI-2, SI-4 (System Integrity)
- IR-4, IR-6 (Incident Response)
- CP-9, CP-10 (Contingency Planning)

## Usage

- **Auditors**: Submit to auditor via secure file transfer
- **Customers**: Available upon NDA execution
- **Internal**: Compliance team review and sampling

## Retention

- WORM storage: 7 years minimum
- Immutable: Cannot be modified or deleted
- Indexed: Searchable by control, date range, evidence type
```

### Index (index.json)

```json
{
  "export_id": "EVP-20251107-a3f9c2",
  "export_date": "2025-11-07T00:00:00Z",
  "period_start": "2025-11-01T00:00:00Z",
  "period_end": "2025-11-07T23:59:59Z",
  "soc2_audit_period": {
    "type": "Type II",
    "start": "2025-11-01",
    "end": "2026-04-30"
  },
  "integrity": {
    "manifest_sha256": "abc123...",
    "signature_algorithm": "ECDSA-P256",
    "signature_file": "signature.sig",
    "rfc3161_timestamp": "rfc3161-timestamp.tsr",
    "tsa_url": "http://timestamp.digicert.com"
  },
  "evidence_items": [
    {
      "path": "authentication/auth-logs-20251101-20251107.jsonl.gz",
      "type": "log",
      "control_ids": ["CC6.1", "AC-2", "AC-3", "IA-2"],
      "size_bytes": 1048576,
      "sha256": "def456...",
      "line_count": 15234,
      "date_range": ["2025-11-01", "2025-11-07"]
    },
    {
      "path": "access-control/access-review-2025-Q4.pdf",
      "type": "report",
      "control_ids": ["CC6.2", "AC-2"],
      "size_bytes": 524288,
      "sha256": "ghi789...",
      "review_date": "2025-10-15",
      "accounts_reviewed": 42,
      "findings": 0
    }
  ],
  "statistics": {
    "total_files": 247,
    "total_size_bytes": 52428800,
    "evidence_types": {
      "logs": 185,
      "reports": 32,
      "tickets": 18,
      "screenshots": 12
    },
    "control_coverage": {
      "CC": 11,
      "A": 3,
      "NIST": 47
    }
  }
}
```

## Trust Center Integration

### Downloadable Assets Page

Location: `trust-center/assets/` (publicly downloadable)

**Available Downloads**:

1. **MSA Template** - `MSA_v2025.pdf`
2. **DPA Template** - `DPA_v2025.pdf`
3. **SLA Template** - `SLA_v2025.pdf`
4. **Penetration Test Letter** - `PenTest_Letter_2025.pdf` (NDA-gated)
5. **WORM Evidence Guide** - `Evidence_Vault_Guide.pdf`
6. **SOC 2 Control Matrix** - `SOC2_Control_Matrix.pdf`
7. **NIST 800-53 Mapping** - `NIST_800-53_Mapping.pdf`
8. **Evidence Pack Sample** - `Evidence_Pack_Sample.zip` (redacted example)

### Compliance Page Integration

```markdown
## Evidence Vault

Our Phase 54 Evidence Vault provides immutable, cryptographically-verified audit evidence.

### Features

- **WORM Storage**: Write-Once-Read-Many with S3 Object Lock
- **Cryptographic Integrity**: SHA-256 hashes for all evidence
- **RFC 3161 Timestamps**: Trusted third-party timestamping
- **Automated Collection**: 80% evidence collection automated
- **Retention**: 7+ years minimum

### Evidence Exports

Weekly evidence packages available for audit:
- [Evidence Vault Guide](/assets/Evidence_Vault_Guide.pdf)
- [Sample Evidence Pack](/assets/Evidence_Pack_Sample.zip) (redacted)

**For Auditors**: Request full evidence access via compliance@yourdomain.com

### Verification

All evidence packages include:
1. Detached ECDSA P-256 signature
2. SHA-256 manifest of all files
3. RFC 3161 timestamp from DigiCert TSA
4. Machine-readable index (JSON)

Public key for verification: [Download](/assets/evidence-vault-pubkey.pem)
```

## API Endpoints

### Public API (Read-Only)

**GET** `/api/evidence-vault/exports`

Returns list of available evidence exports (metadata only).

```json
{
  "exports": [
    {
      "id": "EVP-20251107-a3f9c2",
      "date": "2025-11-07",
      "period": "2025-11-01 to 2025-11-07",
      "size_mb": 50,
      "controls_covered": 14,
      "download_url": "/api/evidence-vault/exports/EVP-20251107-a3f9c2/download"
    }
  ]
}
```

**GET** `/api/evidence-vault/exports/{export_id}/metadata`

Returns detailed metadata for specific export (no NDA required).

**GET** `/api/evidence-vault/exports/{export_id}/download`

Downloads evidence package (NDA + authentication required).

### Internal API (Authenticated)

**POST** `/api/evidence-vault/generate-export`

Generates new evidence export for specified date range.

Request:
```json
{
  "period_start": "2025-11-01",
  "period_end": "2025-11-07",
  "controls": ["CC6.1", "CC6.2", "A1.2"],  // optional filter
  "include_logs": true,
  "include_reports": true
}
```

Response:
```json
{
  "export_id": "EVP-20251107-a3f9c2",
  "status": "generating",
  "estimated_completion": "2025-11-07T00:15:00Z"
}
```

## Automation

### Weekly Evidence Export

Automated cron job (every Sunday at 00:00 UTC):

```bash
#!/bin/bash
# weekly-evidence-export.sh

set -e

# Calculate previous week date range
END_DATE=$(date -d "yesterday" +%Y-%m-%d)
START_DATE=$(date -d "7 days ago" +%Y-%m-%d)

# Generate export
EXPORT_ID=$(curl -X POST https://api.yourdomain.com/evidence-vault/generate-export \
  -H "Authorization: Bearer ${EVIDENCE_VAULT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"period_start\": \"${START_DATE}\",
    \"period_end\": \"${END_DATE}\"
  }" | jq -r '.export_id')

echo "Generated export: ${EXPORT_ID}"

# Wait for completion
while true; do
  STATUS=$(curl https://api.yourdomain.com/evidence-vault/exports/${EXPORT_ID}/status \
    | jq -r '.status')
  
  if [ "$STATUS" = "complete" ]; then
    break
  elif [ "$STATUS" = "failed" ]; then
    echo "Export failed!"
    exit 1
  fi
  
  sleep 60
done

# Verify integrity
curl https://api.yourdomain.com/evidence-vault/exports/${EXPORT_ID}/download \
  -o evidence-pack-${END_DATE}.zip

# Verify SHA-256
unzip -q evidence-pack-${END_DATE}.zip
cd evidence-pack-${END_DATE}
sha256sum -c manifest.json

# Verify signature
openssl dgst -sha256 -verify ../evidence-vault-pubkey.pem \
  -signature signature.sig manifest.json

# Verify RFC 3161 timestamp
openssl ts -verify -in rfc3161-timestamp.tsr \
  -data manifest.json -CAfile ../digicert-tsa-ca.pem

echo "✓ Evidence export ${EXPORT_ID} verified successfully"

# Upload to long-term storage (S3 with object lock)
aws s3 cp evidence-pack-${END_DATE}.zip \
  s3://evidence-vault-archive/exports/${EXPORT_ID}/ \
  --storage-class GLACIER
```

### SOC 2 Audit Package Generation

For Type II audit, generate comprehensive package covering full 180-day period:

```bash
#!/bin/bash
# soc2-audit-package.sh

# Full Type II period: 2025-11-01 to 2026-04-30
START_DATE="2025-11-01"
END_DATE="2026-04-30"

curl -X POST https://api.yourdomain.com/evidence-vault/generate-export \
  -H "Authorization: Bearer ${EVIDENCE_VAULT_API_KEY}" \
  -H "Content-Type: application/json" \
  -d "{
    \"period_start\": \"${START_DATE}\",
    \"period_end\": \"${END_DATE}\",
    \"audit_type\": \"SOC2_TYPE_II\",
    \"include_all_controls\": true
  }"
```

## Evidence Vault Guide (Downloadable Asset)

Create `trust-center/assets/Evidence_Vault_Guide.pdf` with:

### Contents

1. **Introduction**
   - Purpose: SOC 2 compliance evidence
   - WORM storage benefits
   - RFC 3161 timestamping

2. **Evidence Types**
   - Authentication logs
   - Access reviews
   - Vulnerability scans
   - Incident records
   - Backup verification
   - Change management

3. **Verification Process**
   - SHA-256 manifest checking
   - Signature verification
   - Timestamp verification
   - Chain of custody

4. **Requesting Access**
   - NDA requirement
   - Request process
   - Delivery method (secure file transfer)

5. **Retention and Compliance**
   - 7-year retention
   - Regulatory compliance (SOC 2, GDPR, CCPA)
   - Deletion procedures

## Success Metrics

**Evidence Collection**:
- Automation rate: 80% (target)
- Collection latency: < 1 day
- Evidence completeness: 99%

**Integrity**:
- Verification failures: 0
- Timestamp failures: 0
- Manifest mismatches: 0

**Audit Usage**:
- Time to provide evidence: < 24 hours
- Auditor evidence requests satisfied: 100%
- Evidence quality issues: < 1%

---

**Last Updated**: 2025-11-07
**Owner**: Security / SRE
**Integration Points**: Phase 54 Evidence Vault, Trust Center /compliance page
