/**
 * C2 Concierge Universal Badge System
 * Cross-platform verification badge and discovery behavior
 * 
 * Features:
 * - Universal badge rendering
 * - C2PA manifest discovery
 * - Verification modal
 * - Platform detection
 * - Responsive design
 * - Accessibility support
 */

class C2CBadge {
  constructor(config = {}) {
    this.config = {
      manifestHost: config.manifestHost || 'https://manifests.c2concierge.org',
      verifyUrl: config.verifyUrl || 'https://verify.c2concierge.org/verify',
      analyticsUrl: config.analyticsUrl || 'https://analytics.c2concierge.org/telemetry',
      badgePosition: config.badgePosition || 'bottom-right',
      badgeStyle: config.badgeStyle || 'default',
      enableTelemetry: config.enableTelemetry !== false,
      autoDiscover: config.autoDiscover !== false,
      platform: config.platform || this.detectPlatform(),
      timeout: config.timeout || 10000,
      retryAttempts: config.retryAttempts || 2,
      maxBadgeSize: config.maxBadgeSize || 200,
      ...config
    };

    this.version = '1.0.0';
    this.modal = null;
    this.activeRequests = new Map();
    this.badgeInstances = new Set();
    this.validateConfig();
    this.init();
  }

  /**
   * CRITICAL: Validate configuration on initialization
   */
  validateConfig() {
    const requiredUrls = ['manifestHost', 'verifyUrl', 'analyticsUrl'];
    
    for (const urlKey of requiredUrls) {
      if (!this.config[urlKey] || !this.isValidUrl(this.config[urlKey])) {
        throw new Error(`Invalid ${urlKey}: must be valid HTTPS URL`);
      }
    }
    
    if (typeof this.config.timeout !== 'number' || this.config.timeout <= 0) {
      throw new Error('Invalid timeout: must be positive number');
    }
    
    const validPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    if (!validPositions.includes(this.config.badgePosition)) {
      throw new Error('Invalid badgePosition: must be one of ' + validPositions.join(', '));
    }
    
    const validStyles = ['default', 'minimal', 'prominent'];
    if (!validStyles.includes(this.config.badgeStyle)) {
      throw new Error('Invalid badgeStyle: must be one of ' + validStyles.join(', '));
    }
  }

  /**
   * CRITICAL: Enhanced URL validation
   */
  isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname.length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Initialize badge system with error handling
   */
  init() {
    try {
      this.injectStyles();
      this.setupDiscovery();
      this.setupModal();
      this.sendTelemetry('badge_init', { platform: this.config.platform });
    } catch (error) {
      console.error('C2C Badge: Initialization failed', error);
    }
  }

  /**
   * CRITICAL: Enhanced platform detection with validation
   */
  detectPlatform() {
    try {
      if (window.Drupal && typeof window.Drupal === 'object') return 'drupal';
      if (window.Webflow && typeof window.Webflow === 'object') return 'webflow';
      if (window.Squarespace && typeof window.Squarespace === 'object') return 'squarespace';
      if (window.Ghost && typeof window.Ghost === 'object') return 'ghost';
      
      const nextjsEl = document.querySelector('[data-nextjs]');
      if (nextjsEl && nextjsEl.hasAttribute('data-nextjs')) return 'nextjs';
      
      const nuxtEl = document.querySelector('[data-nuxt]');
      if (nuxtEl && nuxtEl.hasAttribute('data-nuxt')) return 'nuxt';
      
      const astroEl = document.querySelector('[data-astro]');
      if (astroEl && astroEl.hasAttribute('data-astro')) return 'astro';
      
      const hostname = window.location?.hostname;
      if (hostname) {
        if (hostname.includes('webflow.io')) return 'webflow';
        if (hostname.includes('squarespace.com')) return 'squarespace';
      }
      
      return 'unknown';
    } catch (error) {
      console.warn('C2C Badge: Platform detection failed', error);
      return 'unknown';
    }
  }

