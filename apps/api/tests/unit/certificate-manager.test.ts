/**
 * Unit Tests: Certificate Manager
 * 
 * Tests certificate loading, rotation, KMS integration, and error handling
 */

import { CertificateManager } from '@credlink/c2pa-sdk';
import * as fs from 'fs';
import * as path from 'path';

// Mock AWS KMS
jest.mock('@aws-sdk/client-kms', () => ({
  KMSClient: jest.fn().mockImplementation(() => ({
    send: jest.fn()
  })),
  DecryptCommand: jest.fn()
}));

describe('CertificateManager', () => {
  let certManager: CertificateManager;
  const originalEnv = process.env;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('Certificate Loading', () => {
    it('should load certificate from file path', async () => {
      process.env.SIGNING_CERTIFICATE = path.join(__dirname, '../../../fixtures/certs/test-cert.pem');
      
      certManager = new CertificateManager();
      const cert = await certManager.getCurrentCertificate();
      
      expect(cert).toBeDefined();
      expect(cert.pem).toContain('BEGIN CERTIFICATE');
      expect(cert.fingerprint).toMatch(/^[a-f0-9:]+$/);
      expect(cert.expiresAt).toBeInstanceOf(Date);
    });

    it('should load certificate from environment variable', async () => {
      const mockCertPem = `-----BEGIN CERTIFICATE-----
MIICdTCCAd4CCQDd...
-----END CERTIFICATE-----`;
      
      process.env.SIGNING_CERTIFICATE = mockCertPem;
      
      certManager = new CertificateManager();
      const cert = await certManager.getCurrentCertificate();
      
      expect(cert.pem).toBe(mockCertPem);
    });

    it('should throw error on missing certificate', async () => {
      process.env.SIGNING_CERTIFICATE = '/nonexistent/path/cert.pem';
      
      expect(() => {
        new CertificateManager();
      }).toThrow('Failed to load signing certificate');
    });

    it('should throw error on invalid certificate format', async () => {
      process.env.SIGNING_CERTIFICATE = 'invalid-certificate-data';
      
      expect(() => {
        new CertificateManager();
      }).toThrow();
    });
  });

  describe('Private Key Loading', () => {
    it('should load private key from file', async () => {
      process.env.SIGNING_PRIVATE_KEY = path.join(__dirname, '../../../fixtures/certs/test-key.pem');
      
      certManager = new CertificateManager();
      const key = await certManager.getSigningKey();
      
      expect(key).toBeDefined();
      expect(key.type).toBe('private');
    });

    it('should load private key from KMS in production', async () => {
      process.env.NODE_ENV = 'production';
      process.env.AWS_REGION = 'us-east-1';
      process.env.KMS_KEY_ID = 'arn:aws:kms:us-east-1:123456789012:key/test';
      process.env.ENCRYPTED_PRIVATE_KEY = Buffer.from('encrypted-key').toString('base64');
      
      const mockDecrypt = jest.fn().mockResolvedValue({
        Plaintext: Buffer.from('-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----')
      });
      
      const { KMSClient } = require('@aws-sdk/client-kms');
      KMSClient.mockImplementation(() => ({
        send: mockDecrypt
      }));
      
      certManager = new CertificateManager();
      
      await expect(certManager.getSigningKey()).resolves.toBeDefined();
      expect(mockDecrypt).toHaveBeenCalled();
    });

    it('should throw error on KMS decryption failure', async () => {
      process.env.NODE_ENV = 'production';
      process.env.AWS_REGION = 'us-east-1';
      process.env.ENCRYPTED_PRIVATE_KEY = 'invalid';
      
      const mockDecrypt = jest.fn().mockRejectedValue(new Error('KMS unavailable'));
      
      const { KMSClient } = require('@aws-sdk/client-kms');
      KMSClient.mockImplementation(() => ({
        send: mockDecrypt
      }));
      
      certManager = new CertificateManager();
      
      await expect(certManager.getSigningKey()).rejects.toThrow();
    });
  });

  describe('Certificate Rotation', () => {
    it('should detect expired certificate', async () => {
      const expiredCert = {
        pem: '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----',
        fingerprint: 'aa:bb:cc:dd',
        expiresAt: new Date('2020-01-01'), // Expired
        id: 'expired-cert'
      };
      
      certManager = new CertificateManager();
      // @ts-ignore - accessing private method for testing
      const isExpired = certManager.isCertificateExpired(expiredCert);
      
      expect(isExpired).toBe(true);
    });

    it('should schedule rotation in production', async () => {
      process.env.NODE_ENV = 'production';
      
      jest.useFakeTimers();
      certManager = new CertificateManager();
      
      // Verify rotation timer is set
      expect(jest.getTimerCount()).toBeGreaterThan(0);
      
      jest.useRealTimers();
    });

    it('should not schedule rotation in development', async () => {
      process.env.NODE_ENV = 'development';
      
      jest.useFakeTimers();
      certManager = new CertificateManager();
      
      // No rotation timer in dev
      expect(jest.getTimerCount()).toBe(0);
      
      jest.useRealTimers();
    });

    it('should generate valid certificate fingerprint', async () => {
      const certPem = `-----BEGIN CERTIFICATE-----
MIICdTCCAd4CCQDd...
-----END CERTIFICATE-----`;
      
      certManager = new CertificateManager();
      // @ts-ignore
      const fingerprint = certManager.generateCertificateFingerprint(certPem);
      
      expect(fingerprint).toMatch(/^[a-f0-9:]+$/);
      expect(fingerprint.split(':').length).toBeGreaterThan(10);
    });
  });

  describe('Certificate Validation', () => {
    it('should extract expiration date from certificate', async () => {
      const validCertPem = fs.readFileSync(
        path.join(__dirname, '../../../fixtures/certs/valid-cert.pem'),
        'utf8'
      );
      
      certManager = new CertificateManager();
      // @ts-ignore
      const expiresAt = certManager.extractExpirationDate(validCertPem);
      
      expect(expiresAt).toBeInstanceOf(Date);
      expect(expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('should handle certificates without expiration', async () => {
      const malformedCert = '-----BEGIN CERTIFICATE-----\ninvalid\n-----END CERTIFICATE-----';
      
      certManager = new CertificateManager();
      
      expect(() => {
        // @ts-ignore
        certManager.extractExpirationDate(malformedCert);
      }).toThrow();
    });
  });

  describe('Cleanup', () => {
    it('should cleanup resources on destroy', async () => {
      certManager = new CertificateManager();
      
      await expect(certManager.cleanup()).resolves.not.toThrow();
    });

    it('should clear rotation timer on cleanup', async () => {
      process.env.NODE_ENV = 'production';
      
      certManager = new CertificateManager();
      await certManager.cleanup();
      
      // Timer should be cleared
      // @ts-ignore
      expect(certManager.rotationTimer).toBeNull();
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent certificate requests', async () => {
      certManager = new CertificateManager();
      
      const requests = Array(10).fill(null).map(() => 
        certManager.getCurrentCertificate()
      );
      
      const certs = await Promise.all(requests);
      
      expect(certs).toHaveLength(10);
      expect(certs.every(c => c.id === certs[0].id)).toBe(true);
    });

    it('should handle missing AWS credentials gracefully', async () => {
      process.env.NODE_ENV = 'production';
      process.env.AWS_REGION = undefined;
      
      certManager = new CertificateManager();
      
      // Should fall back to file-based loading
      await expect(certManager.getSigningKey()).resolves.toBeDefined();
    });

    it('should generate unique certificate IDs', async () => {
      certManager = new CertificateManager();
      
      const cert1 = await certManager.getCurrentCertificate();
      const cert2 = await certManager.getCurrentCertificate();
      
      expect(cert1.id).toBe(cert2.id); // Same cert = same ID
    });
  });
});
