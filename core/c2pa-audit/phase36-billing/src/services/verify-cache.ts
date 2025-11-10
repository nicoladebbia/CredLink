/**
 * Phase 38 - Anonymous Verify Cache Service
 * Implements RFC 9111 HTTP Caching semantics for verify responses
 * Provides abuse resistance through intelligent caching strategies
 */

import { Redis } from 'ioredis';
import { createHash } from 'crypto';

// Cache configuration following RFC 9111
interface CacheConfig {
  // Default cache TTL in seconds
  defaultTtl: number;
  // Maximum cache TTL in seconds
  maxTtl: number;
  // Stale-while-revalidate window in seconds
  staleWhileRevalidate: number;
  // Maximum size of cache entries
  maxEntrySize: number;
  // Cache key prefix
  keyPrefix: string;
}

// Cache entry structure
interface CacheEntry<T = any> {
  data: T;
  cachedAt: number;
  expiresAt: number;
  etag?: string;
  lastModified?: string;
  vary?: Record<string, string>;
  hitCount: number;
  size: number;
}

// Cache control directives
interface CacheControl {
  maxAge?: number;
  staleWhileRevalidate?: number;
  mustRevalidate?: boolean;
  noCache?: boolean;
  noStore?: boolean;
  private?: boolean;
  public?: boolean;
}

// Verify cache key components
interface VerifyCacheKey {
  assetHash: string;
  manifestHash: string;
  policyVersion: string;
  validationOptions: string;
}

export class VerifyCacheService {
  private redis: Redis;
  private config: CacheConfig;
  
  constructor(redis: Redis, config?: Partial<CacheConfig>) {
    this.redis = redis;
    this.config = {
      defaultTtl: 300, // 5 minutes
      maxTtl: 3600, // 1 hour maximum
      staleWhileRevalidate: 60, // 1 minute stale window
      maxEntrySize: 1024 * 1024, // 1MB max entry size
      keyPrefix: 'verify_cache:',
      ...config,
    };
  }
  
  /**
   * Generate cache key for verify responses
   * Key includes all factors that affect verification outcome
   */
  private generateCacheKey(key: VerifyCacheKey): string {
    const keyComponents = [
      key.assetHash,
      key.manifestHash,
      key.policyVersion,
      key.validationOptions,
    ];
    
    const keyString = keyComponents.join('|');
    const hash = createHash('sha256').update(keyString).digest('hex');
    
    return `${this.config.keyPrefix}${hash}`;
  }
  
  /**
   * Parse Cache-Control header
   */
  private parseCacheControl(header: string): CacheControl {
    const directives: CacheControl = {};
    
    header.split(',').forEach(directive => {
      const [name, value] = directive.trim().split('=');
      const cleanName = name.toLowerCase().replace('-', '');
      
      switch (cleanName) {
        case 'maxage':
          directives.maxAge = parseInt(value);
          break;
        case 'stalewhilerevalidate':
          directives.staleWhileRevalidate = parseInt(value);
          break;
        case 'mustrevalidate':
          directives.mustRevalidate = true;
          break;
        case 'nocache':
          directives.noCache = true;
          break;
        case 'nostore':
          directives.noStore = true;
          break;
        case 'private':
          directives.private = true;
          break;
        case 'public':
          directives.public = true;
          break;
      }
    });
    
    return directives;
  }
  
  /**
   * Calculate entry size for storage limits
   */
  private calculateEntrySize(data: any): number {
    const serialized = JSON.stringify(data);
    return Buffer.byteLength(serialized, 'utf8');
  }
  