  /**
   * Inject badge styles
   */
  injectStyles() {
    if (document.getElementById('c2c-badge-styles')) return;

    const style = document.createElement('style');
    style.id = 'c2c-badge-styles';
    style.textContent = this.getBadgeStyles();
    document.head.appendChild(style);
  }

  /**
   * Get badge styles
   */
  getBadgeStyles() {
    const baseStyles = `
/* C2 Concierge Universal Badge Styles */
.c2c-badge-container {
  position: relative;
  display: inline-block;
  max-width: 100%;
}

.c2c-verification-badge {
  position: absolute;
  ${this.getBadgePositionStyles()}
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
  user-select: none;
  -webkit-user-select: none;
  line-height: 1.4;
}

.c2c-verification-badge:hover {
  background: rgba(0, 0, 0, 0.95);
  transform: translateY(-1px);
  box-shadow: 0 6px 8px rgba(0, 0, 0, 0.15);
}

.c2c-verification-badge.verified {
  background: rgba(16, 185, 129, 0.9);
  border-color: rgba(16, 185, 129, 0.3);
}

.c2c-verification-badge.unverified {
  background: rgba(239, 68, 68, 0.9);
  border-color: rgba(239, 68, 68, 0.3);
}

.c2c-verification-badge.unknown {
  background: rgba(245, 158, 11, 0.9);
  border-color: rgba(245, 158, 11, 0.3);
}

/* Badge style variants */
.c2c-verification-badge.minimal {
  background: rgba(0, 0, 0, 0.7);
  padding: 4px 8px;
  font-size: 11px;
  border-radius: 4px;
}

.c2c-verification-badge.prominent {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.9), rgba(5, 150, 105, 0.9));
  padding: 10px 16px;
  font-size: 14px;
  border-radius: 12px;
  font-weight: 600;
}

/* Platform-specific adjustments */
.c2c-verification-badge.webflow {
  bottom: 12px;
  right: 12px;
}

.c2c-verification-badge.squarespace {
  bottom: 12px;
  right: 12px;
}

.c2c-verification-badge.ghost {
  bottom: 16px;
  right: 16px;
}

.c2c-verification-badge.drupal {
  bottom: 8px;
  right: 8px;
}

/* Mobile responsive */
@media (max-width: 768px) {
  .c2c-verification-badge {
    font-size: 11px;
    padding: 6px 10px;
    bottom: 8px;
    right: 8px;
  }
  
  .c2c-verification-badge.minimal {
    font-size: 10px;
    padding: 3px 6px;
  }
  
  .c2c-verification-badge.prominent {
    font-size: 12px;
    padding: 8px 12px;
  }
}

/* High contrast mode support */
@media (prefers-contrast: high) {
  .c2c-verification-badge {
    background: black;
    border: 2px solid white;
  }
  
  .c2c-verification-badge.verified {
    background: #16a34a;
    border-color: white;
  }
}

/* Reduced motion support */
@media (prefers-reduced-motion: reduce) {
  .c2c-verification-badge {
    transition: none;
  }
  
  .c2c-verification-badge:hover {
    transform: none;
  }
}

/* Focus styles for accessibility */
.c2c-verification-badge:focus {
  outline: 2px solid #3b82f6;
  outline-offset: 2px;
}

/* Loading animation */
.c2c-badge-loading {
  display: inline-block;
  width: 12px;
  height: 12px;
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid white;
  border-radius: 50%;
  animation: c2c-spin 1s linear infinite;
  margin-right: 6px;
}

@keyframes c2c-spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}
    `;

    return baseStyles;
  }

  /**
   * Get badge position styles
   */
  getBadgePositionStyles() {
    const positions = {
      'top-left': 'top: 12px; left: 12px;',
      'top-right': 'top: 12px; right: 12px;',
      'bottom-left': 'bottom: 12px; left: 12px;',
      'bottom-right': 'bottom: 12px; right: 12px;'
    };
    
    return positions[this.config.badgePosition] || positions['bottom-right'];
  }

  /**
   * Setup manifest discovery
   */
  setupDiscovery() {
    if (!this.config.autoDiscover) return;

    // Discover existing manifests
    this.discoverManifests();
    
    // Setup observer for dynamic content
    this.setupObserver();
    
    // Setup platform-specific discovery
    this.setupPlatformDiscovery();
  }

