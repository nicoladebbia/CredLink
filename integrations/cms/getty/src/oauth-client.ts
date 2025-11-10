/**
 * Phase 19: Getty Adapter - OAuth and Rate Limiting Handler
 * Implements OAuth 2.0 flow and 429 backoff with exponential jitter
 */

import fetch from 'node-fetch';
import { 
  GettyApiConfig, 
  GettyTokenResponse, 
  GettyRateLimitHeaders,
  GettySyncState 
} from './types.js';

export class GettyOAuthClient {
  private config: GettyApiConfig;
  private accessToken: string | null = null;
  private tokenExpiry: number = 0;
  private requestCount: number = 0;
  private windowStart: number = Date.now();
  private backoffUntil: number = 0;
  private readonly MAX_RETRIES = 3;
  private readonly BASE_TIMEOUT = 10000;
  private readonly MAX_BACKOFF = 8000;

  constructor(config: GettyApiConfig) {
    this.validateConfig(config);
    this.config = config;
  }

  /**
   * Validate OAuth configuration
   */
  private validateConfig(config: GettyApiConfig): void {
    if (!config.oauth?.client_id || !config.oauth?.client_secret) {
      throw new Error('OAuth client credentials are required');
    }
    
    if (!config.oauth?.token_url || !this.isValidHttpsUrl(config.oauth.token_url)) {
      throw new Error('Valid HTTPS token URL is required');
    }
    
    if (!config.rate_limits?.requests_per_minute || config.rate_limits.requests_per_minute <= 0) {
      throw new Error('Valid rate limit configuration is required');
    }
  }

  /**
   * Get OAuth 2.0 access token with automatic refresh
   */
  async getAccessToken(): Promise<string> {
    // Return cached token if valid
    if (this.accessToken && Date.now() < this.tokenExpiry) {
      return this.accessToken;
    }

    // Get new token with secure TLS verification
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.BASE_TIMEOUT);
    
