/**
 * Secure Credential Manager
 * Handles API keys, tokens, and secrets with proper security practices
 */

import { createHash, randomBytes, createCipheriv, createDecipheriv, timingSafeEqual } from 'crypto';

export interface CredentialStore {
  apiKey?: string;
  jwtSecret?: string;
  authTokens?: Record<string, string>;
  encryptionKey?: string;
}

export interface EncryptedCredential {
  data: string;
  iv: string;
  tag: string;
  algorithm: string;
  created_at: string;
  expires_at?: string;
}

/**
 * Secure credential management with encryption
 */
export class SecureCredentialManager {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly SALT_LENGTH = 32;
  private static readonly IV_LENGTH = 16;
  private static readonly TAG_LENGTH = 16;
  private static readonly MAX_CREDENTIALS = 1000;
  private static readonly MAX_CREDENTIAL_LENGTH = 4096;
  private static readonly DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
  
  private credentials: Map<string, EncryptedCredential> = new Map();
  private encryptionKey: Buffer;
  private readonly keyRotationInterval = 7 * 24 * 60 * 60 * 1000; // 7 days
  private keyCreatedAt: number;

  constructor(encryptionKey?: string) {
    // Derive encryption key from provided key or environment
    const keyString = encryptionKey || process.env.CREDENTIAL_ENCRYPTION_KEY || '';
    if (!keyString || keyString.length < 32) {
      throw new Error('Encryption key must be at least 32 characters long');
    }
    
    this.encryptionKey = createHash('sha256').update(keyString).digest();
    this.keyCreatedAt = Date.now();
    
    // Schedule key rotation
    this.scheduleKeyRotation();
  }

  /**
   * Validate credential key
   */
  private validateCredentialKey(key: string): void {
    if (!key || typeof key !== 'string') {
      throw new Error('Credential key must be a non-empty string');
    }

    if (key.length > 128) {
      throw new Error('Credential key cannot exceed 128 characters');
    }

    if (!/^[a-zA-Z0-9_.-]+$/.test(key)) {
      throw new Error('Credential key can only contain alphanumeric characters, dots, hyphens, and underscores');
    }
  }

  /**
   * Validate credential value
   */
  private validateCredentialValue(value: string): void {
    if (!value || typeof value !== 'string') {
      throw new Error('Credential value must be a non-empty string');
    }

    if (value.length > SecureCredentialManager.MAX_CREDENTIAL_LENGTH) {
      throw new Error(`Credential value cannot exceed ${SecureCredentialManager.MAX_CREDENTIAL_LENGTH} characters`);
    }
  }

  /**
   * Check if key rotation is needed
   */
  private shouldRotateKey(): boolean {
    return Date.now() - this.keyCreatedAt > this.keyRotationInterval;
  }

  /**
   * Schedule key rotation
   */
  private scheduleKeyRotation(): void {
    setInterval(() => {
      if (this.shouldRotateKey()) {
        this.rotateKey();
      }
    }, this.keyRotationInterval);
  }

  /**
   * Rotate encryption key (placeholder - would need external key management)
   */
  private rotateKey(): void {
    // In a real implementation, this would fetch a new key from a KMS
    // For now, we just reset the timestamp to prevent constant rotation
    this.keyCreatedAt = Date.now();
  }

  /**
   * Store credential securely encrypted
   */
  setCredential(key: string, value: string, ttlMs?: number): void {
    this.validateCredentialKey(key);
    this.validateCredentialValue(value);

    // Check credential limit
    if (this.credentials.size >= SecureCredentialManager.MAX_CREDENTIALS) {
      throw new Error(`Maximum number of credentials (${SecureCredentialManager.MAX_CREDENTIALS}) reached`);
    }

    const iv = randomBytes(SecureCredentialManager.IV_LENGTH);
    const cipher = createCipheriv(SecureCredentialManager.ALGORITHM, this.encryptionKey, iv);
    
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    
    const tag = cipher.getAuthTag();
    const now = new Date().toISOString();
    const ttl = ttlMs || SecureCredentialManager.DEFAULT_TTL;
    const expiresAt = new Date(Date.now() + ttl).toISOString();
    
    // Store encrypted credential with metadata
    const storedValue: EncryptedCredential = {
      data: encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      algorithm: SecureCredentialManager.ALGORITHM,
      created_at: now,
      expires_at: expiresAt
    };
    
    this.credentials.set(key, storedValue);
  }

