/**
 * Phase 19: Marketplace Connectors - Manifest Assertion Builder
 * Builds IPTC-compliant C2PA license assertions from provider metadata
 */
import { createHash } from 'crypto';
/**
 * Build license assertion from provider metadata with IPTC fields
 */
export function buildLicenseAssertion(metadata) {
    if (!metadata || !metadata.license) {
        throw new Error('Invalid metadata: license information is required');
    }
    const license = metadata.license;
    return {
        provider: metadata.provider,
        license_id: license.license_id,
        license_type: license.license_type,
        license_url: license.license_url,
        rights_window: metadata.rights_window ? {
            from: metadata.rights_window.from?.toISOString(),
            to: metadata.rights_window.to?.toISOString()
        } : undefined,
        restrictions: license.restrictions || [],
        iptc: {
            LicensorName: sanitizeString(license.licensor_name || getProviderName(metadata.provider)),
            WebStatement: validateUrl(license.license_url),
            UsageTerms: sanitizeString(license.usage_terms || 'See provider terms'),
            Copyright: sanitizeString(`© ${license.licensor_name || getProviderName(metadata.provider)}`),
            Credit: sanitizeString(metadata.credit),
            Source: sanitizeString(metadata.provider.toUpperCase())
        }
    };
}
/**
 * Build release assertion from provider metadata
 */
export function buildReleaseAssertion(metadata) {
    if (!metadata || !metadata.releases) {
        throw new Error('Invalid metadata: release information is required');
    }
    return {
        model_release_status: metadata.releases.model_release_status,
        property_release_status: metadata.releases.property_release_status,
        release_notes: sanitizeString(metadata.releases.release_notes)
    };
}
/**
 * Build complete provider manifest assertion for C2PA
 */
export function buildProviderManifestAssertion(metadata, tenantId, issuerDomain) {
    // Validate inputs
    if (!metadata) {
        throw new Error('Metadata is required');
    }
    if (!tenantId || !isValidUUID(tenantId)) {
        throw new Error('Valid tenant ID is required');
    }
    if (!issuerDomain || !isValidDomain(issuerDomain)) {
        throw new Error('Valid issuer domain is required');
    }
    const licenseAssertion = buildLicenseAssertion(metadata);
    const releaseAssertion = buildReleaseAssertion(metadata);
    const assertion = {
        version: '1.0',
        asset: {
            primary_url: validateUrl(metadata.asset_url || metadata.source_urls.asset_page) || '',
            kind: metadata.asset_kind
        },
        assertions: {
            license: licenseAssertion,
            releases: releaseAssertion
        },
        links: {
            source_provider: validateUrl(metadata.source_urls.api_endpoint) || '',
            license_terms: validateUrl(metadata.license.license_url),
            asset_page: validateUrl(metadata.source_urls.asset_page)
        },
        signature: {
            alg: 'ES256',
            issuer: `${issuerDomain}/tenants/${tenantId}`,
            created_at: new Date().toISOString()
        }
    };
    // Validate the complete assertion
    const validation = validateManifestAssertion(assertion);
    if (!validation.is_valid) {
        throw new Error(`Invalid manifest assertion: ${validation.errors.join(', ')}`);
    }
    return assertion;
}
/**
 * Generate manifest hash for R2 storage key
 */
export function generateManifestHash(assertion) {
    if (!assertion) {
        throw new Error('Assertion is required for hash generation');
    }
    // Sort keys for consistent hashing
    const sortedAssertion = sortObjectKeys(assertion);
    const manifestJson = JSON.stringify(sortedAssertion, null, 2);
    return createHash('sha256').update(manifestJson).digest('hex');
}
/**
 * Get R2 storage path for manifest
 */
export function getManifestStoragePath(manifestHash) {
    if (!manifestHash || !/^[a-f0-9]{64}$/i.test(manifestHash)) {
        throw new Error('Valid manifest hash is required');
    }
    return `manifests/${manifestHash.substring(0, 2)}/${manifestHash.substring(2, 4)}/${manifestHash}.c2pa.json`;
}
/**
 * Validate license assertion against IPTC requirements
 */
