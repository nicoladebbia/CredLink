/**
 * C2 Concierge Squarespace Connector
 * Minimal-intrusion connector for Squarespace sites
 * 
 * Features:
 * - Header/Footer code injection
 * - Commerce webhook support
 * - Product image verification
 * - Badge rendering
 * - Remote manifest storage
 */

class SquarespaceConnector {
  constructor(config = {}) {
    this.config = {
      signUrl: config.signUrl || 'https://verify.c2concierge.org/sign',
      manifestHost: config.manifestHost || 'https://manifests.c2concierge.org',
      webhookUrl: config.webhookUrl || 'https://verify.c2concierge.org/squarespace-hook',
      badgeUrl: config.badgeUrl || 'https://cdn.c2concierge.org/c2-badge.js',
      analyticsUrl: config.analyticsUrl || 'https://analytics.c2concierge.org/telemetry',
      siteId: config.siteId || '',
      enableCommerce: config.enableCommerce !== false,
      enableTelemetry: config.enableTelemetry !== false,
      badgePosition: config.badgePosition || 'bottom-right',
      ...config
    };
    
    this.platform = 'squarespace';
    this.version = '1.0.0';
    this.init();
  }

  /**
   * Initialize connector
   */
  init() {
    this.injectHeaderCode();
    this.injectFooterCode();
    this.setupProductImageObserver();
    this.sendTelemetry('connector_init', { siteId: this.config.siteId });
  }

  /**
   * Generate header code injection
   */
  generateHeaderCode() {
    return `
<!-- C2 Concierge C2PA Integration - Header -->
<script>
window.C2C_SQUARESPACE_CONFIG = ${JSON.stringify({
  platform: this.platform,
  version: this.version,
  manifestHost: this.config.manifestHost,
  webhookUrl: this.config.webhookUrl,
  siteId: this.config.siteId,
  enableCommerce: this.config.enableCommerce,
  badgePosition: this.config.badgePosition
})};
</script>
<script async src="${this.config.badgeUrl}" integrity="sha384-DEFAULT_INTEGRITY_HASH" crossorigin="anonymous"></script>
<style>
/* C2 Concierge Badge Styles */
.c2c-badge-container {
  position: relative;
  display: inline-block;
}

.c2c-verification-badge {
  position: absolute;
  ${this.getBadgePositionStyles()}
  background: rgba(0, 0, 0, 0.8);
  color: white;
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  cursor: pointer;
  z-index: 1000;
  transition: all 0.2s ease;
  backdrop-filter: blur(4px);
}

.c2c-verification-badge:hover {
  background: rgba(0, 0, 0, 0.9);
  transform: translateY(-1px);
}

.c2c-verification-badge.verified {
  background: rgba(16, 185, 129, 0.9);
}

.c2c-verification-badge.unverified {
  background: rgba(239, 68, 68, 0.9);
}

/* Product image specific styles */
.ProductItem-gallery .c2c-verification-badge {
  bottom: 12px;
  right: 12px;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .c2c-verification-badge {
    font-size: 10px;
    padding: 4px 8px;
  }
}
</style>
<!-- End C2 Concierge Header -->
    `.trim();
  }

