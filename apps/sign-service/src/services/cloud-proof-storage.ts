import { randomUUID } from 'crypto';
import { C2PAManifest } from './manifest-builder';
import { logger } from '../utils/logger';
import { StorageProvider } from '../storage/storage-provider';
import { StorageFactory } from '../storage/storage-factory';
import { LRUCache } from 'lru-cache';

/**
 * Cloud Proof Record
 */
export interface CloudProofRecord {
  proofId: string;
  proofUri: string;
  imageHash: string;
  manifest: C2PAManifest;
  timestamp: string;
  signature: string;
  expiresAt: number;
  storageKey: string;
  provider: string;
}

/**
 * Cache entry
 */
interface CacheEntry {
  data: Buffer;
  timestamp: number;
  url: string;
}

/**
 * Storage metrics
 */
interface StorageMetrics {
  storeCount: number;
  retrieveCount: number;
  cacheHits: number;
  cacheMisses: number;
  errors: number;
  fallbackCount: number;
  totalStorageTime: number;
  totalRetrieveTime: number;
}

/**
 * Cloud Proof Storage Service
 * 
 * Production-grade proof storage with:
 * - Multi-cloud storage (S3/R2)
 * - LRU caching for performance
 * - Automatic fallback
 * - Metrics and monitoring
 * - Migration support
 */
export class CloudProofStorage {
  private storage: StorageProvider;
  private fallbackStorage?: StorageProvider;
  private cache: LRUCache<string, CacheEntry>;
  private metrics: StorageMetrics;
  private readonly CACHE_TTL = 3600000; // 1 hour
  private readonly PROOF_TTL = 365 * 24 * 60 * 60 * 1000; // 1 year

  constructor(
    primaryProvider?: StorageProvider,
    fallbackProvider?: StorageProvider
  ) {
    // Use provided providers or create from environment
    this.storage = primaryProvider || StorageFactory.fromEnv();
    this.fallbackStorage = fallbackProvider;

    // Initialize LRU cache
    this.cache = new LRUCache<string, CacheEntry>({
      max: 1000, // Store up to 1000 proofs in memory
      ttl: this.CACHE_TTL,
      updateAgeOnGet: true,
      updateAgeOnHas: true,
    });

    // Initialize metrics
    this.metrics = {
      storeCount: 0,
      retrieveCount: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      fallbackCount: 0,
      totalStorageTime: 0,
      totalRetrieveTime: 0,
    };

    logger.info('Cloud Proof Storage initialized', {
      provider: this.storage.getProviderName(),
      hasFallback: !!this.fallbackStorage,
      cacheSize: 1000
    });
  }

  /**
   * Store proof and return URI
   */
  async storeProof(
    imageHash: string,
    manifest: C2PAManifest,
    signature: string
  ): Promise<string> {
    // Input validation
    if (!imageHash || typeof imageHash !== 'string' || imageHash.length < 32) {
      throw new Error('Invalid image hash');
    }
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Invalid manifest');
    }
    if (!signature || typeof signature !== 'string' || signature.length < 10) {
      throw new Error('Invalid signature');
    }

    const startTime = Date.now();
    const proofId = randomUUID();
    const proofUri = `https://proofs.credlink.com/${proofId}`;

