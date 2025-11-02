/**
 * C2PA Verification Service
 * Core verification logic for manifests and provenance
 */
import fetch from 'node-fetch';
import { createHash } from 'crypto';
import { VerificationError } from './types.js';
import { validateManifestSignature, getCryptoStatus } from './crypto.js';
/**
 * Trust list for signer root validation
 * In production, this would be loaded from a secure configuration source
 */
function getTrustRoots() {
    const publicKey = process.env.C2PA_PRODUCTION_PUBLIC_KEY;
    const expiresAt = process.env.C2PA_PRODUCTION_KEY_EXPIRES;
    if (!publicKey) {
        console.warn('⚠️  WARNING: No C2PA production public key configured. Verification will fail.');
        return [];
    }
    return [
        {
            id: 'c2pa-production-1',
            name: 'C2PA Production Root CA',
            public_key: publicKey,
            trusted: true,
            expires_at: expiresAt || '2025-12-31T23:59:59Z'
        }
    ];
}
/**
 * Strict URL validation for security
 */
function validateUrl(url, allowedSchemes = ['https', 'http']) {
    try {
        // URL length validation to prevent DoS
        if (url.length > 2048) {
            return false;
        }
        const parsed = new URL(url);
        // Additional hostname validation
        if (!parsed.hostname || parsed.hostname.length > 253) {
            return false;
        }
        // Prevent localhost and private IPs in production
        if (process.env.NODE_ENV === 'production') {
            const hostname = parsed.hostname.toLowerCase();
            if (hostname === 'localhost' ||
                hostname.startsWith('127.') ||
                hostname.startsWith('192.168.') ||
                hostname.startsWith('10.') ||
                hostname.includes('169.254')) {
                return false;
            }
        }
        return allowedSchemes.includes(parsed.protocol.slice(0, -1));
    }
    catch {
        return false;
    }
}
/**
 * Fetch manifest with strict security rules
 */
async function fetchManifest(url, timeout = 5000) {
    const startTime = Date.now();
    if (!validateUrl(url)) {
        throw new VerificationError('MANIFEST_UNREACHABLE', 'Invalid URL scheme or format', { url });
    }
    try {
        const controller = new AbortController();
        // CRITICAL: Add random jitter to prevent timing attacks
        const jitter = Math.random() * 100; // 0-100ms random delay
        const actualTimeout = timeout + jitter;
        const timeoutId = setTimeout(() => controller.abort(), actualTimeout);
        const startTime = Date.now();
        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'Accept': 'application/c2pa, application/json, application/octet-stream',
                'User-Agent': 'C2PA-Verify-API/1.0'
            },
            signal: controller.signal,
            redirect: 'manual' // Don't follow redirects automatically
        });
        const endTime = Date.now();
        clearTimeout(timeoutId);
        // Handle redirects manually with security checks
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location || !validateUrl(location)) {
                throw new VerificationError('MANIFEST_UNREACHABLE', 'Unsafe redirect detected', { url, location });
            }
            // Recursive fetch with strict validation
            return fetchManifest(location, timeout);
        }
        if (!response.ok) {
            throw new VerificationError('MANIFEST_UNREACHABLE', `HTTP ${response.status}: ${response.statusText}`, { url, status: response.status });
        }
        const content = new Uint8Array(await response.arrayBuffer());
        const contentType = response.headers.get('content-type') || 'application/octet-stream';
        const rawFetchTime = Date.now() - startTime;
        // CRITICAL: Add timing noise to prevent side-channel attacks
        const noise = Math.random() * 50; // 0-50ms noise
        const fetchTime = Math.round(rawFetchTime + noise);
        return { content, contentType, fetchTime };
    }
    catch (error) {
        if (error instanceof VerificationError) {
            throw error;
        }
        throw new VerificationError('NETWORK_ERROR', error instanceof Error ? error.message : 'Unknown network error', { url });
    }
}
/**
 * Discover manifest from asset URL via Link headers
 */
async function discoverManifest(assetUrl) {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);
        const response = await fetch(assetUrl, {
            method: 'HEAD',
            headers: {
                'User-Agent': 'C2PA-Verify-API/1.0'
            },
            signal: controller.signal
        });
        clearTimeout(timeoutId);
        const linkHeader = response.headers.get('link');
        if (!linkHeader) {
            return null;
        }
        // Parse Link header for c2pa-manifest relation
        const links = linkHeader.split(',').map(link => link.trim());
        for (const link of links) {
            const match = link.match(/<([^>]+)>;\s*rel="([^"]+)"/);
            if (match && match[2] === 'c2pa-manifest') {
                const manifestUrl = match[1];
                if (validateUrl(manifestUrl)) {
                    return manifestUrl;
                }
            }
        }
        return null;
    }
    catch {
        return null;
    }
}
/**
 * Extract assertions from manifest data
 */