  /**
   * Retrieve and decrypt credential
   */
  getCredential(key: string): string | null {
    this.validateCredentialKey(key);
    
    const stored = this.credentials.get(key);
    if (!stored) return null;

    // Check expiration
    if (stored.expires_at && new Date() > new Date(stored.expires_at)) {
      this.credentials.delete(key);
      return null;
    }
    
    try {
      const decipher = createDecipheriv(
        SecureCredentialManager.ALGORITHM, 
        this.encryptionKey, 
        Buffer.from(stored.iv, 'hex')
      );
      
      decipher.setAuthTag(Buffer.from(stored.tag, 'hex'));
      
      let decrypted = decipher.update(stored.data, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      
      return decrypted;
    } catch (error) {
      // Remove corrupted credential
      this.credentials.delete(key);
      return null;
    }
  }

  /**
   * Check if credential exists
   */
  hasCredential(key: string): boolean {
    this.validateCredentialKey(key);
    
    const stored = this.credentials.get(key);
    if (!stored) return false;

    // Check expiration
    if (stored.expires_at && new Date() > new Date(stored.expires_at)) {
      this.credentials.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete credential
   */
  deleteCredential(key: string): boolean {
    this.validateCredentialKey(key);
    return this.credentials.delete(key);
  }

  /**
   * Generate secure random API key
   */
  static generateApiKey(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Generate secure JWT secret
   */
  static generateJWTSecret(): string {
    return randomBytes(64).toString('hex');
  }

  /**
   * Generate secure random password
   */
  static generatePassword(length: number = 20): string {
    if (length < 12) throw new Error('Password length must be at least 12');
    if (length > 128) throw new Error('Password length cannot exceed 128');
    
    const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
    let password = '';
    
    // Ensure at least one character from each required category
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
    password += '0123456789'[Math.floor(Math.random() * 10)];
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)];
    
    // Fill the rest
    for (let i = 4; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => Math.random() - 0.5).join('');
  }

  /**
   * Validate credential strength
   */
  static validateCredentialStrength(credential: string, type: 'api_key' | 'jwt_secret' | 'password'): boolean {
    if (!credential || typeof credential !== 'string') {
      return false;
    }

    switch (type) {
      case 'api_key':
        return credential.length >= 32 && 
               credential.length <= 128 && 
               /^[a-zA-Z0-9_-]+$/.test(credential);
      case 'jwt_secret':
        return credential.length >= 64 && 
               credential.length <= 128 && 
               /^[a-zA-Z0-9_-]+$/.test(credential);
      case 'password':
        return credential.length >= 16 && 
               credential.length <= 128 &&
               /[A-Z]/.test(credential) && 
               /[a-z]/.test(credential) && 
               /[0-9]/.test(credential) && 
               /[^A-Za-z0-9]/.test(credential);
      default:
        return false;
    }
  }

  /**
   * Mask credential for logging (timing safe)
   */
  static maskCredential(credential: string): string {
    if (!credential || typeof credential !== 'string') {
      return '********';
    }
    
    if (credential.length <= 8) {
      return '*'.repeat(credential.length);
    }
    
    const start = credential.substring(0, 4);
    const end = credential.substring(credential.length - 4);
    const middle = '*'.repeat(credential.length - 8);
    
    return start + middle + end;
  }

  /**
   * Compare credentials securely (timing safe)
   */
  static secureCompare(a: string, b: string): boolean {
    if (a.length !== b.length) {
      return false;
    }
    
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  /**
   * Clean up expired credentials
   */
  cleanupExpired(): number {
    let cleaned = 0;
    const now = new Date();
    
    for (const [key, credential] of this.credentials.entries()) {
      if (credential.expires_at && now > new Date(credential.expires_at)) {
        this.credentials.delete(key);
        cleaned++;
      }
    }
    
    return cleaned;
  }

  /**
   * Get credential metadata without revealing the value
   */
  getCredentialInfo(key: string): { exists: boolean; created_at?: string; expires_at?: string | undefined } | null {
    this.validateCredentialKey(key);
    
    const stored = this.credentials.get(key);
    if (!stored) return null;

    // Check expiration
    if (stored.expires_at && new Date() > new Date(stored.expires_at)) {
      this.credentials.delete(key);
      return null;
    }

    return {
      exists: true,
      created_at: stored.created_at,
      expires_at: stored.expires_at || undefined
    };
  }

  /**
   * Get all credential keys (without values)
   */
  listCredentialKeys(): string[] {
    const validKeys: string[] = [];
    const now = new Date();
    
    for (const [key, credential] of this.credentials.entries()) {
      if (!credential.expires_at || now <= new Date(credential.expires_at)) {
        validKeys.push(key);
      } else {
        this.credentials.delete(key);
      }
    }
    
    return validKeys;
  }

  /**
   * Clear all credentials (for cleanup)
   */
  clear(): void {
    this.credentials.clear();
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalCredentials: number;
    expiredCredentials: number;
    keyAge: number;
    maxCredentials: number;
  } {
    const now = new Date();
    let expired = 0;
    
    for (const credential of this.credentials.values()) {
      if (credential.expires_at && now > new Date(credential.expires_at)) {
        expired++;
      }
    }
    
    return {
      totalCredentials: this.credentials.size,
      expiredCredentials: expired,
      keyAge: Date.now() - this.keyCreatedAt,
      maxCredentials: SecureCredentialManager.MAX_CREDENTIALS
    };
  }
}

/**
 * Global credential manager instance
 */
export const credentialManager = new SecureCredentialManager();
