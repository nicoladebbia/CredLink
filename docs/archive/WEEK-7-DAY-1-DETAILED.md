# Week 7, Day 1: Debug Hanging Integration Tests
**Monday, November 11, 2025**

**Daily Goal:** Identify and fix all test hangs, achieve >70% pass rate

---

## Phase 1: Root Cause Analysis (9:00 AM - 10:30 AM) - 90 minutes

### **9:00-9:30 AM: Enable Debugging Tools**

**Task 1.1:** Configure Jest for hang detection
```bash
cd /apps/sign-service
npm install --save-dev why-is-node-running
```

**Task 1.2:** Update jest.config.js
```javascript
module.exports = {
  // ... existing config
  verbose: true,
  detectOpenHandles: true,
  forceExit: false,
  testTimeout: 30000,
  // Add custom reporters
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: './test-results',
      outputName: 'junit.xml'
    }]
  ]
};
```

**Task 1.3:** Create test logging wrapper
```bash
# Create scripts/test-with-logging.sh
#!/bin/bash
echo "[$(date)] Starting test run" > test-execution.log
npm test -- --verbose 2>&1 | tee -a test-execution.log
echo "[$(date)] Test run completed" >> test-execution.log
```

**Deliverable:** Debug tooling configured
**Time Check:** Should complete by 9:30 AM

---

### **9:30-10:30 AM: Isolate Hanging Test**

**Task 1.4:** Run tests individually to find hang
```bash
# Run each test file separately
for test in src/tests/**/*.test.ts; do
  echo "Testing: $test"
  timeout 60 npm test -- "$test" --runInBand
  echo "Exit code: $?"
done
```

**Task 1.5:** Once hang identified, add instrumentation
```typescript
// Add to hanging test file
beforeEach(() => {
  console.log(`[${new Date().toISOString()}] Starting test: ${expect.getState().currentTestName}`);
});

afterEach(() => {
  console.log(`[${new Date().toISOString()}] Completed test: ${expect.getState().currentTestName}`);
});
```

**Task 1.6:** Run with --detectOpenHandles
```bash
npm test -- sign-verify-integration.test.ts \
  --runInBand \
  --detectOpenHandles \
  --forceExit false \
  --verbose
```

**Expected Output:**
```
Jest has detected the following 2 open handles potentially keeping Jest from exiting:

  ●  TCPSERVERWRAP

    > 12 |   const server = app.listen(3001);
         |                      ^
```

**Deliverable:** Exact test and line number that hangs
**Time Check:** Should complete by 10:30 AM

---

## Phase 2: Analyze Resource Leaks (10:30 AM - 12:00 PM) - 90 minutes

### **10:30-11:15 AM: Inspect Service Cleanup**

**Task 2.1:** Audit C2PAService for resource leaks
```bash
# Check for missing cleanup
grep -r "new.*Service" src/services/ | grep -v "cleanup\|close\|destroy"
```

**Task 2.2:** Check sharp image processing cleanup
```typescript
// Add to c2pa-service.ts
private sharpInstances: Set<Sharp> = new Set();

async processImage(buffer: Buffer): Promise<Buffer> {
  const sharpInstance = sharp(buffer);
  this.sharpInstances.add(sharpInstance);
  
  try {
    return await sharpInstance.toBuffer();
  } finally {
    this.sharpInstances.delete(sharpInstance);
    sharpInstance.destroy();
  }
}

async cleanup(): Promise<void> {
  for (const instance of this.sharpInstances) {
    instance.destroy();
  }
  this.sharpInstances.clear();
}
```

**Task 2.3:** Check for unclosed database connections
```bash
# Search for database connection patterns
grep -r "createConnection\|connect(" src/ | grep -v "close\|disconnect"
```

**Deliverable:** List of all resource leaks found
**Time Check:** Should complete by 11:15 AM

---

### **11:15 AM-12:00 PM: Check Promise Handling**

