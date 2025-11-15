import { logger } from './logger';

/**
 * Environment Variable Validator
 * 
 * Validates required environment variables on startup
 * Prevents silent failures from misconfiguration
 */

interface EnvSchema {
  name: string;
  required: boolean;
  type: 'string' | 'number' | 'boolean' | 'url';
  default?: string | number | boolean;
  validator?: (value: string) => boolean;
  description?: string;
}

const ENV_SCHEMA: EnvSchema[] = [
  // Core
  {
    name: 'NODE_ENV',
    required: true,
    type: 'string',
    default: 'development',
    validator: (v) => ['development', 'production', 'test'].includes(v),
    description: 'Environment mode'
  },
  {
    name: 'PORT',
    required: true,
    type: 'number',
    default: 3001,
    validator: (v) => {
      const port = parseInt(v, 10);
      return !isNaN(port) && port >= 1 && port <= 65535;
    },
    description: 'Server port'
  },
  {
    name: 'LOG_LEVEL',
    required: false,
    type: 'string',
    default: 'info',
    validator: (v) => ['error', 'warn', 'info', 'debug'].includes(v),
    description: 'Logging level'
  },
  
  // CORS
  {
    name: 'ALLOWED_ORIGINS',
    required: false,
    type: 'string',
    default: 'http://localhost:3000',
    description: 'Comma-separated allowed origins'
  },
  
  // Rate Limiting
  {
    name: 'RATE_LIMIT_WINDOW_MS',
    required: false,
    type: 'number',
    default: 60000,
    validator: (v) => !isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0,
    description: 'Rate limit window in milliseconds'
  },
  {
    name: 'RATE_LIMIT_MAX',
    required: false,
    type: 'number',
    default: 100,
    validator: (v) => !isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0,
    description: 'Max requests per window'
  },
  
  // File Upload
  {
    name: 'MAX_FILE_SIZE_MB',
    required: false,
    type: 'number',
    default: 50,
    validator: (v) => !isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0 && parseInt(v, 10) <= 100,
    description: 'Maximum file size in MB'
  },
  
  // Authentication
  {
    name: 'ENABLE_API_KEY_AUTH',
    required: false,
    type: 'boolean',
    default: false,
    description: 'Enable API key authentication'
  },
  {
    name: 'API_KEYS',
    required: false,
    type: 'string',
    description: 'Comma-separated API keys (format: key:clientId:name)'
  },
  
  // Storage
  {
    name: 'USE_S3_PROOF_STORAGE',
    required: false,
    type: 'boolean',
    default: false,
    description: 'Use S3 for proof storage'
  },
  {
    name: 'S3_PROOF_BUCKET',
    required: false,
    type: 'string',
    description: 'S3 bucket name for proofs'
  },
  {
    name: 'PROOF_URI_DOMAIN',
    required: false,
    type: 'url',
    default: 'https://proofs.credlink.com',
    description: 'Domain for proof URIs'
  },
  
  // Monitoring
  {
    name: 'ENABLE_SENTRY',
    required: false,
    type: 'boolean',
    default: false,
    description: 'Enable Sentry error tracking'
  },
  {
    name: 'SENTRY_DSN',
    required: false,
    type: 'string',
    description: 'Sentry DSN'
  },
  
  // AWS Configuration (SECURITY CRITICAL)
  {
    name: 'AWS_REGION',
    required: false,
    type: 'string',
    default: 'us-east-1',
    validator: (v) => /^[a-z0-9-]+$/.test(v),
    description: 'AWS region for services'
  },
  {
    name: 'KMS_KEY_ID',
    required: false,
    type: 'string',
    validator: (v) => v.length > 0,
    description: 'AWS KMS key ID for production signing'
  },
  {
    name: 'ENCRYPTED_PRIVATE_KEY',
    required: false,
    type: 'string',
    validator: (v) => v.length > 0,
    description: 'Base64-encoded encrypted private key'
  },
  
  // Certificate Configuration (SECURITY CRITICAL)
  {
    name: 'SIGNING_CERTIFICATE',
    required: false,
    type: 'string',
    default: './certs/signing-cert.pem',
    validator: (v) => v.length > 0,
    description: 'Path to signing certificate file'
  },
  {
    name: 'SIGNING_PRIVATE_KEY',
    required: false,
    type: 'string',
    default: './certs/signing-key.pem',
    validator: (v) => v.length > 0,
    description: 'Path to signing private key file'
  },
  {
    name: 'ISSUER_CERTIFICATE',
    required: false,
    type: 'string',
    description: 'Path to issuer certificate file'
  },
  
  // C2PA Configuration
  {
    name: 'USE_REAL_C2PA',
    required: false,
    type: 'boolean',
    default: false,
    description: 'Use real C2PA library vs mock implementation'
  },
  {
    name: 'IMAGE_PROCESSING_TIMEOUT_MS',
    required: false,
    type: 'number',
    default: 30000,
    validator: (v) => !isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0 && parseInt(v, 10) <= 300000,
    description: 'Image processing timeout in milliseconds (max 5 minutes)'
  },
  {
    name: 'SERVICE_VERSION',
    required: false,
    type: 'string',
    default: '1.0.0',
    validator: (v) => /^\d+\.\d+\.\d+$/.test(v),
    description: 'Service version for manifests'
  },
  
  // Proof Storage Configuration
  {
    name: 'PROOF_STORAGE_PATH',
    required: false,
    type: 'string',
    default: './proofs',
    validator: (v) => v.length > 0,
    description: 'Local filesystem path for proof storage'
  },
  {
    name: 'USE_LOCAL_PROOF_STORAGE',
    required: false,
    type: 'boolean',
    default: true,
    description: 'Use local filesystem for proof storage'
  },
  
  // Rate Limiting (SECURITY CRITICAL)
  {
    name: 'SIGN_RATE_LIMIT_MAX',
    required: false,
    type: 'number',
    default: 100,
    validator: (v) => !isNaN(parseInt(v, 10)) && parseInt(v, 10) > 0 && parseInt(v, 10) <= 1000,
    description: 'Max signing requests per minute per IP'
  },
];

