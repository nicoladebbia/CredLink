/**
 * Licensed Content Enforcement Hooks - Server API
 * Phase 32 v1.1 - Partner-facing verification and webhook management
 */
import { type WebhookConfig } from '../core/verify-events.js';
export interface VerifyRequest {
    /** Asset URL to verify */
    asset_url: string;
    /** Optional request context */
    context?: {
        request_origin?: string;
        referrer?: string;
        user_agent?: string;
    };
}
export interface VerifyResponse {
    /** Verification result */
    result: 'ok' | 'warn' | 'block';
    /** License information */
    license: {
        license_uri: string;
        rights_page: string;
        licensor_name?: string;
        usage_terms?: string;
        permission_level: 'permissive' | 'restricted' | 'prohibited';
    };
    /** Manifest hash */
    manifest_hash: string;
    /** Verification signals */
    signals: {
        assertions: string[];
        chain_ok: boolean;
        verification_time_ms: number;
        verifier: string;
    };
    /** Recommended action */
    action: {
        show_badge: boolean;
        badge_state: 'ok' | 'warn' | 'block';
        preview_degrade?: {
            scale: number;
            blur_px: number;
        };
        cta_text?: string;
    };
}
export interface AppealRequest {
    /** Asset identifier */
    asset_id: string;
    /** Manifest hash */
    manifest_hash: string;
    /** User's claim/appeal */
    claim: string;
    /** Contact information (optional) */
    contact_info?: {
        email?: string;
        name?: string;
    };
}
export interface AppealResponse {
    /** Appeal ticket ID */
    ticket_id: string;
    /** Appeal status */
    status: 'submitted' | 'under_review' | 'resolved' | 'rejected';
    /** Estimated response time */
    estimated_response_hours: number;
}
export interface PartnerConfig {
    /** Partner identifier */
    partner_id: string;
    /** Allowed origins for direct access */
    allow_origins: string[];
    /** Origins where enforcement is enabled */
    enforce: string[];
    /** Webhook configurations */
    webhooks: WebhookConfig[];
    /** Partner preferences */
    preferences: {
        preview_degrade: {
            warn: {
                scale: number;
                blur_px: number;
            };
        };
        cta: {
            warn: string;
        };
        telemetry: {
            events: string[];
        };
    };
}
/**
 * Server API handler for license verification and enforcement
 */
export declare class LicenseEnforcementAPI {
    private partnerConfigs;
    private eventHistory;
    /**
     * Register partner webhook configuration
     */
    registerWebhook(partnerId: string, webhookConfig: {
        url: string;
        secret: string;
        filters: string[];
    }): Promise<WebhookConfig>;
    /**
     * Verify asset and return license information
     */
    verifyAsset(request: VerifyRequest): Promise<VerifyResponse>;
    /**
     * Submit appeal for license enforcement
     */
    submitAppeal(request: AppealRequest): Promise<AppealResponse>;
    /**
     * Export events as NDJSON stream
     */
    exportEvents(partnerId: string, filters: {
        from?: string;
        to?: string;
        type?: string;
    }): Promise<string>;
    private extractManifestHash;
    /**
     * Fetch and verify manifest using CAI Verify
     */
    private fetchAndVerifyManifest;
    /**
     * Emit verification event to partner webhooks
     */
    private emitVerificationEvent;
    /**
     * Deliver events to all relevant partner webhooks
     */
    private deliverEventsToPartners;
    /**
     * Configure partner settings
     */
    configurePartner(partnerId: string, config: Partial<PartnerConfig>): Promise<void>;
    /**
     * Get partner configuration
     */
    getPartnerConfig(partnerId: string): PartnerConfig | undefined;
}
//# sourceMappingURL=license-enforcement.d.ts.map