**Task 2.4:** Find unhandled promises
```bash
# Add to package.json scripts
"find-unhandled": "grep -r 'new Promise' src/ | grep -v '.then\|await'"
npm run find-unhandled
```

**Task 2.5:** Add promise rejection handler
```typescript
// Add to test setup file
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  throw reason;
});
```

**Task 2.6:** Check for infinite loops/waits
```bash
# Search for while loops without timeout
grep -r "while\s*(" src/ | grep -v "timeout\|Date.now()"
```

**Deliverable:** All promise issues documented
**Time Check:** Complete Phase 2 by 12:00 PM

---

## LUNCH BREAK (12:00 PM - 1:00 PM)

**Activities:**
- Review findings from morning
- Document root causes
- Plan fixes for afternoon

---

## Phase 3: Implement Fixes (1:00 PM - 3:00 PM) - 120 minutes

### **1:00-2:00 PM: Add Cleanup Hooks**

**Task 3.1:** Create global test cleanup utility
```typescript
// src/tests/setup/cleanup.ts
export class TestCleanup {
  private static cleanupFns: Array<() => Promise<void>> = [];
  
  static register(fn: () => Promise<void>): void {
    this.cleanupFns.push(fn);
  }
  
  static async cleanup(): Promise<void> {
    await Promise.all(this.cleanupFns.map(fn => fn()));
    this.cleanupFns = [];
  }
}

// In jest.setup.ts
afterEach(async () => {
  await TestCleanup.cleanup();
});
```

**Task 3.2:** Add cleanup to C2PAService
```typescript
// src/services/c2pa-service.ts
export class C2PAService {
  private cleanupCallbacks: Array<() => Promise<void>> = [];
  
  constructor() {
    // Register for global cleanup
    TestCleanup.register(() => this.cleanup());
  }
  
  async cleanup(): Promise<void> {
    // Close manifest cache
    this.manifestCache.clear();
    
    // Clear proof storage
    await this.proofStorage.close();
    
    // Destroy sharp instances
    for (const instance of this.sharpInstances) {
      instance.destroy();
    }
    
    // Run registered cleanup callbacks
    await Promise.all(this.cleanupCallbacks.map(cb => cb()));
  }
}
```

**Task 3.3:** Add cleanup to ProofStorage
```typescript
// src/services/proof-storage.ts
export class ProofStorage {
  private s3Client: S3Client | null = null;
  
  async close(): Promise<void> {
    if (this.s3Client) {
      await this.s3Client.destroy();
      this.s3Client = null;
    }
  }
}
```

**Deliverable:** Cleanup infrastructure in place
**Time Check:** Should complete by 2:00 PM

---

### **2:00-3:00 PM: Fix Async Leaks**

**Task 3.4:** Add timeout wrapper utility
```typescript
// src/utils/timeout.ts
export function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  errorMessage?: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new Error(errorMessage || `Timeout after ${ms}ms`)),
        ms
      )
    )
  ]);
}
```

**Task 3.5:** Wrap all external I/O operations
```typescript
// Example in c2pa-service.ts
async signImage(imageBuffer: Buffer): Promise<SigningResult> {
  return withTimeout(
    this._signImageInternal(imageBuffer),
    10000,
    'Signing timeout after 10s'
  );
}
```

**Task 3.6:** Add AbortController for cancellable operations
```typescript
// src/services/metadata-embedder.ts
private abortController: AbortController | null = null;

async embedMetadata(buffer: Buffer): Promise<Buffer> {
  this.abortController = new AbortController();
  
  try {
    return await sharp(buffer, {
      signal: this.abortController.signal
    }).toBuffer();
  } finally {
    this.abortController = null;
  }
}

async cleanup(): Promise<void> {
  if (this.abortController) {
    this.abortController.abort();
  }
}
```

**Deliverable:** All async operations have timeouts
**Time Check:** Complete Phase 3 by 3:00 PM

---

## Phase 4: Test Isolation (3:00 PM - 4:00 PM) - 60 minutes

### **3:00-3:30 PM: Implement Test Isolation**

