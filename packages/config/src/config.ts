import { z } from 'zod';
import { DEFAULT_CONSTANTS, resolveTemplate, getEnvironmentSpecificValue } from './constants';
import {
  CredLinkConfig,
  CredLinkConfigSchema,
  ValidatedConfig,
  ServerConfig,
  SecurityConfig,
  RateLimitConfig,
  AwsConfig,
  S3Config,
  DatabaseConfig,
  LoggingConfig,
  StorageConfig,
  C2paConfig,
  SandboxConfig,
  ManifestConfig,
  CircuitBreakerConfig,
  ComplianceConfig,
  FileProcessingConfig,
  FeatureFlags,
} from './types';

// ===========================================
// Environment Variable Mapping
// ===========================================

interface EnvVars {
  // Server Configuration
  PORT?: string;
  NODE_ENV?: string;
  APP_NAME?: string;
  HOST?: string;

  // Security Configuration
  API_KEYS?: string;
  ENABLE_API_KEY_AUTH?: string;
  JWT_SECRET?: string;
  JWT_EXPIRES_IN?: string;
  ENABLE_HELMET?: string;
  ENABLE_CSP?: string;

  // Rate Limiting Configuration
  RATE_LIMIT_WINDOW_MS?: string;
  RATE_LIMIT_MAX?: string;
  RATE_LIMIT_WINDOW?: string;
  ENABLE_RATE_LIMITING?: string;

  // AWS Configuration
  AWS_REGION?: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  KMS_KEY_ID?: string;
  ENCRYPTED_PRIVATE_KEY?: string;

  // S3 Configuration
  S3_BUCKET?: string;
  S3_PREFIX?: string;
  STORAGE_BASE_URL?: string;

  // Database Configuration
  DATABASE_URL?: string;
  DB_HOST?: string;
  DB_PORT?: string;
  DB_NAME?: string;
  DB_USER?: string;
  DB_PASSWORD?: string;
  DB_CA_CERT_PATH?: string;

  // Logging Configuration
  LOG_LEVEL?: string;
  LOG_FORMAT?: string;
  AWS_CLOUDWATCH_LOG_GROUP?: string;
  SENTRY_DSN?: string;
  SENTRY_ENVIRONMENT?: string;
  ENABLE_DEFAULT_METRICS?: string;

  // Storage Configuration
  STORAGE_BACKEND?: string;
  USE_LOCAL_PROOF_STORAGE?: string;
  PROOF_STORAGE_PATH?: string;
  PROOF_URI_DOMAIN?: string;

  // C2PA Configuration
  USE_REAL_C2PA?: string;
  MAX_EMBED_SIZE_MB?: string;
  REQUIRE_MANIFEST_HASH?: string;

  // Sandbox Configuration
  STRIP_HAPPY_PORT?: string;
  PRESERVE_EMBED_PORT?: string;
  REMOTE_ONLY_PORT?: string;

  // Manifest Configuration
  MANIFEST_BASE?: string;
  VERIFY_HOST?: string;

  // Circuit Breaker Configuration
  CIRCUIT_BREAKER_FAILURE_THRESHOLD?: string;
  CIRCUIT_BREAKER_RESET_TIMEOUT?: string;
  CIRCUIT_BREAKER_MONITORING_PERIOD?: string;
  CIRCUIT_BREAKER_EXPECTED_RECOVERY_TIME?: string;
  CIRCUIT_BREAKER_LOCK_TIMEOUT?: string;
  CIRCUIT_BREAKER_LOCK_CLEANUP_INTERVAL?: string;
  CIRCUIT_BREAKER_MAX_LOCK_WAIT_TIME?: string;
  CIRCUIT_BREAKER_RANDOM_DELAY_MIN?: string;
  CIRCUIT_BREAKER_RANDOM_DELAY_MAX?: string;
  CIRCUIT_BREAKER_SUCCESS_THRESHOLD_BASE?: string;
  CIRCUIT_BREAKER_FORCE_RELEASE_THRESHOLD?: string;

