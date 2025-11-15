import { randomUUID } from 'crypto';
import { logger } from './logger';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { S3ProofStorage } from './storage/s3-proof-storage';

export interface C2PAManifest {
  claim_generator: string;
  claim_generator_info?: any;
  format: string;
  instance_id: string;
  title?: string;
  assertions?: any[];
  [key: string]: any;
}

export interface ProofRecord {
  proofId: string;
  proofUri: string;
  imageHash: string;
  manifest: C2PAManifest;
  timestamp: string;
  signature: string;
  expiresAt: number; // Unix timestamp
}

/**
 * Enhanced Proof Storage Service
 * 
 * Stores C2PA manifests with real persistence options
 * 
 * Development: Local filesystem storage
 * Production: Cloudflare KV, DynamoDB, PostgreSQL, or R2
 */
export class ProofStorage {
  private storage: Map<string, ProofRecord>;
  private hashIndex: Map<string, string>;
  private storagePath: string;
  private useLocalFilesystem: boolean;
  private s3Storage: S3ProofStorage;
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.storage = new Map();
    this.hashIndex = new Map();
    this.useLocalFilesystem = process.env.USE_LOCAL_PROOF_STORAGE === 'true';
    this.storagePath = process.env.PROOF_STORAGE_PATH || './proofs';
    this.s3Storage = new S3ProofStorage();
    
    const s3Stats = this.s3Storage.getStats();
    
    if (s3Stats.enabled) {
      logger.info('Proof storage initialized (S3 MODE)', {
        bucket: s3Stats.bucket,
        prefix: s3Stats.prefix
      });
    } else if (this.useLocalFilesystem) {
      this.ensureStorageDirectory();
      logger.info('Proof storage initialized (LOCAL FILESYSTEM MODE)');
    } else {
      logger.info('Proof storage initialized (IN-MEMORY MODE)');
    }
    
