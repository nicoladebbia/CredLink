/**
 * C2 Concierge Webflow Connector
 * Zero-backend connector for hosted Webflow sites
 * 
 * Features:
 * - Publish webhook handling
 * - Head code injection
 * - Badge rendering
 * - Remote manifest storage
 * - Health telemetry
 */

class WebflowConnector {
  constructor(config = {}) {
    this.config = {
      signUrl: config.signUrl || 'https://verify.c2concierge.org/sign',
      manifestHost: config.manifestHost || 'https://manifests.c2concierge.org',
      webhookUrl: config.webhookUrl || 'https://verify.c2concierge.org/webflow-hook',
      badgeUrl: config.badgeUrl || 'https://cdn.c2concierge.org/c2-badge.js',
      analyticsUrl: config.analyticsUrl || 'https://analytics.c2concierge.org/telemetry',
      siteId: config.siteId || '',
      apiToken: config.apiToken || '',
      enableTelemetry: config.enableTelemetry !== false,
      ...config
    };
    
    this.platform = 'webflow';
    this.version = '1.0.0';
    this.init();
  }

  /**
   * Initialize connector
   */
  init() {
    this.injectHeadCode();
    this.setupBadgeObserver();
    this.sendTelemetry('connector_init', { siteId: this.config.siteId });
  }

  /**
   * Generate head code injection
   */
  generateHeadCode() {
    const integrity = 'sha384-DEFAULT_INTEGRITY_HASH';
    
    return `
<!-- C2 Concierge C2PA Integration -->
<script>
window.C2C_WEBFLOW_CONFIG = ${JSON.stringify({
  platform: this.platform,
  version: this.version,
  manifestHost: this.config.manifestHost,
  webhookUrl: this.config.webhookUrl,
  siteId: this.config.siteId
})};
</script>
<script async src="${this.config.badgeUrl}" integrity="${integrity}" crossorigin="anonymous"></script>
<script>
(function() {
  // Auto-discovery for page-specific manifests
  function discoverManifest() {
    const images = document.querySelectorAll('img[data-c2pa-manifest]');
    images.forEach(img => {
      const manifestUrl = img.dataset.c2paManifest;
      if (manifestUrl) {
        const link = document.createElement('link');
        link.rel = 'c2pa-manifest';
        link.href = manifestUrl;
        document.head.appendChild(link);
      }
    });
  }
  
  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', discoverManifest);
  } else {
    discoverManifest();
  }
})();
</script>
<!-- End C2 Concierge Integration -->
    `.trim();
  }

  /**
   * Inject head code (for manual implementation)
   */
  injectHeadCode() {
    if (typeof document === 'undefined') return;
    
    // Check if already injected
    if (document.querySelector('script[data-c2c-webflow]')) {
      return;
    }

    const headCode = this.generateHeadCode();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = headCode;
    
    Array.from(tempDiv.children).forEach(child => {
      if (child.tagName === 'SCRIPT') {
        child.setAttribute('data-c2c-webflow', 'true');
        document.head.appendChild(child);
      } else if (child.tagName === 'LINK') {
        document.head.appendChild(child);
      }
    });
  }

