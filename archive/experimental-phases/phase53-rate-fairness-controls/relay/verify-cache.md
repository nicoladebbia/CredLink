# Phase 53 — Anonymous Verify Cache Implementation

## RFC 9111 Compliant Verify Cache

### Verify Cache Implementation
```typescript
import { Redis } from 'ioredis';
import { createHash } from 'crypto';

/**
 * RFC 9111 compliant verify cache for anonymous users
 * Cache verify outcomes keyed by {asset_hash, policy_id}
 */
export class VerifyCache {
  private readonly redis: Redis;
  private readonly config: CacheConfig;
  private readonly metrics: CacheMetrics;

  constructor(redis: Redis, config: CacheConfig) {
    this.redis = redis;
    this.config = config;
    this.metrics = new CacheMetrics();
  }

  /**
   * Get cached verify result
   * Handles ETag/If-None-Match validators per RFC 9111
   */
  async get(
    assetHash: string,
    policyId: string,
    ifNoneMatch?: string
  ): Promise<CacheResult> {
    // Validate asset hash to prevent Redis key injection
    if (!assetHash || typeof assetHash !== 'string' || !/^[a-f0-9]{64}$/i.test(assetHash)) {
      throw new Error('Invalid asset hash format');
    }
    
    // Validate policy ID to prevent Redis key injection
    if (!policyId || typeof policyId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(policyId)) {
      throw new Error('Invalid policy ID format');
    }
    
    const cacheKey = this.buildCacheKey(assetHash, policyId);
    const now = Date.now();
    
    try {
      const cached = await this.redis.hgetall(cacheKey);
      
      if (!cached || !cached.data) {
        this.metrics.recordMiss();
        return { status: 'miss' };
      }

      const cacheEntry: CacheEntry = JSON.parse(cached.data);
      
      // Check if cache entry is still valid
      if (this.isExpired(cacheEntry, now)) {
        await this.redis.del(cacheKey);
        this.metrics.recordMiss();
        return { status: 'miss' };
      }

      // Handle conditional request
      const etag = this.buildETag(assetHash, policyId, cacheEntry.manifestHash);
      if (ifNoneMatch && ifNoneMatch === etag) {
        this.metrics.recordHit();
        return {
          status: 'not_modified',
          etag,
          cacheControl: this.buildCacheControl(cacheEntry, now)
        };
      }

      // Check if we can serve stale content while revalidating
      if (this.isStale(cacheEntry, now) && this.canServeStale(cacheEntry)) {
        this.metrics.recordStaleHit();
        return {
          status: 'stale',
          data: cacheEntry.verifyResult,
          etag,
          cacheControl: this.buildCacheControl(cacheEntry, now),
          isRevalidating: true
        };
      }

      // Fresh cache hit
      this.metrics.recordHit();
      return {
        status: 'hit',
        data: cacheEntry.verifyResult,
        etag,
        cacheControl: this.buildCacheControl(cacheEntry, now),
        age: Math.floor((now - cacheEntry.cachedAt) / 1000)
      };

    } catch (error) {
      this.emit('cache_error', { operation: 'get', error });
      this.metrics.recordError();
      return { status: 'error', error: 'Cache operation failed' };
    }
  }

  /**
   * Store verify result in cache
   */
  async set(
    assetHash: string,
    policyId: string,
    verifyResult: VerifyResult,
    manifestHash: string,
    ttl: number = this.config.defaultTtl
  ): Promise<void> {
    // Validate asset hash to prevent Redis key injection
    if (!assetHash || typeof assetHash !== 'string' || !/^[a-f0-9]{64}$/i.test(assetHash)) {
      throw new Error('Invalid asset hash format');
    }
    
    // Validate policy ID to prevent Redis key injection
    if (!policyId || typeof policyId !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(policyId)) {
      throw new Error('Invalid policy ID format');
    }
    
    // Validate TTL to prevent excessive cache retention
    if (ttl < 1 || ttl > 86400) { // Max 24 hours
      throw new Error('TTL must be between 1 and 86400 seconds');
    }
    
    const cacheKey = this.buildCacheKey(assetHash, policyId);
    const now = Date.now();
    
    const cacheEntry: CacheEntry = {
      verifyResult,
      manifestHash,
      cachedAt: now,
      expiresAt: now + (ttl * 1000),
      staleAt: now + ((ttl - this.config.staleWhileRevalidate) * 1000),
      assetHash,
      policyId
    };

    try {
      const pipeline = this.redis.pipeline();
      
      // Store cache entry
      pipeline.hset(cacheKey, 'data', JSON.stringify(cacheEntry));
      
      // Set expiration
      pipeline.expire(cacheKey, ttl + this.config.staleWhileRevalidate + 300); // Extra 5min buffer
      
      // Add to cache index for monitoring
      pipeline.zadd('cache:index', now, cacheKey);
      pipeline.expire('cache:index', ttl * 2);
      
      await pipeline.exec();
      this.metrics.recordSet();
      
    } catch (error) {
      this.emit('cache_error', { operation: 'set', error });
      this.metrics.recordError();
    }
  }

  /**
   * Revalidate cache entry asynchronously
   */
  async revalidate(
    assetHash: string,
    policyId: string
  ): Promise<RevalidationResult> {
    const cacheKey = this.buildCacheKey(assetHash, policyId);
    
    try {
      const cached = await this.redis.hget(cacheKey, 'data');
      if (!cached) {
        return { status: 'miss' };
      }

      try {
        const cacheEntry: CacheEntry = JSON.parse(cached);
        return { status: 'hit', data: cacheEntry };
      } catch (error) {
        this.emit('cache_error', { operation: 'parse', error });
        return { status: 'miss' };
      }

      const newVerifyResult = await this.performRevalidation(cacheEntry);
      
      if (newVerifyResult) {
        await this.set(
          assetHash,
          policyId,
          newVerifyResult.verifyResult,
          newVerifyResult.manifestHash,
          this.config.defaultTtl
        );
        
        return { status: 'updated', data: newVerifyResult };
      } else {
        // Verification failed, extend stale period
        await this.extendStalePeriod(cacheKey, cacheEntry);
        return { status: 'failed', reason: 'verification_failed' };
      }
      
    } catch (error) {
      this.emit('cache_error', { operation: 'revalidate', error });
      return { status: 'error', error: 'Revalidation failed' };
    }
  }

  /**
   * Prewarm cache for hot assets
   */
  async prewarm(hotAssets: HotAsset[]): Promise<PrewarmResult> {
    const results: PrewarmResult = {
      total: hotAssets.length,
      successful: 0,
      failed: 0,
      errors: []
    };

    // Process in batches to avoid overwhelming the system
    const batchSize = 10;
    for (let i = 0; i < hotAssets.length; i += batchSize) {
      const batch = hotAssets.slice(i, i + batchSize);
      
      await Promise.allSettled(
        batch.map(async (asset) => {
          try {
            // Check if already cached
            const existing = await this.get(asset.assetHash, asset.policyId);
            if (existing.status !== 'miss') {
              return;
            }

            // Perform verification and cache result
            const verifyResult = await this.performVerify(asset);
            if (verifyResult) {
              await this.set(
                asset.assetHash,
                asset.policyId,
                verifyResult.verifyResult,
                verifyResult.manifestHash,
                this.config.prewarmTtl
              );
              results.successful++;
            } else {
              results.failed++;
            }
          } catch (error) {
            results.failed++;
            results.errors.push({
              assetHash: asset.assetHash,
              error: 'Prewarm failed'
            });
          }
        })
      );
    }

    return results;
  }

  private buildCacheKey(assetHash: string, policyId: string): string {
    return `verify_cache:${assetHash}:${policyId}`;
  }

  private buildETag(assetHash: string, policyId: string, manifestHash: string): string {
    const etagData = `${assetHash}:${policyId}:${manifestHash}`;
    const hash = createHash('sha256').update(etagData).digest('hex');
    return `"manifest:sha256:${hash.substring(0, 16)}"`;
  }

  private buildCacheControl(entry: CacheEntry, now: number): string {
    const age = Math.floor((now - entry.cachedAt) / 1000);
    const maxAge = Math.max(0, Math.floor((entry.expiresAt - now) / 1000));
    const staleWhileRevalidate = Math.max(0, Math.floor((entry.staleAt - now) / 1000));
    
    return `public, max-age=${maxAge}, stale-while-revalidate=${staleWhileRevalidate}, must-revalidate, age=${age}`;
  }

  private isExpired(entry: CacheEntry, now: number): boolean {
    return now >= entry.expiresAt;
  }

  private isStale(entry: CacheEntry, now: number): boolean {
    return now >= entry.staleAt;
  }

  private canServeStale(entry: CacheEntry): boolean {
    const now = Date.now();
    const staleGracePeriod = this.config.staleWhileRevalidate * 1000;
    return now < (entry.staleAt + staleGracePeriod);
  }

  private async performRevalidation(entry: CacheEntry): Promise<VerifyResult | null> {
    // In a real implementation, this would call the verification service
    // For now, simulate the process
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Simulate successful revalidation
    return {
      verified: true,
      manifestHash: entry.manifestHash,
      timestamp: Date.now()
    };
  }

  private async performVerify(asset: HotAsset): Promise<VerifyResult | null> {
    // Simulate verification process
    await new Promise(resolve => setTimeout(resolve, 200));
    
    return {
      verified: true,
      manifestHash: createHash('sha256').update(`${asset.assetHash}:verified`).digest('hex'),
      timestamp: Date.now()
    };
  }

  private async extendStalePeriod(cacheKey: string, entry: CacheEntry): Promise<void> {
    const extension = this.config.staleWhileRevalidate * 1000;
    const newStaleAt = Date.now() + extension;
    
    await this.redis.hset(cacheKey, 'staleAt', newStaleAt.toString());
  }

  /**
   * Get cache metrics for monitoring
   */
  getMetrics(): CacheMetricsSnapshot {
    return this.metrics.getSnapshot();
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanup(): Promise<number> {
    const now = Date.now();
    let cleaned = 0;
    
    try {
      // Use SCAN instead of KEYS for production safety
      let cursor = '0';
      do {
        const result = await this.redis.scan(cursor, 'MATCH', 'verify_cache:*', 'COUNT', 100);
        cursor = result[0];
        const keys = result[1];
        
        for (const key of keys) {
          const cached = await this.redis.hget(key, 'data');
          if (cached) {
            const entry: CacheEntry = JSON.parse(cached);
            if (this.isExpired(entry, now)) {
              await this.redis.del(key);
              cleaned++;
            }
          }
        }
      } while (cursor !== '0');
    } catch (error) {
      this.emit('cache_error', { operation: 'cleanup', error });
    }
    
    return cleaned;
  }
}

/**
 * Cache metrics collector
 */
class CacheMetrics {
  private hits = 0;
  private misses = 0;
  private staleHits = 0;
  private sets = 0;
  private errors = 0;
  private startTime = Date.now();

  recordHit(): void {
    this.hits++;
  }

  recordMiss(): void {
    this.misses++;
  }

  recordStaleHit(): void {
    this.staleHits++;
  }

  recordSet(): void {
    this.sets++;
  }

  recordError(): void {
    this.errors++;
  }

  getSnapshot(): CacheMetricsSnapshot {
    const total = this.hits + this.misses;
    const uptime = Date.now() - this.startTime;
    
    return {
      hits: this.hits,
      misses: this.misses,
      staleHits: this.staleHits,
      sets: this.sets,
      errors: this.errors,
      hitRate: total > 0 ? this.hits / total : 0,
      staleHitRate: total > 0 ? this.staleHits / total : 0,
      requestsPerSecond: total / (uptime / 1000),
      uptime
    };
  }

  reset(): void {
    this.hits = 0;
    this.misses = 0;
    this.staleHits = 0;
    this.sets = 0;
    this.errors = 0;
    this.startTime = Date.now();
  }
}

// Type definitions
export interface CacheResult {
  status: 'hit' | 'miss' | 'stale' | 'not_modified' | 'error';
  data?: VerifyResult;
  etag?: string;
  cacheControl?: string;
  age?: number;
  isRevalidating?: boolean;
  error?: string;
}

export interface CacheEntry {
  verifyResult: VerifyResult;
  manifestHash: string;
  cachedAt: number;
  expiresAt: number;
  staleAt: number;
  assetHash: string;
  policyId: string;
}

export interface VerifyResult {
  verified: boolean;
  manifestHash: string;
  timestamp: number;
  [key: string]: any;
}

export interface HotAsset {
  assetHash: string;
  policyId: string;
  priority: number;
  expectedRequests?: number;
}

export interface PrewarmResult {
  total: number;
  successful: number;
  failed: number;
  errors: Array<{
    assetHash: string;
    error: string;
  }>;
}

export interface RevalidationResult {
  status: 'updated' | 'failed' | 'not_found' | 'error';
  data?: VerifyResult;
  reason?: string;
  error?: string;
}

export interface CacheMetricsSnapshot {
  hits: number;
  misses: number;
  staleHits: number;
  sets: number;
  errors: number;
  hitRate: number;
  staleHitRate: number;
  requestsPerSecond: number;
  uptime: number;
}

export interface CacheConfig {
  defaultTtl: number;
  staleWhileRevalidate: number;
  prewarmTtl: number;
  maxSize: number;
}

// Default configuration
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  defaultTtl: 60, // 60 seconds
  staleWhileRevalidate: 30, // 30 seconds
  prewarmTtl: 300, // 5 minutes for prewarmed content
  maxSize: 10000 // Maximum cache entries
};
```

