/**
 * Phase 6 - Optimizer Auto-Fallback: Signal Detection
 * Detects strip-risk signals from CDN responses
 */

export interface Signal {
  id: string;
  weight: number;
}

export interface HeaderSnapshot {
  sample: number;
  percentWebP: number;
  percentAVIF: number;
  seenProviders: string[];
  contentTypeDrift: number;
  linkDroppedPct: number;
}

export function detectSignals(url: URL, headers: Headers): Signal[] {
  const signals: Signal[] = [];
  
  // Cloudflare Polish detection
  if (headers.get("cf-polished")) {
    signals.push({ id: "HDR_CF_POLISH", weight: 35 });
  }
  
  // Imgix detection
  if (url.searchParams.has("ixlib") || 
      url.pathname.includes("/imgix/") || 
      headers.get("x-imgix-id")) {
    signals.push({ id: "HDR_IMGIX", weight: 35 });
  }
  
  // Cloudinary detection
  if (url.hostname.includes("res.cloudinary.com") || 
      url.pathname.includes("/image/fetch/")) {
    signals.push({ id: "HDR_CLOUDINARY", weight: 35 });
  }
  
  // Fastly IO detection
  if (headers.get("fastly-io-info") || 
      url.searchParams.has("fastlyio")) {
    signals.push({ id: "HDR_FASTLY_IO", weight: 35 });
  }
  
  // Akamai IVM detection
  if (headers.get("akamai-pragma") || 
      url.searchParams.has("im")) {
    signals.push({ id: "HDR_AKAMAI_IVM", weight: 35 });
  }
  
  // MIME drift detection
  if (contentTypeDrift(url, headers)) {
    signals.push({ id: "MIME_DRIFT", weight: 20 });
  }
  
  // Size anomaly detection (simplified)
  const contentLength = headers.get("content-length");
  if (contentLength) {
    // This would need per-asset cache for real implementation
    // For now, just check for suspiciously small sizes that might indicate stripping
    const size = parseInt(contentLength);
    if (size > 0 && size < 1024 && isImageRequest(url)) {
      signals.push({ id: "SIZE_ANOMALY", weight: 15 });
    }
  }
  
  // ETag mutation detection
  const etag = headers.get("etag");
  if (etag && etag.includes('"') && etag.length > 32) {
    // Long ETags might indicate constant rewriting
    signals.push({ id: "ETAG_MUTATE", weight: 10 });
  }
  
  return signals;
}

export function contentTypeDrift(url: URL, headers: Headers): boolean {
  const contentType = (headers.get("content-type") || "").toLowerCase().split(';')[0];
  const canonical = canonicalTypeFromExt(url.pathname);
  
  if (!canonical || !contentType) return false;
  
  // Allow certain acceptable transformations
  const acceptableTransforms: Record<string, string[]> = {
    'image/jpeg': ['image/webp', 'image/avif'],
    'image/png': ['image/webp', 'image/avif'],
    'image/gif': ['image/webp', 'image/png'],
  };
  
  return !acceptableTransforms[canonical]?.includes(contentType);
}

export function canonicalTypeFromExt(pathname: string): string | null {
  const ext = pathname.split('.').pop()?.toLowerCase();
  
  const typeMap: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'avif': 'image/avif',
    'svg': 'image/svg+xml',
  };
  
  return typeMap[ext || ''] || null;
}

export function isImageRequest(url: URL): boolean {
  const pathname = url.pathname.toLowerCase();
  return /\.(jpg|jpeg|png|gif|webp|avif|svg)$/i.test(pathname);
}

export function isHtml(response: Response): boolean {
  const contentType = response.headers.get("content-type") || "";
  return contentType.toLowerCase().includes("text/html");
}

export function routeFrom(url: URL): string {
  // Extract hostname and stable path prefix
  const hostname = url.hostname;
  const pathParts = url.pathname.split('/').filter(Boolean);
  
  // Use first path segment as prefix, or root if none
  const pathPrefix = pathParts.length > 0 ? `/${pathParts[0]}/` : '/';
  
  return `${hostname}:${pathPrefix}`;
}

export function isPreservePath(pathname: string): boolean {
  // Preserve paths are those that should maintain C2PA manifests
  // Typically original images, not transformed versions
  const preservePatterns = [
    /\/original\//i,
    /\/preserve\//i,
    /\/source\//i,
    /\/raw\//i,
  ];
  
  const transformPatterns = [
    /\/transform\//i,
    /\/optimize\//i,
    /\/resize\//i,
    /\/crop\//i,
    /\/format\//i,
  ];
  
  // If it matches preserve patterns, it's a preserve path
  if (preservePatterns.some(pattern => pattern.test(pathname))) {
    return true;
  }
  
  // If it matches transform patterns, it's not a preserve path
  if (transformPatterns.some(pattern => pattern.test(pathname))) {
    return false;
  }
  
  // Default: assume preserve unless clearly transformed
  return true;
}
