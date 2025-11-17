import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand } from '@aws-sdk/client-secrets-manager';
import { logger } from '../utils/logger';

interface SecretValue {
  apiKey: string;
  [key: string]: any;
}

class SecretsManagerService {
  private client: SecretsManagerClient;
  private cache = new Map<string, { value: SecretValue; expires: number }>();
  private rotationIntervals: Map<string, NodeJS.Timeout> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

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
        throw new Error('No secret string found');
      }

      const secretValue = JSON.parse(response.SecretString);
      
      // Cache the secret
      this.cache.set(secretId, {
        value: secretValue,
        expires: Date.now() + this.CACHE_TTL
      });

      return secretValue;
    } catch (error) {
      logger.error('Failed to get secret', {
        secretId: this.sanitizeSecretId(secretId),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async updateSecret(secretId: string, secretValue: SecretValue): Promise<void> {
    try {
      const command = new UpdateSecretCommand({
        SecretId: secretId,
        SecretString: JSON.stringify(secretValue)
      });

      await this.client.send(command);
      
      // Update cache
      this.cache.set(secretId, {
        value: secretValue,
        expires: Date.now() + this.CACHE_TTL
      });

      logger.info('Secret updated successfully', {
        secretId: this.sanitizeSecretId(secretId)
      });
    } catch (error) {
      logger.error('Failed to update secret', {
        secretId: this.sanitizeSecretId(secretId),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  async rotateSecret(secretId: string, newSecretValue: SecretValue): Promise<void> {
    await this.updateSecret(secretId, newSecretValue);
  }

  async generateAndRotateApiKey(secretId: string): Promise<string> {
    const { randomBytes } = await import('crypto');
    const newApiKey = randomBytes(32).toString('hex');
    
    await this.rotateSecret(secretId, { apiKey: newApiKey });
    
    return newApiKey;
  }

  // Schedule automatic rotation (90 days)
  scheduleRotation(secretId: string, intervalDays: number = 90): void {
    const interval = intervalDays * 24 * 60 * 60 * 1000;
    
    // Clear existing interval for this secret
    const existingInterval = this.rotationIntervals.get(secretId);
    if (existingInterval) {
      clearInterval(existingInterval);
    }
    
    const rotationInterval = setInterval(async () => {
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
    
    // Store interval reference for cleanup
    this.rotationIntervals.set(secretId, rotationInterval);

    logger.info('Automatic secret rotation scheduled', {
      secretId: this.sanitizeSecretId(secretId),
      intervalDays
    });
  }

  // Cleanup method for graceful shutdown
  cleanup(): void {
    for (const [secretId, interval] of this.rotationIntervals) {
      clearInterval(interval);
    }
    this.rotationIntervals.clear();
    this.cache.clear();
    logger.info('SecretsManager cleanup completed');
  }

  private sanitizeSecretId(secretId: string): string {
    // Remove sensitive parts from secret ID for logging
    return secretId.replace(/\/[^/]+$/, '/***');
  }

  // Clear cache for testing or manual refresh
  clearCache(): void {
    this.cache.clear();
    logger.info('Secrets cache cleared');
  }
}

export const secretsManager = new SecretsManagerService();
