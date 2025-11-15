# DELIVERABLE 3: END-TO-END BEHAVIOR SUMMARY

**Status:** ✅ COMPLETED AND VERIFIED  
**Date:** November 12, 2025  
**Last Updated:** November 12, 2025 (All Phase 2 improvements included)

---

## Request/Response Paths

### 1. Sign Image Workflow ✅ WORKING

**Endpoint:** `POST /sign`  
**Content-Type:** `multipart/form-data`  
**Authentication:** Optional API key (Bearer token or X-API-Key header)  
**Params:**
- `image` (file, required) - Image to sign
- `creator` (string, optional) - Creator name
- `title` (string, optional) - Image title
- `description` (string, optional) - Image description

**Constraints:**
- Max Size: 50MB (configurable via `MAX_FILE_SIZE_MB`)
- Rate Limit: 100 requests/minute/IP
- Allowed Formats: JPEG, PNG, WebP
- Max Dimensions: <100 megapixels

**Execution Flow:**

#### Step 1: Request Validation (`sign.ts:54`)
```
1.1 API Key Authentication (if enabled)
    ├─ Check Authorization: Bearer <token>
    ├─ OR X-API-Key: <token>
    ├─ Validate against configured API_KEYS
    └─ Attach client info to request

1.2 Rate Limiting
    ├─ Check requests/minute per IP
    ├─ Max 100 req/min in dev mode
    └─ Return 429 if exceeded

1.3 Multer File Upload
    ├─ Validate mimetype starts with 'image/'
    ├─ Check size <= 50MB
    ├─ Buffer file into req.file
    └─ Reject if validation fails
```

#### Step 2: Image Signing (`c2pa-service.ts:82`)
```
2.1 validateImage() (line 211)
    ├─ Check Buffer validity (not null/empty)
    ├─ Check size (0 < size <= 50MB)
    ├─ Detect format via magic bytes:
    │  ├─ JPEG: FF D8 FF
    │  ├─ PNG: 89 50 4E 47
    │  └─ WebP: 52 49 46 46 + WEBP
    ├─ Validate dimensions with Sharp (<100 megapixels)
    └─ Throw ValidationError if invalid

2.2 generateImageHash() (line 247)
    ├─ SHA-256 content hash
    ├─ Perceptual hash (phash) for deduplication
    └─ Combined format: "sha256:{hash}:phash:{phash}"

2.3 ManifestBuilder.build() (line 91)
    ├─ Create C2PA manifest JSON
    ├─ Add claim_generator (e.g., "CredLink/1.0.0")
    ├─ Add timestamp (ISO 8601)
    ├─ Include creator metadata
    ├─ Add custom assertions
    └─ Generate manifest URI (urn:uuid:{random})

2.4 ProofStorage.storeProof() (line 101)
    ├─ Generate UUID proof ID
    ├─ Create proofUri: https://proofs.credlink.com/{uuid}
    ├─ Store in memory (cache layer)
    ├─ Store in S3 (if USE_S3_PROOF_STORAGE=true)
    │  ├─ Bucket: S3_PROOF_BUCKET
    │  ├─ Key: {S3_PROOF_PREFIX}YYYY/MM/DD/{uuid}.json
    │  ├─ Encryption: AES-256
    │  └─ Metadata tags: proof-id, image-hash, timestamp
    ├─ Store in filesystem (if USE_LOCAL_PROOF_STORAGE=true)
    │  └─ Path: {PROOF_STORAGE_PATH}/{uuid}.json
    └─ Return proofUri

2.5 performCryptoSigning() (line 106)
    ├─ Generate manifestUri (urn:uuid:{random})
    ├─ CertificateManager.getSigningKey()
    │  ├─ In production: Decrypt from AWS KMS
    │  │  ├─ KMS_KEY_ID from env
    │  │  └─ Decrypt ENCRYPTED_PRIVATE_KEY
    │  └─ In development: Read ./certs/signing-key.pem
    ├─ crypto.sign('RSA-SHA256', manifestBuffer, signingKey)
    ├─ Base64-encode signature
    └─ Return signature + manifestUri

2.6 MetadataEmbedder.embedProofInImage()
    ├─ JPEG Strategy:
    │  ├─ Sharp: Add EXIF metadata
    │  │  ├─ ImageDescription: proofUri
    │  │  ├─ Copyright: proofUri
    │  │  └─ Artist: "CredLink Signing Service"
    │  └─ JUMBF: Inject APP11 segment (if supported)
    │     ├─ Create JUMBF box
    │     ├─ Embed manifest
    │     └─ Insert after SOI marker
    │
    ├─ PNG Strategy:
    │  ├─ Sharp: Add EXIF metadata
    │  ├─ Custom chunks:
    │  │  ├─ c2pA: C2PA manifest
    │  │  └─ crLk: Proof URI
    │  └─ CRC-32 validation
    │
    └─ WebP Strategy:
       └─ Sharp: Add EXIF metadata only

2.7 Cache Management
    ├─ Store manifest in LRU cache
    ├─ Max 1000 entries
    ├─ TTL: 24 hours
    └─ Enable fast retrieval
```

