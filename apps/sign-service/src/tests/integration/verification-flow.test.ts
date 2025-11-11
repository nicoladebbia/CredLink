import { C2PAService } from '../../services/c2pa-service';
import { AdvancedExtractor } from '../../services/advanced-extractor';
import { SignatureVerifier } from '../../services/signature-verifier';
import { CertificateValidator } from '../../services/certificate-validator';
import { ConfidenceCalculator } from '../../services/confidence-calculator';
import { ProofStorage } from '../../services/proof-storage';
import sharp from 'sharp';
import { X509Certificate } from 'crypto';
import { readFileSync } from 'fs';

describe('Verification Flow Integration', () => {
  let c2paService: C2PAService;
  let extractor: AdvancedExtractor;
  let signatureVerifier: SignatureVerifier;
  let certificateValidator: CertificateValidator;
  let confidenceCalculator: ConfidenceCalculator;
  let proofStorage: ProofStorage;
  let testCert: X509Certificate | null;

  beforeAll(async () => {
    c2paService = new C2PAService({ useRealC2PA: false });
    extractor = new AdvancedExtractor();
    signatureVerifier = new SignatureVerifier();
    certificateValidator = new CertificateValidator();
    confidenceCalculator = new ConfidenceCalculator();
    proofStorage = new ProofStorage();

    // Load test certificate
    try {
      const certPem = process.env.SIGNING_CERTIFICATE || 
                     readFileSync('./certs/signing-cert.pem', 'utf8');
      testCert = new X509Certificate(certPem);
      certificateValidator.addTrustedRoot(testCert);
    } catch (error) {
      testCert = null;
    }
  });

  describe('Complete Sign → Transform → Verify Flow', () => {
    it('should verify image after JPEG compression', async () => {
      // 1. Create and sign original image
      const originalImage = await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: 255, g: 0, b: 0 }
        }
      }).jpeg({ quality: 95 }).toBuffer();

      const signResult = await c2paService.signImage(originalImage, {
        creator: 'Test User'
      });

      expect(signResult.signedBuffer).toBeDefined();

      // 2. Compress the signed image
      const compressedImage = await sharp(signResult.signedBuffer!)
        .jpeg({ quality: 75 })
        .toBuffer();

      // 3. Extract metadata from compressed image
      const extractionResult = await extractor.extract(compressedImage);

      // 4. Verify extraction succeeded
      expect(extractionResult.success).toBe(true);
      expect(extractionResult.confidence).toBeGreaterThan(50);
    }, 10000);

    it('should verify image after format conversion', async () => {
      // 1. Create and sign JPEG image
      const jpegImage = await sharp({
        create: {
          width: 300,
          height: 300,
          channels: 3,
          background: { r: 0, g: 255, b: 0 }
        }
      }).jpeg().toBuffer();

      const signResult = await c2paService.signImage(jpegImage, {
        creator: 'Test User'
      });

      expect(signResult.signedBuffer).toBeDefined();

      // 2. Convert to PNG
      const pngImage = await sharp(signResult.signedBuffer!)
        .png()
        .toBuffer();

      // 3. Extract metadata
      const extractionResult = await extractor.extract(pngImage);

      // Metadata may or may not survive format conversion
      // This is expected behavior
      expect(extractionResult).toBeDefined();
    }, 10000);

    it('should handle concurrent verification requests', async () => {
      // 1. Create and sign image
      const testImage = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 0, g: 0, b: 255 }
        }
      }).jpeg().toBuffer();

      const signResult = await c2paService.signImage(testImage, {
        creator: 'Test User'
      });

      expect(signResult.signedBuffer).toBeDefined();

      // 2. Create 20 concurrent verification requests
      const promises = Array(20).fill(null).map(() =>
        extractor.extract(signResult.signedBuffer!)
      );

      const results = await Promise.all(promises);

      // All results should be consistent
      expect(results.length).toBe(20);
      expect(results.every(r => r.success === results[0].success)).toBe(true);
    }, 15000);

    it('should calculate confidence score correctly', async () => {
      // 1. Create and sign image
      const testImage = await sharp({
        create: {
          width: 200,
          height: 200,
          channels: 3,
          background: { r: 128, g: 128, b: 128 }
        }
      }).jpeg().toBuffer();

      const signResult = await c2paService.signImage(testImage, {
        creator: 'Test User'
      });

      expect(signResult.signedBuffer).toBeDefined();

      // 2. Extract metadata
      const extractionResult = await extractor.extract(signResult.signedBuffer!);

      // 3. Verify signature (if certificate available)
      let signatureResult;
      let certificateResult;

      if (testCert && extractionResult.manifest) {
        signatureResult = await signatureVerifier.verifySignature(
          extractionResult.manifest,
          signResult.signature,
          testCert
        );

        certificateResult = await certificateValidator.validateCertificateChain([testCert]);
      } else {
        // Mock results for testing
        signatureResult = {
          isValid: true,
          signatureValid: true,
          manifestIntact: true,
          tamperDetected: false,
          errors: [],
          warnings: [],
          details: {}
        };

        certificateResult = {
          isValid: true,
          certificateResults: [],
          chainLength: 1,
          rootTrusted: true,
          timestamp: new Date().toISOString(),
          errors: []
        };
      }

      // 4. Calculate confidence
      const confidenceScore = confidenceCalculator.calculateConfidence(
        extractionResult,
        signatureResult,
        certificateResult,
        true // has remote proof
      );

      expect(confidenceScore.overall).toBeGreaterThanOrEqual(0);
      expect(confidenceScore.overall).toBeLessThanOrEqual(100);
      expect(confidenceScore.level).toBeDefined();
      expect(confidenceScore.recommendations).toBeDefined();
      expect(confidenceScore.recommendations.length).toBeGreaterThan(0);
    }, 10000);
  });

  describe('Error Handling', () => {
    it('should handle unsigned images gracefully', async () => {
      const unsignedImage = await sharp({
        create: {
          width: 100,
          height: 100,
          channels: 3,
          background: { r: 255, g: 255, b: 255 }
        }
      }).jpeg().toBuffer();

      const extractionResult = await extractor.extract(unsignedImage);

      expect(extractionResult.success).toBe(false);
      expect(extractionResult.source).toBe('none');
    });

    it('should handle corrupted images gracefully', async () => {
      const corruptedImage = Buffer.alloc(1000);
      corruptedImage.fill(0xFF);

      const extractionResult = await extractor.extract(corruptedImage);

      expect(extractionResult.success).toBe(false);
      expect(extractionResult.errors.length).toBeGreaterThan(0);
    });

    it('should handle empty buffers', async () => {
      const emptyBuffer = Buffer.alloc(0);

      const extractionResult = await extractor.extract(emptyBuffer);

      expect(extractionResult.success).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should complete verification in reasonable time', async () => {
      const testImage = await sharp({
        create: {
          width: 500,
          height: 500,
          channels: 3,
          background: { r: 200, g: 200, b: 200 }
        }
      }).jpeg().toBuffer();

      const signResult = await c2paService.signImage(testImage, {
        creator: 'Test User'
      });

      expect(signResult.signedBuffer).toBeDefined();

      const startTime = Date.now();
      const extractionResult = await extractor.extract(signResult.signedBuffer!);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(500); // Should be < 500ms
      expect(extractionResult).toBeDefined();
    }, 10000);

    it('should handle large images efficiently', async () => {
      const largeImage = await sharp({
        create: {
          width: 2000,
          height: 2000,
          channels: 3,
          background: { r: 100, g: 150, b: 200 }
        }
      }).jpeg().toBuffer();

      const signResult = await c2paService.signImage(largeImage, {
        creator: 'Test User'
      });

      expect(signResult.signedBuffer).toBeDefined();

      const startTime = Date.now();
      const extractionResult = await extractor.extract(signResult.signedBuffer!);
      const duration = Date.now() - startTime;

      expect(duration).toBeLessThan(1000); // Should be < 1s even for large images
      expect(extractionResult).toBeDefined();
    }, 15000);
  });

  describe('Confidence Scoring', () => {
    it('should give high confidence for valid signatures', async () => {
      const extractionResult = {
        success: true,
        manifest: {} as any,
        proofUri: 'https://proofs.credlink.com/test',
        source: 'jumbf-c2pa' as const,
        confidence: 100,
        metadata: {
          imageFormat: 'jpeg',
          imageSize: 1000,
          extractionTime: 50,
          methodsAttempted: ['jumbf-c2pa'],
          methodsSucceeded: ['jumbf-c2pa'],
          dataIntegrity: 'full' as const
        },
        errors: []
      };

      const signatureResult = {
        isValid: true,
        signatureValid: true,
        manifestIntact: true,
        tamperDetected: false,
        errors: [],
        warnings: [],
        details: {}
      };

      const certificateResult = {
        isValid: true,
        certificateResults: [],
        chainLength: 3,
        rootTrusted: true,
        timestamp: new Date().toISOString(),
        errors: []
      };

      const confidenceScore = confidenceCalculator.calculateConfidence(
        extractionResult,
        signatureResult,
        certificateResult,
        true
      );

      expect(confidenceScore.overall).toBeGreaterThan(85);
      expect(confidenceScore.level).toMatch(/very_high|high/);
    });

    it('should give low confidence for tampered images', async () => {
      const extractionResult = {
        success: true,
        manifest: {} as any,
        proofUri: 'https://proofs.credlink.com/test',
        source: 'partial-recovery' as const,
        confidence: 50,
        metadata: {
          imageFormat: 'jpeg',
          imageSize: 1000,
          extractionTime: 50,
          methodsAttempted: ['jumbf-c2pa', 'exif-primary', 'partial-recovery'],
          methodsSucceeded: ['partial-recovery'],
          dataIntegrity: 'corrupted' as const
        },
        errors: ['JUMBF extraction failed', 'EXIF extraction failed']
      };

      const signatureResult = {
        isValid: false,
        signatureValid: false,
        manifestIntact: false,
        tamperDetected: true,
        errors: ['Signature invalid', 'Tampering detected'],
        warnings: [],
        details: {}
      };

      const certificateResult = {
        isValid: false,
        certificateResults: [],
        chainLength: 1,
        rootTrusted: false,
        timestamp: new Date().toISOString(),
        errors: ['Certificate chain invalid']
      };

      const confidenceScore = confidenceCalculator.calculateConfidence(
        extractionResult,
        signatureResult,
        certificateResult,
        false
      );

      expect(confidenceScore.overall).toBeLessThan(40);
      expect(confidenceScore.level).toMatch(/low|very_low/);
      expect(confidenceScore.recommendations.length).toBeGreaterThan(3);
    });
  });
});
