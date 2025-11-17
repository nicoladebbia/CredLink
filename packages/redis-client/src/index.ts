/**
 * @credlink/redis-client
 * 
 * Shared Redis client with connection pooling, health checks, and fallback mechanisms
 * Provides reliable Redis connectivity for distributed locking and caching
 */

import Redis from 'ioredis';

export interface RedisClientOptions {
  host?: string;
  port?: number;
  password?: string;
  database?: number;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  lazyConnect?: boolean;
  healthCheckInterval?: number;
}

export interface RedisHealthStatus {
  connected: boolean;
  lastCheck: number;
  errorCount: number;
  lastError?: string;
  responseTime?: number;
}

export class RedisClient {
  private redis: Redis | null = null;
  private options: RedisClientOptions;
  private healthStatus: RedisHealthStatus = {
    connected: false,
    lastCheck: 0,
    errorCount: 0
  };
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private connectionPromise: Promise<void> | null = null;

  constructor(options: RedisClientOptions = {}) {
    this.options = {
      host: options.host || process.env.REDIS_HOST || 'localhost',
      port: options.port || parseInt(process.env.REDIS_PORT || '6379'),
      password: options.password || process.env.REDIS_PASSWORD,
      database: options.database || parseInt(process.env.REDIS_DB || '0'),
      maxRetriesPerRequest: options.maxRetriesPerRequest || 3,
      retryDelayOnFailover: options.retryDelayOnFailover || 100,
      lazyConnect: options.lazyConnect === true, // Default to false for immediate connection
      healthCheckInterval: options.healthCheckInterval || 30000 // 30 seconds
    };

    // Start Redis initialization in background - don't await to keep constructor synchronous
    this.initializeRedis().catch(error => {
      console.error('Redis background initialization failed:', error);
    });
  }

  private async initializeRedis(): Promise<void> {
    try {
      this.redis = new Redis({
        host: this.options.host,
        port: this.options.port,
        password: this.options.password,
        db: this.options.database,
        maxRetriesPerRequest: this.options.maxRetriesPerRequest,
        lazyConnect: this.options.lazyConnect,
        connectTimeout: 10000,
        commandTimeout: 5000,
        enableReadyCheck: true
      });

      // Event handlers
      this.redis.on('connect', () => {
        console.log('Redis client connected');
        this.healthStatus.connected = true;
        this.healthStatus.errorCount = 0;
      });

      this.redis.on('ready', () => {
        console.log('Redis client ready');
        this.healthStatus.connected = true;
        this.healthStatus.lastCheck = Date.now();
        console.log('Health status updated to connected');
        
        // Start health checks only after connection is ready
        this.startHealthChecks();
        
        // Perform immediate health check to populate status
        this.performHealthCheck();
      });

      this.redis.on('error', (error) => {
        console.error('Redis client error:', error);
        this.healthStatus.connected = false;
        this.healthStatus.errorCount++;
        this.healthStatus.lastError = error.message;
        this.healthStatus.lastCheck = Date.now();
      });

      this.redis.on('close', () => {
        console.log('Redis client connection closed');
        this.healthStatus.connected = false;
      });

      this.redis.on('reconnecting', () => {
        console.log('Redis client reconnecting...');
      });

      // Connect if not lazy
      if (!this.options.lazyConnect) {
        await this.redis.connect();
      }

    } catch (error) {
      console.error('Failed to initialize Redis client:', error);
      this.healthStatus.connected = false;
      this.healthStatus.lastError = error instanceof Error ? error.message : 'Unknown error';
    }
  }

  private startHealthChecks(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthCheck();
    }, this.options.healthCheckInterval);
  }

  private async performHealthCheck(): Promise<void> {
    if (!this.redis) {
      this.healthStatus.connected = false;
      return;
    }

    const startTime = Date.now();
    
    try {
      const result = await this.redis.ping();
      const responseTime = Date.now() - startTime;
      
      this.healthStatus.connected = result === 'PONG';
      this.healthStatus.responseTime = responseTime;
      this.healthStatus.lastCheck = Date.now();
      
      if (!this.healthStatus.connected) {
        console.warn('Redis health check failed: unexpected response', result);
      }
    } catch (error) {
      this.healthStatus.connected = false;
      this.healthStatus.errorCount++;
      this.healthStatus.lastError = error instanceof Error ? error.message : 'Unknown';
      this.healthStatus.lastCheck = Date.now();
      console.error('Redis health check failed:', error);
    }
  }

  /**
   * Get Redis client instance
   * Returns null if Redis is not available
   */
  getClient(): Redis | null {
    return this.redis && this.healthStatus.connected ? this.redis : null;
  }

  /**
   * Check if Redis is available
   */
  isAvailable(): boolean {
    return this.healthStatus.connected && this.redis !== null;
  }

  /**
   * Get health status
   */
  getHealthStatus(): RedisHealthStatus {
    return { ...this.healthStatus };
  }

  /**
   * Execute command with fallback
   */
  async executeWithFallback<T>(
    command: (redis: Redis) => Promise<T>,
    fallback: () => Promise<T>
  ): Promise<T> {
    if (!this.isAvailable()) {
      console.warn('Redis not available, using fallback');
      return fallback();
    }

    try {
      return await command(this.redis!);
    } catch (error) {
      console.error('Redis command failed, using fallback:', error);
      return fallback();
    }
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    if (this.redis) {
      await this.redis.quit();
      this.redis = null;
    }

    this.healthStatus.connected = false;
    console.log('Redis client shutdown complete');
  }

  /**
   * Force reconnection
   */
  async reconnect(): Promise<void> {
    if (this.redis) {
      await this.redis.disconnect();
    }
    
    await this.initializeRedis();
  }
}

// Singleton instance for shared usage
let redisClientInstance: RedisClient | null = null;

export function getRedisClient(options?: RedisClientOptions): RedisClient {
  if (!redisClientInstance) {
    redisClientInstance = new RedisClient(options);
  }
  return redisClientInstance;
}

export async function shutdownRedisClient(): Promise<void> {
  if (redisClientInstance) {
    await redisClientInstance.shutdown();
    redisClientInstance = null;
  }
}
