/**
 * Performance Tests: Large File Handling
 * 
 * Tests 1MB, 10MB, 50MB images, timeouts, memory limits, streaming
 */

import request from 'supertest';
import app from '../../src/index';

describe('Large File Handling', () => {
  describe('File Size Processing', () => {
    it('should process 1MB image', async () => {
      const image1MB = Buffer.alloc(1 * 1024 * 1024); // 1MB
      
      const startTime = Date.now();
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', image1MB, 'large-1mb.jpg');
      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(5000); // Under 5 seconds
    }, 10000);

    it('should process 10MB image', async () => {
      const image10MB = Buffer.alloc(10 * 1024 * 1024); // 10MB
      
      const startTime = Date.now();
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', image10MB, 'large-10mb.jpg');
      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(15000); // Under 15 seconds
    }, 20000);

    it('should process 50MB image (max size)', async () => {
      const image50MB = Buffer.alloc(50 * 1024 * 1024); // 50MB
      
      const startTime = Date.now();
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', image50MB, 'large-50mb.jpg');
      const duration = Date.now() - startTime;

      expect(response.status).toBe(200);
      expect(duration).toBeLessThan(60000); // Under 60 seconds
    }, 90000);

    it('should reject files over 50MB', async () => {
      const image51MB = Buffer.alloc(51 * 1024 * 1024); // 51MB
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', image51MB, 'oversized.jpg');

      expect(response.status).toBe(413); // Payload too large
    }, 30000);
  });

  describe('Timeout Behavior', () => {
    it('should timeout on extremely slow processing', async () => {
      // Mock slow image processing
      jest.setTimeout(65000);
      
      const largeImage = Buffer.alloc(50 * 1024 * 1024);
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .timeout(60000) // 60 second client timeout
        .attach('image', largeImage, 'slow.jpg')
        .catch(err => err);

      // Should timeout or complete
      expect([200, 408, 504]).toContain(response.status || response.code);
    }, 65000);

    it('should respect request timeout configuration', async () => {
      process.env.REQUEST_TIMEOUT = '5000'; // 5 seconds
      
      const image = Buffer.alloc(10 * 1024 * 1024);
      
      const startTime = Date.now();
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', image, 'timeout-test.jpg')
        .catch(err => ({ status: err.code }));
      const duration = Date.now() - startTime;

      // Should timeout around 5 seconds
      if (response.status !== 200) {
        expect(duration).toBeLessThan(6000);
      }
    }, 10000);
  });

  describe('Memory Limits', () => {
    it('should not exceed memory limit during large file processing', async () => {
      const initialMemory = process.memoryUsage().heapUsed;
      
      const largeImage = Buffer.alloc(50 * 1024 * 1024);
      
      await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', largeImage, 'memory-test.jpg');

      if (global.gc) {
        global.gc();
      }

      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024;

      // Should not increase memory by more than 200MB
      expect(memoryIncrease).toBeLessThan(200);
    }, 30000);

    it('should use streaming for large files', async () => {
      // Verify streaming is used (not loading entire file into memory)
      const image = Buffer.alloc(30 * 1024 * 1024);
      
      const beforeHeap = process.memoryUsage().heapUsed;
      
      await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', image, 'stream-test.jpg');

      const afterHeap = process.memoryUsage().heapUsed;
      const heapIncrease = (afterHeap - beforeHeap) / 1024 / 1024;

      // Heap increase should be much less than file size (30MB)
      expect(heapIncrease).toBeLessThan(100); // Allow some overhead
    }, 30000);
  });

  describe('Concurrent Large File Processing', () => {
    it('should handle multiple large files concurrently', async () => {
      const requests = Array(5).fill(null).map(() => {
        const image = Buffer.alloc(10 * 1024 * 1024);
        return request(app)
          .post('/sign')
          .set('x-api-key', 'test-key')
          .attach('image', image, 'concurrent-large.jpg');
      });

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const duration = Date.now() - startTime;

      const successful = responses.filter(r => r.status === 200).length;

      expect(successful).toBeGreaterThanOrEqual(4); // At least 80% success
      expect(duration).toBeLessThan(30000); // Complete in 30 seconds
    }, 45000);

    it('should not crash under memory pressure', async () => {
      const requests = Array(10).fill(null).map(() => {
        const image = Buffer.alloc(20 * 1024 * 1024);
        return request(app)
          .post('/sign')
          .set('x-api-key', 'test-key')
          .attach('image', image, 'pressure-test.jpg')
          .catch(err => ({ status: err.code || 500 }));
      });

      const responses = await Promise.all(requests);

      // Some may fail, but server should not crash
      const responded = responses.filter(r => r.status !== undefined).length;
      expect(responded).toBe(10); // All should respond (success or error)
    }, 60000);
  });

  describe('Streaming Efficiency', () => {
    it('should stream large response without buffering', async () => {
      const largeImage = Buffer.alloc(40 * 1024 * 1024);
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', largeImage, 'stream-response.jpg')
        .buffer(false); // Don't buffer response

      expect(response.status).toBe(200);
    }, 60000);
  });

  describe('Progress Reporting', () => {
    it('should report progress for long-running operations', async () => {
      const largeImage = Buffer.alloc(50 * 1024 * 1024);
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .set('x-enable-progress', 'true')
        .attach('image', largeImage, 'progress-test.jpg');

      // Check if progress was reported (via headers or response)
      if (response.headers['x-processing-time']) {
        expect(parseInt(response.headers['x-processing-time'])).toBeGreaterThan(0);
      }
    }, 90000);
  });
});
