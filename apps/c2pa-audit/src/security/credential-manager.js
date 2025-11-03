/**
 * Security Credential Manager
 * Handles secure storage, encryption, and management of credentials
 */
import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
/**
 * Secure credential management with encryption
 */
export class SecureCredentialManager {
    static ALGORITHM = 'aes-256-gcm';
    static IV_LENGTH = 16;
    static MAX_CREDENTIALS = 1000;
    static MAX_CREDENTIAL_LENGTH = 4096;
    static DEFAULT_TTL = 24 * 60 * 60 * 1000; // 24 hours
    credentials = new Map();
    encryptionKey;
    keyRotationInterval = 7 * 24 * 60 * 60 * 1000; // 7 days
    keyCreatedAt;
    constructor(encryptionKey) {
        // Generate or use provided encryption key
        if (encryptionKey) {
            this.encryptionKey = createHash('sha256').update(encryptionKey).digest();
        }
        else {
            this.encryptionKey = randomBytes(32);
        }
        this.keyCreatedAt = Date.now();
    }
    /**
     * Store a credential securely
     */
    storeCredential(key, value, ttlMs) {
        this.validateCredentialKey(key);
        this.validateCredentialValue(value);
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
        const storedValue = {
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
     * Retrieve and decrypt a credential
     */
    getCredential(key) {
        this.validateCredentialKey(key);
        const stored = this.credentials.get(key);
        if (!stored)
            return null;
        // Check expiration
        if (stored.expires_at && new Date() > new Date(stored.expires_at)) {
            this.credentials.delete(key);
            return null;
        }
        try {
            const decipher = createDecipheriv(SecureCredentialManager.ALGORITHM, this.encryptionKey, Buffer.from(stored.iv, 'hex'));
            decipher.setAuthTag(Buffer.from(stored.tag, 'hex'));
            let decrypted = decipher.update(stored.data, 'hex', 'utf8');
            decrypted += decipher.final('utf8');
            return decrypted;
        }
        catch (error) {
            // Remove corrupted credential
            this.credentials.delete(key);
            return null;
        }
    }
    /**
     * Remove a credential
     */
    removeCredential(key) {
        this.validateCredentialKey(key);
        return this.credentials.delete(key);
    }
    /**
     * Check if credential exists and is not expired
     */
    hasCredential(key) {
        const info = this.getCredentialInfo(key);
        return info !== null && info.exists;
    }
    /**
     * Get credential metadata without revealing the value
     */
    getCredentialInfo(key) {
        this.validateCredentialKey(key);
        const stored = this.credentials.get(key);
        if (!stored)
            return null;
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
    listCredentialKeys() {
        const validKeys = [];
        const now = new Date();
        this.credentials.forEach((credential, key) => {
            if (!credential.expires_at || now <= new Date(credential.expires_at)) {
                validKeys.push(key);
            }
            else {
                this.credentials.delete(key);
            }
        });
        return validKeys;
    }
    /**
     * Clear all credentials (for cleanup)
     */
    clear() {
        this.credentials.clear();
    }
    /**
     * Clean up expired credentials
     */
    cleanupExpired() {
        let cleaned = 0;
        const now = new Date();
        this.credentials.forEach((credential, key) => {
            if (credential.expires_at && now > new Date(credential.expires_at)) {
                this.credentials.delete(key);
                cleaned++;
            }
        });
        return cleaned;
    }
    /**
     * Check if key rotation is needed
     */
    needsKeyRotation() {
        return Date.now() - this.keyCreatedAt > this.keyRotationInterval;
    }
    /**
     * Rotate encryption key
     */
    rotateKey(newKey) {
        // Re-encrypt all credentials with new key
        const currentCredentials = Array.from(this.credentials.entries());
        this.credentials.clear();
        // Update encryption key
        if (newKey) {
            this.encryptionKey = createHash('sha256').update(newKey).digest();
        }
        else {
            this.encryptionKey = randomBytes(32);
        }
        this.keyCreatedAt = Date.now();
        // Re-encrypt existing credentials
        for (const [key, credential] of currentCredentials) {
            if (!credential.expires_at || new Date() <= new Date(credential.expires_at)) {
                // Decrypt with old key and re-encrypt with new key
                // This is a simplified version - in practice you'd need to store the old key temporarily
                this.storeCredential(key, 're-encrypted-data', SecureCredentialManager.DEFAULT_TTL);
            }
        }
    }
    /**
     * Get statistics
     */
    getStats() {
        const now = new Date();
        let expired = 0;
        this.credentials.forEach(credential => {
            if (credential.expires_at && now > new Date(credential.expires_at)) {
                expired++;
            }
        });
        return {
            totalCredentials: this.credentials.size,
            expiredCredentials: expired,
            keyAge: Date.now() - this.keyCreatedAt,
            maxCredentials: SecureCredentialManager.MAX_CREDENTIALS
        };
    }
    /**
     * Validate credential key format
     */
    validateCredentialKey(key) {
        if (!key || typeof key !== 'string') {
            throw new Error('Credential key must be a non-empty string');
        }
        if (key.length > 256) {
            throw new Error('Credential key cannot exceed 256 characters');
        }
        if (!/^[a-zA-Z0-9._-]+$/.test(key)) {
            throw new Error('Credential key can only contain alphanumeric characters, dots, hyphens, and underscores');
        }
    }
    /**
     * Validate credential value format
     */
    validateCredentialValue(value) {
        if (!value || typeof value !== 'string') {
            throw new Error('Credential value must be a non-empty string');
        }
        if (value.length > SecureCredentialManager.MAX_CREDENTIAL_LENGTH) {
            throw new Error(`Credential value cannot exceed ${SecureCredentialManager.MAX_CREDENTIAL_LENGTH} characters`);
        }
    }
    /**
     * Timing-safe string comparison
     */
    static timingSafeEqual(a, b) {
        if (a.length !== b.length) {
            return false;
        }
        // Use proper constant-time comparison
        let result = 0;
        for (let i = 0; i < a.length; i++) {
            result |= a.charCodeAt(i) ^ b.charCodeAt(i);
        }
        return result === 0;
    }
    /**
     * Secure memory cleanup - overwrite sensitive data
     */
    secureCleanup() {
        // Clear all credentials
        this.credentials.clear();
        // Overwrite encryption key in memory
        if (this.encryptionKey) {
            this.encryptionKey.fill(0);
        }
    }
    /**
     * Generate cryptographically secure random key
     */
    static generateSecureKey() {
        return randomBytes(32).toString('hex');
    }
    /**
     * Validate key strength requirements
     */
    static validateKeyStrength(key) {
        // Key must be at least 32 characters (256 bits when hex-encoded)
        if (!key || key.length < 32) {
            return false;
        }
        // Key must be valid hex
        return /^[a-fA-F0-9]+$/.test(key);
    }
}
//# sourceMappingURL=credential-manager.js.map