  /**
   * Setup badge observer for dynamic content
   */
  setupBadgeObserver() {
    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processNodeForBadges(node);
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
   * Process node for badge attachment
   */
  processNodeForBadges(node) {
    if (node.tagName === 'IMG' && this.shouldAddBadge(node)) {
      this.addBadgeToImage(node);
    } else if (node.querySelectorAll) {
      const images = node.querySelectorAll('img');
      images.forEach(img => this.shouldAddBadge(img) && this.addBadgeToImage(img));
    }
  }

  /**
   * Check if image should have badge
   */
  shouldAddBadge(img) {
    return img.hasAttribute('data-c2pa-manifest') || 
           img.hasAttribute('data-c2pa-signed') ||
           img.src.includes('c2concierge');
  }

  /**
   * Add badge to image
   */
  addBadgeToImage(img) {
    if (img.hasAttribute('data-c2c-badge')) return;

    const manifestUrl = img.getAttribute('data-c2pa-manifest');
    if (!manifestUrl) return;

    // Create badge container
    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'c2c-badge-container';
    badgeContainer.style.cssText = `
      position: relative;
      display: inline-block;
    `;

    // Wrap image
    img.parentNode.insertBefore(badgeContainer, img);
    badgeContainer.appendChild(img);

    // Add badge
    const badge = document.createElement('div');
    badge.className = 'c2c-verification-badge';
    badge.setAttribute('data-manifest', manifestUrl);
    badge.style.cssText = `
      position: absolute;
      bottom: 8px;
      right: 8px;
      background: rgba(0, 0, 0, 0.8);
      color: white;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      z-index: 1000;
    `;
    badge.textContent = '✓ Verified';

    badgeContainer.appendChild(badge);
    img.setAttribute('data-c2c-badge', 'true');

    // Add click handler
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      this.showVerificationModal(manifestUrl);
    });
  }

  /**
   * Show verification modal
   */
  showVerificationModal(manifestUrl) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('c2c-verification-modal');
    if (!modal) {
      modal = this.createVerificationModal();
    }

    // Load verification data
    this.loadVerificationData(manifestUrl);
    
    // Show modal
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
  }

  /**
   * Create verification modal
   */
  createVerificationModal() {
    const modal = document.createElement('div');
    modal.id = 'c2c-verification-modal';
    modal.style.cssText = `
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
    `;

    modal.innerHTML = `
      <div style="background: white; padding: 20px; border-radius: 8px; max-width: 500px; width: 90%; max-height: 80vh; overflow-y: auto;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px;">
          <h3 style="margin: 0;">Content Authenticity</h3>
          <button onclick="this.closest('#c2c-verification-modal').style.display='none'; document.body.style.overflow='auto'" style="background: none; border: none; font-size: 20px; cursor: pointer;">×</button>
        </div>
        <div id="c2c-verification-content">
          <p>Loading verification information...</p>
        </div>
      </div>
    `;

    document.body.appendChild(modal);
    return modal;
  }

  /**
   * Load verification data
   */
  async loadVerificationData(manifestUrl) {
    try {
      const response = await fetch(`${this.config.manifestHost}/verify?url=${encodeURIComponent(manifestUrl)}`);
      const data = await response.json();
      
      this.displayVerificationData(data);
      this.sendTelemetry('verification_view', { manifestUrl, success: true });
    } catch (error) {
      this.displayVerificationError(error);
      this.sendTelemetry('verification_view', { manifestUrl, success: false, error: error.message });
    }
  }

  /**
   * Display verification data
   */
  displayVerificationData(data) {
    const content = document.getElementById('c2c-verification-content');
    if (!content) return;

    const status = data.verified ? '✅ Verified' : '❌ Unverified';
    const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown';
    const issuer = data.issuer || 'Unknown';

    content.innerHTML = `
      <div style="margin-bottom: 15px;">
        <strong>Status:</strong> ${status}
      </div>
      <div style="margin-bottom: 15px;">
        <strong>Issuer:</strong> ${issuer}
      </div>
      <div style="margin-bottom: 15px;">
        <strong>Created:</strong> ${timestamp}
      </div>
      ${data.manifest_url ? `
        <div style="margin-bottom: 15px;">
          <strong>Manifest:</strong> 
          <a href="${data.manifest_url}" target="_blank" style="color: #0066cc;">View Details</a>
        </div>
      ` : ''}
      <div style="margin-top: 20px; padding-top: 15px; border-top: 1px solid #eee; font-size: 12px; color: #666;">
        Powered by <a href="https://c2concierge.org" target="_blank" style="color: #0066cc;">C2 Concierge</a>
      </div>
    `;
  }

  /**
   * Display verification error
   */
  displayVerificationError(error) {
    const content = document.getElementById('c2c-verification-content');
    if (!content) return;

    content.innerHTML = `
      <div style="color: #d32f2f;">
        <strong>Verification Failed</strong>
        <p>Unable to verify content authenticity: ${error.message}</p>
      </div>
    `;
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
      console.warn('C2C Webflow: Telemetry failed', error);
    }
  }

  /**
   * Health check
   */
  async healthCheck() {
    try {
      const startTime = Date.now();
      const response = await fetch(`${this.config.signUrl}/health`, {
        method: 'GET',
        headers: {
          'X-C2C-Platform': this.platform
        }
      });
      
      const latency = Date.now() - startTime;
      
      if (response.ok) {
        await this.sendTelemetry('health_check_success', { latency });
        return { status: 'healthy', latency };
      } else {
        await this.sendTelemetry('health_check_failed', { 
          status: response.status,
          latency 
        });
        return { status: 'unhealthy', error: response.status };
      }
    } catch (error) {
      await this.sendTelemetry('health_check_error', { error: error.message });
      return { status: 'error', error: error.message };
    }
  }

  /**
   * Get copy-paste head code for manual installation
   */
  getInstallationCode() {
    return this.generateHeadCode();
  }

  /**
   * Get webhook handler code for server-side implementation
   */
  getWebhookHandler() {
    return `
// Webflow Webhook Handler (Node.js/Express)
app.post('/webflow-hook', express.json(), async (req, res) => {
  try {
    const { payload } = req.body;
    
    // Handle site publish
    if (payload.event === 'site_publish') {
      const siteUrl = payload.siteUrl;
      await processSiteImages(siteUrl);
    }
    
    // Handle CMS item publish
    if (payload.event === 'cms_item_publish') {
      const item = payload.cmsItem;
      await processCMSItem(item);
    }
    
    res.json({ status: 'processed' });
  } catch (error) {
    console.error('Webflow webhook error:', error);
    res.status(500).json({ error: error.message });
  }
});

async function processSiteImages(siteUrl) {
  // Extract images from site and sign them
  // Implementation depends on your setup
}

async function processCMSItem(item) {
  // Process CMS item images
  // Implementation depends on your setup
}
    `.trim();
  }
}

// Auto-initialize if script is loaded directly
if (typeof window !== 'undefined') {
  window.WebflowConnector = WebflowConnector;
  
  // Auto-initialize with global config if available
  if (window.C2C_WEBFLOW_CONFIG) {
    new WebflowConnector(window.C2C_WEBFLOW_CONFIG);
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = WebflowConnector;
}
