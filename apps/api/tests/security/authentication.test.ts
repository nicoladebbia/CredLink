/**
 * Authentication & Authorization Tests
 * Testing API key validation and permission-based access
 */

import request from 'supertest';

describe('Authentication Tests', () => {
  const baseUrl = 'http://localhost:3000';

  describe('API Key Validation', () => {
    it('should reject requests without API key', async () => {
      const response = await request(baseUrl)
        .get('/api/status')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Invalid credentials');
    });

    it('should reject invalid API keys', async () => {
      const response = await request(baseUrl)
        .get('/api/status')
        .set('X-API-Key', 'invalid-key-12345')
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toContain('Invalid credentials');
    });

    it('should accept valid admin API key', async () => {
      const response = await request(baseUrl)
        .get('/api/status')
        .set('X-API-Key', 'demo-admin-key')
        .expect(200);

      expect(response.body.status).toBe('operational');
      expect(response.body.user).toBeDefined();
      expect(response.body.user.role).toBe('admin');
      expect(response.body.user.tier).toBe('enterprise');
    });

    it('should accept valid user API key', async () => {
      const response = await request(baseUrl)
        .get('/api/status')
        .set('X-API-Key', 'demo-user-key')
        .expect(200);

      expect(response.body.user.role).toBe('user');
      expect(response.body.user.tier).toBe('pro');
    });

    it('should accept valid readonly API key', async () => {
      const response = await request(baseUrl)
        .get('/api/status')
        .set('X-API-Key', 'demo-readonly-key')
        .expect(200);

      expect(response.body.user.role).toBe('readonly');
      expect(response.body.user.tier).toBe('free');
    });
  });

  describe('Permission-Based Authorization', () => {
    it('should allow admin to sign images', async () => {
      const response = await request(baseUrl)
        .post('/api/sign')
        .set('X-API-Key', 'demo-admin-key')
        .set('Content-Type', 'application/json')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should allow user to sign images', async () => {
      const response = await request(baseUrl)
        .post('/api/sign')
        .set('X-API-Key', 'demo-user-key')
        .set('Content-Type', 'application/json')
        .send({})
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    // Note: In production, readonly role should be blocked from signing
    // Current demo allows all authenticated users
  });

  describe('User Context', () => {
    it('should return user info in authenticated requests', async () => {
      const response = await request(baseUrl)
        .get('/api/status')
        .set('X-API-Key', 'demo-admin-key')
        .expect(200);

      expect(response.body.user).toBeDefined();
      expect(response.body.user).toHaveProperty('id');
      expect(response.body.user).toHaveProperty('role');
      expect(response.body.user).toHaveProperty('tier');
      expect(response.body.user.id).toBe('admin');
    });

    it('should track different users separately', async () => {
      const adminResponse = await request(baseUrl)
        .get('/api/status')
        .set('X-API-Key', 'demo-admin-key')
        .expect(200);

      const userResponse = await request(baseUrl)
        .get('/api/status')
        .set('X-API-Key', 'demo-user-key')
        .expect(200);

      expect(adminResponse.body.user.id).not.toBe(userResponse.body.user.id);
      expect(adminResponse.body.user.tier).not.toBe(userResponse.body.user.tier);
    });
  });

  describe('Security Features', () => {
    it('should sanitize error messages', async () => {
      const response = await request(baseUrl)
        .get('/api/status')
        .set('X-API-Key', '<script>alert("xss")</script>')
        .expect(401);

      expect(response.body.error.message).not.toContain('<script>');
      expect(response.body.error.message).not.toContain('alert');
    });

    it('should include timestamp in error responses', async () => {
      const response = await request(baseUrl)
        .get('/api/status')
        .set('X-API-Key', 'invalid')
        .expect(401);

      expect(response.body.error).toHaveProperty('timestamp');
      expect(new Date(response.body.error.timestamp)).toBeInstanceOf(Date);
    });

    it('should include status code in error responses', async () => {
      const response = await request(baseUrl)
        .get('/api/status')
        .set('X-API-Key', 'invalid')
        .expect(401);

      expect(response.body.error.statusCode).toBe(401);
    });
  });
});
