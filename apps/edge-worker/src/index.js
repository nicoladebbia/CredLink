import { policyFromEnvironment } from '@credlink/policy';
import { createCacheHeaders } from '@credlink/utils';
export default {
    async fetch(req, env, ctx) {
        const url = new URL(req.url);
        const hostname = url.hostname;
        // Load policy from environment
        const policy = policyFromEnvironment(env);
        // Check break-glass protocol
        if (await isBreakGlassActive(env, hostname)) {
            console.log(`Break-glass active for ${hostname}, bypassing worker`);
            return fetch(req);
        }
        // Forward to origin
        const originRes = await fetch(req);
        // Only process image assets
        const contentType = originRes.headers.get('content-type') || '';
        if (!contentType.startsWith('image/')) {
            return originRes;
        }
        // Get manifest hash from response headers
        const manifestHash = originRes.headers.get('x-manifest-hash');
        if (!manifestHash) {
            return originRes; // Nothing to do if no manifest hash
        }
        // Build manifest URL
        const manifestBase = env.MANIFEST_BASE || 'https://manifests.survival.test';
        const manifestUrl = `${manifestBase}/${manifestHash}.c2pa`;
        // Create new headers with modifications
        const newHeaders = new Headers(originRes.headers);
        // Inject Link header (idempotent)
        const linkVal = `<${manifestUrl}>; rel="c2pa-manifest"`;
        const existingLink = newHeaders.get('link');
        if (!existingLink || !existingLink.includes('rel="c2pa-manifest"')) {
            newHeaders.append('link', linkVal);
        }
        // Apply policy headers
        if (policy.remote_only && !isPreservePath(url.pathname, policy.preserve_paths)) {
            newHeaders.set('content-security-policy', "default-src 'none'; img-src 'self' data:; frame-ancestors 'none'");
            newHeaders.set('x-c2-policy', 'remote-only');
        }
        else {
            newHeaders.set('x-c2-policy', 'preserve-allowed');
        }
        // Set cache headers for immutable assets
        const cacheHeaders = createCacheHeaders(true);
        Object.entries(cacheHeaders).forEach(([key, value]) => {
            newHeaders.set(key, value);
        });
        // Add timing header
        newHeaders.set('x-c2-edge-timing', Date.now().toString());
        return new Response(originRes.body, {
            status: originRes.status,
            statusText: originRes.statusText,
            headers: newHeaders
        });
    }
};
async function isBreakGlassActive(env, hostname) {
    if (!env.BREAK_GLASS_KV) {
        return false;
    }
    try {
        const entry = await env.BREAK_GLASS_KV.get(hostname, 'json');
        if (!entry) {
            return false;
        }
        // Check if entry has expired
        const openedAt = new Date(entry.opened_at);
        const expiresAt = new Date(openedAt.getTime() + entry.ttl_minutes * 60 * 1000);
        if (Date.now() > expiresAt.getTime()) {
            // Clean up expired entry
            await env.BREAK_GLASS_KV.delete(hostname);
            return false;
        }
        // Verify signature (simplified for Phase 0)
        if (!verifyBreakGlassSignature(entry, env.HMAC_SECRET || '')) {
            await env.BREAK_GLASS_KV.delete(hostname);
            return false;
        }
        return true;
    }
    catch (error) {
        console.error('Error checking break-glass status:', error);
        return false;
    }
}
function isPreservePath(pathname, preservePaths) {
    return preservePaths.some(p => pathname.startsWith(p));
}
function verifyBreakGlassSignature(entry, secret) {
    // Simplified signature verification for Phase 0
    // In production, this would use proper cryptographic verification
    return entry.signature.length > 0;
}
//# sourceMappingURL=index.js.map