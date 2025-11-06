# Phase 53 — Public API Rate & Fairness Controls

## Overview

Phase 53 implements a comprehensive rate limiting and fairness system that protects the API while ensuring equitable access for all tenants. This production-ready solution handles 50k rps traffic spikes, maintains fairness through Deficit Round Robin scheduling, and provides RFC 9111 compliant caching with proper backoff guidance.

## 🎯 Objectives

- **Prevent scraping/floods** while keeping paid tenants alive under stress
- **Ensure fairness** through DRR (Deficit Round Robin) weighted by tenant tier
- **Implement global burst pool** for cross-cluster surge protection
- **Provide soft→hard fail ladder** with 429 + Retry-After to read-only mode
- **Cache anonymous traffic** with RFC 9111 compliance and prewarming
- **Deliver observability** through OpenTelemetry metrics and fairness dashboards
- **Validate through synthetic storm drills** simulating real-world conditions

## 🏗 Architecture

### Core Components

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Edge Layer    │    │  Rate Limiting  │    │   Backend       │
│                 │    │                 │    │                 │
│ • Local Buckets │◄──►│ • Global Pool   │◄──►│ • Verification  │
│ • Request Class │    │ • DRR Scheduler │    │ • Sign Service  │
│ • Cache Headers │    │ • Fail Ladder   │    │ • Batch API     │
└─────────────────┘    └─────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Observability │    │   Configuration │    │   Testing       │
│                 │    │                 │    │                 │
│ • OTel Metrics  │    │ • Tier Limits   │    │ • Storm Drills  │
│ • Fairness View │    │ • Hot Reload    │    │ • Exit Tests    │
│ • Alerts        │    │ • Validation    │    │ • Load Tests    │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### Rate Limiting Strategy

1. **Two-Stage Rate Limiting** (per Envoy guidance)
   - Stage 1: Local token bucket (fast path)
   - Stage 2: Global Redis coordination (distributed)
   - Stage 3: Circuit breaker (backend protection)

2. **Tenant Classification**
   - **Anonymous**: Cache-only during contention (<20% global pool)
   - **Paid (Starter/Growth/Scale)**: Full access with per-tenant limits
   - **Privileged (Event Mode)**: Trusted tenants with global pool bypass

3. **Fairness Scheduling**
   - **DRR Algorithm**: O(1) scheduling for 10⁴–10⁵ rps per node
   - **Tier Weights**: Scale (2x), Growth (1.2x), Starter (1x)
   - **Real-time Monitoring**: Queue depth and utilization tracking

## 📊 Performance Specifications

### Rate Limits (Default Configuration)

| Tier | Steady RPS | Burst Tokens | Weight | Quantum |
|------|------------|--------------|--------|---------|
| Starter | 300 | 1,200 | 1.0x | 20 |
| Growth | 360 | 1,440 | 1.2x | 24 |
| Scale | 600 | 2,400 | 2.0x | 40 |
| Global Pool | 50,000 | 50,000 | - | - |

### Cache Configuration

- **TTL**: 60 seconds for verify responses
- **Stale-While-Revalidate**: 30 seconds
- **Cache Key**: `{asset_hash}:{policy_id}`
- **Anonymous Hit Rate**: >95% during storms

### Response Headers

```
RateLimit-Limit: 300, burst=1200, policy=tenant
RateLimit-Remaining: 245
RateLimit-Reset: 164099520
Retry-After: 5
Cache-Control: public, max-age=60, stale-while-revalidate=30, must-revalidate
ETag: "manifest:sha256:abc123..."
```

## 🚀 Quick Start

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd phase53-rate-fairness-controls

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your Redis and configuration settings

# Run tests
npm test

# Start the service
npm start
```

### Basic Usage

```typescript
import { 
  TokenBucketRateLimiter,
  DRRFairnessScheduler,
  VerifyCache,
  StandardsCompliantResponseBuilder 
} from './core';

// Initialize rate limiter
const rateLimiter = new TokenBucketRateLimiter({
  steadyRps: 300,
  burstTokens: 1200
});

