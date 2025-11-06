# Phase 53 — Soft→Hard Fail Ladder Implementation

## Standards-Compliant Rate Limiting Responses

### Fail Ladder Controller
```typescript
import { EventEmitter } from 'events';
import { Redis } from 'ioredis';

/**
 * Soft→hard fail ladder with RFC 9110 compliant responses
 * Implements 429 + Retry-After → temporary read-only mode
 */
export class FailLadderController extends EventEmitter {
  private readonly redis: Redis;
  private readonly config: FailLadderConfig;
  private readonly tenantModes: Map<string, TenantMode> = new Map();

  constructor(redis: Redis, config: FailLadderConfig) {
    super();
    this.redis = redis;
    this.config = config;
    
    // Load existing tenant modes
    this.loadTenantModes();
    
    // Cleanup expired modes every minute
    setInterval(() => this.cleanupExpiredModes(), 60000);
  }

  /**
   * Handle rate limit decision and apply fail ladder
   * Returns appropriate HTTP response
   */
  async handleRateLimit(
    tenantId: string,
    decision: RateLimitDecision,
    request: RateLimitRequest
  ): Promise<RateLimitResponse> {
    const tenantMode = this.getTenantMode(tenantId);
    
    // Check if tenant is in read-only mode
    if (tenantMode === 'read_only' && !this.isReadOnlyAllowed(request)) {
      return this.buildReadOnlyResponse(tenantId);
    }

    // Soft fail: 429 with Retry-After
    if (!decision.allowed) {
      return this.buildSoftFailResponse(tenantId, decision);
    }

    // Request allowed
    return this.buildSuccessResponse(decision);
  }

  /**
   * Escalate tenant to read-only mode for sustained abuse
   */
  async escalateToReadOnly(
    tenantId: string,
    reason: AbuseReason,
    durationMinutes: number = this.config.defaultReadOnlyDuration
  ): Promise<void> {
    // Validate tenant ID to prevent Redis key injection
    if (!tenantId || typeof tenantId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      throw new Error('Invalid tenant ID format');
    }
    
    // Validate duration to prevent excessive TTL
    if (durationMinutes < 1 || durationMinutes > 1440) { // Max 24 hours
      throw new Error('Duration must be between 1 and 1440 minutes');
    }
    
    const expiresAt = Date.now() + (durationMinutes * 60 * 1000);
    
    // Store in Redis for distributed access
    await this.redis.setex(
      `tenant_mode:${tenantId}`,
      durationMinutes * 60,
      JSON.stringify({
        mode: 'read_only',
        reason,
        escalatedAt: Date.now(),
        expiresAt
      })
    );

    // Update local cache
    this.tenantModes.set(tenantId, {
      mode: 'read_only',
      reason,
      escalatedAt: Date.now(),
      expiresAt
    });

    this.emit('tenant_escalated', { tenantId, reason, durationMinutes });
  }

  /**
   * Remove tenant from read-only mode
   */
  async deescalateFromReadOnly(tenantId: string): Promise<void> {
    // Validate tenant ID to prevent Redis key injection
    if (!tenantId || typeof tenantId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
      throw new Error('Invalid tenant ID format');
    }
    
    await this.redis.del(`tenant_mode:${tenantId}`);
    this.tenantModes.delete(tenantId);
    
    this.emit('tenant_deescalated', { tenantId });
  }

  /**
   * Build soft fail response (429 with Retry-After)
   * RFC 9110 compliant
   */
  private buildSoftFailResponse(
    tenantId: string,
    decision: RateLimitDecision
  ): RateLimitResponse {
    const retryAfter = Math.max(decision.retryAfter, this.config.minRetryAfter);
    
    return {
      statusCode: 429,
      statusText: 'Too Many Requests',
      headers: {
        'Content-Type': 'application/problem+json',
        'Retry-After': retryAfter.toString(),
        'RateLimit-Limit': `${this.config.defaultRateLimit}, burst=${this.config.defaultBurst}, policy=tenant`,
        'RateLimit-Remaining': decision.remaining.toString(),
        'RateLimit-Reset': Math.ceil(decision.resetTime / 1000).toString()
      },
      body: {
        type: 'about:blank',
        title: 'Rate limited',
        detail: this.getRateLimitDetail(decision.reason),
        tenant: tenantId,
        retry_after: retryAfter
      }
    };
  }

  /**
   * Build read-only mode response
   */
  private buildReadOnlyResponse(tenantId: string): RateLimitResponse {
    const tenantMode = this.tenantModes.get(tenantId);
    if (!tenantMode || tenantMode.expiresAt <= Date.now()) {
      // Mode expired, treat as normal
      return this.buildSuccessResponse({ allowed: true, remaining: 0, resetTime: 0, retryAfter: 0, reason: 'allowed' });
    }
    
    const retryAfter = Math.ceil((tenantMode.expiresAt - Date.now()) / 1000);
    
    return {
      statusCode: 429,
      statusText: 'Too Many Requests',
      headers: {
        'Content-Type': 'application/problem+json',
        'Retry-After': retryAfter.toString(),
        'RateLimit-Limit': '0, burst=0, policy=read_only',
        'RateLimit-Remaining': '0',
        'RateLimit-Reset': retryAfter.toString(),
        'X-Tenant-Mode': 'read_only'
      },
      body: {
        type: 'about:blank',
        title: 'Tenant in read-only mode',
        detail: `Tenant temporarily restricted to read-only operations due to: ${tenantMode?.reason}`,
        tenant: tenantId,
        retry_after: retryAfter,
        mode: 'read_only',
        reason: tenantMode?.reason
      }
    };
  }

  /**
   * Build success response with rate limit headers
   */
  private buildSuccessResponse(decision: RateLimitDecision): RateLimitResponse {
    return {
      statusCode: 200,
      statusText: 'OK',
      headers: {
        'RateLimit-Limit': `${this.config.defaultRateLimit}, burst=${this.config.defaultBurst}, policy=tenant`,
        'RateLimit-Remaining': decision.remaining.toString(),
        'RateLimit-Reset': Math.ceil(decision.resetTime / 1000).toString()
      }
    };
  }

  private getRateLimitDetail(reason: string): string {
    switch (reason) {
      case 'local_limit_exceeded':
        return 'Local rate limit exceeded';
      case 'global_limit_exceeded':
        return 'Global rate limit exceeded';
      case 'global_pool_exhausted':
        return 'Global burst pool exhausted';
      case 'daily_spend_cap':
        return 'Daily spend cap exceeded';
      default:
        return 'Tenant budget exhausted';
    }
  }

  private getTenantMode(tenantId: string): TenantModeValue {
    const cached = this.tenantModes.get(tenantId);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.mode;
    }
    
    return 'normal';
  }

  private isReadOnlyAllowed(request: RateLimitRequest): boolean {
    // Read-only mode allows verify requests but not sign operations
    return request.method === 'GET' && request.path.includes('/verify');
  }

  private async loadTenantModes(): Promise<void> {
    try {
      // Use SCAN instead of KEYS for production safety
      let cursor = '0';
      do {
        const result = await this.redis.scan(cursor, 'MATCH', 'tenant_mode:*', 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];
        
        for (const key of keys) {
          const tenantId = key.replace('tenant_mode:', '');
          const data = await this.redis.get(key);
          
          if (data) {
            try {
              const modeData = JSON.parse(data) as TenantMode;
              if (modeData && modeData.expiresAt && modeData.expiresAt > Date.now()) {
                this.tenantModes.set(tenantId, modeData);
              }
            } catch (error) {
              this.emit('parse_error', { key, error });
            }
          }
        }
      } while (cursor !== '0');
    } catch (error) {
      this.emit('load_error', { error });
    }
  }

  private async cleanupExpiredModes(): Promise<void> {
    const now = Date.now();
    
    for (const [tenantId, mode] of this.tenantModes.entries()) {
      if (mode.expiresAt <= now) {
        this.tenantModes.delete(tenantId);
        await this.redis.del(`tenant_mode:${tenantId}`);
      }
    }
  }

  /**
   * Get current tenant modes for monitoring
   */
  getTenantModes(): Record<string, TenantMode> {
    const result: Record<string, TenantMode> = {};
    
    for (const [tenantId, mode] of this.tenantModes.entries()) {
      result[tenantId] = mode;
    }
    
    return result;
  }
}

/**
 * Abuse detection for automatic escalation
 */
export class AbuseDetector {
  private readonly failLadder: FailLadderController;
  private readonly config: AbuseDetectionConfig;
  private readonly tenantMetrics: Map<string, TenantMetrics> = new Map();

  constructor(
    failLadder: FailLadderController,
    config: AbuseDetectionConfig
  ) {
    this.failLadder = failLadder;
    this.config = config;
    
    // Check for abuse every minute
    setInterval(() => this.checkForAbuse(), 60000);
  }

  /**
   * Record request for abuse detection
   */
  recordRequest(tenantId: string, request: RateLimitRequest): void {
    let metrics = this.tenantMetrics.get(tenantId);
    if (!metrics) {
      metrics = new TenantMetrics();
      this.tenantMetrics.set(tenantId, metrics);
    }
    
    metrics.recordRequest(request);
  }

  private checkForAbuse(): void {
    const now = Date.now();
    const windowStart = now - this.config.abuseWindowMs;
    
    for (const [tenantId, metrics] of this.tenantMetrics.entries()) {
      const recentRequests = metrics.getRequestsInWindow(windowStart, now);
      
      // Check for various abuse patterns
      if (this.detectRateAbuse(recentRequests)) {
        this.failLadder.escalateToReadOnly(tenantId, 'excessive_rate');
      }
      
      if (this.detectPatternAbuse(recentRequests)) {
        this.failLadder.escalateToReadOnly(tenantId, 'abusive_pattern');
      }
      
      if (this.detectSpendAbuse(tenantId)) {
        this.failLadder.escalateToReadOnly(tenantId, 'daily_spend_cap');
      }
    }
  }

  private detectRateAbuse(requests: RateLimitRequest[]): boolean {
    const requestsPerMinute = requests.length / (this.config.abuseWindowMs / 60000);
    return requestsPerMinute > this.config.maxRequestsPerMinute;
  }

  private detectPatternAbuse(requests: RateLimitRequest[]): boolean {
    // Check for suspicious patterns like rapid sign requests
    const signRequests = requests.filter(r => r.method === 'POST' && r.path.includes('/sign'));
    const signRate = signRequests.length / (this.config.abuseWindowMs / 60000);
    
    return signRate > this.config.maxSignRequestsPerMinute;
  }

  private detectSpendAbuse(tenantId: string): boolean {
    // In a real implementation, this would check daily spend against cap
    // For now, return false
    return false;
  }
}

/**
 * Tenant metrics for abuse detection
 */
class TenantMetrics {
  private requests: RateLimitRequest[] = [];

  recordRequest(request: RateLimitRequest): void {
    this.requests.push({
      ...request,
      timestamp: Date.now()
    });
    
    // Keep only last hour of requests
    const oneHourAgo = Date.now() - 3600000;
    this.requests = this.requests.filter(r => r.timestamp > oneHourAgo);
  }

  getRequestsInWindow(start: number, end: number): RateLimitRequest[] {
    return this.requests.filter(r => r.timestamp >= start && r.timestamp <= end);
  }
}

// Type definitions
export interface RateLimitResponse {
  statusCode: number;
  statusText: string;
  headers: Record<string, string>;
  body?: any;
}

export interface RateLimitRequest {
  method: string;
  path: string;
  tenantId: string;
  timestamp?: number;
}

export interface FailLadderConfig {
  defaultRateLimit: number;
  defaultBurst: number;
  minRetryAfter: number;
  defaultReadOnlyDuration: number;
}

export interface AbuseDetectionConfig {
  abuseWindowMs: number;
  maxRequestsPerMinute: number;
  maxSignRequestsPerMinute: number;
}

export interface TenantMode {
  mode: TenantModeValue;
  reason: AbuseReason;
  escalatedAt: number;
  expiresAt: number;
}

export type TenantModeValue = 'normal' | 'read_only';
export type AbuseReason = 'excessive_rate' | 'abusive_pattern' | 'daily_spend_cap';

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter: number;
  reason: string;
}

// Default configurations
export const DEFAULT_FAIL_LADDER_CONFIG: FailLadderConfig = {
  defaultRateLimit: 300,
  defaultBurst: 1200,
  minRetryAfter: 1,
  defaultReadOnlyDuration: 30 // 30 minutes
};

export const DEFAULT_ABUSE_DETECTION_CONFIG: AbuseDetectionConfig = {
  abuseWindowMs: 300000, // 5 minutes
  maxRequestsPerMinute: 1000,
  maxSignRequestsPerMinute: 100
};
```

