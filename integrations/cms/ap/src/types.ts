/**
 * Phase 19: AP Adapter - Types and Configuration
 * Associated Press API integration with quota handling and usage terms
 */

export interface APApiConfig {
  base_url: string;
  api_key: string;
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
    usage_terms: string;
    api_terms: string;
    license_info: string;
  };
}

export interface APAssetResponse {
  item: {
    id: string;
    type: string;
    subtype: string;
    headline: string;
    slugline: string;
    story: {
      body: string;
      dateline: string;
    };
    byline: string;
    creditline: string;
    timestamp_first_created: string;
    timestamp_version_created: string;
    urgency: number;
    priority: number;
    category: string;
    subject: Array<{
      name: string;
      code: string;
      type: string;
    }>;
    location: Array<{
      name: string;
      code: string;
      type: string;
    }>;
    language: string;
    altids: {
      id: string;
      type: string;
    }[];
    links: {
      self: {
        href: string;
      };
      alternate: Array<{
        href: string;
        type: string;
        title: string;
      }>;
      related: Array<{
        href: string;
        type: string;
        title: string;
      }>;
    };
    media: Array<{
      type: string;
      subtype: string;
      width: number;
      height: number;
      renditions: Array<{
        name: string;
        href: string;
        width: number;
        height: number;
        mimetype: string;
      }>;
    }>;
    restrictions: {
      usage: string;
      embargo: string;
      geography: string;
      language: string;
    };
    rights_info: {
      copyright: string;
      credit: string;
      usage_terms: string;
      special_instructions: string;
    };
  };
  links: {
    self: {
      href: string;
    };
    first: {
      href: string;
    };
    last: {
      href: string;
    };
    prev?: {
      href: string;
    };
    next?: {
      href: string;
    };
  };
  total_items: number;
}

export interface APSearchResponse {
  data: Array<APAssetResponse>;
  links: {
    self: {
      href: string;
    };
    first: {
      href: string;
    };
    last: {
      href: string;
    };
    prev?: {
      href: string;
    };
    next?: {
      href: string;
    };
  };
  meta: {
    total_items: number;
    returned_items: number;
    limit: number;
    offset: number;
  };
}

export interface APRateLimitHeaders {
  'x-ratelimit-limit': string;
  'x-ratelimit-remaining': string;
  'x-ratelimit-reset': string;
  'retry-after'?: string;
}

export interface APSyncState {
  cursor?: string;
  etag?: string;
  last_sync_at?: string;
  sync_status: 'pending' | 'running' | 'completed' | 'failed';
  error_message?: string;
  retry_after?: string;
}

export interface APIngestRequest {
  provider_asset_id: string;
  mode: 'reference' | 'download';
  tenant_id: string;
}

export interface APIngestResponse {
  success: boolean;
  asset_id: string;
  manifest_hash: string;
  license_assertion: any;
  error?: string;
}

export interface APUsageTerms {
  general_restrictions: string[];
  geographic_restrictions: string[];
  embargo_restrictions: string[];
  commercial_use: boolean;
  modification_allowed: boolean;
  attribution_required: boolean;
}
