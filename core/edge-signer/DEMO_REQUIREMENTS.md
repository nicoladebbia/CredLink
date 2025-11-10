# Phase 27: Demo Requirements & Scenarios

## Live Demo Scenario 1: Performance Toggle

### Setup Configuration
```typescript
// Demo environment setup
const demoConfig = {
  tenant_id: "demo-tenant",
  policy_id: "demo-policy-v1",
  asset_sizes: [1024, 4096, 8192, 16384], // 1KiB to 16KiB
  test_count: 1000,
  regions: ["SJC", "IAD", "FRA"],
  feature_flag: "edge_signer_enabled"
};
```

### Demo Script
```bash
# Step 1: Baseline measurement (edge disabled)
curl -X POST "https://api.demo.com/admin/flags" \
  -H "Authorization: Bearer $DEMO_ADMIN_TOKEN" \
  -d '{
    "flag": "edge_signer_enabled",
    "value": false
  }'

echo "Running baseline test with central signing only..."
./scripts/run_performance_test.sh --baseline --count 1000

# Step 2: Enable edge signing
curl -X POST "https://api.demo.com/admin/flags" \
  -H "Authorization: Bearer $DEMO_ADMIN_TOKEN" \
  -d '{
    "flag": "edge_signer_enabled",
    "value": true
  }'

echo "Running edge-assisted test..."
./scripts/run_performance_test.sh --edge --count 1000

# Step 3: Compare results
./scripts/compare_performance.sh --baseline baseline.json --edge edge.json
```

### Expected Demo Results
| Metric | Baseline | Edge-Assisted | Improvement |
|--------|----------|---------------|-------------|
| 4 KiB p95 latency | 180ms | 125ms | 30% |
| CPU time per request | 25ms | 42ms | +68% |
| Total cost | $0.0012 | $0.0013 | +8% |
| Success rate | 99.95% | 99.93% | -0.02% |

### Live Dashboard Display
- **Real-time Metrics**: Request rate, latency distribution, error rate
- **Geographic Performance**: Map showing regional improvements
- **Cost Tracking**: Running cost comparison
- **Feature Flag Status**: Current configuration state

## Chaos Demo Scenario 2: KMS Failure Injection

### Failure Injection Setup
```typescript
// Chaos engineering configuration
const chaosConfig = {
  failure_types: ["429_rate_limit", "503_service_unavailable", "timeout"],
  injection_duration: 300000, // 5 minutes
  failure_rate: 0.3, // 30% of requests
  regions: ["all"], // Global injection
  monitoring: true
};
```

### Demo Script
```bash
# Step 1: Enable chaos mode
curl -X POST "https://api.demo.com/admin/chaos" \
  -H "Authorization: Bearer $DEMO_ADMIN_TOKEN" \
  -d '{
    "enabled": true,
    "failure_type": "429_rate_limit",
    "failure_rate": 0.3,
    "duration": 300
  }'

echo "Chaos mode enabled - running resilience test..."

# Step 2: Run load test during chaos
./scripts/run_resilience_test.sh --duration 300 --rate 10

# Step 3: Monitor circuit breaker behavior
curl -X GET "https://api.demo.com/admin/circuit-breaker/status" \
  -H "Authorization: Bearer $DEMO_ADMIN_TOKEN"

# Step 4: Disable chaos mode
curl -X POST "https://api.demo.com/admin/chaos" \
  -H "Authorization: Bearer $DEMO_ADMIN_TOKEN" \
  -d '{"enabled": false}'
```

### Expected Chaos Results
- **Circuit Breaker**: Opens after 5 failures in 60 seconds
- **Fallback Rate**: 100% of requests route to central signer
- **Recovery Time**: <30 seconds after chaos stops
- **Success Rate**: 99.9% overall (with fallback)

### Chaos Dashboard Display
- **Error Rate**: Real-time error percentage
- **Circuit Breaker State**: Current status (CLOSED/OPEN/HALF_OPEN)
- **Fallback Activation**: Requests routed to central path
- **Recovery Metrics**: Time to normal operation

## Demo Scenario 3: Trust Chain Validation

### Trust Chain Display
```typescript
// Trust chain verification
interface TrustChainDemo {
  manifest_url: string;
  signing_certificate: string;
  certificate_chain: string[];
  signature_algorithm: "ES256";
  kms_key_id: string;
  verification_result: "VALID" | "INVALID";
}
```

### Demo Script
```bash
# Step 1: Generate test asset
echo "Creating test asset..."
openssl rand -hex 1024 > test_asset.bin

# Step 2: Sign with edge-assisted flow
curl -X POST "https://api.demo.com/edge-sign" \
  -H "Authorization: Bearer $DEMO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "asset_inline": "'$(base64 test_asset.bin)'",
    "policy_id": "demo-policy-v1",
    "tenant_id": "demo-tenant",
    "assertions": {"demo": true}
  }'

# Step 3: Verify manifest
curl -X GET "https://api.demo.com/verify" \
  -H "Content-Type: application/json" \
  -d '{
    "manifest_url": "https://manifests.demo.com/sha256/...c2pa"
  }'
```

