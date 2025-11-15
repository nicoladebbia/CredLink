import { PerceptualHash } from '../utils/perceptual-hash';
import { readFileSync } from 'fs';

describe('PerceptualHash', () => {
  let testImageBuffer: Buffer;

  beforeAll(() => {
    // Use the real test image we generated
    testImageBuffer = readFileSync('./test-fixtures/images/test-image.jpg');
  });

  describe('generate', () => {
    it('should generate a 16-character hex hash', async () => {
      const hash = await PerceptualHash.generate(testImageBuffer);
      
      expect(typeof hash).toBe('string');
      expect(hash).toMatch(/^[a-f0-9]{16}$/);
    });

    it('should generate consistent hashes for identical images', async () => {
      const hash1 = await PerceptualHash.generate(testImageBuffer);
      const hash2 = await PerceptualHash.generate(testImageBuffer);
      
      expect(hash1).toBe(hash2);
    });

    it('should generate different hashes for different images', async () => {
      const pngBuffer = readFileSync('./test-fixtures/images/test-image.png');
      const webpBuffer = readFileSync('./test-fixtures/images/test-image.webp');
      
      const jpegHash = await PerceptualHash.generate(testImageBuffer);
      const pngHash = await PerceptualHash.generate(pngBuffer);
      const webpHash = await PerceptualHash.generate(webpBuffer);
      
      console.log('JPEG Hash:', jpegHash);
      console.log('PNG Hash:', pngHash);
      console.log('WebP Hash:', webpHash);
      
      // At least one should be different
      const allSame = jpegHash === pngHash && pngHash === webpHash;
      expect(allSame).toBe(false);
    });

    it('should handle empty buffer', async () => {
      await expect(PerceptualHash.generate(Buffer.from('')))
        .rejects
        .toThrow('Perceptual hash generation failed');
    });
  });

  describe('compare', () => {
    it('should return 100% for identical hashes', () => {
      const hash = 'abcdef1234567890';
      const similarity = PerceptualHash.compare(hash, hash);
      
      expect(similarity).toBe(100);
    });

    it('should return 0% for completely different hashes', () => {
      const hash1 = '0000000000000000';
      const hash2 = 'ffffffffffffffff';
      const similarity = PerceptualHash.compare(hash1, hash2);
      
      expect(similarity).toBe(0);
    });

    it('should return a value between 0-100%', () => {
      const hash1 = 'abcdef1234567890';
      const hash2 = '1234567890abcdef';
      const similarity = PerceptualHash.compare(hash1, hash2);
      
      expect(similarity).toBeGreaterThanOrEqual(0);
      expect(similarity).toBeLessThanOrEqual(100);
    });
  });

  describe('areDuplicates', () => {
    it('should identify identical hashes as duplicates', () => {
      const hash = 'abcdef1234567890';
      const isDuplicate = PerceptualHash.areDuplicates(hash, hash);
      
      expect(isDuplicate).toBe(true);
    });

    it('should not identify different hashes as duplicates', () => {
      const hash1 = '0000000000000000';
      const hash2 = 'ffffffffffffffff';
      const isDuplicate = PerceptualHash.areDuplicates(hash1, hash2);
      
      expect(isDuplicate).toBe(false);
    });

    it('should respect custom threshold', () => {
      const hash1 = '0000000000000000';
      const hash2 = '0000000000000001'; // Only 1 bit difference
      
      // With 95% threshold, should be considered duplicate
      const isDuplicate95 = PerceptualHash.areDuplicates(hash1, hash2, 95);
      expect(isDuplicate95).toBe(true);
      
      // With 100% threshold, should not be considered duplicate
      const isDuplicate100 = PerceptualHash.areDuplicates(hash1, hash2, 100);
      expect(isDuplicate100).toBe(false);
    });
  });

  describe('Performance', () => {
    it('should generate hash within reasonable time', async () => {
      const startTime = Date.now();
      await PerceptualHash.generate(testImageBuffer);
      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete within 1 second
    });
  });
});
