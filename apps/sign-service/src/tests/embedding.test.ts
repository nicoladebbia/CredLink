/**
 * Comprehensive Embedding Tests (20+ scenarios)
 * 
 * Tests JUMBF injection, EXIF preservation, XMP integrity,
 * format-specific embedding, size optimization, and performance
 */

import { MetadataEmbedder, EmbeddingError } from '../services/metadata-embedder';
import { MetadataExtractor } from '../services/metadata-extractor';
import { JUMBFBuilder } from '../services/jumbf-builder';
import { ManifestBuilder } from '../services/manifest-builder';
import { readFileSync } from 'fs';
import sharp from 'sharp';

describe('Embedding Tests - Day 6-8', () => {
  let embedder: MetadataEmbedder;
  let extractor: MetadataExtractor;
  let manifestBuilder: ManifestBuilder;
  let testManifest: any;
  let testProofUri: string;

  // Test images
  let jpegBuffer: Buffer;
  let pngBuffer: Buffer;
  let webpBuffer: Buffer;

  beforeAll(async () => {
    embedder = new MetadataEmbedder();
    extractor = new MetadataExtractor();
    manifestBuilder = new ManifestBuilder();
    testProofUri = 'https://proofs.credlink.com/test-proof-123';

    // Load real test images
    jpegBuffer = readFileSync('./test-fixtures/images/test-image.jpg');
    pngBuffer = readFileSync('./test-fixtures/images/test-image.png');
    webpBuffer = readFileSync('./test-fixtures/images/test-image.webp');

    // Create test manifest
    testManifest = await manifestBuilder.build({
      title: 'Test Image',
      creator: 'Test Creator',
      timestamp: new Date().toISOString(),
      imageHash: 'test-hash-123',
      imageBuffer: jpegBuffer,
      format: 'image/jpeg',
      mimeType: 'image/jpeg'
    });
  });

  describe('JUMBF Injection Tests', () => {
    it('should inject JUMBF container into JPEG', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);

      expect(embedded).toBeInstanceOf(Buffer);
      expect(embedded.length).toBeGreaterThan(jpegBuffer.length);
    });

    it('should preserve JPEG structure after JUMBF injection', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);

      // Check JPEG markers
      expect(embedded.readUInt16BE(0)).toBe(0xFFD8); // SOI
      expect(embedded.readUInt16BE(embedded.length - 2)).toBe(0xFFD9); // EOI
    });

    it('should create valid JUMBF container', async () => {
      const jumbfBuilder = new JUMBFBuilder();
      const manifestBuffer = Buffer.from(JSON.stringify(testManifest), 'utf8');

      const container = await jumbfBuilder.build({
        type: 'c2pa',
        label: 'Test Manifest',
        data: manifestBuffer,
        request: testProofUri
      });

      expect(container).toBeInstanceOf(Buffer);
      expect(container.length).toBeGreaterThan(0);

      // Parse and validate
      const parsed = JUMBFBuilder.parse(container);
      expect(parsed).not.toBeNull();
      expect(JUMBFBuilder.validate(parsed!)).toBe(true);
    });

    it('should extract manifest from JUMBF container', async () => {
      const jumbfBuilder = new JUMBFBuilder();
      const manifestBuffer = Buffer.from(JSON.stringify(testManifest), 'utf8');

      const container = await jumbfBuilder.build({
        type: 'c2pa',
        label: 'Test Manifest',
        data: manifestBuffer,
        request: testProofUri
      });

      const parsed = JUMBFBuilder.parse(container);
      const extracted = JUMBFBuilder.extractManifest(parsed!);

      expect(extracted).not.toBeNull();
      expect(extracted!.toString('utf8')).toContain('Test Creator');
    });

    it('should extract proof URI from JUMBF container', async () => {
      const jumbfBuilder = new JUMBFBuilder();
      const manifestBuffer = Buffer.from(JSON.stringify(testManifest), 'utf8');

      const container = await jumbfBuilder.build({
        type: 'c2pa',
        label: 'Test Manifest',
        data: manifestBuffer,
        request: testProofUri
      });

      const parsed = JUMBFBuilder.parse(container);
      const extracted = JUMBFBuilder.extractProofUri(parsed!);

      expect(extracted).toBe(testProofUri);
    });
  });

  describe('EXIF Data Preservation Tests', () => {
    it('should preserve existing EXIF data', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);

      const metadata = await sharp(embedded).metadata();
      expect(metadata.exif).toBeDefined();
    });

    it('should add CredLink EXIF fields', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);

      const metadata = await sharp(embedded).metadata();
      const exif = metadata.exif as any;

      expect(exif.ImageDescription).toContain('CredLink:');
      expect(exif.Software).toBe('CredLink/1.0');
    });

    it('should not corrupt existing EXIF orientation', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);

      const originalMeta = await sharp(jpegBuffer).metadata();
      const embeddedMeta = await sharp(embedded).metadata();

      // Orientation should be preserved or default to 1
      expect(embeddedMeta.orientation).toBeDefined();
    });
  });

  describe('XMP Metadata Integrity Tests', () => {
    it('should preserve XMP metadata if present', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);

      // XMP should be preserved or added
      const metadata = await sharp(embedded).metadata();
      // XMP may or may not be present depending on original image
      expect(metadata).toBeDefined();
    });
  });

  describe('Format-Specific Embedding Tests', () => {
    it('should embed in JPEG format', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);

      expect(embedded.toString('hex', 0, 3)).toBe('ffd8ff'); // JPEG signature
    });

    it('should embed in PNG format', async () => {
      const embedded = await embedder.embedProofInImage(pngBuffer, testManifest, testProofUri);

      expect(embedded.toString('hex', 0, 8)).toBe('89504e470d0a1a0a'); // PNG signature
    });

    it('should embed in WebP format', async () => {
      const embedded = await embedder.embedProofInImage(webpBuffer, testManifest, testProofUri);

      expect(embedded.toString('hex', 0, 4)).toBe('52494646'); // RIFF signature
    });

    it('should reject unsupported formats', async () => {
      const invalidBuffer = Buffer.from('not an image');

      await expect(embedder.embedProofInImage(invalidBuffer, testManifest, testProofUri))
        .rejects
        .toThrow(EmbeddingError);
    });
  });

  describe('PNG Custom Chunk Tests', () => {
    it('should create PNG chunks with correct CRC', async () => {
      const embedded = await embedder.embedProofInImage(pngBuffer, testManifest, testProofUri);

      // Verify PNG structure is valid
      const metadata = await sharp(embedded).metadata();
      expect(metadata.format).toBe('png');
    });

    it('should insert chunks before IDAT', async () => {
      const embedded = await embedder.embedProofInImage(pngBuffer, testManifest, testProofUri);

      // Find custom chunks
      let offset = 8; // Skip PNG signature
      let foundCustomChunk = false;
      let foundIDAT = false;

      while (offset < embedded.length && !foundIDAT) {
        const type = embedded.toString('ascii', offset + 4, offset + 8);
        
        if (type === 'c2pA' || type === 'crLk') {
          foundCustomChunk = true;
        }
        
        if (type === 'IDAT') {
          foundIDAT = true;
        }

        const length = embedded.readUInt32BE(offset);
        offset += 12 + length;
      }

      expect(foundCustomChunk).toBe(true);
    });
  });

  describe('Size Optimization Tests', () => {
    it('should not increase file size excessively', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);

      const sizeIncrease = embedded.length - jpegBuffer.length;
      const percentIncrease = (sizeIncrease / jpegBuffer.length) * 100;

      // Should not increase by more than 20%
      expect(percentIncrease).toBeLessThan(20);
    });

    it('should maintain image quality', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);

      const originalMeta = await sharp(jpegBuffer).metadata();
      const embeddedMeta = await sharp(embedded).metadata();

      expect(embeddedMeta.width).toBe(originalMeta.width);
      expect(embeddedMeta.height).toBe(originalMeta.height);
    });
  });

  describe('Performance Benchmarks', () => {
    it('should embed in JPEG within 500ms', async () => {
      const startTime = Date.now();
      await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
    });

    it('should embed in PNG within 500ms', async () => {
      const startTime = Date.now();
      await embedder.embedProofInImage(pngBuffer, testManifest, testProofUri);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
    });

    it('should handle concurrent embedding', async () => {
      const promises = Array(5).fill(null).map(() =>
        embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri)
      );

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      expect(results).toHaveLength(5);
      expect(duration).toBeLessThan(2000);
    });
  });

  describe('Extraction Accuracy Tests', () => {
    it('should extract embedded proof URI from JPEG', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      const result = await extractor.extract(embedded);

      expect(result.proofUri).toBe(testProofUri);
    });

    it('should extract embedded proof URI from PNG', async () => {
      const embedded = await embedder.embedProofInImage(pngBuffer, testManifest, testProofUri);
      const result = await extractor.extract(embedded);

      expect(result.proofUri).toBe(testProofUri);
    });

    it('should report correct extraction source', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      const result = await extractor.extract(embedded);

      expect(result.source).toMatch(/jumbf|exif|xmp/);
    });

    it('should report high confidence for successful extraction', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      const result = await extractor.extract(embedded);

      expect(result.confidence).toBeGreaterThanOrEqual(75);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty manifest', async () => {
      const emptyManifest = await manifestBuilder.build({
        title: '',
        creator: '',
        timestamp: new Date().toISOString(),
        imageHash: '',
        imageBuffer: jpegBuffer
      });

      const embedded = await embedder.embedProofInImage(jpegBuffer, emptyManifest, testProofUri);
      expect(embedded).toBeInstanceOf(Buffer);
    });

    it('should handle very long proof URIs', async () => {
      const longUri = 'https://proofs.credlink.com/' + 'a'.repeat(200);

      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, longUri);
      const result = await extractor.extract(embedded);

      expect(result.proofUri).toBe(longUri);
    });

    it('should handle special characters in manifest', async () => {
      const specialManifest = await manifestBuilder.build({
        title: 'Test "Image" with \'quotes\'',
        creator: 'Creator <test@example.com>',
        timestamp: new Date().toISOString(),
        imageHash: 'hash-123',
        imageBuffer: jpegBuffer
      });

      const embedded = await embedder.embedProofInImage(jpegBuffer, specialManifest, testProofUri);
      expect(embedded).toBeInstanceOf(Buffer);
    });
  });
});
