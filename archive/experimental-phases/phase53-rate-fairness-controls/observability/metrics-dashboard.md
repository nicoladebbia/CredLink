# Phase 53 — Observability & Fairness Dashboards Implementation

## OpenTelemetry Metrics & Tracing

### Metrics Collection System
```typescript
import { 
  Meter, 
  ObservableResult, 
  Attributes, 
  Histogram, 
  Counter, 
  ObservableGauge,
  ObservableCounter 
} from '@opentelemetry/api';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { Resource } from '@opentelemetry/resources';
import { SemanticResourceAttributes } from '@opentelemetry/semantic-conventions';

/**
 * OpenTelemetry metrics collector for rate limiting and fairness
 * Implements exact metrics per specification
 */
export class RateLimitMetricsCollector {
  private readonly meter: Meter;
  private readonly metrics: Record<string, any> = {};

  constructor(meter: Meter) {
    this.meter = meter;
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    // HTTP server metrics
    this.metrics.httpServerRequestDuration = this.meter.createHistogram(
      'http.server.request.duration',
      {
        description: 'Duration of HTTP server requests',
        unit: 'ms',
        advice: {
          explicitBucketBoundaries: [1, 5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000]
        }
      }
    );

    this.metrics.httpServerActiveRequests = this.meter.createObservableGauge(
      'http.server.active_requests',
      {
        description: 'Number of active HTTP requests',
        unit: 'requests'
      }
    );

    // Rate limiting metrics
    this.metrics.rateLimitDrops = this.meter.createCounter(
      'ratelimit.drops',
      {
        description: 'Number of requests dropped by rate limiter',
        unit: 'drops'
      }
    );

    this.metrics.schedulerQueueDepth = this.meter.createObservableGauge(
      'scheduler.queue_depth',
      {
        description: 'Queue depth per tenant',
        unit: 'requests'
      }
    );

    this.metrics.fairshareUtilization = this.meter.createObservableGauge(
      'fairshare.utilization',
      {
        description: 'Fair share utilization per tier',
        unit: 'ratio'
      }
    );

    // Cache metrics
    this.metrics.cacheHits = this.meter.createCounter(
      'cache.hits',
      {
        description: 'Number of cache hits',
        unit: 'hits'
      }
    );

    this.metrics.cacheMisses = this.meter.createCounter(
      'cache.misses',
      {
        description: 'Number of cache misses',
        unit: 'misses'
      }
    );

    // Token bucket metrics
    this.metrics.tokenBucketRemaining = this.meter.createObservableGauge(
      'token_bucket.remaining',
      {
        description: 'Remaining tokens per tenant',
        unit: 'tokens'
      }
    );

    this.metrics.tokenBucketRefillRate = this.meter.createObservableGauge(
      'token_bucket.refill_rate',
      {
        description: 'Token refill rate per tenant',
        unit: 'tokens_per_second'
      }
    );

    // Global pool metrics
    this.metrics.globalPoolUtilization = this.meter.createObservableGauge(
      'global_pool.utilization',
      {
        description: 'Global burst pool utilization',
        unit: 'ratio'
      }
    );

    // Register observable callbacks
    this.registerObservableCallbacks();
  }

  /**
   * Record HTTP request duration
   */
  recordHttpRequestDuration(
    duration: number,
    attributes: Attributes = {}
  ): void {
    this.metrics.httpServerRequestDuration.record(duration, attributes);
  }

  /**
   * Record rate limit drop
   */
  recordRateLimitDrop(
    reason: 'tenant' | 'global' | 'abuse',
    tenantId: string,
    tier: string
  ): void {
    const attributes: Attributes = {
      reason,
      tenant_id: tenantId,
      tier
    };

    this.metrics.rateLimitDrops.add(1, attributes);
  }

  /**
   * Record cache hit/miss
   */
  recordCacheHit(
    cacheType: 'verify' | 'policy',
    tenantId?: string,
    hit: boolean = true
  ): void {
    const attributes: Attributes = {
      cache_type: cacheType,
      tenant_id: tenantId || 'anonymous'
    };

    if (hit) {
      this.metrics.cacheHits.add(1, attributes);
    } else {
      this.metrics.cacheMisses.add(1, attributes);
    }
  }

  /**
   * Record token bucket consumption
   */
  recordTokenBucketConsumption(
    tenantId: string,
    tier: string,
    consumed: number,
    remaining: number
  ): void {
    const attributes: Attributes = {
      tenant_id: tenantId,
      tier
    };

    // Store remaining tokens for observable gauge
    this.tokenBucketState[`${tenantId}:${tier}`] = remaining;
  }

  /**
   * Record scheduler queue depth
   */
  recordSchedulerQueueDepth(
    tenantId: string,
    tier: string,
    depth: number
  ): void {
    this.schedulerQueueState[`${tenantId}:${tier}`] = depth;
  }

  /**
   * Record fair share utilization
   */
  recordFairShareUtilization(
    tier: string,
    utilization: number
  ): void {
    this.fairShareState[tier] = utilization;
  }

  private readonly tokenBucketState: Record<string, number> = {};
  private readonly schedulerQueueState: Record<string, number> = {};
  private readonly fairShareState: Record<string, number> = {};
  private activeRequests = 0;
  private globalPoolUtilization = 0;

  private registerObservableCallbacks(): void {
    // Active requests observable
    this.metrics.httpServerActiveRequests.setCallback((result: ObservableResult) => {
      result.observe(this.activeRequests, {});
    });

    // Scheduler queue depth observable
    this.metrics.schedulerQueueDepth.setCallback((result: ObservableResult) => {
      for (const [key, depth] of Object.entries(this.schedulerQueueState)) {
        const [tenantId, tier] = key.split(':');
        result.observe(depth, { tenant_id: tenantId, tier });
      }
    });

    // Fair share utilization observable
    this.metrics.fairshareUtilization.setCallback((result: ObservableResult) => {
      for (const [tier, utilization] of Object.entries(this.fairShareState)) {
        result.observe(utilization, { tier });
      }
    });

    // Token bucket remaining observable
    this.metrics.tokenBucketRemaining.setCallback((result: ObservableResult) => {
      for (const [key, remaining] of Object.entries(this.tokenBucketState)) {
        const [tenantId, tier] = key.split(':');
        result.observe(remaining, { tenant_id: tenantId, tier });
      }
    });

    // Global pool utilization observable
    this.metrics.globalPoolUtilization.setCallback((result: ObservableResult) => {
      result.observe(this.globalPoolUtilization, {});
    });
  }

  /**
   * Update active requests count
   */
  setActiveRequests(count: number): void {
    this.activeRequests = count;
  }

  /**
   * Update global pool utilization
   */
  setGlobalPoolUtilization(utilization: number): void {
    this.globalPoolUtilization = utilization;
  }
}

/**
 * OpenTelemetry tracing for rate limiting decisions
 */
export class RateLimitTracer {
  private readonly tracer: Tracer;

  constructor(tracer: Tracer) {
    this.tracer = tracer;
  }

  /**
   * Start span for rate limit decision
   */
  startRateLimitSpan(
    tenantId: string,
    operation: string
  ): any {
    const span = this.tracer.startSpan(`ratelimit.${operation}`, {
      attributes: {
        'tenant.id': tenantId,
        'operation': operation
      }
    });

    return span;
  }

  /**
   * Annotate span with rate limit decision
   */
  annotateDecision(
    span: any,
    decision: RateLimitDecision,
    bucketRemaining: number,
    retryAfter: number
  ): void {
    span.setAttributes({
      'ratelimit.decision': decision.allowed ? 'allowed' : 'denied',
      'ratelimit.reason': decision.reason,
      'ratelimit.bucket_remaining': bucketRemaining,
      'ratelimit.retry_after': retryAfter,
      'ratelimit.tokens_remaining': decision.remaining
    });

    if (!decision.allowed) {
      span.setStatus({ code: 2, message: 'Rate limited' }); // StatusCode.ERROR
    } else {
      span.setStatus({ code: 1 }); // StatusCode.OK
    }
  }

  /**
   * Annotate span with scheduler information
   */
  annotateScheduler(
    span: any,
    tenantId: string,
    tier: string,
    queuePosition: number,
    waitTime: number
  ): void {
    span.setAttributes({
      'scheduler.tenant_id': tenantId,
      'scheduler.tier': tier,
      'scheduler.queue_position': queuePosition,
      'scheduler.wait_time_ms': waitTime
    });
  }

  /**
   * Annotate span with cache information
   */
  annotateCache(
    span: any,
    cacheHit: boolean,
    cacheKey: string,
    age?: number
  ): void {
    span.setAttributes({
      'cache.hit': cacheHit,
      'cache.key': cacheKey,
      'cache.age_ms': age || 0
    });
  }
}

/**
 * Fairness dashboard data provider
 */
export class FairnessDashboard {
  private readonly metricsCollector: RateLimitMetricsCollector;
  private readonly scheduler: DRRFairnessScheduler;

  constructor(
    metricsCollector: RateLimitMetricsCollector,
    scheduler: DRRFairnessScheduler
  ) {
    this.metricsCollector = metricsCollector;
    this.scheduler = scheduler;
  }

  /**
   * Get budget burn analysis
   */
  async getBudgetBurnAnalysis(
    timeRange: TimeRange = '1h'
  ): Promise<BudgetBurnAnalysis> {
    const now = Date.now();
    const startTime = this.getStartTime(timeRange);

    // In a real implementation, query metrics database
    // For now, return simulated data
    return {
      timeRange,
      startTime,
      endTime: now,
      tenantBudgetBurn: await this.getTenantBudgetBurn(startTime, now),
      topConsumers: await this.getTopConsumers(startTime, now),
      utilizationTrend: await this.getUtilizationTrend(startTime, now)
    };
  }

  /**
   * Get fairness view with DRR shares
   */
  async getFairnessView(): Promise<FairnessView> {
    const fairnessMetrics = this.scheduler.getFairnessMetrics();
    
    return {
      timestamp: Date.now(),
      totalQueues: fairnessMetrics.totalQueues,
      totalQueued: fairnessMetrics.totalQueued,
      queueDepths: fairnessMetrics.queueDepths,
      tierUtilization: fairnessMetrics.tierUtilization,
      fairnessScore: fairnessMetrics.fairnessScore,
      tierShares: await this.calculateTierShares(),
      recommendations: this.generateFairnessRecommendations(fairnessMetrics)
    };
  }

  /**
   * Get real-time system health
   */
  async getSystemHealth(): Promise<SystemHealth> {
    return {
      timestamp: Date.now(),
      globalPoolUtilization: this.getGlobalPoolUtilization(),
      activeRequests: this.getActiveRequests(),
      averageResponseTime: this.getAverageResponseTime(),
      errorRate: this.getErrorRate(),
      cacheHitRate: this.getCacheHitRate(),
      alerts: await this.getActiveAlerts()
    };
  }

  private async getTenantBudgetBurn(startTime: number, endTime: number): Promise<Record<string, TenantBudgetBurn>> {
    // Simulate tenant budget burn data
    return {
      'tenant_starter_001': {
        tenantId: 'tenant_starter_001',
        tier: 'starter',
        requested: 15000,
        accepted: 14250,
        dropped: 750,
        dropRate: 0.05,
        costEstimate: 14.25
      },
      'tenant_growth_001': {
        tenantId: 'tenant_growth_001',
        tier: 'growth',
        requested: 25000,
        accepted: 24800,
        dropped: 200,
        dropRate: 0.008,
        costEstimate: 24.80
      },
      'tenant_scale_001': {
        tenantId: 'tenant_scale_001',
        tier: 'scale',
        requested: 50000,
        accepted: 49900,
        dropped: 100,
        dropRate: 0.002,
        costEstimate: 49.90
      }
    };
  }

  private async getTopConsumers(startTime: number, endTime: number): Promise<TopConsumer[]> {
    return [
      {
        tenantId: 'tenant_scale_001',
        tier: 'scale',
        requests: 50000,
        costEstimate: 49.90,
        topRoutes: ['/verify', '/sign', '/batch']
      },
      {
        tenantId: 'tenant_growth_001',
        tier: 'growth',
        requests: 25000,
        costEstimate: 24.80,
        topRoutes: ['/verify', '/status']
      },
      {
        tenantId: 'tenant_starter_001',
        tier: 'starter',
        requests: 15000,
        costEstimate: 14.25,
        topRoutes: ['/verify']
      }
    ];
  }

  private async getUtilizationTrend(startTime: number, endTime: number): Promise<UtilizationTrend[]> {
    // Simulate trend data points
    const points: UtilizationTrend[] = [];
    const interval = 5 * 60 * 1000; // 5 minutes
    
    for (let time = startTime; time <= endTime; time += interval) {
      points.push({
        timestamp: time,
        utilization: 0.65 + Math.random() * 0.3, // 65-95% utilization
        tierUtilization: {
          starter: 0.7 + Math.random() * 0.2,
          growth: 0.6 + Math.random() * 0.3,
          scale: 0.5 + Math.random() * 0.4
        }
      });
    }
    
    return points;
  }

  private async calculateTierShares(): Promise<Record<string, TierShareInfo>> {
    const fairnessMetrics = this.scheduler.getFairnessMetrics();
    
    return {
      starter: {
        entitled: 1.0,
        actual: fairnessMetrics.tierUtilization.starter.served / fairnessMetrics.tierUtilization.starter.entitled,
        sharePercentage: (fairnessMetrics.tierUtilization.starter.served / 
                         (fairnessMetrics.tierUtilization.starter.served + 
                          fairnessMetrics.tierUtilization.growth.served + 
                          fairnessMetrics.tierUtilization.scale.served)) * 100
      },
      growth: {
        entitled: 1.2,
        actual: fairnessMetrics.tierUtilization.growth.served / fairnessMetrics.tierUtilization.growth.entitled,
        sharePercentage: (fairnessMetrics.tierUtilization.growth.served / 
                         (fairnessMetrics.tierUtilization.starter.served + 
                          fairnessMetrics.tierUtilization.growth.served + 
                          fairnessMetrics.tierUtilization.scale.served)) * 100
      },
      scale: {
        entitled: 2.0,
        actual: fairnessMetrics.tierUtilization.scale.served / fairnessMetrics.tierUtilization.scale.entitled,
        sharePercentage: (fairnessMetrics.tierUtilization.scale.served / 
                         (fairnessMetrics.tierUtilization.starter.served + 
                          fairnessMetrics.tierUtilization.growth.served + 
                          fairnessMetrics.tierUtilization.scale.served)) * 100
      }
    };
  }

  private generateFairnessRecommendations(metrics: FairnessMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.fairnessScore < 0.8) {
      recommendations.push('Fairness score below 80% - consider adjusting tier weights');
    }
    
    if (metrics.totalQueued > 1000) {
      recommendations.push('High queue depth detected - consider scaling capacity');
    }
    
    for (const tier of ['starter', 'growth', 'scale'] as const) {
      const tierMetrics = metrics.tierUtilization[tier];
      if (tierMetrics.entitled > 0) {
        const utilization = tierMetrics.served / tierMetrics.entitled;
        if (utilization < 0.8) {
          recommendations.push(`${tier} tier under-utilized at ${(utilization * 100).toFixed(1)}%`);
        }
      }
    }
    
    return recommendations;
  }

  private getStartTime(timeRange: TimeRange): number {
    const now = Date.now();
    
    switch (timeRange) {
      case '5m':
        return now - (5 * 60 * 1000);
      case '15m':
        return now - (15 * 60 * 1000);
      case '1h':
        return now - (60 * 60 * 1000);
      case '6h':
        return now - (6 * 60 * 60 * 1000);
      case '24h':
        return now - (24 * 60 * 60 * 1000);
      default:
        return now - (60 * 60 * 1000);
    }
  }

  private getGlobalPoolUtilization(): number {
    // Simulate global pool utilization
    return 0.65 + Math.random() * 0.2;
  }

  private getActiveRequests(): number {
    // Simulate active requests
    return Math.floor(100 + Math.random() * 400);
  }

  private getAverageResponseTime(): number {
    // Simulate average response time in ms
    return 50 + Math.random() * 100;
  }

  private getErrorRate(): number {
    // Simulate error rate
    return 0.001 + Math.random() * 0.009; // 0.1% - 1%
  }

  private getCacheHitRate(): number {
    // Simulate cache hit rate
    return 0.85 + Math.random() * 0.1; // 85% - 95%
  }

  private async getActiveAlerts(): Promise<SystemAlert[]> {
    const alerts: SystemAlert[] = [];
    
    // Simulate alerts based on current metrics
    if (this.getGlobalPoolUtilization() > 0.9) {
      alerts.push({
        id: 'global_pool_high',
        severity: 'warning',
        message: 'Global burst pool utilization above 90%',
        timestamp: Date.now()
      });
    }
    
    if (this.getErrorRate() > 0.005) {
      alerts.push({
        id: 'high_error_rate',
        severity: 'critical',
        message: 'Error rate above 0.5%',
        timestamp: Date.now()
      });
    }
    
    return alerts;
  }
}

// Type definitions
export interface BudgetBurnAnalysis {
  timeRange: TimeRange;
  startTime: number;
  endTime: number;
  tenantBudgetBurn: Record<string, TenantBudgetBurn>;
  topConsumers: TopConsumer[];
  utilizationTrend: UtilizationTrend[];
}

export interface TenantBudgetBurn {
  tenantId: string;
  tier: string;
  requested: number;
  accepted: number;
  dropped: number;
  dropRate: number;
  costEstimate: number;
}

export interface TopConsumer {
  tenantId: string;
  tier: string;
  requests: number;
  costEstimate: number;
  topRoutes: string[];
}

export interface UtilizationTrend {
  timestamp: number;
  utilization: number;
  tierUtilization: Record<string, number>;
}

export interface FairnessView {
  timestamp: number;
  totalQueues: number;
  totalQueued: number;
  queueDepths: Record<string, number>;
  tierUtilization: Record<string, {
    served: number;
    entitled: number;
  }>;
  fairnessScore: number;
  tierShares: Record<string, TierShareInfo>;
  recommendations: string[];
}

export interface TierShareInfo {
  entitled: number;
  actual: number;
  sharePercentage: number;
}

export interface SystemHealth {
  timestamp: number;
  globalPoolUtilization: number;
  activeRequests: number;
  averageResponseTime: number;
  errorRate: number;
  cacheHitRate: number;
  alerts: SystemAlert[];
}

export interface SystemAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
  timestamp: number;
}

export type TimeRange = '5m' | '15m' | '1h' | '6h' | '24h';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter: number;
  reason: string;
}

/**
 * Initialize OpenTelemetry SDK
 */
export function initializeOpenTelemetry(serviceName: string): NodeSDK {
  const sdk = new NodeSDK({
    resource: new Resource({
      [SemanticResourceAttributes.SERVICE_NAME]: serviceName,
      [SemanticResourceAttributes.SERVICE_VERSION]: '1.0.0',
    }),
    // Add exporters, processors, etc.
  });

  sdk.start();
  return sdk;
}
```
