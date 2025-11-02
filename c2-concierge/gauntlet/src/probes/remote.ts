#!/usr/bin/env node

/**
 * C2C Hostile CDN Gauntlet - Remote Manifest Probe
 * Tests for remote C2PA Content Credentials via HTTP headers and manifest URLs
 */

import * as https from 'https';
import * as http from 'http';
import * as crypto from 'crypto';
import { URL } from 'url';

interface RemoteProbeResult {
  url: string;
  manifest_url: string;
  method: string;
  success: boolean;
  hash_match: boolean;
  headers: Record<string, string>;
  timing: number;
  computed_hash?: string;
  expected_hash?: string;
  manifest_content?: string;
  error?: string;
}

interface RemoteProbeConfig {
  timeout: number;
  retry_attempts: number;
  retry_delay: number;
  user_agent: string;
  rate_limit: {
    requests_per_second: number;
    burst_size: number;
  };
  offline_mode: boolean;
  allowed_hosts: string[];
  circuit_breaker: {
    failure_threshold: number;
    recovery_timeout: number;
    half_open_max_calls: number;
  };
}

class RemoteManifestProbe {
  private config: RemoteProbeConfig;
  private circuitBreakerState: {
    failures: number;
    lastFailureTime: number;
    state: 'CLOSED' | 'OPEN' | 'HALF_OPEN';
    halfOpenCalls: number;
  };

  constructor(config: Partial<RemoteProbeConfig> = {}) {
    this.config = {
      timeout: 30000,
      retry_attempts: 3,
      retry_delay: 1000,
      user_agent: 'C2C-Gauntlet/1.0',
      rate_limit: {
        requests_per_second: 10,
        burst_size: 20
      },
      offline_mode: false,
      allowed_hosts: [
        'cf.survival.test',
        'imgix.survival.test', 
        'cloudinary.survival.test',
        'fastly.survival.test',
        'akamai.survival.test',
        'origin.survival.test',
        'manifests.survival.test',
        'httpbin.org',
        'example.com'
      ],
      circuit_breaker: {
        failure_threshold: 10,
        recovery_timeout: 60000,
        half_open_max_calls: 3
      },
      ...config
    };

    this.circuitBreakerState = {
      failures: 0,
      lastFailureTime: 0,
      state: 'CLOSED',
      halfOpenCalls: 0
    };
  }

