import { S3StorageProvider } from './s3-storage-provider';
import { StorageConfig } from './storage-provider';
import { logger } from '../utils/logger';

/**
 * Cloudflare R2 Storage Provider
 * 
 * R2 is S3-compatible with some differences:
 * - No storage classes
 * - Different endpoint format
 * - Free egress
 * - Global edge network
 * 
 * This extends S3StorageProvider with R2-specific configurations
 */
export class R2StorageProvider extends S3StorageProvider {
  constructor(config: StorageConfig) {
    if (!config.accountId) {
      throw new Error('Cloudflare account ID is required for R2');
    }

    if (!config.bucket) {
      throw new Error('R2 bucket name is required');
    }

    // R2 uses a specific endpoint format
    const r2Endpoint = `https://${config.accountId}.r2.cloudflarestorage.com`;

    // Transform config for S3 compatibility
    const s3Config: StorageConfig = {
      ...config,
      provider: 's3',
      region: 'auto', // R2 uses 'auto' as region
      endpoint: r2Endpoint,
      // R2 doesn't support storage classes, always use STANDARD
      // This will be handled in the store method override
    };

    super(s3Config);

    logger.info('R2 Storage Provider initialized', {
      accountId: config.accountId,
      bucket: config.bucket,
      endpoint: r2Endpoint,
      hasCdn: !!config.cdnUrl
    });
  }

  /**
   * Override getProviderName for R2
   */
  getProviderName(): string {
    return 'r2';
  }

  /**
   * R2-specific optimizations can be added here
   * For now, it inherits all S3 functionality
   */
}

/**
 * R2 Configuration Helper
 * 
 * Helps create proper R2 configuration from environment variables
 */
export class R2ConfigHelper {
  /**
   * Create R2 config from environment variables
   */
  static fromEnv(): StorageConfig {
    const accountId = process.env.R2_ACCOUNT_ID;
    const accessKeyId = process.env.R2_ACCESS_KEY_ID;
    const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
    const bucket = process.env.R2_BUCKET;
    const cdnUrl = process.env.R2_CDN_URL;

    if (!accountId) {
      throw new Error('R2_ACCOUNT_ID environment variable is required');
    }

    if (!accessKeyId || !secretAccessKey) {
      throw new Error('R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required');
    }

    if (!bucket) {
      throw new Error('R2_BUCKET environment variable is required');
    }

    return {
      provider: 'r2',
      accountId,
      accessKeyId,
      secretAccessKey,
      bucket,
      cdnUrl,
      maxRetries: 3,
      timeout: 30000,
    };
  }

  /**
   * Validate R2 configuration
   */
  static validate(config: StorageConfig): boolean {
    if (config.provider !== 'r2') {
      return false;
    }

    if (!config.accountId) {
      throw new Error('Account ID is required for R2');
    }

    if (!config.bucket) {
      throw new Error('Bucket name is required');
    }

    if (!config.accessKeyId || !config.secretAccessKey) {
      throw new Error('Access credentials are required');
    }

    return true;
  }
}
