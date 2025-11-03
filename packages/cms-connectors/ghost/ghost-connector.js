/**
 * C2 Concierge Ghost Connector
 * Theme-level and Code Injection connector for Ghost
 * 
 * Features:
 * - Handlebars theme partial integration
 * - Code Injection support
 * - Post webhook handling
 * - Image verification badges
 * - Remote manifest storage
 */

class GhostConnector {
  constructor(config = {}) {
    this.config = {
      signUrl: config.signUrl || 'https://verify.c2concierge.org/sign',
      manifestHost: config.manifestHost || 'https://manifests.c2concierge.org',
      webhookUrl: config.webhookUrl || 'https://verify.c2concierge.org/ghost-hook',
      badgeUrl: config.badgeUrl || 'https://cdn.c2concierge.org/c2-badge.js',
      analyticsUrl: config.analyticsUrl || 'https://analytics.c2concierge.org/telemetry',
      siteUrl: config.siteUrl || window.location.origin,
      enableTelemetry: config.enableTelemetry !== false,
      badgePosition: config.badgePosition || 'bottom-right',
      autoSignImages: config.autoSignImages !== false,
      ...config
    };
    
    this.platform = 'ghost';
    this.version = '1.0.0';
    this.init();
  }

  /**
   * Initialize connector
   */
  init() {
    this.injectManifestLinks();
    this.setupImageObserver();
    this.setupPostImageProcessor();
    this.sendTelemetry('connector_init', { siteUrl: this.config.siteUrl });
  }

  /**
   * Inject manifest links for Ghost content
   */
  injectManifestLinks() {
    // Check for Ghost post context
    if (this.isGhostPost()) {
      this.injectPostManifestLinks();
    }
    
    // Check for Ghost page context
    if (this.isGhostPage()) {
      this.injectPageManifestLinks();
    }
  }

  /**
   * Check if current page is a Ghost post
   */
  isGhostPost() {
    return document.body.classList.contains('post-template') ||
           document.querySelector('.post-full-content') ||
           window.location.pathname.includes('/p/') ||
           document.querySelector('article.post');
  }

  /**
   * Check if current page is a Ghost page
   */
  isGhostPage() {
    return document.body.classList.contains('page-template') ||
           document.querySelector('.page-content') ||
           document.querySelector('article.page');
  }

  /**
   * Inject manifest links for posts
   */
  injectPostManifestLinks() {
    const postImages = this.extractPostImages();
    
    postImages.forEach((image, index) => {
      const manifestUrl = this.generateManifestUrl(image.src, 'post', index);
      this.injectManifestLink(manifestUrl);
    });
  }

  /**
   * Inject manifest links for pages
   */
  injectPageManifestLinks() {
    const pageImages = this.extractPageImages();
    
    pageImages.forEach((image, index) => {
      const manifestUrl = this.generateManifestUrl(image.src, 'page', index);
      this.injectManifestLink(manifestUrl);
    });
  }

  /**
   * Extract images from Ghost post
   */
  extractPostImages() {
    const images = [];
    
    // Feature image
    const featureImage = document.querySelector('.post-full-image img, .post-image img');
    if (featureImage) {
      images.push(featureImage);
    }
    
    // Content images
    const contentImages = document.querySelectorAll('.post-full-content img, .post-content img, .kg-image-card img');
    contentImages.forEach(img => images.push(img));
    
    // Gallery images
    const galleryImages = document.querySelectorAll('.kg-gallery-card img, .kg-image-gallery img');
    galleryImages.forEach(img => images.push(img));
    
    return this.filterUniqueImages(images);
  }

  /**
   * Extract images from Ghost page
   */
  extractPageImages() {
    const images = [];
    
    // Content images
    const contentImages = document.querySelectorAll('.page-content img, .kg-image-card img');
    contentImages.forEach(img => images.push(img));
    
    // Gallery images
    const galleryImages = document.querySelectorAll('.kg-gallery-card img, .kg-image-gallery img');
    galleryImages.forEach(img => images.push(img));
    
    return this.filterUniqueImages(images);
  }

  /**
   * Filter unique images
   */
  filterUniqueImages(images) {
    const seen = new Set();
    return images.filter(img => {
      if (seen.has(img.src)) {
        return false;
      }
      seen.add(img.src);
      return true;
    });
  }

  /**
   * Generate manifest URL
   */
  generateManifestUrl(imageUrl, contentType, index) {
    const imageHash = this.generateImageHash(imageUrl);
    const postId = this.getPostId();
    const context = postId ? `post-${postId}` : contentType;
    
    return `${this.config.manifestHost}/ghost/${context}-${imageHash}.c2pa`;
  }

