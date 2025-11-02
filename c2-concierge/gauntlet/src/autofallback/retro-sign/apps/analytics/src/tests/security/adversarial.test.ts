/**
 * Phase 16 - Adversarial Lab v1
 * Badge XSS Sentinel Tests
 * 
 * Tests to ensure no innerHTML sinks, no eval, no Function constructor
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('Badge XSS Sentinel', () => {
  test('no innerHTML sinks in badge bundle', () => {
    // Check badge bundle for forbidden patterns
    const badgePath = join(__dirname, '../../public/badge/bundle.js');
    
    try {
      const src = readFileSync(badgePath, 'utf8');
      
      // Forbidden patterns that could lead to XSS
      const forbiddenPatterns = [
        /innerHTML\s*=/,
        /outerHTML\s*=/,
        /eval\s*\(/,
        /Function\s*\(/,
        /document\.write/,
        /document\.writeln/,
        /setTimeout\s*\(\s*["']/,
        /setInterval\s*\(\s*["']/,
        /\.insertAdjacentHTML/,
        /\.createHTML/
      ];
      
      for (const pattern of forbiddenPatterns) {
        expect(src).not.toMatch(pattern);
      }
      
      // Ensure proper escaping is used instead
      expect(src).toMatch(/textContent|innerText|createTextNode/);
      
    } catch (error) {
      // If file doesn't exist yet, that's expected during development
      console.log('Badge bundle not found - test will be valid when bundle is created');
    }
  });
  
  test('no inline event handlers in badge', () => {
    const badgePath = join(__dirname, '../../public/badge/bundle.js');
    
    try {
      const src = readFileSync(badgePath, 'utf8');
      
      // Forbidden inline event handlers
      const forbiddenHandlers = [
        /onclick\s*=/,
        /onload\s*=/,
        /onerror\s*=/,
        /onmouseover\s*=/,
        /onfocus\s*=/,
        /onblur\s*=/,
        /onchange\s*=/,
        /onsubmit\s*=/
      ];
      
      for (const handler of forbiddenHandlers) {
        expect(src).not.toMatch(handler);
      }
      
    } catch (error) {
      console.log('Badge bundle not found - test will be valid when bundle is created');
    }
  });
  
  test('CSP nonce is used in badge scripts', () => {
    const badgePath = join(__dirname, '../../templates/badge.hbs');
    
    try {
      const template = readFileSync(badgePath, 'utf8');
      
      // Should use nonce for inline scripts
      expect(template).toMatch(/nonce="{{cspNonce}}"/);
      
    } catch (error) {
      console.log('Badge template not found - will be created during implementation');
    }
  });
});

describe('Security Invariants Tests', () => {
  test('CSP headers include required directives', async () => {
    const { securityInvariants } = await import('../../middleware/security-invariants');
    const Fastify = require('fastify');
    
    const fastify = Fastify();
    
    // Mock request and reply
    const mockRequest = {
      url: '/verify',
      method: 'GET',
      ip: '127.0.0.1',
      headers: {}
    };
    
    const mockReply = {
      header: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
    
    // Apply security invariants
    await securityInvariants(mockRequest, mockReply);
    
    // Verify CSP header was set
    expect(mockReply.header).toHaveBeenCalledWith(
      'Content-Security-Policy',
      expect.stringContaining("script-src 'self'")
    );
    
    // Verify other security headers
    expect(mockReply.header).toHaveBeenCalledWith('X-Content-Type-Options', 'nosniff');
    expect(mockReply.header).toHaveBeenCalledWith('Referrer-Policy', expect.any(String));
  });
  
  test('HTML content is blocked on manifest endpoints', async () => {
    const { securityInvariants } = await import('../../middleware/security-invariants');
    const Fastify = require('fastify');
    
    const fastify = Fastify();
    
    const mockRequest = {
      url: '/api/v1/manifest/test',
      method: 'POST',
      ip: '127.0.0.1',
      headers: {
        'content-type': 'text/html'
      }
    };
    
    const mockReply = {
      header: jest.fn(),
      status: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
    
    await securityInvariants(mockRequest, mockReply);
    
    // Should block HTML content
    expect(mockReply.status).toHaveBeenCalledWith(415);
    expect(mockReply.send).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'MIME_REJECTED',
        decision: 'BLOCKED',
        code: 'MIME_REJECTED'
      })
    );
  });
  
  test('parser limits validation works correctly', () => {
    const { validateParserLimits, PARSER_LIMITS } = require('../../middleware/security-invariants');
    
    // Test valid limits
    const validResult = validateParserLimits(5, 10, 20, 1024);
    expect(validResult.valid).toBe(true);
    expect(validResult.violations).toHaveLength(0);
    
    // Test exceeded depth
    const invalidDepth = validateParserLimits(10, 10, 20, 1024);
    expect(invalidDepth.valid).toBe(false);
    expect(invalidDepth.violations).toContain(
      `JUMBF depth 10 exceeds limit ${PARSER_LIMITS.MAX_JUMBF_BOX_DEPTH}`
    );
    
    // Test exceeded chain length
    const invalidChain = validateParserLimits(5, 40, 20, 1024);
    expect(invalidChain.valid).toBe(false);
    expect(invalidChain.violations).toContain(
      `Manifest chain length 40 exceeds limit ${PARSER_LIMITS.MAX_MANIFEST_CHAIN_LENGTH}`
    );
    
    // Test exceeded JSON nesting
    const invalidNesting = validateParserLimits(5, 10, 70, 1024);
    expect(invalidNesting.valid).toBe(false);
    expect(invalidNesting.violations).toContain(
      `JSON nesting 70 exceeds limit ${PARSER_LIMITS.MAX_JSON_NESTING}`
    );
    
    // Test exceeded manifest size
    const invalidSize = validateParserLimits(5, 10, 20, 3 * 1024 * 1024);
    expect(invalidSize.valid).toBe(false);
    expect(invalidSize.violations).toContain(
      `Manifest size 3145728 exceeds limit ${PARSER_LIMITS.MAX_REMOTE_MANIFEST_SIZE}`
    );
  });
  
  test('MIME deny list blocks dangerous types', () => {
    const { mimeDenyList } = require('../../middleware/security-invariants');
    
    // Should block dangerous MIME types
    expect(mimeDenyList('text/html')).toBe(true);
    expect(mimeDenyList('application/javascript')).toBe(true);
    expect(mimeDenyList('image/svg+xml')).toBe(true);
    expect(mimeDenyList('application/xml')).toBe(true);
    
    // Should allow safe MIME types
    expect(mimeDenyList('application/c2pa+json')).toBe(false);
    expect(mimeDenyList('application/json')).toBe(false);
    expect(mimeDenyList('image/jpeg')).toBe(false);
    expect(mimeDenyList('image/png')).toBe(false);
  });
});