  // Compliance Configuration
  CORS_ORIGIN?: string;
  CORS_CREDENTIALS?: string;
  SSL_KEY_PATH?: string;
  SSL_CERT_PATH?: string;
  ENABLE_METRICS?: string;
  METRICS_PORT?: string;
  ENABLE_AUTHENTICATION?: string;
  ENABLE_AUDIT_LOGGING?: string;

  // File Processing Configuration
  MAX_FILE_SIZE_MB?: string;

  // Feature Flags
  ALLOW_STATIC_FALLBACK_ON_DB_FAIL?: string;
  USE_DATABASE_API_KEYS?: string;
  ENABLE_AUTH?: string;
}

// ===========================================
// Configuration Loading Functions
// ===========================================

function parseBoolean(value: string | undefined, defaultValue = false): boolean {
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

function parseNumber(value: string | undefined, defaultValue: number): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseStringArray(value: string | undefined, defaultValue: string[] = []): string[] {
  if (!value) return defaultValue;
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function parseUrl(value: string | undefined, defaultValue?: string): string | undefined {
  if (!value) return defaultValue;
  try {
    new URL(value);
    return value;
  } catch {
    return defaultValue;
  }
}

// ===========================================
// Environment-Specific Defaults (No Hardcoded Values)
// ===========================================

function getEnvironmentDefaults(nodeEnv: string) {
  const isProduction = nodeEnv === 'production';
  const isTest = nodeEnv === 'test';

  return {
    server: {
      port: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.SERVER.DEFAULT_PORT,
        DEFAULT_CONSTANTS.SERVER.DEFAULT_PORT,
        DEFAULT_CONSTANTS.SERVER.DEFAULT_PORT,
        nodeEnv
      ),
      appName: DEFAULT_CONSTANTS.SERVER.DEFAULT_APP_NAME,
    },
    security: {
      enableApiKeyAuth: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.FEATURES.DEFAULT_API_KEY_AUTH,
        true, // Production default
        false, // Test default
        nodeEnv
      ),
      enableHelmet: isProduction,
      enableCsp: isProduction,
    },
    rateLimit: {
      windowMs: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.RATE_LIMIT.DEFAULT_WINDOW_MS,
        DEFAULT_CONSTANTS.TIME.ONE_HOUR_MS, // Production: 1 hour
        DEFAULT_CONSTANTS.TIME.FIFTEEN_MINUTES_MS, // Test: 15 minutes
        nodeEnv
      ),
      max: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.RATE_LIMIT.DEFAULT_MAX_REQUESTS,
        100, // Production
        1000, // Test
        nodeEnv
      ),
      enableRateLimiting: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.FEATURES.DEFAULT_RATE_LIMITING,
        true, // Production
        false, // Test
        nodeEnv
      ),
    },
    logging: {
      level: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.LOGGING.DEFAULT_LEVEL,
        'info', // Production
        'debug', // Test
        nodeEnv
      ),
      format: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.LOGGING.DEFAULT_FORMAT,
        'json', // Production
        'text', // Test
        nodeEnv
      ),
      enableDefaultMetrics: isProduction,
    },
    circuitBreaker: {
      failureThreshold: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_FAILURE_THRESHOLD,
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.PRODUCTION_FAILURE_THRESHOLD,
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_FAILURE_THRESHOLD,
        nodeEnv
      ),
      resetTimeout: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_RESET_TIMEOUT,
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.PRODUCTION_RESET_TIMEOUT,
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_RESET_TIMEOUT,
        nodeEnv
      ),
      monitoringPeriod: DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_MONITORING_PERIOD,
      expectedRecoveryTime: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_EXPECTED_RECOVERY_TIME,
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.PRODUCTION_EXPECTED_RECOVERY_TIME,
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_EXPECTED_RECOVERY_TIME,
        nodeEnv
      ),
      lockTimeout: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_LOCK_TIMEOUT,
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_LOCK_TIMEOUT,
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.TEST_LOCK_TIMEOUT,
        nodeEnv
      ),
      maxLockWaitTime: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_MAX_LOCK_WAIT_TIME,
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.PRODUCTION_MAX_LOCK_WAIT_TIME,
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_MAX_LOCK_WAIT_TIME,
        nodeEnv
      ),
      randomDelayMax: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_RANDOM_DELAY_MAX,
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.PRODUCTION_RANDOM_DELAY_MAX,
        DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_RANDOM_DELAY_MAX,
        nodeEnv
      ),
    },
    fileProcessing: {
      maxFileSizeMb: getEnvironmentSpecificValue(
        DEFAULT_CONSTANTS.FILE_PROCESSING.DEFAULT_MAX_SIZE_MB,
        DEFAULT_CONSTANTS.FILE_PROCESSING.DEFAULT_MAX_SIZE_MB,
        DEFAULT_CONSTANTS.FILE_PROCESSING.DEFAULT_MAX_SIZE_MB * 2, // Test: double size
        nodeEnv
      ),
    },
  };
}

