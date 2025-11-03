/**
 * Phase 36 Billing - CAI Verify Service
 * Integration with CAI Verify for demo asset verification
 */

import axios, { AxiosResponse } from 'axios';
import { Redis } from 'ioredis';
import { 
  ValidationResult,
  TimestampVerificationResult,
  RFC3161TimestampResponse,
  APIError
} from '@/types';

export interface CaiVerifyServiceConfig {
  redis: Redis;
  caiVerifyEndpoint: string;
  userAgent: string;
  timeoutMs: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export interface VerifyRequest {
  url: string;
  format?: 'json' | 'jose';
  include_thumbnail?: boolean;
  include_manifest?: boolean;
  trace_id?: string;
}

export interface VerifyResponse {
  verified: boolean;
  manifest_url?: string;
  embedded_manifest?: any;
  remote_manifest?: any;
  validation_results: ValidationResult[];
  trace_id: string;
  verified_at: string;
  thumbnail_url?: string;
  error?: string;
}

export interface ManifestDiscoveryResult {
  url: string;
  method: 'link_header' | 'html_meta' | 'dns_record' | 'direct';
  accessible: boolean;
  last_checked: string;
  response_time_ms: number;
  error?: string;
}

export class CaiVerifyService {
  private redis: Redis;
  private config: CaiVerifyServiceConfig;

  constructor(config: CaiVerifyServiceConfig) {
    this.redis = config.redis;
    this.config = config;
  }

  /**
   * Verify asset with CAI Verify
   */
  async verifyAsset(request: VerifyRequest): Promise<VerifyResponse> {
    try {
      const traceId = request.trace_id || this.generateTraceId();
      
      // Store verification request
      await this.storeVerificationRequest(traceId, request);

      // Call CAI Verify API
      const response = await this.callCaiVerifyApi(request, traceId);

      // Process verification response
      const verifyResponse = await this.processVerifyResponse(response, traceId);

      // Store verification result
      await this.storeVerificationResult(traceId, verifyResponse);

      return verifyResponse;
    } catch (error) {
      throw new Error(`CAI Verify failed: ${error}`);
    }
  }

  /**
   * Verify asset with retry logic
   */
  async verifyAssetWithRetry(request: VerifyRequest): Promise<VerifyResponse> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.retryAttempts; attempt++) {
      try {
        return await this.verifyAsset(request);
      } catch (error) {
        lastError = error as Error;
        
        if (attempt < this.config.retryAttempts) {
          console.warn(`CAI Verify attempt ${attempt} failed, retrying in ${this.config.retryDelayMs}ms:`, error);
          await this.sleep(this.config.retryDelayMs);
        }
      }
    }

