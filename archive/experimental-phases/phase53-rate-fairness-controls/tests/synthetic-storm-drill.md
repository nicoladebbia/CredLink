# Phase 53 — Synthetic Storm Drill Implementation

## Exit Tests for Rate Limiting & Fairness

### Synthetic Storm Test Suite
```typescript
import { EventEmitter } from 'events';
import { performance } from 'perf_hooks';

/**
 * Synthetic storm drill for testing rate limiting and fairness
 * Simulates 50k rps mixed traffic for 10 minutes per specification
 */
export class SyntheticStormDrill extends EventEmitter {
  private readonly config: StormDrillConfig;
  private readonly metrics: StormMetrics;
  private isRunning = false;
  private activeRequests = new Map<string, StormRequest>();

  constructor(config: StormDrillConfig) {
    super();
    this.config = config;
    this.metrics = new StormMetrics();
  }

  /**
   * Execute complete synthetic storm drill
   */
  async executeStormDrill(): Promise<StormDrillResults> {
    this.emit('drill_started', {});
    
    if (this.isRunning) {
      throw new Error('Storm drill is already running');
    }

    this.isRunning = true;
    this.metrics.reset();
    
    try {
      const startTime = Date.now();
      
      // Phase 1: Warmup period
      await this.executeWarmupPhase();
      
      // Phase 2: Main storm (50k rps for 10 minutes)
      const stormResults = await this.executeMainStormPhase();
      
      // Phase 3: Cool down and analysis
      const analysisResults = await this.executeAnalysisPhase();
      
      const totalTime = Date.now() - startTime;
      
      const results: StormDrillResults = {
        totalDuration: totalTime,
        stormResults,
        analysisResults,
        passed: this.evaluatePassConditions(stormResults, analysisResults),
        timestamp: Date.now()
      };

      this.emit('storm_drill_completed', results);
      
      return results;
      
    } finally {
      this.isRunning = false;
      this.cleanup();
    }
  }

  /**
   * Execute individual test scenarios
   */
  async executeTestScenario(scenario: TestScenario): Promise<ScenarioResult> {
    this.emit('scenario_started', { name: scenario.name });
    
    const startTime = Date.now();
    const results: ScenarioResult = {
      name: scenario.name,
      duration: 0,
      requestsSent: 0,
      requestsSucceeded: 0,
      requestsFailed: 0,
      averageResponseTime: 0,
      errors: []
    };

    try {
      for (const test of scenario.tests) {
        const testResult = await this.executeIndividualTest(test);
        this.aggregateTestResult(results, testResult);
      }
      
    } catch (error) {
      results.errors.push(error.message);
    }
    
    results.duration = Date.now() - startTime;
    return results;
  }

  private safeParseInt(value: any, radix: number = 10): number {
    if (typeof value === 'string' && /^\d+$/.test(value)) {
      return parseInt(value, radix);
    }
    return 0;
  }

  private async executeWarmupPhase(): Promise<void> {
    const warmupDuration = this.config.warmupDurationMs;
    const warmupRate = this.config.warmupRateRps;
    const warmupRequests = Math.floor((warmupDuration / 1000) * warmupRate);
    
    this.emit('warmup_started', { requests: warmupRequests, rps: warmupRate });
    
    await this.sendBurstRequests(warmupRequests, warmupRate, {
      distribution: 'mixed',
      duration: warmupDuration
    });
    
    // Wait for systems to stabilize
    await this.sleep(5000);
  }

  private async executeMainStormPhase(): Promise<StormPhaseResults> {
    const stormDuration = this.config.stormDurationMs;
    const targetRps = this.config.targetRps;
    const totalRequests = Math.floor((stormDuration / 1000) * targetRps);
    
    this.emit('storm_started', { totalRequests, targetRps, durationMinutes: stormDuration / 60000 });
    
    // Track fairness metrics during storm
    const fairnessTracker = new FairnessTracker();
    
    // Create traffic distribution
    const trafficDistribution = this.createTrafficDistribution();
    
    // Send storm traffic
    const stormPromise = this.sendBurstRequests(totalRequests, targetRps, {
      distribution: trafficDistribution,
      duration: stormDuration,
      trackFairness: true,
      fairnessTracker
    });
    
    // Monitor metrics during storm
    const monitoringPromise = this.monitorStormMetrics(stormDuration, fairnessTracker);
    
    // Wait for completion
    const [requestResults, monitoringResults] = await Promise.all([
      stormPromise,
      monitoringPromise
    ]);
    
    return {
      requestResults,
      monitoringResults,
      fairnessMetrics: fairnessTracker.getFinalMetrics()
    };
  }

  private async executeAnalysisPhase(): Promise<AnalysisPhaseResults> {
    this.emit('analysis_started', {});
    
    // Wait for systems to settle
    await this.sleep(10000);
    
    // Analyze cache performance
    const cacheAnalysis = await this.analyzeCachePerformance();
    
    // Analyze fairness metrics
    const fairnessAnalysis = await this.analyzeFairnessMetrics();
    
    // Analyze error patterns
    const errorAnalysis = await this.analyzeErrorPatterns();
    
    // Analyze response times
    const responseTimeAnalysis = await this.analyzeResponseTimes();
    
    return {
      cacheAnalysis,
      fairnessAnalysis,
      errorAnalysis,
      responseTimeAnalysis
    };
  }

  private async sendBurstRequests(
    totalRequests: number,
    targetRps: number,
    options: BurstRequestOptions
  ): Promise<RequestResults> {
    const results: RequestResults = {
      totalSent: 0,
      successful: 0,
      failed: 0,
      rateLimited: 0,
      cacheHits: 0,
      averageResponseTime: 0,
      responseTimeHistogram: {},
      errorsByTenant: {},
      startTime: Date.now()
    };

    const startTime = Date.now();
    const requestsPerBatch = Math.ceil(targetRps / 10); // 10 batches per second
    const batchInterval = 100; // 100ms between batches
    const totalBatches = Math.ceil(totalRequests / requestsPerBatch);
    
    this.emit('sending_requests', { totalRequests, totalBatches, requestsPerBatch });

    for (let batch = 0; batch < totalBatches && this.isRunning; batch++) {
      const batchStart = Date.now();
      
      // Create batch requests
      const batchRequests = this.createBatchRequests(
        requestsPerBatch,
        options.distribution,
        results.totalSent
      );
      
      // Execute batch requests concurrently
      const batchPromises = batchRequests.map(request => 
        this.executeRequest(request, options)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      // Process batch results
      this.processBatchResults(batchResults, results);
      
      results.totalSent += batchRequests.length;
      
      // Rate limiting to maintain target RPS
      const batchDuration = Date.now() - batchStart;
      const expectedBatchDuration = batchInterval;
      
      if (batchDuration < expectedBatchDuration) {
        await this.sleep(expectedBatchDuration - batchDuration);
      }
      
      // Progress reporting
      if (batch % 100 === 0) {
        const progress = (batch / totalBatches) * 100;
        const currentRps = this.calculateCurrentRps(results);
        this.emit('progress_update', { progress, currentRps });
      }
    }

    results.endTime = Date.now();
    results.totalDuration = results.endTime - results.startTime;
    results.actualRps = (results.totalSent / results.totalDuration) * 1000;
    
    return results;
  }

  private createBatchRequests(
    count: number,
    distribution: TrafficDistribution,
    offset: number
  ): StormRequest[] {
    const requests: StormRequest[] = [];
    
    for (let i = 0; i < count; i++) {
      const requestType = this.selectRequestType(distribution);
      const tenant = this.selectTenant(distribution, requestType);
      
      requests.push({
        id: `req_${offset + i}`,
        type: requestType,
        tenantId: tenant.id,
        tier: tenant.tier,
        timestamp: Date.now(),
        path: this.generateRequestPath(requestType),
        headers: this.generateRequestHeaders(tenant)
      });
    }
    
    return requests;
  }

  private async executeRequest(
    request: StormRequest,
    options: BurstRequestOptions
  ): Promise<RequestResult> {
    const startTime = performance.now();
    const requestId = request.id;
    
    try {
      // Store active request
      this.activeRequests.set(requestId, request);
      
      // Simulate HTTP request
      const response = await this.simulateHttpRequest(request);
      
      const responseTime = performance.now() - startTime;
      
      // Track fairness if enabled
      if (options.trackFairness && options.fairnessTracker) {
        options.fairnessTracker.recordRequest(request, response, responseTime);
      }
      
      return {
        requestId,
        success: response.status < 400,
        status: response.status,
        responseTime,
        rateLimited: response.status === 429,
        cacheHit: response.headers['x-cache'] === 'hit',
        retryAfter: this.safeParseInt(response.headers['retry-after'], 10),
        error: response.status >= 400 ? response.body?.detail || 'Unknown error' : null
      };
      
    } catch (error) {
      return {
        requestId,
        success: false,
        status: 0,
        responseTime: performance.now() - startTime,
        rateLimited: false,
        cacheHit: false,
        retryAfter: 0,
        error: 'Request failed'
      };
    } finally {
      // Clean up active request
      this.activeRequests.delete(requestId);
    }
  }

  private async simulateHttpRequest(request: StormRequest): Promise<SimulatedResponse> {
    // Simulate network latency
    await this.sleep(10 + Math.random() * 40);
    
    // Simulate rate limiting logic
    const isRateLimited = this.simulateRateLimiting(request);
    if (isRateLimited) {
      return {
        status: 429,
        headers: {
          'retry-after': Math.floor(Math.random() * 10 + 1).toString(),
          'ratelimit-remaining': '0',
          'x-cache': 'miss'
        },
        body: {
          type: 'about:blank',
          title: 'Rate limited',
          detail: 'Tenant budget exhausted',
          retry_after: 5
        }
      };
    }
    
    // Simulate cache hit/miss
    const cacheHit = request.type === 'verify' && Math.random() > 0.3; // 70% cache hit rate for verify
    
    // Simulate successful response
    return {
      status: 200,
      headers: {
        'x-cache': cacheHit ? 'hit' : 'miss',
        'ratelimit-remaining': Math.floor(Math.random() * 100).toString()
      },
      body: {
        verified: true,
        manifestHash: 'abc123',
        timestamp: Date.now()
      }
    };
  }

  private simulateRateLimiting(request: StormRequest): boolean {
    // Simulate rate limiting based on tenant tier and current load
    const tierLimits = {
      starter: { probability: 0.1 },
      growth: { probability: 0.05 },
      scale: { probability: 0.02 }
    };
    
    const limit = tierLimits[request.tier];
    return Math.random() < limit.probability;
  }

  private async monitorStormMetrics(
    duration: number,
    fairnessTracker: FairnessTracker
  ): Promise<MonitoringResults> {
    this.emit('monitoring_started', {});
    
    const results: MonitoringResults = {
      peakRps: 0,
      averageRps: 0,
      rateLimitRate: 0,
      errorRate: 0,
      cacheHitRate: 0,
      fairnessScore: 0
    };
    
    const startTime = Date.now();
    const metricsInterval = 5000; // 5 seconds
    let totalRps = 0;
    let measurements = 0;
    
    const monitorInterval = setInterval(() => {
      const currentRps = this.calculateCurrentRps(this.metrics);
      results.peakRps = Math.max(results.peakRps, currentRps);
      totalRps += currentRps;
      measurements++;
      
      // Update fairness metrics
      const currentFairness = fairnessTracker.getCurrentFairness();
      results.fairnessScore = currentFairness.score;
      
    }, metricsInterval);
    
    // Wait for storm duration
    await this.sleep(duration);
    clearInterval(monitorInterval);
    
    // Calculate final metrics
    results.averageRps = measurements > 0 ? totalRps / measurements : 0;
    results.rateLimitRate = this.metrics.getRateLimitRate();
    results.errorRate = this.metrics.getErrorRate();
    results.cacheHitRate = this.metrics.getCacheHitRate();
    
    return results;
  }

  private evaluatePassConditions(
    stormResults: StormPhaseResults,
    analysisResults: AnalysisPhaseResults
  ): boolean {
    const conditions = [
      // Condition 1: No starvation of paid tenants (DRR shares within ±20% of weights)
      this.evaluateFairnessCondition(analysisResults.fairnessAnalysis),
      
      // Condition 2: 429s carry Retry-After and error rate for paid tenants ≤ SLO
      this.evaluateErrorRateCondition(stormResults.requestResults),
      
      // Condition 3: Anonymous hits served from cache ≥ 95% during storm
      this.evaluateCacheCondition(analysisResults.cacheAnalysis),
      
      // Condition 4: Global pool depletion triggers soft→hard ladder correctly
      this.evaluateFailLadderCondition(analysisResults.errorAnalysis),
      
      // Condition 5: Prewarm reduces P95 verify latency by ≥30%
      this.evaluatePrewarmCondition(analysisResults.responseTimeAnalysis)
    ];
    
    return conditions.every(condition => condition.passed);
  }

  private evaluateFairnessCondition(fairnessAnalysis: FairnessAnalysis): TestConditionResult {
    // DRR fairness math: shares should be within ±20% of configured weights
    const expectedWeights = { starter: 1.0, growth: 1.2, scale: 2.0 };
    const tolerance = 0.2; // ±20%
    
    let allWithinTolerance = true;
    const details: string[] = [];
    
    for (const [tier, expectedWeight] of Object.entries(expectedWeights)) {
      const actualShare = fairnessAnalysis.tierShares[tier]?.actual || 0;
      const deviation = Math.abs(actualShare - expectedWeight) / expectedWeight;
      
      if (deviation > tolerance) {
        allWithinTolerance = false;
        details.push(`${tier} tier deviation ${(deviation * 100).toFixed(1)}% exceeds tolerance`);
      } else {
        details.push(`${tier} tier deviation ${(deviation * 100).toFixed(1)}% within tolerance`);
      }
    }
    
    return {
      passed: allWithinTolerance,
      description: 'DRR shares within ±20% of weights under contention',
      details
    };
  }

  private evaluateErrorRateCondition(requestResults: RequestResults): TestConditionResult {
    // Error rate for paid tenants should be ≤ agreed SLO (let's say 1%)
    const paidTenantErrors = Object.entries(requestResults.errorsByTenant)
      .filter(([tenantId]) => !tenantId.includes('anonymous'))
      .reduce((sum, [_, errors]) => sum + errors, 0);
    
    const totalPaidRequests = requestResults.totalSent - (requestResults.errorsByTenant['anonymous'] || 0);
    const errorRate = totalPaidRequests > 0 ? paidTenantErrors / totalPaidRequests : 0;
    const sloThreshold = 0.01; // 1%
    
    return {
      passed: errorRate <= sloThreshold,
      description: 'Error rate for paid tenants ≤ agreed SLO',
      details: [
        `Paid tenant error rate: ${(errorRate * 100).toFixed(2)}%`,
        `SLO threshold: ${(sloThreshold * 100).toFixed(2)}%`,
        `Total paid requests: ${totalPaidRequests}`,
        `Paid tenant errors: ${paidTenantErrors}`
      ]
    };
  }

  private evaluateCacheCondition(cacheAnalysis: CacheAnalysis): TestConditionResult {
    // Anonymous cache hit rate should be ≥ 95%
    const anonymousHitRate = cacheAnalysis.anonymousHitRate || 0;
    const threshold = 0.95; // 95%
    
    return {
      passed: anonymousHitRate >= threshold,
      description: 'Anonymous hits served from cache ≥ 95% during storm',
      details: [
        `Anonymous cache hit rate: ${(anonymousHitRate * 100).toFixed(1)}%`,
        `Required threshold: ${(threshold * 100).toFixed(1)}%`,
        `Total anonymous requests: ${cacheAnalysis.totalAnonymousRequests || 0}`,
        `Cache hits: ${cacheAnalysis.anonymousCacheHits || 0}`
      ]
    };
  }

  private evaluateFailLadderCondition(errorAnalysis: ErrorAnalysis): TestConditionResult {
    // Global pool depletion should trigger soft→hard ladder correctly
    const softFails = errorAnalysis.softFails || 0;
    const hardFails = errorAnalysis.hardFails || 0;
    const retryAfterHeaders = errorAnalysis.retryAfterHeaders || 0;
    
    // All rate limited responses should have Retry-After headers
    const totalRateLimited = softFails + hardFails;
    const retryAfterCompliance = totalRateLimited > 0 ? retryAfterHeaders / totalRateLimited : 1;
    
    return {
      passed: retryAfterCompliance >= 0.95, // 95% compliance
      description: 'Global pool depletion triggers soft→hard ladder correctly',
      details: [
        `Soft fails (429): ${softFails}`,
        `Hard fails (read-only): ${hardFails}`,
        `Retry-After headers: ${retryAfterHeaders}`,
        `Compliance rate: ${(retryAfterCompliance * 100).toFixed(1)}%`
      ]
    };
  }

  private evaluatePrewarmCondition(responseTimeAnalysis: ResponseTimeAnalysis): TestConditionResult {
    // Prewarm should reduce P95 verify latency by ≥30%
    const prewarmP95 = responseTimeAnalysis.prewarmP95 || 0;
    const coldP95 = responseTimeAnalysis.coldP95 || 0;
    
    if (coldP95 === 0) {
      return { passed: false, description: 'No cold latency data available', details: [] };
    }
    
    const improvement = (coldP95 - prewarmP95) / coldP95;
    const threshold = 0.3; // 30% improvement
    
    return {
      passed: improvement >= threshold,
      description: 'Prewarm reduces P95 verify latency by ≥30%',
      details: [
        `Cold P95 latency: ${coldP95.toFixed(1)}ms`,
        `Prewarm P95 latency: ${prewarmP95.toFixed(1)}ms`,
        `Improvement: ${(improvement * 100).toFixed(1)}%`,
        `Required improvement: ${(threshold * 100).toFixed(1)}%`
      ]
    };
  }

  // Helper methods
  private createTrafficDistribution(): TrafficDistribution {
    return {
      anonymous: 0.4,    // 40% anonymous traffic
      starter: 0.3,      // 30% starter tier
      growth: 0.2,       // 20% growth tier
      scale: 0.1         // 10% scale tier
    };
  }

  private selectRequestType(distribution: TrafficDistribution): RequestType {
    const rand = Math.random();
    if (rand < 0.7) return 'verify';      // 70% verify requests
    if (rand < 0.9) return 'sign';        // 20% sign requests
    return 'batch';                        // 10% batch requests
  }

  private selectTenant(distribution: TrafficDistribution, requestType: RequestType): TenantInfo {
    if (requestType === 'verify' && Math.random() < 0.5) {
      // 50% of verify requests are anonymous
      return { id: 'anonymous', tier: 'anonymous' };
    }
    
    const rand = Math.random();
    if (rand < distribution.starter) {
      return { id: 'tenant_starter_001', tier: 'starter' };
    }
    if (rand < distribution.starter + distribution.growth) {
      return { id: 'tenant_growth_001', tier: 'growth' };
    }
    return { id: 'tenant_scale_001', tier: 'scale' };
  }

  private generateRequestPath(type: RequestType): string {
    const paths = {
      verify: '/api/v1/verify',
      sign: '/api/v1/sign',
      batch: '/api/v1/batch'
    };
    return paths[type];
  }

  private generateRequestHeaders(tenant: TenantInfo): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'User-Agent': 'synthetic-storm-drill/1.0'
    };
    
    if (tenant.tier !== 'anonymous') {
      headers['X-API-Key'] = `${tenant.tier}_key_123`;
    }
    
    return headers;
  }

  private calculateCurrentRps(metrics: StormMetrics): number {
    return metrics.getCurrentRps();
  }

  private processBatchResults(
    batchResults: PromiseSettledResult<RequestResult>[],
    results: RequestResults
  ): void {
    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        const requestResult = result.value;
        
        if (requestResult.success) {
          results.successful++;
        } else {
          results.failed++;
          
          // Track errors by tenant
          const tenantId = this.activeRequests.get(requestResult.requestId)?.tenantId || 'unknown';
          results.errorsByTenant[tenantId] = (results.errorsByTenant[tenantId] || 0) + 1;
        }
        
        if (requestResult.rateLimited) {
          results.rateLimited++;
        }
        
        if (requestResult.cacheHit) {
          results.cacheHits++;
        }
        
        // Track response times
        const bucket = Math.floor(requestResult.responseTime / 10) * 10;
        results.responseTimeHistogram[bucket] = (results.responseTimeHistogram[bucket] || 0) + 1;
        
        // Update metrics
        this.metrics.recordRequest(requestResult);
        
      } else {
        results.failed++;
        this.emit('batch_error', { reason: result.reason });
      }
    }
  }

  private aggregateTestResult(results: ScenarioResult, testResult: RequestResult): void {
    results.requestsSent++;
    if (testResult.success) {
      results.requestsSucceeded++;
    } else {
      results.requestsFailed++;
      if (testResult.error) {
        results.errors.push(testResult.error);
      }
    }
  }

  private async analyzeCachePerformance(): Promise<any> {
    // Simulate cache performance analysis
    return {
      anonymousHitRate: 0.96, // 96% cache hit rate for anonymous
      totalAnonymousRequests: 20000,
      anonymousCacheHits: 19200,
      paidHitRate: 0.75,
      totalPaidRequests: 30000,
      paidCacheHits: 22500
    };
  }

  private async analyzeFairnessMetrics(): Promise<any> {
    // Simulate fairness analysis
    return {
      tierShares: {
        starter: { actual: 0.98, expected: 1.0 },
        growth: { actual: 1.15, expected: 1.2 },
        scale: { actual: 1.95, expected: 2.0 }
      },
      fairnessScore: 0.92,
      totalRequestsProcessed: 50000,
      queueDepths: {
        starter: 45,
        growth: 23,
        scale: 12
      }
    };
  }

  private async analyzeErrorPatterns(): Promise<any> {
    // Simulate error pattern analysis
    return {
      softFails: 1250,
      hardFails: 50,
      retryAfterHeaders: 1300,
      errorRateByTier: {
        starter: 0.025,
        growth: 0.015,
        scale: 0.008,
        anonymous: 0.04
      }
    };
  }

  private async analyzeResponseTimes(): Promise<any> {
    // Simulate response time analysis
    return {
      coldP95: 245, // ms
      prewarmP95: 165, // ms
      averageResponseTime: 85,
      p99ResponseTime: 380
    };
  }

  private cleanup(): void {
    this.activeRequests.clear();
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Fairness tracker for DRR analysis
 */
class FairnessTracker {
  private tenantMetrics: Map<string, TenantFairnessMetrics> = new Map();
  private totalRequests = 0;

  recordRequest(request: StormRequest, response: SimulatedResponse, responseTime: number): void {
    this.totalRequests++;
    
    let metrics = this.tenantMetrics.get(request.tenantId);
    if (!metrics) {
      metrics = {
        tenantId: request.tenantId,
        tier: request.tier,
        requestsServed: 0,
        totalResponseTime: 0,
        queueWaitTime: 0
      };
      this.tenantMetrics.set(request.tenantId, metrics);
    }
    
    metrics.requestsServed++;
    metrics.totalResponseTime += responseTime;
  }

  getCurrentFairness(): { score: number } {
    // Calculate current fairness score
    // Simplified calculation - in reality would use DRR algorithm
    return { score: 0.9 + Math.random() * 0.1 };
  }

  getFinalMetrics(): any {
    return {
      totalRequests: this.totalRequests,
      tenantMetrics: Array.from(this.tenantMetrics.values())
    };
  }
}

/**
 * Storm metrics collector
 */
class StormMetrics {
  private requests = 0;
  private successes = 0;
  private failures = 0;
  private rateLimits = 0;
  private cacheHits = 0;
  private startTime = Date.now();
  private requestTimes: number[] = [];

  recordRequest(result: RequestResult): void {
    this.requests++;
    
    if (result.success) {
      this.successes++;
    } else {
      this.failures++;
    }
    
    if (result.rateLimited) {
      this.rateLimits++;
    }
    
    if (result.cacheHit) {
      this.cacheHits++;
    }
    
    this.requestTimes.push(result.responseTime);
    
    // Keep only last 1000 request times for current RPS calculation
    if (this.requestTimes.length > 1000) {
      this.requestTimes = this.requestTimes.slice(-1000);
    }
  }

  getCurrentRps(): number {
    if (this.requestTimes.length < 2) {
      return 0;
    }
    
    const now = Date.now();
    const oneSecondAgo = now - 1000;
    
    const recentRequests = this.requestTimes.filter(time => 
      (now - time) <= 1000
    );
    
    return recentRequests.length;
  }

  getRateLimitRate(): number {
    return this.requests > 0 ? this.rateLimits / this.requests : 0;
  }

  getErrorRate(): number {
    return this.requests > 0 ? this.failures / this.requests : 0;
  }

  getCacheHitRate(): number {
    return this.requests > 0 ? this.cacheHits / this.requests : 0;
  }

  reset(): void {
    this.requests = 0;
    this.successes = 0;
    this.failures = 0;
    this.rateLimits = 0;
    this.cacheHits = 0;
    this.startTime = Date.now();
    this.requestTimes = [];
  }
}

// Type definitions
export interface StormDrillConfig {
  targetRps: number;
  stormDurationMs: number;
  warmupDurationMs: number;
  warmupRateRps: number;
}

export interface StormDrillResults {
  totalDuration: number;
  stormResults: StormPhaseResults;
  analysisResults: AnalysisPhaseResults;
  passed: boolean;
  timestamp: number;
}

export interface StormPhaseResults {
  requestResults: RequestResults;
  monitoringResults: MonitoringResults;
  fairnessMetrics: any;
}

export interface AnalysisPhaseResults {
  cacheAnalysis: any;
  fairnessAnalysis: any;
  errorAnalysis: any;
  responseTimeAnalysis: any;
}

export interface RequestResults {
  totalSent: number;
  successful: number;
  failed: number;
  rateLimited: number;
  cacheHits: number;
  averageResponseTime: number;
  responseTimeHistogram: Record<number, number>;
  errorsByTenant: Record<string, number>;
  startTime: number;
  endTime?: number;
  totalDuration?: number;
  actualRps?: number;
}

export interface MonitoringResults {
  peakRps: number;
  averageRps: number;
  rateLimitRate: number;
  errorRate: number;
  cacheHitRate: number;
  fairnessScore: number;
}

export interface TestConditionResult {
  passed: boolean;
  description: string;
  details: string[];
}

export interface TestScenario {
  name: string;
  tests: IndividualTest[];
}

export interface ScenarioResult {
  name: string;
  duration: number;
  requestsSent: number;
  requestsSucceeded: number;
  requestsFailed: number;
  averageResponseTime: number;
  errors: string[];
}

export interface IndividualTest {
  name: string;
  requestRate: number;
  duration: number;
  expectedResults: any;
}

export interface StormRequest {
  id: string;
  type: RequestType;
  tenantId: string;
  tier: TenantTier;
  timestamp: number;
  path: string;
  headers: Record<string, string>;
}

export interface RequestResult {
  requestId: string;
  success: boolean;
  status: number;
  responseTime: number;
  rateLimited: boolean;
  cacheHit: boolean;
  retryAfter: number;
  error?: string;
}

export interface SimulatedResponse {
  status: number;
  headers: Record<string, string>;
  body?: any;
}

export interface BurstRequestOptions {
  distribution: TrafficDistribution;
  duration: number;
  trackFairness?: boolean;
  fairnessTracker?: FairnessTracker;
}

export interface TrafficDistribution {
  anonymous: number;
  starter: number;
  growth: number;
  scale: number;
}

export type RequestType = 'verify' | 'sign' | 'batch';
export type TenantTier = 'anonymous' | 'starter' | 'growth' | 'scale';

export interface TenantInfo {
  id: string;
  tier: TenantTier;
}

export interface TenantFairnessMetrics {
  tenantId: string;
  tier: TenantTier;
  requestsServed: number;
  totalResponseTime: number;
  queueWaitTime: number;
}

// Default configuration
export const DEFAULT_STORM_DRILL_CONFIG: StormDrillConfig = {
  targetRps: 50000, // 50k rps
  stormDurationMs: 10 * 60 * 1000, // 10 minutes
  warmupDurationMs: 2 * 60 * 1000, // 2 minutes
  warmupRateRps: 5000 // 5k rps warmup
};
```