  /**
   * Generate footer code injection
   */
  generateFooterCode() {
    return `
<!-- C2 Concierge C2PA Integration - Footer -->
<script>
(function() {
  'use strict';
  
  const config = window.C2C_SQUARESPACE_CONFIG || {};
  const manifestHost = config.manifestHost || 'https://manifests.c2concierge.org';
  
  // Squarespace specific selectors
  const SELECTORS = {
    productImages: '.ProductItem-gallery-slide img, .ProductItem-relatedImages img',
    blogImages: '.BlogItem-body img, .BlogList-item img',
    galleryImages: '.gallery-slide img, .sqs-gallery-image-container img',
    generalImages: 'img[data-image-focal-point], img[src*="squarespace"]'
  };
  
  // Initialize badge system
  function initBadges() {
    console.log('C2 Concierge: Initializing badges for Squarespace');
    
    // Process existing images
    processAllImages();
    
    // Observe for dynamic content
    setupImageObserver();
    
    // Handle Squarespace page transitions
    setupPageTransitionHandler();
  }
  
  // Process all images on the page
  function processAllImages() {
    const allSelectors = Object.values(SELECTORS).join(', ');
    const images = document.querySelectorAll(allSelectors);
    
    images.forEach(img => {
      if (shouldAddBadge(img)) {
        addBadgeToImage(img);
      }
    });
  }
  
  // Check if image should have badge
  function shouldAddBadge(img) {
    // Skip if already processed
    if (img.hasAttribute('data-c2c-badge')) return false;
    
    // Skip tiny images
    if (img.naturalWidth < 100 || img.naturalHeight < 100) return false;
    
    // Check for Squarespace product images
    if (img.closest('.ProductItem-gallery')) return true;
    
    // Check for images with manifest data
    if (img.hasAttribute('data-c2pa-manifest')) return true;
    
    // Check for high-quality images (likely to be content)
    if (img.src.includes('squarespace-cdn.com') && 
        (img.src.includes('format=original') || img.src.includes('quality=100'))) {
      return true;
    }
    
    return false;
  }
  
  // Add badge to image
  function addBadgeToImage(img) {
    // Generate manifest URL based on image
    const manifestUrl = generateManifestUrl(img);
    
    if (!manifestUrl) return;
    
    // Create badge container
    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'c2c-badge-container';
    badgeContainer.style.cssText = 'position: relative; display: inline-block;';
    
    // Wrap image
    img.parentNode.insertBefore(badgeContainer, img);
    badgeContainer.appendChild(img);
    
    // Create badge
    const badge = document.createElement('div');
    badge.className = 'c2c-verification-badge';
    badge.setAttribute('data-manifest', manifestUrl);
    badge.setAttribute('data-image-src', img.src);
    badge.textContent = '✓ Authentic';
    
    // Add click handler
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showVerificationModal(manifestUrl, img);
    });
    
    badgeContainer.appendChild(badge);
    img.setAttribute('data-c2c-badge', 'true');
    
    // Verify manifest asynchronously
    verifyManifestAsync(manifestUrl, badge);
  }
  
  // Generate manifest URL for image
  function generateManifestUrl(img) {
    const imageHash = generateImageHash(img.src);
    return \`\${manifestHost}/squarespace/\${imageHash}.c2pa\`;
  }
  
  // Simple hash function for image URL
  function generateImageHash(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }
  
  // Verify manifest asynchronously
  async function verifyManifestAsync(manifestUrl, badge) {
    try {
      const response = await fetch(\`\${manifestHost}/verify?url=\${encodeURIComponent(manifestUrl)}\`);
      const data = await response.json();
      
      if (data.verified) {
        badge.className = 'c2c-verification-badge verified';
        badge.textContent = '✓ Verified';
        badge.setAttribute('data-verified', 'true');
      } else {
        badge.className = 'c2c-verification-badge unverified';
        badge.textContent = '? Unverified';
      }
    } catch (error) {
      console.warn('C2 Concierge: Manifest verification failed', error);
      badge.className = 'c2c-verification-badge';
      badge.textContent = '? Unknown';
    }
  }
  
  // Show verification modal
  function showVerificationModal(manifestUrl, image) {
    createVerificationModal();
    loadVerificationData(manifestUrl, image);
  }
  
  // Create verification modal
  function createVerificationModal() {
    if (document.getElementById('c2c-verification-modal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'c2c-verification-modal';
    modal.style.cssText = \`
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.8);
      display: none;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      backdrop-filter: blur(4px);
    \`;
    
    modal.innerHTML = \`
      <div style="background: white; padding: 32px; border-radius: 12px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="margin: 0; font-size: 24px; font-weight: 600;">Content Authenticity</h3>
          <button onclick="this.closest('#c2c-verification-modal').style.display='none'; document.body.style.overflow='auto'" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">×</button>
        </div>
        <div id="c2c-verification-content">
          <div style="text-align: center; padding: 40px;">
            <div style="width: 40px; height: 40px; border: 3px solid #f3f4f6; border-top: 3px solid #3b82f6; border-radius: 50%; animation: spin 1s linear infinite; margin: 0 auto 16px;"></div>
            <p style="color: #666; margin: 0;">Loading verification information...</p>
          </div>
        </div>
      </div>
      <style>
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      </style>
    \`;
    
    document.body.appendChild(modal);
  }
  
  // Load verification data
  async function loadVerificationData(manifestUrl, image) {
    const content = document.getElementById('c2c-verification-content');
    if (!content) return;
    
    try {
      const response = await fetch(\`\${manifestHost}/verify?url=\${encodeURIComponent(manifestUrl)}\`);
      const data = await response.json();
      
      displayVerificationData(data, image);
      sendTelemetry('verification_view', { manifestUrl, success: true });
    } catch (error) {
      displayVerificationError(error, image);
      sendTelemetry('verification_view', { manifestUrl, success: false, error: error.message });
    }
  }
  
  // Display verification data
  function displayVerificationData(data, image) {
    const content = document.getElementById('c2c-verification-content');
    if (!content) return;
    
    const status = data.verified ? '✅ Verified Authentic' : '❌ Cannot Verify';
    const statusColor = data.verified ? '#16a34a' : '#dc2626';
    const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown';
    const issuer = data.issuer || 'Content Creator';
    
    content.innerHTML = \`
      <div style="margin-bottom: 20px;">
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: \${data.verified ? '#dcfce7' : '#fee2e2'}; display: flex; align-items: center; justify-content: center; margin-right: 16px;">
            <span style="font-size: 24px;">\${data.verified ? '✓' : '?'}</span>
          </div>
          <div>
            <div style="font-size: 18px; font-weight: 600; color: \${statusColor};">\${status}</div>
            <div style="color: #666; font-size: 14px;">Content Authenticity Initiative</div>
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px;">
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Creator:</strong> 
            <span style="color: #6b7280;">\${issuer}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Created:</strong> 
            <span style="color: #6b7280;">\${timestamp}</span>
          </div>
          \${data.manifest_url ? \`
            <div>
              <strong style="color: #374151;">Technical Details:</strong> 
              <a href="\${data.manifest_url}" target="_blank" style="color: #3b82f6; text-decoration: none;">View C2PA Manifest →</a>
            </div>
          \` : ''}
        </div>
      </div>
      
      \${image ? \`
        <div style="margin-bottom: 20px;">
          <strong style="color: #374151; display: block; margin-bottom: 8px;">Content Preview:</strong>
          <img src="\${image.src}" style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e5e7eb;">
        </div>
      \` : ''}
      
      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
        <p style="margin: 0 0 8px;">This content includes provenance information secured by C2PA technology.</p>
        <p>Powered by <a href="https://c2concierge.org" target="_blank" style="color: #3b82f6; text-decoration: none;">C2 Concierge</a></p>
      </div>
    \`;
  }
  
  // Display verification error
  function displayVerificationError(error, image) {
    const content = document.getElementById('c2c-verification-content');
    if (!content) return;
    
    content.innerHTML = \`
      <div style="text-align: center; padding: 40px;">
        <div style="color: #dc2626; margin-bottom: 16px;">
          <span style="font-size: 48px;">⚠️</span>
        </div>
        <h4 style="color: #dc2626; margin: 0 0 12px;">Verification Unavailable</h4>
        <p style="color: #6b7280; margin: 0;">Unable to verify content authenticity at this time.</p>
        <p style="color: #9ca3af; font-size: 12px; margin: 8px 0 0;">Error: \${error.message}</p>
      </div>
    \`;
  }
  
  // Setup image observer for dynamic content
  function setupImageObserver() {
    if (typeof MutationObserver === 'undefined') return;
    
    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            processNodeForImages(node);
          }
        });
      });
    });
    
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }
  
  // Process node for images
  function processNodeForImages(node) {
    if (node.tagName === 'IMG' && shouldAddBadge(node)) {
      addBadgeToImage(node);
    } else if (node.querySelectorAll) {
      const allSelectors = Object.values(SELECTORS).join(', ');
      const images = node.querySelectorAll(allSelectors);
      images.forEach(img => shouldAddBadge(img) && addBadgeToImage(img));
    }
  }
  
  // Setup Squarespace page transition handler
  function setupPageTransitionHandler() {
    // Squarespace uses AJAX navigation
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(processAllImages, 1000); // Delay for content load
      }
    }).observe(document, { subtree: true, childList: true });
  }
  
  // Send telemetry data
  async function sendTelemetry(event, data = {}) {
    if (!config.enableTelemetry) return;
    
    try {
      await fetch('https://analytics.c2concierge.org/telemetry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event,
          platform: 'squarespace',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          siteId: config.siteId,
          ...data
        })
      });
    } catch (error) {
      console.warn('C2 Concierge: Telemetry failed', error);
    }
  }
  
  // Initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initBadges);
  } else {
    initBadges();
  }
})();
</script>
<!-- End C2 Concierge Footer -->
    `.trim();
  }

