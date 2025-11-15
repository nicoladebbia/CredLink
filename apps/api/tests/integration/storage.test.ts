/**
 * Integration Tests: Storage Backend
 * 
 * Tests in-memory, filesystem, and cloud storage operations
 */

import { ProofStorage } from '@credlink/storage';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Storage Backend', () => {
  describe('In-Memory Storage', () => {
    let storage: ProofStorage;

    beforeEach(() => {
      storage = new ProofStorage({ type: 'memory' });
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should store and retrieve proof', async () => {
      const manifest = {
        claim_generator: { name: 'Test', version: '1.0' },
        instance_id: 'test-123'
      };
      const imageHash = 'sha256:abc123def456';

      const proofUri = await storage.storeProof(manifest, imageHash);

      expect(proofUri).toMatch(/^https:\/\/proofs\.credlink\.com\//);

      const retrieved = await storage.getProofByHash(imageHash);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.manifest).toEqual(manifest);
      expect(retrieved?.imageHash).toBe(imageHash);
    });

    it('should return null for non-existent proof', async () => {
      const proof = await storage.getProof('non-existent-id');
      expect(proof).toBeNull();
    });

    it('should handle concurrent writes', async () => {
      const writes = Array(10).fill(null).map((_, i) =>
        storage.storeProof(
          { instance_id: `test-${i}` },
          `sha256:hash${i}`
        )
      );

      const uris = await Promise.all(writes);

      expect(uris).toHaveLength(10);
      expect(new Set(uris).size).toBe(10); // All unique
    });

    it('should track storage statistics', async () => {
      await storage.storeProof({ instance_id: '1' }, 'hash1');
      await storage.storeProof({ instance_id: '2' }, 'hash2');

      const stats = await storage.getStats();

      expect(stats.totalProofs).toBe(2);
      expect(stats.storageType).toBe('memory');
    });

    it('should handle duplicate hashes', async () => {
      const manifest1 = { instance_id: '1' };
      const manifest2 = { instance_id: '2' };
      const sameHash = 'sha256:duplicate';

      await storage.storeProof(manifest1, sameHash);
      await storage.storeProof(manifest2, sameHash);

      const proof = await storage.getProofByHash(sameHash);
      
      // Should return most recent
      expect(proof?.manifest.instance_id).toBe('2');
    });

    it('should list proofs with pagination', async () => {
      // Store 25 proofs
      for (let i = 0; i < 25; i++) {
        await storage.storeProof({ instance_id: `test-${i}` }, `hash${i}`);
      }

      const page1 = await storage.listProofs({ limit: 10, offset: 0 });
      const page2 = await storage.listProofs({ limit: 10, offset: 10 });

      expect(page1.proofs).toHaveLength(10);
      expect(page2.proofs).toHaveLength(10);
      expect(page1.total).toBe(25);
    });
  });

  describe('Filesystem Storage', () => {
    let storage: ProofStorage;
    const testDir = path.join(__dirname, '../../../.test-storage');

    beforeEach(async () => {
      storage = new ProofStorage({
        type: 'filesystem',
        path: testDir
      });
    });

    afterEach(async () => {
      await storage.close();
      // Cleanup test directory
      await fs.rm(testDir, { recursive: true, force: true });
    });

    it('should store proof to filesystem', async () => {
      const manifest = { instance_id: 'fs-test' };
      const hash = 'sha256:fstest123';

      const uri = await storage.storeProof(manifest, hash);

      // Verify file exists
      const proofId = uri.split('/').pop();
      const filePath = path.join(testDir, `${proofId}.json`);
      
      const exists = await fs.access(filePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it('should persist across storage instances', async () => {
      const manifest = { instance_id: 'persist-test' };
      const hash = 'sha256:persist123';

      await storage.storeProof(manifest, hash);
      await storage.close();

      // Create new storage instance
      const storage2 = new ProofStorage({
        type: 'filesystem',
        path: testDir
      });

      const proof = await storage2.getProofByHash(hash);
      expect(proof).not.toBeNull();
      expect(proof?.manifest.instance_id).toBe('persist-test');

      await storage2.close();
    });

    it('should handle path traversal attempts', async () => {
      const maliciousId = '../../../etc/passwd';

      await expect(
        storage.getProof(maliciousId)
      ).rejects.toThrow('Invalid proof ID');
    });

    it('should handle disk full errors', async () => {
      // Mock fs.writeFile to simulate disk full
      jest.spyOn(fs, 'writeFile').mockRejectedValueOnce(
        new Error('ENOSPC: no space left on device')
      );

      await expect(
        storage.storeProof({ instance_id: 'test' }, 'hash')
      ).rejects.toThrow();
    });
  });

  describe('S3/Cloud Storage', () => {
    let storage: ProofStorage;

    beforeEach(() => {
      // Mock S3 client
      storage = new ProofStorage({
        type: 's3',
        bucket: 'test-proofs-bucket',
        region: 'us-east-1'
      });
    });

    afterEach(async () => {
      await storage.close();
    });

    it('should store proof to S3', async () => {
      const manifest = { instance_id: 's3-test' };
      const hash = 'sha256:s3test123';

      const uri = await storage.storeProof(manifest, hash);

      expect(uri).toMatch(/^https:\/\/proofs\.credlink\.com\//);
    });

    it('should handle S3 service errors', async () => {
      // Mock S3 error
      const mockS3Error = new Error('ServiceUnavailable');
      jest.spyOn(storage as any, 'uploadToS3').mockRejectedValueOnce(mockS3Error);

      await expect(
        storage.storeProof({ instance_id: 'test' }, 'hash')
      ).rejects.toThrow();
    });

    it('should use signed URLs for retrieval', async () => {
      const manifest = { instance_id: 'signed-url-test' };
      const hash = 'sha256:signedurl123';

      await storage.storeProof(manifest, hash);
      
      const proof = await storage.getProofByHash(hash);
      
      expect(proof?.proofUri).toContain('X-Amz-Signature');
      expect(proof?.proofUri).toContain('X-Amz-Expires');
    });
  });

  describe('Storage Migration', () => {
    it('should migrate from memory to filesystem', async () => {
      const memStorage = new ProofStorage({ type: 'memory' });
      const fsStorage = new ProofStorage({
        type: 'filesystem',
        path: path.join(__dirname, '../../../.test-migration')
      });

      // Store in memory
      const manifest = { instance_id: 'migrate-test' };
      const hash = 'sha256:migrate123';
      await memStorage.storeProof(manifest, hash);

      // Migrate
      const allProofs = await memStorage.listProofs({ limit: 1000, offset: 0 });
      
      for (const proof of allProofs.proofs) {
        await fsStorage.storeProof(proof.manifest, proof.imageHash);
      }

      // Verify in filesystem
      const retrieved = await fsStorage.getProofByHash(hash);
      expect(retrieved).not.toBeNull();

      await memStorage.close();
      await fsStorage.close();
    });
  });
});