### Expected Trust Chain Results
- **Signature Algorithm**: ES256 (P-256)
- **Certificate Chain**: Valid X.509 chain to trusted root
- **KMS Integration**: AWS KMS key ID visible in logs
- **Verification**: C2PA manifest validates successfully

## Technical Demo Setup

### Environment Requirements
```yaml
# demo-environment.yaml
demo_environment:
  edge_worker:
    instances: 3
    regions: [SJC, IAD, FRA]
    cpu_limit: 150ms
  
  central_signer:
    region: us-east-1
    kms_key: demo-edge-signer-key
    tsa_enabled: true
  
  monitoring:
    dashboard: grafana.demo.com
    logs: loki.demo.com
    metrics: prometheus.demo.com
  
  test_data:
    assets: [1KiB, 4KiB, 8KiB, 16KiB]
    count: 1000
    duration: 300
```

### Demo Scripts
```bash
#!/bin/bash
# scripts/demo_performance.sh
set -e

echo "🚀 Starting Edge Signer Performance Demo"

# Configuration
TENANT_ID="demo-tenant"
ADMIN_TOKEN="${DEMO_ADMIN_TOKEN}"
BASE_URL="https://api.demo.com"

# Step 1: Disable edge signing
echo "📊 Measuring baseline performance..."
curl -s -X POST "$BASE_URL/admin/flags" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"flag": "edge_signer_enabled", "value": false}'

# Run baseline test
baseline_result=$(./scripts/run_test.sh --edge=false --count=1000)
echo "Baseline: $baseline_result"

# Step 2: Enable edge signing
echo "⚡ Measuring edge-assisted performance..."
curl -s -X POST "$BASE_URL/admin/flags" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{"flag": "edge_signer_enabled", "value": true}'

# Run edge test
edge_result=$(./scripts/run_test.sh --edge=true --count=1000)
echo "Edge-assisted: $edge_result"

# Step 3: Calculate improvement
improvement=$(./scripts/calculate_improvement.sh "$baseline_result" "$edge_result")
echo "🎯 Performance improvement: $improvement"

# Step 4: Display dashboard
echo "📈 Opening dashboard..."
open "https://grafana.demo.com/d/edge-signer-demo"
```

## Demo Success Criteria

### Technical Success
- ✅ Feature flag toggle works seamlessly
- ✅ Performance improvement measurable and significant
- ✅ Circuit breaker activates during failures
- ✅ Fallback to central signing maintains availability
- ✅ Trust chain remains valid with edge assistance

### Presentation Success
- ✅ Clear before/after performance comparison
- ✅ Visual dashboard showing real-time metrics
- ✅ Chaos scenario demonstrates resilience
- ✅ Security model clearly explained
- ✅ Business value proposition articulated

### Audience Engagement
- ✅ Technical stakeholders understand architecture
- ✅ Business stakeholders see value proposition
- ✅ Security stakeholders approve threat model
- ✅ Operations stakeholders see manageability
- ✅ Executive stakeholders see strategic fit

## Demo Recording Plan

### Video Capture Requirements
- **Screen Recording**: 1080p, 60fps
- **Audio**: Clear narration of technical concepts
- **Timing**: 15-minute total presentation
- **Sections**: Performance → Chaos → Trust Chain → Q&A

### Key Demo Moments
1. **Toggle Moment**: Feature flag enable/disable showing immediate impact
2. **Chaos Moment**: KMS failure injection and automatic fallback
3. **Validation Moment**: Trust chain verification showing unchanged security
4. **Metrics Moment**: Dashboard displaying performance improvements

## Backup Demo Plans

### Technical Failures
- **Alternative Region**: Switch to backup demo region
- **Reduced Load**: Lower request count if performance issues
- **Manual Verification**: Show CLI commands if dashboard fails
- **Static Data**: Use pre-recorded metrics if live system fails

### Network Issues
- **Local Demo**: Run demo in local development environment
- **Recorded Demo**: Fall back to pre-recorded video
- **Slides Only**: Technical presentation with architecture diagrams
- **Whiteboard**: Live drawing of architecture and flow

## Demo Follow-up

### Materials Distribution
- **Demo Script**: Complete bash scripts for reproduction
- **Configuration**: All environment and configuration files
- **Results**: Performance measurement data and analysis
- **Documentation**: Technical architecture and security model

### Q&A Preparation
- **Performance Questions**: Detailed measurement methodology
- **Security Questions**: Threat model and mitigation strategies
- **Operational Questions**: Monitoring and failure handling
- **Business Questions**: ROI analysis and strategic fit

The demo requirements ensure we can effectively demonstrate the edge signer probe's capabilities, limitations, and value proposition while maintaining technical accuracy and professional presentation.
