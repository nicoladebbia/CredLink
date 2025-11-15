import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

/**
 * API Key Authentication Middleware
 * 
 * Validates API keys from the Authorization header or X-API-Key header
 * Supports multiple API keys for different clients
 */

interface AuthenticatedRequest extends Request {
  apiKey?: string;
  clientId?: string;
}

export class ApiKeyAuth {
  private apiKeys: Map<string, { clientId: string; name: string; rateLimit?: number }>;
  private enabled: boolean;
  private initialized: Promise<void>;

  constructor() {
    this.apiKeys = new Map();
    this.enabled = process.env.ENABLE_API_KEY_AUTH === 'true';
    
    // Initialize asynchronously
    this.initialized = this.enabled ? this.loadApiKeys() : Promise.resolve();
  }

  /**
   * Wait for API keys to be loaded
   * Call this before using the middleware
   */
  async waitForInitialization(): Promise<void> {
    await this.initialized;
  }

  /**
   * Load API keys from AWS Secrets Manager
   * SECURITY: Production-grade secret management with encryption at rest and in transit
   */
  private async loadFromSecretsManager(secretArn: string): Promise<void> {
    // Lazy load AWS SDK to avoid dependency in dev environment
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    
    const client = new SecretsManagerClient({
      region: process.env.AWS_REGION || 'us-east-1',
      // Credentials automatically loaded from:
      // - IAM role (ECS/EC2)
      // - Environment variables (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
      // - Shared credentials file (~/.aws/credentials)
    });

    const command = new GetSecretValueCommand({
      SecretId: secretArn,
    });

    const response = await client.send(command);
    
    if (!response.SecretString) {
      throw new Error('Secret value is empty or binary (binary secrets not supported)');
    }

    // Parse JSON or plain text format
    try {
      // Try JSON format first: {"apiKeys": "key1:client1:Name1,key2:client2:Name2"}
      const secretJson = JSON.parse(response.SecretString);
      if (secretJson.apiKeys) {
        this.parseApiKeys(secretJson.apiKeys);
      } else {
        throw new Error('Secret JSON does not contain "apiKeys" field');
      }
    } catch {
      // Fall back to plain text format
      this.parseApiKeys(response.SecretString);
    }

    logger.info('Successfully loaded API keys from Secrets Manager', {
      secretArn: secretArn.split(':').slice(0, -1).join(':') + ':***', // Mask secret name
      keyCount: this.apiKeys.size
    });
  }

  /**
   * Load API keys from secure source
   * 
   * SECURITY WARNING: Loading API keys from environment variables is NOT secure
   * for production. Environment variables are visible in:
   * - Process listings (ps aux, /proc)
   * - Container inspections
   * - CI/CD logs
   * - Application crash dumps
   * 
   * RECOMMENDED PRODUCTION APPROACHES:
   * 1. AWS Secrets Manager: Fetch keys at runtime via AWS SDK
   * 2. HashiCorp Vault: Use Vault agent or SDK
   * 3. Kubernetes Secrets: Mount as files, not env vars
   * 
   * Environment variable format (DEV ONLY): API_KEYS=key1:client1:ClientName,key2:client2:ClientName2
   */
  private async loadApiKeys(): Promise<void> {
    // Priority 1: Load from AWS Secrets Manager (production)
    if (process.env.API_KEYS_SECRET_ARN) {
      logger.info('Loading API keys from AWS Secrets Manager');
      try {
        await this.loadFromSecretsManager(process.env.API_KEYS_SECRET_ARN);
        logger.info(`Loaded ${this.apiKeys.size} API keys from AWS Secrets Manager`);
        return;
      } catch (error) {
        logger.error('Failed to load API keys from AWS Secrets Manager', { error });
        logger.warn('Falling back to alternate methods');
      }
    }
    
    // Priority 2: Load from file (mounted secret)
    if (process.env.API_KEYS_FILE) {
      logger.info('Loading API keys from file');
      try {
        const fs = require('fs');
        const fileContent = fs.readFileSync(process.env.API_KEYS_FILE, 'utf8');
        this.parseApiKeys(fileContent);
        logger.info(`Loaded ${this.apiKeys.size} API keys from file`);
        return;
      } catch (error) {
        logger.error('Failed to load API keys from file', { error });
      }
    }
    
    // Priority 3: Load from environment variables (DEVELOPMENT ONLY)
    const apiKeysEnv = process.env.API_KEYS;
    
    if (!apiKeysEnv) {
      logger.warn('API key authentication enabled but no API_KEYS configured');
      return;
    }

    if (process.env.NODE_ENV === 'production') {
      logger.warn('SECURITY WARNING: Loading API keys from environment variables in production is not recommended. Use AWS Secrets Manager or Vault instead.');
    }

    this.parseApiKeys(apiKeysEnv);
    logger.info(`Loaded ${this.apiKeys.size} API keys from environment variables`);
  }

  /**
   * Parse API keys from string format
   * Format: key1:client1:ClientName,key2:client2:ClientName2
   */
  private parseApiKeys(keysString: string): void {
    const keys = keysString.split(',');
    
    for (const keyConfig of keys) {
      const [key, clientId, name] = keyConfig.split(':');
      
      if (key && clientId && name) {
        this.apiKeys.set(key.trim(), {
          clientId: clientId.trim(),
          name: name.trim()
        });
      }
    }
  }

  /**
   * Middleware function to validate API key
   */
  authenticate = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    // Ensure initialization is complete
    await this.initialized;

    // Skip authentication if disabled
    if (!this.enabled) {
      return next();
    }

    // Extract API key from headers
    const apiKey = this.extractApiKey(req);

    if (!apiKey) {
      logger.warn('Missing API key', { ip: req.ip, path: req.path });
      res.status(401).json({
        error: 'Unauthorized',
        message: 'API key required. Provide via Authorization: Bearer <key> or X-API-Key header'
      });
      return;
    }

    // Validate API key
    const client = this.apiKeys.get(apiKey);

    if (!client) {
      logger.warn('Invalid API key', { ip: req.ip, path: req.path });
      res.status(401).json({
        error: 'Unauthorized',
        message: 'Invalid API key'
      });
      return;
    }

    // Attach client info to request
    req.apiKey = apiKey;
    req.clientId = client.clientId;

    logger.info('API key authenticated', {
      clientId: client.clientId,
      clientName: client.name,
      path: req.path
    });

    next();
  };

  /**
   * Extract API key from request headers
   */
  private extractApiKey(req: Request): string | null {
    // Check Authorization header (Bearer token)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check X-API-Key header
    const apiKeyHeader = req.headers['x-api-key'];
    if (apiKeyHeader && typeof apiKeyHeader === 'string') {
      return apiKeyHeader;
    }

    return null;
  }

  /**
   * Optional: Validate API key programmatically
   */
  validateKey(apiKey: string): boolean {
    return this.apiKeys.has(apiKey);
  }

  /**
   * Get client info for an API key
   */
  getClientInfo(apiKey: string): { clientId: string; name: string } | null {
    return this.apiKeys.get(apiKey) || null;
  }
}

// Export singleton instance
export const apiKeyAuth = new ApiKeyAuth();
