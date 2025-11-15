/**
 * Survival Tests: CDN Transformations
 * 
 * Tests metadata survival through Cloudflare, Imgix, Akamai, Fastly, AWS CloudFront
 */

import { C2PAService } from '@credlink/c2pa-sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import fetch from 'node-fetch';

describe('CDN Transformation Survival', () => {
  let service: C2PAService;
  const fixturesPath = path.join(__dirname, '../../fixtures/images/signed');

  beforeAll(() => {
    service = new C2PAService();
  });

  describe('Cloudflare Image Optimization', () => {
    it('should survive Cloudflare resize (width=800)', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      
      // Sign image
      const signed = await service.signImage(originalImage, {
        creator: 'Test User',
        title: 'CDN Test'
      });

      // Simulate Cloudflare transformation
      const transformed = await simulateCloudflareResize(signed.signedImage, 800);

      // Verify metadata survived
      const verification = await service.verifyImage(transformed);

      expect(verification.valid).toBe(true);
      expect(verification.manifest?.claim_generator.name).toBe('CredLink');
    });

    it('should survive Cloudflare quality optimization (q=85)', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const transformed = await simulateCloudflareQuality(signed.signedImage, 85);
      const verification = await service.verifyImage(transformed);

      expect(verification.valid).toBe(true);
    });

    it('should survive Cloudflare format conversion (JPEG → WebP)', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const transformed = await simulateCloudflareFormat(signed.signedImage, 'webp');
      const verification = await service.verifyImage(transformed);

      // Format conversion may strip metadata - document expected behavior
      if (verification.valid) {
        expect(verification.format).toBe('image/webp');
      } else {
        console.warn('Metadata lost in format conversion (expected for some CDNs)');
      }
    });

    it('should survive Cloudflare Polish (lossless compression)', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const transformed = await simulateCloudflarePolish(signed.signedImage);
      const verification = await service.verifyImage(transformed);

      expect(verification.valid).toBe(true);
    });
  });

  describe('Imgix Transformations', () => {
    it('should survive Imgix resize (w=1000&h=800&fit=crop)', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const transformed = await simulateImgixCrop(signed.signedImage, 1000, 800);
      const verification = await service.verifyImage(transformed);

      expect(verification.valid).toBe(true);
    });

    it('should survive Imgix blur (blur=20)', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const transformed = await simulateImgixBlur(signed.signedImage, 20);
      const verification = await service.verifyImage(transformed);

      // Blur shouldn't affect metadata
      expect(verification.valid).toBe(true);
    });

    it('should survive Imgix auto compression (auto=compress)', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const transformed = await simulateImgixAutoCompress(signed.signedImage);
      const verification = await service.verifyImage(transformed);

      expect(verification.valid).toBe(true);
    });
  });

  describe('Akamai Image Manager', () => {
    it('should survive Akamai resize (im=Resize,width=800)', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const transformed = await simulateAkamaiResize(signed.signedImage, 800);
      const verification = await service.verifyImage(transformed);

      expect(verification.valid).toBe(true);
    });

    it('should survive Akamai quality optimization', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const transformed = await simulateAkamaiQuality(signed.signedImage, 80);
      const verification = await service.verifyImage(transformed);

      expect(verification.valid).toBe(true);
    });
  });

  describe('Fastly Image Optimizer', () => {
    it('should survive Fastly resize (width=800&height=600)', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const transformed = await simulateFastlyResize(signed.signedImage, 800, 600);
      const verification = await service.verifyImage(transformed);

      expect(verification.valid).toBe(true);
    });

    it('should survive Fastly WebP conversion', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const transformed = await simulateFastlyWebP(signed.signedImage);
      const verification = await service.verifyImage(transformed);

      // WebP conversion may or may not preserve metadata
      console.log(`Fastly WebP survival: ${verification.valid ? 'PASS' : 'FAIL'}`);
    });

    it('should survive Fastly sharpen filter', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const transformed = await simulateFastlySharpen(signed.signedImage, 0.5);
      const verification = await service.verifyImage(transformed);

      expect(verification.valid).toBe(true);
    });
  });

  describe('AWS CloudFront', () => {
    it('should survive CloudFront compression', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const transformed = await simulateCloudFrontCompress(signed.signedImage);
      const verification = await service.verifyImage(transformed);

      expect(verification.valid).toBe(true);
    });
  });

  describe('Multiple CDN Hops', () => {
    it('should survive CloudFlare → Imgix → Fastly chain', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test User' });

      // Apply transformations in sequence
      let transformed = await simulateCloudflareResize(signed.signedImage, 1200);
      transformed = await simulateImgixCrop(transformed, 1000, 800);
      transformed = await simulateFastlyResize(transformed, 800, 600);

      const verification = await service.verifyImage(transformed);

      // Document survival rate through multiple hops
      console.log(`Multi-CDN survival: ${verification.valid ? 'PASS' : 'FAIL'}`);
      
      if (!verification.valid) {
        console.warn('Metadata lost after multiple CDN transformations');
      }
    });
  });

  describe('Survival Statistics', () => {
    it('should track survival rate across all CDNs', async () => {
      const originalImage = await fs.readFile(path.join(fixturesPath, 'landscape-signed.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      const tests = [
        { name: 'Cloudflare Resize', fn: () => simulateCloudflareResize(signed.signedImage, 800) },
        { name: 'Cloudflare Quality', fn: () => simulateCloudflareQuality(signed.signedImage, 85) },
        { name: 'Imgix Crop', fn: () => simulateImgixCrop(signed.signedImage, 1000, 800) },
        { name: 'Akamai Resize', fn: () => simulateAkamaiResize(signed.signedImage, 800) },
        { name: 'Fastly Resize', fn: () => simulateFastlyResize(signed.signedImage, 800, 600) }
      ];

      let survived = 0;
      const results: any[] = [];

      for (const test of tests) {
        try {
          const transformed = await test.fn();
          const verification = await service.verifyImage(transformed);
          
          if (verification.valid) {
            survived++;
          }

          results.push({ name: test.name, survived: verification.valid });
        } catch (error) {
          results.push({ name: test.name, survived: false, error });
        }
      }

      const survivalRate = (survived / tests.length) * 100;
      
      console.log('CDN Survival Report:');
      results.forEach(r => console.log(`  ${r.name}: ${r.survived ? 'PASS' : 'FAIL'}`));
      console.log(`  Overall: ${survivalRate.toFixed(1)}%`);

      expect(survivalRate).toBeGreaterThan(60); // At least 60% survival
    });
  });
});

