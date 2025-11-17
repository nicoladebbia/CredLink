/**
 * Production Environment Schema with Zod Validation
 * 
 * Provides comprehensive type-safe environment validation with:
 * - Critical production variable validation
 * - Security-sensitive configuration checks
 * - Runtime type checking and error reporting
 * - Development-friendly defaults
 */

import { z } from 'zod';
import { logger } from '../utils/logger';

/**
 * Comprehensive environment schema
 * Focuses on critical production variables that cause runtime failures
 */
const envSchema = z.object({
  // ==== CRITICAL PRODUCTION VARIABLES ====
  NODE_ENV: z.enum(['development', 'production', 'test'], {
    errorMap: () => ({ message: 'NODE_ENV must be development, production, or test' })
  }),
  PORT: z.string().transform((val) => {
    const port = parseInt(val, 10);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error('PORT must be a valid port number (1-65535)');
    }
    return port;
  }).default('3000'),
  
  // ==== DATABASE CONFIGURATION ====
  DATABASE_URL: z.string().url({
    message: 'DATABASE_URL must be a valid PostgreSQL connection string'
  }).refine((url) => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'postgresql:' || parsed.protocol === 'postgres:';
    } catch {
      return false;
    }
  }, {
    message: 'DATABASE_URL must be a PostgreSQL connection string (postgresql://... or postgres://...)'
  }),
  
  // ==== SECURITY CONFIGURATION ====
  API_KEYS: z.string().optional().transform((val) => {
    if (!val) return [];
    return val.split(',').map(key => key.trim()).filter(key => key.length > 0);
  }).refine((keys) => {
    if (keys.length === 0) {
      logger.warn('No API keys configured - authentication disabled');
    }
    return true;
  }),
  
  ENABLE_API_KEY_AUTH: z.string().transform((val) => val === 'true').default('false'),
  
  // ==== AWS CONFIGURATION ====
  AWS_REGION: z.string().min(2).max(20).default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().min(16).max(128).optional(),
  AWS_SECRET_ACCESS_KEY: z.string().min(16).max(128).optional(),
  KMS_KEY_ID: z.string().optional().refine((val) => {
    if (val && !val.startsWith('arn:aws:kms:')) {
      throw new Error('KMS_KEY_ID must be a valid AWS KMS ARN');
    }
    return true;
  }),
  
  // ==== S3 STORAGE CONFIGURATION ====
  USE_S3_PROOF_STORAGE: z.string().transform((val) => val === 'true').default('false'),
  S3_PROOF_BUCKET: z.string().optional().refine((val) => {
    if (process.env.USE_S3_PROOF_STORAGE === 'true' && !val) {
      throw new Error('S3_PROOF_BUCKET is required when USE_S3_PROOF_STORAGE is true');
    }
    return true;
  }),
  
  // ==== C2PA CONFIGURATION ====
  USE_REAL_C2PA: z.string().transform((val) => val === 'true').default('false'),
  IMAGE_PROCESSING_TIMEOUT_MS: z.string().transform((val) => {
    const timeout = parseInt(val, 10);
    if (isNaN(timeout) || timeout < 1000 || timeout > 300000) {
      throw new Error('IMAGE_PROCESSING_TIMEOUT_MS must be between 1000 and 300000ms');
    }
    return timeout;
  }).default('30000'),
  
  // ==== RATE LIMITING ====
  RATE_LIMIT_WINDOW_MS: z.string().transform((val) => {
    const window = parseInt(val, 10);
    if (isNaN(window) || window < 1000 || window > 3600000) {
      throw new Error('RATE_LIMIT_WINDOW_MS must be between 1000 and 3600000ms');
    }
    return window;
  }).default('60000'),
  
  RATE_LIMIT_MAX: z.string().transform((val) => {
    const max = parseInt(val, 10);
    if (isNaN(max) || max < 1 || max > 10000) {
      throw new Error('RATE_LIMIT_MAX must be between 1 and 10000');
    }
    return max;
  }).default('100'),
  
  SIGN_RATE_LIMIT_MAX: z.string().transform((val) => {
    const max = parseInt(val, 10);
    if (isNaN(max) || max < 1 || max < 1000) {
      throw new Error('SIGN_RATE_LIMIT_MAX must be at least 1');
    }
    return max;
  }).default('10'),
  
  // ==== FILE PROCESSING ====
  MAX_FILE_SIZE_MB: z.string().transform((val) => {
    const size = parseInt(val, 10);
    if (isNaN(size) || size < 1 || size > 500) {
      throw new Error('MAX_FILE_SIZE_MB must be between 1 and 500MB');
    }
    return size;
  }).default('50'),
  
  // ==== CORS CONFIGURATION ====
  ALLOWED_ORIGINS: z.string().default('http://localhost:3000'),
  
  // ==== MONITORING ====
  ENABLE_SENTRY: z.string().transform((val) => val === 'true').default('false'),
  SENTRY_DSN: z.string().url().optional().refine((val) => {
    if (process.env.ENABLE_SENTRY === 'true' && !val) {
      throw new Error('SENTRY_DSN is required when ENABLE_SENTRY is true');
    }
    return true;
  }),
  
  // ==== CERTIFICATE CONFIGURATION ====
  SIGNING_CERTIFICATE: z.string().optional(),
  SIGNING_PRIVATE_KEY: z.string().optional(),
  ENCRYPTED_PRIVATE_KEY: z.string().optional(),
  
  // ==== STORAGE PATHS ====
  PROOF_STORAGE_PATH: z.string().default('./proofs'),
  PROOF_URI_DOMAIN: z.string().url().default('https://proofs.credlink.com'),
  
  // ==== APPLICATION METADATA ====
  APP_NAME: z.string().min(1).max(100).default('credlink-api'),
  SERVICE_VERSION: z.string().default('1.0.0'),
});

