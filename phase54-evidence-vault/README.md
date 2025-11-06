# Phase 54 — Evidence Vault & Legal Hold

**Ship-ready, WORM by default**

## Purpose (tight)

Deliver durable, exportable evidence packs for disputes, takedowns, and audits. Persist WORM copies of manifests, HTTP-header snapshots, verify decisions, RFC 3161 TSA receipts, and operator actions in tamper-evident append-only logs. Add Legal Hold that freezes deletion and mirrors the relevant universe into an escrow namespace. Exports are a single .zip with a signed index and SHA-256 for every artifact.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Evidence Vault System                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐     │
│  │   Ingest     │───▶│  S3 Vault    │───▶│ Transparency │     │
│  │   Pipeline   │    │ (WORM Lock)  │    │     Log      │     │
│  └──────────────┘    └──────────────┘    └──────────────┘     │
│         │                    │                    │             │
│         │                    │                    │             │
│  ┌──────▼──────┐    ┌───────▼──────┐    ┌───────▼──────┐     │
│  │ RFC 3161    │    │ Legal Hold   │    │   Export     │     │
│  │ TSA Token   │    │   Manager    │    │   Builder    │     │
│  └─────────────┘    └──────────────┘    └──────────────┘     │
│         │                    │                    │             │
│         └────────────────────┴────────────────────┘             │
│                              │                                   │
│                     ┌────────▼────────┐                         │
│                     │  Escrow Mirror  │                         │
│                     │  (Separate Acct)│                         │
│                     └─────────────────┘                         │
└─────────────────────────────────────────────────────────────────┘
```

## Storage & Immutability

### S3 Object Lock Configuration
- **Mode:** Compliance (cannot be overridden by any user, including root)
- **Versioning:** ON (required for Object Lock)
- **Retention:** Default 24 months
- **Legal Hold:** Supported (independent of retention period)
- **Compliance:** SEC 17a-4, CFTC, FINRA assessed by Cohasset

### Data Persistence Strategy
1. **Evidence Buckets:** S3 with Object Lock Compliance mode
2. **HTTP Snapshots:** Verbatim storage with ETag/Cache-Control/Date headers
3. **Tamper-Evident Log:** Merkle-tree based append-only transparency log (Rekor-style)
4. **Retention Policy:** 24 months default, legal-hold overrides purge
5. **Log Controls:** Aligned with NIST SP 800-92/800-53

## Data Model

### Evidence Record Schema

```typescript
interface EvidenceRecord {
  // Identifiers
  evidence_id: string;           // UUID v7 (time-ordered)
  tenant_id: string;
  asset_id: string;
  
  // Manifest data
  manifest_hash: string;         // SHA-256 hex
  manifest_url: string;
  
  // HTTP context
  http_headers_snapshot: HttpHeadersSnapshot;
  
  // Verification
  verify_result_json: VerifyResult;
  
  // Time-stamping
  tsa_token: Buffer;             // RFC 3161 DER format
  
  // Operator actions
  operator_action: OperatorAction;
  
  // Transparency log
  log_merkle_leaf: MerkleLeafData;
  
  // Storage
  s3_object_version_id: string;
  
  // Lifecycle
  created_at: number;            // Unix timestamp ms
  retention_until: number;       // Unix timestamp ms
  
  // Legal hold
  legal_hold: LegalHold | null;
}

interface HttpHeadersSnapshot {
  etag: string;
  cacheControl: string;
  date: string;
  contentType: string;
  contentLength: number;
  rawHeaders: Record<string, string>;
}

interface OperatorAction {
  who: string;                   // Operator ID
  what: string;                  // Action description
  when: number;                  // Unix timestamp ms
  reason?: string;
}

interface LegalHold {
  active: boolean;
  placedBy: string;               // Operator ID
  reason: string;
  placedAt: number;               // Unix timestamp ms
  expiresAt: number;              // Unix timestamp ms (mandatory)
}

