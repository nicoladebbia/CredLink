/**
 * Phase 35 Leaderboard - Environment Configuration
 * Secure environment variable validation and management
 */

import { z } from 'zod';
import crypto from 'crypto';

// Environment variable schema with validation
const EnvSchema = z.object({
  // Server configuration
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  HOST: z.string().min(1).max(253).regex(/^[a-zA-Z0-9.-]+$/).default('0.0.0.0'),
  PORT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 65535, { message: 'Port must be between 1 and 65535' }).default('3001'),
  
  // Redis configuration
  REDIS_HOST: z.string().min(1).max(253).default('localhost'),
  REDIS_PORT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 65535).default('6379'),
  REDIS_DB: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 0 && n <= 15).default('0'),
  REDIS_PASSWORD: z.string().min(0).max(255).optional(),
  REDIS_MAX_RETRIES: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 0 && n <= 10).default('3'),
  
  // Security configuration
  JWT_SECRET: z.string().min(32).max(255).describe('JWT secret must be at least 32 characters'),
  SESSION_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 300000 && n <= 86400000).default('3600000'), // 5 min to 24 hours
  ENABLE_SECURITY_HEADERS: z.enum(['true', 'false']).transform(val => val === 'true').default('true'),
  RATE_LIMIT_WINDOW: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 60000 && n <= 3600000).default('3600000'), // 1 min to 1 hour
  MAX_REQUESTS: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 10000).default('1000'),
  
  // CORS configuration
  ALLOWED_ORIGINS: z.string().min(1).max(1000).transform(val => val.split(',').map(o => o.trim())).default('http://localhost:3000'),
  
  // Testing configuration
  OUTPUT_DIR: z.string().min(1).max(255).regex(/^[a-zA-Z0-9/_-]+$/).default('./artifacts'),
  C2PATOOL_PATH: z.string().min(1).max(255).regex(/^[a-zA-Z0-9/_-]+$/).default('c2patool'),
  VERIFY_TOOL_PATH: z.string().min(1).max(255).regex(/^[a-zA-Z0-9/_-]+$/).default('cai-verify'),
  TEST_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 5000 && n <= 300000).default('30000'), // 5s to 5min
  MAX_CONCURRENT_TESTS: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 50).default('5'),
  RETRY_ATTEMPTS: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 0 && n <= 10).default('3'),
  RETRY_DELAY: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 100 && n <= 10000).default('1000'),
  
  // Leaderboard configuration
  UPDATE_SCHEDULE: z.string().min(1).max(100).regex(/^(\*|[0-5]?\d|\*\/\d+) (\*|[01]?\d|2[0-3]|\*\/\d+) (\*|[12]?\d|3[01]|\*\/\d+) (\*|[01]?\d|\*\/\d+) (\*|[0-6]|\*\/\d+)$/).default('0 2 * * 1'), // Monday 2 AM
  RETENTION_DAYS: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1 && n <= 365).default('90'),
  PUBLIC_RESULTS_URL: z.string().url().max(255).default('https://leaderboard.c2pa.org/data'),
  
  // Logging configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'pretty']).default('json'),
  
  // Request limits
  BODY_LIMIT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1024 && n <= 104857600).default('10485760'), // 1KB to 100MB
  REQUEST_TIMEOUT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1000 && n <= 300000).default('30000'), // 1s to 5min
  
  // Feature flags
  ENABLE_API_KEY_AUTH: z.enum(['true', 'false']).transform(val => val === 'true').default('false'),
  ENABLE_CORRECTION_SUBMISSIONS: z.enum(['true', 'false']).transform(val => val === 'true').default('true'),
  ENABLE_PUBLIC_API: z.enum(['true', 'false']).transform(val => val === 'true').default('true'),
  
  // Monitoring
  ENABLE_METRICS: z.enum(['true', 'false']).transform(val => val === 'true').default('true'),
  METRICS_PORT: z.string().regex(/^\d+$/).transform(Number).refine(n => n >= 1024 && n <= 65535).default('9090'),
});

export type EnvConfig = z.infer<typeof EnvSchema>;

/**
 * Validate and load environment configuration
 */
export function validateEnvironment(): EnvConfig {
  try {
    const env = EnvSchema.parse(process.env);
    
    // Security validations
    validateSecurityRequirements(env);
    
    return env;
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
    // JWT secret must be strong in production
    if (env.JWT_SECRET.length < 64) {
      throw new Error('JWT_SECRET must be at least 64 characters in production');
    }
    
    // Rate limiting must be enabled
    if (env.MAX_REQUESTS > 1000) {
      throw new Error('MAX_REQUESTS should not exceed 1000 in production');
    }
    
    // Security headers must be enabled
    if (!env.ENABLE_SECURITY_HEADERS) {
      throw new Error('Security headers must be enabled in production');
    }
    
    // Session timeout should be reasonable
    if (env.SESSION_TIMEOUT > 8 * 60 * 60 * 1000) { // 8 hours
      throw new Error('Session timeout should not exceed 8 hours in production');
    }
  }
  
  // Redis configuration validation
  if (env.REDIS_HOST === 'localhost' && env.NODE_ENV === 'production') {
    console.warn('WARNING: Using localhost Redis in production is not recommended');
  }
  
  // Network security validation
  if (env.HOST === '0.0.0.0' && env.NODE_ENV === 'production') {
    console.warn('WARNING: Binding to 0.0.0.0 in production - ensure firewall is configured');
  }
  
  // File system validation
  if (env.OUTPUT_DIR.startsWith('/etc') || env.OUTPUT_DIR.startsWith('/boot')) {
    throw new Error('OUTPUT_DIR cannot point to system directories');
  }
  
  // Tool path validation
  const dangerousPaths = ['/etc', '/boot', '/root', '/home', '/var'];
  for (const dangerous of dangerousPaths) {
    if (env.C2PATOOL_PATH.startsWith(dangerous) || env.VERIFY_TOOL_PATH.startsWith(dangerous)) {
      throw new Error(`Tool paths cannot point to system directories: ${dangerous}`);
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
  return validateEnvironment();
}

/**
 * Get configuration summary for logging
 */
export function getConfigSummary(env: EnvConfig): Record<string, any> {
  return {
    environment: env.NODE_ENV,
    server: {
      host: env.HOST,
      port: env.PORT,
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      db: env.REDIS_DB,
      hasPassword: !!env.REDIS_PASSWORD,
    },
    security: {
      headersEnabled: env.ENABLE_SECURITY_HEADERS,
      rateLimitEnabled: true,
      apiKeyAuthEnabled: env.ENABLE_API_KEY_AUTH,
    },
    features: {
      correctionsEnabled: env.ENABLE_CORRECTION_SUBMISSIONS,
      publicApiEnabled: env.ENABLE_PUBLIC_API,
      metricsEnabled: env.ENABLE_METRICS,
    },
    limits: {
      bodyLimit: env.BODY_LIMIT,
      requestTimeout: env.REQUEST_TIMEOUT,
      maxConcurrentTests: env.MAX_CONCURRENT_TESTS,
    }
  };
}
