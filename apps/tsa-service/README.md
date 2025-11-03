# TSA Service - RFC 3161/5816 Redundancy & SLAs

Bullet-proof RFC 3161 timestamp anchoring with fast failover, per-tenant trust policy, and auditable SLOs.

## Overview

This service provides enterprise-grade timestamping with strict compliance to:
- **RFC 3161**: Time-Stamp Protocol (TSP)
- **RFC 5816**: ESSCertIDv2 update (SHA-2 support)
- **ETSI EN 319 421/422**: EU qualified TSA requirements

## Architecture

### Provider Pool
- **DigiCert/QuoVadis**: Primary RFC 3161 TSA with ETSI compliance
- **GlobalSign**: Advanced timestamping with qualified signatures
- **Sectigo**: eIDAS-compliant timestamping service

### Redundancy Features
- 10-second health probes with automatic failover
- Hedged requests (300ms delay) for tail latency reduction
- Cloudflare Durable Object queue for strong consistency
- Flap dampening with 3-green-probe failback

### SLA Targets
- **Availability**: ≥99.9% monthly (error budget ≤1.0%)
- **Latency**: P95 < 900ms end-to-end
- **Failover**: < 30s from first red probe
- **Queue Drain**: ≥50 RPS when providers recover

## Quick Start

### Installation
```bash
pnpm install
pnpm build
```

### Development
```bash
pnpm dev
```

### Production Deployment
```bash
pnpm build
wrangler deploy
```

## API Endpoints

### Main Timestamping
```http
POST /tsa/sign
Content-Type: application/json

{
  "imprint": "base64-encoded-hash",
  "hashAlg": "2.16.840.1.101.3.4.2.1",
  "reqPolicy": "2.16.840.1.114412.7.1",
  "nonce": "12345678901234567890",
  "tenant_id": "acme-news"
}
```

**Response:**
```json
{
  "success": true,
  "tst": "base64-encoded-timestamp-token",
  "tsa_id": "digicert",
  "policy_oid": "2.16.840.1.114412.7.1",
  "genTime": "2025-11-03T15:30:00.000Z",
  "accuracy": {"seconds": 1, "millis": 0}
}
```

### Health & Status
```http
GET /health          # Service health with provider status
GET /tsa/status      # Detailed status dashboard
GET /metrics         # Prometheus metrics
```

### Queue Management
```http
POST /tsa/queue/drain  # Manual queue drain
```

## Configuration

### Provider Configuration
```yaml
providers:
  digicert:
    url: "https://timestamp.digicert.com"
    allowed_policies: ["2.16.840.1.114412.7.1"]
    anchors_pem: ["-----BEGIN CERTIFICATE-----..."]
```

### Tenant Policy
```yaml
acme-news:
  tenant_id: "acme-news"
  accepted_trust_anchors:
    - name: "DigiCert TSA Root"
      pem: "-----BEGIN CERTIFICATE-----..."
      eku_required: "1.3.6.1.5.5.7.3.8"
  accepted_policy_oids: ["2.16.840.1.114412.7.1"]
  routing_priority: ["digicert", "globalsign", "sectigo"]
  sla:
    p95_latency_ms: 900
    monthly_error_budget_pct: 1.0
```

## Validation Requirements

### Non-Negotiable Checks
✅ **status=granted** - Only granted tokens accepted  
✅ **messageImprint match** - Exact hash verification  
✅ **nonce echo** - Nonce must be echoed if sent  
✅ **policy OID** - Must be tenant-approved  
✅ **UTC genTime** - Valid UTC timestamp required  
✅ **unique serial** - Serial numbers must be unique  
✅ **signature chain** - Chain to trusted anchor required  
✅ **EKU=id-kp-timeStamping** - Must be critical (RFC 3161 §2.3)  
✅ **ESSCertIDv2** - SHA-2 hashes accepted per RFC 5816  

### Strict Enforcement
- **Verification at ingest** - No deferred validation
- **Per-tenant trust lists** - Policy-based anchor acceptance
- **OpenSSL parity** - 100% compatibility with `openssl ts -verify`

## Monitoring

### Key Metrics
```bash
# Provider health
tsa_provider_health{provider="digicert"}
tsa_provider_latency{provider="digicert"}

# Queue status
tsa_queue_size
tsa_queue_processing

# Service SLAs
tsa_service_uptime
tsa_error_budget_remaining
```

### Alert Thresholds
- **Critical**: All providers down, queue > 500, error rate > 5%
- **Warning**: Single provider down, P95 > 1200ms, queue > 100

## Testing

### Acceptance Tests
```bash
# Full test suite
npm run test

# Acceptance tests
npm run test:acceptance

# OpenSSL parity tests
npm run test:openssl-parity

# Load testing
npm run test:load
```

### Compliance Validation
```bash
# RFC 3161 conformance
npm run test:rfc3161

# ETSI compliance
npm run test:etsi

# SLA validation
npm run test:sla
```

## Security

### Certificate Requirements
- **EKU must be critical** - id-kp-timeStamping (1.3.6.1.5.5.7.3.8)
- **Chain validation** - Complete chain to trusted anchor
- **Expiration checks** - No expired certificates accepted

### Hash Algorithm Support
- **SHA-256** (2.16.840.1.101.3.4.2.1) - Primary
- **SHA-384** (2.16.840.1.101.3.4.2.2) - Supported
- **SHA-512** (2.16.840.1.101.3.4.2.3) - Supported
- **SHA-1** - Deprecated but supported for legacy

## Operations

### Health Checks
```bash
# Service health
curl https://tsa-service.example.com/health

# Provider status
curl https://tsa-service.example.com/tsa/status

# Queue metrics
curl https://tsa-service.example.com/tsa/status | jq '.queue'
```

### Incident Response
See [Ops Runbook](./docs/ops-runbook.md) for detailed procedures.

### Maintenance
- Provider updates via configuration reload
- Trust anchor rotation with zero downtime
- Policy updates with instant validation

## Performance

### Benchmarks
- **Single request**: < 500ms typical
- **Hedged requests**: < 300ms P99
- **Queue processing**: 50+ RPS
- **Failover time**: < 30s

### Scaling
- **Horizontal scaling**: Stateless service layer
- **Queue scaling**: Durable Objects auto-scaling
- **Provider scaling**: Automatic load distribution

## Compliance

### Standards Compliance
- ✅ RFC 3161: Time-Stamp Protocol
- ✅ RFC 5816: ESSCertIDv2 update
- ✅ ETSI EN 319 421: EU qualified TSA
- ✅ ETSI EN 319 422: TSA policy requirements

### Audit Features
- Complete request/response logging
- Token verification transcripts
- Policy change history
- Provider health metrics

## Support

### Documentation
- [Ops Runbook](./docs/ops-runbook.md)
- [API Reference](./docs/api.md)
- [Configuration Guide](./docs/configuration.md)

### Provider Support
- [DigiCert TSA Documentation](https://www.digicert.com/support/time-stamping-protocol.htm)
- [GlobalSign TSA Documentation](https://www.globalsign.com/en/ssl-information-center/tsa/)
- [Sectigo TSA Documentation](https://sectigo.com/knowledge-base/time-stamping-authority)

## License

MIT License - see [LICENSE](../../LICENSE) for details.

## Contributing

See [CONTRIBUTING.md](../../CONTRIBUTING.md) for contribution guidelines.

---

**Version**: 1.0.0  
**Last Updated**: 2025-11-03  
**Phase**: 28 - TSA Redundancy & SLAs
