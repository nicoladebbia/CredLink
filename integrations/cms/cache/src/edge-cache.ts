/**
 * Phase 19: Edge Cache & 5xx Policy - Edge Cache Implementation
 * TTL by status, stale-while-revalidate, and intelligent caching
 */

import { createHash } from 'crypto';
import {
  CacheConfig,
  CacheEntry,
  CacheKey,
  CacheOptions,
  CacheResult,
  CacheMetrics
} from './types.js';

export class EdgeCache {
  private config: CacheConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private metrics: CacheMetrics;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private operationCounts: Map<string, { count: number; windowStart: number }> = new Map();

  constructor(config: CacheConfig) {
    this.config = config;
    this.metrics = this.initializeMetrics();
    this.startCleanup();
  }

  private initializeMetrics(): CacheMetrics {
    return {
      total_entries: 0,
      hit_rate: 0,
      miss_rate: 0,
      stale_hits: 0,
      evictions: 0,
      size_bytes: 0,
      oldest_entry_age_seconds: 0,
      newest_entry_age_seconds: 0
    };
  }

  /**
   * Check rate limits for cache operations (DoS protection)
   */
  private checkRateLimit(identifier: string, limit: number = 100): boolean {
    const now = Date.now();
    const windowMs = 60000; // 1 minute window
    
    if (!this.operationCounts.has(identifier)) {
      this.operationCounts.set(identifier, { count: 1, windowStart: now });
      return true;
    }
    
    const operations = this.operationCounts.get(identifier)!;
    
    // Reset window if expired
    if (now - operations.windowStart > windowMs) {
      operations.count = 1;
      operations.windowStart = now;
      return true;
    }
    
    // Check limit
    if (operations.count >= limit) {
      return false;
    }
    
    operations.count++;
    return true;
  }

  /**
   * Generate cache key from request components
   */
  private generateCacheKey(key: CacheKey): string {
    const keyData = {
      provider: key.provider,
      request_type: key.request_type,
      method: key.method,
      url: key.url,
      headers_hash: key.headers_hash,
      params_hash: key.params_hash,
      tenant_id: key.tenant_id
    };

    const keyString = JSON.stringify(keyData, Object.keys(keyData).sort());
    return createHash('sha256').update(keyString).digest('hex');
  }

  /**
   * Calculate TTL based on status code
   */
  private calculateTTL(statusCode: number, customTTL?: number): number {
    if (customTTL) {
      return Math.max(
        this.config.ttl_by_status.success.min,
        Math.min(customTTL, this.config.ttl_by_status.success.max)
      );
    }

    let ttlConfig;
    if (statusCode >= 200 && statusCode < 300) {
      ttlConfig = this.config.ttl_by_status.success;
    } else if (statusCode === 429) {
      ttlConfig = this.config.ttl_by_status.rate_limited;
    } else if (statusCode >= 500) {
      ttlConfig = this.config.ttl_by_status.server_error;
    } else if (statusCode >= 400) {
      ttlConfig = this.config.ttl_by_status.client_error;
    } else {
      ttlConfig = this.config.ttl_by_status.success; // fallback
    }

    // Add some randomness to prevent thundering herd
    const randomization = 0.8 + Math.random() * 0.4; // 80-120% of base TTL
    return Math.floor(ttlConfig.default * randomization);
  }

  /**
   * Calculate stale-while-revalidate TTL
   */
  private calculateStaleTTL(baseTTL: number): number | undefined {
    if (!this.config.stale_while_revalidate.enabled) {
      return undefined;
    }

    const staleTTL = Math.floor(baseTTL * this.config.stale_while_revalidate.ttl_multiplier);
    return Math.min(staleTTL, this.config.stale_while_revalidate.max_ttl);
  }

  /**
   * Check if entry is stale
   */
  private isStale(entry: CacheEntry): boolean {
    const now = Date.now();
    return now > entry.expires_at;
  }

  /**
   * Check if stale entry can be served (stale-while-revalidate)
   */
  private canServeStale(entry: CacheEntry): boolean {
    if (!entry.stale_until) {
      return false;
    }
    const now = Date.now();
    return now <= entry.stale_until;
  }

