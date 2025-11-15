/**
 * Unit Tests: Manifest Builder
 * 
 * Tests C2PA manifest creation, schema compliance, and custom assertions
 */

import { ManifestBuilder } from '@credlink/c2pa-sdk';
import * as crypto from 'crypto';

describe('ManifestBuilder', () => {
  let builder: ManifestBuilder;

  beforeEach(() => {
    builder = new ManifestBuilder();
  });

  describe('Manifest Schema Compliance', () => {
    it('should create valid C2PA manifest structure', async () => {
      const imageBuffer = Buffer.from('fake-image-data');
      const options = {
        creator: 'Test Creator',
        title: 'Test Image'
      };

      const manifest = await builder.buildManifest(imageBuffer, options);

      // Verify required C2PA fields
      expect(manifest).toHaveProperty('claim_generator');
      expect(manifest).toHaveProperty('claim_generator_info');
      expect(manifest).toHaveProperty('title');
      expect(manifest).toHaveProperty('format');
      expect(manifest).toHaveProperty('instance_id');
      expect(manifest).toHaveProperty('assertions');
    });

    it('should include claim_generator with required fields', async () => {
      const manifest = await builder.buildManifest(Buffer.from('test'), {});

      expect(manifest.claim_generator).toHaveProperty('name');
      expect(manifest.claim_generator).toHaveProperty('version');
      expect(manifest.claim_generator.name).toBe('CredLink');
    });

    it('should include instance_id as valid UUID', async () => {
      const manifest = await builder.buildManifest(Buffer.from('test'), {});

      expect(manifest.instance_id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      );
    });

    it('should set correct format based on image type', async () => {
      // JPEG
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF]);
      const jpegManifest = await builder.buildManifest(jpegBuffer, {});
      expect(jpegManifest.format).toBe('image/jpeg');

      // PNG
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
      const pngManifest = await builder.buildManifest(pngBuffer, {});
      expect(pngManifest.format).toBe('image/png');
    });
  });

  describe('Custom Assertions', () => {
    it('should inject custom assertions into manifest', async () => {
      const customAssertions = [
        { label: 'c2pa.location', data: { lat: 37.7749, lon: -122.4194 } },
        { label: 'custom.metadata', data: { key: 'value' } }
      ];

      const manifest = await builder.buildManifest(
        Buffer.from('test'),
        { assertions: customAssertions }
      );

      expect(manifest.assertions).toHaveLength(customAssertions.length + 1); // +1 for default hash assertion
      expect(manifest.assertions.some(a => a.label === 'c2pa.location')).toBe(true);
      expect(manifest.assertions.some(a => a.label === 'custom.metadata')).toBe(true);
    });

    it('should validate custom assertion schema', async () => {
      const invalidAssertion = {
        // Missing 'label' field
        data: { test: 'value' }
      };

      await expect(
        builder.buildManifest(Buffer.from('test'), {
          assertions: [invalidAssertion as any]
        })
      ).rejects.toThrow('Invalid assertion schema');
    });

    it('should limit assertion array size', async () => {
      const tooManyAssertions = Array(1000).fill({
        label: 'test.assertion',
        data: { value: 'test' }
      });

      await expect(
        builder.buildManifest(Buffer.from('test'), {
          assertions: tooManyAssertions
        })
      ).rejects.toThrow('Too many assertions');
    });

    it('should sanitize assertion data', async () => {
      const assertions = [{
        label: 'test.xss',
        data: { name: '<script>alert(1)</script>' }
      }];

      const manifest = await builder.buildManifest(
        Buffer.from('test'),
        { assertions }
      );

      const testAssertion = manifest.assertions.find(a => a.label === 'test.xss');
      expect(testAssertion?.data.name).not.toContain('<script>');
    });
  });

  describe('Timestamp Validation', () => {
    it('should include valid timestamp in manifest', async () => {
      const beforeTime = Date.now();
      const manifest = await builder.buildManifest(Buffer.from('test'), {});
      const afterTime = Date.now();

      const manifestTime = new Date(manifest.claim_generator_info[0].created_at).getTime();
      
      expect(manifestTime).toBeGreaterThanOrEqual(beforeTime);
      expect(manifestTime).toBeLessThanOrEqual(afterTime);
    });

    it('should format timestamp as ISO 8601', async () => {
      const manifest = await builder.buildManifest(Buffer.from('test'), {});

      expect(manifest.claim_generator_info[0].created_at).toMatch(
        /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/
      );
    });

    it('should reject future timestamps', async () => {
      const futureTime = new Date(Date.now() + 86400000).toISOString(); // +1 day

      await expect(
        builder.buildManifest(Buffer.from('test'), {
          timestamp: futureTime as any
        })
      ).rejects.toThrow('Invalid timestamp');
    });

    it('should reject timestamps older than 1 hour', async () => {
      const oldTime = new Date(Date.now() - 7200000).toISOString(); // -2 hours

      await expect(
        builder.buildManifest(Buffer.from('test'), {
          timestamp: oldTime as any
        })
      ).rejects.toThrow('Timestamp too old');
    });
  });

  describe('Malformed Input Handling', () => {
    it('should reject null image buffer', async () => {
      await expect(
        builder.buildManifest(null as any, {})
      ).rejects.toThrow('Invalid image buffer');
    });

    it('should reject empty image buffer', async () => {
      await expect(
        builder.buildManifest(Buffer.alloc(0), {})
      ).rejects.toThrow('Empty image buffer');
    });

    it('should reject oversized image buffer', async () => {
      const hugeBuffer = Buffer.alloc(100 * 1024 * 1024); // 100MB

      await expect(
        builder.buildManifest(hugeBuffer, {})
      ).rejects.toThrow('Image too large');
    });

    it('should handle malformed creator name', async () => {
      const manifest = await builder.buildManifest(Buffer.from('test'), {
        creator: 'A'.repeat(1000) // Too long
      });

      expect(manifest.claim_generator_info[0].author.length).toBeLessThanOrEqual(200);
    });

    it('should handle special characters in title', async () => {
      const manifest = await builder.buildManifest(Buffer.from('test'), {
        title: 'Test\x00Title\x01With\x02Control\x03Chars'
      });

      expect(manifest.title).not.toMatch(/[\x00-\x1F]/);
    });

    it('should handle unicode in metadata', async () => {
      const manifest = await builder.buildManifest(Buffer.from('test'), {
        creator: '测试用户',
        title: 'Тестовое изображение'
      });

      expect(manifest.claim_generator_info[0].author).toBe('测试用户');
      expect(manifest.title).toBe('Тестовое изображение');
    });
  });

  describe('Image Dimensions', () => {
    it('should extract image dimensions from buffer', async () => {
      // Create minimal JPEG with known dimensions
      const jpegBuffer = Buffer.from('test-jpeg-data'); // Mock
      
      const manifest = await builder.buildManifest(jpegBuffer, {});

      expect(manifest.assertions.some(a => 
        a.label === 'stds.schema-org.ImageObject'
      )).toBe(true);
    });

    it('should handle images without dimension metadata', async () => {
      const corruptBuffer = Buffer.from([0xFF, 0xD8, 0xFF]); // Incomplete JPEG

      // Should not throw, just skip dimension assertion
      await expect(
        builder.buildManifest(corruptBuffer, {})
      ).resolves.toBeDefined();
    });
  });

  describe('Hash Calculation', () => {
    it('should include correct hash assertion', async () => {
      const imageBuffer = Buffer.from('test-image-data');
      const expectedHash = crypto.createHash('sha256').update(imageBuffer).digest('hex');

      const manifest = await builder.buildManifest(imageBuffer, {});

      const hashAssertion = manifest.assertions.find(a => 
        a.label === 'c2pa.hash.data'
      );

      expect(hashAssertion).toBeDefined();
      expect(hashAssertion?.data.hash).toBe(expectedHash);
      expect(hashAssertion?.data.algorithm).toBe('sha256');
    });

    it('should use SHA-256 algorithm', async () => {
      const manifest = await builder.buildManifest(Buffer.from('test'), {});

      const hashAssertion = manifest.assertions.find(a => 
        a.label === 'c2pa.hash.data'
      );

      expect(hashAssertion?.data.algorithm).toBe('sha256');
    });
  });

  describe('Performance', () => {
    it('should build manifest in under 100ms for small images', async () => {
      const smallBuffer = Buffer.alloc(1024); // 1KB
      
      const startTime = Date.now();
      await builder.buildManifest(smallBuffer, {});
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });

    it('should handle concurrent manifest builds', async () => {
      const buffers = Array(10).fill(null).map((_, i) => 
        Buffer.from(`test-${i}`)
      );

      const manifests = await Promise.all(
        buffers.map(buf => builder.buildManifest(buf, {}))
      );

      expect(manifests).toHaveLength(10);
      expect(new Set(manifests.map(m => m.instance_id)).size).toBe(10);
    });
  });
});
