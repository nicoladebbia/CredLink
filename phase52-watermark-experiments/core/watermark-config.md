# Phase 52 — Watermark/Cert Hybrid Experiments (v1.1)

## Core Configuration & Interfaces

### Watermark Configuration Schema
```typescript
export interface WatermarkConfig {
  // Payload Configuration (≤128 bits, non-identifying)
  payload: {
    version: number;           // Current version: 1
    hashAlgorithm: 'sha256';   // Fixed for consistency
    truncationBits: 64;        // Truncated SHA256 to 64 bits
    saltBits: 32;              // Additional salt for uniqueness
    versionBits: 4;            // Version field
    reservedBits: 28;          // Future use, set to 0
  };
  
  // Watermark Profiles (experimental, opt-in only)
  profiles: {
    off: null;                 // Default - no watermarking
    dct_ecc_v1: DCTECCProfile; // Classical DCT with ECC
    latent_x: LatentProfile;   // Research-only diffusion watermark
  };
  
  // Detector Configuration
  detection: {
    confidenceThreshold: 0.5;  // Minimum confidence to report
    maxFalsePositiveRate: 0.01; // 1% FP rate target
    timeoutMs: 5000;          // Detection timeout
  };
  
  // UI & Display Configuration
  ui: {
    showHintBadge: boolean;    // Show WM hint chip in UI
    requireC2PA: boolean;      // Only show hints with C2PA present
    allowDisable: boolean;     // Allow users to hide hints
  };
}

export interface DCTECCProfile {
  type: 'dct_ecc';
  strength: number;           // 0.0 to 1.0, default 0.3
  blockSize: number;          // DCT block size, default 8
  quantizationTable: number[]; // Custom quantization for robustness
  eccScheme: 'reed_solomon';  // Error correction
  eccRedundancy: number;      // ECC bytes per payload byte
  frequencyBands: number[];   // DCT frequency bands to use
  spatialSpread: boolean;     // Spread across image
}

export interface LatentProfile {
  type: 'latent_diffusion';
  strength: number;           // 0.0 to 1.0, default 0.1
  layers: number[];           // Which diffusion layers to mark
  noiseScale: number;         // Noise perturbation scale
  keyBits: number;            // Key size for latent marking
  modelCompatibility: string[]; // Compatible generative models
}

export interface WatermarkPayload {
  version: number;            // 4 bits
  truncatedHash: Uint8Array;  // 64 bits (8 bytes)
  salt: Uint8Array;           // 32 bits (4 bytes)
  reserved: Uint8Array;       // 28 bits (4 bytes, padded)
}

export interface WatermarkHint {
  present: boolean;           // Watermark detected
  confidence: number;         // 0.0 to 1.0
  payloadBindOk: boolean;     // Payload matches manifest hash
  profile: string;            // Which profile was used
  note: string;               // Always "Hint only"
  detectedAt: Date;           // Detection timestamp
  transformHistory?: string[]; // Known transforms applied
}

export interface WatermarkDetectionResult {
  match: boolean;             // Watermark present
  confidence: number;         // Detection confidence
  payloadVersion: number;     // Payload version detected
  payload?: WatermarkPayload; // Extracted payload if match
  error?: string;             // Detection error if any
  processingTimeMs: number;   // Time taken to detect
}
```

### Tenant Feature Configuration
```typescript
export interface TenantWatermarkConfig {
  enabled: boolean;           // Tenant has opted in
  profile: 'off' | 'dct_ecc_v1' | 'latent_x';
  sensitivity: number;        // 0.0 to 1.0, affects detection threshold
  suppressAssetClasses: string[]; // Asset classes to ignore
  lastUpdated: Date;          // Configuration timestamp
  updatedBy: string;          // Who updated the config
  // SECURITY: Added validation constraints to prevent configuration abuse
  maxRequestsPerMinute?: number; // Rate limiting per tenant
  allowedAssetTypes?: string[];  // Restrict to specific asset types
  auditRetentionDays?: number;   // Custom audit retention (max 365)
  ui?: {
    showHintBadge: boolean;    // Show WM hint chip in UI
    requireC2PA: boolean;      // Only show hints with C2PA present
    allowDisable: boolean;     // Allow users to hide hints
    maxConfidenceThreshold?: number; // Maximum allowed confidence
  };
}

export interface WatermarkSignRequest {
  manifestHash: string;       // Full SHA256 of manifest
  profile: 'off' | 'dct_ecc_v1' | 'latent_x';
  strength?: number;          // Override default strength
  salt?: string;              // Optional custom salt (hex)
  assetType: 'image' | 'video' | 'text' | 'audio';
}

export interface WatermarkVerifyRequest {
  assetData: ArrayBuffer;     // Asset to analyze
  manifestHash: string;       // Expected manifest hash
  tenantConfig: TenantWatermarkConfig;
  assetMetadata: Record<string, any>;
}

export interface WatermarkVerifyResponse {
  watermarkHint?: WatermarkHint;
  c2paStatus: 'verified' | 'failed' | 'unknown';
  processingTimeMs: number;
  warnings?: string[];
}
```

