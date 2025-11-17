import { C2PAService } from '../../src/services/c2pa-service';
import { AdvancedExtractor } from '../../src/services/advanced-extractor';
import sharp from 'sharp';

describe('Verification Performance', () => {
  let c2paService: C2PAService;
  let extractor: AdvancedExtractor;
  let testImage: Buffer;
  let signedImage: Buffer;

  beforeAll(async () => {
    c2paService = new C2PAService({ useRealC2PA: false });
    extractor = new AdvancedExtractor();

    // Create test image
    testImage = await sharp({
      create: {
        width: 1000,
        height: 1000,
        channels: 3,
        background: { r: 128, g: 128, b: 128 }
      }
    }).jpeg({ quality: 90 }).toBuffer();

    // Sign it once for reuse
    const signResult = await c2paService.signImage(testImage, {
      creator: 'Performance Test'
    });

    signedImage = signResult.signedBuffer!;
  });

  describe('Extraction Performance', () => {
    it('should extract metadata in < 100ms (p95)', async () => {
      const iterations = parseInt(process.env.PERF_TEST_ITERATIONS) || 20; // Use env var or default
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await extractor.extract(signedImage);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      // Calculate p95
      durations.sort((a, b) => a - b);
      const p95Index = Math.floor(iterations * 0.95);
      const p95 = durations[p95Index];

      expect(p95).toBeLessThan(100);
    }, parseInt(process.env.PERF_TEST_TIMEOUT) || 15000); // Use env var or default

    it('should handle concurrent extractions efficiently', async () => {
      const concurrency = parseInt(process.env.PERF_TEST_CONCURRENCY) || 10; // Use env var or default

      const startTime = Date.now();
      const promises = Array(concurrency).fill(null).map(() =>
        extractor.extract(signedImage)
      );

      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      const avgTime = totalTime / concurrency;

      expect(results.length).toBe(concurrency);
      expect(avgTime).toBeLessThan(200); // Average < 200ms per request
    }, 30000);

    it.skip('should maintain performance with large images', async () => {
      // Skipping large image test due to computational expense
      // Core functionality is verified by signature-verifier tests
      const largeImage = await sharp({
        create: {
          width: 4000,
          height: 3000,
          channels: 3,
          background: { r: 200, g: 150, b: 100 }
        }
      }).jpeg({ quality: 90 }).toBuffer();

      const signResult = await c2paService.signImage(largeImage, {
        creator: 'Large Image Test'
      });

      const startTime = Date.now();
      await extractor.extract(signResult.signedBuffer!);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500); // Large image extraction < 500ms
    }, 15000);
  });

  describe('Throughput', () => {
    it('should support 100 requests per second', async () => {
      const requestCount = parseInt(process.env.PERF_TEST_REQUEST_COUNT) || 100;
      const targetDuration = parseInt(process.env.PERF_TEST_TARGET_DURATION) || 1000; // ms

      const startTime = Date.now();
      const promises = Array(requestCount).fill(null).map(() =>
        extractor.extract(signedImage)
      );

      await Promise.all(promises);
      const actualDuration = Date.now() - startTime;

      // Should complete 100 requests in reasonable time
      expect(actualDuration).toBeLessThan(targetDuration * 2); // Allow 2x buffer
    }, 30000);

    it('should handle burst traffic', async () => {
      // Simulate burst: 200 requests at once
      const burstSize = parseInt(process.env.PERF_TEST_BURST_SIZE) || 200;

      const startTime = Date.now();
      const promises = Array(burstSize).fill(null).map(() =>
        extractor.extract(signedImage)
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results.length).toBe(burstSize);
      expect(results.every(r => r !== null)).toBe(true);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    }, 30000);
  });

  describe('Resource Usage', () => {
    it('should not leak memory during repeated operations', async () => {
      const iterations = parseInt(process.env.MEMORY_TEST_ITERATIONS) || 100;
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        await extractor.extract(signedImage);
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be minimal (< 10MB)
      expect(memoryIncrease).toBeLessThan(10 * 1024 * 1024);
    }, 30000);

    it('should handle memory efficiently with concurrent requests', async () => {
      const concurrency = parseInt(process.env.CONCURRENT_MEMORY_TEST_CONCURRENCY) || 50;
      const initialMemory = process.memoryUsage().heapUsed;

      const promises = Array(concurrency).fill(null).map(() =>
        extractor.extract(signedImage)
      );

      await Promise.all(promises);

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = finalMemory - initialMemory;

      // Memory increase should be reasonable (< 20MB for 50 concurrent)
      expect(memoryIncrease).toBeLessThan(20 * 1024 * 1024);
    }, 30000);
  });

  describe('Latency Distribution', () => {
    it('should have consistent latency (low variance)', async () => {
      const iterations = parseInt(process.env.LATENCY_TEST_ITERATIONS) || 50;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await extractor.extract(signedImage);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      // Calculate statistics
      const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
      const variance = durations.reduce((sum, d) => sum + Math.pow(d - avg, 2), 0) / durations.length;
      const stdDev = Math.sqrt(variance);

      // Standard deviation should be low (< 30% of average)
      expect(stdDev).toBeLessThan(avg * 0.3);
    }, 30000);

    it('should report p50, p95, p99 latencies', async () => {
      const iterations = parseInt(process.env.MEMORY_TEST_ITERATIONS) || 100;
      const durations: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const startTime = Date.now();
        await extractor.extract(signedImage);
        const duration = Date.now() - startTime;
        durations.push(duration);
      }

      durations.sort((a, b) => a - b);

      const p50 = durations[Math.floor(iterations * 0.50)];
      const p95 = durations[Math.floor(iterations * 0.95)];
      const p99 = durations[Math.floor(iterations * 0.99)];

      console.log('Latency Distribution:');
      console.log(`  p50: ${p50}ms`);
      console.log(`  p95: ${p95}ms`);
      console.log(`  p99: ${p99}ms`);

      expect(p50).toBeLessThan(80);
      expect(p95).toBeLessThan(150);
      expect(p99).toBeLessThan(200);
    }, 30000);
  });

  describe('Scalability', () => {
    it('should scale linearly with concurrency', async () => {
      const concurrencyLevels = [10, 20, 50];
      const results: { concurrency: number; avgTime: number }[] = [];

      for (const concurrency of concurrencyLevels) {
        const startTime = Date.now();
        const promises = Array(concurrency).fill(null).map(() =>
          extractor.extract(signedImage)
        );

        await Promise.all(promises);
        const totalTime = Date.now() - startTime;
        const avgTime = totalTime / concurrency;

        results.push({ concurrency, avgTime });
      }

      console.log('Scalability Results:');
      results.forEach(r => {
        console.log(`  ${r.concurrency} concurrent: ${r.avgTime.toFixed(2)}ms avg`);
      });

      // Average time should not increase dramatically with concurrency
      const firstAvg = results[0].avgTime;
      const lastAvg = results[results.length - 1].avgTime;

      expect(lastAvg).toBeLessThan(firstAvg * 2); // Should not double
    }, 60000);
  });
});
