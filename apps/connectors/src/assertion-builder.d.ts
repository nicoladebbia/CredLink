/**
 * Phase 19: Marketplace Connectors - Manifest Assertion Builder
 * Builds IPTC-compliant C2PA license assertions from provider metadata
 */
import { LicenseAssertion, ReleaseAssertion, ProviderManifestAssertion, ProviderAssetMetadata, ValidationResult } from './types.js';
export type { LicenseAssertion, ReleaseAssertion, ProviderManifestAssertion, ProviderAssetMetadata, LicenseProvider } from './types.js';
/**
 * Build license assertion from provider metadata with IPTC fields
 */
export declare function buildLicenseAssertion(metadata: ProviderAssetMetadata): LicenseAssertion;
/**
 * Build release assertion from provider metadata
 */
export declare function buildReleaseAssertion(metadata: ProviderAssetMetadata): ReleaseAssertion;
/**
 * Build complete provider manifest assertion for C2PA
 */
export declare function buildProviderManifestAssertion(metadata: ProviderAssetMetadata, tenantId: string, issuerDomain: string): ProviderManifestAssertion;
/**
 * Generate manifest hash for R2 storage key
 */
export declare function generateManifestHash(assertion: ProviderManifestAssertion): string;
/**
 * Get R2 storage path for manifest
 */
export declare function getManifestStoragePath(manifestHash: string): string;
/**
 * Validate license assertion against IPTC requirements
 */
export declare function validateLicenseAssertion(assertion: LicenseAssertion): ValidationResult;
/**
 * Validate complete manifest assertion
 */
export declare function validateManifestAssertion(assertion: ProviderManifestAssertion): ValidationResult;
/**
 * Format license information for badge display
 */
export declare function formatLicenseForBadge(assertion: LicenseAssertion): string;
/**
 * Generate badge clickthrough URL
 */
export declare function generateBadgeUrl(assertion: LicenseAssertion, baseUrl: string, manifestHash: string): string;
//# sourceMappingURL=assertion-builder.d.ts.map