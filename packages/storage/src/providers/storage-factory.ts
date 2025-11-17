import { 
  S3StorageProvider,
  R2StorageProvider,
  StorageConfig,
  StorageOptions,
  StorageResult,
  StorageStats,
  HealthCheckResult
} from './s3-provider';

// Re-export provider classes
export { S3StorageProvider, R2StorageProvider };

/**
 * Storage Provider Interface
 */
export interface StorageProvider {
  store(key: string, data: Buffer | string, options?: StorageOptions): Promise<StorageResult>;
  retrieve(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
  exists(key: string): Promise<boolean>;
  list(prefix?: string): Promise<Array<{ key: string; size: number; lastModified: Date }>>;
  getStats(): Promise<StorageStats>;
  healthCheck(): Promise<HealthCheckResult>;
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;
}

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
      return this.instances.get(cacheKey)!;
    }

    let provider: StorageProvider;

    switch (config.provider) {
      case 's3':
        provider = new S3StorageProvider(config);
        break;
      case 'r2':
        provider = new R2StorageProvider(config);
        break;
      default:
        throw new Error(`Unsupported storage provider: ${config.provider}`);
    }

    // Cache the instance
    this.instances.set(cacheKey, provider);

    return provider;
  }

  /**
   * Get cached instance or create new one
   */
  static getOrCreate(config: StorageConfig): StorageProvider {
    return this.create(config);
  }

  /**
   * Clear cached instances
   */
  static clearCache(): void {
    this.instances.clear();
  }

  /**
   * Get cache key for configuration
   */
  private static getCacheKey(config: StorageConfig): string {
    return `${config.provider}:${config.bucket}:${config.region || 'default'}:${config.endpoint || 'default'}`;
  }

  /**
   * Create provider with environment variables
   */
  static createFromEnv(provider: 's3' | 'r2'): StorageProvider {
    const config: StorageConfig = {
      provider,
      bucket: process.env.STORAGE_BUCKET!,
      region: process.env.STORAGE_REGION,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    };

    if (provider === 'r2') {
      config.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
      config.endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;
    }

    return this.create(config);
  }

  /**
   * Test provider configuration
   */
  static async testConfig(config: StorageConfig): Promise<boolean> {
    try {
      const provider = this.create(config);
      const health = await provider.healthCheck();
      return health.healthy;
    } catch {
      return false;
    }
  }
}

// Re-export types for backward compatibility
export type {
  StorageConfig,
  StorageOptions,
  StorageResult,
  StorageStats,
  HealthCheckResult
} from './s3-provider';

// Storage Error Classes
export class StorageError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
    this.name = 'StorageError';
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(key: string) {
    super(`Storage item not found: ${key}`, 'NOT_FOUND');
    this.name = 'StorageNotFoundError';
  }
}

export class StorageAccessDeniedError extends StorageError {
  constructor(message: string) {
    super(`Access denied: ${message}`, 'ACCESS_DENIED');
    this.name = 'StorageAccessDeniedError';
  }
}
