import { C2PAService, ValidationError, SigningError } from '../services/c2pa-service';

describe('C2PAService', () => {
  let service: C2PAService;
  let testImageBuffer: Buffer;

  beforeAll(() => {
    service = new C2PAService();
    
    // Create a simple test image buffer (1x1 pixel JPEG)
    testImageBuffer = Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
      0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
      0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0x80, 0xFF, 0xD9
    ]);
  });

  describe('signImage', () => {
    it('should sign a valid JPEG image', async () => {
      const result = await service.signImage(testImageBuffer);
      
      expect(result).toHaveProperty('manifestUri');
      expect(result).toHaveProperty('signature');
      expect(result).toHaveProperty('proofUri');
      expect(result).toHaveProperty('imageHash');
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('certificateId');
      
      expect(result.manifestUri).toMatch(/^urn:uuid:/);
      expect(result.signature).toBeTruthy();
      expect(result.signature.length).toBeGreaterThan(50);
      expect(result.proofUri).toMatch(/^https:\/\/proofs\.credlink\.com\//);
      expect(result.imageHash).toMatch(/^sha256:[a-f0-9]{64}:phash:/);
    });

    it('should include custom creator in options', async () => {
      const result = await service.signImage(testImageBuffer, {
        creator: 'Test Creator'
      });
      
      expect(result).toHaveProperty('manifestUri');
      expect(result.certificateId).toBeTruthy();
    });

    it('should reject empty buffer', async () => {
      await expect(service.signImage(Buffer.from('')))
        .rejects
        .toThrow(ValidationError);
    });

    it('should reject non-buffer input', async () => {
      await expect(service.signImage('not a buffer' as any))
        .rejects
        .toThrow(ValidationError);
    });

    it('should reject oversized images', async () => {
      const largeImage = Buffer.alloc(60 * 1024 * 1024); // 60MB
      
      await expect(service.signImage(largeImage))
        .rejects
        .toThrow('exceeds 50MB limit');
    });

    it('should reject unsupported formats', async () => {
      const pdfBuffer = Buffer.from('%PDF-1.4');
      
      await expect(service.signImage(pdfBuffer))
        .rejects
        .toThrow('Unable to detect image format');
    });

    it('should generate consistent hashes for identical images', async () => {
      const result1 = await service.signImage(testImageBuffer);
      const result2 = await service.signImage(testImageBuffer);
      
      // Image hashes should be the same
      expect(result1.imageHash).toBe(result2.imageHash);
      
      // But manifest URIs should be different (unique UUIDs)
      expect(result1.manifestUri).not.toBe(result2.manifestUri);
    });
  });

  describe('Performance', () => {
    it('should sign images within 2 seconds', async () => {
      const startTime = Date.now();
      await service.signImage(testImageBuffer);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(2000);
    });

    it('should handle concurrent signing requests', async () => {
      const promises = Array(5).fill(null).map(() => 
        service.signImage(testImageBuffer)
      );
      
      const results = await Promise.all(promises);
      expect(results).toHaveLength(5);
      
      // Verify all results are unique
      const manifestUris = results.map(r => r.manifestUri);
      const uniqueUris = new Set(manifestUris);
      expect(uniqueUris.size).toBe(5);
    });
  });
});
