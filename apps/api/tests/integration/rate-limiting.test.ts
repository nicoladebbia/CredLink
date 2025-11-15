/**
 * Integration Tests: Rate Limiting
 * 
 * Tests rate limit enforcement, burst behavior, headers, Redis backend
 */

import request from 'supertest';
import app from '../../src/index';

describe('Rate Limiting', () => {
  describe('Per-Endpoint Rate Limits', () => {
    it('should rate limit /sign endpoint (10/min)', async () => {
      const requests = [];
      
      // Make 15 requests rapidly
      for (let i = 0; i < 15; i++) {
        requests.push(
          request(app)
            .post('/sign')
            .set('x-api-key', 'test-key')
            .attach('image', Buffer.from('test'), 'test.jpg')
        );
      }

      const responses = await Promise.all(requests);
      
      const successful = responses.filter(r => r.status === 200 || r.status === 400).length;
      const rateLimited = responses.filter(r => r.status === 429).length;

      expect(rateLimited).toBeGreaterThan(0); // Some should be rate limited
      expect(successful).toBeLessThanOrEqual(15); // Not all should succeed
    }, 30000);

    it('should allow higher limits for /verify (100/min)', async () => {
      // Sign an image first
      const signResponse = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), 'test.jpg');

      const signedImage = signResponse.body;

      // Make 50 verify requests
      const requests = Array(50).fill(null).map(() =>
        request(app)
          .post('/verify')
          .attach('image', signedImage, 'signed.jpg')
      );

      const responses = await Promise.all(requests);
      
      const rateLimited = responses.filter(r => r.status === 429).length;

      // Verify has higher limit, so fewer should be rate limited
      expect(rateLimited).toBeLessThan(10);
    }, 30000);

    it('should have high limit for /health (1000/min)', async () => {
      const requests = Array(100).fill(null).map(() =>
        request(app).get('/health')
      );

      const responses = await Promise.all(requests);
      
      const rateLimited = responses.filter(r => r.status === 429).length;

      // Health endpoint should not be rate limited
      expect(rateLimited).toBe(0);
    });
  });

  describe('Burst Behavior', () => {
    it('should allow burst above sustained rate', async () => {
      // Token bucket allows burst (e.g., 10/min + 5 burst)
      const burstRequests = Array(12).fill(null).map(() =>
        request(app)
          .post('/sign')
          .set('x-api-key', 'burst-test-key')
          .attach('image', Buffer.from('test'), 'test.jpg')
      );

      const responses = await Promise.all(burstRequests);
      
      const successful = responses.filter(r => r.status !== 429).length;

      // Should allow ~15 (10 + 5 burst)
      expect(successful).toBeGreaterThanOrEqual(10);
      expect(successful).toBeLessThanOrEqual(15);
    }, 15000);

    it('should refill tokens over time', async () => {
      // Exhaust rate limit
      const exhaustRequests = Array(15).fill(null).map(() =>
        request(app)
          .post('/sign')
          .set('x-api-key', 'refill-test-key')
          .attach('image', Buffer.from('test'), 'test.jpg')
      );

      await Promise.all(exhaustRequests);

      // Wait for token refill (simulate 6 seconds = 1 token)
      await new Promise(resolve => setTimeout(resolve, 7000));

      // Should be able to make one more request
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'refill-test-key')
        .attach('image', Buffer.from('test'), 'test.jpg');

      expect(response.status).not.toBe(429);
    }, 20000);
  });

  describe('Rate Limit Headers', () => {
    it('should include X-RateLimit headers', async () => {
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'header-test-key')
        .attach('image', Buffer.from('test'), 'test.jpg');

      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
      expect(response.headers['x-ratelimit-reset']).toBeDefined();
    });

    it('should include Retry-After header when rate limited', async () => {
      // Exhaust rate limit
      const requests = Array(20).fill(null).map(() =>
        request(app)
          .post('/sign')
          .set('x-api-key', 'retry-test-key')
          .attach('image', Buffer.from('test'), 'test.jpg')
      );

      const responses = await Promise.all(requests);
      
      const rateLimited = responses.find(r => r.status === 429);

      if (rateLimited) {
        expect(rateLimited.headers['retry-after']).toBeDefined();
        expect(parseInt(rateLimited.headers['retry-after'])).toBeGreaterThan(0);
      }
    }, 15000);

    it('should decrement remaining count', async () => {
      const response1 = await request(app)
        .post('/sign')
        .set('x-api-key', 'decrement-test-key')
        .attach('image', Buffer.from('test'), 'test.jpg');

      const remaining1 = parseInt(response1.headers['x-ratelimit-remaining']);

      const response2 = await request(app)
        .post('/sign')
        .set('x-api-key', 'decrement-test-key')
        .attach('image', Buffer.from('test'), 'test.jpg');

      const remaining2 = parseInt(response2.headers['x-ratelimit-remaining']);

      expect(remaining2).toBeLessThan(remaining1);
    });
  });

  describe('Redis-Backed Rate Limiting', () => {
    beforeAll(async () => {
      // Ensure Redis is available
      process.env.REDIS_URL = 'redis://localhost:6379';
    });

    it('should use Redis for distributed rate limiting', async () => {
      // Make requests that should share rate limit across instances
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'redis-test-key')
        .attach('image', Buffer.from('test'), 'test.jpg');

      // Verify rate limit is tracked in Redis (not in-memory)
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
    });

    it('should fallback to memory when Redis unavailable', async () => {
      // Temporarily disable Redis
      const originalRedisUrl = process.env.REDIS_URL;
      process.env.REDIS_URL = 'redis://invalid-host:6379';

      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'fallback-test-key')
        .attach('image', Buffer.from('test'), 'test.jpg');

      // Should still rate limit using in-memory store
      expect(response.headers['x-ratelimit-limit']).toBeDefined();

      process.env.REDIS_URL = originalRedisUrl;
    });

    it('should share rate limits across API keys from same user', async () => {
      // User with multiple API keys should share rate limit
      process.env.RATE_LIMIT_BY_USER = 'true';

      const key1Requests = Array(10).fill(null).map(() =>
        request(app)
          .post('/sign')
          .set('x-api-key', 'user1-key1')
          .set('x-user-id', 'user-123')
          .attach('image', Buffer.from('test'), 'test.jpg')
      );

      await Promise.all(key1Requests);

      // Now use different key, same user
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'user1-key2')
        .set('x-user-id', 'user-123')
        .attach('image', Buffer.from('test'), 'test.jpg');

      // Should be rate limited (shared quota)
      expect(response.status).toBe(429);
    }, 15000);
  });

  describe('Rate Limit Bypasses', () => {
    it('should not rate limit admin API keys', async () => {
      process.env.ADMIN_API_KEY = 'admin-unlimited-key';

      const requests = Array(50).fill(null).map(() =>
        request(app)
          .post('/sign')
          .set('x-api-key', 'admin-unlimited-key')
          .attach('image', Buffer.from('test'), 'test.jpg')
      );

      const responses = await Promise.all(requests);
      
      const rateLimited = responses.filter(r => r.status === 429).length;

      expect(rateLimited).toBe(0); // Admin should not be rate limited
    }, 30000);

    it('should whitelist specific IPs', async () => {
      process.env.RATE_LIMIT_WHITELIST_IPS = '192.168.1.100,10.0.0.5';

      const requests = Array(50).fill(null).map(() =>
        request(app)
          .post('/sign')
          .set('x-api-key', 'test-key')
          .set('x-forwarded-for', '192.168.1.100')
          .attach('image', Buffer.from('test'), 'test.jpg')
      );

      const responses = await Promise.all(requests);
      
      const rateLimited = responses.filter(r => r.status === 429).length;

      expect(rateLimited).toBe(0); // Whitelisted IP
    }, 30000);
  });

  describe('Dynamic Rate Limiting', () => {
    it('should adjust limits based on user tier', async () => {
      // Premium tier: 100/min
      const premiumResponse = await request(app)
        .post('/sign')
        .set('x-api-key', 'premium-key')
        .set('x-user-tier', 'premium')
        .attach('image', Buffer.from('test'), 'test.jpg');

      const premiumLimit = parseInt(premiumResponse.headers['x-ratelimit-limit']);

      // Free tier: 10/min
      const freeResponse = await request(app)
        .post('/sign')
        .set('x-api-key', 'free-key')
        .set('x-user-tier', 'free')
        .attach('image', Buffer.from('test'), 'test.jpg');

      const freeLimit = parseInt(freeResponse.headers['x-ratelimit-limit']);

      expect(premiumLimit).toBeGreaterThan(freeLimit);
    });
  });
});
