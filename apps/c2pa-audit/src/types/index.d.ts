/**
 * C2PA Types and Interfaces
 * Core type definitions for C2PA manifest validation and audit
 * Enhanced with strict validation and security constraints
 */
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
        alg: 'ES256' | 'ES384' | 'ES512' | 'RS256' | 'RS384' | 'RS512';
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
export interface TimeStampToken {
    /** RFC 3161 timestamp token */
    token: string;
    /** Timestamp generation time */
    time: string;
    /** TSA policy OID */
    policy?: string;
    /** TSA certificate chain */
    tsa_certificates?: Certificate[];
}
export interface ValidationStatus {
    /** Overall validity */
    valid: boolean;
    /** Array of validation codes from spec */
    codes: ValidationCode[];
    /** Human-readable summary */
    summary: string;
}
export type ValidationCode = 'signingCredential.trusted' | 'signingCredential.untrusted' | 'signingCredential.revoked' | 'signingCredential.expired' | 'signature.valid' | 'signature.invalid' | 'signature.algorithmNotAllowed' | 'timestamp.trusted' | 'timestamp.untrusted' | 'timestamp.invalid' | 'timestamp.missing' | 'assertion.hashedURI.match' | 'assertion.hashedURI.mismatch' | 'assertion.missing' | 'assertion.notRedacted' | 'assertion.invalidRedaction' | 'assertion.redactionAllowed' | 'ingredient.claimSignature.match' | 'ingredient.claimSignature.mismatch' | 'ingredient.manifestMissing' | 'ingredient.validationFailed' | 'manifest.structureValid' | 'manifest.structureInvalid' | 'manifest.versionSupported' | 'manifest.versionUnsupported';
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
export interface ManifestDiff {
    /** Base manifest hash */
    base_hash: string;
    /** Target manifest hash */
    target_hash: string;
    /** Diff operations */
    operations: JSONPatchOperation[];
    /** Merge patch (alternative format) */
    merge_patch?: JSONMergePatch;
    /** Security validation of changes */
    security_validation: SecurityValidation;
    /** Timestamp of diff generation */
    timestamp: string;
}
export interface SecurityValidation {
    /** Whether changes are security-compliant */
    valid: boolean;
    /** Security validation codes */
    codes: ValidationCode[];
    /** Security concerns */
    concerns: SecurityConcern[];
}
export interface SecurityConcern {
    /** Type of concern */
    type: 'assertion_removal' | 'credential_change' | 'ingredient_modification' | 'redaction_bypass';
    /** Severity level */
    severity: 'low' | 'medium' | 'high' | 'critical';
    /** Description of concern */
    description: string;
    /** Location of concern */
    location: string;
}
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
    /** Creation timestamp */
    created_at: string;
    /** Node type */
    type: 'original' | 'derived' | 'variant';
    /** Validation codes */
    validation_codes: ValidationCode[];
    /** Asset URL if available */
    asset_url?: string;
}
export interface LineageEdge {
    /** Source node ID */
    source: string;
    /** Target node ID */
    target: string;
    /** Edge type */
    type: 'parent_of' | 'input_to' | 'component_of';
    /** Relationship strength */
    strength: 'strong' | 'weak' | 'unknown';
    /** Metadata about the relationship */
    metadata?: Record<string, unknown>;
}
export interface ValidationSummary {
    /** Total number of manifests */
    total_manifests: number;
    /** Number of valid manifests */
    valid_manifests: number;
    /** Number of invalid manifests */
    invalid_manifests: number;
    /** All validation codes across lineage */
    validation_codes: ValidationCode[];
    /** Security concerns across lineage */
    security_concerns: SecurityConcern[];
}
export interface AuditReport {
    /** Report ID */
    id: string;
    /** Audit timestamp */
    timestamp: string;
    /** Manifest being audited */
    manifest: C2PAManifest;
    /** Validation results */
    validation: ValidationStatus;
    /** Lineage analysis */
    lineage?: LineageGraph;
    /** Security assessment */
    security: SecurityAssessment;
    /** Recommendations */
    recommendations: Recommendation[];
}
export interface SecurityAssessment {
    /** Overall security score (0-100) */
    score: number;
    /** Risk level */
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    /** Security findings */
    findings: SecurityFinding[];
    /** Compliance status */
    compliance: ComplianceStatus;
}
export interface SecurityFinding {
    /** Finding ID */
    id: string;
    /** Finding type */
    type: 'signature' | 'assertion' | 'ingredient' | 'redaction' | 'timestamp';
    /** Severity level */
    severity: 'info' | 'warning' | 'error' | 'critical';
    /** Description */
    description: string;
    /** Location in manifest */
    location: string;
    /** Recommendation */
    recommendation: string;
}
export interface ComplianceStatus {
    /** C2PA specification version */
    spec_version: string;
    /** Whether compliant with spec */
    spec_compliant: boolean;
    /** Industry standards compliance */
    industry_standards: Record<string, boolean>;
    /** Regulatory compliance */
    regulatory_compliance: Record<string, boolean>;
}
export interface Recommendation {
    /** Recommendation ID */
    id: string;
    /** Priority level */
    priority: 'low' | 'medium' | 'high' | 'critical';
    /** Category */
    category: 'security' | 'performance' | 'compliance' | 'usability';
    /** Description */
    description: string;
    /** Implementation steps */
    steps: string[];
}
export interface C2PAError {
    /** Error code */
    code: string;
    /** Error message */
    message: string;
    /** Error type */
    type: 'validation' | 'security' | 'parsing' | 'network' | 'system';
    /** Error details */
    details?: Record<string, unknown>;
    /** Stack trace (development only) */
    stack?: string;
}
export interface ValidationError extends C2PAError {
    type: 'validation';
    field?: string;
    value?: unknown;
}
export interface SecurityError extends C2PAError {
    type: 'security';
    threat_level: 'low' | 'medium' | 'high' | 'critical';
}
export interface JSONCanonicalizer {
    /** Canonicalize JSON object */
    canonicalize(obj: unknown): string;
    /** Hash canonicalized string */
    hash(data: string, algorithm: 'sha256' | 'sha384' | 'sha512'): string;
}
export interface RangeIndex {
    /** Start index */
    start: number;
    /** End index */
    end: number;
    /** Index type */
    type: 'byte' | 'character' | 'line';
    /** Metadata */
    metadata?: Record<string, unknown>;
}
export interface VerificationPolicy {
    /** Policy ID */
    id: string;
    /** Policy name */
    name: string;
    /** Policy rules */
    rules: PolicyRule[];
    /** Policy version */
    version: string;
    /** Whether policy is active */
    active: boolean;
}
export interface PolicyRule {
    /** Rule ID */
    id: string;
    /** Rule type */
    type: 'signature' | 'assertion' | 'ingredient' | 'timestamp';
    /** Rule condition */
    condition: string;
    /** Rule action */
    action: 'allow' | 'deny' | 'warn';
    /** Rule severity */
    severity: 'info' | 'warning' | 'error' | 'critical';
}
export interface VariantAction {
    /** Action type */
    type: 'crop' | 'transcode' | 'watermark' | 'composite' | 'metadata';
    /** Action parameters */
    parameters: Record<string, unknown>;
    /** Action timestamp */
    timestamp: string;
}
export interface VariantLinkingError extends C2PAError {
    /** Error context */
    context: 'parent_linking' | 'child_linking' | 'hash_validation' | 'relationship_validation';
    /** Manifest hashes involved */
    manifests: {
        base?: string;
        target?: string;
    };
}
//# sourceMappingURL=index.d.ts.map