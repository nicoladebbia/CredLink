# Phase 27: Measurement Matrix & Acceptance Criteria

## Test Environments

### Primary Environment
- **Edge Runtime**: Cloudflare Workers (WASM + SubtleCrypto)
- **Central Signer**: us-east-1 (AWS KMS ES256)
- **Storage**: R2 for sidecar manifests
- **Geos**: 6 global POPs

### Secondary Environment (Optional)
- **Edge Runtime**: Fastly Compute (WASM binary)
- **Purpose**: Parity validation and portability testing

## Workload Matrix

### Payload Sizes
| Size | Description | Target p95 | Max CPU |
|------|-------------|------------|---------|
| 1 KiB | Minimal metadata | <100ms | 50ms |
| 4 KiB | Standard image | <120ms | 75ms |
| 8 KiB | Large image | <140ms | 100ms |
| 16 KiB | Maximum edge payload | <150ms | 150ms |

### Geographic Distribution
| Region | Code | Expected RTT to KMS | Target p95 |
|--------|------|---------------------|------------|
| San Jose | SJC | ~50ms | <130ms |
| Virginia | IAD | ~10ms | <110ms |
| Frankfurt | FRA | ~100ms | <180ms |
| Sydney | SYD | ~150ms | <230ms |
| São Paulo | GRU | ~120ms | <200ms |
| Singapore | SIN | ~180ms | <260ms |

## Test Scenarios

### Baseline Comparison
| Scenario | Description | Expected Improvement |
|----------|-------------|----------------------|
| Central Only | Traditional path (no edge) | Baseline |
| Edge + Smart Placement | Edge with placement optimization | 25-40% better |
| Edge + No Placement | Edge without placement | 15-25% better |
| Edge + TSA | With timestamp authority | +20ms overhead |

### Load Testing
- **Concurrent Requests**: 10, 50, 100, 500
- **Duration**: 10 minutes per test
- **Ramp-up**: Linear over 60 seconds
- **Sustain**: Constant load for 8 minutes
- **Ramp-down**: Linear over 60 seconds

## Exit Bars (Probe Criteria)

### Security Bar ✅/❌
- **Requirement**: No production keys at edge
- **Validation**: Code review + secrets scanning
- **Threshold**: Zero edge key material persisted
- **Measurement**: Pass/Fail

### Performance Bar ✅/❌
- **Requirement**: ≥25-40% p95 reduction vs central baseline
- **Payload**: ≤16 KiB TBS or tiny assets
- **Measurement**: Statistical significance (p < 0.05)
- **Threshold**: 25% minimum, 40% target

### Cost Bar ✅/❌
- **Requirement**: CPU time + egress ≤ central path + 10%
- **Components**: Workers CPU + R2 storage + egress
- **Measurement**: Per-operation cost analysis
- **Threshold**: ≤10% cost increase

### Stability Bar ✅/❌
- **Requirement**: <0.1% KMS error rate with fallback
- **Fallback**: Automatic central path routing
- **Measurement**: Error rate over 10k operations
- **Threshold**: <0.1% failures, 99.9% success

## Data Collection

### Metrics Per Request
```typescript
interface RequestMetrics {
  request_id: string;
  tenant_id: string;
  region: string;
  payload_size: number;
  t_wasm_ms: number;
  t_kms_ms: number;
  t_total_ms: number;
  cpu_ms: number;
  memory_mb: number;
  success: boolean;
  error_type?: string;
  kms_key_id: string;
  smart_placement: boolean;
}
```

### Aggregate Metrics
```typescript
interface AggregateMetrics {
  total_requests: number;
  success_rate: number;
  p50_latency_ms: number;
  p95_latency_ms: number;
  p99_latency_ms: number;
  avg_cpu_ms: number;
  cost_per_request_usd: number;
  improvement_vs_baseline_percent: number;
  error_breakdown: Record<string, number>;
}
```

## Statistical Analysis

### Sample Size Requirements
- **Confidence Level**: 95%
- **Margin of Error**: ±5%
- **Minimum Sample**: 385 operations per configuration
- **Target Sample**: 10,000 operations per configuration

### Analysis Methods
- **T-Test**: Compare edge vs central latencies
- **ANOVA**: Multiple region comparison
- **Regression**: Performance vs payload size
- **Cost-Benefit**: ROI analysis

## Decision Matrix

### Go/No-Go Criteria
| Metric | Target | Minimum | Measured | Decision |
|--------|--------|---------|----------|----------|
| p95 Improvement | 40% | 25% | TBD | TBD |
| Cost Increase | 5% | 10% | TBD | TBD |
| Error Rate | 0.05% | 0.1% | TBD | TBD |
| Security Audit | Pass | Pass | TBD | TBD |

### Weighted Scoring
- **Performance**: 40% weight
- **Cost**: 25% weight
- **Security**: 25% weight
- **Stability**: 10% weight

**Go Decision**: ≥80% weighted score
**No-Go Decision**: <80% weighted score

## Reporting Format

### Executive Summary
- Verdict: GO/NO-GO
- Key metrics: p95 improvement, cost delta, error rate
- Recommendation: Ship/Archive

### Technical Appendix
- Detailed performance tables
- Cost breakdown analysis
- Security assessment results
- Statistical analysis methods
- Raw data availability