function extractAssertions(manifestData) {
    // Simplified assertion extraction
    // In production, this would parse the actual C2PA manifest format
    try {
        const manifestText = new TextDecoder().decode(manifestData);
        // Validate JSON size to prevent DoS attacks
        if (manifestText.length > 1024 * 1024) { // 1MB limit
            throw new Error('Manifest too large');
        }
        const manifest = JSON.parse(manifestText);
        // Validate manifest structure
        if (!manifest || typeof manifest !== 'object') {
            throw new Error('Invalid manifest structure');
        }
        return {
            ai_generated: Boolean(manifest.assertions?.ai_generated),
            edits: Array.isArray(manifest.assertions?.edits) ? manifest.assertions.edits.slice(0, 100) : [], // Limit array size
            created_at: typeof manifest.assertions?.created_at === 'string' ? manifest.assertions.created_at : undefined,
            content_type: typeof manifest.assertions?.content_type === 'string' ? manifest.assertions.content_type : undefined
        };
    }
    catch {
        // Fallback for binary manifests
        return {
            ai_generated: false,
            edits: [],
            content_type: 'application/octet-stream'
        };
    }
}
/**
 * Main verification function
 */
export async function verifyProvenance(request) {
    const startTime = Date.now();
    const decisionPath = {
        discovery: 'not_found',
        source: '',
        steps: []
    };
    try {
        // Determine manifest URL
        let manifestUrl;
        if (request.manifest_url) {
            manifestUrl = request.manifest_url;
            decisionPath.discovery = 'direct_url';
            decisionPath.steps.push('Using direct manifest URL');
        }
        else if (request.asset_url) {
            decisionPath.steps.push('Discovering manifest from asset URL');
            const discovered = await discoverManifest(request.asset_url);
            if (!discovered) {
                throw new VerificationError('MANIFEST_UNREACHABLE', 'No manifest found via Link header', { asset_url: request.asset_url });
            }
            manifestUrl = discovered;
            decisionPath.discovery = 'link_header';
        }
        else {
            throw new VerificationError('INVALID_FORMAT', 'Either asset_url or manifest_url must be provided');
        }
        decisionPath.source = manifestUrl;
        decisionPath.steps.push(`Fetching manifest from ${manifestUrl}`);
        // Fetch manifest
        const { content: manifestData, fetchTime } = await fetchManifest(manifestUrl, request.timeout);
        decisionPath.steps.push('Manifest fetched successfully');
        // Validate signature
        const availableTrustRoots = getTrustRoots();
        const trustRoots = request.trust_roots
            ? availableTrustRoots.filter(root => request.trust_roots.includes(root.id))
            : availableTrustRoots;
        decisionPath.steps.push(`Validating against ${trustRoots.length} trust roots`);
        // Extract signature from manifest (simplified)
        const manifestHash = createHash('sha256').update(manifestData).digest('hex');
        const mockSignature = manifestHash.slice(0, 32);
        // CRITICAL: Use real cryptographic validation (or fail safely)
        const cryptoStatus = getCryptoStatus();
        if (!cryptoStatus.ready) {
            console.error('🚨 CRYPTOGRAPHIC VALIDATION NOT READY:', cryptoStatus.warnings);
        }
        const { valid: signatureValid, signer, errors, warnings } = validateManifestSignature(manifestData, manifest.signature || '', trustRoots);
        // Log cryptographic warnings
        if (warnings?.length) {
            warnings.forEach(warning => console.warn('⚠️  Crypto Warning:', warning));
        }
        // Log cryptographic errors
        if (errors?.length) {
            errors.forEach(error => console.error('🚨 Crypto Error:', error));
        }
        if (!signatureValid) {
            throw new VerificationError('INVALID_SIGNATURE', 'Manifest signature validation failed', {
                errors: errors || ['Unknown validation error'],
                cryptoStatus: cryptoStatus.ready ? 'ready' : 'mock'
            });
        }
        decisionPath.steps.push('Signature validated successfully');
        // Extract assertions
        const assertions = extractAssertions(manifestData);
        decisionPath.steps.push('Assertions extracted');
        const validationTime = Date.now() - startTime - fetchTime;
        const totalTime = Date.now() - startTime;
        return {
            valid: true,
            signer: {
                name: signer.name,
                key_id: signer.id,
                organization: signer.name,
                trusted: signer.trusted
            },
            assertions,
            warnings: [],
            decision_path: decisionPath,
            metrics: {
                total_time_ms: totalTime,
                fetch_time_ms: fetchTime,
                validation_time_ms: validationTime,
                cached: false // TODO: Implement caching
            }
        };
    }
    catch (error) {
        const totalTime = Date.now() - startTime;
        if (error instanceof VerificationError) {
            // Return structured error response
            return {
                valid: false,
                signer: {
                    name: 'Unknown',
                    key_id: '',
                    trusted: false
                },
                assertions: {
                    ai_generated: false,
                    edits: []
                },
                warnings: [error.message],
                decision_path: decisionPath,
                metrics: {
                    total_time_ms: totalTime,
                    fetch_time_ms: 0,
                    validation_time_ms: 0,
                    cached: false
                }
            };
        }
        // Unexpected error
        return {
            valid: false,
            signer: {
                name: 'Unknown',
                key_id: '',
                trusted: false
            },
            assertions: {
                ai_generated: false,
                edits: []
            },
            warnings: ['Internal verification error'],
            decision_path: decisionPath,
            metrics: {
                total_time_ms: totalTime,
                fetch_time_ms: 0,
                validation_time_ms: 0,
                cached: false
            }
        };
    }
}
//# sourceMappingURL=verification.js.map