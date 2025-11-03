/**
 * Phase 36 Billing - Environment Configuration
 * Secure environment variable validation and management
 */

import { z } from 'zod';
import crypto from 'crypto';

// Environment variable schema with validation
const EnvSchema = z.object({
  // Server configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/).default('0.0.0.0'),
  PORT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 65535, { message: 'Port must be between 1 and 65535' }).default('3002'),
  
  // Redis configuration
  REDIS_HOST: z.string().min(1).max(253).default('localhost'),
  REDIS_PORT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 65535, { message: 'Redis port must be between 1 and 65535' }).default('6379'),
  REDIS_DB: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 0 && n <= 15, { message: 'Redis DB must be between 0 and 15' }).default('0'),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_MAX_RETRIES: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 10, { message: 'Redis max retries must be between 1 and 10' }).default('3'),
  
  // Stripe configuration (REQUIRED)
  STRIPE_SECRET_KEY: z.string().min(1, 'Stripe secret key is required'),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1, 'Stripe publishable key is required'),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, 'Stripe webhook secret is required'),
  STRIPE_API_VERSION: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default('2023-10-16'),
  
  // Stripe product IDs
  STRIPE_STARTER_PRICE_ID: z.string().min(1, 'Starter price ID is required'),
  STRIPE_PRO_PRICE_ID: z.string().min(1, 'Pro price ID is required'),
  STRIPE_ENTERPRISE_PRICE_ID: z.string().min(1, 'Enterprise price ID is required'),
  
  // Stripe meter IDs
  STRIPE_SIGN_EVENTS_METER_ID: z.string().min(1, 'Sign events meter ID is required'),
  STRIPE_VERIFY_EVENTS_METER_ID: z.string().min(1, 'Verify events meter ID is required'),
  STRIPE_RFC3161_TIMESTAMPS_METER_ID: z.string().min(1, 'RFC3161 timestamps meter ID is required'),
  
  // Database configuration
  DATABASE_URL: z.string().url('Database URL must be a valid URL'),
  DATABASE_POOL_SIZE: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 100, { message: 'Database pool size must be between 1 and 100' }).default('10'),
  DATABASE_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1000 && n <= 60000, { message: 'Database timeout must be between 1000ms and 60000ms' }).default('30000'),
  
  // Security configuration
  JWT_SECRET: z.string().min(64, 'JWT secret must be at least 64 characters'),
  API_KEY_SECRET: z.string().min(32, 'API key secret must be at least 32 characters'),
  SESSION_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 300000 && n <= 86400000, { message: 'Session timeout must be between 5 minutes and 24 hours' }).default('3600000'),
  RATE_LIMIT_WINDOW: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 60000 && n <= 3600000, { message: 'Rate limit window must be between 1 minute and 1 hour' }).default('900000'),
  MAX_REQUESTS_PER_WINDOW: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 10 && n <= 10000, { message: 'Max requests per window must be between 10 and 10000' }).default('100'),
  
  // Trial configuration
  TRIAL_DURATION_DAYS: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 7 && n <= 30, { message: 'Trial duration must be between 7 and 30 days' }).default('14'),
  TRIAL_ASSET_CAP: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 50 && n <= 1000, { message: 'Trial asset cap must be between 50 and 1000' }).default('200'),
  TRIAL_CARD_REQUIRED: z.string().transform(val => val === 'true').default('true'),
  
  // C2PA configuration
  CAI_VERIFY_ENDPOINT: z.string().url().default('https://verify.contentauthenticity.org'),
  MANIFEST_HOST_BASE_URL: z.string().url().default('https://manifests.c2pa.org'),
  RFC3161_TSA_ENDPOINT: z.string().url().default('https://freetsa.org/tsr'),
  
  // File storage configuration
  ASSET_STORAGE_PATH: z.string().min(1).max(255).default('./assets'),
  EXPORT_STORAGE_PATH: z.string().min(1).max(255).default('./exports'),
  MAX_ASSET_SIZE: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1048576 && n <= 1073741824, { message: 'Max asset size must be between 1MB and 1GB' }).default('104857600'),
  MANIFEST_RETENTION_DAYS: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 30 && n <= 3650, { message: 'Manifest retention must be between 30 and 3650 days' }).default('365'),
  
  // Email configuration
  SMTP_HOST: z.string().min(1).max(253).optional(),
  SMTP_PORT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 65535, { message: 'SMTP port must be between 1 and 65535' }).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
  EMAIL_SUPPORT: z.string().email().optional(),
  
  // Compliance configuration
  COMPLIANCE_REPORT_SCHEDULE: z.string().regex(/^(\d{1,2}|\*) (\d{1,2}|\*) (\d{1,2}|\*) (\d{1,2}|\*) (\d{1,2}|\*)$/).default('0 0 1 * *'),
  DATA_RETENTION_DAYS: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 365 && n <= 3650, { message: 'Data retention must be between 1 and 10 years' }).default('2555'),
  AUDIT_LOG_ENABLED: z.string().transform(val => val === 'true').default('true'),
  AUDIT_LOG_RETENTION_DAYS: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 90 && n <= 3650, { message: 'Audit log retention must be between 90 days and 10 years' }).default('2555'),
  
  // Feature flags
  ENABLE_STRIPE_RADAR: z.string().transform(val => val === 'true').default('true'),
  ENABLE_SMART_RETRIES: z.string().transform(val => val === 'true').default('true'),
  ENABLE_USAGE_METERING: z.string().transform(val => val === 'true').default('true'),
  ENABLE_RFC3161_TIMESTAMPS: z.string().transform(val => val === 'true').default('false'),
  ENABLE_CUSTOMER_PORTAL: z.string().transform(val => val === 'true').default('true'),
  
  // Monitoring configuration
  ENABLE_METRICS: z.string().transform(val => val === 'true').default('true'),
  METRICS_PORT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1024 && n <= 65535, { message: 'Metrics port must be between 1024 and 65535' }).default('9090'),
  HEALTH_CHECK_INTERVAL: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 10000 && n <= 300000, { message: 'Health check interval must be between 10 seconds and 5 minutes' }).default('30000'),
  
  // CORS configuration
  ALLOWED_ORIGINS: z.string().transform(val => val.split(',').map(o => o.trim())).default(['http://localhost:3000']),
  CORS_CREDENTIALS: z.string().transform(val => val === 'true').default('true'),
  
  // Webhook configuration
  WEBHOOK_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 5000 && n <= 60000, { message: 'Webhook timeout must be between 5 seconds and 1 minute' }).default('30000'),
  WEBHOOK_RETRY_ATTEMPTS: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 10, { message: 'Webhook retry attempts must be between 1 and 10' }).default('3'),
  WEBHOOK_RETRY_DELAY: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 500 && n <= 10000, { message: 'Webhook retry delay must be between 500ms and 10 seconds' }).default('1000'),
  
  // Logging configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('pretty'),
});