interface MerkleLeafData {
  leafIndex: number;
  leafHash: string;               // SHA-256 hex
  treeSize: number;
  checkpointHash: string;
}
```

## Legal Hold Workflow

### Place Hold (POST /evidence/holds)

**Steps:**
1. Set S3 Legal Hold on all matching objects + future versions
2. Write hold event to transparency log
3. Mirror matching objects to escrow bucket (separate account) with Object Lock Compliance mode
4. Return hold ID and confirmation

**Request:**
```typescript
interface PlaceHoldRequest {
  tenantId?: string;
  assetId?: string;
  manifestHash?: string;
  timespan?: {
    start: number;
    end: number;
  };
  reason: string;
  placedBy: string;
  expiresAt: number;              // Mandatory expiry
}
```

**Response:**
```typescript
interface PlaceHoldResponse {
  holdId: string;
  objectsAffected: number;
  escrowMirrorStarted: boolean;
  transparencyLogEntry: string;
}
```

### During Hold
- Purge jobs skip held items
- UI shows "On Hold" badge
- Any write creates new versions only (no deletion)
- All versions remain accessible

### Release Hold (date-bounded)
1. Clear legal-hold flag on S3 objects
2. Write release event to transparency log
3. Standard retention timers resume
4. Escrow copies remain (separate retention policy)

### Guardrails
- **Mandatory Expiry:** All holds require expiration date
- **Alerts:** Fire at 30/60/90 days for aging holds
- **Reporting:** Active holds dashboard with age tracking
- **Audit Trail:** All hold actions logged in transparency log

## Export Pack (offline-verifiable)

### Artifact Structure

**Filename:** `evidence_<tenant>_<asset|case>_<yyyymmdd>.zip`

**Contents:**
```
evidence_acme_asset123_20250106.zip
├── manifests/
│   ├── a1b2c3d4...manifest.c2pa.json
│   └── e5f6g7h8...manifest.c2pa.json
├── headers/
│   ├── 1704556800000.http
│   └── 1704643200000.http
├── verify/
│   ├── 1704556800000.json
│   └── 1704643200000.json
├── tsa/
│   ├── 1704556800000.tsr
│   └── 1704643200000.tsr
├── log/
│   └── rekor-checkpoint.txt
├── index.json
└── index.json.sig
```

### Index Format

```typescript
interface ExportIndex {
  version: "1.0";
  createdAt: number;
  tenantId: string;
  scope: "asset" | "case" | "tenant";
  files: FileEntry[];
  metadata: ExportMetadata;
}

interface FileEntry {
  path: string;
  sha256: string;
  size: number;
  type: "manifest" | "headers" | "verify" | "tsa" | "log";
}

interface ExportMetadata {
  totalFiles: number;
  totalSize: number;
  evidenceCount: number;
  dateRange: {
    start: number;
    end: number;
  };
}
```

### Signature (index.json.sig)

**Format:** Detached JWS (RFC 7515)
- **Algorithm:** ES256 (ECDSA with P-256 and SHA-256)
- **Key:** Organization signing key
- **Payload:** SHA-256 hash of index.json

```typescript
interface JWSSignature {
  protected: string;             // Base64URL encoded header
  signature: string;             // Base64URL encoded signature
}

// Protected header
interface JWSHeader {
  alg: "ES256";
  typ: "JWT";
  kid: string;                   // Key ID
  iat: number;                   // Issued at
}
```

### Offline Verification Kit

**CLI Tool:** `evidence-verify`

**Capabilities:**
1. Verify JWS signature on index.json
2. Re-hash all files and compare with index.json
3. Validate RFC 3161 TSA tokens
4. Re-run CAI Verify on included manifests/assets
5. Check transparency log consistency proofs

**Usage:**
```bash
# Full verification
evidence-verify evidence_acme_asset123_20250106.zip

# Verify signature only
evidence-verify --signature-only evidence_acme_asset123_20250106.zip

# Verify with custom trust anchor
evidence-verify --trust-anchor ./ca.pem evidence_acme_asset123_20250106.zip

