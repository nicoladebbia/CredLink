/**
 * Phase 6 - Optimizer Auto-Fallback: Rate Limiter
 * Prevents abuse and DOS attacks
 */

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  skipSuccessfulRequests: boolean;
  skipFailedRequests: boolean;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  totalHits: number;
}

export class RateLimiter {
  private config: RateLimitConfig;
  private store: Map<string, { count: number; resetTime: number }>;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.store = new Map();
    
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60000);
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    const windowStart = now - this.config.windowMs;
    
    let entry = this.store.get(key);
    
    if (!entry || entry.resetTime <= now) {
      entry = { count: 0, resetTime: now + this.config.windowMs };
      this.store.set(key, entry);
    }
    
    entry.count++;
    
    const allowed = entry.count <= this.config.maxRequests;
    const remaining = Math.max(0, this.config.maxRequests - entry.count);
    
    return {
      allowed,
      remaining,
      resetTime: entry.resetTime,
      totalHits: entry.count
    };
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime <= now) {
        this.store.delete(key);
      }
    }
  }

  // Generate rate limit key from request
  static getKey(request: Request): string {
    const url = new URL(request.url);
    const ip = request.headers.get('CF-Connecting-IP') || 
               request.headers.get('X-Forwarded-For') || 
               'unknown';
    return `${ip}:${url.pathname}`;
  }

  // Rate limit middleware for Workers
  static middleware(config: RateLimitConfig) {
    const limiter = new RateLimiter(config);
    
    return (request: Request): RateLimitResult => {
      const key = RateLimiter.getKey(request);
      return limiter.check(key);
    };
  }
}

// Default rate limit configurations
export const RATE_LIMITS = {
  // API endpoints: 100 requests per minute
  API: {
    windowMs: 60000,
    maxRequests: 100,
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  
  // Admin endpoints: 10 requests per minute
  ADMIN: {
    windowMs: 60000,
    maxRequests: 10,
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  },
  
  // General traffic: 1000 requests per minute
  GENERAL: {
    windowMs: 60000,
    maxRequests: 1000,
    skipSuccessfulRequests: false,
    skipFailedRequests: false
  }
} as const;