  /**
   * Generate image hash
   */
  generateImageHash(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get current post ID
   */
  getPostId() {
    // Try to extract from URL
    const urlMatch = window.location.pathname.match(/\/p\/([^\/]+)/);
    if (urlMatch) return urlMatch[1];
    
    // Try to extract from data attributes
    const article = document.querySelector('article');
    if (article) {
      return article.getAttribute('data-id') || 
             article.getAttribute('data-post-id') ||
             article.id;
    }
    
    return null;
  }

  /**
   * Inject manifest link tag
   */
  injectManifestLink(manifestUrl) {
    // Check if already exists
    if (document.querySelector(`link[href="${manifestUrl}"]`)) {
      return;
    }
    
    const link = document.createElement('link');
    link.rel = 'c2pa-manifest';
    link.href = manifestUrl;
    document.head.appendChild(link);
  }

  /**
   * Setup image observer for dynamic content
   */
  setupImageObserver() {
    if (typeof MutationObserver === 'undefined') return;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            this.processNodeForImages(node);
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
   * Process node for images
   */
  processNodeForImages(node) {
    if (node.tagName === 'IMG' && this.shouldAddBadge(node)) {
      this.addBadgeToImage(node);
    } else if (node.querySelectorAll) {
      const images = node.querySelectorAll('.kg-image-card img, .kg-gallery-card img, .post-full-content img');
      images.forEach(img => this.shouldAddBadge(img) && this.addBadgeToImage(img));
    }
  }

  /**
   * Check if image should have badge
   */
  shouldAddBadge(img) {
    // Skip if already processed
    if (img.hasAttribute('data-c2c-badge')) return false;
    
    // Skip tiny images
    if (img.naturalWidth < 150 || img.naturalHeight < 150) return false;
    
    // Check for Ghost content images
    if (img.closest('.post-full-content') || 
        img.closest('.page-content') ||
        img.closest('.kg-image-card') ||
        img.closest('.kg-gallery-card')) {
      return true;
    }
    
    // Check for feature images
    if (img.closest('.post-full-image') || 
        img.closest('.post-image')) {
      return true;
    }
    
    return false;
  }

  /**
   * Add badge to image
   */
  addBadgeToImage(img) {
    const manifestUrl = this.generateManifestUrl(img.src, 'content', 0);
    
    // Create badge container
    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'c2c-badge-container';
    badgeContainer.style.cssText = `
      position: relative;
      display: inline-block;
      max-width: 100%;
    `;

    // Wrap image
    img.parentNode.insertBefore(badgeContainer, img);
    badgeContainer.appendChild(img);

    // Create badge
    const badge = document.createElement('div');
    badge.className = 'c2c-ghost-badge';
    badge.setAttribute('data-manifest', manifestUrl);
    badge.setAttribute('data-image-src', img.src);
    badge.style.cssText = this.getBadgeStyles();
    badge.innerHTML = '✓ <span>Authentic</span>';

    // Add click handler
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showVerificationModal(manifestUrl, img);
    });

    badgeContainer.appendChild(badge);
    img.setAttribute('data-c2c-badge', 'true');

    // Verify manifest asynchronously
    this.verifyManifestAsync(manifestUrl, badge);
  }

  /**
   * Get badge styles
   */
  getBadgeStyles() {
    const positions = {
      'top-left': 'top: 12px; left: 12px;',
      'top-right': 'top: 12px; right: 12px;',
      'bottom-left': 'bottom: 12px; left: 12px;',
      'bottom-right': 'bottom: 12px; right: 12px;'
    };
    
    return `
      position: absolute;
      ${positions[this.config.badgePosition] || positions['bottom-right']}
      background: rgba(0, 0, 0, 0.85);
      color: white;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      cursor: pointer;
      z-index: 1000;
      transition: all 0.2s ease;
      backdrop-filter: blur(8px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
    `;
  }

  /**
   * Setup post image processor
   */
  setupPostImageProcessor() {
    // Process existing images
    this.processExistingImages();
    
    // Handle Ghost's dynamic content loading
    this.setupGhostContentObserver();
  }

  /**
   * Process existing images
   */
  processExistingImages() {
    const images = document.querySelectorAll('.kg-image-card img, .kg-gallery-card img, .post-full-image img');
    images.forEach(img => this.shouldAddBadge(img) && this.addBadgeToImage(img));
  }

