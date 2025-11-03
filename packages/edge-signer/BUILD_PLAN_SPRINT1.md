# Phase 27: Build Plan - Sprint 1

## Sprint 1 Goal: WASM & TBS Path Implementation

### Task 1.1: Rust WASM Core Development
**Deliverable**: `src/wasm/signer_core.rs`
- [ ] Compile minimal Rust signer core to WASM
- [ ] Generate TBS bytes for ES256 signatures
- [ ] Omit file-I/O codepaths not supported in WASM
- [ ] Use c2pa crate in WASM-compatible mode
- [ ] Export functions: `prepare_tbs()`, `canonicalize_assertions()`

**Acceptance Criteria**:
- WASM module < 500KB compressed
- Functions callable from JavaScript
- No filesystem dependencies
- Memory usage < 50MB per instance

### Task 1.2: Workers WASM Integration
**Deliverable**: `src/edge_signer.ts`
- [ ] Implement WASM module import for Workers
- [ ] Verify `WebAssembly.instantiate` path
- [ ] Add module-type import validation
- [ ] Implement WASM error handling
- [ ] Add memory management for WASM instances

**Acceptance Criteria**:
- WASM loads successfully in Workers runtime
- Proper error handling for WASM failures
- Memory cleanup after each request
- Module integrity verification

### Task 1.3: Edge Sign API Implementation
**Deliverable**: `/edge-sign` endpoint
- [ ] Accept POST requests with JSON payload
- [ ] Support asset_sha256 or asset_inline (base64)
- [ ] Validate tenant_id and policy_id
- [ ] Call WASM for TBS preparation
- [ ] Implement request validation middleware

**API Contract**:
```typescript
interface EdgeSignRequest {
  asset_sha256?: string;
  asset_inline?: string; // base64
  policy_id: string;
  assertions: object;
  tenant_id: string;
  tsa?: boolean;
}
```

### Task 1.4: Central Signer Integration
**Deliverable**: Remote signing client
- [ ] Implement HTTPS client to central signer
- [ ] Handle authentication with central service
- [ ] Process signature response
- [ ] Add retry logic with exponential backoff
- [ ] Implement circuit breaker pattern

**Acceptance Criteria**:
- Successful integration with test central signer
- Proper error handling and retry logic
- Timeout handling (30s max)
- Response validation

### Task 1.5: Manifest Storage & Response
**Deliverable**: Complete flow implementation
- [ ] Store sidecar manifests to R2
- [ ] Generate manifest URLs
- [ ] Set `Link: rel="c2pa-manifest"` headers
- [ ] Return structured response with timing data
- [ ] Add logging and observability

**Response Format**:
```typescript
interface EdgeSignResponse {
  manifest_url: string;
  signing_mode: "edge-tbs+remote-es256";
  p95_ms: {
    wasm: number;
    kms: number;
    total: number;
  };
  kms_key_id: string;
  tsa_token_url?: string;
}
```

## Sprint 1 Deliverables
1. ✅ Rust WASM core module
2. ✅ Workers integration layer
3. ✅ `/edge-sign` API endpoint
4. ✅ Central signer client
5. ✅ Manifest storage system
6. ✅ Basic observability and logging

## Exit Criteria
- All tasks completed with acceptance criteria met
- Integration tests passing
- Basic performance benchmarks (<200ms total)
- Security review completed (no keys at edge)
