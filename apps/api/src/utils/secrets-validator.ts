/**
 * BRUTAL Secrets Validation
 * 
 * Validates all critical secrets and environment variables
 * This was missing - will cause silent production failures
 */

export interface SecretValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  secrets: {
    database: boolean;
    storage: boolean;
    security: boolean;
    monitoring: boolean;
  };
}

export class SecretsValidator {
  /**
   * Validate all critical secrets and environment variables
   */
  static validate(): SecretValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    const secrets = {
      database: false,
      storage: false,
      security: false,
      monitoring: false
    };

    // Database secrets validation
    const dbHost = process.env.DB_HOST;
    const dbPort = process.env.DB_PORT;
    const dbName = process.env.DB_NAME;
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;

    if (!dbHost) errors.push('DB_HOST is required for database connectivity');
    if (!dbPort) errors.push('DB_PORT is required for database connectivity');
    if (!dbName) errors.push('DB_NAME is required for database connectivity');
    if (!dbUser) errors.push('DB_USER is required for database connectivity');
    if (!dbPassword) {
      if (process.env.NODE_ENV === 'production') {
        errors.push('DB_PASSWORD is required in production');
      } else {
        warnings.push('DB_PASSWORD not set - using default for development');
      }
    }

    if (dbHost && dbPort && dbName && dbUser) {
      secrets.database = true;
    }

    // Storage secrets validation
    const s3Bucket = process.env.S3_BUCKET;
    const s3Region = process.env.S3_REGION;
    const s3AccessKey = process.env.S3_ACCESS_KEY_ID;
    const s3SecretKey = process.env.S3_SECRET_ACCESS_KEY;

    if (s3Bucket || s3Region || s3AccessKey || s3SecretKey) {
      if (!s3Bucket) errors.push('S3_BUCKET is required when using S3 storage');
      if (!s3Region) errors.push('S3_REGION is required when using S3 storage');
      if (!s3AccessKey) errors.push('S3_ACCESS_KEY_ID is required when using S3 storage');
      if (!s3SecretKey) errors.push('S3_SECRET_ACCESS_KEY is required when using S3 storage');
      
      if (s3Bucket && s3Region && s3AccessKey && s3SecretKey) {
        secrets.storage = true;
      }
    } else {
      warnings.push('S3 storage not configured - using local storage');
      secrets.storage = true; // Local storage is acceptable
    }

    // Security secrets validation
    const jwtSecret = process.env.JWT_SECRET;
    const apiKeySecret = process.env.API_KEY_SECRET;

    if (!jwtSecret) {
      if (process.env.NODE_ENV === 'production') {
        errors.push('JWT_SECRET is required in production');
      } else {
        warnings.push('JWT_SECRET not set - using development default');
        secrets.security = true; // Acceptable for development
      }
    } else {
      if (jwtSecret.length < 32) {
        errors.push('JWT_SECRET must be at least 32 characters long');
      } else {
        secrets.security = true;
      }
    }

    if (!apiKeySecret) {
      warnings.push('API_KEY_SECRET not set - using development default');
    } else {
      if (apiKeySecret.length < 32) {
        errors.push('API_KEY_SECRET must be at least 32 characters long');
      }
    }

    // Monitoring secrets validation
    const sentryDsn = process.env.SENTRY_DSN;
    const kmsKeyId = process.env.KMS_KEY_ID;

    if (sentryDsn) {
      try {
        new URL(sentryDsn);
        secrets.monitoring = true;
      } catch {
        errors.push('SENTRY_DSN is not a valid URL');
      }
    } else {
      warnings.push('SENTRY_DSN not set - error tracking disabled');
      secrets.monitoring = true; // Acceptable to not have monitoring
    }

    if (kmsKeyId && !kmsKeyId.startsWith('arn:')) {
      errors.push('KMS_KEY_ID must be a valid ARN');
    }

    // Production-specific validations
    if (process.env.NODE_ENV === 'production') {
      if (!process.env.PORT) errors.push('PORT must be set in production');
      if (!process.env.ALLOWED_ORIGINS) errors.push('ALLOWED_ORIGINS must be set in production');
      if (process.env.LOG_LEVEL === 'debug') warnings.push('LOG_LEVEL should not be debug in production');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      secrets
    };
  }

  /**
   * Get masked environment summary for logging
   */
  static getMaskedSummary(): Record<string, string> {
    return {
      DB_HOST: process.env.DB_HOST ? '***' : 'not_set',
      DB_PORT: process.env.DB_PORT || 'not_set',
      DB_NAME: process.env.DB_NAME ? '***' : 'not_set',
      DB_USER: process.env.DB_USER ? '***' : 'not_set',
      DB_PASSWORD: process.env.DB_PASSWORD ? '***' : 'not_set',
      S3_BUCKET: process.env.S3_BUCKET ? '***' : 'not_set',
      S3_REGION: process.env.S3_REGION || 'not_set',
      JWT_SECRET: process.env.JWT_SECRET ? '***' : 'not_set',
      SENTRY_DSN: process.env.SENTRY_DSN ? '***' : 'not_set',
      NODE_ENV: process.env.NODE_ENV || 'development'
    };
  }
}
