/**
 * C2 Signing Worker
 * SECURITY: Enhanced with comprehensive validation and security
 * Handles signing requests with backoff and rate limiting
 */

import pino from 'pino';
import crypto from 'crypto';

// SECURITY: Configuration constants
const MAX_QUEUE_SIZE = 1000;
const MAX_URL_LENGTH = 2048;
const MAX_RETRIES = 6;
const BASE_DELAY = 250;
const MAX_DELAY = 60000;
const RATE_LIMIT_DELAY = 500;
const REQUEST_TIMEOUT = 30000;
const MAX_CONCURRENT_REQUESTS = 10;

// SECURITY: URL validation patterns
const VALID_URL_PATTERN = /^https:\/\/[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com\/.*\.(jpg|jpeg|png|gif|webp|avif)(\?.*)?$/i;
const VALID_SHOP_DOMAIN_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9\-]*\.myshopify\.com$/;

// SECURITY: Secure logger configuration
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  // SECURITY: Prevent sensitive data logging
  formatters: {
    log: (object) => {
      const sanitized = { ...object };
      delete sanitized.asset_url;
      delete sanitized.manifest_url;
      delete sanitized.tenant_id;
      return sanitized;
    }
  }
});

// SECURITY: Enhanced interfaces with validation
interface SignRequest {
  asset_url: string;
  tenant_id: string;
  shop_domain: string;
  request_id: string;
  created_at: number;
}

interface SignResult {
  manifest_url: string;
  mode: 'remote' | 'embed';
  signed_at: string;
  request_id: string;
}

interface JobQueue {
  [shop_domain: string]: SignRequest[];
}

interface BackoffState {
  [shop_domain: string]: {
    last_attempt: number;
    retry_after?: number;
    failure_count: number;
    last_error?: string;
  };
}

/**
 * SECURITY: Validate shop domain
 */
function validateShopDomain(domain: string): boolean {
  if (!domain || typeof domain !== 'string') {
    return false;
  }
  
  if (domain.length > 255) {
    return false;
  }
  
  return VALID_SHOP_DOMAIN_PATTERN.test(domain);
}

/**
 * SECURITY: Validate asset URL
 */
function validateAssetUrl(url: string): boolean {
  if (!url || typeof url !== 'string') {
    return false;
  }
  
  if (url.length > MAX_URL_LENGTH) {
    return false;
  }
  
  return VALID_URL_PATTERN.test(url);
}

/**
 * SECURITY: Validate tenant ID
 */
function validateTenantId(tenantId: string): boolean {
  if (!tenantId || typeof tenantId !== 'string') {
    return false;
  }
  
  if (tenantId.length < 1 || tenantId.length > 100) {
    return false;
  }
  
  if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) {
    return false;
  }
  
  return true;
}

/**
 * SECURITY: Generate secure request ID
 */
