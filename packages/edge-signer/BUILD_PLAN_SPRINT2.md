# Phase 27: Build Plan - Sprint 2

## Sprint 2 Goal: Production Integration & Performance Measurement

### Task 2.1: Central Signer with AWS KMS
**Deliverable**: `src/central_signer/`
- [ ] Implement AWS KMS ES256 signing service
- [ ] Add RFC3161 TSA integration
- [ ] Implement cost and quota meters
- [ ] Add key rotation support
- [ ] Create health check endpoints

**KMS Integration Requirements**:
```typescript
interface KMSSigner {
  sign(tbsHash: Uint8Array): Promise<{
    signature: Uint8Array;
    certificateChain: string[];
    keyId: string;
  }>;
}
```

**Acceptance Criteria**:
- AWS KMS ES256 signing functional
- TSA token generation working
- Quota monitoring implemented
- Cost tracking per operation

### Task 2.2: Smart Placement Configuration
**Deliverable**: `wrangler.toml` optimization
- [ ] Configure Smart Placement mode
- [ ] Test placement near KMS region (us-east-1)
- [ ] Measure latency with/without placement
- [ ] Implement placement fallback logic
- [ ] Add placement metrics

**Configuration**:
```toml
[placement]
mode = "smart"

[limits]
cpu_ms = 150

[[routes]]
pattern = "example.com/edge-sign"
zone_name = "example.com"
```

### Task 2.3: Performance Harness Implementation
**Deliverable**: `tests/performance/`
- [ ] Create automated performance test suite
- [ ] Implement 10k tiny assets test matrix
- [ ] Add geographically distributed testing
- [ ] Create real-time metrics collection
- [ ] Implement baseline comparison

**Test Matrix**:
- Workloads: 1, 4, 8, 16 KiB payloads
- Regions: SJC, IAD, FRA, SYD, GRU, SIN
- Variants: With/without Smart Placement, With/without TSA
- Sample size: 10k operations per configuration

### Task 2.4: Metrics Collection & Analysis
**Deliverable**: `src/metrics/`
- [ ] Implement detailed timing collection
- [ ] Add cost analysis tools
- [ ] Create performance dashboards
- [ ] Implement statistical analysis
- [ ] Add automated reporting

**Metrics Collected**:
```typescript
interface PerformanceMetrics {
  t_wasm: number;    // Digest + TBS preparation
  t_kms: number;     // KMS signing time
  t_total: number;   // End-to-end latency
  cpu_ms: number;    // CPU time used
  memory_mb: number; // Memory consumption
  cost_usd: number;  // Operation cost
}
```

### Task 2.5: Decision Framework Implementation
**Deliverable**: `src/decision/`
- [ ] Implement automated decision criteria
- [ ] Create performance bar validation
- [ ] Add cost threshold monitoring
- [ ] Implement stability metrics
- [ ] Generate decision memo automatically

**Decision Bars**:
- **Security Bar**: Zero edge key material (pass/fail)
- **Performance Bar**: ≥25-40% p95 reduction for ≤16 KiB
- **Cost Bar**: ≤10% cost increase vs central
- **Stability Bar**: <0.1% KMS error rate with fallback

### Task 2.6: Production Readiness
**Deliverable**: Production deployment package
- [ ] Complete observability stack
- [ ] Implement circuit breakers
- [ ] Add rate limiting at edge
- [ ] Create deployment scripts
- [ ] Add monitoring and alerting

## Sprint 2 Deliverables
1. ✅ Production central signer with KMS
2. ✅ Smart Placement optimization
3. ✅ Comprehensive performance harness
4. ✅ Automated decision framework
5. ✅ Production deployment package
6. ✅ Complete observability stack

## Exit Criteria
- All performance measurements completed
- Decision framework validates against all bars
- Production deployment tested
- Security audit passed
- Cost analysis completed

## Go/No-Go Decision Matrix
| Metric | Target | Measured | Pass/Fail |
|--------|--------|----------|-----------|
| p95 improvement | ≥25% | TBD | TBD |
| Cost increase | ≤10% | TBD | TBD |
| KMS error rate | <0.1% | TBD | TBD |
| Security audit | Zero keys | TBD | TBD |
