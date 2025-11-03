/**
 * TLS Configuration Manager
 * Manages secure TLS configurations for C2PA audit service
 */
export interface TLSConfig {
    key: string;
    cert: string;
    ca?: string[] | undefined;
    minVersion: string;
    maxVersion: string;
    ciphers: string;
    honorCipherOrder: boolean;
    secureOptions: number;
}
export interface CertificateInfo {
    subject: string;
    issuer: string;
    serial: string;
    fingerprint: string;
    notBefore: Date;
    notAfter: Date;
    isValid: boolean;
}
/**
 * TLS configuration management with security best practices
 */
export declare class TLSConfigurationManager {
    private static readonly SECURE_CIPHERS;
    private static readonly TLS_VERSIONS;
    private static readonly SECURE_OPTIONS;
    private currentConfig;
    private certificateInfo;
    /**
     * Generate secure TLS configuration
     */
    generateTLSConfig(certificates: {
        key: string;
        cert: string;
        ca?: string[];
    }): TLSConfig;
    /**
     * Get current TLS configuration
     */
    getCurrentConfig(): TLSConfig | null;
    /**
     * Get certificate information
     */
    getCertificateInfo(): CertificateInfo | null;
    /**
     * Validate TLS connection
     */
    validateTLSConnection(peerCertificate: string, hostname?: string): boolean;
    /**
     * Generate development TLS configuration
     */
    generateDevelopmentTLSConfig(): TLSConfig;
    /**
     * Rotate TLS configuration
     */
    rotateTLSConfiguration(newCertificates: {
        key: string;
        cert: string;
        ca?: string[];
    }): TLSConfig;
    /**
     * Get TLS security recommendations
     */
    getSecurityRecommendations(): string[];
    /**
     * Validate certificate files
     */
    private validateCertificates;
    /**
     * Update certificate information
     */
    private updateCertificateInfo;
    /**
     * Parse certificate information (simplified)
     */
    private parseCertificate;
    /**
     * Validate hostname against certificate
     */
    private validateHostname;
    /**
     * Validate TLS configuration
     */
    private validateConfiguration;
    /**
     * Generate certificate fingerprint
     */
    static generateCertificateFingerprint(certificate: string): string;
    /**
     * Check if certificate is expired
     */
    static isCertificateExpired(notAfter: Date): boolean;
    /**
     * Get days until certificate expiration
     */
    static getDaysUntilExpiration(notAfter: Date): number;
}
//# sourceMappingURL=tls-config.d.ts.map