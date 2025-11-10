/**
 * Phase 19: AP Adapter - Metadata Fetcher with Usage Terms
 * Fetches AP content metadata and maps to C2PA license assertions with usage terms
 */

import { APApiClient } from './api-client.js';
import { 
  APAssetResponse, 
  APSearchResponse,
  APApiConfig,
  APIngestRequest,
  APIngestResponse,
  APUsageTerms
} from './types.js';
import {
  ProviderAssetMetadata,
  LicenseAssertion,
  buildProviderManifestAssertion,
  generateManifestHash,
  getManifestStoragePath
} from '../../src/assertion-builder.js';

export class APMetadataFetcher {
  private apiClient: APApiClient;
  private config: APApiConfig;

  constructor(config: APApiConfig) {
    this.config = config;
    this.apiClient = new APApiClient(config);
  }

  /**
   * Fetch content metadata by AP ID
   */
  async fetchContent(contentId: string): Promise<APAssetResponse> {
    const url = `${this.config.base_url}/content/${contentId}`;
    const response = await this.apiClient.makeRequest<APAssetResponse>(url);
    
    if (!response.item) {
      throw new Error(`AP content not found: ${contentId}`);
    }

    return response;
  }

  /**
   * Search content with optional filters
   */
  async searchContent(params: {
    query?: string;
    page?: number;
    page_size?: number;
    type?: string;
    subtype?: string;
    category?: string;
    language?: string;
    date_range?: {
      from: string;
      to: string;
    };
  }): Promise<APSearchResponse> {
    const searchParams = new URLSearchParams();
    
    if (params.query) searchParams.set('q', params.query);
    if (params.page) searchParams.set('page', params.page.toString());
    if (params.page_size) searchParams.set('page_size', params.page_size.toString());
    if (params.type) searchParams.set('type', params.type);
    if (params.subtype) searchParams.set('subtype', params.subtype);
    if (params.category) searchParams.set('category', params.category);
    if (params.language) searchParams.set('language', params.language);
    if (params.date_range) {
      searchParams.set('date_from', params.date_range.from);
      searchParams.set('date_to', params.date_range.to);
    }

    const url = `${this.config.base_url}/content?${searchParams.toString()}`;
    return await this.apiClient.makeRequest<APSearchResponse>(url);
  }

  /**
   * Parse AP restrictions into structured usage terms
   */
  private parseUsageTerms(restrictions: any): APUsageTerms {
    const usageTerms: APUsageTerms = {
      general_restrictions: [],
      geographic_restrictions: [],
      embargo_restrictions: [],
      commercial_use: true,
      modification_allowed: true,
      attribution_required: true
    };

    // Parse general restrictions
    if (restrictions.usage) {
      usageTerms.general_restrictions.push(restrictions.usage);
    }

    // Parse geographic restrictions
    if (restrictions.geography) {
      usageTerms.geographic_restrictions.push(restrictions.geography);
    }

    // Parse embargo restrictions
    if (restrictions.embargo) {
      usageTerms.embargo_restrictions.push(restrictions.embargo);
    }

    // Parse special instructions from rights info
    if (restrictions.special_instructions) {
      usageTerms.general_restrictions.push(restrictions.special_instructions);
    }

    // Determine commercial use based on content type and restrictions
    if (restrictions.usage?.includes('Editorial only') || 
        restrictions.usage?.includes('Non-commercial')) {
      usageTerms.commercial_use = false;
    }

    // Determine modification permissions
    if (restrictions.usage?.includes('No modifications') || 
        restrictions.usage?.includes('No alterations')) {
      usageTerms.modification_allowed = false;
    }

    return usageTerms;
  }

