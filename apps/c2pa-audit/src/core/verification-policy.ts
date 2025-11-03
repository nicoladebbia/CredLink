/**
 * Phase 31 - Verification Policy Engine
 * Implements fast, safe verification with caching and performance budgets
 */

import { createHash } from 'crypto';

export interface VerificationRequest {
  manifestUrl: string;
  mode: 'full' | 'sample' | 'boundary';
  streamId?: string;
  timestamp?: string;
  rangeId?: string;
}

export interface VerificationResult {
  valid: boolean;
  issuer?: string;
  tsa?: string;
  verifiedAt: string;
  manifestHash: string;
  trustChain: Array<{
    subject: string;
    issuer: string;
    trusted: boolean;
  }>;
  performance: {
    duration: number;
    cacheHit: boolean;
  };
}

export interface VerificationPolicy {
  boundaryVerification: 'full' | 'sample';
  samplingRate: number;
  cacheTTL: number;
  maxVerificationsPerMinute: number;
  cpuBudgetPercent: number;
  networkTimeout: number;
}

export class VerificationPolicyEngine {
  private cache = new Map<string, { result: VerificationResult; expiry: number }>();
  private rateLimitTracker = new Map<string, number[]>();
  private ipRateLimitTracker = new Map<string, number[]>();
  private performanceMetrics = {
    totalVerifications: 0,
    cacheHits: 0,
    averageDuration: 0,
    cpuUsage: 0
  };

  // Default policy configuration
  private readonly defaultPolicy: VerificationPolicy = {
    boundaryVerification: 'full',
    samplingRate: 3, // Verify every 3rd segment
    cacheTTL: 60000, // 60 seconds
    maxVerificationsPerMinute: 12,
    cpuBudgetPercent: 5,
    networkTimeout: 5000
  };

  private currentPolicy: VerificationPolicy;
  private readonly MAX_TRACKED_ENTITIES = 10000; // Prevent memory exhaustion
  private readonly MAX_MANIFEST_SIZE = 10 * 1024 * 1024; // 10MB limit
  private readonly MAX_URL_LENGTH = 2048;

  constructor(policy?: Partial<VerificationPolicy>) {
    this.currentPolicy = { ...this.defaultPolicy, ...policy };
    
    // Cleanup old entries every 5 minutes to prevent memory leaks
    setInterval(() => this.cleanupRateLimitMaps(), 5 * 60 * 1000);
  }