#### Step 3: Metrics Collection (`sign.ts:89`)
```
3.1 Track Image Signing Metrics
    ├─ image_signing_duration_seconds (histogram)
    ├─ image_signing_total (counter)
    ├─ image_size_bytes (histogram)
    └─ Labels: format, success/failure
```

#### Step 4: Response (`sign.ts:96-104`)
```
4.1 Return Signed Image ✅ FIXED
    ├─ Body: signingResult.signedBuffer (NOT original)
    ├─ Headers:
    │  ├─ X-Proof-Uri: {proofUri}
    │  ├─ X-Manifest-Hash: {imageHash}
    │  └─ X-Processing-Time: {duration}ms
    └─ Content-Type: image/jpeg (original mimetype)

4.2 Error Handling
    ├─ Catch all errors
    ├─ Log to Winston (production-safe)
    ├─ Send to Sentry (if enabled)
    ├─ Track error metrics
    └─ Return appropriate HTTP status
```

**Status:** ✅ **FULLY FUNCTIONAL** (critical bug fixed in line 84)

---

### 2. Verify Image Workflow ⚠️ STUB

**Endpoint:** `POST /verify`  
**Status:** ❌ NOT IMPLEMENTED (stub only)

**Expected Flow (not implemented):**
```
1. Upload signed image
2. MetadataExtractor.extract()
   ├─ Try JUMBF extraction (primary)
   ├─ Try EXIF extraction (fallback)
   ├─ Try XMP extraction (secondary)
   ├─ Try PNG custom chunks (format-specific)
   └─ Return manifest + proofUri + confidence

3. Fetch proof from ProofStorage
   ├─ Query by proofUri
   ├─ Check S3 (if enabled)
   ├─ Check filesystem (if enabled)
   └─ Check memory cache

4. Verify signature
   ├─ CertificateManager.getCurrentCertificate()
   ├─ crypto.verify() with public key
   └─ Validate timestamp

5. Return verification result
   ├─ isValid: boolean
   ├─ manifest: object
   ├─ signature: object
   ├─ confidence: number
   └─ errors: array
```

**Actual Implementation:**
- Stub endpoint exists in `verify.ts`
- Returns placeholder response
- TODO: Full implementation

---

### 3. Health Check Workflow ✅ WORKING

**Endpoints:**

#### GET /health
```
Purpose: Basic health check
Response:
{
  "status": "ok",
  "uptime": <seconds>,
  "timestamp": "<ISO 8601>",
  "environment": "development|production"
}
```

#### GET /ready
```
Purpose: Readiness probe for k8s/orchestration
Response:
{
  "ready": true,
  "checks": {
    "service": "ok"
  }
}
```

#### GET /metrics ✅ NEW
```
Purpose: Prometheus metrics endpoint
Response: Prometheus text format
Metrics:
- http_request_duration_seconds (histogram)
- http_requests_total (counter)
- http_requests_in_progress (gauge)
- image_signing_duration_seconds (histogram)
- image_signing_total (counter)
- image_signing_errors_total (counter)
- image_size_bytes (histogram)
- proof_storage_size_bytes (gauge)
```

