import { createHash } from 'crypto';

// Security: Validate URL to prevent SSRF attacks
function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Allow localhost and valid domains
    const hostname = parsed.hostname;
    const validPatterns = [
      /^localhost(:\d+)?$/,
      /^127\.0\.0\.1(:\d+)?$/,
      /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/
    ];
    
    return validPatterns.some(pattern => pattern.test(hostname));
  } catch {
    return false;
  }
}

export async function probeLinkResolution(
  assetUrl: string,
  expectedManifestHash?: string
): Promise<{
  manifest_url?: string;
  manifest_fetch_status: number;
  hash_alignment: boolean;
  html_link_fallback: boolean;
}> {
  // Security: Validate URL to prevent SSRF
  if (!isValidUrl(assetUrl)) {
    throw new Error(`Invalid URL: ${assetUrl}`);
  }

  // Security: Add timeout to prevent infinite hangs
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    // First, try to get manifest from Link header
    const headResponse = await fetch(assetUrl, { 
      method: 'HEAD',
      signal: controller.signal 
    });
    const linkHeader = headResponse.headers.get('link');
    
    let manifestUrl: string | undefined;
    
    if (linkHeader) {
      const match = linkHeader.match(/<([^>]+)>;\s*rel="c2pa-manifest"/);
      if (match) {
        let rawManifestUrl = match[1];
        // Convert relative URL to absolute URL
        if (rawManifestUrl.startsWith('/')) {
          const assetUrlObj = new URL(assetUrl);
          manifestUrl = `${assetUrlObj.protocol}//${assetUrlObj.host}${rawManifestUrl}`;
        } else {
          manifestUrl = rawManifestUrl;
        }
        // Security: Validate extracted manifest URL
        if (!isValidUrl(manifestUrl)) {
          throw new Error(`Invalid manifest URL: ${manifestUrl}`);
        }
      }
    }

    // If no Link header, try HTML fallback
    let html_link_fallback = false;
    if (!manifestUrl) {
      try {
        const response = await fetch(assetUrl, { 
          signal: controller.signal 
        });
        const html = await response.text();
        
        // Look for <link rel="c2pa-manifest" href="...">
        const linkMatch = html.match(/<link[^>]+rel="c2pa-manifest"[^>]+href="([^"]+)"/);
        if (linkMatch) {
          manifestUrl = linkMatch[1];
          // Security: Validate extracted manifest URL
          if (!isValidUrl(manifestUrl)) {
            throw new Error(`Invalid manifest URL: ${manifestUrl}`);
          }
          html_link_fallback = true;
        }
      } catch (error) {
        console.warn('HTML fallback failed:', error);
      }
    }

    if (!manifestUrl) {
      clearTimeout(timeoutId);
      return {
        manifest_fetch_status: 0,
        hash_alignment: false,
        html_link_fallback
      };
    }

    // Try to fetch the manifest with timeout
    const manifestController = new AbortController();
    const manifestTimeoutId = setTimeout(() => manifestController.abort(), 10000); // 10 second timeout

    try {
      const manifestResponse = await fetch(manifestUrl, {
        signal: manifestController.signal
      });
      const manifestStatus = manifestResponse.status;
      
      clearTimeout(manifestTimeoutId);
      clearTimeout(timeoutId);
      
      if (!manifestResponse.ok) {
        return {
          manifest_url: manifestUrl,
          manifest_fetch_status: manifestStatus,
          hash_alignment: false,
          html_link_fallback
        };
      }

      // Check hash alignment if expected hash provided
      let hash_alignment = false;
      if (expectedManifestHash) {
        // Security: Validate expected hash format
        if (!/^[a-fA-F0-9]{64}$/.test(expectedManifestHash)) {
          throw new Error('Invalid expected manifest hash format');
        }
        
        const manifestBytes = new Uint8Array(await manifestResponse.arrayBuffer());
        const actualHash = createHash('sha256').update(manifestBytes).digest('hex');
        hash_alignment = actualHash === expectedManifestHash.toLowerCase();
      } else {
        // If no expected hash, assume alignment for Phase 0
        hash_alignment = true;
      }

      return {
        manifest_url: manifestUrl,
        manifest_fetch_status: manifestStatus,
        hash_alignment,
        html_link_fallback
      };
    } catch (error) {
      clearTimeout(manifestTimeoutId);
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          manifest_url: manifestUrl,
          manifest_fetch_status: -2, // Custom timeout code
          hash_alignment: false,
          html_link_fallback
        };
      }
      
      return {
        manifest_url: manifestUrl,
        manifest_fetch_status: -1,
        hash_alignment: false,
        html_link_fallback
      };
    }
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout: ${assetUrl}`);
    }
    throw error;
  }
}