### Security & Compliance Constraints
```typescript
export interface WatermarkSecurityConstraints {
  // Payload limits (hard limits)
  maxPayloadSizeBits: 128;
  maxHashTruncationBits: 64;
  maxSaltBits: 32;
  
  // Prohibited content
  noPII: boolean;             // Never embed PII
  noIdentifyingInfo: boolean; // Never embed user/asset IDs
  noLocationData: boolean;    // Never embed location info
  
  // Rate limiting
  maxDetectRequestsPerMinute: number;
  maxSignRequestsPerMinute: number;
  
  // Audit requirements
  logAllOperations: boolean;
  retainAuditLogsDays: number;
}

export interface WatermarkAuditEntry {
  operation: 'sign' | 'detect' | 'config_update';
  tenantId: string;
  assetId?: string;
  profile: string;
  success: boolean;
  error?: string;
  processingTimeMs: number;
  timestamp: Date;
  userId: string;
  // Removed: ipAddress - privacy violation, not needed for audit
}
```

### Error Handling & Validation
```typescript
export class WatermarkError extends Error {
  constructor(
    message: string,
    public code: WatermarkErrorCode,
    public details?: any
  ) {
    super(message);
    this.name = 'WatermarkError';
  }
}

export enum WatermarkErrorCode {
  // Configuration errors
  INVALID_PROFILE = 'INVALID_PROFILE',
  PROFILE_NOT_ENABLED = 'PROFILE_NOT_ENABLED',
  INVALID_STRENGTH = 'INVALID_STRENGTH',
  
  // Payload errors
  PAYLOAD_TOO_LARGE = 'PAYLOAD_TOO_LARGE',
  INVALID_MANIFEST_HASH = 'INVALID_MANIFEST_HASH',
  PAYLOAD_MISMATCH = 'PAYLOAD_MISMATCH',
  
  // Detection errors
  DETECTION_TIMEOUT = 'DETECTION_TIMEOUT',
  UNSUPPORTED_ASSET_TYPE = 'UNSUPPORTED_ASSET_TYPE',
  CORRUPTED_ASSET = 'CORRUPTED_ASSET',
  
  // Security errors
  UNAUTHORIZED_TENANT = 'UNAUTHORIZED_TENANT',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  SECURITY_VIOLATION = 'SECURITY_VIOLATION',
  
  // System errors
  PROCESSING_ERROR = 'PROCESSING_ERROR',
  RESOURCE_EXHAUSTED = 'RESOURCE_EXHAUSTED',
  INTERNAL_ERROR = 'INTERNAL_ERROR'
}

export interface ValidationResult {
  valid: boolean;
  errors: Array<{
    field: string;
    code: string;
    message: string;
  }>;
  warnings: Array<{
    field: string;
    code: string;
    message: string;
  }>;
}
```

### Constants & Defaults
```typescript
export const WATERMARK_CONSTANTS = {
  // Payload size limits (bits)
  MAX_PAYLOAD_BITS: 128,
  HASH_TRUNCATION_BITS: 64,
  SALT_BITS: 32,
  VERSION_BITS: 4,
  RESERVED_BITS: 28,
  
  // Default strengths
  DEFAULT_DCT_STRENGTH: 0.3,
  DEFAULT_LATENT_STRENGTH: 0.1,
  MIN_STRENGTH: 0.1,
  MAX_STRENGTH: 0.9,
  
  // Detection thresholds
  DEFAULT_CONFIDENCE_THRESHOLD: 0.5,
  MAX_FALSE_POSITIVE_RATE: 0.01,
  
  // Processing limits
  MAX_DETECTION_TIME_MS: 5000,
  MAX_SIGN_TIME_MS: 10000,
  
  // Rate limits
  DEFAULT_DETECT_RATE_LIMIT: 100, // per minute
  DEFAULT_SIGN_RATE_LIMIT: 50,    // per minute
  
  // Security
  AUDIT_RETENTION_DAYS: 90,
  MAX_ASSET_SIZE_MB: 100,
  SUPPORTED_FORMATS: ['jpeg', 'png', 'webp', 'gif', 'bmp', 'tiff']
} as const;

export const DEFAULT_WATERMARK_CONFIG: WatermarkConfig = {
  payload: {
    version: 1,
    hashAlgorithm: 'sha256',
    truncationBits: 64,
    saltBits: 32,
    versionBits: 4,
    reservedBits: 28
  },
  profiles: {
    off: null,
    dct_ecc_v1: {
      type: 'dct_ecc',
      strength: 0.3,
      blockSize: 8,
      quantizationTable: [16, 11, 10, 16, 24, 40, 51, 61],
      eccScheme: 'reed_solomon',
      eccRedundancy: 2,
      frequencyBands: [1, 2, 3, 4, 5, 6],
      spatialSpread: true
    },
    latent_x: {
      type: 'latent_diffusion',
      strength: 0.1,
      layers: [8, 9, 10, 11],
      noiseScale: 0.05,
      keyBits: 128,
      modelCompatibility: ['stable-diffusion-v1.5', 'stable-diffusion-xl']
    }
  },
  detection: {
    confidenceThreshold: 0.5,
    maxFalsePositiveRate: 0.01,
    timeoutMs: 5000
  },
  ui: {
    showHintBadge: true,
    requireC2PA: true,
    allowDisable: true
  }
} as const;
```