**Missing (future enhancement):**
- Database connectivity check
- External service health (S3, KMS)
- Memory/CPU metrics
- Dependency version info

---

### 4. API Key Management ✅ NEW

**Authentication Flow:**
```
1. Client sends request with API key
   ├─ Header: Authorization: Bearer <key>
   └─ OR Header: X-API-Key: <key>

2. apiKeyAuth.authenticate() middleware
   ├─ Extract token from headers
   ├─ Validate against API_KEYS env var
   │  Format: key1:clientId1:Name,key2:clientId2:Name
   ├─ Attach client info to req.client
   │  ├─ clientId: string
   │  ├─ clientName: string
   │  └─ apiKey: string (for logging)
   └─ Call next() if valid, 401 if invalid

3. Request proceeds to handler
   └─ Client info available in req.client
```

**Configuration:**
```bash
ENABLE_API_KEY_AUTH=true
API_KEYS=abc123:client1:ClientName,def456:client2:ClientName2
```

---

## Background Jobs

### 1. Proof Storage Cleanup ✅ IMPLEMENTED

**Schedule:** Every 24 hours  
**File:** `proof-storage.ts:46`  
**Function:** `scheduleCleanup()`

**Execution:**
```
1. Run via setInterval (24 hours)
2. cleanupExpiredProofs()
   ├─ Iterate over all proofs in memory
   ├─ Check expiresAt < Date.now()
   ├─ Delete expired proofs
   │  ├─ Remove from memory Map
   │  ├─ Remove from hashIndex
   │  ├─ Delete from S3 (if enabled)
   │  └─ Delete from filesystem (if enabled)
   └─ Log cleanup stats

3. Properly tracked via cleanupInterval
4. Cleared in close() method for graceful shutdown
```

**Expiration:** 1 year from creation (365 days)

**Issues:**
- ⚠️ No distributed locking (will run on every instance)
- ⚠️ Could benefit from queue-based cleanup
- ⚠️ No monitoring of cleanup failures

**Recommendation:** Move to cron job or scheduled lambda for production

---

### 2. Certificate Rotation ✅ IMPLEMENTED

**Schedule:** Every 24 hours  
**File:** `certificate-manager.ts:188`  
**Function:** `startRotationScheduler()`

**Execution:**
```
1. Run via setInterval (24 hours)
2. checkCertificateExpiration()
   ├─ Get current certificate
   ├─ Parse expiration date
   ├─ Calculate days remaining
   └─ If <90 days remaining:
      └─ rotateCertificate()
         ├─ Generate new CSR (stub in dev)
         ├─ Submit to CA (stub in dev)
         ├─ Download new certificate
         ├─ Update currentCertificate
         ├─ Emit 'certificate:rotated' event
         └─ Log rotation

3. Properly tracked via rotationTimer
4. Cleared in destroy() method
```

**Issues:**
- ⚠️ Production rotation not fully implemented (CSR generation is stub)
- ⚠️ No distributed coordination
- ⚠️ Manual certificate upload still required

**Recommendation:** Integrate with AWS Certificate Manager or Let's Encrypt

---

### 3. Sentry Error Aggregation ✅ NEW

**Schedule:** Real-time  
**File:** `utils/sentry.ts`  
**Function:** Background error capture

**Execution:**
```
1. Automatic error capture
   ├─ All uncaught exceptions
   ├─ All unhandled promise rejections
   └─ Manual captureException() calls

2. Error batching and sending
   ├─ Batch errors for network efficiency
   ├─ Send to Sentry.io
   └─ Include context (user, request, breadcrumbs)

3. Graceful shutdown
   └─ flush(2000) before process exit
```

---

### 4. Metrics Collection ✅ NEW

**Schedule:** Real-time  
**File:** `middleware/metrics.ts`  
**Function:** Continuous metric collection

