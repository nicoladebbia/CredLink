# Playbook: Workers CPU Drift

## Symptom
Cloudflare Workers CPU-ms per request increases significantly, driving up compute costs.

## Detection Criteria
- CPU-ms per request increases by >30%
- Total CPU-ms cost increases while request volume stays flat
- Impact: $20-200/day depending on traffic
- **Reference**: [Cloudflare Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)

## Root Causes
1. **Heavy computation**: Expensive operations in hot path
2. **Inefficient algorithms**: O(n²) instead of O(n log n)
3. **Excessive parsing**: Re-parsing same data multiple times
4. **Blocking operations**: Synchronous I/O or crypto operations
5. **Memory allocation**: Creating large objects unnecessarily

## Remediation Steps

### Step 1: Profile Code Path
Identify expensive operations:

```javascript
// Add CPU profiling
export default {
  async fetch(request, env, ctx) {
    const startCpu = Date.now();
    
    try {
      // Your code here
      const response = await handleRequest(request, env);
      
      const cpuMs = Date.now() - startCpu;
      
      // Log if exceeds threshold
      if (cpuMs > 50) {  // 50ms threshold
        console.warn('High CPU usage', {
          path: new URL(request.url).pathname,
          cpuMs,
          method: request.method
        });
      }
      
      // Add header for monitoring
      response.headers.set('X-CPU-Ms', cpuMs.toString());
      
      return response;
    } catch (error) {
      const cpuMs = Date.now() - startCpu;
      console.error('Error with CPU', { cpuMs, error: error.message });
      throw error;
    }
  }
};
```

### Step 2: Optimize Hot Paths
Common optimizations:

#### A. Cache Parsed Data
```javascript
// Before: Re-parsing on every request
const manifest = JSON.parse(await manifestText);

// After: Cache parsed result
const MANIFEST_CACHE = new Map();

function getCachedManifest(key, text) {
  if (!MANIFEST_CACHE.has(key)) {
    MANIFEST_CACHE.set(key, JSON.parse(text));
  }
  return MANIFEST_CACHE.get(key);
}
```

#### B. Lazy Load Heavy Operations
```javascript
// Before: Always load heavy module
import { verifySignature } from 'heavy-crypto-lib';

// After: Lazy load only when needed
async function verifyIfNeeded(signature, data) {
  if (!signature) return true;
  
  const { verifySignature } = await import('heavy-crypto-lib');
  return verifySignature(signature, data);
}
```

#### C. Use Efficient Data Structures
```javascript
// Before: Array search (O(n))
const item = array.find(x => x.id === targetId);

// After: Map lookup (O(1))
const itemMap = new Map(array.map(x => [x.id, x]));
const item = itemMap.get(targetId);
```

#### D. Batch Operations
```javascript
// Before: Individual crypto operations
for (const item of items) {
  await crypto.subtle.digest('SHA-256', item);
}

// After: Batch with Promise.all
await Promise.all(
  items.map(item => crypto.subtle.digest('SHA-256', item))
);
```

### Step 3: Implement Request Sampling
Don't verify every request if not needed:

```javascript
// Verify only 10% of requests
const VERIFICATION_SAMPLE_RATE = 0.1;

async function sampleVerification(request, manifest) {
  if (Math.random() > VERIFICATION_SAMPLE_RATE) {
    // Fast path: skip verification
    return { verified: 'sampled', skipped: true };
  }
  
  // Slow path: full verification
  return await fullVerification(manifest);
}
```

### Step 4: Use Workers KV for Expensive Results
Cache expensive computation results:

```javascript
// Cache verification results for 1 hour
const cacheKey = `verify:${manifestHash}`;
const cached = await env.CACHE.get(cacheKey);

if (cached) {
  return JSON.parse(cached);  // Fast!
}

const result = await expensiveVerification(manifest);
await env.CACHE.put(cacheKey, JSON.stringify(result), {
  expirationTtl: 3600
});

return result;
```

### Step 5: Canary Slimmer Route
Test optimized version with small traffic percentage:

