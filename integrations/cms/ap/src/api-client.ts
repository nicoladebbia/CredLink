/**
 * Phase 19: AP Adapter - API Client with Quota Handling
 * Implements AP API authentication and rate limiting with quota management
 */

import fetch from 'node-fetch';
import { 
  APApiConfig, 
  APAssetResponse, 
  APSearchResponse,
  APRateLimitHeaders,
  APSyncState 
} from './types.js';

export class APApiClient {
  private config: APApiConfig;
  private requestCount: number = 0;
  private windowStart: number = Date.now();
  private backoffUntil: number = 0;
  private dailyRequestCount: number = 0;
  private dailyWindowStart: number = Date.now();

  constructor(config: APApiConfig) {
    this.config = config;
  }

  /**
   * Check if we're currently in backoff due to rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Check backoff
    if (now < this.backoffUntil) {
      const waitTime = this.backoffUntil - now;
      console.log(`AP rate limit backoff: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Check per-minute rate limit
    const minuteElapsed = now - this.windowStart;
    if (minuteElapsed > 60000) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    if (this.requestCount >= this.config.rate_limits.requests_per_minute) {
      const waitTime = 60000 - minuteElapsed;
      console.log(`AP rate limit: waiting ${waitTime}ms for next minute window`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.windowStart = Date.now();
    }

    // Check daily rate limit if specified
    if (this.config.rate_limits.daily_limit) {
      const dayElapsed = now - this.dailyWindowStart;
      if (dayElapsed > 86400000) { // 24 hours
        this.dailyRequestCount = 0;
        this.dailyWindowStart = now;
      }

      if (this.dailyRequestCount >= this.config.rate_limits.daily_limit) {
        const waitTime = 86400000 - dayElapsed;
        console.log(`AP daily rate limit: waiting ${waitTime}ms for next day`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        this.dailyRequestCount = 0;
        this.dailyWindowStart = Date.now();
      }
    }
  }

  /**
   * Handle rate limiting headers and 429 responses
   */
  private async handleRateLimitResponse(response: Response, attempt: number): Promise<void> {
    const rateLimitHeaders = this.extractRateLimitHeaders(response.headers);
    
    if (response.status === 429) {
      const retryAfter = this.calculateRetryAfter(rateLimitHeaders, attempt);
      this.backoffUntil = Date.now() + retryAfter;
      
      console.log(`AP 429 rate limit: backing off for ${retryAfter}ms (attempt ${attempt})`);
      await new Promise(resolve => setTimeout(resolve, retryAfter));
      
      throw new Error('RATE_LIMIT_RETRY');
    }

    // Update counters on success
    this.requestCount++;
    this.dailyRequestCount++;
  }

  /**
   * Extract rate limit headers from response
   */
  private extractRateLimitHeaders(headers: Headers): APRateLimitHeaders {
    return {
      'x-ratelimit-limit': headers.get('x-ratelimit-limit') || '',
      'x-ratelimit-remaining': headers.get('x-ratelimit-remaining') || '',
      'x-ratelimit-reset': headers.get('x-ratelimit-reset') || '',
      'retry-after': headers.get('retry-after') || undefined
    };
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryAfter(headers: APRateLimitHeaders, attempt: number): number {
    // Use provider's retry-after if available
    if (headers['retry-after']) {
      const retryAfter = parseInt(headers['retry-after']);
      if (!isNaN(retryAfter)) {
        return retryAfter * 1000; // Convert to milliseconds
      }
    }

    // Exponential backoff: 250ms * 2^attempt + jitter, max 8 seconds
    const baseDelay = 250 * Math.pow(2, attempt);
    const jitter = Math.random() * 100;
    return Math.min(8000, baseDelay + jitter);
  }

  /**
   * Make authenticated API request with rate limiting and retry logic
   */
  async makeRequest<T = any>(
    url: string, 
    options: RequestInit = {},
    maxRetries: number = 3
  ): Promise<T> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.checkRateLimit();

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
        
        const response = await fetch(url, {
          ...options,
          headers: {
            'X-Api-Key': this.config.api_key,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'User-Agent': 'CredLink-Connectors/1.0',
            ...options.headers
          },
          signal: controller.signal
        } as any);
        
        clearTimeout(timeoutId);

        // Handle rate limiting
        if (response.status === 429) {
          await this.handleRateLimitResponse(response as any, attempt);
          continue; // Retry after backoff
        }

        // Handle server errors with retry
        if (response.status >= 500 && attempt < maxRetries) {
          const retryDelay = Math.min(8000, 250 * Math.pow(2, attempt) + Math.random() * 100);
          console.log(`AP ${response.status} error: retrying in ${retryDelay}ms (attempt ${attempt})`);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }

        if (!response.ok) {
          throw new Error(`AP API error: ${response.status} ${response.statusText}`);
        }

        return await response.json() as T;

      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on rate limit errors (they're handled above)
        if (error instanceof Error && error.message === 'RATE_LIMIT_RETRY') {
          continue;
        }

        // Don't retry on client errors (4xx)
        if (error instanceof Error && error.message.includes('4')) {
          break;
        }

        // Retry on other errors
        if (attempt < maxRetries) {
          const retryDelay = Math.min(8000, 250 * Math.pow(2, attempt) + Math.random() * 100);
          console.log(`AP request failed: retrying in ${retryDelay}ms (attempt ${attempt})`, error);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw lastError || new Error('AP API request failed after retries');
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): {
    requests_used: number;
    requests_limit: number;
    minute_elapsed: number;
    daily_used: number;
    daily_limit?: number;
    day_elapsed: number;
    backoff_remaining: number;
  } {
    const now = Date.now();
    return {
      requests_used: this.requestCount,
      requests_limit: this.config.rate_limits.requests_per_minute,
      minute_elapsed: now - this.windowStart,
      daily_used: this.dailyRequestCount,
      daily_limit: this.config.rate_limits.daily_limit,
      day_elapsed: now - this.dailyWindowStart,
      backoff_remaining: Math.max(0, this.backoffUntil - now)
    };
  }

  /**
   * Check if we can make a request without hitting rate limits
   */
  canMakeRequest(): {
    can_request: boolean;
    reason?: string;
    wait_time_ms?: number;
  } {
    const now = Date.now();
    const status = this.getRateLimitStatus();

    // Check backoff
    if (status.backoff_remaining > 0) {
      return {
        can_request: false,
        reason: 'Rate limit backoff active',
        wait_time_ms: status.backoff_remaining
      };
    }

    // Check minute limit
    if (status.requests_used >= status.requests_limit) {
      const waitTime = 60000 - status.minute_elapsed;
      return {
        can_request: false,
        reason: 'Minute rate limit exceeded',
        wait_time_ms: waitTime
      };
    }

    // Check daily limit
    if (status.daily_limit && status.daily_used >= status.daily_limit) {
      const waitTime = 86400000 - status.day_elapsed;
      return {
        can_request: false,
        reason: 'Daily rate limit exceeded',
        wait_time_ms: waitTime
      };
    }

    return { can_request: true };
  }
}
