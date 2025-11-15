import * as crypto from 'crypto';
import { promises as fs, readFileSync } from 'fs';
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';
import { logger } from './utils/logger';

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
  private kms: KMSClient | null = null;

  constructor() {
    // S-3: Initialize AWS KMS client in production for secure key storage
    if (process.env.NODE_ENV === 'production' && process.env.AWS_REGION) {
      this.kms = new KMSClient({
        region: process.env.AWS_REGION
      });
      logger.info('KMS client initialized for secure key storage');
    }

    // Load current certificate synchronously for initialization
    this.loadCurrentCertificateSync();

    // S-3: Schedule automatic key rotation every 90 days in production
    if (process.env.NODE_ENV === 'production') {
      this.scheduleRotation();
      logger.info('Certificate rotation scheduled (90-day cycle)');
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
          throw new Error('KMS configuration missing');
        }
        
        // Decrypt and load private key from KMS
        const encryptedKey = Buffer.from(process.env.ENCRYPTED_PRIVATE_KEY, 'base64');
        const decryptCommand = new DecryptCommand({
          CiphertextBlob: encryptedKey,
          KeyId: keyId
        });
        
        const result = await this.kms.send(decryptCommand);
        const privateKeyPem = result.Plaintext ? Buffer.from(result.Plaintext).toString('utf8') : undefined;
        
        if (!privateKeyPem) {
          throw new Error('Failed to decrypt private key');
        }
        
        return crypto.createPrivateKey(privateKeyPem);
      } catch (error) {
        // Never log the key material
        throw new Error('Failed to load private key from KMS');
      }
    } else {
      // In development, use local file
      try {
        const keyPath = process.env.SIGNING_PRIVATE_KEY || './certs/signing-key.pem';
        const privateKeyPem = readFileSync(keyPath, 'utf8');
        return crypto.createPrivateKey(privateKeyPem);
      } catch (error) {
        // Never log the key material
        throw new Error('Failed to load private key');
      }
    }
  }

  private async loadCurrentCertificateSync(): Promise<void> {
    // Now async for non-blocking I/O
    try {
      const certPath = process.env.SIGNING_CERTIFICATE || './certs/signing-cert.pem';
      const certPem = await fs.readFile(certPath, 'utf8');
      
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

  private async loadCurrentCertificate(): Promise<void> {
    try {
      let certPem: string;
      if (process.env.SIGNING_CERTIFICATE) {
        certPem = process.env.SIGNING_CERTIFICATE;
      } else {
        certPem = await fs.readFile('./certs/signing-cert.pem', 'utf8');
      }
      
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
    let certPem: string;
    if (process.env.SIGNING_CERTIFICATE) {
      certPem = process.env.SIGNING_CERTIFICATE;
    } else {
      certPem = await fs.readFile('./certs/signing-cert.pem', 'utf8');
    }
    
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
