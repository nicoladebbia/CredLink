/**
 * @credlink/storage
 * 
 * Abstract storage layer for C2PA proofs and manifests
 */

export { ProofStorage } from './proof-storage';
export { S3ProofStorage } from './storage/s3-proof-storage';

// Re-export provider classes for consumers
export { 
  StorageProvider,
  StorageFactory,
  S3StorageProvider,
  R2StorageProvider,
  StorageError,
  StorageNotFoundError,
  StorageAccessDeniedError
} from './providers';

export type {
  StorageConfig,
  StorageOptions,
  StorageResult,
  StorageStats,
  HealthCheckResult
} from './providers';
