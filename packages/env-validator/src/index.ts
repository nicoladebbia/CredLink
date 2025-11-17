/**
 * @credlink/env-validator
 * 
 * Secure environment variable validation with type safety and defaults
 * Prevents runtime crashes from missing/invalid environment variables
 */

export interface EnvConfig {
  // API Configuration
  API_PORT: number;
  BETA_PORT: number;
  NODE_ENV: 'development' | 'production' | 'test';
  
  // Security
  RATE_LIMIT_SIGN_MAX: number;
  RATE_LIMIT_VERIFY_MAX: number;
  MAX_FILE_SIZE_MB: number;
  ENABLE_API_KEY_AUTH: boolean;
  
  // Redis Configuration
  REDIS_HOST: string;
  REDIS_PORT: number;
  REDIS_PASSWORD?: string;
  REDIS_DB: number;
  
  // AWS Configuration
  AWS_REGION: string;
  AWS_ACCESS_KEY_ID?: string;
  AWS_SECRET_ACCESS_KEY?: string;
  
  // Storage Configuration
  PROOF_STORAGE_PATH: string;
  PROOF_URI_DOMAIN: string;
  USE_LOCAL_PROOF_STORAGE: boolean;
  
  // Certificate Configuration
  SIGNING_CERTIFICATE: string;
  SIGNING_PRIVATE_KEY: string;
  ISSUER_CERTIFICATE?: string;
  
  // C2PA Configuration
  USE_REAL_C2PA: boolean;
  IMAGE_PROCESSING_TIMEOUT_MS: number;
}

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EnvValidationError';
  }
}

export class EnvValidator {
  private static config: EnvConfig;
  private static validated = false;

  static validate(): EnvConfig {
    if (this.validated) {
      return this.config;
    }

    const config: Partial<EnvConfig> = {};

    // API Configuration
    config.API_PORT = this.parseInt(process.env.API_PORT, 3000, 'API_PORT');
    config.BETA_PORT = this.parseInt(process.env.BETA_PORT, 3001, 'BETA_PORT');
    config.NODE_ENV = this.parseEnum(
      process.env.NODE_ENV,
      ['development', 'production', 'test'],
      'development',
      'NODE_ENV'
    ) as 'development' | 'production' | 'test';

    // Security
    config.RATE_LIMIT_SIGN_MAX = this.parseInt(process.env.RATE_LIMIT_SIGN_MAX, 100, 'RATE_LIMIT_SIGN_MAX');
    config.RATE_LIMIT_VERIFY_MAX = this.parseInt(process.env.RATE_LIMIT_VERIFY_MAX, 200, 'RATE_LIMIT_VERIFY_MAX');
    config.MAX_FILE_SIZE_MB = this.parseInt(process.env.MAX_FILE_SIZE_MB, 50, 'MAX_FILE_SIZE_MB');
    config.ENABLE_API_KEY_AUTH = this.parseBoolean(process.env.ENABLE_API_KEY_AUTH, false, 'ENABLE_API_KEY_AUTH');

    // Redis Configuration
    config.REDIS_HOST = this.parseString(process.env.REDIS_HOST, 'localhost', 'REDIS_HOST');
    config.REDIS_PORT = this.parseInt(process.env.REDIS_PORT, 6379, 'REDIS_PORT');
    config.REDIS_PASSWORD = process.env.REDIS_PASSWORD; // Optional
    config.REDIS_DB = this.parseInt(process.env.REDIS_DB, 0, 'REDIS_DB');

    // AWS Configuration
    config.AWS_REGION = this.parseString(process.env.AWS_REGION, 'us-east-1', 'AWS_REGION');
    config.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID; // Optional for development
    config.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY; // Optional for development

    // Storage Configuration
    config.PROOF_STORAGE_PATH = this.parseString(process.env.PROOF_STORAGE_PATH, './proofs', 'PROOF_STORAGE_PATH');
    config.PROOF_URI_DOMAIN = this.parseString(process.env.PROOF_URI_DOMAIN, 'https://proofs.credlink.com', 'PROOF_URI_DOMAIN');
    config.USE_LOCAL_PROOF_STORAGE = this.parseBoolean(process.env.USE_LOCAL_PROOF_STORAGE, true, 'USE_LOCAL_PROOF_STORAGE');

    // Certificate Configuration
    config.SIGNING_CERTIFICATE = this.parseString(process.env.SIGNING_CERTIFICATE, './certs/signing-cert.pem', 'SIGNING_CERTIFICATE');
    config.SIGNING_PRIVATE_KEY = this.parseString(process.env.SIGNING_PRIVATE_KEY, './certs/signing-key.pem', 'SIGNING_PRIVATE_KEY');
    config.ISSUER_CERTIFICATE = process.env.ISSUER_CERTIFICATE; // Optional

    // C2PA Configuration
    config.USE_REAL_C2PA = this.parseBoolean(process.env.USE_REAL_C2PA, false, 'USE_REAL_C2PA');
    config.IMAGE_PROCESSING_TIMEOUT_MS = this.parseInt(process.env.IMAGE_PROCESSING_TIMEOUT_MS, 30000, 'IMAGE_PROCESSING_TIMEOUT_MS');

    // Security validations
    this.validateSecurityConstraints(config);

    this.config = config as EnvConfig;
    this.validated = true;

    return this.config;
  }

