import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { logger } from '../logger';
import { ProofRecord } from '../proof-storage';

/**
 * S3-based Proof Storage
 * 
 * Stores C2PA proofs in AWS S3 with:
 * - Automatic encryption (AES-256)
 * - Lifecycle policies for expiration
 * - High durability (99.999999999%)
 * - Global accessibility
 */
export class S3ProofStorage {
  private s3Client: S3Client;
  private bucketName: string;
  private enabled: boolean;
  private prefix: string;

  constructor() {
    this.enabled = process.env.USE_S3_PROOF_STORAGE === 'true';
    this.bucketName = process.env.S3_PROOF_BUCKET || 'credlink-proofs';
    this.prefix = process.env.S3_PROOF_PREFIX || 'proofs/';

    if (this.enabled) {
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        // Credentials from environment or IAM role
      });
      
      logger.info('S3 proof storage initialized', {
        bucket: this.bucketName,
        region: process.env.AWS_REGION || 'us-east-1',
        prefix: this.prefix
      });
    } else {
      // Create a dummy client to avoid null checks
      this.s3Client = {} as S3Client;
    }
  }

  /**
   * Store proof in S3
   */
  async storeProof(proofRecord: ProofRecord): Promise<void> {
    if (!this.enabled) {
      return;
    }

    try {
      const key = this.getS3Key(proofRecord.proofId);
      const body = JSON.stringify(proofRecord, null, 2);

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        ServerSideEncryption: 'AES256',
        Metadata: {
          'proof-id': proofRecord.proofId,
          'image-hash': proofRecord.imageHash,
          'timestamp': proofRecord.timestamp,
          'expires-at': proofRecord.expiresAt.toString()
        },
        // Set object expiration based on proof expiration
        Expires: new Date(proofRecord.expiresAt)
      });

      await this.s3Client.send(command);

      logger.info('Proof stored in S3', {
        proofId: proofRecord.proofId,
        bucket: this.bucketName,
        key,
        size: body.length
      });
    } catch (error) {
      logger.error('Failed to store proof in S3', {
        proofId: proofRecord.proofId,
        error: (error as Error).message
      });
      throw error;
    }
  }

  /**
   * Retrieve proof from S3
   */
  async getProof(proofId: string): Promise<ProofRecord | null> {
    if (!this.enabled) {
      return null;
    }

    try {
      const key = this.getS3Key(proofId);

      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      const response = await this.s3Client.send(command);

      if (!response.Body) {
        return null;
      }

      // Convert stream to string
      const bodyString = await response.Body.transformToString();
      const proofRecord = JSON.parse(bodyString) as ProofRecord;

      logger.info('Proof retrieved from S3', {
        proofId,
        bucket: this.bucketName,
        key
      });

      return proofRecord;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        logger.warn('Proof not found in S3', { proofId });
        return null;
      }

      logger.error('Failed to retrieve proof from S3', {
        proofId,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Check if proof exists in S3
   */
  async proofExists(proofId: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const key = this.getS3Key(proofId);

      const command = new HeadObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.s3Client.send(command);
      return true;
    } catch (error: any) {
      if (error.name === 'NotFound') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete proof from S3
   */
  async deleteProof(proofId: string): Promise<boolean> {
    if (!this.enabled) {
      return false;
    }

    try {
      const key = this.getS3Key(proofId);

      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key
      });

      await this.s3Client.send(command);

      logger.info('Proof deleted from S3', {
        proofId,
        bucket: this.bucketName,
        key
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete proof from S3', {
        proofId,
        error: (error as Error).message
      });
      return false;
    }
  }

  /**
   * Generate S3 key for proof
   */
  private getS3Key(proofId: string): string {
    // Organize by date for better S3 performance
    const date = new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${this.prefix}${year}/${month}/${day}/${proofId}.json`;
  }

  /**
   * Get storage statistics
   */
  getStats(): { enabled: boolean; bucket: string; prefix: string } {
    return {
      enabled: this.enabled,
      bucket: this.bucketName,
      prefix: this.prefix
    };
  }
}
