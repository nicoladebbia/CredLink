# Data Layer Codemap

## Scope
Proof storage, manifest management, and data persistence patterns

## Main Components

### ProofStorage (apps/api/src/services/proof-storage.ts)
- **Multi-backend architecture**: In-memory cache + optional filesystem + S3 integration
- **Storage hierarchy**: Memory cache → filesystem (dev) → S3 (production)
- **Data model**: ProofRecord with proofId, proofUri, imageHash, manifest, timestamp, signature, expiresAt
- **Persistence options**: Configurable via USE_LOCAL_PROOF_STORAGE and S3 environment variables
- **Cleanup**: Automatic expired proof removal (24-hour intervals)
- **Indexing**: Hash-based lookup for image-to-proof mapping

### Storage Package (packages/storage)
- **Abstracted storage layer**: Separate ProofStorage class with S3 integration
- **S3 backend**: S3ProofStorage with bucket/prefix configuration
- **Database optimizer**: Complex query optimization logic (9422 bytes)
- **Dual implementations**: API service and package have different ProofStorage classes

### ManifestStore (packages/manifest-store)
- **Enterprise-grade storage**: Comprehensive manifest management with validation
- **Security layers**: Tenant isolation, input sanitization, rate limiting, audit logging
- **Object validation**: Strict key patterns (`/^[a-f0-9]{64}\.c2pa$/`), size limits, MIME type checks
- **Concurrency control**: Distributed locking mechanism with 30-second timeouts
- **Audit trail**: Comprehensive audit logging with configurable retention
- **Rate limiting**: Per-tenant rate limiting with 100 requests/minute default

## Key Flows

### Proof Storage Flow
1. Manifest generation → proof ID creation → storage backend selection
2. Memory cache update → persistent storage (S3/filesystem) → URI generation
3. Hash indexing → cleanup scheduling → response with proof URI

### Manifest Retrieval Flow
1. Request validation → tenant/author checks → rate limiting
2. Object key validation → metadata lookup → audit logging
3. Signed URL generation → integrity verification → response

### Data Consistency Flow
1. Distributed lock acquisition → validation checks → storage operation
2. Audit record creation → lock release → metrics update
3. Background cleanup → replication (if enabled) → consistency verification

## Obvious Risks & Weirdness

### Critical Data Integrity Issues
1. **Duplicate ProofStorage classes** - Two different implementations with different behaviors (apps/api vs packages/storage)
2. **Inconsistent persistence** - API defaults to filesystem in production, package defaults to memory (apps/api/src/services/proof-storage.ts:42-48)
3. **No transaction support** - File operations are atomic but no cross-backend transaction handling
4. **Missing data validation** - ProofStorage accepts any manifest structure without schema validation

### Security Vulnerabilities
1. **Filesystem exposure** - Local file storage without access controls (apps/api/src/services/proof-storage.ts:155-160)
2. **Predictable proof IDs** - UUID v4 generation, potentially guessable proof URIs
3. **No encryption at rest** - Filesystem storage stores plain JSON manifests
4. **Rate limiting bypass** - ManifestStore has rate limiting but ProofStorage doesn't

### Performance & Scalability Issues
1. **Synchronous file operations** - writeFileSync blocks request handling (apps/api/src/services/proof-storage.ts:159)
2. **Memory leak potential** - In-memory cache grows indefinitely until cleanup
3. **Single-node limitation** - No distributed coordination for multi-instance deployments
4. **N+1 query pattern** - Hash index lookup followed by full proof retrieval

### Architectural Problems
1. **Storage abstraction violation** - Business logic knows about S3/filesystem details
2. **No backup/restore** - No mechanism to backup or restore proof data
3. **Missing migration path** - No way to migrate between storage backends
4. **Configuration complexity** - Multiple overlapping environment variables for storage selection

### Reliability Concerns
1. **Partial failure handling** - S3 upload failure doesn't rollback memory cache
2. **No health checks** - Storage backend failures not detected or reported
3. **Missing monitoring** - No metrics for storage performance or error rates
4. **Data loss scenarios** - Memory mode loses all data on restart, filesystem mode vulnerable to disk failures

## Evidence
- ProofStorage API: apps/api/src/services/proof-storage.ts:25-69 (constructor), 74-113 (storeProof)
- ProofStorage package: packages/storage/src/proof-storage.ts:35-66 (constructor), 71-100 (storeProof)
- ManifestStore validation: packages/manifest-store/src/manifest-store.ts:44-64 (config validation), 66-85 (input validation)
- S3 integration: packages/storage/src/storage/s3-proof-storage.ts (separate backend implementation)
- Security constants: packages/manifest-store/src/manifest-store.ts:21-38 (rate limits, validation rules)
