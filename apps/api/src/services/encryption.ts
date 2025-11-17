import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

export interface EncryptionConfig {
  kmsKeyId?: string;  // AWS KMS key for production
  localKey?: string;   // Local key for development
  algorithm: string;   // Default: 'aes-256-gcm'
}

export class DataEncryption {
  private readonly algorithm = 'aes-256-gcm';
  private key: Buffer;
  
  constructor(config: EncryptionConfig) {
    if (process.env.NODE_ENV === 'production') {
      if (!config.kmsKeyId) {
        throw new Error('KMS key required for production encryption');
      }
      // Load key from KMS
      this.key = this.loadFromKMS(config.kmsKeyId);
    } else {
      // 🔥 CRITICAL SECURITY FIX: Remove hardcoded development key
      // NEVER use hardcoded encryption keys in any environment
      const passphrase = config.localKey || process.env.ENCRYPTION_KEY;
      if (!passphrase) {
        throw new Error('ENCRYPTION_KEY environment variable required for encryption');
      }
      this.key = scryptSync(passphrase, 'salt', 32);
    }
  }
  
  encrypt(plaintext: string): { ciphertext: string; iv: string; tag: string } {
    const iv = randomBytes(16);
    const cipher = createCipheriv(this.algorithm, this.key, iv);
    
    let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    
    return {
      ciphertext,
      iv: iv.toString('hex'),
      tag: tag.toString('hex')
    };
  }
  
  decrypt(encrypted: { ciphertext: string; iv: string; tag: string }): string {
    const decipher = createDecipheriv(
      this.algorithm,
      this.key,
      Buffer.from(encrypted.iv, 'hex')
    );
    
    decipher.setAuthTag(Buffer.from(encrypted.tag, 'hex'));
    
    let plaintext = decipher.update(encrypted.ciphertext, 'hex', 'utf8');
    plaintext += decipher.final('utf8');
    
    return plaintext;
  }
  
  private loadFromKMS(keyId: string): Buffer {
    // Implementation for KMS key loading
    throw new Error('KMS integration not yet implemented');
  }
}
