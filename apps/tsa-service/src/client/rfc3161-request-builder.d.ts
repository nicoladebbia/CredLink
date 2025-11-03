/**
 * RFC 3161 TimeStampRequest Builder
 * CMS enveloping compliant with IETF specifications
 * Security-hardened with comprehensive input validation and timing attack prevention
 */
import { TimeStampRequest } from '../types/rfc3161.js';
export declare class RFC3161RequestBuilder {
    private static readonly DEFAULT_HASH_ALGORITHM;
    private static readonly MIN_NONCE_BYTES;
    private static readonly MAX_NONCE_BYTES;
    private static readonly MIN_IMPRINT_SIZE;
    private static readonly MAX_IMPRINT_SIZE;
    private static readonly SECURE_ALGORITHMS;
    /**
     * Builds an RFC 3161 TimeStampRequest with enhanced security validation
     *
     * @param imprint - Message imprint hash (32-512 bytes)
     * @param hashAlg - Hash algorithm OID (SHA-2 only)
     * @param reqPolicy - Requested policy OID (optional)
     * @param nonce - Cryptographic nonce (optional, 8-32 bytes)
     * @param certReq - Request TSA certificate (default: true)
     */
    static buildRequest(params: {
        imprint: Uint8Array;
        hashAlg?: string;
        reqPolicy?: string;
        nonce?: bigint;
        certReq?: boolean;
    }): TimeStampRequest;
    /**
     * Encodes TimeStampRequest to CMS format for HTTP transport
     *
     * CRITICAL SECURITY WARNING: This is a placeholder implementation.
     * In production, this must use proper ASN.1 DER encoding
     * following RFC 3161 specifications exactly with a vetted cryptographic library.
     *
     * @param request - TimeStampRequest to encode
     * @returns DER-encoded CMS TimeStampRequest
     * @throws Error if encoding fails or input is invalid
     */
    static encodeRequest(request: TimeStampRequest): Uint8Array;
    /**
     * Generates a cryptographically secure nonce for TSA requests
     * Uses Web Crypto API for entropy and timing-safe conversion
     *
     * @param bytes - Number of bytes for nonce (8-32, default: 16)
     * @returns Random nonce as bigint
     * @throws Error if parameters are invalid or crypto fails
     */
    static generateNonce(bytes?: number): bigint;
    /**
     * Validates OID format with enhanced security checks
     * Prevents injection and ensures compliance with RFC standards
     */
    private static isValidOID;
    /**
     * Comprehensive input validation for all parameters
     */
    private static validateInputs;
    /**
     * Creates HTTP headers for RFC 3161 request with security headers
     */
    static createHttpHeaders(): Record<string, string>;
    /**
     * Validates request parameters before building
     * Enhanced security validation with comprehensive checks
     */
    static validateRequestParams(params: {
        imprint: Uint8Array;
        hashAlg?: string;
        reqPolicy?: string;
        nonce?: bigint;
        certReq?: boolean;
    }): void;
}
//# sourceMappingURL=rfc3161-request-builder.d.ts.map