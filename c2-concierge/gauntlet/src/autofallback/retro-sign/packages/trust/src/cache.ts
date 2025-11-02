/**
 * Phase 11 — Trust Graph & Badge Reputation v1
 * Simple in-memory cache implementation (Redis/KV can be swapped in)
 */

import { TrustCacheEntry, TrustSnippet } from './types';

/**
 * Simple cache interface for trust snippets
 */
export interface TrustCache {
  get(key: string): Promise<TrustCacheEntry | undefined>;
  set(key: string, entry: TrustCacheEntry): Promise<void>;
  delete(key: string): Promise<void>;
  clear(): Promise<void>;
  size(): Promise<number>;
  keys(): Promise<string[]>;
}

/**
 * In-memory cache implementation
 */
export class MemoryTrustCache implements TrustCache {
  private cache: Map<string, TrustCacheEntry> = new Map();
  private cleanupInterval: NodeJS.Timeout;
  private maxEntries: number;
  private cleanupIntervalMs: number;

  constructor(
    private defaultTtlSeconds: number = 300,
    options: { maxEntries?: number; cleanupIntervalMs?: number } = {}
  ) {
    this.maxEntries = options.maxEntries || 10000;
    this.cleanupIntervalMs = options.cleanupIntervalMs || 60000;
    
    // Clean up expired entries every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, this.cleanupIntervalMs);
    
    // Prevent uncaught exception crashes
    if (this.cleanupInterval.unref) {
      this.cleanupInterval.unref();
    }
  }

  async get(key: string): Promise<TrustCacheEntry | undefined> {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check if expired
    if (new Date() > new Date(entry.expires_at)) {
      this.cache.delete(key);
      return undefined;
    }

    return entry;
  }

  async set(key: string, entry: TrustCacheEntry): Promise<void> {
    // Ensure TTL is set
    if (!entry.expires_at) {
      const expiresAt = new Date(Date.now() + this.defaultTtlSeconds * 1000);
      entry.expires_at = expiresAt.toISOString();
    }

    // Enforce size limits - remove oldest entries if needed
    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, entry);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
  }

  async size(): Promise<number> {
    return this.cache.size;
  }

  async keys(): Promise<string[]> {
    return Array.from(this.cache.keys());
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = new Date();
    const expiredKeys: string[] = [];
    
    // First pass: identify expired keys
    for (const [key, entry] of this.cache.entries()) {
      if (now > new Date(entry.expires_at)) {
        expiredKeys.push(key);
      }
    }
    
    // Second pass: delete expired keys
    for (const key of expiredKeys) {
      this.cache.delete(key);
    }
  }

  /**
   * Destroy the cache and cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    size: number;
    hitRate: number;
    memoryUsage: number;
  } {
    return {
      size: this.cache.size,
      hitRate: 0, // Would need to track hits/misses
      memoryUsage: 0 // Would need to estimate memory usage
    };
  }
}

/**
 * Redis cache implementation (placeholder)
 */
export class RedisTrustCache implements TrustCache {
  private redis: any; // Redis client
  private keyPrefix: string;

  constructor(redisClient: any, keyPrefix: string = 'trust:') {
    this.redis = redisClient;
    this.keyPrefix = keyPrefix;
  }

  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get(key: string): Promise<TrustCacheEntry | undefined> {
    try {
      const data = await this.redis.get(this.getKey(key));
      return data ? JSON.parse(data) : undefined;
    } catch (error) {
      console.error('Redis get error:', error);
      return undefined;
    }
  }

  async set(key: string, entry: TrustCacheEntry): Promise<void> {
    try {
      const ttl = Math.floor((new Date(entry.expires_at).getTime() - Date.now()) / 1000);
      await this.redis.setex(
        this.getKey(key),
        ttl,
        JSON.stringify(entry)
      );
    } catch (error) {
      console.error('Redis set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.redis.del(this.getKey(key));
    } catch (error) {
      console.error('Redis delete error:', error);
    }
  }

  async clear(): Promise<void> {
    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } catch (error) {
      console.error('Redis clear error:', error);
    }
  }

  async size(): Promise<number> {
    try {
      const pattern = `${this.keyPrefix}*`;
      return await this.redis.eval(`
        local keys = redis.call('keys', ARGV[1])
        return #keys
      `, 0, pattern);
    } catch (error) {
      console.error('Redis size error:', error);
      return 0;
    }
  }