**Execution:**
```
1. HTTP request metrics (automatic)
   ├─ Track every request
   ├─ Record duration, status, route
   └─ Update Prometheus histograms/counters

2. Business metrics (manual)
   ├─ Image signing operations
   ├─ Image sizes
   ├─ Error rates
   └─ Storage usage

3. Scraping
   └─ Prometheus scrapes /metrics endpoint
```

---

## CLIs

### Currently Available: ❌ NONE

**Missing command-line tools:**
1. Bulk signing utility
2. Proof migration tool
3. Certificate generation helper
4. Database seeding script
5. Configuration validator
6. Backup/restore utility

**Recommendation:** Create `scripts/` directory with:
```
scripts/
├── bulk-sign.ts         # Bulk image signing
├── migrate-proofs.ts    # S3 migration utility
├── generate-cert.ts     # Certificate generation
├── validate-config.ts   # Environment validation
└── backup-proofs.ts     # Backup utility
```

---

## Schedulers

### Currently Available: Basic timers only

**Implemented (setInterval):**
1. ✅ Proof cleanup (24h interval)
2. ✅ Certificate rotation check (24h interval)

**Missing (recommended):**
1. ❌ Cron-based schedulers
2. ❌ Queue-based jobs (Bull, BeeQueue)
3. ❌ Distributed job scheduling (Agenda, node-cron)

**Current Implementation:**
```typescript
// proof-storage.ts
this.cleanupInterval = setInterval(() => {
  this.cleanupExpiredProofs();
}, 24 * 60 * 60 * 1000);

// certificate-manager.ts
this.rotationTimer = setInterval(() => {
  this.checkCertificateExpiration();
}, 24 * 60 * 60 * 1000);
```

**Issues:**
- ⚠️ Runs on every instance (no coordination)
- ⚠️ No retry logic
- ⚠️ No failure monitoring
- ⚠️ No scheduled execution history

**Recommendation for Production:**
```
1. Replace with distributed scheduler:
   - AWS EventBridge + Lambda
   - Kubernetes CronJob
   - node-cron with Redis locks

2. Add job monitoring:
   - Datadog/New Relic integration
   - Job success/failure metrics
   - Execution duration tracking
   - Alert on job failures

3. Implement retry logic:
   - Exponential backoff
   - Dead letter queue
   - Manual intervention hooks
```

---

## Additional Workflows (New)

### 5. Monitoring & Alerting ✅ NEW

**Prometheus Alerts:**
```
Schedule: Continuous evaluation
Rules: 15 alert rules defined
File: infra/monitoring/alerts.yml

Alerts:
- High error rate (>5%)
- High latency (P95 >500ms)
- Service down
- High CPU/memory usage
- Certificate expiring soon
- Storage nearly full
- Failed signing operations
And 8 more...
```

**Sentry Alerts:**
```
Schedule: Real-time
Rules: 8 alert types
File: infra/monitoring/sentry-alerts.yml

Alerts:
- New error types
- Error spike (>100/min)
- High error rate (>10%)
- Critical errors
- Performance degradation
- Failed deployments
And 2 more...
```

**Notification Channels:**
- Slack webhooks
- PagerDuty integration
- Email notifications
- SMTP server

---

## Data Flow Summary

### Signing Flow (Complete)
```
Client Request
    ↓
API Key Auth (optional)
    ↓
Rate Limiting
    ↓
File Upload (Multer)
    ↓
Image Validation
    ↓
Hash Generation
    ↓
Manifest Building
    ↓
Proof Storage (Memory + S3/Filesystem)
    ↓
Crypto Signing (RSA-SHA256)
    ↓
Metadata Embedding (EXIF/JUMBF/PNG chunks)
    ↓
Metrics Collection
    ↓
Response (Signed Image)
```

### Storage Architecture
```
Request → Memory Cache (LRU)
              ↓
        S3 (Primary)
              ↓
        Filesystem (Fallback)
```

