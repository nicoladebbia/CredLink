import { LRUCacheFactory } from '@credlink/cache';
import { logger } from '../utils/logger';

/**
 * Cache Entry
 */
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  size: number;
  hits: number;
}

/**
 * Cache Statistics
 */
export interface CacheStats {
  l1: {
    size: number;
    maxSize: number;
    hits: number;
    misses: number;
    hitRate: number;
    evictions: number;
  };
  l2?: {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
  l3?: {
    size: number;
    hits: number;
    misses: number;
    hitRate: number;
  };
  overall: {
    totalHits: number;
    totalMisses: number;
    overallHitRate: number;
  };
}

/**
 * Multi-Layer Cache Manager
 * 
 * Implements L1 (in-memory LRU), L2 (Redis - optional), L3 (warm storage)
 */
export class CacheManager<T> {
  private l1Cache = LRUCacheFactory.createPermissionCache({ maxSize: 1000, ttlMs: 300000 });
  private l1Stats: {
    hits: number;
    misses: number;
    evictions: number;
  };
  
  // L2 and L3 would be implemented here in production
  private l2Enabled: boolean = false;
  private l3Enabled: boolean = false;

  constructor(options: {
    maxSize?: number;
    ttl?: number;
    enableL2?: boolean;
    enableL3?: boolean;
  } = {}) {
    const {
      maxSize = parseInt(process.env.CACHE_MAX_SIZE || '1000'),
      ttl = parseInt(process.env.CACHE_TTL_MS || '3600000'), // 1 hour
      enableL2 = false,
      enableL3 = false
    } = options;

    // L1 cache is already initialized via LRUCacheFactory.createPermissionCache()

    this.l1Stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };

    this.l2Enabled = enableL2;
    this.l3Enabled = enableL3;

    logger.info('Cache Manager initialized', {
      l1MaxSize: maxSize,
      l1TTL: ttl,
      l2Enabled: enableL2,
      l3Enabled: enableL3
    });
  }

  /**
   * Get value from cache (checks all layers)
   */
  async get(key: string): Promise<T | null> {
    // L1 Cache (fastest)
    const l1Result = this.l1Cache.get(key);
    if (l1Result) {
      l1Result.hits++;
      this.l1Stats.hits++;
      
      logger.debug('L1 cache hit', { key });
      return l1Result.data;
    }

    this.l1Stats.misses++;

    // L2 Cache (Redis - if enabled)
    if (this.l2Enabled) {
      const l2Result = await this.getFromL2(key);
      if (l2Result) {
        // Promote to L1
        await this.setL1(key, l2Result);
        logger.debug('L2 cache hit, promoted to L1', { key });
        return l2Result;
      }
    }

    // L3 Cache (warm storage - if enabled)
    if (this.l3Enabled) {
      const l3Result = await this.getFromL3(key);
      if (l3Result) {
        // Promote to L1 and L2
        await this.setL1(key, l3Result);
        if (this.l2Enabled) {
          await this.setL2(key, l3Result);
        }
        logger.debug('L3 cache hit, promoted to L1/L2', { key });
        return l3Result;
      }
    }

    return null;
  }

  /**
   * Set value in cache (writes to all layers)
   */
  async set(key: string, value: T, size?: number): Promise<void> {
    const actualSize = size || this.estimateSize(value);

    // Write to L1
    await this.setL1(key, value, actualSize);

    // Write to L2 (if enabled)
    if (this.l2Enabled) {
      await this.setL2(key, value);
    }

    // Write to L3 (if enabled)
    if (this.l3Enabled) {
      await this.setL3(key, value);
    }

    logger.debug('Value cached in all layers', {
      key,
      size: actualSize,
      l2: this.l2Enabled,
      l3: this.l3Enabled
    });
  }

  /**
   * Delete from all cache layers
   */
  async delete(key: string): Promise<boolean> {
    let deleted = false;

    // Delete from L1
    deleted = this.l1Cache.delete(key) || deleted;

    // Delete from L2 (if enabled)
    if (this.l2Enabled) {
      deleted = await this.deleteFromL2(key) || deleted;
    }

    // Delete from L3 (if enabled)
    if (this.l3Enabled) {
      deleted = await this.deleteFromL3(key) || deleted;
    }

    if (deleted) {
      logger.debug('Value deleted from all cache layers', { key });
    }

    return deleted;
  }

