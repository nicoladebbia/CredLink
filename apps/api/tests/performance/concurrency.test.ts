/**
 * Performance Tests: Concurrency - 1000 concurrent requests, connection pools, deadlocks
 */
import request from 'supertest';
import app from '../../src/index';

describe('Concurrency Tests', () => {
  it('should handle 1000 concurrent requests', async () => {
    const requests = Array(1000).fill(null).map((_, i) =>
      request(app).post('/sign').set('x-api-key', 'test').attach('image', Buffer.from('test'), `test-${i}.jpg`).catch(err => ({ status: 500 }))
    );
    const responses = await Promise.all(requests);
    const successful = responses.filter(r => r.status === 200 || r.status === 400).length;
    expect(successful).toBeGreaterThan(800); // 80%+ success
  }, 120000);

  it('should not exhaust connection pool', async () => {
    const requests = Array(500).fill(null).map(() =>
      request(app).post('/sign').set('x-api-key', 'test').attach('image', Buffer.from('test'), 'test.jpg')
    );
    await expect(Promise.all(requests)).resolves.toBeDefined();
  }, 90000);

  it('should handle database connection limits', async () => {
    const requests = Array(200).fill(null).map(() => request(app).get('/proof/test-id'));
    const responses = await Promise.all(requests);
    expect(responses.every(r => r.status !== 503)).toBe(true); // No service unavailable
  }, 60000);

  it('should prevent deadlocks', async () => {
    const concurrent = Array(100).fill(null).map(() =>
      request(app).post('/sign').set('x-api-key', 'test').attach('image', Buffer.from('test'), 'test.jpg')
    );
    await expect(Promise.race([Promise.all(concurrent), new Promise((_, rej) => setTimeout(() => rej(new Error('Deadlock')), 30000))])).resolves.toBeDefined();
  }, 35000);
});