    try {
      const response = await fetch(this.config.oauth.token_url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'User-Agent': 'CredLink-Connectors/1.0',
          'Accept': 'application/json'
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: this.config.oauth.client_id,
          client_secret: this.config.oauth.client_secret,
          scope: this.config.oauth.scope?.join(' ') || ''
        }),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Getty OAuth failed: ${response.status} ${response.statusText}`);
      }

      const tokenData: GettyTokenResponse = await this.parseJsonResponse(response);
      
      if (!tokenData.access_token || !tokenData.expires_in) {
        throw new Error('Invalid token response from Getty OAuth');
      }
      
      this.accessToken = tokenData.access_token;
      this.tokenExpiry = Date.now() + (tokenData.expires_in * 1000) - 60000; // Refresh 1 min early

      return this.accessToken;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Getty OAuth request timed out');
      }
      throw error;
    }
  }

  /**
   * Check if we're currently in backoff due to rate limiting
   */
  private async checkRateLimit(): Promise<void> {
    const now = Date.now();
    
    // Check backoff
    if (now < this.backoffUntil) {
      const waitTime = this.backoffUntil - now;
      console.log(`Getty rate limit backoff: waiting ${waitTime}ms`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }

    // Check per-minute rate limit
    const windowElapsed = now - this.windowStart;
    if (windowElapsed > 60000) {
      this.requestCount = 0;
      this.windowStart = now;
    }

    if (this.requestCount >= this.config.rate_limits.requests_per_minute) {
      const waitTime = 60000 - windowElapsed;
      console.log(`Getty rate limit: waiting ${waitTime}ms for next window`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      this.requestCount = 0;
      this.windowStart = Date.now();
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
      
      console.log(`Getty 429 rate limit: backing off for ${retryAfter}ms (attempt ${attempt})`);
      await new Promise(resolve => setTimeout(resolve, retryAfter));
      
      throw new Error('RATE_LIMIT_RETRY');
    }

    // Update counters on success
    this.requestCount++;
  }

  /**
   * Extract rate limit headers from response
   */
  private extractRateLimitHeaders(headers: Headers): GettyRateLimitHeaders {
    return {
      'x-ratelimit-limit': this.sanitizeHeaderValue(headers.get('x-ratelimit-limit')),
      'x-ratelimit-remaining': this.sanitizeHeaderValue(headers.get('x-ratelimit-remaining')),
      'x-ratelimit-reset': this.sanitizeHeaderValue(headers.get('x-ratelimit-reset')),
      'retry-after': headers.get('retry-after') || undefined
    };
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  private calculateRetryAfter(headers: GettyRateLimitHeaders, attempt: number): number {
    // Use provider's retry-after if available
    if (headers['retry-after']) {
      const retryAfter = parseInt(headers['retry-after']);
      if (!isNaN(retryAfter) && retryAfter > 0) {
        return Math.min(retryAfter * 1000, this.MAX_BACKOFF * 1000); // Convert to milliseconds
      }
    }

    // Exponential backoff: 250ms * 2^attempt + jitter, max 8 seconds
    const baseDelay = 250 * Math.pow(2, attempt);
    const jitter = Math.random() * 100;
    return Math.min(this.MAX_BACKOFF, baseDelay + jitter);
  }

  /**
   * Make authenticated API request with rate limiting and retry logic
   */
  async makeRequest<T = any>(
    url: string, 
    options: RequestInit = {},
    maxRetries: number = this.MAX_RETRIES
  ): Promise<T> {
    if (!url || !this.isValidHttpsUrl(url)) {
      throw new Error('Valid HTTPS URL is required');
    }

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.checkRateLimit();

        const token = await this.getAccessToken();
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.BASE_TIMEOUT);
        
        try {
          const response = await fetch(url, {
            ...options,
            headers: {
              'Authorization': `Bearer ${token}`,
              'Content-Type': 'application/json',
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
            const retryDelay = Math.min(this.MAX_BACKOFF, 250 * Math.pow(2, attempt) + Math.random() * 100);
            console.log(`Getty ${response.status} error: retrying in ${retryDelay}ms (attempt ${attempt})`);
            await new Promise(resolve => setTimeout(resolve, retryDelay));
            continue;
          }

          if (!response.ok) {
            throw new Error(`Getty API error: ${response.status} ${response.statusText}`);
          }

          return await this.parseJsonResponse(response) as T;

        } catch (fetchError) {
          clearTimeout(timeoutId);
          if (fetchError instanceof Error && fetchError.name === 'AbortError') {
            throw new Error('Getty API request timed out');
          }
          throw fetchError;
        }

      } catch (error) {
        lastError = error as Error;
        
        // Don't retry on rate limit errors (they're handled above)
        if (error instanceof Error && error.message === 'RATE_LIMIT_RETRY') {
          continue;
        }

        // Don't retry on client errors (4xx) or authentication errors
        if (error instanceof Error && (error.message.includes('401') || error.message.includes('403'))) {
          break;
        }

        // Retry on other errors
        if (attempt < maxRetries) {
          const retryDelay = Math.min(this.MAX_BACKOFF, 250 * Math.pow(2, attempt) + Math.random() * 100);
          console.log(`Getty request failed: retrying in ${retryDelay}ms (attempt ${attempt})`, error);
          await new Promise(resolve => setTimeout(resolve, retryDelay));
        }
      }
    }

    throw lastError || new Error('Getty API request failed after retries');
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): {
    requests_used: number;
    requests_limit: number;
    window_elapsed: number;
    backoff_remaining: number;
  } {
    const now = Date.now();
    return {
      requests_used: this.requestCount,
      requests_limit: this.config.rate_limits.requests_per_minute,
      window_elapsed: now - this.windowStart,
      backoff_remaining: Math.max(0, this.backoffUntil - now)
    };
  }

  /**
   * Utility methods
   */

  private isValidHttpsUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private sanitizeHeaderValue(value: string | null): string {
    return value || '';
  }

  private async parseJsonResponse(response: any): Promise<any> {
    const text = await response.text();
    
    if (!text.trim()) {
      throw new Error('Empty response body');
    }
    
    try {
      return JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON response: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
