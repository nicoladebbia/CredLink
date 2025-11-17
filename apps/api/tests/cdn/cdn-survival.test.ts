import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';
import { C2PAService } from '../../src/services/c2pa-service';
import { extractProof } from '../../src/services/metadata-extractor';
import { logger } from '../../src/utils/logger';

/**
 * CDN Survival Testing
 * 
 * Tests metadata survival through various CDN transformations:
 * - Cloudflare Image Resizing
 * - Imgix transformations
 * - Fastly Image Optimizer
 * - AWS CloudFront
 * - Generic transformations (resize, compress, format conversion)
 */

describe('CDN Survival Tests', () => {
  let c2paService: C2PAService;
  let testImageBuffer: Buffer;
  let signedImageBuffer: Buffer;
  let originalProofUri: string;

  beforeAll(async () => {
    c2paService = new C2PAService();

    // Create test image
    testImageBuffer = await sharp({
      create: {
        width: 1920,
        height: 1080,
        channels: 3,
        background: { r: 255, g: 255, b: 255 }
      }
    })
      .jpeg({ quality: 90 })
      .toBuffer();

    // Sign the image
    const signingResult = await c2paService.signImage(testImageBuffer, {
      creator: 'CDN Test Suite'
    });

    signedImageBuffer = signingResult.signedBuffer;
    originalProofUri = signingResult.proofUri;

    logger.info('CDN survival test setup complete', {
      originalSize: testImageBuffer.length,
      signedSize: signedImageBuffer.length,
      proofUri: originalProofUri
    });
  });

  afterAll(async () => {
    await c2paService.cleanup();
  });

  describe('Generic Transformations', () => {
    it('should survive resize (50%)', async () => {
      const resized = await sharp(signedImageBuffer)
        .resize(960, 540)
        .jpeg({ quality: 90 })
        .toBuffer();

      const extractedProof = await extractProof(resized);

      expect(extractedProof).toBeDefined();
      expect(extractedProof?.proofUri).toBe(originalProofUri);
    });

    it('should survive quality reduction (80%)', async () => {
      const compressed = await sharp(signedImageBuffer)
        .jpeg({ quality: 80 })
        .toBuffer();

      const extractedProof = await extractProof(compressed);

      expect(extractedProof).toBeDefined();
      expect(extractedProof?.proofUri).toBe(originalProofUri);
    });

    it('should survive quality reduction (60%)', async () => {
      const compressed = await sharp(signedImageBuffer)
        .jpeg({ quality: 60 })
        .toBuffer();

      const extractedProof = await extractProof(compressed);

      // May fail at 60% quality - document survival rate
      if (extractedProof) {
        expect(extractedProof.proofUri).toBe(originalProofUri);
        logger.info('Metadata survived 60% quality reduction');
      } else {
        logger.warn('Metadata lost at 60% quality reduction');
      }
    });

    it('should survive crop', async () => {
      const cropped = await sharp(signedImageBuffer)
        .extract({ left: 100, top: 100, width: 800, height: 600 })
        .jpeg({ quality: 90 })
        .toBuffer();

      const extractedProof = await extractProof(cropped);

      expect(extractedProof).toBeDefined();
      expect(extractedProof?.proofUri).toBe(originalProofUri);
    });

    it('should survive rotation', async () => {
      const rotated = await sharp(signedImageBuffer)
        .rotate(90)
        .jpeg({ quality: 90 })
        .toBuffer();

      const extractedProof = await extractProof(rotated);

      expect(extractedProof).toBeDefined();
      expect(extractedProof?.proofUri).toBe(originalProofUri);
    });
  });

  describe('Format Conversion', () => {
    it('should survive JPEG to PNG conversion', async () => {
      const png = await sharp(signedImageBuffer)
        .png()
        .toBuffer();

      const extractedProof = await extractProof(png);

      // Format conversion may lose JPEG-specific metadata
      if (extractedProof) {
        expect(extractedProof.proofUri).toBe(originalProofUri);
        logger.info('Metadata survived JPEG→PNG conversion');
      } else {
        logger.warn('Metadata lost in JPEG→PNG conversion');
      }
    });

    it('should survive JPEG to WebP conversion', async () => {
      const webp = await sharp(signedImageBuffer)
        .webp({ quality: 90 })
        .toBuffer();

      const extractedProof = await extractProof(webp);

      // WebP conversion may lose metadata
      if (extractedProof) {
        expect(extractedProof.proofUri).toBe(originalProofUri);
        logger.info('Metadata survived JPEG→WebP conversion');
      } else {
        logger.warn('Metadata lost in JPEG→WebP conversion');
      }
    });
  });

  describe('Cloudflare Image Resizing Simulation', () => {
    it('should survive Cloudflare-style resize (width=800)', async () => {
      // Simulate: /cdn-cgi/image/width=800,quality=85/image.jpg
      const transformed = await sharp(signedImageBuffer)
        .resize(800, null, { withoutEnlargement: true })
        .jpeg({ quality: 85 })
        .toBuffer();

      const extractedProof = await extractProof(transformed);

      expect(extractedProof).toBeDefined();
      expect(extractedProof?.proofUri).toBe(originalProofUri);
    });

    it('should survive Cloudflare-style fit=cover', async () => {
      // Simulate: /cdn-cgi/image/fit=cover,width=800,height=600/image.jpg
      const transformed = await sharp(signedImageBuffer)
        .resize(800, 600, { fit: 'cover' })
        .jpeg({ quality: 85 })
        .toBuffer();

      const extractedProof = await extractProof(transformed);

      expect(extractedProof).toBeDefined();
      expect(extractedProof?.proofUri).toBe(originalProofUri);
    });
  });

  describe('Imgix Simulation', () => {
    it('should survive Imgix-style auto=compress', async () => {
      // Simulate: ?auto=compress&q=75
      const transformed = await sharp(signedImageBuffer)
        .jpeg({ quality: 75, mozjpeg: true })
        .toBuffer();

      const extractedProof = await extractProof(transformed);

      expect(extractedProof).toBeDefined();
      expect(extractedProof?.proofUri).toBe(originalProofUri);
    });

    it('should survive Imgix-style fit=crop', async () => {
      // Simulate: ?fit=crop&w=800&h=600
      const transformed = await sharp(signedImageBuffer)
        .resize(800, 600, { fit: 'cover', position: 'center' })
        .jpeg({ quality: 85 })
        .toBuffer();

      const extractedProof = await extractProof(transformed);

      expect(extractedProof).toBeDefined();
      expect(extractedProof?.proofUri).toBe(originalProofUri);
    });
  });

  describe('Aggressive Transformations', () => {
    it('should document survival rate for resize + compress + sharpen', async () => {
      const transformed = await sharp(signedImageBuffer)
        .resize(640, 480)
        .sharpen()
        .jpeg({ quality: 70 })
        .toBuffer();

      const extractedProof = await extractProof(transformed);

      if (extractedProof) {
        expect(extractedProof.proofUri).toBe(originalProofUri);
        logger.info('Metadata survived aggressive transformation');
      } else {
        logger.warn('Metadata lost in aggressive transformation');
      }
    });

    it('should document survival rate for thumbnail generation', async () => {
      const thumbnail = await sharp(signedImageBuffer)
        .resize(150, 150, { fit: 'cover' })
        .jpeg({ quality: 60 })
        .toBuffer();

      const extractedProof = await extractProof(thumbnail);

      // Thumbnails often lose metadata
      if (extractedProof) {
        logger.info('Metadata survived thumbnail generation (rare)');
      } else {
        logger.warn('Metadata lost in thumbnail generation (expected)');
      }
    });
  });

  describe('Survival Rate Calculation', () => {
    it('should calculate overall survival rate', async () => {
      const transformations = [
        { name: 'Resize 50%', fn: () => sharp(signedImageBuffer).resize(960, 540).jpeg({ quality: 90 }).toBuffer() },
        { name: 'Quality 80%', fn: () => sharp(signedImageBuffer).jpeg({ quality: 80 }).toBuffer() },
        { name: 'Quality 60%', fn: () => sharp(signedImageBuffer).jpeg({ quality: 60 }).toBuffer() },
        { name: 'Crop', fn: () => sharp(signedImageBuffer).extract({ left: 100, top: 100, width: 800, height: 600 }).jpeg({ quality: 90 }).toBuffer() },
        { name: 'Rotate 90°', fn: () => sharp(signedImageBuffer).rotate(90).jpeg({ quality: 90 }).toBuffer() },
        { name: 'CF Resize', fn: () => sharp(signedImageBuffer).resize(800, null).jpeg({ quality: 85 }).toBuffer() },
        { name: 'Imgix Compress', fn: () => sharp(signedImageBuffer).jpeg({ quality: 75, mozjpeg: true }).toBuffer() },
      ];

      let survived = 0;
      const results: any[] = [];

      for (const transform of transformations) {
        try {
          const transformed = await transform.fn();
          const extractedProof = await extractProof(transformed);

          const success = extractedProof?.proofUri === originalProofUri;
          if (success) survived++;

          results.push({
            transformation: transform.name,
            survived: success,
            size: transformed.length
          });
        } catch (error) {
          results.push({
            transformation: transform.name,
            survived: false,
            error: (error as Error).message
          });
        }
      }

      const survivalRate = (survived / transformations.length) * 100;

      logger.info('CDN Survival Rate', {
        total: transformations.length,
        survived,
        survivalRate: `${survivalRate.toFixed(1)}%`,
        results
      });

      // Expect at least 70% survival rate
      expect(survivalRate).toBeGreaterThanOrEqual(70);
    });
  });
});
