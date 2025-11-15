/**
 * Integration Tests: Multi-Format Support
 * 
 * Tests JPEG, PNG, WebP signing and metadata extraction
 */

import { C2PAService } from '@credlink/c2pa-sdk';
import * as fs from 'fs';
import * as path from 'path';

describe('Multi-Format Support', () => {
  let service: C2PAService;
  const fixturesPath = path.join(__dirname, '../../../fixtures/images/source');

  beforeEach(() => {
    service = new C2PAService();
  });

  describe('JPEG Support', () => {
    it('should sign JPEG image', async () => {
      const jpegBuffer = fs.readFileSync(path.join(fixturesPath, 'landscape.jpg'));

      const result = await service.signImage(jpegBuffer, {
        creator: 'Test User',
        title: 'JPEG Test'
      });

      expect(result.manifestUri).toBeDefined();
      expect(result.signedImage).toBeInstanceOf(Buffer);
      expect(result.signedImage.slice(0, 3)).toEqual(Buffer.from([0xFF, 0xD8, 0xFF]));
    });

    it('should extract metadata from signed JPEG', async () => {
      const jpegBuffer = fs.readFileSync(path.join(fixturesPath, 'landscape.jpg'));
      const signed = await service.signImage(jpegBuffer, { creator: 'Test' });

      const verification = await service.verifyImage(signed.signedImage);

      expect(verification.valid).toBe(true);
      expect(verification.format).toBe('image/jpeg');
    });
  });

  describe('PNG Support', () => {
    it('should sign PNG image', async () => {
      const pngBuffer = fs.readFileSync(path.join(fixturesPath, 'minimal.png'));

      const result = await service.signImage(pngBuffer, {
        creator: 'Test User',
        title: 'PNG Test'
      });

      expect(result.signedImage.slice(0, 8)).toEqual(
        Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])
      );
    });

    it('should preserve PNG transparency', async () => {
      const pngBuffer = fs.readFileSync(path.join(fixturesPath, 'transparent.png'));
      
      const signed = await service.signImage(pngBuffer, {});

      // Check PNG has alpha channel (tRNS or RGBA)
      const hasTransparency = signed.signedImage.toString('binary').includes('tRNS') ||
                             signed.signedImage.toString('binary').includes('RGBA');
      
      expect(hasTransparency).toBe(true);
    });
  });

  describe('WebP Support', () => {
    it('should sign WebP image', async () => {
      const webpPath = path.join(fixturesPath, 'test.webp');
      
      if (!fs.existsSync(webpPath)) {
        return; // Skip if no WebP fixture
      }

      const webpBuffer = fs.readFileSync(webpPath);

      const result = await service.signImage(webpBuffer, {
        creator: 'Test User'
      });

      expect(result.signedImage.slice(0, 4).toString()).toBe('RIFF');
      expect(result.signedImage.slice(8, 12).toString()).toBe('WEBP');
    });
  });

  describe('Cross-Format Compatibility', () => {
    it('should handle different formats in same session', async () => {
      const jpeg = fs.readFileSync(path.join(fixturesPath, 'landscape.jpg'));
      const png = fs.readFileSync(path.join(fixturesPath, 'minimal.png'));

      const signedJpeg = await service.signImage(jpeg, {});
      const signedPng = await service.signImage(png, {});

      const verifyJpeg = await service.verifyImage(signedJpeg.signedImage);
      const verifyPng = await service.verifyImage(signedPng.signedImage);

      expect(verifyJpeg.valid).toBe(true);
      expect(verifyPng.valid).toBe(true);
    });
  });

  describe('Format Detection', () => {
    it('should correctly detect JPEG format', async () => {
      const jpeg = fs.readFileSync(path.join(fixturesPath, 'landscape.jpg'));
      
      const verification = await service.verifyImage(jpeg);
      
      expect(verification.format).toBe('image/jpeg');
    });

    it('should correctly detect PNG format', async () => {
      const png = fs.readFileSync(path.join(fixturesPath, 'minimal.png'));
      
      const verification = await service.verifyImage(png);
      
      expect(verification.format).toBe('image/png');
    });

    it('should reject unsupported formats', async () => {
      const bmpBuffer = Buffer.from([0x42, 0x4D, 0x00, 0x00]);
      
      await expect(service.signImage(bmpBuffer, {})).rejects.toThrow('Unsupported format');
    });
  });
});
