# Phase 53 — HTTP Headers & Responses Implementation

## Standards-Compliant Response Builder

### HTTP Response Builder
```typescript
/**
 * RFC 9110/9111 compliant HTTP response builder
 * Exact implementation of specified headers and responses
 */
export class StandardsCompliantResponseBuilder {
  private readonly config: ResponseConfig;

  constructor(config: ResponseConfig = DEFAULT_RESPONSE_CONFIG) {
    this.config = config;
  }

  /**
   * Build rate limit response (429 Too Many Requests)
   * Copy-exact implementation per specification
   */
  buildRateLimitResponse(
    tenantInfo: TenantInfo | null,
    rateLimitDecision: RateLimitDecision,
    reason: string = 'Tenant budget exhausted'
  ): Response {
    const headers = this.buildRateLimitHeaders(tenantInfo, rateLimitDecision);
    
    const body = {
      type: "about:blank",
      title: "Rate limited",
      detail: reason,
      tenant: tenantInfo?.id || 'anonymous',
      retry_after: rateLimitDecision.retryAfter
    };

    return new Response(JSON.stringify(body), {
      status: 429,
      statusText: 'Too Many Requests',
      headers: {
        'Content-Type': 'application/problem+json',
        ...headers
      }
    });
  }

  /**
   * Build cacheable verify response from relay
   * RFC 9111 compliant with ETag and Cache-Control
   */
  buildVerifyCacheResponse(
    manifestHash: string,
    verifyResult: any,
    cacheConfig: CacheResponseConfig
  ): Response {
    const etag = this.buildManifestETag(manifestHash);
    const cacheControl = this.buildCacheControl(cacheConfig);
    
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'ETag': etag,
      'Cache-Control': cacheControl,
      'Vary': 'Accept, Accept-Encoding, Authorization'
    };

    // Add optional headers
    if (cacheConfig.lastModified) {
      headers['Last-Modified'] = new Date(cacheConfig.lastModified).toUTCString();
    }

    return new Response(JSON.stringify(verifyResult), {
      status: 200,
      statusText: 'OK',
      headers
    });
  }

  /**
   * Handle conditional request with If-None-Match
   * Returns 304 Not Modified if ETag matches
   */
  buildConditionalResponse(
    request: Request,
    etag: string,
    cacheConfig: CacheResponseConfig
  ): Response | null {
    const ifNoneMatch = request.headers.get('if-none-match');
    
    if (ifNoneMatch && ifNoneMatch === etag) {
      return new Response(null, {
        status: 304,
        statusText: 'Not Modified',
        headers: {
          'ETag': etag,
          'Cache-Control': this.buildCacheControl(cacheConfig),
          'Vary': 'Accept, Accept-Encoding, Authorization'
        }
      });
    }

    return null;
  }

  /**
   * Build successful response with rate limit headers
   */
  buildSuccessResponse(
    data: any,
    tenantInfo: TenantInfo | null,
    rateLimitDecision: RateLimitDecision
  ): Response {
    const headers = this.buildRateLimitHeaders(tenantInfo, rateLimitDecision);
    
    return new Response(JSON.stringify(data), {
      status: 200,
      statusText: 'OK',
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    });
  }

  /**
   * Build read-only mode response
   */
  buildReadOnlyResponse(
    tenantInfo: TenantInfo,
    readOnlyDuration: number,
    reason: string = 'Tenant temporarily restricted'
  ): Response {
    const headers = {
      'Content-Type': 'application/problem+json',
      'Retry-After': readOnlyDuration.toString(),
      'RateLimit-Limit': '0, burst=0, policy=read_only',
      'RateLimit-Remaining': '0',
      'RateLimit-Reset': readOnlyDuration.toString(),
      'X-Tenant-': 'read_only'
    };

    const body = {
      type: "about:blank",
      title: "Tenant in read-only mode",
      detail: reason,
      tenant: tenantInfo.id,
      retry_after: readOnlyDuration,
      mode: "read_only",
      reason: reason
    };

    return new Response(JSON.stringify(body), {
      status: 429,
      statusText: 'Too Many Requests',
      headers
    });
  }

  /**
   * Build rate limit headers (copy-exact per specification)
   */
  private buildRateLimitHeaders(
    tenantInfo: TenantInfo | null,
    decision: RateLimitDecision
  ): Record<string, string> {
    const headers: Record<string, string> = {};

    if (tenantInfo) {
      const tierConfig = this.config.tierConfigs[tenantInfo.tier];
      
      headers['RateLimit-Limit'] = `${tierConfig.ratePerTenant}, burst=${tierConfig.burst}, policy=tenant`;
      headers['RateLimit-Remaining'] = decision.remaining.toString();
      headers['RateLimit-Reset'] = Math.ceil(decision.resetTime / 1000).toString();
    } else {
      // Anonymous requests
      headers['RateLimit-Limit'] = '0, burst=0, policy=anonymous';
      headers['RateLimit-Remaining'] = '0';
      headers['RateLimit-Reset'] = '0';
    }

    // Add Retry-After for throttled requests
    if (decision.retryAfter > 0) {
      headers['Retry-After'] = decision.retryAfter.toString();
    }

    return headers;
  }

  /**
   * Build ETag for manifest (copy-exact per specification)
   */
  private buildManifestETag(manifestHash: string): string {
    return `"manifest:sha256:${manifestHash.substring(0, 16)}"`;
  }

  /**
   * Build Cache-Control header (copy-exact per specification)
   */
  private buildCacheControl(config: CacheResponseConfig): string {
    const directives = [
      'public',
      `max-age=${config.maxAge}`,
      `stale-while-revalidate=${config.staleWhileRevalidate}`,
      'must-revalidate'
    ];

    if (config.noStore) {
      directives.unshift('no-store');
    }

    if (config.noCache) {
      directives.unshift('no-cache');
    }

    return directives.join(', ');
  }

  /**
   * Parse and validate incoming rate limit headers
   */
  parseRateLimitHeaders(headers: Record<string, string>): ParsedRateLimitHeaders {
    const result: ParsedRateLimitHeaders = {
      limit: null,
      remaining: null,
      reset: null,
      retryAfter: null,
      policy: null
    };

    // Parse RateLimit-Limit: "300, burst=1200, policy=tenant"
    const limitHeader = headers['ratelimit-limit'];
    if (limitHeader) {
      const limitMatch = limitHeader.match(/^(\d+), burst=(\d+), policy=((.+)$/);
      if (limitMatch) {
        result.limit = parseInt(limitMatch[1], 10);
        result.burst = parseInt(limitMatch[2], 10);
        result.policy = limitMatch[3];
      }
    }

    // Parse RateLimit-Remaining
    const remainingHeader = headers['ratelimit-remaining'];
    if (remainingHeader) {
      result.remaining = parseInt(remainingHeader, 10);
    }

    // Parse RateLimit-Reset
    const resetHeader = headers['ratelimit-reset'];
    if (resetHeader) {
      result.reset = parseInt(resetHeader, 10);
    }

    // Parse Retry-After
    const retryAfterHeader = headers['retry-after'];
    if (retryAfterHeader) {
      result.retryAfter = parseInt(retryAfterHeader, 10);
    }

    return result;
  }

  /**
   * Validate response headers for compliance
   */
  validateResponseHeaders(headers: Headers): ComplianceValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check Content-Type for error responses
    const contentType = headers.get('content-type');
    if (contentType && !contentType.includes('application/problem+json') && 
        !contentType.includes('application/json')) {
      warnings.push('Content-Type should be application/problem+json for error responses');
    }

    // Check RateLimit headers format
    const rateLimitLimit = headers.get('ratelimit-limit');
    if (rateLimitLimit && !rateLimitLimit.match(/^\d+, burst=\d+, policy=\w+$/)) {
      errors.push('RateLimit-Limit header format is invalid');
    }

    // Check Retry-After format
    const retryAfter = headers.get('retry-after');
    if (retryAfter && !retryAfter.match(/^\d+$/)) {
      errors.push('Retry-After header must be a number (seconds)');
    }

    // Check ETag format
    const etag = headers.get('etag');
    if (etag && !etag.match(/^".*"$/)) {
      warnings.push('ETag should be quoted string');
    }

    // Check Cache-Control format
    const cacheControl = headers.get('cache-control');
    if (cacheControl && !cacheControl.includes('max-age')) {
      warnings.push('Cache-Control should include max-age directive');
    }

    return {
      compliant: errors.length === 0,
      errors,
      warnings
    };
  }
}

/**
 * Edge middleware for response processing
 */
export class EdgeResponseMiddleware {
  private readonly responseBuilder: StandardsCompliantResponseBuilder;
  private readonly metrics: ResponseMetrics;

  constructor(responseBuilder: StandardsCompliantResponseBuilder) {
    this.responseBuilder = responseBuilder;
    this.metrics = new ResponseMetrics();
  }

  /**
   * Process response and add standard headers
   */
  async processResponse(
    request: Request,
    response: Response,
    context: RequestContext
  ): Promise<Response> {
    const startTime = Date.now();

    try {
      // Add standard response headers
      const processedResponse = this.addStandardHeaders(response, context);
      
      // Validate compliance
      const validation = this.responseBuilder.validateResponseHeaders(processedResponse.headers);
      
      if (!validation.compliant) {
        this.emit('compliance_warning', { errors: validation.errors });
        this.metrics.recordComplianceIssue(validation.errors);
      }

      // Log response metrics
      this.metrics.recordResponse({
        statusCode: processedResponse.status,
        hasRateLimitHeaders: !!processedResponse.headers.get('ratelimit-limit'),
        hasCacheHeaders: !!processedResponse.headers.get('cache-control'),
        processingTime: Date.now() - startTime
      });

      return processedResponse;

    } catch (error) {
      this.emit('processing_error', { error });
      return this.buildErrorResponse(error);
    }
  }

  private addStandardHeaders(response: Response, context: RequestContext): Response {
    const newHeaders = new Headers(response.headers);

    // Add security headers
    newHeaders.set('X-Content-Type-Options', 'nosniff');
    newHeaders.set('X-Frame-Options', 'DENY');
    newHeaders.set('X-XSS-Protection', '1; mode=block');

    // Add timing headers
    newHeaders.set('X-Response-Time', `${context.processingTime}ms`);
    newHeaders.set('X-Request-ID', context.requestId);

    // Add version header
    newHeaders.set('X-API-Version', '1.0.0');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders
    });
  }

  private buildErrorResponse(error: Error): Response {
    return new Response(
      JSON.stringify({
        type: 'about:blank',
        title: 'Internal Server Error',
        detail: 'An error occurred while processing the request'
      }),
      {
        status: 500,
        statusText: 'Internal Server Error',
        headers: {
          'Content-Type': 'application/problem+json',
          'X-Error': 'true'
        }
      }
    );
  }

  /**
   * Get response metrics
   */
  getMetrics(): ResponseMetricsSnapshot {
    return this.metrics.getSnapshot();
  }
}

/**
 * Response metrics collector
 */
class ResponseMetrics {
  private totalResponses = 0;
  private rateLimitedResponses = 0;
  private cachedResponses = 0;
  private complianceIssues = 0;
  private averageProcessingTime = 0;
  private statusCodes: Record<number, number> = {};

  recordResponse(metrics: ResponseMetricsData): void {
    this.totalResponses++;
    
    if (metrics.statusCode === 429) {
      this.rateLimitedResponses++;
    }
    
    if (metrics.hasCacheHeaders) {
      this.cachedResponses++;
    }
    
    // Update average processing time
    this.averageProcessingTime = 
      (this.averageProcessingTime * (this.totalResponses - 1) + metrics.processingTime) / 
      this.totalResponses;
    
    // Track status codes
    this.statusCodes[metrics.statusCode] = (this.statusCodes[metrics.statusCode] || 0) + 1;
  }

  recordComplianceIssue(errors: string[]): void {
    this.complianceIssues += errors.length;
  }

  getSnapshot(): ResponseMetricsSnapshot {
    return {
      totalResponses: this.totalResponses,
      rateLimitedResponses: this.rateLimitedResponses,
      cachedResponses: this.cachedResponses,
      complianceIssues: this.complianceIssues,
      averageProcessingTime: this.averageProcessingTime,
      rateLimitRate: this.totalResponses > 0 ? this.rateLimitedResponses / this.totalResponses : 0,
      cacheHitRate: this.totalResponses > 0 ? this.cachedResponses / this.totalResponses : 0,
      statusCodes: { ...this.statusCodes }
    };
  }
}

// Type definitions
export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  retryAfter: number;
  reason: string;
}

export interface TenantInfo {
  id: string;
  tier: TenantTier;
}

export type TenantTier = 'starter' | 'growth' | 'scale';

export interface CacheResponseConfig {
  maxAge: number;
  staleWhileRevalidate: number;
  noStore?: boolean;
  noCache?: boolean;
  lastModified?: number;
}

export interface ParsedRateLimitHeaders {
  limit: number | null;
  burst: number | null;
  remaining: number | null;
  reset: number | null;
  retryAfter: number | null;
  policy: string | null;
}

export interface ComplianceValidationResult {
  compliant: boolean;
  errors: string[];
  warnings: string[];
}

export interface RequestContext {
  requestId: string;
  tenantId?: string;
  processingTime: number;
  requestClass: string;
}

export interface ResponseMetricsData {
  statusCode: number;
  hasRateLimitHeaders: boolean;
  hasCacheHeaders: boolean;
  processingTime: number;
}

export interface ResponseMetricsSnapshot {
  totalResponses: number;
  rateLimitedResponses: number;
  cachedResponses: number;
  complianceIssues: number;
  averageProcessingTime: number;
  rateLimitRate: number;
  cacheHitRate: number;
  statusCodes: Record<number, number>;
}

export interface ResponseConfig {
  tierConfigs: Record<TenantTier, TierRateLimitConfig>;
}

export interface TierRateLimitConfig {
  ratePerTenant: number;
  burst: number;
}

// Default configuration (copy-exact per specification)
export const DEFAULT_RESPONSE_CONFIG: ResponseConfig = {
  tierConfigs: {
    starter: {
      ratePerTenant: 300,
      burst: 1200
    },
    growth: {
      ratePerTenant: 360, // 1.2x starter
      burst: 1440
    },
    scale: {
      ratePerTenant: 600, // 2x starter
      burst: 2400
    }
  }
};

// Default cache configuration (copy-exact per specification)
export const DEFAULT_CACHE_CONFIG: CacheResponseConfig = {
  maxAge: 60,
  staleWhileRevalidate: 30
};
```
