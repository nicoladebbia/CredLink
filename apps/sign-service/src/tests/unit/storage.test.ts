import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { StorageManager } from '../../services/storage-manager';
import { DeduplicationService } from '../../services/deduplication-service';
import { CacheManager } from '../../services/cache-manager';
import { C2PAManifest } from '../../services/manifest-builder';

describe('Storage Unit Tests', () => {
  describe('DeduplicationService', () => {
    let deduplication: DeduplicationService;

    beforeEach(() => {
      deduplication = new DeduplicationService();
    });

    it('should detect duplicate image hashes', async () => {
      const imageHash = 'abc123def456';
      const proofId = 'proof-123';
      const proofUri = 'https://proofs.credlink.com/proof-123';

      // Register first proof
      await deduplication.registerProof(imageHash, proofId, proofUri);

      // Check for duplicate
      const result = await deduplication.getOrCreateProofId(imageHash);
      
      expect(result.isNew).toBe(false);
      expect(result.proofId).toBe(proofId);
    });

    it('should return isNew for new image hashes', async () => {
      const imageHash = 'new-hash-123';
      
      const result = await deduplication.getOrCreateProofId(imageHash);
      
      expect(result.isNew).toBe(true);
      expect(result.proofId).toBe('');
    });

    it('should track access counts', async () => {
      const imageHash = 'abc123';
      await deduplication.registerProof(imageHash, 'proof-1', 'uri-1');

      // Access multiple times
      await deduplication.getProofId(imageHash);
      await deduplication.getProofId(imageHash);
      await deduplication.getProofId(imageHash);

      const stats = deduplication.getStats();
      expect(stats.uniqueImages).toBe(1);
    });

    it('should normalize hashes', async () => {
      const hash1 = 'ABC123';
      const hash2 = 'abc123';
      const hash3 = '  abc123  ';

      await deduplication.registerProof(hash1, 'proof-1', 'uri-1');

      const result2 = await deduplication.getProofId(hash2);
      const result3 = await deduplication.getProofId(hash3);

      expect(result2).toBe('proof-1');
      expect(result3).toBe('proof-1');
    });

    it('should remove proofs from index', async () => {
      const imageHash = 'abc123';
      await deduplication.registerProof(imageHash, 'proof-1', 'uri-1');

      const removed = await deduplication.removeProof(imageHash);
      expect(removed).toBe(true);

      const result = await deduplication.getProofId(imageHash);
      expect(result).toBeNull();
    });

    it('should export and import index', async () => {
      await deduplication.registerProof('hash1', 'proof1', 'uri1');
      await deduplication.registerProof('hash2', 'proof2', 'uri2');

      const exported = deduplication.exportIndex();
      
      const newDedup = new DeduplicationService();
      newDedup.importIndex(exported);

      const result = await newDedup.getProofId('hash1');
      expect(result).toBe('proof1');
    });

    it('should cleanup old entries', async () => {
      await deduplication.registerProof('hash1', 'proof1', 'uri1');
      
      // Cleanup with 0ms max age (removes everything)
      const removed = await deduplication.cleanup(0);
      
      expect(removed).toBe(1);
      expect(deduplication.getStats().uniqueImages).toBe(0);
    });

    it('should get most accessed proofs', async () => {
      await deduplication.registerProof('hash1', 'proof1', 'uri1');
      await deduplication.registerProof('hash2', 'proof2', 'uri2');

      // Access hash1 multiple times
      await deduplication.getProofId('hash1');
      await deduplication.getProofId('hash1');
      await deduplication.getProofId('hash1');

      const mostAccessed = deduplication.getMostAccessed(1);
      expect(mostAccessed[0].proofId).toBe('proof1');
      expect(mostAccessed[0].accessCount).toBeGreaterThan(1);
    });

    it('should calculate deduplication stats', async () => {
      await deduplication.registerProof('hash1', 'proof1', 'uri1');
      
      // Simulate duplicate access
      await deduplication.getOrCreateProofId('hash1');
      await deduplication.getOrCreateProofId('hash1');

      const stats = deduplication.getStats();
      expect(stats.duplicates).toBeGreaterThan(0);
      expect(stats.deduplicationRate).toBeGreaterThan(0);
    });
  });

  describe('CacheManager', () => {
    let cache: CacheManager<string>;

    beforeEach(() => {
      cache = new CacheManager<string>({
        maxSize: 10,
        ttl: 1000 // 1 second for testing
      });
    });

    it('should store and retrieve values', async () => {
      await cache.set('key1', 'value1');
      
      const result = await cache.get('key1');
      expect(result).toBe('value1');
    });

    it('should return null for missing keys', async () => {
      const result = await cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should delete values', async () => {
      await cache.set('key1', 'value1');
      const deleted = await cache.delete('key1');
      
      expect(deleted).toBe(true);
      
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });

    it('should check if key exists', async () => {
      await cache.set('key1', 'value1');
      
      const exists = await cache.has('key1');
      expect(exists).toBe(true);
      
      const notExists = await cache.has('key2');
      expect(notExists).toBe(false);
    });

    it('should clear all values', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      await cache.clear();
      
      const result1 = await cache.get('key1');
      const result2 = await cache.get('key2');
      
      expect(result1).toBeNull();
      expect(result2).toBeNull();
    });

    it('should track cache statistics', async () => {
      await cache.set('key1', 'value1');
      await cache.get('key1'); // hit
      await cache.get('key2'); // miss
      
      const stats = cache.getStats();
      
      expect(stats.l1.hits).toBe(1);
      expect(stats.l1.misses).toBe(1);
      expect(stats.l1.hitRate).toBe(0.5);
    });

    it('should evict old entries when full', async () => {
      // Fill cache beyond max size
      for (let i = 0; i < 15; i++) {
        await cache.set(`key${i}`, `value${i}`);
      }
      
      const stats = cache.getStats();
      expect(stats.l1.size).toBeLessThanOrEqual(10);
      expect(stats.l1.evictions).toBeGreaterThan(0);
    });

    it('should get most accessed keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      
      // Access key1 multiple times
      await cache.get('key1');
      await cache.get('key1');
      await cache.get('key1');
      
      const mostAccessed = cache.getMostAccessed(1);
      expect(mostAccessed[0].key).toBe('key1');
      expect(mostAccessed[0].hits).toBe(3);
    });

    it('should warmup cache', async () => {
      const keys = ['key1', 'key2', 'key3'];
      const fetcher = async (key: string) => `value-${key}`;
      
      const warmed = await cache.warmup(keys, fetcher);
      
      expect(warmed).toBe(3);
      
      const result = await cache.get('key1');
      expect(result).toBe('value-key1');
    });

    it('should expire entries after TTL', async () => {
      const shortCache = new CacheManager<string>({
        maxSize: 10,
        ttl: 10 // 10ms
      });

      await shortCache.set('key1', 'value1');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 20));
      
      const result = await shortCache.get('key1');
      expect(result).toBeNull();
    });
  });

  describe('StorageManager Integration', () => {
    let storageManager: StorageManager;
    const mockManifest: C2PAManifest = {
      '@context': 'https://c2pa.org/specifications/c2pa/v1.0',
      claim_generator: {
        name: 'CredLink',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      },
      assertions: []
    };

    beforeEach(() => {
      // Note: This would need proper mocking in real tests
      // For now, we're testing the interface
      storageManager = new StorageManager({
        enableDeduplication: true,
        enableMultiLayerCache: true,
        cacheMaxSize: 100
      });
    });

    it('should initialize with correct configuration', () => {
      expect(storageManager).toBeDefined();
    });

    it('should provide health check', async () => {
      const health = await storageManager.healthCheck();
      
      expect(health).toHaveProperty('healthy');
      expect(health).toHaveProperty('storage');
      expect(health).toHaveProperty('cache');
      expect(health).toHaveProperty('deduplication');
    });

    it('should provide comprehensive statistics', async () => {
      const stats = await storageManager.getStats();
      
      expect(stats).toHaveProperty('storage');
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('deduplication');
      expect(stats).toHaveProperty('performance');
    });

    it('should export and import deduplication index', () => {
      const exported = storageManager.exportDeduplicationIndex();
      expect(typeof exported).toBe('string');
      
      storageManager.importDeduplicationIndex(exported);
    });

    it('should clear all caches', async () => {
      await storageManager.clearCaches();
      // Should not throw
    });

    it('should get most accessed proofs', () => {
      const mostAccessed = storageManager.getMostAccessedProofs(5);
      
      expect(mostAccessed).toHaveProperty('cache');
      expect(mostAccessed).toHaveProperty('deduplication');
    });
  });

  describe('Hash Generation', () => {
    it('should generate consistent hashes', () => {
      const buffer1 = Buffer.from('test data');
      const buffer2 = Buffer.from('test data');
      
      const hash1 = DeduplicationService.generateHash(buffer1);
      const hash2 = DeduplicationService.generateHash(buffer2);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toHaveLength(64); // SHA-256 hex length
    });

    it('should generate different hashes for different data', () => {
      const buffer1 = Buffer.from('data1');
      const buffer2 = Buffer.from('data2');
      
      const hash1 = DeduplicationService.generateHash(buffer1);
      const hash2 = DeduplicationService.generateHash(buffer2);
      
      expect(hash1).not.toBe(hash2);
    });
  });
});