### Monitoring Pipeline
```
Application Metrics → Prometheus
                          ↓
                      Grafana Dashboards

Application Errors → Sentry
                        ↓
                    Alert Manager
                        ↓
                    Notifications
```

---

## Error Handling Paths

### 1. Validation Errors (400)
```
Request → Validation
    ├─ Invalid file type → 400 "Only image files allowed"
    ├─ File too large → 400 "File exceeds 50MB limit"
    ├─ Missing file → 400 "No image file provided"
    └─ Invalid format → 400 "Unable to detect image format"
```

### 2. Authentication Errors (401)
```
Request → API Key Check
    ├─ Missing key → 401 "API key required"
    ├─ Invalid key → 401 "Invalid API key"
    └─ Malformed header → 401 "Invalid Authorization header"
```

### 3. Rate Limit Errors (429)
```
Request → Rate Limiter
    └─ Limit exceeded → 429 "Too many requests"
```

### 4. Server Errors (500)
```
Request → Processing
    ├─ Signing failed → 500 "Image signing failed"
    ├─ Storage failed → 500 "Proof storage failed"
    ├─ KMS failed → 500 "Key decryption failed"
    └─ Unknown error → 500 "Internal server error"
       └─ Logged to Winston + Sentry
          └─ Stack trace removed in production
```

---

## Performance Characteristics

### Latency Targets
- P50: <100ms
- P95: <500ms
- P99: <1000ms

### Throughput
- Target: 100 requests/sec
- Peak: 500 requests/sec (with scaling)

### Resource Usage
- Memory: LRU cache (max 1000 manifests)
- Storage: S3 (unlimited), Filesystem (disk-limited)
- CPU: Crypto signing (CPU-intensive)

---

## Security Flows

### 1. Input Validation
```
All inputs → Sanitization
    ├─ File type whitelisting
    ├─ Size limits enforced
    ├─ Proof URI validation (HTTPS only)
    ├─ String sanitization (control chars removed)
    └─ No private IPs allowed in URIs
```

### 2. Secret Management
```
Development:
  Private Key → File (./certs/signing-key.pem)

Production:
  Encrypted Key → AWS KMS → Decryption → Memory
                                          ↓
                                    Used for signing
                                          ↓
                                    Cleared after use
```

### 3. Security Headers ✅ NEW
```
All responses include:
  - Content-Security-Policy
  - Strict-Transport-Security (HSTS)
  - X-Content-Type-Options: nosniff
  - X-Frame-Options: SAMEORIGIN
  - X-XSS-Protection: 1; mode=block
```

---

## Summary Statistics

### Request Handlers
- **Total:** 5 endpoints
- **Implemented:** 4 (80%)
- **Stub:** 1 (verify - 20%)

### Background Jobs
- **Total:** 4 jobs
- **Implemented:** 4 (100%)
- **Production-Ready:** 2 (50%)

### CLIs
- **Total:** 0
- **Recommended:** 6

### Monitoring
- **Metrics:** 8 types
- **Prometheus Alerts:** 15 rules
- **Sentry Alerts:** 8 rules
- **Dashboards:** 1 Grafana (9 panels)

---

## Production Readiness Assessment

### ✅ Production Ready (8/10)
1. ✅ Core signing workflow
2. ✅ Authentication & authorization
3. ✅ Error handling & logging
4. ✅ Monitoring & metrics
5. ✅ Storage persistence (S3)
6. ✅ Security hardening
7. ✅ Rate limiting
8. ✅ Health checks

### ⚠️ Needs Improvement (2/10)
9. ⚠️ Verification workflow (stub)
10. ⚠️ CLI utilities (missing)

### 🔄 Recommended Enhancements
1. Implement verification endpoint
2. Add CLI utilities
3. Replace setInterval with distributed scheduler
4. Add distributed locking for background jobs
5. Implement request tracing
6. Add API documentation (OpenAPI/Swagger)
7. Create admin dashboard
8. Add bulk operations support

---

**Document Version:** 1.0  
**Created:** November 12, 2025  
**Status:** Complete and accurate  
**Production Ready:** ✅ 80% (8/10 critical features)
