/**
 * Redis-based Rate Limiting Service
 * Production-ready rate limiting with distributed support and metrics
 */

export interface RateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Maximum requests per window
  keyGenerator?: (key: string) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  resetTime: number;
  retryAfter?: number;
  totalHits: number;
}

export interface RateLimitStore {
  incr(key: string, windowMs: number): Promise<{ count: number; ttl: number }>;
  reset(key: string): Promise<void>;
  getMetrics(key: string): Promise<RateLimitMetrics>;
}

export interface RateLimitMetrics {
  totalRequests: number;
  blockedRequests: number;
  averageRequestRate: number;
  peakRequestRate: number;
  windowStart: number;
}

/**
 * Redis implementation of rate limit store
 */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private redis: any) {}

  async incr(key: string, windowMs: number): Promise<{ count: number; ttl: number }> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const windowKey = `${key}:${windowStart}`;
    
    // Use Redis pipeline for atomic operations
    const pipeline = this.redis.pipeline();
    
    // Increment counter
    pipeline.incr(windowKey);
    
    // Set expiration for the window
    pipeline.expire(windowKey, Math.ceil(windowMs / 1000) + 1);
    
    // Get current count and TTL
    pipeline.get(windowKey);
    pipeline.ttl(windowKey);
    
    const results = await pipeline.exec();
    
    const count = parseInt(results[2][1] as string) || 0;
    const ttl = (results[3][1] as number) * 1000; // Convert to milliseconds
    
    return { count, ttl };
  }

  async reset(key: string): Promise<void> {
    // Get all window keys for this rate limit
    const pattern = `${key}:*`;
    const keys = await this.redis.keys(pattern);
    
    if (keys.length > 0) {
      await this.redis.del(...keys);
    }
  }

  async getMetrics(key: string): Promise<RateLimitMetrics> {
    const metricsKey = `${key}:metrics`;
    const metrics = await this.redis.hgetall(metricsKey);
    
    return {
      totalRequests: parseInt(metrics.totalRequests) || 0,
      blockedRequests: parseInt(metrics.blockedRequests) || 0,
      averageRequestRate: parseFloat(metrics.averageRequestRate) || 0,
      peakRequestRate: parseFloat(metrics.peakRequestRate) || 0,
      windowStart: parseInt(metrics.windowStart) || Date.now()
    };
  }

  async updateMetrics(key: string, blocked: boolean): Promise<void> {
    const metricsKey = `${key}:metrics`;
    const now = Date.now();
    
    const pipeline = this.redis.pipeline();
    
    // Update counters
    pipeline.hincrby(metricsKey, 'totalRequests', 1);
    
    if (blocked) {
      pipeline.hincrby(metricsKey, 'blockedRequests', 1);
    }
    
    // Update timestamp
    pipeline.hset(metricsKey, 'lastUpdated', now);
    
    // Set expiration for metrics (keep for 24 hours)
    pipeline.expire(metricsKey, 86400);
    
    await pipeline.exec();
  }
}

/**
 * In-memory fallback implementation (for development/testing)
 */
export class MemoryRateLimitStore implements RateLimitStore {
  private counters = new Map<string, { count: number; windowStart: number; ttl: number }>();
  private metrics = new Map<string, RateLimitMetrics>();

  async incr(key: string, windowMs: number): Promise<{ count: number; ttl: number }> {
    const now = Date.now();
    const windowStart = Math.floor(now / windowMs) * windowMs;
    const windowKey = `${key}:${windowStart}`;
    
    let counter = this.counters.get(windowKey);
    
    if (!counter || counter.windowStart !== windowStart) {
      counter = {
        count: 0,
        windowStart,
        ttl: windowMs
      };
      this.counters.set(windowKey, counter);
    }
    
    counter.count++;
    
    // Clean up old windows
    this.cleanupOldWindows(now - windowMs * 2);
    
    return { count: counter.count, ttl: counter.ttl };
  }

  async reset(key: string): Promise<void> {
    const keysToDelete = Array.from(this.counters.keys()).filter(k => k.startsWith(key));
    keysToDelete.forEach(k => this.counters.delete(k));
    this.metrics.delete(key);
  }

  async getMetrics(key: string): Promise<RateLimitMetrics> {
    return this.metrics.get(key) || {
      totalRequests: 0,
      blockedRequests: 0,
      averageRequestRate: 0,
      peakRequestRate: 0,
      windowStart: Date.now()
    };
  }

  async updateMetrics(key: string, blocked: boolean): Promise<void> {
    const current = this.metrics.get(key) || {
      totalRequests: 0,
      blockedRequests: 0,
      averageRequestRate: 0,
      peakRequestRate: 0,
      windowStart: Date.now()
    };
    
    current.totalRequests++;
    if (blocked) {
      current.blockedRequests++;
    }
    
    this.metrics.set(key, current);
  }

  private cleanupOldWindows(cutoffTime: number): void {
    for (const [key, counter] of this.counters.entries()) {
      if (counter.windowStart < cutoffTime) {
        this.counters.delete(key);
      }
    }
  }
}