    try {
      // Create proof record
      const record: CloudProofRecord = {
        proofId,
        proofUri,
        imageHash,
        manifest,
        timestamp: new Date().toISOString(),
        signature,
        expiresAt: Date.now() + this.PROOF_TTL,
        storageKey: `proofs/${proofId}.json`,
        provider: this.storage.getProviderName()
      };

      // Serialize to JSON
      const data = Buffer.from(JSON.stringify(record), 'utf8');

      // Store in cloud with compression and encryption
      const result = await this.storage.store(
        record.storageKey,
        data,
        {
          contentType: 'application/json',
          compress: true,
          encryption: true,
          cacheControl: 'public, max-age=31536000, immutable',
          metadata: {
            'image-hash': imageHash,
            'proof-id': proofId,
            'created-at': record.timestamp,
            'expires-at': record.expiresAt.toString()
          },
          tags: {
            type: 'proof',
            version: '1.0'
          }
        }
      );

      // Cache the result
      this.cache.set(proofId, {
        data,
        timestamp: Date.now(),
        url: result.url
      });

      // Update metrics
      const duration = Date.now() - startTime;
      this.metrics.storeCount++;
      this.metrics.totalStorageTime += duration;

      logger.info('Proof stored successfully', {
        proofId,
        provider: this.storage.getProviderName(),
        size: data.length,
        duration
      });

      return proofUri;

    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed to store proof', { error, imageHash });

      // Try fallback if available
      if (this.fallbackStorage) {
        try {
          logger.warn('Primary storage failed, trying fallback');
          
          const record: CloudProofRecord = {
            proofId,
            proofUri,
            imageHash,
            manifest,
            timestamp: new Date().toISOString(),
            signature,
            expiresAt: Date.now() + this.PROOF_TTL,
            storageKey: `proofs/${proofId}.json`,
            provider: this.fallbackStorage.getProviderName()
          };

          const data = Buffer.from(JSON.stringify(record), 'utf8');
          
          await this.fallbackStorage.store(
            record.storageKey,
            data,
            {
              contentType: 'application/json',
              compress: true,
              encryption: true
            }
          );

          this.metrics.fallbackCount++;
          logger.info('Proof stored via fallback', { proofId });
          
          return proofUri;

        } catch (fallbackError) {
          logger.error('Fallback storage also failed', { fallbackError });
          throw fallbackError;
        }
      }

      throw error;
    }
  }

  /**
   * Retrieve proof by ID or URI
   */
  async retrieveProof(proofIdOrUri: string): Promise<CloudProofRecord | null> {
    // Input validation
    if (!proofIdOrUri || typeof proofIdOrUri !== 'string') {
      throw new Error('Invalid proof ID or URI');
    }

    const startTime = Date.now();
    const proofId = this.parseProofId(proofIdOrUri);

    // Validate UUID format
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(proofId)) {
      throw new Error('Invalid proof ID format');
    }

    try {
      // Check cache first
      const cached = this.cache.get(proofId);
      if (cached) {
        this.metrics.cacheHits++;
        
        try {
          const record = JSON.parse(cached.data.toString('utf8')) as CloudProofRecord;
          
          // Check if expired
          if (record.expiresAt < Date.now()) {
            this.cache.delete(proofId);
            return null;
          }
          
          logger.debug('Proof retrieved from cache', { proofId });
          return record;
        } catch (error) {
          // Cache corrupted, remove it
          this.cache.delete(proofId);
        }
      }

      this.metrics.cacheMisses++;

      // Retrieve from storage
      const storageKey = `proofs/${proofId}.json`;
      const data = await this.storage.retrieve(storageKey);

      if (!data) {
        // Try fallback if available
        if (this.fallbackStorage) {
          const fallbackData = await this.fallbackStorage.retrieve(storageKey);
          if (fallbackData) {
            this.metrics.fallbackCount++;
            
            try {
              const record = JSON.parse(fallbackData.toString('utf8')) as CloudProofRecord;
              
              // Cache fallback result
              this.cache.set(proofId, {
                data: fallbackData,
                timestamp: Date.now(),
                url: record.proofUri
              });
              
              return record;
            } catch (error) {
              logger.error('Failed to parse fallback proof data', { proofId, error });
              return null;
            }
          }
        }
        
        return null;
      }

      // Parse and validate
      let record: CloudProofRecord;
      try {
        record = JSON.parse(data.toString('utf8')) as CloudProofRecord;
      } catch (error) {
        logger.error('Failed to parse proof data', { proofId, error });
        // Delete corrupted data
        await this.storage.delete(storageKey);
        return null;
      }

      // Check if expired
      if (record.expiresAt < Date.now()) {
        // Delete expired proof
        await this.storage.delete(storageKey);
        return null;
      }

      // Cache the result
      this.cache.set(proofId, {
        data,
        timestamp: Date.now(),
        url: record.proofUri
      });

      // Update metrics
      const duration = Date.now() - startTime;
      this.metrics.retrieveCount++;
      this.metrics.totalRetrieveTime += duration;

      logger.debug('Proof retrieved from storage', {
        proofId,
        duration
      });

      return record;

    } catch (error) {
      this.metrics.errors++;
      logger.error('Failed to retrieve proof', { error, proofId });
      return null;
    }
  }

  /**
   * Get proof by image hash
   */
  async getProofByHash(imageHash: string): Promise<CloudProofRecord | null> {
    try {
      // List proofs with hash metadata
      const items = await this.storage.list('proofs/', 1000);
      
      // Find matching proof (this is inefficient, should use index in production)
      for (const item of items) {
        try {
          const data = await this.storage.retrieve(item.key);
          if (data) {
            const record = JSON.parse(data.toString('utf8')) as CloudProofRecord;
            if (record.imageHash === imageHash && record.expiresAt > Date.now()) {
              return record;
            }
          }
        } catch (error) {
          // Skip corrupted proofs
          logger.warn('Skipping corrupted proof', { key: item.key, error });
          continue;
        }
      }

      return null;
    } catch (error) {
      logger.error('Failed to get proof by hash', { error, imageHash });
      return null;
    }
  }

  /**
   * Delete proof
   */
  async deleteProof(proofIdOrUri: string): Promise<boolean> {
    const proofId = this.parseProofId(proofIdOrUri);
    const storageKey = `proofs/${proofId}.json`;

    try {
      // Delete from cache
      this.cache.delete(proofId);

      // Delete from storage
      const deleted = await this.storage.delete(storageKey);

      // Also try fallback
      if (this.fallbackStorage) {
        await this.fallbackStorage.delete(storageKey);
      }

      logger.info('Proof deleted', { proofId });
      return deleted;

    } catch (error) {
      logger.error('Failed to delete proof', { error, proofId });
      return false;
    }
  }

  /**
   * Cleanup expired proofs
   */
  async cleanupExpiredProofs(): Promise<{ deleted: number; failed: number }> {
    try {
      logger.info('Starting expired proofs cleanup');
      
      const items = await this.storage.list('proofs/', 10000);
      const now = Date.now();
      const expiredKeys: string[] = [];

      // Find expired proofs
      for (const item of items) {
        try {
          const data = await this.storage.retrieve(item.key);
          if (data) {
            try {
              const record = JSON.parse(data.toString('utf8')) as CloudProofRecord;
              if (record.expiresAt < now) {
                expiredKeys.push(item.key);
              }
            } catch (parseError) {
              // Corrupted proof - mark for deletion
              logger.warn('Found corrupted proof, marking for deletion', { key: item.key });
              expiredKeys.push(item.key);
            }
          }
        } catch (error) {
          // Skip retrieval errors
          continue;
        }
      }

      if (expiredKeys.length === 0) {
        logger.info('No expired proofs found');
        return { deleted: 0, failed: 0 };
      }

      // Batch delete expired proofs
      const result = await this.storage.batchDelete(expiredKeys);

      logger.info('Expired proofs cleanup complete', {
        deleted: result.deleted.length,
        failed: result.failed.length
      });

      return {
        deleted: result.deleted.length,
        failed: result.failed.length
      };

    } catch (error) {
      logger.error('Cleanup failed', { error });
      return { deleted: 0, failed: 0 };
    }
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    const storageStats = await this.storage.getStats();
    
    return {
      storage: storageStats,
      cache: {
        size: this.cache.size,
        maxSize: 1000,
        hitRate: this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses) || 0
      },
      metrics: {
        ...this.metrics,
        avgStoreTime: this.metrics.storeCount > 0 
          ? this.metrics.totalStorageTime / this.metrics.storeCount 
          : 0,
        avgRetrieveTime: this.metrics.retrieveCount > 0
          ? this.metrics.totalRetrieveTime / this.metrics.retrieveCount
          : 0
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    const storageHealth = await this.storage.healthCheck();
    
    let fallbackHealth = null;
    if (this.fallbackStorage) {
      fallbackHealth = await this.fallbackStorage.healthCheck();
    }

    return {
      healthy: storageHealth.healthy || (fallbackHealth?.healthy ?? false),
      primary: storageHealth,
      fallback: fallbackHealth,
      cache: {
        size: this.cache.size,
        healthy: true
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.info('Proof cache cleared');
  }

  /**
   * Parse proof ID from URI or ID
   */
  private parseProofId(proofIdOrUri: string): string {
    if (proofIdOrUri.startsWith('https://')) {
      const parts = proofIdOrUri.split('/');
      return parts[parts.length - 1];
    }
    return proofIdOrUri;
  }
}
