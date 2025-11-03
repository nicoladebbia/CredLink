/**
 * C2PA Manifest Diff and Audit Types
 * Spec-compliant type definitions for forensic-grade provenance analysis
 */

// ============================================================================
// Core Manifest Types (C2PA 2.2 Specification)
// ============================================================================

export interface C2PAManifest {
  /** Manifest hash (SHA-256 of the canonicalized manifest) */
  manifest_hash: string;
  /** Claim generator information */
  claim_generator: string;
  /** Claim generator version */
  claim_generator_version: string;
  /** Timestamp when claim was created */
  timestamp: string;
  /** Claim signature data */
  claim_signature: ClaimSignature;
  /** Array of assertions in the manifest */
  assertions: Assertion[];
  /** Ingredient manifests (if any) */
  ingredients?: Ingredient[];
  /** Redaction information */
  redactions?: Redaction[];
}

export interface ClaimSignature {
  /** JWS header */
  protected: {
    alg: string;
    kid?: string;
    iat?: number;
    x5c?: string[];
  };
  /** Signature value */
  signature: string;
  /** Signing certificate chain */
  certificate_chain: Certificate[];
  /** Validation status */
  validation_status: ValidationStatus;
}

export interface Assertion {
  /** Assertion label (e.g., 'c2pa.actions', 'c2pa.rights') */
  label: string;
  /** Hash URI for the assertion data */
  hashed_uri: string;
  /** Assertion data (if available) */
  data?: Record<string, unknown>;
  /** Whether this assertion was redacted */
  redacted: boolean;
  /** Validation status */
  validation_status: ValidationStatus;
}

export interface Ingredient {
  /** Relationship to parent - Phase 30 Variant Linking */
  relationship: 'parentOf' | 'inputTo' | 'componentOf';
  /** Active manifest hash */
  active_manifest: string;
  /** Claim signature hash */
  claim_signature: string;
  /** Ingredient manifest data */
  manifest?: C2PAManifest;
  /** Validation status */
  validation_status: ValidationStatus;
  /** Phase 30: Hashed URI for parent/child linking */
  hashed_uri?: string;
  /** Phase 30: Asset URL for remote discovery */
  asset_url?: string;
}

export interface Redaction {
  /** JUMBF URI that was redacted */
  jumbf_uri: string;
  /** Whether redaction is allowed per spec */
  allowed: boolean;
  /** Reason for redaction */
  reason?: string;
}

export interface Certificate {
  /** Subject distinguished name */
  subject: string;
  /** Issuer distinguished name */
  issuer: string;
  /** Serial number */
  serial_number: string;
  /** Not before date */
  not_before: string;
  /** Not after date */
  not_after: string;
  /** Extended key usage */
  eku: string[];
  /** SHA-256 thumbprint */
  thumbprint: string;
  /** Trust status */
  trusted: boolean;
  /** Revocation status */
  revoked: boolean;
}

// ============================================================================
// Time Evidence Types (RFC 3161)
// ============================================================================

export interface TimeStampToken {
  /** TSA identity information */
  tsa: {
    name: string;
    uri?: string;
  };
  /** Generation time */
  genTime: string;
  /** Accuracy information */
  accuracy?: {
    seconds?: number;
    millis?: number;
    micros?: number;
  };
  /** Policy OID */
  policy_oid: string;
  /** Serial number */
  serial_number: string;
  /** TSA certificate chain */
  certificate_chain: Certificate[];
  /** Validation status */
  validation_status: ValidationStatus;
}

// ============================================================================
// Validation Types (Spec-Compliant Codes)
// ============================================================================

export interface ValidationStatus {
  /** Overall validation result */
  valid: boolean;
  /** Array of validation codes from spec */
  codes: ValidationCode[];
  /** Human-readable summary */
  summary: string;
}

export type ValidationCode = 
  // Signature validation codes
  | 'signingCredential.trusted'
  | 'signingCredential.untrusted'
  | 'signingCredential.revoked'
  | 'signingCredential.expired'
  | 'signature.valid'
  | 'signature.invalid'
  | 'signature.algorithmNotAllowed'
  
  // Timestamp validation codes
  | 'timestamp.trusted'
  | 'timestamp.untrusted'
  | 'timestamp.invalid'
  | 'timestamp.missing'
  
  // Assertion validation codes
  | 'assertion.hashedURI.match'
  | 'assertion.hashedURI.mismatch'
  | 'assertion.missing'
  | 'assertion.notRedacted'
  | 'assertion.invalidRedaction'
  | 'assertion.redactionAllowed'
  
  // Ingredient validation codes
  | 'ingredient.claimSignature.match'
  | 'ingredient.claimSignature.mismatch'
  | 'ingredient.manifestMissing'
  | 'ingredient.validationFailed'
  
  // Manifest validation codes
  | 'manifest.structureValid'
  | 'manifest.structureInvalid'
  | 'manifest.versionSupported'
  | 'manifest.versionUnsupported'

// ============================================================================
// Diff Types (RFC 6902 / RFC 7386)
// ============================================================================

