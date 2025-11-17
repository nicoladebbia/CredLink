/**
 * Performance Tests: Load Testing
 * 
 * Tests concurrent requests, memory usage, response times
 */

import request from 'supertest';
import app from '../../src/index';
import fs from 'fs';
import path from 'path';
import { TEST_CONSTANTS } from '../config/test-constants';

describe('Load Testing', () => {
  const testImage = fs.readFileSync(
    path.join(__dirname, '../../test-fixtures/images/test-image.jpg')
  );

  describe('Concurrent Sign Requests', () => {
    it('should handle 100 concurrent requests', async () => {
      const requests = Array(100).fill(null).map((_, i) =>
        request(app)
          .post('/sign')
          .attach('image', testImage, `test-${i}.jpg`)
          .field('creator', `User ${i}`)
      );

      const startTime = Date.now();
      const results = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const successful = results.filter(r => r.status === 200).length;
      const failed = results.filter(r => r.status !== 200).length;

      console.log(`Load test: ${successful} succeeded, ${failed} failed in ${duration}ms`);

      expect(successful).toBeGreaterThanOrEqual(95); // 95% success rate
      expect(duration).toBeLessThan(30000); // Complete in 30 seconds
    }, 60000);

    it('should handle 50 concurrent verify requests', async () => {
      // First, sign an image
      const signResponse = await request(app)
        .post('/sign')
        .attach('image', testImage, 'test.jpg')
        .expect(200);

      const signedImage = signResponse.body;

      // Now verify 50 times concurrently
      const requests = Array(50).fill(null).map(() =>
        request(app)
          .post('/verify')
          .attach('image', signedImage, 'signed.jpg')
      );

      const results = await Promise.all(requests);

      const successful = results.filter(r => r.status === 200).length;
      expect(successful).toBe(50);
    }, 30000);
  });

  describe('Response Time Percentiles', () => {
    it('should measure p50, p95, p99 response times', async () => {
      const iterations = 100;
      const responseTimes: number[] = [];

      for (let i = 0; i < iterations; i++) {
        const start = Date.now();
        
        await request(app)
          .post('/sign')
          .attach('image', testImage, 'test.jpg');
        
        responseTimes.push(Date.now() - start);
      }

      responseTimes.sort((a, b) => a - b);

      const p50 = responseTimes[Math.floor(iterations * 0.50)];
      const p95 = responseTimes[Math.floor(iterations * 0.95)];
      const p99 = responseTimes[Math.floor(iterations * 0.99)];

      console.log(`Response times - p50: ${p50}ms, p95: ${p95}ms, p99: ${p99}ms`);

      expect(p50).toBeLessThan(500); // 500ms median
      expect(p95).toBeLessThan(TEST_CONSTANTS.PERFORMANCE_THRESHOLD_MS); // configurable threshold p95
      expect(p99).toBeLessThan(5000); // 5s p99
    }, 120000);
  });

  describe('Throughput', () => {
    it('should process at least 10 images/second', async () => {
      const testDuration = 10000; // 10 seconds
      const startTime = Date.now();
      let processed = 0;

      while (Date.now() - startTime < testDuration) {
        await request(app)
          .post('/sign')
          .attach('image', testImage, 'test.jpg');
        
        processed++;
      }

      const actualDuration = Date.now() - startTime;
      const throughput = (processed / actualDuration) * 1000;

      console.log(`Throughput: ${throughput.toFixed(2)} images/second`);

      expect(throughput).toBeGreaterThanOrEqual(10);
    }, 15000);
  });

  describe('Memory Usage', () => {
    it('should not leak memory under load', async () => {
      const iterations = 50;
      const initialMemory = process.memoryUsage().heapUsed;

      for (let i = 0; i < iterations; i++) {
        await request(app)
          .post('/sign')
          .attach('image', testImage, 'test.jpg');
      }

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      console.log(`Memory increase: ${memoryIncrease.toFixed(2)}MB`);

      expect(memoryIncrease).toBeLessThan(100); // Max 100MB increase
    }, 60000);
  });
});