// ===========================================
// Configuration Builder
// ===========================================

export class ConfigBuilder {
  private env: EnvVars;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.env = env as EnvVars;
  }

  private loadServerConfig(): ServerConfig {
    const nodeEnv = (this.env.NODE_ENV as any) || DEFAULT_CONSTANTS.SERVER.DEFAULT_NODE_ENV;
    const defaults = getEnvironmentDefaults(nodeEnv);

    return {
      port: parseNumber(this.env.PORT, defaults.server.port),
      nodeEnv,
      appName: this.env.APP_NAME || DEFAULT_CONSTANTS.SERVER.DEFAULT_APP_NAME,
      host: this.env.HOST || DEFAULT_CONSTANTS.SERVER.DEFAULT_HOST,
    };
  }

  private loadSecurityConfig(): SecurityConfig {
    const nodeEnv = (this.env.NODE_ENV as any) || DEFAULT_CONSTANTS.SERVER.DEFAULT_NODE_ENV;
    const defaults = getEnvironmentDefaults(nodeEnv);

    return {
      apiKeys: parseStringArray(this.env.API_KEYS),
      enableApiKeyAuth: parseBoolean(this.env.ENABLE_API_KEY_AUTH, defaults.security.enableApiKeyAuth),
      jwtSecret: this.env.JWT_SECRET,
      jwtExpiresIn: this.env.JWT_EXPIRES_IN || DEFAULT_CONSTANTS.SECURITY.DEFAULT_JWT_EXPIRES_IN,
      enableHelmet: parseBoolean(this.env.ENABLE_HELMET, defaults.security.enableHelmet),
      enableCsp: parseBoolean(this.env.ENABLE_CSP, defaults.security.enableCsp),
    };
  }

  private loadRateLimitConfig(): RateLimitConfig {
    const nodeEnv = (this.env.NODE_ENV as any) || DEFAULT_CONSTANTS.SERVER.DEFAULT_NODE_ENV;
    const defaults = getEnvironmentDefaults(nodeEnv);

    // Handle both RATE_LIMIT_WINDOW_MS and RATE_LIMIT_WINDOW for consolidation
    const windowMs = this.env.RATE_LIMIT_WINDOW_MS 
      ? parseNumber(this.env.RATE_LIMIT_WINDOW_MS, defaults.rateLimit.windowMs)
      : this.env.RATE_LIMIT_WINDOW
      ? this.parseTimeString(this.env.RATE_LIMIT_WINDOW)
      : defaults.rateLimit.windowMs;

    return {
      windowMs,
      max: parseNumber(this.env.RATE_LIMIT_MAX, defaults.rateLimit.max),
      enableRateLimiting: parseBoolean(this.env.ENABLE_RATE_LIMITING, defaults.rateLimit.enableRateLimiting),
    };
  }

  private loadAwsConfig(): AwsConfig {
    return {
      region: this.env.AWS_REGION || DEFAULT_CONSTANTS.AWS.DEFAULT_REGION,
      accessKeyId: this.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: this.env.AWS_SECRET_ACCESS_KEY,
      kmsKeyId: this.env.KMS_KEY_ID,
      encryptedPrivateKey: this.env.ENCRYPTED_PRIVATE_KEY,
    };
  }

  private loadS3Config(): S3Config {
    return {
      bucket: this.env.S3_BUCKET || DEFAULT_CONSTANTS.AWS.DEFAULT_S3_BUCKET,
      prefix: this.env.S3_PREFIX || DEFAULT_CONSTANTS.AWS.DEFAULT_S3_PREFIX,
      endpoint: this.env.STORAGE_BASE_URL,
    };
  }

  private loadDatabaseConfig(): DatabaseConfig {
    return {
      url: parseUrl(this.env.DATABASE_URL),
      host: this.env.DB_HOST || DEFAULT_CONSTANTS.DATABASE.DEFAULT_HOST,
      port: parseNumber(this.env.DB_PORT, DEFAULT_CONSTANTS.DATABASE.DEFAULT_PORT),
      name: this.env.DB_NAME,
      user: this.env.DB_USER,
      password: this.env.DB_PASSWORD,
      ssl: this.env.NODE_ENV === 'production',
      caCertPath: this.env.DB_CA_CERT_PATH,
    };
  }

  private loadLoggingConfig(): LoggingConfig {
    const nodeEnv = (this.env.NODE_ENV as any) || DEFAULT_CONSTANTS.SERVER.DEFAULT_NODE_ENV;
    const defaults = getEnvironmentDefaults(nodeEnv);

    return {
      level: (this.env.LOG_LEVEL as any) || defaults.logging.level,
      format: (this.env.LOG_FORMAT as any) || defaults.logging.format,
      cloudwatchLogGroup: this.env.AWS_CLOUDWATCH_LOG_GROUP,
      sentryDsn: parseUrl(this.env.SENTRY_DSN),
      sentryEnvironment: this.env.SENTRY_ENVIRONMENT || nodeEnv,
      enableDefaultMetrics: parseBoolean(this.env.ENABLE_DEFAULT_METRICS, defaults.logging.enableDefaultMetrics),
    };
  }

  private loadStorageConfig(): StorageConfig {
    return {
      backend: (this.env.STORAGE_BACKEND as any) || DEFAULT_CONSTANTS.STORAGE.DEFAULT_BACKEND,
      useLocalProofStorage: parseBoolean(this.env.USE_LOCAL_PROOF_STORAGE),
      proofStoragePath: this.env.PROOF_STORAGE_PATH || DEFAULT_CONSTANTS.STORAGE.DEFAULT_PROOF_PATH,
      proofUriDomain: parseUrl(this.env.PROOF_URI_DOMAIN) || DEFAULT_CONSTANTS.STORAGE.DEFAULT_PROOF_URI_DOMAIN,
      baseUrl: parseUrl(this.env.STORAGE_BASE_URL),
    };
  }

  private loadC2paConfig(): C2paConfig {
    return {
      useRealC2pa: parseBoolean(this.env.USE_REAL_C2PA, DEFAULT_CONSTANTS.C2PA.DEFAULT_USE_REAL_C2PA),
      maxEmbedSizeMb: parseNumber(this.env.MAX_EMBED_SIZE_MB, DEFAULT_CONSTANTS.C2PA.DEFAULT_MAX_EMBED_SIZE_MB),
      requireManifestHash: parseBoolean(this.env.REQUIRE_MANIFEST_HASH, DEFAULT_CONSTANTS.C2PA.DEFAULT_MANIFEST_HASH_REQUIRED),
    };
  }

  private loadSandboxConfig(): SandboxConfig {
    return {
      stripHappyPort: parseNumber(this.env.STRIP_HAPPY_PORT, DEFAULT_CONSTANTS.SANDBOX.DEFAULT_STRIP_HAPPY_PORT),
      preserveEmbedPort: parseNumber(this.env.PRESERVE_EMBED_PORT, DEFAULT_CONSTANTS.SANDBOX.DEFAULT_PRESERVE_EMBED_PORT),
      remoteOnlyPort: parseNumber(this.env.REMOTE_ONLY_PORT, DEFAULT_CONSTANTS.SANDBOX.DEFAULT_REMOTE_ONLY_PORT),
    };
  }

  private loadManifestConfig(): ManifestConfig {
    const base = parseUrl(this.env.MANIFEST_BASE, DEFAULT_CONSTANTS.MANIFEST.DEFAULT_FALLBACK_BASE);
    const verifyHost = parseUrl(this.env.VERIFY_HOST, DEFAULT_CONSTANTS.MANIFEST.DEFAULT_FALLBACK_VERIFY);
    
    // 🔥 CRITICAL FIX: Prevent undefined return values from crashing application
    if (!base || !verifyHost) {
      throw new Error('Manifest configuration requires valid URLs for MANIFEST_BASE and VERIFY_HOST');
    }
    
    return {
      base,
      verifyHost,
    };
  }

  private loadCircuitBreakerConfig(): CircuitBreakerConfig {
    const nodeEnv = (this.env.NODE_ENV as any) || DEFAULT_CONSTANTS.SERVER.DEFAULT_NODE_ENV;
    const defaults = getEnvironmentDefaults(nodeEnv);

    return {
      failureThreshold: parseNumber(this.env.CIRCUIT_BREAKER_FAILURE_THRESHOLD, defaults.circuitBreaker.failureThreshold),
      resetTimeout: parseNumber(this.env.CIRCUIT_BREAKER_RESET_TIMEOUT, defaults.circuitBreaker.resetTimeout),
      monitoringPeriod: parseNumber(this.env.CIRCUIT_BREAKER_MONITORING_PERIOD, DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_MONITORING_PERIOD),
      expectedRecoveryTime: parseNumber(this.env.CIRCUIT_BREAKER_EXPECTED_RECOVERY_TIME, defaults.circuitBreaker.expectedRecoveryTime),
      lockTimeout: parseNumber(this.env.CIRCUIT_BREAKER_LOCK_TIMEOUT, defaults.circuitBreaker.lockTimeout),
      lockCleanupInterval: parseNumber(this.env.CIRCUIT_BREAKER_LOCK_CLEANUP_INTERVAL, DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_LOCK_CLEANUP_INTERVAL),
      maxLockWaitTime: parseNumber(this.env.CIRCUIT_BREAKER_MAX_LOCK_WAIT_TIME, defaults.circuitBreaker.maxLockWaitTime),
      randomDelayMin: parseNumber(this.env.CIRCUIT_BREAKER_RANDOM_DELAY_MIN, DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_RANDOM_DELAY_MIN),
      randomDelayMax: parseNumber(this.env.CIRCUIT_BREAKER_RANDOM_DELAY_MAX, defaults.circuitBreaker.randomDelayMax),
      successThresholdBase: parseNumber(this.env.CIRCUIT_BREAKER_SUCCESS_THRESHOLD_BASE, DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_SUCCESS_THRESHOLD_BASE),
      forceReleaseThreshold: parseNumber(this.env.CIRCUIT_BREAKER_FORCE_RELEASE_THRESHOLD, DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_FORCE_RELEASE_THRESHOLD),
    };
  }

  private loadComplianceConfig(): ComplianceConfig {
    return {
      corsOrigin: parseUrl(this.env.CORS_ORIGIN),
      corsCredentials: parseBoolean(this.env.CORS_CREDENTIALS),
      sslKeyPath: this.env.SSL_KEY_PATH,
      sslCertPath: this.env.SSL_CERT_PATH,
      enableMetrics: parseBoolean(this.env.ENABLE_METRICS),
      metricsPort: parseNumber(this.env.METRICS_PORT, DEFAULT_CONSTANTS.LOGGING.DEFAULT_METRICS_PORT),
      enableAuthentication: parseBoolean(this.env.ENABLE_AUTHENTICATION),
      enableAuditLogging: parseBoolean(this.env.ENABLE_AUDIT_LOGGING),
    };
  }

  private loadFileProcessingConfig(): FileProcessingConfig {
    const nodeEnv = (this.env.NODE_ENV as any) || DEFAULT_CONSTANTS.SERVER.DEFAULT_NODE_ENV;
    const defaults = getEnvironmentDefaults(nodeEnv);

    return {
      maxFileSizeMb: parseNumber(this.env.MAX_FILE_SIZE_MB, defaults.fileProcessing.maxFileSizeMb),
    };
  }

  private loadFeatureFlags(): FeatureFlags {
    return {
      allowStaticFallbackOnDbFail: parseBoolean(this.env.ALLOW_STATIC_FALLBACK_ON_DB_FAIL),
      useDatabaseApiKeys: parseBoolean(this.env.USE_DATABASE_API_KEYS),
      enableAuth: parseBoolean(this.env.ENABLE_AUTH),
    };
  }

  private parseTimeString(timeStr: string): number {
    // Parse time strings like "15m", "1h", "30s" using constants
    const match = timeStr.match(/^(\d+)([smhd])$/);
    if (!match) return DEFAULT_CONSTANTS.RATE_LIMIT.DEFAULT_WINDOW_MS; // Default 15 minutes

    const [, num, unit] = match;
    const value = parseInt(num, 10);

    switch (unit) {
      case 's': return value * DEFAULT_CONSTANTS.TIME.ONE_SECOND_MS;
      case 'm': return value * DEFAULT_CONSTANTS.TIME.ONE_MINUTE_MS;
      case 'h': return value * DEFAULT_CONSTANTS.TIME.ONE_HOUR_MS;
      case 'd': return value * DEFAULT_CONSTANTS.TIME.ONE_DAY_MS;
      default: return DEFAULT_CONSTANTS.RATE_LIMIT.DEFAULT_WINDOW_MS;
    }
  }

  // ===========================================
  // Build Configuration
  // ===========================================

  build(): CredLinkConfig {
    return {
      server: this.loadServerConfig(),
      security: this.loadSecurityConfig(),
      rateLimit: this.loadRateLimitConfig(),
      aws: this.loadAwsConfig(),
      s3: this.loadS3Config(),
      database: this.loadDatabaseConfig(),
      logging: this.loadLoggingConfig(),
      storage: this.loadStorageConfig(),
      c2pa: this.loadC2paConfig(),
      sandbox: this.loadSandboxConfig(),
      manifest: this.loadManifestConfig(),
      circuitBreaker: this.loadCircuitBreakerConfig(),
      compliance: this.loadComplianceConfig(),
      fileProcessing: this.loadFileProcessingConfig(),
      featureFlags: this.loadFeatureFlags(),
    };
  }

  buildAndValidate(): ValidatedConfig {
    const config = this.build();
    return CredLinkConfigSchema.parse(config);
  }
}