  /**
   * Get cache entry
   */
  async get(key: CacheKey, options: CacheOptions = {}): Promise<CacheResult> {
    const cacheKey = this.generateCacheKey(key);
    const entry = this.cache.get(cacheKey);

    if (!entry) {
      this.updateMissMetrics();
      return { hit: false };
    }

    const now = Date.now();

    // Check if force refresh is requested
    if (options.force_refresh) {
      this.updateMissMetrics();
      return { hit: false };
    }

    // Check ETag for conditional requests
    if (options.if_none_match && entry.etag) {
      if (options.if_none_match === entry.etag) {
        this.updateHitMetrics(entry);
        return { hit: true, entry, stale: false };
      }
    }

    // Check if entry is expired
    const isExpired = now > entry.expires_at;
    const isStale = this.isStale(entry);
    const canServeStale = isStale && this.canServeStale(entry);

    if (isExpired && !canServeStale) {
      // Entry is stale and cannot be served
      this.cache.delete(cacheKey);
      this.updateMissMetrics();
      return { hit: false };
    }

    // Update access metrics
    entry.access_count++;
    entry.last_accessed = now;

    if (isStale && canServeStale) {
      // Serve stale content and trigger background refresh
      this.updateStaleHitMetrics(entry);
      return {
        hit: true,
        entry,
        stale: true,
        background_refresh: true
      };
    }

    // Serve fresh content
    this.updateHitMetrics(entry);
    return {
      hit: true,
      entry,
      stale: false
    };
  }

  /**
   * Set cache entry with rate limiting
   */
  async set(
    key: CacheKey,
    value: any,
    statusCode: number,
    options: CacheOptions = {}
  ): Promise<void> {
    // Rate limiting by tenant + provider
    const rateLimitId = `${key.tenant_id || 'anonymous'}-${key.provider}`;
    if (!this.checkRateLimit(rateLimitId, 50)) { // 50 operations per minute per tenant+provider
      throw new Error('Rate limit exceeded for cache operations');
    }
    
    const cacheKey = this.generateCacheKey(key);
    const now = Date.now();

    // Calculate TTLs
    const ttl = this.calculateTTL(statusCode, options.ttl);
    const expiresAt = now + (ttl * 1000);
    const staleUntil = this.calculateStaleTTL(ttl) ? now + (this.calculateStaleTTL(ttl)! * 1000) : undefined;

    // Create cache entry
    const entry: CacheEntry = {
      key: cacheKey,
      value,
      status_code: statusCode,
      created_at: now,
      expires_at: expiresAt,
      stale_until: staleUntil,
      access_count: 1,
      last_accessed: now,
      provider: key.provider,
      request_type: key.request_type,
      etag: options.etag,
      last_modified: options.if_modified_since
    };

    // Check cache size limits
    if (this.cache.size >= this.config.storage.max_entries) {
      this.evictLeastRecentlyUsed();
    }

    // Store entry
    this.cache.set(cacheKey, entry);
    this.updateSetMetrics(entry);
  }

  /**
   * Delete cache entry
   */
  async delete(key: CacheKey): Promise<boolean> {
    const cacheKey = this.generateCacheKey(key);
    const deleted = this.cache.delete(cacheKey);
    
    if (deleted) {
      this.updateDeleteMetrics();
    }
    
    return deleted;
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    const clearedCount = this.cache.size;
    this.cache.clear();
    
    this.metrics.total_entries = 0;
    this.metrics.evictions += clearedCount;
    this.metrics.size_bytes = 0;
  }

  /**
   * Clear entries for specific provider
   */
  async clearProvider(provider: string): Promise<number> {
    let clearedCount = 0;
    
    for (const [key, entry] of this.cache.entries()) {
      if (entry.provider === provider) {
        this.cache.delete(key);
        clearedCount++;
      }
    }
    
    this.metrics.total_entries -= clearedCount;
    this.metrics.evictions += clearedCount;
    
    return clearedCount;
  }

  /**
   * Evict least recently used entries
   */
  private evictLeastRecentlyUsed(): void {
    if (this.cache.size === 0) return;

    // Find entries to evict (bottom 10% by last accessed time)
    const entries = Array.from(this.cache.entries())
      .sort(([, a], [, b]) => a.last_accessed - b.last_accessed);

    const evictCount = Math.max(1, Math.floor(entries.length * 0.1));
    
    for (let i = 0; i < evictCount; i++) {
      const [key] = entries[i];
      this.cache.delete(key);
      this.metrics.evictions++;
    }
  }

