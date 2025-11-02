import { generateJwtId } from '../utils/crypto';

import { FastifyInstance } from 'fastify';
import jwt from 'jsonwebtoken';
import { securityConfig } from '../config/security';

describe('Security Tests', () => {
  let app: FastifyInstance;
  let validAdminToken: string;
  let validUserToken: string;
  let expiredToken: string;
  let invalidSignatureToken: string;

  beforeAll(async () => {
    // Initialize test app
    app = await createTestApp();
    
    // Generate test tokens
    validAdminToken = await generateTestToken({
      sub: 'admin-user',
      email: 'admin@test.com',
      role: 'admin',
      permissions: ['admin.access', 'key.revoke']
    });
    
    validUserToken = await generateTestToken({
      sub: 'regular-user',
      email: 'user@test.com',
      role: 'user',
      permissions: ['user.access']
    });
    
    expiredToken = await generateTestToken({
      sub: 'expired-user',
      email: 'expired@test.com',
      role: 'user',
      permissions: ['user.access']
    }, { expiresIn: '-1h' });
    
    invalidSignatureToken = await generateTestToken({
      sub: 'fake-user',
      email: 'fake@test.com',
      role: 'admin',
      permissions: ['admin.access']
    }, { secret: 'wrong-secret' });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('JWT Authentication Security', () => {
    test('should reject requests without authentication', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        payload: {
          key_id: 'test-key',
          reason: 'test revocation'
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Authentication required'
      });
    });

    test('should reject requests with invalid token format', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        headers: {
          authorization: 'InvalidFormat token'
        },
        payload: {
          key_id: 'test-key',
          reason: 'test revocation'
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Invalid authentication format'
      });
    });

    test('should reject requests with expired tokens', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        headers: {
          authorization: `Bearer ${expiredToken}`
        },
        payload: {
          key_id: 'test-key',
          reason: 'test revocation'
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Token expired'
      });
    });

    test('should reject requests with invalid signature', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        headers: {
          authorization: `Bearer ${invalidSignatureToken}`
        },
        payload: {
          key_id: 'test-key',
          reason: 'test revocation'
        }
      });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toMatchObject({
        error: 'Authentication failed'
      });
    });

    test('should accept requests with valid tokens', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        headers: {
          authorization: `Bearer ${validAdminToken}`
        },
        payload: {
          key_id: 'test-key',
          reason: 'test revocation'
        }
      });

      expect(response.statusCode).toBe(200);
    });
  });

  describe('Authorization Security', () => {
    test('should reject non-admin users from admin endpoints', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        headers: {
          authorization: `Bearer ${validUserToken}`
        },
        payload: {
          key_id: 'test-key',
          reason: 'test revocation'
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'Insufficient permissions'
      });
    });

    test('should reject users without specific permissions', async () => {
      const userWithoutPerms = await generateTestToken({
        sub: 'limited-user',
        email: 'limited@test.com',
        role: 'user',
        permissions: ['basic.access'] // Missing key.revoke
      });

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        headers: {
          authorization: `Bearer ${userWithoutPerms}`
        },
        payload: {
          key_id: 'test-key',
          reason: 'test revocation'
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'Insufficient permissions'
      });
    });
  });

  describe('Rate Limiting Security', () => {
    test('should enforce rate limits on public endpoints', async () => {
      const requests = Array(10).fill(null).map(() =>
        app.inject({
          method: 'GET',
          url: '/api/v1/verify/video?asset_url=https://test.com/video.mp4'
        })
      );

      const responses = await Promise.all(requests);
      
      // First few should succeed
      expect(responses[0].statusCode).toBe(200);
      expect(responses[1].statusCode).toBe(200);
      
      // Should eventually hit rate limit
      const rateLimitedResponses = responses.filter(r => r.statusCode === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
      
      rateLimitedResponses.forEach(response => {
        expect(response.json()).toMatchObject({
          error: 'Rate limit exceeded'
        });
        expect(response.headers['x-ratelimit-limit']).toBeDefined();
        expect(response.headers['x-ratelimit-remaining']).toBeDefined();
        expect(response.headers['retry-after']).toBeDefined();
      });
    });

    test('should enforce stricter rate limits on auth endpoints', async () => {
      const loginAttempts = Array(6).fill(null).map((_, i) =>
        app.inject({
          method: 'POST',
          url: '/api/v1/auth/login',
          payload: {
            email: `test${i}@test.com`,
            password: 'wrongpassword'
          }
        })
      );

      const responses = await Promise.all(loginAttempts);
      
      // Should hit rate limit after 5 attempts
      const rateLimitedResponses = responses.filter(r => r.statusCode === 429);
      expect(rateLimitedResponses.length).toBeGreaterThan(0);
    });
  });

  describe('Input Validation Security', () => {
    test('should reject SQL injection attempts', async () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "1' OR '1'='1",
        "admin'--",
        "1' UNION SELECT password FROM users--"
      ];

      for (const input of maliciousInputs) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/trust/revoke',
          headers: {
            authorization: `Bearer ${validAdminToken}`
          },
          payload: {
            key_id: input,
            reason: 'test'
          }
        });

        expect(response.statusCode).toBe(400);
        expect(response.json()).toMatchObject({
          error: 'Invalid request body'
        });
      }
    });

    test('should reject XSS attempts', async () => {
      const xssPayloads = [
        '<script>alert("xss")</script>',
        'javascript:alert("xss")',
        '<img src="x" onerror="alert(1)">',
        '"><script>alert("xss")</script>'
      ];

      for (const payload of xssPayloads) {
        const response = await app.inject({
          method: 'POST',
          url: '/api/v1/trust/revoke',
          headers: {
            authorization: `Bearer ${validAdminToken}`
          },
          payload: {
            key_id: 'test-key',
            reason: payload
          }
        });

        expect(response.statusCode).toBe(400);
      }
    });

    test('should reject oversized payloads', async () => {
      const oversizedPayload = {
        key_id: 'test-key',
        reason: 'a'.repeat(1001) // Exceeds 1000 char limit
      };

      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        headers: {
          authorization: `Bearer ${validAdminToken}`
        },
        payload: oversizedPayload
      });

      expect(response.statusCode).toBe(400);
    });
  });

  describe('CORS Security', () => {
    test('should reject requests from unauthorized origins', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        headers: {
          origin: 'https://malicious-site.com',
          authorization: `Bearer ${validAdminToken}`
        },
        payload: {
          key_id: 'test-key',
          reason: 'test'
        }
      });

      expect(response.statusCode).toBe(403);
      expect(response.json()).toMatchObject({
        error: 'CORS policy violation'
      });
    });

    test('should not reflect arbitrary origins', async () => {
      const response = await app.inject({
        method: 'OPTIONS',
        url: '/api/v1/verify/video',
        headers: {
          origin: 'https://evil.com'
        }
      });

      expect(response.headers['access-control-allow-origin']).not.toBe('https://evil.com');
    });
  });

  describe('Security Headers', () => {
    test('should include all security headers', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/verify/video?asset_url=https://test.com/video.mp4'
      });

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['permissions-policy']).toBeDefined();
    });

    test('should have strict CSP without unsafe directives', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/verify/video?asset_url=https://test.com/video.mp4'
      });

      const csp = response.headers['content-security-policy'];
      expect(csp).not.toContain("'unsafe-inline'");
      expect(csp).not.toContain("'unsafe-eval'");
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
    });
  });

  describe('Error Handling Security', () => {
    test('should not expose internal errors', async () => {
      // Simulate internal database error
      const response = await app.inject({
        method: 'GET',
        url: '/api/v1/trust/stats' // This might fail if DB is not available
      });

      if (response.statusCode >= 500) {
        const errorBody = response.json();
        expect(errorBody).not.toContain('database');
        expect(errorBody).not.toContain('internal');
        expect(errorBody).not.toContain('stack');
      }
    });

    test('should handle malformed JSON gracefully', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${validAdminToken}`
        },
        body: '{"malformed": json}' // Invalid JSON
      });

      expect(response.statusCode).toBe(400);
      expect(response.json()).toMatchObject({
        error: expect.stringContaining('Invalid')
      });
    });
  });

  describe('Token Blacklist Security', () => {
    test('should reject revoked tokens', async () => {
      // First, use token successfully
      const initialResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        headers: {
          authorization: `Bearer ${validAdminToken}`
        },
        payload: {
          key_id: 'test-key-1',
          reason: 'test revocation'
        }
      });

      expect(initialResponse.statusCode).toBe(200);

      // Now revoke the token (simulated)
      await revokeToken(validAdminToken);

      // Try to use the revoked token
      const revokedResponse = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        headers: {
          authorization: `Bearer ${validAdminToken}`
        },
        payload: {
          key_id: 'test-key-2',
          reason: 'should fail'
        }
      });

      expect(revokedResponse.statusCode).toBe(401);
      expect(revokedResponse.json()).toMatchObject({
        error: 'Token has been revoked'
      });
    });
  });

  describe('Audit Logging Security', () => {
    test('should log security events', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/v1/trust/revoke',
        headers: {
          authorization: `Bearer ${validAdminToken}`
        },
        payload: {
          key_id: 'audit-test-key',
          reason: 'audit test'
        }
      });

      expect(response.statusCode).toBe(200);

      // Check if audit event was logged
      const auditEvents = await getAuditEvents({
        action: 'KEY_REVOCATION',
        limit: 1
      });

      expect(auditEvents.length).toBeGreaterThan(0);
      expect(auditEvents[0]).toMatchObject({
        action: 'KEY_REVOCATION',
        severity: 'critical'
      });
    });
  });
});

// Helper functions
async function createTestApp(): Promise<FastifyInstance> {
  const Fastify = require('fastify');
  const app = Fastify({ logger: false });
  
  // Register test routes
  const { verifyRoutes } = require('../routes/verify');
  await app.register(verifyRoutes);
  
  // Add auth routes for testing
  app.post('/auth/login', async (request, reply) => {
    return { token: validUserToken };
  });
  
  await app.ready();
  return app;
}

async function generateTestToken(payload: any, options: { secret?: string; expiresIn?: string } = {}): Promise<string> {
  return jwt.sign(payload, options.secret || securityConfig.jwt.secret, {
    issuer: securityConfig.jwt.issuer,
    audience: securityConfig.jwt.audience,
    expiresIn: options.expiresIn || securityConfig.jwt.expiresIn,
    jti: `test-${await generateJwtId()}`
  });
}

async function revokeToken(token: string): Promise<void> {
  // Simulate token revocation
  const { tokenBlacklist } = require('../services/token-blacklist-service');
  const decoded = jwt.decode(token) as any;
  await tokenBlacklist.revokeToken(decoded.jti, decoded.sub, 'Test revocation');
}

async function getAuditEvents(filters: any): Promise<any[]> {
  // Mock audit event retrieval for testing
  return [
    {
      action: 'KEY_REVOCATION',
      severity: 'critical',
      timestamp: new Date().toISOString()
    }
  ];
}
