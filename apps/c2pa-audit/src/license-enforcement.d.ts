/**
 * Licensed Content Enforcement Hooks - Main Export
 * Phase 32 v1.1 - Complete license enforcement system
 */
export { LicenseMetadataEncoder, type LicenseMetadataAssertion, type LicenseAssertionValidation } from './core/license-metadata.js';
export { VerifyEventSystem, type VerifyEvent, type WebhookConfig, type EventDelivery } from './core/verify-events.js';
export { LicenseEnforcementAPI, type VerifyRequest, type VerifyResponse, type AppealRequest, type AppealResponse, type PartnerConfig } from './api/license-enforcement.js';
export { C2LicenseBadge, type BadgeConfig, type BadgeState, initializeC2Badges, generateBadgeHTML, generateBadgeStyles } from './ui/c2-badge-server.js';
export { WordPressLicenseAdapter as WordPress, ShopifyLicenseAdapter as Shopify, CloudflareWorkerAdapter as CloudflareWorker, type WordPressConfig, type ShopifyConfig, type CloudflareConfig } from './integrations/cms-adapters.js';
export type { C2PAManifest, ClaimSignature, Assertion, Ingredient, Certificate, ValidationStatus, ValidationCode } from './types/index.js';
import { type LicenseMetadataAssertion as LicenseMetadataAssertionType, type LicenseAssertionValidation as LicenseAssertionValidationType } from './core/license-metadata.js';
import { VerifyEventSystem as VerifyEventSystemInternal, type WebhookConfig as WebhookConfigType } from './core/verify-events.js';
import { LicenseEnforcementAPI as LicenseEnforcementAPIInternal, type VerifyRequest as VerifyRequestType, type VerifyResponse as VerifyResponseType, type AppealRequest as AppealRequestType, type AppealResponse as AppealResponseType, type PartnerConfig as PartnerConfigType } from './api/license-enforcement.js';
/**
 * Main License Enforcement System class
 * Provides a unified interface for all Phase 32 functionality
 */
export declare class LicensedContentEnforcement {
    private api;
    constructor(partnerConfig?: PartnerConfigType);
    /**
     * Verify an asset and return license information
     */
    verifyAsset(request: VerifyRequestType): Promise<VerifyResponseType>;
    /**
     * Submit an appeal for license enforcement
     */
    submitAppeal(request: AppealRequestType): Promise<AppealResponseType>;
    /**
     * Register a webhook for event delivery
     */
    registerWebhook(partnerId: string, webhookConfig: {
        url: string;
        secret: string;
        filters: string[];
    }): Promise<WebhookConfigType>;
    /**
     * Export events as NDJSON stream
     */
    exportEvents(partnerId: string, filters: {
        from?: string;
        to?: string;
        type?: string;
    }): Promise<string>;
    /**
     * Create and validate license metadata assertion
     */
    createLicenseAssertion(license: {
        license_uri: string;
        rights_page: string;
        licensor_name: string;
        usage_terms: string;
    }): LicenseMetadataAssertionType;
    /**
     * Validate license metadata assertion
     */
    validateLicenseAssertion(assertion: LicenseMetadataAssertionType): LicenseAssertionValidationType;
    /**
     * Initialize C2 badges on the page
     */
    initializeBadges(): void;
    /**
     * Get Creative Commons license catalog
     */
    getCCLicenseCatalog(): Record<string, {
        uri: string;
        name: string;
        requiresAttribution: boolean;
        commercialUse: boolean;
        derivatives: boolean;
    }>;
    /**
     * Run comprehensive acceptance tests
     */
    runAcceptanceTests(): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Get API instance for advanced usage
     */
    getAPI(): LicenseEnforcementAPIInternal;
    /**
     * Get event system instance for advanced usage
     */
    getEventSystem(): typeof VerifyEventSystemInternal;
}
/**
 * Default export - main enforcement system instance
 */
declare const _default: LicensedContentEnforcement;
export default _default;
/**
 * Version information
 */
export declare const VERSION = "1.1.0";
export declare const PHASE = "Phase 32 \u2014 Licensed Content Enforcement Hooks";
/**
 * Feature flags for enabling/disabling components
 */
export declare const FEATURES: {
    readonly LICENSE_METADATA: true;
    readonly WEBHOOK_EVENTS: true;
    readonly BADGE_UI: true;
    readonly CMS_INTEGRATIONS: true;
    readonly ACCEPTANCE_TESTS: true;
};
/**
 * Configuration defaults
 */
export declare const DEFAULTS: {
    readonly BADGE_CONFIG: {
        readonly position: "top-right";
        readonly size: "medium";
        readonly preview_degrade: {
            readonly warn: {
                readonly scale: 0.4;
                readonly blur_px: 6;
            };
            readonly block: {
                readonly scale: 0.2;
                readonly blur_px: 12;
            };
        };
        readonly cta: {
            readonly warn: "View license / Provide proof";
            readonly block: "License required for this use";
        };
        readonly show_license_info: true;
    };
    readonly WEBHOOK_CONFIG: {
        readonly max_retries: 12;
        readonly base_retry_delay: 1000;
        readonly max_retry_delay: number;
        readonly timestamp_skew: number;
        readonly replay_cache_ttl: number;
    };
    readonly API_CONFIG: {
        readonly verification_timeout: 30000;
        readonly event_export_limit: 10000;
        readonly appeal_response_hours: 48;
    };
};
//# sourceMappingURL=license-enforcement.d.ts.map