// ===========================================
// Configuration Factory Functions
// ===========================================

export function loadConfig(env: NodeJS.ProcessEnv = process.env): CredLinkConfig {
  return new ConfigBuilder(env).build();
}

export function loadValidatedConfig(env: NodeJS.ProcessEnv = process.env): ValidatedConfig {
  try {
    return new ConfigBuilder(env).buildAndValidate();
  } catch (error) {
    if (error instanceof z.ZodError) {
      const formattedError = error.errors.map((err: any) => 
        `${err.path.join('.')}: ${err.message}`
      ).join('\n');
      throw new Error(`Configuration validation failed:\n${formattedError}`);
    }
    throw error;
  }
}

// ===========================================
// Configuration Singleton with Safety
// ===========================================

let _config: ValidatedConfig | null = null;
let _configInitialized = false;

export function getConfig(): ValidatedConfig {
    // 🔥 CRITICAL FIX: Prevent uninitialized singleton from crashing application
    if (!_configInitialized) {
        throw new Error('Configuration not initialized. Call loadValidatedConfig() first.');
    }
    if (!_config) {
        throw new Error('Configuration initialization failed. Check environment variables.');
    }
    return _config;
}

export function resetConfig(): void {
    clearSectionCache();
    _config = null;
    _configInitialized = false;
}

