export async function probeHeaders(assetUrl: string): Promise<{
  headers: Record<string, string>;
  link_header_present: boolean;
  x_c2_policy?: string;
  content_type: string;
  cache_control?: string;
}> {
  // Security: Validate URL to prevent SSRF
  if (!isValidUrl(assetUrl)) {
    throw new Error(`Invalid URL: ${assetUrl}`);
  }

  // Security: Add timeout to prevent infinite hangs
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15 second timeout

  try {
    console.log(`🔍 Probing headers for: ${assetUrl}`);
    const response = await fetch(assetUrl, { 
      method: 'HEAD',
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    console.log(`🔍 Response status: ${response.status} ${response.statusText}`);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch headers: ${response.status} ${response.statusText}`);
    }

    const headers: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      headers[key.toLowerCase()] = value;
    });

    const linkHeader = headers['link'] || '';
    const link_header_present = linkHeader.includes('rel="c2pa-manifest"');

    return {
      headers,
      link_header_present,
      x_c2_policy: headers['x-c2-policy'],
      content_type: headers['content-type'] || '',
      cache_control: headers['cache-control']
    };
  } catch (error) {
    clearTimeout(timeoutId);
    
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout: ${assetUrl}`);
    }
    throw error;
  }
}

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