  /**
   * Map AP content response to provider metadata format
   */
  private mapAPContentToMetadata(content: APAssetResponse): ProviderAssetMetadata {
    const item = content.item;
    const usageTerms = this.parseUsageTerms(item.restrictions);

    // Determine asset URL based on capabilities
    let assetUrl: string | undefined;
    if (this.config.capabilities.hotlink_allowed && item.media.length > 0) {
      // Use primary media rendition for hotlinking if allowed
      const primaryMedia = item.media.find(m => m.type === 'image' || m.type === 'video');
      if (primaryMedia && primaryMedia.renditions.length > 0) {
        const previewRendition = primaryMedia.renditions.find(r => r.name === 'preview') || 
                                primaryMedia.renditions[0];
        assetUrl = previewRendition?.href;
      }
    }

    // Extract license information from rights info
    const licenseId = item.altids?.find(id => id.type === 'content_id')?.id || item.id;
    const licenseType = usageTerms.commercial_use ? 'creative' : 'editorial';

    // Build restrictions array
    const restrictions: string[] = [
      ...usageTerms.general_restrictions,
      ...usageTerms.geographic_restrictions,
      ...usageTerms.embargo_restrictions
    ];

    if (!usageTerms.commercial_use) {
      restrictions.push('No commercial use');
    }

    if (!usageTerms.modification_allowed) {
      restrictions.push('No modifications allowed');
    }

    // Determine release status (AP typically doesn't provide model/property release info)
    const modelReleaseStatus = 'MR-NOT-APPLICABLE';
    const propertyReleaseStatus = 'PR-NOT-APPLICABLE';

    // Extract media type
    const assetKind = item.media.length > 0 
      ? (item.media[0].type as 'image' | 'video' | 'audio')
      : 'image'; // Default to image for text content to satisfy type constraints

    return {
      provider: 'ap',
      provider_asset_id: item.id,
      asset_url: assetUrl,
      asset_kind: assetKind,
      title: item.headline,
      caption: item.story?.body || item.slugline,
      credit: item.creditline || item.byline,
      license: {
        license_id: licenseId,
        license_type: licenseType,
        license_url: this.config.terms_links.license_info,
        licensor_name: 'Associated Press',
        usage_terms: item.rights_info?.usage_terms || this.config.terms_links.usage_terms,
        restrictions,
        download_allowed: this.config.capabilities.download_allowed,
        embed_allowed: this.config.capabilities.embed_allowed,
        commercial_use_allowed: usageTerms.commercial_use && this.config.capabilities.commercial_use_allowed
      },
      rights_window: {
        from: new Date(item.timestamp_first_created),
        to: undefined // AP content typically doesn't have explicit end dates
      },
      releases: {
        model_release_status: modelReleaseStatus as any,
        property_release_status: propertyReleaseStatus as any,
        release_notes: item.subject?.map(s => s.name).join(', ')
      },
      source_urls: {
        api_endpoint: `${this.config.base_url}/content/${item.id}`,
        asset_page: item.links?.alternate?.[0]?.href
      }
    };
  }

  /**
   * Ingest AP content and create license assertion
   */
  async ingestContent(request: APIngestRequest): Promise<APIngestResponse> {
    try {
      // Check if we can make a request
      const canRequest = this.apiClient.canMakeRequest();
      if (!canRequest.can_request) {
        return {
          success: false,
          asset_id: request.provider_asset_id,
          manifest_hash: '',
          license_assertion: null,
          error: `Rate limit exceeded: ${canRequest.reason}. Wait ${canRequest.wait_time_ms}ms.`
        };
      }

      // Fetch content metadata
      const content = await this.apiClient.makeRequest<APAssetResponse>(
        `${this.config.base_url}/content/${request.provider_asset_id}`
      );
      
      // Map to provider metadata format
      const metadata = this.mapAPContentToMetadata(content);
      
      // Build C2PA manifest assertion
      const manifestAssertion = buildProviderManifestAssertion(
        metadata,
        request.tenant_id,
        'c2c.example.com' // TODO: Make configurable
      );
      
      // Generate manifest hash and storage path
      const manifestHash = generateManifestHash(manifestAssertion);
      const storagePath = getManifestStoragePath(manifestHash);
      
      // TODO: Store manifest to R2
      // await this.storageClient.put(storagePath, JSON.stringify(manifestAssertion, null, 2));
      
      // TODO: Store metadata to database
      // await this.dbClient.insert('provider_assets', { ... });
      // await this.dbClient.insert('provider_licenses', { ... });
      // await this.dbClient.insert('rights_window', { ... });
      // await this.dbClient.insert('releases', { ... });
      
      return {
        success: true,
        asset_id: content.item.id,
        manifest_hash: manifestHash,
        license_assertion: manifestAssertion.assertions.license
      };
      
    } catch (error) {
      console.error('AP ingest failed:', error);
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
   * Batch ingest multiple content items
   */
  async ingestBatch(requests: APIngestRequest[]): Promise<APIngestResponse[]> {
    const results: APIngestResponse[] = [];
    
    // Process with concurrency limit to respect rate limits
    const concurrencyLimit = 2; // AP has stricter limits
    for (let i = 0; i < requests.length; i += concurrencyLimit) {
      const batch = requests.slice(i, i + concurrencyLimit);
      const batchResults = await Promise.allSettled(
        batch.map(request => this.ingestContent(request))
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
    }
    
    return results;
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return this.apiClient.getRateLimitStatus();
  }

  /**
   * Check if we can make requests
   */
  canMakeRequest() {
    return this.apiClient.canMakeRequest();
  }
}
