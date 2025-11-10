import { ProofStorage } from '../../services/proof-storage';
import { C2PAManifest } from '../../types';

describe('ProofStorage', () => {
  let storage: ProofStorage;
  let testManifest: C2PAManifest;

  beforeEach(() => {
    storage = new ProofStorage();
    testManifest = {
      claim_generator: 'CredLink/1.0',
      timestamp: new Date().toISOString(),
      assertions: [
        {
          label: 'c2pa.actions',
          data: { actions: [] }
        }
      ],
      signature_info: {
        alg: 'ps256',
        issuer: 'Test'
      }
    };
  });

  describe('storeProof', () => {
    it('should store proof and return URI', async () => {
      const imageHash = 'test-hash-123';
      
      const proofUri = await storage.storeProof(testManifest, imageHash);

      expect(proofUri).toBeDefined();
      expect(proofUri).toMatch(/^https:\/\/proofs\.credlink\.com\/.+/);
    });

    it('should generate unique proof IDs', async () => {
      const uri1 = await storage.storeProof(testManifest, 'hash1');
      const uri2 = await storage.storeProof(testManifest, 'hash2');

      expect(uri1).not.toBe(uri2);
    });

    it('should index by image hash', async () => {
      const imageHash = 'test-hash-456';
      
      await storage.storeProof(testManifest, imageHash);
      const foundProofId = await storage.findProofByHash(imageHash);

      expect(foundProofId).toBeDefined();
    });
  });

  describe('retrieveProof', () => {
    it('should retrieve stored proof', async () => {
      const imageHash = 'test-hash-789';
      const proofUri = await storage.storeProof(testManifest, imageHash);
      const proofId = proofUri.split('/').pop()!;

      const retrieved = await storage.retrieveProof(proofId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.claim_generator).toBe('CredLink/1.0');
    });

    it('should return null for non-existent proof', async () => {
      const retrieved = await storage.retrieveProof('non-existent-id');

      expect(retrieved).toBeNull();
    });

    it('should increment access counter', async () => {
      const proofUri = await storage.storeProof(testManifest, 'hash');
      const proofId = proofUri.split('/').pop()!;

      await storage.retrieveProof(proofId);
      await storage.retrieveProof(proofId);

      const stats = storage.getStats();
      const proof = stats.proofs.find(p => p.id === proofId);

      expect(proof?.accessCount).toBe(2);
    });
  });

  describe('findProofByHash', () => {
    it('should find proof by image hash', async () => {
      const imageHash = 'unique-hash-abc';
      const proofUri = await storage.storeProof(testManifest, imageHash);
      const proofId = proofUri.split('/').pop()!;

      const found = await storage.findProofByHash(imageHash);

      expect(found).toBe(proofId);
    });

    it('should return null for non-existent hash', async () => {
      const found = await storage.findProofByHash('non-existent-hash');

      expect(found).toBeNull();
    });
  });

  describe('getStats', () => {
    it('should return storage statistics', async () => {
      await storage.storeProof(testManifest, 'hash1');
      await storage.storeProof(testManifest, 'hash2');

      const stats = storage.getStats();

      expect(stats.totalProofs).toBe(2);
      expect(stats.storageType).toBe('in-memory');
      expect(stats.proofs).toHaveLength(2);
    });

    it('should include proof metadata', async () => {
      const imageHash = 'hash-with-meta';
      await storage.storeProof(testManifest, imageHash);

      const stats = storage.getStats();
      const proof = stats.proofs[0];

      expect(proof.imageHash).toBe(imageHash);
      expect(proof.created).toBeDefined();
      expect(proof.accessCount).toBe(0);
    });
  });
});