  /**
   * Cleanup expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expires_at && (!entry.stale_until || now > entry.stale_until)) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.metrics.evictions += cleanedCount;
      console.log(`Edge cache cleanup: removed ${cleanedCount} expired entries`);
    }
  }

  /**
   * Start cleanup interval
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.config.storage.cleanup_interval_seconds * 1000);
  }

  /**
   * Stop cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Update hit metrics
   */
  private updateHitMetrics(entry: CacheEntry): void {
    // Update hit rate (simplified - in production would use proper sliding window)
    const totalRequests = this.metrics.hit_rate + this.metrics.miss_rate;
    this.metrics.hit_rate = (this.metrics.hit_rate * totalRequests + 1) / (totalRequests + 1);
  }

  /**
   * Update miss metrics
   */
  private updateMissMetrics(): void {
    const totalRequests = this.metrics.hit_rate + this.metrics.miss_rate;
    this.metrics.miss_rate = (this.metrics.miss_rate * totalRequests + 1) / (totalRequests + 1);
  }

  /**
   * Update stale hit metrics
   */
  private updateStaleHitMetrics(entry: CacheEntry): void {
    this.metrics.stale_hits++;
    this.updateHitMetrics(entry);
  }

  /**
   * Update set metrics
   */
  private updateSetMetrics(entry: CacheEntry): void {
    this.metrics.total_entries = this.cache.size;
    // Estimate size (rough calculation)
    this.metrics.size_bytes += JSON.stringify(entry).length * 2; // rough UTF-16 byte count
  }

  /**
   * Update delete metrics
   */
  private updateDeleteMetrics(): void {
    this.metrics.total_entries = this.cache.size;
  }

  /**
   * Get cache metrics
   */
  getMetrics(): CacheMetrics {
    const now = Date.now();
    const entries = Array.from(this.cache.values());
    
    if (entries.length > 0) {
      const ages = entries.map(e => now - e.created_at);
      this.metrics.oldest_entry_age_seconds = Math.max(...ages) / 1000;
      this.metrics.newest_entry_age_seconds = Math.min(...ages) / 1000;
    }

    return { ...this.metrics };
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    entries: number;
    hit_rate: number;
    miss_rate: number;
    stale_hits: number;
    evictions: number;
    size_bytes: number;
    provider_distribution: Record<string, number>;
    status_distribution: Record<string, number>;
  } {
    const providerDistribution: Record<string, number> = {};
    const statusDistribution: Record<string, number> = {};

    for (const entry of this.cache.values()) {
      providerDistribution[entry.provider] = (providerDistribution[entry.provider] || 0) + 1;
      const statusRange = `${Math.floor(entry.status_code / 100)}xx`;
      statusDistribution[statusRange] = (statusDistribution[statusRange] || 0) + 1;
    }

    return {
      entries: this.cache.size,
      hit_rate: this.metrics.hit_rate,
      miss_rate: this.metrics.miss_rate,
      stale_hits: this.metrics.stale_hits,
      evictions: this.metrics.evictions,
      size_bytes: this.metrics.size_bytes,
      provider_distribution: providerDistribution,
      status_distribution: statusDistribution
    };
  }
}

// Default cache configuration
export const DEFAULT_CACHE_CONFIG: CacheConfig = {
  ttl_by_status: {
    success: {
      default: 300, // 5 minutes
      min: 60,     // 1 minute
      max: 3600    // 1 hour
    },
    rate_limited: {
      default: 60,  // 1 minute
      min: 30,     // 30 seconds
      max: 300     // 5 minutes
    },
    server_error: {
      default: 30,  // 30 seconds
      min: 10,     // 10 seconds
      max: 120     // 2 minutes
    },
    client_error: {
      default: 120, // 2 minutes
      min: 60,     // 1 minute
      max: 600     // 10 minutes
    }
  },
  stale_while_revalidate: {
    enabled: true,
    ttl_multiplier: 2, // stale TTL = 2x base TTL
    max_ttl: 1800      // max 30 minutes stale
  },
  incident_detection: {
    error_rate_threshold: 0.1,  // 10% error rate
    window_size_minutes: 5,
    min_requests: 10,
    spike_multiplier: 2.0       // 2x over baseline
  },
  storage: {
    type: 'memory',
    max_entries: 10000,
    cleanup_interval_seconds: 300 // 5 minutes
  }
};
