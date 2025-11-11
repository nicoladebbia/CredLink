import * as crypto from 'crypto';
import { readFileSync } from 'fs';
import { KMS } from 'aws-sdk';

export interface Certificate {
  pem: string;
  fingerprint: string;
  expiresAt: Date;
  id: string;
}

export class CertificateManager {
  private currentCertificate: Certificate | null = null;
  private rotationInterval: number = 90 * 24 * 60 * 60 * 1000; // 90 days
  private rotationTimer: NodeJS.Timeout | null = null;
  private kms: KMS | null = null;

  constructor() {
    // Initialize KMS only in production
    if (process.env.NODE_ENV === 'production' && process.env.AWS_REGION) {
      this.kms = new KMS({ region: process.env.AWS_REGION });
    }
    
    this.loadCurrentCertificate();
    // Only schedule rotation in production
    if (process.env.NODE_ENV === 'production') {
      this.scheduleRotation();
    }
  }

  destroy() {
    if (this.rotationTimer) {
      clearInterval(this.rotationTimer);
      this.rotationTimer = null;
    }
  }

  async getCurrentCertificate(): Promise<Certificate> {
    if (!this.currentCertificate || this.isCertificateExpired(this.currentCertificate)) {
      await this.rotateCertificate();
    }
    return this.currentCertificate!;
  }

  async getSigningKey(): Promise<crypto.KeyObject> {
    if (process.env.NODE_ENV === 'production' && this.kms) {
      // In production, use AWS KMS
      try {
        const keyId = process.env.KMS_KEY_ID;
        if (!keyId || !process.env.ENCRYPTED_PRIVATE_KEY) {
          throw new Error('KMS_KEY_ID or ENCRYPTED_PRIVATE_KEY not configured');
        }
        
        const response = await this.kms.decrypt({
          CiphertextBlob: Buffer.from(process.env.ENCRYPTED_PRIVATE_KEY, 'base64')
        }).promise();
        
        if (!response.Plaintext) {
          throw new Error('KMS decryption returned no plaintext');
        }
        
        return crypto.createPrivateKey(response.Plaintext.toString());
      } catch (error: any) {
        // Never log the actual error which might contain key material
        throw new Error('KMS key retrieval failed');
      }
    } else {
      // In development, use environment variable or file
      try {
        const privateKeyPem = process.env.SIGNING_PRIVATE_KEY || 
                             readFileSync('./certs/signing-key.pem', 'utf8');
        return crypto.createPrivateKey(privateKeyPem);
      } catch (error) {
        // Never log the key material
        throw new Error('Failed to load private key');
      }
    }
  }

  private async loadCurrentCertificate(): Promise<void> {
    try {
      const certPem = process.env.SIGNING_CERTIFICATE || 
                     readFileSync('./certs/signing-cert.pem', 'utf8');
      
      this.currentCertificate = {
        pem: certPem,
        fingerprint: this.generateCertificateFingerprint(certPem),
        expiresAt: this.extractExpirationDate(certPem),
        id: this.generateCertificateId(certPem)
      };
    } catch (error) {
      throw new Error(`Failed to load signing certificate: ${error}`);
    }
  }

  private async rotateCertificate(): Promise<void> {
    try {
      // Generate new certificate signing request
      const csr = await this.generateCSR();
      
      // Sign with internal CA (or external CA in production)
      const newCertificate = await this.signCSR(csr);
      
      // Update current certificate
      this.currentCertificate = newCertificate;
      
      // Store in secure location
      await this.storeCertificate(newCertificate);
      
      // Log rotation
      console.info(`Certificate rotated: ${newCertificate.id}`);
    } catch (error: any) {
      console.error('Certificate rotation failed:', error.message);
      // Don't throw - keep using existing certificate
    }
  }

  private async generateCSR(): Promise<string> {
    // Generate a new private key and CSR
    // In production, this would use proper CSR generation
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
      }
    });
    
    // Create a simple CSR (in production, use proper CSR library)
    return `-----BEGIN CERTIFICATE REQUEST-----\n${Buffer.from(publicKey).toString('base64')}\n-----END CERTIFICATE REQUEST-----`;
  }

  private async signCSR(csr: string): Promise<Certificate> {
    // In production, this would call external CA or use internal CA
    // For now, return a self-signed certificate structure
    const certPem = process.env.SIGNING_CERTIFICATE || 
                   readFileSync('./certs/signing-cert.pem', 'utf8');
    
    return {
      pem: certPem,
      fingerprint: this.generateCertificateFingerprint(certPem),
      expiresAt: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000), // 90 days from now
      id: this.generateCertificateId(certPem)
    };
  }

  private async storeCertificate(certificate: Certificate): Promise<void> {
    // In production, store in KMS or secure storage
    // For now, log that storage would happen
    console.info('Certificate stored (placeholder):', certificate.id);
  }

  private scheduleRotation(): void {
    // Check rotation daily
    this.rotationTimer = setInterval(async () => {
      if (this.shouldRotate()) {
        await this.rotateCertificate();
      }
    }, 24 * 60 * 60 * 1000);
    
    // Allow Node to exit even if timer is active
    this.rotationTimer.unref();
  }

  private shouldRotate(): boolean {
    return this.currentCertificate ? 
      this.isCertificateExpired(this.currentCertificate) : 
      true;
  }

  private isCertificateExpired(certificate: Certificate): boolean {
    return new Date() > certificate.expiresAt;
  }

  private generateCertificateFingerprint(certPem: string): string {
    const cert = new crypto.X509Certificate(certPem);
    return cert.fingerprint256;
  }

  private extractExpirationDate(certPem: string): Date {
    const cert = new crypto.X509Certificate(certPem);
    return new Date(cert.validTo);
  }

  private generateCertificateId(certPem: string): string {
    const fingerprint = this.generateCertificateFingerprint(certPem);
    return fingerprint.replace(/:/g, '').toLowerCase();
  }

  getCurrentCertificateId(): string {
    return this.currentCertificate?.id || 'unknown';
  }
}