  /**
   * Get badge position styles
   */
  getBadgePositionStyles() {
    const positions = {
      'top-left': 'top: 8px; left: 8px;',
      'top-right': 'top: 8px; right: 8px;',
      'bottom-left': 'bottom: 8px; left: 8px;',
      'bottom-right': 'bottom: 8px; right: 8px;'
    };
    return positions[this.config.badgePosition] || positions['bottom-right'];
  }

  /**
   * Inject header code
   */
  injectHeaderCode() {
    if (typeof document === 'undefined') return;
    
    if (document.querySelector('script[data-c2c-squarespace-header]')) {
      return;
    }

    const headerCode = this.generateHeaderCode();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = headerCode;
    
    Array.from(tempDiv.children).forEach(child => {
      if (child.tagName === 'SCRIPT') {
        child.setAttribute('data-c2c-squarespace-header', 'true');
        document.head.appendChild(child);
      } else if (child.tagName === 'STYLE') {
        document.head.appendChild(child);
      }
    });
  }

  /**
   * Inject footer code
   */
  injectFooterCode() {
    if (typeof document === 'undefined') return;
    
    if (document.querySelector('script[data-c2c-squarespace-footer]')) {
      return;
    }

    const footerScript = document.createElement('script');
    footerScript.setAttribute('data-c2c-squarespace-footer', 'true');
    footerScript.textContent = this.generateFooterCode();
    document.body.appendChild(footerScript);
  }