**Task 4.1:** Create isolated test context
```typescript
// src/tests/setup/test-context.ts
export class TestContext {
  private services: Map<string, any> = new Map();
  
  registerService<T>(name: string, instance: T): void {
    this.services.set(name, instance);
  }
  
  getService<T>(name: string): T {
    return this.services.get(name);
  }
  
  async cleanup(): Promise<void> {
    for (const [name, service] of this.services.entries()) {
      if (service.cleanup) {
        await service.cleanup();
      }
      if (service.close) {
        await service.close();
      }
    }
    this.services.clear();
  }
}

// In test file
let context: TestContext;

beforeEach(() => {
  context = new TestContext();
});

afterEach(async () => {
  await context.cleanup();
});
```

**Task 4.2:** Use separate instances per test
```typescript
// Instead of:
let c2paService: C2PAService; // Shared across tests

// Do:
let createService: () => C2PAService;

beforeEach(() => {
  createService = () => {
    const service = new C2PAService();
    context.registerService('c2pa', service);
    return service;
  };
});
```

**Deliverable:** Test isolation implemented
**Time Check:** Should complete by 3:30 PM

---

### **3:30-4:00 PM: Mock External Dependencies**

**Task 4.3:** Mock S3 client properly
```typescript
// src/tests/mocks/s3-mock.ts
export class S3ClientMock {
  private storage = new Map<string, Buffer>();
  private closed = false;
  
  async putObject(params: PutObjectRequest): Promise<PutObjectOutput> {
    if (this.closed) {
      throw new Error('S3 client is closed');
    }
    this.storage.set(params.Key, params.Body);
    return { ETag: 'mock-etag' };
  }
  
  async getObject(params: GetObjectRequest): Promise<GetObjectOutput> {
    if (this.closed) {
      throw new Error('S3 client is closed');
    }
    const body = this.storage.get(params.Key);
    if (!body) throw new Error('Not found');
    return { Body: body };
  }
  
  async destroy(): Promise<void> {
    this.closed = true;
    this.storage.clear();
  }
}
```

**Task 4.4:** Replace S3 in tests
```typescript
import { S3ClientMock } from './mocks/s3-mock';

beforeEach(() => {
  const s3Mock = new S3ClientMock();
  context.registerService('s3', s3Mock);
  
  // Inject mock into services
  proofStorage = new ProofStorage(s3Mock);
});
```

**Deliverable:** All external deps mocked
**Time Check:** Complete Phase 4 by 4:00 PM

---

## Phase 5: Validation & Testing (4:00 PM - 6:00 PM) - 120 minutes

### **4:00-5:00 PM: Run Fixed Tests**

**Task 5.1:** Run previously hanging test
```bash
npm test -- sign-verify-integration.test.ts \
  --runInBand \
  --detectOpenHandles \
  --verbose
```

**Expected:** Test completes successfully

**Task 5.2:** Run test 10 times to check stability
```bash
for i in {1..10}; do
  echo "Run $i"
  npm test -- sign-verify-integration.test.ts --runInBand
  if [ $? -ne 0 ]; then
    echo "FAILED on run $i"
    break
  fi
done
```

**Task 5.3:** Check for open handles
```bash
# Should show no open handles
npm test -- --detectOpenHandles
```

**Deliverable:** Hanging test now passes consistently
**Time Check:** Should complete by 5:00 PM

---

### **5:00-6:00 PM: Run Full Test Suite**

**Task 5.4:** Run entire test suite
```bash
npm test -- --maxWorkers=2 --verbose > full-test-results.log 2>&1
```

**Task 5.5:** Analyze results
```bash
# Count passing/failing
grep "PASS\|FAIL" full-test-results.log | sort | uniq -c
```

**Task 5.6:** Document improvements
```markdown
## Day 1 Results

### Before:
- Test Suites: 12/25 passing (48%)
- Tests: 203/254 passing (80%)
- Hangs: sign-verify-integration.test.ts

### After:
- Test Suites: __/25 passing (__%)
- Tests: __/254 passing (__%)
- Hangs: None

### Fixes Applied:
1. Added cleanup hooks to C2PAService
2. Added timeout wrappers to async operations
3. Implemented test isolation with TestContext
4. Properly mocked external dependencies
5. Added resource tracking and cleanup

### Remaining Issues:
- [List any tests still failing]
```