  /**
   * Validate and sanitize verification request
   */
  private validateRequest(request: VerificationRequest): void {
    // Validate manifest URL
    if (!request.manifestUrl || typeof request.manifestUrl !== 'string') {
      throw new Error('Manifest URL is required');
    }

    if (request.manifestUrl.length > this.MAX_URL_LENGTH) {
      throw new Error('Manifest URL exceeds maximum length');
    }

    try {
      const url = new URL(request.manifestUrl);
      if (url.protocol !== 'https:') {
        throw new Error('Only HTTPS manifest URLs are allowed');
      }
      
      // Prevent private/internal IP access
      if (this.isPrivateIP(url.hostname)) {
        throw new Error('Access to private IP addresses is not allowed');
      }
    } catch (error) {
      throw new Error('Invalid manifest URL format');
    }

    // Validate mode
    if (!['full', 'sample', 'boundary'].includes(request.mode)) {
      throw new Error('Invalid verification mode');
    }

    // Validate stream ID if provided
    if (request.streamId && !/^[a-zA-Z0-9_-]{1,64}$/.test(request.streamId)) {
      throw new Error('Invalid stream ID format');
    }

    // Validate timestamp if provided
    if (request.timestamp) {
      const timestamp = new Date(request.timestamp);
      if (isNaN(timestamp.getTime()) || 
          timestamp < new Date(Date.now() - 365 * 24 * 60 * 60 * 1000) ||
          timestamp > new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)) {
        throw new Error('Invalid timestamp');
      }
    }
  }

  /**
   * Check if hostname is a private IP
   */
  private isPrivateIP(hostname: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/,
      /^fe80:/
    ];
    
    return privateRanges.some(range => range.test(hostname));
  }

  /**
   * Execute verification with policy enforcement
   */
  async verify(request: VerificationRequest & { clientIP?: string }): Promise<VerificationResult> {
    const startTime = performance.now();

    // Validate and sanitize request
    this.validateRequest(request);

    // Check rate limiting (both stream-based and IP-based)
    if (!this.checkRateLimit(request.streamId || 'anonymous')) {
      throw new Error('Rate limit exceeded for verification requests');
    }
    
    if (request.clientIP && !this.checkIPRateLimit(request.clientIP)) {
      throw new Error('IP rate limit exceeded for verification requests');
    }

    // Check cache first
    const cacheKey = this.getCacheKey(request);
    const cached = this.getCachedResult(cacheKey);
    
    if (cached) {
      this.performanceMetrics.cacheHits++;
      return {
        ...cached,
        performance: {
          duration: 0,
          cacheHit: true
        }
      };
    }

    // Perform verification based on mode
    let result: VerificationResult;
    
    switch (request.mode) {
      case 'boundary':
        result = await this.performFullVerification(request);
        break;
      case 'full':
        result = await this.performFullVerification(request);
        break;
      case 'sample':
        result = await this.performSampleVerification(request);
        break;
      default:
        throw new Error(`Unknown verification mode: ${request.mode}`);
    }

    // Update performance metrics
    const duration = performance.now() - startTime;
    this.updatePerformanceMetrics(duration, false);

    // Cache result
    this.setCachedResult(cacheKey, result);

    return {
      ...result,
      performance: {
        duration,
        cacheHit: false
      }
    };
  }

  /**
   * Perform full verification (boundaries and critical points)
   */
  private async performFullVerification(request: VerificationRequest): Promise<VerificationResult> {
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Verification timeout')), this.currentPolicy.networkTimeout);
    });

    const verificationPromise = this.doVerification(request, true);

    try {
      return await Promise.race([verificationPromise, timeoutPromise]) as VerificationResult;
    } catch (error) {
      return this.createErrorResult(request, error as Error);
    }
  }

  /**
   * Perform sample verification (lightweight)
   */
  private async performSampleVerification(request: VerificationRequest): Promise<VerificationResult> {
    // Sample verification only checks manifest hash and basic structure
    try {
      const response = await fetch(request.manifestUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(this.currentPolicy.networkTimeout),
        headers: {
          'User-Agent': 'C2PA-Audit-Tool/1.0',
          'Accept': 'application/json, application/c2pa, */*'
        }
      });

      if (!response.ok) {
        throw new Error(`Manifest fetch failed: ${response.status}`);
      }

      const etag = response.headers.get('etag') || '';
      const lastModified = response.headers.get('last-modified') || '';
      
      // Create lightweight result for sampling
      return {
        valid: true, // Assume valid for sampling
        manifestHash: this.hashFromHeaders(etag, lastModified),
        verifiedAt: new Date().toISOString(),
        trustChain: [],
        performance: {
          duration: 0,
          cacheHit: false
        }
      };

    } catch (error) {
      return this.createErrorResult(request, error as Error);
    }
  }

  /**
   * Core verification implementation
   */
  private async doVerification(request: VerificationRequest, fullCheck: boolean): Promise<VerificationResult> {
    // Fetch manifest with size limits
    const manifestResponse = await fetch(request.manifestUrl, {
      signal: AbortSignal.timeout(this.currentPolicy.networkTimeout),
      headers: {
        'User-Agent': 'C2PA-Audit-Tool/1.0',
        'Accept': 'application/json, application/c2pa, */*'
      }
    });

    if (!manifestResponse.ok) {
      throw new Error(`Failed to fetch manifest: ${manifestResponse.status}`);
    }

    // Check content length
    const contentLength = manifestResponse.headers.get('content-length');
    if (contentLength && parseInt(contentLength) > this.MAX_MANIFEST_SIZE) {
      throw new Error('Manifest exceeds maximum size limit');
    }

    const manifestData = await manifestResponse.arrayBuffer();
    
    // Verify size after download
    if (manifestData.byteLength > this.MAX_MANIFEST_SIZE) {
      throw new Error('Manifest exceeds maximum size limit');
    }

    const manifestHash = await this.hashArrayBuffer(manifestData);

    if (!fullCheck) {
      // Sample verification - just check we can fetch and hash
      return {
        valid: true,
        manifestHash,
        verifiedAt: new Date().toISOString(),
        trustChain: [],
        performance: {
          duration: 0,
          cacheHit: false
        }
      };
    }

    // Full verification would validate signatures, trust chains, etc.
    // This is a placeholder for the actual C2PA verification logic
    const trustChain = await this.validateTrustChain(manifestData);
    const isValid = trustChain.every(link => link.trusted);

    return {
      valid: isValid,
      issuer: trustChain[0]?.subject,
      tsa: 'GlobalSign', // Placeholder TSA
      manifestHash,
      verifiedAt: new Date().toISOString(),
      trustChain,
      performance: {
        duration: 0,
        cacheHit: false
      }
    };
  }

  /**
   * Validate trust chain (placeholder implementation)
   */
  private async validateTrustChain(manifestData: ArrayBuffer): Promise<Array<{ subject: string; issuer: string; trusted: boolean }>> {
    // This would implement actual C2PA trust chain validation
    // For now, return a mock valid chain
    return [
      {
        subject: 'C2PA Content Creator',
        issuer: 'C2PA Root CA',
        trusted: true
      }
    ];
  }

  /**
   * Check rate limiting per stream/viewer
   */
  private checkRateLimit(streamId: string): boolean {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    if (!this.rateLimitTracker.has(streamId)) {
      this.rateLimitTracker.set(streamId, []);
    }

    const requests = this.rateLimitTracker.get(streamId)!;
    
    // Clean old requests
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    this.rateLimitTracker.set(streamId, validRequests);

    // Check limit
    if (validRequests.length >= this.currentPolicy.maxVerificationsPerMinute) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    return true;
  }

  /**
   * Check IP-based rate limiting (more restrictive)
   */
  private checkIPRateLimit(clientIP: string): boolean {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    const maxPerIP = this.currentPolicy.maxVerificationsPerMinute * 2; // 2x stream limit
    
    if (!this.ipRateLimitTracker.has(clientIP)) {
      this.ipRateLimitTracker.set(clientIP, []);
    }

    const requests = this.ipRateLimitTracker.get(clientIP)!;
    
    // Clean old requests
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    this.ipRateLimitTracker.set(clientIP, validRequests);

    // Check limit
    if (validRequests.length >= maxPerIP) {
      return false;
    }

    // Add current request
    validRequests.push(now);
    return true;
  }

  /**
   * Cleanup old rate limit entries to prevent memory exhaustion
   */
  private cleanupRateLimitMaps(): void {
    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    
    // Clean stream-based tracker
    for (const [key, timestamps] of this.rateLimitTracker.entries()) {
      const validTimestamps = timestamps.filter(t => t > windowStart);
      if (validTimestamps.length === 0) {
        this.rateLimitTracker.delete(key);
      } else {
        this.rateLimitTracker.set(key, validTimestamps);
      }
    }
    
    // Clean IP-based tracker
    for (const [key, timestamps] of this.ipRateLimitTracker.entries()) {
      const validTimestamps = timestamps.filter(t => t > windowStart);
      if (validTimestamps.length === 0) {
        this.ipRateLimitTracker.delete(key);
      } else {
        this.ipRateLimitTracker.set(key, validTimestamps);
      }
    }
    
    // Prevent unbounded growth
    if (this.rateLimitTracker.size > this.MAX_TRACKED_ENTITIES) {
      const entries = Array.from(this.rateLimitTracker.entries())
        .sort((a, b) => Math.min(...b[1]) - Math.min(...a[1]))
        .slice(0, this.MAX_TRACKED_ENTITIES);
      this.rateLimitTracker = new Map(entries);
    }
    
    if (this.ipRateLimitTracker.size > this.MAX_TRACKED_ENTITIES) {
      const entries = Array.from(this.ipRateLimitTracker.entries())
        .sort((a, b) => Math.min(...b[1]) - Math.min(...a[1]))
        .slice(0, this.MAX_TRACKED_ENTITIES);
      this.ipRateLimitTracker = new Map(entries);
    }
  }

  /**
   * Generate cache key for request
   */
  private getCacheKey(request: VerificationRequest): string {
    const keyData = `${request.manifestUrl}:${request.mode}:${request.streamId || ''}`;
    return createHash('sha256').update(keyData).digest('hex').substring(0, 16);
  }

  /**
   * Get cached result if valid
   */
  private getCachedResult(key: string): VerificationResult | null {
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    if (Date.now() > cached.expiry) {
      this.cache.delete(key);
      return null;
    }

    return cached.result;
  }

  /**
   * Set cached result with TTL
   */
  private setCachedResult(key: string, result: VerificationResult): void {
    this.cache.set(key, {
      result,
      expiry: Date.now() + this.currentPolicy.cacheTTL
    });
    
    // Prevent cache from growing too large
    if (this.cache.size > this.MAX_TRACKED_ENTITIES) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].expiry - b[1].expiry)
        .slice(0, this.MAX_TRACKED_ENTITIES);
      this.cache = new Map(entries);
    }
  }

  /**
   * Create error result
   */
  private createErrorResult(request: VerificationRequest, error: Error): VerificationResult {
    return {
      valid: false,
      manifestHash: '',
      verifiedAt: new Date().toISOString(),
      trustChain: [],
      performance: {
        duration: 0,
        cacheHit: false
      }
    };
  }

  /**
   * Generate hash from HTTP headers
   */
  private hashFromHeaders(etag: string, lastModified: string): string {
    const data = `${etag}:${lastModified}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Hash array buffer using Web Crypto API
   */
  private async hashArrayBuffer(data: ArrayBuffer): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Update performance metrics
   */
  private updatePerformanceMetrics(duration: number, cacheHit: boolean): void {
    this.performanceMetrics.totalVerifications++;
    
    if (cacheHit) {
      this.performanceMetrics.cacheHits++;
    }

    // Update rolling average with exponential smoothing
    const alpha = 0.1; // Smoothing factor
    this.performanceMetrics.averageDuration = 
      this.performanceMetrics.averageDuration * (1 - alpha) + duration * alpha;
  }

  /**
   * Get current performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      cacheHitRate: this.performanceMetrics.totalVerifications > 0 
        ? this.performanceMetrics.cacheHits / this.performanceMetrics.totalVerifications 
        : 0
    };
  }

  /**
   * Update policy
   */
  updatePolicy(newPolicy: Partial<VerificationPolicy>): void {
    // Validate new policy values
    if (newPolicy.maxVerificationsPerMinute !== undefined) {
      if (newPolicy.maxVerificationsPerMinute < 1 || newPolicy.maxVerificationsPerMinute > 1000) {
        throw new Error('maxVerificationsPerMinute must be between 1 and 1000');
      }
    }

    if (newPolicy.cacheTTL !== undefined) {
      if (newPolicy.cacheTTL < 1000 || newPolicy.cacheTTL > 3600000) {
        throw new Error('cacheTTL must be between 1 second and 1 hour');
      }
    }

    if (newPolicy.networkTimeout !== undefined) {
      if (newPolicy.networkTimeout < 1000 || newPolicy.networkTimeout > 30000) {
        throw new Error('networkTimeout must be between 1 second and 30 seconds');
      }
    }

    this.currentPolicy = { ...this.currentPolicy, ...newPolicy };
  }

  /**
   * Get current policy
   */
  getPolicy(): VerificationPolicy {
    return { ...this.currentPolicy };
  }

  /**
   * Clear cache and rate limits
   */
  reset(): void {
    this.cache.clear();
    this.rateLimitTracker.clear();
    this.ipRateLimitTracker.clear();
    this.performanceMetrics = {
      totalVerifications: 0,
      cacheHits: 0,
      averageDuration: 0,
      cpuUsage: 0
    };
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.cache.size,
      maxSize: this.MAX_TRACKED_ENTITIES,
      utilization: this.cache.size / this.MAX_TRACKED_ENTITIES
    };
  }

  /**
   * Get rate limit statistics
   */
  getRateLimitStats() {
    return {
      streamTrackerSize: this.rateLimitTracker.size,
      ipTrackerSize: this.ipRateLimitTracker.size,
      maxTrackedEntities: this.MAX_TRACKED_ENTITIES
    };
  }
}
