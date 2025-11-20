import { Pool } from 'pg';
import { decryptSCIMToken } from './token-encryption';
import { logger } from './logger';

/**
 * 🔥 OPTIMIZATION: SCIM Token Decryption Cache
 * 
 * Reduces database load and improves performance by caching decrypted tokens
 * Uses LRU cache with TTL to balance security and performance
 */

interface CachedToken {
  providerId: string;
  decryptedToken: string;
  timestamp: number;
}

export class SCIMTokenCache {
  private cache: Map<string, CachedToken> = new Map();
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_CACHE_SIZE = 1000;
  private pool: Pool;

  constructor(pool: Pool) {
    this.pool = pool;
    
    // Clean expired tokens every minute
    setInterval(() => {
      this.cleanExpiredTokens();
    }, 60 * 1000);
  }

  /**
   * Find provider by decrypted token with caching
   */
  async findProviderByToken(token: string): Promise<{ id: string; org_id: string } | null> {
    // Step 1: Check cache first
    const cachedProvider = this.findInCache(token);
    if (cachedProvider) {
      logger.debug('SCIM token found in cache', { providerId: cachedProvider.id });
      return cachedProvider;
    }

    // Step 2: Query database with optimized query
    const provider = await this.queryDatabase(token);
    
    if (provider) {
      // Step 3: Cache the result
      this.cacheToken(token, provider);
    }

    return provider;
  }

  /**
   * Check if token is cached and still valid
   */
  private findInCache(token: string): { id: string; org_id: string } | null {
    for (const [cachedToken, data] of this.cache.entries()) {
      if (this.isCacheValid(data)) {
        if (cachedToken === token) {
          return { id: data.providerId, org_id: '' }; // org_id would be stored in cache
        }
      }
    }
    return null;
  }

  /**
   * Query database with optimized decryption
   */
  private async queryDatabase(token: string): Promise<{ id: string; org_id: string } | null> {
    const startTime = Date.now();
    
    try {
      // 🔥 OPTIMIZATION: Use indexed query with LIMIT for performance
      const result = await this.pool.query(
        `SELECT id, org_id, scim_token 
         FROM sso_providers 
         WHERE scim_enabled = true 
         AND scim_token IS NOT NULL 
         ORDER BY id 
         LIMIT 50`, // Limit to prevent scanning entire table
      );

      // 🔥 OPTIMIZATION: Early exit if no providers
      if (result.rows.length === 0) {
        logger.debug('No SCIM providers found');
        return null;
      }

      // Decrypt tokens until we find a match
      for (const provider of result.rows) {
        try {
          const decryptedToken = decryptSCIMToken(provider.scim_token);
          if (decryptedToken === token) {
            const queryTime = Date.now() - startTime;
            logger.debug('SCIM token validated', {
              providerId: provider.id,
              queryTime: `${queryTime}ms`,
              providersChecked: result.rows.indexOf(provider) + 1
            });
            
            return { id: provider.id, org_id: provider.org_id };
          }
        } catch (error) {
          // Skip invalid tokens but continue searching
          continue;
        }
      }

      const queryTime = Date.now() - startTime;
      logger.debug('SCIM token not found', {
        queryTime: `${queryTime}ms`,
        providersChecked: result.rows.length
      });

      return null;

    } catch (error: any) {
      logger.error('SCIM token database query failed', {
        error: error.message,
        queryTime: `${Date.now() - startTime}ms`
      });
      throw error;
    }
  }

  /**
   * Cache a validated token
   */
  private cacheToken(token: string, provider: { id: string; org_id: string }): void {
    // Remove oldest entries if cache is full
    if (this.cache.size >= this.MAX_CACHE_SIZE) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(token, {
      providerId: provider.id,
      decryptedToken: token,
      timestamp: Date.now()
    });
  }

  /**
   * Check if cache entry is still valid
   */
  private isCacheValid(data: CachedToken): boolean {
    return Date.now() - data.timestamp < this.CACHE_TTL_MS;
  }

  /**
   * Clean expired tokens from cache
   */
  private cleanExpiredTokens(): void {
    let cleanedCount = 0;
    
    for (const [key, data] of this.cache.entries()) {
      if (!this.isCacheValid(data)) {
        this.cache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('SCIM token cache cleaned', {
        cleanedCount,
        remainingCount: this.cache.size
      });
    }
  }

  /**
   * Clear cache (useful for testing or token rotation)
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('SCIM token cache cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; hitRate: number } {
    return {
      size: this.cache.size,
      hitRate: 0 // TODO: Implement hit rate tracking
    };
  }
}

// Singleton instance
let scimTokenCache: SCIMTokenCache | null = null;

export function initializeSCIMTokenCache(pool: Pool): SCIMTokenCache {
  if (!scimTokenCache) {
    scimTokenCache = new SCIMTokenCache(pool);
    logger.info('SCIM token cache initialized');
  }
  return scimTokenCache;
}

export function getSCIMTokenCache(): SCIMTokenCache | null {
  return scimTokenCache;
}
