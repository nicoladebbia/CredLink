import { AtomicCertificateManager, Certificate } from './certificate-manager-atomic';
import { logger } from '../utils/logger';

/**
 * @deprecated Use AtomicCertificateManager instead
 * This class will be removed in v2.0.0
 */
export class AsyncCertificateManager extends AtomicCertificateManager {
    constructor() {
        console.warn('DEPRECATED: AsyncCertificateManager will be removed. Use AtomicCertificateManager');
        super();
    }

    // Legacy compatibility methods
    async getCertificateAsync(): Promise<any> {
        return await this.getCurrentCertificate();
    }

    async getSigningCertificateAsync(): Promise<string> {
        const cert = await this.getCurrentCertificate();
        return cert.pem;
    }

    async getSigningKeyAsync(): Promise<string> {
        // For backward compatibility - return key path
        return process.env.SIGNING_KEY_PATH || './certs/signing-key.pem';
    }

    async getSigningKey(): Promise<string> {
        return await this.getSigningKeyAsync();
    }

    async getCurrentCertificateId(): Promise<string> {
        const cert = this.getRotationStatus().currentCertificate;
        return cert?.id || 'unknown';
    }

    async performHealthCheck(): Promise<{healthy: boolean, certificate?: Certificate, issues: string[], timeUntilExpiry: number}> {
        try {
            const cert = this.getRotationStatus().currentCertificate;
            return {
                healthy: !!cert,
                certificate: cert || undefined,
                issues: [],
                timeUntilExpiry: 0
            };
        } catch (error) {
            return {
                healthy: false,
                certificate: undefined,
                issues: [`Health check failed: ${error instanceof Error ? error.message : String(error)}`],
                timeUntilExpiry: 0
            };
        }
    }

    async isCertificateValidAsync(): Promise<boolean> {
        const health = await this.performHealthCheck();
        return health.healthy;
    }

    async getCertificateInfoAsync(): Promise<any> {
        const health = await this.performHealthCheck();
        const cert = health.certificate;
        if (!cert) {
            throw new Error('Certificate not available');
        }
        return {
            subject: 'Legacy compatibility',
            expiresAt: cert.expiresAt,
            serialNumber: cert.id,
            isValid: health.healthy
        };
    }

    async rotateCertificateAsync(newCertPath: string, newKeyPath: string): Promise<void> {
        // Set environment variables for rotation
        process.env.NEW_CERTIFICATE_FILE = newCertPath;
        const result = await this.rotateCertificate();
        if (!result.success) {
            throw new Error(`Rotation failed: ${result.error}`);
        }
    }

    async destroy(): Promise<void> {
        await this.close();
    }
}
