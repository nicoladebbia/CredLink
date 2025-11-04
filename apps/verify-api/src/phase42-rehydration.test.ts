/**
 * Phase 42 — Rehydration Tests
 * Comprehensive test suite for HTTP conditional requests and delta encoding
 */

import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  isStrongETag,
  normalizeETag,
  detectIntermediaryMangling,
  fetchManifestConditional,
  applyDelta,
  isRehydrationSafe,
  getRehydrationHealth,
  cleanupCertCache,
  REHYDRATION_CONFIG,
  certThumbprintCache,
  constantTimeStringEqual,
  validateUrl
} from './phase42-rehydration.js';
import { VerificationError } from './types.js';

describe('Phase 42 — Rehydration on 304/Delta', () => {

  describe('Strong ETag Validation', () => {
    test('should validate strong ETags correctly', () => {
      // Valid strong ETags
      assert.strictEqual(isStrongETag('"1234567890abcdef"'), true);
      assert.strictEqual(isStrongETag('"strong-etag-value"'), true);
      assert.strictEqual(isStrongETag('"7b1e9f2c3a4b5d6e8f0a1b2c3d4e5f6"'), true);
      
      // Invalid weak ETags
      assert.strictEqual(isStrongETag('W/"1234567890abcdef"'), false);
      assert.strictEqual(isStrongETag('W/"weak-etag"'), false);
      
      // Invalid formats
      assert.strictEqual(isStrongETag('1234567890abcdef'), false); // Missing quotes
      assert.strictEqual(isStrongETag(''), false); // Empty
      assert.strictEqual(isStrongETag('"'), false); // Unclosed quote
      assert.strictEqual(isStrongETag('""'), true); // Empty but quoted is valid
    });

    test('should normalize ETags correctly', () => {
      assert.strictEqual(normalizeETag('"1234567890abcdef"'), '1234567890abcdef');
      assert.strictEqual(normalizeETag('"strong-etag-value"'), 'strong-etag-value');
      assert.strictEqual(normalizeETag('W/"weak-etag"'), ''); // Weak ETags return empty
      assert.strictEqual(normalizeETag('invalid'), ''); // Invalid format returns empty
      assert.strictEqual(normalizeETag(''), ''); // Empty returns empty
    });
  });

  describe('Intermediary Mangling Detection', () => {
    test('should detect known mangling headers', () => {
      const headersWithMangling = {
        'x-image-optimizer': 'true',
        'content-type': 'application/c2pa'
      };
      
      assert.strictEqual(detectIntermediaryMangling(headersWithMangling), true);
    });

    test('should detect mangling in Via header', () => {
      const headersWithViaMangling = {
        'via': '1.1 image-optimizer, 1.0 edge-cache',
        'content-type': 'application/c2pa'
      };
      
      assert.strictEqual(detectIntermediaryMangling(headersWithViaMangling), true);
    });

    test('should not detect mangling in clean headers', () => {
      const cleanHeaders = {
        'content-type': 'application/c2pa',
        'etag': '"1234567890abcdef"',
        'cache-control': 'max-age=30'
      };
      
      assert.strictEqual(detectIntermediaryMangling(cleanHeaders), false);
    });
  });

  describe('Rehydration Safety Validation', () => {
    test('should validate safe rehydration conditions', () => {
      const manifestUrl = 'https://manifests.credlink.io/test.c2pa';
      const cachedETag = '"7b1e9f2c3a4b5d6e"';
      const currentETag = '"7b1e9f2c3a4b5d6e"';
      const certThumbprints = ['sha256:abc123'];
      const policyVersion = 'v42';

      assert.strictEqual(
        isRehydrationSafe(manifestUrl, cachedETag, currentETag, certThumbprints, policyVersion),
        true
      );
    });

    test('should reject rehydration with mismatched ETags', () => {
      const manifestUrl = 'https://manifests.credlink.io/test.c2pa';
      const cachedETag = '"7b1e9f2c3a4b5d6e"';
      const currentETag = '"different-etag-value"';
      const certThumbprints = ['sha256:abc123'];
      const policyVersion = 'v42';

      assert.strictEqual(
        isRehydrationSafe(manifestUrl, cachedETag, currentETag, certThumbprints, policyVersion),
        false
      );
    });

    test('should reject rehydration with weak ETags', () => {
      const manifestUrl = 'https://manifests.credlink.io/test.c2pa';
      const cachedETag = 'W/"7b1e9f2c3a4b5d6e"';
      const currentETag = 'W/"7b1e9f2c3a4b5d6e"';
      const certThumbprints = ['sha256:abc123'];
      const policyVersion = 'v42';

      assert.strictEqual(
        isRehydrationSafe(manifestUrl, cachedETag, currentETag, certThumbprints, policyVersion),
        false
      );
    });

    test('should reject rehydration with policy version mismatch', () => {
      const manifestUrl = 'https://manifests.credlink.io/test.c2pa';
      const cachedETag = '"7b1e9f2c3a4b5d6e"';
      const currentETag = '"7b1e9f2c3a4b5d6e"';
      const certThumbprints = ['sha256:abc123'];
      const policyVersion = 'v41'; // Different version

      assert.strictEqual(
        isRehydrationSafe(manifestUrl, cachedETag, currentETag, certThumbprints, policyVersion),
        false
      );
    });
  });

  describe('Delta Encoding', () => {
    test('should apply simple replace delta correctly', async () => {
      const baseContent = new TextEncoder().encode('Hello world!');
      const deltaContent = new TextEncoder().encode(JSON.stringify({
        operations: [
          {
            type: 'replace',
            position: 6,
            length: 5,
            value: 'C2PA'
          }
        ]
      }));

      const result = await applyDelta(baseContent, deltaContent, 'diffe');
      const resultText = new TextDecoder().decode(result);
      
      assert.strictEqual(resultText, 'Hello C2PA!');
    });

    test('should apply insert delta correctly', async () => {
      const baseContent = new TextEncoder().encode('Hello world!');
      const deltaContent = new TextEncoder().encode(JSON.stringify({
        operations: [
          {
            type: 'insert',
            position: 5,
            value: ' beautiful'
          }
        ]
      }));

      const result = await applyDelta(baseContent, deltaContent, 'diffe');
      const resultText = new TextDecoder().decode(result);
      
      assert.strictEqual(resultText, 'Hello beautiful world!');
    });

    test('should apply delete delta correctly', async () => {
      const baseContent = new TextEncoder().encode('Hello beautiful world!');
      const deltaContent = new TextEncoder().encode(JSON.stringify({
        operations: [
          {
            type: 'delete',
            position: 6,
            length: 10
          }
        ]
      }));

      const result = await applyDelta(baseContent, deltaContent, 'diffe');
      const resultText = new TextDecoder().decode(result);
      
      assert.strictEqual(resultText, 'Hello world!');
    });

    test('should reject unsupported delta encoders', async () => {
      const baseContent = new TextEncoder().encode('Hello world!');
      const deltaContent = new TextEncoder().encode('test');

      await assert.rejects(
        async () => await applyDelta(baseContent, deltaContent, 'unsupported'),
        (error: VerificationError) => {
          return error.code === 'UNSUPPORTED_DELTA';
        }
      );
    });

    test('should handle malformed delta gracefully', async () => {
      const baseContent = new TextEncoder().encode('Hello world!');
      const malformedDelta = new TextEncoder().encode('invalid json');

      await assert.rejects(
        async () => await applyDelta(baseContent, malformedDelta, 'diffe'),
        (error: VerificationError) => {
          return error.code === 'DELTA_APPLICATION_FAILED';
        }
      );
    });

    test('should reject delta operations out of bounds', async () => {
      const baseContent = new TextEncoder().encode('Hello world!');
      const outOfBoundsDelta = new TextEncoder().encode(JSON.stringify({
        operations: [
          {
            type: 'replace',
            position: 100, // Out of bounds
            length: 5,
            value: 'test'
          }
        ]
      }));

      await assert.rejects(
        async () => await applyDelta(baseContent, outOfBoundsDelta, 'diffe'),
        (error: VerificationError) => {
          return error.code === 'DELTA_APPLICATION_FAILED';
        }
      );
    });
  });

  describe('Certificate Thumbprint Cache', () => {
    test('should cache and retrieve thumbprints correctly', () => {
      const trustRootId = 'test-root-1';
      const thumbprint = 'sha256:abc123def456';

      // Cache thumbprint
      certThumbprintCache.set(trustRootId, thumbprint);
      
      // Retrieve thumbprint
      const retrieved = certThumbprintCache.get(trustRootId);
      assert.strictEqual(retrieved, thumbprint);
    });

    test('should return null for non-existent cache entries', () => {
      const retrieved = certThumbprintCache.get('non-existent');
      assert.strictEqual(retrieved, null);
    });

    test('should clear cache correctly', () => {
      const trustRootId = 'test-root-2';
      const thumbprint = 'sha256:xyz789';

      certThumbprintCache.set(trustRootId, thumbprint);
      assert.strictEqual(certThumbprintCache.get(trustRootId), thumbprint);

      certThumbprintCache.clear();
      assert.strictEqual(certThumbprintCache.get(trustRootId), null);
    });
  });

  describe('Rehydration Health Endpoint', () => {
    test('should return health status with correct structure', async () => {
      const health = await getRehydrationHealth();

      assert.strictEqual(typeof health.manifest_url, 'string');
      assert.strictEqual(typeof health.last_verify, 'string');
      assert.strictEqual(typeof health.etag_cached, 'string');
      assert.strictEqual(typeof health.etag_last_seen, 'string');
      assert.strictEqual(Array.isArray(health.cert_thumbprints), true);
      assert.strictEqual(typeof health.policy_version, 'string');
      assert.strictEqual(['304', '200', '226'].includes(health.served_via), true);
      assert.strictEqual(['validator-match', 'delta-applied', 'full-fetch'].includes(health.rehydration_reason), true);
      assert.strictEqual(typeof health.notes, 'string');
    });

    test('should include correct policy version', async () => {
      const health = await getRehydrationHealth();
      assert.strictEqual(health.policy_version, REHYDRATION_CONFIG.POLICY_VERSION);
    });
  });

  describe('Configuration Constants', () => {
    test('should have correct cache control headers', () => {
      assert.strictEqual(
        REHYDRATION_CONFIG.CACHE_CONTROL,
        'max-age=30, s-maxage=120, must-revalidate, stale-while-revalidate=300'
      );
    });

    test('should have correct delta encoder', () => {
      assert.strictEqual(REHYDRATION_CONFIG.DELTA_ENCODER, 'diffe');
    });

    test('should have reasonable size limits', () => {
      assert.strictEqual(REHYDRATION_CONFIG.MAX_MANIFEST_SIZE_FOR_DELTA, 1024 * 1024);
      assert.strictEqual(REHYDRATION_CONFIG.CERT_CACHE_TTL, 24 * 60 * 60 * 1000);
    });

    test('should have denylisted intermediaries', () => {
      assert(Array.isArray(REHYDRATION_CONFIG.DENYLISTED_INTERMEDIARIES));
      assert(REHYDRATION_CONFIG.DENYLISTED_INTERMEDIARIES.length > 0);
    });
  });

  describe('Cache Cleanup', () => {
    test('should cleanup expired entries without throwing', () => {
      // Add some test entries
      certThumbprintCache.set('test1', 'thumbprint1');
      certThumbprintCache.set('test2', 'thumbprint2');
      
      // Should not throw
      assert.doesNotThrow(() => {
        cleanupCertCache();
      });
    });
  });

  describe('Error Handling', () => {
    test('should handle malformed ETags gracefully', () => {
      assert.strictEqual(isStrongETag(null as any), false);
      assert.strictEqual(isStrongETag(undefined as any), false);
      assert.strictEqual(isStrongETag(123 as any), false);
      assert.strictEqual(isStrongETag({} as any), false);
    });

    test('should handle malformed headers gracefully', () => {
      assert.strictEqual(detectIntermediaryMangling(null as any), false);
      assert.strictEqual(detectIntermediaryMangling(undefined as any), false);
      assert.strictEqual(detectIntermediaryMangling(123 as any), false);
    });

    test('should handle malformed delta operations', async () => {
      const baseContent = new TextEncoder().encode('test');
      const malformedDelta = new TextEncoder().encode(JSON.stringify({
        operations: [
          {
            type: 'unknown-operation',
            position: 0
          }
        ]
      }));

      await assert.rejects(
        async () => await applyDelta(baseContent, malformedDelta, 'diffe'),
        (error: VerificationError) => {
          return error.code === 'DELTA_APPLICATION_FAILED';
        }
      );
    });
  });

  describe('Security Hardening Tests', () => {
    test('should prevent timing attacks with constant-time ETag comparison', () => {
      const etag1 = '"1234567890abcdef"';
      const etag2 = '"1234567890abcde"';
      const etag3 = '"1234567890abcdef"';
      const weakEtag = 'W/"weak-etag"';
      
      // Test constant-time comparison
      assert.strictEqual(constantTimeStringEqual(normalizeETag(etag1), normalizeETag(etag2)), false);
      assert.strictEqual(constantTimeStringEqual(normalizeETag(etag1), normalizeETag(etag3)), true);
      assert.strictEqual(constantTimeStringEqual(normalizeETag(''), normalizeETag('')), true);
      // Weak ETags normalize to empty string, so they compare equal as empty
      assert.strictEqual(constantTimeStringEqual(normalizeETag(weakEtag), normalizeETag(weakEtag)), true);
    });

    test('should enforce cache size limits to prevent memory exhaustion', () => {
      // Clear cache first
      certThumbprintCache.clear();
      
      // Fill cache beyond limit
      for (let i = 0; i < 1500; i++) {
        certThumbprintCache.set(`root-${i}`, `thumbprint-${i}`);
      }
      
      // Cache should not exceed maximum size
      assert.strictEqual(certThumbprintCache.size() <= 1000, true);
    });

    test('should reject oversized delta content', async () => {
      const baseContent = new TextEncoder().encode('Hello world!');
      const oversizedDelta = new Uint8Array(15 * 1024 * 1024); // 15MB, exceeds 10MB limit
      
      await assert.rejects(
        async () => await applyDelta(baseContent, oversizedDelta, 'diffe'),
        (error: VerificationError) => {
          return error.code === 'DELTA_APPLICATION_FAILED' && 
                 error.message.includes('Delta content too large');
        }
      );
    });

    test('should reject delta with too many operations', async () => {
      const baseContent = new TextEncoder().encode('Hello world!');
      const tooManyOps = {
        operations: Array.from({ length: 1500 }, (_, i) => ({
          type: 'insert',
          position: i,
          value: 'x'
        }))
      };
      const deltaContent = new TextEncoder().encode(JSON.stringify(tooManyOps));
      
      await assert.rejects(
        async () => await applyDelta(baseContent, deltaContent, 'diffe'),
        (error: VerificationError) => {
          return error.code === 'DELTA_APPLICATION_FAILED' && 
                 error.message.includes('Too many delta operations');
        }
      );
    });

    test('should validate URLs to prevent injection attacks', () => {
      // Valid URLs
      assert.strictEqual(validateUrl('https://example.com/manifest.json'), true);
      assert.strictEqual(validateUrl('http://localhost:3000/manifest.json'), true);
      assert.strictEqual(validateUrl('https://sub.domain.co.uk/path'), true);
      
      // CRITICAL SECURITY: Blocked dangerous protocols
      assert.strictEqual(validateUrl('javascript:alert(1)'), false);
      assert.strictEqual(validateUrl('data:text/plain,evil'), false);
      assert.strictEqual(validateUrl('file:///etc/passwd'), false);
      assert.strictEqual(validateUrl('ftp://example.com/file'), false);
      assert.strictEqual(validateUrl('mailto:test@example.com'), false);
      
      // CRITICAL SECURITY: Path traversal attacks
      assert.strictEqual(validateUrl('https://example.com/../etc/passwd'), false);
      assert.strictEqual(validateUrl('https://example.com/%2e%2e/etc/passwd'), false);
      assert.strictEqual(validateUrl('https://example.com/%2E%2E/etc/passwd'), false);
      
      // CRITICAL SECURITY: Script injection in protocol (not path)
      assert.strictEqual(validateUrl('javascript://example.com/<script>'), false);
      assert.strictEqual(validateUrl('vbscript://example.com/msgbox(1)'), false);
      
      // CRITICAL SECURITY: Invalid inputs
      assert.strictEqual(validateUrl(''), false);
      assert.strictEqual(validateUrl(null as any), false);
      assert.strictEqual(validateUrl(undefined as any), false);
      assert.strictEqual(validateUrl(123 as any), false);
      assert.strictEqual(validateUrl('not-a-url'), false);
      
      // CRITICAL SECURITY: URL length limits
      const longUrl = 'https://example.com/' + 'a'.repeat(2050);
      assert.strictEqual(validateUrl(longUrl), false);
    });

    test('should enforce strict ETag validation', () => {
      // Valid strong ETags
      assert.strictEqual(isStrongETag('"1234567890abcdef"'), true);
      assert.strictEqual(isStrongETag('"strong-etag-value"'), true);
      assert.strictEqual(isStrongETag('""'), true); // Empty quoted ETag
      
      // CRITICAL SECURITY: Invalid ETags
      assert.strictEqual(isStrongETag('W/"weak-etag"'), false); // Weak ETag
      assert.strictEqual(isStrongETag('unquoted-etag'), false); // Unquoted
      assert.strictEqual(isStrongETag('"invalid"etag"'), false); // Internal quote
      assert.strictEqual(isStrongETag(''), false); // Empty
      assert.strictEqual(isStrongETag(null as any), false);
      assert.strictEqual(isStrongETag(undefined as any), false);
      assert.strictEqual(isStrongETag(123 as any), false);
    });

    test('should validate delta operations comprehensively', async () => {
      const baseContent = new TextEncoder().encode('Hello world!');
      
      // Valid delta
      const validDelta = {
        operations: [
          { type: 'replace', position: 0, length: 5, value: 'Hi' },
          { type: 'insert', position: 5, value: ' there' },
          { type: 'delete', position: 11, length: 1 }
        ]
      };
      
      const result = await applyDelta(
        baseContent, 
        new TextEncoder().encode(JSON.stringify(validDelta)), 
        'diffe'
      );
      assert.ok(result instanceof Uint8Array);
      
      // CRITICAL SECURITY: Invalid operation types
      const invalidOpDelta = {
        operations: [
          { type: 'dangerous', position: 0, value: 'x' }
        ]
      };
      
      await assert.rejects(
        async () => await applyDelta(
          baseContent, 
          new TextEncoder().encode(JSON.stringify(invalidOpDelta)), 
          'diffe'
        ),
        (error: VerificationError) => {
          return error.code === 'DELTA_APPLICATION_FAILED' && 
                 error.message.includes('Unsupported operation type');
        }
      );
    });
  });

  describe('Integration Scenarios', () => {
    test('should handle complete rehydration flow validation', () => {
      const manifestUrl = 'https://manifests.credlink.io/test.c2pa';
      const cachedETag = '"7b1e9f2c3a4b5d6e8f0a1b2c3d4e5f6"';
      const currentETag = '"7b1e9f2c3a4b5d6e8f0a1b2c3d4e5f6"';
      const certThumbprints = ['sha256:abc123def456'];
      const policyVersion = 'v42';

      // All conditions should be met for safe rehydration
      assert.strictEqual(isStrongETag(cachedETag), true);
      assert.strictEqual(isStrongETag(currentETag), true);
      assert.strictEqual(normalizeETag(cachedETag), normalizeETag(currentETag));
      assert.strictEqual(
        isRehydrationSafe(manifestUrl, cachedETag, currentETag, certThumbprints, policyVersion),
        true
      );
    });

    test('should reject rehydration with any unsafe condition', () => {
      const manifestUrl = 'https://manifests.credlink.io/test.c2pa';
      const cachedETag = '"7b1e9f2c3a4b5d6e"';
      const currentETag = '"7b1e9f2c3a4b5d6e"';
      const certThumbprints = ['sha256:abc123'];
      const policyVersion = 'v42';

      // Test with weak ETag
      assert.strictEqual(
        isRehydrationSafe(manifestUrl, 'W/"weak"', currentETag, certThumbprints, policyVersion),
        false
      );

      // Test with mismatched policy
      assert.strictEqual(
        isRehydrationSafe(manifestUrl, cachedETag, currentETag, certThumbprints, 'v41'),
        false
      );
    });
  });
});
