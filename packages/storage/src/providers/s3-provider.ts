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
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { S3CircuitBreaker, S3CircuitBreakerOptions } from '@credlink/circuit-breaker';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface StorageOptions {
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
  storageClass?: 'STANDARD' | 'REDUCED_REDUNDANCY' | 'GLACIER' | 'INTELLIGENT_TIERING';
  compress?: boolean;
  encryption?: boolean;
  tags?: Record<string, string>;
}

export interface StorageResult {
  key: string;
  url: string;
  etag?: string;
  versionId?: string;
  size: number;
  timestamp: Date;
  provider: string;
}

export interface StorageConfig {
  provider: 's3' | 'r2';
  bucket: string;
  region?: string;
  endpoint?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  accountId?: string; // For R2
  encryption?: {
    algorithm: string;
    keyId?: string;
  };
}

export interface StorageStats {
  totalObjects: number;
  totalSize: number;
  provider: string;
  bucket: string;
  region?: string;
}

export interface HealthCheckResult {
  healthy: boolean;
  latency: number;
  error?: string;
  details?: Record<string, any>;
}

export class StorageError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: string,
    public originalError?: Error
  ) {
    super(message);
    this.name = 'StorageError';
  }
}

export class StorageNotFoundError extends StorageError {
  constructor(key: string, provider: string) {
    super(`Storage object not found: ${key}`, 'NOT_FOUND', provider);
    this.name = 'StorageNotFoundError';
  }
}

export class StorageAccessDeniedError extends StorageError {
  constructor(operation: string, provider: string) {
    super(`Access denied for operation: ${operation}`, 'ACCESS_DENIED', provider);
    this.name = 'StorageAccessDeniedError';
  }
}

export class S3StorageProvider {
  private circuitBreaker: S3CircuitBreaker;
  private config: StorageConfig;

  constructor(config: StorageConfig, circuitBreakerOptions?: S3CircuitBreakerOptions) {
    this.config = config;
    
    // 🔥 CRITICAL FIX: Remove duplicate S3Client creation - use circuit breaker's client
    this.circuitBreaker = new S3CircuitBreaker({
      s3Config: {
        region: config.region || 'us-east-1',
        endpoint: config.endpoint,
        credentials: {
          accessKeyId: config.accessKeyId || process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: config.secretAccessKey || process.env.AWS_SECRET_ACCESS_KEY!,
        },
      },
      ...circuitBreakerOptions
    });

    // 🔥 CRITICAL FIX: Remove duplicate client - circuit breaker manages the S3 client
    // this.client = new S3Client(...) - REMOVED to prevent resource waste
  }

  async store(
    key: string,
    data: Buffer | string,
    options: StorageOptions = {}
  ): Promise<StorageResult> {
    const startTime = Date.now();
    
    try {
      let body = typeof data === 'string' ? Buffer.from(data) : data;
      let contentEncoding: string | undefined;

      if (options.compress) {
        body = Buffer.from(await gzipAsync(body));
        contentEncoding = 'gzip';
      }

      const command = new PutObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        Body: body,
        ContentType: options.contentType || 'application/octet-stream',
        ContentEncoding: contentEncoding,
        Metadata: options.metadata,
        StorageClass: options.storageClass,
        ServerSideEncryption: options.encryption ? 'AES256' : undefined,
        Tagging: options.tags ? Object.entries(options.tags)
          .map(([k, v]) => `${k}=${v}`)
          .join('&') : undefined,
      });

      const result = await this.circuitBreaker.putObject(command);

      return {
        key,
        url: `https://${this.config.bucket}.s3.${this.config.region || 'us-east-1'}.amazonaws.com/${key}`,
        etag: result.ETag,
        versionId: result.VersionId,
        size: body.length,
        timestamp: new Date(),
        provider: this.config.provider,
      };
    } catch (error) {
      throw this.handleError(error, 'store', key);
    } finally {
      this.recordLatency('store', Date.now() - startTime);
    }
  }

  async retrieve(key: string): Promise<Buffer> {
    const startTime = Date.now();
    
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      const result = await this.circuitBreaker.getObject(command);
      
      if (!result.Body) {
        throw new StorageNotFoundError(key, this.config.provider);
      }

      const chunks: Uint8Array[] = [];
      const stream = result.Body as any;
      
      for await (const chunk of stream) {
        chunks.push(chunk);
      }

      let data = Buffer.concat(chunks);

      if (result.ContentEncoding === 'gzip') {
        data = Buffer.from(await gunzipAsync(data));
      }

      return data;
    } catch (error) {
      throw this.handleError(error, 'retrieve', key);
    } finally {
      this.recordLatency('retrieve', Date.now() - startTime);
    }
  }

  async delete(key: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      await this.circuitBreaker.deleteObject(command);
    } catch (error) {
      throw this.handleError(error, 'delete', key);
    } finally {
      this.recordLatency('delete', Date.now() - startTime);
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      await this.circuitBreaker.headObject(command);
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'NotFound') {
        return false;
      }
      throw this.handleError(error, 'exists', key);
    }
  }

  async list(prefix?: string): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    try {
      const command = new ListObjectsV2Command({
        Bucket: this.config.bucket,
        Prefix: prefix,
      });

      const result = await this.circuitBreaker.listObjectsV2(command);
      
      return (result.Contents || []).map(item => ({
        key: item.Key!,
        size: item.Size || 0,
        lastModified: item.LastModified || new Date(),
      }));
    } catch (error) {
      throw this.handleError(error, 'list', prefix || '');
    }
  }

  async getStats(): Promise<StorageStats> {
    try {
      const objects = await this.list();
      const totalSize = objects.reduce((sum, obj) => sum + obj.size, 0);

      return {
        totalObjects: objects.length,
        totalSize,
        provider: this.config.provider,
        bucket: this.config.bucket,
        region: this.config.region,
      };
    } catch (error) {
      throw this.handleError(error, 'getStats', '');
    }
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    
    try {
      await this.list();
      
      return {
        healthy: true,
        latency: Date.now() - startTime,
      };
    } catch (error) {
      return {
        healthy: false,
        latency: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Unknown error',
        details: {
          provider: this.config.provider,
          bucket: this.config.bucket,
        },
      };
    }
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
      });

      return await getSignedUrl(this.circuitBreaker.getClient(), command, { expiresIn });
    } catch (error) {
      throw this.handleError(error, 'getSignedUrl', key);
    }
  }

  private handleError(error: any, operation: string, key: string): StorageError {
    if (error.name === 'NoSuchKey') {
      return new StorageNotFoundError(key, this.config.provider);
    }
    
    if (error.name === 'AccessDenied') {
      return new StorageAccessDeniedError(operation, this.config.provider);
    }

    return new StorageError(
      `Storage operation failed: ${operation} for key: ${key}`,
      error.name || 'UNKNOWN',
      this.config.provider,
      error
    );
  }

  private recordLatency(operation: string, latency: number): void {
    console.debug(`Storage latency: ${operation} took ${latency}ms`);
  }
}

export class R2StorageProvider extends S3StorageProvider {
  constructor(config: StorageConfig) {
    if (!config.accountId) {
      throw new Error('Cloudflare account ID is required for R2');
    }

    if (!config.bucket) {
      throw new Error('R2 bucket name is required');
    }

    const r2Endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;

    const s3Config: StorageConfig = {
      ...config,
      provider: 'r2',
      endpoint: r2Endpoint,
      region: 'auto',
    };

    super(s3Config);
  }
}