  /**
   * Discover existing C2PA manifests
   */
  discoverManifests() {
    // Check HTTP Link headers (if accessible via service worker)
    this.checkLinkHeaders();
    
    // Check HTML link tags
    this.checkHtmlLinks();
    
    // Check image data attributes
    this.checkImageDataAttributes();
    
    // Check sidecar files
    this.checkSidecarFiles();
  }

  /**
   * Check HTML link tags for manifests
   */
  checkHtmlLinks() {
    const manifestLinks = document.querySelectorAll('link[rel="c2pa-manifest"]');
    
    manifestLinks.forEach(link => {
      const manifestUrl = link.href;
      if (manifestUrl) {
        // Find associated images
        this.addBadgeToPageImages(manifestUrl);
      }
    });
  }

  /**
   * Check image data attributes
   */
  checkImageDataAttributes() {
    const images = document.querySelectorAll('img[data-c2pa-manifest], img[data-c2pa-signed]');
    
    images.forEach(img => {
      const manifestUrl = img.getAttribute('data-c2pa-manifest');
      if (manifestUrl) {
        this.addBadgeToImage(img, manifestUrl);
      } else if (img.hasAttribute('data-c2pa-signed')) {
        // Generate manifest URL for signed images
        const generatedUrl = this.generateManifestUrl(img.src);
        this.addBadgeToImage(img, generatedUrl);
      }
    });
  }

  /**
   * Check for sidecar .c2pa files
   */
  checkSidecarFiles() {
    const images = document.querySelectorAll('img[src]');
    
    images.forEach(img => {
      const src = img.src;
      const sidecarUrl = src.replace(/\.[^.]+$/, '.c2pa');
      
      // Check if sidecar file exists
      this.checkSidecarExists(sidecarUrl).then(exists => {
        if (exists) {
          this.addBadgeToImage(img, sidecarUrl);
        }
      });
    });
  }

