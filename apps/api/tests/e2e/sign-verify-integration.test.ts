/**
 * End-to-End Integration Tests - Day 9-10
 * 
 * Complete flow: Upload -> Sign -> Verify
 * Tests manifest embedding, extraction, and performance
 */

import { C2PAService } from '../../src/services/c2pa-service';
import { ProofStorage } from '../../src/services/proof-storage';
import { MetadataEmbedder } from '../../src/services/metadata-embedder';
import { MetadataExtractor } from '../../src/services/metadata-extractor';
import { ManifestBuilder } from '../../src/services/manifest-builder';
import { PerceptualHash } from '../../src/utils/perceptual-hash';
import request from 'supertest';
import app from '../../src/index';
import fs from 'fs';
import path from 'path';
import { TEST_CONSTANTS } from '../config/test-constants';
import sharp from 'sharp';

describe('End-to-End Integration Tests - Day 9-10', () => {
  let c2paService: C2PAService;
  let proofStorage: ProofStorage;
  let embedder: MetadataEmbedder;
  let extractor: MetadataExtractor;
  let manifestBuilder: ManifestBuilder;

  // Test images
  let jpegBuffer: Buffer;
  let pngBuffer: Buffer;
  let webpBuffer: Buffer;

  beforeAll(() => {
    c2paService = new C2PAService();
    proofStorage = new ProofStorage();
    embedder = new MetadataEmbedder();
    extractor = new MetadataExtractor();
    manifestBuilder = new ManifestBuilder();

    // Load test images
    jpegBuffer = readFileSync('./test-fixtures/images/test-image.jpg');
    pngBuffer = readFileSync('./test-fixtures/images/test-image.png');
    webpBuffer = readFileSync('./test-fixtures/images/test-image.webp');
  });

  describe('Complete Flow: Upload -> Sign -> Verify', () => {
    it('should complete full signing flow for JPEG', async () => {
      // 1. UPLOAD: Receive image
      const uploadedImage = jpegBuffer;
      expect(uploadedImage).toBeInstanceOf(Buffer);
      expect(uploadedImage.length).toBeGreaterThan(0);

      // 2. SIGN: Generate C2PA signature
      const signStartTime = Date.now();
      const signResult = await c2paService.signImage(uploadedImage, {
        creator: 'E2E Test User',
        useRealC2PA: true
      });
      const duration = Date.now() - signStartTime;

      expect(signResult).toBeDefined();
      expect(signResult.signedBuffer).toBeInstanceOf(Buffer);
      expect(signResult.proofUri).toMatch(/https:\/\/proofs\.credlink\.com\//);
      expect(signResult.signature).toBeDefined();
      expect(duration).toBeLessThan(TEST_CONSTANTS.PERFORMANCE_THRESHOLD_MS); // < configurable threshold requirement

      // 3. VERIFY: Extract and validate signature
      const verifyResult = await c2paService.verifySignature(
        signResult.signedBuffer,
        signResult.signature
      );

      expect(verifyResult).toBe(true);
    });

    it('should complete full signing flow for PNG', async () => {
      const signStartTime = Date.now();
      
      const signResult = await c2paService.signImage(pngBuffer, {
        creator: 'E2E Test User'
      });
      
      const signDuration = Date.now() - signStartTime;

      expect(signResult.signedBuffer).toBeInstanceOf(Buffer);
      expect(signDuration).toBeLessThan(2000);
    });

    it('should complete full signing flow for WebP', async () => {
      const signStartTime = Date.now();
      
      const signResult = await c2paService.signImage(webpBuffer, {
        creator: 'E2E Test User'
      });
      
      const signDuration = Date.now() - signStartTime;

      expect(signResult.signedBuffer).toBeInstanceOf(Buffer);
      expect(signDuration).toBeLessThan(2000);
    });

    it('should store proof remotely and retrieve it', async () => {
      // Sign image
      const signResult = await c2paService.signImage(jpegBuffer, {
        creator: 'E2E Test User'
      });

      // Extract proof ID from URI
      const proofId = signResult.proofUri.split('/').pop()!;

      // Retrieve proof from storage
      const retrievedProof = await proofStorage.getProof(proofId);

      expect(retrievedProof).toBeDefined();
      expect(retrievedProof?.manifest).toBeDefined();
      if (retrievedProof?.manifest) {
        expect(retrievedProof.manifest.claim_generator.name).toBe('CredLink/1.0');
      }
    });

    it('should handle concurrent signing requests', async () => {
      const concurrentRequests = 5;
      const promises = Array(concurrentRequests).fill(null).map((_, i) => {
        return c2paService.signImage(jpegBuffer, {
          creator: `User ${i}`
        });
      });

      const startTime = Date.now();
      const results = await Promise.all(promises);
      const totalDuration = Date.now() - startTime;

      expect(results).toHaveLength(concurrentRequests);
      results.forEach(result => {
        expect(result.signedBuffer).toBeInstanceOf(Buffer);
        expect(result.proofUri).toBeDefined();
      });

      // Average should still be reasonable
      const avgDuration = totalDuration / concurrentRequests;
      expect(avgDuration).toBeLessThan(3000);
    });
  });

  describe('Manifest Embedding Verification', () => {
    it('should embed manifest correctly in JPEG', async () => {
      // Build manifest
      const manifest = await manifestBuilder.build({
        title: 'Embedding Test',
        creator: 'Test User',
        timestamp: new Date().toISOString(),
        imageHash: await PerceptualHash.generate(jpegBuffer),
        imageBuffer: jpegBuffer
      });

      // Embed manifest
      const proofUri = 'https://proofs.credlink.com/test-embed-123';
      const embedded = await embedder.embedProofInImage(jpegBuffer, manifest, proofUri);

      // Verify embedding
      expect(embedded).toBeInstanceOf(Buffer);
      expect(embedded.length).toBeGreaterThan(jpegBuffer.length);

      // Verify it's still a valid image
      const metadata = await sharp(embedded).metadata();
      expect(metadata.format).toBe('jpeg');
      expect(metadata.width).toBeGreaterThan(0);
      expect(metadata.height).toBeGreaterThan(0);
    });

    it('should embed manifest correctly in PNG', async () => {
      const manifest = await manifestBuilder.build({
        title: 'PNG Embedding Test',
        creator: 'Test User',
        timestamp: new Date().toISOString(),
        imageHash: await PerceptualHash.generate(pngBuffer),
        imageBuffer: pngBuffer
      });

      const proofUri = 'https://proofs.credlink.com/test-png-123';
      const embedded = await embedder.embedProofInImage(pngBuffer, manifest, proofUri);

      expect(embedded).toBeInstanceOf(Buffer);
      
      const metadata = await sharp(embedded).metadata();
      expect(metadata.format).toBe('png');
    });

    it('should preserve image quality after embedding', async () => {
      const manifest = await manifestBuilder.build({
        title: 'Quality Test',
        creator: 'Test User',
        timestamp: new Date().toISOString(),
        imageHash: await PerceptualHash.generate(jpegBuffer),
        imageBuffer: jpegBuffer
      });

      const proofUri = 'https://proofs.credlink.com/test-quality-123';
      const embedded = await embedder.embedProofInImage(jpegBuffer, manifest, proofUri);

      const originalMeta = await sharp(jpegBuffer).metadata();
      const embeddedMeta = await sharp(embedded).metadata();

      // Dimensions should be preserved
      expect(embeddedMeta.width).toBe(originalMeta.width);
      expect(embeddedMeta.height).toBe(originalMeta.height);

      // Size increase should be reasonable (< 20%)
      const sizeIncrease = ((embedded.length - jpegBuffer.length) / jpegBuffer.length) * 100;
      expect(sizeIncrease).toBeLessThan(20);
    });

    it('should embed multiple metadata layers', async () => {
      const signResult = await c2paService.signImage(jpegBuffer, {
        creator: 'Multi-Layer Test',
        title: 'Multi-Layer Image'
      });

      // Check that EXIF metadata exists
      const metadata = await sharp(signResult.signedBuffer).metadata();
      expect(metadata.exif).toBeDefined();

      // Verify proof URI is embedded
      const extractResult = await extractor.extract(signResult.signedBuffer);
      expect(extractResult.proofUri).toBeDefined();
    });
  });

  describe('Manifest Extraction Verification', () => {
    it('should extract manifest from signed JPEG', async () => {
      // Sign image
      const signResult = await c2paService.signImage(jpegBuffer, {
        creator: 'Extraction Test',
        title: 'Extract Me'
      });

      // Extract manifest
      const extractResult = await extractor.extract(signResult.signedBuffer);

      expect(extractResult).toBeDefined();
      expect(extractResult.proofUri).toBe(signResult.proofUri);
      expect(extractResult.source).toMatch(/exif|jumbf|xmp/);
      expect(extractResult.confidence).toBeGreaterThan(0);
    });

    it('should extract manifest from signed PNG', async () => {
      const signResult = await c2paService.signImage(pngBuffer, {
        creator: 'PNG Extraction Test'
      });

      const extractResult = await extractor.extract(signResult.signedBuffer);

      expect(extractResult.proofUri).toBeDefined();
      expect(extractResult.source).toMatch(/png-chunk|exif/);
    });

    it('should extract manifest with high confidence', async () => {
      const signResult = await c2paService.signImage(jpegBuffer, {
        creator: 'Confidence Test'
      });

      const extractResult = await extractor.extract(signResult.signedBuffer);

      expect(extractResult.confidence).toBeGreaterThanOrEqual(75);
      expect(extractResult.corrupted).toBe(false);
    });

    it('should extract manifest after compression', async () => {
      // Sign image
      const signResult = await c2paService.signImage(jpegBuffer, {
        creator: 'Compression Test'
      });

      // Compress image
      const compressed = await sharp(signResult.signedBuffer)
        .jpeg({ quality: 80 })
        .toBuffer();

      // Extract from compressed
      const extractResult = await extractor.extract(compressed);

      expect(extractResult.proofUri).toBe(signResult.proofUri);
    });

    it('should extract manifest after resize', async () => {
      const signResult = await c2paService.signImage(jpegBuffer, {
        creator: 'Resize Test'
      });

      const resized = await sharp(signResult.signedBuffer)
        .resize(200, 200)
        .toBuffer();

      const extractResult = await extractor.extract(resized);

      expect(extractResult.proofUri).toBeDefined();
    });

    it('should handle extraction from unsigned image gracefully', async () => {
      const extractResult = await extractor.extract(jpegBuffer);

      expect(extractResult.source).toBe('none');
      expect(extractResult.proofUri).toBeNull();
      expect(extractResult.confidence).toBe(0);
    });
  });

  describe('Performance Validation', () => {
    it('should sign image in less than 2 seconds', async () => {
      const startTime = Date.now();
      
      await c2paService.signImage(jpegBuffer, {
        creator: 'Performance Test',
        useRealC2PA: true
      });
      
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(2000);
    });

    it('should sign 10 images in less than 20 seconds', async () => {
      const startTime = Date.now();
      
      const promises = Array(10).fill(null).map((_, i) => {
        return c2paService.signImage(jpegBuffer, {
          creator: `Batch User ${i}`
        });
      });
      
      await Promise.all(promises);
      
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(20000);
    });

    it('should extract manifest in less than 100ms', async () => {
      const signResult = await c2paService.signImage(jpegBuffer, {
        creator: 'Extract Performance'
      });

      const startTime = Date.now();
      await extractor.extract(signResult.signedBuffer);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(100);
    });

    it('should embed manifest in less than 500ms', async () => {
      const manifest = await manifestBuilder.build({
        title: 'Embed Performance',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        imageHash: await PerceptualHash.generate(jpegBuffer),
        imageBuffer: jpegBuffer
      });

      const startTime = Date.now();
      await embedder.embedProofInImage(jpegBuffer, manifest, 'https://proofs.credlink.com/perf');
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500);
    });

    it('should generate perceptual hash in less than 200ms', async () => {
      const startTime = Date.now();
      await PerceptualHash.generate(jpegBuffer);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(200);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle corrupted image gracefully', async () => {
      const corruptedBuffer = Buffer.from('not an image');

      await expect(c2paService.signImage(corruptedBuffer, {
        creator: 'Test'
      })).rejects.toThrow();
    });

    it('should handle empty buffer', async () => {
      const emptyBuffer = Buffer.alloc(0);

      await expect(c2paService.signImage(emptyBuffer, {
        creator: 'Test'
      })).rejects.toThrow();
    });

    it('should handle very large images', async () => {
      // Create a large image (10MB+)
      const largeImage = await sharp({
        create: {
          width: 4000,
          height: 4000,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      })
      .jpeg()
      .toBuffer();

      const startTime = Date.now();
      const result = await c2paService.signImage(largeImage, {
        creator: 'Large Image Test'
      });
      const duration = Date.now() - startTime;

      expect(result.signedBuffer).toBeInstanceOf(Buffer);
      expect(duration).toBeLessThan(5000); // Allow more time for large images
    });

    it('should handle missing creator field', async () => {
      const result = await c2paService.signImage(jpegBuffer, {});

      expect(result.proofUri).toBeDefined();
    });

    it('should handle special characters in metadata', async () => {
      const result = await c2paService.signImage(jpegBuffer, {
        creator: 'Test <user@example.com>'
      });

      expect(result.signedBuffer).toBeInstanceOf(Buffer);
      expect(result.proofUri).toBeDefined();
    });
  });

  describe('Real C2PA Signature Validation', () => {
    it('should generate real C2PA signature (not SHA256 hash)', async () => {
      const result = await c2paService.signImage(jpegBuffer, {
        creator: 'Real C2PA Test',
        useRealC2PA: true
      });

      // Signature should be a real C2PA signature, not a simple hash
      expect(result.signature).toBeDefined();
      expect(result.signature.length).toBeGreaterThan(64); // Longer than SHA256
      expect(result.signature).not.toMatch(/^[a-f0-9]{64}$/); // Not just a hex hash
    });

    it('should validate signature with public certificate', async () => {
      const result = await c2paService.signImage(jpegBuffer, {
        creator: 'Certificate Test',
        useRealC2PA: true
      });

      const isValid = await c2paService.verifySignature(
        result.signedBuffer,
        result.signature
      );

      expect(isValid).toBe(true);
    });

    it('should reject tampered images', async () => {
      const result = await c2paService.signImage(jpegBuffer, {
        creator: 'Tamper Test',
        useRealC2PA: true
      });

      // Tamper with the image
      const tampered = Buffer.from(result.signedBuffer);
      tampered[tampered.length - 100] = 0xFF;

      const isValid = await c2paService.verifySignature(
        tampered,
        result.signature
      );

      // Should detect tampering
      expect(isValid).toBe(false);
    });
  });

  describe('Proof Storage Integration', () => {
    it('should store and retrieve proof', async () => {
      const result = await c2paService.signImage(jpegBuffer, {
        creator: 'Storage Test'
      });

      const proofId = result.proofUri.split('/').pop()!;
      const proof = await proofStorage.getProof(proofId);

      expect(proof).toBeDefined();
      expect(proof?.proofUri).toBe(result.proofUri);
    });

    it('should retrieve proof by image hash', async () => {
      const imageHash = await PerceptualHash.generate(jpegBuffer);
      const result = await c2paService.signImage(jpegBuffer, {
        creator: 'Hash Lookup Test'
      });

      const proof = await proofStorage.getProofByHash(imageHash);

      expect(proof).toBeDefined();
      expect(proof?.imageHash).toBe(imageHash);
    });

    it('should return null for non-existent proof', async () => {
      const proof = await proofStorage.getProof('non-existent-id');

      expect(proof).toBeNull();
    });

    it('should track storage statistics', async () => {
      await c2paService.signImage(jpegBuffer, {
        creator: 'Stats Test'
      });

      const stats = await proofStorage.getStats();

      expect(stats.totalProofs).toBeGreaterThan(0);
      expect(stats.storageType).toBeDefined();
    });
  });
});
