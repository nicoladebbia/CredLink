/**
 * Security Tests: Injection Attacks
 * 
 * Tests XSS, SQL injection, path traversal, SSRF prevention
 */

import request from 'supertest';
import app from '../../src/index';
import { ProofStorage } from '@credlink/storage';

describe('Injection Attack Prevention', () => {
  describe('XSS Prevention', () => {
    it('should sanitize script tags in creator field', async () => {
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), 'test.jpg')
        .field('creator', '<script>alert("XSS")</script>')
        .expect(200);

      const manifest = response.body.manifest || {};
      expect(JSON.stringify(manifest)).not.toContain('<script>');
      expect(JSON.stringify(manifest)).not.toContain('alert');
    });

    it('should sanitize img onerror in title', async () => {
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), 'test.jpg')
        .field('title', '<img src=x onerror=alert(1)>')
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('onerror');
    });

    it('should sanitize iframe injection', async () => {
      const xssPayload = '<iframe src="javascript:alert(1)"></iframe>';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), 'test.jpg')
        .field('creator', xssPayload)
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('<iframe');
      expect(JSON.stringify(response.body)).not.toContain('javascript:');
    });

    it('should sanitize SVG with embedded scripts', async () => {
      const svgXSS = '<svg><script>alert(1)</script></svg>';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), 'test.jpg')
        .field('title', svgXSS)
        .expect(200);

      expect(JSON.stringify(response.body)).not.toContain('<svg>');
      expect(JSON.stringify(response.body)).not.toContain('<script>');
    });

    it('should sanitize event handlers', async () => {
      const payloads = [
        'onclick=alert(1)',
        'onload=alert(1)',
        'onmouseover=alert(1)',
        'onfocus=alert(1)'
      ];

      for (const payload of payloads) {
        const response = await request(app)
          .post('/sign')
          .set('x-api-key', 'test-key')
          .attach('image', Buffer.from('test'), 'test.jpg')
          .field('creator', payload)
          .expect(200);

        expect(JSON.stringify(response.body)).not.toContain('alert(');
      }
    });

    it('should decode and sanitize HTML entities', async () => {
      const encoded = '&lt;script&gt;alert(1)&lt;/script&gt;';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), 'test.jpg')
        .field('creator', encoded)
        .expect(200);

      // Should be decoded and then sanitized
      expect(JSON.stringify(response.body)).not.toContain('script');
      expect(JSON.stringify(response.body)).not.toContain('alert');
    });
  });

  describe('SQL Injection Prevention', () => {
    it('should sanitize proof ID with SQL injection', async () => {
      const sqlInjection = "' OR '1'='1";
      
      const response = await request(app)
        .get(`/proof/${encodeURIComponent(sqlInjection)}`)
        .expect(404); // Should not find anything, not execute SQL

      expect(response.body.error).not.toContain('SQL');
    });

    it('should sanitize union-based SQL injection', async () => {
      const unionAttack = "1 UNION SELECT * FROM users--";
      
      const response = await request(app)
        .get(`/proof/${encodeURIComponent(unionAttack)}`)
        .expect(404);

      expect(response.body).not.toHaveProperty('password');
      expect(response.body).not.toHaveProperty('email');
    });

    it('should prevent time-based blind SQL injection', async () => {
      const timeBased = "1; WAITFOR DELAY '00:00:05'--";
      
      const startTime = Date.now();
      await request(app)
        .get(`/proof/${encodeURIComponent(timeBased)}`)
        .expect(404);
      const duration = Date.now() - startTime;

      // Should not delay (SQL not executed)
      expect(duration).toBeLessThan(1000);
    });

    it('should use parameterized queries for search', async () => {
      const dropTable = "'; DROP TABLE proofs;--";
      
      const response = await request(app)
        .get(`/search?q=${encodeURIComponent(dropTable)}`)
        .set('x-api-key', 'test-key');

      // Should return empty results, not execute DROP
      expect(response.status).not.toBe(500);
    });
  });

  describe('NoSQL Injection Prevention', () => {
    it('should sanitize MongoDB $where injection', async () => {
      const nosqlInjection = { "$where": "this.password == 'x'" };
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), 'test.jpg')
        .field('assertions', JSON.stringify([nosqlInjection]))
        .expect(400); // Should reject malformed assertions

      expect(response.body.error).toBeDefined();
    });

    it('should sanitize MongoDB $ne injection', async () => {
      const neInjection = { "creator": { "$ne": null } };
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), 'test.jpg')
        .field('assertions', JSON.stringify([neInjection]))
        .expect(400);
    });
  });

  describe('Path Traversal Prevention', () => {
    it('should block directory traversal in filename', async () => {
      const traversal = '../../../etc/passwd';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), traversal)
        .expect(400);

      expect(response.body.message).toContain('Invalid filename');
    });

    it('should block null byte injection', async () => {
      const nullByte = 'image.jpg\x00.php';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), nullByte)
        .expect(400);
    });

    it('should block absolute paths', async () => {
      const absolutePath = '/etc/passwd';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), absolutePath)
        .expect(400);
    });

    it('should block Windows path traversal', async () => {
      const windowsPath = '..\\..\\..\\windows\\system32\\config\\sam';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), windowsPath)
        .expect(400);
    });

    it('should block double encoding', async () => {
      const doubleEncoded = '%252e%252e%252f'; // ../ double encoded
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), doubleEncoded)
        .expect(400);
    });
  });

  describe('SSRF Prevention', () => {
    it('should block localhost URLs in proof callbacks', async () => {
      const localhostUrl = 'https://localhost/callback';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), 'test.jpg')
        .field('callbackUrl', localhostUrl)
        .expect(400);

      expect(response.body.message).toContain('Invalid callback URL');
    });

    it('should block internal IP addresses', async () => {
      const internalIPs = [
        'https://192.168.1.1/callback',
        'https://10.0.0.1/callback',
        'https://172.16.0.1/callback',
        'https://127.0.0.1/callback',
        'https://169.254.169.254/latest/meta-data/' // AWS metadata
      ];

      for (const ip of internalIPs) {
        const response = await request(app)
          .post('/sign')
          .set('x-api-key', 'test-key')
          .attach('image', Buffer.from('test'), 'test.jpg')
          .field('callbackUrl', ip)
          .expect(400);

        expect(response.body.message).toContain('Invalid callback URL');
      }
    });

    it('should block cloud metadata endpoints', async () => {
      const metadataUrls = [
        'http://169.254.169.254/latest/meta-data/', // AWS
        'http://metadata.google.internal/computeMetadata/v1/', // GCP
        'http://169.254.169.254/metadata/instance' // Azure
      ];

      for (const url of metadataUrls) {
        const response = await request(app)
          .post('/sign')
          .set('x-api-key', 'test-key')
          .attach('image', Buffer.from('test'), 'test.jpg')
          .field('callbackUrl', url)
          .expect(400);
      }
    });

    it('should block DNS rebinding attacks', async () => {
      // URL that resolves to localhost
      const rebindUrl = 'https://localtest.me/callback';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), 'test.jpg')
        .field('callbackUrl', rebindUrl)
        .expect(400);
    });

    it('should allow only whitelisted domains', async () => {
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), 'test.jpg')
        .field('callbackUrl', 'https://proofs.credlink.com/callback')
        .expect(200);
    });
  });

  describe('Command Injection Prevention', () => {
    it('should sanitize shell metacharacters in filenames', async () => {
      const shellChars = 'test.jpg; rm -rf /';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), shellChars)
        .expect(400);
    });

    it('should block pipe characters', async () => {
      const pipeAttack = 'test.jpg | cat /etc/passwd';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), pipeAttack)
        .expect(400);
    });

    it('should block backticks', async () => {
      const backtickAttack = 'test.jpg`whoami`';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), backtickAttack)
        .expect(400);
    });
  });

  describe('LDAP Injection Prevention', () => {
    it('should sanitize LDAP special characters', async () => {
      const ldapInjection = 'admin)(|(password=*))';
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .attach('image', Buffer.from('test'), 'test.jpg')
        .field('creator', ldapInjection)
        .expect(200);

      // Should be escaped, not executed
      expect(JSON.stringify(response.body)).not.toContain('(|');
    });
  });

  describe('XML/XXE Injection Prevention', () => {
    it('should reject XML external entity references', async () => {
      const xxePayload = `<?xml version="1.0"?>
        <!DOCTYPE foo [<!ENTITY xxe SYSTEM "file:///etc/passwd">]>
        <data>&xxe;</data>`;
      
      const response = await request(app)
        .post('/sign')
        .set('x-api-key', 'test-key')
        .set('Content-Type', 'application/xml')
        .send(xxePayload)
        .expect(400);
    });
  });
});
