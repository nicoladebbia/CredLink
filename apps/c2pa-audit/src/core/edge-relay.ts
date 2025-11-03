/**
 * Phase 30 Security & Privacy - Edge Relay
 * Proxies manifest fetches to protect viewer privacy
 * Implements minimal logging, safe caching, and privacy warnings
 */

import { VariantLinkingError } from '@/types';

/**
 * Edge relay configuration
 */
export interface EdgeRelayConfig {
  /** Upstream manifest service */
  upstreamService: string;
  /** Cache TTL in seconds */
  cacheTtl: number;
  /** Enable request logging */
  enableLogging: boolean;
  /** Privacy warning level */
  privacyWarning: 'none' | 'minimal' | 'detailed';
}

/**
 * Relay request context
 */
export interface RelayRequestContext {
  /** Original request URL */
  originalUrl: string;
  /** Client IP (anonymized) */
  clientIpHash: string;
  /** User agent hash */
  userAgentHash: string;
  /** Request timestamp */
  timestamp: number;
  /** Manifest URL being requested */
  manifestUrl: string;
}

/**
 * Relay response with privacy controls
 */
export interface RelayResponse {
  /** Manifest data */
  manifestData: ArrayBuffer;
  /** Content type */
  contentType: string;
  /** Cache control headers */
  cacheHeaders: Record<string, string>;
  /** Privacy headers */
  privacyHeaders: Record<string, string>;
  /** Privacy warning */
  privacyWarning?: string;
}

/**
 * Phase 30 Edge Relay - Privacy-focused manifest proxy
 */
export class EdgeRelay {
  private config: EdgeRelayConfig;
  private cache: Map<string, CacheEntry> = new Map();
  private requestLog: RelayLogEntry[] = [];
  private maxLogEntries = 1000;

  constructor(config: EdgeRelayConfig) {
    this.config = config;
    
    // Clean cache periodically
    setInterval(() => this.cleanCache(), 60000); // Every minute
    
    // Clean logs periodically
    setInterval(() => this.cleanLogs(), 300000); // Every 5 minutes
  }

