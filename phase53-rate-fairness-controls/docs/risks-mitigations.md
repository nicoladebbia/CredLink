# Phase 53 — Risks & Mitigations Documentation

## Risk Analysis and Mitigation Strategies

### 1. Over-throttling Real News Events

#### Risk Description
During breaking news or major events, legitimate traffic spikes from news organizations could be mistakenly throttled, preventing critical information from reaching the public and damaging journalistic workflows.

#### Mitigation Strategy: Event Mode Override
import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';

/**
 * Event mode manager for breaking news scenarios
 * Implements temporary elevation of rate limits for verified news organizations
 */
export class BreakingNewsEventManager {
  private readonly activeEvents: Map<string, ActiveEvent> = new Map();
  private readonly trustedTenants: Set<string> = new Set();
  private readonly config: EventModeConfig;

  constructor(config: EventModeConfig) {
    this.config = config;
    this.loadTrustedTenants();
  }

  /**
   * Activate event mode for trusted news tenant
   * Provides temporary rate limit elevation and global pool bypass
   */
  async activateEventMode(
    tenantId: string,
    eventDetails: BreakingNewsEvent
  ): Promise<EventModeResult> {
    // Verify tenant is trusted
    if (!this.trustedTenants.has(tenantId)) {
      // Don't leak tenant ID in error message
      throw new Error('Not authorized for event mode');
    }

    // Validate event details
    this.validateEventDetails(eventDetails);

    const activeEvent: ActiveEvent = {
      tenantId,
      eventId: this.generateEventId(),
      eventDetails,
      activatedAt: Date.now(),
      expiresAt: Date.now() + (eventDetails.durationMinutes * 60 * 1000),
      elevatedLimits: this.calculateElevatedLimits(eventDetails.severity),
      bypassGlobalPool: eventDetails.severity === 'critical'
    };

    this.activeEvents.set(tenantId, activeEvent);

    // Generate event token for API requests
    const eventToken = this.generateEventToken(activeEvent);

    // Log activation for audit
    this.logEventActivation(activeEvent);

    // Notify monitoring systems
    this.notifyEventActivation(activeEvent);

    return {
      eventId: activeEvent.eventId,
      eventToken,
      expiresAt: activeEvent.expiresAt,
      elevatedLimits: activeEvent.elevatedLimits,
      bypassGlobalPool: activeEvent.bypassGlobalPool
    };
  }

  /**
   * Check if tenant has active event mode
   */
  hasActiveEventMode(tenantId: string): boolean {
    const event = this.activeEvents.get(tenantId);
    if (!event) {
      return false;
    }

    // Auto-expire if past expiration
    if (Date.now() > event.expiresAt) {
      this.activeEvents.delete(tenantId);
      return false;
    }

    return true;
  }

  /**
   * Get elevated rate limits for event mode
   */
  getElevatedLimits(tenantId: string): ElevatedLimits | null {
    const event = this.activeEvents.get(tenantId);
    if (!event || Date.now() > event.expiresAt) {
      return null;
    }

    return event.elevatedLimits;
  }

  /**
   * Should bypass global pool for this tenant?
   */
  shouldBypassGlobalPool(tenantId: string): boolean {
    const event = this.activeEvents.get(tenantId);
    return event ? event.bypassGlobalPool && Date.now() <= event.expiresAt : false;
  }

  /**
   * Deactivate event mode
   */
  async deactivateEventMode(tenantId: string, reason?: string): Promise<void> {
    const event = this.activeEvents.get(tenantId);
    if (event) {
      this.activeEvents.delete(tenantId);
      this.logEventDeactivation(event, reason);
      this.notifyEventDeactivation(event);
    }
  }

  /**
   * Get all active events for monitoring
   */
  getActiveEvents(): ActiveEvent[] {
    const now = Date.now();
    return Array.from(this.activeEvents.values())
      .filter(event => event.expiresAt > now);
  }

  private loadTrustedTenants(): void {
    // Load trusted news organizations
    const trustedList = [
      'tenant_newsroom_001',
      'tenant_newsroom_002',
      'tenant_newsroom_003',
      'tenant_eu_ads_001'
    ];

    trustedList.forEach(tenantId => this.trustedTenants.add(tenantId));
  }

  private validateEventDetails(event: BreakingNewsEvent): void {
    if (!event.title || event.title.length < 10) {
      throw new Error('Event title must be at least 10 characters');
    }

    if (!event.description || event.description.length < 20) {
      throw new Error('Event description must be at least 20 characters');
    }

    if (event.durationMinutes < 15 || event.durationMinutes > 480) { // 15min - 8hours
      throw new Error('Event duration must be between 15 minutes and 8 hours');
    }

    if (!['low', 'medium', 'high', 'critical'].includes(event.severity)) {
      throw new Error('Invalid event severity');
    }
  }

  private calculateElevatedLimits(severity: EventSeverity): ElevatedLimits {
    const multipliers = {
      low: 2.0,
      medium: 3.0,
      high: 5.0,
      critical: 10.0
    };

    const multiplier = multipliers[severity];

    return {
      steadyRps: Math.floor(300 * multiplier), // Base 300 rps
      burstTokens: Math.floor(1200 * multiplier), // Base 1200 tokens
      priority: severity === 'critical' ? 10 : severity === 'high' ? 5 : 2
    };
  }