    // Start cleanup job for expired proofs (runs every 24 hours)
    this.cleanupInterval = setInterval(() => this.cleanupExpiredProofs(), 24 * 60 * 60 * 1000);
  }

  /**
   * Store proof and return URI
   */
  async storeProof(manifest: C2PAManifest, imageHash: string): Promise<string> {
    try {
      // Generate unique proof ID
      const proofId = randomUUID();
      const proofDomain = process.env.PROOF_URI_DOMAIN || 'https://proofs.credlink.com';
      const proofUri = `${proofDomain}/${proofId}`;
      
      // Set expiration to 1 year from now
      const expiresAt = Date.now() + (365 * 24 * 60 * 60 * 1000);
      
      const proofRecord: ProofRecord = {
        proofId,
        proofUri,
        imageHash,
        manifest,
        timestamp: new Date().toISOString(),
        signature: 'pending-signature',
        expiresAt
      };

      // Store in memory (cache)
      this.storage.set(proofId, proofRecord);
      this.hashIndex.set(imageHash, proofId);

      // Store in S3 (primary) or filesystem (fallback)
      const s3Stats = this.s3Storage.getStats();
      if (s3Stats.enabled) {
        await this.s3Storage.storeProof(proofRecord);
      } else if (this.useLocalFilesystem) {
        await this.storeProofLocal(proofRecord);
      }
      
      logger.info('Proof stored successfully', {
        proofId,
        imageHash,
        storage: s3Stats.enabled ? 's3' : (this.useLocalFilesystem ? 'filesystem' : 'memory')
      });
      return proofUri;
    } catch (error: any) {
      logger.error('Failed to store proof', { error: error.message });
      throw new Error(`Proof storage failed: ${error.message}`);
    }
  }

  /**
   * Retrieve proof by ID
   */
  async getProof(proofId: string): Promise<ProofRecord | null> {
    // Check memory cache first
    if (this.storage.has(proofId)) {
      return this.storage.get(proofId)!;
    }

    // Check S3 (primary) or filesystem (fallback)
    const s3Stats = this.s3Storage.getStats();
    let proof: ProofRecord | null = null;
    
    if (s3Stats.enabled) {
      proof = await this.s3Storage.getProof(proofId);
    } else if (this.useLocalFilesystem) {
      proof = await this.getProofLocal(proofId);
    }

    // Cache in memory if found
    if (proof) {
      this.storage.set(proofId, proof);
      this.hashIndex.set(proof.imageHash, proofId);
    }

    return proof;
  }

  /**
   * Retrieve proof by image hash
   */
  async getProofByHash(imageHash: string): Promise<ProofRecord | null> {
    const proofId = this.hashIndex.get(imageHash);
    if (!proofId) {
      return null;
    }
    
    return this.getProof(proofId);
  }

  /**
   * Store proof in local filesystem
   */
  private async storeProofLocal(proofRecord: ProofRecord): Promise<void> {
    const proofPath = join(this.storagePath, `${proofRecord.proofId}.json`);
    const proofJson = JSON.stringify(proofRecord, null, 2);
    
    writeFileSync(proofPath, proofJson, 'utf8');
  }

  /**
   * Retrieve proof from local filesystem
   */
  private async getProofLocal(proofId: string): Promise<ProofRecord | null> {
    const proofPath = join(this.storagePath, `${proofId}.json`);
    
    if (!existsSync(proofPath)) {
      return null;
    }
    
    try {
      const proofJson = readFileSync(proofPath, 'utf8');
      return JSON.parse(proofJson) as ProofRecord;
    } catch (error) {
      return null;
    }
  }

  /**
   * Ensure storage directory exists
   */
  private ensureStorageDirectory(): void {
    if (!existsSync(this.storagePath)) {
      mkdirSync(this.storagePath, { recursive: true });
    }
  }

  /**
   * Check if proof exists
   */
  async proofExists(proofId: string): Promise<boolean> {
    const proof = await this.getProof(proofId);
    return proof !== null;
  }

  /**
   * Delete proof (for cleanup or revocation)
   */
  async deleteProof(proofId: string): Promise<boolean> {
    try {
      // Remove from memory
      const proof = this.storage.get(proofId);
      if (proof) {
        this.hashIndex.delete(proof.imageHash);
        this.storage.delete(proofId);
      }

      // Remove from filesystem if enabled
      if (this.useLocalFilesystem) {
        return this.deleteProofLocal(proofId);
      }

      return true;
    } catch (error) {
      return false;
    }
  }

  private async deleteProofLocal(proofId: string): Promise<boolean> {
    const proofPath = join(this.storagePath, `${proofId}.json`);
    try {
      const fs = require('fs').promises;
      await fs.unlink(proofPath);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Clean up expired proofs
   */
  private async cleanupExpiredProofs(): Promise<void> {
    const now = Date.now();
    let expiredCount = 0;
    
    for (const [proofId, record] of this.storage.entries()) {
      if (record.expiresAt < now) {
        this.storage.delete(proofId);
        this.hashIndex.delete(record.imageHash);
        
        if (this.useLocalFilesystem) {
          await this.deleteProofLocal(proofId);
        }
        
        expiredCount++;
      }
    }
    
    if (expiredCount > 0) {
      logger.info(`Cleaned up ${expiredCount} expired proofs`);
    }
  }

  /**
   * Get storage statistics
   */
  getStats(): { totalProofs: number; storageType: string } {
    return {
      totalProofs: this.storage.size,
      storageType: this.useLocalFilesystem ? 'local-filesystem' : 'in-memory'
    };
  }

  /**
   * Week 7 Day 1: Close method to prevent test hangs
   * Clears interval and releases resources
   */
  async close(): Promise<void> {
    try {
      // Clear the cleanup interval
      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }
      
      // Clear in-memory storage
      this.storage.clear();
      this.hashIndex.clear();
      
      logger.info('ProofStorage closed successfully');
    } catch (error: any) {
      logger.error('Error closing ProofStorage', { error: error.message });
    }
  }
}
