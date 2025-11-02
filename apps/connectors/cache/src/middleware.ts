/**
 * Phase 19: Edge Cache & 5xx Policy - Cache Middleware and Integration
 * Hono middleware for caching provider responses with incident detection
 */

import { Context, Next } from 'hono';
import { createHash } from 'crypto';
import { EdgeCache, DEFAULT_CACHE_CONFIG } from './edge-cache.js';
import { IncidentDetector } from './incident-detector.js';
import { CacheConfig, CacheKey, CacheOptions, ProviderMetrics } from './types.js';

export class CacheMiddleware {
  private cache: EdgeCache;
  private incidentDetector: IncidentDetector;
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      ...DEFAULT_CACHE_CONFIG,
      ...config,
      ttl_by_status: {
        ...DEFAULT_CACHE_CONFIG.ttl_by_status,
        ...(config?.ttl_by_status || {})
      },
      stale_while_revalidate: {
        ...DEFAULT_CACHE_CONFIG.stale_while_revalidate,
        ...(config?.stale_while_revalidate || {})
      },
      incident_detection: {
        ...DEFAULT_CACHE_CONFIG.incident_detection,
        ...(config?.incident_detection || {})
      },
      storage: {
        ...DEFAULT_CACHE_CONFIG.storage,
        ...(config?.storage || {})
      }
    };

    this.cache = new EdgeCache(this.config);
    this.incidentDetector = new IncidentDetector(this.config);
  }

  /**
   * Hono middleware for caching responses
   */
  cacheMiddleware(options: {
    keyPrefix?: string;
    ttl?: number;
    staleWhileRevalidate?: boolean;
    skipCache?: (c: Context) => boolean;
  } = {}) {
    return async (c: Context, next: Next) => {
      // Skip cache if condition is met
      if (options.skipCache?.(c)) {
        await next();
        return;
      }

      // Generate cache key
      const cacheKey = this.generateCacheKey(c, options.keyPrefix);
      
      // Check cache
      const cacheOptions: CacheOptions = {
        ttl: options.ttl,
        stale_while_revalidate: options.staleWhileRevalidate,
        if_none_match: c.req.header('if-none-match'),
        if_modified_since: c.req.header('if-modified-since')
      };

      const cacheResult = await this.cache.get(cacheKey, cacheOptions);

      // Handle cache hit
      if (cacheResult.hit && cacheResult.entry) {
        // Set cache headers
        this.setCacheHeaders(c, cacheResult.entry, cacheResult.stale || false);

        // Handle 304 Not Modified
        if (cacheOptions.if_none_match && cacheResult.entry.etag === cacheOptions.if_none_match) {
          c.status(304);
          return c.body(null);
        }

        // Return cached response
        return c.json(cacheResult.entry.value, cacheResult.entry.status_code as any);
      }

      // Cache miss - proceed with request
      const startTime = Date.now();
      await next();
      const responseTime = Date.now() - startTime;

      // Cache the response if cacheable
      if (this.isResponseCacheable(c)) {
        const statusCode = c.res.status;
        const responseBody = await this.getResponseBody(c);

        await this.cache.set(cacheKey, responseBody, statusCode, {
          ttl: options.ttl,
          etag: c.res.headers.get('etag') || undefined,
          stale_while_revalidate: options.staleWhileRevalidate
        });

        // Set cache headers for response
        const cacheEntry = await this.cache.get(cacheKey);
        if (cacheResult.hit && cacheResult.entry) {
          this.setCacheHeaders(c, cacheResult.entry, false);
        }
      }

      // Record metrics for incident detection
      await this.recordRequestMetrics(c, responseTime);
    };
  }

  /**
   * Generate cache key from request context with validation
   */
  private generateCacheKey(c: Context, keyPrefix?: string): CacheKey {
    const url = c.req.url;
    const method = c.req.method;
    const rawTenantId = c.get('tenantId') || c.req.header('x-tenant-id');
    
    // Validate tenant ID format (UUID)
    const tenantId = this.validateTenantId(rawTenantId);
    
    // Extract provider from URL or header
    const provider = this.extractProviderFromContext(c);
    
    // Generate hashes for headers and params
    const headersHash = this.generateHeadersHash(c.req.header());
    const paramsHash = this.generateParamsHash(c.req.query());

    return {
      provider,
      request_type: this.getRequestType(c),
      method,
      url,
      headers_hash: headersHash,
      params_hash: paramsHash,
      tenant_id: tenantId
    };
  }

  /**
   * Validate tenant ID format
   */
  private validateTenantId(tenantId: string | undefined): string | undefined {
    if (!tenantId) return undefined;
    
    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (uuidRegex.test(tenantId)) {
      return tenantId;
    }
    
    // Invalid format - reject for security
    console.warn(`Invalid tenant ID format detected: ${tenantId}`);
    return undefined;
  }

  /**
   * Extract provider from context with validation
   */
  private extractProviderFromContext(c: Context): string {
    // Try to extract from URL path with validation
    const pathParts = c.req.path.split('/');
    if (pathParts.length >= 2 && pathParts[1]) {
      const provider = pathParts[1].toLowerCase();
      // Validate against allowed providers
      const allowedProviders = ['getty', 'ap', 'shutterstock', 'reuters', 'cache'];
      if (allowedProviders.includes(provider)) {
        return provider;
      }
    }

    // Try to extract from header with validation
    const providerHeader = c.req.header('x-provider');
    if (providerHeader) {
      const provider = providerHeader.toLowerCase();
      const allowedProviders = ['getty', 'ap', 'shutterstock', 'reuters', 'cache'];
      if (allowedProviders.includes(provider)) {
        return provider;
      }
    }

    // Default fallback
    return 'unknown';
  }

  /**
   * Get request type from context
   */
  private getRequestType(c: Context): string {
    const path = c.req.path;
    
    if (path.includes('/search')) return 'search';
    if (path.includes('/ingest')) return 'ingest';
    if (path.includes('/content/') || path.includes('/asset/')) return 'content';
    if (path.includes('/health')) return 'health';
    if (path.includes('/rate-limit')) return 'rate_limit';
    
    return 'api';
  }

  /**
   * Generate hash from headers
   */
  private generateHeadersHash(headers: Record<string, string>): string {
    // Include only cache-relevant headers
    const relevantHeaders = {
      'accept': headers['accept'],
      'accept-language': headers['accept-language'],
      'authorization': headers['authorization'] ? '[REDACTED]' : undefined
    };

    const headerString = JSON.stringify(relevantHeaders, Object.keys(relevantHeaders).sort());
    return createHash('md5').update(headerString).digest('hex');
  }

  /**
   * Generate hash from query parameters
   */
  private generateParamsHash(params: Record<string, string>): string {
    const paramString = JSON.stringify(params, Object.keys(params).sort());
    return createHash('md5').update(paramString).digest('hex');
  }

  /**
   * Check if response is cacheable
   */
  private isResponseCacheable(c: Context): boolean {
    const statusCode = c.res.status;
    const method = c.req.method;
    
    // Only cache GET requests and successful responses
    if (method !== 'GET') return false;
    
    // Cache successful responses and some error responses
    if (statusCode >= 200 && statusCode < 300) return true;
    if (statusCode === 429) return true; // Rate limited
    if (statusCode >= 500 && statusCode < 600) return true; // Server errors
    if (statusCode >= 400 && statusCode < 500) return true; // Client errors
    
    return false;
  }

  /**
   * Get response body from context
   */
  private async getResponseBody(c: Context): Promise<any> {
    // For JSON responses, parse and return the object
    const contentType = c.res.headers.get('content-type');
    
    if (contentType?.includes('application/json')) {
      // Hono stores the response body, we need to extract it
      // This is a simplified approach - in production you'd handle this more carefully
      try {
        return c.res; // Return the response object as-is for caching
      } catch {
        return null;
      }
    }
    
    return null;
  }

  /**
   * Set cache headers for response
   */
  private setCacheHeaders(c: Context, entry: any, isStale: boolean): void {
    const ttl = Math.max(0, Math.floor((entry.expires_at - Date.now()) / 1000));
    
    c.res.headers.set('Cache-Control', `max-age=${ttl}, ${isStale ? 'stale-while-revalidate' : 'no-stale-while-revalidate'}`);
    c.res.headers.set('X-Cache', isStale ? 'HIT-STALE' : 'HIT');
    c.res.headers.set('X-Cache-Age', Math.floor((Date.now() - entry.created_at) / 1000).toString());
    
    if (entry.etag) {
      c.res.headers.set('ETag', entry.etag);
    }
    
    if (entry.last_modified) {
      c.res.headers.set('Last-Modified', entry.last_modified);
    }
  }

  /**
   * Record request metrics for incident detection
   */
  private async recordRequestMetrics(c: Context, responseTime: number): Promise<void> {
    const provider = this.extractProviderFromContext(c);
    const statusCode = c.res.status;
    const requestType = this.getRequestType(c);
    
    // Create metrics record
    const metrics: ProviderMetrics = {
      provider,
      window_start: new Date(Date.now() - 60000).toISOString(), // 1 minute window
      window_end: new Date().toISOString(),
      total_requests: 1,
      successful_requests: statusCode >= 200 && statusCode < 300 ? 1 : 0,
      error_requests: statusCode >= 400 && statusCode < 600 ? 1 : 0,
      rate_limited_requests: statusCode === 429 ? 1 : 0,
      timeout_requests: 0, // Would be set by actual timeout detection
      connection_errors: 0, // Would be set by actual error detection
      error_rate: statusCode >= 400 && statusCode < 600 ? 1 : 0,
      average_response_time_ms: responseTime,
      p95_response_time_ms: responseTime,
      status_code_distribution: {
        [`${Math.floor(statusCode / 100)}xx`]: 1
      },
      endpoint_metrics: {
        [requestType]: {
          requests: 1,
          errors: statusCode >= 400 && statusCode < 600 ? 1 : 0,
          error_rate: statusCode >= 400 && statusCode < 600 ? 1 : 0,
          avg_response_time_ms: responseTime
        }
      }
    };

    this.incidentDetector.recordMetrics(metrics);
  }

  /**
   * Get cache instance
   */
  getCache(): EdgeCache {
    return this.cache;
  }

  /**
   * Get incident detector instance
   */
  getIncidentDetector(): IncidentDetector {
    return this.incidentDetector;
  }

  /**
   * Get comprehensive status
   */
  getStatus(): {
    cache: any;
    incidents: any;
    config: any;
  } {
    return {
      cache: this.cache.getStats(),
      incidents: this.incidentDetector.getIncidentSummary(),
      config: {
        ttl_by_status: this.config.ttl_by_status,
        stale_while_revalidate: this.config.stale_while_revalidate,
        incident_detection: {
          error_rate_threshold: this.config.incident_detection.error_rate_threshold,
          window_size_minutes: this.config.incident_detection.window_size_minutes,
          min_requests: this.config.incident_detection.min_requests,
          spike_multiplier: this.config.incident_detection.spike_multiplier
        },
        storage: {
          type: this.config.storage.type,
          max_entries: this.config.storage.max_entries,
          cleanup_interval_seconds: this.config.storage.cleanup_interval_seconds
        }
      }
    };
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.cache.stop();
  }
}

// Factory function for easy integration
export function createCacheMiddleware(config?: Partial<CacheConfig>): CacheMiddleware {
  return new CacheMiddleware(config);
}

// Default middleware instance
export const defaultCacheMiddleware = createCacheMiddleware();
