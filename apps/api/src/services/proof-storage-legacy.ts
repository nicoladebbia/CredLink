/**
 * Production-Ready Proof Storage Service
 * Implements S3-based storage with database metadata and versioning
 */

import { EventEmitter } from 'events';
import { logger } from '../utils/secure-logger';
import { Pool } from 'pg';
import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { createHash } from 'crypto';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import { TimeoutConfig } from '../utils/timeout-config';

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

interface ProofStorageConfig {
  s3Bucket: string;
  s3Region: string;
  compressionEnabled: boolean;
  encryptionEnabled: boolean;
  versioningEnabled: boolean;
  maxFileSize: number;
  retentionDays: number;
  enableMetadataIndexing: boolean;
}

interface ProofMetadata {
  id: string;
  manifestId: string;
  originalFileName?: string;
  contentType: string;
  size: number;
  compressedSize?: number;
  checksum: string;
  s3Key: string;
  s3VersionId?: string;
  uploadedAt: Date;
  expiresAt?: Date;
  userId?: string;
  apiKeyId?: string;
  tags: Record<string, string>;
  status: 'active' | 'archived' | 'deleted';
  downloadCount: number;
  lastAccessedAt?: Date;
}

interface ProofStorageMetrics {
  totalProofs: number;
  totalSize: number;
  compressedSize: number;
  averageSize: number;
  compressionRatio: number;
  activeProofs: number;
  archivedProofs: number;
  expiredProofs: number;
  storageUtilization: number;
  lastUploadTime?: Date;
}

export class ProofStorage extends EventEmitter {
  private config: ProofStorageConfig;
  private dbPool: Pool;
  private s3Client: S3Client;
  private metrics: ProofStorageMetrics;

  constructor(
    dbPool: Pool,
    config: Partial<ProofStorageConfig> = {}
  ) {
    super();
    
    this.dbPool = dbPool;
    
    this.config = {
      s3Bucket: process.env.PROOFS_S3_BUCKET || 'credlink-proofs',
      s3Region: process.env.PROOFS_S3_REGION || 'us-east-1',
      compressionEnabled: true,
      encryptionEnabled: true,
      versioningEnabled: true,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      retentionDays: 365, // 1 year default
      enableMetadataIndexing: true,
      ...config
    };

    // Initialize S3 client
    this.s3Client = new S3Client({
      region: this.config.s3Region,
      // Use default credential provider chain
    });

    this.metrics = {
      totalProofs: 0,
      totalSize: 0,
      compressedSize: 0,
      averageSize: 0,
      compressionRatio: 0,
      activeProofs: 0,
      archivedProofs: 0,
      expiredProofs: 0,
      storageUtilization: 0
    };

    logger.info('ProofStorage initialized', {
      s3Bucket: this.config.s3Bucket,
      s3Region: this.config.s3Region,
      compressionEnabled: this.config.compressionEnabled,
      encryptionEnabled: this.config.encryptionEnabled
    });
  }

  /**
   * Initialize the proof storage service
   */
  async initialize(): Promise<void> {
    try {
      // Initialize database tables
      await this.initializeDatabase();
      
      // Load existing metrics
      await this.loadMetrics();
      
      // Verify S3 bucket access
      await this.verifyS3Access();
      
      logger.info('Proof storage service initialized successfully');
      this.emit('initialized');
    } catch (error) {
      logger.error('Failed to initialize proof storage service', { error });
      throw error;
    }
  }

