/**
 * @deprecated This package is deprecated and will be removed in v2.0.0
 * Use apps/api/src/services/certificate-manager-atomic.ts instead
 * 
 * SECURITY WARNING: This implementation contains synchronous I/O blocking operations
 * that can cause service startup paralysis. Do not use in production.
 */

// Re-export from atomic certificate manager for backward compatibility
// but with deprecation warnings
console.warn('DEPRECATED: packages/c2pa-sdk certificate-manager is deprecated due to security vulnerabilities');

export class CertificateManager {
    constructor() {
        throw new Error('DEPRECATED: Use AtomicCertificateManager from apps/api/src/services/certificate-manager-atomic.ts instead');
    }
}

export interface Certificate {
    pem: string;
    fingerprint: string;
    expiresAt: Date;
    id: string;
}

export const DEPRECATED_SECURITY_WARNING = 'This package contains synchronous I/O blocking vulnerabilities and will be removed in v2.0.0';
