/**
 * Phase 19: Marketplace Connectors - License Assertion Types
 * IPTC-compliant license assertions for C2PA manifests
 */
export type LicenseProvider = 'getty' | 'ap' | 'shutterstock' | 'reuters';
export interface LicenseAssertion {
    provider: LicenseProvider;
    license_id: string;
    license_type?: 'editorial' | 'creative' | 'other';
    license_url?: string;
    rights_window?: {
        from?: string;
        to?: string;
    };
    restrictions?: string[];
    iptc: {
        LicensorName?: string;
        WebStatement?: string;
        UsageTerms?: string;
        Copyright?: string;
        Credit?: string;
        Source?: string;
    };
}
export interface ReleaseAssertion {
    model_release_status: 'MR-NOT-APPLICABLE' | 'MR-NONE' | 'MR-APPLIED' | 'MR-REQUIRED';
    property_release_status: 'PR-NOT-APPLICABLE' | 'PR-NONE' | 'PR-APPLIED' | 'PR-REQUIRED';
    release_notes?: string;
}
export interface ProviderManifestAssertion {
    version: '1.0';
    asset: {
        primary_url: string;
        kind: 'image' | 'video' | 'audio';
    };
    assertions: {
        license: LicenseAssertion;
        releases: ReleaseAssertion;
    };
    links: {
        source_provider: string;
        license_terms?: string;
        asset_page?: string;
    };
    signature: {
        alg: 'ES256';
        issuer: string;
        created_at: string;
    };
}
export interface ProviderAssetMetadata {
    provider: LicenseProvider;
    provider_asset_id: string;
    asset_url?: string;
    asset_kind: 'image' | 'video' | 'audio';
    title?: string;
    caption?: string;
    credit?: string;
    license: {
        license_id: string;
        license_type?: 'editorial' | 'creative' | 'other';
        license_url?: string;
        licensor_name?: string;
        usage_terms?: string;
        restrictions?: string[];
        download_allowed: boolean;
        embed_allowed: boolean;
        commercial_use_allowed: boolean;
    };
    rights_window?: {
        from?: Date;
        to?: Date;
    };
    releases: {
        model_release_status: 'MR-NOT-APPLICABLE' | 'MR-NONE' | 'MR-APPLIED' | 'MR-REQUIRED';
        property_release_status: 'PR-NOT-APPLICABLE' | 'PR-NONE' | 'PR-APPLIED' | 'PR-REQUIRED';
        release_notes?: string;
    };
    source_urls: {
        api_endpoint: string;
        asset_page?: string;
        embed_url?: string;
    };
}
export interface ConnectorConfig {
    provider: LicenseProvider;
    api_base_url: string;
    oauth_config?: {
        client_id: string;
        client_secret: string;
        token_url: string;
        scope?: string[];
    };
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
        eula?: string;
        usage_terms?: string;
        api_terms?: string;
    };
}
export interface TenantContext {
    tenant_id: string;
    is_authenticated: boolean;
    permissions: string[];
}
export interface ValidationResult {
    is_valid: boolean;
    errors: string[];
    warnings: string[];
}
export interface SecurityContext {
    tenant_id: string;
    user_id?: string;
    session_id?: string;
    request_timestamp: number;
    client_ip?: string;
    user_agent?: string;
}
export interface RateLimitStatus {
    requests_remaining: number;
    reset_timestamp: number;
    retry_after?: number;
    daily_remaining?: number;
    is_rate_limited: boolean;
}
export interface QuotaInfo {
    current_usage: number;
    limit: number;
    reset_time: Date;
    usage_window: 'minute' | 'hour' | 'day';
}
export interface ConnectorError {
    code: string;
    message: string;
    provider: LicenseProvider;
    retry_after?: number;
    is_transient: boolean;
    details?: Record<string, any>;
}
export interface SyncState {
    provider: LicenseProvider;
    tenant_id: string;
    last_sync_at: Date;
    cursor?: string;
    etag?: string;
    sync_status: 'pending' | 'running' | 'completed' | 'failed';
    error_message?: string;
    retry_after?: Date;
}
//# sourceMappingURL=types.d.ts.map