    throw lastError!;
  }

  /**
   * Discover remote manifest for asset
   */
  async discoverRemoteManifest(assetUrl: string): Promise<ManifestDiscoveryResult[]> {
    try {
      const discoveryResults: ManifestDiscoveryResult[] = [];

      // Method 1: Link header discovery
      const linkHeaderResult = await this.discoverViaLinkHeader(assetUrl);
      if (linkHeaderResult) {
        discoveryResults.push(linkHeaderResult);
      }

      // Method 2: HTML meta tag discovery
      const metaTagResult = await this.discoverViaHtmlMeta(assetUrl);
      if (metaTagResult) {
        discoveryResults.push(metaTagResult);
      }

      // Method 3: DNS record discovery (if applicable)
      const dnsResult = await this.discoverViaDns(assetUrl);
      if (dnsResult) {
        discoveryResults.push(dnsResult);
      }

      // Method 4: Direct pattern-based discovery
      const directResult = await this.discoverViaDirectPattern(assetUrl);
      if (directResult) {
        discoveryResults.push(directResult);
      }

      return discoveryResults;
    } catch (error) {
      throw new Error(`Manifest discovery failed: ${error}`);
    }
  }

  /**
   * Perform smoke test on asset
   */
  async performSmokeTest(assetUrl: string, transformations: string[] = []): Promise<{
    original: VerifyResponse;
    transformed: Array<{ transform: string; result: VerifyResponse; survival: { embedded: boolean; remote: boolean; badge: boolean } }>;
    summary: { total_transforms: number; embed_survival_rate: number; remote_survival_rate: number; badge_intact_rate: number };
  }> {
    try {
      // Verify original asset
      const original = await this.verifyAssetWithRetry({ url: assetUrl });

      // Default transformations if not provided
      const defaultTransforms = [
        'resize',
        'compress',
        'crop',
        'rotate',
        'format_convert',
        'color_adjust',
        'watermark',
        'metadata_strip',
      ];

      const transformsToTest = transformations.length > 0 ? transformations : defaultTransforms;
      const transformed = [];

      for (const transform of transformsToTest) {
        try {
          const transformedUrl = await this.applyTransformation(assetUrl, transform);
          const result = await this.verifyAssetWithRetry({ url: transformedUrl });

          const survival = {
            embedded: this.checkEmbeddedSurvival(original, result),
            remote: this.checkRemoteSurvival(original, result),
            badge: this.checkBadgeIntegrity(original, result),
          };

          transformed.push({
            transform,
            result,
            survival,
          });
        } catch (error) {
          console.error(`Smoke test failed for ${transform}:`, error);
          // Continue with other transforms
        }
      }

      // Calculate summary
      const totalTransforms = transformed.length;
      const embedSurvivalRate = transformed.filter(t => t.survival.embedded).length / totalTransforms;
      const remoteSurvivalRate = transformed.filter(t => t.survival.remote).length / totalTransforms;
      const badgeIntactRate = transformed.filter(t => t.survival.badge).length / totalTransforms;

      const summary = {
        total_transforms: totalTransforms,
        embed_survival_rate: embedSurvivalRate,
        remote_survival_rate: remoteSurvivalRate,
        badge_intact_rate: badgeIntactRate,
      };

      return {
        original,
        transformed,
        summary,
      };
    } catch (error) {
      throw new Error(`Smoke test failed: ${error}`);
    }
  }

  /**
   * Get verification history for asset
   */
  async getVerificationHistory(assetUrl: string, limit: number = 50): Promise<VerifyResponse[]> {
    try {
      const assetHash = this.hashUrl(assetUrl);
      const pattern = `verify:result:${assetHash}:*`;
      const keys = await this.redis.keys(pattern);

      // Sort keys by timestamp (descending)
      keys.sort((a, b) => {
        const aTime = a.split(':').pop();
        const bTime = b.split(':').pop();
        return bTime.localeCompare(aTime);
      });

      const results: VerifyResponse[] = [];
      for (const key of keys.slice(0, limit)) {
        const data = await this.redis.get(key);
        if (data) {
          results.push(JSON.parse(data));
        }
      }

      return results;
    } catch (error) {
      throw new Error(`Failed to get verification history: ${error}`);
    }
  }

  /**
   * Get verification statistics
   */
  async getVerificationStats(tenantId?: string, startDate?: string, endDate?: string): Promise<{
    total_verifications: number;
    successful_verifications: number;
    failed_verifications: number;
    average_response_time_ms: number;
    most_common_transforms: Array<{ transform: string; count: number }>;
    error_breakdown: Array<{ error_type: string; count: number }>;
  }> {
    try {
      const pattern = tenantId 
        ? `verify:request:${tenantId}:*`
        : `verify:request:*`;
      
      const keys = await this.redis.keys(pattern);
      
      let totalVerifications = 0;
      let successfulVerifications = 0;
      let failedVerifications = 0;
      let totalResponseTime = 0;
      const transformCounts = new Map<string, number>();
      const errorCounts = new Map<string, number>();

      for (const key of keys) {
        const data = await this.redis.get(key);
        if (data) {
          const request: VerifyRequest & { tenant_id?: string; timestamp: string } = JSON.parse(data);
          
          // Filter by date range if provided
          if (startDate && request.timestamp < startDate) continue;
          if (endDate && request.timestamp > endDate) continue;

          totalVerifications++;

          // Get corresponding result
          const resultKey = key.replace('request:', 'result:');
          const resultData = await this.redis.get(resultKey);
          
          if (resultData) {
            const result: VerifyResponse = JSON.parse(resultData);
            
            if (result.verified) {
              successfulVerifications++;
            } else {
              failedVerifications++;
              if (result.error) {
                const errorType = this.categorizeError(result.error);
                errorCounts.set(errorType, (errorCounts.get(errorType) || 0) + 1);
              }
            }

            // Track response time (if available)
            if (result.verified_at && request.timestamp) {
              const responseTime = new Date(result.verified_at).getTime() - new Date(request.timestamp).getTime();
              totalResponseTime += responseTime;
            }
          }
        }
      }

      const averageResponseTime = totalVerifications > 0 ? totalResponseTime / totalVerifications : 0;

      return {
        total_verifications: totalVerifications,
        successful_verifications: successfulVerifications,
        failed_verifications: failedVerifications,
        average_response_time_ms: Math.round(averageResponseTime),
        most_common_transforms: Array.from(transformCounts.entries())
          .map(([transform, count]) => ({ transform, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        error_breakdown: Array.from(errorCounts.entries())
          .map(([error_type, count]) => ({ error_type, count }))
          .sort((a, b) => b.count - a.count),
      };
    } catch (error) {
      throw new Error(`Failed to get verification stats: ${error}`);
    }
  }

  /**
   * Batch verify multiple assets
   */
  async batchVerify(requests: VerifyRequest[]): Promise<Array<{ request: VerifyRequest; result: VerifyResponse; error?: string }>> {
    const results = [];

    for (const request of requests) {
      try {
        const result = await this.verifyAssetWithRetry(request);
        results.push({ request, result });
      } catch (error) {
        results.push({ 
          request, 
          result: { 
            verified: false, 
            validation_results: [], 
            trace_id: '', 
            verified_at: new Date().toISOString(),
            error: error.message 
          } as VerifyResponse,
          error: error.message 
        });
      }
    }

    return results;
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async callCaiVerifyApi(request: VerifyRequest, traceId: string): Promise<AxiosResponse> {
    const payload = {
      url: request.url,
      format: request.format || 'json',
      include_thumbnail: request.include_thumbnail || false,
      include_manifest: request.include_manifest || true,
      trace_id: traceId,
    };

    const response = await axios.post(
      `${this.config.caiVerifyEndpoint}/verify`,
      payload,
      {
        timeout: this.config.timeoutMs,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': this.config.userAgent,
          'X-Trace-ID': traceId,
        },
        validateStatus: (status) => status < 500, // Accept client errors as valid responses
      }
    );

    return response;
  }

  private async processVerifyResponse(response: AxiosResponse, traceId: string): Promise<VerifyResponse> {
    const data = response.data;

    const validationResults: ValidationResult[] = [];

    // Check HTTP status
    validationResults.push({
      check: 'cai_verify_api_response',
      passed: response.status === 200,
      message: response.status === 200 
        ? 'CAI Verify API responded successfully' 
        : `CAI Verify API returned status: ${response.status}`,
      details: { status: response.status, trace_id: traceId },
    });

    if (response.status !== 200) {
      return {
        verified: false,
        validation_results: validationResults,
        trace_id: traceId,
        verified_at: new Date().toISOString(),
        error: `CAI Verify API error: ${response.status}`,
      };
    }

    // Process verification result
    const verified = data.verified === true;
    
    validationResults.push({
      check: 'asset_verification',
      passed: verified,
      message: verified 
        ? 'Asset verification passed' 
        : 'Asset verification failed',
      details: { verified: data.verified, trace_id: traceId },
    });

    // Check for embedded manifest
    const hasEmbeddedManifest = !!data.embedded_manifest;
    validationResults.push({
      check: 'embedded_manifest_present',
      passed: hasEmbeddedManifest,
      message: hasEmbeddedManifest 
        ? 'Embedded C2PA manifest found' 
        : 'No embedded C2PA manifest detected',
      details: { has_embedded: hasEmbeddedManifest },
    });

    // Check for remote manifest
    const hasRemoteManifest = !!data.remote_manifest;
    validationResults.push({
      check: 'remote_manifest_discovered',
      passed: hasRemoteManifest,
      message: hasRemoteManifest 
        ? 'Remote C2PA manifest discovered' 
        : 'No remote C2PA manifest discovered',
      details: { has_remote: hasRemoteManifest },
    });

    return {
      verified,
      manifest_url: data.manifest_url,
      embedded_manifest: data.embedded_manifest,
      remote_manifest: data.remote_manifest,
      validation_results: validationResults,
      trace_id: traceId,
      verified_at: new Date().toISOString(),
      thumbnail_url: data.thumbnail_url,
      error: data.error,
    };
  }

  private async discoverViaLinkHeader(assetUrl: string): Promise<ManifestDiscoveryResult | null> {
    try {
      const startTime = Date.now();
      const response = await axios.head(assetUrl, {
        timeout: this.config.timeoutMs,
        validateStatus: () => true,
      });

      const linkHeader = response.headers['link'];
      if (linkHeader && linkHeader.includes('c2pa-manifest')) {
        const manifestUrl = this.extractManifestUrlFromLinkHeader(linkHeader);
        
        if (manifestUrl) {
          // Test manifest accessibility
          const manifestResponse = await axios.head(manifestUrl, {
            timeout: this.config.timeoutMs,
            validateStatus: () => true,
          });

          return {
            url: manifestUrl,
            method: 'link_header',
            accessible: manifestResponse.status < 400,
            last_checked: new Date().toISOString(),
            response_time_ms: Date.now() - startTime,
            error: manifestResponse.status >= 400 ? `HTTP ${manifestResponse.status}` : undefined,
          };
        }
      }

      return null;
    } catch (error) {
      return {
        url: '',
        method: 'link_header',
        accessible: false,
        last_checked: new Date().toISOString(),
        response_time_ms: 0,
        error: error.message,
      };
    }
  }

  private async discoverViaHtmlMeta(assetUrl: string): Promise<ManifestDiscoveryResult | null> {
    try {
      const startTime = Date.now();
      const response = await axios.get(assetUrl, {
        timeout: this.config.timeoutMs,
        validateStatus: () => true,
      });

      // Parse HTML for meta tags
      const html = response.data;
      const metaRegex = /<meta[^>]*name=["']c2pa-manifest["'][^>]*content=["']([^"']+)["'][^>]*>/gi;
      const matches = Array.from(html.matchAll(metaRegex));

      if (matches.length > 0) {
        const manifestUrl = matches[0][1];
        
        // Test manifest accessibility
        const manifestResponse = await axios.head(manifestUrl, {
          timeout: this.config.timeoutMs,
          validateStatus: () => true,
        });

        return {
          url: manifestUrl,
          method: 'html_meta',
          accessible: manifestResponse.status < 400,
          last_checked: new Date().toISOString(),
          response_time_ms: Date.now() - startTime,
          error: manifestResponse.status >= 400 ? `HTTP ${manifestResponse.status}` : undefined,
        };
      }

      return null;
    } catch (error) {
      return {
        url: '',
        method: 'html_meta',
        accessible: false,
        last_checked: new Date().toISOString(),
        response_time_ms: 0,
        error: error.message,
      };
    }
  }

  private async discoverViaDns(assetUrl: string): Promise<ManifestDiscoveryResult | null> {
    // DNS-based discovery would be implemented here
    // For now, return null as it's less common
    return null;
  }

  private async discoverViaDirectPattern(assetUrl: string): Promise<ManifestDiscoveryResult | null> {
    try {
      const startTime = Date.now();
      const url = new URL(assetUrl);
      const baseUrl = `${url.protocol}//${url.host}`;
      
      // Try common manifest patterns
      const patterns = [
        `${baseUrl}/.well-known/c2pa-manifest.json`,
        `${baseUrl}/c2pa-manifest.json`,
        `${url.pathname.replace(/\/[^\/]*$/, '/.c2pa-manifest.json')}`,
      ];

      for (const manifestUrl of patterns) {
        try {
          const response = await axios.head(manifestUrl, {
            timeout: this.config.timeoutMs,
            validateStatus: () => true,
          });

          if (response.status < 400) {
            return {
              url: manifestUrl,
              method: 'direct',
              accessible: true,
              last_checked: new Date().toISOString(),
              response_time_ms: Date.now() - startTime,
            };
          }
        } catch (error) {
          // Continue trying other patterns
        }
      }

      return null;
    } catch (error) {
      return {
        url: '',
        method: 'direct',
        accessible: false,
        last_checked: new Date().toISOString(),
        response_time_ms: 0,
        error: error.message,
      };
    }
  }

  private async applyTransformation(assetUrl: string, transform: string): Promise<string> {
    // This would integrate with actual transformation service
    // For now, return a mock transformed URL
    const url = new URL(assetUrl);
    url.searchParams.set('transform', transform);
    url.searchParams.set('mock', 'true');
    return url.toString();
  }

  private checkEmbeddedSurvival(original: VerifyResponse, transformed: VerifyResponse): boolean {
    return !!(original.embedded_manifest && transformed.embedded_manifest);
  }

  private checkRemoteSurvival(original: VerifyResponse, transformed: VerifyResponse): boolean {
    return !!(original.remote_manifest && transformed.remote_manifest);
  }

  private checkBadgeIntegrity(original: VerifyResponse, transformed: VerifyResponse): boolean {
    // Badge integrity check would be implemented here
    // For now, assume badge is intact if verification passes
    return transformed.verified;
  }

  private generateTraceId(): string {
    return `trace_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private hashUrl(url: string): string {
    // Simple hash function for URL
    return Buffer.from(url).toString('base64').replace(/[^a-zA-Z0-9]/g, '').substring(0, 16);
  }

  private extractManifestUrlFromLinkHeader(linkHeader: string): string | null {
    const regex = /<([^>]+)>;\s*rel="c2pa-manifest"/i;
    const match = linkHeader.match(regex);
    return match ? match[1] : null;
  }

  private categorizeError(error: string): string {
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('network')) return 'network';
    if (error.includes('404')) return 'not_found';
    if (error.includes('403')) return 'forbidden';
    if (error.includes('500')) return 'server_error';
    if (error.includes('manifest')) return 'manifest_error';
    return 'unknown';
  }

  private async storeVerificationRequest(traceId: string, request: VerifyRequest): Promise<void> {
    const key = `verify:request:${traceId}`;
    const data = {
      ...request,
      timestamp: new Date().toISOString(),
    };
    
    await this.redis.setex(key, 86400 * 7, JSON.stringify(data)); // 7 days retention
  }

  private async storeVerificationResult(traceId: string, result: VerifyResponse): Promise<void> {
    const key = `verify:result:${traceId}`;
    
    await this.redis.setex(key, 86400 * 7, JSON.stringify(result)); // 7 days retention
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}
