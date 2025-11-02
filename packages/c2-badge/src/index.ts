/**
 * C2 Badge Web Component
 * Main export file for the C2PA verification badge
 */

// Import the component first
import './c2-badge.js';

// Export types
export type { 
  C2BadgeAttributes, 
  C2BadgeConfig, 
  VerificationResult, 
  C2BadgeEvents 
} from './types.js';

// Export the main component
export { C2Badge } from './c2-badge.js';

// Helper function to create a badge programmatically
export function createBadge(config: {
  apiUrl?: string;
  assetUrl?: string;
  manifestUrl?: string;
  text?: string;
  autoOpen?: boolean;
}) {
  const badge = document.createElement('c2-badge');
  
  if (config.assetUrl) {
    (badge as any).setAttribute('asset-url', config.assetUrl);
  }
  
  if (config.manifestUrl) {
    (badge as any).setAttribute('manifest-url', config.manifestUrl);
  }
  
  if (config.apiUrl) {
    (badge as any).setAttribute('api-url', config.apiUrl);
  }
  
  if (config.text) {
    (badge as any).setAttribute('text', config.text);
  }
  
  if (config.autoOpen) {
    (badge as any).setAttribute('auto-open', '');
  }
  
  return badge;
}

/**
 * Helper function to inject badges into all images on a page
 */
export function injectBadges(options: {
  /** CSS selector for images to target */
  selector?: string;
  /** Verification API URL */
  apiUrl?: string;
  /** Custom badge text */
  text?: string;
} = {}): void {
  const selector = options.selector || 'img[src]';
  const images = document.querySelectorAll(selector);
  
  images.forEach((img) => {
    const src = img.getAttribute('src');
    if (!src) return;
    
    // Skip if badge already exists
    if (img.nextElementSibling?.tagName === 'C2-BADGE') return;
    
    const badge = createBadge({
      assetUrl: src,
      apiUrl: options.apiUrl,
      text: options.text
    });
    
    // Insert badge after the image
    img.parentNode?.insertBefore(badge, img.nextSibling);
  });
}

/**
 * Version information
 */
export const VERSION = '1.0.0';

/**
 * Default configuration
 */
export const DEFAULT_CONFIG = {
  apiUrl: 'https://verify.c2pa.org/api/v1',
  text: 'Verify',
  autoOpen: false
} as const;
