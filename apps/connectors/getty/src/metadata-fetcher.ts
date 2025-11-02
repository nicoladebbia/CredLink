/**
 * Phase 19: Getty Adapter - Metadata Fetcher and License Mapper
 * Fetches asset metadata and maps to C2PA license assertions
 */

import { GettyOAuthClient } from './oauth-client.js';
import { 
  GettyAssetResponse, 
  GettySearchResponse,
  GettyApiConfig,
  GettyIngestRequest,
  GettyIngestResponse
} from './types.js';
import {
  ProviderAssetMetadata,
  LicenseAssertion,
  buildProviderManifestAssertion,
  generateManifestHash,
  getManifestStoragePath
} from '../../src/assertion-builder.js';

export class GettyMetadataFetcher {
  private oauthClient: GettyOAuthClient;
  private config: GettyApiConfig;
  private readonly DEFAULT_ISSUER_DOMAIN = 'c2c.example.com';
  private readonly MAX_CONCURRENT_REQUESTS = 3;
  private readonly MAX_PAGE_SIZE = 100;

  constructor(config: GettyApiConfig) {
    this.validateConfig(config);
    this.config = config;
    this.oauthClient = new GettyOAuthClient(config);
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: GettyApiConfig): void {
    if (!config.base_url || !this.isValidHttpsUrl(config.base_url)) {
      throw new Error('Valid HTTPS base URL is required');
    }
    
    if (!config.capabilities) {
      throw new Error('Capabilities configuration is required');
    }
    
    if (!config.terms_links) {
      throw new Error('Terms links configuration is required');
    }
  }

  /**
   * Fetch asset metadata by Getty ID with validation
   */
  async fetchAsset(assetId: string): Promise<GettyAssetResponse> {
    if (!assetId || typeof assetId !== 'string' || assetId.trim().length === 0) {
      throw new Error('Valid asset ID is required');
    }

    const sanitizedAssetId = assetId.trim();
    if (!/^[a-zA-Z0-9\-_]+$/.test(sanitizedAssetId)) {
      throw new Error('Invalid asset ID format');
    }

    const url = `${this.config.base_url}/v3/assets/${encodeURIComponent(sanitizedAssetId)}`;
    const response = await this.oauthClient.makeRequest<{ images: GettyAssetResponse[] }>(url);
    
    if (!response.images || response.images.length === 0) {
      throw new Error(`Getty asset not found: ${sanitizedAssetId}`);
    }

    const asset = response.images[0];
    this.validateAssetResponse(asset);
    
    return asset;
  }

  /**
   * Search assets with comprehensive validation and sanitization
   */
  async searchAssets(params: {
    query?: string;
    page?: number;
    page_size?: number;
    asset_family?: string;
    license_model?: string;
    orientation?: string;
    people?: boolean;
    ethnicities?: string[];
  }): Promise<GettySearchResponse> {
    const searchParams = new URLSearchParams();
    
    // Validate and sanitize parameters
    if (params.query) {
      const sanitizedQuery = this.sanitizeSearchQuery(params.query);
      if (sanitizedQuery.length > 0) {
        searchParams.set('phrase', sanitizedQuery);
      }
    }
    
    if (params.page) {
      if (params.page < 1 || params.page > 1000) {
        throw new Error('Page number must be between 1 and 1000');
      }
      searchParams.set('page', params.page.toString());
    }
    
    if (params.page_size) {
      const pageSize = Math.min(params.page_size, this.MAX_PAGE_SIZE);
      if (pageSize < 1) {
        throw new Error('Page size must be at least 1');
      }
      searchParams.set('page_size', pageSize.toString());
    } else {
      searchParams.set('page_size', '50'); // Default page size
    }
    
    // Validate enum parameters
    const validAssetFamilies = ['creative', 'editorial'];
    if (params.asset_family && validAssetFamilies.includes(params.asset_family)) {
      searchParams.set('asset_family', params.asset_family);
    }
    
    const validLicenseModels = ['royaltyfree', 'rightsmanaged', 'editorial'];
    if (params.license_model && validLicenseModels.includes(params.license_model)) {
      searchParams.set('license_model', params.license_model);
    }
    
    const validOrientations = ['horizontal', 'vertical', 'square'];
    if (params.orientation && validOrientations.includes(params.orientation)) {
      searchParams.set('orientation', params.orientation);
    }
    
    if (params.people !== undefined) {
      searchParams.set('people', params.people.toString());
    }
    
    if (params.ethnicities && Array.isArray(params.ethnicities)) {
      const validEthnicities = params.ethnicities.filter(e => e && typeof e === 'string');
      if (validEthnicities.length > 0) {
        searchParams.set('ethnicities', validEthnicities.join(','));
      }
    }

    const url = `${this.config.base_url}/v3/search/images?${searchParams.toString()}`;
    const response = await this.oauthClient.makeRequest<GettySearchResponse>(url);
    
    this.validateSearchResponse(response);
    return response;
  }

