/**
 * CredLink SDK - JavaScript/TypeScript v1.3.0
 * 
 * A comprehensive SDK for cryptographic provenance verification and signing.
 * Features include:
 * - HTTP API wrapper with automatic retries and backoff
 * - Circuit breaker for resilience
 * - Comprehensive error handling with actionable hints
 * - Optional OpenTelemetry telemetry
 * - TypeScript support with full type definitions
 * - Idempotency support for safe retries
 * - Streaming responses for batch operations
 * 
 * @example
 * ```typescript
 * import { Client } from '@credlink/sdk';
 * 
 * const client = new Client({ 
 *   apiKey: process.env.C2_API_KEY 
 * });
 * 
 * // Verify an asset
 * const result = await client.verify('https://example.com/image.jpg', {
 *   policyId: 'default'
 * });
 * 
 * // Verify page assets during build
 * for await (const asset of client.verifyPage('https://site.example/article')) {
 *   if (!asset.verified) {
 *     throw new Error(`Verification failed: ${asset.error}`);
 *   }
 * }
 * ```
 */

// Main client and API classes
export { Client, VerifyAPI, BatchAPI, LinkAPI, SignAPI, ManifestAPI } from './client.js';

// Transport layer and utilities
export { HttpTransport, TelemetryManager } from './transport.js';

// All types and interfaces
export type {
  // Configuration
  ClientConfig,
  TelemetryConfig,
  RetryConfig,
  RequestOptions,
  
  // Error options
  ErrorOptions,
  AuthErrorOptions,
  RateLimitErrorOptions,
  ConflictErrorOptions,
  ValidationErrorOptions,
  ServerErrorOptions,
  NetworkErrorOptions,
  
  // API request/response types
  VerifyAssetRequest,
  VerifyAssetResponse,
  VerificationResult,
  VerifyPageRequest,
  VerifyPageResponse,
  AssetVerificationResult,
  BatchVerifyRequest,
  BatchVerifyResponse,
  AssetReference,
  BatchVerificationResult,
  BatchSummary,
  InjectLinkRequest,
  InjectLinkResponse,
  SignFolderRequest,
  SignFolderResponse,
  ManifestRequest,
  ManifestResponse,
  ErrorDetail,
  
  // Utility types
  IdempotencyKey,
  PaginationOptions,
  JobStatus,
  AsyncPageVerificationResult,
  AsyncBatchVerificationResult,
} from './types.js';

// Export error classes for direct use
import {
  C2ConciergeError,
  AuthError,
  RateLimitError,
  ConflictError,
  ValidationError,
  ServerError,
  NetworkError,
} from './types.js';
import { Client } from './client.js';
import type { ClientConfig } from './types.js';

// Re-export error classes
export {
  C2ConciergeError,
  AuthError,
  RateLimitError,
  ConflictError,
  ValidationError,
  ServerError,
  NetworkError,
} from './types.js';

// Version information
export const VERSION = '1.3.0';
export const USER_AGENT = `credlink-sdk/js/${VERSION}`;

// Quick factory function for common use cases
export function createClient(config: ClientConfig): Client {
  return new Client(config);
}

// Default configuration constants
export const DEFAULT_CONFIG = {
  baseUrl: 'https://api.credlink.com/v1',
  timeoutMs: 30000,
  retries: {
    maxAttempts: 5,
    baseMs: 250,
    maxMs: 5000,
    jitter: true,
  },
  userAgent: USER_AGENT,
} as const;
