import { DataEncryption } from '../encryption';

describe('DataEncryption', () => {
  let encryption: DataEncryption;
  
  beforeEach(() => {
    // 🔥 CRITICAL SECURITY FIX: Use environment variable for test encryption key
    const testKey = process.env.TEST_ENCRYPTION_KEY;
    if (!testKey) {
      throw new Error('TEST_ENCRYPTION_KEY environment variable must be set for tests');
    }
    encryption = new DataEncryption({ localKey: testKey });
  });
  
  test('encrypts and decrypts data correctly', () => {
    const plaintext = 'sensitive proof data';
    const encrypted = encryption.encrypt(plaintext);
    const decrypted = encryption.decrypt(encrypted);
    
    expect(decrypted).toBe(plaintext);
    expect(encrypted.ciphertext).not.toContain(plaintext);
  });
  
  test('produces different ciphertexts for same plaintext', () => {
    const plaintext = 'test data';
    const enc1 = encryption.encrypt(plaintext);
    const enc2 = encryption.encrypt(plaintext);
    
    expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
    expect(enc1.iv).not.toBe(enc2.iv);
  });
  
  test('throws on tampered ciphertext', () => {
    const plaintext = 'test';
    const encrypted = encryption.encrypt(plaintext);
    encrypted.ciphertext = encrypted.ciphertext.slice(0, -2) + 'XX';
    
    expect(() => encryption.decrypt(encrypted)).toThrow();
  });
  
  test('requires KMS key in production', () => {
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    
    expect(() => {
      new DataEncryption({ localKey: 'key' });
    }).toThrow('KMS key required');
    
    process.env.NODE_ENV = originalEnv;
  });
});
