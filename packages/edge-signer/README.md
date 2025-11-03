# Phase 27: Edge Signer (WASM Probe)

## Executive Summary

**Status**: Probe Design Complete - Ready for Implementation
**Verdict**: Conditional GO for edge-assisted TBS + remote ES256 signing
**Timeline**: 2 sprints (4 weeks) + $15K infrastructure investment
**Success Criteria**: ≥25% p95 latency improvement with zero security regression

## Overview

This probe determines whether signing work should run at the edge (Cloudflare/Fastly/Vercel) for tiny assets where WAN round-trips dominate. The architecture follows a Keyless SSL pattern: edge prepares data, central KMS signs, edge assembles final manifest.

### Key Innovation
- **Edge-Assisted Signing**: WASM-based TBS preparation at edge
- **Zero Key Custody**: Production keys never leave KMS/HSM
- **Performance Focus**: 25-40% latency reduction for ≤16 KiB assets
- **Security First**: Identical threat model to Cloudflare Keyless SSL

## Architecture

```
[Client] → [Edge Worker] → [WASM Module] → [TBS Bytes] → [Central KMS] → [Signature] → [Edge Assembly] → [Manifest Storage]
```

### Components
- **Edge Worker**: Request handling and orchestration
- **WASM Module**: Rust-based TBS preparation (c2pa-rs)
- **Central Signer**: KMS/HSM-backed signature generation
- **Manifest Storage**: R2/S3 sidecar storage
- **Smart Placement**: Geographic optimization

## Security Model

### What We CAN Do Safely
- ✅ Pre-hash + canonicalization in WASM
- ✅ SubtleCrypto: ECDSA (P-256) and Ed25519
- ✅ Remote sign over HTTPS to central KMS/HSM
- ✅ Edge composes final manifest and stores sidecar

### What We WILL NOT Do (Hard Line)
- ❌ NEVER place production signing keys at edge
- ❌ NO long-lived key material in edge isolates
- ❌ NO Cloudflare "Secrets" for production keys
- ❌ NO multi-tenant isolate custody for production keys

## Performance Hypothesis

### Expected Benefits
- **RTT Savings**: Ship hundreds of bytes vs entire asset
- **Local Processing**: Digest and canonicalization at edge
- **Smart Placement**: Pin Workers near KMS region
- **Target**: ≤150ms p95 for ≤16 KiB assets

### Measurement Matrix
| Payload Size | Central p95 | Edge p95 | Improvement |
|--------------|-------------|----------|-------------|
| 1 KiB | ~120ms | ~85ms | 29% |
| 4 KiB | ~140ms | ~95ms | 32% |
| 8 KiB | ~160ms | ~110ms | 31% |
| 16 KiB | ~180ms | ~125ms | 31% |

## Implementation Plan

### Sprint 1: WASM & TBS Path (Weeks 1-2)
- [ ] Rust WASM core development
- [ ] Workers integration layer
- [ ] Edge sign API implementation
- [ ] Central signer integration
- [ ] Basic observability

### Sprint 2: Production Integration (Weeks 3-4)
- [ ] AWS KMS integration with ES256
- [ ] Smart Placement optimization
- [ ] Performance measurement harness
- [ ] Circuit breaker and rate limiting
- [ ] Production deployment package

### Deliverables
- **Code**: Complete edge signer implementation
- **Documentation**: Architecture and security analysis
- **Performance Data**: Comprehensive measurement results
- **Decision Memo**: Go/No-Go recommendation

## API Specification

### POST /edge-sign
```json
{
  "asset_sha256": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
  "policy_id": "newsroom-default-v3",
  "assertions": {
    "c2pa.actions": [{"digitalSourceType": "https://ns.adobe.com/cloud/photoshop", "action": "created"}]
  },
  "tenant_id": "acme",
  "tsa": true
}
```

### Response
```json
{
  "manifest_url": "https://manifests.example.com/sha256/...c2pa",
  "signing_mode": "edge-tbs+remote-es256",
  "p95_ms": {"wasm": 42, "kms": 95, "total": 151},
  "kms_key_id": "arn:aws:kms:us-east-1:...:key/...",
  "tsa_token_url": "https://tsa.example.com/..."
}
```

## Configuration

### wrangler.toml
```toml
name = "c2pa-edge-signer"
main = "src/edge_signer.ts"
compatibility_date = "2024-01-01"

[placement]
mode = "smart"

[limits]
cpu_ms = 150

[vars]
ENVIRONMENT = "production"
CENTRAL_SIGNER_URL = "https://signer.example.com"
KMS_REGION = "us-east-1"
```

