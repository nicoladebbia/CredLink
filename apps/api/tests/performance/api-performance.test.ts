/**
 * API Performance Tests
 * Testing response times and throughput
 */

import request from 'supertest';

describe('API Performance Tests', () => {
  const baseUrl = 'http://localhost:3000';
  const apiKey = 'demo-admin-key';

  describe('Response Time Benchmarks', () => {
    it('should respond to health check in < 50ms', async () => {
      const start = Date.now();
      
      await request(baseUrl)
        .get('/health')
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50);
    });

    it('should respond to status check in < 100ms', async () => {
      const start = Date.now();
      
      await request(baseUrl)
        .get('/api/status')
        .set('X-API-Key', apiKey)
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });

    it('should respond to formats endpoint in < 50ms', async () => {
      const start = Date.now();
      
      await request(baseUrl)
        .get('/api/formats')
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(50);
    });

    it('should respond to sign request in < 200ms', async () => {
      const start = Date.now();
      
      await request(baseUrl)
        .post('/api/sign')
        .set('X-API-Key', apiKey)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(200);
    });
  });

  describe('Throughput Tests', () => {
    it('should handle 50 requests per second', async () => {
      const requestCount = 50;
      const start = Date.now();
      
      const promises = Array.from({ length: requestCount }, () =>
        request(baseUrl)
          .get('/health')
          .expect(200)
      );

      await Promise.all(promises);
      const duration = Date.now() - start;

      // Should complete 50 requests in < 1 second
      expect(duration).toBeLessThan(1000);
      
      const rps = Math.floor(requestCount / (duration / 1000));
      expect(rps).toBeGreaterThanOrEqual(50);
    });

    it('should maintain performance under concurrent load', async () => {
      const batches = 3;
      const batchSize = 20;
      const times: number[] = [];

      for (let i = 0; i < batches; i++) {
        const start = Date.now();
        
        const promises = Array.from({ length: batchSize }, () =>
          request(baseUrl)
            .get('/health')
            .expect(200)
        );

        await Promise.all(promises);
        times.push(Date.now() - start);
      }

      // Performance should not degrade significantly
      const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
      expect(avgTime).toBeLessThan(500);
    });
  });

  describe('Resource Efficiency', () => {
    it('should handle sequential requests efficiently', async () => {
      const requestCount = 100;
      const start = Date.now();

      for (let i = 0; i < requestCount; i++) {
        await request(baseUrl)
          .get('/health')
          .expect(200);
      }

      const duration = Date.now() - start;
      const avgTime = duration / requestCount;

      // Average time per request should be < 20ms
      expect(avgTime).toBeLessThan(20);
    });

    it('should not accumulate response time with multiple operations', async () => {
      const times: number[] = [];

      for (let i = 0; i < 5; i++) {
        const start = Date.now();
        
        await request(baseUrl)
          .post('/api/sign')
          .set('X-API-Key', apiKey)
          .set('Content-Type', 'application/json')
          .send({})
          .expect(200);
        
        times.push(Date.now() - start);
      }

      // Last request should not be significantly slower than first
      const firstTime = times[0];
      const lastTime = times[times.length - 1];
      
      expect(lastTime).toBeLessThan(firstTime * 1.5); // Within 50% of first request
    });
  });

  describe('Stress Testing', () => {
    it('should survive burst of 100 concurrent requests', async () => {
      const promises = Array.from({ length: 100 }, () =>
        request(baseUrl)
          .get('/health')
      );

      const results = await Promise.all(promises);
      const successful = results.filter(r => r.status === 200);
      
      expect(successful.length).toBe(100);
    });

    it('should handle mixed endpoint load', async () => {
      const endpoints = [
        () => request(baseUrl).get('/health'),
        () => request(baseUrl).get('/api/formats'),
        () => request(baseUrl).get('/metrics'),
        () => request(baseUrl).get('/api/security-info')
      ];

      const promises = Array.from({ length: 40 }, (_, i) => {
        const endpoint = endpoints[i % endpoints.length];
        return endpoint();
      });

      const results = await Promise.all(promises);
      const successful = results.filter(r => r.status === 200);
      
      expect(successful.length).toBe(40);
    });
  });

  describe('P95 Performance', () => {
    it('should meet P95 latency requirements', async () => {
      const requestCount = 100;
      const times: number[] = [];

      // Make 100 requests and measure each
      for (let i = 0; i < requestCount; i++) {
        const start = Date.now();
        
        await request(baseUrl)
          .get('/health')
          .expect(200);
        
        times.push(Date.now() - start);
      }

      // Sort and get P95
      times.sort((a, b) => a - b);
      const p95Index = Math.floor(requestCount * 0.95);
      const p95Time = times[p95Index];

      // P95 should be < 100ms
      expect(p95Time).toBeLessThan(100);
    });
  });
});