// Initialize fairness scheduler
const scheduler = new DRRFairnessScheduler({
  quantumByTier: {
    starter: 20,
    growth: 24,
    scale: 40
  }
});

// Initialize cache
const cache = new VerifyCache(redis, {
  defaultTtl: 60,
  staleWhileRevalidate: 30
});

// Process request
async function handleRequest(request) {
  // Classify request
  const classification = await classifier.classify(request);
  
  // Check rate limits
  const rateLimitDecision = await rateLimiter.checkRequest(classification);
  
  if (!rateLimitDecision.allowed) {
    return responseBuilder.buildRateLimitResponse(
      classification.tenantInfo,
      rateLimitDecision
    );
  }
  
  // Check cache for verify requests
  if (request.path.includes('/verify')) {
    const cached = await cache.get(assetHash, policyId);
    if (cached.status === 'hit') {
      return responseBuilder.buildVerifyCacheResponse(
        cached.manifestHash,
        cached.data
      );
    }
  }
  
  // Process request through scheduler
  return scheduler.processRequest(request);
}
```

## 🧪 Testing

### Synthetic Storm Drill

```bash
# Run the complete storm drill test
npm run test:storm-drill

# Run individual test scenarios
npm run test:fairness
npm run test:rate-limiting
npm run test:cache-compliance
npm run test:backoff-behavior
```

The storm drill simulates:
- **50k rps** mixed traffic for 10 minutes
- **Tier distribution**: 40% anonymous, 30% starter, 20% growth, 10% scale
- **Fairness validation**: DRR shares within ±20% of weights
- **Cache performance**: >95% hit rate for anonymous traffic
- **Error handling**: Proper 429 responses with Retry-After headers

### Test Coverage

- ✅ Rate limit accuracy and precision
- ✅ DRR fairness under contention
- ✅ RFC 9111 cache compliance
- ✅ Exponential backoff behavior
- ✅ Event mode activation
- ✅ Circuit breaker functionality
- ✅ Configuration hot reload
- ✅ Metrics and observability

## 📈 Observability

### Metrics Dashboard

The system provides comprehensive metrics through OpenTelemetry:

#### System Metrics
- `http.server.request.duration` - Request latency histogram
- `http.server.active_requests` - Concurrent request gauge
- `ratelimit.drops` - Rate limit drop counter
- `scheduler.queue_depth` - Per-tenant queue depth

#### Fairness Metrics
- `fairshare.utilization` - Per-tier utilization ratio
- `token_bucket.remaining` - Remaining tokens per tenant
- `cache.hits` / `cache.misses` - Cache performance counters

#### Business Metrics
- Budget burn analysis by tenant
- Top consumers and cost estimates
- Fairness score and recommendations

### Alerting

Pre-configured alerts for:
- **Fairness violations**: Paid tenants getting <80% entitlement
- **Global pool exhaustion**: >90% utilization
- **Error rate spikes**: >1% for paid tenants
- **Cache degradation**: <90% hit rate for anonymous traffic

## ⚙️ Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_CLUSTER_ENABLED=false

# Rate Limiting
DEFAULT_STEADY_RPS=300
DEFAULT_BURST_TOKENS=120
GLOBAL_POOL_STEADY_RPS=50000
GLOBAL_POOL_BURST_TOKENS=50000

# Cache Configuration
VERIFY_CACHE_TTL=60
STALE_WHILE_REVALIDATE=30

# Observability
OTEL_SERVICE_NAME=credlink-rate-limiter
OTEL_EXPORTER_JAEGER_ENDPOINT=http://localhost:14268/api/traces
```

### Dynamic Configuration

```typescript
// Update rate limits without restart
await configManager.updateConfig({
  ratelimit: {
    tenant_default: {
      steady_rps: 500,  // Increase from 300
      burst_tokens: 2000
    }
  }
});

// Activate event mode for breaking news
await eventManager.activateEventMode('tenant_newsroom_001', {
  title: 'Breaking News Event',
  description: 'Major story requiring elevated limits',
  severity: 'critical',
  durationMinutes: 120
});
```

