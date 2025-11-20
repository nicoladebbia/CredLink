import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from './logger';

/**
 * 🔥 CRITICAL SECURITY FIX: Token encryption utility for SCIM tokens
 * Previously stored in plaintext allowing complete SSO bypass on database compromise
 */

export class TokenEncryption {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;
  
  private static getEncryptionKey(): Buffer {
    const key = process.env.TOKEN_ENCRYPTION_KEY;
    if (!key) {
      throw new Error('TOKEN_ENCRYPTION_KEY environment variable required for token encryption');
    }
    return Buffer.from(key, 'hex');
  }
  
  /**
   * Encrypt a token for secure storage
   */
  static encryptToken(token: string): string {
    try {
      const key = this.getEncryptionKey();
      const iv = randomBytes(this.IV_LENGTH);
      
      const cipher = createCipheriv(this.ALGORITHM, key, iv);
      
      let encrypted = cipher.update(token, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const tag = cipher.getAuthTag();
      
      // Combine iv + tag + encrypted data
      const combined = iv.toString('hex') + tag.toString('hex') + encrypted;
      
      return combined;
    } catch (error: any) {
      logger.error('Token encryption failed', { error: error.message });
      throw new Error('Failed to encrypt token');
    }
  }
  
  /**
   * Decrypt a token from storage
   */
  static decryptToken(encryptedToken: string): string {
    try {
      const key = this.getEncryptionKey();
      
      // Extract iv, tag, and encrypted data
      const iv = Buffer.from(encryptedToken.slice(0, this.IV_LENGTH * 2), 'hex');
      const tag = Buffer.from(encryptedToken.slice(this.IV_LENGTH * 2, (this.IV_LENGTH + this.TAG_LENGTH) * 2), 'hex');
      const encrypted = encryptedToken.slice((this.IV_LENGTH + this.TAG_LENGTH) * 2);
      
      const decipher = createDecipheriv(this.ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error: any) {
      logger.error('Token decryption failed', { error: error.message });
      throw new Error('Failed to decrypt token');
    }
  }
  
  /**
   * Generate a secure random token
   */
  static generateToken(prefix = 'scim'): string {
    return `${prefix}_${randomBytes(32).toString('base64url')}`;
  }
}

/**
 * Helper functions for SCIM token operations
 */
export const encryptSCIMToken = (token: string): string => {
  return TokenEncryption.encryptToken(token);
};

export const decryptSCIMToken = (encryptedToken: string): string => {
  return TokenEncryption.decryptToken(encryptedToken);
};

export const generateSCIMToken = (): string => {
  return TokenEncryption.generateToken('scim');
};