  /**
   * Relay manifest request with privacy protection
   * @param manifestUrl - Manifest URL to fetch
   * @param requestContext - Request context for logging
   * @returns Relay response with privacy controls
   */
  async relayManifest(
    manifestUrl: string, 
    requestContext: RelayRequestContext
  ): Promise<RelayResponse> {
    try {
      // Validate manifest URL
      this.validateManifestUrl(manifestUrl);

      // Check cache first
      const cached = this.getCachedManifest(manifestUrl);
      if (cached) {
        this.logRequest(requestContext, 'cache_hit');
        return this.buildRelayResponse(cached.data, cached.contentType, true);
      }

      // Fetch from upstream with privacy controls
      const manifestData = await this.fetchFromUpstream(manifestUrl, requestContext);
      
      // Cache the result
      this.cacheManifest(manifestUrl, manifestData);
      
      // Log the request (minimal)
      this.logRequest(requestContext, 'upstream_fetch');
      
      // Build privacy-aware response
      return this.buildRelayResponse(
        manifestData.data, 
        manifestData.contentType, 
        false,
        this.generatePrivacyWarning(manifestUrl)
      );

    } catch (error) {
      this.logRequest(requestContext, 'error', error instanceof Error ? error.message : 'Unknown error');
      
      if (error instanceof VariantLinkingError) {
        throw error;
      }
      
      throw new VariantLinkingError(
        `Manifest relay failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'relay_error',
        'https://spec.c2pa.org/specification-2.1/#privacy-considerations'
      );
    }
  }

  /**
   * Get privacy metrics for monitoring
   * @returns Privacy metrics
   */
  getPrivacyMetrics(): {
    totalRequests: number;
    cacheHitRate: number;
    uniqueClients: number;
    topManifests: Array<{ url: string; requests: number }>;
    privacyWarnings: number;
  } {
    const totalRequests = this.requestLog.length;
    const cacheHits = this.requestLog.filter(log => log.result === 'cache_hit').length;
    const cacheHitRate = totalRequests > 0 ? (cacheHits / totalRequests) * 100 : 0;
    
    const uniqueClients = new Set(this.requestLog.map(log => log.clientIpHash)).size;
    
    const manifestCounts = new Map<string, number>();
    this.requestLog.forEach(log => {
      const count = manifestCounts.get(log.manifestUrl) || 0;
      manifestCounts.set(log.manifestUrl, count + 1);
    });
    
    const topManifests = Array.from(manifestCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([url, requests]) => ({ url, requests }));
    
    const privacyWarnings = this.requestLog.filter(log => log.privacyWarning).length;

    return {
      totalRequests,
      cacheHitRate: Math.round(cacheHitRate * 100) / 100,
      uniqueClients,
      topManifests,
      privacyWarnings
    };
  }

  /**
   * Clear all logs and cache for privacy
   */
  clearPrivacyData(): void {
    this.cache.clear();
    this.requestLog = [];
  }

  /**
   * Validate manifest URL for security
   * @param manifestUrl - URL to validate
   */
  private validateManifestUrl(manifestUrl: string): void {
    try {
      const url = new URL(manifestUrl);
      
      // Only allow HTTP/HTTPS
      if (!['http:', 'https:'].includes(url.protocol)) {
        throw new VariantLinkingError(
          'Only HTTP and HTTPS URLs are allowed',
          'invalid_protocol',
          'https://spec.c2pa.org/specification-2.1/#security'
        );
      }

      // Block private/internal IPs to prevent SSRF
      const hostname = url.hostname;
      if (this.isPrivateIP(hostname)) {
        throw new VariantLinkingError(
          'Access to private IP addresses is not allowed',
          'private_ip_blocked',
          'https://spec.c2pa.org/specification-2.1/#security'
        );
      }

      // Validate file extension
      const pathname = url.pathname.toLowerCase();
      if (!pathname.endsWith('.c2pa') && !pathname.endsWith('.json')) {
        throw new VariantLinkingError(
          'Only .c2pa and .json manifest files are allowed',
          'invalid_file_type',
          'https://spec.c2pa.org/specification-2.1/#security'
        );
      }

    } catch (error) {
      if (error instanceof VariantLinkingError) {
        throw error;
      }
      throw new VariantLinkingError(
        'Invalid manifest URL format',
        'invalid_url',
        'https://spec.c2pa.org/specification-2.1/#security'
      );
    }
  }

  /**
   * Check if hostname is a private IP
   * @param hostname - Hostname to check
   * @returns True if private IP
   */
  private isPrivateIP(hostname: string): boolean {
    // IPv4 private ranges
    const ipv4PrivateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^::1$/,
      /^localhost$/
    ];

    // IPv6 private ranges
    const ipv6PrivateRanges = [
      /^fc00:/,
      /^fe80:/,
      /^::1$/
    ];

    return ipv4PrivateRanges.some(range => range.test(hostname)) ||
           ipv6PrivateRanges.some(range => range.test(hostname));
  }

  /**
   * Get cached manifest if available and not expired
   * @param manifestUrl - Manifest URL
   * @returns Cached entry or null
   */
  private getCachedManifest(manifestUrl: string): CacheEntry | null {
    const entry = this.cache.get(manifestUrl);
    
    if (!entry) {
      return null;
    }

    // Check if expired
    if (Date.now() - entry.timestamp > (this.config.cacheTtl * 1000)) {
      this.cache.delete(manifestUrl);
      return null;
    }

    return entry;
  }

  /**
   * Fetch manifest from upstream with privacy controls
   * @param manifestUrl - Manifest URL to fetch
   * @param requestContext - Request context
   * @returns Manifest data with content type
   */
  private async fetchFromUpstream(
    manifestUrl: string, 
    requestContext: RelayRequestContext
  ): Promise<{ data: ArrayBuffer; contentType: string }> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

    try {
      const response = await fetch(`${this.config.upstreamService}/proxy`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Manifest-URL': manifestUrl,
          'X-Request-ID': this.generateRequestId(),
          'User-Agent': 'C2PA-Edge-Relay/1.0'
        },
        body: JSON.stringify({
          manifest_url: manifestUrl,
          privacy_mode: true,
          strip_headers: ['Cookie', 'Authorization', 'X-Forwarded-For']
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new VariantLinkingError(
          `Upstream fetch failed: ${response.status} ${response.statusText}`,
          'upstream_error',
          'https://spec.c2pa.org/specification-2.1/#remote-discovery'
        );
      }

      const data = await response.arrayBuffer();
      const contentType = response.headers.get('Content-Type') || 'application/c2pa-manifest+json';

      return { data, contentType };

    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof VariantLinkingError) {
        throw error;
      }
      
      throw new VariantLinkingError(
        `Upstream fetch error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'upstream_fetch_error',
        'https://spec.c2pa.org/specification-2.1/#remote-discovery'
      );
    }
  }

