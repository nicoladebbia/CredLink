# Playbook: TSA Token Explosion

## Symptom
RFC 3161 timestamp token usage increases significantly, driving up TSA costs.

## Detection Criteria
- Tokens per asset increases by >100%
- Tokens per 1,000 assets exceeds baseline by 2×
- Impact: $50-500/day depending on token pricing
- **Reference**: [RFC 3161 - Time-Stamp Protocol (TSP)](https://www.ietf.org/rfc/rfc3161.txt)

## Root Causes
1. **Redundant timestamping**: Multiple timestamps per assertion unnecessarily
2. **Aggressive refresh**: Re-timestamping content that hasn't changed
3. **Over-assertion**: Timestamping every minor metadata change
4. **Policy misconfiguration**: No batching or deduplication

## Remediation Steps

### Step 1: Audit Token Usage Patterns
Query timestamp database to understand usage:

```sql
-- Tokens per asset analysis
SELECT
  asset_id,
  COUNT(*) as token_count,
  MIN(created_at) as first_timestamp,
  MAX(created_at) as last_timestamp,
  COUNT(DISTINCT DATE(created_at)) as days_active
FROM timestamps
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY asset_id
HAVING COUNT(*) > 10  -- Assets with >10 timestamps
ORDER BY token_count DESC
LIMIT 100;
```

```sql
-- Hourly token rate
SELECT
  DATE_TRUNC('hour', created_at) as hour,
  COUNT(*) as tokens_issued,
  COUNT(DISTINCT asset_id) as unique_assets,
  COUNT(*) * 1.0 / NULLIF(COUNT(DISTINCT asset_id), 0) as tokens_per_asset
FROM timestamps
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour DESC;
```

### Step 2: Implement Timestamp Batching
Batch multiple assertions into single timestamp where policy allows:

```javascript
// Before: Individual timestamps
for (const assertion of assertions) {
  await timestampAssertion(assertion);  // N tokens
}

// After: Batch timestamps
const batchHash = hashAssertions(assertions);
await timestampBatch(batchHash);  // 1 token
```

**RFC 3161 Compliance**: Batching is compliant if batch integrity is cryptographically guaranteed.

```javascript
// Batch timestamp implementation
async function timestampAssertionBatch(assertions, tsaConfig) {
  // Create Merkle tree of assertions
  const merkleTree = buildMerkleTree(
    assertions.map(a => hashAssertion(a))
  );
  
  const merkleRoot = merkleTree.getRoot();
  
  // Get single timestamp for root
  const timestamp = await getTSATimestamp(merkleRoot, tsaConfig);
  
  // Store timestamp and inclusion proofs
  return {
    timestamp,
    merkleRoot,
    inclusionProofs: assertions.map((a, i) =>
      merkleTree.getProof(i)
    )
  };
}
```

### Step 3: Reduce Timestamp Frequency
Not every assertion needs real-time timestamping:

**Risk-Based Timestamping**:
- **High-risk** (legal, provenance): Immediate timestamp
- **Medium-risk** (metadata): Hourly batch
- **Low-risk** (thumbnails): Daily batch

```javascript
function getTimestampPolicy(assertionType) {
  const policies = {
    'c2pa.hash.v1': 'immediate',           // High-risk
    'c2pa.claim.v1': 'immediate',          // High-risk
    'c2pa.metadata.v1': 'hourly_batch',    // Medium-risk
    'c2pa.thumbnail.v1': 'daily_batch'     // Low-risk
  };
  
  return policies[assertionType] || 'hourly_batch';
}
```

### Step 4: Implement Content-Based Deduplication
Don't re-timestamp identical content:

```javascript
async function timestampWithDedup(contentHash, assertions, ttl = 3600) {
  // Check if we already have recent timestamp
  const existingTimestamp = await cache.get(`ts:${contentHash}`);
  
  if (existingTimestamp) {
    const age = Date.now() - existingTimestamp.timestamp;
    if (age < ttl * 1000) {
      // Reuse existing timestamp
      return existingTimestamp;
    }
  }
  
  // Get new timestamp
  const timestamp = await getTSATimestamp(contentHash);
  
  // Cache for TTL
  await cache.set(`ts:${contentHash}`, timestamp, { ttl });
  
  return timestamp;
}
```

### Step 5: Use Lower-Cost TSA Tiers
Many TSAs offer tiered pricing:

| Tier | Use Case | Price/Token | SLA |
|------|----------|-------------|-----|
| Premium | Legal/compliance | $0.01 | 99.99% |
| Standard | General use | $0.001 | 99.9% |
| Bulk | High-volume | $0.0001 | 99% |

**Recommendation**: Use Premium for high-risk, Standard for medium-risk, Bulk for low-risk.

```javascript
function selectTSATier(assertionRisk) {
  const tiers = {
    high: 'premium_tsa',
    medium: 'standard_tsa',
    low: 'bulk_tsa'
  };
  
  return env[tiers[assertionRisk]];
}
```

### Step 6: Monitor Token Efficiency
Track tokens per 1k assets as key metric:

```sql
-- Daily token efficiency
SELECT
  DATE(created_at) as date,
  COUNT(*) as tokens_issued,
  COUNT(DISTINCT asset_id) as assets,
  (COUNT(*) * 1000.0) / NULLIF(COUNT(DISTINCT asset_id), 0) as tokens_per_1k_assets,
  SUM(token_cost) as daily_cost
FROM timestamps
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

**Target**: <1,500 tokens per 1k assets for most use cases

## Success Criteria
- Tokens per asset reduces by 50-80%
- TSA costs drop proportionally
- No increase in timestamp failures
- Compliance requirements still met

## Rollback Plan
If batching causes issues:

1. **Immediate**: Disable batching, revert to individual timestamps
2. **Verify**: Check that all assertions have valid timestamps
3. **Adjust**: Fine-tune batch size or frequency

```javascript
// Emergency rollback flag
if (env.DISABLE_TSA_BATCHING === 'true') {
  return await timestampIndividual(assertions);
}
```

## Cost Impact Calculation
```
# Example calculation
Current state:
- Assets per day: 10,000
- Tokens per asset: 5
- Daily tokens: 50,000
- Cost per token: $0.001
- Daily cost: $50

After optimization:
- Assets per day: 10,000
- Tokens per asset: 1.2 (batching + dedup)
- Daily tokens: 12,000
- Cost per token: $0.001
- Daily cost: $12

Monthly savings: ($50 - $12) * 30 = $1,140
Annual savings: $13,680
```

## References
- [RFC 3161 - Time-Stamp Protocol](https://www.ietf.org/rfc/rfc3161.txt)
- [NIST Time-Stamping Guidelines](https://csrc.nist.gov/publications/detail/sp/800-102/final)
- [C2PA Timestamp Requirements](https://c2pa.org/specifications/specifications/1.3/specs/C2PA_Specification.html#_timestamp_assertions)

## Additional Optimizations
1. **Scheduled batching**: Batch timestamps hourly instead of per-request
2. **Cache warm timestamps**: Pre-timestamp common content
3. **Multi-TSA failover**: Use cheaper TSA as primary, premium as backup
4. **Policy automation**: Automatically select tier based on assertion metadata