```javascript
// Route 5% to optimized handler
const useOptimized = Math.random() < 0.05;

if (useOptimized) {
  return await handleRequestOptimized(request, env);
} else {
  return await handleRequestOriginal(request, env);
}
```

Monitor CPU-ms difference:

```sql
-- Analytics Engine query
SELECT
  version,
  AVG(cpuTime / requests) as avg_cpu_ms,
  COUNT(*) as requests
FROM WorkersInvocationsAdaptive
WHERE datetime >= timestamp_sub(current_timestamp(), INTERVAL 1 HOUR)
GROUP BY version;
```

### Step 6: Validate Pricing
Confirm you're using latest Workers pricing:

**Current Pricing** (as of 2024):
- Requests: $0.15 per million ($0.00000015 per request)
- CPU-ms: $2.00 per million CPU-ms ($0.000002 per CPU-ms)
- KV reads: $0.50 per million
- KV writes: $5.00 per million

**Reference**: [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)

```javascript
// Calculate request cost
function calculateCost(requests, cpuMs) {
  const requestCost = requests * 0.00000015;
  const cpuCost = cpuMs * 0.000002;
  return {
    requests: requestCost,
    compute: cpuCost,
    total: requestCost + cpuCost
  };
}
```

### Step 7: Monitor Performance
Track CPU-ms trends:

```sql
-- Daily CPU-ms per request trend
SELECT
  DATE(datetime) as date,
  SUM(cpuTime) / SUM(requests) as avg_cpu_ms_per_req,
  SUM(cpuTime) * 0.000002 as daily_compute_cost
FROM WorkersInvocationsAdaptive
WHERE datetime >= timestamp_sub(current_timestamp(), INTERVAL 30 DAYS)
GROUP BY DATE(datetime)
ORDER BY date DESC;
```

## Success Criteria
- CPU-ms per request decreases by 30-50%
- Compute costs drop proportionally
- Request latency stays same or improves
- No increase in error rates

## Rollback Plan
If optimization causes issues:

1. **Immediate**: Feature flag to disable optimization
2. **Traffic**: Reduce canary percentage to 0%
3. **Verify**: Ensure error rates return to baseline

```javascript
// Rollback flag
if (env.DISABLE_OPTIMIZATION === 'true') {
  return await handleRequestOriginal(request, env);
}
```

## Cost Impact Calculation
```
# Example calculation
Current state:
- Daily requests: 10,000,000
- CPU-ms per request: 20ms
- Total CPU-ms: 200,000,000
- CPU cost: 200M * $0.000002 = $400/day

After optimization:
- Daily requests: 10,000,000
- CPU-ms per request: 12ms (40% reduction)
- Total CPU-ms: 120,000,000
- CPU cost: 120M * $0.000002 = $240/day

Daily savings: $160
Monthly savings: $4,800
Annual savings: $57,600
```

## Common CPU-Heavy Operations

| Operation | Typical CPU-ms | Optimization |
|-----------|----------------|--------------|
| JSON.parse (1KB) | 0.1-0.5 | Cache result |
| JSON.parse (100KB) | 10-50 | Stream parse |
| Crypto verify (RSA-2048) | 5-15 | Use Ed25519 |
| Crypto verify (Ed25519) | 1-3 | Cache results |
| Regex match (simple) | 0.01-0.1 | Use string methods |
| Regex match (complex) | 1-10 | Simplify pattern |
| Array.find (1000 items) | 0.5-2 | Use Map |
| Array.sort (1000 items) | 1-5 | Sort once, reuse |

## References
- [Workers Pricing](https://developers.cloudflare.com/workers/platform/pricing/)
- [Workers Best Practices](https://developers.cloudflare.com/workers/platform/best-practices/)
- [Workers Performance](https://developers.cloudflare.com/workers/platform/limits/)

## Additional Optimizations
1. **WebAssembly**: Move heavy computation to WASM for 2-10× speedup
2. **Durable Objects**: Offload stateful operations
3. **Request coalescing**: Batch multiple requests into one Worker invocation
4. **Edge caching**: Cache Worker responses at edge to skip invocation entirely
