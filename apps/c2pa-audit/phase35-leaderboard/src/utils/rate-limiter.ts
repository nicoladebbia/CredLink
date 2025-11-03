/**
 * Phase 35 Leaderboard - Rate Limiting
 * Advanced rate limiting with Redis backend
 */

import { Redis } from 'ioredis';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (request: any) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

export class RateLimiter {
  private redis: Redis;
  private config: RateLimitConfig;

  constructor(redis: Redis, config: RateLimitConfig) {
    this.redis = redis;
    this.config = config;
  }

  /**
   * Check if request is allowed
   */
  async isAllowed(key: string): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    // Use a sorted set for sliding window
    const redisKey = `rate_limit:${key}`;
    
    // Remove old entries
    await this.redis.zremrangebyscore(redisKey, 0, windowStart);
    
    // Count current requests
    const currentRequests = await this.redis.zcard(redisKey);
    
    if (currentRequests >= this.config.maxRequests) {
      // Get oldest request to calculate reset time
      const oldest = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
      const resetTime = oldest.length > 1 ? parseInt(oldest[1] || '0') + this.config.windowMs : now + this.config.windowMs;
      
      return {
        allowed: false,
        remaining: 0,
        resetTime
      };
    }
    
    // Add current request
    await this.redis.zadd(redisKey, now, `${now}-${Math.random()}`);
    
    // Set expiration
    await this.redis.expire(redisKey, Math.ceil(this.config.windowMs / 1000));
    
    return {
      allowed: true,
      remaining: this.config.maxRequests - currentRequests - 1,
      resetTime: now + this.config.windowMs
    };
  }

  /**
   * Reset rate limit for a key
   */
  async reset(key: string): Promise<void> {
    await this.redis.del(`rate_limit:${key}`);
  }

  /**
   * Get current rate limit status
   */
  async getStatus(key: string): Promise<{ current: number; remaining: number; resetTime: number }> {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    const redisKey = `rate_limit:${key}`;
    
    // Remove old entries
    await this.redis.zremrangebyscore(redisKey, 0, windowStart);
    
    // Count current requests
    const currentRequests = await this.redis.zcard(redisKey);
    
    // Get oldest request
    const oldest = await this.redis.zrange(redisKey, 0, 0, 'WITHSCORES');
    const resetTime = oldest.length > 1 ? parseInt(oldest[1] || '0') + this.config.windowMs : now + this.config.windowMs;
    
    return {
      current: currentRequests,
      remaining: Math.max(0, this.config.maxRequests - currentRequests),
      resetTime
    };
  }
}

/**
 * Create rate limiter middleware for Fastify
 */
export function createRateLimitMiddleware(redis: Redis, config: RateLimitConfig) {
  const rateLimiter = new RateLimiter(redis, config);
  
  return async (request: any, reply: any) => {
    const key = config.keyGenerator ? config.keyGenerator(request) : request.ip;
    
    const result = await rateLimiter.isAllowed(key);
    
    // Set rate limit headers
    reply.header('X-RateLimit-Limit', config.maxRequests);
    reply.header('X-RateLimit-Remaining', result.remaining);
    reply.header('X-RateLimit-Reset', new Date(result.resetTime).toISOString());
    
    if (!result.allowed) {
      reply.code(429);
      reply.send({
        error: 'Too Many Requests',
        message: 'Rate limit exceeded',
        retryAfter: Math.ceil((result.resetTime - Date.now()) / 1000)
      });
      return reply;
    }
  };
}
