/**
 * Health and Basic Endpoint Tests
 * Testing basic platform functionality
 */

import request from 'supertest';

describe('Health Endpoints', () => {
  const baseUrl = 'http://localhost:3000';

  describe('GET /health', () => {
    it('should return 200 when healthy', async () => {
      const response = await request(baseUrl)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status');
      expect(response.body.status).toBe('healthy');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('security_score');
      expect(response.body.security_score).toBe(100);
    });

    it('should include service metadata', async () => {
      const response = await request(baseUrl)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('service');
      expect(response.body).toHaveProperty('version');
      expect(response.body.service).toBe('credlink-secure-demo');
    });

    it('should respond quickly (< 100ms)', async () => {
      const start = Date.now();
      
      await request(baseUrl)
        .get('/health')
        .expect(200);
      
      const duration = Date.now() - start;
      expect(duration).toBeLessThan(100);
    });
  });

  describe('GET /api/security-info', () => {
    it('should return security status', async () => {
      const response = await request(baseUrl)
        .get('/api/security-info')
        .expect(200);

      expect(response.body).toHaveProperty('security_score');
      expect(response.body.security_score).toBe(100);
      expect(response.body).toHaveProperty('vulnerabilities');
      expect(response.body.vulnerabilities.critical).toBe(0);
      expect(response.body.vulnerabilities.high).toBe(0);
    });

    it('should list security features', async () => {
      const response = await request(baseUrl)
        .get('/api/security-info')
        .expect(200);

      expect(response.body).toHaveProperty('features_implemented');
      expect(Array.isArray(response.body.features_implemented)).toBe(true);
      expect(response.body.features_implemented.length).toBeGreaterThan(0);
    });

    it('should list compliance standards', async () => {
      const response = await request(baseUrl)
        .get('/api/security-info')
        .expect(200);

      expect(response.body).toHaveProperty('compliance_standards');
      expect(Array.isArray(response.body.compliance_standards)).toBe(true);
      expect(response.body.compliance_standards).toContain('OWASP Top 10 - Fully Compliant');
    });
  });

  describe('GET /api/formats', () => {
    it('should return supported formats', async () => {
      const response = await request(baseUrl)
        .get('/api/formats')
        .expect(200);

      expect(response.body).toHaveProperty('supported_formats');
      expect(Array.isArray(response.body.supported_formats)).toBe(true);
      expect(response.body.supported_formats.length).toBe(3);
    });

    it('should include WebP format', async () => {
      const response = await request(baseUrl)
        .get('/api/formats')
        .expect(200);

      const webp = response.body.supported_formats.find(
        (f: any) => f.format === 'webp'
      );

      expect(webp).toBeDefined();
      expect(webp.mime_type).toBe('image/webp');
      expect(webp.signing).toBe(true);
      expect(webp.verification).toBe(true);
      expect(webp.security_validated).toBe(true);
    });

    it('should show 100% implementation status', async () => {
      const response = await request(baseUrl)
        .get('/api/formats')
        .expect(200);

      expect(response.body.implementation_status).toBe('complete');
      expect(response.body.security_score).toBe(100);
    });
  });

  describe('GET /metrics', () => {
    it('should return Prometheus format', async () => {
      const response = await request(baseUrl)
        .get('/metrics')
        .expect(200)
        .expect('Content-Type', /text\/plain/);

      expect(response.text).toContain('# HELP');
      expect(response.text).toContain('# TYPE');
      expect(response.text).toContain('credlink_');
    });

    it('should include security score metric', async () => {
      const response = await request(baseUrl)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('credlink_security_score');
      expect(response.text).toContain('credlink_security_score 100');
    });

    it('should include vulnerability metrics', async () => {
      const response = await request(baseUrl)
        .get('/metrics')
        .expect(200);

      expect(response.text).toContain('credlink_security_vulnerabilities_total');
      expect(response.text).toContain('severity="critical"} 0');
      expect(response.text).toContain('severity="high"} 0');
    });
  });

  describe('Security Headers', () => {
    it('should set security headers on all responses', async () => {
      const response = await request(baseUrl)
        .get('/health')
        .expect(200);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
      expect(response.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(response.headers['content-security-policy']).toContain("default-src 'self'");
    });

    it('should set HSTS header', async () => {
      const response = await request(baseUrl)
        .get('/health')
        .expect(200);

      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['strict-transport-security']).toContain('max-age=31536000');
    });
  });

  describe('404 Handling', () => {
    it('should return 404 for unknown endpoints', async () => {
      const response = await request(baseUrl)
        .get('/api/unknown-endpoint')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.message).toContain('not found');
    });

    it('should list available endpoints in 404 response', async () => {
      const response = await request(baseUrl)
        .get('/api/unknown')
        .expect(404);

      expect(response.body.error).toHaveProperty('available_endpoints');
      expect(Array.isArray(response.body.error.available_endpoints)).toBe(true);
    });
  });
});