export interface JSONPatchOperation {
  /** Operation type */
  op: 'add' | 'remove' | 'replace' | 'move' | 'copy' | 'test';
  /** JSON Pointer path */
  path: string;
  /** Value for add/replace/test operations */
  value?: unknown;
  /** From path for move/copy operations */
  from?: string;
}

export interface JSONMergePatch {
  /** Merge patch object */
  [key: string]: unknown;
}

export interface SemanticDiff {
  /** Base manifest information */
  base: ManifestInfo;
  /** Target manifest information */
  target: ManifestInfo;
  /** Signer differences */
  signer_diff: SignerDiff;
  /** TSA differences */
  tsa_diff: TSADiff;
  /** Assertion changes */
  assertions_added: AssertionChange[];
  assertions_removed: AssertionChange[];
  assertions_modified: AssertionChange[];
  /** Ingredient changes */
  ingredient_changes: IngredientChange[];
  /** Validation codes for both manifests */
  validation_codes: {
    base: ValidationCode[];
    target: ValidationCode[];
  };
}

export interface ManifestInfo {
  /** Manifest hash */
  manifest_hash: string;
  /** Signer key ID or thumbprint */
  signer_key_id: string;
  /** Claim generator */
  claim_generator: string;
  /** Timestamp */
  timestamp: string;
}

export interface SignerDiff {
  /** Trust status change */
  chain_trust: string;
  /** Algorithm change */
  algorithm: string;
  /** Subject change */
  subject?: string;
  /** Certificate chain change */
  certificate_chain?: string;
}

export interface TSADiff {
  /** Provider change */
  provider: string;
  /** Generation time difference in milliseconds */
  genTime_diff_ms: number;
  /** Policy OID change */
  policy_oid?: string;
  /** Accuracy change */
  accuracy?: string;
}

export interface AssertionChange {
  /** Assertion label */
  label: string;
  /** JSON Pointer path to assertion */
  path: string;
  /** Whether change was due to redaction */
  redacted?: boolean;
  /** Whether change is allowed per spec */
  allowed?: boolean;
  /** Hash URI if available */
  hashed_uri?: string;
}

export interface IngredientChange {
  /** Parent manifest hash */
  parent: string;
  /** Change status */
  status: ValidationCode;
  /** Relationship type */
  relationship?: string;
}

// ============================================================================
// Lineage Types
// ============================================================================

export interface LineageGraph {
  /** Nodes in the lineage graph */
  nodes: LineageNode[];
  /** Edges in the lineage graph */
  edges: LineageEdge[];
  /** Redaction URIs across the entire ancestry */
  redactions: string[];
  /** Validation summary */
  validation_summary: ValidationSummary;
}

export interface LineageNode {
  /** Node ID (manifest hash) */
  id: string;
  /** Node label (signer thumbprint + time) */
  label: string;
  /** Signer thumbprint */
  signer_thumbprint: string;
  /** Timestamp */
  timestamp: string;
  /** Node status */
  status: 'validated' | 'validated_with_warnings' | 'failed';
  /** Validation codes */
  validation_codes: ValidationCode[];
  /** Manifest data */
  manifest: C2PAManifest;
}

export interface LineageEdge {
  /** Source node ID */
  source: string;
  /** Target node ID */
  target: string;
  /** Relationship type */
  relationship: 'parentOf' | 'inputTo' | 'componentOf';
  /** Edge status */
  status: ValidationStatus;
}

export interface ValidationSummary {
  /** Total number of nodes */
  total_nodes: number;
  /** Number of validated nodes */
  validated_nodes: number;
  /** Number of nodes with warnings */
  warning_nodes: number;
  /** Number of failed nodes */
  failed_nodes: number;
  /** Overall status */
  overall_status: 'validated' | 'validated_with_warnings' | 'failed';
}

// ============================================================================
// API Types
// ============================================================================

export interface DiffRequest {
  /** Base manifest */
  base: ManifestReference;
  /** Target manifest */
  target: ManifestReference;
  /** Output formats requested */
  format: Array<'semantic' | 'json-patch' | 'merge-patch' | 'lineage'>;
}

export interface ManifestReference {
  /** Manifest URL */
  manifest_url?: string;
  /** Asset URL (for embedded manifests) */
  asset_url?: string;
  /** Sidecar URL */
  sidecar_url?: string;
  /** Uploaded file (multipart) */
  file?: File;
}

export interface DiffResponse {
  /** Semantic diff */
  semantic?: SemanticDiff;
  /** JSON Patch operations */
  json_patch?: JSONPatchOperation[];
  /** JSON Merge Patch */
  merge_patch?: JSONMergePatch;
  /** Lineage graph */
  lineage?: LineageGraph;
  /** Validation results */
  validation: {
    base: ValidationCode[];
    target: ValidationCode[];
  };
  /** Error information (optional) */
  error?: string;
}