### Feature Flags
```json
{
  "edge_signer_enabled": false,
  "tenant_allowlist": [],
  "max_payload_size": 32768,
  "circuit_breaker_enabled": true,
  "smart_placement_enabled": false
}
```

## Guardrails & Safety

### Feature Flag Controls
- **Global Master Switch**: `edge_signer_enabled=false` by default
- **Tenant Allowlist**: Only approved tenants can use edge signing
- **Break-Glass**: 1-click disable routes all traffic to central signer
- **Circuit Breaker**: Automatic fallback on KMS failures

### Observability
- **Required Logging**: request_id, tenant_id, tbs_hash, kms_key_id, latencies
- **Metrics**: p50/p95 latencies, error rates, quota utilization
- **Alerting**: Threshold-based notifications for performance and errors

## Exit Criteria

### Go/No-Go Decision Matrix
| Metric | Target | Minimum | Measured | Status |
|--------|--------|---------|----------|--------|
| p95 Improvement | 40% | 25% | TBD | TBD |
| Cost Increase | 5% | 10% | TBD | TBD |
| Error Rate | 0.05% | 0.1% | TBD | TBD |
| Security Audit | Pass | Pass | TBD | TBD |

### "Do Not Ship" Criteria
- Performance improvement <20% on ≤16 KiB payloads
- CPU billing increases >15% at same throughput
- KMS tail latency >250ms in 2+ geos despite Smart Placement
- ANY sign of key material recoverable from edge

## Documentation Structure

```
packages/edge-signer/
├── README.md                           # This file
├── SCOPE.md                           # What edge signing can/cannot do
├── ALGORITHM_SUPPORT.md               # Algorithm compatibility matrix
├── ARCHITECTURE.md                    # Technical architecture details
├── PERFORMANCE_HYPOTHESIS.md          # Performance expectations
├── THREAT_MODEL.md                    # Security threats and mitigations
├── BUILD_PLAN_SPRINT1.md              # Sprint 1 implementation plan
├── BUILD_PLAN_SPRINT2.md              # Sprint 2 implementation plan
├── API_SPECIFICATION.md               # Complete API documentation
├── MEASUREMENT_MATRIX.md              # Acceptance criteria and metrics
├── DECISION_MEMO_TEMPLATE.md          # Decision framework template
├── GUARDRAILS_POLICY.md               # Safety and failure policies
├── PROBE_RATIONALE.md                 # Why this is a probe, not product
├── DO_NOT_SHIP_CRITERIA.md            # Pre-agreed stop conditions
├── DEMO_REQUIREMENTS.md               # Demo scenarios and success criteria
├── PORTABILITY_NOTES.md               # Fastly/Vercel adaptation guides
├── REFERENCES.md                      # Load-bearing technical references
└── EXECUTIVE_READOUT.md               # Executive summary and approval
```

## Portability

### Primary Target: Cloudflare Workers
- Full WASM and WebCrypto support
- Smart Placement optimization
- Durable Objects for rate limiting
- 200+ global POPs

### Alternative: Fastly Compute
- WASM runtime support
- Limited WebCrypto (ES256 only)
- No Smart Placement
- 50+ global POPs

### Experimental: Vercel Edge
- Modern WebCrypto support
- Limited execution time
- No built-in rate limiting
- 30+ global POPs

## Next Steps

### Immediate Actions
1. [ ] Secure executive approval and budget
2. [ ] Assemble technical team for Sprint 1
3. [ ] Provision development environments
4. [ ] Begin Rust WASM core development

### Implementation Timeline
- **Weeks 1-2**: Sprint 1 - WASM & TBS Path
- **Weeks 3-4**: Sprint 2 - Production Integration
- **Week 5**: Performance measurement and decision

### Success Definition
The probe is successful if we can definitively answer whether edge-assisted signing provides meaningful performance benefits while maintaining our security standards. Both "ship" and "do not ship" outcomes are valuable learning opportunities.

## Executive Decision

**RECOMMENDATION**: **APPROVE** - Proceed with Edge Signer probe

**Investment**: $15K + 4 weeks development time
**Potential ROI**: 25-40% latency improvement for small assets
**Risk Level**: Low (zero security regression, feature-gated rollout)
**Strategic Value**: Market differentiation and edge computing expertise

---

**Status**: Design Complete ✅  
**Next Milestone**: Executive Approval 🎯  
**Target Completion**: Week 5 of implementation 📅