  private generateEventId(): string {
    return `event_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  private generateEventToken(tenantId: string, event: ActiveEvent): string {
    // Generate cryptographically secure token
    const tokenData = `${event.tenantId}:${event.eventId}:${event.expiresAt}`;
    const hash = require('crypto').createHash('sha256').update(tokenData).digest('hex');
    const randomSuffix = randomBytes(8).toString('hex');
    return `${hash}_${randomSuffix}`;
  }

  private logEventActivation(event: ActiveEvent): void {
    this.emit('event_activated', { eventId: event.eventId, tenantId: event.tenantId });
  }

  private logEventDeactivation(event: ActiveEvent, reason?: string): void {
    this.emit('event_deactivated', { eventId: event.eventId, tenantId: event.tenantId, reason });
  }

  private notifyEventActivation(event: ActiveEvent): void {
    // Send to monitoring systems
    // In real implementation, would send to PagerDuty, Slack, etc.
  }

  private notifyEventDeactivation(event: ActiveEvent): void {
    // Send to monitoring systems
  }
}

/**
 * Prewarm manager for hot assets during events
 */
export class EventPrewarmManager {
  private readonly prewarmManager: PrewarmManager;
  private readonly eventManager: BreakingNewsEventManager;

  constructor(
    prewarmManager: PrewarmManager,
    eventManager: BreakingNewsEventManager
  ) {
    this.prewarmManager = prewarmManager;
    this.eventManager = eventManager;
  }

  /**
   * Prewarm assets for breaking news event
   */
  async prewarmEventAssets(
    tenantId: string,
    assets: BreakingNewsAsset[]
  ): Promise<PrewarmResult> {
    // Verify tenant has active event mode
    if (!this.eventManager.hasActiveEventMode(tenantId)) {
      throw new Error('Tenant does not have active event mode');
    }

    // Prioritize assets based on event importance
    const prioritizedAssets = this.prioritizeAssets(assets);

    // Execute prewarm with elevated priority
    const result = await this.prewarmManager.triggerPrewarm(
      prioritizedAssets.map(asset => ({
        assetHash: asset.hash,
        policyId: asset.policyId || 'default',
        priority: asset.priority * 2, // Double priority during events
        expectedRequests: asset.expectedRequests
      }))
    );

    return result;
  }

  private prioritizeAssets(assets: BreakingNewsAsset[]): BreakingNewsAsset[] {
    return assets.sort((a, b) => {
      // Sort by priority first, then by expected requests
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return (b.expectedRequests || 0) - (a.expectedRequests || 0);
    });
  }
}
```

### 2. Scrapers Rotating IPs

#### Risk Description
Malicious actors may rotate IP addresses to bypass rate limits, potentially overwhelming the system and causing denial of service for legitimate users.

#### Mitigation Strategy: Tenant-Based Rate Limiting
```typescript
/**
 * Anti-scraping protection with tenant-based rate limiting
 * Counts against tenant/API key budgets, not just IPs
 */
export class AntiScrapingProtection {
  private readonly tenantTracker: Map<string, TenantScrapingMetrics> = new Map();
  private readonly ipTracker: Map<string, IPScrapingMetrics> = new Map();
  private readonly config: AntiScrapingConfig;

  constructor(config: AntiScrapingConfig) {
    this.config = config;
    
    // Cleanup old metrics every hour
    setInterval(() => this.cleanupMetrics(), 3600000);
  }

  /**
   * Analyze request for scraping patterns
   */
  analyzeRequest(request: IncomingRequest): ScrapingAnalysis {
    const tenantId = this.extractTenantId(request);
    const clientIp = this.extractClientIp(request);
    const userAgent = request.headers['user-agent'] || '';

    const analysis: ScrapingAnalysis = {
      isSuspicious: false,
      riskScore: 0,
      reasons: [],
      recommendedAction: 'allow'
    };

    // Analyze tenant-level patterns
    const tenantAnalysis = this.analyzeTenantPatterns(tenantId, request);
    analysis.riskScore += tenantAnalysis.riskScore;
    analysis.reasons.push(...tenantAnalysis.reasons);

    // Analyze IP-level patterns (for anonymous traffic)
    if (!tenantId) {
      const ipAnalysis = this.analyzeIpPatterns(clientIp, request);
      analysis.riskScore += ipAnalysis.riskScore;
      analysis.reasons.push(...ipAnalysis.reasons);
    }

    // Analyze user agent
    const uaAnalysis = this.analyzeUserAgent(userAgent);
    analysis.riskScore += uaAnalysis.riskScore;
    analysis.reasons.push(...uaAnalysis.reasons);

    // Determine action based on risk score
    if (analysis.riskScore >= this.config.highRiskThreshold) {
      analysis.isSuspicious = true;
      analysis.recommendedAction = 'block';
    } else if (analysis.riskScore >= this.config.mediumRiskThreshold) {
      analysis.isSuspicious = true;
      analysis.recommendedAction = 'rate_limit_strict';
    } else if (analysis.riskScore >= this.config.lowRiskThreshold) {
      analysis.isSuspicious = true;
      analysis.recommendedAction = 'rate_limit_normal';
    }

    return analysis;
  }

  private analyzeTenantPatterns(tenantId: string, request: IncomingRequest): PatternAnalysis {
    let metrics = this.tenantTracker.get(tenantId);
    if (!metrics) {
      metrics = new TenantScrapingMetrics(tenantId);
      this.tenantTracker.set(tenantId, metrics);
    }

    metrics.recordRequest(request);

    const analysis: PatternAnalysis = {
      riskScore: 0,
      reasons: []
    };

    // Check for high request frequency
    const requestsPerMinute = metrics.getRequestsPerMinute();
    if (requestsPerMinute > this.config.maxTenantRequestsPerMinute) {
      analysis.riskScore += 30;
      analysis.reasons.push(`High request frequency: ${requestsPerMinute} req/min`);
    }

    // Check for repetitive patterns
    if (metrics.hasRepetitivePattern()) {
      analysis.riskScore += 20;
      analysis.reasons.push('Repetitive request pattern detected');
    }

    // Check for unusual request distribution
    if (metrics.hasUnusualDistribution()) {
      analysis.riskScore += 15;
      analysis.reasons.push('Unusual request distribution');
    }

    // Check for lack of cache utilization
    const cacheHitRate = metrics.getCacheHitRate();
    if (cacheHitRate < 0.1 && metrics.getTotalRequests() > 100) {
      analysis.riskScore += 25;
      analysis.reasons.push(`Low cache hit rate: ${(cacheHitRate * 100).toFixed(1)}%`);
    }

    return analysis;
  }

  private analyzeIpPatterns(clientIp: string, request: IncomingRequest): PatternAnalysis {
    let metrics = this.ipTracker.get(clientIp);
    if (!metrics) {
      metrics = new IPScrapingMetrics(clientIp);
      this.ipTracker.set(clientIp, metrics);
    }

    metrics.recordRequest(request);

    const analysis: PatternAnalysis = {
      riskScore: 0,
      reasons: []
    };

    // Anonymous traffic gets stricter limits
    const requestsPerMinute = metrics.getRequestsPerMinute();
    if (requestsPerMinute > this.config.maxAnonymousRequestsPerMinute) {
      analysis.riskScore += 40;
      analysis.reasons.push(`Excessive anonymous requests: ${requestsPerMinute} req/min`);
    }

    // Check for multiple user agents from same IP
    if (metrics.getUniqueUserAgents() > this.config.maxUserAgentsPerIp) {
      analysis.riskScore += 30;
      analysis.reasons.push('Multiple user agents from single IP');
    }

    return analysis;
  }

  private analyzeUserAgent(userAgent: string): PatternAnalysis {
    const analysis: PatternAnalysis = {
      riskScore: 0,
      reasons: []
    };

    // Check for common scraping tools
    const scrapingPatterns = [
      /bot/i,
      /crawler/i,
      /scraper/i,
      /spider/i,
      /curl/i,
      /wget/i,
      /python/i,
      /requests/i,
      /scrapy/i
    ];

    for (const pattern of scrapingPatterns) {
      if (pattern.test(userAgent)) {
        analysis.riskScore += 20;
        analysis.reasons.push(`Suspicious user agent pattern: ${pattern.source}`);
        break;
      }
    }

    // Check for missing or empty user agent
    if (!userAgent || userAgent.length < 10) {
      analysis.riskScore += 10;
      analysis.reasons.push('Missing or suspiciously short user agent');
    }

    return analysis;
  }

  private extractTenantId(request: IncomingRequest): string | null {
    const apiKey = request.headers['x-api-key'];
    if (apiKey && typeof apiKey === 'string' && apiKey.length > 0) {
      return apiKey;
    }
    
    const authHeader = request.headers['authorization'];
    if (authHeader && typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    
    return null;
  }

  private extractClientIp(request: IncomingRequest): string {
    const xForwardedFor = request.headers['x-forwarded-for'];
    if (xForwardedFor && typeof xForwardedFor === 'string') {
      const ips = xForwardedFor.split(',').map(ip => ip.trim());
      if (ips.length > 0 && ips[0].length > 0) {
        // Validate IP format
        const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
        if (ipRegex.test(ips[0])) {
          return ips[0];
        }
      }
    }
    
    const xRealIp = request.headers['x-real-ip'];
    if (xRealIp && typeof xRealIp === 'string') {
      return xRealIp;
    }
    
    const cfConnectingIp = request.headers['cf-connecting-ip'];
    if (cfConnectingIp && typeof cfConnectingIp === 'string') {
      return cfConnectingIp;
    }
    
    return 'unknown';
  }

  private cleanupMetrics(): void {
    const cutoffTime = Date.now() - (24 * 60 * 60 * 1000); // 24 hours

    // Cleanup tenant metrics
    for (const [tenantId, metrics] of this.tenantTracker.entries()) {
      if (metrics.getLastActivity() < cutoffTime) {
        this.tenantTracker.delete(tenantId);
      }
    }

    // Cleanup IP metrics
    for (const [clientIp, metrics] of this.ipTracker.entries()) {
      if (metrics.getLastActivity() < cutoffTime) {
        this.ipTracker.delete(clientIp);
      }
    }
  }
}

/**
 * Tenant scraping metrics tracker
 */
class TenantScrapingMetrics {
  private readonly tenantId: string;
  private requests: RequestRecord[] = [];
  private endpointCounts: Map<string, number> = new Map();
  private cacheHits = 0;

  constructor(tenantId: string) {
    this.tenantId = tenantId;
  }

  recordRequest(request: IncomingRequest): void {
    const record: RequestRecord = {
      timestamp: Date.now(),
      path: request.path,
      method: request.method,
      userAgent: request.headers['user-agent'] || ''
    };

    this.requests.push(record);
    this.endpointCounts.set(request.path, (this.endpointCounts.get(request.path) || 0) + 1);

    // Keep only last hour of requests
    const oneHourAgo = Date.now() - 3600000;
    this.requests = this.requests.filter(r => r.timestamp > oneHourAgo);
  }

  getRequestsPerMinute(): number {
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = this.requests.filter(r => r.timestamp > oneMinuteAgo);
    return recentRequests.length;
  }

  hasRepetitivePattern(): boolean {
    if (this.requests.length < 50) {
      return false;
    }

    // Check if >80% of requests go to the same endpoint
    const totalRequests = this.requests.length;
    for (const count of this.endpointCounts.values()) {
      if (count / totalRequests > 0.8) {
        return true;
      }
    }

    return false;
  }

  hasUnusualDistribution(): boolean {
    // Check for requests at regular intervals (bot-like behavior)
    if (this.requests.length < 20) {
      return false;
    }

    const intervals: number[] = [];
    for (let i = 1; i < this.requests.length; i++) {
      intervals.push(this.requests[i].timestamp - this.requests[i-1].timestamp);
    }

    // Calculate variance in intervals
    const avgInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
    const variance = intervals.reduce((sum, interval) => sum + Math.pow(interval - avgInterval, 2), 0) / intervals.length;
    const stdDev = Math.sqrt(variance);

    // Low variance suggests bot-like behavior
    return stdDev < avgInterval * 0.1;
  }

  getCacheHitRate(): number {
    return this.requests.length > 0 ? this.cacheHits / this.requests.length : 0;
  }

  getTotalRequests(): number {
    return this.requests.length;
  }

  getLastActivity(): number {
    return this.requests.length > 0 ? this.requests[this.requests.length - 1].timestamp : 0;
  }
}

/**
 * IP scraping metrics tracker
 */
class IPScrapingMetrics {
  private readonly clientIp: string;
  private requests: RequestRecord[] = [];
  private userAgents: Set<string> = new Set();

  constructor(clientIp: string) {
    this.clientIp = clientIp;
  }

  recordRequest(request: IncomingRequest): void {
    const record: RequestRecord = {
      timestamp: Date.now(),
      path: request.path,
      method: request.method,
      userAgent: request.headers['user-agent'] || ''
    };

    this.requests.push(record);
    this.userAgents.add(record.userAgent);

    // Keep only last hour of requests
    const oneHourAgo = Date.now() - 3600000;
    this.requests = this.requests.filter(r => r.timestamp > oneHourAgo);
  }

  getRequestsPerMinute(): number {
    const oneMinuteAgo = Date.now() - 60000;
    const recentRequests = this.requests.filter(r => r.timestamp > oneMinuteAgo);
    return recentRequests.length;
  }

  getUniqueUserAgents(): number {
    return this.userAgents.size;
  }

  getLastActivity(): number {
    return this.requests.length > 0 ? this.requests[this.requests.length - 1].timestamp : 0;
  }
}
```

### 3. Origin/Verify Backend Exhaustion

#### Risk Description
High traffic volumes could overwhelm the verification backend, causing service degradation and potential cascading failures.

#### Mitigation Strategy: Two-Stage Rate Limiting
```typescript
/**
 * Two-stage rate limiting per Envoy guidance
 * Local token bucket + global pool shields the backend
 */
export class TwoStageRateLimiter {
  private readonly localLimiter: LocalTokenBucket;
  private readonly globalLimiter: GlobalTokenBucket;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(config: TwoStageConfig) {
    this.localLimiter = new LocalTokenBucket(config.local);
    this.globalLimiter = new GlobalTokenBucket(config.global);
    this.circuitBreaker = new CircuitBreaker(config.circuitBreaker);
  }

  /**
   * Check rate limits using two-stage approach
   */
  async checkRateLimit(request: RateLimitRequest): Promise<TwoStageDecision> {
    const startTime = Date.now();
    
    try {
      // Stage 1: Local token bucket (fast path)
      const localDecision = this.localLimiter.checkRequest(request);
      if (!localDecision.allowed) {
        return {
          allowed: false,
          stage: 'local',
          reason: localDecision.reason,
          retryAfter: localDecision.retryAfter,
          processingTime: Date.now() - startTime
        };
      }

      // Stage 2: Global token bucket (distributed coordination)
      const globalDecision = await this.globalLimiter.checkRequest(request);
      if (!globalDecision.allowed) {
        // Rollback local consumption
        this.localLimiter.rollbackConsumption(request);
        
        return {
          allowed: false,
          stage: 'global',
          reason: globalDecision.reason,
          retryAfter: globalDecision.retryAfter,
          processingTime: Date.now() - startTime
        };
      }

      // Stage 3: Circuit breaker check (backend protection)
      const circuitState = this.circuitBreaker.getState();
      if (circuitState === 'open') {
        // Rollback both local and global consumption
        this.localLimiter.rollbackConsumption(request);
        await this.globalLimiter.rollbackConsumption(request);
        
        return {
          allowed: false,
          stage: 'circuit_breaker',
          reason: 'Backend circuit breaker open',
          retryAfter: this.circuitBreaker.getRetryAfter(),
          processingTime: Date.now() - startTime
        };
      }

      return {
        allowed: true,
        stage: 'passed',
        reason: 'Request allowed',
        retryAfter: 0,
        processingTime: Date.now() - startTime
      };

    } catch (error) {
      // Fail open on errors
      return {
        allowed: true,
        stage: 'error_fallback',
        reason: 'Rate limiter error - allowing request',
        retryAfter: 0,
        processingTime: Date.now() - startTime
      };
    }
  }

  /**
   * Record successful request completion
   */
  recordSuccess(request: RateLimitRequest): void {
    this.circuitBreaker.recordSuccess();
  }

  /**
   * Record failed request (backend error)
   */
  recordFailure(request: RateLimitRequest, error: BackendError): void {
    this.circuitBreaker.recordFailure();
    
    // If backend is overloaded, trigger protective measures
    if (error.type === 'overload') {
      this.triggerProtectiveMeasures();
    }
  }

  private triggerProtectiveMeasures(): void {
    // Temporarily tighten rate limits
    this.localLimiter.tightenLimits(0.5); // Reduce by 50%
    this.globalLimiter.tightenLimits(0.5);
    
    // Schedule recovery
    setTimeout(() => {
      this.localLimiter.restoreLimits();
      this.globalLimiter.restoreLimits();
    }, 5 * 60 * 1000); // 5 minutes
  }
}

/**
 * Circuit breaker for backend protection
 */
export class CircuitBreaker {
  private state: 'closed' | 'open' | 'half_open' = 'closed';
  private failures = 0;
  private lastFailureTime = 0;
  private successCount = 0;

  constructor(private config: CircuitBreakerConfig) {}

  getState(): CircuitBreakerState {
    return this.state;
  }

  recordSuccess(): void {
    this.failures = 0;
    
    if (this.state === 'half_open') {
      this.successCount++;
      if (this.successCount >= this.config.successThreshold) {
        this.state = 'closed';
        this.successCount = 0;
      }
    }
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.config.failureThreshold) {
      this.state = 'open';
    }
  }

  getRetryAfter(): number {
    if (this.state === 'open') {
      const timeSinceOpen = Date.now() - this.lastFailureTime;
      const remainingTime = this.config.openTimeoutMs - timeSinceOpen;
      return Math.max(1, Math.ceil(remainingTime / 1000));
    }
    
    return 0;
  }

  shouldAllowRequest(): boolean {
    if (this.state === 'closed') {
      return true;
    }
    
    if (this.state === 'open') {
      const timeSinceOpen = Date.now() - this.lastFailureTime;
      if (timeSinceOpen >= this.config.openTimeoutMs) {
        this.state = 'half_open';
        return true;
      }
      return false;
    }
    
    // half_open state - allow some requests through
    return Math.random() < 0.1; // 10% chance
  }
}
```

### 4. Client Confusion on Backoff

#### Risk Description
Clients may not properly implement exponential backoff, leading to thundering herd problems and increased load on the system.

#### Mitigation Strategy: Standards-Compliant Responses
```typescript
/**
 * Client guidance for proper backoff implementation
 * Provides clear documentation and example implementations
 */
export class ClientBackoffGuidance {
  /**
   * Generate backoff documentation for clients
   */
  generateBackoffDocumentation(): BackoffDocumentation {
    return {
      overview: 'This API uses standard HTTP 429 Too Many Requests responses with Retry-After headers',
      implementation: {
        basic: this.getBasicBackoffExample(),
        exponential: this.getExponentialBackoffExample(),
        jitter: this.getJitterBackoffExample()
      },
      bestPractices: this.getBestPractices(),
      commonMistakes: this.getCommonMistakes(),
      testScenarios: this.getTestScenarios()
    };
  }

  private getBasicBackoffExample(): string {
    return `
/**
 * Safe integer parsing helper
 */
function safeParseInt(value: any, radix: number = 10): number {
  if (typeof value === 'string' && /^\d+$/.test(value)) {
    return parseInt(value, radix);
  }
  return 0;
}

// Basic backoff implementation (honors Retry-After header)
async function makeRequestWithBackoff(url, options = {}) {
  const maxRetries = 5;
  let retryCount = 0;
  
  while (retryCount <= maxRetries) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const retryAfter = safeParseInt(response.headers.get('Retry-After'), 10);
      
      if (retryAfter > 0) {
        console.log(\`Rate limited. Retrying after \${retryAfter} seconds...\`);
        await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
        retryCount++;
        continue;
      }
    }
    
    if (response.ok) {
      return response;
    }
    
    throw new Error(\`Request failed: \${response.status}\`);
  }
  
  throw new Error('Max retries exceeded');
}`;
  }

  private getExponentialBackoffExample(): string {
    return `
// Exponential backoff with Retry-After override
async function makeRequestWithExponentialBackoff(url, options = {}) {
  const maxRetries = 5;
  const baseDelay = 1000; // 1 second
  let retryCount = 0;
  
  while (retryCount <= maxRetries) {
    const response = await fetch(url, options);
    
    if (response.status === 429) {
      const retryAfter = safeParseInt(response.headers.get('Retry-After'), 10);
      let delay;
      
      if (retryAfter > 0) {
        // Honor server's Retry-After if provided
        delay = retryAfter * 1000;
      } else {
        // Use exponential backoff
        delay = baseDelay * Math.pow(2, retryCount);
      }
      
      // Add jitter to prevent thundering herd
      const jitter = Math.random() * 0.1 * delay;
      delay = delay + jitter;
      
      console.log(\`Rate limited. Retrying after \${Math.round(delay / 1000)} seconds...\`);
      await new Promise(resolve => setTimeout(resolve, delay));
      retryCount++;
      continue;
    }
    
    if (response.ok) {
      return response;
    }
    
    throw new Error(\`Request failed: \${response.status}\`);
  }
  
  throw new Error('Max retries exceeded');
}`;
  }

  private getBestPractices(): string[] {
    return [
      'Always honor the Retry-After header when provided by the server',
      'Implement exponential backoff with jitter to prevent thundering herd',
      'Set a maximum retry limit to prevent infinite loops',
      'Use different backoff strategies for different error types',
      'Log retry attempts for debugging purposes',
      'Consider circuit breakers for severe failures',
      'Monitor retry rates to detect client-side issues',
      'Use async/await or promises for clean retry logic'
    ];
  }

  private getCommonMistakes(): string[] {
    return [
      'Ignoring Retry-After header and using fixed delays',
      'Not implementing jitter, causing thundering herd',
      'Setting retry limits too low, causing unnecessary failures',
      'Not handling different types of 429 responses appropriately',
      'Implementing backoff on the client side but not on the server side',
      'Using the same backoff strategy for all types of errors',
      'Not logging retry attempts, making debugging difficult'
    ];
  }

  private getTestScenarios(): TestScenario[] {
    return [
      {
        name: 'Basic Rate Limiting',
        description: 'Server returns 429 with Retry-After: 5',
        expectedBehavior: 'Client waits exactly 5 seconds before retrying'
      },
      {
        name: 'Exponential Backoff',
        description: 'Server returns 429 without Retry-After header',
        expectedBehavior: 'Client uses exponential backoff: 1s, 2s, 4s, 8s, 16s'
      },
      {
        name: 'Mixed Responses',
        description: 'Server alternates between 200 and 429 responses',
        expectedBehavior: 'Client retries only on 429, succeeds on 200'
      },
      {
        name: 'Max Retries',
        description: 'Server returns 429 for 6 consecutive requests',
        expectedBehavior: 'Client retries 5 times then gives up gracefully'
      }
    ];
  }
}
```

### 5. Rule Brittleness

#### Risk Description
Hardcoded rate limit rules may be too rigid, causing either over-protection (blocking legitimate users) or under-protection (allowing abuse).

#### Mitigation Strategy: Configurable and Observable Rules
```typescript
/**
 * Dynamic rule management system
 * Makes limits per-tier config, observable, and hot-reloadable
 */
export class DynamicRuleManager {
  private readonly rules: Map<string, RateLimitRule> = new Map();
  private readonly ruleHistory: RuleHistoryEntry[] = [];
  private readonly config: RuleManagerConfig;

  constructor(config: RuleManagerConfig) {
    this.config = config;
    this.loadDefaultRules();
    
    // Start nightly fairness audit
    this.startNightlyAudit();
  }

  /**
   * Update rate limit rule dynamically
   */
  async updateRule(
    ruleId: string,
    updates: Partial<RateLimitRule>,
    reason: string
  ): Promise<void> {
    const existingRule = this.rules.get(ruleId);
    if (!existingRule) {
      // Don't leak rule ID in error message
      throw new Error('Rule not found');
    }

    const oldRule = { ...existingRule };
    const newRule = { ...existingRule, ...updates, updatedAt: Date.now() };

    // Validate new rule
    this.validateRule(newRule);

    // Record history
    this.ruleHistory.push({
      ruleId,
      oldRule,
      newRule,
      reason,
      timestamp: Date.now(),
      updatedBy: 'system'
    });

    // Apply new rule
    this.rules.set(ruleId, newRule);

    // Notify rule change
    this.notifyRuleChange(ruleId, oldRule, newRule, reason);

    this.emit('rule_updated', { ruleId, reason });
  }

  /**
   * Get current rules with metadata
   */
  getRules(): RuleWithMetadata[] {
    return Array.from(this.rules.entries()).map(([id, rule]) => ({
      id,
      rule,
      metadata: this.getRuleMetadata(id)
    }));
  }

  /**
   * Get rule effectiveness metrics
   */
  getRuleEffectiveness(ruleId: string): RuleEffectiveness {
    const rule = this.rules.get(ruleId);
    if (!rule) {
      // Don't leak rule ID in error message
      throw new Error('Rule not found');
    }

    // Calculate effectiveness based on recent history
    const recentHistory = this.ruleHistory
      .filter(entry => entry.ruleId === ruleId)
      .filter(entry => Date.now() - entry.timestamp < 7 * 24 * 60 * 60 * 1000); // Last 7 days

    return {
      ruleId,
      changeFrequency: recentHistory.length,
      lastChange: recentHistory.length > 0 ? recentHistory[recentHistory.length - 1].timestamp : 0,
      stability: this.calculateStability(recentHistory),
      recommendations: this.generateRuleRecommendations(rule, recentHistory)
    };
  }

  /**
   * Hot reload rules from external source
   */
  async hotReloadRules(): Promise<void> {
    try {
      const externalRules = await this.loadExternalRules();
      
      for (const [ruleId, rule] of Object.entries(externalRules)) {
        if (this.rules.has(ruleId)) {
          const existingRule = this.rules.get(ruleId)!;
          
          // Check if rule has changed
          if (this.hasRuleChanged(existingRule, rule)) {
            await this.updateRule(ruleId, rule, 'Hot reload from external source');
          }
        }
      }
      
      this.emit('rules_reloaded', { success: true });
    } catch (error) {
      this.emit('reload_error', { error });
    }
  }

  private loadDefaultRules(): void {
    const defaultRules: RateLimitRule[] = [
      {
        id: 'starter_tier',
        tier: 'starter',
        steadyRps: 300,
        burstTokens: 1200,
        weight: 1.0,
        priority: 1,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'growth_tier',
        tier: 'growth',
        steadyRps: 360,
        burstTokens: 1440,
        weight: 1.2,
        priority: 2,
        createdAt: Date.now(),
        updatedAt: Date.now()
      },
      {
        id: 'scale_tier',
        tier: 'scale',
        steadyRps: 600,
        burstTokens: 2400,
        weight: 2.0,
        priority: 3,
        createdAt: Date.now(),
        updatedAt: Date.now()
      }
    ];

    defaultRules.forEach(rule => this.rules.set(rule.id, rule));
  }

  private startNightlyAudit(): void {
    // Schedule audit to run at 2 AM every night
    const scheduleAudit = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(2, 0, 0, 0);
      
      const delayUntil2AM = tomorrow.getTime() - now.getTime();
      
      setTimeout(() => {
        this.runNightlyAudit();
        scheduleAudit(); // Schedule next audit
      }, delayUntil2AM);
    };
    
    scheduleAudit();
  }

  private async runNightlyAudit(): Promise<void> {
    this.emit('audit_started', { type: 'nightly_fairness' });
    
    const auditResults: NightlyAuditResults = {
      timestamp: Date.now(),
      rulesAnalyzed: this.rules.size,
      issuesFound: [],
      recommendations: []
    };

    for (const [ruleId, rule] of this.rules.entries()) {
      const issues = this.auditRule(rule);
      auditResults.issuesFound.push(...issues);
    }

    // Generate recommendations based on audit
    auditResults.recommendations = this.generateAuditRecommendations(auditResults.issuesFound);

    // Store audit results
    this.storeAuditResults(auditResults);

    // Send notifications if critical issues found
    if (auditResults.issuesFound.some(issue => issue.severity === 'critical')) {
      this.sendAuditNotifications(auditResults);
    }

    this.emit('audit_completed', { issuesCount: auditResults.issuesFound.length });
  }

  private auditRule(rule: RateLimitRule): RuleAuditIssue[] {
    const issues: RuleAuditIssue[] = [];

    // Check for reasonable limits
    if (rule.steadyRps < 10) {
      issues.push({
        ruleId: rule.id,
        severity: 'warning',
        description: 'Very low steady RPS may impact user experience',
        recommendation: 'Consider increasing steady RPS to at least 10'
      });
    }

    if (rule.steadyRps > 10000) {
      issues.push({
        ruleId: rule.id,
        severity: 'warning',
        description: 'Very high steady RPS may risk system overload',
        recommendation: 'Consider implementing additional safeguards'
      });
    }

    // Check burst-to-steady ratio
    const ratio = rule.burstTokens / rule.steadyRps;
    if (ratio > 10) {
      issues.push({
        ruleId: rule.id,
        severity: 'info',
        description: 'High burst-to-steady ratio',
        recommendation: 'Consider reducing burst tokens for better stability'
      });
    }

    return issues;
  }

  private validateRule(rule: RateLimitRule): void {
    if (rule.steadyRps < 1 || rule.steadyRps > 100000) {
      throw new Error('Steady RPS must be between 1 and 100000');
    }

    if (rule.burstTokens < 1 || rule.burstTokens > 1000000) {
      throw new Error('Burst tokens must be between 1 and 1000000');
    }

    if (rule.weight < 0.1 || rule.weight > 10) {
      throw new Error('Weight must be between 0.1 and 10');
    }
  }

  private notifyRuleChange(ruleId: string, oldRule: RateLimitRule, newRule: RateLimitRule, reason: string): void {
    // Send to monitoring systems
    this.emit('rule_notification', { ruleId, reason });
  }

  private calculateStability(history: RuleHistoryEntry[]): number {
    if (history.length < 2) {
      return 1.0; // Very stable
    }

    // Calculate how often rules change
    const timeSpan = history[history.length - 1].timestamp - history[0].timestamp;
    const changeFrequency = history.length / (timeSpan / (24 * 60 * 60 * 1000)); // Changes per day

    // Lower change frequency = higher stability
    return Math.max(0, 1 - (changeFrequency / 10)); // Normalize to 0-1
  }

  private generateRuleRecommendations(rule: RateLimitRule, history: RuleHistoryEntry[]): string[] {
    const recommendations: string[] = [];

    if (history.length > 5) {
      recommendations.push('Rule changes frequently - consider more stable configuration');
    }

    if (rule.burstTokens / rule.steadyRps > 8) {
      recommendations.push('High burst ratio may cause system instability');
    }

    return recommendations;
  }

  private getRuleMetadata(ruleId: string): RuleMetadata {
    const history = this.ruleHistory.filter(entry => entry.ruleId === ruleId);
    
    return {
      changeCount: history.length,
      lastChanged: history.length > 0 ? history[history.length - 1].timestamp : 0,
      created: this.rules.get(ruleId)?.createdAt || 0,
      stability: this.calculateStability(history)
    };
  }

  private async loadExternalRules(): Promise<Record<string, Partial<RateLimitRule>>> {
    // In real implementation, load from Redis, file, or API
    return {};
  }

  private hasRuleChanged(existing: RateLimitRule, updated: Partial<RateLimitRule>): boolean {
    return JSON.stringify(existing) !== JSON.stringify({ ...existing, ...updated });
  }

  private generateAuditRecommendations(issues: RuleAuditIssue[]): string[] {
    return issues.map(issue => issue.recommendation);
  }

  private storeAuditResults(results: NightlyAuditResults): void {
    // Store audit results for historical analysis
  }

  private sendAuditNotifications(results: NightlyAuditResults): void {
    // Send notifications for critical issues
  }
}

// Type definitions for risk mitigation components
export interface BreakingNewsEvent {
  title: string;
  description: string;
  severity: EventSeverity;
  durationMinutes: number;
  expectedTraffic: number;
}

export type EventSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ActiveEvent {
  tenantId: string;
  eventId: string;
  eventDetails: BreakingNewsEvent;
  activatedAt: number;
  expiresAt: number;
  elevatedLimits: ElevatedLimits;
  bypassGlobalPool: boolean;
}

export interface ElevatedLimits {
  steadyRps: number;
  burstTokens: number;
  priority: number;
}

export interface EventModeResult {
  eventId: string;
  eventToken: string;
  expiresAt: number;
  elevatedLimits: ElevatedLimits;
  bypassGlobalPool: boolean;
}

export interface EventModeConfig {
  maxDurationMinutes: number;
  maxEventsPerTenant: number;
  requireApproval: boolean;
}

export interface BreakingNewsAsset {
  hash: string;
  policyId?: string;
  priority: number;
  expectedRequests?: number;
}

export interface ScrapingAnalysis {
  isSuspicious: boolean;
  riskScore: number;
  reasons: string[];
  recommendedAction: 'allow' | 'rate_limit_normal' | 'rate_limit_strict' | 'block';
}

export interface PatternAnalysis {
  riskScore: number;
  reasons: string[];
}

export interface AntiScrapingConfig {
  lowRiskThreshold: number;
  mediumRiskThreshold: number;
  highRiskThreshold: number;
  maxTenantRequestsPerMinute: number;
  maxAnonymousRequestsPerMinute: number;
  maxUserAgentsPerIp: number;
}

export interface RequestRecord {
  timestamp: number;
  path: string;
  method: string;
  userAgent: string;
}

export interface TwoStageDecision {
  allowed: boolean;
  stage: 'local' | 'global' | 'circuit_breaker' | 'passed' | 'error_fallback';
  reason: string;
  retryAfter: number;
  processingTime: number;
}

export interface TwoStageConfig {
  local: LocalLimiterConfig;
  global: GlobalLimiterConfig;
  circuitBreaker: CircuitBreakerConfig;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  successThreshold: number;
  openTimeoutMs: number;
}

export type CircuitBreakerState = 'closed' | 'open' | 'half_open';

export interface BackendError {
  type: 'overload' | 'timeout' | 'error';
  message: string;
}

export interface BackoffDocumentation {
  overview: string;
  implementation: {
    basic: string;
    exponential: string;
    jitter: string;
  };
  bestPractices: string[];
  commonMistakes: string[];
  testScenarios: TestScenario[];
}

export interface TestScenario {
  name: string;
  description: string;
  expectedBehavior: string;
}

export interface RateLimitRule {
  id: string;
  tier: string;
  steadyRps: number;
  burstTokens: number;
  weight: number;
  priority: number;
  createdAt: number;
  updatedAt: number;
}

export interface RuleWithMetadata {
  id: string;
  rule: RateLimitRule;
  metadata: RuleMetadata;
}

export interface RuleMetadata {
  changeCount: number;
  lastChanged: number;
  created: number;
  stability: number;
}

export interface RuleHistoryEntry {
  ruleId: string;
  oldRule: RateLimitRule;
  newRule: RateLimitRule;
  reason: string;
  timestamp: number;
  updatedBy: string;
}

export interface RuleEffectiveness {
  ruleId: string;
  changeFrequency: number;
  lastChange: number;
  stability: number;
  recommendations: string[];
}

export interface RuleAuditIssue {
  ruleId: string;
  severity: 'info' | 'warning' | 'critical';
  description: string;
  recommendation: string;
}

export interface NightlyAuditResults {
  timestamp: number;
  rulesAnalyzed: number;
  issuesFound: RuleAuditIssue[];
  recommendations: string[];
}

export interface RuleManagerConfig {
  enableHotReload: boolean;
  auditSchedule: string; // cron expression
  maxRuleHistory: number;
}
```
