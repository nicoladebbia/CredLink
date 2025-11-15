/**
 * Storage Provider Interface
 * 
 * Abstraction for multi-cloud storage providers (S3, R2, etc.)
 * Provides unified interface for proof storage operations
 */

/**
 * Storage options for storing data
 */
export interface StorageOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  storageClass?: 'STANDARD' | 'REDUCED_REDUNDANCY' | 'GLACIER' | 'INTELLIGENT_TIERING';
  compress?: boolean;
  encryption?: boolean;
  tags?: Record<string, string>;
}

/**
 * Storage result after successful store operation
 */
export interface StorageResult {
  key: string;
  url: string;
  etag?: string;
  versionId?: string;
  size: number;
  timestamp: Date;
  provider: string;
}

/**
 * Storage item metadata
 */
export interface StorageItem {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
  storageClass?: string;
  metadata?: Record<string, string>;
}

/**
 * Storage statistics
 */
export interface StorageStats {
  totalObjects: number;
  totalSize: number;
  provider: string;
  region?: string;
  lastUpdated: Date;
}

/**
 * Storage health check result
 */
export interface HealthCheckResult {
  healthy: boolean;
  provider: string;
  latency: number;
  errors: string[];
  timestamp: Date;
}

/**
 * Storage Provider Interface
 * 
 * All storage providers must implement this interface
 */
export interface StorageProvider {
  /**
   * Store data in storage
   */
  store(key: string, data: Buffer, options?: StorageOptions): Promise<StorageResult>;

  /**
   * Retrieve data from storage
   */
  retrieve(key: string): Promise<Buffer | null>;

  /**
   * Delete data from storage
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if key exists in storage
   */
  exists(key: string): Promise<boolean>;

  /**
   * List objects with optional prefix
   */
  list(prefix?: string, maxKeys?: number): Promise<StorageItem[]>;

  /**
   * Get signed URL for temporary access
   */
  getSignedUrl(key: string, expiresIn?: number): Promise<string>;

  /**
   * Get storage statistics
   */
  getStats(): Promise<StorageStats>;

  /**
   * Health check
   */
  healthCheck(): Promise<HealthCheckResult>;

  /**
   * Get provider name
   */
  getProviderName(): string;

  /**
   * Copy object within storage
   */
  copy(sourceKey: string, destinationKey: string): Promise<StorageResult>;

  /**
   * Move object within storage
   */
  move(sourceKey: string, destinationKey: string): Promise<StorageResult>;

  /**
   * Batch delete objects
   */
  batchDelete(keys: string[]): Promise<{ deleted: string[]; failed: string[] }>;

  /**
   * Get object metadata without downloading
   */
  getMetadata(key: string): Promise<StorageItem | null>;
}

/**
 * Storage provider configuration
 */
export interface StorageConfig {
  provider: 's3' | 'r2' | 'local';
  region?: string;
  bucket?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  endpoint?: string;
  accountId?: string; // For Cloudflare R2
  localPath?: string; // For local storage
  cdnUrl?: string;
  maxRetries?: number;
  timeout?: number;
}

/**
 * Storage error types
 */
export class StorageError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(key: string, provider: string) {
    super(`Object not found: ${key}`, 'NOT_FOUND', provider, 404);
    this.name = 'StorageNotFoundError';
  }
}

export class StorageAccessDeniedError extends StorageError {
  constructor(message: string, provider: string) {
    super(message, 'ACCESS_DENIED', provider, 403);
    this.name = 'StorageAccessDeniedError';
  }
}

export class StorageQuotaExceededError extends StorageError {
  constructor(message: string, provider: string) {
    super(message, 'QUOTA_EXCEEDED', provider, 507);
    this.name = 'StorageQuotaExceededError';
  }
}