  /**
   * Setup Ghost content observer
   */
  setupGhostContentObserver() {
    // Ghost uses content API for dynamic loading
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        setTimeout(() => {
          this.processExistingImages();
          this.injectManifestLinks();
        }, 500);
      }
    }).observe(document, { subtree: true, childList: true });
  }

  /**
   * Verify manifest asynchronously
   */
  async verifyManifestAsync(manifestUrl, badge) {
    try {
      const response = await fetch(`${this.config.manifestHost}/verify?url=${encodeURIComponent(manifestUrl)}`);
      const data = await response.json();
      
      if (data.verified) {
        badge.style.background = 'rgba(16, 185, 129, 0.9)';
        badge.innerHTML = '✓ <span>Verified</span>';
        badge.setAttribute('data-verified', 'true');
      } else {
        badge.style.background = 'rgba(239, 68, 68, 0.9)';
        badge.innerHTML = '? <span>Unverified</span>';
      }
    } catch (error) {
      console.warn('C2 Concierge: Manifest verification failed', error);
      badge.style.background = 'rgba(245, 158, 11, 0.9)';
      badge.innerHTML = '? <span>Unknown</span>';
    }
  }

  /**
   * Show verification modal
   */
  showVerificationModal(manifestUrl, image) {
    this.createVerificationModal();
    this.loadVerificationData(manifestUrl, image);
  }

  /**
   * Create verification modal
   */
  createVerificationModal() {
    if (document.getElementById('c2c-ghost-verification-modal')) return;
    
    const modal = document.createElement('div');
    modal.id = 'c2c-ghost-verification-modal';
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
      backdrop-filter: blur(4px);
    `;

    modal.innerHTML = `
      <div style="background: white; padding: 32px; border-radius: 12px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
          <h3 style="margin: 0; font-size: 24px; font-weight: 600;">Content Authenticity</h3>
          <button onclick="this.closest('#c2c-ghost-verification-modal').style.display='none'; document.body.style.overflow='auto'" style="background: none; border: none; font-size: 24px; cursor: pointer; color: #666;">×</button>
        </div>
        <div id="c2c-ghost-verification-content">
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
    `;

    document.body.appendChild(modal);
  }

  /**
   * Load verification data
   */
  async loadVerificationData(manifestUrl, image) {
    const content = document.getElementById('c2c-ghost-verification-content');
    if (!content) return;
    
    try {
      const response = await fetch(`${this.config.manifestHost}/verify?url=${encodeURIComponent(manifestUrl)}`);
      const data = await response.json();
      
      this.displayVerificationData(data, image);
      this.sendTelemetry('verification_view', { manifestUrl, success: true });
    } catch (error) {
      this.displayVerificationError(error, image);
      this.sendTelemetry('verification_view', { manifestUrl, success: false, error: error.message });
    }
  }

  /**
   * Display verification data
   */
  displayVerificationData(data, image) {
    const content = document.getElementById('c2c-ghost-verification-content');
    if (!content) return;
    
    const status = data.verified ? '✅ Verified Authentic' : '❌ Cannot Verify';
    const statusColor = data.verified ? '#16a34a' : '#dc2626';
    const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown';
    const issuer = data.issuer || 'Content Creator';
    
    content.innerHTML = `
      <div style="margin-bottom: 20px;">
        <div style="display: flex; align-items: center; margin-bottom: 16px;">
          <div style="width: 48px; height: 48px; border-radius: 50%; background: ${data.verified ? '#dcfce7' : '#fee2e2'}; display: flex; align-items: center; justify-content: center; margin-right: 16px;">
            <span style="font-size: 24px;">${data.verified ? '✓' : '?'}</span>
          </div>
          <div>
            <div style="font-size: 18px; font-weight: 600; color: ${statusColor};">${status}</div>
            <div style="color: #666; font-size: 14px;">Ghost Content Authenticity</div>
          </div>
        </div>
      </div>
      
      <div style="margin-bottom: 20px;">
        <div style="background: #f9fafb; padding: 16px; border-radius: 8px;">
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Author:</strong> 
            <span style="color: #6b7280;">${this.getPostAuthor()}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Published:</strong> 
            <span style="color: #6b7280;">${this.getPostDate()}</span>
          </div>
          <div style="margin-bottom: 12px;">
            <strong style="color: #374151;">Verified:</strong> 
            <span style="color: #6b7280;">${timestamp}</span>
          </div>
          ${data.manifest_url ? `
            <div>
              <strong style="color: #374151;">Technical Details:</strong> 
              <a href="${data.manifest_url}" target="_blank" style="color: #3b82f6; text-decoration: none;">View C2PA Manifest →</a>
            </div>
          ` : ''}
        </div>
      </div>
      
      ${image ? `
        <div style="margin-bottom: 20px;">
          <strong style="color: #374151; display: block; margin-bottom: 8px;">Content Preview:</strong>
          <img src="${image.src}" style="max-width: 100%; height: auto; border-radius: 8px; border: 1px solid #e5e7eb;">
        </div>
      ` : ''}
      
      <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid #e5e7eb; text-align: center; font-size: 12px; color: #6b7280;">
        <p style="margin: 0 0 8px;">This Ghost content includes provenance information secured by C2PA technology.</p>
        <p>Powered by <a href="https://c2concierge.org" target="_blank" style="color: #3b82f6; text-decoration: none;">C2 Concierge</a></p>
      </div>
    `;
  }

  /**
   * Display verification error
   */
  displayVerificationError(error, image) {
    const content = document.getElementById('c2c-ghost-verification-content');
    if (!content) return;
    
    content.innerHTML = `
      <div style="text-align: center; padding: 40px;">
        <div style="color: #dc2626; margin-bottom: 16px;">
          <span style="font-size: 48px;">⚠️</span>
        </div>
        <h4 style="color: #dc2626; margin: 0 0 12px;">Verification Unavailable</h4>
        <p style="color: #6b7280; margin: 0;">Unable to verify content authenticity at this time.</p>
        <p style="color: #9ca3af; font-size: 12px; margin: 8px 0 0;">Error: ${error.message}</p>
      </div>
    `;
  }

  /**
   * Get post author
   */
  getPostAuthor() {
    const authorElement = document.querySelector('.post-byline-content .author-name, .post-meta .author');
    return authorElement ? authorElement.textContent.trim() : 'Unknown Author';
  }

  /**
   * Get post date
   */
  getPostDate() {
    const dateElement = document.querySelector('.post-byline-content .date, .post-meta .date');
    return dateElement ? dateElement.textContent.trim() : 'Unknown Date';
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
          platform: 'ghost',
          version: this.version,
          timestamp: new Date().toISOString(),
          siteUrl: this.config.siteUrl,
          ...data
        })
      });
    } catch (error) {
      console.warn('C2C Ghost: Telemetry failed', error);
    }
  }

  /**
   * Get theme partial code
   */
  getThemePartialCode() {
    return `
{{!-- C2 Concierge Ghost Theme Partial --}}
{{!-- Add to default.hbs or post.hbs --}}

{{#if @custom.c2c_enable_integration}}
<!-- C2 Concierge C2PA Integration -->
<script>
  window.C2C_GHOST_CONFIG = {
    platform: 'ghost',
    version: '1.0.0',
    manifestHost: '{{@custom.c2c_manifest_host}}',
    webhookUrl: '{{@custom.c2c_webhook_url}}',
    siteUrl: '{{@site.url}}',
    enableTelemetry: {{#if @custom.c2c_enable_telemetry}}true{{else}}false{{/if}}
  };
</script>

<link rel="stylesheet" href="https://cdn.c2concierge.org/ghost-connector.css">
<script src="https://cdn.c2concierge.org/ghost-connector.js" async integrity="sha384-DEFAULT_INTEGRITY_HASH" crossorigin="anonymous"></script>

{{#if is_post}}
{{#post}}
{{#if feature_image}}
<link rel="c2pa-manifest" href="{{@custom.c2c_manifest_host}}/ghost/{{feature_image_hash}}.c2pa">
{{/if}}
{{/post}}
{{/if}}
{{/if}}
    `.trim();
  }

  /**
   * Get code injection code
   */
  getCodeInjectionCode() {
    return `
<!-- C2 Concierge Ghost Code Injection -->
<script>
  window.C2C_GHOST_CONFIG = {
    platform: 'ghost',
    version: '1.0.0',
    manifestHost: 'https://manifests.c2concierge.org',
    siteUrl: window.location.origin,
    enableTelemetry: true
  };
</script>
<script src="https://cdn.c2concierge.org/ghost-connector.js" async integrity="sha384-DEFAULT_INTEGRITY_HASH" crossorigin="anonymous"></script>
    `.trim();
  }
}

// Auto-initialize if script is loaded directly
if (typeof window !== 'undefined') {
  window.GhostConnector = GhostConnector;
  
  // Auto-initialize with global config if available
  if (window.C2C_GHOST_CONFIG) {
    new GhostConnector(window.C2C_GHOST_CONFIG);
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = GhostConnector;
}
