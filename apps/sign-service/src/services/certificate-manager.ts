import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/error-handler';

export interface CertificateInfo {
  id: string;
  name: string;
  issuer: string;
  validFrom: string;
  validUntil: string;
  status: 'active' | 'expired' | 'revoked';
  algorithm: string;
}

export class CertificateManager {
  private certificates: Map<string, CertificateInfo> = new Map();
  private defaultCertPath: string;
  private defaultKeyPath: string;

  constructor() {
    this.defaultCertPath = process.env.SIGNING_CERTIFICATE || './certs/signing-cert.pem';
    this.defaultKeyPath = process.env.SIGNING_KEY_PATH || './certs/signing-key.pem';
    
    this.loadCertificates();
    logger.info('Certificate Manager initialized');
  }

  /**
   * Load available certificates
   */
  private loadCertificates(): void {
    try {
      // Load default certificate if available
      if (existsSync(this.defaultCertPath) && existsSync(this.defaultKeyPath)) {
        const certData = readFileSync(this.defaultCertPath, 'utf8');
        const certInfo = this.parseCertificate(certData);
        
        this.certificates.set('default', {
          id: 'default',
          name: 'Default Signing Certificate',
          issuer: certInfo.issuer || 'Unknown',
          validFrom: certInfo.validFrom || new Date().toISOString(),
          validUntil: certInfo.validUntil || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          status: this.checkCertificateValidity(certInfo.validUntil),
          algorithm: certInfo.algorithm || 'RSA-2048'
        });

        logger.info('Default certificate loaded', {
          path: this.defaultCertPath,
          issuer: certInfo.issuer,
          validUntil: certInfo.validUntil
        });
      } else {
        logger.warn('Default certificate not found', {
          certPath: this.defaultCertPath,
          keyPath: this.defaultKeyPath
        });
      }

      // Load additional certificates from environment or config
      this.loadAdditionalCertificates();

    } catch (error) {
      logger.error('Failed to load certificates', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  /**
   * Parse certificate information
   */
  private parseCertificate(certData: string): any {
    try {
      // Simple certificate parsing - in production, use a proper crypto library
      const lines = certData.split('\n');
      const issuerLine = lines.find(line => line.includes('Issuer:'));
      const validFromLine = lines.find(line => line.includes('Not Before:'));
      const validUntilLine = lines.find(line => line.includes('Not After:'));
      
      return {
        issuer: issuerLine?.split(':').pop()?.trim() || 'CredLink CA',
        validFrom: validFromLine?.split(':').pop()?.trim() || new Date().toISOString(),
        validUntil: validUntilLine?.split(':').pop()?.trim() || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        algorithm: 'RSA-2048'
      };
    } catch (error) {
      logger.warn('Failed to parse certificate details', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return {
        issuer: 'CredLink CA',
        validFrom: new Date().toISOString(),
        validUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        algorithm: 'RSA-2048'
      };
    }
  }

  /**
   * Check certificate validity
   */
  private checkCertificateValidity(validUntil: string): 'active' | 'expired' | 'revoked' {
    const expiryDate = new Date(validUntil);
    const now = new Date();
    
    return expiryDate > now ? 'active' : 'expired';
  }

  /**
   * Load additional certificates from environment
   */
  private loadAdditionalCertificates(): void {
    // Example: Load certificates from environment variables or external sources
    const additionalCerts = process.env.ADDITIONAL_CERTIFICATES;
    
    if (additionalCerts) {
      try {
        const certList = JSON.parse(additionalCerts);
        
        certList.forEach((cert: any, index: number) => {
          this.certificates.set(`additional_${index}`, {
            id: `additional_${index}`,
            name: cert.name || `Additional Certificate ${index + 1}`,
            issuer: cert.issuer || 'Unknown',
            validFrom: cert.validFrom || new Date().toISOString(),
            validUntil: cert.validUntil || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
            status: this.checkCertificateValidity(cert.validUntil),
            algorithm: cert.algorithm || 'RSA-2048'
          });
        });
        
        logger.info(`Loaded ${certList.length} additional certificates`);
      } catch (error) {
        logger.error('Failed to load additional certificates', {
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  }

  /**
   * Get signing certificate data
   */
  async getSigningCertificate(): Promise<string | null> {
    try {
      if (existsSync(this.defaultCertPath)) {
        return readFileSync(this.defaultCertPath, 'utf8');
      }
      
      // Fallback to environment variable
      const envCert = process.env.SIGNING_CERTIFICATE_DATA;
      if (envCert) {
        return envCert;
      }
      
      logger.warn('No signing certificate available');
      return null;
      
    } catch (error) {
      logger.error('Failed to get signing certificate', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return null;
    }
  }

  /**
   * Get signing key data
   */
  async getSigningKey(): Promise<string | null> {
    try {
      if (existsSync(this.defaultKeyPath)) {
        return readFileSync(this.defaultKeyPath, 'utf8');
      }
      
      // Fallback to environment variable
      const envKey = process.env.SIGNING_KEY_DATA;
      if (envKey) {
        return envKey;
      }
      
      logger.warn('No signing key available');
      return null;
      
    } catch (error) {
      logger.error('Failed to get signing key', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return null;
    }
  }

  /**
   * Get available certificates
   */
  async getAvailableCertificates(): Promise<CertificateInfo[]> {
    return Array.from(this.certificates.values());
  }

  /**
   * Get certificate by ID
   */
  async getCertificateById(id: string): Promise<CertificateInfo | null> {
    return this.certificates.get(id) || null;
  }

  /**
   * Get service status
   */
  async getStatus(): Promise<{ status: string; details: any }> {
    const activeCerts = Array.from(this.certificates.values()).filter(cert => cert.status === 'active');
    
    return {
      status: activeCerts.length > 0 ? 'operational' : 'degraded',
      details: {
        total_certificates: this.certificates.size,
        active_certificates: activeCerts.length,
        default_certificate_available: existsSync(this.defaultCertPath),
        default_key_available: existsSync(this.defaultKeyPath),
        certificates: Array.from(this.certificates.values()).map(cert => ({
          id: cert.id,
          name: cert.name,
          status: cert.status,
          validUntil: cert.validUntil
        }))
      }
    };
  }

  /**
   * Validate certificate chain
   */
  async validateCertificateChain(certificateData: string): Promise<boolean> {
    try {
      // Basic validation - in production, implement proper chain validation
      return certificateData.includes('-----BEGIN CERTIFICATE-----') && 
             certificateData.includes('-----END CERTIFICATE-----');
    } catch (error) {
      logger.error('Certificate chain validation failed', {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      
      return false;
    }
  }

  /**
   * Clean up resources
   */
  async cleanup(): Promise<void> {
    this.certificates.clear();
    logger.info('Certificate Manager cleanup completed');
  }
}
