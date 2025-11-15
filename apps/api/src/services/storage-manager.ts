import { CloudProofStorage, CloudProofRecord } from './cloud-proof-storage';
import { DeduplicationService, DeduplicationStats } from './deduplication-service';
import { CacheManager, CacheStats } from './cache-manager';
import { StorageProvider } from '../storage/storage-provider';
import { StorageFactory } from '../storage/storage-factory';
import { C2PAManifest } from './manifest-builder';
import { logger } from '../utils/logger';

/**
 * Storage Manager Configuration
 */
export interface StorageManagerConfig {
  enableDeduplication?: boolean;
  enableMultiLayerCache?: boolean;
  cacheMaxSize?: number;
  cacheTTL?: number;
  primaryProvider?: StorageProvider;
  fallbackProvider?: StorageProvider;
}

/**
 * Storage Manager Statistics
 */
export interface StorageManagerStats {
  storage: {
    totalObjects: number;
    totalSize: number;
    provider: string;
  };
  cache: CacheStats;
  deduplication: DeduplicationStats;
  performance: {
    avgStoreTime: number;
    avgRetrieveTime: number;
    totalOperations: number;
  };
}

/**
 * Storage Manager
 * 
 * Unified interface for all storage operations
 * Coordinates: CloudProofStorage, Deduplication, and Multi-layer Caching
 */
export class StorageManager {
  private proofStorage: CloudProofStorage;
  private deduplication: DeduplicationService;
  private cacheManager: CacheManager<CloudProofRecord>;
  private config: StorageManagerConfig & {
    enableDeduplication: boolean;
    enableMultiLayerCache: boolean;
    cacheMaxSize: number;
    cacheTTL: number;
    primaryProvider: StorageProvider;
  };

  constructor(config: StorageManagerConfig = {}) {
    this.config = {
      enableDeduplication: config.enableDeduplication ?? true,
      enableMultiLayerCache: config.enableMultiLayerCache ?? true,
      cacheMaxSize: config.cacheMaxSize ?? 1000,
      cacheTTL: config.cacheTTL ?? 3600000,
      primaryProvider: config.primaryProvider ?? StorageFactory.fromEnv(),
      fallbackProvider: config.fallbackProvider ?? undefined
    };

    // Initialize services
    this.proofStorage = new CloudProofStorage(
      this.config.primaryProvider,
      this.config.fallbackProvider || undefined
    );

    this.deduplication = new DeduplicationService();

    this.cacheManager = new CacheManager<CloudProofRecord>({
      maxSize: this.config.cacheMaxSize,
      ttl: this.config.cacheTTL,
      enableL2: false, // Can be enabled with Redis
      enableL3: false  // Can be enabled with warm storage
    });

    logger.info('Storage Manager initialized', {
      deduplication: this.config.enableDeduplication,
      multiLayerCache: this.config.enableMultiLayerCache,
      cacheSize: this.config.cacheMaxSize
    });
  }

  /**
   * Store proof with deduplication
   */
  async storeProof(
    imageHash: string,
    manifest: C2PAManifest,
    signature: string
  ): Promise<string> {
    // Check for deduplication
    if (this.config.enableDeduplication) {
      const existing = await this.deduplication.getProofUri(imageHash);
      if (existing) {
        logger.info('Deduplication hit - reusing existing proof', {
          imageHash,
          existingProofUri: existing
        });
        return existing;
      }
    }

    // Store new proof
    const proofUri = await this.proofStorage.storeProof(
      imageHash,
      manifest,
      signature
    );

    // Register in deduplication index
    if (this.config.enableDeduplication) {
      const proofId = this.parseProofId(proofUri);
      await this.deduplication.registerProof(imageHash, proofId, proofUri);
    }

    return proofUri;
  }

  /**
   * Retrieve proof with multi-layer caching
   */
  async retrieveProof(proofIdOrUri: string): Promise<CloudProofRecord | null> {
    const proofId = this.parseProofId(proofIdOrUri);

    // Check multi-layer cache first
    if (this.config.enableMultiLayerCache) {
      const cached = await this.cacheManager.get(proofId);
      if (cached) {
        logger.debug('Multi-layer cache hit', { proofId });
        return cached;
      }
    }

    // Retrieve from storage
    const proof = await this.proofStorage.retrieveProof(proofId);

    // Cache the result
    if (proof && this.config.enableMultiLayerCache) {
      await this.cacheManager.set(proofId, proof);
    }

    return proof;
  }

