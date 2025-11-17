// ===========================================
// Unified Configuration Management for CredLink
// ===========================================

// Export all types and interfaces
export * from './types';

// Export configuration loading and validation
export {
  ConfigBuilder,
  loadConfig,
  loadValidatedConfig,
  getConfig,
  resetConfig,
  validateConfig,
  getConfigSection,
} from './config';

// Export date utilities for dynamic date management
export {
  DateUtils,
  DATE_CONSTANTS,
} from './date-utils';

// Re-export commonly used types for convenience
export type {
  CredLinkConfig,
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
