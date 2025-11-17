import { ProofStorage } from '../../src/services/proof-storage';
import { C2PAManifest } from '../../src/services/manifest-builder';

describe('ProofStorage', () => {
  let storage: ProofStorage;
  let testManifest: C2PAManifest;

  beforeEach(() => {
    storage = new ProofStorage();
    testManifest = {
      claim_generator: {
        $id: 'urn:uuid:test-123',
        name: 'CredLink/1.0',
        version: '1.0.0',
        timestamp: new Date().toISOString()
      },
      claim_data: [
        {
          label: 'stds.schema-org.CreativeWork',
          data: { name: 'Test Image' }
        }
      ],
      assertions: [
        {
          label: 'c2pa.actions',
          data: { actions: [] }
        }
      ],
      ingredient: {
        recipe: [],
        ingredient: []
      }
    };
  });

  describe('storeProof', () => {
    it('should store proof and return URI', async () => {
      const imageHash = 'test-hash-123';
      
      const proofUri = await storage.storeProof(testManifest, imageHash);

      expect(proofUri).toBeDefined();
      expect(proofUri).toMatch(/^https:\/\/(test\.)?proofs\.credlink\.com\/.+/);
    });

    it('should generate unique proof IDs', async () => {
      const uri1 = await storage.storeProof(testManifest, 'hash1');
      const uri2 = await storage.storeProof(testManifest, 'hash2');

      expect(uri1).not.toBe(uri2);
    });

    it('should index by image hash', async () => {
      const imageHash = 'test-hash-456';
      
      await storage.storeProof(testManifest, imageHash);
      const foundProof = await storage.getProofByHash(imageHash);

      expect(foundProof).toBeDefined();
    });
  });

  describe('getProof', () => {
    it('should retrieve stored proof', async () => {
      const imageHash = 'test-hash-789';
      const proofUri = await storage.storeProof(testManifest, imageHash);
      const proofId = proofUri.split('/').pop()!;

      const retrieved = await storage.getProof(proofId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.manifest.claim_generator.name).toBe('CredLink/1.0');
    });

    it('should return null for non-existent proof', async () => {
      const retrieved = await storage.getProof('non-existent-id');

      expect(retrieved).toBeNull();
    });

    it('should track storage stats', async () => {
      const proofUri = await storage.storeProof(testManifest, 'hash');
      const proofId = proofUri.split('/').pop()!;

      await storage.getProof(proofId);
      await storage.getProof(proofId);

      const stats = storage.getStats();
      expect(stats.totalProofs).toBeGreaterThan(0);
      expect(stats.storageType).toBeDefined();
    });
  });

  describe('getProofByHash', () => {
    it('should find proof by image hash', async () => {
      const imageHash = 'unique-hash-abc';
      await storage.storeProof(testManifest, imageHash);

      const found = await storage.getProofByHash(imageHash);

      expect(found).toBeDefined();
      expect(found?.imageHash).toBe(imageHash);
    });

    it('should return null for non-existent hash', async () => {
      const found = await storage.getProofByHash('non-existent-hash');

      expect(found).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return storage statistics', async () => {
      await storage.storeProof(testManifest, 'hash1');
      await storage.storeProof(testManifest, 'hash2');

      const stats = storage.getStats();

      expect(stats.totalProofs).toBe(2);
      expect(stats.storageType).toBeDefined();
    });
  });
});