### Cache Middleware for Edge Workers
```typescript
/**
 * Edge worker middleware for verify cache
 * Implements RFC 9111 caching at the edge
 */
export class VerifyCacheMiddleware {
  private readonly cache: verifyCache;
  private readonly config: MiddlewareConfig;

  constructor(cache: verifyCache, config: MiddlewareConfig) {
    this.cache = cache;
    this.config = config;
  }

  /**
   * Handle incoming verify request with caching
   */
  async handleRequest(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const assetHash = url.searchParams.get('asset_hash');
    const policyId = url.searchParams.get('policy_id') || 'default';
    
    if (!assetHash) {
      return new Response('Missing asset_hash parameter', { status: 400 });
    }

    // Check if user is anonymous
    const isAnonymous = !this.hasValidAuth(request);
    
    if (isAnonymous) {
      return this.handleAnonymousRequest(request, assetHash, policyId);
    } else {
      return this.handleAuthenticatedRequest(request, assetHash, policyId);
    }
  }

  private async handleAnonymousRequest(
    request: Request,
    assetHash: string,
    policyId: string
  ): Promise<Response> {
    const ifNoneMatch = request.headers.get('if-none-match');
    
    // Try cache first
    const cacheResult = await this.cache.get(assetHash, policyId, ifNoneMatch);
    
    switch (cacheResult.status) {
      case 'hit':
        return this.buildCacheResponse(cacheResult, 200);
        
      case 'stale':
        // Trigger background revalidation
        this.triggerRevalidation(assetHash, policyId);
        return this.buildCacheResponse(cacheResult, 200);
        
      case 'not_modified':
        return new Response(null, {
          status: 304,
          statusText: 'Not Modified',
          headers: {
            'ETag': cacheResult.etag!,
            'Cache-Control': cacheResult.cacheControl!
          }
        });
        
      case 'miss':
        // For anonymous users, check global pool before hitting origin
        const globalPoolAvailable = await this.checkGlobalPool();
        if (!globalPoolAvailable) {
          return this.buildRateLimitResponse();
        }
        
        // Fall through to origin
        return this.forwardToOrigin(request);
        
      default:
        return this.forwardToOrigin(request);
    }
  }

  private async handleAuthenticatedRequest(
    request: Request,
    assetHash: string,
    policyId: string
  ): Promise<Response> {
    // For authenticated users, cache is optional
    // Forward to origin with cache headers
    const response = await this.forwardToOrigin(request);
    
    // Cache successful responses
    if (response.ok && response.status === 200) {
      const verifyResult = await response.clone().json();
      const manifestHash = verifyResult.manifestHash;
      
      await this.cache.set(assetHash, policyId, verifyResult, manifestHash);
    }
    
    return response;
  }

  private buildCacheResponse(result: CacheResult, status: number): Response {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Cache': result.status === 'stale' ? 'stale' : 'hit'
    };
    
    if (result.etag) {
      headers['ETag'] = result.etag;
    }
    
    if (result.cacheControl) {
      headers['Cache-Control'] = result.cacheControl;
    }
    
    if (result.age) {
      headers['Age'] = result.age.toString();
    }
    
    return new Response(
      JSON.stringify(result.data),
      {
        status,
        headers
      }
    );
  }

  private buildRateLimitResponse(): Response {
    return new Response(
      JSON.stringify({
        type: 'about:blank',
        title: 'Service temporarily unavailable',
        detail: 'Anonymous requests are temporarily limited. Please try again later.'
      }),
      {
        status: 429,
        statusText: 'Too Many Requests',
        headers: {
          'Content-Type': 'application/problem+json',
          'Retry-After': '30', // 30 seconds
          'Cache-Control': 'no-cache'
        }
      }
    );
  }

  private hasValidAuth(request: Request): boolean {
    const authHeader = request.headers.get('Authorization');
    const apiKey = request.headers.get('X-API-Key');
    
    return !!(authHeader || apiKey);
  }

  private async checkGlobalPool(): Promise<boolean> {
    // In a real implementation, check global burst pool availability
    // For now, return true
    return true;
  }

  private async forwardToOrigin(request: Request): Promise<Response> {
    // Forward request to origin verification service
    const url = new URL(request.url);
    const verifyPath = url.pathname + url.search;
    
    // Validate and sanitize the verify path
    if (!verifyPath.startsWith('/verify') || verifyPath.includes('..')) {
      return new Response('Invalid request path', { status: 400 });
    }
    
    const originUrl = this.config.originUrl + verifyPath;
    
    // Validate origin URL to prevent SSRF
    const origin = new URL(originUrl);
    if (!['http:', 'https:'].includes(origin.protocol)) {
      return new Response('Invalid origin protocol', { status: 400 });
    }
    
    // Only allow configured origin domains
    const allowedOrigins = [new URL(this.config.originUrl).hostname];
    if (!allowedOrigins.includes(origin.hostname)) {
      return new Response('Origin not allowed', { status: 400 });
    }
    
    return fetch(originUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body
    });
  }

  private triggerRevalidation(assetHash: string, policyId: string): void {
    // Trigger async revalidation
    this.cache.revalidate(assetHash, policyId).catch(error => {
      this.emit('revalidation_error', { assetHash, policyId, error });
    });
  }
}

/**
 * Cloudflare URL Prefetch integration
 */
export class CloudflarePrefetchManager {
  private readonly config: PrefetchConfig;

  constructor(config: PrefetchConfig) {
    this.config = config;
  }

  /**
   * Enable URL prefetch for hot assets
   * Cloudflare Enterprise feature
   */
  async enablePrefetch(hotAssets: HotAsset[]): Promise<void> {
    if (!this.config.cloudflareEnterprise) {
      return;
    }

    for (const asset of hotAssets) {
      const verifyUrl = `${this.config.baseUrl}/verify?asset_hash=${asset.assetHash}&policy_id=${asset.policyId}`;
      
      try {
        // Use Cloudflare API to enable prefetch
        await this.callCloudflareAPI('prefetch_enable', {
          url: verifyUrl,
          priority: asset.priority,
          duration: this.config.prefetchDuration
        });
      } catch (error) {
        this.emit('prefetch_error', { operation: 'enable', assetHash: asset.assetHash, error });
      }
    }
  }

  /**
   * Disable prefetch for assets
   */
  async disablePrefetch(assetHashes: string[]): Promise<void> {
    for (const assetHash of assetHashes) {
      const verifyUrl = `${this.config.baseUrl}/verify?asset_hash=${assetHash}`;
      
      try {
        await this.callCloudflareAPI('prefetch_disable', {
          url: verifyUrl
        });
      } catch (error) {
        this.emit('prefetch_error', { operation: 'disable', assetHash, error });
      }
    }
  }

  private async callCloudflareAPI(endpoint: string, data: Record<string, unknown>): Promise<void> {
    // In a real implementation, call Cloudflare API
    this.emit('cloudflare_api_call', { endpoint, data });
  }
}

interface MiddlewareConfig {
  originUrl: string;
  enableCacheForAnonymous: boolean;
}

interface PrefetchConfig {
  baseUrl: string;
  cloudflareEnterprise: boolean;
  prefetchDuration: number; // in seconds
}

interface Env {
  VERIFY_CACHE KVNamespace;
  RATE_LIMITER DurableObject;
}
```
