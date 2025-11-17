import { v4 as randomUUID } from 'uuid';
import {
  ClientConfig,
  VerifyAssetRequest,
  VerifyAssetResponse,
  VerifyPageRequest,
  BatchVerifyRequest,
  InjectLinkRequest,
  InjectLinkResponse,
  SignFolderRequest,
  SignFolderResponse,
  ManifestRequest,
  ManifestResponse,
  RequestOptions,
  AsyncPageVerificationResult,
  AsyncBatchVerificationResult,
  JobStatus,
} from './types.js';
import { HttpTransport, TelemetryManager } from './transport.js';

// ============================================================================
// Main Client Implementation
// ============================================================================

export class Client {
  private readonly transport: HttpTransport;
  private readonly telemetry: TelemetryManager;

  constructor(config: ClientConfig) {
    if (!config.apiKey) {
      throw new Error('API key is required. Set it in the config or C2_API_KEY environment variable.');
    }

    this.transport = new HttpTransport(config);
    this.telemetry = new TelemetryManager(config.telemetry);
  }

  // ============================================================================
  // Asset Verification
  // ============================================================================

  /**
   * Verify a single asset by URL or direct content
   * 
   * @param urlOrBuffer - Asset URL or base64-encoded content
   * @param options - Verification options including policy ID
   * @returns Verification result with manifest information
   * 
   * @example
   * ```typescript
   * // Verify by URL
   * const result = await client.verify.asset(
   *   'https://example.com/image.jpg',
   *   { policyId: 'default' }
   * );
   * 
   * // Verify by content
   * const result = await client.verify.asset(
   *   'base64-encoded-content',
   *   { policyId: 'default', contentType: 'image/jpeg' }
   * );
   * ```
   */
  public async verify(
    urlOrBuffer: string,
    options: {
      policyId: string;
      contentType?: string;
      timeout?: number;
      cachedEtag?: string;
      cachedCertThumbprints?: string[];
      enableDelta?: boolean;
    }
  ): Promise<VerifyAssetResponse> {
    const span = this.telemetry.createSpan('verify.asset', {
      policy_id: options.policyId,
      has_content_type: !!options.contentType,
      enable_delta: options.enableDelta || false,
    });

    try {
      // Determine if this is a URL or buffer content
      const isUrl = this.isValidUrl(urlOrBuffer);
      
      const request: VerifyAssetRequest = {
        policy_id: options.policyId,
        timeout: options.timeout || 30000,
        cached_etag: options.cachedEtag || '',
        cached_cert_thumbprints: options.cachedCertThumbprints || [],
        enable_delta: options.enableDelta || false,
      };

      if (isUrl) {
        request.asset_url = urlOrBuffer;
      } else {
        request.asset_buffer = urlOrBuffer;
        if (!options.contentType) {
          throw new Error('Content type is required when verifying by buffer content');
        }
        request.content_type = options.contentType;
      }

      const response = await this.transport.request<VerifyAssetResponse>(
        'POST',
        '/verify/asset',
        request
      );

      span?.setAttribute('verified', response.data.verified);
      span?.setAttribute('cached', (response.data as any).cached || false);

      return response;
    } finally {
      span?.end();
    }
  }

  /**
   * Verify all assets on a web page
   * 
   * @param url - Page URL to verify
   * @param options - Page verification options
   * @returns Async iterator of verification results
   * 
   * @example
   * ```typescript
   * // Verify page assets during build
   * for await (const result of client.verify.page('https://site.example/article-42')) {
   *   if (!result.verified) {
   *     console.error(`Verification failed for ${result.url}: ${result.error}`);
   *     process.exit(1);
   *   }
   * }
   * ```
   */
  public async verifyPage(
    url: string,
    options: {
      followLinks?: boolean;
      maxDepth?: number;
      policyId?: string;
      timeout?: number;
    } = {}
  ): Promise<AsyncIterable<AsyncPageVerificationResult>> {
    const span = this.telemetry.createSpan('verify.page', {
      url: this.sanitizeUrl(url),
      follow_links: options.followLinks ?? true,
      policy_id: options.policyId || 'default',
    });

    try {
      const request: VerifyPageRequest = {
        page_url: url,
        follow_links: options.followLinks || false,
        max_depth: options.maxDepth || 1,
        policy_id: options.policyId || 'default',
        timeout: options.timeout || 30000,
      };

      return this.transport.requestStream<AsyncPageVerificationResult>(
        'POST',
        '/verify/page',
        request
      );
    } finally {
      span?.end();
    }
  }

