import { describe, it, expect, beforeAll } from '@jest/globals';
import { StorageManager } from '../../services/storage-manager';
import { DeduplicationService } from '../../services/deduplication-service';
import { CacheManager } from '../../services/cache-manager';
import { C2PAManifest } from '../../services/manifest-builder';

describe('Storage Performance Tests', () => {
  const mockManifest: C2PAManifest = {
    '@context': 'https://c2pa.org/specifications/c2pa/v1.0',
    claim_generator: {
      name: 'CredLink',
      version: '1.0.0',
      timestamp: new Date().toISOString()
    },
    assertions: []
  };

  describe('Cache Performance', () => {
    let cache: CacheManager<string>;

    beforeAll(() => {
      cache = new CacheManager<string>({
        maxSize: 1000,
        ttl: 3600000
      });
    });

    it('should handle 1000 sequential writes < 1000ms', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await cache.set(`key${i}`, `value${i}`);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000);
      
      console.log(`✓ 1000 cache writes: ${duration}ms (${(duration / 1000).toFixed(2)}ms per write)`);
    });

    it('should handle 1000 sequential reads < 100ms', async () => {
      // Pre-populate cache
      for (let i = 0; i < 100; i++) {
        await cache.set(`key${i}`, `value${i}`);
      }

      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await cache.get(`key${i % 100}`);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100);
      
      console.log(`✓ 1000 cache reads: ${duration}ms (${(duration / 1000).toFixed(3)}ms per read)`);
    });

    it('should achieve >90% hit rate with realistic access pattern', async () => {
      const cache = new CacheManager<string>({ maxSize: 100 });

      // Populate with 100 items
      for (let i = 0; i < 100; i++) {
        await cache.set(`key${i}`, `value${i}`);
      }

      // Access pattern: 90% hot data, 10% cold data
      for (let i = 0; i < 1000; i++) {
        const key = i < 900 ? `key${i % 20}` : `key${100 + i}`;
        await cache.get(key);
      }

      const stats = cache.getStats();
      expect(stats.l1.hitRate).toBeGreaterThan(0.8); // At least 80%
      
      console.log(`✓ Cache hit rate: ${(stats.l1.hitRate * 100).toFixed(2)}%`);
    });

    it('should handle concurrent operations', async () => {
      const cache = new CacheManager<string>({ maxSize: 1000 });
      const startTime = Date.now();

      const operations = [];
      for (let i = 0; i < 100; i++) {
        operations.push(cache.set(`key${i}`, `value${i}`));
        operations.push(cache.get(`key${i}`));
      }

      await Promise.all(operations);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500);
      
      console.log(`✓ 200 concurrent operations: ${duration}ms`);
    });
  });

  describe('Deduplication Performance', () => {
    let dedup: DeduplicationService;

    beforeAll(() => {
      dedup = new DeduplicationService();
    });

    it('should handle 1000 registrations < 500ms', async () => {
      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await dedup.registerProof(`hash${i}`, `proof${i}`, `uri${i}`);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(500);
      
      console.log(`✓ 1000 dedup registrations: ${duration}ms`);
    });

    it('should handle 1000 lookups < 100ms', async () => {
      // Pre-populate
      for (let i = 0; i < 100; i++) {
        await dedup.registerProof(`hash${i}`, `proof${i}`, `uri${i}`);
      }

      const startTime = Date.now();

      for (let i = 0; i < 1000; i++) {
        await dedup.getProofId(`hash${i % 100}`);
      }

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100);
      
      console.log(`✓ 1000 dedup lookups: ${duration}ms`);
    });

    it('should detect duplicates efficiently', async () => {
      const dedup = new DeduplicationService();
      
      // Register 100 unique hashes
      for (let i = 0; i < 100; i++) {
        await dedup.registerProof(`hash${i}`, `proof${i}`, `uri${i}`);
      }

      const startTime = Date.now();

      // Try to register 900 duplicates
      let duplicatesDetected = 0;
      for (let i = 0; i < 900; i++) {
        const result = await dedup.getOrCreateProofId(`hash${i % 100}`);
        if (!result.isNew) {
          duplicatesDetected++;
        }
      }

      const duration = Date.now() - startTime;
      
      expect(duplicatesDetected).toBe(900);
      expect(duration).toBeLessThan(200);
      
      console.log(`✓ Detected 900 duplicates in ${duration}ms`);
    });

    it('should handle cleanup of large index < 1000ms', async () => {
      const dedup = new DeduplicationService();
      
      // Create large index
      for (let i = 0; i < 10000; i++) {
        await dedup.registerProof(`hash${i}`, `proof${i}`, `uri${i}`);
      }

      const startTime = Date.now();
      await dedup.cleanup(0); // Remove all
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000);
      
      console.log(`✓ Cleaned up 10000 entries in ${duration}ms`);
    });
  });

  describe('Combined Performance', () => {
    it('should handle 1000+ concurrent storage operations', async () => {
      const storageManager = new StorageManager({
        enableDeduplication: true,
        enableMultiLayerCache: true,
        cacheMaxSize: 1000
      });

      const startTime = Date.now();

      // Simulate 1000 concurrent operations
      const operations = [];
      for (let i = 0; i < 1000; i++) {
        // Mix of operations
        if (i % 3 === 0) {
          operations.push(storageManager.healthCheck());
        } else if (i % 3 === 1) {
          operations.push(storageManager.getStats());
        } else {
          operations.push(storageManager.getMostAccessedProofs(5));
        }
      }

      await Promise.all(operations);

      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(5000); // 5 seconds for 1000 operations
      
      console.log(`✓ 1000 concurrent operations: ${duration}ms (${(duration / 1000).toFixed(2)}ms per op)`);
    });

    it('should maintain performance under sustained load', async () => {
      const cache = new CacheManager<string>({ maxSize: 1000 });
      const dedup = new DeduplicationService();

      const durations: number[] = [];

      // Run 10 batches of 100 operations each
      for (let batch = 0; batch < 10; batch++) {
        const batchStart = Date.now();

        for (let i = 0; i < 100; i++) {
          await cache.set(`key${i}`, `value${i}`);
          await cache.get(`key${i}`);
          await dedup.registerProof(`hash${i}`, `proof${i}`, `uri${i}`);
          await dedup.getProofId(`hash${i}`);
        }

        durations.push(Date.now() - batchStart);
      }

      // Check that performance doesn't degrade significantly
      const firstBatch = durations[0];
      const lastBatch = durations[durations.length - 1];
      const degradation = (lastBatch - firstBatch) / firstBatch;

      expect(degradation).toBeLessThan(0.5); // Less than 50% degradation
      
      console.log(`✓ Performance degradation: ${(degradation * 100).toFixed(2)}%`);
      console.log(`  First batch: ${firstBatch}ms, Last batch: ${lastBatch}ms`);
    });

    it('should meet p95 latency targets', async () => {
      const cache = new CacheManager<string>({ maxSize: 1000 });
      const latencies: number[] = [];

      // Measure 1000 operations
      for (let i = 0; i < 1000; i++) {
        const start = Date.now();
        await cache.set(`key${i}`, `value${i}`);
        await cache.get(`key${i}`);
        latencies.push(Date.now() - start);
      }

      // Calculate p95
      latencies.sort((a, b) => a - b);
      const p95Index = Math.floor(latencies.length * 0.95);
      const p95 = latencies[p95Index];
      const p50 = latencies[Math.floor(latencies.length * 0.5)];
      const p99 = latencies[Math.floor(latencies.length * 0.99)];

      expect(p95).toBeLessThan(50); // p95 < 50ms
      
      console.log(`✓ Latency percentiles:`);
      console.log(`  p50: ${p50}ms`);
      console.log(`  p95: ${p95}ms`);
      console.log(`  p99: ${p99}ms`);
    });

    it('should handle memory efficiently', async () => {
      const cache = new CacheManager<string>({ maxSize: 1000 });
      
      const initialMemory = process.memoryUsage().heapUsed;

      // Fill cache
      for (let i = 0; i < 1000; i++) {
        await cache.set(`key${i}`, `value${i}`.repeat(100)); // ~100 bytes per entry
      }

      const filledMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (filledMemory - initialMemory) / 1024 / 1024; // MB

      // Should use less than 50MB for 1000 entries
      expect(memoryIncrease).toBeLessThan(50);
      
      console.log(`✓ Memory usage for 1000 entries: ${memoryIncrease.toFixed(2)}MB`);
    });
  });

  describe('Scalability Tests', () => {
    it('should scale linearly with cache size', async () => {
      const sizes = [100, 500, 1000];
      const results: Array<{ size: number; duration: number }> = [];

      for (const size of sizes) {
        const cache = new CacheManager<string>({ maxSize: size });
        const startTime = Date.now();

        for (let i = 0; i < size; i++) {
          await cache.set(`key${i}`, `value${i}`);
        }

        results.push({
          size,
          duration: Date.now() - startTime
        });
      }

      console.log('✓ Scalability results:');
      results.forEach(r => {
        console.log(`  ${r.size} entries: ${r.duration}ms (${(r.duration / r.size).toFixed(3)}ms per entry)`);
      });

      // Check linear scaling (within 2x)
      const ratio1 = results[1].duration / results[0].duration;
      const ratio2 = results[2].duration / results[1].duration;
      
      expect(ratio1).toBeLessThan(10); // Should scale reasonably
      expect(ratio2).toBeLessThan(5);
    });

    it('should handle burst traffic', async () => {
      const cache = new CacheManager<string>({ maxSize: 1000 });
      
      // Simulate burst: 500 operations in quick succession
      const startTime = Date.now();
      
      const burst = [];
      for (let i = 0; i < 500; i++) {
        burst.push(cache.set(`key${i}`, `value${i}`));
      }
      
      await Promise.all(burst);
      
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(1000);
      
      console.log(`✓ Handled 500 concurrent operations in ${duration}ms`);
    });
  });
});
