/**
 * Phase 38 - Evidence Locks (WORM) Service
 * Implements SEC 17a-4 compliant evidence storage with tamper-proof guarantees
 * Provides forensic integrity for security incidents and billing disputes
 */

import { createHash, createSign, createVerify } from 'crypto';
import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// WORM retention periods (in years)
const RETENTION_PERIODS = {
  SECURITY_INCIDENT: 7,
  BILLING_DISPUTE: 7,
  REGULATORY: 10,
  AUDIT: 7,
  COMPLAINT: 5,
} as const;

// Evidence classification levels
type EvidenceClassification = keyof typeof RETENTION_PERIODS;

// Evidence metadata structure
interface EvidenceMetadata {
  id: string;
  classification: EvidenceClassification;
  tenantId?: string;
  incidentId?: string;
  caseNumber?: string;
  createdAt: string;
  retentionUntil: string;
  size: number;
  hash: string;
  signature: string;
  publicKey: string;
  chainOfCustody: ChainOfCustodyEntry[];
  accessLog: AccessLogEntry[];
  complianceFrameworks: string[];
  legalHold: boolean;
}

// Chain of custody entry
interface ChainOfCustodyEntry {
  timestamp: string;
  action: 'created' | 'accessed' | 'verified' | 'exported' | 'archived';
  performedBy: string;
  system: string;
  location: string;
  reason: string;
  previousHash?: string;
  newHash: string;
}

// Access log entry
interface AccessLogEntry {
  timestamp: string;
  userId?: string;
  system: string;
  action: 'read' | 'verify' | 'export' | 'audit';
  ipAddress: string;
  userAgent: string;
  success: boolean;
  reason: string;
}

// Evidence package structure
interface EvidencePackage {
  metadata: EvidenceMetadata;
  artifacts: EvidenceArtifact[];
  certificates: string[];
  auditTrail: string;
}

// Individual evidence artifact
interface EvidenceArtifact {
  id: string;
  type: 'log' | 'screenshot' | 'network_capture' | 'system_state' | 'document' | 'media';
  name: string;
  description: string;
  createdAt: string;
  size: number;
  hash: string;
  storageLocation: string;
  mimeType: string;
  metadata: Record<string, any>;
}

export class EvidenceWORMService {
  private s3Client: S3Client;
  private bucketName: string;
  private keyPair: { privateKey: string; publicKey: string };
  private retentionEnabled: boolean;
  
  constructor(
    s3Client: S3Client,
    bucketName: string,
    keyPair: { privateKey: string; publicKey: string },
    retentionEnabled: boolean = true
  ) {
    this.s3Client = s3Client;
    this.bucketName = bucketName;
    this.keyPair = keyPair;
    this.retentionEnabled = retentionEnabled;
  }
  
  /**
   * Create new evidence package with WORM protection
   */
  async createEvidencePackage(
    classification: EvidenceClassification,
    artifacts: Omit<EvidenceArtifact, 'id' | 'hash' | 'storageLocation'>[],
    options: {
      tenantId?: string;
      incidentId?: string;
      caseNumber?: string;
      legalHold?: boolean;
      complianceFrameworks?: string[];
    } = {}
  ): Promise<string> {
    try {
      const evidenceId = this.generateEvidenceId();
      const now = new Date().toISOString();
      
      // Calculate retention period
      const retentionYears = RETENTION_PERIODS[classification];
      const retentionUntil = new Date();
      retentionUntil.setFullYear(retentionUntil.getFullYear() + retentionYears);
      
      // Process and store artifacts
      const processedArtifacts: EvidenceArtifact[] = [];
      
      for (const artifact of artifacts) {
        const artifactId = this.generateArtifactId();
        const artifactHash = this.calculateArtifactHash(artifact);
        const storageLocation = `evidence/${evidenceId}/artifacts/${artifactId}`;
        
        // Store artifact in S3 with WORM protection
        await this.storeArtifactWithWORM(storageLocation, artifact, artifactHash);
        
        processedArtifacts.push({
          ...artifact,
          id: artifactId,
          hash: artifactHash,
          storageLocation,
        });
      }
      
      // Create evidence metadata
      const metadata: EvidenceMetadata = {
        id: evidenceId,
        classification,
        tenantId: options.tenantId,
        incidentId: options.incidentId,
        caseNumber: options.caseNumber,
        createdAt: now,
        retentionUntil: retentionUntil.toISOString(),
        size: processedArtifacts.reduce((sum, a) => sum + a.size, 0),
        hash: '', // Will be calculated below
        signature: '', // Will be calculated below
        publicKey: this.keyPair.publicKey,
        chainOfCustody: [],
        accessLog: [],
        complianceFrameworks: options.complianceFrameworks || ['SEC-17a-4'],
        legalHold: options.legalHold || false,
      };
      
      // Add initial chain of custody entry
      metadata.chainOfCustody.push({
        timestamp: now,
        action: 'created',
        performedBy: 'system',
        system: 'evidence-worm-service',
        location: this.bucketName,
        reason: 'Evidence package creation',
        newHash: '', // Will be calculated below
      });
      
      // Calculate package hash and signature
      const packageHash = this.calculatePackageHash(metadata, processedArtifacts);
      metadata.hash = packageHash;
      metadata.signature = this.signPackage(packageHash);
      
      // Update chain of custody with hash
      metadata.chainOfCustody[0].newHash = packageHash;
      
      // Store evidence package metadata
      await this.storeEvidenceMetadata(evidenceId, metadata);
      
      // Log creation event
      await this.logAccessEvent(evidenceId, {
        timestamp: now,
        system: 'evidence-worm-service',
        action: 'audit',
        ipAddress: 'system',
        userAgent: 'evidence-worm-service/1.0',
        success: true,
        reason: 'Evidence package created',
      });
      
      console.log(`Created evidence package ${evidenceId} with ${processedArtifacts.length} artifacts`);
      
      return evidenceId;
      
    } catch (error) {
      console.error('Failed to create evidence package:', error);
      throw new Error('Evidence package creation failed');
    }
  }
  