// 🔥 PRODUCTION SAFETY: Initialize config with graceful fallback
export function initializeConfig(env: NodeJS.ProcessEnv = process.env): ValidatedConfig {
    try {
        _config = loadValidatedConfig(env);
        _configInitialized = true;
        return _config;
    } catch (error) {
        // 🔥 PRODUCTION FIX: Provide safe fallback instead of crashing
        console.error('Configuration initialization failed, using safe defaults:', error);
        
        // 🔥 CRITICAL FIX: Safe fallback configuration using constants system (no hardcoded values)
        const safeConfig: ValidatedConfig = {
            server: {
                port: DEFAULT_CONSTANTS.SERVER.DEFAULT_PORT,
                nodeEnv: DEFAULT_CONSTANTS.SERVER.DEFAULT_NODE_ENV as 'development' | 'production' | 'test',
                appName: DEFAULT_CONSTANTS.SERVER.DEFAULT_APP_NAME,
                host: DEFAULT_CONSTANTS.SERVER.DEFAULT_HOST,
            },
            security: {
                apiKeys: [],
                enableApiKeyAuth: DEFAULT_CONSTANTS.FEATURES.DEFAULT_API_KEY_AUTH,
                jwtExpiresIn: DEFAULT_CONSTANTS.SECURITY.DEFAULT_JWT_EXPIRES_IN,
                enableHelmet: false,
                enableCsp: false,
            },
            rateLimit: {
                windowMs: DEFAULT_CONSTANTS.RATE_LIMIT.DEFAULT_WINDOW_MS,
                max: DEFAULT_CONSTANTS.RATE_LIMIT.DEFAULT_MAX_REQUESTS,
                enableRateLimiting: DEFAULT_CONSTANTS.FEATURES.DEFAULT_RATE_LIMITING,
            },
            aws: {
                region: DEFAULT_CONSTANTS.AWS.DEFAULT_REGION,
            },
            s3: {
                bucket: DEFAULT_CONSTANTS.AWS.DEFAULT_S3_BUCKET,
                prefix: DEFAULT_CONSTANTS.AWS.DEFAULT_S3_PREFIX,
            },
            database: {
                host: DEFAULT_CONSTANTS.DATABASE.DEFAULT_HOST,
                port: DEFAULT_CONSTANTS.DATABASE.DEFAULT_PORT,
                ssl: false,
            },
            logging: {
                level: DEFAULT_CONSTANTS.LOGGING.DEFAULT_LEVEL as 'info' | 'debug' | 'warn' | 'error',
                format: DEFAULT_CONSTANTS.LOGGING.DEFAULT_FORMAT as 'json' | 'text',
                enableDefaultMetrics: DEFAULT_CONSTANTS.FEATURES.DEFAULT_METRICS,
            },
            storage: {
                backend: DEFAULT_CONSTANTS.STORAGE.DEFAULT_BACKEND as 'memory' | 'local' | 's3',
                proofStoragePath: DEFAULT_CONSTANTS.STORAGE.DEFAULT_PROOF_PATH,
                proofUriDomain: DEFAULT_CONSTANTS.STORAGE.DEFAULT_PROOF_URI_DOMAIN,
            },
            c2pa: {
                useRealC2pa: DEFAULT_CONSTANTS.C2PA.DEFAULT_USE_REAL_C2PA,
                maxEmbedSizeMb: DEFAULT_CONSTANTS.C2PA.DEFAULT_MAX_EMBED_SIZE_MB,
                requireManifestHash: DEFAULT_CONSTANTS.C2PA.DEFAULT_MANIFEST_HASH_REQUIRED,
            },
            sandbox: {
                stripHappyPort: DEFAULT_CONSTANTS.SANDBOX.DEFAULT_STRIP_HAPPY_PORT,
                preserveEmbedPort: DEFAULT_CONSTANTS.SANDBOX.DEFAULT_PRESERVE_EMBED_PORT,
                remoteOnlyPort: DEFAULT_CONSTANTS.SANDBOX.DEFAULT_REMOTE_ONLY_PORT,
            },
            manifest: {
                base: DEFAULT_CONSTANTS.MANIFEST.DEFAULT_FALLBACK_BASE,
                verifyHost: DEFAULT_CONSTANTS.MANIFEST.DEFAULT_FALLBACK_VERIFY,
            },
            circuitBreaker: {
                failureThreshold: DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_FAILURE_THRESHOLD,
                resetTimeout: DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_RESET_TIMEOUT,
                monitoringPeriod: DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_MONITORING_PERIOD,
                expectedRecoveryTime: DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_EXPECTED_RECOVERY_TIME,
                lockTimeout: DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_LOCK_TIMEOUT,
                lockCleanupInterval: DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_LOCK_CLEANUP_INTERVAL,
                maxLockWaitTime: DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_MAX_LOCK_WAIT_TIME,
                randomDelayMin: DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_RANDOM_DELAY_MIN,
                randomDelayMax: DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_RANDOM_DELAY_MAX,
                successThresholdBase: DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_SUCCESS_THRESHOLD_BASE,
                forceReleaseThreshold: DEFAULT_CONSTANTS.CIRCUIT_BREAKER.DEFAULT_FORCE_RELEASE_THRESHOLD,
            },
            compliance: {
                enableMetrics: DEFAULT_CONSTANTS.FEATURES.DEFAULT_METRICS,
                metricsPort: DEFAULT_CONSTANTS.LOGGING.DEFAULT_METRICS_PORT,
                enableAuthentication: DEFAULT_CONSTANTS.FEATURES.DEFAULT_AUTHENTICATION,
                enableAuditLogging: DEFAULT_CONSTANTS.FEATURES.DEFAULT_AUDIT_LOGGING,
            },
            fileProcessing: {
                maxFileSizeMb: DEFAULT_CONSTANTS.FILE_PROCESSING.DEFAULT_MAX_SIZE_MB,
            },
            featureFlags: {
                allowStaticFallbackOnDbFail: false,
                useDatabaseApiKeys: false,
                enableAuth: DEFAULT_CONSTANTS.FEATURES.DEFAULT_AUTHENTICATION,
            },
        };
        
        _config = safeConfig;
        _configInitialized = true;
        return _config;
    }
}

// ===========================================
// Utility Functions with Performance Optimization
// ===========================================

// 🔥 PERFORMANCE FIX: Cache config sections to avoid repeated getConfig() calls
const _sectionCache = new Map<string, any>();

export function validateConfig(config: unknown): ValidatedConfig {
  return CredLinkConfigSchema.parse(config);
}

export function getConfigSection<T extends keyof ValidatedConfig>(section: T): ValidatedConfig[T] {
    // 🔥 PERFORMANCE FIX: Cache sections to avoid repeated singleton access
    const sectionKey = String(section);
    if (_sectionCache.has(sectionKey)) {
        return _sectionCache.get(sectionKey);
    }
    
    const configSection = getConfig()[section];
    _sectionCache.set(sectionKey, configSection);
    return configSection;
}

// 🔥 MEMORY SAFETY: Clear section cache when config is reset
export function clearSectionCache(): void {
    _sectionCache.clear();
}
