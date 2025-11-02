/**
 * Phase 19: Getty Adapter - Types and Configuration
 * Getty Images API integration with OAuth 2.0 and rate limiting
 */

export interface GettyOAuthConfig {
  client_id: string;
  client_secret: string;
  token_url: string;
  scope?: string[];
}

export interface GettyApiConfig {
  base_url: string;
  oauth: GettyOAuthConfig;
  rate_limits: {
    requests_per_minute: number;
    burst: number;
    daily_limit?: number;
  };
  capabilities: {
    download_allowed: boolean;
    embed_allowed: boolean;
    hotlink_allowed: boolean;
    commercial_use_allowed: boolean;
  };
  terms_links: {
    eula: string;
    usage_terms: string;
    api_terms: string;
  };
}

export interface GettyAssetResponse {
  id: string;
  asset_family: string;
  asset_type: string;
  caption: string;
  title: string;
  credit_line: string;
  date_created: string;
  display_sizes: Array<{
    name: string;
    uri: string;
    width: number;
    height: number;
  }>;
  artistic_style?: string;
  color_type?: string;
  composition?: string;
  ethnicity?: string;
  format?: string;
  image_family: string;
  is_illustration: boolean;
  is_editorial: boolean;
  is_vector: boolean;
  keywords: Array<{
    name: string;
    type: string;
  }>;
  license_model: string;
  max_dimensions: {
    width: number;
    height: number;
  };
  orientation: string;
  people?: Array<{
    age_range: string;
    ethnicity: string;
    gender: string;
    name: string;
  }>;
  product_types: string[];
  quality: number;
  referral_destinations: Array<{
    site_name: string;
    uri: string;
  }>;
  signature: string;
}

export interface GettySearchResponse {
  result_count: number;
  images: GettyAssetResponse[];
}

export interface GettyTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface GettyRateLimitHeaders {
  'x-ratelimit-limit': string;
  'x-ratelimit-remaining': string;
  'x-ratelimit-reset': string;
  'retry-after'?: string;
}

export interface GettySyncState {
  cursor?: string;
  etag?: string;
  last_sync_at?: string;
  sync_status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string;
  retry_after?: string;
}

export interface GettyIngestRequest {
  provider_asset_id: string;
  mode: 'reference' | 'download';
  tenant_id: string;
  issuer_domain?: string;
}

export interface GettyIngestResponse {
  success: boolean;
  asset_id: string;
  manifest_hash: string;
  license_assertion: any;
  error?: string;
}
