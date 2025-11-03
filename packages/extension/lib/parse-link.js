/**
 * RFC 8288 Link header parser for C2PA manifest discovery
 * Handles multi-value headers with proper parameter parsing
 */

export function parseLinkHeader(headerValue) {
  // Input validation
  if (!headerValue || typeof headerValue !== 'string') {
    return {};
  }
  
  // Length validation to prevent DoS
  if (headerValue.length > 8192) {
    return {};
  }
  
  // Block dangerous content
  if (headerValue.includes('javascript:') || 
      headerValue.includes('data:text/html') ||
      headerValue.includes('<script')) {
    return {};
  }
  
  const links = {};
  
  // Safe regex with timeout to prevent ReDoS
  const parts = safeSplit(headerValue);
  
  // Limit number of parts to prevent DoS
  if (parts.length > 50) {
    return {};
  }
  
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed || trimmed.length > 1000) continue;
    
    // Extract URL between < and > with safe regex
    const urlMatch = trimmed.match(/^<([^<>]+)>/);
    if (!urlMatch) continue;
    
    const url = urlMatch[1];
    
    // Validate URL
    if (!url || url.length > 2048) continue;
    if (url.includes('javascript:') || url.includes('data:text/html')) continue;
    
    // Parse parameters after URL
    const paramsStr = trimmed.slice(urlMatch[0].length).trim();
    const params = {};
    
    // Safe parameter parsing
    const paramMatches = safeParseParams(paramsStr);
    
    // Limit number of parameters
    if (paramMatches.length > 20) continue;
    
    for (const match of paramMatches) {
      const key = match.key;
      let value = match.value;
      
      // Validate key and value
      if (!key || key.length > 50 || !value || value.length > 200) continue;
      
      // Remove quotes if present
      if (value.startsWith('"') && value.endsWith('"')) {
        value = value.slice(1, -1);
      }
      
      // Sanitize value
      value = value.replace(/<[^>]*>/g, ''); // Remove HTML tags
      
      params[key] = value;
    }
    
    // Use first parameter as rel if present
    const rel = params.rel || Object.keys(params)[0];
    if (rel) {
      links[rel] = url;
    }
  }
  
  return links;
}

export function findC2paManifestLink(headerValue) {
  const links = parseLinkHeader(headerValue);
  return links['c2pa-manifest'] || links['c2pa-manifest'] || null;
}

export function validateManifestUrl(url) {
  try {
    const parsed = new URL(url);
    // Must be HTTPS or data URL for security
    return parsed.protocol === 'https:' || parsed.protocol === 'data:';
  } catch {
    return false;
  }
}
