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
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.storage = new Map();
    this.hashIndex = new Map();
    
    // PRODUCTION DEFAULT: Use filesystem storage to prevent data loss
    // Development: Can use in-memory for faster iteration
    // Override with USE_LOCAL_PROOF_STORAGE=false to force in-memory mode
    const explicitSetting = process.env.USE_LOCAL_PROOF_STORAGE;
    const isProduction = process.env.NODE_ENV === 'production';
    
    if (explicitSetting !== undefined) {
      // Explicit setting takes precedence
      this.useLocalFilesystem = explicitSetting === 'true';
    } else {
      // Default: filesystem in production, in-memory in development
      this.useLocalFilesystem = isProduction;
    }
    
    this.storagePath = process.env.PROOF_STORAGE_PATH || './proofs';
    
    if (this.useLocalFilesystem) {
      this.ensureStorageDirectory();
      logger.info('Proof storage initialized (PERSISTENT FILESYSTEM MODE)', {
        path: this.storagePath,
        mode: isProduction ? 'production-default' : 'explicitly-configured'
      });
    } else {
      logger.warn('Proof storage initialized (IN-MEMORY MODE - DATA LOST ON RESTART)', {
        environment: process.env.NODE_ENV,
        recommendation: isProduction ? 'Enable filesystem storage for production!' : 'OK for development'
      });
    }
    
    // Start cleanup job for expired proofs (runs every 24 hours)
    this.cleanupInterval = setInterval(() => this.cleanupExpiredProofs(), 24 * 60 * 60 * 1000);
    // Allow Node to exit even if timer is active
    this.cleanupInterval.unref();
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

      // Store in filesystem if enabled
      if (this.useLocalFilesystem) {
        await this.storeProofLocal(proofRecord);
      }
      
      logger.info('Proof stored successfully', {
        proofId,
        imageHash,
        storage: this.useLocalFilesystem ? 'filesystem' : 'memory'
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

    // Check filesystem if enabled
    let proof: ProofRecord | null = null;
    
    if (this.useLocalFilesystem) {
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
