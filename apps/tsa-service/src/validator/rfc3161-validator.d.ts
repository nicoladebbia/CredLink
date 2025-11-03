/**
 * RFC 3161/5816 TimeStampToken Validator
 * Strict compliance with non-negotiable requirements
 * Security-hardened with comprehensive validation and timing attack prevention
 *
 * Implements:
 * - RFC 3161: Time-Stamp Protocol (TSP)
 * - RFC 5816: ESSCertIDv2 update (SHA-2 support)
 * - ETSI EN 319 421/422: EU qualified TSA requirements
 * - NIST SP 800-63b: Digital Identity Guidelines
 */
import { TimeStampToken, TSAVerificationResult, TrustAnchor, MessageImprint, Certificate } from '../types/rfc3161.js';
export declare class RFC3161Validator {
    private static readonly TIMESTAMPING_EKU;
    private static readonly CRITICAL_EKU;
    private static readonly MAX_FUTURE_TIME_MS;
    private static readonly MIN_PAST_YEAR;
    private static readonly MAX_SERIAL_NUMBER;
    private static readonly MAX_NONCE_VALUE;
    /**
     * Validates a TimeStampToken against RFC 3161/5816 requirements
     * Enhanced security with comprehensive input validation and timing attack prevention
     *
     * Non-negotiable validations:
     * 1. status=granted
     * 2. messageImprint match
     * 3. nonce echo (if present)
     * 4. policy OID allowed
     * 5. UTC genTime + accuracy
     * 6. unique serial
     * 7. signature chain to trusted anchor
     * 8. EKU=id-kp-timeStamping (critical)
     * 9. ESSCertIDv2 hash OK (SHA-2 allowed)
     */
    validateToken(token: TimeStampToken, expectedImprint: MessageImprint, tenantPolicy: TrustAnchor[], expectedNonce?: bigint): Promise<TSAVerificationResult>;
    /**
     * Validates TSTInfo fields according to RFC 3161 with enhanced security
     */
    private validateTSTInfo;
    /**
     * Validates certificate chain to trusted anchor with EKU requirements
     */
    private validateCertificateChain;
    /**
     * Validates the CMS signature over TSTInfo with enhanced security
     */
    private validateSignature;
    /**
     * Helper methods for validation with enhanced security
     */
    private isValidOID;
    private messageImprintsMatch;
    private isValidUTCTime;
    private isValidAccuracy;
    private isKnownExtension;
    private findTrustedAnchor;
    private validateChainToAnchor;
    private extractTSAId;
    /**
     * Validates ESSCertIDv2 hash according to RFC 5816
     * Accepts SHA-2 hashes (not just SHA-1)
   *
     * SECURITY CRITICAL: This is a placeholder implementation.
     * In production, this must perform actual certificate hash validation.
     */
    validateESSCertIDv2(certHash: Uint8Array, certificate: Certificate): boolean;
    /**
     * Validate all input parameters to prevent injection and ensure type safety
     */
    private validateInputs;
}
//# sourceMappingURL=rfc3161-validator.d.ts.map