import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { gzipSync, gunzipSync } from 'zlib';
import {
  StorageProvider,
  StorageOptions,
  StorageResult,
  StorageItem,
  StorageStats,
  HealthCheckResult,
  StorageConfig,
  StorageError,
  StorageNotFoundError,
  StorageAccessDeniedError,
} from './storage-provider';
import { logger } from '../utils/logger';

/**
 * AWS S3 Storage Provider
 * 
 * Production-grade S3 implementation with:
 * - Automatic retries
 * - Compression support
 * - Encryption
 * - Signed URLs
 * - Batch operations
 * - Health monitoring
 */
export class S3StorageProvider implements StorageProvider {
  private client: S3Client;
  private bucket: string;
  private region: string;
  private cdnUrl?: string;

  constructor(config: StorageConfig) {
    if (!config.bucket) {
      throw new Error('S3 bucket is required');
    }

    this.bucket = config.bucket;
    this.region = config.region || 'us-east-1';
    this.cdnUrl = config.cdnUrl;

    this.client = new S3Client({
      region: this.region,
      credentials: config.accessKeyId && config.secretAccessKey ? {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      } : undefined,
      maxAttempts: config.maxRetries || 3,
      requestHandler: {
        requestTimeout: config.timeout || 30000,
      },
    });

    logger.info('S3 Storage Provider initialized', {
      bucket: this.bucket,
      region: this.region,
      hasCdn: !!this.cdnUrl
    });
  }

  /**
   * Store data in S3
   */
  async store(key: string, data: Buffer, options: StorageOptions = {}): Promise<StorageResult> {
    try {
      const startTime = Date.now();

      // Compress if requested
      let finalData = data;
      const metadata: Record<string, string> = { ...options.metadata };

      if (options.compress) {
        finalData = gzipSync(data);
        metadata['x-compression'] = 'gzip';
        metadata['x-original-size'] = data.length.toString();
      }

      const command = new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: finalData,
        ContentType: options.contentType || 'application/json',
        CacheControl: options.cacheControl || 'public, max-age=31536000, immutable',
        Metadata: metadata,
        ServerSideEncryption: options.encryption !== false ? 'AES256' : undefined,
        StorageClass: options.storageClass || 'STANDARD',
        Tagging: options.tags ? this.formatTags(options.tags) : undefined,
      });

      const response = await this.client.send(command);

      const duration = Date.now() - startTime;
      logger.info('S3 store successful', {
        key,
        size: finalData.length,
        compressed: options.compress,
        duration
      });

