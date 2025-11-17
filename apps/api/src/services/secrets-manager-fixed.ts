import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { randomBytes } from 'crypto';
import { logger } from '../utils/logger';

interface SecretValue {
  apiKey: string;
  [key: string]: any;
}

class SecretsManagerService {
  private client: SecretsManagerClient;
  private cache = new Map<string, { value: SecretValue; expires: number }>();
  private readonly CACHE_TTL = parseInt(process.env.SECRETS_CACHE_TTL_MS || String(5 * 60 * 1000));

  constructor() {
    this.client = new SecretsManagerClient({ 
      region: process.env.AWS_REGION || 'us-east-1' 
    });
  }

  async getSecret(secretId: string): Promise<SecretValue> {
    // Check cache first
    const cached = this.cache.get(secretId);
    if (cached && cached.expires > Date.now()) {
      return cached.value;
    }

    try {
      const command = new GetSecretValueCommand({ SecretId: secretId });
      const response = await this.client.send(command);
      
      if (!response.SecretString) {
        throw new Error(`Secret ${secretId} not found or empty`);
      }

      const secretValue = JSON.parse(response.SecretString);
      
      // Cache the value
      this.cache.set(secretId, {
        value: secretValue,
        expires: Date.now() + this.CACHE_TTL
      });

      logger.info('Secret retrieved from AWS Secrets Manager', { 
        secretId: this.sanitizeSecretId(secretId) 
      });

      return secretValue;
    } catch (error) {
      logger.error('Failed to retrieve secret from AWS Secrets Manager', {
        secretId: this.sanitizeSecretId(secretId),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to retrieve secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getApiKey(keyId: string): Promise<string> {
    const secret = await this.getSecret(keyId);
    
    if (!secret.apiKey) {
      throw new Error(`API key not found in secret ${keyId}`);
    }

    return secret.apiKey;
  }

  async rotateSecret(secretId: string, newSecretValue: Partial<SecretValue>): Promise<void> {
    try {
      // Get current secret
      const currentSecret = await this.getSecret(secretId);
      const updatedSecret = { ...currentSecret, ...newSecretValue };

      // Update in Secrets Manager
      const command = new UpdateSecretCommand({
        SecretId: secretId,
        SecretString: JSON.stringify(updatedSecret)
      });

      await this.client.send(command);

      // Clear cache
      this.cache.delete(secretId);

      logger.info('Secret rotated successfully', { 
        secretId: this.sanitizeSecretId(secretId) 
      });

    } catch (error) {
      logger.error('Failed to rotate secret', {
        secretId: this.sanitizeSecretId(secretId),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw new Error(`Failed to rotate secret: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async generateAndRotateApiKey(secretId: string): Promise<string> {
    const newApiKey = randomBytes(32).toString('hex');
    
    await this.rotateSecret(secretId, { apiKey: newApiKey });
    
    return newApiKey;
  }

  // Schedule automatic rotation (90 days)
  scheduleRotation(secretId: string, intervalDays: number = 90): void {
    const interval = intervalDays * parseInt(process.env.HOURS_PER_DAY || '24') * 60 * 60 * 1000;
    
    setInterval(async () => {
      try {
        await this.generateAndRotateApiKey(secretId);
        logger.info('Automatic secret rotation completed', {
          secretId: this.sanitizeSecretId(secretId)
        });
      } catch (error) {
        logger.error('Automatic secret rotation failed', {
          secretId: this.sanitizeSecretId(secretId),
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }, interval);

    logger.info('Automatic secret rotation scheduled', {
      secretId: this.sanitizeSecretId(secretId),
      intervalDays
    });
  }

  private sanitizeSecretId(secretId: string): string {
    // Remove sensitive parts from secret ID for logging
    return secretId.replace(/\/[^\/]+$/, '/***');
  }

  // Clear cache for testing or manual refresh
  clearCache(): void {
    this.cache.clear();
    logger.info('Secrets cache cleared');
  }

  // Get cache statistics
  getCacheStats(): { size: number; keys: string[] } {
    return {
      size: this.cache.size,
      keys: Array.from(this.cache.keys()).map(key => this.sanitizeSecretId(key))
    };
  }
}

// Singleton instance
export const secretsManager = new SecretsManagerService();

// Initialize automatic rotation for important secrets
export function initializeSecretRotation(): void {
  const secretsToRotate = [
    'credlink/api-keys',
    'credlink/database-credentials',
    'credlink/service-tokens'
  ];

  secretsToRotate.forEach(secretId => {
    secretsManager.scheduleRotation(secretId, 90);
  });

  logger.info('Secret rotation initialized for all secrets');
}