  /**
   * Get proof by image hash (with deduplication)
   */
  async getProofByHash(imageHash: string): Promise<CloudProofRecord | null> {
    // Check deduplication index first
    if (this.config.enableDeduplication) {
      const proofUri = await this.deduplication.getProofUri(imageHash);
      if (proofUri) {
        return await this.retrieveProof(proofUri);
      }
    }

    // Fallback to storage lookup
    return await this.proofStorage.getProofByHash(imageHash);
  }

  /**
   * Delete proof
   */
  async deleteProof(proofIdOrUri: string): Promise<boolean> {
    const proofId = this.parseProofId(proofIdOrUri);

    // Get proof to find image hash
    const proof = await this.retrieveProof(proofId);
    
    // Delete from storage
    const deleted = await this.proofStorage.deleteProof(proofId);

    if (deleted) {
      // Remove from cache
      if (this.config.enableMultiLayerCache) {
        await this.cacheManager.delete(proofId);
      }

      // Remove from deduplication index
      if (proof && this.config.enableDeduplication) {
        await this.deduplication.removeProof(proof.imageHash);
      }
    }

    return deleted;
  }

  /**
   * Cleanup expired proofs
   */
  async cleanupExpiredProofs(): Promise<{ deleted: number; failed: number }> {
    const result = await this.proofStorage.cleanupExpiredProofs();

    // Also cleanup old deduplication entries
    if (this.config.enableDeduplication) {
      await this.deduplication.cleanup();
    }

    return result;
  }

  /**
   * Get comprehensive statistics
   */
  async getStats(): Promise<StorageManagerStats> {
    const storageStats = await this.proofStorage.getStats();
    const cacheStats = this.cacheManager.getStats();
    const deduplicationStats = this.deduplication.getStats();

    return {
      storage: storageStats.storage,
      cache: cacheStats,
      deduplication: deduplicationStats,
      performance: {
        avgStoreTime: storageStats.metrics.avgStoreTime,
        avgRetrieveTime: storageStats.metrics.avgRetrieveTime,
        totalOperations: storageStats.metrics.storeCount + storageStats.metrics.retrieveCount
      }
    };
  }

  /**
   * Health check
   */
  async healthCheck() {
    const storageHealth = await this.proofStorage.healthCheck();
    const cacheStats = this.cacheManager.getStats();
    const deduplicationStats = this.deduplication.getStats();

    return {
      healthy: storageHealth.healthy,
      storage: storageHealth,
      cache: {
        healthy: true,
        size: cacheStats.l1.size,
        hitRate: cacheStats.l1.hitRate
      },
      deduplication: {
        healthy: true,
        uniqueImages: deduplicationStats.uniqueImages,
        deduplicationRate: deduplicationStats.deduplicationRate
      },
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Warm up cache with frequently accessed proofs
   */
  async warmupCache(proofIds: string[]): Promise<number> {
    return await this.cacheManager.warmup(
      proofIds,
      async (proofId) => await this.proofStorage.retrieveProof(proofId)
    );
  }

  /**
   * Clear all caches
   */
  async clearCaches(): Promise<void> {
    await this.cacheManager.clear();
    this.proofStorage.clearCache();
    logger.info('All caches cleared');
  }

  /**
   * Export deduplication index
   */
  exportDeduplicationIndex(): string {
    return this.deduplication.exportIndex();
  }

  /**
   * Import deduplication index
   */
  importDeduplicationIndex(data: string): void {
    this.deduplication.importIndex(data);
  }

  /**
   * Get most accessed proofs
   */
  getMostAccessedProofs(limit: number = 10) {
    return {
      cache: this.cacheManager.getMostAccessed(limit),
      deduplication: this.deduplication.getMostAccessed(limit)
    };
  }

  /**
   * Parse proof ID from URI
   */
  private parseProofId(proofIdOrUri: string): string {
    if (proofIdOrUri.startsWith('https://')) {
      const parts = proofIdOrUri.split('/');
      return parts[parts.length - 1];
    }
    return proofIdOrUri;
  }
}

/**
 * Singleton instance for global access
 */
let storageManagerInstance: StorageManager | null = null;

export function getStorageManager(config?: StorageManagerConfig): StorageManager {
  if (!storageManagerInstance) {
    storageManagerInstance = new StorageManager(config);
  }
  return storageManagerInstance;
}

export function resetStorageManager(): void {
  storageManagerInstance = null;
}
