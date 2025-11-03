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
  
  // Redis configuration - SECURITY HARDENED
  REDIS_HOST: z.string().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/).default('localhost'),
  REDIS_PORT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 65535, { message: 'Redis port must be between 1 and 65535' }).default('6379'),
  REDIS_DB: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 0 && n <= 15, { message: 'Redis DB must be between 0 and 15' }).default('0'),
  REDIS_PASSWORD: z.string().min(32, 'Redis password must be at least 32 characters in production').refine(pwd => {
    if (process.env['NODE_ENV'] === 'production') {
      // Production passwords must have high entropy
      return /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /\d/.test(pwd) && /[!@#$%^&*]/.test(pwd);
    }
    return pwd.length >= 16;
  }, { message: 'Redis password must contain uppercase, lowercase, numbers, and special characters in production' }),
  REDIS_MAX_RETRIES: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 10, { message: 'Redis max retries must be between 1 and 10' }).default('3'),
  
  // Stripe configuration (REQUIRED) - SECURITY HARDENED
  STRIPE_SECRET_KEY: z.string().min(1, 'Stripe secret key is required').refine(key => {
    // Validate Stripe secret key format: sk_live_ or sk_test_
    return /^sk_(live|test)_[A-Za-z0-9]{24,}$/.test(key);
  }, { message: 'Invalid Stripe secret key format' }),
  STRIPE_PUBLISHABLE_KEY: z.string().min(1, 'Stripe publishable key is required').refine(key => {
    // Validate Stripe publishable key format: pk_live_ or pk_test_
    return /^pk_(live|test)_[A-Za-z0-9]{24,}$/.test(key);
  }, { message: 'Invalid Stripe publishable key format' }),
  STRIPE_WEBHOOK_SECRET: z.string().min(1, 'Stripe webhook secret is required').refine(secret => {
    // Webhook secrets should be at least 24 characters
    return secret.length >= 24 && /^whsec_[A-Za-z0-9]{24,}$/.test(secret);
  }, { message: 'Invalid Stripe webhook secret format' }),
  STRIPE_API_VERSION: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default('2023-10-16'),
  
  // Stripe product IDs
  STRIPE_STARTER_PRICE_ID: z.string().min(1, 'Starter price ID is required'),
  STRIPE_PRO_PRICE_ID: z.string().min(1, 'Pro price ID is required'),
  STRIPE_ENTERPRISE_PRICE_ID: z.string().min(1, 'Enterprise price ID is required'),
  
  // Stripe meter IDs
  STRIPE_SIGN_EVENTS_METER_ID: z.string().min(1, 'Sign events meter ID is required'),
  STRIPE_VERIFY_EVENTS_METER_ID: z.string().min(1, 'Verify events meter ID is required'),
  STRIPE_RFC3161_TIMESTAMPS_METER_ID: z.string().min(1, 'RFC3161 timestamps meter ID is required'),
  
  // RFC-3161 TSA configuration - SECURITY HARDENED
  RFC3161_TSA_ENDPOINT: z.string().url('RFC-3161 TSA endpoint must be a valid URL').refine(url => {
    // Only allow HTTPS in production
    if (process.env['NODE_ENV'] === 'production') {
      return url.startsWith('https://');
    }
    return true;
  }, { message: 'TSA endpoint must use HTTPS in production' }),
  RFC3161_TSA_USERNAME: z.string().min(1, 'TSA username is required'),
  RFC3161_TSA_PASSWORD: z.string().min(16, 'TSA password must be at least 16 characters').refine(pwd => {
    if (process.env['NODE_ENV'] === 'production') {
      return /[A-Z]/.test(pwd) && /[a-z]/.test(pwd) && /\d/.test(pwd);
    }
    return pwd.length >= 8;
  }, { message: 'TSA password must contain uppercase, lowercase, and numbers in production' }),
  RFC3161_TSA_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1000 && n <= 30000, { message: 'TSA timeout must be between 1000ms and 30000ms' }).default('10000'),
  
  // OpenTelemetry configuration
  OTEL_SERVICE_NAME: z.string().min(1).max(100).default('c2pa-billing'),
  OTEL_SERVICE_NAMESPACE: z.string().min(1).max(100).default('c2pa'),
  OTEL_SERVICE_VERSION: z.string().min(1).max(20).default('1.1.0'),
  OTEL_DEPLOYMENT_ENVIRONMENT: z.enum(['development', 'staging', 'production']).default('development'),
  OTEL_RESOURCE_ATTRIBUTES: z.string().optional(),
  
  // OpenTelemetry exporters
  OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().default('http://localhost:4318'),
  OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().url().default('http://localhost:4318/v1/traces'),
  OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: z.string().url().default('http://localhost:4318/v1/metrics'),
  OTEL_EXPORTER_OTLP_LOGS_ENDPOINT: z.string().url().default('http://localhost:4318/v1/logs'),
  OTEL_EXPORTER_OTLP_HEADERS: z.string().optional(),
  OTEL_EXPORTER_OTLP_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1000 && n <= 60000, { message: 'OTLP timeout must be between 1000ms and 60000ms' }).default('30000'),
  OTEL_EXPORTER_OTLP_COMPRESSION: z.enum(['none', 'gzip']).default('gzip'),
  
  // OpenTelemetry sampling
  OTEL_TRACE_SAMPLER: z.enum(['always_on', 'always_off', 'traceidratio', 'parentbased_always_on', 'parentbased_always_off', 'parentbased_traceidratio']).default('parentbased_traceidratio'),
  OTEL_TRACE_SAMPLER_ARG: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(n => n >= 0 && n <= 1, { message: 'Trace sampler arg must be between 0 and 1' }).default('0.01'),
  
  // OpenTelemetry batch processing
  OTEL_BSP_MAX_BATCH_SIZE: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 10000, { message: 'BSP max batch size must be between 1 and 10000' }).default('1024'),
  OTEL_BSP_MAX_EXPORT_BATCH_SIZE: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 10000, { message: 'BSP max export batch size must be between 1 and 10000' }).default('512'),
  OTEL_BSP_EXPORT_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1000 && n <= 30000, { message: 'BSP export timeout must be between 1000ms and 30000ms' }).default('30000'),
  OTEL_BSP_SCHEDULE_DELAY: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 100 && n <= 5000, { message: 'BSP schedule delay must be between 100ms and 5000ms' }).default('5000'),
  
  // OpenTelemetry metrics
  OTEL_METRIC_EXPORT_INTERVAL: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 10000 && n <= 300000, { message: 'Metric export interval must be between 10000ms and 300000ms' }).default('30000'),
  OTEL_METRIC_EXPORT_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1000 && n <= 60000, { message: 'Metric export timeout must be between 1000ms and 60000ms' }).default('30000'),
  
  // Prometheus exporter
  PROMETHEUS_ENDPOINT: z.string().min(1).max(50).default('0.0.0.0:9464'),
  PROMETHEUS_NAMESPACE: z.string().min(1).max(50).default('c2pa'),
  
  // Loki exporter
  LOKI_ENDPOINT: z.string().url().default('http://localhost:3100/loki/api/v1/push'),
  LOKI_USERNAME: z.string().optional(),
  LOKI_PASSWORD: z.string().optional(),
  LOKI_TENANT_ID: z.string().optional(),
  
  // Tempo exporter
  TEMPO_ENDPOINT: z.string().url().default('http://localhost:4318'),
  TEMPO_API_KEY: z.string().optional(),
  
  // SLO configuration
  SLO_WINDOW_DAYS: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 90, { message: 'SLO window must be between 1 and 90 days' }).default('30'),
  SLO_SURVIVAL_REMOTE_TARGET: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(n => n >= 0.9 && n <= 1, { message: 'SLO target must be between 0.9 and 1.0' }).default('0.999'),
  SLO_SURVIVAL_EMBED_TARGET: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(n => n >= 0.8 && n <= 1, { message: 'SLO target must be between 0.8 and 1.0' }).default('0.95'),
  SLO_VERIFY_LATENCY_P95_TARGET: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 100 && n <= 10000, { message: 'Latency target must be between 100ms and 10000ms' }).default('600'),
  SLO_SIGN_LATENCY_EMBED_P95_TARGET: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 100 && n <= 10000, { message: 'Latency target must be between 100ms and 10000ms' }).default('800'),
  SLO_SIGN_LATENCY_REMOTE_P95_TARGET: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 100 && n <= 10000, { message: 'Latency target must be between 100ms and 10000ms' }).default('400'),
  SLO_TSA_LATENCY_P95_TARGET: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 100 && n <= 10000, { message: 'Latency target must be between 100ms and 10000ms' }).default('300'),
  
  // Burn rate alerting
  BURN_RATE_CRITICAL_MULTIPLIER: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(n => n >= 1 && n <= 100, { message: 'Burn rate multiplier must be between 1 and 100' }).default('14.4'),
  BURN_RATE_HIGH_MULTIPLIER: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(n => n >= 1 && n <= 100, { message: 'Burn rate multiplier must be between 1 and 100' }).default('6.0'),
  BURN_RATE_MODERATE_MULTIPLIER: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(n => n >= 1 && n <= 100, { message: 'Burn rate multiplier must be between 1 and 100' }).default('2.0'),
  
  // Alerting configuration
  ALERT_WEBHOOK_URL: z.string().url().optional(),
  ALERT_SLACK_WEBHOOK_URL: z.string().url().optional(),
  ALERT_PAGERDUTY_INTEGRATION_KEY: z.string().optional(),
  ALERT_EMAIL_SMTP_HOST: z.string().optional(),
  ALERT_EMAIL_SMTP_PORT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 65535, { message: 'SMTP port must be between 1 and 65535' }).optional(),
  ALERT_EMAIL_USERNAME: z.string().optional(),
  ALERT_EMAIL_PASSWORD: z.string().optional(),
  
  // GameDay configuration
  GAMEDAY_ENABLED: z.string().regex(/^(true|false)$/).transform(Boolean).default('false'),
  GAMEDAY_FAILURE_INJECTION_RATE: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(n => n >= 0 && n <= 1, { message: 'Failure injection rate must be between 0 and 1' }).default('0.0'),
  
  // Release configuration
  GIT_SHA: z.string().min(7).max(40).regex(/^[a-f0-9]+$/).default('unknown'),
  RELEASE_VERSION: z.string().min(1).max(20).default('1.1.0'),
  RELEASE_TIME: z.string().datetime().default(() => new Date().toISOString()),
  
  // Cost tracking
  COST_TRACKING_ENABLED: z.string().regex(/^(true|false)$/).transform(Boolean).default('true'),
  COST_PER_SIGN_EVENT: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(n => n >= 0, { message: 'Cost must be non-negative' }).default('0.01'),
  COST_PER_VERIFY_EVENT: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(n => n >= 0, { message: 'Cost must be non-negative' }).default('0.005'),
  COST_PER_TSA_TIMESTAMP: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(n => n >= 0, { message: 'Cost must be non-negative' }).default('0.50'),
  LOG_COST_PER_GB: z.string().regex(/^\d+(\.\d+)?$/).transform(Number).refine(n => n >= 0, { message: 'Cost must be non-negative' }).default('0.50'),
  
  // Log budgeting
  LOG_BUDGET_TENANT_GB_PER_MONTH: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 100, { message: 'Log budget must be between 1GB and 100GB' }).default('1'),
  
  // Database configuration
  DATABASE_URL: z.string().url('Database URL must be a valid URL'),
  DATABASE_POOL_SIZE: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 100, { message: 'Database pool size must be between 1 and 100' }).default('10'),
  DATABASE_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1000 && n <= 60000, { message: 'Database timeout must be between 1000ms and 60000ms' }).default('30000'),
  
  // Security configuration - CRITICAL VALIDATION
  JWT_SECRET: z.string()
    .min(128, 'JWT secret must be at least 128 characters for production security')
    .refine(secret => {
      // Check for sufficient entropy - must contain uppercase, lowercase, numbers, and special chars
      const hasUpper = /[A-Z]/.test(secret);
      const hasLower = /[a-z]/.test(secret);
      const hasNumbers = /\d/.test(secret);
      const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"|,.<>/?]/.test(secret);
      const notCommonPattern = !/^(password|secret|key|jwt|test|demo)/i.test(secret);
      
      if (process.env['NODE_ENV'] === 'production') {
        return hasUpper && hasLower && hasNumbers && hasSpecial && notCommonPattern;
      }
      return hasUpper && hasLower && hasNumbers;
    }, { message: 'JWT secret must contain uppercase, lowercase, numbers, and special characters (no common patterns in production)' }),
    
  API_KEY_SECRET: z.string()
    .min(64, 'API key secret must be at least 64 characters for production security')
    .refine(secret => {
      const hasUpper = /[A-Z]/.test(secret);
      const hasLower = /[a-z]/.test(secret);
      const hasNumbers = /\d/.test(secret);
      const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"|,.<>/?]/.test(secret);
      const notCommonPattern = !/^(api|key|secret|test|demo)/i.test(secret);
      
      if (process.env['NODE_ENV'] === 'production') {
        return hasUpper && hasLower && hasNumbers && hasSpecial && notCommonPattern;
      }
      return hasUpper && hasLower && hasNumbers;
    }, { message: 'API key secret must contain uppercase, lowercase, numbers, and special characters (no common patterns in production)' }),
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
  
  // CORS configuration - CRITICAL SECURITY
  ALLOWED_ORIGINS: z.string()
    .transform(val => {
      const origins = val.split(',').map(o => o.trim());
      // CRITICAL: Enhanced origin validation to prevent bypass
      for (const origin of origins) {
        if (origin === '*') {
          if (process.env['NODE_ENV'] === 'production') {
            throw new Error('Wildcard origins not allowed in production');
          }
          continue;
        }
        
        // Allow localhost with port for development
        if (origin.match(/^https?:\/\/localhost:\d+$/)) {
          continue;
        }
        
        // CRITICAL: Strict domain validation - no wildcards, no IP addresses in production
        if (process.env['NODE_ENV'] === 'production') {
          // Must be HTTPS with exact domain match
          if (!origin.match(/^https:\/\/[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/)) {
            throw new Error(`Invalid production origin format - must be HTTPS with exact domain: ${origin}`);
          }
        } else {
          // Development allows HTTP and subdomains
          if (!origin.match(/^https?:\/\/[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/)) {
            throw new Error(`Invalid origin format: ${origin}`);
          }
        }
      }
      return origins;
    })
    .default('http://localhost:3000'),
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
 * Validate environment variables with rate limiting protection
 */
let envValidationAttempts = 0;
const MAX_ENV_VALIDATION_ATTEMPTS = 10;
const ENV_VALIDATION_WINDOW = 60000; // 1 minute
let lastValidationReset = Date.now();

export function validateEnvironment(): EnvConfig {
  try {
    // CRITICAL: Rate limit environment validation attempts with proper window reset
    const now = Date.now();
    if (now - lastValidationReset > ENV_VALIDATION_WINDOW) {
      envValidationAttempts = 0;
      lastValidationReset = now;
    }
    
    envValidationAttempts++;
    if (envValidationAttempts > MAX_ENV_VALIDATION_ATTEMPTS) {
      throw new Error('Environment validation rate limit exceeded');
    }
    
    return EnvSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => ({
        variable: err.path.join('.'),
        message: err.message,
        code: err.code,
      }));
      
      // CRITICAL: Sanitize error messages to prevent information disclosure
      const sanitizedErrors = errors.map(e => ({
        variable: e.variable,
        message: e.message.replace(/[^\w\s\-:.,()]/g, ''), // Remove special chars
      }));
      
      throw new Error(`Environment validation failed:\n${sanitizedErrors.map(e => `  ${e.variable}: ${e.message}`).join('\n')}`);
    }
    
    throw new Error(`Environment validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
