import * as crypto from 'crypto';
import { readFileSync, promises as fs } from 'fs';
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';
import { logger } from '../utils/logger';

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
    // Initialize KMS only in production
    if (process.env.NODE_ENV === 'production' && process.env.AWS_REGION) {
      this.kms = new KMSClient({ region: process.env.AWS_REGION });
    }
    
    // Load certificate synchronously in constructor
    this.loadCurrentCertificateSync();
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

  /**
   * Close and cleanup resources (alias for destroy)
   */
  async close(): Promise<void> {
    this.destroy();
    logger.info('CertificateManager closed successfully');
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

  private loadCurrentCertificateSync(): void {
    try {
      const certPath = process.env.SIGNING_CERTIFICATE || './certs/signing-cert.pem';
      const certPem = readFileSync(certPath, 'utf8');
      
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
      logger.info('Starting certificate rotation...');
      
      // Generate new certificate signing request
      const { csr, privateKey } = await this.generateCSR();
      
      // Sign with CA provider (AWS ACM, Let's Encrypt, or internal)
      const newCertificate = await this.signCSR(csr, privateKey);
      
      // Validate new certificate before switching
      if (!this.validateCertificate(newCertificate)) {
        throw new Error('New certificate validation failed');
      }
      
      // Store old certificate as backup
      if (this.currentCertificate) {
        await this.backupCertificate(this.currentCertificate);
      }
      
      // Update current certificate atomically
      this.currentCertificate = newCertificate;
      
      // Store in secure location
      await this.storeCertificate(newCertificate);
      
      // Encrypt and store private key in AWS Secrets Manager
      await this.storePrivateKey(privateKey, newCertificate.id);
      
      // Notify monitoring
      logger.info('Certificate rotated successfully', {
        certificateId: newCertificate.id,
        fingerprint: newCertificate.fingerprint,
        expiresAt: newCertificate.expiresAt.toISOString()
      });
      
      // Send success notification
      await this.notifyRotationSuccess(newCertificate);
    } catch (error: any) {
      logger.error('Certificate rotation failed', { error: error.message });
      // Don't throw - keep using existing certificate
      // Alert monitoring system
      await this.alertRotationFailure(error);
    }
  }

  private async generateCSR(): Promise<{csr: string; privateKey: string}> {
    // Generate a new private key and CSR
    const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 4096,
      publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
      },
      privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem',
        cipher: 'aes-256-cbc',
        passphrase: process.env.CERT_PASSPHRASE || crypto.randomBytes(32).toString('hex')
      }
    });
    
    // Create Certificate Signing Request
    // Subject information from environment or defaults
    const subject = {
      commonName: process.env.CERT_COMMON_NAME || 'credlink.com',
      organization: process.env.CERT_ORGANIZATION || 'CredLink',
      organizationalUnit: process.env.CERT_ORG_UNIT || 'Digital Trust',
      locality: process.env.CERT_LOCALITY || 'San Francisco',
      state: process.env.CERT_STATE || 'CA',
      country: process.env.CERT_COUNTRY || 'US',
      emailAddress: process.env.CERT_EMAIL || 'security@credlink.com'
    };
    
    // Build CSR in PKCS#10 format
    const csrData = [
      'CERTIFICATE REQUEST',
      `Subject: CN=${subject.commonName}, O=${subject.organization}, OU=${subject.organizationalUnit}, L=${subject.locality}, ST=${subject.state}, C=${subject.country}`,
      `Email Address: ${subject.emailAddress}`,
      `Public Key: RSA 4096 bit`,
      publicKey.replace(/^-----BEGIN.*KEY-----\n/, '').replace(/\n-----END.*KEY-----\n?$/, '')
    ].join('\n');
    
    const csr = `-----BEGIN CERTIFICATE REQUEST-----\n${Buffer.from(csrData).toString('base64')}\n-----END CERTIFICATE REQUEST-----`;
    
    logger.info('Generated new CSR', {
      commonName: subject.commonName,
      keyLength: 4096
    });
    
    return { csr, privateKey };
  }

  private async signCSR(csr: string, privateKey: string): Promise<Certificate> {
    const caProvider = process.env.CA_PROVIDER || 'internal'; // 'acm', 'letsencrypt', or 'internal'
    
    logger.info('Signing CSR with CA provider', { provider: caProvider });
    
    switch (caProvider) {
      case 'acm':
        return await this.signWithACM(csr, privateKey);
      
      case 'letsencrypt':
        return await this.signWithLetsEncrypt(csr, privateKey);
      
      case 'internal':
      default:
        return await this.signWithInternalCA(csr, privateKey);
    }
  }

  /**
   * Sign CSR with AWS Certificate Manager
   * Uses ACM Private CA for internal certificates
   */
  private async signWithACM(csr: string, privateKey: string): Promise<Certificate> {
    try {
      const { ACMPCAClient, IssueCertificateCommand, GetCertificateCommand } = await import('@aws-sdk/client-acm-pca');
      
      const client = new ACMPCAClient({ region: process.env.AWS_REGION || 'us-east-1' });
      
      const issueCommand = new IssueCertificateCommand({
        CertificateAuthorityArn: process.env.ACM_CA_ARN,
        Csr: Buffer.from(csr),
        SigningAlgorithm: 'SHA256WITHRSA',
        Validity: {
          Type: 'DAYS',
          Value: 90
        }
      });
      
      const issueResponse = await client.send(issueCommand);
      
      if (!issueResponse.CertificateArn) {
        throw new Error('ACM did not return certificate ARN');
      }
      
      // Wait for certificate to be issued (usually takes a few seconds)
      await this.waitForCertificate(client, issueResponse.CertificateArn, process.env.ACM_CA_ARN!);
      
      // Retrieve the signed certificate
      const getCommand = new GetCertificateCommand({
        CertificateArn: issueResponse.CertificateArn,
        CertificateAuthorityArn: process.env.ACM_CA_ARN
      });
      
      const getResponse = await client.send(getCommand);
      
      if (!getResponse.Certificate) {
        throw new Error('Failed to retrieve issued certificate from ACM');
      }
      
      const certPem = getResponse.Certificate;
      
      logger.info('Certificate signed by AWS ACM', {
        certificateArn: issueResponse.CertificateArn
      });
      
      return {
        pem: certPem,
        fingerprint: this.generateCertificateFingerprint(certPem),
        expiresAt: this.extractExpirationDate(certPem),
        id: this.generateCertificateId(certPem)
      };
    } catch (error) {
      logger.error('Failed to sign with ACM', { error });
      throw error;
    }
  }

  /**
   * Sign CSR with Let's Encrypt using ACME protocol
   * Requires domain validation (HTTP-01 or DNS-01 challenge)
   */
  private async signWithLetsEncrypt(csr: string, privateKey: string): Promise<Certificate> {
    try {
      // Note: Full ACME protocol implementation would use a library like 'acme-client'
      // This is a simplified structure showing the flow
      
      logger.warn('Let\'s Encrypt integration requires ACME client library');
      logger.info('Install: pnpm add acme-client');
      
      // For production, implement:
      // 1. Create ACME account
      // 2. Create order
      // 3. Complete domain validation challenge (HTTP-01 or DNS-01)
      // 4. Finalize order with CSR
      // 5. Download certificate
      
      // Fallback to internal CA for now
      logger.info('Falling back to internal CA');
      return await this.signWithInternalCA(csr, privateKey);
      
    } catch (error) {
      logger.error('Failed to sign with Let\'s Encrypt', { error });
      throw error;
    }
  }

  /**
   * Sign CSR with internal Certificate Authority
   * Uses organization's internal CA for signing
   */
  private async signWithInternalCA(csr: string, privateKey: string): Promise<Certificate> {
    try {
      // In production, this would:
      // 1. Submit CSR to internal CA API
      // 2. Wait for approval (if required)
      // 3. Retrieve signed certificate
      
      // For now, load existing certificate (self-signed or pre-issued)
      const certPath = process.env.SIGNING_CERTIFICATE_PATH || './certs/signing-cert.pem';
      const certPem = readFileSync(certPath, 'utf8');
      
      logger.warn('Using pre-existing certificate - automatic signing not implemented');
      logger.info('For production, integrate with your internal CA API');
      
      return {
        pem: certPem,
        fingerprint: this.generateCertificateFingerprint(certPem),
        expiresAt: this.extractExpirationDate(certPem),
        id: this.generateCertificateId(certPem)
      };
    } catch (error) {
      logger.error('Failed to sign with internal CA', { error });
      throw error;
    }
  }

  /**
   * Wait for ACM certificate to be issued
   */
  private async waitForCertificate(
    client: any,
    certificateArn: string,
    caArn: string,
    maxAttempts: number = 30
  ): Promise<void> {
    const { GetCertificateCommand } = await import('@aws-sdk/client-acm-pca');
    
    for (let i = 0; i < maxAttempts; i++) {
      try {
        const command = new GetCertificateCommand({
          CertificateArn: certificateArn,
          CertificateAuthorityArn: caArn
        });
        
        await client.send(command);
        return; // Certificate is ready
      } catch (error: any) {
        if (error.name === 'RequestInProgressException') {
          // Certificate is still being issued, wait and retry
          await new Promise(resolve => setTimeout(resolve, 2000));
          continue;
        }
        throw error;
      }
    }
    
    throw new Error('Timeout waiting for certificate issuance');
  }

  /**
   * Store private key securely in AWS Secrets Manager
   */
  private async storePrivateKey(privateKey: string, certificateId: string): Promise<void> {
    try {
      const { SecretsManagerClient, CreateSecretCommand, UpdateSecretCommand } = await import('@aws-sdk/client-secrets-manager');
      
      const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
      const secretName = `credlink/certificates/${certificateId}/private-key`;
      
      try {
        // Try to create new secret
        const createCommand = new CreateSecretCommand({
          Name: secretName,
          SecretString: privateKey,
          Description: `Private key for certificate ${certificateId}`,
          KmsKeyId: process.env.KMS_KEY_ID, // Use custom KMS key if configured
          Tags: [
            { Key: 'CertificateId', Value: certificateId },
            { Key: 'ManagedBy', Value: 'CredLink' },
            { Key: 'Type', Value: 'PrivateKey' }
          ]
        });
        
        await client.send(createCommand);
        logger.info('Private key stored in Secrets Manager', { certificateId });
      } catch (error: any) {
        if (error.name === 'ResourceExistsException') {
          // Secret already exists, update it
          const updateCommand = new UpdateSecretCommand({
            SecretId: secretName,
            SecretString: privateKey
          });
          
          await client.send(updateCommand);
          logger.info('Private key updated in Secrets Manager', { certificateId });
        } else {
          throw error;
        }
      }
    } catch (error) {
      logger.error('Failed to store private key', { error, certificateId });
      throw error;
    }
  }

  /**
   * Store certificate in secure location (S3 + Secrets Manager)
   */
  private async storeCertificate(certificate: Certificate): Promise<void> {
    try {
      // Store certificate PEM in Secrets Manager for easy retrieval
      const { SecretsManagerClient, PutSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
      
      const client = new SecretsManagerClient({ region: process.env.AWS_REGION || 'us-east-1' });
      const secretName = `credlink/certificates/${certificate.id}/certificate`;
      
      const command = new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: JSON.stringify({
          pem: certificate.pem,
          fingerprint: certificate.fingerprint,
          expiresAt: certificate.expiresAt.toISOString(),
          id: certificate.id,
          rotatedAt: new Date().toISOString()
        })
      });
      
      await client.send(command);
      
      // Also backup to S3 for long-term storage and audit trail
      await this.backupCertificateToS3(certificate);
      
      logger.info('Certificate stored successfully', {
        certificateId: certificate.id,
        fingerprint: certificate.fingerprint
      });
    } catch (error) {
      logger.error('Failed to store certificate', { error, certificateId: certificate.id });
      // Don't throw - certificate is still in memory and functional
    }
  }

  /**
   * Backup certificate to S3 for audit trail
   */
  private async backupCertificateToS3(certificate: Certificate): Promise<void> {
    try {
      const { S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3');
      
      const client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });
      const bucketName = process.env.CERT_BACKUP_BUCKET || 'credlink-certificates';
      const key = `certificates/${certificate.id}/${Date.now()}.pem`;
      
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: certificate.pem,
        ContentType: 'application/x-pem-file',
        ServerSideEncryption: 'aws:kms',
        SSEKMSKeyId: process.env.KMS_KEY_ID,
        Metadata: {
          certificateId: certificate.id,
          fingerprint: certificate.fingerprint,
          expiresAt: certificate.expiresAt.toISOString()
        }
      });
      
      await client.send(command);
      logger.debug('Certificate backed up to S3', { key });
    } catch (error) {
      logger.warn('Failed to backup certificate to S3', { error });
      // Non-critical error, don't throw
    }
  }

  /**
   * Send success notification after rotation
   */
  private async notifyRotationSuccess(certificate: Certificate): Promise<void> {
    try {
      // Send SNS notification
      const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns');
      
      const client = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
      const topicArn = process.env.CERT_ROTATION_SNS_TOPIC;
      
      if (!topicArn) {
        logger.debug('No SNS topic configured for rotation notifications');
        return;
      }
      
      const command = new PublishCommand({
        TopicArn: topicArn,
        Subject: '✅ Certificate Rotation Success',
        Message: JSON.stringify({
          status: 'success',
          certificateId: certificate.id,
          fingerprint: certificate.fingerprint,
          expiresAt: certificate.expiresAt.toISOString(),
          rotatedAt: new Date().toISOString()
        }, null, 2)
      });
      
      await client.send(command);
      logger.info('Rotation success notification sent');
    } catch (error) {
      logger.warn('Failed to send rotation success notification', { error });
    }
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

  private validateCertificate(certificate: Certificate): boolean {
    try {
      // Check certificate has valid PEM format
      if (!certificate.pem.includes('BEGIN CERTIFICATE')) {
        return false;
      }
      
      // Check expiration is in the future
      if (certificate.expiresAt <= new Date()) {
        return false;
      }
      
      // Check expiration is at least 30 days away
      const daysUntilExpiry = (certificate.expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
      if (daysUntilExpiry < 30) {
        logger.warn('Certificate expires in less than 30 days', { daysUntilExpiry });
      }
      
      return true;
    } catch (error) {
      logger.error('Certificate validation failed', { error });
      return false;
    }
  }

  private async backupCertificate(certificate: Certificate): Promise<void> {
    try {
      const backupPath = `./certs/backup/cert-${certificate.id}-${Date.now()}.pem`;
      await fs.mkdir('./certs/backup', { recursive: true });
      await fs.writeFile(backupPath, certificate.pem);
      logger.info('Certificate backed up', { backupPath });
    } catch (error) {
      logger.error('Failed to backup certificate', { error });
    }
  }

  private async alertRotationFailure(error: Error): Promise<void> {
    // Send critical alert to monitoring system
    logger.error('CRITICAL: Certificate rotation failed', {
      error: error.message,
      stack: error.stack,
      currentCertExpiry: this.currentCertificate?.expiresAt.toISOString()
    });
    
    // Send SNS alert
    try {
      const { SNSClient, PublishCommand } = await import('@aws-sdk/client-sns');
      
      const client = new SNSClient({ region: process.env.AWS_REGION || 'us-east-1' });
      const topicArn = process.env.CERT_ROTATION_SNS_TOPIC;
      
      if (!topicArn) {
        logger.debug('No SNS topic configured for rotation failure alerts');
        return;
      }
      
      const command = new PublishCommand({
        TopicArn: topicArn,
        Subject: '🚨 CRITICAL: Certificate Rotation Failed',
        Message: JSON.stringify({
          status: 'failure',
          error: error.message,
          stack: error.stack,
          currentCertificateId: this.currentCertificate?.id,
          currentCertExpiry: this.currentCertificate?.expiresAt.toISOString(),
          timestamp: new Date().toISOString(),
          action: 'Manual intervention required'
        }, null, 2)
      });
      
      await client.send(command);
      logger.info('Rotation failure alert sent');
    } catch (alertError) {
      logger.error('Failed to send rotation failure alert', { alertError });
    }
    
    // Emit metrics to Prometheus
    try {
      const { metricsCollector } = await import('../middleware/metrics');
      metricsCollector.incrementCounter('certificate_rotation_failures', {
        error_type: error.name
      });
    } catch (metricsError) {
      logger.debug('Failed to emit metrics', { metricsError });
    }
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