  /**
   * Validate URL before processing
   */
  private validateUrl(url: string): { valid: boolean; error?: string } {
    // Check URL length (prevent buffer overflow)
    if (url.length > 2048) {
      return { valid: false, error: 'URL too long (max 2048 characters)' };
    }

    // Check for null bytes and control characters
    if (url.includes('\0') || /[\x00-\x1F\x7F]/.test(url)) {
      return { valid: false, error: 'URL contains invalid control characters' };
    }

    // Check for dangerous protocols
    const dangerousProtocols = ['javascript:', 'data:', 'file:', 'ftp:'];
    if (dangerousProtocols.some(protocol => url.toLowerCase().startsWith(protocol))) {
      return { valid: false, error: 'URL contains dangerous protocol' };
    }

    try {
      const parsedUrl = new URL(url);
      
      // Only allow http/https
      if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        return { valid: false, error: 'Only HTTP/HTTPS protocols allowed' };
      }

      // Validate hostname
      if (!parsedUrl.hostname || parsedUrl.hostname.length > 253) {
        return { valid: false, error: 'Invalid hostname' };
      }

      return { valid: true };
    } catch (error) {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  /**
   * Check circuit breaker state before making request
   */
  private checkCircuitBreaker(): { allowed: boolean; reason?: string } {
    const now = Date.now();
    const { state, failures, lastFailureTime, halfOpenCalls } = this.circuitBreakerState;
    const { failure_threshold, recovery_timeout, half_open_max_calls } = this.config.circuit_breaker;

    switch (state) {
      case 'CLOSED':
        return { allowed: true };

      case 'OPEN':
        if (now - lastFailureTime > recovery_timeout) {
          this.circuitBreakerState.state = 'HALF_OPEN';
          this.circuitBreakerState.halfOpenCalls = 0;
          return { allowed: true, reason: 'Circuit breaker half-open' };
        }
        return { allowed: false, reason: 'Circuit breaker open' };

      case 'HALF_OPEN':
        if (halfOpenCalls >= half_open_max_calls) {
          return { allowed: false, reason: 'Circuit breaker half-open limit reached' };
        }
        this.circuitBreakerState.halfOpenCalls++;
        return { allowed: true, reason: 'Circuit breaker half-open' };

      default:
        return { allowed: false, reason: 'Invalid circuit breaker state' };
    }
  }

  /**
   * Update circuit breaker state after request
   */
  private updateCircuitBreaker(success: boolean): void {
    if (success) {
      if (this.circuitBreakerState.state === 'HALF_OPEN') {
        this.circuitBreakerState.state = 'CLOSED';
        this.circuitBreakerState.failures = 0;
      }
    } else {
      this.circuitBreakerState.failures++;
      this.circuitBreakerState.lastFailureTime = Date.now();

      if (this.circuitBreakerState.failures >= this.config.circuit_breaker.failure_threshold) {
        this.circuitBreakerState.state = 'OPEN';
      }
    }
  }

  /**
   * Probe a single URL for remote manifest
   */
  public async probeRemote(assetUrl: string, manifestUrl: string): Promise<RemoteProbeResult> {
    const startTime = Date.now();
    
    const result: RemoteProbeResult = {
      url: assetUrl,
      manifest_url: manifestUrl,
      method: 'unknown',
      success: false,
      hash_match: false,
      headers: {},
      timing: 0
    };

    // Validate URLs before processing
    const assetValidation = this.validateUrl(assetUrl);
    if (!assetValidation.valid) {
      result.error = assetValidation.error;
      result.timing = Date.now() - startTime;
      return result;
    }

    const manifestValidation = this.validateUrl(manifestUrl);
    if (!manifestValidation.valid) {
      result.error = manifestValidation.error;
      result.timing = Date.now() - startTime;
      return result;
    }

    // Check circuit breaker before making network requests
    const circuitCheck = this.checkCircuitBreaker();
    if (!circuitCheck.allowed) {
      result.error = circuitCheck.reason || 'Circuit breaker blocked request';
      result.timing = Date.now() - startTime;
      this.updateCircuitBreaker(false);
      return result;
    }

    // If in offline mode, return mock result
    if (this.config.offline_mode) {
      return {
        ...result,
        method: 'offline_mock',
        success: true,
        hash_match: true,
        headers: {
          'link': `<${manifestUrl}>; rel="c2pa-manifest"`,
          'cache-control': 'public, max-age=31536000'
        },
        timing: 100,
        computed_hash: this.generateMockHash(assetUrl),
        expected_hash: this.extractExpectedHash(manifestUrl) || this.generateMockHash(assetUrl),
        manifest_content: '{"title": "Mock C2PA Manifest", "format": "C2PA"}'
      };
    }

    try {
      // Step 1: Fetch the asset to find manifest link
      const assetResponse = await this.makeRequest(assetUrl);
      result.headers = assetResponse.headers;
      result.timing += assetResponse.timing;

      let discoveredManifestUrl: string | null = null;
      let method: string = 'unknown';

      // Step 2: Try to extract manifest URL from Link header
      discoveredManifestUrl = this.extractManifestFromLinkHeader(assetResponse.headers);
      if (discoveredManifestUrl) {
        method = 'header_link';
      }

      // Step 3: Fallback to HTML parsing if no Link header
      if (!discoveredManifestUrl && assetResponse.headers['content-type']?.includes('text/html')) {
        discoveredManifestUrl = this.extractManifestFromHTML(assetResponse.content);
        if (discoveredManifestUrl) {
          method = 'html_link';
        }
      }

      // Step 4: Use provided manifest URL as final fallback
      if (!discoveredManifestUrl) {
        discoveredManifestUrl = manifestUrl;
        method = 'provided_url';
      }

      result.method = method;

      // Step 5: Fetch the manifest and verify hash
      if (discoveredManifestUrl) {
        const manifestResponse = await this.makeRequest(discoveredManifestUrl);
        result.timing += manifestResponse.timing;
        
        const computedHash = this.computeSHA256(manifestResponse.content);
        const expectedHash = this.extractExpectedHash(discoveredManifestUrl);
        
        result.computed_hash = computedHash;
        result.expected_hash = expectedHash;
        result.hash_match = computedHash === expectedHash;
        result.manifest_content = manifestResponse.content;
        result.success = result.hash_match;
      }

    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
      result.timing = Date.now() - startTime;
      this.updateCircuitBreaker(false);
    }

    // Update circuit breaker on success
    if (result.success) {
      this.updateCircuitBreaker(true);
    }

    return result;
  }

  /**
   * Batch probe multiple URLs
   */
  public async probeBatch(urls: Array<{ asset_url: string; manifest_url: string }>): Promise<RemoteProbeResult[]> {
    const results: RemoteProbeResult[] = [];
    
    // Process URLs in parallel with concurrency limit
    const concurrencyLimit = 10; // Higher limit for remote testing
    const batches = [];
    
    for (let i = 0; i < urls.length; i += concurrencyLimit) {
      batches.push(urls.slice(i, i + concurrencyLimit));
    }

    for (const batch of batches) {
      const batchPromises = batch.map(({ asset_url, manifest_url }) => 
        this.probeRemote(asset_url, manifest_url)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            url: batch[index].asset_url,
            manifest_url: batch[index].manifest_url,
            method: 'error',
            success: false,
            hash_match: false,
            headers: {},
            timing: 0,
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
          });
        }
      });
    }

    return results;
  }

  /**
   * Extract manifest URL from Link header
   */
  private extractManifestFromLinkHeader(headers: Record<string, string>): string | null {
    const linkHeader = headers['link'];
    if (!linkHeader) return null;

    // Parse Link header for c2pa-manifest
    const links = linkHeader.split(',');
    for (const link of links) {
      const trimmed = link.trim();
      if (trimmed.includes('rel="c2pa-manifest"')) {
        const match = trimmed.match(/<([^>]+)>/);
        return match ? match[1] : null;
      }
    }

    return null;
  }

  /**
   * Extract manifest URL from HTML content (fallback)
   */
  private extractManifestFromHTML(html: string): string | null {
    // Look for link tags with rel="c2pa-manifest"
    const linkMatch = html.match(/<link[^>]+rel=["']c2pa-manifest["'][^>]*href=["']([^"']+)["'][^>]*>/i);
    if (linkMatch) {
      return linkMatch[1];
    }

    // Look for meta tags with c2pa information
    const metaMatch = html.match(/<meta[^>]+name=["']c2pa-manifest["'][^>]*content=["']([^"']+)["'][^>]*>/i);
    if (metaMatch) {
      return metaMatch[1];
    }

    return null;
  }

  /**
   * Compute SHA256 hash of content
   */
  private computeSHA256(content: string | Buffer): string {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Generate mock hash for offline mode
   */
  private generateMockHash(url: string): string {
    return crypto.createHash('sha256').update(url).digest('hex').substring(0, 16);
  }

  /**
   * Extract expected hash from manifest URL
   */
  private extractExpectedHash(manifestUrl: string): string | null {
    // Extract hash from URL like: https://manifests.survival.test/abc123.c2pa
    const match = manifestUrl.match(/\/([^\/]+)\.c2pa$/);
    return match ? match[1] : null;
  }

  /**
   * Check if host is allowed
   */
  private isAllowedHost(hostname: string): boolean {
    return this.config.allowed_hosts.includes(hostname);
  }

  /**
   * Check if hostname is a private IP (SSRF protection)
   */
  private isPrivateIP(hostname: string): boolean {
    // Basic private IP ranges
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^localhost$/,
      /^0\./,
      /^169\.254\./ // Link-local
    ];

    return privateRanges.some(range => range.test(hostname));
  }

  /**
   * Make HTTP request with security validations
   */
  private async makeRequest(url: string, attempt: number = 1): Promise<{
    statusCode: number;
    headers: Record<string, string>;
    content: string;
    timing: number;
  }> {
    return new Promise((resolve, reject) => {
      const startTime = Date.now();
      
      // SECURITY: Validate URL to prevent SSRF
      const parsedUrl = new URL(url);
      const allowedHosts = [
        'cf.survival.test',
        'imgix.survival.test', 
        'cloudinary.survival.test',
        'fastly.survival.test',
        'akamai.survival.test',
        'origin.survival.test',
        'manifests.survival.test',
        'httpbin.org',
        'example.com'
      ];
      
      if (!this.isAllowedHost(parsedUrl.hostname)) {
        return reject(new Error(`Security violation: Host ${parsedUrl.hostname} not allowed`));
      }
      
      if (this.isPrivateIP(parsedUrl.hostname)) {
        return reject(new Error(`Security violation: Private IP ${parsedUrl.hostname} blocked`));
      }

      const client = parsedUrl.protocol === 'https:' ? https : http;
      
      const options = {
        hostname: parsedUrl.hostname,
        port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
        path: parsedUrl.pathname + parsedUrl.search,
        method: 'GET',
        headers: {
          'User-Agent': this.config.user_agent,
          'Accept': '*/*'
        },
        timeout: this.config.timeout,
        // SECURITY: Enable SSL validation
        rejectUnauthorized: true
      };

      const req = client.request(options, (res) => {
        let data = '';
        
        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          const responseTime = Date.now() - startTime;

          resolve({
            statusCode: res.statusCode || 0,
            headers: res.headers as Record<string, string>,
            content: data,
            timing: responseTime
          });
        });
      });

      req.on('error', (error) => {
        if (attempt < this.config.retry_attempts) {
          console.log(`Request failed for ${url}, retrying (${attempt}/${this.config.retry_attempts}): ${error.message}`);
          
          setTimeout(() => {
            this.makeRequest(url, attempt + 1).then(resolve).catch(reject);
          }, this.config.retry_delay * attempt);
          
        } else {
          reject(error);
        }
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`Request timeout after ${this.config.timeout}ms`));
      });

      req.end();
    });
  }
}

// CLI interface
if (require.main === module) {
  const assetUrl = process.argv[2];
  const manifestUrl = process.argv[3];
  
  if (!assetUrl || !manifestUrl) {
    console.error('Usage: ts-node remote.ts <asset_url> <manifest_url>');
    process.exit(1);
  }

  const probe = new RemoteManifestProbe();
  
  probe.probeRemote(assetUrl, manifestUrl).then(result => {
    console.log('Remote probe result:');
    console.log(JSON.stringify(result, null, 2));
    
    process.exit(result.success ? 0 : 1);
  }).catch(error => {
    console.error('Remote probe failed:', error);
    process.exit(1);
  });
}

export { RemoteManifestProbe, RemoteProbeResult };