  /**
   * Map Getty asset response to provider metadata format with validation
   */
  private mapGettyAssetToMetadata(asset: GettyAssetResponse): ProviderAssetMetadata {
    // Determine license type based on asset family and license model
    let licenseType: 'editorial' | 'creative' | 'other' = 'other';
    if (asset.is_editorial) {
      licenseType = 'editorial';
    } else if (asset.license_model === 'royaltyfree' || asset.license_model === 'rightsmanaged') {
      licenseType = 'creative';
    }

    // Determine asset URL based on capabilities and validation
    let assetUrl: string | undefined;
    if (this.config.capabilities.hotlink_allowed && asset.display_sizes?.length > 0) {
      const previewSize = asset.display_sizes.find(size => size.name === 'preview') || asset.display_sizes[0];
      if (previewSize?.uri && this.isValidHttpsUrl(previewSize.uri)) {
        assetUrl = previewSize.uri;
      }
    }

    // Extract restrictions based on license model and asset type
    const restrictions: string[] = [];
    if (asset.is_editorial) {
      restrictions.push('Editorial use only');
    }
    if (asset.license_model === 'rightsmanaged') {
      restrictions.push('Rights-managed license');
    }
    if (!this.config.capabilities.commercial_use_allowed) {
      restrictions.push('No commercial use without extended rights');
    }

    // Determine release status with validation
    const modelReleaseStatus = asset.people && asset.people.length > 0 
      ? (asset.people.some(p => p.name?.trim()) ? 'MR-APPLIED' : 'MR-NONE')
      : 'MR-NOT-APPLICABLE';

    const propertyReleaseStatus = 'PR-NOT-APPLICABLE'; // Getty doesn't typically provide property release info

    // Validate date_created
    let rightsWindow: { from: Date; to?: Date } | undefined;
    if (asset.date_created) {
      const createdDate = new Date(asset.date_created);
      if (!isNaN(createdDate.getTime())) {
        rightsWindow = {
          from: createdDate,
          to: undefined // Getty assets typically don't have explicit end dates
        };
      }
    }

    return {
      provider: 'getty',
      provider_asset_id: asset.id,
      asset_url: assetUrl,
      asset_kind: this.validateAssetKind(asset.asset_type as string),
      title: this.sanitizeString(asset.title),
      caption: this.sanitizeString(asset.caption),
      credit: this.sanitizeString(asset.credit_line),
      license: {
        license_id: asset.id,
        license_type: licenseType,
        license_url: this.config.terms_links.eula,
        licensor_name: 'Getty Images',
        usage_terms: this.config.terms_links.usage_terms || 'See provider terms',
        restrictions,
        download_allowed: this.config.capabilities.download_allowed,
        embed_allowed: this.config.capabilities.embed_allowed,
        commercial_use_allowed: this.config.capabilities.commercial_use_allowed && !asset.is_editorial
      },
      rights_window: rightsWindow,
      releases: {
        model_release_status: modelReleaseStatus as any,
        property_release_status: propertyReleaseStatus as any,
        release_notes: asset.people ? `${asset.people.length} people detected` : undefined
      },
      source_urls: {
        api_endpoint: `${this.config.base_url}/v3/assets/${encodeURIComponent(asset.id)}`,
        asset_page: this.validateUrl(asset.referral_destinations?.[0]?.uri),
        embed_url: this.config.capabilities.embed_allowed ? 
          this.validateUrl(asset.referral_destinations?.find(d => d.site_name === 'embed')?.uri) : 
          undefined
      }
    };
  }