  async keys(): Promise<string[]> {
    try {
      const pattern = `${this.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      return keys.map((key: string) => key.replace(this.keyPrefix, ''));
    } catch (error) {
      console.error('Redis keys error:', error);
      return [];
    }
  }
}

/**
 * Cloudflare KV cache implementation (placeholder)
 */
export class CloudflareKVTrustCache implements TrustCache {
  private kv: any; // Cloudflare KV namespace
  private keyPrefix: string;

  constructor(kvNamespace: any, keyPrefix: string = 'trust:') {
    this.kv = kvNamespace;
    this.keyPrefix = keyPrefix;
  }

  private getKey(key: string): string {
    return `${this.keyPrefix}${key}`;
  }

  async get(key: string): Promise<TrustCacheEntry | undefined> {
    try {
      const data = await this.kv.get(this.getKey(key), { type: 'json' });
      return data as TrustCacheEntry || undefined;
    } catch (error) {
      console.error('Cloudflare KV get error:', error);
      return undefined;
    }
  }

  async set(key: string, entry: TrustCacheEntry): Promise<void> {
    try {
      const ttl = Math.floor((new Date(entry.expires_at).getTime() - Date.now()) / 1000);
      await this.kv.put(this.getKey(key), JSON.stringify(entry), {
        expirationTtl: ttl
      });
    } catch (error) {
      console.error('Cloudflare KV set error:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(this.getKey(key));
    } catch (error) {
      console.error('Cloudflare KV delete error:', error);
    }
  }

  async clear(): Promise<void> {
    // Cloudflare KV doesn't support clearing by pattern
    // This would need to be implemented with a list of known keys
    console.warn('Cloudflare KV clear not implemented');
  }

  async size(): Promise<number> {
    // Cloudflare KV doesn't support getting size
    console.warn('Cloudflare KV size not implemented');
    return 0;
  }

  async keys(): Promise<string[]> {
    // Cloudflare KV doesn't support listing keys
    console.warn('Cloudflare KV keys not implemented');
    return [];
  }
}

/**
 * Cache factory function
 */
export function createTrustCache(
  type: 'memory' | 'redis' | 'cloudflare-kv',
  options: any = {}
): TrustCache {
  switch (type) {
    case 'memory':
      return new MemoryTrustCache(options.ttlSeconds);
    case 'redis':
      if (!options.redisClient) {
        throw new Error('Redis client required for Redis cache');
      }
      return new RedisTrustCache(options.redisClient, options.keyPrefix);
    case 'cloudflare-kv':
      if (!options.kvNamespace) {
        throw new Error('KV namespace required for Cloudflare KV cache');
      }
      return new CloudflareKVTrustCache(options.kvNamespace, options.keyPrefix);
    default:
      throw new Error(`Unknown cache type: ${type}. Supported types: memory, redis, cloudflare-kv`);
  }
}

/**
 * Cache utilities
 */
export class CacheUtils {
  /**
   * Generate cache key for trust snippet
   */
  static generateTrustKey(keyId: string, context: any = {}): string {
    const contextHash = this.hashObject(context);
    return `trust:${keyId}:${contextHash}`;
  }

  /**
   * Simple hash function for objects
   */
  static hashObject(obj: any): string {
    const str = JSON.stringify(obj, Object.keys(obj).sort());
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Calculate TTL based on trust score
   */
  static calculateTtl(score: number, baseTtlSeconds: number = 300): number {
    // Higher scores get longer TTL
    if (score >= 80) return baseTtlSeconds;
    if (score >= 60) return baseTtlSeconds * 0.75;
    if (score >= 40) return baseTtlSeconds * 0.5;
    return baseTtlSeconds * 0.25; // Low scores expire faster
  }

  /**
   * Create cache entry from trust snippet
   */
  static createCacheEntry(
    keyId: string,
    snippet: TrustSnippet,
    ttlSeconds?: number
  ): TrustCacheEntry {
    const ttl = ttlSeconds || this.calculateTtl(snippet.score);
    
    return {
      key_id: keyId,
      snippet,
      cached_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttl * 1000).toISOString()
    };
  }
}
