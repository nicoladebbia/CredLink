export interface HttpHeaders {
  [key: string]: string;
}

// Security: Validate URL to prevent SSRF attacks
export function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    // Only allow http and https protocols
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Allow localhost, 127.0.0.1, and valid domain names
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

export function normalizeHeaders(headers: Headers | Record<string, string>): HttpHeaders {
  try {
    const normalized: HttpHeaders = {};
    
    if (headers instanceof Headers) {
      headers.forEach((value, key) => {
        normalized[key.toLowerCase()] = value;
      });
    } else {
      Object.entries(headers).forEach(([key, value]) => {
        normalized[key.toLowerCase()] = value;
      });
    }
    
    return normalized;
  } catch (error) {
    console.error('Error normalizing headers:', error);
    return {};
  }
}

export function extractLinkHeader(headers: HttpHeaders): string | null {
  try {
    const linkHeader = headers['link'];
    if (!linkHeader) return null;
    
    const match = linkHeader.match(/<([^>]+)>;\s*rel="c2pa-manifest"/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error extracting link header:', error);
    return null;
  }
}

export function createCacheHeaders(immutable: boolean = true): HttpHeaders {
  try {
    if (immutable) {
      return {
        'cache-control': 'public, max-age=31536000, immutable'
      };
    }
    
    return {
      'cache-control': 'public, max-age=3600'
    };
  } catch (error) {
    console.error('Error creating cache headers:', error);
    return {
      'cache-control': 'public, max-age=3600'
    };
  }
}
