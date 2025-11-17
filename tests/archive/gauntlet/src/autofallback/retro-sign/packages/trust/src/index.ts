/**
 * Phase 11 — Trust Graph & Badge Reputation v1
 * Main exports for the trust package
 */

// Type definitions
export * from './types';

// Core scoring functionality
export * from './scoring';

// Cache implementations
export * from './cache';

// Trust service
export { TrustService } from './trust-service';

// Revocation ingestion
export { 
  RevocationIngestService,
  createRevocationIngestService,
  EXAMPLE_REVOCATION_SOURCES
} from './revocation-ingest';

// Re-export commonly used interfaces and classes
export {
  TrustNode,
  TrustEdge,
  Revocation,
  TrustScore,
  TrustSnippet,
  VerificationContext,
  TrustServiceConfig,
  ScoringResult,
  TrustGrade,
  RevocationStatus
} from './types';

export {
  scoreTrustPath,
  generateTrustSummary,
  buildTrustPath,
  DEFAULT_WEIGHTS,
  DEFAULT_GRADE_BOUNDARIES,
  validateScoringConfig
} from './scoring';

export {
  TrustService
} from './trust-service';

export {
  RevocationIngestService,
  createRevocationIngestService,
  EXAMPLE_REVOCATION_SOURCES
} from './revocation-ingest';

// Error classes
export {
  TrustError,
  RevocationError,
  ScoringError,
  GraphError
} from './types';
