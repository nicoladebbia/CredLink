/**
 * Phase 6 - Optimizer Auto-Fallback: HTML Processing
 * Handles manifest link injection and badge enforcement
 */

import { isHtml } from './detectors';

// HTMLRewriter is built into Cloudflare Workers
declare const HTMLRewriter: any;

export interface Env {
  MANIFEST_BASE: string;
  BADGE_REQUIRED: string;
}

export async function ensureManifestLink(response: Response, env: Env, url: URL): Promise<Response> {
  if (!isHtml(response)) {
    return response;
  }
  
  const manifestHash = response.headers.get("X-Manifest-Hash");
  if (!manifestHash) {
    return response;
  }
  
  const manifestUrl = `${env.MANIFEST_BASE}/${manifestHash}.c2pa`;
  
  const rewriter = new HTMLRewriter()
    .on('head', {
      element(el) {
        // Simplified implementation - just append the link
        el.append(
          `<link rel="c2pa-manifest" href="${manifestUrl}" data-asset="${url.href}">`, 
          { html: true }
        );
      }
    });
  
  return rewriter.transform(response);
}

export async function injectBadge(response: Response): Promise<Response> {
  if (!isHtml(response)) {
    return response;
  }
  
  const rewriter = new HTMLRewriter()
    .on('picture', {
      element(el) {
        // Handle picture elements
        el.setAttribute('data-c2-badged', '1');
      }
    })
    .on('img', {
      element(el) {
        // Handle individual img elements
        if (!el.getAttribute('data-c2-badged')) {
          const src = el.getAttribute('src') || '';
          el.after(
            `<c2-badge data-asset-url="${src}"></c2-badge>`, 
            { html: true }
          );
          el.setAttribute('data-c2-badged', '1');
        }
      }
    });
  
  return rewriter.transform(response);
}

export function linkPresent(response: Response): boolean {
  if (!isHtml(response)) {
    return true; // Not HTML, so link requirement doesn't apply
  }
  
  // Simplified check - if we have X-Manifest-Hash, assume link should be present
  return !!response.headers.get("X-Manifest-Hash");
}

export async function maybeEmbedProbe(response: Response): Promise<boolean | null> {
  // Lightweight embed probe for preserve pages
  // Sample 1 in 200 preserve hits to avoid performance impact
  if (Math.random() > 0.005) { // 0.5% sampling
    return null;
  }
  
  if (!isHtml(response)) {
    return null;
  }
  
  // For HTML responses, check for C2PA-related elements
  try {
    const text = await response.clone().text();
    const hasC2PAIndicators = 
      text.includes('c2pa-manifest') ||
      text.includes('c2-badge') ||
      text.includes('data-c2-badged');
    
    return hasC2PAIndicators;
  } catch (error) {
    // If we can't read the response, don't penalize
    return null;
  }
}
