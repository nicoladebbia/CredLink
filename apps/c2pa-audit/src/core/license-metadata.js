/**
 * Licensed Content Enforcement Hooks - License Metadata Schema
 * Phase 32 v1.1 - C2PA-compliant non-DRM guardrails
 */
/**
 * License metadata encoder and validator
 */
export class LicenseMetadataEncoder {
    // Creative Commons license patterns and canonical URIs
    static CC_LICENSES = {
        'by': 'https://creativecommons.org/licenses/by/4.0/',
        'by-sa': 'https://creativecommons.org/licenses/by-sa/4.0/',
        'by-nd': 'https://creativecommons.org/licenses/by-nd/4.0/',
        'by-nc': 'https://creativecommons.org/licenses/by-nc/4.0/',
        'by-nc-sa': 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
        'by-nc-nd': 'https://creativecommons.org/licenses/by-nc-nd/4.0/',
        'cc0': 'https://creativecommons.org/publicdomain/zero/1.0/'
    };
    static CC_PATTERNS = [
        /creativecommons\.org\/licenses\/by\/4\.0/i,
        /creativecommons\.org\/licenses\/by-sa\/4\.0/i,
        /creativecommons\.org\/licenses\/by-nd\/4\.0/i,
        /creativecommons\.org\/licenses\/by-nc\/4\.0/i,
        /creativecommons\.org\/licenses\/by-nc-sa\/4\.0/i,
        /creativecommons\.org\/licenses\/by-nc-nd\/4\.0/i,
        /creativecommons\.org\/publicdomain\/zero\/1\.0/i
    ];
    /**
     * Create a license metadata assertion
     */
    static createLicenseAssertion(license) {
        const canonicalUri = this.canonicalizeLicenseURI(license.license_uri);
        return {
            label: 'c2pa.metadata',
            data: {
                license: {
                    license_uri: canonicalUri,
                    rights_page: license.rights_page,
                    licensor_name: license.licensor_name,
                    usage_terms: license.usage_terms
                }
            }
        };
    }
    /**
     * Canonicalize license URI to standard form
     */
    static canonicalizeLicenseURI(uri) {
        const normalized = uri.toLowerCase().trim();
        // Check for Creative Commons licenses and canonicalize
        for (const [key, canonical] of Object.entries(this.CC_LICENSES)) {
            if (normalized.includes(key) || this.CC_PATTERNS.some(pattern => pattern.test(normalized))) {
                return canonical;
            }
        }
        // Return original URI if not a CC license
        return uri;
    }
    /**
     * Validate license assertion structure and content
     */
    static validateLicenseAssertion(assertion) {
        const errors = [];
        let canonicalUri;
        let licenseType = 'custom';
        let permissionLevel = 'restricted';
        try {
            // Validate assertion structure
            if (assertion.label !== 'c2pa.metadata') {
                errors.push('Invalid assertion label: must be "c2pa.metadata"');
            }
            if (!assertion.data?.license) {
                errors.push('Missing license data block');
                return { valid: false, license_type: 'custom', permission_level: 'prohibited', errors };
            }
            const license = assertion.data.license;
            // Validate required fields
            if (!license.license_uri || typeof license.license_uri !== 'string') {
                errors.push('Missing or invalid license_uri');
            }
            if (!license.rights_page || typeof license.rights_page !== 'string') {
                errors.push('Missing or invalid rights_page');
            }
            if (!license.licensor_name || typeof license.licensor_name !== 'string') {
                errors.push('Missing or invalid licensor_name');
            }
            if (!license.usage_terms || typeof license.usage_terms !== 'string') {
                errors.push('Missing or invalid usage_terms');
            }
            // Validate URI formats
            if (license.license_uri) {
                try {
                    new URL(license.license_uri);
                    canonicalUri = this.canonicalizeLicenseURI(license.license_uri);
                }
                catch {
                    errors.push('Invalid license_uri format');
                }
            }
            if (license.rights_page) {
                try {
                    new URL(license.rights_page);
                }
                catch {
                    errors.push('Invalid rights_page format');
                }
            }
            // Determine license type and permission level
            if (canonicalUri) {
                if (Object.values(this.CC_LICENSES).includes(canonicalUri)) {
                    licenseType = 'creative-commons';
                    // Determine permission level based on CC license
                    if (canonicalUri.includes('by') && !canonicalUri.includes('nc')) {
                        permissionLevel = 'permissive';
                    }
                    else if (canonicalUri.includes('nc')) {
                        permissionLevel = 'restricted';
                    }
                    else if (canonicalUri.includes('publicdomain')) {
                        permissionLevel = 'permissive';
                    }
                }
                else {
                    licenseType = 'commercial';
                }
            }
        }
        catch (error) {
            errors.push(`Validation error: ${error instanceof Error ? error.message : String(error)}`);
        }
        const validation = {
            valid: errors.length === 0,
            license_type: licenseType,
            permission_level: permissionLevel,
            errors
        };
        if (canonicalUri) {
            validation.canonical_uri = canonicalUri;
        }
        return validation;
    }
    /**
     * Extract license metadata from verified manifest
     */
    static extractLicenseFromManifest(manifest) {
        try {
            if (!manifest.assertions || !Array.isArray(manifest.assertions)) {
                return null;
            }
            const metadataAssertion = manifest.assertions.find((assertion) => assertion.label === 'c2pa.metadata' &&
                assertion.data?.license);
            return metadataAssertion || null;
        }
        catch (error) {
            console.error('Error extracting license from manifest:', error);
            return null;
        }
    }
    /**
     * Get Creative Commons license catalog
     */
    static getCCLicenseCatalog() {
        return {
            'by': {
                uri: this.CC_LICENSES['by'],
                name: 'Attribution 4.0 International',
                requiresAttribution: true,
                commercialUse: true,
                derivatives: true
            },
            'by-sa': {
                uri: this.CC_LICENSES['by-sa'],
                name: 'Attribution-ShareAlike 4.0 International',
                requiresAttribution: true,
                commercialUse: true,
                derivatives: true
            },
            'by-nd': {
                uri: this.CC_LICENSES['by-nd'],
                name: 'Attribution-NoDerivatives 4.0 International',
                requiresAttribution: true,
                commercialUse: true,
                derivatives: false
            },
            'by-nc': {
                uri: this.CC_LICENSES['by-nc'],
                name: 'Attribution-NonCommercial 4.0 International',
                requiresAttribution: true,
                commercialUse: false,
                derivatives: true
            },
            'by-nc-sa': {
                uri: this.CC_LICENSES['by-nc-sa'],
                name: 'Attribution-NonCommercial-ShareAlike 4.0 International',
                requiresAttribution: true,
                commercialUse: false,
                derivatives: true
            },
            'by-nc-nd': {
                uri: this.CC_LICENSES['by-nc-nd'],
                name: 'Attribution-NonCommercial-NoDerivatives 4.0 International',
                requiresAttribution: true,
                commercialUse: false,
                derivatives: false
            },
            'cc0': {
                uri: this.CC_LICENSES['cc0'],
                name: 'CC0 1.0 Universal',
                requiresAttribution: false,
                commercialUse: true,
                derivatives: true
            }
        };
    }
    /**
     * Check if license is permissive for reuse
     */
    static isPermissiveLicense(licenseUri) {
        const canonical = this.canonicalizeLicenseURI(licenseUri);
        const validation = this.validateLicenseAssertion({
            label: 'c2pa.metadata',
            data: {
                license: {
                    license_uri: canonical,
                    rights_page: '',
                    licensor_name: '',
                    usage_terms: ''
                }
            }
        });
        return validation.permission_level === 'permissive';
    }
}
//# sourceMappingURL=license-metadata.js.map