  /**
   * Check if sidecar file exists
   */
  async checkSidecarExists(url) {
    try {
      const response = await fetch(url, { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check HTTP Link headers (via service worker if available)
   */
  checkLinkHeaders() {
    // This requires a service worker to intercept and expose headers
    // Implementation depends on platform capabilities
    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({
        type: 'GET_LINK_HEADERS',
        url: window.location.href
      });
    }
  }

  /**
   * Add badge to page images based on manifest
   */
  addBadgeToPageImages(manifestUrl) {
    // Find images that might belong to this manifest
    const images = document.querySelectorAll('img[src]');
    
    images.forEach(img => {
      if (this.shouldAddBadgeToImage(img)) {
        this.addBadgeToImage(img, manifestUrl);
      }
    });
  }

  /**
   * Check if image should have badge
   */
  shouldAddBadgeToImage(img) {
    // Skip if already processed
    if (img.hasAttribute('data-c2c-badge')) return false;
    
    // Skip tiny images
    if (img.naturalWidth < 100 || img.naturalHeight < 100) return false;
    
    // Skip decorative images
    if (img.alt === '' && img.title === '') return false;
    
    // Check for content images
    return this.isContentImage(img);
  }

  /**
   * Check if image is content (vs decorative)
   */
  isContentImage(img) {
    // Check for common content image patterns
    const contentSelectors = [
      'article img',
      '.content img',
      '.post img',
      '.entry img',
      '.article img',
      '.blog img',
      '.product img',
      '.gallery img'
    ];
    
    return contentSelectors.some(selector => {
      try {
        return img.matches(selector) || img.closest(selector);
      } catch {
        return false;
      }
    });
  }

  /**
   * Add badge to image
   */
  addBadgeToImage(img, manifestUrl) {
    if (img.hasAttribute('data-c2c-badge')) return;

    // Create badge container
    const badgeContainer = document.createElement('div');
    badgeContainer.className = 'c2c-badge-container';
    
    // Wrap image
    img.parentNode.insertBefore(badgeContainer, img);
    badgeContainer.appendChild(img);

    // Create badge
    const badge = this.createBadge(manifestUrl, img);
    badgeContainer.appendChild(badge);
    
    img.setAttribute('data-c2c-badge', 'true');
    
    // Verify manifest asynchronously
    this.verifyManifestAsync(manifestUrl, badge);
  }

  /**
   * Create badge element
   */
  createBadge(manifestUrl, img) {
    const badge = document.createElement('div');
    badge.className = `c2c-verification-badge ${this.config.badgeStyle} ${this.config.platform}`;
    badge.setAttribute('data-manifest', manifestUrl);
    badge.setAttribute('data-image-src', img.src);
    badge.setAttribute('role', 'button');
    badge.setAttribute('tabindex', '0');
    badge.setAttribute('aria-label', 'View content authenticity information');
    
    // CRITICAL: Use safe DOM manipulation instead of innerHTML
    const loadingSpan = document.createElement('span');
    loadingSpan.className = 'c2c-badge-loading';
    loadingSpan.textContent = 'Checking...';
    badge.appendChild(loadingSpan);
    
    // Add click handler
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.showVerificationModal(manifestUrl, img);
    });
    
    // Add keyboard support
    badge.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.showVerificationModal(manifestUrl, img);
      }
    });
    
    return badge;
  }

  /**
   * Verify manifest asynchronously
   */
  async verifyManifestAsync(manifestUrl, badge) {
    try {
      const response = await fetch(`${this.config.verifyUrl}?url=${encodeURIComponent(manifestUrl)}`);
      const data = await response.json();
      
      if (data.verified) {
        badge.className = badge.className.replace(/unknown|unverified/g, '') + ' verified';
        // CRITICAL: Use safe DOM manipulation instead of innerHTML
        badge.textContent = '';
        const checkmark = document.createTextNode('✓ ');
        badge.appendChild(checkmark);
        const span = document.createElement('span');
        span.textContent = 'Verified';
        badge.appendChild(span);
        badge.setAttribute('data-verified', 'true');
      } else {
        badge.className = badge.className.replace(/unknown|verified/g, '') + ' unverified';
        // CRITICAL: Use safe DOM manipulation instead of innerHTML
        badge.textContent = '';
        const question = document.createTextNode('? ');
        badge.appendChild(question);
        const span = document.createElement('span');
        span.textContent = 'Unverified';
        badge.appendChild(span);
      }
    } catch (error) {
      console.warn('C2C Badge: Manifest verification failed', error);
      badge.className = badge.className.replace(/verified|unverified/g, '') + ' unknown';
      // CRITICAL: Use safe DOM manipulation instead of innerHTML
      badge.textContent = '';
      const question = document.createTextNode('? ');
      badge.appendChild(question);
      const span = document.createElement('span');
      span.textContent = 'Unknown';
      badge.appendChild(span);
    }
  }

  /**
   * Setup observer for dynamic content
   */
  setupObserver() {
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
   * Process node for badges
   */
  processNodeForBadges(node) {
    if (node.tagName === 'IMG' && this.shouldAddBadgeToImage(node)) {
      const manifestUrl = node.getAttribute('data-c2pa-manifest') || this.generateManifestUrl(node.src);
      this.addBadgeToImage(node, manifestUrl);
    } else if (node.querySelectorAll) {
      const images = node.querySelectorAll('img[data-c2pa-manifest], img[data-c2pa-signed]');
      images.forEach(img => {
        if (this.shouldAddBadgeToImage(img)) {
          const manifestUrl = img.getAttribute('data-c2pa-manifest') || this.generateManifestUrl(img.src);
          this.addBadgeToImage(img, manifestUrl);
        }
      });
    }
  }

  /**
   * Setup platform-specific discovery
   */
  setupPlatformDiscovery() {
    switch (this.config.platform) {
      case 'webflow':
        this.setupWebflowDiscovery();
        break;
      case 'squarespace':
        this.setupSquarespaceDiscovery();
        break;
      case 'ghost':
        this.setupGhostDiscovery();
        break;
      case 'drupal':
        this.setupDrupalDiscovery();
        break;
    }
  }

  /**
   * Setup Webflow-specific discovery
   */
  setupWebflowDiscovery() {
    // Webflow-specific image selectors
    const webflowImages = document.querySelectorAll('.w-richtext-figure img, .w-condition-invisible img');
    webflowImages.forEach(img => {
      if (this.shouldAddBadgeToImage(img)) {
        const manifestUrl = this.generateManifestUrl(img.src);
        this.addBadgeToImage(img, manifestUrl);
      }
    });
  }

  /**
   * Setup Squarespace-specific discovery
   */
  setupSquarespaceDiscovery() {
    // Squarespace-specific image selectors
    const squarespaceImages = document.querySelectorAll('.sqs-block-image img, .ProductItem-gallery-slide img');
    squarespaceImages.forEach(img => {
      if (this.shouldAddBadgeToImage(img)) {
        const manifestUrl = this.generateManifestUrl(img.src);
        this.addBadgeToImage(img, manifestUrl);
      }
    });
  }

  /**
   * Setup Ghost-specific discovery
   */
  setupGhostDiscovery() {
    // Ghost-specific image selectors
    const ghostImages = document.querySelectorAll('.kg-image-card img, .kg-gallery-card img, .post-full-image img');
    ghostImages.forEach(img => {
      if (this.shouldAddBadgeToImage(img)) {
        const manifestUrl = this.generateManifestUrl(img.src);
        this.addBadgeToImage(img, manifestUrl);
      }
    });
  }

  /**
   * Setup Drupal-specific discovery
   */
  setupDrupalDiscovery() {
    // Drupal-specific image selectors
    const drupalImages = document.querySelectorAll('.field__item img, .media-image img');
    drupalImages.forEach(img => {
      if (this.shouldAddBadgeToImage(img)) {
        const manifestUrl = this.generateManifestUrl(img.src);
        this.addBadgeToImage(img, manifestUrl);
      }
    });
  }

  /**
   * Generate manifest URL for image
   */
  generateManifestUrl(imageUrl) {
    const imageHash = this.generateImageHash(imageUrl);
    return `${this.config.manifestHost}/${this.config.platform}/${imageHash}.c2pa`;
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
   * Setup verification modal
   */
  setupModal() {
    // Modal will be created on demand
    this.setupModalEventListeners();
  }

  /**
   * Setup modal event listeners
   */
  setupModalEventListeners() {
    // Listen for escape key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.modal) {
        this.hideModal();
      }
    });

    // Listen for background clicks
    document.addEventListener('click', (e) => {
      if (this.modal && e.target === this.modal) {
        this.hideModal();
      }
    });
  }

  /**
   * Show verification modal
   */
  showVerificationModal(manifestUrl, image) {
    if (!this.modal) {
      this.createModal();
    }
    
    this.loadVerificationData(manifestUrl, image);
    this.showModal();
  }

  /**
   * Create verification modal
   */
  createModal() {
    this.modal = document.createElement('div');
    this.modal.id = 'c2c-verification-modal';
    this.modal.className = 'c2c-modal';
    this.modal.setAttribute('role', 'dialog');
    this.modal.setAttribute('aria-modal', 'true');
    this.modal.setAttribute('aria-labelledby', 'c2c-modal-title');
    
    this.modal.innerHTML = `
      <div class="c2c-modal-content">
        <div class="c2c-modal-header">
          <h2 id="c2c-modal-title">Content Authenticity</h2>
          <button class="c2c-modal-close" aria-label="Close modal" tabindex="0">×</button>
        </div>
        <div class="c2c-modal-body">
          <div class="c2c-loading">
            <div class="c2c-spinner"></div>
            <p>Loading verification information...</p>
          </div>
        </div>
      </div>
    `;
    
    // Add modal styles
    const modalStyles = `
      .c2c-modal {
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
      }
      
      .c2c-modal-content {
        background: white;
        padding: 32px;
        border-radius: 12px;
        max-width: 600px;
        width: 90%;
        max-height: 80vh;
        overflow-y: auto;
        box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1);
      }
      
      .c2c-modal-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 24px;
      }
      
      .c2c-modal-header h2 {
        margin: 0;
        font-size: 24px;
        font-weight: 600;
      }
      
      .c2c-modal-close {
        background: none;
        border: none;
        font-size: 24px;
        cursor: pointer;
        color: #666;
        padding: 4px;
        border-radius: 4px;
      }
      
      .c2c-modal-close:hover {
        background: #f3f4f6;
      }
      
      .c2c-loading {
        text-align: center;
        padding: 40px;
      }
      
      .c2c-spinner {
        width: 40px;
        height: 40px;
        border: 3px solid #f3f4f6;
        border-top: 3px solid #3b82f6;
        border-radius: 50%;
        animation: c2c-spin 1s linear infinite;
        margin: 0 auto 16px;
      }
    `;
    
    const styleElement = document.createElement('style');
    styleElement.textContent = modalStyles;
    document.head.appendChild(styleElement);
    
    document.body.appendChild(this.modal);
    
    // Setup close button
    const closeButton = this.modal.querySelector('.c2c-modal-close');
    closeButton.addEventListener('click', () => this.hideModal());
    closeButton.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.hideModal();
      }
    });
  }

  /**
   * Load verification data into modal
   */
  async loadVerificationData(manifestUrl, image) {
    const body = this.modal.querySelector('.c2c-modal-body');
    if (!body) return;
    
    try {
      const response = await fetch(`${this.config.verifyUrl}?url=${encodeURIComponent(manifestUrl)}`);
      const data = await response.json();
      
      this.displayVerificationData(data, image);
      this.sendTelemetry('verification_view', { manifestUrl, success: true });
    } catch (error) {
      this.displayVerificationError(error, image);
      this.sendTelemetry('verification_view', { manifestUrl, success: false, error: error.message });
    }
  }

  /**
   * Display verification data in modal
   */
  displayVerificationData(data, image) {
    const body = this.modal.querySelector('.c2c-modal-body');
    if (!body) return;
    
    // CRITICAL: Sanitize all dynamic data to prevent XSS
    const status = data.verified ? '✅ Verified Authentic' : '❌ Cannot Verify';
    const statusColor = data.verified ? '#16a34a' : '#dc2626';
    const timestamp = data.timestamp ? new Date(data.timestamp).toLocaleString() : 'Unknown';
    const issuer = this.escapeHtml(data.issuer || 'Content Creator');
    const manifestUrl = this.escapeHtml(data.manifest_url || '');
    
    // CRITICAL: Build DOM safely instead of using innerHTML
    body.textContent = '';
    
    const resultDiv = document.createElement('div');
    resultDiv.className = 'c2c-verification-result';
    
    // Status indicator
    const statusDiv = document.createElement('div');
    statusDiv.className = `c2c-status-indicator ${data.verified ? 'verified' : 'unverified'}`;
    
    const statusIcon = document.createElement('div');
    statusIcon.className = 'c2c-status-icon';
    statusIcon.textContent = data.verified ? '✓' : '?';
    
    const statusText = document.createElement('div');
    statusText.className = 'c2c-status-text';
    
    const statusTitle = document.createElement('div');
    statusTitle.className = 'c2c-status-title';
    statusTitle.style.color = statusColor;
    statusTitle.textContent = status;
    
    const statusSubtitle = document.createElement('div');
    statusSubtitle.className = 'c2c-status-subtitle';
    statusSubtitle.textContent = 'Content Authenticity Initiative';
    
    statusText.appendChild(statusTitle);
    statusText.appendChild(statusSubtitle);
    statusDiv.appendChild(statusIcon);
    statusDiv.appendChild(statusText);
    
    // Details section
    const detailsDiv = document.createElement('div');
    detailsDiv.className = 'c2c-verification-details';
    
    // Creator detail
    const creatorItem = this.createDetailItem('Creator:', issuer);
    detailsDiv.appendChild(creatorItem);
    
    // Verified detail
    const verifiedItem = this.createDetailItem('Verified:', timestamp);
    detailsDiv.appendChild(verifiedItem);
    
    // Manifest URL detail
    if (manifestUrl && this.isValidUrl(manifestUrl)) {
      const manifestItem = document.createElement('div');
      manifestItem.className = 'c2c-detail-item';
      
      const strong = document.createElement('strong');
      strong.textContent = 'Technical Details: ';
      
      const span = document.createElement('span');
      const link = document.createElement('a');
      link.href = manifestUrl;
      link.target = '_blank';
      link.style.color = '#3b82f6';
      link.style.textDecoration = 'none';
      link.textContent = 'View C2PA Manifest →';
      link.rel = 'noopener noreferrer'; // Security: prevent tabnabbing
      
      span.appendChild(link);
      manifestItem.appendChild(strong);
      manifestItem.appendChild(span);
      detailsDiv.appendChild(manifestItem);
    }
    
    resultDiv.appendChild(statusDiv);
    resultDiv.appendChild(detailsDiv);
    
    if (image) {
      const contentPreview = document.createElement('div');
      contentPreview.className = 'c2c-content-preview';
      
      const strong = document.createElement('strong');
      strong.textContent = 'Content Preview:';
      
      const img = document.createElement('img');
      img.src = image.src;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.borderRadius = '8px';
      img.style.border = '1px solid #e5e7eb';
      img.style.marginTop = '8px';
      
      contentPreview.appendChild(strong);
      contentPreview.appendChild(img);
      resultDiv.appendChild(contentPreview);
    }
    
    const footer = document.createElement('div');
    footer.className = 'c2c-footer';
    
    const p1 = document.createElement('p');
    p1.textContent = 'This content includes provenance information secured by C2PA technology.';
    
    const p2 = document.createElement('p');
    p2.textContent = 'Powered by ';
    const a = document.createElement('a');
    a.href = 'https://c2concierge.org';
    a.target = '_blank';
    a.style.color = '#3b82f6';
    a.style.textDecoration = 'none';
    a.textContent = 'C2 Concierge';
    p2.appendChild(a);
    
    footer.appendChild(p1);
    footer.appendChild(p2);
    resultDiv.appendChild(footer);
    
    body.appendChild(resultDiv);
  }

  /**
   * CRITICAL: Escape HTML to prevent XSS
   */
  escapeHtml(text) {
    if (!text || typeof text !== 'string') return '';
    
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * CRITICAL: Validate URL to prevent XSS
   */
  isValidUrl(url) {
    if (!url || typeof url !== 'string') return false;
    
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname.includes('c2concierge');
    } catch {
      return false;
    }
  }

  /**
   * Helper to create detail items safely
   */
  createDetailItem(label, value) {
    const item = document.createElement('div');
    item.className = 'c2c-detail-item';
    
    const strong = document.createElement('strong');
    strong.textContent = label;
    
    const span = document.createElement('span');
    span.textContent = ' ';
    span.appendChild(document.createTextNode(value));
    
    item.appendChild(strong);
    item.appendChild(span);
    
    return item;
  }

  /**
   * Add result styles to document
   */
  addResultStyles() {
    const resultStyles = `
      .c2c-verification-result {
        color: #374151;
      }
      
      .c2c-status-indicator {
        display: flex;
        align-items: center;
        margin-bottom: 20px;
        padding: 16px;
        border-radius: 8px;
        background: ${data && data.verified ? '#dcfce7' : '#fee2e2'};
      }
      
      .c2c-status-icon {
        width: 48px;
        height: 48px;
        border-radius: 50%;
        background: ${data && data.verified ? '#16a34a' : '#dc2626'};
        color: white;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 24px;
        margin-right: 16px;
      }
      
      .c2c-status-title {
        font-size: 18px;
        font-weight: 600;
        margin-bottom: 4px;
      }
      
      .c2c-status-subtitle {
        font-size: 14px;
        color: #6b7280;
      }
      
      .c2c-verification-details {
        background: #f9fafb;
        padding: 16px;
        border-radius: 8px;
        margin-bottom: 20px;
      }
      
      .c2c-detail-item {
        margin-bottom: 12px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .c2c-detail-item:last-child {
        margin-bottom: 0;
      }
      
      .c2c-detail-item strong {
        color: #374151;
      }
      
      .c2c-detail-item span {
        color: #6b7280;
      }
      
      .c2c-content-preview {
        margin-bottom: 20px;
      }
      
      .c2c-content-preview strong {
        display: block;
        margin-bottom: 8px;
        color: #374151;
      }
      
      .c2c-footer {
        margin-top: 24px;
        padding-top: 20px;
        border-top: 1px solid #e5e7eb;
        text-align: center;
        font-size: 12px;
        color: #6b7280;
      }
      
      .c2c-footer p {
        margin: 0 0 8px;
      }
    `;
    
    // Add styles if not already present
    if (!document.getElementById('c2c-result-styles')) {
      const resultStyleElement = document.createElement('style');
      resultStyleElement.id = 'c2c-result-styles';
      resultStyleElement.textContent = resultStyles;
      document.head.appendChild(resultStyleElement);
    }
  }

  /**
   * CRITICAL: Display verification error with XSS protection
   */
  displayVerificationError(error, image) {
    const body = this.modal.querySelector('.c2c-modal-body');
    if (!body) return;
    
    // CRITICAL: Sanitize error message to prevent XSS
    const sanitizedError = this.escapeHtml(error.message || 'Unknown error occurred');
    
    // CRITICAL: Build DOM safely instead of using innerHTML
    body.textContent = '';
    
    const errorDiv = document.createElement('div');
    errorDiv.className = 'c2c-verification-error';
    
    const centerDiv = document.createElement('div');
    centerDiv.style.textAlign = 'center';
    centerDiv.style.padding = '40px';
    
    const iconDiv = document.createElement('div');
    iconDiv.style.color = '#dc2626';
    iconDiv.style.marginBottom = '16px';
    iconDiv.textContent = '⚠️';
    iconDiv.style.fontSize = '48px';
    
    const title = document.createElement('h3');
    title.style.color = '#dc2626';
    title.style.margin = '0 0 12px';
    title.textContent = 'Verification Unavailable';
    
    const message1 = document.createElement('p');
    message1.style.color = '#6b7280';
    message1.style.margin = '0';
    message1.textContent = 'Unable to verify content authenticity at this time.';
    
    const message2 = document.createElement('p');
    message2.style.color = '#9ca3af';
    message2.style.fontSize = '12px';
    message2.style.margin = '8px 0 0';
    message2.textContent = `Error: ${sanitizedError}`;
    
    centerDiv.appendChild(iconDiv);
    centerDiv.appendChild(title);
    centerDiv.appendChild(message1);
    centerDiv.appendChild(message2);
    
    errorDiv.appendChild(centerDiv);
    body.appendChild(errorDiv);
  }

  /**
   * Show modal
   */
  showModal() {
    if (this.modal) {
      this.modal.style.display = 'flex';
      document.body.style.overflow = 'hidden';
      
      // Focus management
      const closeButton = this.modal.querySelector('.c2c-modal-close');
      if (closeButton) {
        closeButton.focus();
      }
    }
  }

  /**
   * Hide modal
   */
  hideModal() {
    if (this.modal) {
      this.modal.style.display = 'none';
      document.body.style.overflow = 'auto';
    }
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
          platform: this.config.platform,
          version: this.version,
          timestamp: new Date().toISOString(),
          ...data
        })
      });
    } catch (error) {
      console.warn('C2C Badge: Telemetry failed', error);
    }
  }
}

// Auto-initialize if script is loaded directly
if (typeof window !== 'undefined') {
  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      window.C2CBadge = new C2CBadge(window.C2C_BADGE_CONFIG || {});
    });
  } else {
    window.C2CBadge = new C2CBadge(window.C2C_BADGE_CONFIG || {});
  }
}

// Export for module usage
if (typeof module !== 'undefined' && module.exports) {
  module.exports = C2CBadge;
}
