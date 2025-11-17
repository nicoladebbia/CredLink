import { AtomicCertificateManager } from '../../src/services/certificate-manager-atomic';
import { KMSClient, DecryptCommand } from '@aws-sdk/client-kms';
import path from 'path';

// Mock AWS SDK
jest.mock('@aws-sdk/client-kms', () => ({
  KMSClient: jest.fn(() => ({
    send: jest.fn()
  })),
  DecryptCommand: jest.fn()
}));

describe('AtomicCertificateManager', () => {
  let certManager: AtomicCertificateManager;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    if (certManager) {
      certManager.destroy();
    }
  });

  describe('Certificate Loading', () => {
    it('should load certificate from file path', async () => {
      const certPath = process.env.TEST_CERT_PATH || path.join(__dirname, '../../certs/signing-cert.pem');
      process.env.SIGNING_CERTIFICATE = certPath;
      
      certManager = new AtomicCertificateManager();
      const cert = await certManager.getCurrentCertificate();
      
      expect(cert).toBeDefined();
      expect(cert.pem).toContain('BEGIN CERTIFICATE');
      expect(cert.fingerprint).toMatch(process.env.CERT_FINGERPRINT_PATTERN || /^[a-f0-9:]+$/i);
      expect(cert.expiresAt).toBeInstanceOf(Date);
    });

    it('should load certificate from environment variable', async () => {
      // Read certificate from file to avoid hardcoding
      const fs = require('fs');
      const certPath = process.env.TEST_CERT_PATH || path.join(__dirname, '../../certs/signing-cert.pem');
      const mockCertPem = fs.readFileSync(certPath, 'utf8');
      
      process.env.SIGNING_CERTIFICATE = mockCertPem;
      
      certManager = new AtomicCertificateManager();
      const cert = await certManager.getCurrentCertificate();
      
      expect(cert.pem).toBe(mockCertPem);
    });

    it('should handle missing certificate gracefully', async () => {
      delete process.env.SIGNING_CERTIFICATE;
      
      certManager = new AtomicCertificateManager();
      // Should not throw during construction, but getCurrentCertificate should handle gracefully
      await expect(certManager.getCurrentCertificate()).rejects.toThrow();
    });
  });

  describe('Private Key Loading', () => {
    it('should load private key from file', async () => {
      const keyPath = process.env.TEST_KEY_PATH || path.join(__dirname, '../../certs/signing-key.pem');
      process.env.SIGNING_PRIVATE_KEY = keyPath;
      
      certManager = new AtomicCertificateManager();
      const privateKey = await certManager.getSigningKey();
      
      expect(privateKey).toContain(process.env.PRIVATE_KEY_TYPE || 'BEGIN RSA PRIVATE KEY');
    });

    it('should load private key from environment variable', async () => {
      // Read private key from file to avoid hardcoding
      const fs = require('fs');
      const keyPath = process.env.TEST_KEY_PATH || path.join(__dirname, '../../certs/signing-key.pem');
      const mockKeyPem = fs.readFileSync(keyPath, 'utf8');
      
      process.env.SIGNING_PRIVATE_KEY = mockKeyPem;
      
      certManager = new AtomicCertificateManager();
      const privateKey = await certManager.getSigningKey();
      
      expect(privateKey).toBe(mockKeyPem);
    });
  });

  describe('API Compatibility', () => {
    it('should provide getCurrentCertificateId method', async () => {
      process.env.SIGNING_CERTIFICATE = path.join(__dirname, '../../certs/signing-cert.pem');
      
      certManager = new AtomicCertificateManager();
      const certId = await certManager.getCurrentCertificateId();
      
      expect(certId).toBeDefined();
      expect(typeof certId).toBe('string');
    });

    it('should provide getSigningKeyAsync method', async () => {
      process.env.SIGNING_CERTIFICATE = path.join(__dirname, '../../certs/signing-cert.pem');
      
      certManager = new AtomicCertificateManager();
      const signingKey = await certManager.getSigningKeyAsync();
      
      expect(signingKey).toContain('BEGIN CERTIFICATE');
    });
  });
});
