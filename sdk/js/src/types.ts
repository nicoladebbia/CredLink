/**
 * Core types for the C2 Concierge SDK
 * Generated from OpenAPI specification v1.3.0
 */

// ============================================================================
// Configuration Types
// ============================================================================

export interface ClientConfig {
  /** API key for authentication */
  apiKey: string;
  /** Base URL for the API */
  baseUrl?: string;
  /** Request timeout in milliseconds */
  timeoutMs?: number;
  /** Telemetry configuration */
  telemetry?: TelemetryConfig;
  /** Retry configuration */
  retries?: RetryConfig;
  /** User agent override */
  userAgent?: string;
}

export interface TelemetryConfig {
  /** Enable OpenTelemetry telemetry */
  enabled?: boolean;
  /** OpenTelemetry configuration */
  otel?: {
    /** Service name for telemetry */
    serviceName?: string;
    /** Service version for telemetry */
    serviceVersion?: string;
  };
}

export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts?: number;
  /** Base delay in milliseconds */
  baseMs?: number;
  /** Maximum delay in milliseconds */
  maxMs?: number;
  /** Enable jitter for backoff */
  jitter?: boolean;
}

// ============================================================================
// Error Types
// ============================================================================

export abstract class C2ConciergeError extends Error {
  public abstract readonly code: string;
  public abstract readonly statusCode: number;
  public requestId?: string;
  public idempotencyKey?: string;
  public endpoint?: string;
  public hint?: string;
  public docsUrl?: string;
  public readonly timestamp: string;

  constructor(message: string, options: ErrorOptions = {}) {
    super(message);
    this.timestamp = new Date().toISOString();
    this.name = this.constructor.name;
    Object.assign(this, options);
  }

  /**
   * Returns a search-engine friendly summary line
   */
  public abstract getSummary(): string;

  /**
   * Returns actionable next steps
   */
  public abstract getNextSteps(): string[];
}

export class AuthError extends C2ConciergeError {
  public readonly code = 'AUTH_ERROR';
  public readonly statusCode = 401;

  constructor(message: string, options: AuthErrorOptions = {}) {
    super(message, options);
    this.hint = options.hint || 'Check your API key in the X-API-Key header';
    this.docsUrl = 'https://docs.c2concierge.com/api/errors#auth_error';
  }

  public getSummary(): string {
    return `C2C AuthError: 401 - ${this.message}`;
  }

  public getNextSteps(): string[] {
    return [
      'Verify your API key is correct',
      'Check the X-API-Key header format',
      'Ensure your API key is active and not expired',
      'Contact support if the issue persists',
    ];
  }
}

export class RateLimitError extends C2ConciergeError {
  public readonly code = 'RATE_LIMIT_ERROR';
  public readonly statusCode = 429;
  public readonly retryAfter?: number;
  public readonly attemptCount?: number;

  constructor(message: string, options: RateLimitErrorOptions = {}) {
    super(message, options);
    this.hint = options.hint || 'Wait before retrying or implement exponential backoff';
    this.docsUrl = 'https://docs.c2concierge.com/api/errors#rate_limit_error';
  }

  public getSummary(): string {
    const retryInfo = this.retryAfter ? ` (Retry-After=${this.retryAfter}s)` : '';
    return `C2C RateLimitError: 429${retryInfo} - ${this.message}`;
  }

  public getNextSteps(): string[] {
    const steps = [
      'Implement exponential backoff with jitter',
      'Honor the Retry-After header if provided',
      'Consider reducing request frequency',
    ];
    
    if (this.retryAfter) {
      steps.push(`Wait ${this.retryAfter} seconds before retrying`);
    }
    
    steps.push('Contact support for rate limit increases');
    return steps;
  }
}

export class ConflictError extends C2ConciergeError {
  public readonly code: string;
  public readonly statusCode: number;

  constructor(message: string, options: ConflictErrorOptions = {}) {
    super(message, options);
    this.code = 'CONFLICT_ERROR';
    this.statusCode = 409;
    this.hint = options.hint || 'Use idempotency keys for safe retries';
    this.docsUrl = 'https://docs.c2concierge.com/api/errors#conflict_error';
  }

  public getSummary(): string {
    const keyInfo = this.idempotencyKey ? ` (key=${this.idempotencyKey})` : '';
    return `C2C ConflictError: 409${keyInfo} - ${this.message}`;
  }