export interface EvidencePack {
  /** Base manifest raw JSON */
  base_raw: string;
  /** Target manifest raw JSON */
  target_raw: string;
  /** Semantic diff */
  semantic_diff: SemanticDiff;
  /** Lineage graph */
  lineage_graph: LineageGraph;
  /** Verification transcript */
  verification_transcript: VerificationTranscript;
  /** Export timestamp */
  exported_at: string;
}

export interface VerificationTranscript {
  /** Base manifest verification steps */
  base_verification: VerificationStep[];
  /** Target manifest verification steps */
  target_verification: VerificationStep[];
  /** Timestamps for each step */
  timestamps: Record<string, string>;
}

export interface VerificationStep {
  /** Step name */
  step: string;
  /** Validation code */
  code: ValidationCode;
  /** Step result */
  result: boolean;
  /** Details */
  details?: Record<string, unknown>;
  /** Spec reference */
  spec_reference: string;
}

// ============================================================================
// CLI Types
// ============================================================================

export interface CLIOptions {
  /** Base asset/manifest */
  base: string;
  /** Target asset/manifest */
  target: string;
  /** Output file */
  out?: string;
  /** Output format */
  format?: 'semantic' | 'json-patch' | 'merge-patch' | 'lineage' | 'evidence-pack';
  /** Verbose output */
  verbose?: boolean;
  /** Raw manifest output */
  raw?: boolean;
}

export interface LineageOptions {
  /** Asset to analyze */
  asset: string;
  /** Output file */
  out?: string;
  /** Maximum depth */
  maxDepth?: number;
  /** Include redactions */
  includeRedactions?: boolean;
}

export interface OpenRawOptions {
  /** Asset to analyze */
  asset: string;
  /** Output directory */
  out?: string;
  /** Include JUMBF map */
  includeJumbf?: boolean;
}

// ============================================================================
// UI Types
// ============================================================================

export interface DiffTable {
  /** Table headers */
  headers: ['Field', 'Before', 'After', 'Why This Matters'];
  /** Table rows */
  rows: DiffTableRow[];
}

export interface DiffTableRow {
  /** Field name */
  field: string;
  /** Before value */
  before: string;
  /** After value */
  after: string;
  /** Spec reference for why this matters */
  spec_reference: string;
  /** Change type */
  change_type: 'added' | 'removed' | 'modified' | 'unchanged';
}

export interface UITab {
  /** Tab ID */
  id: string;
  /** Tab label */
  label: string;
  /** Tab content */
  content: unknown;
}

// ============================================================================
// Phase 30 Variant Linking Types
// ============================================================================

export interface VariantLinkingMode {
  /** Linking mode: rendition or derivative */
  mode: 'rendition' | 'derivative';
  /** Whether to embed manifest or use remote discovery */
  embed: boolean;
  /** Remote manifest URL */
  manifest_url: string;
}

export interface DerivativeManifestRequest {
  /** Parent manifest URL */
  parent_manifest: string;
  /** Asset URL for this derivative */
  asset_url: string;
  /** Relationship type */
  relationship: 'parentOf';
  /** Actions performed */
  actions: VariantAction[];
}

export interface VariantAction {
  /** Action type */
  type: 'c2pa.transcoded' | 'c2pa.cropped' | 'c2pa.edited' | 'c2pa.placed' | 'c2pa.repackaged';
  /** Action parameters */
  parameters: Record<string, unknown>;
}

export interface DerivativeManifestResponse {
  /** Child manifest URL */
  child_manifest: string;
  /** Ingredient reference */
  ingredient_ref: string;
  /** Link header for HTTP */
  link_header: string;
}

export interface RenditionRegistry {
  /** Asset ID */
  asset_id: string;
  /** Manifest URL */
  manifest_url: string;
  /** Variant routes */
  variant_routes: VariantRoute[];
  /** Mode */
  mode: 'rendition';
}

export interface VariantRoute {
  /** Route pattern */
  pattern: string;
  /** Link header */
  link_header: string;
}

export interface VariantPolicy {
  /** Asset ID + transform key */
  key: string;
  /** Linking mode */
  mode: VariantLinkingMode;
  /** Actions for derivatives */
  actions?: VariantAction[];
}

// ============================================================================
// Error Types
// ============================================================================

export class C2PAError extends Error {
  constructor(
    message: string,
    public code: string,
    public spec_reference?: string
  ) {
    super(message);
    this.name = 'C2PAError';
  }
}

export class ValidationError extends C2PAError {
  constructor(
    message: string,
    public validation_codes: ValidationCode[],
    spec_reference?: string
  ) {
    super(message, 'VALIDATION_ERROR', spec_reference);
    this.name = 'ValidationError';
  }
}

export class ParsingError extends C2PAError {
  constructor(
    message: string,
    public asset_type: string,
    spec_reference?: string
  ) {
    super(message, 'PARSING_ERROR', spec_reference);
    this.name = 'ParsingError';
  }
}

export class VariantLinkingError extends C2PAError {
  constructor(
    message: string,
    public variant_type: string,
    spec_reference?: string
  ) {
    super(message, 'VARIANT_LINKING_ERROR', spec_reference);
    this.name = 'VariantLinkingError';
  }
}
