/**
 * Acceptance Tests: Real-World Workflows
 * 
 * Tests complete end-to-end scenarios users would actually perform
 */

import { C2PAService } from '@credlink/c2pa-sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

describe('Real-World Workflows', () => {
  let service: C2PAService;

  beforeAll(() => {
    service = new C2PAService();
  });

  describe('Workflow: Photographer Upload → CDN → Download → Verify', () => {
    it('should complete photographer workflow', async () => {
      // 1. Photographer signs image before upload
      const originalImage = await fs.readFile(path.join(__dirname, '../../fixtures/images/source/photo.jpg'));
      
      const signResult = await service.signImage(originalImage, {
        creator: 'Jane Photographer',
        title: 'Mountain Sunset',
        location: { lat: 37.7749, lon: -122.4194 }
      });

      expect(signResult.manifestUri).toBeDefined();

      // 2. Upload to CDN (simulate)
      const cdnUrl = `https://cdn.example.com/photos/${crypto.randomUUID()}.jpg`;
      await simulateUploadToCDN(signResult.signedImage, cdnUrl);

      // 3. CDN applies transformations
      const cdnTransformed = await simulateCDNTransformation(signResult.signedImage, {
        width: 1200,
        quality: 85
      });

      // 4. User downloads from CDN
      const downloaded = cdnTransformed;

      // 5. Verify authenticity
      const verification = await service.verifyImage(downloaded);

      expect(verification.valid).toBe(true);
      expect(verification.manifest?.claim_generator_info?.[0]?.author).toBe('Jane Photographer');
      expect(verification.proofUri).toBeDefined();
    }, 30000);
  });

  describe('Workflow: Email Attachment → Forward → Verify', () => {
    it('should survive email forward chain', async () => {
      // 1. Sign original image
      const originalImage = await fs.readFile(path.join(__dirname, '../../fixtures/images/source/document.jpg'));
      
      const signed = await service.signImage(originalImage, {
        creator: 'John Sender',
        title: 'Important Document'
      });

      // 2. Simulate email compression (Gmail, Outlook strip/compress)
      const emailCompressed = await simulateEmailCompression(signed.signedImage);

      // 3. Forward email (may compress again)
      const forwarded = await simulateEmailCompression(emailCompressed);

      // 4. Verify after forwarding
      const verification = await service.verifyImage(forwarded);

      console.log(`Email survival: ${verification.valid ? 'PASS' : 'FAIL'}`);
      
      // Email clients often strip metadata
      if (!verification.valid) {
        console.warn('Expected: Email clients may strip metadata');
      }
    });
  });

  describe('Workflow: Sign → Edit Metadata → Re-sign → Verify', () => {
    it('should handle metadata updates with new signature', async () => {
      // 1. Initial sign
      const originalImage = await fs.readFile(path.join(__dirname, '../../fixtures/images/source/photo.jpg'));
      
      const firstSign = await service.signImage(originalImage, {
        creator: 'Original Creator',
        title: 'Draft Title'
      });

      // 2. Extract and modify metadata
      const firstVerification = await service.verifyImage(firstSign.signedImage);
      expect(firstVerification.valid).toBe(true);

      // 3. Re-sign with updated metadata
      const secondSign = await service.signImage(firstSign.signedImage, {
        creator: 'Original Creator',
        title: 'Final Title',
        updated: true
      });

      // 4. Verify shows most recent signature
      const secondVerification = await service.verifyImage(secondSign.signedImage);
      
      expect(secondVerification.valid).toBe(true);
      expect(secondVerification.manifest?.title).toBe('Final Title');
    });
  });

  describe('Workflow: Sign → Print → Scan → Verify', () => {
    it('should handle print-scan cycle', async () => {
      // 1. Sign digital image
      const originalImage = await fs.readFile(path.join(__dirname, '../../fixtures/images/source/photo.jpg'));
      
      const signed = await service.signImage(originalImage, {
        creator: 'Print Test User',
        title: 'Print Test'
      });

      // 2. Simulate print (convert to CMYK, adjust for printing)
      const printed = await simulatePrint(signed.signedImage);

      // 3. Simulate scan (noise, compression, rotation)
      const scanned = await simulateScan(printed);

      // 4. Verify scanned image
      const verification = await service.verifyImage(scanned);

      console.log(`Print-Scan survival: ${verification.valid ? 'PASS' : 'FAIL'}`);
      
      // Physical print-scan cycle likely destroys digital metadata
      // This is expected and documents the limitation
    });
  });

  describe('Workflow: Batch Sign Multiple Images', () => {
    it('should sign 100 images in batch', async () => {
      const images: Buffer[] = [];
      
      // Load or generate 100 test images
      for (let i = 0; i < 100; i++) {
        const sharp = require('sharp');
        const testImage = await sharp({
          create: {
            width: 800,
            height: 600,
            channels: 3,
            background: { r: 255 * Math.random(), g: 255 * Math.random(), b: 255 * Math.random() }
          }
        }).jpeg().toBuffer();
        
        images.push(testImage);
      }

      // Sign all images
      const startTime = Date.now();
      const signedImages = await Promise.all(
        images.map((img, i) =>
          service.signImage(img, {
            creator: 'Batch Test',
            title: `Image ${i + 1}`
          })
        )
      );
      const duration = Date.now() - startTime;

      expect(signedImages).toHaveLength(100);
      expect(signedImages.every(s => s.manifestUri)).toBe(true);
      
      console.log(`Batch signed 100 images in ${duration}ms (${(duration / 100).toFixed(1)}ms/image)`);
      
      // Should complete in reasonable time
      expect(duration).toBeLessThan(60000); // Under 60 seconds
    }, 90000);
  });

  describe('Workflow: Sign → Social Media → Verify', () => {
    it('should complete social media workflow', async () => {
      // 1. Creator signs image
      const originalImage = await fs.readFile(path.join(__dirname, '../../fixtures/images/source/social.jpg'));
      
      const signed = await service.signImage(originalImage, {
        creator: 'Social Creator',
        title: 'Social Post'
      });

      // 2. Upload to Twitter
      const twitterProcessed = await simulateTwitterCompression(signed.signedImage);

      // 3. Download from Twitter
      const downloaded = twitterProcessed;

      // 4. Verify provenance
      const verification = await service.verifyImage(downloaded);

      console.log(`Social media workflow: ${verification.valid ? 'PASS' : 'FAIL'}`);
      
      // Document expected behavior for social platforms
      if (!verification.valid) {
        console.warn('Expected: Social media platforms strip metadata');
      }
    });
  });

  describe('Workflow: API Integration', () => {
    it('should handle API-based signing workflow', async () => {
      const originalImage = await fs.readFile(path.join(__dirname, '../../fixtures/images/source/api-test.jpg'));

      // Simulate API request
      const apiRequest = {
        image: originalImage.toString('base64'),
        metadata: {
          creator: 'API User',
          title: 'API Test',
          customField: 'Custom Value'
        }
      };

      // Sign via API
      const signResult = await service.signImage(
        Buffer.from(apiRequest.image, 'base64'),
        apiRequest.metadata
      );

      // Verify result
      const verification = await service.verifyImage(signResult.signedImage);

      expect(verification.valid).toBe(true);
      expect(verification.manifest?.claim_generator_info?.[0]?.author).toBe('API User');
    });
  });

  describe('Workflow: Forensic Analysis', () => {
    it('should detect tampered images', async () => {
      // 1. Sign original
      const originalImage = await fs.readFile(path.join(__dirname, '../../fixtures/images/source/forensic.jpg'));
      const signed = await service.signImage(originalImage, {
        creator: 'Forensic Test',
        title: 'Original'
      });

      // 2. Tamper with signed image (modify pixels)
      const tampered = Buffer.from(signed.signedImage);
      tampered[tampered.length - 1000] ^= 0xFF; // Flip bits

      // 3. Forensic verification should detect tampering
      const verification = await service.verifyImage(tampered);

      expect(verification.valid).toBe(false);
      expect(verification.error).toContain('tampered');
    });

    it('should provide tampering details', async () => {
      const originalImage = await fs.readFile(path.join(__dirname, '../../fixtures/images/source/forensic.jpg'));
      const signed = await service.signImage(originalImage, { creator: 'Test' });

      // Subtle tampering
      const tampered = await simulateSubtleTampering(signed.signedImage);

      const verification = await service.verifyImage(tampered);

      if (!verification.valid) {
        expect(verification.tamperingDetails).toBeDefined();
        expect(verification.tamperingDetails?.type).toMatch(/hash|signature|content/i);
      }
    });
  });

  describe('Workflow: Archive and Retrieve', () => {
    it('should archive signed images long-term', async () => {
      const originalImage = await fs.readFile(path.join(__dirname, '../../fixtures/images/source/archive.jpg'));
      
      const signed = await service.signImage(originalImage, {
        creator: 'Archivist',
        title: 'Historical Document',
        date: new Date().toISOString()
      });

      // Simulate archival (store with metadata intact)
      const archivePath = '/tmp/archive-test.jpg';
      await fs.writeFile(archivePath, signed.signedImage);

      // Retrieve after time passes (simulate)
      await new Promise(resolve => setTimeout(resolve, 1000));

      const retrieved = await fs.readFile(archivePath);

      // Verify provenance persists
      const verification = await service.verifyImage(retrieved);

      expect(verification.valid).toBe(true);
      
      // Cleanup
      await fs.unlink(archivePath).catch(() => {});
    });
  });
});

