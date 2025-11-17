/**
 * Centralized Environment Configuration
 * 
 * Provides validated environment variables to all application components.
 * Enforces security validation by requiring all env access through this config.
 */

import { validateEnvironment } from '../utils/validate-env';
import { logger } from '../utils/logger';
import { versionConfig } from '../utils/version-config';

// Re-export validateEnvironment for other modules
export { validateEnvironment };

// Validate environment on import
validateEnvironment();

/**
 * Validated environment configuration
 */
export const env = {
  // Core Configuration
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT || '3000', 10),
  
  // File Upload Configuration
  MAX_FILE_SIZE_MB: parseInt(process.env.MAX_FILE_SIZE_MB || '50', 10),
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS || 'http://localhost:3000',
  
  // Rate Limiting Configuration
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
  RATE_LIMIT_MAX: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  SIGN_RATE_LIMIT_MAX: parseInt(process.env.SIGN_RATE_LIMIT_MAX || '100', 10),
  
  // Certificate Configuration
  SIGNING_CERTIFICATE: process.env.SIGNING_CERTIFICATE || './certs/signing-cert.pem',
  SIGNING_PRIVATE_KEY: process.env.SIGNING_PRIVATE_KEY || './certs/signing-key.pem',
  ISSUER_CERTIFICATE: process.env.ISSUER_CERTIFICATE || null,
  
  // AWS Configuration
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  KMS_KEY_ID: process.env.KMS_KEY_ID || null,
  ENCRYPTED_PRIVATE_KEY: process.env.ENCRYPTED_PRIVATE_KEY || null,
  
  // C2PA Configuration
  USE_REAL_C2PA: process.env.USE_REAL_C2PA === 'true',
  IMAGE_PROCESSING_TIMEOUT_MS: parseInt(process.env.IMAGE_PROCESSING_TIMEOUT_MS || '30000', 10),
  SERVICE_VERSION: process.env.SERVICE_VERSION || versionConfig.appVersion,
  
  // Storage Configuration
  USE_S3_PROOF_STORAGE: process.env.USE_S3_PROOF_STORAGE === 'true',
  S3_PROOF_BUCKET: process.env.S3_PROOF_BUCKET || null,
  PROOF_URI_DOMAIN: process.env.PROOF_URI_DOMAIN || 'https://proofs.credlink.com',
  PROOF_STORAGE_PATH: process.env.PROOF_STORAGE_PATH || './proofs',
  USE_LOCAL_PROOF_STORAGE: process.env.USE_LOCAL_PROOF_STORAGE !== 'false',
  
  // Authentication Configuration
  ENABLE_API_KEY_AUTH: process.env.ENABLE_API_KEY_AUTH === 'true',
  API_KEYS: process.env.API_KEYS || null,
  
  // Monitoring Configuration
  ENABLE_SENTRY: process.env.ENABLE_SENTRY === 'true',
  SENTRY_DSN: process.env.SENTRY_DSN || null,
  
  // Helper Methods
  isProduction: () => env.NODE_ENV === 'production',
  isDevelopment: () => env.NODE_ENV === 'development',
  isTest: () => env.NODE_ENV === 'test',
  
  // Validation helpers
  getMaxFileSizeBytes: () => env.MAX_FILE_SIZE_MB * 1024 * 1024,
  getRateLimitWindowMs: () => env.RATE_LIMIT_WINDOW_MS,
  getSignRateLimitMax: () => env.SIGN_RATE_LIMIT_MAX,
};

// Log configuration on startup (without sensitive values)
logger.info('Environment configuration loaded', {
  NODE_ENV: env.NODE_ENV,
  PORT: env.PORT,
  MAX_FILE_SIZE_MB: env.MAX_FILE_SIZE_MB,
  SIGN_RATE_LIMIT_MAX: env.SIGN_RATE_LIMIT_MAX,
  USE_REAL_C2PA: env.USE_REAL_C2PA,
  AWS_REGION: env.AWS_REGION,
  ENABLE_SENTRY: env.ENABLE_SENTRY,
});

export default env;
