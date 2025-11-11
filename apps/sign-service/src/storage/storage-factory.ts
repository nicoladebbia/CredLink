import { 
  StorageProvider, 
  StorageConfig, 
  StorageOptions, 
  StorageResult, 
  StorageItem, 
  StorageStats, 
  HealthCheckResult 
} from './storage-provider';
import { S3StorageProvider } from './s3-storage-provider';
import { R2StorageProvider } from './r2-storage-provider';
import { logger } from '../utils/logger';

/**
 * Storage Factory
 * 
 * Creates and manages storage provider instances
 * Supports multiple providers with fallback
 */
export class StorageFactory {
  private static instances: Map<string, StorageProvider> = new Map();

  /**
   * Create storage provider from configuration
   */
  static create(config: StorageConfig): StorageProvider {
    const cacheKey = this.getCacheKey(config);

    // Return cached instance if exists
    if (this.instances.has(cacheKey)) {
      logger.debug('Returning cached storage provider', { provider: config.provider });
      return this.instances.get(cacheKey)!;
    }

    // Create new instance
    let provider: StorageProvider;

    switch (config.provider) {
      case 's3':
        provider = new S3StorageProvider(config);
        break;

      case 'r2':
        provider = new R2StorageProvider(config);
        break;

      case 'local':
        throw new Error('Local storage provider not yet implemented');

      default:
        throw new Error(`Unknown storage provider: ${config.provider}`);
    }

    // Cache the instance
    this.instances.set(cacheKey, provider);

    logger.info('Storage provider created', {
      provider: config.provider,
      cached: true
    });

    return provider;
  }

  /**
   * Create storage provider from environment variables
   */
  static fromEnv(): StorageProvider {
    const provider = process.env.STORAGE_PROVIDER as 's3' | 'r2' | 'local' || 's3';

    const config: StorageConfig = {
      provider,
      region: process.env.STORAGE_REGION || 'us-east-1',
      bucket: process.env.STORAGE_BUCKET,
      accessKeyId: process.env.STORAGE_ACCESS_KEY_ID || process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.STORAGE_SECRET_ACCESS_KEY || process.env.AWS_SECRET_ACCESS_KEY,
      endpoint: process.env.STORAGE_ENDPOINT,
      accountId: process.env.R2_ACCOUNT_ID,
      cdnUrl: process.env.STORAGE_CDN_URL,
      maxRetries: parseInt(process.env.STORAGE_MAX_RETRIES || '3'),
      timeout: parseInt(process.env.STORAGE_TIMEOUT || '30000'),
    };

    return this.create(config);
  }

  /**
   * Create multi-provider setup with fallback
   */
  static createWithFallback(
    primaryConfig: StorageConfig,
    fallbackConfig: StorageConfig
  ): MultiProviderStorage {
    const primary = this.create(primaryConfig);
    const fallback = this.create(fallbackConfig);

    return new MultiProviderStorage(primary, fallback);
  }

  /**
   * Clear cached instances
   */
  static clearCache(): void {
    this.instances.clear();
    logger.info('Storage provider cache cleared');
  }

  /**
   * Get cache key for configuration
   */
  private static getCacheKey(config: StorageConfig): string {
    return `${config.provider}-${config.bucket || 'default'}-${config.region || 'default'}`;
  }
}

/**
 * Multi-Provider Storage
 * 
 * Provides automatic fallback between storage providers
 */
export class MultiProviderStorage implements StorageProvider {
  constructor(
    private primary: StorageProvider,
    private fallback: StorageProvider
  ) {
    logger.info('Multi-provider storage initialized', {
      primary: primary.getProviderName(),
      fallback: fallback.getProviderName()
    });
  }

  async store(key: string, data: Buffer, options?: StorageOptions): Promise<StorageResult> {
    try {
      return await this.primary.store(key, data, options);
    } catch (error) {
      logger.warn('Primary storage failed, using fallback', {
        primary: this.primary.getProviderName(),
        error
      });
      return await this.fallback.store(key, data, options);
    }
  }

  async retrieve(key: string): Promise<Buffer | null> {
    try {
      return await this.primary.retrieve(key);
    } catch (error) {
      logger.warn('Primary retrieval failed, using fallback', {
        primary: this.primary.getProviderName()
      });
      return await this.fallback.retrieve(key);
    }
  }

  async delete(key: string): Promise<boolean> {
    // Delete from both providers
    const results = await Promise.allSettled([
      this.primary.delete(key),
      this.fallback.delete(key)
    ]);

    return results.some(r => r.status === 'fulfilled' && r.value === true);
  }

  async exists(key: string): Promise<boolean> {
    // Check primary first, then fallback
    const primaryExists = await this.primary.exists(key);
    if (primaryExists) return true;

    return await this.fallback.exists(key);
  }

  async list(prefix?: string, maxKeys?: number): Promise<StorageItem[]> {
    try {
      return await this.primary.list(prefix, maxKeys);
    } catch (error) {
      return await this.fallback.list(prefix, maxKeys);
    }
  }

  async getSignedUrl(key: string, expiresIn?: number): Promise<string> {
    try {
      return await this.primary.getSignedUrl(key, expiresIn);
    } catch (error) {
      return await this.fallback.getSignedUrl(key, expiresIn);
    }
  }

  async getStats(): Promise<StorageStats> {
    const [primaryStats, fallbackStats] = await Promise.all([
      this.primary.getStats(),
      this.fallback.getStats()
    ]);

    // Return combined stats
    return {
      totalObjects: primaryStats.totalObjects + fallbackStats.totalObjects,
      totalSize: primaryStats.totalSize + fallbackStats.totalSize,
      provider: `multi:${primaryStats.provider}+${fallbackStats.provider}`,
      lastUpdated: new Date()
    };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const [primaryHealth, fallbackHealth] = await Promise.all([
      this.primary.healthCheck(),
      this.fallback.healthCheck()
    ]);

    // Return combined health check
    return {
      healthy: primaryHealth.healthy || fallbackHealth.healthy,
      provider: this.getProviderName(),
      latency: Math.min(primaryHealth.latency, fallbackHealth.latency),
      errors: [...primaryHealth.errors, ...fallbackHealth.errors],
      timestamp: new Date()
    };
  }

  getProviderName(): string {
    return `multi:${this.primary.getProviderName()}+${this.fallback.getProviderName()}`;
  }

  async copy(sourceKey: string, destinationKey: string): Promise<StorageResult> {
    return await this.primary.copy(sourceKey, destinationKey);
  }

  async move(sourceKey: string, destinationKey: string): Promise<StorageResult> {
    return await this.primary.move(sourceKey, destinationKey);
  }

  async batchDelete(keys: string[]): Promise<{ deleted: string[]; failed: string[] }> {
    const [primaryResult, fallbackResult] = await Promise.all([
      this.primary.batchDelete(keys),
      this.fallback.batchDelete(keys)
    ]);

    // Combine results from both providers
    return {
      deleted: [...new Set([...primaryResult.deleted, ...fallbackResult.deleted])],
      failed: primaryResult.failed.filter(key => fallbackResult.failed.includes(key))
    };
  }

  async getMetadata(key: string): Promise<StorageItem | null> {
    const metadata = await this.primary.getMetadata(key);
    if (metadata) return metadata;

    return await this.fallback.getMetadata(key);
  }
}