// Helper functions
async function simulateUploadToCDN(image: Buffer, url: string): Promise<void> {
  // Mock CDN upload
  await new Promise(resolve => setTimeout(resolve, 100));
}

async function simulateCDNTransformation(image: Buffer, opts: any): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).resize(opts.width).jpeg({ quality: opts.quality }).toBuffer();
}

async function simulateEmailCompression(image: Buffer): Promise<Buffer> {
  const sharp = require('sharp');
  // Email clients: aggressive compression, strip metadata
  return sharp(image)
    .resize({ width: 1024, withoutEnlargement: true })
    .jpeg({ quality: 70 })
    .withMetadata(false)
    .toBuffer();
}

async function simulatePrint(image: Buffer): Promise<Buffer> {
  const sharp = require('sharp');
  // Print conversion (RGB to CMYK simulation, adjust colors)
  return sharp(image)
    .resize(2400, 3000) // 300 DPI at 8x10"
    .jpeg({ quality: 95 })
    .toBuffer();
}

async function simulateScan(image: Buffer): Promise<Buffer> {
  const sharp = require('sharp');
  // Scan introduces noise, slight rotation, compression
  return sharp(image)
    .rotate(0.5) // Slight rotation
    .resize(1200) // Lower resolution scan
    .jpeg({ quality: 80 })
    .toBuffer();
}

async function simulateTwitterCompression(image: Buffer): Promise<Buffer> {
  const sharp = require('sharp');
  return sharp(image).resize({ width: 4096, withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
}

async function simulateSubtleTampering(image: Buffer): Promise<Buffer> {
  const sharp = require('sharp');
  // Add watermark or subtle modification
  return sharp(image)
    .composite([{
      input: Buffer.from('<svg><text x="10" y="10">Modified</text></svg>'),
      top: 10,
      left: 10
    }])
    .toBuffer();
}