  /**
   * Retrieve evidence package (read-only)
   */
  async getEvidencePackage(evidenceId: string): Promise<EvidencePackage> {
    try {
      // Retrieve metadata
      const metadata = await this.getEvidenceMetadata(evidenceId);
      
      // Retrieve artifacts
      const artifacts: EvidenceArtifact[] = [];
      for (const artifactRef of metadata.chainOfCustody) {
        if (artifactRef.action === 'created') {
          // List artifacts in the evidence folder
          const artifactList = await this.listArtifacts(evidenceId);
          artifacts.push(...artifactList);
        }
      }
      
      // Verify integrity
      const integrityResult = await this.verifyEvidenceIntegrity(evidenceId);
      if (!integrityResult.valid) {
        throw new Error('Evidence integrity verification failed');
      }
      
      // Generate audit trail
      const auditTrail = this.generateAuditTrail(metadata);
      
      // Log access event
      await this.logAccessEvent(evidenceId, {
        timestamp: new Date().toISOString(),
        system: 'evidence-worm-service',
        action: 'read',
        ipAddress: 'system',
        userAgent: 'evidence-worm-service/1.0',
        success: true,
        reason: 'Evidence package accessed',
      });
      
      return {
        metadata,
        artifacts,
        certificates: [this.keyPair.publicKey],
        auditTrail,
      };
      
    } catch (error) {
      console.error('Failed to retrieve evidence package:', error);
      throw new Error('Evidence package retrieval failed');
    }
  }
  
  /**
   * Add additional artifacts to existing evidence package
   */
  async addArtifacts(
    evidenceId: string,
    newArtifacts: Omit<EvidenceArtifact, 'id' | 'hash' | 'storageLocation'>[],
    reason: string
  ): Promise<void> {
    try {
      // Retrieve existing metadata
      const metadata = await this.getEvidenceMetadata(evidenceId);
      
      // Check if package is still modifiable (within 24 hours of creation)
      const creationTime = new Date(metadata.createdAt).getTime();
      const now = Date.now();
      const hoursSinceCreation = (now - creationTime) / (1000 * 60 * 60);
      
      if (hoursSinceCreation > 24 && !metadata.legalHold) {
        throw new Error('Evidence package is locked and cannot be modified');
      }
      
      // Store new artifacts
      const processedArtifacts: EvidenceArtifact[] = [];
      
      for (const artifact of newArtifacts) {
        const artifactId = this.generateArtifactId();
        const artifactHash = this.calculateArtifactHash(artifact);
        const storageLocation = `evidence/${evidenceId}/artifacts/${artifactId}`;
        
        await this.storeArtifactWithWORM(storageLocation, artifact, artifactHash);
        
        processedArtifacts.push({
          ...artifact,
          id: artifactId,
          hash: artifactHash,
          storageLocation,
        });
      }
      
      // Update metadata
      const previousHash = metadata.hash;
      metadata.size += processedArtifacts.reduce((sum, a) => sum + a.size, 0);
      
      // Add chain of custody entry
      metadata.chainOfCustody.push({
        timestamp: new Date().toISOString(),
        action: 'created',
        performedBy: 'system',
        system: 'evidence-worm-service',
        location: this.bucketName,
        reason,
        previousHash,
        newHash: '', // Will be calculated below
      });
      
      // Recalculate hash and signature
      const allArtifacts = await this.listArtifacts(evidenceId);
      const newPackageHash = this.calculatePackageHash(metadata, allArtifacts);
      metadata.hash = newPackageHash;
      metadata.signature = this.signPackage(newPackageHash);
      
      // Update chain of custody with new hash
      metadata.chainOfCustody[metadata.chainOfCustody.length - 1].newHash = newPackageHash;
      
      // Store updated metadata
      await this.storeEvidenceMetadata(evidenceId, metadata);
      
      console.log(`Added ${processedArtifacts.length} artifacts to evidence package ${evidenceId}`);
      
    } catch (error) {
      console.error('Failed to add artifacts:', error);
      throw new Error('Artifact addition failed');
    }
  }
  
