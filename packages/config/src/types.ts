import { z } from 'zod';

// ===========================================
// Core Configuration Interfaces
// ===========================================

export interface ServerConfig {
  port: number;
  nodeEnv: 'development' | 'production' | 'test';
  appName: string;
  host?: string;
}

export interface SecurityConfig {
  apiKeys: string[];
  enableApiKeyAuth: boolean;
  jwtSecret?: string;
  jwtExpiresIn?: string;
  enableHelmet?: boolean;
  enableCsp?: boolean;
}

export interface RateLimitConfig {
  windowMs: number;
  max: number;
  enableRateLimiting?: boolean;
}

export interface AwsConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  kmsKeyId?: string;
  encryptedPrivateKey?: string;
}

export interface S3Config {
  bucket: string;
  prefix?: string;
  endpoint?: string;
}

export interface DatabaseConfig {
  url?: string;
  host?: string;
  port?: number;
  name?: string;
  user?: string;
  password?: string;
  ssl?: boolean;
  caCertPath?: string;
}

export interface LoggingConfig {
  level: 'debug' | 'info' | 'warn' | 'error';
  format?: 'json' | 'text';
  cloudwatchLogGroup?: string;
  sentryDsn?: string;
  sentryEnvironment?: string;
  enableDefaultMetrics?: boolean;
}

export interface StorageConfig {
  backend: 'memory' | 'local' | 's3';
  useLocalProofStorage?: boolean;
  proofStoragePath?: string;
  proofUriDomain?: string;
  baseUrl?: string;
}

export interface C2paConfig {
  useRealC2pa: boolean;
  maxEmbedSizeMb?: number;
  requireManifestHash?: boolean;
}

export interface SandboxConfig {
  stripHappyPort: number;
  preserveEmbedPort: number;
  remoteOnlyPort: number;
}

export interface ManifestConfig {
  base: string;
  verifyHost: string;
}

export interface CircuitBreakerConfig {
  failureThreshold: number;
  resetTimeout: number;
  monitoringPeriod: number;
  expectedRecoveryTime: number;
  lockTimeout?: number;
  lockCleanupInterval?: number;
  maxLockWaitTime?: number;
  randomDelayMin?: number;
  randomDelayMax?: number;
  successThresholdBase?: number;
  forceReleaseThreshold?: number;
}

export interface ComplianceConfig {
  corsOrigin?: string;
  corsCredentials?: boolean;
  sslKeyPath?: string;
  sslCertPath?: string;
  enableMetrics?: boolean;
  metricsPort?: number;
  enableAuthentication?: boolean;
  enableAuditLogging?: boolean;
}

export interface FileProcessingConfig {
  maxFileSizeMb: number;
}

export interface FeatureFlags {
  allowStaticFallbackOnDbFail?: boolean;
  useDatabaseApiKeys?: boolean;
  enableAuth?: boolean;
}

// ===========================================
// Complete Configuration Interface
// ===========================================

export interface CredLinkConfig {
  server: ServerConfig;
  security: SecurityConfig;
  rateLimit: RateLimitConfig;
  aws: AwsConfig;
  s3: S3Config;
  database: DatabaseConfig;
  logging: LoggingConfig;
  storage: StorageConfig;
  c2pa: C2paConfig;
  sandbox: SandboxConfig;
  manifest: ManifestConfig;
  circuitBreaker: CircuitBreakerConfig;
  compliance: ComplianceConfig;
  fileProcessing: FileProcessingConfig;
  featureFlags: FeatureFlags;
}

// ===========================================
// Zod Validation Schemas
// ===========================================

export const ServerConfigSchema = z.object({
  port: z.number().min(1).max(65535),
  nodeEnv: z.enum(['development', 'production', 'test']),
  appName: z.string().min(1),
  host: z.string().optional(),
});

export const SecurityConfigSchema = z.object({
  apiKeys: z.array(z.string()),
  enableApiKeyAuth: z.boolean(),
  jwtSecret: z.string().optional(),
  jwtExpiresIn: z.string().optional(),
  enableHelmet: z.boolean().optional(),
  enableCsp: z.boolean().optional(),
});