  /**
   * Cache manifest data
   * @param manifestUrl - Manifest URL
   * @param data - Manifest data to cache
   */
  private cacheManifest(manifestUrl: string, data: { data: ArrayBuffer; contentType: string }): void {
    // Limit cache size
    if (this.cache.size >= 1000) {
      // Remove oldest entry
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(manifestUrl, {
      data: data.data,
      contentType: data.contentType,
      timestamp: Date.now()
    });
  }

  /**
   * Build relay response with privacy headers
   * @param manifestData - Manifest data
   * @param contentType - Content type
   * @param fromCache - Whether from cache
   * @param privacyWarning - Optional privacy warning
   * @returns Relay response
   */
  private buildRelayResponse(
    manifestData: ArrayBuffer,
    contentType: string,
    fromCache: boolean,
    privacyWarning?: string
  ): RelayResponse {
    const cacheHeaders = {
      'Cache-Control': fromCache 
        ? `public, max-age=${this.config.cacheTtl}`
        : `public, max-age=${this.config.cacheTtl}, must-revalidate`,
      'ETag': this.generateETag(manifestData),
      'X-Cache': fromCache ? 'HIT' : 'MISS'
    };

    const privacyHeaders = {
      'X-Privacy-Relay': 'true',
      'X-Privacy-Warning': privacyWarning || 'none',
      'X-Request-Anonymized': 'true',
      'Referrer-Policy': 'strict-origin-when-cross-origin',
      'X-Content-Type-Options': 'nosniff'
    };

    return {
      manifestData,
      contentType,
      cacheHeaders,
      privacyHeaders,
      privacyWarning
    };
  }

  /**
   * Generate privacy warning based on manifest URL
   * @param manifestUrl - Manifest URL
   * @returns Privacy warning or undefined
   */
  private generatePrivacyWarning(manifestUrl: string): string | undefined {
    if (this.config.privacyWarning === 'none') {
      return undefined;
    }

    const url = new URL(manifestUrl);
    const domain = url.hostname;

    // Check for tracking domains
    const trackingPatterns = [
      /analytics/,
      /tracking/,
      /telemetry/,
      /metrics/
    ];

    if (trackingPatterns.some(pattern => pattern.test(domain))) {
      return this.config.privacyWarning === 'detailed' 
        ? `This manifest is served from a potential tracking domain: ${domain}`
        : 'Tracking domain detected';
    }

    // Check for third-party domains
    const firstPartyDomains = [
      'c2pa.org',
      'contentauthenticity.org',
      'adobe.com',
      'microsoft.com',
      'google.com'
    ];

    if (!firstPartyDomains.some(domain => url.hostname.includes(domain))) {
      return this.config.privacyWarning === 'detailed'
        ? `Third-party manifest domain: ${domain}`
        : 'Third-party manifest';
    }

    return undefined;
  }

  /**
   * Log request with minimal data for privacy
   * @param context - Request context
   * @param result - Request result
   * @param error - Optional error message
   */
  private logRequest(
    context: RelayRequestContext, 
    result: string, 
    error?: string
  ): void {
    if (!this.config.enableLogging) {
      return;
    }

    const logEntry: RelayLogEntry = {
      timestamp: context.timestamp,
      clientIpHash: context.clientIpHash,
      userAgentHash: context.userAgentHash,
      manifestUrl: this.hashManifestUrl(context.manifestUrl),
      result,
      error,
      privacyWarning: !!this.generatePrivacyWarning(context.manifestUrl)
    };

    this.requestLog.push(logEntry);
  }

  /**
   * Hash manifest URL for logging (privacy)
   * @param manifestUrl - Manifest URL to hash
   * @returns Hashed URL
   */
  private hashManifestUrl(manifestUrl: string): string {
    const crypto = require('crypto');
    return `hash_${crypto.createHash('sha256').update(manifestUrl).digest('hex').substring(0, 16)}`;
  }

  /**
   * Generate request ID
   * @returns Request ID string
   */
  private generateRequestId(): string {
    const crypto = require('crypto');
    const bytes = crypto.randomBytes(16);
    return `req_${Date.now()}_${bytes.toString('hex')}`;
  }

  /**
   * Generate ETag for manifest data
   * @param data - Manifest data
   * @returns ETag string
   */
  private generateETag(data: ArrayBuffer): string {
    const crypto = require('crypto');
    const view = new Uint8Array(data);
    const hash = crypto.createHash('sha256').update(Buffer.from(view)).digest('hex');
    return `"${hash.substring(0, 32)}"`;
  }

  /**
   * Clean expired cache entries
   */
  private cleanCache(): void {
    const now = Date.now();
    const expiry = this.config.cacheTtl * 1000;
    
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > expiry) {
        this.cache.delete(key);
      }
    }
  }

  /**
   * Clean old log entries
   */
  private cleanLogs(): void {
    if (this.requestLog.length > this.maxLogEntries) {
      this.requestLog = this.requestLog.slice(-this.maxLogEntries);
    }
  }
}

/**
 * Cache entry structure
 */
interface CacheEntry {
  data: ArrayBuffer;
  contentType: string;
  timestamp: number;
}

/**
 * Relay log entry structure
 */
interface RelayLogEntry {
  timestamp: number;
  clientIpHash: string;
  userAgentHash: string;
  manifestUrl: string;
  result: string;
  error?: string;
  privacyWarning: boolean;
}