  /**
   * Store verify response in cache
   */
  async set(
    key: VerifyCacheKey,
    data: any,
    options: {
      ttl?: number;
      etag?: string;
      lastModified?: string;
      vary?: Record<string, string>;
      cacheControl?: string;
    } = {}
  ): Promise<void> {
    try {
      const cacheKey = this.generateCacheKey(key);
      
      // Calculate TTL based on options and config
      let ttl = options.ttl || this.config.defaultTtl;
      
      // Parse cache control directives if provided
      if (options.cacheControl) {
        const directives = this.parseCacheControl(options.cacheControl);
        
        // Respect no-store directive
        if (directives.noStore) {
          return;
        }
        
        // Use max-age if specified
        if (directives.maxAge !== undefined) {
          ttl = Math.min(directives.maxAge, this.config.maxTtl);
        }
      }
      
      // Enforce maximum TTL
      ttl = Math.min(ttl, this.config.maxTtl);
      
      // Calculate entry size
      const entrySize = this.calculateEntrySize(data);
      
      // Check size limits
      if (entrySize > this.config.maxEntrySize) {
        console.warn(`Cache entry too large: ${entrySize} bytes (max: ${this.config.maxEntrySize})`);
        return;
      }
      
      const now = Date.now();
      const entry: CacheEntry = {
        data,
        cachedAt: now,
        expiresAt: now + (ttl * 1000),
        etag: options.etag,
        lastModified: options.lastModified,
        vary: options.vary,
        hitCount: 0,
        size: entrySize,
      };
      
      // Store in Redis with TTL
      const serializedEntry = JSON.stringify(entry);
      await this.redis.setex(cacheKey, ttl + 300, serializedEntry); // Add 5 minutes buffer
      
      // Update cache metadata
      await this.updateCacheMetadata(cacheKey, 'set');
      
    } catch (error) {
      console.error('Failed to set cache entry:', error);
      // Don't fail the operation if caching fails
    }
  }
  
  /**
   * Retrieve verify response from cache
   */
  async get(
    key: VerifyCacheKey,
    options: {
      ifNoneMatch?: string;
      ifModifiedSince?: string;
      allowStale?: boolean;
    } = {}
  ): Promise<{
    data?: any;
    hit: boolean;
    stale: boolean;
    etag?: string;
    lastModified?: string;
    age: number;
  }> {
    try {
      const cacheKey = this.generateCacheKey(key);
      const serializedEntry = await this.redis.get(cacheKey);
      
      if (!serializedEntry) {
        await this.updateCacheMetadata(cacheKey, 'miss');
        return { hit: false, stale: false, age: 0 };
      }
      
      const entry: CacheEntry = JSON.parse(serializedEntry);
      const now = Date.now();
      const age = Math.floor((now - entry.cachedAt) / 1000);
      const isExpired = now > entry.expiresAt;
      
      // Handle conditional requests
      if (options.ifNoneMatch && entry.etag) {
        if (options.ifNoneMatch === entry.etag) {
          await this.updateCacheMetadata(cacheKey, 'hit');
          return { hit: true, stale: false, etag: entry.etag, lastModified: entry.lastModified || undefined, age };
        }
      }
      
      if (options.ifModifiedSince && entry.lastModified) {
        const ifModifiedSince = new Date(options.ifModifiedSince).getTime();
        const lastModified = new Date(entry.lastModified).getTime();
        
        if (lastModified <= ifModifiedSince) {
          await this.updateCacheMetadata(cacheKey, 'hit');
          return { hit: true, stale: false, etag: entry.etag || undefined, lastModified: entry.lastModified, age };
        }
      }
      
      // Check if stale entry is allowed
      if (isExpired && !options.allowStale) {
        await this.updateCacheMetadata(cacheKey, 'miss');
        return { hit: false, stale: false, age };
      }
      
      // Update hit count
      entry.hitCount++;
      await this.redis.set(cacheKey, JSON.stringify(entry), 'EX', 300); // Refresh expiry
      
      await this.updateCacheMetadata(cacheKey, 'hit');
      
      return {
        data: entry.data,
        hit: true,
        stale: isExpired,
        etag: entry.etag || undefined,
        lastModified: entry.lastModified || undefined,
        age,
      };
      
    } catch (error) {
      console.error('Failed to get cache entry:', error);
      return { hit: false, stale: false, age: 0 };
    }
  }
  
