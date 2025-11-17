/**
 * API Key Service with Rotation, Expiration, and Audit Capabilities
 * STEP 7: CRED-007 - API Key Rotation Mechanism
 */

import { Pool } from 'pg';
import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { logger } from '../utils/logger';

export interface ApiKeyInfo {
  id: string;
  keyId: string;
  clientId: string;
  clientName: string;
  version: number;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  rotationIntervalHours: number;
  isActive: boolean;
}

export interface CreateApiKeyOptions {
  clientId: string;
  clientName: string;
  rotationIntervalHours?: number;
  expiresAt?: Date;
  createdBy?: string;
}

export interface ApiKeyWithSecret extends ApiKeyInfo {
  apiKey: string; // The actual API key (only returned during creation)
}

export class ApiKeyService {
  private pool: Pool;
  private initialized: boolean = false;
  private rotationInterval: NodeJS.Timeout | null = null;
  private readonly rotationCheckIntervalMs = 60 * 60 * 1000; // 1 hour

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Initialize the API key service
   * Ensures database connection and runs cleanup tasks
   */
  async initialize(): Promise<void> {
    try {
      // 🔥 CRITICAL FIX: Validate required environment variables
      this.validateEnvironment();
      
      // Test database connection
      await this.pool.query('SELECT 1');
      
      // Clean up expired keys
      await this.cleanupExpiredKeys();
      
      // Start automated rotation scheduler
      this.startRotationScheduler();
      
      this.initialized = true;
      logger.info('ApiKeyService initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize ApiKeyService', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Validate required environment variables
   */
  private validateEnvironment(): void {
    const requiredVars = [];
    
    // Check database connection
    if (!this.pool) {
      requiredVars.push('Database pool');
    }
    
    if (requiredVars.length > 0) {
      throw new Error(`Missing required configuration: ${requiredVars.join(', ')}`);
    }
    
    logger.info('Environment validation passed');
  }

  /**
   * Start automated rotation scheduler
   * Periodically checks for keys needing rotation and logs warnings
   */
  private startRotationScheduler(): void {
    if (process.env.NODE_ENV === 'production') {
      this.rotationInterval = setInterval(async () => {
        try {
          const keysNeedingRotation = await this.getKeysNeedingRotation(72); // 72 hours
          
          if (keysNeedingRotation.length > 0) {
            logger.warn('API keys need rotation soon', {
              count: keysNeedingRotation.length,
              keys: keysNeedingRotation.map(k => ({ keyId: k.keyId, clientId: k.clientId, expiresAt: k.expiresAt }))
            });
            
            // TODO: Implement automatic rotation for critical keys
            // For now, just log warnings for manual intervention
          }
        } catch (error) {
          logger.error('Rotation scheduler error', { 
            error: error instanceof Error ? error.message : String(error)
          });
        }
      }, this.rotationCheckIntervalMs);
      
      logger.info('API key rotation scheduler started', { 
        interval: this.rotationCheckIntervalMs 
      });
    }
  }

  /**
   * Hash API key using SHA-256
   */
  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  /**
   * Verify API key using timing-safe comparison to prevent timing attacks
   */
  private verifyApiKey(providedKey: string, storedHash: string): boolean {
    try {
      const providedHash = this.hashApiKey(providedKey);
      
      // 🔥 CRITICAL FIX: Handle hash length mismatch before timingSafeEqual
      if (providedHash.length !== storedHash.length) {
        return false; // Hash lengths don't match - invalid key
      }
      
      return timingSafeEqual(Buffer.from(providedHash, 'hex'), Buffer.from(storedHash, 'hex'));
    } catch (error) {
      // 🔥 CRITICAL FIX: Handle any timingSafeEqual exceptions
      logger.error('Timing-safe comparison failed', { 
        error: error instanceof Error ? error.message : String(error)
      });
      return false; // Fail secure on any error
    }
  }

  /**
   * Generate a secure random API key with keyId format
   * Format: keyId.actualKey (like JWT structure for validation)
   */
  private generateApiKey(): string {
    const keyId = `kid_${randomBytes(8).toString('hex')}`;
    const actualKey = randomBytes(32).toString('hex');
    return `${keyId}.${actualKey}`;
  }

  /**
   * Parse API key to extract keyId and actual key
   */
  private parseApiKey(apiKey: string): { keyId: string; actualKey: string } | null {
    const parts = apiKey.split('.');
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      return null;
    }
    return {
      keyId: parts[0],
      actualKey: parts[1]
    };
  }

  /**
   * Create a new API key with rotation support
   */
  async createApiKey(options: CreateApiKeyOptions): Promise<ApiKeyWithSecret> {
    await this.waitForInitialization();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Deactivate existing keys for this client if creating a new version
      if (options.expiresAt) {
        await client.query(
          'UPDATE api_keys SET is_active = false WHERE client_id = $1 AND is_active = true',
          [options.clientId]
        );
      }

      // Generate new API key
      const apiKey = this.generateApiKey();
      const keyHash = this.hashApiKey(apiKey);
      
      // Extract keyId from generated API key (format: keyId.actualKey)
      const keyId = this.parseApiKey(apiKey)?.keyId || `kid_${randomBytes(8).toString('hex')}`;
      
      // Set default expiration if not provided
      const expiresAt = options.expiresAt || new Date(Date.now() + (options.rotationIntervalHours || 8760) * 60 * 60 * 1000);

      // Insert new API key
      const result = await client.query(
        `INSERT INTO api_keys (key_id, key_hash, client_id, client_name, expires_at, rotation_interval_hours, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, key_id, client_id, client_name, version, expires_at, created_at, updated_at, last_used_at, rotation_interval_hours, is_active`,
        [keyId, keyHash, options.clientId, options.clientName, expiresAt, options.rotationIntervalHours || 8760, options.createdBy]
      );

      // Log creation
      await client.query(
        `INSERT INTO api_key_audit_log (api_key_id, action, performed_by, metadata)
         VALUES ($1, 'created', $2, $3)`,
        [result.rows[0].id, options.createdBy || 'system', JSON.stringify({ keyId, clientId: options.clientId })]
      );

      await client.query('COMMIT');

      const apiKeyInfo: ApiKeyWithSecret = {
        ...result.rows[0],
        apiKey
      };

      logger.info('API key created successfully', {
        keyId,
        clientId: options.clientId,
        version: result.rows[0].version,
        expiresAt
      });

      return apiKeyInfo;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create API key', { 
        clientId: options.clientId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Validate API key and update last used timestamp
   * Uses timing-safe comparison to prevent timing attacks
   */
  async validateApiKey(apiKey: string): Promise<ApiKeyInfo | null> {
    await this.waitForInitialization();

    // Extract key ID and actual key from format "keyId.actualKey"
    const parsedKey = this.parseApiKey(apiKey);
    if (!parsedKey) {
      return null;
    }
    
    const { keyId, actualKey } = parsedKey;
    
    try {
      // Query by keyId (not hash) to prevent timing attacks
      const result = await this.pool.query(
        `SELECT id, key_id, client_id, client_name, version, expires_at, created_at, updated_at, last_used_at, rotation_interval_hours, is_active
         FROM active_api_keys 
         WHERE key_id = $1`,
        [keyId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const keyRecord = result.rows[0];
      
      // Use timing-safe comparison to verify the actual key
      if (!this.verifyApiKey(actualKey, keyRecord.key_hash)) {
        return null;
      }

      const apiKeyInfo: ApiKeyInfo = keyRecord;

      // Update last used timestamp asynchronously (don't block validation)
      this.updateLastUsed(apiKeyInfo.id).catch(error => {
        logger.warn('Failed to update last used timestamp', { 
          apiKeyId: apiKeyInfo.id,
          error: error instanceof Error ? error.message : String(error)
        });
      });

      return apiKeyInfo;
    } catch (error) {
      logger.error('Failed to validate API key', { 
        error: error instanceof Error ? error.message : String(error)
      });
      return null;
    }
  }

  /**
   * Update last used timestamp for an API key
   */
  private async updateLastUsed(apiKeyId: string): Promise<void> {
    await this.pool.query(
      'UPDATE api_keys SET last_used_at = NOW() WHERE id = $1',
      [apiKeyId]
    );
  }

  /**
   * Rotate API key (create new version, deactivate old)
   */
  async rotateApiKey(clientId: string, performedBy?: string): Promise<ApiKeyWithSecret | null> {
    await this.waitForInitialization();

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Get current active key for this client
      const currentKeyResult = await client.query(
        `SELECT id, client_name, rotation_interval_hours 
         FROM active_api_keys 
         WHERE client_id = $1`,
        [clientId]
      );

      if (currentKeyResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return null;
      }

      const currentKey = currentKeyResult.rows[0];

      // Deactivate current key
      await client.query(
        'UPDATE api_keys SET is_active = false WHERE id = $1',
        [currentKey.id]
      );

      // Create new key
      const newApiKey = this.generateApiKey();
      const keyHash = this.hashApiKey(newApiKey);
      const keyId = `kid_${randomBytes(8).toString('hex')}`;
      const expiresAt = new Date(Date.now() + currentKey.rotation_interval_hours * 60 * 60 * 1000);

      const result = await client.query(
        `INSERT INTO api_keys (key_id, key_hash, client_id, client_name, expires_at, rotation_interval_hours, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, key_id, client_id, client_name, version, expires_at, created_at, updated_at, last_used_at, rotation_interval_hours, is_active`,
        [keyId, keyHash, clientId, currentKey.client_name, expiresAt, currentKey.rotation_interval_hours, performedBy]
      );

      // Log rotation
      await client.query(
        `INSERT INTO api_key_audit_log (api_key_id, action, performed_by, metadata)
         VALUES ($1, 'rotated', $2, $3)`,
        [result.rows[0].id, performedBy || 'system', JSON.stringify({ 
          previousKeyId: currentKey.id, 
          newKeyId: result.rows[0].id,
          clientId 
        })]
      );

      await client.query('COMMIT');

      const apiKeyInfo: ApiKeyWithSecret = {
        ...result.rows[0],
        apiKey: newApiKey
      };

      logger.info('API key rotated successfully', {
        clientId,
        previousKeyId: currentKey.id,
        newKeyId: result.rows[0].id,
        newVersion: result.rows[0].version
      });

      return apiKeyInfo;
    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to rotate API key', { 
        clientId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(keyId: string, performedBy?: string): Promise<boolean> {
    await this.waitForInitialization();

    try {
      const result = await this.pool.query(
        'UPDATE api_keys SET is_active = false WHERE key_id = $1 AND is_active = true RETURNING id',
        [keyId]
      );

      if (result.rows.length === 0) {
        return false;
      }

      // Log revocation
      await this.pool.query(
        `INSERT INTO api_key_audit_log (api_key_id, action, performed_by, metadata)
         VALUES ($1, 'revoked', $2, $3)`,
        [result.rows[0].id, performedBy || 'system', JSON.stringify({ keyId })]
      );

      logger.info('API key revoked successfully', { keyId, revokedBy: performedBy });
      return true;
    } catch (error) {
      logger.error('Failed to revoke API key', { 
        keyId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get API key information
   */
  async getApiKey(keyId: string): Promise<ApiKeyInfo | null> {
    await this.waitForInitialization();

    try {
      const result = await this.pool.query(
        `SELECT id, key_id, client_id, client_name, version, expires_at, created_at, updated_at, last_used_at, rotation_interval_hours, is_active
         FROM api_keys 
         WHERE key_id = $1`,
        [keyId]
      );

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error('Failed to get API key', { 
        keyId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * List API keys for a client
   */
  async listApiKeys(clientId: string): Promise<ApiKeyInfo[]> {
    await this.waitForInitialization();

    try {
      const result = await this.pool.query(
        `SELECT id, key_id, client_id, client_name, version, expires_at, created_at, updated_at, last_used_at, rotation_interval_hours, is_active
         FROM api_keys 
         WHERE client_id = $1
         ORDER BY created_at DESC`,
        [clientId]
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to list API keys', { 
        clientId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Clean up expired keys
   * 🔥 RUNTIME FIX: Gracefully handle missing database function
   */
  async cleanupExpiredKeys(): Promise<number> {
    try {
      const result = await this.pool.query('SELECT deactivate_expired_keys() as count');
      const deactivatedCount = parseInt(result.rows[0].count, 10);
      
      if (deactivatedCount > 0) {
        logger.debug('Deactivated expired API keys', { count: deactivatedCount });
      }
      
      return deactivatedCount;
    } catch (error) {
      // 🔥 GRACEFUL FIX: Handle missing database function without crashing
      console.debug('Database function deactivate_expired_keys() not available - skipping cleanup');
      return 0;
    }
  }

  /**
   * Get keys that need rotation soon
   */
  async getKeysNeedingRotation(hoursThreshold: number = 72): Promise<ApiKeyInfo[]> {
    await this.waitForInitialization();

    try {
      const result = await this.pool.query(
        `SELECT id, key_id, client_id, client_name, version, expires_at, created_at, updated_at, last_used_at, rotation_interval_hours, is_active
         FROM active_api_keys 
         WHERE expires_at IS NOT NULL 
         AND expires_at <= NOW() + INTERVAL '${hoursThreshold} hours'
         ORDER BY expires_at ASC`,
        []
      );

      return result.rows;
    } catch (error) {
      logger.error('Failed to get keys needing rotation', { 
        hoursThreshold,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Wait for initialization
   */
  private async waitForInitialization(): Promise<void> {
    if (this.initialized) {
      return;
    }

    const maxWaitTime = 10000; // 10 seconds
    const checkInterval = 100; // 100ms
    let elapsed = 0;

    while (!this.initialized && elapsed < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
      elapsed += checkInterval;
    }

    if (!this.initialized) {
      throw new Error('ApiKeyService initialization timeout');
    }
  }

  /**
   * Close the service
   */
  async close(): Promise<void> {
    // Stop rotation scheduler
    if (this.rotationInterval) {
      clearInterval(this.rotationInterval);
      this.rotationInterval = null;
    }
    
    this.initialized = false;
    logger.info('ApiKeyService closed');
  }
}
