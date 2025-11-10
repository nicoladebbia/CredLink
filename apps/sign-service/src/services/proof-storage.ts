import { randomUUID } from 'crypto';
import { C2PAManifest, ProofRecord } from '../types';
import { logger } from '../utils/logger';

/**
 * Proof Storage Service
 * 
 * Stores C2PA manifests remotely for verification
 * 
 * Current: In-memory storage (for development)
 * Production: Cloudflare KV, DynamoDB, PostgreSQL, or R2
 */
export class ProofStorage {
  private storage: Map<string, ProofRecord>;
  private hashIndex: Map<string, string>;

  constructor() {
    this.storage = new Map();
    this.hashIndex = new Map();
    logger.info('Proof storage initialized (IN-MEMORY MODE)');
  }

  /**
   * Store proof and return URI
   */
  async storeProof(manifest: C2PAManifest, imageHash: string): Promise<string> {
    try {
      // Generate unique proof ID
      const proofId = randomUUID();
      const proofUri = `https://proofs.credlink.com/${proofId}`;
      
      // Compress manifest (mock compression)
      const compressed = this.compress(JSON.stringify(manifest));
      
      // Store with metadata
      const record: ProofRecord = {
        manifest: compressed,
        imageHash,
        created: Date.now(),
        ttl: 365 * 24 * 60 * 60 * 1000, // 1 year in milliseconds
        accessCount: 0
      };
      
      this.storage.set(proofId, record);
      
      // Index by image hash for deduplication
      this.hashIndex.set(`hash:${imageHash}`, proofId);
      
      logger.info('Proof stored successfully', { proofId, imageHash });
      
      return proofUri;
    } catch (error) {
      logger.error('Failed to store proof', { error });
      throw error;
    }
  }

  /**
   * Retrieve proof by ID
   */
  async retrieveProof(proofId: string): Promise<C2PAManifest | null> {
    try {
      const record = this.storage.get(proofId);
      
      if (!record) {
        logger.debug('Proof not found', { proofId });
        return null;
      }
      
      // Check TTL
      const age = Date.now() - record.created;
      if (age > record.ttl) {
        logger.debug('Proof expired', { proofId, age });
        this.storage.delete(proofId);
        return null;
      }
      
      // Increment access counter
      record.accessCount++;
      
      // Decompress and parse
      const manifestJson = this.decompress(record.manifest);
      const manifest = JSON.parse(manifestJson);
      
      logger.debug('Proof retrieved', { proofId, accessCount: record.accessCount });
      
      return manifest;
    } catch (error) {
      logger.error('Failed to retrieve proof', { proofId, error });
      return null;
    }
  }

  /**
   * Find proof by image hash (deduplication)
   */
  async findProofByHash(imageHash: string): Promise<string | null> {
    return this.hashIndex.get(`hash:${imageHash}`) || null;
  }

  /**
   * Get storage statistics
   */
  getStats() {
    return {
      totalProofs: this.storage.size,
      storageType: 'in-memory',
      proofs: Array.from(this.storage.entries()).map(([id, record]) => ({
        id,
        imageHash: record.imageHash,
        created: new Date(record.created).toISOString(),
        accessCount: record.accessCount
      }))
    };
  }

  /**
   * Mock compression
   * In production: Use zlib or similar
   */
  private compress(data: string): string {
    // Mock: Just return as-is
    // In production: Buffer.from(data).toString('base64') with gzip
    return data;
  }

  /**
   * Mock decompression
   */
  private decompress(data: string): string {
    // Mock: Just return as-is
    return data;
  }
}

// Singleton instance
export const proofStorage = new ProofStorage();