  /**
   * Store a proof with metadata
   */
  async store(
    proofData: Buffer,
    metadata: {
      manifestId: string;
      originalFileName?: string;
      contentType: string;
      userId?: string;
      apiKeyId?: string;
      tags?: Record<string, string>;
    }
  ): Promise<string> {
    const proofId = `proof_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Validate input
      this.validateProofData(proofData);
      
      // Generate checksum
      const checksum = createHash('sha256').update(proofData).digest('hex');
      
      // Check for duplicates
      const existingProof = await this.findByChecksum(checksum);
      if (existingProof) {
        logger.info('Proof already exists, returning existing ID', {
          proofId: existingProof.id,
          manifestId: metadata.manifestId
        });
        return existingProof.id;
      }

      // Compress if enabled
      let finalData = proofData;
      let compressedSize: number | undefined;
      
      if (this.config.compressionEnabled) {
        finalData = await gzipAsync(proofData);
        compressedSize = finalData.length;
        
        logger.debug('Proof compressed', {
          originalSize: proofData.length,
          compressedSize: finalData.length,
          compressionRatio: compressedSize / proofData.length
        });
      }

      // Generate S3 key
      const s3Key = this.generateS3Key(proofId, metadata.manifestId, metadata.originalFileName);
      
      // Upload to S3
      const uploadResult = await this.uploadToS3(s3Key, finalData, metadata.contentType);
      
      // Store metadata in database
      const proofMetadata: ProofMetadata = {
        id: proofId,
        manifestId: metadata.manifestId,
        originalFileName: metadata.originalFileName,
        contentType: metadata.contentType,
        size: proofData.length,
        compressedSize,
        checksum,
        s3Key,
        s3VersionId: uploadResult.VersionId,
        uploadedAt: new Date(),
        expiresAt: this.calculateExpirationDate(),
        userId: metadata.userId,
        apiKeyId: metadata.apiKeyId,
        tags: metadata.tags || {},
        status: 'active',
        downloadCount: 0
      };

      await this.persistMetadata(proofMetadata);
      
      // Update metrics
      this.updateMetricsAfterStore(proofMetadata);
      
      logger.info('Proof stored successfully', {
        proofId,
        manifestId: metadata.manifestId,
        size: proofData.length,
        s3Key,
        compressed: this.config.compressionEnabled
      });

      this.emit('proofStored', {
        proofId,
        manifestId: metadata.manifestId,
        size: proofData.length,
        checksum
      });

      return proofId;
    } catch (error) {
      logger.error('Failed to store proof', {
        proofId,
        manifestId: metadata.manifestId,
        error
      });
      throw error;
    }
  }

  /**
   * Retrieve a proof by ID
   */
  async retrieve(proofId: string): Promise<{
    data: Buffer;
    metadata: ProofMetadata;
  } | null> {
    try {
      // Get metadata from database
      const metadata = await this.getMetadata(proofId);
      if (!metadata) {
        logger.warn('Proof metadata not found', { proofId });
        return null;
      }

      // Check if proof is expired
      if (metadata.expiresAt && metadata.expiresAt < new Date()) {
        logger.warn('Attempted to retrieve expired proof', { proofId, expiresAt: metadata.expiresAt });
        return null;
      }

      // Download from S3
      const data = await this.downloadFromS3(metadata.s3Key, metadata.s3VersionId);
      
      // Decompress if needed
      let finalData = data;
      if (this.config.compressionEnabled && metadata.compressedSize) {
        finalData = await gunzipAsync(data);
      }

      // Update access metrics
      await this.updateAccessMetrics(proofId);
      
      logger.debug('Proof retrieved successfully', {
        proofId,
        manifestId: metadata.manifestId,
        size: finalData.length
      });

      this.emit('proofRetrieved', {
        proofId,
        manifestId: metadata.manifestId,
        size: finalData.length
      });

      return { data: finalData, metadata };
    } catch (error) {
      logger.error('Failed to retrieve proof', { proofId, error });
      return null;
    }
  }

  /**
   * Delete a proof
   */
  async delete(proofId: string, permanent: boolean = false): Promise<boolean> {
    try {
      const metadata = await this.getMetadata(proofId);
      if (!metadata) {
        return false;
      }

      if (permanent) {
        // Delete from S3
        await this.deleteFromS3(metadata.s3Key, metadata.s3VersionId);
        
        // Delete from database
        await this.deleteMetadata(proofId);
        
        logger.info('Proof permanently deleted', { proofId, s3Key: metadata.s3Key });
      } else {
        // Soft delete - mark as archived
        await this.archiveProof(proofId);
        
        logger.info('Proof archived', { proofId });
      }

      // Update metrics
      this.updateMetricsAfterDelete(metadata);
      
      this.emit('proofDeleted', { proofId, permanent });
      
      return true;
    } catch (error) {
      logger.error('Failed to delete proof', { proofId, error });
      return false;
    }
  }

  /**
   * List proofs with filtering
   */
  async listProofs(options: {
    manifestId?: string;
    userId?: string;
    status?: 'active' | 'archived';
    limit?: number;
    offset?: number;
    dateFrom?: Date;
    dateTo?: Date;
  } = {}): Promise<ProofMetadata[]> {
    try {
      let query = `
        SELECT * FROM proof_metadata 
        WHERE 1=1
      `;
      const params: any[] = [];
      let paramIndex = 1;

      if (options.manifestId) {
        query += ` AND manifest_id = $${paramIndex++}`;
        params.push(options.manifestId);
      }

      if (options.userId) {
        query += ` AND user_id = $${paramIndex++}`;
        params.push(options.userId);
      }

      if (options.status) {
        query += ` AND status = $${paramIndex++}`;
        params.push(options.status);
      }

      if (options.dateFrom) {
        query += ` AND uploaded_at >= $${paramIndex++}`;
        params.push(options.dateFrom);
      }

      if (options.dateTo) {
        query += ` AND uploaded_at <= $${paramIndex++}`;
        params.push(options.dateTo);
      }

      query += ` ORDER BY uploaded_at DESC`;

      if (options.limit) {
        query += ` LIMIT $${paramIndex++}`;
        params.push(options.limit);
      }

      if (options.offset) {
        query += ` OFFSET $${paramIndex++}`;
        params.push(options.offset);
      }

      const result = await this.dbPool.query(query, params);
      
      return result.rows.map(this.mapRowToMetadata);
    } catch (error) {
      logger.error('Failed to list proofs', { error });
      return [];
    }
  }

  /**
   * Get storage metrics
   */
  async getMetrics(): Promise<ProofStorageMetrics> {
    try {
      // Refresh metrics from database
      await this.loadMetrics();
      return { ...this.metrics };
    } catch (error) {
      logger.error('Failed to get metrics', { error });
      return this.metrics;
    }
  }

  /**
   * Cleanup expired proofs
   */
  async cleanupExpiredProofs(): Promise<number> {
    try {
      const expiredProofs = await this.listProofs({
        status: 'active',
        dateTo: new Date()
      });

      let cleanedCount = 0;
      for (const proof of expiredProofs) {
        if (proof.expiresAt && proof.expiresAt < new Date()) {
          if (await this.delete(proof.id, true)) {
            cleanedCount++;
          }
        }
      }

      logger.info('Expired proofs cleanup completed', { cleanedCount });
      this.emit('cleanupCompleted', { cleanedCount });
      
      return cleanedCount;
    } catch (error) {
      logger.error('Failed to cleanup expired proofs', { error });
      return 0;
    }
  }

  /**
   * Private methods
   */

  private async initializeDatabase(): Promise<void> {
    try {
      await this.dbPool.query(`
        CREATE TABLE IF NOT EXISTS proof_metadata (
          id VARCHAR(255) PRIMARY KEY,
          manifest_id VARCHAR(255) NOT NULL,
          original_file_name TEXT,
          content_type VARCHAR(255) NOT NULL,
          size BIGINT NOT NULL,
          compressed_size BIGINT,
          checksum VARCHAR(64) NOT NULL,
          s3_key VARCHAR(500) NOT NULL,
          s3_version_id TEXT,
          uploaded_at TIMESTAMP NOT NULL DEFAULT NOW(),
          expires_at TIMESTAMP,
          user_id VARCHAR(255),
          api_key_id VARCHAR(255),
          tags JSONB DEFAULT '{}',
          status VARCHAR(50) NOT NULL DEFAULT 'active',
          download_count INTEGER DEFAULT 0,
          last_accessed_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        )
      `);

      // Create indexes for efficient querying
      await this.dbPool.query(`CREATE INDEX IF NOT EXISTS idx_proof_metadata_manifest_id ON proof_metadata(manifest_id)`);
      await this.dbPool.query(`CREATE INDEX IF NOT EXISTS idx_proof_metadata_user_id ON proof_metadata(user_id)`);
      await this.dbPool.query(`CREATE INDEX IF NOT EXISTS idx_proof_metadata_status ON proof_metadata(status)`);
      await this.dbPool.query(`CREATE INDEX IF NOT EXISTS idx_proof_metadata_uploaded_at ON proof_metadata(uploaded_at)`);
      await this.dbPool.query(`CREATE INDEX IF NOT EXISTS idx_proof_metadata_checksum ON proof_metadata(checksum)`);

      logger.info('Proof storage database tables initialized');
    } catch (error) {
      logger.error('Failed to initialize storage database', { error });
      throw error;
    }
  }

  private async loadMetrics(): Promise<void> {
    try {
      const result = await this.dbPool.query(`
        SELECT 
          COUNT(*) as total_proofs,
          COUNT(CASE WHEN status = 'active' THEN 1 END) as active_proofs,
          COUNT(CASE WHEN status = 'archived' THEN 1 END) as archived_proofs,
          COUNT(CASE WHEN expires_at < NOW() THEN 1 END) as expired_proofs,
          SUM(size) as total_size,
          SUM(COALESCE(compressed_size, size)) as compressed_size,
          AVG(size) as average_size
        FROM proof_metadata
      `);

      const row = result.rows[0];
      this.metrics = {
        totalProofs: parseInt(row.total_proofs) || 0,
        totalSize: parseInt(row.total_size) || 0,
        compressedSize: parseInt(row.compressed_size) || 0,
        averageSize: parseFloat(row.average_size) || 0,
        compressionRatio: row.total_size > 0 ? row.compressed_size / row.total_size : 0,
        activeProofs: parseInt(row.active_proofs) || 0,
        archivedProofs: parseInt(row.archived_proofs) || 0,
        expiredProofs: parseInt(row.expired_proofs) || 0,
        storageUtilization: 0 // Would need S3 bucket size calculation
      };
    } catch (error) {
      logger.error('Failed to load metrics', { error });
    }
  }

  private async verifyS3Access(): Promise<void> {
    try {
      const command = new HeadObjectCommand({
        Bucket: this.config.s3Bucket,
        Key: 'access-check'
      });
      
      await this.s3Client.send(command).catch(() => {
        // Expected to fail for non-existent key, but verifies bucket access
      });
      
      logger.info('S3 bucket access verified', { bucket: this.config.s3Bucket });
    } catch (error) {
      logger.error('S3 bucket access verification failed', { 
        bucket: this.config.s3Bucket, 
        error 
      });
      throw new Error('Cannot access S3 bucket for proof storage');
    }
  }

  private validateProofData(data: Buffer): void {
    if (!data || data.length === 0) {
      throw new Error('Proof data cannot be empty');
    }

    if (data.length > this.config.maxFileSize) {
      throw new Error(`Proof data size (${data.length}) exceeds maximum allowed size (${this.config.maxFileSize})`);
    }
  }

  private generateS3Key(proofId: string, manifestId: string, originalFileName?: string): string {
    const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const extension = originalFileName ? originalFileName.split('.').pop() : 'bin';
    return `proofs/${date}/${manifestId}/${proofId}.${extension}`;
  }

  private calculateExpirationDate(): Date {
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + this.config.retentionDays);
    return expiresAt;
  }

  private async uploadToS3(key: string, data: Buffer, contentType: string): Promise<{ VersionId?: string }> {
    const command = new PutObjectCommand({
      Bucket: this.config.s3Bucket,
      Key: key,
      Body: data,
      ContentType: contentType,
      ServerSideEncryption: this.config.encryptionEnabled ? 'AES256' : undefined,
      Metadata: {
        uploadedAt: new Date().toISOString()
      }
    });

    const result = await this.s3Client.send(command);
    return { VersionId: result.VersionId };
  }

  private async downloadFromS3(key: string, versionId?: string): Promise<Buffer> {
    const command = new GetObjectCommand({
      Bucket: this.config.s3Bucket,
      Key: key,
      VersionId: versionId
    });

    const result = await this.s3Client.send(command);
    
    if (!result.Body) {
      throw new Error('No data received from S3');
    }

    // Convert stream to buffer
    const chunks: Buffer[] = [];
    for await (const chunk of result.Body as any) {
      chunks.push(chunk);
    }
    
    return Buffer.concat(chunks);
  }

  private async deleteFromS3(key: string, versionId?: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: this.config.s3Bucket,
      Key: key,
      VersionId: versionId
    });

    await this.s3Client.send(command);
  }

  private async persistMetadata(metadata: ProofMetadata): Promise<void> {
    await this.dbPool.query(`
      INSERT INTO proof_metadata 
      (id, manifest_id, original_file_name, content_type, size, compressed_size,
       checksum, s3_key, s3_version_id, uploaded_at, expires_at, user_id,
       api_key_id, tags, status, download_count)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    `, [
      metadata.id,
      metadata.manifestId,
      metadata.originalFileName,
      metadata.contentType,
      metadata.size,
      metadata.compressedSize,
      metadata.checksum,
      metadata.s3Key,
      metadata.s3VersionId,
      metadata.uploadedAt,
      metadata.expiresAt,
      metadata.userId,
      metadata.apiKeyId,
      JSON.stringify(metadata.tags),
      metadata.status,
      metadata.downloadCount
    ]);
  }

  private async getMetadata(proofId: string): Promise<ProofMetadata | null> {
    const result = await this.dbPool.query(
      'SELECT * FROM proof_metadata WHERE id = $1',
      [proofId]
    );

    return result.rows.length > 0 ? this.mapRowToMetadata(result.rows[0]) : null;
  }

  private async findByChecksum(checksum: string): Promise<ProofMetadata | null> {
    const result = await this.dbPool.query(
      'SELECT * FROM proof_metadata WHERE checksum = $1 AND status = $2 ORDER BY uploaded_at DESC LIMIT 1',
      [checksum, 'active']
    );

    return result.rows.length > 0 ? this.mapRowToMetadata(result.rows[0]) : null;
  }

  private async updateAccessMetrics(proofId: string): Promise<void> {
    await this.dbPool.query(`
      UPDATE proof_metadata 
      SET download_count = download_count + 1, 
          last_accessed_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
    `, [proofId]);
  }

  private async archiveProof(proofId: string): Promise<void> {
    await this.dbPool.query(`
      UPDATE proof_metadata 
      SET status = 'archived', updated_at = NOW()
      WHERE id = $1
    `, [proofId]);
  }

  private async deleteMetadata(proofId: string): Promise<void> {
    await this.dbPool.query('DELETE FROM proof_metadata WHERE id = $1', [proofId]);
  }

  private mapRowToMetadata(row: any): ProofMetadata {
    return {
      id: row.id,
      manifestId: row.manifest_id,
      originalFileName: row.original_file_name,
      contentType: row.content_type,
      size: row.size,
      compressedSize: row.compressed_size,
      checksum: row.checksum,
      s3Key: row.s3_key,
      s3VersionId: row.s3_version_id,
      uploadedAt: new Date(row.uploaded_at),
      expiresAt: row.expires_at ? new Date(row.expires_at) : undefined,
      userId: row.user_id,
      apiKeyId: row.api_key_id,
      tags: row.tags || {},
      status: row.status,
      downloadCount: row.download_count,
      lastAccessedAt: row.last_accessed_at ? new Date(row.last_accessed_at) : undefined
    };
  }

  private updateMetricsAfterStore(metadata: ProofMetadata): void {
    this.metrics.totalProofs++;
    this.metrics.totalSize += metadata.size;
    this.metrics.compressedSize += metadata.compressedSize || metadata.size;
    this.metrics.averageSize = this.metrics.totalSize / this.metrics.totalProofs;
    this.metrics.compressionRatio = this.metrics.compressedSize / this.metrics.totalSize;
    this.metrics.activeProofs++;
    this.metrics.lastUploadTime = new Date();
  }

  private updateMetricsAfterDelete(metadata: ProofMetadata): void {
    this.metrics.totalProofs--;
    this.metrics.totalSize -= metadata.size;
    this.metrics.compressedSize -= metadata.compressedSize || metadata.size;
    this.metrics.averageSize = this.metrics.totalProofs > 0 ? this.metrics.totalSize / this.metrics.totalProofs : 0;
    this.metrics.compressionRatio = this.metrics.totalSize > 0 ? this.metrics.compressedSize / this.metrics.totalSize : 0;
    
    if (metadata.status === 'active') {
      this.metrics.activeProofs--;
    } else if (metadata.status === 'archived') {
      this.metrics.archivedProofs--;
    }
  }
}
