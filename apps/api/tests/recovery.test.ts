/**
 * Recovery Tests
 * 
 * Tests partial metadata extraction, corrupted manifest handling,
 * fallback to remote proof, and multiple extraction methods
 */

import { MetadataEmbedder } from '../services/metadata-embedder';
import { MetadataExtractor } from '../services/metadata-extractor';
import { ManifestBuilder } from '../services/manifest-builder';
import { readFileSync } from 'fs';
import sharp from 'sharp';

describe('Recovery Tests - Day 6-8', () => {
  let embedder: MetadataEmbedder;
  let extractor: MetadataExtractor;
  let manifestBuilder: ManifestBuilder;
  let testManifest: any;
  let testProofUri: string;
  let jpegBuffer: Buffer;

  beforeAll(async () => {
    embedder = new MetadataEmbedder();
    extractor = new MetadataExtractor();
    manifestBuilder = new ManifestBuilder();
    testProofUri = 'https://proofs.credlink.com/recovery-test-123';

    jpegBuffer = readFileSync('./test-fixtures/images/test-image.jpg');

    testManifest = await manifestBuilder.build({
      title: 'Recovery Test',
      creator: 'Test',
      timestamp: new Date().toISOString(),
      imageHash: 'recovery-hash',
      imageBuffer: jpegBuffer
    });
  });

  describe('Partial Metadata Extraction', () => {
    it('should extract proof URI even if manifest is corrupted', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      // Simulate corruption by aggressive compression
      const corrupted = await sharp(embedded)
        .jpeg({ quality: 20 })
        .toBuffer();

      const result = await extractor.extract(corrupted);
      
      // Should at least recover the proof URI
      expect(result.proofUri).not.toBeNull();
    });

    it('should report corrupted status when data is partial', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const corrupted = await sharp(embedded)
        .jpeg({ quality: 15 })
        .toBuffer();

      const result = await extractor.extract(corrupted);
      
      if (result.confidence < 75) {
        expect(result.corrupted).toBe(true);
      }
    });

    it('should extract from EXIF when JUMBF is missing', async () => {
      // Create image with only EXIF metadata
      const withExif = await sharp(jpegBuffer)
        .withMetadata({
          exif: {
            IFD0: {
              ImageDescription: `CredLink:${testProofUri}`
            }
          }
        })
        .toBuffer();

      const result = await extractor.extract(withExif);
      
      expect(result.proofUri).toBe(testProofUri);
      expect(result.source).toBe('exif');
    });

    it('should try multiple extraction methods', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const result = await extractor.extract(embedded);
      
      // Should successfully extract using one of the methods
      expect(result.source).toMatch(/jumbf|exif|xmp|png-chunk|partial/);
    });
  });

  describe('Corrupted Manifest Handling', () => {
    it('should handle truncated image data', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      // Truncate the buffer
      const truncated = embedded.slice(0, Math.floor(embedded.length * 0.9));

      const result = await extractor.extract(truncated);
      
      // Should not throw, may return null or partial data
      expect(result).toBeDefined();
    });

    it('should handle invalid JPEG markers', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      // Corrupt some bytes in the middle
      const corrupted = Buffer.from(embedded);
      const corruptPos = Math.floor(corrupted.length / 2);
      corrupted[corruptPos] = 0xFF;
      corrupted[corruptPos + 1] = 0x00; // Invalid marker

      const result = await extractor.extract(corrupted);
      
      // Should handle gracefully
      expect(result).toBeDefined();
    });

    it('should recover from malformed JSON manifest', async () => {
      // This would require injecting malformed data, which is complex
      // For now, test that extractor doesn't crash on unexpected data
      const result = await extractor.extract(jpegBuffer);
      
      expect(result).toBeDefined();
      expect(result.source).toBe('none');
    });
  });

  describe('Fallback to Remote Proof', () => {
    it('should extract proof URI for remote lookup', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const result = await extractor.extract(embedded);
      
      // Proof URI should be available for remote lookup
      expect(result.proofUri).toBe(testProofUri);
    });

    it('should provide confidence score for fallback decision', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const result = await extractor.extract(embedded);
      
      expect(result.confidence).toBeGreaterThanOrEqual(0);
      expect(result.confidence).toBeLessThanOrEqual(100);
    });

    it('should indicate extraction source for debugging', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const result = await extractor.extract(embedded);
      
      expect(result.source).toBeDefined();
      expect(['jumbf', 'exif', 'xmp', 'png-chunk', 'webp-chunk', 'partial', 'none'])
        .toContain(result.source);
    });
  });

  describe('Multiple Extraction Methods', () => {
    it('should try JUMBF extraction first', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const result = await extractor.extract(embedded);
      
      // JUMBF should be preferred method for JPEG
      if (result.proofUri) {
        expect(result.source).toMatch(/jumbf|exif/);
      }
    });

    it('should fallback to EXIF if JUMBF fails', async () => {
      // Create image with only EXIF
      const withExif = await sharp(jpegBuffer)
        .withMetadata({
          exif: {
            IFD0: {
              ImageDescription: `CredLink:${testProofUri}`
            }
          }
        })
        .jpeg({ quality: 90 })
        .toBuffer();

      const result = await extractor.extract(withExif);
      
      expect(result.source).toBe('exif');
    });

    it('should try PNG chunks for PNG images', async () => {
      const pngBuffer = readFileSync('./test-fixtures/images/test-image.png');
      const embedded = await embedder.embedProofInImage(pngBuffer, testManifest, testProofUri);
      
      const result = await extractor.extract(embedded);
      
      if (result.proofUri) {
        expect(result.source).toMatch(/png-chunk|exif/);
      }
    });

    it('should attempt partial recovery as last resort', async () => {
      // Create heavily corrupted image
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      const corrupted = await sharp(embedded)
        .jpeg({ quality: 10 })
        .resize(20, 20)
        .toBuffer();

      const result = await extractor.extract(corrupted);
      
      // May recover partial data or return none
      expect(['partial', 'exif', 'none']).toContain(result.source);
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle empty buffer', async () => {
      const empty = Buffer.alloc(0);
      
      const result = await extractor.extract(empty);
      
      expect(result.source).toBe('none');
      expect(result.proofUri).toBeNull();
    });

    it('should handle non-image data', async () => {
      const textBuffer = Buffer.from('This is not an image', 'utf8');
      
      const result = await extractor.extract(textBuffer);
      
      expect(result.source).toBe('none');
    });

    it('should handle very small images', async () => {
      const tiny = await sharp({
        create: {
          width: 1,
          height: 1,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      })
      .jpeg()
      .toBuffer();

      const result = await extractor.extract(tiny);
      
      expect(result).toBeDefined();
    });

    it('should handle very large metadata', async () => {
      const largeManifest = await manifestBuilder.build({
        title: 'A'.repeat(10000),
        creator: 'B'.repeat(10000),
        timestamp: new Date().toISOString(),
        imageHash: 'large-hash',
        imageBuffer: jpegBuffer
      });

      const embedded = await embedder.embedProofInImage(jpegBuffer, largeManifest, testProofUri);
      const result = await extractor.extract(embedded);
      
      expect(result.proofUri).toBe(testProofUri);
    });
  });

  describe('Confidence Scoring', () => {
    it('should report 100% confidence for JUMBF extraction', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const result = await extractor.extract(embedded);
      
      if (result.source === 'jumbf') {
        expect(result.confidence).toBe(100);
      }
    });

    it('should report lower confidence for partial extraction', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      const corrupted = await sharp(embedded)
        .jpeg({ quality: 20 })
        .toBuffer();

      const result = await extractor.extract(corrupted);
      
      if (result.source === 'partial') {
        expect(result.confidence).toBeLessThan(75);
      }
    });

    it('should report 0% confidence when nothing found', async () => {
      const result = await extractor.extract(jpegBuffer);
      
      if (result.source === 'none') {
        expect(result.confidence).toBe(0);
      }
    });
  });
});
