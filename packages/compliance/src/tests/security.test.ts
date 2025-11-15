/**
 * Security Tests for Compliance v2 API
 * Tests for authentication, authorization, input validation, and attack prevention
 */

import { test, describe } from 'node:test';
import * as assert from 'node:assert';
import { ComplianceAPIServer } from '../api.js';

describe('Security Tests', () => {
  let server: ComplianceAPIServer;

  test.before(() => {
    server = new ComplianceAPIServer('https://test.example.com');
  });

  test('should reject requests without authentication', async () => {
    const fastify = server.getServer();
    
    const response = await fastify.inject({
      method: 'POST',
      url: '/compliance/packs',
      payload: {
        tenant_id: 'test',
        period: '2025-10',
        regions: ['EU'],
        format: 'json'
      }
    });

    assert.strictEqual(response.statusCode, 401);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.error, 'Unauthorized');
  });

  test('should reject requests with invalid tenant_id format', async () => {
    const fastify = server.getServer();
    
    const response = await fastify.inject({
      method: 'POST',
      url: '/compliance/packs',
      headers: {
        authorization: 'Bearer test-token'
      },
      payload: {
        tenant_id: 'invalid@tenant', // Contains invalid character
        period: '2025-10',
        regions: ['EU'],
        format: 'json'
      }
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.ok(body.error.includes('Validation Error'));
  });

  test('should reject requests with invalid period format', async () => {
    const fastify = server.getServer();
    
    const response = await fastify.inject({
      method: 'POST',
      url: '/compliance/packs',
      headers: {
        authorization: 'Bearer test-token'
      },
      payload: {
        tenant_id: 'valid-tenant',
        period: '2025-13', // Invalid month
        regions: ['EU'],
        format: 'json'
      }
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.ok(body.error.includes('Validation Error'));
  });

  test('should reject requests with invalid regions', async () => {
    const fastify = server.getServer();
    
    const response = await fastify.inject({
      method: 'POST',
      url: '/compliance/packs',
      headers: {
        authorization: 'Bearer test-token'
      },
      payload: {
        tenant_id: 'valid-tenant',
        period: '2025-10',
        regions: ['INVALID_REGION'],
        format: 'json'
      }
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    assert.ok(body.error.includes('Validation Error'));
  });

  test('should include security headers', async () => {
    const fastify = server.getServer();
    
    const response = await fastify.inject({
      method: 'GET',
      url: '/health'
    });

    assert.strictEqual(response.statusCode, 200);
    assert.strictEqual(response.headers['x-content-type-options'], 'nosniff');
    assert.strictEqual(response.headers['x-frame-options'], 'DENY');
    assert.strictEqual(response.headers['x-xss-protection'], '1; mode=block');
    assert.ok(response.headers['strict-transport-security']);
    assert.ok(response.headers['content-security-policy']);
  });

  test('should prevent XSS in error responses', async () => {
    const fastify = server.getServer();
    
    const response = await fastify.inject({
      method: 'POST',
      url: '/compliance/packs',
      headers: {
        authorization: 'Bearer test-token'
      },
      payload: {
        tenant_id: '<script>alert("xss")</script>',
        period: '2025-10',
        regions: ['EU'],
        format: 'json'
      }
    });

    assert.strictEqual(response.statusCode, 400);
    const body = JSON.parse(response.body);
    // Ensure script tags are not echoed back
    assert.ok(!body.message.includes('<script>'));
  });

  test('should enforce HTTPS in production', () => {
    process.env.NODE_ENV = 'production';
    
    assert.throws(() => {
      new ComplianceAPIServer('http://insecure.example.com');
    }, /HTTPS required for storage base URL in production/);
    
    delete process.env.NODE_ENV;
  });
});
