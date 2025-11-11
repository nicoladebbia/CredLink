/**
 * Survival Tests (18 scenarios)
 * 
 * Tests metadata survival through real-world transformations:
 * - Social media compression
 * - Format conversions
 * - Resizing/cropping
 * - Filters and effects
 */

import { MetadataEmbedder } from '../services/metadata-embedder';
import { MetadataExtractor } from '../services/metadata-extractor';
import { ManifestBuilder } from '../services/manifest-builder';
import { readFileSync } from 'fs';
import sharp from 'sharp';

describe('Survival Tests - Day 6-8', () => {
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
    testProofUri = 'https://proofs.credlink.com/survival-test';

    jpegBuffer = readFileSync('./test-fixtures/images/test-image.jpg');

    testManifest = await manifestBuilder.build({
      title: 'Survival Test',
      creator: 'Test',
      timestamp: new Date().toISOString(),
      imageHash: 'test-hash',
      imageBuffer: jpegBuffer
    });
  });

  describe('Compression Tests', () => {
    it('should survive JPEG quality reduction to 80%', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const compressed = await sharp(embedded)
        .jpeg({ quality: 80 })
        .toBuffer();

      const result = await extractor.extract(compressed);
      expect(result.proofUri).toBe(testProofUri);
    });

    it('should survive JPEG quality reduction to 60%', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const compressed = await sharp(embedded)
        .jpeg({ quality: 60 })
        .toBuffer();

      const result = await extractor.extract(compressed);
      expect(result.proofUri).not.toBeNull();
    });

    it('should survive aggressive compression (40% quality)', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const compressed = await sharp(embedded)
        .jpeg({ quality: 40 })
        .toBuffer();

      const result = await extractor.extract(compressed);
      // May survive with lower confidence or partial data
      expect(result.source).not.toBe('none');
    });
  });

  describe('Format Conversion Tests', () => {
    it('should survive JPEG to PNG conversion', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const converted = await sharp(embedded)
        .png()
        .toBuffer();

      const result = await extractor.extract(converted);
      expect(result.proofUri).toBe(testProofUri);
    });

    it('should survive JPEG to WebP conversion', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const converted = await sharp(embedded)
        .webp({ quality: 90 })
        .toBuffer();

      const result = await extractor.extract(converted);
      expect(result.proofUri).toBe(testProofUri);
    });

    it('should survive PNG to JPEG conversion', async () => {
      const pngBuffer = readFileSync('./test-fixtures/images/test-image.png');
      const embedded = await embedder.embedProofInImage(pngBuffer, testManifest, testProofUri);
      
      const converted = await sharp(embedded)
        .jpeg({ quality: 90 })
        .toBuffer();

      const result = await extractor.extract(converted);
      expect(result.proofUri).not.toBeNull();
    });
  });

  describe('Resizing Tests', () => {
    it('should survive 50% downscale', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const metadata = await sharp(embedded).metadata();
      const resized = await sharp(embedded)
        .resize(Math.floor(metadata.width! / 2), Math.floor(metadata.height! / 2))
        .toBuffer();

      const result = await extractor.extract(resized);
      expect(result.proofUri).toBe(testProofUri);
    });

    it('should survive 25% downscale', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const metadata = await sharp(embedded).metadata();
      const resized = await sharp(embedded)
        .resize(Math.floor(metadata.width! / 4), Math.floor(metadata.height! / 4))
        .toBuffer();

      const result = await extractor.extract(resized);
      expect(result.proofUri).not.toBeNull();
    });

    it('should survive 2x upscale', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const metadata = await sharp(embedded).metadata();
      const resized = await sharp(embedded)
        .resize(metadata.width! * 2, metadata.height! * 2)
        .toBuffer();

      const result = await extractor.extract(resized);
      expect(result.proofUri).toBe(testProofUri);
    });
  });

  describe('Cropping Tests', () => {
    it('should survive center crop (80%)', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const metadata = await sharp(embedded).metadata();
      const cropSize = Math.floor(Math.min(metadata.width!, metadata.height!) * 0.8);
      
      const cropped = await sharp(embedded)
        .extract({
          left: Math.floor((metadata.width! - cropSize) / 2),
          top: Math.floor((metadata.height! - cropSize) / 2),
          width: cropSize,
          height: cropSize
        })
        .withMetadata() // Preserve metadata
        .toBuffer();

      const result = await extractor.extract(cropped);
      expect(result.proofUri).toBe(testProofUri);
    });

    it('should survive edge crop (remove 10% from each side)', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const metadata = await sharp(embedded).metadata();
      const cropMargin = Math.floor(Math.min(metadata.width!, metadata.height!) * 0.1);
      
      const cropped = await sharp(embedded)
        .extract({
          left: cropMargin,
          top: cropMargin,
          width: metadata.width! - (cropMargin * 2),
          height: metadata.height! - (cropMargin * 2)
        })
        .withMetadata() // Preserve metadata
        .toBuffer();

      const result = await extractor.extract(cropped);
      expect(result.proofUri).not.toBeNull();
    });
  });

  describe('Rotation Tests', () => {
    it('should survive 90° rotation', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const rotated = await sharp(embedded)
        .rotate(90)
        .withMetadata() // Preserve metadata
        .toBuffer();

      const result = await extractor.extract(rotated);
      expect(result.proofUri).toBe(testProofUri);
    });

    it('should survive 180° rotation', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const rotated = await sharp(embedded)
        .rotate(180)
        .withMetadata() // Preserve metadata
        .toBuffer();

      const result = await extractor.extract(rotated);
      expect(result.proofUri).toBe(testProofUri);
    });

    it('should survive flip horizontal', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const flipped = await sharp(embedded)
        .flop()
        .withMetadata() // Preserve metadata
        .toBuffer();

      const result = await extractor.extract(flipped);
      expect(result.proofUri).toBe(testProofUri);
    });
  });

  describe('Filter and Effect Tests', () => {
    it('should survive grayscale conversion', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const grayscale = await sharp(embedded)
        .grayscale()
        .withMetadata() // Preserve metadata
        .toBuffer();

      const result = await extractor.extract(grayscale);
      expect(result.proofUri).toBe(testProofUri);
    });

    it('should survive blur filter', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const blurred = await sharp(embedded)
        .blur(2)
        .withMetadata() // Preserve metadata
        .toBuffer();

      const result = await extractor.extract(blurred);
      expect(result.proofUri).toBe(testProofUri);
    });

    it('should survive sharpen filter', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const sharpened = await sharp(embedded)
        .sharpen()
        .withMetadata() // Preserve metadata
        .toBuffer();

      const result = await extractor.extract(sharpened);
      expect(result.proofUri).toBe(testProofUri);
    });
  });

  describe('Combined Transformation Tests', () => {
    it('should survive resize + compression', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const transformed = await sharp(embedded)
        .resize(50, 50)
        .withMetadata() // Preserve metadata
        .jpeg({ quality: 70 })
        .toBuffer();

      const result = await extractor.extract(transformed);
      expect(result.proofUri).not.toBeNull();
    });

    it('should survive crop + rotate + compression', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const metadata = await sharp(embedded).metadata();
      const cropSize = Math.floor(Math.min(metadata.width!, metadata.height!) * 0.8);
      
      const transformed = await sharp(embedded)
        .extract({
          left: Math.floor((metadata.width! - cropSize) / 2),
          top: Math.floor((metadata.height! - cropSize) / 2),
          width: cropSize,
          height: cropSize
        })
        .rotate(90)
        .withMetadata() // Preserve metadata
        .jpeg({ quality: 75 })
        .toBuffer();

      const result = await extractor.extract(transformed);
      expect(result.source).not.toBe('none');
    });
  });

  describe('Survival Rate Metrics', () => {
    it('should calculate overall survival rate', async () => {
      const embedded = await embedder.embedProofInImage(jpegBuffer, testManifest, testProofUri);
      
      const transformations = [
        (img: Buffer) => sharp(img).withMetadata().jpeg({ quality: 80 }).toBuffer(),
        (img: Buffer) => sharp(img).resize(50, 50).withMetadata().toBuffer(),
        (img: Buffer) => sharp(img).rotate(90).withMetadata().toBuffer(),
        (img: Buffer) => sharp(img).grayscale().withMetadata().toBuffer(),
        (img: Buffer) => sharp(img).withMetadata().png().toBuffer()
      ];

      let survived = 0;
      for (const transform of transformations) {
        const transformed = await transform(embedded);
        const result = await extractor.extract(transformed);
        if (result.proofUri) survived++;
      }

      const survivalRate = (survived / transformations.length) * 100;
      expect(survivalRate).toBeGreaterThanOrEqual(80); // At least 80% survival
    });
  });
});