  /**
   * Setup product image observer
   */
  setupProductImageObserver() {
    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processNodeForProductImages(node);
          }
        });
      });
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /**
   * Process node for product images
   */
  processNodeForProductImages(node) {
    if (node.tagName === 'IMG' && this.isProductImage(node)) {
      this.addBadgeToProductImage(node);
    } else if (node.querySelectorAll) {
      const productImages = node.querySelectorAll('.ProductItem-gallery-slide img, .ProductItem-relatedImages img');
      productImages.forEach(img => this.addBadgeToProductImage(img));
    }
  }

  /**
   * Check if image is a product image
   */
  isProductImage(img) {
    return img.closest('.ProductItem-gallery') || 
           img.closest('.ProductItem-relatedImages') ||
           img.classList.contains('sqs-image');
  }

  /**
   * Add badge to product image
   */
  addBadgeToProductImage(img) {
    if (img.hasAttribute('data-c2c-badge')) return;

    // Implementation handled by the main footer script
    console.log('C2 Concierge: Processing product image', img.src);
  }

  /**
   * Send telemetry data
   */
  async sendTelemetry(event, data = {}) {
    if (!this.config.enableTelemetry) return;

    try {
      await fetch(this.config.analyticsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event,
          platform: this.platform,
          version: this.version,
          timestamp: new Date().toISOString(),
          siteId: this.config.siteId,
          ...data
        })
      });
    } catch (error) {
      console.warn('C2C Squarespace: Telemetry failed', error);
    }
  }

  /**
   * Get copy-paste header code for manual installation
   */
  getHeaderCode() {
    return this.generateHeaderCode();
  }

  /**
   * Get copy-paste footer code for manual installation
   */
  getFooterCode() {
    return this.generateFooterCode();
  }

  /**
   * Get commerce webhook configuration
   */
  getCommerceWebhookConfig() {
    return {
      url: this.config.webhookUrl,
      events: [
        'order.created',
        'product.created',
        'product.updated',
        'variant.created'
      ],
      headers: {
        'Content-Type': 'application/json',
        'X-C2C-Platform': 'squarespace'
      }
    };
  }
}

// Auto-initialize if script is loaded directly
if (typeof window !== 'undefined') {
  window.SquarespaceConnector = SquarespaceConnector;
  
  // Auto-initialize with global config if available
  if (window.C2C_SQUARESPACE_CONFIG) {
    new SquarespaceConnector(window.C2C_SQUARESPACE_CONFIG);
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = SquarespaceConnector;
}