  public getNextSteps(): string[] {
    return [
      'Use a different idempotency key for new requests',
      'Check current resource state before retrying',
      'Verify request body matches idempotency key',
      'Consider using a different resource identifier',
    ];
  }
}

export class ValidationError extends C2ConciergeError {
  public readonly code = 'VALIDATION_ERROR';
  public readonly statusCode = 422;

  constructor(message: string, options: ValidationErrorOptions = {}) {
    super(message, options);
    this.requestId = options.requestId;
    this.endpoint = options.endpoint;
    this.hint = options.hint || 'Check required fields and data formats';
    this.docsUrl = 'https://docs.c2concierge.com/api/errors#validation_error';
  }

  public getSummary(): string {
    return `C2C ValidationError: 422 - ${this.message}`;
  }

  public getNextSteps(): string[] {
    return [
      'Check that all required fields are provided',
      'Verify data types and formats match the schema',
      'Check parameter constraints (min/max values)',
      'Review API documentation for request format',
    ];
  }
}

export class ServerError extends C2ConciergeError {
  public readonly code = 'SERVER_ERROR';
  public readonly statusCode = 500;

  constructor(message: string, options: ServerErrorOptions = {}) {
    super(message, options);
    this.requestId = options.requestId;
    this.endpoint = options.endpoint;
    this.hint = options.hint || 'Server encountered an unexpected error';
    this.docsUrl = 'https://docs.c2concierge.com/api/errors#server_error';
  }

  public getSummary(): string {
    return `C2C ServerError: 500 - ${this.message}`;
  }

  public getNextSteps(): string[] {
    return [
      'Retry the request with exponential backoff',
      'Check service status page for outages',
      'Contact support if the issue persists',
      'Consider implementing circuit breaker pattern',
    ];
  }
}

export class NetworkError extends C2ConciergeError {
  public readonly code = 'NETWORK_ERROR';
  public readonly statusCode = 0;

  constructor(message: string, options: NetworkErrorOptions = {}) {
    super(message, options);
    this.requestId = options.requestId;
    this.endpoint = options.endpoint;
    this.hint = options.hint || 'Network connectivity issue encountered';
    this.docsUrl = 'https://docs.c2concierge.com/api/errors#network_error';
  }

  public getSummary(): string {
    return `C2C NetworkError: Network - ${this.message}`;
  }

  public getNextSteps(): string[] {
    return [
      'Check network connectivity',
      'Verify firewall and proxy settings',
      'Retry with exponential backoff',
      'Check DNS resolution for API endpoint',
    ];
  }
}

// ============================================================================
// Error Options Types
// ============================================================================

export interface ErrorOptions {
  cause?: Error;
}

export interface AuthErrorOptions extends ErrorOptions {
  requestId?: string;
  endpoint?: string;
  hint?: string;
}

export interface RateLimitErrorOptions extends ErrorOptions {
  requestId?: string;
  endpoint?: string;
  retryAfter?: number;
  attemptCount?: number;
  hint?: string;
}

export interface ConflictErrorOptions extends ErrorOptions {
  requestId?: string;
  idempotencyKey?: string;
  endpoint?: string;
  hint?: string;
}

export interface ValidationErrorOptions extends ErrorOptions {
  requestId?: string;
  endpoint?: string;
  hint?: string;
}

export interface ServerErrorOptions extends ErrorOptions {
  requestId?: string;
  endpoint?: string;
  hint?: string;
}

