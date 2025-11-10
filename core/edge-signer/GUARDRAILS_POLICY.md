# Phase 27: Guardrails & Failure Policy

## Feature Flag Configuration

### Global Controls
```typescript
// Edge Signer Feature Flags
interface EdgeSignerFlags {
  edge_signer_enabled: boolean;      // Global master switch
  tenant_allowlist: string[];        // Approved tenants
  max_payload_size: number;          // 32 KiB limit
  kms_timeout_ms: number;            // 30s KMS timeout
  circuit_breaker_enabled: boolean;  // Failure isolation
  smart_placement_enabled: boolean;  // Geographic optimization
}
```

### Default Configuration
```json
{
  "edge_signer_enabled": false,
  "tenant_allowlist": [],
  "max_payload_size": 32768,
  "kms_timeout_ms": 30000,
  "circuit_breaker_enabled": true,
  "smart_placement_enabled": false
}
```

## Break-Glass Procedures

### Level 1: Tenant Disable
```bash
# Disable specific tenant
curl -X POST "https://api.example.com/admin/flags" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "action": "update",
    "flag": "edge_signer_enabled",
    "tenant_id": "acme",
    "value": false
  }'
```

### Level 2: Global Disable
```bash
# Emergency global shutdown
curl -X POST "https://api.example.com/admin/flags" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "action": "emergency_shutdown",
    "service": "edge_signer"
  }'
```

### Level 3: Route Removal
```bash
# Complete endpoint removal (wrangler)
wrangler route delete "api.example.com/edge-sign"
```

## Observability Framework

### Required Logging Fields
```typescript
interface EdgeSignerLog {
  request_id: string;
  tenant_id: string;
  timestamp: string;
  region: string;
  
  // Performance metrics
  t_wasm_ms: number;
  t_kms_ms: number;
  t_total_ms: number;
  cpu_ms_used: number;
  memory_mb_used: number;
  
  // Security tracking
  tbs_hash: string;
  kms_key_id: string;
  kms_region: string;
  
  // Error handling
  success: boolean;
  error_type?: string;
  error_message?: string;
  retry_count: number;
  fallback_triggered: boolean;
}
```

### Analytics Integration
```typescript
// Phase 13 Analytics Events
interface AnalyticsEvent {
  event: "edge_sign_attempt" | "edge_sign_success" | "edge_sign_failure";
  properties: {
    tenant_id: string;
    signing_mode: "edge-tbs+remote-es256" | "central-fallback";
    latency_ms: number;
    payload_size: number;
    region: string;
    error_type?: string;
  };
}
```

## Backpressure Management

### Rate Limiting Strategy
```typescript
// Durable Object Rate Limiter
class EdgeSignerRateLimiter {
  private bucket: TokenBucket;
  
  async checkLimit(tenantId: string): Promise<boolean> {
    const limits = await this.getTenantLimits(tenantId);
    
    // Per-tenant limits
    if (!this.bucket.consume(tenantId, limits.burst)) {
      return false;
    }
    
    // Global KMS limits
    if (!this.bucket.consume("global_kms", limits.kms_rate)) {
      return false;
    }
    
    return true;
  }
}
```

### Quota Monitoring
```typescript
interface KMSQuotaMonitor {
  // Current utilization
  current_usage: {
    requests_per_second: number;
    daily_requests: number;
    error_rate: number;
  };
  
  // Predictive analysis
  projected_usage: {
    hourly_peak: number;
    daily_total: number;
    quota_exhaustion_time: string;
  };
  
  // Alerts
  alerts: {
    usage_threshold: number;    // 80% warning
    error_threshold: number;     // 5% error rate
    quota_exhaustion: boolean;   // Imminent exhaustion
  };
}
```

## Circuit Breaker Implementation

### KMS Circuit Breaker
```typescript
class KMSCircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }
  
  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();
    
    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}
```

### Fallback Triggers
- **KMS 429**: Rate limit exceeded → circuit breaker OPEN
- **KMS 5xx**: Service error → exponential backoff
- **Timeout**: >30s KMS response → immediate fallback
- **Circuit Breaker**: >5 failures in 60 seconds → OPEN state

## Failure Modes & Recovery

### Automatic Recovery
```typescript
interface FailureRecovery {
  // Retry configuration
  max_retries: 3;
  base_delay_ms: 1000;
  max_delay_ms: 10000;
  
  // Backoff strategy
  backoff_strategy: 'exponential' | 'linear';
  jitter: boolean;
  
  // Fallback behavior
  fallback_to_central: boolean;
  fallback_timeout_ms: 5000;
}
```

### Manual Recovery
```bash
# Reset circuit breaker
curl -X POST "https://api.example.com/admin/circuit-breaker" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "action": "reset",
    "service": "kms_signer"
  }'

# Clear rate limits
curl -X POST "https://api.example.com/admin/rate-limiter" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d '{
    "action": "clear",
    "tenant_id": "acme"
  }'
```

## Monitoring & Alerting

### Key Metrics Dashboard
- **Request Rate**: Edge vs Central signing
- **Latency Distribution**: p50, p95, p99 by region
- **Error Rate**: By error type and tenant
- **Circuit Breaker State**: Current status and history
- **KMS Quota Utilization**: Real-time usage
- **Cost Tracking**: Per-operation and cumulative

### Alert Thresholds
```typescript
const alertThresholds = {
  // Performance alerts
  p95_latency_ms: 200,        // Warning: >200ms
  error_rate_percent: 1.0,    // Warning: >1%
  
  // KMS alerts
  kms_error_rate_percent: 0.5, // Critical: >0.5%
  quota_utilization_percent: 80, // Warning: >80%
  
  // System alerts
  circuit_breaker_open: true,   // Critical: any OPEN state
  memory_usage_percent: 85,     // Warning: >85%
  cpu_usage_percent: 90,        // Critical: >90%
};
```

### Incident Response
1. **Detection**: Automated alert triggers
2. **Assessment**: Dashboard review and impact analysis
3. **Response**: Apply break-glass procedures
4. **Communication**: Stakeholder notification
5. **Recovery**: Monitor system restoration
6. **Post-mortem**: Root cause analysis

## Compliance & Audit

### Audit Trail Requirements
- **Request Logging**: All signing attempts logged
- **Configuration Changes**: All flag changes tracked
- **Access Logs**: Admin actions audited
- **Security Events**: Failures and fallbacks recorded

### Data Retention
- **Request Logs**: 90 days
- **Metrics Data**: 1 year
- **Audit Trail**: 7 years
- **Error Details**: 30 days

### Compliance Validation
```typescript
interface ComplianceReport {
  period: string;
  total_requests: number;
  successful_signs: number;
  failed_signs: number;
  fallback_rate: number;
  security_incidents: number;
  compliance_status: 'COMPLIANT' | 'NON_COMPLIANT';
}
```