  private static parseInt(
    value: string | undefined,
    defaultValue: number,
    name: string
  ): number {
    if (value === undefined || value === '') {
      return defaultValue;
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) {
      throw new EnvValidationError(`Invalid ${name}: must be a number, got "${value}"`);
    }

    return parsed;
  }

  private static parseString(
    value: string | undefined,
    defaultValue: string,
    name: string
  ): string {
    if (value === undefined || value === '') {
      return defaultValue;
    }

    if (typeof value !== 'string') {
      throw new EnvValidationError(`Invalid ${name}: must be a string, got ${typeof value}`);
    }

    // Security: Remove potential path traversal
    if (name.includes('PATH') || name.includes('CERTIFICATE') || name.includes('KEY')) {
      return value.replace(/\.\./g, '').trim();
    }

    return value.trim();
  }

  private static parseBoolean(
    value: string | undefined,
    defaultValue: boolean,
    name: string
  ): boolean {
    if (value === undefined || value === '') {
      return defaultValue;
    }

    const normalized = value.toLowerCase().trim();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }

    throw new EnvValidationError(`Invalid ${name}: must be boolean, got "${value}"`);
  }

  private static parseEnum<T extends string>(
    value: string | undefined,
    allowedValues: T[],
    defaultValue: T,
    name: string
  ): T {
    if (value === undefined || value === '') {
      return defaultValue;
    }

    if (!allowedValues.includes(value as T)) {
      throw new EnvValidationError(`Invalid ${name}: must be one of ${allowedValues.join(', ')}, got "${value}"`);
    }

    return value as T;
  }

  private static validateSecurityConstraints(config: Partial<EnvConfig>): void {
    // Port ranges
    if (config.API_PORT && (config.API_PORT < 1024 || config.API_PORT > 65535)) {
      throw new EnvValidationError('API_PORT must be between 1024 and 65535');
    }

    if (config.BETA_PORT && (config.BETA_PORT < 1024 || config.BETA_PORT > 65535)) {
      throw new EnvValidationError('BETA_PORT must be between 1024 and 65535');
    }

    // File size limits
    if (config.MAX_FILE_SIZE_MB && config.MAX_FILE_SIZE_MB > 1000) {
      throw new EnvValidationError('MAX_FILE_SIZE_MB must be <= 1000 (1GB)');
    }

    // Rate limits
    if (config.RATE_LIMIT_SIGN_MAX && config.RATE_LIMIT_SIGN_MAX > 10000) {
      throw new EnvValidationError('RATE_LIMIT_SIGN_MAX must be <= 10000');
    }

    // Redis configuration
    if (config.REDIS_PORT && (config.REDIS_PORT < 1 || config.REDIS_PORT > 65535)) {
      throw new EnvValidationError('REDIS_PORT must be between 1 and 65535');
    }

    if (config.REDIS_DB && (config.REDIS_DB < 0 || config.REDIS_DB > 15)) {
      throw new EnvValidationError('REDIS_DB must be between 0 and 15');
    }

    // Timeout constraints
    if (config.IMAGE_PROCESSING_TIMEOUT_MS && config.IMAGE_PROCESSING_TIMEOUT_MS > 300000) {
      throw new EnvValidationError('IMAGE_PROCESSING_TIMEOUT_MS must be <= 300000 (5 minutes)');
    }

    // Production security checks
    if (config.NODE_ENV === 'production') {
      if (!config.AWS_ACCESS_KEY_ID || !config.AWS_SECRET_ACCESS_KEY) {
        throw new EnvValidationError('AWS credentials required in production');
      }

      if (config.ENABLE_API_KEY_AUTH !== true) {
        throw new EnvValidationError('API key authentication must be enabled in production');
      }

      if (config.USE_LOCAL_PROOF_STORAGE === true) {
        throw new EnvValidationError('Local proof storage not allowed in production');
      }
    }
  }

  static getConfig(): EnvConfig {
    if (!this.validated) {
      throw new EnvValidationError('Environment not validated. Call validate() first.');
    }
    return this.config;
  }

  static isProduction(): boolean {
    return this.getConfig().NODE_ENV === 'production';
  }

  static isDevelopment(): boolean {
    return this.getConfig().NODE_ENV === 'development';
  }

  static isTest(): boolean {
    return this.getConfig().NODE_ENV === 'test';
  }
}

// Export singleton instance
export const env = EnvValidator;