## 🔧 Operations

### Event Mode Activation

For trusted news organizations during breaking events:

```bash
curl -X POST https://api.example.com/admin/event-mode \
  -H "Authorization: BBearer <ADMIN" \
 \
  -d '{
    "tenant_id": "tenant_newsroom_001",
    "event_details": {
      "title": "E Election Results",
      "severity": "critical",
      "duration_minutes": 180
    }
  }'
```

### Fairness Monitoring

```bash
# Get current fairness metrics
curl https://api.example.com/admin/fairness/metrics

# Get tenant budget burn analysis
curl "https://api.example.com/admin/budget-burn?time_range=1h"

# Get system health status
curl https://api.example.com/admin/health
```

### Cache Management

```bash
# Prewarm hot assets
curl -X POST https://api.example.com/admin/cache/prewarm \
  -d '{
    "assets": [
      {"asset_hash": "abc123...", "priority": 10},
      {"asset_hash": "def123...", "priority": 8}
    ]
  }'

# Clear cache for specific tenant
curl -X DELETE https://api.example.com/admin/cache/tenant/tenant_001
```

## 🚨 Risk Mitigations

### 1. Over-throttling Real News Events
- **Mitigation**: Event mode override for trusted tenants
- **Implementation**: Temporary limit elevation with global pool bypass
- **Activation**: Manual or automated during breaking news

### 2. Scrapers Rotating IPs
- **Mitigation**: Tenant-based rate limiting (not IP-based)
- **Implementation**: Count against tenant/API key budgets
- **Detection**: Pattern analysis and automatic flagging

### 3. Origin Backend Exhaustion
- **Mitigation**: Two-stage rate limiting per Envoy guidance
- **Implementation**: Local + global coordination + circuit breaker
- **Protection**: Automatic limit tightening on backend overload

### 4. Client Confusion on Backoff
- **Mitigation**: Standards-compliant responses with examples
- **Implementation**: Clear 429 responses with Retry-After headers
- **Documentation**: Client integration guides and code examples

### 5. Rule Brittleness
- **Mitigation**: Configurable and observable rules
- **Implementation**: Hot-reloadable configuration with nightly audits
- **Monitoring**: Rule effectiveness tracking and recommendations

## 📚 Documentation

- [Implementation Details](./docs/implementation-summary.md)
- [Risks & Mitigations](./docs/risks-mitigations.md)
- [Configuration Guide](./config/rate-limit-config.md)
- [Testing Strategy](./tests/synthetic-storm-drill.md)
- [Observability Setup](./observability/metrics-dashboard.md)

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Run the complete test suite (`npm test` and `npm run test:storm-drill`)
4. Commit your changes (`git commit -m 'Add amazing feature'`)
5. Push to the branch (`git push origin feature/amazing-feature`)
6. Open a Pull Request

### Development Requirements

- All new features must include storm drill validation
- Rate limit changes require fairness impact analysis
- Cache modifications must maintain RFC 9111 compliance
- Metrics must be added for all new functionality

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🎯 Success Metrics

### Technical KPIs
- **Availability**: >99.9% during 50k rps storms
- **Fairness Score**: >0.8 under normal load conditions
- **Cache Hit Rate**: >95% for anonymous traffic
- **Response Time**: P95 <100ms for cached requests

### Business Impact
- **Zero Revenue Loss**: No paid tenant outages due to rate limiting
- **Operational Efficiency**: 90% reduction in manual interventions
- **Client Satisfaction**: Clear error handling and recovery paths
- **Scalability**: Handle 10x traffic spikes without degradation

---

## 🎉 Bottom Line

Phase 53 delivers a **verifiably fair API** that maintains service quality during extreme traffic events while protecting against abuse. The implementation combines proven algorithms (DRR, token buckets), standards compliance (RFC 9110/9111), and comprehensive observability to create a production-ready rate limiting solution.

**Result**: Paid tenants stay alive through 50k rps storms, anonymous traffic is safely absorbed through cache, and the system provides clear operational visibility and control.