class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validate a single environment variable
 */
function validateEnvVar(schema: EnvSchema): void {
  const value = process.env[schema.name];
  
  // Check if required and missing
  if (schema.required && !value) {
    if (schema.default !== undefined) {
      process.env[schema.name] = String(schema.default);
      logger.warn(`Using default for ${schema.name}: ${schema.default}`);
      return;
    }
    throw new ValidationError(`Required environment variable missing: ${schema.name}`);
  }
  
  // If not required and missing, set default if exists
  if (!value && schema.default !== undefined) {
    process.env[schema.name] = String(schema.default);
    return;
  }
  
  // Skip validation if not present and not required
  if (!value) {
    return;
  }
  
  // Type validation
  switch (schema.type) {
    case 'number':
      if (isNaN(parseInt(value, 10))) {
        throw new ValidationError(`${schema.name} must be a number, got: ${value}`);
      }
      break;
    
    case 'boolean':
      if (!['true', 'false', '1', '0'].includes(value.toLowerCase())) {
        throw new ValidationError(`${schema.name} must be a boolean, got: ${value}`);
      }
      break;
    
    case 'url':
      try {
        new URL(value);
      } catch {
        throw new ValidationError(`${schema.name} must be a valid URL, got: ${value}`);
      }
      break;
  }
  
  // Custom validator
  if (schema.validator && !schema.validator(value)) {
    throw new ValidationError(`${schema.name} failed custom validation: ${value}`);
  }
}

/**
 * Validate all environment variables
 * Throws ValidationError if any validation fails
 */
export function validateEnvironment(): void {
  logger.info('Validating environment configuration...');
  
  const errors: string[] = [];
  
  for (const schema of ENV_SCHEMA) {
    try {
      validateEnvVar(schema);
    } catch (error) {
      if (error instanceof ValidationError) {
        errors.push(error.message);
      } else {
        errors.push(`Unexpected error validating ${schema.name}: ${(error as Error).message}`);
      }
    }
  }
  
  if (errors.length > 0) {
    logger.error('Environment validation failed', { errors });
    throw new ValidationError(`Environment validation failed:\n${errors.join('\n')}`);
  }
  
  // Production-specific validations
  if (process.env.NODE_ENV === 'production') {
    const warnings: string[] = [];
    
    if (process.env.ENABLE_API_KEY_AUTH !== 'true') {
      warnings.push('API key authentication is disabled in production');
    }
    
    if (process.env.ENABLE_SENTRY !== 'true') {
      warnings.push('Sentry error tracking is disabled in production');
    }
    
    if (process.env.USE_S3_PROOF_STORAGE !== 'true') {
      warnings.push('S3 proof storage is disabled - proofs will be lost on restart');
    }
    
    if (warnings.length > 0) {
      logger.warn('Production configuration warnings', { warnings });
    }
  }
  
  logger.info('Environment validation passed', {
    nodeEnv: process.env.NODE_ENV,
    port: process.env.PORT,
    apiKeyAuth: process.env.ENABLE_API_KEY_AUTH === 'true',
    s3Storage: process.env.USE_S3_PROOF_STORAGE === 'true',
    sentry: process.env.ENABLE_SENTRY === 'true',
  });
}

/**
 * Print environment configuration summary
 */
export function printEnvironmentSummary(): void {
  const summary = {
    Environment: process.env.NODE_ENV || 'development',
    Port: process.env.PORT || 3001,
    'API Key Auth': process.env.ENABLE_API_KEY_AUTH === 'true' ? 'Enabled' : 'Disabled',
    'S3 Storage': process.env.USE_S3_PROOF_STORAGE === 'true' ? 'Enabled' : 'Disabled',
    'Sentry Tracking': process.env.ENABLE_SENTRY === 'true' ? 'Enabled' : 'Disabled',
    'Log Level': process.env.LOG_LEVEL || 'info',
  };
  
  console.log('\n=== Configuration Summary ===');
  Object.entries(summary).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });
  console.log('============================\n');
}