export interface NetworkErrorOptions extends ErrorOptions {
  requestId?: string;
  endpoint?: string;
  hint?: string;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

export interface VerifyAssetRequest {
  /** URL of the asset to verify */
  asset_url?: string;
  /** Base64-encoded asset content for direct verification */
  asset_buffer?: string;
  /** Content type of the asset (required when using asset_buffer) */
  content_type?: string;
  /** Verification policy to use */
  policy_id: string;
  /** Request timeout in milliseconds */
  timeout?: number;
  /** Cached ETag for conditional requests */
  cached_etag?: string;
  /** Cached certificate thumbprints for 304 safety */
  cached_cert_thumbprints?: string[];
  /** Enable RFC 3229 delta encoding for large manifests */
  enable_delta?: boolean;
}

export interface VerifyAssetResponse {
  success: boolean;
  data: VerificationResult;
  request_id: string;
  timestamp: string;
}

export interface VerificationResult {
  verified: boolean;
  manifest_url?: string;
  trust_roots?: string[];
  policy_version?: string;
  verification_time?: string;
  cached?: boolean;
}

export interface VerifyPageRequest {
  /** URL of the page to verify */
  page_url: string;
  /** Whether to follow links to discover more assets */
  follow_links?: boolean;
  /** Maximum depth to follow links */
  max_depth?: number;
  /** Verification policy to use */
  policy_id?: string;
  /** Total timeout for page verification in milliseconds */
  timeout?: number;
}

export interface VerifyPageResponse {
  success: boolean;
  data: {
    results: AssetVerificationResult[];
    total_assets: number;
    verified_count: number;
  };
  request_id: string;
  timestamp: string;
}

export interface AssetVerificationResult {
  url: string;
  verified: boolean;
  manifest_url?: string;
  error?: string;
}

export interface BatchVerifyRequest {
  /** List of assets to verify */
  assets: AssetReference[];
  /** Verification policy to use */
  policy_id?: string;
  /** Whether to process assets in parallel */
  parallel?: boolean;
  /** Timeout per asset in milliseconds */
  timeout_per_asset?: number;
}

export interface AssetReference {
  /** URL of the asset to verify */
  url: string;
  /** Optional identifier for the asset */
  id?: string;
}

export interface BatchVerifyResponse {
  success: boolean;
  data: {
    results: BatchVerificationResult[];
    summary: BatchSummary;
  };
  request_id: string;
  timestamp: string;
}

export interface BatchVerificationResult {
  asset: AssetReference;
  result?: VerificationResult;
  error?: ErrorDetail;
}

export interface BatchSummary {
  total_assets: number;
  verified_count: number;
  failed_count: number;
}

export interface InjectLinkRequest {
  /** HTML content to modify */
  html: string;
  /** Base URL for manifest links */
  manifest_url: string;
  /** Strategy for generating manifest URLs */
  strategy?: 'sha256_path' | 'content_hash' | 'custom';
  /** CSS selector for elements to process */
  selector?: string;
}

export interface InjectLinkResponse {
  success: boolean;
  data: {
    html: string;
    links_injected: number;
    assets_processed: string[];
  };
  request_id: string;
  timestamp: string;
}

export interface SignFolderRequest {
  /** Path to folder containing assets to sign */
  folder_path: string;
  /** Signing profile to use */
  profile_id: string;
  /** Include RFC-3161 timestamps */
  tsa?: boolean;
  /** Process subdirectories recursively */
  recursive?: boolean;
  /** File patterns to include */
  file_patterns?: string[];
  /** Optional idempotency key for request deduplication */
  idempotency_key?: string;
}

export interface SignFolderResponse {
  success: boolean;
  data: {
    job_id: string;
    status_url: string;
    estimated_duration: number;
    files_found: number;
  };
  request_id: string;
  timestamp: string;
}

export interface ManifestRequest {
  /** Manifest content */
  content?: string;
  /** Content type of the manifest */
  content_type?: string;
  /** Optional manifest metadata */
  metadata?: Record<string, any>;
}

export interface ManifestResponse {
  success: boolean;
  data: {
    hash: string;
    size: number;
    content_type: string;
    created_at: string;
    url: string;
  };
  request_id: string;
  timestamp: string;
}

export interface ErrorDetail {
  code: string;
  message: string;
  details?: Record<string, any>;
  hint?: string;
  docs_url?: string;
}

// ============================================================================
// Common Types
// ============================================================================

export interface PaginationOptions {
  /** Maximum number of results per page */
  limit?: number;
  /** Page token for pagination */
  token?: string;
}

export interface JobStatus {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress?: number;
  result?: any;
  error?: ErrorDetail;
  created_at: string;
  updated_at: string;
  estimated_completion?: string;
}

// ============================================================================
// Utility Types
// ============================================================================

export type IdempotencyKey = string;

export interface RequestOptions {
  /** Request timeout override */
  timeout?: number;
  /** Idempotency key for safe retries */
  idempotencyKey?: IdempotencyKey;
  /** Custom headers */
  headers?: Record<string, string>;
  /** Retry configuration override */
  retries?: RetryConfig;
}

// ============================================================================
// Async Iterator Types for Streaming Responses
// ============================================================================

export interface AsyncPageVerificationResult {
  url: string;
  verified: boolean;
  manifest_url?: string;
  error?: string;
  hasMore: boolean;
  nextToken?: string;
}

export interface AsyncBatchVerificationResult {
  asset: AssetReference;
  result?: VerificationResult;
  error?: ErrorDetail;
  hasMore: boolean;
  nextToken?: string;
}