      return {
        key,
        url: this.getPublicUrl(key),
        etag: response.ETag,
        versionId: response.VersionId,
        size: finalData.length,
        timestamp: new Date(),
        provider: 's3'
      };
    } catch (error) {
      this.handleError(error, 'store', key);
      throw error; // TypeScript needs this
    }
  }

  /**
   * Retrieve data from S3
   */
  async retrieve(key: string): Promise<Buffer | null> {
    try {
      const startTime = Date.now();

      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        return null;
      }

      // Convert stream to buffer
      const chunks: Uint8Array[] = [];
      const body = response.Body as AsyncIterable<Uint8Array>;
      for await (const chunk of body) {
        chunks.push(chunk);
      }
      let data = Buffer.concat(chunks);

      // Decompress if needed
      if (response.Metadata?.['x-compression'] === 'gzip') {
        data = gunzipSync(data);
      }

      const duration = Date.now() - startTime;
      logger.debug('S3 retrieve successful', {
        key,
        size: data.length,
        duration
      });

      return data;
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err.name === 'NoSuchKey') {
        return null;
      }
      this.handleError(error, 'retrieve', key);
      throw error;
    }
  }

  /**
   * Delete object from S3
   */
  async delete(key: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);

      logger.info('S3 delete successful', { key });
      return true;
    } catch (error) {
      this.handleError(error, 'delete', key);
      return false;
    }
  }

  /**
   * Check if object exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await this.client.send(command);
      return true;
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err.name === 'NotFound' || err.name === 'NoSuchKey') {
        return false;
      }
      this.handleError(error, 'exists', key);
      return false;
    }
  }

  /**
   * List objects with prefix
   */
  async list(prefix?: string, maxKeys: number = 1000): Promise<StorageItem[]> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.client.send(command);

      return (response.Contents || []).map(item => ({
        key: item.Key!,
        size: item.Size || 0,
        lastModified: item.LastModified || new Date(),
        etag: item.ETag,
        storageClass: item.StorageClass,
      }));
    } catch (error) {
      this.handleError(error, 'list', prefix || '');
      return [];
    }
  }

  /**
   * Get signed URL for temporary access
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const url = await getSignedUrl(this.client, command, { expiresIn });

      logger.debug('Generated signed URL', { key, expiresIn });
      return url;
    } catch (error) {
      this.handleError(error, 'getSignedUrl', key);
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<StorageStats> {
    try {
      const items = await this.list(undefined, 10000);

      return {
        totalObjects: items.length,
        totalSize: items.reduce((sum, item) => sum + item.size, 0),
        provider: 's3',
        region: this.region,
        lastUpdated: new Date()
      };
    } catch (error) {
      logger.error('Failed to get S3 stats', { error });
      return {
        totalObjects: 0,
        totalSize: 0,
        provider: 's3',
        region: this.region,
        lastUpdated: new Date()
      };
    }
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const errors: string[] = [];

    try {
      // Try to list objects (minimal operation)
      await this.list(undefined, 1);

      const latency = Date.now() - startTime;

      return {
        healthy: true,
        provider: 's3',
        latency,
        errors: [],
        timestamp: new Date()
      };
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      errors.push(err.message);

      return {
        healthy: false,
        provider: 's3',
        latency: Date.now() - startTime,
        errors,
        timestamp: new Date()
      };
    }
  }

  /**
   * Get provider name
   */
  getProviderName(): string {
    return 's3';
  }

  /**
   * Copy object within S3
   */
  async copy(sourceKey: string, destinationKey: string): Promise<StorageResult> {
    try {
      const command = new CopyObjectCommand({
        Bucket: this.bucket,
        CopySource: `${this.bucket}/${sourceKey}`,
        Key: destinationKey,
      });

      const response = await this.client.send(command);

      logger.info('S3 copy successful', { sourceKey, destinationKey });

      return {
        key: destinationKey,
        url: this.getPublicUrl(destinationKey),
        etag: response.CopyObjectResult?.ETag,
        versionId: response.VersionId,
        size: 0, // Size not returned by copy
        timestamp: new Date(),
        provider: 's3'
      };
    } catch (error) {
      this.handleError(error, 'copy', sourceKey);
      throw error;
    }
  }

  /**
   * Move object within S3
   */
  async move(sourceKey: string, destinationKey: string): Promise<StorageResult> {
    try {
      // Copy then delete
      const result = await this.copy(sourceKey, destinationKey);
      await this.delete(sourceKey);

      logger.info('S3 move successful', { sourceKey, destinationKey });
      return result;
    } catch (error) {
      this.handleError(error, 'move', sourceKey);
      throw error;
    }
  }

  /**
   * Batch delete objects
   */
  async batchDelete(keys: string[]): Promise<{ deleted: string[]; failed: string[] }> {
    try {
      if (keys.length === 0) {
        return { deleted: [], failed: [] };
      }

      const command = new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: {
          Objects: keys.map(key => ({ Key: key })),
          Quiet: false,
        },
      });

      const response = await this.client.send(command);

      const deleted = (response.Deleted || []).map(item => item.Key!);
      const failed = (response.Errors || []).map(item => item.Key!);

      logger.info('S3 batch delete completed', {
        total: keys.length,
        deleted: deleted.length,
        failed: failed.length
      });

      return { deleted, failed };
    } catch (error) {
      this.handleError(error, 'batchDelete', `${keys.length} keys`);
      return { deleted: [], failed: keys };
    }
  }

  /**
   * Get object metadata
   */
  async getMetadata(key: string): Promise<StorageItem | null> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      const response = await this.client.send(command);

      return {
        key,
        size: response.ContentLength || 0,
        lastModified: response.LastModified || new Date(),
        etag: response.ETag,
        storageClass: response.StorageClass,
        metadata: response.Metadata,
      };
    } catch (error: unknown) {
      const err = error as { name?: string };
      if (err.name === 'NotFound' || err.name === 'NoSuchKey') {
        return null;
      }
      this.handleError(error, 'getMetadata', key);
      return null;
    }
  }

  /**
   * Get public URL (CDN or S3 direct)
   */
  private getPublicUrl(key: string): string {
    if (this.cdnUrl) {
      return `${this.cdnUrl}/${key}`;
    }
    return `https://${this.bucket}.s3.${this.region}.amazonaws.com/${key}`;
  }

  /**
   * Format tags for S3
   */
  private formatTags(tags: Record<string, string>): string {
    return Object.entries(tags)
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }

  /**
   * Handle and transform errors
   */
  private handleError(error: unknown, operation: string, key: string): never {
    const err = error as { name?: string; message?: string; $metadata?: { httpStatusCode?: number } };
    
    logger.error('S3 operation failed', {
      operation,
      key,
      error: err.message,
      name: err.name
    });

    if (err.name === 'NoSuchKey' || err.name === 'NotFound') {
      throw new StorageNotFoundError(key, 's3');
    }

    if (err.name === 'AccessDenied' || err.$metadata?.httpStatusCode === 403) {
      throw new StorageAccessDeniedError(err.message || 'Access denied', 's3');
    }

    throw new StorageError(
      err.message || 'S3 operation failed',
      err.name || 'UNKNOWN',
      's3',
      err.$metadata?.httpStatusCode
    );
  }
}