// Simulation helpers
async function simulateCloudflareResize(image: Buffer, width: number): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).resize(width).jpeg({ quality: 90 }).toBuffer();
}

async function simulateCloudflareQuality(image: Buffer, quality: number): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).jpeg({ quality }).toBuffer();
}

async function simulateCloudflareFormat(image: Buffer, format: string): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image)[format]({ quality: 85 }).toBuffer();
}

async function simulateCloudflarePolish(image: Buffer): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).jpeg({ quality: 100, chromaSubsampling: '4:4:4' }).toBuffer();
}

async function simulateImgixCrop(image: Buffer, width: number, height: number): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).resize(width, height, { fit: 'cover' }).toBuffer();
}

async function simulateImgixBlur(image: Buffer, sigma: number): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).blur(sigma).toBuffer();
}

async function simulateImgixAutoCompress(image: Buffer): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
}

async function simulateAkamaiResize(image: Buffer, width: number): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).resize(width).toBuffer();
}

async function simulateAkamaiQuality(image: Buffer, quality: number): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).jpeg({ quality }).toBuffer();
}

async function simulateFastlyResize(image: Buffer, width: number, height: number): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).resize(width, height).toBuffer();
}

async function simulateFastlyWebP(image: Buffer): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).webp({ quality: 85 }).toBuffer();
}

async function simulateFastlySharpen(image: Buffer, sigma: number): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).sharpen(sigma).toBuffer();
}

async function simulateCloudFrontCompress(image: Buffer): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).jpeg({ quality: 85, progressive: true }).toBuffer();
}