// Export type for use in application
export type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Validate environment variables
 */
export function validateEnvironment(): EnvConfig {
  try {
    return EnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => ({
        variable: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
      
      throw new Error(`Environment validation failed:\n${errors.map(e => `  ${e.variable}: ${e.message}`).join('\n')}`);
    }
    
    throw new Error(`Environment validation failed: ${error}`);
  }
}

/**
 * Additional security validations
 */
function validateSecurityRequirements(env: EnvConfig): void {
  // Production security requirements
  if (env.NODE_ENV === 'production') {
    // Stripe keys must be live keys in production
    if (env.STRIPE_SECRET_KEY.startsWith('sk_test_')) {
      throw new Error('Live Stripe secret key required in production');
    }
    
    // JWT secret must be sufficiently long
    if (env.JWT_SECRET.length < 64) {
      throw new Error('JWT secret must be at least 64 characters in production');
    }
    
    // HTTPS required for production
    if (!env.ALLOWED_ORIGINS.some(origin => origin.startsWith('https://'))) {
      throw new Error('HTTPS origins required in production');
    }
  }
  
  // Validate file paths don't point to dangerous system directories
  const dangerousPaths = ['/etc', '/usr', '/bin', '/sbin', '/var', '/sys', '/proc'];
  const pathsToCheck = [env.ASSET_STORAGE_PATH, env.EXPORT_STORAGE_PATH];
  
  for (const path of pathsToCheck) {
    for (const dangerous of dangerousPaths) {
      if (path.startsWith(dangerous)) {
        throw new Error(`Storage paths cannot point to system directories: ${dangerous}`);
      }
    }
  }
}

/**
 * Generate secure JWT secret if not provided
 */
export function generateJWTSecret(): string {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Generate secure API key secret if not provided
 */
export function generateAPIKeySecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Load environment with fallbacks for development
 */
export function loadEnvironment(): EnvConfig {
  // Load .env file if it exists
  try {
    // dotenv will be available after npm install
    if (typeof require !== 'undefined') {
      require('dotenv').config();
    }
  } catch (error) {
    // dotenv not available, continue without it
    console.warn('dotenv not available, using process.env only');
  }
  
  // Validate environment
  const env = validateEnvironment();
  
  // Additional security validations
  validateSecurityRequirements(env);
  
  return env;
}

/**
 * Get configuration summary for logging (without secrets)
 */
export function getConfigSummary(env: EnvConfig): Record<string, any> {
  return {
    environment: env.NODE_ENV,
    server: {
      host: env.HOST,
      port: env.PORT,
    },
    stripe: {
      api_version: env.STRIPE_API_VERSION,
      has_secret_key: !!env.STRIPE_SECRET_KEY,
      has_webhook_secret: !!env.STRIPE_WEBHOOK_SECRET,
    },
    trial: {
      duration_days: env.TRIAL_DURATION_DAYS,
      asset_cap: env.TRIAL_ASSET_CAP,
      card_required: env.TRIAL_CARD_REQUIRED,
    },
    features: {
      stripe_radar: env.ENABLE_STRIPE_RADAR,
      smart_retries: env.ENABLE_SMART_RETRIES,
      usage_metering: env.ENABLE_USAGE_METERING,
      rfc3161_timestamps: env.ENABLE_RFC3161_TIMESTAMPS,
      customer_portal: env.ENABLE_CUSTOMER_PORTAL,
    },
    security: {
      jwt_secret_length: env.JWT_SECRET.length,
      api_key_secret_length: env.API_KEY_SECRET.length,
      session_timeout: env.SESSION_TIMEOUT,
      rate_limit_window: env.RATE_LIMIT_WINDOW,
    },
  };
}
