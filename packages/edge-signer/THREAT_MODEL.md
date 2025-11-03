# Phase 27: Threat Model & Kill-Switches

## Primary Risks

### Key Exposure
- **Vector**: Mis-scoped edge secrets in env vars
- **Mitigation**: Forbidden - no production keys at edge
- **Detection**: Automated secrets scanning in CI/CD

### Supply Chain
- **Vector**: WASM module compromise
- **Mitigation**: SRI + Sigstore attestations (Phase 22)
- **Detection**: Module integrity verification on load

### Side-Channels
- **Vector**: Multi-tenant isolate timing attacks
- **Mitigation**: Assume residual risk, never place keys
- **Detection**: Workers security model defenses

### Quota/Latency Blowups
- **Vector**: KMS or TSA service degradation
- **Mitigation**: Fail closed, auto-route to central
- **Detection**: Real-time latency monitoring

## Mitigations

### Feature Flags
- **Default**: `edge_signer=false` globally
- **Pilot**: Tenant allowlist only
- **Break-glass**: 1-click disable to central path

### Keyless Pattern
- **Exclusive**: Synthetic dev keys only at edge
- **Production**: KMS/HSM-backed signatures only
- **Audit**: Zero edge key material persisted

### Incident Response
- **KMS/TSA Errors**: Retry + backoff + circuit-break
- **Fallback**: Automatic central path routing
- **Monitoring**: Real-time error rate tracking

### Observability
- **Logging**: request_id, tenant_id, tbs_hash, kms_key_id, region, latencies
- **Metrics**: p50/p95 latencies, error rates, quota utilization
- **Alerting**: Threshold-based notifications
