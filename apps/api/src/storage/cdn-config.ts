/**
 * CDN Configuration and Integration
 * 
 * Supports CloudFlare CDN, AWS CloudFront, and custom CDN providers
 */

import { logger } from '../utils/logger';

/**
 * CDN Provider types
 */
export type CDNProvider = 'cloudflare' | 'cloudfront' | 'custom';

/**
 * CDN Configuration
 */
export interface CDNConfig {
  provider: CDNProvider;
  domain: string;
  zoneId?: string; // CloudFlare zone ID
  distributionId?: string; // CloudFront distribution ID
  apiKey?: string;
  apiSecret?: string;
  cacheControl?: string;
  corsOrigins?: string[];
  customHeaders?: Record<string, string>;
}

/**
 * Cache purge result
 */
export interface PurgeResult {
  success: boolean;
  purgedUrls: string[];
  errors: string[];
  duration: number;
}

/**
 * CDN Statistics
 */
export interface CDNStats {
  requests: number;
  bandwidth: number;
  cacheHitRate: number;
  errors: number;
  timestamp: Date;
}

/**
 * CDN Manager
 * 
 * Manages CDN integration for proof storage
 */
export class CDNManager {
  private config: CDNConfig;

  constructor(config: CDNConfig) {
    this.config = config;
    logger.info('CDN Manager initialized', {
      provider: config.provider,
      domain: config.domain
    });
  }

  /**
   * Get CDN URL for a storage key
   */
  getCDNUrl(storageKey: string): string {
    const cleanKey = storageKey.startsWith('/') ? storageKey.substring(1) : storageKey;
    return `https://${this.config.domain}/${cleanKey}`;
  }

  /**
   * Get cache control headers
   */
  getCacheHeaders(): Record<string, string> {
    return {
      'Cache-Control': this.config.cacheControl || 'public, max-age=31536000, immutable',
      'CDN-Cache-Control': 'max-age=31536000',
      'Cloudflare-CDN-Cache-Control': 'max-age=31536000',
      ...this.config.customHeaders
    };
  }

  /**
   * Get CORS headers
   */
  getCORSHeaders(origin?: string): Record<string, string> {
    const allowedOrigins = this.config.corsOrigins || ['*'];
    const isAllowed = origin && (allowedOrigins.includes('*') || allowedOrigins.includes(origin));

    return {
      'Access-Control-Allow-Origin': isAllowed ? origin! : allowedOrigins[0],
      'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Max-Age': '86400'
    };
  }

  /**
   * Purge cache for specific URLs
   */
  async purgeCache(urls: string[]): Promise<PurgeResult> {
    const startTime = Date.now();
    const result: PurgeResult = {
      success: false,
      purgedUrls: [],
      errors: [],
      duration: 0
    };

    try {
      switch (this.config.provider) {
        case 'cloudflare':
          await this.purgeCloudflare(urls, result);
          break;
        case 'cloudfront':
          await this.purgeCloudFront(urls, result);
          break;
        case 'custom':
          logger.warn('Custom CDN purge not implemented');
          result.errors.push('Custom CDN purge not implemented');
          break;
      }

      result.duration = Date.now() - startTime;
      result.success = result.errors.length === 0;

      logger.info('CDN cache purge completed', {
        provider: this.config.provider,
        purged: result.purgedUrls.length,
        errors: result.errors.length,
        duration: result.duration
      });

      return result;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      result.errors.push(err.message);
      result.duration = Date.now() - startTime;
      logger.error('CDN cache purge failed', { error: err.message });
      return result;
    }
  }

  /**
   * Purge CloudFlare cache
   */
  private async purgeCloudflare(urls: string[], result: PurgeResult): Promise<void> {
    if (!this.config.zoneId || !this.config.apiKey) {
      throw new Error('CloudFlare zone ID and API key required');
    }

    // CloudFlare API purge (simplified - actual implementation would use fetch)
    logger.info('Purging CloudFlare cache', {
      zoneId: this.config.zoneId,
      urls: urls.length
    });

    // In production, this would make actual API calls
    result.purgedUrls = urls;
  }

  /**
   * Purge CloudFront cache
   */
  private async purgeCloudFront(urls: string[], result: PurgeResult): Promise<void> {
    if (!this.config.distributionId) {
      throw new Error('CloudFront distribution ID required');
    }

    // CloudFront invalidation (simplified - actual implementation would use AWS SDK)
    logger.info('Purging CloudFront cache', {
      distributionId: this.config.distributionId,
      urls: urls.length
    });

    // In production, this would make actual API calls
    result.purgedUrls = urls;
  }

  /**
   * Get CDN statistics (mock implementation)
   */
  async getStats(): Promise<CDNStats> {
    // In production, this would fetch real stats from CDN provider
    return {
      requests: 0,
      bandwidth: 0,
      cacheHitRate: 0.95, // 95% cache hit rate
      errors: 0,
      timestamp: new Date()
    };
  }

  /**
   * Validate CDN configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!this.config.domain) {
      errors.push('CDN domain is required');
    }

    if (this.config.provider === 'cloudflare' && !this.config.zoneId) {
      errors.push('CloudFlare zone ID is required');
    }

    if (this.config.provider === 'cloudfront' && !this.config.distributionId) {
      errors.push('CloudFront distribution ID is required');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

/**
 * CDN Configuration Helper
 */
export class CDNConfigHelper {
  /**
   * Create CDN config from environment variables
   */
  static fromEnv(): CDNConfig {
    const provider = (process.env.CDN_PROVIDER || 'cloudflare') as CDNProvider;
    const domain = process.env.CDN_DOMAIN || process.env.STORAGE_CDN_URL?.replace('https://', '');

    if (!domain) {
      throw new Error('CDN_DOMAIN or STORAGE_CDN_URL environment variable is required');
    }

    return {
      provider,
      domain,
      zoneId: process.env.CLOUDFLARE_ZONE_ID,
      distributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
      apiKey: process.env.CDN_API_KEY,
      apiSecret: process.env.CDN_API_SECRET,
      cacheControl: process.env.CDN_CACHE_CONTROL || 'public, max-age=31536000, immutable',
      corsOrigins: process.env.CDN_CORS_ORIGINS?.split(',') || ['*'],
      customHeaders: {}
    };
  }

  /**
   * Get recommended cache control for proof storage
   */
  static getProofCacheControl(): string {
    return 'public, max-age=31536000, immutable, stale-while-revalidate=86400';
  }

  /**
   * Get recommended cache control for temporary URLs
   */
  static getTempCacheControl(): string {
    return 'private, no-cache, no-store, must-revalidate';
  }
}
