/**
 * RFC 3161/5816 TimeStampToken types and interfaces
 * Strict compliance with IETF specifications
 * Security-hardened with comprehensive validation and type safety
 */
export interface TimeStampRequest {
    /** OID string for hash algorithm (SHA-2 family only) */
    hashAlgorithm: string;
    /** Message imprint hash (32-512 bytes for security) */
    messageImprint: Uint8Array;
    /** Optional requested policy OID string */
    reqPolicy?: string;
    /** Optional cryptographic nonce (8-32 bytes, <= 256 bits) */
    nonce?: bigint;
    /** Request TSA certificate (default: true) */
    certReq?: boolean;
    /** Extension data (must be validated) */
    extensions?: Record<string, unknown>;
}
export interface TimeStampResponse {
    /** PKI status information */
    status: PKIStatusInfo;
    /** Optional timestamp token if request was granted */
    timeStampToken?: TimeStampToken;
}
export interface PKIStatusInfo {
    /** PKI status code */
    status: PKIStatus;
    /** Optional status description strings */
    statusString?: string[];
    /** Optional failure information */
    failInfo?: ASN1UTF8String;
}
export declare enum PKIStatus {
    /** Request granted */
    GRANTED = 0,
    /** Request granted with modifications */
    GRANTED_WITH_MODS = 1,
    /** Request rejected */
    REJECTION = 2,
    /** Request waiting for confirmation */
    WAITING = 3,
    /** Revocation warning */
    REVOCATION_WARNING = 4,
    /** Revocation notification */
    REVOCATION_NOTIFICATION = 5,
    /** Partial information available */
    PARTIAL_INFO = 6
}
export interface TimeStampToken {
    /** TSTInfo structure */
    tstInfo: TSTInfo;
    /** Signer certificate */
    signerCertificate: Certificate;
    /** Digital signature over TSTInfo */
    signature: Uint8Array;
    /** Certificate chain for validation */
    certChain: Certificate[];
}
export interface TSTInfo {
    /** Version number (must be 1 for RFC 3161) */
    version: number;
    /** Policy OID string */
    policy: string;
    /** Message imprint for hash verification */
    messageImprint: MessageImprint;
    /** Unique serial number (positive, <= 2^64-1) */
    serialNumber: bigint;
    /** Generation time (UTC, validated) */
    genTime: Date;
    /** Optional accuracy information */
    accuracy?: Accuracy;
    /** Ordering flag (rarely used) */
    ordering?: boolean;
    /** Optional nonce for replay protection */
    nonce?: bigint;
    /** Optional TSA name */
    tsa?: GeneralName;
    /** Optional extensions (must be validated) */
    extensions?: Record<string, unknown>;
}
export interface MessageImprint {
    /** Hash algorithm identifier */
    hashAlgorithm: AlgorithmIdentifier;
    /** Hashed message bytes (validated length) */
    hashedMessage: Uint8Array;
}
export interface AlgorithmIdentifier {
    /** Algorithm OID string */
    algorithm: string;
    /** Optional ASN.1 parameters (usually null) */
    parameters?: any;
}
export interface Accuracy {
    /** Seconds component of accuracy */
    seconds?: number;
    /** Milliseconds component of accuracy */
    millis?: number;
    /** Microseconds component of accuracy */
    micros?: number;
}
export interface Certificate {
    /** Certificate issuer distinguished name */
    issuer: string;
    /** Certificate subject distinguished name */
    subject: string;
    /** Certificate serial number */
    serialNumber: bigint;
    /** Certificate validity start time */
    notBefore: Date;
    /** Certificate validity end time */
    notAfter: Date;
    /** Certificate extensions array */
    extensions: CertificateExtension[];
    /** Raw certificate bytes in DER format */
    raw: Uint8Array;
}
export interface CertificateExtension {
    /** Extension OID string */
    oid: string;
    /** Critical flag for extension */
    critical: boolean;
    /** Extension value bytes */
    value: Uint8Array;
}
export interface GeneralName {
    /** General name type identifier */
    type: string;
    /** General name value */
    value: string;
}
/** ASN.1 UTF8 string type */
export type ASN1UTF8String = string;
export interface TSAVerificationResult {
    /** Overall validation status */
    valid: boolean;
    /** Optional failure reason */
    reason?: string;
    /** Optional failure information */
    failInfo?: string;
    /** Timestamp generation time (if valid) */
    genTime?: Date;
    /** Accuracy information (if valid) */
    accuracy?: Accuracy;
    policy?: string;
    tsaId?: string;
    serialNumber?: bigint;
}
export interface TrustAnchor {
    name: string;
    pem: string;
    ekuRequired: string;
}
export interface TenantTSAPolicy {
    tenant_id: string;
    accepted_trust_anchors: TrustAnchor[];
    accepted_policy_oids: string[];
    routing_priority: string[];
    sla: {
        p95_latency_ms: number;
        monthly_error_budget_pct: number;
    };
}
//# sourceMappingURL=rfc3161.d.ts.map