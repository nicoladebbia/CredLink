/**
 * Token Blacklist Service
 * Critical for JWT revocation and session management
 */

export interface TokenBlacklistEntry {
  jti: string;
  userId: string;
  revokedAt: string;
  reason: string;
  expiresAt: string;
}

export interface TokenBlacklistStore {
  add(entry: TokenBlacklistEntry): Promise<void>;
  isRevoked(jti: string): Promise<boolean>;
  remove(jti: string): Promise<void>;
  cleanup(): Promise<void>;
}

/**
 * Redis-based token blacklist implementation
 */
export class RedisTokenBlacklist implements TokenBlacklistStore {
  constructor(private redis: any) {}

  async add(entry: TokenBlacklistEntry): Promise<void> {
    const key = `blacklist:${entry.jti}`;
    const value = JSON.stringify(entry);
    
    // Store with expiration matching token expiration
    const ttl = Math.max(0, Math.floor((new Date(entry.expiresAt).getTime() - Date.now()) / 1000));
    
    await this.redis.setex(key, ttl, value);
  }

  async isRevoked(jti: string): Promise<boolean> {
    const key = `blacklist:${jti}`;
    const exists = await this.redis.exists(key);
    return exists === 1;
  }

  async remove(jti: string): Promise<void> {
    const key = `blacklist:${jti}`;
    await this.redis.del(key);
  }

  async cleanup(): Promise<void> {
    // Redis handles expiration automatically
    // This method exists for interface compatibility
  }
}

/**
 * In-memory fallback implementation (DEVELOPMENT ONLY)
 */
export class MemoryTokenBlacklist implements TokenBlacklistStore {
  private blacklist = new Map<string, TokenBlacklistEntry>();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  async add(entry: TokenBlacklistEntry): Promise<void> {
    this.blacklist.set(entry.jti, entry);
  }

  async isRevoked(jti: string): Promise<boolean> {
    const entry = this.blacklist.get(jti);
    if (!entry) return false;

    // Check if expired
    if (new Date() > new Date(entry.expiresAt)) {
      this.blacklist.delete(jti);
      return false;
    }

    return true;
  }

  async remove(jti: string): Promise<void> {
    this.blacklist.delete(jti);
  }

  async cleanup(): Promise<void> {
    const now = new Date();
    for (const [jti, entry] of this.blacklist.entries()) {
      if (now > new Date(entry.expiresAt)) {
        this.blacklist.delete(jti);
      }
    }
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
  }
}

/**
 * Token Blacklist Service
 */
export class TokenBlacklistService {
  private store: TokenBlacklistStore;

  constructor(store: TokenBlacklistStore) {
    this.store = store;
  }

  async revokeToken(
    jti: string, 
    userId: string, 
    reason: string = 'User logout',
    expiresAt?: string
  ): Promise<void> {
    const entry: TokenBlacklistEntry = {
      jti,
      userId,
      revokedAt: new Date().toISOString(),
      reason,
      expiresAt: expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() // Default 24 hours
    };

    await this.store.add(entry);
  }

  async revokeAllUserTokens(userId: string, reason: string = 'Security action'): Promise<void> {
    // This would require tracking all active tokens for a user
    // For now, we'll implement a user-specific blacklist
    const entry: TokenBlacklistEntry = {
      jti: `user:${userId}:*`, // Special pattern for user-wide revocation
      userId,
      revokedAt: new Date().toISOString(),
      reason,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
    };

    await this.store.add(entry);
  }

  async isTokenRevoked(jti: string, userId?: string): Promise<boolean> {
    // Check specific token
    if (await this.store.isRevoked(jti)) {
      return true;
    }

    // Check user-wide revocation
    if (userId && await this.store.isRevoked(`user:${userId}:*`)) {
      return true;
    }

    return false;
  }

  async cleanup(): Promise<void> {
    return this.store.cleanup();
  }

  async getRevokedTokensCount(): Promise<number> {
    // Implementation depends on store type
    return 0;
  }
}

/**
 * Create token blacklist service based on environment
 */
export function createTokenBlacklistService(): TokenBlacklistService {
  let store: TokenBlacklistStore;

  if (process.env.REDIS_URL) {
    // Use Redis in production
    const Redis = require('redis');
    const redis = Redis.createClient({ url: process.env.REDIS_URL });
    store = new RedisTokenBlacklist(redis);
  } else {
    // Use memory store for development
    console.warn('⚠️  Using in-memory token blacklist - NOT SUITABLE FOR PRODUCTION');
    store = new MemoryTokenBlacklist();
  }

  return new TokenBlacklistService(store);
}

/**
 * Global token blacklist instance
 */
export const tokenBlacklist = createTokenBlacklistService();