/**
 * Environment schema type for use throughout application
 */
export type Env = z.infer<typeof envSchema>;

/**
 * Validate and parse environment variables with comprehensive error reporting
 */
export function validateAndParseEnv(): Env {
  try {
    const env = envSchema.parse(process.env);
    
    // Log successful validation (without sensitive values)
    logger.info('✅ Environment validation passed', {
      NODE_ENV: env.NODE_ENV,
      PORT: env.PORT,
      APP_NAME: env.APP_NAME,
      AWS_REGION: env.AWS_REGION,
      USE_S3_PROOF_STORAGE: env.USE_S3_PROOF_STORAGE,
      USE_REAL_C2PA: env.USE_REAL_C2PA,
      ENABLE_API_KEY_AUTH: env.ENABLE_API_KEY_AUTH,
      ENABLE_SENTRY: env.ENABLE_SENTRY,
      DATABASE_CONFIGURED: !!env.DATABASE_URL,
      API_KEYS_COUNT: env.API_KEYS?.length || 0,
    });
    
    // Production-specific warnings
    if (env.NODE_ENV === 'production') {
      if (!env.DATABASE_URL) {
        throw new Error('DATABASE_URL is required in production');
      }
      
      if (env.ENABLE_API_KEY_AUTH && (!env.API_KEYS || env.API_KEYS.length === 0)) {
        throw new Error('API_KEYS are required when ENABLE_API_KEY_AUTH is true in production');
      }
      
      if (env.USE_S3_PROOF_STORAGE && !env.S3_PROOF_BUCKET) {
        throw new Error('S3_PROOF_BUCKET is required when USE_S3_PROOF_STORAGE is true in production');
      }
      
      if (!env.AWS_REGION || env.AWS_REGION === 'us-east-1') {
        logger.warn('Using default AWS region in production - consider explicit configuration');
      }
    }
    
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedErrors = error.errors.map(err => ({
        field: err.path.join('.'),
        message: err.message,
        received: process.env[err.path.join('.')] || 'undefined',
      }));
      
      logger.error('❌ Environment validation failed', {
        errors: formattedErrors,
        count: formattedErrors.length,
      });
      
      console.error('\n🚨 ENVIRONMENT VALIDATION FAILED');
      console.error('=====================================\n');
      
      formattedErrors.forEach((err, index) => {
        console.error(`${index + 1}. ${err.field}`);
        console.error(`   Message: ${err.message}`);
        console.error(`   Received: ${err.received}`);
        console.error('');
      });
      
      console.error('💡 Fix these environment variables and restart the server.');
      console.error('📝 See .env.example for required configuration.\n');
      
    } else {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('❌ Environment validation error', { error: errorMessage });
      console.error(`\n🚨 ENVIRONMENT ERROR: ${errorMessage}\n`);
    }
    
    process.exit(1);
  }
}

/**
 * Export validated environment for use throughout application
 * This replaces the previous env.ts exports
 */
export const env = validateAndParseEnv();

/**
 * Helper functions for environment checks
 */
export const envHelpers = {
  isProduction: () => env.NODE_ENV === 'production',
  isDevelopment: () => env.NODE_ENV === 'development',
  isTest: () => env.NODE_ENV === 'test',
  
  getMaxFileSizeBytes: () => env.MAX_FILE_SIZE_MB * 1024 * 1024,
  getRateLimitWindowMs: () => env.RATE_LIMIT_WINDOW_MS,
  getSignRateLimitMax: () => env.SIGN_RATE_LIMIT_MAX,
  
  hasDatabase: () => !!env.DATABASE_URL,
  hasS3Storage: () => env.USE_S3_PROOF_STORAGE && !!env.S3_PROOF_BUCKET,
  hasApiKeys: () => env.ENABLE_API_KEY_AUTH && env.API_KEYS && env.API_KEYS.length > 0,
  hasSentry: () => env.ENABLE_SENTRY && !!env.SENTRY_DSN,
  hasRealC2PA: () => env.USE_REAL_C2PA,
};

export default env;
