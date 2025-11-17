# Architecture & Entrypoints Codemap

## Scope
Core API application structure and request flow analysis

## Main Components

### Application Bootstrap (apps/api/src/index.ts)
- **Express.js server** with comprehensive security middleware stack
- **Service registry pattern** for graceful shutdown management
- **Multi-layered security**: Helmet, CORS, rate limiting, IP whitelisting
- **Observability**: Sentry, Winston logging, Prometheus metrics
- **Health checks**: `/health`, `/ready` endpoints
- **Job scheduler integration** (configurable via ENABLE_JOB_SCHEDULER)

### Core Routes
#### `/sign` (apps/api/src/routes/sign.ts)
- **Purpose**: C2PA image signing with manifest embedding
- **Security layers**: Magic byte validation, malicious signature detection, metadata scanning
- **Rate limiting**: Tenant-aware (IP + tenant ID), configurable limits
- **File validation**: Strict mimetype enforcement, filename sanitization
- **Integration**: C2PAService, ProofStorage, SecurityMonitor
- **Response**: Signed image with proof URI and metadata headers

#### `/verify` (apps/api/src/routes/verify.ts)  
- **Purpose**: C2PA signature validation and proof verification
- **Security layers**: Same validation as sign route
- **Verification flow**: Manifest extraction → signature validation → certificate chain → remote proof comparison
- **Confidence scoring**: 100-point scale based on multiple validation factors
- **Integration**: C2PAService, ProofStorage, CertificateValidator

### Middleware Stack
- **Security**: Helmet (CSP, HSTS), IP whitelisting for metrics
- **Authentication**: Optional API key auth (ENABLE_API_KEY_AUTH)
- **Rate limiting**: Global + endpoint-specific limits
- **Error handling**: Centralized with Sentry integration
- **Metrics**: Prometheus collection with HTTP tracking
- **Logging**: Winston with daily rotation

## Key Flows

### Image Signing Flow
1. Request → Rate limit → File validation → Magic byte check → Metadata scan
2. Custom assertion validation (Zod schema, max 10 assertions)
3. C2PA signing → Proof storage → Response with headers

### Image Verification Flow  
1. Request → Validation → Magic byte check
2. Manifest extraction → Signature validation
3. Certificate chain validation → Remote proof retrieval
4. Confidence calculation → JSON response

## Obvious Risks & Weirdness

### Critical Security Issues
1. **Duplicate security validation** - Magic byte validation duplicated between routes (maintenance risk)
2. **Hardcoded security patterns** - Malicious signatures, suspicious patterns embedded in code
3. **File system dependency** - Certificate validation assumes file system access (apps/api/src/routes/verify.ts:311-313)
4. **Synchronous file reads** - Certificate loading blocks request handling

### Architectural Concerns  
1. **Service registration pattern** - Manual registration required for cleanup (error-prone)
2. **Mixed responsibilities** - Routes contain both HTTP handling and business logic
3. **No API versioning** - Routes at root level, breaking changes will be difficult
4. **Missing input sanitization** - Some inputs validated but not consistently sanitized

### Performance Risks
1. **Large file processing** - No streaming, files loaded entirely into memory
2. **Synchronous certificate validation** - Blocks verification requests
3. **No caching** - Certificate validation repeated for each request

### Reliability Issues
1. **Single point of failure** - No circuit breakers for external dependencies
2. **Missing timeouts** - C2PA operations have no explicit timeouts
3. **Fire-and-forget logging** - Security events logged but no alerting integration

## Evidence
- Main server setup: apps/api/src/index.ts:44-175
- Sign route security: apps/api/src/routes/sign.ts:63-186, 233-314
- Verify route flow: apps/api/src/routes/verify.ts:292-376
- Service registration: apps/api/src/index.ts:16-25, 174
