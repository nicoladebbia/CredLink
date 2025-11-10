import { C2PAService } from '../../services/c2pa-service';
import { SignMetadata } from '../../types';

describe('C2PAService', () => {
  let service: C2PAService;
  let testImageBuffer: Buffer;

  beforeEach(() => {
    service = new C2PAService();
    // Create a small test image buffer
    testImageBuffer = Buffer.from('fake-image-data');
  });

  describe('signImage', () => {
    it('should sign an image and return signed result', async () => {
      const metadata: SignMetadata = {
        issuer: 'TestIssuer',
        softwareAgent: 'Test/1.0'
      };

      const result = await service.signImage(testImageBuffer, metadata);

      expect(result).toBeDefined();
      expect(result.imageBuffer).toBeDefined();
      expect(result.manifest).toBeDefined();
      expect(result.manifestHash).toBeDefined();
    });

    it('should create manifest with correct structure', async () => {
      const metadata: SignMetadata = {
        issuer: 'TestIssuer'
      };

      const result = await service.signImage(testImageBuffer, metadata);

      expect(result.manifest.claim_generator).toBe('CredLink/1.0');
      expect(result.manifest.assertions).toBeInstanceOf(Array);
      expect(result.manifest.assertions.length).toBeGreaterThan(0);
      expect(result.manifest.signature_info).toBeDefined();
      expect(result.manifest.signature_info.issuer).toBe('TestIssuer');
    });

    it('should include c2pa.actions assertion', async () => {
      const result = await service.signImage(testImageBuffer, {});

      const actionsAssertion = result.manifest.assertions.find(
        a => a.label === 'c2pa.actions'
      );

      expect(actionsAssertion).toBeDefined();
      expect(actionsAssertion?.data.actions).toBeInstanceOf(Array);
      expect(actionsAssertion?.data.actions[0].action).toBe('c2pa.created');
    });

    it('should include c2pa.hash.data assertion', async () => {
      const result = await service.signImage(testImageBuffer, {});

      const hashAssertion = result.manifest.assertions.find(
        a => a.label === 'c2pa.hash.data'
      );

      expect(hashAssertion).toBeDefined();
      expect(hashAssertion?.data.alg).toBe('sha256');
      expect(hashAssertion?.data.hash).toBeDefined();
    });

    it('should include custom assertions if provided', async () => {
      const customAssertions = {
        title: 'Test Image',
        creator: 'Test Creator'
      };

      const result = await service.signImage(testImageBuffer, {
        customAssertions
      });

      const customAssertion = result.manifest.assertions.find(
        a => a.label === 'stds.schema-org.CreativeWork'
      );

      expect(customAssertion).toBeDefined();
      expect(customAssertion?.data).toEqual(customAssertions);
    });

    it('should generate unique manifest hash', async () => {
      const result1 = await service.signImage(testImageBuffer, {});
      const result2 = await service.signImage(testImageBuffer, {});

      // Hashes should be different due to timestamp and random padding
      expect(result1.manifestHash).not.toBe(result2.manifestHash);
    });
  });

  describe('validateSignature', () => {
    it('should validate signature (mock returns true)', async () => {
      const manifest = {
        claim_generator: 'CredLink/1.0',
        assertions: [],
        signature_info: { alg: 'ps256', issuer: 'Test' }
      };

      const result = await service.validateSignature(manifest);

      expect(result).toBe(true);
    });
  });

  describe('validateCertificate', () => {
    it('should validate certificate (mock returns true)', async () => {
      const result = await service.validateCertificate('mock-cert');

      expect(result).toBe(true);
    });
  });
});
