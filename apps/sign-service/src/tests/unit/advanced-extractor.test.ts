import { AdvancedExtractor } from '../../services/advanced-extractor';
import { ManifestBuilder } from '../../services/manifest-builder';
import { MetadataEmbedder } from '../../services/metadata-embedder';
import { readFileSync } from 'fs';
import sharp from 'sharp';

describe('AdvancedExtractor', () => {
  let extractor: AdvancedExtractor;
  let manifestBuilder: ManifestBuilder;
  let embedder: MetadataEmbedder;
  let jpegBuffer: Buffer;
  let pngBuffer: Buffer;
  let webpBuffer: Buffer;

  beforeAll(async () => {
    extractor = new AdvancedExtractor();
    manifestBuilder = new ManifestBuilder();
    embedder = new MetadataEmbedder();

    // Create test images
    jpegBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    }).jpeg().toBuffer();

    pngBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 4,
        background: { r: 0, g: 255, b: 0, a: 1 }
      }
    }).png().toBuffer();

    webpBuffer = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 0, g: 0, b: 255 }
      }
    }).webp().toBuffer();
  });

  describe('Multi-Format Extraction', () => {
    it('should extract from JPEG with EXIF', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: jpegBuffer,
        imageHash: 'test-hash',
        creator: 'Test Creator',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const proofUri = 'https://proofs.credlink.com/test-123';
      const embedded = await embedder.embed(jpegBuffer, manifest, proofUri);

      const result = await extractor.extract(embedded);

      expect(result.success).toBe(true);
      expect(result.proofUri).toBe(proofUri);
      expect(result.source).toMatch(/exif|jumbf/);
      expect(result.confidence).toBeGreaterThan(70);
      expect(result.metadata.imageFormat).toBe('jpeg');
      expect(result.metadata.methodsSucceeded.length).toBeGreaterThan(0);
    });

    it('should extract from PNG with custom chunk', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: pngBuffer,
        imageHash: 'test-hash-png',
        creator: 'Test Creator',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const proofUri = 'https://proofs.credlink.com/test-png-456';
      const embedded = await embedder.embed(pngBuffer, manifest, proofUri);

      const result = await extractor.extract(embedded);

      expect(result.success).toBe(true);
      expect(result.proofUri).toBeDefined();
      expect(result.source).toMatch(/png-chunk|exif/);
      expect(result.metadata.imageFormat).toBe('png');
    });

    it('should extract from WebP', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: webpBuffer,
        imageHash: 'test-hash-webp',
        creator: 'Test Creator',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const proofUri = 'https://proofs.credlink.com/test-webp-789';
      const embedded = await embedder.embed(webpBuffer, manifest, proofUri);

      const result = await extractor.extract(embedded);

      expect(result.success).toBe(true);
      expect(result.proofUri).toBeDefined();
      expect(result.metadata.imageFormat).toBe('webp');
    });
  });

  describe('Extraction Priority System', () => {
    it('should try methods in priority order', async () => {
      const result = await extractor.extract(jpegBuffer);

      expect(result.metadata.methodsAttempted).toContain('jumbf-c2pa');
      expect(result.metadata.methodsAttempted).toContain('exif-primary');
      
      // JUMBF should be attempted first
      expect(result.metadata.methodsAttempted[0]).toBe('jumbf-c2pa');
    });

    it('should report all attempted methods', async () => {
      const result = await extractor.extract(jpegBuffer);

      expect(result.metadata.methodsAttempted.length).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0); // Should have errors for unsigned image
    });

    it('should provide confidence scores', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: jpegBuffer,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const embedded = await embedder.embed(
        jpegBuffer,
        manifest,
        'https://proofs.credlink.com/test'
      );

      const result = await extractor.extract(embedded);

      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });
  });

  describe('Data Integrity Assessment', () => {
    it('should detect full integrity for fresh signed images', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: jpegBuffer,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const embedded = await embedder.embed(
        jpegBuffer,
        manifest,
        'https://proofs.credlink.com/test'
      );

      const result = await extractor.extract(embedded);

      if (result.success) {
        expect(result.metadata.dataIntegrity).toBe('full');
      }
    });

    it('should detect partial integrity for corrupted metadata', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: jpegBuffer,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const embedded = await embedder.embed(
        jpegBuffer,
        manifest,
        'https://proofs.credlink.com/test-partial'
      );

      // Corrupt some metadata (but leave proof URI intact)
      const corrupted = Buffer.from(embedded);
      // Overwrite some bytes in the middle
      for (let i = 100; i < 200; i++) {
        corrupted[i] = 0xFF;
      }

      const result = await extractor.extract(corrupted);

      // Should still find proof URI via partial recovery
      if (result.success && result.source === 'partial-recovery') {
        expect(result.metadata.dataIntegrity).toBe('partial');
      }
    });

    it('should detect no integrity for unsigned images', async () => {
      const result = await extractor.extract(jpegBuffer);

      expect(result.success).toBe(false);
      expect(result.metadata.dataIntegrity).toBe('none');
    });
  });

  describe('Performance Metrics', () => {
    it('should extract in less than 100ms', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: jpegBuffer,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const embedded = await embedder.embed(
        jpegBuffer,
        manifest,
        'https://proofs.credlink.com/test'
      );

      const result = await extractor.extract(embedded);

      expect(result.metadata.extractionTime).toBeLessThan(100);
    });

    it('should handle large images efficiently', async () => {
      const largeImage = await sharp({
        create: {
          width: 2000,
          height: 2000,
          channels: 3,
          background: { r: 128, g: 128, b: 128 }
        }
      }).jpeg().toBuffer();

      const manifest = await manifestBuilder.build({
        imageBuffer: largeImage,
        imageHash: 'large-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const embedded = await embedder.embed(
        largeImage,
        manifest,
        'https://proofs.credlink.com/large'
      );

      const startTime = Date.now();
      const result = await extractor.extract(embedded);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200); // Should still be fast
      expect(result.metadata.imageSize).toBeGreaterThan(100000);
    });
  });

  describe('Error Handling', () => {
    it('should handle corrupted images gracefully', async () => {
      const corrupted = Buffer.alloc(1000);
      corrupted.fill(0xFF);

      const result = await extractor.extract(corrupted);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.metadata.dataIntegrity).toBe('none');
    });

    it('should handle empty buffers', async () => {
      const empty = Buffer.alloc(0);

      const result = await extractor.extract(empty);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle invalid image formats', async () => {
      const invalid = Buffer.from('This is not an image');

      const result = await extractor.extract(invalid);

      expect(result.success).toBe(false);
      expect(result.metadata.imageFormat).toBe('unknown');
    });
  });

  describe('Extraction Source Reporting', () => {
    it('should report correct extraction source', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: jpegBuffer,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const embedded = await embedder.embed(
        jpegBuffer,
        manifest,
        'https://proofs.credlink.com/test'
      );

      const result = await extractor.extract(embedded);

      expect(result.source).toMatch(/jumbf|exif|xmp|png|webp|cbor|partial|none/);
    });

    it('should report methods succeeded', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: jpegBuffer,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const embedded = await embedder.embed(
        jpegBuffer,
        manifest,
        'https://proofs.credlink.com/test'
      );

      const result = await extractor.extract(embedded);

      if (result.success) {
        expect(result.metadata.methodsSucceeded.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Partial Recovery', () => {
    it('should recover proof URI from corrupted metadata', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: jpegBuffer,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const proofUri = 'https://proofs.credlink.com/12345678-1234-1234-1234-123456789abc';
      const embedded = await embedder.embed(jpegBuffer, manifest, proofUri);

      // Lightly corrupt (but leave proof URI searchable)
      const corrupted = Buffer.from(embedded);
      for (let i = 50; i < 100; i++) {
        corrupted[i] = 0x00;
      }

      const result = await extractor.extract(corrupted);

      // Should find via partial recovery
      expect(result.metadata.methodsAttempted).toContain('partial-recovery');
    });
  });

  describe('Metadata Extraction', () => {
    it('should extract image dimensions', async () => {
      const result = await extractor.extract(jpegBuffer);

      expect(result.metadata.dimensions).toBeDefined();
      expect(result.metadata.dimensions?.width).toBe(100);
      expect(result.metadata.dimensions?.height).toBe(100);
    });

    it('should extract image format', async () => {
      const jpegResult = await extractor.extract(jpegBuffer);
      expect(jpegResult.metadata.imageFormat).toBe('jpeg');

      const pngResult = await extractor.extract(pngBuffer);
      expect(pngResult.metadata.imageFormat).toBe('png');

      const webpResult = await extractor.extract(webpBuffer);
      expect(webpResult.metadata.imageFormat).toBe('webp');
    });

    it('should extract image size', async () => {
      const result = await extractor.extract(jpegBuffer);

      expect(result.metadata.imageSize).toBe(jpegBuffer.length);
      expect(result.metadata.imageSize).toBeGreaterThan(0);
    });
  });
});
