/**
 * E2E Tests: Sign → Verify Round Trip
 * 
 * Tests complete workflow from image upload through signing to verification
 */

import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import app from '../../src/index';

describe('Sign → Verify Round Trip', () => {
  const fixturesPath = path.join(__dirname, '../../../fixtures/images/source');

  describe('JPEG Round Trip', () => {
    it('should sign and verify JPEG image', async () => {
      const imagePath = path.join(fixturesPath, 'landscape.jpg');
      const image = fs.readFileSync(imagePath);

      // Step 1: Sign
      const signResponse = await request(app)
        .post('/sign')
        .attach('image', image, 'test.jpg')
        .field('creator', 'Test User')
        .field('title', 'Test Image')
        .expect(200);

      expect(signResponse.headers['x-proof-uri']).toBeDefined();
      const proofUri = signResponse.headers['x-proof-uri'];
      const signedImage = signResponse.body;

      // Step 2: Verify
      const verifyResponse = await request(app)
        .post('/verify')
        .attach('image', signedImage, 'signed.jpg')
        .expect(200);

      expect(verifyResponse.body.valid).toBe(true);
      expect(verifyResponse.body.proofUri).toBe(proofUri);
      expect(verifyResponse.body.manifest).toBeDefined();
      expect(verifyResponse.body.manifest.claim_generator.name).toBe('CredLink');
    });

    it('should preserve image quality after signing', async () => {
      const originalImage = fs.readFileSync(path.join(fixturesPath, 'landscape.jpg'));
      
      const signResponse = await request(app)
        .post('/sign')
        .attach('image', originalImage, 'test.jpg')
        .expect(200);

      const signedImage = Buffer.from(signResponse.body);
      
      // Signed image should not be significantly larger
      const sizeIncrease = (signedImage.length - originalImage.length) / originalImage.length;
      expect(sizeIncrease).toBeLessThan(0.1); // Max 10% increase
    });

    it('should handle multiple sign operations on same image', async () => {
      const image = fs.readFileSync(path.join(fixturesPath, 'landscape.jpg'));

      // First sign
      const sign1 = await request(app)
        .post('/sign')
        .attach('image', image, 'test.jpg')
        .expect(200);

      // Second sign (on already signed image)
      const sign2 = await request(app)
        .post('/sign')
        .attach('image', Buffer.from(sign1.body), 'test.jpg')
        .expect(200);

      // Both should verify
      const verify1 = await request(app)
        .post('/verify')
        .attach('image', Buffer.from(sign1.body), 'signed1.jpg')
        .expect(200);

      const verify2 = await request(app)
        .post('/verify')
        .attach('image', Buffer.from(sign2.body), 'signed2.jpg')
        .expect(200);

      expect(verify1.body.valid).toBe(true);
      expect(verify2.body.valid).toBe(true);
    });
  });

  describe('PNG Round Trip', () => {
    it('should sign and verify PNG image', async () => {
      const imagePath = path.join(fixturesPath, 'minimal.png');
      const image = fs.readFileSync(imagePath);

      const signResponse = await request(app)
        .post('/sign')
        .attach('image', image, 'test.png')
        .expect(200);

      const verifyResponse = await request(app)
        .post('/verify')
        .attach('image', signResponse.body, 'signed.png')
        .expect(200);

      expect(verifyResponse.body.valid).toBe(true);
    });
  });

  describe('WebP Round Trip', () => {
    it('should sign and verify WebP image', async () => {
      const imagePath = path.join(fixturesPath, 'test.webp');
      
      if (!fs.existsSync(imagePath)) {
        return; // Skip if WebP test file doesn't exist
      }

      const image = fs.readFileSync(imagePath);

      const signResponse = await request(app)
        .post('/sign')
        .attach('image', image, 'test.webp')
        .expect(200);

      const verifyResponse = await request(app)
        .post('/verify')
        .attach('image', signResponse.body, 'signed.webp')
        .expect(200);

      expect(verifyResponse.body.valid).toBe(true);
    });
  });

  describe('Proof URI Accessibility', () => {
    it('should generate accessible proof URI', async () => {
      const image = fs.readFileSync(path.join(fixturesPath, 'landscape.jpg'));

      const signResponse = await request(app)
        .post('/sign')
        .attach('image', image, 'test.jpg')
        .expect(200);

      const proofUri = signResponse.headers['x-proof-uri'];
      
      // Extract proof ID from URI
      const proofId = proofUri.split('/').pop();

      // Verify proof is accessible via API
      const proofResponse = await request(app)
        .get(`/proof/${proofId}`)
        .expect(200);

      expect(proofResponse.body.manifest).toBeDefined();
    });
  });

  describe('Error Cases', () => {
    it('should reject verification of unsigned image', async () => {
      const unsignedImage = fs.readFileSync(path.join(fixturesPath, 'landscape.jpg'));

      const verifyResponse = await request(app)
        .post('/verify')
        .attach('image', unsignedImage, 'unsigned.jpg')
        .expect(400);

      expect(verifyResponse.body.valid).toBe(false);
      expect(verifyResponse.body.error).toContain('No C2PA manifest found');
    });

    it('should detect tampered images', async () => {
      const image = fs.readFileSync(path.join(fixturesPath, 'landscape.jpg'));

      // Sign
      const signResponse = await request(app)
        .post('/sign')
        .attach('image', image, 'test.jpg')
        .expect(200);

      let signedImage = Buffer.from(signResponse.body);
      
      // Tamper with image data
      signedImage[signedImage.length - 100] ^= 0xFF;

      // Verify should fail
      const verifyResponse = await request(app)
        .post('/verify')
        .attach('image', signedImage, 'tampered.jpg')
        .expect(400);

      expect(verifyResponse.body.valid).toBe(false);
      expect(verifyResponse.body.error).toContain('tampered');
    });
  });
});
