/**
 * Licensed Content Enforcement Hooks - CMS/CDN Adapters
 * Phase 32 v1.1 - WordPress, Shopify, and Cloudflare Worker integrations
 */
export interface WordPressConfig {
    /** API endpoint for verification */
    api_endpoint: string;
    /** Partner ID */
    partner_id: string;
    /** Webhook configuration */
    webhook_url: string;
    /** Preview degradation settings */
    preview_degrade: {
        enabled: boolean;
        scale: number;
        blur_px: number;
    };
}
/**
 * WordPress plugin adapter for license enforcement
 */
export declare class WordPressLicenseAdapter {
    constructor(_config: WordPressConfig);
}
export interface ShopifyConfig {
    /** App API key */
    api_key: string;
    /** App secret */
    app_secret: string;
    /** Store domain */
    store_domain: string;
    /** Theme app extension ID */
    extension_id: string;
    /** Verification settings */
    verification: {
        enabled: boolean;
        auto_block: boolean;
        allowlist: string[];
    };
}
/**
 * Shopify theme app extension adapter
 */
export declare class ShopifyLicenseAdapter {
    constructor(_config: ShopifyConfig);
}
export interface CloudflareConfig {
    /** Manifest server URL */
    manifest_server: string;
    /** Partner ID */
    partner_id: string;
    /** Paths to preserve */
    preserve_paths: string[];
    /** Webhook URL for events */
    webhook_url: string;
}
/**
 * Cloudflare Worker adapter for manifest injection and verification
 */
export declare class CloudflareWorkerAdapter {
    private config;
    constructor(config: CloudflareConfig);
    /**
     * Cloudflare Worker fetch handler
     */
    fetchHandler(request: Request, _env: any, _ctx: any): Promise<Response>;
    /**
     * Handle GET requests - inject manifest links
     */
    private handleGetRequest;
    /**
     * Handle image responses - add Link header for manifest
     */
    private handleImageResponse;
    /**
     * Handle HTML responses - inject badge script
     */
    private handleHtmlResponse;
    /**
     * Handle POST requests - verification endpoints
     */
    private handlePostRequest;
    /**
     * Handle verification requests
     */
    private handleVerificationRequest;
    /**
     * Handle event requests
     */
    private handleEventRequest;
    /**
     * Check if path should be processed
     */
    private shouldProcessPath;
    /**
     * Calculate SHA-256 hash of buffer
     */
    private calculateHash;
    /**
     * Verify webhook signature
     */
    private verifyWebhookSignature;
    /**
     * Forward event to partner webhook
     */
    private forwardEventToPartner;
    /**
     * Generate Cloudflare Worker script
     */
    generateWorkerScript(): string;
}
export { WordPressLicenseAdapter as WordPress, ShopifyLicenseAdapter as Shopify, CloudflareWorkerAdapter as CloudflareWorker };
//# sourceMappingURL=cms-adapters.d.ts.map