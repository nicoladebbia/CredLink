// ===========================================
// Production Constants with Environment Overrides
// ===========================================
// 🔥 HARDCODED VALUES ELIMINATION: All values configurable via environment

export const DEFAULT_CONSTANTS = {
  // ===========================================
  // Server Configuration Constants
  // ===========================================
  SERVER: {
    DEFAULT_PORT: parseInt(process.env.DEFAULT_SERVER_PORT || '3000'),
    DEFAULT_APP_NAME: process.env.DEFAULT_APP_NAME || 'credlink-api',
    DEFAULT_HOST: process.env.DEFAULT_HOST || '0.0.0.0',
    DEFAULT_NODE_ENV: process.env.DEFAULT_NODE_ENV || 'development',
  },

  // ===========================================
  // Security Configuration Constants
  // ===========================================
  SECURITY: {
    DEFAULT_JWT_EXPIRES_IN: process.env.DEFAULT_JWT_EXPIRES_IN || '1h',
    DEFAULT_API_KEY_COUNT: parseInt(process.env.DEFAULT_API_KEY_COUNT || '2'),
    DEFAULT_SESSION_TIMEOUT: parseInt(process.env.DEFAULT_SESSION_TIMEOUT || '3600000'),
  },

  // ===========================================
  // Rate Limiting Configuration Constants
  // ===========================================
  RATE_LIMIT: {
    DEFAULT_WINDOW_MS: parseInt(process.env.DEFAULT_RATE_LIMIT_WINDOW_MS || '900000'),
    DEFAULT_MAX_REQUESTS: parseInt(process.env.DEFAULT_RATE_LIMIT_MAX || '100'),
    DEFAULT_WINDOW_MINUTES: parseInt(process.env.DEFAULT_RATE_LIMIT_WINDOW_MINUTES || '15'),
  },

  // ===========================================
  // AWS Configuration Constants
  // ===========================================
  AWS: {
    DEFAULT_REGION: process.env.DEFAULT_AWS_REGION || 'us-east-1',
    DEFAULT_S3_BUCKET: process.env.DEFAULT_S3_BUCKET || 'credlink-proofs',
    DEFAULT_S3_PREFIX: process.env.DEFAULT_S3_PREFIX || 'proofs/',
    DEFAULT_KMS_KEY_TEMPLATE: process.env.DEFAULT_KMS_KEY_TEMPLATE || 'arn:aws:kms:{region}:{account}:key/{keyId}',
  },

  // ===========================================
  // Database Configuration Constants
  // ===========================================
  DATABASE: {
    DEFAULT_PORT: parseInt(process.env.DEFAULT_DB_PORT || '5432'),
    DEFAULT_HOST: process.env.DEFAULT_DB_HOST || 'localhost',
    DEFAULT_NAME_TEMPLATE: process.env.DEFAULT_DB_NAME_TEMPLATE || '{appName}_db',
    DEFAULT_USER_TEMPLATE: process.env.DEFAULT_DB_USER_TEMPLATE || '{appName}_user',
    DEFAULT_TIMEOUT: parseInt(process.env.DEFAULT_DB_TIMEOUT || '5000'),
    DEFAULT_POOL_MIN: parseInt(process.env.DEFAULT_DB_POOL_MIN || '2'),
    DEFAULT_POOL_MAX: parseInt(process.env.DEFAULT_DB_POOL_MAX || '20'),
  },

  // ===========================================
  // Logging Configuration Constants
  // ===========================================
  LOGGING: {
    DEFAULT_LEVEL: process.env.DEFAULT_LOG_LEVEL || 'info',
    DEFAULT_FORMAT: process.env.DEFAULT_LOG_FORMAT || 'json',
    DEFAULT_CLOUDWATCH_GROUP_TEMPLATE: process.env.DEFAULT_CLOUDWATCH_GROUP_TEMPLATE || '/{appName}/{env}',
    DEFAULT_METRICS_PORT: parseInt(process.env.DEFAULT_METRICS_PORT || '9090'),
  },

  // ===========================================
  // Storage Configuration Constants
  // ===========================================
  STORAGE: {
    DEFAULT_BACKEND: process.env.DEFAULT_STORAGE_BACKEND || 'memory',
    DEFAULT_PROOF_PATH: process.env.DEFAULT_PROOF_STORAGE_PATH || './proofs',
    DEFAULT_PROOF_URI_DOMAIN: process.env.DEFAULT_PROOF_URI_DOMAIN || 'https://proofs.credlink.com',
    DEFAULT_BASE_URL_TEMPLATE: process.env.DEFAULT_STORAGE_BASE_URL_TEMPLATE || 'https://{env}.storage.credlink.com',
  },

  // ===========================================
  // C2PA Configuration Constants
  // ===========================================
  C2PA: {
    DEFAULT_MAX_EMBED_SIZE_MB: parseInt(process.env.DEFAULT_MAX_EMBED_SIZE_MB || '10'),
    DEFAULT_MANIFEST_HASH_REQUIRED: process.env.DEFAULT_REQUIRE_MANIFEST_HASH === 'true',
    DEFAULT_USE_REAL_C2PA: process.env.DEFAULT_USE_REAL_C2PA !== 'false',
  },

  // ===========================================
  // Sandbox Configuration Constants
  // ===========================================
  SANDBOX: {
    DEFAULT_STRIP_HAPPY_PORT: parseInt(process.env.DEFAULT_STRIP_HAPPY_PORT || '4101'),
    DEFAULT_PRESERVE_EMBED_PORT: parseInt(process.env.DEFAULT_PRESERVE_EMBED_PORT || '4102'),
    DEFAULT_REMOTE_ONLY_PORT: parseInt(process.env.DEFAULT_REMOTE_ONLY_PORT || '4103'),
    DEFAULT_PORT_START: parseInt(process.env.DEFAULT_SANDBOX_PORT_START || '4100'),
    DEFAULT_PORT_END: parseInt(process.env.DEFAULT_SANDBOX_PORT_END || '4200'),
  },

  // ===========================================
  // Manifest Configuration Constants
  // ===========================================
  MANIFEST: {
    DEFAULT_BASE_TEMPLATE: process.env.DEFAULT_MANIFEST_BASE_TEMPLATE || 'https://manifests.{env}.credlink.com',
    DEFAULT_VERIFY_HOST_TEMPLATE: process.env.DEFAULT_VERIFY_HOST_TEMPLATE || 'https://verify.{env}.credlink.com',
    DEFAULT_FALLBACK_BASE: process.env.DEFAULT_MANIFEST_FALLBACK_BASE || 'https://manifests.survival.test',
    DEFAULT_FALLBACK_VERIFY: process.env.DEFAULT_MANIFEST_FALLBACK_VERIFY || 'https://verify.survival.test',
  },

  // ===========================================
  // Circuit Breaker Configuration Constants
  // ===========================================
  CIRCUIT_BREAKER: {
    DEFAULT_FAILURE_THRESHOLD: parseInt(process.env.DEFAULT_CIRCUIT_BREAKER_FAILURE_THRESHOLD || '5'),
    DEFAULT_RESET_TIMEOUT: parseInt(process.env.DEFAULT_CIRCUIT_BREAKER_RESET_TIMEOUT || '60000'),
    DEFAULT_MONITORING_PERIOD: parseInt(process.env.DEFAULT_CIRCUIT_BREAKER_MONITORING_PERIOD || '10000'),
    DEFAULT_EXPECTED_RECOVERY_TIME: parseInt(process.env.DEFAULT_CIRCUIT_BREAKER_EXPECTED_RECOVERY_TIME || '30000'),
    DEFAULT_LOCK_TIMEOUT: parseInt(process.env.DEFAULT_CIRCUIT_BREAKER_LOCK_TIMEOUT || '5000'),
    DEFAULT_LOCK_CLEANUP_INTERVAL: parseInt(process.env.DEFAULT_CIRCUIT_BREAKER_LOCK_CLEANUP_INTERVAL || '5000'),
    DEFAULT_MAX_LOCK_WAIT_TIME: parseInt(process.env.DEFAULT_CIRCUIT_BREAKER_MAX_LOCK_WAIT_TIME || '5000'),
    DEFAULT_RANDOM_DELAY_MIN: parseInt(process.env.DEFAULT_CIRCUIT_BREAKER_RANDOM_DELAY_MIN || '1'),
    DEFAULT_RANDOM_DELAY_MAX: parseInt(process.env.DEFAULT_CIRCUIT_BREAKER_RANDOM_DELAY_MAX || '10'),
    DEFAULT_SUCCESS_THRESHOLD_BASE: parseInt(process.env.DEFAULT_CIRCUIT_BREAKER_SUCCESS_THRESHOLD_BASE || '3'),
    DEFAULT_FORCE_RELEASE_THRESHOLD: parseInt(process.env.DEFAULT_CIRCUIT_BREAKER_FORCE_RELEASE_THRESHOLD || '30000'),
    
    // Environment-specific overrides
    PRODUCTION_FAILURE_THRESHOLD: parseInt(process.env.PRODUCTION_CIRCUIT_BREAKER_FAILURE_THRESHOLD || '10'),
    PRODUCTION_RESET_TIMEOUT: parseInt(process.env.PRODUCTION_CIRCUIT_BREAKER_RESET_TIMEOUT || '30000'),
    PRODUCTION_EXPECTED_RECOVERY_TIME: parseInt(process.env.PRODUCTION_CIRCUIT_BREAKER_EXPECTED_RECOVERY_TIME || '15000'),
    PRODUCTION_MAX_LOCK_WAIT_TIME: parseInt(process.env.PRODUCTION_CIRCUIT_BREAKER_MAX_LOCK_WAIT_TIME || '3000'),
    PRODUCTION_RANDOM_DELAY_MAX: parseInt(process.env.PRODUCTION_CIRCUIT_BREAKER_RANDOM_DELAY_MAX || '5'),
    
    TEST_LOCK_TIMEOUT: parseInt(process.env.TEST_CIRCUIT_BREAKER_LOCK_TIMEOUT || '1000'),
  },

  // ===========================================
  // File Processing Configuration Constants
  // ===========================================
  FILE_PROCESSING: {
    DEFAULT_MAX_SIZE_MB: parseInt(process.env.DEFAULT_MAX_FILE_SIZE_MB || '50'),
    DEFAULT_CHUNK_SIZE: parseInt(process.env.DEFAULT_CHUNK_SIZE || '1024'),
    DEFAULT_TIMEOUT: parseInt(process.env.DEFAULT_PROCESSING_TIMEOUT || '30000'),
  },

  // ===========================================
  // Compliance Configuration Constants
  // ===========================================
  COMPLIANCE: {
    DEFAULT_CORS_ORIGIN_TEMPLATE: process.env.DEFAULT_CORS_ORIGIN_TEMPLATE || 'https://{env}.credlink.com',
    DEFAULT_SSL_KEY_PATH_TEMPLATE: process.env.DEFAULT_SSL_KEY_PATH_TEMPLATE || '/etc/ssl/{env}/private.key',
    DEFAULT_SSL_CERT_PATH_TEMPLATE: process.env.DEFAULT_SSL_CERT_PATH_TEMPLATE || '/etc/ssl/{env}/certificate.crt',
    DEFAULT_AUDIT_RETENTION_DAYS: parseInt(process.env.DEFAULT_AUDIT_RETENTION_DAYS || '90'),
  },

  // ===========================================
  // Feature Flag Constants
  // ===========================================
  FEATURES: {
    DEFAULT_API_KEY_AUTH: process.env.DEFAULT_API_KEY_AUTH === 'true',
    DEFAULT_RATE_LIMITING: process.env.DEFAULT_RATE_LIMITING === 'true',
    DEFAULT_METRICS: process.env.DEFAULT_METRICS === 'true',
    DEFAULT_AUTHENTICATION: process.env.DEFAULT_AUTHENTICATION === 'true',
    DEFAULT_AUDIT_LOGGING: process.env.DEFAULT_AUDIT_LOGGING === 'true',
  },

  // ===========================================
  // Time and Duration Constants
  // ===========================================
  TIME: {
    ONE_SECOND_MS: 1000,
    ONE_MINUTE_MS: 60 * 1000,
    FIVE_MINUTES_MS: 5 * 60 * 1000,
    FIFTEEN_MINUTES_MS: 15 * 60 * 1000,
    THIRTY_MINUTES_MS: 30 * 60 * 1000,
    ONE_HOUR_MS: 60 * 60 * 1000,
    ONE_DAY_MS: 24 * 60 * 60 * 1000,
    
    // Configurable time multipliers
    SECOND_MULTIPLIER: parseFloat(process.env.TIME_SECOND_MULTIPLIER || '1.0'),
    MINUTE_MULTIPLIER: parseFloat(process.env.TIME_MINUTE_MULTIPLIER || '60.0'),
    HOUR_MULTIPLIER: parseFloat(process.env.TIME_HOUR_MULTIPLIER || '3600.0'),
  },

  // ===========================================
  // Size and Limit Constants
  // ===========================================
  SIZES: {
    KB: 1024,
    MB: 1024 * 1024,
    GB: 1024 * 1024 * 1024,
    
    // Configurable size multipliers
    KB_MULTIPLIER: parseFloat(process.env.SIZE_KB_MULTIPLIER || '1024'),
    MB_MULTIPLIER: parseFloat(process.env.SIZE_MB_MULTIPLIER || '1048576'),
    GB_MULTIPLIER: parseFloat(process.env.SIZE_GB_MULTIPLIER || '1073741824'),
  },

  // ===========================================
  // URL and Path Templates
  // ===========================================
  TEMPLATES: {
    ENVIRONMENT_SUBDOMAIN: process.env.ENVIRONMENT_SUBDOMAIN_TEMPLATE || '{env}',
    SERVICE_URL: process.env.SERVICE_URL_TEMPLATE || 'https://{service}.{env}.credlink.com',
    API_URL: process.env.API_URL_TEMPLATE || 'https://api.{env}.credlink.com',
    STORAGE_URL: process.env.STORAGE_URL_TEMPLATE || 'https://storage.{env}.credlink.com',
    CDN_URL: process.env.CDN_URL_TEMPLATE || 'https://cdn.{env}.credlink.com',
  },
};

// ===========================================
// Helper Functions for Dynamic Value Resolution
// ===========================================

export function resolveTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{([^}]+)\}/g, (match, key) => {
    return variables[key] || match;
  });
}

export function getEnvironmentSpecificValue<T>(
  defaultValue: T,
  productionValue?: T,
  testValue?: T,
  nodeEnv: string = process.env.NODE_ENV || 'development'
): T {
  if (nodeEnv === 'production' && productionValue !== undefined) {
    return productionValue;
  }
  if (nodeEnv === 'test' && testValue !== undefined) {
    return testValue;
  }
  return defaultValue;
}

export function calculateTimeValue(baseMs: number, multiplier: keyof typeof DEFAULT_CONSTANTS.TIME = 'ONE_SECOND_MS'): number {
  return baseMs * DEFAULT_CONSTANTS.TIME[multiplier] / DEFAULT_CONSTANTS.TIME.ONE_SECOND_MS;
}

export function calculateSizeValue(baseSize: number, unit: keyof typeof DEFAULT_CONSTANTS.SIZES = 'KB'): number {
  return baseSize * DEFAULT_CONSTANTS.SIZES[unit];
}