  /**
   * Invalidate cache entries for a specific manifest
   * Called when manifest is updated or rotated
   */
  async invalidateManifest(_manifestHash: string): Promise<void> {
    try {
      // Find all cache keys for this manifest
      const pattern = `${this.config.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      
      const pipeline = this.redis.pipeline();
      let invalidatedCount = 0;
      
      for (const key of keys) {
        try {
          const serializedEntry = await this.redis.get(key);
          if (!serializedEntry) continue;
          
          const _entry: CacheEntry = JSON.parse(serializedEntry);
          const _cacheKeyParts = key.substring(this.config.keyPrefix.length);
          
          // Extract manifest hash from cache key (this would need proper implementation)
          // For now, we'll invalidate all entries when manifest rotation occurs
          pipeline.del(key);
          invalidatedCount++;
        } catch (parseError) {
          // Skip invalid entries
          continue;
        }
      }
      
      await pipeline.exec();
      console.log(`Invalidated ${invalidatedCount} cache entries for manifest rotation`);
      
    } catch (error) {
      console.error('Failed to invalidate manifest cache:', error);
    }
  }
  
  /**
   * Update cache metadata for monitoring
   */
  private async updateCacheMetadata(_cacheKey: string, operation: 'hit' | 'miss' | 'set'): Promise<void> {
    try {
      const metadataKey = `${this.config.keyPrefix}metadata`;
      const today = new Date().toISOString().split('T')[0];
      
      switch (operation) {
        case 'hit':
          await this.redis.hincrby(metadataKey, `hits:${today}`, 1);
          break;
        case 'miss':
          await this.redis.hincrby(metadataKey, `misses:${today}`, 1);
          break;
        case 'set':
          await this.redis.hincrby(metadataKey, `sets:${today}`, 1);
          break;
      }
      
      // Set expiry for metadata
      await this.redis.expire(metadataKey, 7 * 24 * 60 * 60); // 7 days
      
    } catch (error) {
      console.error('Failed to update cache metadata:', error);
    }
  }
  
  /**
   * Get cache performance metrics
   */
  async getMetrics(): Promise<{
    hits: number;
    misses: number;
    sets: number;
    hitRate: number;
    totalEntries: number;
  }> {
    try {
      const metadataKey = `${this.config.keyPrefix}metadata`;
      const today = new Date().toISOString().split('T')[0];
      
      const [hits, misses, sets] = await Promise.all([
        this.redis.hget(metadataKey, `hits:${today}`),
        this.redis.hget(metadataKey, `misses:${today}`),
        this.redis.hget(metadataKey, `sets:${today}`),
      ]);
      
      const hitsNum = parseInt(hits || '0');
      const missesNum = parseInt(misses || '0');
      const setsNum = parseInt(sets || '0');
      const total = hitsNum + missesNum;
      
      // Count total entries
      const pattern = `${this.config.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      const totalEntries = keys.filter(key => !key.includes('metadata')).length;
      
      return {
        hits: hitsNum,
        misses: missesNum,
        sets: setsNum,
        hitRate: total > 0 ? Math.round((hitsNum / total) * 100) / 100 : 0,
        totalEntries,
      };
      
    } catch (error) {
      console.error('Failed to get cache metrics:', error);
      return {
        hits: 0,
        misses: 0,
        sets: 0,
        hitRate: 0,
        totalEntries: 0,
      };
    }
  }
  
  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<number> {
    try {
      const pattern = `${this.config.keyPrefix}*`;
      const keys = await this.redis.keys(pattern);
      
      const pipeline = this.redis.pipeline();
      let cleanedCount = 0;
      
      for (const key of keys) {
        if (key.includes('metadata')) continue;
        
        try {
          const serializedEntry = await this.redis.get(key);
          if (serializedEntry) {
            const entry: CacheEntry = JSON.parse(serializedEntry);
            
            if (Date.now() > entry.expiresAt) {
              pipeline.del(key);
              cleanedCount++;
            }
          }
        } catch (parseError) {
          // Remove invalid entries
          pipeline.del(key);
          cleanedCount++;
        }
      }
      
      await pipeline.exec();
      console.log(`Cleaned up ${cleanedCount} expired cache entries`);
      
      return cleanedCount;
      
    } catch (error) {
      console.error('Failed to cleanup cache:', error);
      return 0;
    }
  }
  
  /**
   * Generate appropriate Cache-Control header
   */
  generateCacheHeader(options: {
    maxAge?: number;
    staleWhileRevalidate?: number;
    mustRevalidate?: boolean;
    private?: boolean;
  } = {}): string {
    const directives: string[] = [];
    
    if (options.maxAge !== undefined) {
      directives.push(`max-age=${options.maxAge}`);
    }
    
    if (options.staleWhileRevalidate !== undefined) {
      directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
    }
    
    if (options.mustRevalidate) {
      directives.push('must-revalidate');
    }
    
    if (options.private) {
      directives.push('private');
    } else {
      directives.push('public');
    }
    
    return directives.join(', ');
  }
}

/**
 * Cache middleware for Fastify
 */
export function createVerifyCacheMiddleware(cacheService: VerifyCacheService) {
  return async function verifyCacheMiddleware(request: any, reply: any): Promise<void> {
    // Only cache GET requests for verify endpoints
    if (request.method !== 'GET' || !request.url.includes('/verify')) {
      return;
    }
    
    try {
      const assetHash = request.query.asset_hash;
      const manifestHash = request.query.manifest_hash;
      const policyVersion = request.query.policy_version || '1.0';
      const validationOptions = JSON.stringify(request.query.validation_options || {});
      
      if (!assetHash || !manifestHash) {
        return;
      }
      
      const cacheKey: VerifyCacheKey = {
        assetHash,
        manifestHash,
        policyVersion,
        validationOptions,
      };
      
      // Check conditional headers
      const options: any = {};
      if (request.headers['if-none-match']) {
        options.ifNoneMatch = request.headers['if-none-match'];
      }
      if (request.headers['if-modified-since']) {
        options.ifModifiedSince = request.headers['if-modified-since'];
      }
      
      // Allow stale responses for high-load scenarios
      options.allowStale = true;
      
      const result = await cacheService.get(cacheKey, options);
      
      if (result.hit) {
        // Return cached response
        if (result.etag) {
          reply.header('ETag', result.etag);
        }
        if (result.lastModified) {
          reply.header('Last-Modified', result.lastModified);
        }
        
        reply.header('Age', result.age);
        reply.header('X-Cache', result.stale ? 'HIT-STALE' : 'HIT');
        
        // Return 304 if conditional request matches
        if (options.ifNoneMatch && result.etag === options.ifNoneMatch) {
          reply.status(304).send();
          return;
        }
        
        if (options.ifModifiedSince && result.lastModified) {
          const ifModifiedSince = new Date(options.ifModifiedSince).getTime();
          const lastModified = new Date(result.lastModified).getTime();
          
          if (lastModified <= ifModifiedSince) {
            reply.status(304).send();
            return;
          }
        }
        
        reply.send(result.data);
        return;
      }
      
      // Store response in cache after it's generated
      reply.addHook('onSend', async (_request: any, _reply: any, payload: any) => {
        if (payload && reply.statusCode === 200) {
          const cacheControl = cacheService.generateCacheHeader({
            maxAge: 300, // 5 minutes
            staleWhileRevalidate: 60, // 1 minute
            mustRevalidate: false,
            private: false,
          });
          
          reply.header('Cache-Control', cacheControl);
          reply.header('X-Cache', 'MISS');
          
          await cacheService.set(cacheKey, payload, {
            cacheControl,
            ttl: 300,
          });
        }
        
        return payload;
      });
      
    } catch (error) {
      console.error('Verify cache middleware error:', error);
      // Don't fail the request if caching fails
    }
  };
}
