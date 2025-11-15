/**
 * Unit Tests: JUMBF Builder
 * 
 * Tests JUMBF container construction, CRC validation, segment limits
 */

import { JUMBFBuilder } from '@credlink/c2pa-sdk';

describe('JUMBFBuilder', () => {
  let builder: JUMBFBuilder;

  beforeEach(() => {
    builder = new JUMBFBuilder();
  });

  describe('JUMBF Container Construction', () => {
    it('should create valid JUMBF container', () => {
      const manifest = { test: 'data' };
      const jumbf = builder.build(manifest);

      expect(jumbf).toBeInstanceOf(Buffer);
      expect(jumbf.length).toBeGreaterThan(0);
      
      // Check JUMBF box header
      expect(jumbf.slice(4, 8).toString()).toBe('jumb');
    });

    it('should include C2PA box type', () => {
      const jumbf = builder.build({ test: 'data' });
      
      // C2PA JUMBF should contain 'c2pa' marker
      const jumbfStr = jumbf.toString('binary');
      expect(jumbfStr).toContain('c2pa');
    });

    it('should handle empty manifest', () => {
      const jumbf = builder.build({});
      
      expect(jumbf.length).toBeGreaterThan(8); // At least header
    });

    it('should handle large manifests', () => {
      const largeManifest = {
        assertions: Array(100).fill({ label: 'test', data: { value: 'x'.repeat(1000) } })
      };
      
      const jumbf = builder.build(largeManifest);
      expect(jumbf.length).toBeGreaterThan(100000);
    });
  });

  describe('Segment Size Limits', () => {
    it('should respect maximum segment size', () => {
      const hugeManifest = {
        data: 'x'.repeat(10 * 1024 * 1024) // 10MB
      };
      
      expect(() => builder.build(hugeManifest)).toThrow('JUMBF segment too large');
    });

    it('should split large data into multiple segments', () => {
      builder.setMaxSegmentSize(64 * 1024); // 64KB
      
      const largeData = { content: 'x'.repeat(100 * 1024) }; // 100KB
      const jumbf = builder.build(largeData);
      
      // Should create multiple segments
      expect(jumbf.length).toBeLessThan(200 * 1024); // Compressed
    });
  });

  describe('CRC Validation', () => {
    it('should calculate valid CRC32', () => {
      const data = Buffer.from('test data');
      const crc = builder.calculateCRC32(data);
      
      expect(crc).toBeGreaterThan(0);
      expect(crc).toBeLessThan(0xFFFFFFFF);
    });

    it('should include CRC in JUMBF box', () => {
      const jumbf = builder.build({ test: 'data' });
      
      // CRC should be in last 4 bytes of box
      const crc = jumbf.readUInt32BE(jumbf.length - 4);
      expect(crc).toBeGreaterThan(0);
    });

    it('should validate CRC on parse', () => {
      const jumbf = builder.build({ test: 'data' });
      
      // Corrupt CRC
      jumbf.writeUInt32BE(0, jumbf.length - 4);
      
      expect(() => builder.parse(jumbf)).toThrow('CRC validation failed');
    });
  });

  describe('Malformed JUMBF Parsing', () => {
    it('should reject invalid box type', () => {
      const invalidBox = Buffer.alloc(12);
      invalidBox.write('invalid', 4);
      
      expect(() => builder.parse(invalidBox)).toThrow('Invalid JUMBF box type');
    });

    it('should reject truncated JUMBF', () => {
      const jumbf = builder.build({ test: 'data' });
      const truncated = jumbf.slice(0, 10);
      
      expect(() => builder.parse(truncated)).toThrow('Truncated JUMBF');
    });

    it('should handle corrupted manifest data', () => {
      const jumbf = builder.build({ test: 'data' });
      
      // Corrupt middle section
      jumbf.fill(0xFF, 20, 30);
      
      expect(() => builder.parse(jumbf)).toThrow();
    });
  });
});