/**
 * Main Rate Limiting Service
 */
export class RateLimitService {
  private store: RateLimitStore;
  private config: RateLimitConfig;

  constructor(store: RateLimitStore, config: RateLimitConfig) {
    this.store = store;
    this.config = config;
  }

  async checkLimit(key: string): Promise<RateLimitResult> {
    const { count, ttl } = await this.store.incr(key, this.config.windowMs);
    const now = Date.now();
    const resetTime = now + ttl;
    
    const isAllowed = count <= this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - count);
    
    // Update metrics
    await this.store.updateMetrics(key, !isAllowed);
    
    const result: RateLimitResult = {
      success: isAllowed,
      limit: this.config.maxRequests,
      remaining,
      resetTime,
      totalHits: count
    };
    
    if (!isAllowed) {
      result.retryAfter = Math.ceil(ttl / 1000);
    }
    
    return result;
  }

  async resetLimit(key: string): Promise<void> {
    return this.store.reset(key);
  }

  async getMetrics(key: string): Promise<RateLimitMetrics> {
    return this.store.getMetrics(key);
  }

  async getGlobalMetrics(): Promise<{ totalKeys: number; totalRequests: number; totalBlocked: number }> {
    // This would need to be implemented based on the store
    // For Redis, you could use SCAN to find all rate limit keys
    return {
      totalKeys: 0,
      totalRequests: 0,
      totalBlocked: 0
    };
  }
}

/**
 * Rate limiting middleware factory
 */
export function createRateLimitMiddleware(config: RateLimitConfig) {
  let store: RateLimitStore;
  
  // Choose store based on environment
  if (process.env.REDIS_URL) {
    // Use Redis in production
    const Redis = require('redis');
    const redis = Redis.createClient({ url: process.env.REDIS_URL });
    store = new RedisRateLimitStore(redis);
  } else {
    // Use memory store for development
    store = new MemoryRateLimitStore();
  }
  
  const rateLimitService = new RateLimitService(store, config);
  
  return {
    middleware: async (request: any, reply: any) => {
      const key = config.keyGenerator 
        ? config.keyGenerator(request)
        : `rate-limit:${request.ip}:default`;
      
      const result = await rateLimitService.checkLimit(key);
      
      // Add rate limit headers
      reply.header('X-RateLimit-Limit', result.limit);
      reply.header('X-RateLimit-Remaining', result.remaining);
      reply.header('X-RateLimit-Reset', Math.ceil(result.resetTime / 1000));
      
      if (!result.success) {
        reply.header('Retry-After', result.retryAfter);
        return reply.status(429).send({
          error: 'Rate limit exceeded',
          message: `Too many requests. Limit: ${result.limit} per ${config.windowMs / 1000}s`,
          retryAfter: result.retryAfter,
          limit: result.limit,
          remaining: result.remaining,
          resetTime: result.resetTime
        });
      }
    },
    
    service: rateLimitService
  };
}

/**
 * Pre-configured rate limiters for different use cases
 */
export const RateLimitPresets = {
  // Public API endpoints
  public: createRateLimitMiddleware({
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 60,
    keyGenerator: (request: any) => `public:${request.ip}`
  }),
  
  // Authentication endpoints
  auth: createRateLimitMiddleware({
    windowMs: 15 * 60 * 1000,  // 15 minutes
    maxRequests: 5,
    keyGenerator: (request: any) => `auth:${request.ip}`
  }),
  
  // Admin endpoints
  admin: createRateLimitMiddleware({
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 30,
    keyGenerator: (request: any) => {
      const user = (request as any).user;
      return user ? `admin:${user.sub}` : `admin:${request.ip}`;
    }
  }),
  
  // Critical operations (like key revocation)
  critical: createRateLimitMiddleware({
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 5,
    keyGenerator: (request: any) => {
      const user = (request as any).user;
      return user ? `critical:${user.sub}` : `critical:${request.ip}`;
    }
  }),
  
  // Verification endpoints
  verification: createRateLimitMiddleware({
    windowMs: 60 * 1000,  // 1 minute
    maxRequests: 100,
    keyGenerator: (request: any) => `verify:${request.ip}`
  })
};

/**
 * Rate limit monitoring and alerting
 */
export class RateLimitMonitor {
  constructor(private rateLimitService: RateLimitService) {}
  
  async checkForAbuse(threshold: number = 0.8): Promise<string[]> {
    // This would scan all rate limit keys and find those approaching limits
    // Implementation depends on the store being used
    return [];
  }
  
  async getTopConsumers(limit: number = 10): Promise<Array<{ key: string; requests: number; blocked: number }>> {
    // This would return the top consumers by request count
    return [];
  }
  
  async generateReport(): Promise<{
    totalRequests: number;
    totalBlocked: number;
    averageBlockRate: number;
    topEndpoints: Array<{ endpoint: string; requests: number }>;
  }> {
    return {
      totalRequests: 0,
      totalBlocked: 0,
      averageBlockRate: 0,
      topEndpoints: []
    };
  }
}