  // ============================================================================
  // Batch Operations
  // ============================================================================

  /**
   * Batch verify multiple assets
   * 
   * @param assets - Array of asset URLs or references
   * @param options - Batch verification options
   * @returns Async iterator of batch verification results
   * 
   * @example
   * ```typescript
   * // Batch verify multiple URLs
   * const assets = ['https://a.jpg', 'https://b.jpg', 'https://c.jpg'];
   * for await (const result of client.batch.verify(assets, { parallel: true })) {
   *   if (result.result?.verified) {
   *     console.log(`${result.asset.url} verified successfully`);
   *   } else {
   *     console.error(`${result.asset.url} failed: ${result.error?.message}`);
   *   }
   * }
   * ```
   */
  public async batchVerify(
    assets: string[] | Array<{ url: string; id?: string }>,
    options: {
      policyId?: string;
      parallel?: boolean;
      timeoutPerAsset?: number;
    } = {}
  ): Promise<AsyncIterable<AsyncBatchVerificationResult>> {
    const span = this.telemetry.createSpan('batch.verify', {
      asset_count: assets.length,
      parallel: options.parallel ?? true,
      policy_id: options.policyId || 'default',
    });

    try {
      // Normalize assets to AssetReference format
      const request: BatchVerifyRequest = {
        assets: assets.map(asset => {
          const assetRef = typeof asset === 'string' ? { url: asset, id: '' } : asset;
          return {
            url: assetRef.url,
            id: assetRef.id || '',
          };
        }),
        policy_id: options.policyId || 'default',
        parallel: options.parallel || false,
        timeout_per_asset: options.timeoutPerAsset || 30000,
      };

      return this.transport.requestStream<AsyncBatchVerificationResult>(
        'POST',
        '/batch/verify',
        request
      );
    } finally {
      span?.end();
    }
  }

  // ============================================================================
  // Link Management
  // ============================================================================

  /**
   * Inject C2PA manifest Link headers into HTML
   * 
   * @param html - HTML content to modify
   * @param options - Link injection options
   * @returns Modified HTML with injected Link headers
   * 
   * @example
   * ```typescript
   * // Inject Link into static HTML
   * const htmlOut = await client.link.inject(htmlIn, {
   *   manifestUrl: 'https://manif.example/{sha256}.c2pa'
   * });
   * ```
   */
  public async injectLink(
    html: string,
    options: {
      manifestUrl: string;
      strategy?: 'sha256_path' | 'content_hash' | 'custom';
      selector?: string;
    }
  ): Promise<InjectLinkResponse> {
    const span = this.telemetry.createSpan('link.inject', {
      html_length: html.length,
      strategy: options.strategy || 'sha256_path',
    });

    try {
      const request: InjectLinkRequest = {
        html: html,
        manifest_url: options.manifestUrl,
        strategy: options.strategy || 'sha256_path',
        selector: options.selector || '',
      };

      const response = await this.transport.request<InjectLinkResponse>(
        'POST',
        '/link/inject',
        request
      );

      span?.setAttribute('links_injected', response.data.links_injected);

      return response;
    } finally {
      span?.end();
    }
  }

  // ============================================================================
  // Signing Operations
  // ============================================================================