### HTTP Response Builder
```typescript
/**
 * RFC 9110 compliant HTTP response builder
 */
export class HttpResponseBuilder {
  /**
   * Build standardized rate limit response
   */
  static buildRateLimitResponse(
    decision: RateLimitDecision,
    tenantId: string,
    config: RateLimitConfig
  ): Response {
    const headers = this.buildRateLimitHeaders(decision, config);
    
    if (!decision.allowed) {
      return new Response(
        JSON.stringify({
          type: 'about:blank',
          title: 'Rate limited',
          detail: this.getDetailMessage(decision.reason),
          tenant: tenantId,
          retry_after: decision.retryAfter
        }),
        {
          status: 429,
          statusText: 'Too Many Requests',
          headers
        }
      );
    }
    
    return new Response(null, {
      status: 200,
      statusText: 'OK',
      headers
    });
  }

  /**
   * Build cacheable verify response with RFC 9111 headers
   */
  static buildVerifyCacheResponse(
    manifestHash: string,
    ttl: number,
    staleWhileRevalidate: number
  ): Response {
    const etag = `"manifest:sha256:${manifestHash}"`;
    
    return new Response(
      JSON.stringify({ verified: true, manifestHash }),
      {
        status: 200,
        statusText: 'OK',
        headers: {
          'Content-Type': 'application/json',
          'ETag': etag,
          'Cache-Control': `public, max-age=${ttl}, stale-while-revalidate=${staleWhileRevalidate}, must-revalidate`,
          'Vary': 'Accept, Accept-Encoding'
        }
      }
    );
  }

  /**
   * Handle conditional request with If-None-Match
   */
  static handleConditionalRequest(
    request: Request,
    etag: string
  ): Response | null {
    const ifNoneMatch = request.headers.get('If-None-Match');
    
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        statusText: 'Not Modified',
        headers: {
          'ETag': etag,
          'Cache-Control': 'public, max-age=60, stale-while-revalidate=30, must-revalidate'
        }
      });
    }
    
    return null;
  }

  private static buildRateLimitHeaders(
    decision: RateLimitDecision,
    config: RateLimitConfig
  ): Record<string, string> {
    const headers: Record<string, string> = {
      'RateLimit-Limit': `${config.steadyRps}, burst=${config.burstTokens}, policy=tenant`,
      'RateLimit-Remaining': decision.remaining.toString(),
      'RateLimit-Reset': Math.ceil(decision.resetTime / 1000).toString()
    };
    
    if (!decision.allowed && decision.retryAfter > 0) {
      headers['Retry-After'] = decision.retryAfter.toString();
    }
    
    return headers;
  }

  private static getDetailMessage(reason: string): string {
    switch (reason) {
      case 'local_limit_exceeded':
        return 'Local rate limit exceeded. Please retry after the indicated time.';
      case 'global_limit_exceeded':
        return 'Global rate limit exceeded. Please retry after the indicated time.';
      case 'global_pool_exhausted':
        return 'Service temporarily overloaded. Please retry after the indicated time.';
      case 'daily_spend_cap':
        return 'Daily usage limit exceeded. Please retry tomorrow or upgrade your plan.';
      default:
        return 'Rate limit exceeded. Please retry after the indicated time.';
    }
  }
}

/**
 * Client-side exponential backoff implementation
 * Honors RFC 9110 Retry-After header
 */
export class ExponentialBackoffClient {
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;

  constructor(options: BackoffOptions = {}) {
    this.maxRetries = options.maxRetries || 5;
    this.baseDelayMs = options.baseDelayMs || 1000;
    this.maxDelayMs = options.maxDelayMs || 30000;
  }

  /**
   * Execute request with automatic retry on 429
   */
  async executeWithRetry(
    requestFn: () => Promise<Response>,
    context: string = 'api_request'
  ): Promise<Response> {
    let lastResponse: Response | null = null;
    let retryCount = 0;
    
    while (retryCount <= this.maxRetries) {
      try {
        const response = await requestFn();
        
        if (response.status === 429) {
          lastResponse = response;
          const retryAfter = this.parseRetryAfter(response);
          const delay = this.calculateDelay(retryCount, retryAfter);
          
          this.emit('retry_warning', { context, retryCount, maxRetries: this.maxRetries, delay });
          
          await this.sleep(delay);
          retryCount++;
          continue;
        }
        
        return response;
      } catch (error) {
        if (retryCount === this.maxRetries) {
          throw error;
        }
        
        const delay = this.calculateDelay(retryCount);
        this.emit('retry_error', { context, retryCount, maxRetries: this.maxRetries, delay, error });
        
        await this.sleep(delay);
        retryCount++;
      }
    }
    
    return lastResponse || new Response('Max retries exceeded', { status: 503 });
  }

  private parseRetryAfter(response: Response): number {
    const retryAfterHeader = response.headers.get('Retry-After');
    
    if (!retryAfterHeader) {
      return this.baseDelayMs;
    }
    
    const retryAfter = parseInt(retryAfterHeader, 10);
    return isNaN(retryAfter) ? this.baseDelayMs : retryAfter * 1000;
  }

  private calculateDelay(retryCount: number, retryAfter?: number): number {
    if (retryAfter) {
      // Honor server's Retry-After if provided
      return Math.min(retryAfter, this.maxDelayMs);
    }
    
    // Exponential backoff with jitter
    const exponentialDelay = this.baseDelayMs * Math.pow(2, retryCount);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    const delay = exponentialDelay + jitter;
    
    return Math.min(delay, this.maxDelayMs);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

interface BackoffOptions {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
}

interface RateLimitConfig {
  steadyRps: number;
  burstTokens: number;
}
```
