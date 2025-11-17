/**
 * Verification API Types
 * Defines the core data structures for C2PA verification
 */

export interface VerificationRequest {
  /** URL of the asset to verify (image/video) */
  asset_url?: string;
  /** Direct URL of the manifest to verify */
  manifest_url?: string;
  /** Optional trust anchors to validate against */
  trust_roots?: string[];
  /** Optional timeout for fetch operations */
  timeout?: number;
}

export interface VerificationResult {
  /** Overall validity of the provenance */
  valid: boolean;
  /** Signer identity information */
  signer: {
    /** Display name of the signer */
    name: string;
    /** Unique identifier of the signing key */
    key_id: string;
    /** Organization information */
    organization?: string;
    /** Whether the signer is trusted */
    trusted: boolean;
  };
  /** Core assertions found in the manifest */
  assertions: {
    /** AI-generated content flag */
    ai_generated: boolean;
    /** Editing history summary */
    edits: string[];
    /** Creation timestamp */
    created_at?: string;
    /** Content type */
    content_type?: string;
  };
  /** Warnings and issues found */
  warnings: string[];
  /** Decision path explaining how verification proceeded */
  decision_path: {
    /** How the manifest was discovered */
    discovery: 'link_header' | 'direct_url' | 'embedded' | 'not_found';
    /** Where the manifest was fetched from */
    source: string;
    /** Validation steps performed */
    steps: string[];
  };
  /** Performance metrics */
  metrics: {
    /** Total verification time in milliseconds */
    total_time_ms: number;
    /** Time spent fetching manifests */
    fetch_time_ms: number;
    /** Time spent validating signatures */
    validation_time_ms: number;
    /** Whether results were from cache */
    cached: boolean;
    /** ETag from manifest response (Phase 42) */
    etag?: string;
    /** Cache control headers (Phase 42) */
    cache_control?: string;
    /** How content was served (Phase 42) */
    served_via?: '304' | '200' | '226';
  };
}

export interface TrustRoot {
  /** Unique identifier for the trust root */
  id: string;
  /** Display name */
  name: string;
  /** PEM-encoded public key */
  public_key: string;
  /** Whether this root is currently trusted */
  trusted: boolean;
  /** Expiration date of the trust root */
  expires_at: string;
  /** Optional certificate chain */
  certificate_chain?: string[];
}

export class VerificationError extends Error {
  code: 'MANIFEST_UNREACHABLE' | 'MISMATCHED_HASH' | 'UNKNOWN_TRUST_ROOT' | 'INVALID_FORMAT' | 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_SIGNATURE' | 'INVALID_VALIDATOR' | 'INVALID_DELTA' | 'UNSUPPORTED_DELTA' | 'DELTA_APPLICATION_FAILED' | 'CRYPTO_NOT_READY';
  details?: Record<string, unknown>;

  constructor(
    code: 'MANIFEST_UNREACHABLE' | 'MISMATCHED_HASH' | 'UNKNOWN_TRUST_ROOT' | 'INVALID_FORMAT' | 'NETWORK_ERROR' | 'TIMEOUT' | 'INVALID_SIGNATURE' | 'INVALID_VALIDATOR' | 'INVALID_DELTA' | 'UNSUPPORTED_DELTA' | 'DELTA_APPLICATION_FAILED' | 'CRYPTO_NOT_READY',
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'VerificationError';
  }
}

export interface ApiResponse<T = unknown> {
  /** Success flag */
  success: boolean;
  /** Response data or error information */
  data?: T;
  /** Error information if unsuccessful */
  error?: VerificationError;
  /** Request ID for tracing */
  request_id: string;
  /** Timestamp of the response */
  timestamp: string;
}

// === SIGNING TYPES ===

export interface SigningRequest {
  /** Creator identifier (email, name, or org) */
  creator: string;
  /** Optional assertions about the content */
  assertions?: {
    /** AI-generated content flag */
    ai_generated?: boolean;
    /** Content description */
    description?: string;
    /** Content title */
    title?: string;
    /** Custom metadata */
    metadata?: Record<string, unknown>;
  };
  /** Optional signing profile */
  profile?: string;
  /** Whether to include timestamp authority */
  tsa?: boolean;
}

export interface SigningResult {
  manifest_url: string;
  image_hash: string;
  created_at: string;
  signer: {
    name: string;
    key_id: string;
    organization: string;
  };
  manifest_hash: string;
  storage: {
    bucket: string;
    key: string;
    region?: string;
  };
  // Enhanced cryptographic fields
  signature?: string;
  crypto_algorithm?: string;
  has_tsa_timestamp?: boolean;
}

export class SigningError extends Error {
  code: 'INVALID_IMAGE' | 'IMAGE_TOO_LARGE' | 'UNSUPPORTED_FORMAT' | 'STORAGE_ERROR' | 'SIGNING_FAILED' | 'INVALID_REQUEST' | 'CREATOR_REQUIRED';
  details?: Record<string, unknown>;

  constructor(
    code: 'INVALID_IMAGE' | 'IMAGE_TOO_LARGE' | 'UNSUPPORTED_FORMAT' | 'STORAGE_ERROR' | 'SIGNING_FAILED' | 'INVALID_REQUEST' | 'CREATOR_REQUIRED',
    message: string,
    details?: Record<string, unknown>
  ) {
    super(message);
    this.code = code;
    this.details = details;
    this.name = 'SigningError';
  }
}
