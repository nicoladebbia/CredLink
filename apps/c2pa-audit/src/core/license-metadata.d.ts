/**
 * Licensed Content Enforcement Hooks - License Metadata Schema
 * Phase 32 v1.1 - C2PA-compliant non-DRM guardrails
 */
export interface LicenseMetadataAssertion {
    /** Assertion label per C2PA spec */
    label: 'c2pa.metadata';
    /** License metadata payload */
    data: {
        /** License information block */
        license: {
            /** Canonical license URI (CC or contract URL) */
            license_uri: string;
            /** Rights page mirroring IPTC Web Statement of Rights */
            rights_page: string;
            /** Licensor entity name */
            licensor_name: string;
            /** Usage terms and restrictions */
            usage_terms: string;
        };
    };
}
export interface LicenseAssertionValidation {
    /** Whether the license assertion is valid */
    valid: boolean;
    /** Canonicalized license URI */
    canonical_uri?: string;
    /** License type classification */
    license_type: 'creative-commons' | 'commercial' | 'custom';
    /** Permission level based on license */
    permission_level: 'permissive' | 'restricted' | 'prohibited';
    /** Validation errors if any */
    errors: string[];
}
/**
 * License metadata encoder and validator
 */
export declare class LicenseMetadataEncoder {
    private static readonly CC_LICENSES;
    private static readonly CC_PATTERNS;
    /**
     * Create a license metadata assertion
     */
    static createLicenseAssertion(license: {
        license_uri: string;
        rights_page: string;
        licensor_name: string;
        usage_terms: string;
    }): LicenseMetadataAssertion;
    /**
     * Canonicalize license URI to standard form
     */
    static canonicalizeLicenseURI(uri: string): string;
    /**
     * Validate license assertion structure and content
     */
    static validateLicenseAssertion(assertion: LicenseMetadataAssertion): LicenseAssertionValidation;
    /**
     * Extract license metadata from verified manifest
     */
    static extractLicenseFromManifest(manifest: any): LicenseMetadataAssertion | null;
    /**
     * Get Creative Commons license catalog
     */
    static getCCLicenseCatalog(): Record<string, {
        uri: string;
        name: string;
        requiresAttribution: boolean;
        commercialUse: boolean;
        derivatives: boolean;
    }>;
    /**
     * Check if license is permissive for reuse
     */
    static isPermissiveLicense(licenseUri: string): boolean;
}
//# sourceMappingURL=license-metadata.d.ts.map