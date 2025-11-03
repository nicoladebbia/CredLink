# Phase 27: Performance Hypothesis & Quotas

## RTT Optimization
- **Baseline**: Whole asset → central signer (high bandwidth)
- **Edge Assist**: Digest + TBS bytes → central signer (hundreds of bytes)
- **Expected Savings**: 60-80% bandwidth reduction for tiny assets

## CPU Headroom Targets
- **Workers CPU Windows**: Configurable, up to 5min available
- **Target per Operation**: 50-150ms p95 for tiny assets (1-32 KiB)
- **CPU Billing Guardrail**: Track and optimize for cost efficiency

## KMS Bottlenecks & Quotas
| Provider | Sign Quotas | Rate Limits | Mitigation |
|----------|-------------|-------------|------------|
| AWS KMS | Region-specific | Per-second limits | Exponential backoff |
| Google Cloud KMS | Region-specific | Per-second limits | Token bucket |
| Azure Key Vault | Region-specific | Per-second limits | Circuit breaker |

## Smart Placement Impact
- **Enabled**: Worker runs closer to KMS/HSM region
- **Trade-off**: Potential hairpinning for some end users
- **Optimization**: Only enable for `/edge-sign` path

## Measurement Targets
- **WASM Processing**: <50ms p95 for digest+TBS
- **KMS Signing**: <100ms p95 for ES256
- **Total Latency**: <150ms p95 end-to-end
- **Cost Delta**: ≤10% vs central path