# Generate verification report
evidence-verify --report report.json evidence_acme_asset123_20250106.zip
```

## API Endpoints

### POST /vault/evidence
Ingest a case (asset set + metadata)

**Request:**
```typescript
interface IngestEvidenceRequest {
  tenantId: string;
  assetIds: string[];
  caseId?: string;
  manifestData: ManifestData[];
  httpSnapshots: HttpSnapshot[];
  verifyResults: VerifyResult[];
  operatorAction: OperatorAction;
}
```

**Response:**
```typescript
interface IngestEvidenceResponse {
  evidenceIds: string[];
  s3ObjectVersions: string[];
  transparencyLogEntries: string[];
  tsaTokensRequested: number;
}
```

### POST /vault/holds
Place legal hold

**Request:** See PlaceHoldRequest above

**Response:** See PlaceHoldResponse above

### POST /vault/export
Build & stream export pack

**Request:**
```typescript
interface ExportRequest {
  scope: "asset" | "case" | "tenant";
  tenantId: string;
  assetId?: string;
  caseId?: string;
  includeSamples?: number;       // Number of sample assets
  format?: "zip";                // Future: tar.gz, etc.
}
```

**Response:**
```typescript
interface ExportResponse {
  exportId: string;
  status: "building" | "ready" | "failed";
  downloadUrl?: string;          // Time-boxed signed URL
  expiresAt?: number;
  sizeBytes?: number;
  fileCount?: number;
}
```

### GET /vault/export/:export_id
Check export status

**Response:**
```typescript
interface ExportStatusResponse {
  exportId: string;
  status: "building" | "ready" | "failed";
  progress?: number;              // 0-100
  downloadUrl?: string;
  expiresAt?: number;
  error?: string;
}
```

## Background Jobs

### Nightly Sweeper

**Responsibilities:**
1. Close gaps (missed headers/TSA)
2. Refresh Rekor checkpoints
3. Enforce retention vs holds
4. Generate consistency proofs
5. Update escrow mirror status

**Schedule:** Daily at 02:00 UTC

**Metrics:**
- Objects processed
- Gaps closed
- TSA tokens generated
- Consistency proofs validated
- Retention actions taken

## Operator UX

### Case View (2-minute retrieval target)

**Features:**
1. Search by asset/URL/manifest hash
2. "Create Export" button → progress bar
3. Signed download URL when ready
4. Export history with re-download capability

**Search Filters:**
- Tenant ID
- Asset ID
- Manifest hash
- Date range
- Legal hold status

### Legal Hold Panel

**Display:**
- Who placed hold
- Reason for hold
- Placement date
- Expiration date
- One-click extend with reason
- Release button (with confirmation)

**Actions:**
- Extend hold (requires reason)
- Release hold (requires confirmation)
- View affected objects
- Download hold report

### Escrow Mirror Status

**Metrics:**
- % mirrored
- Last sync lag
- Objects pending
- Mirror health status
- Storage usage

## Observability & Audits

### Metrics

**Performance:**
- Export build time (p50/p95/p99)
- Hold placement latency
- Escrow mirror lag
- TSA token generation time

**Operational:**
- Hold count by age bucket
- WORM write failures
- Transparency log consistency check status
- Storage usage by tenant
- Retention policy violations

**Business:**
- Exports per day
- Active legal holds
- Evidence records ingested
- Average case size

### Audit Reports

**Monthly Consistency Proof:**
- Generate consistency proof over transparency log
- Include proof snapshot in public Evidence Vault Health report
- Customers can verify no history rewriting
- Publish to public endpoint

**Quarterly Compliance Report:**
- Retention policy adherence
- Legal hold statistics
- Access audit summary
- WORM integrity checks

## Policy (clean, enforceable)

### WORM Default
- S3 Object Lock in Compliance mode
- Cannot be overridden by any user
- Immutable until retention period expires

### Retention
- **Default:** 24 months
- **Override:** Stricter customer/region requirements (Phase 48)
- **Legal Hold:** Overrides purge, auditable, time-boxed

### Holds
- **Mandatory Expiry:** All holds require expiration date
- **Escalations:** Alerts at 30/60/90 days
- **Override:** Counsel can override with documented reason

### Access Control
- **Principle:** Least privilege
- **Exports:** Time-boxed signed URLs (1 hour expiry)
- **Download Events:** Logged and checkpointed in transparency log
- **Audit:** All access logged per NIST 800-92/53

## Exit Tests (binary)

### Test 1: Counsel Retrieval < 2 Minutes
**Steps:**
1. Search for case by asset ID
2. Click "Create Export"
3. Wait for export to build
4. Download .zip file
5. Run offline verification

**Success Criteria:**
- Total time from search to download < 2 minutes
- JWS signature validates
- All SHA-256 hashes match
- RFC 3161 tokens validate
- CAI Verify succeeds on all manifests

### Test 2: Legal Hold Prevents Purge
**Steps:**
1. Place legal hold on test objects
2. Run scheduled purge job
3. Verify held objects not deleted
4. Check S3 Legal Hold flag is set
5. Verify escrow copy exists
6. Release hold
7. Verify normal TTL resumes

**Success Criteria:**
- Purge job skips held objects
- S3 Legal Hold visible in console
- Escrow copy present and accessible
- Release allows normal retention to proceed

### Test 3: Offline Verification
**Steps:**
1. Download export pack
2. Transfer to air-gapped machine (no network)
3. Run evidence-verify CLI
4. Validate all components

**Success Criteria:**
- JWS signature validates
- All file hashes match index.json
- RFC 3161 TSA tokens validate
- Transparency log consistency check succeeds
- CAI Verify runs successfully on manifests

## Risks → Mitigations

### Risk: Storage Costs
**Mitigation:**
- Tiered storage (S3 lifecycle to IA/Glacier for older evidence)
- Slim headers/verify JSON (only essential fields)
- Compress manifests per C2PA guidance when large
- Monitor and alert on storage growth

### Risk: Retention Violations
**Mitigation:**
- Explicit hold expirations (mandatory)
- Dashboards + alerts for lingering holds
- Immutable logs of who extended/why
- Quarterly compliance audits

### Risk: Export Performance
**Mitigation:**
- Pre-build common exports
- Parallel file gathering
- Streaming compression
- CDN distribution for downloads

### Risk: Escrow Mirror Lag
**Mitigation:**
- Real-time replication for critical holds
- Monitoring and alerting
- Automatic retry with exponential backoff
- Manual sync trigger for operators

## Why This Is Defensible (one line)

You're packaging WORM-retained, time-stamped, tamper-evident provenance evidence that legal teams can export and verify offline—rooted in S3 Object Lock, RFC 3161, HTTP semantics, and transparency-log proofs.

## Implementation Checklist

- [ ] S3 buckets with Object Lock Compliance mode
- [ ] Versioning enabled on all evidence buckets
- [ ] RFC 3161 TSA integration
- [ ] Transparency log (Merkle tree)
- [ ] Legal hold manager
- [ ] Escrow mirror to separate account
- [ ] Export builder with JWS signing
- [ ] Offline verification CLI
- [ ] Operator UI (case view, hold panel)
- [ ] Nightly sweeper job
- [ ] Observability metrics
- [ ] Monthly consistency proof
- [ ] Exit test automation

## References

- **S3 Object Lock:** AWS Documentation - SEC 17a-4 compliance
- **RFC 3161:** IETF - Time-Stamp Protocol (TSP)
- **RFC 9110:** IETF - HTTP Semantics
- **RFC 7515:** IETF - JSON Web Signature (JWS)
- **Rekor:** Sigstore - Transparency Log
- **NIST SP 800-92:** Log Management
- **NIST SP 800-53:** Security and Privacy Controls
- **C2PA Specification:** Content Authenticity Initiative
