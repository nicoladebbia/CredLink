# SLO ↔ SLA Mapping

## Operable Service Level Mapping

| SLI (Measured) | SLO | Contract Hook | Error Budget |
|----------------|-----|---------------|--------------|
| Remote-manifest survival (%) | ≥99.9% / mo | SLA credit + auto-fallback | 43.2 min/mo |
| Verify API uptime | ≥99.9% / mo | SLA credit | 43.2 min/mo |
| Sign p95 (remote) | <400 ms | Advisory (roadmap), not credit | N/A |
| Verify p95 | <600 ms | Advisory | N/A |
| Evidence retention | 24 months WORM | Security Exhibit | N/A |

## Credit-Triggering vs Advisory Metrics

**Credit-Triggering** (Customer feels pain):
- Remote manifest survival
- Verify API uptime

**Advisory Only** (SRE tracking):
- Latency targets (p95)
- Support response times
- Documentation availability

## Best Practice Framing

SLA ≠ everything SRE tracks. Credits only where customers truly feel pain; keep the rest advisory to avoid weaponized SLAs.
