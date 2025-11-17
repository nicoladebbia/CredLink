/**
 * Atomic Certificate Manager Tests
 * STEP 8: CRED-008 - Certificate Atomic Rotation
 */

import { AtomicCertificateManager } from '../../src/services/certificate-manager-atomic';
import * as crypto from 'crypto';
import * as fs from 'fs';

// Mock environment variables
const originalEnv = process.env;

describe('AtomicCertificateManager', () => {
    let manager: AtomicCertificateManager;
    let testCertificatePath: string;

    beforeAll(async () => {
        // Create a test certificate for testing
        const { publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: parseInt(process.env.TEST_RSA_MODULUS_LENGTH || '2048'),
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        // Create a simple test certificate
        const testCertificate = `-----BEGIN CERTIFICATE-----\n${Buffer.from(publicKey).toString('base64')}\n-----END CERTIFICATE-----`;
        
        // 🔥 CRITICAL FIX: Use proper test fixtures directory instead of hardcoded /tmp
        const fixturesDir = './test-fixtures/certificates';
        if (!fs.existsSync(fixturesDir)) {
            fs.mkdirSync(fixturesDir, { recursive: true });
        }
        testCertificatePath = `${fixturesDir}/test-cert.pem`;
        await fs.promises.writeFile(testCertificatePath, testCertificate);
        
        // Set test environment variables
        process.env = {
            ...originalEnv,
            CERTIFICATE_FILE: testCertificatePath,
            NODE_ENV: 'test',
            CERTIFICATE_INITIALIZATION_FAILURE: 'graceful'
        };
    });

    beforeEach(() => {
        manager = new AtomicCertificateManager();
    });

    afterEach(async () => {
        await manager.close();
    });

    afterAll(async () => {
        // Restore original environment
        process.env = originalEnv;
        
        // Clean up test certificate
        try {
            await fs.promises.unlink(testCertificatePath);
        } catch (error) {
            // Ignore cleanup errors
        }
    });

    test('loads certificate asynchronously', async () => {
        const cert = await manager.getCurrentCertificate();
        expect(cert).toBeDefined();
        expect(cert.pem).toContain('BEGIN CERTIFICATE');
        expect(cert.fingerprint).toBeDefined();
        expect(cert.version).toBe(1);
        expect(cert.expiresAt).toBeInstanceOf(Date);
        expect(cert.id).toBeDefined();
    });

    test('rotates certificate atomically', async () => {
        const originalCert = await manager.getCurrentCertificate();
        
        const rotationResult = await manager.rotateCertificate();
        
        expect(rotationResult.success).toBe(true);
        expect(rotationResult.newCertificate).toBeDefined();
        expect(rotationResult.newCertificate!.version).toBe(originalCert.version + 1);
        expect(rotationResult.oldCertificate).toBeDefined();
        expect(rotationResult.oldCertificate!.fingerprint).toBe(originalCert.fingerprint);
        
        const currentCert = await manager.getCurrentCertificate();
        expect(currentCert.fingerprint).not.toBe(originalCert.fingerprint);
        expect(currentCert.version).toBe(originalCert.version + 1);
    });

    test('rolls back on rotation failure', async () => {
        // Mock fetchNewCertificate to return invalid cert
        const originalFetch = manager['fetchNewCertificate'];
        manager['fetchNewCertificate'] = async () => {
            return {
                pem: 'invalid-cert',
                fingerprint: 'invalid',
                expiresAt: new Date(),
                id: 'invalid',
                version: 999
            };
        };

        const originalCert = await manager.getCurrentCertificate();
        
        const rotationResult = await manager.rotateCertificate();
        
        expect(rotationResult.success).toBe(false);
        expect(rotationResult.rollbackSuccessful).toBe(true);
        expect(rotationResult.error).toBeDefined();
        
        const currentCert = await manager.getCurrentCertificate();
        expect(currentCert.fingerprint).toBe(originalCert.fingerprint);
        expect(currentCert.version).toBe(originalCert.version);
        
        // Restore original method
        manager['fetchNewCertificate'] = originalFetch;
    });

    test('prevents concurrent rotations', async () => {
        const rotationPromise1 = manager.rotateCertificate();
        const rotationPromise2 = manager.rotateCertificate();
        
        const [result1, result2] = await Promise.all([rotationPromise1, rotationPromise2]);
        
        expect(result1.success).toBe(true);
        expect(result2.success).toBe(false);
        expect(result2.error).toContain('already in progress');
    });

    test('validates certificate expiration', async () => {
        // Create an expired certificate
        const expiredCert = {
            pem: '-----BEGIN CERTIFICATE-----\nexpired\n-----END CERTIFICATE-----',
            fingerprint: 'expired-fingerprint',
            expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000), // Yesterday
            id: 'expired-id',
            version: 1
        };

        const validationResult = await manager['validateCertificate'](expiredCert);
        expect(validationResult.isValid).toBe(false);
        expect(validationResult.error).toContain('expired');
    });

    test('validates certificate validity period', async () => {
        // Create a certificate with validity period too long
        const futureDate = new Date();
        futureDate.setFullYear(futureDate.getFullYear() + 2); // 2 years from now
        
        const longValidityCert = {
            pem: '-----BEGIN CERTIFICATE-----\nvalid\n-----END CERTIFICATE-----',
            fingerprint: 'long-validity-fingerprint',
            expiresAt: futureDate,
            id: 'long-validity-id',
            version: 1
        };

        const validationResult = await manager['validateCertificate'](longValidityCert);
        expect(validationResult.isValid).toBe(false);
        expect(validationResult.error).toContain('validity period too long');
    });

    test('detects near expiration correctly', async () => {
        const nearExpiryCert = {
            pem: '-----BEGIN CERTIFICATE-----\nnear-expiry\n-----END CERTIFICATE-----',
            fingerprint: 'near-expiry-fingerprint',
            expiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000), // 3 days from now
            id: 'near-expiry-id',
            version: 1
        };

        const isNearExpiry = manager['isNearExpiration'](nearExpiryCert);
        expect(isNearExpiry).toBe(true);
    });

    test('does not flag certificates far from expiration', async () => {
        const farExpiryCert = {
            pem: '-----BEGIN CERTIFICATE-----\nfar-expiry\n-----END CERTIFICATE-----',
            fingerprint: 'far-expiry-fingerprint',
            expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
            id: 'far-expiry-id',
            version: 1
        };

        const isNearExpiry = manager['isNearExpiration'](farExpiryCert);
        expect(isNearExpiry).toBe(false);
    });

    test('rollback works correctly', async () => {
        const originalCert = await manager.getCurrentCertificate();
        
        // Perform a successful rotation first
        await manager.rotateCertificate();
        
        // Now rollback
        const rollbackResult = await manager.rollbackCertificate();
        
        expect(rollbackResult).toBe(true);
        
        const currentCert = await manager.getCurrentCertificate();
        expect(currentCert.fingerprint).toBe(originalCert.fingerprint);
        expect(currentCert.version).toBe(originalCert.version);
    });

    test('rollback fails when no previous certificate exists', async () => {
        const rollbackResult = await manager.rollbackCertificate();
        expect(rollbackResult).toBe(false);
    });

    test('getRotationStatus returns correct status', async () => {
        const status = manager.getRotationStatus();
        
        expect(status.rotationInProgress).toBe(false);
        expect(status.currentCertificate).toBeDefined();
        expect(status.previousCertificate).toBeUndefined();
    });

    test('handles initialization failure gracefully', async () => {
        // Test with non-existent certificate file
        process.env.CERTIFICATE_FILE = '/non-existent/cert.pem';
        
        const gracefulManager = new AtomicCertificateManager();
        
        // Should throw error due to initialization failure (not return null)
        await expect(gracefulManager.getCurrentCertificate()).rejects.toThrow('No certificate available');
        
        await gracefulManager.close();
    });

    test('verifies certificate switch correctly', async () => {
        const verificationResult = await manager['verifyCertificateSwitch']();
        expect(verificationResult.success).toBe(true);
    });

    test('generates certificate IDs consistently', async () => {
        const cert = await manager.getCurrentCertificate();
        const cert2 = await manager.getCurrentCertificate();
        
        expect(cert.id).toBe(cert2.id); // Same certificate should have same ID
        expect(cert.id).toMatch(/^[a-f0-9]{16}$/); // Should be 16 character hex string
    });

    test('prevents rotation when destroyed', async () => {
        await manager.destroy();
        
        const rotationResult = await manager.rotateCertificate();
        expect(rotationResult.success).toBe(false);
        expect(rotationResult.error).toContain('unavailable'); // 🔥 CRITICAL FIX: Updated to match sanitized error message
    });
});