  /**
   * Retro-sign a folder with RFC-3161 timestamps
   * 
   * @param folderPath - Path to folder containing assets to sign
   * @param options - Signing options
   * @returns Job information for tracking signing progress
   * 
   * @example
   * ```typescript
   * // Retro-sign a folder with TSA
   * const job = await client.sign.folder('./public/images', {
   *   tsa: true,
   *   profileId: 'newsroom-default'
   * });
   * 
   * // Check job status
   * const status = await client.getJobStatus(job.data.job_id);
   * ```
   */
  public async signFolder(
    folderPath: string,
    options: {
      profileId: string;
      tsa?: boolean;
      recursive?: boolean;
      filePatterns?: string[];
      idempotencyKey?: string;
    }
  ): Promise<SignFolderResponse> {
    const span = this.telemetry.createSpan('sign.folder', {
      folder_path: folderPath,
      profile_id: options.profileId,
      tsa: options.tsa || false,
      recursive: options.recursive ?? true,
    });

    try {
      const request: SignFolderRequest = {
        folder_path: folderPath,
        profile_id: options.profileId,
        tsa: options.tsa || false,
        recursive: options.recursive || false,
        file_patterns: options.filePatterns || [],
        idempotency_key: options.idempotencyKey || randomUUID(),
      };

      const response = await this.transport.request<SignFolderResponse>(
        'POST',
        '/sign/folder',
        request,
        {
          idempotencyKey: request.idempotency_key || '',
        }
      );

      span?.setAttribute('job_id', response.data.job_id);
      span?.setAttribute('files_found', response.data.files_found);

      return response;
    } finally {
      span?.end();
    }
  }

  // ============================================================================
  // Manifest Operations
  // ============================================================================