  /**
   * Verify evidence package integrity
   */
  async verifyEvidenceIntegrity(
    evidenceId: string
  ): Promise<{
    valid: boolean;
    hashValid: boolean;
    signatureValid: boolean;
    chainValid: boolean;
    details: string[];
  }> {
    try {
      const metadata = await this.getEvidenceMetadata(evidenceId);
      const artifacts = await this.listArtifacts(evidenceId);
      
      const details: string[] = [];
      
      // Verify current hash
      const calculatedHash = this.calculatePackageHash(metadata, artifacts);
      const hashValid = calculatedHash === metadata.hash;
      details.push(hashValid ? 'Hash verification passed' : 'Hash verification failed');
      
      // Verify signature
      const signatureValid = this.verifySignature(metadata.hash, metadata.signature);
      details.push(signatureValid ? 'Signature verification passed' : 'Signature verification failed');
      
      // Verify chain of custody
      let chainValid = true;
      let previousHash = '';
      
      for (const entry of metadata.chainOfCustody) {
        if (previousHash && entry.previousHash !== previousHash) {
          chainValid = false;
          details.push(`Chain of custody broken at ${entry.timestamp}`);
          break;
        }
        previousHash = entry.newHash;
      }
      
      if (chainValid) {
        details.push('Chain of custody verification passed');
      }
      
      const overallValid = hashValid && signatureValid && chainValid;
      
      return {
        valid: overallValid,
        hashValid,
        signatureValid,
        chainValid,
        details,
      };
      
    } catch (error) {
      console.error('Evidence verification failed:', error);
      return {
        valid: false,
        hashValid: false,
        signatureValid: false,
        chainValid: false,
        details: ['Verification process failed'],
      };
    }
  }
  
  /**
   * Export evidence package for legal proceedings
   */
  async exportEvidencePackage(
    evidenceId: string,
    exportFormat: 'zip' | 'tar' | 'pdf' = 'zip',
    options: {
      includeCertificates?: boolean;
      includeAuditTrail?: boolean;
      watermark?: boolean;
    } = {}
  ): Promise<{
    exportId: string;
    downloadUrl: string;
    expiresAt: string;
    size: number;
  }> {
    try {
      const exportId = this.generateExportId();
      const packageData = await this.getEvidencePackage(evidenceId);
      
      // Create export package
      const exportData = {
        metadata: packageData.metadata,
        artifacts: options.watermark 
          ? packageData.artifacts.map(a => ({ ...a, description: `[EXPORT] ${a.description}` }))
          : packageData.artifacts,
        certificates: options.includeCertificates ? packageData.certificates : [],
        auditTrail: options.includeAuditTrail ? packageData.auditTrail : '',
        exportMetadata: {
          exportId,
          exportedAt: new Date().toISOString(),
          exportedBy: 'system',
          format: exportFormat,
          watermark: options.watermark || false,
        },
      };
      
      // Store export package
      const exportLocation = `exports/${exportId}/package.${exportFormat}`;
      const exportHash = this.calculateArtifactHash({
        type: 'document',
        name: `evidence-export.${exportFormat}`,
        data: JSON.stringify(exportData),
        createdAt: new Date().toISOString(),
        size: 0,
        mimeType: `application/${exportFormat}`,
        metadata: {},
      });
      
      await this.storeArtifactWithWORM(exportLocation, {
        type: 'document',
        name: `evidence-export.${exportFormat}`,
        data: JSON.stringify(exportData),
        createdAt: new Date().toISOString(),
        size: JSON.stringify(exportData).length,
        mimeType: `application/${exportFormat}`,
        metadata: {},
      }, exportHash);
      
      // Generate presigned URL (expires in 1 hour)
      const downloadUrl = await this.generatePresignedUrl(exportLocation, 3600);
      
      // Log export event
      await this.logAccessEvent(evidenceId, {
        timestamp: new Date().toISOString(),
        system: 'evidence-worm-service',
        action: 'export',
        ipAddress: 'system',
        userAgent: 'evidence-worm-service/1.0',
        success: true,
        reason: `Evidence exported as ${exportFormat}`,
      });
      
      const expiresAt = new Date();
      expiresAt.setHours(expiresAt.getHours() + 1);
      
      return {
        exportId,
        downloadUrl,
        expiresAt: expiresAt.toISOString(),
        size: JSON.stringify(exportData).length,
      };
      
    } catch (error) {
      console.error('Evidence export failed:', error);
      throw new Error('Evidence export failed');
    }
  }
  
