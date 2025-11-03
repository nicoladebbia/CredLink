/**
 * Unit Tests for Link Header Parser
 * Tests RFC 8288 compliant parsing
 */

import { parseLinkHeader, findC2paManifestLink, validateManifestUrl } from '../lib/parse-link.js';

// Test suite
describe('Link Header Parser', () => {
  
  describe('parseLinkHeader', () => {
    test('should parse simple Link header', () => {
      const header = '<https://example.com/manifest.c2pa>; rel="c2pa-manifest"';
      const result = parseLinkHeader(header);
      
      expect(result['c2pa-manifest']).toBe('https://example.com/manifest.c2pa');
    });
    
    test('should parse multiple Link values', () => {
      const header = [
        '<https://example.com/manifest.c2pa>; rel="c2pa-manifest"',
        '<https://example.com/other>; rel="other"'
      ].join(', ');
      
      const result = parseLinkHeader(header);
      
      expect(result['c2pa-manifest']).toBe('https://example.com/manifest.c2pa');
      expect(result['other']).toBe('https://example.com/other');
    });
    
    test('should handle quoted URLs with special characters', () => {
      const header = '<https://example.com/manifest%20with%20spaces.c2pa>; rel="c2pa-manifest"';
      const result = parseLinkHeader(header);
      
      expect(result['c2pa-manifest']).toBe('https://example.com/manifest%20with%20spaces.c2pa');
    });
    
    test('should handle multiple rel values', () => {
      const header = '<https://example.com/manifest.c2pa>; rel="c2pa-manifest something-else"';
      const result = parseLinkHeader(header);
      
      expect(result['c2pa-manifest']).toBe('https://example.com/manifest.c2pa');
      expect(result['something-else']).toBe('https://example.com/manifest.c2pa');
    });
    
    test('should handle parameters with quotes', () => {
      const header = '<https://example.com/manifest.c2pa>; rel="c2pa-manifest"; type="application/c2pa"';
      const result = parseLinkHeader(header);
      
      expect(result['c2pa-manifest']).toBe('https://example.com/manifest.c2pa');
    });
    
    test('should return empty object for invalid header', () => {
      expect(parseLinkHeader('')).toEqual({});
      expect(parseLinkHeader(null)).toEqual({});
      expect(parseLinkHeader(undefined)).toEqual({});
      expect(parseLinkHeader('invalid')).toEqual({});
    });
    
    test('should handle malformed entries gracefully', () => {
      const header = [
        '<https://example.com/valid.c2pa>; rel="c2pa-manifest"',
        'invalid-entry',
        '<https://example.com/also-valid.c2pa>; rel="also-manifest"'
      ].join(', ');
      
      const result = parseLinkHeader(header);
      
      expect(result['c2pa-manifest']).toBe('https://example.com/valid.c2pa');
      expect(result['also-manifest']).toBe('https://example.com/also-valid.c2pa');
    });
  });
  
  describe('findC2paManifestLink', () => {
    test('should find c2pa-manifest link', () => {
      const header = '<https://example.com/manifest.c2pa>; rel="c2pa-manifest"';
      const result = findC2paManifestLink(header);
      
      expect(result).toBe('https://example.com/manifest.c2pa');
    });
    
    test('should return null if no manifest found', () => {
      const header = '<https://example.com/other>; rel="other"';
      const result = findC2paManifestLink(header);
      
      expect(result).toBeNull();
    });
    
    test('should handle case insensitive rel', () => {
      const header = '<https://example.com/manifest.c2pa>; rel="C2PA-MANIFEST"';
      const result = findC2paManifestLink(header);
      
      expect(result).toBe('https://example.com/manifest.c2pa');
    });
  });
  
  describe('validateManifestUrl', () => {
    test('should accept HTTPS URLs', () => {
      expect(validateManifestUrl('https://example.com/manifest.c2pa')).toBe(true);
    });
    
    test('should accept data URLs', () => {
      expect(validateManifestUrl('data:application/c2pa;base64,abc123')).toBe(true);
    });
    
    test('should reject HTTP URLs', () => {
      expect(validateManifestUrl('http://example.com/manifest.c2pa')).toBe(false);
    });
    
    test('should reject invalid URLs', () => {
      expect(validateManifestUrl('not-a-url')).toBe(false);
      expect(validateManifestUrl('ftp://example.com/manifest.c2pa')).toBe(false);
    });
  });
});

// Test runner for browser environment
function runTests() {
  const tests = [];
  
  // Collect tests
  describe('Link Header Parser', () => {
    describe('parseLinkHeader', () => {
      test('should parse simple Link header', () => {
        const header = '<https://example.com/manifest.c2pa>; rel="c2pa-manifest"';
        const result = parseLinkHeader(header);
        
        if (result['c2pa-manifest'] !== 'https://example.com/manifest.c2pa') {
          throw new Error('Simple Link header parsing failed');
        }
      });
      
      test('should parse multiple Link values', () => {
        const header = [
          '<https://example.com/manifest.c2pa>; rel="c2pa-manifest"',
          '<https://example.com/other>; rel="other"'
        ].join(', ');
        
        const result = parseLinkHeader(header);
        
        if (result['c2pa-manifest'] !== 'https://example.com/manifest.c2pa' ||
            result['other'] !== 'https://example.com/other') {
          throw new Error('Multiple Link values parsing failed');
        }
      });
    });
  });
  
  // Run tests and report results
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    try {
      test();
      passed++;
    } catch (error) {
      console.error(`Test failed: ${test.name}`, error);
      failed++;
    }
  }
  
  console.log(`Tests completed: ${passed} passed, ${failed} failed`);
  return { passed, failed };
}

// Export for use in test files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { runTests };
}
