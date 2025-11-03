import { normalizeHeaders, extractLinkHeader, createCacheHeaders } from '@c2/utils';

interface Env {
  REMOTE_ONLY?: string;
  PRESERVE_PATHS?: string;
  DROP_IF_LINK_MISSING?: string;
  BREAK_GLASS_HOSTS?: string;
  MANIFEST_BASE?: string;
  BREAK_GLASS_KV?: KVNamespace;
  HMAC_SECRET?: string;
}

interface BreakGlassEntry {
  hostname: string;
  reason: string;
  opened_by: string;
  opened_at: string;
  ttl_minutes: number;
  signature: string;
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    try {
      const url = new URL(req.url);
      const hostname = url.hostname;

      // Security: Validate hostname to prevent SSRF
      if (!isValidHostname(hostname)) {
        return new Response('Invalid hostname', { 
          status: 400,
          headers: {
            'Content-Type': 'text/plain',
            'X-Error': 'Invalid hostname'
          }
        });
      }

      // Load policy from environment
      const policy = {
        remote_only: env.REMOTE_ONLY === 'true',
        preserve_paths: env.PRESERVE_PATHS?.split(',') || [],
        drop_if_link_missing: env.DROP_IF_LINK_MISSING === 'true',
        break_glass_hosts: env.BREAK_GLASS_HOSTS?.split(',') || []
      };

      // Check break-glass protocol
      if (await isBreakGlassActive(env, hostname)) {
        console.log(`Break-glass active for ${hostname}, bypassing worker`);
        return fetch(req);
      }

      // Forward to origin with timeout and error handling
      let originRes: Response;
      try {
        originRes = await fetch(req, {
          signal: AbortSignal.timeout(30000) // Security: 30 second timeout
        });
      } catch (fetchError) {
        console.error('Origin fetch failed:', fetchError);
        return new Response('Origin unavailable', { 
          status: 502,
          headers: {
            'Content-Type': 'text/plain',
            'X-Error': 'Origin fetch failed'
          }
        });
      }

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

      // Security: Validate manifest hash format
      if (!isValidHash(manifestHash)) {
        return new Response('Invalid manifest hash format', { 
          status: 400,
          headers: {
            'Content-Type': 'text/plain',
            'X-Error': 'Invalid manifest hash'
          }
        });
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
      } else {
        newHeaders.set('x-c2-policy', 'preserve-allowed');
      }

      // Set cache headers for immutable assets
      const cacheHeaders = createCacheHeaders(true);
      Object.entries(cacheHeaders).forEach(([key, value]) => {
        newHeaders.set(key, value);
      });

      // Add timing header
      newHeaders.set('x-c2-edge-timing', Date.now().toString());

      // Security: Add additional headers
      newHeaders.set('X-Content-Type-Options', 'nosniff');
      newHeaders.set('X-Frame-Options', 'DENY');
      newHeaders.set('X-XSS-Protection', '1; mode=block');
      newHeaders.set('Referrer-Policy', 'strict-origin-when-cross-origin');

      return new Response(originRes.body, {
        status: originRes.status,
        statusText: originRes.statusText,
        headers: newHeaders
      });
    } catch (error) {
      console.error('Edge worker error:', error);
      return new Response('Internal server error', { 
        status: 500,
        headers: {
          'Content-Type': 'text/plain',
          'X-Error': 'Internal server error'
        }
      });
    }
  }
};

// Security: Validate hostname to prevent SSRF attacks
function isValidHostname(hostname: string): boolean {
  // Allow localhost, 127.0.0.1, and valid domain names
  const validPatterns = [
    /^localhost(:\d+)?$/,
    /^127\.0\.0\.1(:\d+)?$/,
    /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
  ];
  
  return validPatterns.some(pattern => pattern.test(hostname));
}

// Security: Validate hash format
function isValidHash(hash: string): boolean {
  return /^[a-fA-F0-9]{64}$/.test(hash);
}

async function isBreakGlassActive(env: Env, hostname: string): Promise<boolean> {
  if (!env.BREAK_GLASS_KV || !env.HMAC_SECRET) {
    return false;
  }

  try {
    const entry: BreakGlassEntry | null = await env.BREAK_GLASS_KV.get(hostname, 'json');
    if (!entry) {
      return false;
    }

    // Security: Validate entry structure
    if (!isValidBreakGlassEntry(entry)) {
      await env.BREAK_GLASS_KV.delete(hostname);
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

    // Verify signature with proper HMAC
    if (!(await verifyBreakGlassSignature(entry, env.HMAC_SECRET))) {
      await env.BREAK_GLASS_KV.delete(hostname);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error checking break-glass status:', error);
    return false;
  }
}

// Security: Validate break-glass entry structure
function isValidBreakGlassEntry(entry: any): entry is BreakGlassEntry {
  return (
    entry &&
    typeof entry.hostname === 'string' &&
    typeof entry.reason === 'string' &&
    typeof entry.opened_by === 'string' &&
    typeof entry.opened_at === 'string' &&
    typeof entry.ttl_minutes === 'number' &&
    typeof entry.signature === 'string' &&
    entry.ttl_minutes > 0 &&
    entry.ttl_minutes <= 120 // Max 2 hours
  );
}

function isPreservePath(pathname: string, preservePaths: string[]): boolean {
  return preservePaths.some(p => pathname.startsWith(p));
}

// Security: Proper HMAC signature verification
async function verifyBreakGlassSignature(entry: BreakGlassEntry, secret: string): Promise<boolean> {
  try {
    // Create canonical message for signing
    const canonicalMessage = [
      entry.hostname,
      entry.reason,
      entry.opened_by,
      entry.opened_at,
      entry.ttl_minutes.toString()
    ].join('|');

    // Create expected HMAC using Web Crypto API
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(canonicalMessage);
    
    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', cryptoKey, messageData);
    const expectedHmac = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Security: Use timing-safe comparison to prevent timing attacks
    const expectedBuffer = new Uint8Array(signatureBuffer);
    const actualBuffer = new Uint8Array(
      entry.signature.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []
    );

    if (expectedBuffer.length !== actualBuffer.length) {
      return false;
    }

    // Simple timing-safe comparison for small arrays
    let result = 0;
    for (let i = 0; i < expectedBuffer.length; i++) {
      result |= expectedBuffer[i] ^ actualBuffer[i];
    }
    return result === 0;
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}
