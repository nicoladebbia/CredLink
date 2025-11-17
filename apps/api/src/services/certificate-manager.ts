import { AtomicCertificateManager } from './certificate-manager-atomic';

/**
 * @deprecated Use AtomicCertificateManager instead
 * This class will be removed in v2.0.0
 */
export class CertificateManager extends AtomicCertificateManager {
    constructor() {
        console.warn('DEPRECATED: CertificateManager will be removed. Use AtomicCertificateManager');
        super();
    }
}

// Re-export interfaces for backward compatibility
export type { Certificate } from './certificate-manager-atomic';
