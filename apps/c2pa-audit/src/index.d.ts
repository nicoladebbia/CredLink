/**
 * C2PA Audit Tool - Main Entry Point
 * Forensic-grade C2PA manifest diff and lineage analysis
 * Phase 32 v1.1 - Licensed Content Enforcement Hooks
 */
export { SecureCredentialManager } from './security/credential-manager.js';
export { SecureErrorHandler, ErrorType } from './security/error-handler.js';
export { TLSConfigurationManager } from './security/tls-config.js';
export { ManifestValidator } from './core/validator.js';
export { RangeIndexGenerator } from './core/range-index.js';
export { VerificationPolicyEngine } from './core/verification-policy.js';
export { JSONCanonicalizer } from './core/canonicalizer.js';
export { LicenseMetadataEncoder, type LicenseMetadataAssertion, type LicenseAssertionValidation, VerifyEventSystem, type VerifyEvent, type WebhookConfig, type EventDelivery, LicenseEnforcementAPI, type VerifyRequest, type VerifyResponse, type AppealRequest, type AppealResponse, type PartnerConfig, C2LicenseBadge, type BadgeConfig, type BadgeState, initializeC2Badges, WordPress, Shopify, CloudflareWorker, type WordPressConfig, type ShopifyConfig, type CloudflareConfig, LicensedContentEnforcement, VERSION, PHASE, FEATURES, DEFAULTS } from './license-enforcement.js';
export * from './types/index.js';
export declare class C2PAAuditTool {
    /**
     * Initialize the audit tool with security configurations
     */
    initialize(): Promise<void>;
    /**
     * Perform a complete C2PA manifest audit
     */
    auditManifest(_manifestData: any): Promise<any>;
    /**
     * Compare two C2PA manifests for differences
     */
    compareManifests(_baseManifest: any, _targetManifest: any): Promise<any>;
    /**
     * Generate lineage graph for manifest ancestry
     */
    generateLineage(_rootManifest: any): Promise<any>;
}
declare const _default: C2PAAuditTool;
export default _default;
export { default as licenseEnforcement } from './license-enforcement.js';
//# sourceMappingURL=index.d.ts.map