export const RateLimitConfigSchema = z.object({
  windowMs: z.number().positive(),
  max: z.number().positive(),
  enableRateLimiting: z.boolean().optional(),
});

export const AwsConfigSchema = z.object({
  region: z.string().min(1),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  kmsKeyId: z.string().optional(),
  encryptedPrivateKey: z.string().optional(),
});

export const S3ConfigSchema = z.object({
  bucket: z.string().min(1),
  prefix: z.string().optional(),
  endpoint: z.string().optional(),
});

export const DatabaseConfigSchema = z.object({
  url: z.string().url().optional(),
  host: z.string().optional(),
  port: z.number().min(1).max(65535).optional(),
  name: z.string().optional(),
  user: z.string().optional(),
  password: z.string().optional(),
  ssl: z.boolean().optional(),
  caCertPath: z.string().optional(),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(['debug', 'info', 'warn', 'error']),
  format: z.enum(['json', 'text']).optional(),
  cloudwatchLogGroup: z.string().optional(),
  sentryDsn: z.string().url().optional(),
  sentryEnvironment: z.string().optional(),
  enableDefaultMetrics: z.boolean().optional(),
});

export const StorageConfigSchema = z.object({
  backend: z.enum(['memory', 'local', 's3']),
  useLocalProofStorage: z.boolean().optional(),
  proofStoragePath: z.string().optional(),
  proofUriDomain: z.string().url().optional(),
  baseUrl: z.string().url().optional(),
});

export const C2paConfigSchema = z.object({
  useRealC2pa: z.boolean(),
  maxEmbedSizeMb: z.number().positive().optional(),
  requireManifestHash: z.boolean().optional(),
});

export const SandboxConfigSchema = z.object({
  stripHappyPort: z.number().min(1).max(65535),
  preserveEmbedPort: z.number().min(1).max(65535),
  remoteOnlyPort: z.number().min(1).max(65535),
});

export const ManifestConfigSchema = z.object({
  base: z.string().url(),
  verifyHost: z.string().url(),
});

export const CircuitBreakerConfigSchema = z.object({
  failureThreshold: z.number().positive(),
  resetTimeout: z.number().positive(),
  monitoringPeriod: z.number().positive(),
  expectedRecoveryTime: z.number().positive(),
  lockTimeout: z.number().positive().optional(),
  lockCleanupInterval: z.number().positive().optional(),
  maxLockWaitTime: z.number().positive().optional(),
  randomDelayMin: z.number().positive().optional(),
  randomDelayMax: z.number().positive().optional(),
  successThresholdBase: z.number().positive().optional(),
  forceReleaseThreshold: z.number().positive().optional(),
});

export const ComplianceConfigSchema = z.object({
  corsOrigin: z.string().url().optional(),
  corsCredentials: z.boolean().optional(),
  sslKeyPath: z.string().optional(),
  sslCertPath: z.string().optional(),
  enableMetrics: z.boolean().optional(),
  metricsPort: z.number().min(1).max(65535).optional(),
  enableAuthentication: z.boolean().optional(),
  enableAuditLogging: z.boolean().optional(),
});

export const FileProcessingConfigSchema = z.object({
  maxFileSizeMb: z.number().positive(),
});

export const FeatureFlagsSchema = z.object({
  allowStaticFallbackOnDbFail: z.boolean().optional(),
  useDatabaseApiKeys: z.boolean().optional(),
  enableAuth: z.boolean().optional(),
});

export const CredLinkConfigSchema = z.object({
  server: ServerConfigSchema,
  security: SecurityConfigSchema,
  rateLimit: RateLimitConfigSchema,
  aws: AwsConfigSchema,
  s3: S3ConfigSchema,
  database: DatabaseConfigSchema,
  logging: LoggingConfigSchema,
  storage: StorageConfigSchema,
  c2pa: C2paConfigSchema,
  sandbox: SandboxConfigSchema,
  manifest: ManifestConfigSchema,
  circuitBreaker: CircuitBreakerConfigSchema,
  compliance: ComplianceConfigSchema,
  fileProcessing: FileProcessingConfigSchema,
  featureFlags: FeatureFlagsSchema,
});

export type ValidatedConfig = z.infer<typeof CredLinkConfigSchema>;