  /**
   * Check if key exists in any cache layer
   */
  async has(key: string): Promise<boolean> {
    // Check L1
    if (this.l1Cache.has(key)) {
      return true;
    }

    // Check L2 (if enabled)
    if (this.l2Enabled && await this.hasInL2(key)) {
      return true;
    }

    // Check L3 (if enabled)
    if (this.l3Enabled && await this.hasInL3(key)) {
      return true;
    }

    return false;
  }

  /**
   * Clear all cache layers
   */
  async clear(): Promise<void> {
    this.l1Cache.clear();
    
    if (this.l2Enabled) {
      await this.clearL2();
    }
    
    if (this.l3Enabled) {
      await this.clearL3();
    }

    this.l1Stats = {
      hits: 0,
      misses: 0,
      evictions: 0
    };

    logger.info('All cache layers cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const l1HitRate = this.l1Stats.hits + this.l1Stats.misses > 0
      ? this.l1Stats.hits / (this.l1Stats.hits + this.l1Stats.misses)
      : 0;

    return {
      l1: {
        size: this.l1Cache.size,
        maxSize: 1000, // Fixed value since LRUCache doesn't expose maxSize property
        hits: this.l1Stats.hits,
        misses: this.l1Stats.misses,
        hitRate: l1HitRate,
        evictions: this.l1Stats.evictions
      },
      overall: {
        totalHits: this.l1Stats.hits,
        totalMisses: this.l1Stats.misses,
        overallHitRate: l1HitRate
      }
    };
  }

  /**
   * Get most accessed keys
   */
  getMostAccessed(limit: number = 10): Array<{ key: string; hits: number }> {
    const entries: Array<{ key: string; hits: number }> = [];

    for (const [key, entry] of this.l1Cache.entries()) {
      entries.push({ key, hits: entry.hits });
    }

    return entries
      .sort((a, b) => b.hits - a.hits)
      .slice(0, limit);
  }

  /**
   * Warm up cache with frequently accessed data
   */
  async warmup(keys: string[], fetcher: (key: string) => Promise<T | null>): Promise<number> {
    let warmed = 0;

    for (const key of keys) {
      try {
        const value = await fetcher(key);
        if (value) {
          await this.set(key, value);
          warmed++;
        }
      } catch (error) {
        logger.warn('Failed to warm up cache key', { key, error });
      }
    }

    logger.info('Cache warmup completed', {
      requested: keys.length,
      warmed
    });

    return warmed;
  }

  // L1 Cache Operations
  private async setL1(key: string, value: T, size?: number): Promise<void> {
    const actualSize = size || this.estimateSize(value);
    
    this.l1Cache.set(key, {
      data: value,
      timestamp: Date.now(),
      size: actualSize,
      hits: 0
    });
  }

  // L2 Cache Operations (Redis - stub for now)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async getFromL2(_key: string): Promise<T | null> {
    // In production: await redis.get(key)
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async setL2(_key: string, _value: T): Promise<void> {
    // In production: await redis.set(key, JSON.stringify(value), 'EX', ttl)
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async deleteFromL2(_key: string): Promise<boolean> {
    // In production: await redis.del(key)
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async hasInL2(_key: string): Promise<boolean> {
    // In production: await redis.exists(key)
    return false;
  }

  private async clearL2(): Promise<void> {
    // In production: await redis.flushdb()
  }

  // L3 Cache Operations (warm storage - stub for now)
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async getFromL3(_key: string): Promise<T | null> {
    // In production: fetch from warm storage tier
    return null;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async setL3(_key: string, _value: T): Promise<void> {
    // In production: write to warm storage tier
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async deleteFromL3(_key: string): Promise<boolean> {
    // In production: delete from warm storage
    return false;
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  private async hasInL3(_key: string): Promise<boolean> {
    // In production: check warm storage
    return false;
  }

  private async clearL3(): Promise<void> {
    // In production: clear warm storage
  }

  // Utility
  private estimateSize(value: T): number {
    try {
      return JSON.stringify(value).length;
    } catch {
      return 1024; // Default 1KB estimate
    }
  }
}
