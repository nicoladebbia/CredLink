/**
 * @credlink/redis-lock
 * 
 * Distributed locking implementation using Redis for multi-instance deployments
 * Provides timeout-based locks with automatic cleanup and ownership tracking
 */

import Redis from 'ioredis';

export interface RedisLockOptions {
  redis: Redis;
  ttl?: number; // Time to live in milliseconds (default: 10 minutes)
  acquireTimeout?: number; // Max time to wait for lock (default: 30 seconds)
  retryDelay?: number; // Delay between retries (default: 100ms)
}

export interface LockInfo {
  owner: string;
  timestamp: number;
  ttl: number;
}

export class RedisLock {
  private redis: Redis;
  private ttl: number;
  private acquireTimeout: number;
  private retryDelay: number;

  constructor(options: RedisLockOptions) {
    this.redis = options.redis;
    this.ttl = options.ttl || 10 * 60 * 1000; // 10 minutes default
    this.acquireTimeout = options.acquireTimeout || 30 * 1000; // 30 seconds default
    this.retryDelay = options.retryDelay || 100; // 100ms default
  }

  /**
   * Acquire a distributed lock
   */
  async acquire(key: string, owner?: string): Promise<boolean> {
    const lockOwner = owner || this.generateOwnerId();
    const lockInfo: LockInfo = {
      owner: lockOwner,
      timestamp: Date.now(),
      ttl: this.ttl
    };

    const lockKey = `lock:${key}`;
    const lockValue = JSON.stringify(lockInfo);

    const startTime = Date.now();

    while (Date.now() - startTime < this.acquireTimeout) {
      try {
        // Try to acquire lock with NX (only if not exists) and PX (expire in milliseconds)
        const result = await this.redis.set(lockKey, lockValue, 'PX', this.ttl, 'NX');
        
        if (result === 'OK') {
          console.log(`Redis lock acquired: ${key} by ${lockOwner}`);
          return true;
        }

        // Check if lock is expired and cleanup
        await this.cleanupExpiredLock(key);

        // Wait before retrying with exponential backoff
        const elapsed = Date.now() - startTime;
        const backoffTime = Math.min(this.retryDelay * Math.pow(2, elapsed / 1000), 1000);
        await new Promise(resolve => setTimeout(resolve, backoffTime));
      } catch (error) {
        console.error(`Redis lock acquisition error for ${key}:`, error);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
      }
    }

    console.warn(`Failed to acquire Redis lock: ${key} by ${lockOwner} (timeout)`);
    return false;
  }

  /**
   * Release a distributed lock
   */
  async release(key: string, owner?: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    
    try {
      // Use Lua script for atomic check-and-delete
      const luaScript = `
        local lockKey = KEYS[1]
        local expectedOwner = ARGV[1]
        
        local lockInfo = redis.call('GET', lockKey)
        if not lockInfo then
          return 0
        end
        
        local lock = cjson.decode(lockInfo)
        if expectedOwner and lock.owner ~= expectedOwner then
          return -1 -- Not the owner
        end
        
        redis.call('DEL', lockKey)
        return 1
      `;

      const result = await this.redis.eval(luaScript, 1, lockKey, owner || '') as number;
      
      if (result === 1) {
        console.log(`Redis lock released: ${key} by ${owner || 'any'}`);
        return true;
      } else if (result === -1) {
        console.warn(`Attempted to release Redis lock not owned: ${key} by ${owner}`);
        return false;
      } else {
        console.warn(`Attempted to release non-existent Redis lock: ${key}`);
        return false;
      }
    } catch (error) {
      console.error(`Redis lock release error for ${key}:`, error);
      return false;
    }
  }

  /**
   * Check if a lock exists and is valid
   */
  async isLocked(key: string): Promise<boolean> {
    const lockKey = `lock:${key}`;
    
    try {
      const lockInfo = await this.redis.get(lockKey);
      if (!lockInfo) {
        return false;
      }

      const lock: LockInfo = JSON.parse(lockInfo);
      
      // Check if lock is expired
      if (Date.now() - lock.timestamp > lock.ttl) {
        await this.redis.del(lockKey);
        return false;
      }

      return true;
    } catch (error) {
      console.error(`Redis lock check error for ${key}:`, error);
      return false;
    }
  }

  /**
   * Get lock information
   */
  async getLockInfo(key: string): Promise<LockInfo | null> {
    const lockKey = `lock:${key}`;
    
    try {
      const lockInfo = await this.redis.get(lockKey);
      if (!lockInfo) {
        return null;
      }

      const lock: LockInfo = JSON.parse(lockInfo);
      
      // Check if lock is expired
      if (Date.now() - lock.timestamp > lock.ttl) {
        await this.redis.del(lockKey);
        return null;
      }

      return lock;
    } catch (error) {
      console.error(`Redis lock info error for ${key}:`, error);
      return null;
    }
  }

  /**
   * Force cleanup expired locks
   */
  async cleanupExpiredLock(key: string): Promise<void> {
    const lockKey = `lock:${key}`;
    
    try {
      const lockInfo = await this.redis.get(lockKey);
      if (!lockInfo) {
        return;
      }

      const lock: LockInfo = JSON.parse(lockInfo);
      
      if (Date.now() - lock.timestamp > lock.ttl) {
        await this.redis.del(lockKey);
        console.log(`Cleaned up expired Redis lock: ${key} (owner: ${lock.owner})`);
      }
    } catch (error) {
      console.error(`Redis lock cleanup error for ${key}:`, error);
    }
  }

  /**
   * Cleanup all expired locks (maintenance operation)
   */
  async cleanupAllExpired(): Promise<number> {
    try {
      const pattern = 'lock:*';
      const keys = await this.redis.keys(pattern);
      let cleanedCount = 0;

      for (const key of keys) {
        const lockKey = key.replace('lock:', '');
        const lockInfo = await this.redis.get(key);
        
        if (lockInfo) {
          try {
            const lock: LockInfo = JSON.parse(lockInfo);
            if (Date.now() - lock.timestamp > lock.ttl) {
              await this.redis.del(key);
              cleanedCount++;
            }
          } catch {
            // Invalid lock format, delete it
            await this.redis.del(key);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        console.log(`Redis lock cleanup: removed ${cleanedCount} expired locks`);
      }

      return cleanedCount;
    } catch (error) {
      console.error('Redis lock cleanup error:', error);
      return 0;
    }
  }

  /**
   * Execute a function with a lock
   */
  async withLock<T>(
    key: string, 
    fn: () => Promise<T>, 
    owner?: string
  ): Promise<T | null> {
    const lockOwner = owner || this.generateOwnerId();
    
    const acquired = await this.acquire(key, lockOwner);
    if (!acquired) {
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.release(key, lockOwner);
    }
  }

  private generateOwnerId(): string {
    return `${process.pid}-${Date.now()}-${Math.random().toString(36).substring(2)}`;
  }
}
