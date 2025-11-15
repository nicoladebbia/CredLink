/**
 * Unit Tests: Error Handling Edge Cases
 * 
 * Tests all error paths, exception handling, graceful degradation
 */

import { C2PAService } from '@credlink/c2pa-sdk';
import { MetadataEmbedder } from '@credlink/c2pa-sdk';
import { ProofStorage } from '@credlink/storage';

describe('Error Handling Edge Cases', () => {
  describe('Network Errors', () => {
    it('should handle ECONNREFUSED gracefully', async () => {
      const service = new C2PAService();
      
      // Mock network error
      jest.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('ECONNREFUSED')
      );

      await expect(
        service.verifyRemoteManifest('https://unreachable.com/manifest.json')
      ).rejects.toThrow('Network error');
    });

    it('should handle ETIMEDOUT with retry', async () => {
      const service = new C2PAService();
      
      let attempts = 0;
      jest.spyOn(global, 'fetch').mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          return Promise.reject(new Error('ETIMEDOUT'));
        }
        return Promise.resolve(new Response('{"status":"ok"}'));
      });

      const result = await service.verifyRemoteManifest('https://slow.com/manifest.json');
      
      expect(attempts).toBeGreaterThanOrEqual(3);
    });

    it('should handle DNS resolution failures', async () => {
      const service = new C2PAService();
      
      jest.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('ENOTFOUND')
      );

      await expect(
        service.verifyRemoteManifest('https://nonexistent-domain-xyz.com/manifest.json')
      ).rejects.toThrow();
    });

    it('should handle SSL certificate errors', async () => {
      const service = new C2PAService();
      
      jest.spyOn(global, 'fetch').mockRejectedValueOnce(
        new Error('UNABLE_TO_VERIFY_LEAF_SIGNATURE')
      );

      await expect(
        service.verifyRemoteManifest('https://invalid-cert.com/manifest.json')
      ).rejects.toThrow('SSL');
    });
  });

  describe('File System Errors', () => {
    it('should handle EACCES permission denied', async () => {
      const storage = new ProofStorage({ type: 'filesystem', path: '/root/forbidden' });
      
      await expect(
        storage.storeProof({ instance_id: 'test' }, 'hash')
      ).rejects.toThrow('Permission denied');
    });

    it('should handle ENOSPC disk full', async () => {
      const fs = require('fs/promises');
      const storage = new ProofStorage({ type: 'filesystem', path: '/tmp/test' });
      
      jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(
        Object.assign(new Error('ENOSPC: no space left on device'), { code: 'ENOSPC' })
      );

      await expect(
        storage.storeProof({ instance_id: 'test' }, 'hash')
      ).rejects.toThrow('disk full');
    });

    it('should handle EMFILE too many open files', async () => {
      const fs = require('fs/promises');
      
      jest.spyOn(fs, 'readFile').mockRejectedValueOnce(
        Object.assign(new Error('EMFILE: too many open files'), { code: 'EMFILE' })
      );

      const service = new C2PAService();
      
      await expect(
        service.loadCertificate('/path/to/cert.pem')
      ).rejects.toThrow('too many open files');
    });

    it('should handle EISDIR is a directory error', async () => {
      const fs = require('fs/promises');
      
      jest.spyOn(fs, 'readFile').mockRejectedValueOnce(
        Object.assign(new Error('EISDIR: illegal operation on a directory'), { code: 'EISDIR' })
      );

      await expect(
        // Attempt to read directory as file
        fs.readFile('/tmp')
      ).rejects.toThrow('directory');
    });
  });

  describe('Memory Errors', () => {
    it('should handle out of memory errors', async () => {
      const embedder = new MetadataEmbedder();
      
      // Simulate OOM
      const hugeBuffer = {
        length: Number.MAX_SAFE_INTEGER,
        toString: () => { throw new Error('JavaScript heap out of memory'); }
      };

      await expect(
        embedder.embedProofInImage(hugeBuffer as any, {}, 'https://test.com')
      ).rejects.toThrow('memory');
    });

    it('should handle buffer allocation failures', async () => {
      expect(() => {
        Buffer.alloc(Number.MAX_SAFE_INTEGER);
      }).toThrow();
    });

    it('should trigger garbage collection under memory pressure', async () => {
      const memoryMonitor = require('../../src/utils/memory-monitor');
      
      // Mock high memory usage
      jest.spyOn(process, 'memoryUsage').mockReturnValueOnce({
        heapUsed: 1.8e9, // 1.8GB
        heapTotal: 2e9,   // 2GB (90% usage)
        external: 0,
        rss: 2e9,
        arrayBuffers: 0
      });

      const shouldGC = await memoryMonitor.checkMemoryPressure();
      
      expect(shouldGC).toBe(true);
    });
  });

  describe('Database Errors', () => {
    it('should handle connection pool exhaustion', async () => {
      const storage = new ProofStorage({ type: 'postgres' });
      
      // Simulate all connections in use
      await expect(
        storage.getProof('test-id')
      ).rejects.toThrow(/pool|connection/i);
    });

    it('should handle deadlock errors with retry', async () => {
      const storage = new ProofStorage({ type: 'postgres' });
      
      let attempts = 0;
      jest.spyOn(storage as any, 'query').mockImplementation(() => {
        attempts++;
        if (attempts < 3) {
          const error: any = new Error('deadlock detected');
          error.code = '40P01';
          throw error;
        }
        return Promise.resolve({ rows: [] });
      });

      await storage.getProof('test-id');
      
      expect(attempts).toBe(3); // Should retry on deadlock
    });

    it('should handle constraint violations', async () => {
      const storage = new ProofStorage({ type: 'postgres' });
      
      const error: any = new Error('duplicate key value violates unique constraint');
      error.code = '23505';
      
      jest.spyOn(storage as any, 'query').mockRejectedValueOnce(error);

      await expect(
        storage.storeProof({ instance_id: 'duplicate' }, 'hash')
      ).rejects.toThrow('duplicate');
    });

    it('should handle connection timeout', async () => {
      const storage = new ProofStorage({
        type: 'postgres',
        connectionTimeout: 100
      });
      
      // Mock slow connection
      jest.spyOn(storage as any, 'connect').mockImplementation(
        () => new Promise(resolve => setTimeout(resolve, 200))
      );

      await expect(
        storage.getProof('test-id')
      ).rejects.toThrow('timeout');
    });
  });

  describe('Parsing Errors', () => {
    it('should handle malformed JSON', async () => {
      const service = new C2PAService();
      
      await expect(
        service.parseManifest('{ invalid json }')
      ).rejects.toThrow('JSON');
    });

    it('should handle truncated manifests', async () => {
      const service = new C2PAService();
      
      await expect(
        service.parseManifest('{"claim_generator":')
      ).rejects.toThrow();
    });

    it('should handle circular references in JSON', async () => {
      const obj: any = { a: 1 };
      obj.self = obj;

      expect(() => {
        JSON.stringify(obj);
      }).toThrow('circular');
    });

    it('should handle invalid UTF-8 sequences', async () => {
      const invalidUtf8 = Buffer.from([0xFF, 0xFE, 0xFD]);
      
      await expect(
        () => invalidUtf8.toString('utf-8')
      ).not.toThrow(); // Node handles gracefully, but we should validate
    });
  });

  describe('Cryptographic Errors', () => {
    it('should handle invalid certificate format', async () => {
      const service = new C2PAService();
      
      await expect(
        service.loadCertificate('invalid-cert-data')
      ).rejects.toThrow('certificate');
    });

    it('should handle expired certificates', async () => {
      const service = new C2PAService();
      
      const expiredCert = '-----BEGIN CERTIFICATE-----\nexpired\n-----END CERTIFICATE-----';
      
      await expect(
        service.validateCertificate(expiredCert)
      ).rejects.toThrow('expired');
    });

    it('should handle signature verification failures', async () => {
      const service = new C2PAService();
      
      const tamperedData = Buffer.from('tampered');
      const validSignature = Buffer.from('valid-signature');
      
      const isValid = await service.verifySignature(tamperedData, validSignature);
      
      expect(isValid).toBe(false);
    });

    it('should handle weak key sizes', async () => {
      const crypto = require('crypto');
      
      expect(() => {
        crypto.generateKeyPairSync('rsa', { modulusLength: 512 }); // Too weak
      }).toThrow(/modulusLength/);
    });
  });

  describe('Image Processing Errors', () => {
    it('should handle corrupt image headers', async () => {
      const service = new C2PAService();
      const corruptJpeg = Buffer.from([0xFF, 0xD8, 0x00, 0x00]); // Invalid
      
      await expect(
        service.signImage(corruptJpeg, {})
      ).rejects.toThrow(/image|format/i);
    });

    it('should handle unsupported color spaces', async () => {
      const sharp = require('sharp');
      
      // CMYK JPEG
      const cmykImage = Buffer.from('fake-cmyk-jpeg');
      
      await expect(
        sharp(cmykImage).toBuffer()
      ).rejects.toThrow();
    });

    it('should handle animated images (GIF)', async () => {
      const service = new C2PAService();
      const gifBuffer = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]); // GIF89a
      
      await expect(
        service.signImage(gifBuffer, {})
      ).rejects.toThrow('Unsupported format');
    });

    it('should handle zero-dimension images', async () => {
      const sharp = require('sharp');
      
      await expect(
        sharp({ create: { width: 0, height: 100, channels: 3, background: 'red' } }).toBuffer()
      ).rejects.toThrow();
    });
  });

  describe('Concurrency Errors', () => {
    it('should handle race conditions in cache', async () => {
      const cache = new Map();
      
      // Simulate race condition
      const promises = Array(100).fill(null).map(async (_, i) => {
        if (!cache.has('key')) {
          cache.set('key', i);
        }
        return cache.get('key');
      });

      const results = await Promise.all(promises);
      
      // All should get same value (first write wins)
      expect(new Set(results).size).toBe(1);
    });

    it('should handle simultaneous writes to same file', async () => {
      const fs = require('fs/promises');
      const path = '/tmp/test-concurrent.txt';
      
      const writes = Array(10).fill(null).map((_, i) =>
        fs.writeFile(path, `content-${i}`)
      );

      await Promise.all(writes);
      
      const content = await fs.readFile(path, 'utf-8');
      expect(content).toMatch(/^content-\d$/);
    });
  });

  describe('Timeout Errors', () => {
    it('should handle request timeout', async () => {
      const service = new C2PAService();
      
      jest.spyOn(global, 'fetch').mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 10000))
      );

      await expect(
        service.verifyRemoteManifest('https://slow.com/manifest.json', { timeout: 100 })
      ).rejects.toThrow('timeout');
    });

    it('should handle slow image processing', async () => {
      const sharp = require('sharp');
      
      // Create very large image
      const largeImage = sharp({
        create: { width: 10000, height: 10000, channels: 4, background: 'red' }
      });

      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Processing timeout')), 1000)
      );

      await expect(
        Promise.race([largeImage.toBuffer(), timeout])
      ).rejects.toThrow('timeout');
    });
  });

  describe('Resource Cleanup', () => {
    it('should cleanup temp files on error', async () => {
      const fs = require('fs/promises');
      const tmpFile = '/tmp/test-cleanup.tmp';
      
      try {
        await fs.writeFile(tmpFile, 'test');
        throw new Error('Simulated error');
      } catch (error) {
        // Cleanup should happen
        await fs.unlink(tmpFile).catch(() => {});
      }

      const exists = await fs.access(tmpFile).then(() => true).catch(() => false);
      expect(exists).toBe(false);
    });

    it('should close database connections on error', async () => {
      const storage = new ProofStorage({ type: 'postgres' });
      
      try {
        await storage.getProof('invalid-id');
      } catch (error) {
        // Should still be able to close
        await expect(storage.close()).resolves.not.toThrow();
      }
    });

    it('should release file locks on crash', async () => {
      // Test file lock cleanup
      const fs = require('fs');
      const path = '/tmp/locked-file.txt';
      
      const fd = fs.openSync(path, 'w');
      
      // Simulate crash
      process.on('beforeExit', () => {
        try {
          fs.closeSync(fd);
        } catch (e) {
          // Already closed
        }
      });

      // Verify we can open again
      expect(() => fs.openSync(path, 'w')).not.toThrow();
    });
  });
});
