import { randomUUID } from 'crypto';
import { C2PAManifest } from '../services/manifest-builder';
import { logger } from '../utils/logger';
import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

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

  constructor() {
    this.storage = new Map();
    this.hashIndex = new Map();
    this.useLocalFilesystem = process.env.USE_LOCAL_PROOF_STORAGE === 'true';
    this.storagePath = process.env.PROOF_STORAGE_PATH || './proofs';
    
    if (this.useLocalFilesystem) {
      this.ensureStorageDirectory();
      logger.info('Proof storage initialized (LOCAL FILESYSTEM MODE)');
    } else {
      logger.info('Proof storage initialized (IN-MEMORY MODE)');
    }
    
    // Start cleanup job for expired proofs (runs every 24 hours)
    setInterval(() => this.cleanupExpiredProofs(), 24 * 60 * 60 * 1000);
  }

  /**
   * Store proof and return URI
   */
  async storeProof(manifest: C2PAManifest, imageHash: string): Promise<string> {
    try {
      // Generate unique proof ID
      const proofId = randomUUID();
      const proofUri = `https://proofs.credlink.com/${proofId}`;
      
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

      // Store in memory
      this.storage.set(proofId, proofRecord);
      this.hashIndex.set(imageHash, proofId);

      // Store in filesystem if enabled
      if (this.useLocalFilesystem) {
        await this.storeProofLocal(proofRecord);
      }

      logger.info('Proof stored successfully', { proofId, imageHash });
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
    // Check memory first
    if (this.storage.has(proofId)) {
      return this.storage.get(proofId)!;
    }

    // Check filesystem if enabled
    if (this.useLocalFilesystem) {
      return this.getProofLocal(proofId);
    }

    return null;
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
}
