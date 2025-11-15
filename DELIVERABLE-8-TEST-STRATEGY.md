# DELIVERABLE 8: TEST STRATEGY & MISSING TEST CASES

**Status:** ✅ COMPLETE  
**Date:** November 13, 2025  
**Current Coverage:** 0% → Target: 80%  

---

## CURRENT STATUS

**Test Infrastructure:**
- Files: 252 | Cases: ~1,277
- Execution: ❌ 0% runnable
- Coverage: ❌ 0%

**Test Types:**
- Unit (41): ❌ Broken
- Integration (5): ❌ Broken
- E2E (5): ❌ Broken
- Performance (6): ❌ Broken
- Security (3): ❌ Broken
- Survival (8): ⚠️ Mocked
- Acceptance (2): ⚠️ Mocked

---

## CRITICAL MISSING TESTS

### 1. HTTP Endpoint Tests 🔴
**File:** `apps/api/tests/e2e/endpoints.test.ts`
- POST /sign validation (415, 400, 413, 429, headers)
- POST /verify validation
- GET /health status codes
- GET /metrics Prometheus format

### 2. Authentication Tests 🔴
**File:** `apps/api/tests/security/auth-edge-cases.test.ts`
- Expired/revoked/malformed keys
- Missing headers
- Failed attempt logging
- Permission-based authorization

### 3. Rate Limiting Tests 🔴
**File:** `apps/api/tests/integration/rate-limit-behavior.test.ts`
- Burst limits (10 free, 100 pro, 1000 enterprise)
- Reset after 1 minute
- Per-client separation
- Retry-After headers

### 4. Storage Tests 🟠
**File:** `apps/api/tests/integration/s3-proof-storage.test.ts`
- Upload with metadata
- Encryption at rest
- Lifecycle policies
- Presigned URLs
- Error handling

### 5. Security Injection Tests 🔴
**File:** `apps/api/tests/security/injection-attacks.test.ts`
- SQL injection in assertions
- XSS in metadata
- Path traversal in URIs
- SSRF prevention
- Log sanitization

### 6. Certificate Tests 🟠
**File:** `apps/api/tests/unit/certificate-rotation.test.ts`
- Expiry detection
- CSR generation
- CA submission
- No-interrupt rotation

### 7. Error Handling Tests 🟠
**File:** `apps/api/tests/unit/error-scenarios.test.ts`
- Sharp errors
- S3 network errors
- KMS unavailability
- Certificate loading failures
- Manifest parsing errors

### 8. Performance Tests 🟡
**File:** `apps/api/tests/performance/concurrent-sign.test.ts`
- 100 concurrent signs
- Memory leak detection
- P95 <2s under load
- Graceful degradation

### 9. Real Survival Tests 🟠
**File:** `apps/api/tests/survival/real-transformations.test.ts`
- ImageOptim compression
- TinyPNG optimization
- Social media uploads (Twitter, Instagram, WhatsApp)
- Format conversions
- Resize/crop/rotate operations

---

## TEST COVERAGE GOALS

| Component | Current | Target | Gap |
|-----------|---------|--------|-----|
| Global | 0% | 70% | +70% |
| Services | 0% | 80% | +80% |
| Routes | 0% | 90% | +90% |
| Middleware | 0% | 85% | +85% |
| Utils | 0% | 75% | +75% |

---

## IMPLEMENTATION ROADMAP

### Phase 1: Fix Existing (Week 1)
1. Fix jest.config.js paths
2. Run existing tests
3. Triage failures
4. Get to >50% passing

### Phase 2: Critical Gaps (Weeks 2-4)
5. HTTP endpoint tests
6. Authentication tests
7. Error handling tests
8. Storage integration tests
9. **Target: 60% coverage**

### Phase 3: Security & Performance (Weeks 5-6)
10. Injection attack tests
11. Concurrent load tests
12. Real survival tests
13. **Target: 70% coverage**

### Phase 4: Comprehensive (Weeks 7-8)
14. Package tests
15. E2E workflow tests
16. Infrastructure tests
17. **Target: 80% coverage**

---

## MINIMAL TEST STUBS

### HTTP Endpoint Test:
```typescript
import request from 'supertest';
import app from '../../src/index';

describe('POST /api/sign', () => {
  it('should sign image and return buffer', async () => {
    const response = await request(app)
      .post('/api/sign')
      .attach('image', './fixtures/test.jpg')
      .set('X-API-Key', 'test-key')
      .expect(200);

    expect(Buffer.isBuffer(response.body)).toBe(true);
    expect(response.headers['x-proof-uri']).toMatch(/^https:\/\//);
  });
});
```

### S3 Storage Test:
```typescript
import { ProofStorageService } from '../../src/services/proof-storage';

describe('S3ProofStorage', () => {
  it('should store and retrieve proof', async () => {
    const storage = new ProofStorageService({ bucket: 'test' });
    const proof = { manifest: {}, imageHash: 'test123' };
    
    const uri = await storage.storeProof('id-1', proof);
    expect(uri).toMatch(/^https:\/\//);
    
    const retrieved = await storage.getProof('id-1');
    expect(retrieved).toEqual(proof);
  });
});
```

### Security Injection Test:
```typescript
describe('Injection Prevention', () => {
  it('should reject XSS in metadata', async () => {
    const response = await request(app)
      .post('/api/sign')
      .send({ title: '<script>alert("XSS")</script>' })
      .expect(400);
    
    expect(response.body.error.message).toContain('Invalid');
  });
});
```

---

## PRIORITY MATRIX

**Critical (Do First):**
- ✅ HTTP endpoint tests (3 days)
- ✅ Authentication tests (2 days)
- ✅ Security injection tests (3 days)
- ✅ Rate limiting tests (2 days)

**High (This Month):**
- Storage integration (2 days)
- Certificate rotation (2 days)
- Error scenarios (2 days)

**Medium (Next Quarter):**
- Performance tests (1 week)
- Real survival tests (1 week)
- Package tests (1 week)

**Low (Nice to Have):**
- Infrastructure tests
- Acceptance tests
- E2E workflows

---

## SUCCESS CRITERIA

**Phase 1 Complete:**
- ✅ All existing tests passing
- ✅ >50% test success rate

**Phase 2 Complete:**
- ✅ All critical tests implemented
- ✅ 60% code coverage
- ✅ Zero security test failures

**Phase 3 Complete:**
- ✅ All high-priority tests done
- ✅ 70% code coverage
- ✅ Performance benchmarks met

**Phase 4 Complete:**
- ✅ Comprehensive test suite
- ✅ 80% code coverage
- ✅ Production-ready testing

---

**DELIVERABLE STATUS:** ✅ COMPLETE  
**Next Action:** Implement Phase 1 critical tests  
**Timeline:** 8 weeks to full coverage
