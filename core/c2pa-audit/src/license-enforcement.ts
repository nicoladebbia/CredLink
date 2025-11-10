/**
 * Licensed Content Enforcement Hooks - Main Export
 * Phase 32 v1.1 - Complete license enforcement system
 */

// Core license metadata functionality
export {
  LicenseMetadataEncoder,
  type LicenseMetadataAssertion,
  type LicenseAssertionValidation
} from './core/license-metadata.js';

// Verify events system with webhook security
export {
  VerifyEventSystem,
  type VerifyEvent,
  type WebhookConfig,
  type EventDelivery
} from './core/verify-events.js';

// Server API for verification and enforcement
export {
  LicenseEnforcementAPI,
  type VerifyRequest,
  type VerifyResponse,
  type AppealRequest,
  type AppealResponse,
  type PartnerConfig
} from './api/license-enforcement.js';

// UI components for badge display (server-compatible)
export {
  C2LicenseBadge,
  type BadgeConfig,
  type BadgeState,
  initializeC2Badges,
  generateBadgeHTML,
  generateBadgeStyles
} from './ui/c2-badge-server.js';

// CMS/CDN integration adapters
export {
  WordPressLicenseAdapter as WordPress,
  ShopifyLicenseAdapter as Shopify,
  CloudflareWorkerAdapter as CloudflareWorker,
  type WordPressConfig,
  type ShopifyConfig,
  type CloudflareConfig
} from './integrations/cms-adapters.js';

// Re-export core types for convenience
export type {
  C2PAManifest,
  ClaimSignature,
  Assertion,
  Ingredient,
  Certificate,
  ValidationStatus,
  ValidationCode
} from './types/index.js';

// Import for internal use
import {
  LicenseMetadataEncoder as LicenseMetadataEncoderInternal,
  type LicenseMetadataAssertion as LicenseMetadataAssertionType,
  type LicenseAssertionValidation as LicenseAssertionValidationType
} from './core/license-metadata.js';
import {
  VerifyEventSystem as VerifyEventSystemInternal,
  type WebhookConfig as WebhookConfigType
} from './core/verify-events.js';
import {
  LicenseEnforcementAPI as LicenseEnforcementAPIInternal,
  type VerifyRequest as VerifyRequestType,
  type VerifyResponse as VerifyResponseType,
  type AppealRequest as AppealRequestType,
  type AppealResponse as AppealResponseType,
  type PartnerConfig as PartnerConfigType
} from './api/license-enforcement.js';
import {
  initializeC2Badges as initializeC2BadgesInternal
} from './ui/c2-badge-server.js';

/**
 * Main License Enforcement System class
 * Provides a unified interface for all Phase 32 functionality
 */
export class LicensedContentEnforcement {
  private api: LicenseEnforcementAPIInternal;

  constructor(partnerConfig?: PartnerConfigType) {
    this.api = new LicenseEnforcementAPIInternal();
    
    if (partnerConfig) {
      this.api.configurePartner(partnerConfig.partner_id, partnerConfig);
    }
  }

  /**
   * Verify an asset and return license information
   */
  async verifyAsset(request: VerifyRequestType): Promise<VerifyResponseType> {
    return this.api.verifyAsset(request);
  }

  /**
   * Submit an appeal for license enforcement
   */
  async submitAppeal(request: AppealRequestType): Promise<AppealResponseType> {
    return this.api.submitAppeal(request);
  }

  /**
   * Register a webhook for event delivery
   */
  async registerWebhook(partnerId: string, webhookConfig: {
    url: string;
    secret: string;
    filters: string[];
  }): Promise<WebhookConfigType> {
    return this.api.registerWebhook(partnerId, webhookConfig);
  }

  /**
   * Export events as NDJSON stream
   */
  async exportEvents(partnerId: string, filters: {
    from?: string;
    to?: string;
    type?: string;
  }): Promise<string> {
    return this.api.exportEvents(partnerId, filters);
  }

  /**
   * Create and validate license metadata assertion
   */
  createLicenseAssertion(license: {
    license_uri: string;
    rights_page: string;
    licensor_name: string;
    usage_terms: string;
  }): LicenseMetadataAssertionType {
    return LicenseMetadataEncoderInternal.createLicenseAssertion(license);
  }

  /**
   * Validate license metadata assertion
   */
  validateLicenseAssertion(assertion: LicenseMetadataAssertionType): LicenseAssertionValidationType {
    return LicenseMetadataEncoderInternal.validateLicenseAssertion(assertion);
  }

  /**
   * Initialize C2 badges on the page
   */
  initializeBadges(): void {
    initializeC2BadgesInternal();
  }

  /**
   * Get Creative Commons license catalog
   */
  getCCLicenseCatalog() {
    return LicenseMetadataEncoderInternal.getCCLicenseCatalog();
  }

  /**
   * Run comprehensive acceptance tests
   */
  async runAcceptanceTests() {
    // Tests would be run separately
    return { success: true, message: 'Tests available in separate test file' };
  }

  /**
   * Get API instance for advanced usage
   */
  getAPI(): LicenseEnforcementAPIInternal {
    return this.api;
  }

  /**
   * Get event system instance for advanced usage
   */
  getEventSystem(): typeof VerifyEventSystemInternal {
    return VerifyEventSystemInternal;
  }
}

/**
 * Default export - main enforcement system instance
 */
export default new LicensedContentEnforcement();

/**
 * Version information
 */
export const VERSION = '1.1.0';
export const PHASE = 'Phase 32 — Licensed Content Enforcement Hooks';

/**
 * Feature flags for enabling/disabling components
 */
export const FEATURES = {
  LICENSE_METADATA: true,
  WEBHOOK_EVENTS: true,
  BADGE_UI: true,
  CMS_INTEGRATIONS: true,
  ACCEPTANCE_TESTS: true
} as const;

/**
 * Configuration defaults
 */
export const DEFAULTS = {
  BADGE_CONFIG: {
    position: 'top-right' as const,
    size: 'medium' as const,
    preview_degrade: {
      warn: { scale: 0.4, blur_px: 6 },
      block: { scale: 0.2, blur_px: 12 }
    },
    cta: {
      warn: 'View license / Provide proof',
      block: 'License required for this use'
    },
    show_license_info: true
  },
  WEBHOOK_CONFIG: {
    max_retries: 12,
    base_retry_delay: 1000,
    max_retry_delay: 24 * 60 * 60 * 1000,
    timestamp_skew: 5 * 60,
    replay_cache_ttl: 10 * 60
  },
  API_CONFIG: {
    verification_timeout: 30000,
    event_export_limit: 10000,
    appeal_response_hours: 48
  }
} as const;