export function validateLicenseAssertion(assertion) {
    const errors = [];
    const warnings = [];
    // Required fields
    if (!assertion.provider) {
        errors.push('Provider is required');
    }
    if (!assertion.license_id) {
        errors.push('License ID is required');
    }
    // IPTC validation
    if (!assertion.iptc.LicensorName) {
        errors.push('IPTC LicensorName is required');
    }
    if (!assertion.iptc.Source) {
        errors.push('IPTC Source is required');
    }
    // Rights window validation
    if (assertion.rights_window) {
        if (assertion.rights_window.from && assertion.rights_window.to) {
            const from = new Date(assertion.rights_window.from);
            const to = new Date(assertion.rights_window.to);
            if (isNaN(from.getTime()) || isNaN(to.getTime())) {
                errors.push('Invalid date format in rights window');
            }
            else if (from >= to) {
                errors.push('Rights window "from" must be before "to"');
            }
        }
    }
    // URL validation
    if (assertion.license_url && !isValidUrl(assertion.license_url)) {
        warnings.push('License URL format is invalid');
    }
    return {
        is_valid: errors.length === 0,
        errors,
        warnings
    };
}
/**
 * Validate complete manifest assertion
 */
export function validateManifestAssertion(assertion) {
    const errors = [];
    const warnings = [];
    if (!assertion.version) {
        errors.push('Manifest version is required');
    }
    if (!assertion.asset?.primary_url) {
        errors.push('Asset primary URL is required');
    }
    else if (!isValidUrl(assertion.asset.primary_url)) {
        errors.push('Asset primary URL is invalid');
    }
    if (!assertion.signature?.issuer) {
        errors.push('Signature issuer is required');
    }
    if (!assertion.signature?.created_at) {
        errors.push('Signature creation timestamp is required');
    }
    // Validate nested assertions
    const licenseValidation = validateLicenseAssertion(assertion.assertions.license);
    errors.push(...licenseValidation.errors);
    warnings.push(...licenseValidation.warnings);
    return {
        is_valid: errors.length === 0,
        errors,
        warnings
    };
}
/**
 * Get provider display name
 */
function getProviderName(provider) {
    const names = {
        getty: 'Getty Images',
        ap: 'Associated Press',
        shutterstock: 'Shutterstock',
        reuters: 'Reuters Connect'
    };
    return names[provider] || provider.toUpperCase();
}
/**
 * Format license information for badge display
 */
export function formatLicenseForBadge(assertion) {
    const parts = [
        `Licensed from ${getProviderName(assertion.provider)}`,
        `License ${assertion.license_id}`
    ];
    if (assertion.license_type) {
        parts.push(assertion.license_type.charAt(0).toUpperCase() + assertion.license_type.slice(1));
    }
    if (assertion.rights_window?.from && assertion.rights_window?.to) {
        const from = new Date(assertion.rights_window.from).toLocaleDateString();
        const to = new Date(assertion.rights_window.to).toLocaleDateString();
        parts.push(`${from} → ${to}`);
    }
    return parts.join(' • ');
}
/**
 * Generate badge clickthrough URL
 */
export function generateBadgeUrl(assertion, baseUrl, manifestHash) {
    if (!baseUrl || !isValidUrl(baseUrl)) {
        throw new Error('Valid base URL is required');
    }
    if (!manifestHash || !/^[a-f0-9]{64}$/i.test(manifestHash)) {
        throw new Error('Valid manifest hash is required');
    }
    const params = new URLSearchParams({
        provider: assertion.provider,
        license_id: assertion.license_id,
        manifest: manifestHash
    });
    if (assertion.license_url) {
        params.set('terms_url', assertion.license_url);
    }
    return `${baseUrl}/verify?${params.toString()}`;
}
/**
 * Utility functions for validation and sanitization
 */
function sanitizeString(input) {
    if (!input)
        return undefined;
    // Remove potentially dangerous characters
    return input
        .replace(/[\x00-\x1F\x7F]/g, '') // Remove control characters
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
        .trim();
}
function validateUrl(url) {
    if (!url)
        return undefined;
    if (!isValidUrl(url)) {
        throw new Error(`Invalid URL: ${url}`);
    }
    return url;
}
function isValidUrl(url) {
    try {
        const parsed = new URL(url);
        return ['http:', 'https:'].includes(parsed.protocol);
    }
    catch {
        return false;
    }
}
function isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}
function isValidDomain(domain) {
    try {
        new URL(`https://${domain}`);
        return true;
    }
    catch {
        return false;
    }
}
function sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(sortObjectKeys);
    }
    const sorted = {};
    const keys = Object.keys(obj).sort();
    for (const key of keys) {
        sorted[key] = sortObjectKeys(obj[key]);
    }
    return sorted;
}
//# sourceMappingURL=assertion-builder.js.map