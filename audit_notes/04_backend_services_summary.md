# Backend Services File Summary

## Critical Files Analyzed in Detail

### apps/api/src/services/c2pa-service.ts
**Purpose**: Core C2PA signing and verification orchestrator  
**Key Functions**: `signImage()`, `verifySignature()`, `validateManifest()`  
**Public Interface**: SigningOptions, SigningResult, SignedImage  
**Side Effects**: File I/O, cryptographic operations, storage calls  
**Dependencies**: CertificateManager, ManifestBuilder, C2PAWrapper, MetadataEmbedder, ProofStorage  
**Security Concerns**: Flag-based real C2PA control (useRealC2PA), potential for mock signing in production  
**Performance**: Sharp image processing, LRU caching, synchronous operations  
**Tests**: Unknown - test files not examined  
**Verdict**: **Refactor** - Mixed mock/real implementation creates security ambiguity

### apps/api/src/services/certificate-manager.ts  
**Purpose**: Digital certificate lifecycle management with KMS integration  
**Key Functions**: `getCurrentCertificate()`, `rotateCertificate()`, `decryptWithKMS()`  
**Public Interface**: Certificate interface, rotation scheduling  
**Side Effects**: File system access, AWS KMS calls, timer management  
**Dependencies**: AWS SDK, crypto module, file system  
**Security Concerns**: Synchronous certificate loading in constructor, production-only KMS initialization  
**Performance**: Blocking file operations, 90-day rotation intervals  
**Tests**: Unknown  
**Verdict**: **Refactor** - Synchronous operations and conditional security features

### apps/api/src/services/signature-verifier.ts
**Purpose**: Cryptographic signature validation and tamper detection  
**Key Functions**: `verifySignature()`, `detectTampering()`, `validateCertificateChain()`  
**Public Interface**: SignatureVerificationResult, TamperDetectionResult, TamperIndicator  
**Side Effects**: Cryptographic computations, hash comparisons  
**Dependencies**: Node.js crypto module, X509Certificate  
**Security Concerns**: Comprehensive verification logic, detailed tamper indicators  
**Performance**: Heavy crypto operations, multiple hash validations  
**Tests**: Unknown  
**Verdict**: **Keep** - Well-structured security-critical component

### apps/api/src/services/proof-storage.ts
**Purpose**: C2PA proof persistence with multi-backend support  
**Key Functions**: `storeProof()`, `getProof()`, `getProofByHash()`, `deleteProof()`  
**Public Interface**: ProofRecord, storage statistics  
**Side Effects**: File I/O, S3 operations, memory cache updates  
**Dependencies**: File system, S3 client, crypto UUID generation  
**Security Concerns**: Dual implementation with package version, inconsistent persistence defaults  
**Performance**: Synchronous file operations, memory leak potential  
**Tests**: Unknown  
**Verdict**: **Refactor** - Duplicate implementations and blocking I/O

### apps/api/src/middleware/error-handler.ts
**Purpose**: Centralized error processing with security sanitization  
**Key Functions**: `errorHandler()`, `AppError` class  
**Public Interface**: Error response format, error categorization  
**Side Effects**: HTTP responses, logging, security event recording  
**Dependencies**: Express, security monitor  
**Security Concerns**: Information disclosure prevention, detailed error logging  
**Performance**: Minimal overhead, synchronous error processing  
**Tests**: Unknown  
**Verdict**: **Keep** - Essential security component with proper sanitization

## High-Priority Files Requiring Examination

### Security-Critical Services
- **virus-scan.ts** (6290 bytes) - File content scanning, malware detection
- **secrets-manager.ts** (5010 bytes) - AWS Secrets Manager integration, credential handling  
- **metadata-embedder.ts** (22663 bytes) - C2PA manifest embedding, file manipulation
- **certificate-validator.ts** (21475 bytes) - Certificate chain validation, trust verification

### Core Business Logic  
- **manifest-builder.ts** (5052 bytes) - C2PA manifest construction, assertion handling
- **metadata-extractor.ts** (18094 bytes) - EXIF/metadata parsing, content analysis
- **confidence-calculator.ts** (12034 bytes) - Verification confidence scoring

### Storage & Infrastructure
- **storage-manager.ts** (8749 bytes) - Storage backend orchestration
- **cloud-proof-storage.ts** (14174 bytes) - Cloud storage abstraction layer

## Sampled/Lower Priority Files (20+ total)

### Performance & Optimization
- **memory-optimizer.ts** (5268 bytes) - Memory management and cleanup
- **cache-manager.ts** (8794 bytes) - Multi-layer caching strategy  
- **deduplication-service.ts** (6814 bytes) - Content deduplication logic

### Utility & Wrapper Services  
- **c2pa-wrapper.ts** (4966 bytes) - C2PA library abstraction
- **c2pa-native-service.ts** (11641 bytes) - Native C2PA integration
- **jumbf-builder.ts** (6392 bytes) - JUMBF binary format handling

### Specialized Services
- **advanced-extractor.ts** (20178 bytes) - Enhanced metadata extraction
- **confidence-calculator.ts** (12034 bytes) - Verification scoring algorithms

## Evidence & Critical Findings

**Duplicate ProofStorage Implementations**:
- apps/api/src/services/proof-storage.ts:25-69 (API version)
- packages/storage/src/proof-storage.ts:35-66 (Package version)
- Different defaults and persistence strategies

**Security Flag Issues**:
- apps/api/src/services/c2pa-service.ts:15 (useRealC2PA flag)
- apps/api/src/services/certificate-manager.ts:21-23 (production-only KMS)

**Blocking Operations**:
- apps/api/src/services/certificate-manager.ts:26 (sync certificate loading)
- apps/api/src/services/proof-storage.ts:159 (writeFileSync blocking)

**Missing Error Handling**:
- Multiple services lack comprehensive error boundaries
- No circuit breakers for external dependencies
