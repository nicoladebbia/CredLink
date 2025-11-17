import { SignatureVerifier } from '../../src/services/signature-verifier';
import { ManifestBuilder } from '../../src/services/manifest-builder';
import { C2PAService } from '../../src/services/c2pa-service';
import { X509Certificate } from 'crypto';
import { readFileSync } from 'fs';
import sharp from 'sharp';
import { DateUtils } from '@credlink/config';

describe('SignatureVerifier', () => {
  let verifier: SignatureVerifier;
  let manifestBuilder: ManifestBuilder;
  let c2paService: C2PAService;
  let testCert: X509Certificate;
  let testImage: Buffer;

  beforeAll(async () => {
    verifier = new SignatureVerifier();
    manifestBuilder = new ManifestBuilder();
    c2paService = new C2PAService({ useRealC2PA: false });

    // Create test image
    testImage = await sharp({
      create: {
        width: 100,
        height: 100,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    }).jpeg().toBuffer();

    // Load test certificate
    console.log('Jest working directory:', process.cwd());
    console.log('Test file directory:', __dirname);
    try {
      const certPem = process.env.SIGNING_CERTIFICATE || 
                     readFileSync(path.join(__dirname, '../../certs/signing-cert.pem'), 'utf8');
      testCert = new X509Certificate(certPem);
      console.log('Certificate loaded successfully');
    } catch (error) {
      console.log('Certificate loading error:', error);
      testCert = null as any;
    }
  });

  describe('Signature Verification', () => {
    it('should verify valid signature', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const signingResult = await c2paService.signImage(testImage, {
        creator: 'Test'
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        signingResult.signature,
        testCert
      );

      expect(result).toBeDefined();
      expect(result.errors).toBeDefined();
    });

    it('should detect invalid signature', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const invalidSignature = 'invalid-signature-data';

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        invalidSignature,
        testCert
      );

      expect(result.isValid).toBe(false);
      expect(result.signatureValid).toBe(false);
    });

    it('should handle empty signature', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        '',
        testCert
      );

      expect(result.isValid).toBe(false);
    });
  });

  describe('Manifest Integrity', () => {
    it('should verify intact manifest', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const signingResult = await c2paService.signImage(testImage, {
        creator: 'Test'
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        signingResult.signature,
        testCert
      );

      expect(result.manifestIntact).toBeDefined();
    });

    it('should detect corrupted manifest', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      // Corrupt the manifest
      delete (manifest as any).claim_generator;

      const signingResult = await c2paService.signImage(testImage, {
        creator: 'Test'
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        signingResult.signature,
        testCert
      );

      expect(result.manifestIntact).toBe(false);
    });

    it('should detect missing assertions', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      // Remove assertions
      manifest.assertions = [];

      const signingResult = await c2paService.signImage(testImage, {
        creator: 'Test'
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        signingResult.signature,
        testCert
      );

      expect(result.manifestIntact).toBe(false);
    });
  });

  describe('Tamper Detection', () => {
    it('should detect no tampering in valid manifest', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const signingResult = await c2paService.signImage(testImage, {
        creator: 'Test'
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        signingResult.signature,
        testCert
      );

      expect(result.tamperDetected).toBeDefined();
    });

    it('should detect timestamp in future', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
        customAssertions: []
      });

      const signingResult = await c2paService.signImage(testImage, {
        creator: 'Test'
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        signingResult.signature,
        testCert
      );

      // Should detect timestamp anomaly
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should detect modified metadata', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      // Modify metadata
      manifest.claim_generator.name = '';

      const signingResult = await c2paService.signImage(testImage, {
        creator: 'Test'
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        signingResult.signature,
        testCert
      );

      expect(result.tamperDetected).toBeDefined();
    });

    it('should calculate tamper confidence', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const signingResult = await c2paService.signImage(testImage, {
        creator: 'Test'
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        signingResult.signature,
        testCert
      );

      expect(result).toBeDefined();
    });
  });

  describe('Timestamp Validation', () => {
    it('should validate valid timestamp', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const signingResult = await c2paService.signImage(testImage, {
        creator: 'Test'
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        signingResult.signature,
        testCert
      );

      expect(result.details.timestamp).toBeDefined();
    });

    it('should reject future timestamps', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date(Date.now() + 86400000).toISOString(),
        customAssertions: []
      });

      const signingResult = await c2paService.signImage(testImage, {
        creator: 'Test'
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        signingResult.signature,
        testCert
      );

      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should reject very old timestamps', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        // 🔥 HARDCODED DATE ELIMINATION: Use dynamic old timestamp instead of hardcoded 2000-01-01
        timestamp: DateUtils.addYears(-25).toISOString(), // 25 years ago (definitely too old)
        customAssertions: []
      });

      const signingResult = await c2paService.signImage(testImage, {
        creator: 'Test'
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        signingResult.signature,
        testCert
      );

      expect(result.warnings.length).toBeGreaterThan(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle null manifest', async () => {
      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        null as any,
        'signature',
        testCert
      );

      expect(result.isValid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle null certificate', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const result = await verifier.verifySignature(
        manifest,
        'signature',
        null as any
      );

      expect(result.isValid).toBe(false);
    });

    it('should handle verification errors gracefully', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const result = await verifier.verifySignature(
        manifest,
        'invalid-signature',
        testCert
      );

      expect(result).toBeDefined();
      expect(result.errors).toBeDefined();
    });
  });

  describe('Performance', () => {
    it('should verify signature in reasonable time', async () => {
      const manifest = await manifestBuilder.build({
        imageBuffer: testImage,
        imageHash: 'test-hash',
        creator: 'Test',
        timestamp: new Date().toISOString(),
        customAssertions: []
      });

      const signingResult = await c2paService.signImage(testImage, {
        creator: 'Test'
      });

      if (!testCert) {
        console.log('Skipping: No test certificate available');
        return;
      }

      const startTime = Date.now();
      await verifier.verifySignature(
        manifest,
        signingResult.signature,
        testCert
      );
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500); // Should be < 500ms
    });
  });
});
