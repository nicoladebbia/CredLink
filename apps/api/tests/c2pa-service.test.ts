import { C2PAService, ValidationError } from '../src/services/c2pa-service';
import { MetadataEmbedder } from '../src/services/metadata-embedder';
import { MetadataExtractor } from '../src/services/metadata-extractor';
import { ManifestBuilder } from '../src/services/manifest-builder';
import { TEST_CONSTANTS } from './config/test-constants';
import { readFileSync } from 'fs';

describe('C2PAService', () => {
  let service: C2PAService;
  let testImageBuffer: Buffer;

  beforeAll(() => {
    service = new C2PAService();
    
    // Load actual test image
    testImageBuffer = readFileSync('./test-fixtures/images/test-image.jpg');
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
      
      expect(duration).toBeLessThan(TEST_CONSTANTS.PERFORMANCE_THRESHOLD_MS);
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
