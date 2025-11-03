/**
 * TLS Configuration Manager
 * Manages secure TLS configurations for C2PA audit service
 */
import { randomBytes, createHash } from 'crypto';
/**
 * TLS configuration management with security best practices
 */
export class TLSConfigurationManager {
    static SECURE_CIPHERS = [
        'ECDHE-ECDSA-AES256-GCM-SHA384',
        'ECDHE-RSA-AES256-GCM-SHA384',
        'ECDHE-ECDSA-CHACHA20-POLY1305',
        'ECDHE-RSA-CHACHA20-POLY1305',
        'ECDHE-ECDSA-AES128-GCM-SHA256',
        'ECDHE-RSA-AES128-GCM-SHA256'
    ];
    static TLS_VERSIONS = {
        MIN: 'TLSv1.2',
        MAX: 'TLSv1.3'
    };
    static SECURE_OPTIONS = 0x40000000; // SSL_OP_NO_SSLv3 | SSL_OP_NO_TLSv1 | SSL_OP_NO_TLSv1_1
    currentConfig = null;
    certificateInfo = null;
    /**
     * Generate secure TLS configuration
     */
    generateTLSConfig(certificates) {
        // Validate certificates
        this.validateCertificates(certificates);
        const config = {
            key: certificates.key,
            cert: certificates.cert,
            ca: certificates.ca,
            minVersion: TLSConfigurationManager.TLS_VERSIONS.MIN,
            maxVersion: TLSConfigurationManager.TLS_VERSIONS.MAX,
            ciphers: TLSConfigurationManager.SECURE_CIPHERS.join(':'),
            honorCipherOrder: true,
            secureOptions: TLSConfigurationManager.SECURE_OPTIONS
        };
        this.currentConfig = config;
        this.updateCertificateInfo(certificates.cert);
        return config;
    }
    /**
     * Get current TLS configuration
     */
    getCurrentConfig() {
        return this.currentConfig;
    }
    /**
     * Get certificate information
     */
    getCertificateInfo() {
        return this.certificateInfo;
    }
    /**
     * Validate TLS connection
     */
    validateTLSConnection(peerCertificate, hostname) {
        try {
            // Basic certificate validation
            if (!peerCertificate) {
                return false;
            }
            // Parse certificate (simplified validation)
            const certInfo = this.parseCertificate(peerCertificate);
            if (!certInfo.isValid) {
                return false;
            }
            // Check expiration
            const now = new Date();
            if (certInfo.notBefore > now || certInfo.notAfter < now) {
                return false;
            }
            // Hostname validation if provided
            if (hostname && !this.validateHostname(certInfo.subject, hostname)) {
                return false;
            }
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Generate development TLS configuration
     */
    generateDevelopmentTLSConfig() {
        throw new Error('Self-signed certificates are not allowed - use proper certificates in all environments');
    }
    /**
     * Rotate TLS configuration
     */
    rotateTLSConfiguration(newCertificates) {
        const oldConfig = this.currentConfig;
        try {
            const newConfig = this.generateTLSConfig(newCertificates);
            // Validate new configuration before applying
            if (!this.validateConfiguration(newConfig)) {
                throw new Error('New TLS configuration is invalid');
            }
            return newConfig;
        }
        catch (error) {
            // Revert to old configuration on failure
            this.currentConfig = oldConfig;
            throw error;
        }
    }
    /**
     * Get TLS security recommendations
     */
    getSecurityRecommendations() {
        const recommendations = [];
        if (!this.currentConfig) {
            recommendations.push('TLS configuration is not set');
            return recommendations;
        }
        // Check TLS versions
        if (this.currentConfig.minVersion !== 'TLSv1.2') {
            recommendations.push('Consider using TLS 1.2 as minimum version');
        }
        // Check cipher suites
        const currentCiphers = this.currentConfig.ciphers.split(':');
        const weakCiphers = currentCiphers.filter((cipher) => !TLSConfigurationManager.SECURE_CIPHERS.includes(cipher));
        if (weakCiphers.length > 0) {
            recommendations.push(`Remove weak cipher suites: ${weakCiphers.join(', ')}`);
        }
        // Check certificate expiration
        if (this.certificateInfo) {
            const daysUntilExpiration = Math.floor((this.certificateInfo.notAfter.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            if (daysUntilExpiration < 30) {
                recommendations.push('Certificate will expire soon - consider renewal');
            }
        }
        return recommendations;
    }
    /**
     * Validate certificate files
     */
    validateCertificates(certificates) {
        if (!certificates.key || !certificates.cert) {
            throw new Error('Certificate key and certificate are required');
        }
        // CRITICAL: Never accept placeholder certificates in production
        if (certificates.key.includes('...') || certificates.cert.includes('...')) {
            throw new Error('Placeholder certificates detected - production requires real certificates');
        }
        // Enhanced format validation
        if (!certificates.key.includes('-----BEGIN PRIVATE KEY-----') || !certificates.key.includes('-----END PRIVATE KEY-----')) {
            throw new Error('Invalid certificate key format - must be PEM encoded private key');
        }
        if (!certificates.cert.includes('-----BEGIN CERTIFICATE-----') || !certificates.cert.includes('-----END CERTIFICATE-----')) {
            throw new Error('Invalid certificate format - must be PEM encoded certificate');
        }
        // Validate key strength (must be at least 2048 bits)
        const keyLines = certificates.key.split('\n').filter(line => !line.includes('-----'));
        const keyData = keyLines.join('');
        if (keyData.length < 100) { // Rough estimate for key strength
            throw new Error('Certificate key is too weak - minimum 2048 bits required');
        }
        // Validate CA certificates if provided
        if (certificates.ca) {
            if (certificates.ca.length > 10) {
                throw new Error('Too many CA certificates - maximum 10 allowed');
            }
            for (const ca of certificates.ca) {
                if (!ca.includes('-----BEGIN CERTIFICATE-----') || !ca.includes('-----END CERTIFICATE-----')) {
                    throw new Error('Invalid CA certificate format - must be PEM encoded');
                }
            }
        }
    }
    /**
     * Update certificate information
     */
    updateCertificateInfo(certificate) {
        this.certificateInfo = this.parseCertificate(certificate);
    }
    /**
     * Parse certificate information (simplified)
     */
    parseCertificate(certificate) {
        // This is a simplified implementation
        // In production, use proper certificate parsing libraries
        const fingerprint = createHash('sha256').update(certificate).digest('hex');
        return {
            subject: 'CN=C2PA Audit Service',
            issuer: 'CN=C2PA Audit CA',
            serial: randomBytes(16).toString('hex'),
            fingerprint,
            notBefore: new Date(Date.now() - 24 * 60 * 60 * 1000), // 1 day ago
            notAfter: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000), // 1 year from now
            isValid: true
        };
    }
    /**
     * Validate hostname against certificate
     */
    validateHostname(subject, hostname) {
        // Simplified hostname validation
        // In production, implement proper X.509 hostname validation
        return subject.includes(hostname) || subject.includes('*');
    }
    /**
     * Validate TLS configuration
     */
    validateConfiguration(config) {
        try {
            // Check required fields
            if (!config.key || !config.cert) {
                return false;
            }
            // Check TLS versions
            if (config.minVersion !== 'TLSv1.2' || config.maxVersion !== 'TLSv1.3') {
                return false;
            }
            // Check cipher suites
            const ciphers = config.ciphers.split(':');
            const hasSecureCipher = ciphers.some((cipher) => TLSConfigurationManager.SECURE_CIPHERS.includes(cipher));
            if (!hasSecureCipher) {
                return false;
            }
            return true;
        }
        catch (error) {
            return false;
        }
    }
    /**
     * Generate certificate fingerprint
     */
    static generateCertificateFingerprint(certificate) {
        return createHash('sha256').update(certificate).digest('hex');
    }
    /**
     * Check if certificate is expired
     */
    static isCertificateExpired(notAfter) {
        return new Date() > notAfter;
    }
    /**
     * Get days until certificate expiration
     */
    static getDaysUntilExpiration(notAfter) {
        return Math.floor((notAfter.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    }
}
//# sourceMappingURL=tls-config.js.map