  /**
   * Get manifest by content hash
   * 
   * @param hash - SHA-256 hash of the manifest content
   * @param options - Request options
   * @returns Manifest information and content
   * 
   * @example
   * ```typescript
   * // Get manifest with conditional request
   * const manifest = await client.manifest.get(hash, {
   *   cachedEtag: '"abc123def456"'
   * });
   * 
   * if (manifest.data.cached) {
   *   console.log('Using cached manifest');
   * }
   * ```
   */
  public async getManifest(
    hash: string,
    options: {
      cachedEtag?: string;
      format?: 'json' | 'binary';
    } = {}
  ): Promise<ManifestResponse> {
    const span = this.telemetry.createSpan('manifest.get', {
      hash: hash.substring(0, 16) + '...',
      format: options.format || 'json',
    });

    try {
      if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
        throw new Error('Invalid hash format. Must be a 64-character hexadecimal string.');
      }

      const requestOptions: RequestOptions = {};
      if (options.cachedEtag) {
        requestOptions.headers = {
          'If-None-Match': options.cachedEtag,
        };
      }

      const response = await this.transport.request<ManifestResponse>(
        'GET',
        `/manifests/${hash}`,
        undefined,
        requestOptions
      );

      span?.setAttribute('cached', (response.data as any).cached || false);

      return response;
    } finally {
      span?.end();
    }
  }

  /**
   * Store or update a manifest
   * 
   * @param hash - SHA-256 hash of the manifest content
   * @param content - Manifest content (binary or JSON)
   * @param options - Storage options
   * @returns Storage confirmation with metadata
   * 
   * @example
   * ```typescript
   * // Store manifest with idempotency
   * const result = await client.manifest.put(hash, manifestContent, {
   *   contentType: 'application/c2pa',
   *   idempotencyKey: 'unique-key-for-this-manifest'
   * });
   * ```
   */
  public async putManifest(
    hash: string,
    content: string | Uint8Array,
    options: {
      contentType?: string;
      metadata?: Record<string, any>;
      idempotencyKey?: string;
    } = {}
  ): Promise<ManifestResponse> {
    const span = this.telemetry.createSpan('manifest.put', {
      hash: hash.substring(0, 16) + '...',
      content_type: options.contentType || 'application/c2pa',
    });

    try {
      if (!/^[a-fA-F0-9]{64}$/.test(hash)) {
        throw new Error('Invalid hash format. Must be a 64-character hexadecimal string.');
      }

      const request: ManifestRequest = {
        content: typeof content === 'string' ? content : Buffer.from(content).toString('base64'),
        content_type: options.contentType || 'application/c2pa',
        metadata: options.metadata || {},
      };

      const response = await this.transport.request<ManifestResponse>(
        'PUT',
        `/manifests/${hash}`,
        request,
        {
          idempotencyKey: options.idempotencyKey || randomUUID(),
        }
      );

      span?.setAttribute('stored', true);

      return response;
    } finally {
      span?.end();
    }
  }

  // ============================================================================
  // Job Management
  // ============================================================================

  /**
   * Get job status for long-running operations
   * 
   * @param jobId - Job identifier from signing operations
   * @returns Current job status and progress
   */
  public async getJobStatus(jobId: string): Promise<JobStatus> {
    const span = this.telemetry.createSpan('job.get_status', {
      job_id: jobId,
    });

    try {
      const response = await this.transport.request<JobStatus>(
        'GET',
        `/jobs/${jobId}`
      );

      span?.setAttribute('job_status', response.status);

      return response;
    } finally {
      span?.end();
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Get current circuit breaker state
   * 
   * @returns Circuit breaker state ('closed', 'open', or 'half-open')
   */
  public getCircuitBreakerState(): string {
    return this.transport.getCircuitBreakerState();
  }

  /**
   * Check if telemetry is enabled
   * 
   * @returns True if telemetry is enabled
   */
  public isTelemetryEnabled(): boolean {
    return this.telemetry.isEnabled();
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private isValidUrl(string: string): boolean {
    try {
      new URL(string);
      return true;
    } catch {
      return false;
    }
  }

  private sanitizeUrl(url: string): string {
    try {
      const parsed = new URL(url);
      return `${parsed.protocol}//${parsed.host}${parsed.pathname}`;
    } catch {
      return 'invalid-url';
    }
  }
}

// ============================================================================
// Convenience Namespace Classes
// ============================================================================

export class VerifyAPI {
  constructor(private readonly client: Client) {}

  /**
   * Verify a single asset
   */
  public asset(
    urlOrBuffer: string,
    options: {
      policyId: string;
      contentType?: string;
      timeout?: number;
      cachedEtag?: string;
      cachedCertThumbprints?: string[];
      enableDelta?: boolean;
    }
  ): Promise<VerifyAssetResponse> {
    return this.client.verify(urlOrBuffer, options);
  }

  /**
   * Verify page assets
   */
  public page(
    url: string,
    options?: {
      followLinks?: boolean;
      maxDepth?: number;
      policyId?: string;
      timeout?: number;
    }
  ): Promise<AsyncIterable<AsyncPageVerificationResult>> {
    return this.client.verifyPage(url, options);
  }
}

export class BatchAPI {
  constructor(private readonly client: Client) {}

  /**
   * Batch verify multiple assets
   */
  public verify(
    assets: string[] | Array<{ url: string; id?: string }>,
    options?: {
      policyId?: string;
      parallel?: boolean;
      timeoutPerAsset?: number;
    }
  ): Promise<AsyncIterable<AsyncBatchVerificationResult>> {
    return this.client.batchVerify(assets, options);
  }
}

export class LinkAPI {
  constructor(private readonly client: Client) {}

  /**
   * Inject Link headers into HTML
   */
  public inject(
    html: string,
    options: {
      manifestUrl: string;
      strategy?: 'sha256_path' | 'content_hash' | 'custom';
      selector?: string;
    }
  ): Promise<InjectLinkResponse> {
    return this.client.injectLink(html, options);
  }
}

export class SignAPI {
  constructor(private readonly client: Client) {}

  /**
   * Retro-sign a folder
   */
  public folder(
    folderPath: string,
    options: {
      profileId: string;
      tsa?: boolean;
      recursive?: boolean;
      filePatterns?: string[];
      idempotencyKey?: string;
    }
  ): Promise<SignFolderResponse> {
    return this.client.signFolder(folderPath, options);
  }
}

export class ManifestAPI {
  constructor(private readonly client: Client) {}

  /**
   * Get manifest by hash
   */
  public get(
    hash: string,
    options?: {
      cachedEtag?: string;
      format?: 'json' | 'binary';
    }
  ): Promise<ManifestResponse> {
    return this.client.getManifest(hash, options);
  }

  /**
   * Store or update manifest
   */
  public put(
    hash: string,
    content: string | Uint8Array,
    options?: {
      contentType?: string;
      metadata?: Record<string, any>;
      idempotencyKey?: string;
    }
  ): Promise<ManifestResponse> {
    return this.client.putManifest(hash, content, options);
  }
}

// ============================================================================
// Export Main Client with Namespaces
// ============================================================================

export default Client;
