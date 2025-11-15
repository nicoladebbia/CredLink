/**
 * Unit Tests: Metadata Embedder (Security Focus)
 * 
 * Tests proof URI validation, SSRF prevention, XSS sanitization
 */

import { MetadataEmbedder } from '@credlink/c2pa-sdk';
import * as fs from 'fs';
import * as path from 'path';

describe('MetadataEmbedder - Security', () => {
  let embedder: MetadataEmbedder;
  const validImageBuffer = Buffer.from('fake-jpeg-data');
  const validManifest = { claim_generator: { name: 'Test', version: '1.0' } };

  beforeEach(() => {
    embedder = new MetadataEmbedder();
  });

  describe('Proof URI Validation', () => {
    it('should accept valid HTTPS URI', async () => {
      const validUri = 'https://proofs.credlink.com/abc123';
      
      await expect(
        embedder.embedProofInImage(validImageBuffer, validManifest, validUri)
      ).resolves.toBeDefined();
    });

    it('should reject HTTP URIs', async () => {
      const httpUri = 'http://proofs.credlink.com/abc123';
      
      await expect(
        embedder.embedProofInImage(validImageBuffer, validManifest, httpUri)
      ).rejects.toThrow('HTTPS required');
    });

    it('should reject localhost in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';
      
      const localhostUri = 'https://localhost/proof/123';
      
      await expect(
        embedder.embedProofInImage(validImageBuffer, validManifest, localhostUri)
      ).rejects.toThrow('Localhost not allowed');
      
      process.env.NODE_ENV = originalEnv;
    });

    it('should reject internal IPs (SSRF prevention)', async () => {
      const internalUris = [
        'https://192.168.1.1/proof',
        'https://10.0.0.1/proof',
        'https://172.16.0.1/proof',
        'https://127.0.0.1/proof'
      ];
      
      for (const uri of internalUris) {
        await expect(
          embedder.embedProofInImage(validImageBuffer, validManifest, uri)
        ).rejects.toThrow('Internal IP not allowed');
      }
    });

    it('should enforce URI length limits', async () => {
      const longUri = 'https://proofs.credlink.com/' + 'a'.repeat(2000);
      
      await expect(
        embedder.embedProofInImage(validImageBuffer, validManifest, longUri)
      ).rejects.toThrow('URI too long');
    });

    it('should reject URIs with credentials', async () => {
      const uriWithCreds = 'https://user:pass@proofs.credlink.com/abc';
      
      await expect(
        embedder.embedProofInImage(validImageBuffer, validManifest, uriWithCreds)
      ).rejects.toThrow('URI credentials not allowed');
    });

    it('should reject malformed URLs', async () => {
      const malformedUris = [
        'not-a-url',
        'ftp://proofs.credlink.com/abc',
        'https://',
        'https://proofs..credlink.com',
        'javascript:alert(1)'
      ];
      
      for (const uri of malformedUris) {
        await expect(
          embedder.embedProofInImage(validImageBuffer, validManifest, uri)
        ).rejects.toThrow();
      }
    });
  });

  describe('XSS Prevention', () => {
    it('should sanitize creator name with script tags', async () => {
      const xssManifest = {
        claim_generator: {
          name: '<script>alert(1)</script>',
          version: '1.0'
        }
      };
      
      const result = await embedder.embedProofInImage(
        validImageBuffer,
        xssManifest,
        'https://proofs.credlink.com/test'
      );
      
      expect(result.toString()).not.toContain('<script>');
    });

    it('should sanitize HTML entities', async () => {
      const xssManifest = {
        claim_generator: {
          name: '&lt;img src=x onerror=alert(1)&gt;',
          version: '1.0'
        }
      };
      
      const result = await embedder.embedProofInImage(
        validImageBuffer,
        xssManifest,
        'https://proofs.credlink.com/test'
      );
      
      expect(result.toString()).not.toContain('onerror');
    });

    it('should remove control characters', async () => {
      const manifest = {
        claim_generator: {
          name: 'Test\x00\x01\x02\x03User',
          version: '1.0'
        }
      };
      
      const result = await embedder.embedProofInImage(
        validImageBuffer,
        manifest,
        'https://proofs.credlink.com/test'
      );
      
      const str = result.toString();
      expect(str).not.toMatch(/[\x00-\x1F]/);
    });
  });

  describe('Format-Specific Embedding', () => {
    it('should embed in JPEG format', async () => {
      const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF]);
      
      const result = await embedder.embedProofInImage(
        jpegBuffer,
        validManifest,
        'https://proofs.credlink.com/test'
      );
      
      expect(result.slice(0, 3)).toEqual(jpegBuffer);
    });

    it('should embed in PNG format', async () => {
      const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47]);
      
      const result = await embedder.embedProofInImage(
        pngBuffer,
        validManifest,
        'https://proofs.credlink.com/test'
      );
      
      expect(result.slice(0, 4)).toEqual(pngBuffer);
    });

    it('should reject unsupported formats', async () => {
      const bmpBuffer = Buffer.from([0x42, 0x4D]); // BMP
      
      await expect(
        embedder.embedProofInImage(bmpBuffer, validManifest, 'https://proofs.credlink.com/test')
      ).rejects.toThrow('Unsupported format');
    });
  });
});
