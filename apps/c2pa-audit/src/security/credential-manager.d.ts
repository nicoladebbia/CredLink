/**
 * Security Credential Manager
 * Handles secure storage, encryption, and management of credentials
 */
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
export declare class SecureCredentialManager {
    private static readonly ALGORITHM;
    private static readonly IV_LENGTH;
    private static readonly MAX_CREDENTIALS;
    private static readonly MAX_CREDENTIAL_LENGTH;
    private static readonly DEFAULT_TTL;
    private credentials;
    private encryptionKey;
    private readonly keyRotationInterval;
    private keyCreatedAt;
    constructor(encryptionKey?: string);
    /**
     * Store a credential securely
     */
    storeCredential(key: string, value: string, ttlMs?: number): void;
    /**
     * Retrieve and decrypt a credential
     */
    getCredential(key: string): string | null;
    /**
     * Remove a credential
     */
    removeCredential(key: string): boolean;
    /**
     * Check if credential exists and is not expired
     */
    hasCredential(key: string): boolean;
    /**
     * Get credential metadata without revealing the value
     */
    getCredentialInfo(key: string): {
        exists: boolean;
        created_at?: string;
        expires_at?: string | undefined;
    } | null;
    /**
     * Get all credential keys (without values)
     */
    listCredentialKeys(): string[];
    /**
     * Clear all credentials (for cleanup)
     */
    clear(): void;
    /**
     * Clean up expired credentials
     */
    cleanupExpired(): number;
    /**
     * Check if key rotation is needed
     */
    needsKeyRotation(): boolean;
    /**
     * Rotate encryption key
     */
    rotateKey(newKey?: string): void;
    /**
     * Get statistics
     */
    getStats(): {
        totalCredentials: number;
        expiredCredentials: number;
        keyAge: number;
        maxCredentials: number;
    };
    /**
     * Validate credential key format
     */
    private validateCredentialKey;
    /**
     * Validate credential value format
     */
    private validateCredentialValue;
    /**
     * Timing-safe string comparison
     */
    static timingSafeEqual(a: string, b: string): boolean;
    /**
     * Secure memory cleanup - overwrite sensitive data
     */
    secureCleanup(): void;
    /**
     * Generate cryptographically secure random key
     */
    static generateSecureKey(): string;
    /**
     * Validate key strength requirements
     */
    static validateKeyStrength(key: string): boolean;
}
//# sourceMappingURL=credential-manager.d.ts.map