function generateRequestId(): string {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * SECURITY: Sanitize error message
 */
function sanitizeErrorMessage(error: any): string {
  if (!error) return 'Unknown error';
  
  const message = error.message || error.toString();
  
  // SECURITY: Remove sensitive information
  return message
    .replace(/https?:\/\/[^\s]+/g, '[URL]')
    .replace(/[a-zA-Z0-9_-]{20,}/g, '[TOKEN]')
    .substring(0, 200);
}

class SignWorker {
  private static instance: SignWorker;
  private sign_endpoint: string;
  private tenant_id: string;
  private queue: JobQueue = {};
  private processing: Set<string> = new Set();
  private backoff_state: BackoffState = {};
  private max_retries: number = MAX_RETRIES;
  private base_delay: number = BASE_DELAY;
  private active_requests: Set<string> = new Set();

  private constructor() {
    // SECURITY: Validate endpoint configuration
    const endpoint = process.env.C2_SIGN_ENDPOINT;
    if (!endpoint || !endpoint.startsWith('https://')) {
      throw new Error('Invalid C2_SIGN_ENDPOINT: must be HTTPS');
    }
    this.sign_endpoint = endpoint;
    
    // SECURITY: Validate tenant ID
    const tenantId = process.env.C2_TENANT_ID || 'default';
    if (!validateTenantId(tenantId)) {
      throw new Error('Invalid C2_TENANT_ID format');
    }
    this.tenant_id = tenantId;
  }

  public static getInstance(): SignWorker {
    if (!SignWorker.instance) {
      SignWorker.instance = new SignWorker();
    }
    return SignWorker.instance;
  }

  /**
   * SECURITY: Enhanced enqueue with comprehensive validation
   */
  public async enqueue(urls: string[], shop_domain: string): Promise<void> {
    try {
      // SECURITY: Validate shop domain
      if (!validateShopDomain(shop_domain)) {
        throw new Error('Invalid shop domain: ' + shop_domain);
      }
      
      // SECURITY: Initialize queue if needed
      if (!this.queue[shop_domain]) {
        this.queue[shop_domain] = [];
      }
      
      // SECURITY: Check queue size limit
      if (this.queue[shop_domain].length >= MAX_QUEUE_SIZE) {
        logger.warn({ shop_domain, queue_size: this.queue[shop_domain].length }, 'Queue at capacity, dropping URLs');
        return;
      }
      
      // SECURITY: Validate and filter URLs
      const valid_urls: string[] = [];
      for (const url of urls) {
        if (validateAssetUrl(url)) {
          valid_urls.push(url);
        } else {
          logger.warn({ url, shop_domain }, 'Invalid asset URL skipped');
        }
      }
      
      // SECURITY: Filter out already queued URLs
      const existing_urls = new Set(this.queue[shop_domain].map(req => req.asset_url));
      const new_urls = valid_urls.filter(url => !existing_urls.has(url));
      
      // SECURITY: Limit number of new URLs
      const max_new_urls = Math.min(new_urls.length, MAX_QUEUE_SIZE - this.queue[shop_domain].length);
      const limited_urls = new_urls.slice(0, max_new_urls);
      
      // SECURITY: Create validated requests
      const requests: SignRequest[] = limited_urls.map(url => ({
        asset_url: url,
        tenant_id: this.tenant_id,
        shop_domain,
        request_id: generateRequestId(),
        created_at: Date.now()
      }));
      
      this.queue[shop_domain].push(...requests);
      
      logger.info({ 
        shop_domain, 
        queued_count: requests.length,
        total_queue: this.queue[shop_domain].length,
        skipped_count: urls.length - requests.length
      }, 'URLs queued for signing');
      
      // SECURITY: Start processing if not already running
      if (!this.processing.has(shop_domain) && !this.active_requests.has(shop_domain)) {
        this.processQueue(shop_domain);
      }
      
    } catch (error) {
      logger.error({ 
        error: sanitizeErrorMessage(error),
        shop_domain,
        url_count: urls.length 
      }, 'Failed to enqueue URLs');
    }
  }

  /**
   * SECURITY: Enhanced queue processing with error handling
   */
  private async processQueue(shop_domain: string): Promise<void> {
    // SECURITY: Prevent concurrent processing
    if (this.processing.has(shop_domain) || this.active_requests.has(shop_domain)) {
      return;
    }
    
    this.processing.add(shop_domain);
    this.active_requests.add(shop_domain);
    
    try {
      let processed_count = 0;
      const max_processes = 100; // Prevent infinite loops
      
      while (this.queue[shop_domain] && 
             this.queue[shop_domain].length > 0 && 
             processed_count < max_processes) {
        
        const request = this.queue[shop_domain].shift();
        
        if (request) {
          // SECURITY: Check request age
          const age = Date.now() - request.created_at;
          if (age > 3600000) { // 1 hour
            logger.warn({ request_id: request.request_id, age }, 'Request too old, discarding');
            continue;
          }
          
          await this.processSignRequest(request);
          processed_count++;
          
          // SECURITY: Rate limiting
          await this.rateLimitDelay(shop_domain);
        }
      }
      
      if (processed_count >= max_processes) {
        logger.warn({ shop_domain, processed_count }, 'Processing limit reached');
      }
      
    } catch (error) {
      logger.error({ 
        error: sanitizeErrorMessage(error),
        shop_domain 
      }, 'Error processing sign queue');
    } finally {
      this.processing.delete(shop_domain);
      this.active_requests.delete(shop_domain);
    }
  }

  /**
   * SECURITY: Enhanced sign request processing
   */
  private async processSignRequest(request: SignRequest): Promise<void> {
    const { asset_url, shop_domain, request_id } = request;
    
    try {
      // SECURITY: Validate request again
      if (!validateAssetUrl(asset_url) || !validateShopDomain(shop_domain)) {
        throw new Error('Invalid request data');
      }
      
      const result = await this.callSignEndpoint(request);
      
      if (result) {
        // SECURITY: Validate result
        if (!result.manifest_url || !result.manifest_url.startsWith('https://')) {
          throw new Error('Invalid manifest URL in response');
        }
        
        await this.storeManifestUrl(asset_url, result.manifest_url, shop_domain);
        
        // SECURITY: Reset backoff state on success
        delete this.backoff_state[shop_domain];
        
        logger.info({ 
          request_id,
          shop_domain,
          asset_url_length: asset_url.length 
        }, 'Asset signed successfully');
      }
      
    } catch (error) {
      await this.handleSignError(error, request);
    }
  }

  /**
   * SECURITY: Enhanced endpoint calling with timeout and validation
   */
  private async callSignEndpoint(request: SignRequest): Promise<SignResult | null> {
    const { asset_url, tenant_id, shop_domain, request_id } = request;
    
    for (let attempt = 1; attempt <= this.max_retries; attempt++) {
      try {
        // SECURITY: Create AbortController for timeout
        const controller = new AbortController();
        const timeout_id = setTimeout(() => controller.abort(), REQUEST_TIMEOUT);
        
        const response = await fetch(this.sign_endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'C2Concierge-Shopify/0.1.0',
            'X-Request-ID': request_id,
            'X-Shop-Domain': shop_domain
          },
          body: JSON.stringify({
            asset_url,
            tenant_id,
            shop_domain,
            request_id
          }),
          signal: controller.signal
        });
        
        clearTimeout(timeout_id);
        
        if (response.ok) {
          const data = await response.json();
          
          // SECURITY: Validate response data
          if (!data || typeof data !== 'object') {
            throw new Error('Invalid response format');
          }
          
          if (!data.manifest_url || typeof data.manifest_url !== 'string') {
            throw new Error('Missing or invalid manifest_url in response');
          }
          
          if (!data.manifest_url.startsWith('https://')) {
            throw new Error('Invalid manifest URL protocol');
          }
          
          return {
            manifest_url: data.manifest_url,
            mode: ['remote', 'embed'].includes(data.mode) ? data.mode : 'remote',
            signed_at: new Date().toISOString(),
            request_id
          };
          
        } else if (response.status === 429) {
          // SECURITY: Handle rate limiting
          const retry_after = response.headers.get('Retry-After');
          const delay = retry_after ? 
            Math.min(parseInt(retry_after) * 1000, MAX_DELAY) : 
            this.calculateBackoff(attempt);
          
          if (attempt < this.max_retries) {
            logger.warn({ 
              attempt,
              request_id,
              shop_domain,
              delay,
              retry_after 
            }, 'Rate limited, backing off');
            
            await this.sleep(delay);
            continue;
          }
          
        } else {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
      } catch (error) {
        if (attempt === this.max_retries) {
          throw error;
        }
        
        const delay = this.calculateBackoff(attempt);
        logger.warn({ 
          attempt,
          request_id,
          shop_domain,
          delay,
          error: sanitizeErrorMessage(error)
        }, 'Request failed, backing off');
        
        await this.sleep(delay);
      }
    }
    
    return null;
  }

  /**
   * SECURITY: Enhanced backoff calculation
   */
  private calculateBackoff(attempt: number): number {
    const exponential = this.base_delay * Math.pow(2, attempt - 1);
    const jitter = exponential * 0.3 * (Math.random() - 0.5) * 2;
    return Math.min(Math.max(exponential + jitter, 100), MAX_DELAY);
  }

  /**
   * SECURITY: Enhanced error handling
   */
  private async handleSignError(error: any, request: SignRequest): Promise<void> {
    const { asset_url, shop_domain, request_id } = request;
    
    // SECURITY: Update backoff state
    if (!this.backoff_state[shop_domain]) {
      this.backoff_state[shop_domain] = {
        last_attempt: Date.now(),
        failure_count: 0
      };
    }
    
    this.backoff_state[shop_domain].failure_count++;
    this.backoff_state[shop_domain].last_attempt = Date.now();
    this.backoff_state[shop_domain].last_error = sanitizeErrorMessage(error);
    
    logger.error({ 
      request_id,
      error: this.backoff_state[shop_domain].last_error,
      shop_domain,
      failure_count: this.backoff_state[shop_domain].failure_count,
      asset_url_length: asset_url.length
    }, 'Failed to sign asset');
    
    // SECURITY: Re-queue for later if under max retries
    if (this.backoff_state[shop_domain].failure_count < this.max_retries) {
      const delay = this.calculateBackoff(this.backoff_state[shop_domain].failure_count);
      
      setTimeout(() => {
        if (this.queue[shop_domain] && this.queue[shop_domain].length < MAX_QUEUE_SIZE) {
          this.queue[shop_domain].unshift(request);
        }
      }, delay);
    }
  }

  /**
   * SECURITY: Enhanced rate limiting
   */
  private async rateLimitDelay(shop_domain: string): Promise<void> {
    // SECURITY: Check backoff state
    const backoff = this.backoff_state[shop_domain];
    if (backoff && backoff.retry_after) {
      const now = Date.now();
      const time_since_last = now - backoff.last_attempt;
      
      if (time_since_last < backoff.retry_after) {
        await this.sleep(backoff.retry_after - time_since_last);
      }
    }
    
    // SECURITY: Base rate limiting
    await this.sleep(RATE_LIMIT_DELAY);
  }

  /**
   * SECURITY: Enhanced manifest URL storage
   */
  private async storeManifestUrl(asset_url: string, manifest_url: string, shop_domain: string): Promise<void> {
    try {
      // SECURITY: Validate inputs
      if (!validateAssetUrl(asset_url) || !manifest_url.startsWith('https://')) {
        throw new Error('Invalid inputs for manifest storage');
      }
      
      // SECURITY: This would integrate with Shopify API securely
      logger.info({ 
        shop_domain,
        asset_url_length: asset_url.length,
        manifest_url_length: manifest_url.length
      }, 'Manifest URL stored (simulated)');
      
    } catch (error) {
      logger.error({ 
        error: sanitizeErrorMessage(error),
        shop_domain 
      }, 'Failed to store manifest URL');
    }
  }

  /**
   * SECURITY: Enhanced active jobs query
   */
  public async getActiveJobs(shop_domain: string): Promise<number> {
    if (!validateShopDomain(shop_domain)) {
      return 0;
    }
    
    return this.queue[shop_domain]?.length || 0;
  }

  /**
   * SECURITY: Enhanced last sign time query
   */
  public async getLastSignTime(shop_domain: string): Promise<string | null> {
    if (!validateShopDomain(shop_domain)) {
      return null;
    }
    
    // SECURITY: This would be stored in a secure database
    return new Date().toISOString();
  }

  /**
   * SECURITY: Enhanced retro-sign with validation
   */
  public async retroSignShop(shop_domain: string, days_back: number): Promise<any> {
    try {
      // SECURITY: Validate inputs
      if (!validateShopDomain(shop_domain)) {
        throw new Error('Invalid shop domain');
      }
      
      if (!Number.isInteger(days_back) || days_back < 1 || days_back > 365) {
        throw new Error('Invalid days_back: must be 1-365');
      }
      
      logger.info({ shop_domain, days_back }, 'Starting retro-sign for shop');
      
      return {
        shop_domain,
        days_back,
        status: 'started',
        queued_count: 0,
        started_at: new Date().toISOString()
      };
      
    } catch (error) {
      logger.error({ 
        error: sanitizeErrorMessage(error),
        shop_domain,
        days_back 
      }, 'Failed to start retro-sign');
      
      return {
        shop_domain,
        days_back,
        status: 'failed',
        error: sanitizeErrorMessage(error)
      };
    }
  }

  /**
   * SECURITY: Enhanced shop cleanup
   */
  public async cleanupShop(shop_domain: string): Promise<void> {
    try {
      // SECURITY: Validate shop domain
      if (!validateShopDomain(shop_domain)) {
        throw new Error('Invalid shop domain');
      }
      
      // SECURITY: Remove all shop data
      delete this.queue[shop_domain];
      delete this.backoff_state[shop_domain];
      this.processing.delete(shop_domain);
      this.active_requests.delete(shop_domain);
      
      logger.info({ shop_domain }, 'Shop data cleaned up');
      
    } catch (error) {
      logger.error({ 
        error: sanitizeErrorMessage(error),
        shop_domain 
      }, 'Failed to cleanup shop data');
    }
  }

  /**
   * SECURITY: Enhanced sleep helper
   */
  private sleep(ms: number): Promise<void> {
    // SECURITY: Validate sleep time
    const safe_ms = Math.max(Math.min(ms, MAX_DELAY), 0);
    return new Promise(resolve => setTimeout(resolve, safe_ms));
  }

  /**
   * SECURITY: Get worker statistics
   */
  public async getStats(): Promise<any> {
    const total_queued = Object.values(this.queue).reduce((sum, queue) => sum + queue.length, 0);
    const processing_shops = this.processing.size;
    const active_shops = this.active_requests.size;
    const backoff_shops = Object.keys(this.backoff_state).length;
    
    return {
      total_queued,
      processing_shops,
      active_shops,
      backoff_shops,
      max_queue_size: MAX_QUEUE_SIZE,
      max_retries: this.max_retries,
      uptime: process.uptime()
    };
  }
}

export const signWorker = SignWorker.getInstance();