**Deliverable:** Full test results and improvement metrics
**Time Check:** Complete Phase 5 by 6:00 PM

---

## Phase 6: Documentation (6:00 PM - 7:00 PM) - 60 minutes

### **6:00-6:30 PM: Document Fixes**

**Task 6.1:** Create test best practices guide
```markdown
# Test Best Practices - Lessons from Day 1

## Resource Cleanup
- Always call `cleanup()` in `afterEach`
- Use `TestContext` to track service instances
- Destroy sharp instances explicitly
- Close database connections

## Async Operations
- Wrap in `withTimeout()` for max duration
- Use AbortController for cancellable ops
- Always handle promise rejections

## Test Isolation
- Create new service instances per test
- Don't share state between tests
- Mock external dependencies properly
- Clear caches between tests
```

**Task 6.2:** Add comments to cleanup code
```typescript
/**
 * Cleanup utility for test teardown
 * 
 * Usage:
 *   beforeEach(() => {
 *     const service = new MyService();
 *     TestCleanup.register(() => service.cleanup());
 *   });
 * 
 * This ensures all resources are released after each test.
 */
```

**Deliverable:** Test best practices documented
**Time Check:** Should complete by 6:30 PM

---

### **6:30-7:00 PM: Plan Day 2**

**Task 6.3:** Identify remaining failures
```bash
# Get list of failing tests
npm test -- --listTests | while read test; do
  npm test -- "$test" --silent
  if [ $? -ne 0 ]; then
    echo "FAIL: $test"
  fi
done > failing-tests.txt
```

**Task 6.4:** Prioritize Day 2 work
```markdown
## Day 2 Priorities (Tuesday)

### Critical (Must Fix):
1. acceptance-criteria.test.ts - AC1, AC3, AC5, AC7
2. verification-performance.test.ts - Performance targets

### Important (Should Fix):
3. storage.test.ts - S3 integration
4. signature-verifier.test.ts - Certificate validation

### Nice to Have:
5. Load testing improvements
```

**Deliverable:** Day 2 plan ready
**Time Check:** Complete Day 1 by 7:00 PM

---

## Day 1 Success Criteria

- [ ] Hanging tests identified and fixed
- [ ] Test pass rate improved from 48% to >70%
- [ ] No open handles after test suite
- [ ] Cleanup infrastructure in place
- [ ] Tests can run 10 times consecutively
- [ ] Best practices documented
- [ ] Day 2 plan created

---

## Day 1 Deliverables

1. **Code Changes:**
   - `src/tests/setup/cleanup.ts` - Global cleanup utility
   - `src/utils/timeout.ts` - Timeout wrapper
   - `src/tests/setup/test-context.ts` - Test isolation
   - `src/tests/mocks/s3-mock.ts` - S3 mock
   - Updated all service classes with cleanup methods

2. **Documentation:**
   - `docs/testing/BEST-PRACTICES.md` - Test best practices
   - `test-execution.log` - Detailed test logs
   - `full-test-results.log` - Complete test results
   - `failing-tests.txt` - List of remaining failures

3. **Reports:**
   - Day 1 results summary
   - Performance metrics
   - Resource leak analysis

---

## Troubleshooting Guide

### If tests still hang:
1. Check `--detectOpenHandles` output
2. Add more logging to identify exact hang location
3. Verify all `afterEach` hooks are running
4. Check for infinite loops or recursive calls

### If pass rate <70%:
1. Focus on fixing hangs first
2. Address test isolation issues
3. Check for race conditions
4. Verify mocks are working correctly

### If flaky tests:
1. Run test 100 times to reproduce
2. Add logging to identify timing issues
3. Increase timeouts if legitimate
4. Fix race conditions in test setup