  /**
   * Ingest Getty asset and create license assertion with comprehensive error handling
   */
  async ingestAsset(request: GettyIngestRequest): Promise<GettyIngestResponse> {
    try {
      // Validate request
      this.validateIngestRequest(request);
      
      // Fetch asset metadata
      const asset = await this.fetchAsset(request.provider_asset_id);
      
      // Map to provider metadata format
      const metadata = this.mapGettyAssetToMetadata(asset);
      
      // Build C2PA manifest assertion
      const manifestAssertion = buildProviderManifestAssertion(
        metadata,
        request.tenant_id,
        request.issuer_domain || this.DEFAULT_ISSUER_DOMAIN
      );
      
      // Generate manifest hash and storage path
      const manifestHash = generateManifestHash(manifestAssertion);
      const storagePath = getManifestStoragePath(manifestHash);
      
      // TODO: Store manifest to R2 when storage is available
      // await this.storageClient.put(storagePath, JSON.stringify(manifestAssertion, null, 2));
      
      // TODO: Store metadata to database when DB is available
      // await this.dbClient.insert('provider_assets', { ... });
      // await this.dbClient.insert('provider_licenses', { ... });
      // await this.dbClient.insert('rights_window', { ... });
      // await this.dbClient.insert('releases', { ... });
      
      return {
        success: true,
        asset_id: asset.id,
        manifest_hash: manifestHash,
        license_assertion: manifestAssertion.assertions.license
      };
      
    } catch (error) {
      console.error('Getty ingest failed:', error);
      return {
        success: false,
        asset_id: request.provider_asset_id,
        manifest_hash: '',
        license_assertion: null,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Batch ingest multiple assets with rate limit awareness
   */
  async ingestBatch(requests: GettyIngestRequest[]): Promise<GettyIngestResponse[]> {
    if (!Array.isArray(requests) || requests.length === 0) {
      throw new Error('Valid requests array is required');
    }
    
    if (requests.length > 50) {
      throw new Error('Maximum batch size is 50 requests');
    }

    const results: GettyIngestResponse[] = [];
    
    // Process with concurrency limit to respect rate limits
    for (let i = 0; i < requests.length; i += this.MAX_CONCURRENT_REQUESTS) {
      const batch = requests.slice(i, i + this.MAX_CONCURRENT_REQUESTS);
      const batchResults = await Promise.allSettled(
        batch.map(request => this.ingestAsset(request))
      );
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            success: false,
            asset_id: batch[index].provider_asset_id,
            manifest_hash: '',
            license_assertion: null,
            error: result.reason instanceof Error ? result.reason.message : 'Unknown error'
          });
        }
      });
      
      // Add small delay between batches to respect rate limits
      if (i + this.MAX_CONCURRENT_REQUESTS < requests.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return results;
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return this.oauthClient.getRateLimitStatus();
  }

  /**
   * Utility methods for validation and sanitization
   */

  private validateIngestRequest(request: GettyIngestRequest): void {
    if (!request) {
      throw new Error('Request is required');
    }
    
    if (!request.provider_asset_id || typeof request.provider_asset_id !== 'string') {
      throw new Error('Valid provider asset ID is required');
    }
    
    if (!request.tenant_id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(request.tenant_id)) {
      throw new Error('Valid tenant ID is required');
    }
    
    if (request.issuer_domain && !this.isValidDomain(request.issuer_domain)) {
      throw new Error('Invalid issuer domain');
    }
  }

  private validateAssetResponse(asset: GettyAssetResponse): void {
    if (!asset || !asset.id) {
      throw new Error('Invalid asset response: missing ID');
    }
    
    if (!asset.asset_type) {
      throw new Error('Invalid asset response: missing asset type');
    }
  }

  private validateSearchResponse(response: GettySearchResponse): void {
    if (!response || typeof response !== 'object') {
      throw new Error('Invalid search response');
    }
    
    if (!Array.isArray(response.images)) {
      throw new Error('Invalid search response: missing images array');
    }
  }

  private validateAssetKind(assetType: string): 'image' | 'video' | 'audio' {
    const validTypes = ['image', 'video', 'audio'];
    const normalizedType = assetType.toLowerCase();
    
    if (validTypes.includes(normalizedType)) {
      return normalizedType as 'image' | 'video' | 'audio';
    }
    
    // Default to image for unknown types
    return 'image';
  }

  private sanitizeSearchQuery(query: string): string {
    return query
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/['"]/g, '') // Remove quotes
      .trim()
      .substring(0, 200); // Limit length
  }

  private sanitizeString(input?: string): string | undefined {
    if (!input) return undefined;
    
    return input
      .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .trim();
  }

  private validateUrl(url?: string): string | undefined {
    if (!url) return undefined;
    
    if (!this.isValidHttpsUrl(url)) {
      return undefined;
    }
    
    return url;
  }

  private isValidHttpsUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private isValidDomain(domain: string): boolean {
    try {
      new URL(`https://${domain}`);
      return true;
    } catch {
      return false;
    }
  }
}