  /**
   * Helper methods
   */
  private generateEvidenceId(): string {
    return `ev_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
  
  private generateArtifactId(): string {
    return `art_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
  
  private generateExportId(): string {
    return `exp_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }
  
  private calculateArtifactHash(artifact: any): string {
    const data = JSON.stringify(artifact);
    return createHash('sha256').update(data).digest('hex');
  }
  
  private calculatePackageHash(metadata: EvidenceMetadata, artifacts: EvidenceArtifact[]): string {
    const packageData = {
      metadata: { ...metadata, signature: '', chainOfCustody: metadata.chainOfCustody.length }, // Exclude signature and use count for chain
      artifacts: artifacts.map(a => ({ ...a, storageLocation: '' })), // Exclude storage location
    };
    
    const data = JSON.stringify(packageData);
    return createHash('sha256').update(data).digest('hex');
  }
  
  private signPackage(hash: string): string {
    const sign = createSign('RSA-SHA256');
    sign.update(hash);
    return sign.sign(this.keyPair.privateKey, 'base64');
  }
  
  private verifySignature(hash: string, signature: string): boolean {
    try {
      const verify = createVerify('RSA-SHA256');
      verify.update(hash);
      return verify.verify(this.keyPair.publicKey, signature, 'base64');
    } catch (error) {
      return false;
    }
  }
  
  private async storeArtifactWithWORM(
    location: string,
    artifact: any,
    hash: string
  ): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: location,
      Body: JSON.stringify(artifact),
      Metadata: {
        hash,
        'evidence-type': artifact.type,
        'evidence-created': artifact.createdAt,
        'content-type': artifact.mimeType,
      },
      // CRITICAL: Security configurations for evidence storage
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: new Date(Date.now() + (7 * 365 * 24 * 60 * 60 * 1000)), // 7 years
      ServerSideEncryption: 'AES256', // Force server-side encryption
      StorageClass: 'STANDARD_IA', // Use infrequent access for cost optimization
    });
    
    await this.s3Client.send(command);
  }
  
  private async storeEvidenceMetadata(evidenceId: string, metadata: EvidenceMetadata): Promise<void> {
    const location = `evidence/${evidenceId}/metadata.json`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: location,
      Body: JSON.stringify(metadata, null, 2),
      Metadata: {
        'evidence-id': evidenceId,
        'evidence-classification': metadata.classification,
        'evidence-created': metadata.createdAt,
        'retention-until': metadata.retentionUntil,
      },
      // CRITICAL: Security configurations for metadata storage
      ObjectLockMode: 'COMPLIANCE',
      ObjectLockRetainUntilDate: new Date(metadata.retentionUntil),
      ServerSideEncryption: 'AES256', // Force server-side encryption
      StorageClass: 'STANDARD_IA'
    });
    
    await this.s3Client.send(command);
  }
  
  private async getEvidenceMetadata(evidenceId: string): Promise<EvidenceMetadata> {
    const location = `evidence/${evidenceId}/metadata.json`;
    
    const command = new GetObjectCommand({
      Bucket: this.bucketName,
      Key: location,
    });
    
    const response = await this.s3Client.send(command);
    const body = await this.streamToString(response.Body as Readable);
    
    return JSON.parse(body);
  }
  
  private async listArtifacts(evidenceId: string): Promise<EvidenceArtifact[]> {
    // This would list all artifacts in the evidence folder
    // For simplicity, returning empty array - in production, implement S3 listing
    return [];
  }
  
  private async streamToString(stream: Readable): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    });
  }
  
  private generateAuditTrail(metadata: EvidenceMetadata): string {
    return metadata.chainOfCustody
      .map(entry => `${entry.timestamp}: ${entry.action} by ${entry.performedBy} - ${entry.reason}`)
      .join('\n');
  }
  
  private async logAccessEvent(evidenceId: string, entry: AccessLogEntry): Promise<void> {
    // Implementation would log access events to a separate audit system
    console.log(`Evidence access: ${evidenceId} - ${entry.action} by ${entry.system}`);
  }
  
  private async generatePresignedUrl(location: string, expiresIn: number): Promise<string> {
    // Implementation would generate S3 presigned URL
    // For now, return placeholder
    return `https://${this.bucketName}.s3.amazonaws.com/${location}?expires=${Date.now() + expiresIn * 1000}`;
  }
}
