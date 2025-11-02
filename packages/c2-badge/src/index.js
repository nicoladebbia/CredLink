/**
 * C2 Badge Web Component
 * Main export file for the C2PA verification badge
 */
// Import the component first
import './c2-badge.js';
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('error', (event) => {
        const target = event.target;
        if (target && typeof target.src === 'string' && /badge-v/.test(target.src)) {
            document.documentElement.classList.add('c2-badge-degraded');
            console.warn('C2 badge integrity failed', event);
        }
    }, true);
}
// Export the main component
export { C2Badge } from './c2-badge.js';
// Helper function to create a badge programmatically
export function createBadge(config) {
    const badge = document.createElement('c2-badge');
    if (config.assetUrl) {
        badge.setAttribute('asset-url', config.assetUrl);
    }
    if (config.manifestUrl) {
        badge.setAttribute('manifest-url', config.manifestUrl);
    }
    if (config.apiUrl) {
        badge.setAttribute('api-url', config.apiUrl);
    }
    if (config.text) {
        badge.setAttribute('text', config.text);
    }
    if (config.autoOpen) {
        badge.setAttribute('auto-open', '');
    }
    return badge;
}
/**
 * Helper function to inject badges into all images on a page
 */
export function injectBadges(options = {}) {
    const selector = options.selector || 'img[src]';
    const images = document.querySelectorAll(selector);
    images.forEach((img) => {
        const src = img.getAttribute('src');
        if (!src)
            return;
        // Skip if badge already exists
        if (img.nextElementSibling?.tagName === 'C2-BADGE')
            return;
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
};
//# sourceMappingURL=index.js.map