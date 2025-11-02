/**
 * C2PA Pilot Badge - ES Module
 * Content Credentials badge implementation for pilot program
 */

class C2PABadge {
  constructor(options = {}) {
    // Validate and sanitize options
    this.options = {
      manifestBase: this.validateUrl(options.manifestBase) || '',
      tenantId: this.validateTenantId(options.tenantId) || '',
      verifyUrl: this.validateUrl(options.verifyUrl) || 'https://verify.credlink.io',
      badgePosition: this.validateBadgePosition(options.badgePosition) || 'bottom-right',
      showOnHover: typeof options.showOnHover === 'boolean' ? options.showOnHover : false,
      ...options
    };
    
    // Validate required configuration
    if (!this.options.tenantId) {
      console.warn('C2PA Badge: Tenant ID is required for full functionality');
    }
    
    if (!this.options.manifestBase) {
      console.warn('C2PA Badge: Manifest base URL is required for verification');
    }
    
    this.init();
  }

  validateUrl(url) {
    if (!url || typeof url !== 'string') return null;
    
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol) ? url : null;
    } catch {
      return null;
    }
  }

  validateTenantId(tenantId) {
    if (!tenantId || typeof tenantId !== 'string') return null;
    
    // Allow alphanumeric, hyphens, underscores
    const validPattern = /^[a-zA-Z0-9_-]+$/;
    return validPattern.test(tenantId) ? tenantId : null;
  }

  validateBadgePosition(position) {
    const validPositions = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
    return validPositions.includes(position) ? position : null;
  }

  init() {
    // Wait for DOM to be ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.setupBadges());
    } else {
      this.setupBadges();
    }
  }

  setupBadges() {
    // Find all images with C2PA data
    const images = document.querySelectorAll('img[data-c2pa-manifest], img[data-c2pa-tenant]');
    
    images.forEach(img => {
      this.createBadge(img);
    });

    // Set up mutation observer for dynamic content
    this.setupObserver();
  }

  createBadge(img) {
    try {
      const manifestUrl = img.getAttribute('data-c2pa-manifest');
      const tenantId = img.getAttribute('data-c2pa-tenant');

      if (!manifestUrl || !tenantId) {
        return; // Skip images without C2PA data
      }

      // Validate manifest URL
      if (!this.validateUrl(manifestUrl)) {
        console.warn('C2PA Badge: Invalid manifest URL:', manifestUrl);
        return;
      }

      // Validate tenant ID
      if (!this.validateTenantId(tenantId)) {
        console.warn('C2PA Badge: Invalid tenant ID:', tenantId);
        return;
      }

      // Check if badge already exists
      if (img.closest('.c2pa-badge')) {
        return; // Badge already created
      }

      // Create badge wrapper
      const wrapper = document.createElement('div');
      wrapper.className = `c2pa-badge c2pa-badge--${this.options.badgePosition}`;
      
      // Wrap the image
      img.parentNode.insertBefore(wrapper, img);
      wrapper.appendChild(img);

      // Add badge icon
      const badge = document.createElement('div');
      badge.className = 'c2pa-badge__icon';
      badge.setAttribute('role', 'button');
      badge.setAttribute('aria-label', 'View Content Credentials');
      badge.setAttribute('tabindex', '0');
      badge.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M10 2L12.5 7.5L18 8L14.5 12L15.5 17.5L10 15L4.5 17.5L5.5 12L2 8L7.5 7.5L10 2Z" 
                fill="currentColor" stroke="currentColor" stroke-width="0.5"/>
        </svg>
      `;
      
      wrapper.appendChild(badge);

      // Add click handler
      badge.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.showVerification(img, manifestUrl);
      });

      // Add keyboard handler
      badge.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          e.stopPropagation();
          this.showVerification(img, manifestUrl);
        }
      });

      // Add hover effects if enabled
      if (this.options.showOnHover) {
        badge.style.opacity = '0';
        badge.style.transition = 'opacity 0.2s ease';
        wrapper.addEventListener('mouseenter', () => {
          badge.style.opacity = '1';
        });
        wrapper.addEventListener('mouseleave', () => {
          badge.style.opacity = '0';
        });
      }

      // Track verification event
      this.trackVerification(img.src, manifestUrl);
      
    } catch (error) {
      console.error('C2PA Badge: Failed to create badge for image:', img.src, error);
    }
  }

  showVerification(img, manifestUrl) {
    // Create modal
    const modal = document.createElement('div');
    modal.className = 'c2pa-modal';
    modal.innerHTML = `
      <div class="c2pa-modal__content">
        <div class="c2pa-modal__header">
          <h3>Content Credentials Verified</h3>
          <button class="c2pa-modal__close">&times;</button>
        </div>
        <div class="c2pa-modal__body">
          <div class="c2pa-modal__image">
            <img src="${img.src}" alt="Content with credentials" />
          </div>
          <div class="c2pa-modal__info">
            <h4>Provenance Information</h4>
            <p><strong>Manifest:</strong> <a href="${manifestUrl}" target="_blank">View Details</a></p>
            <p><strong>Tenant:</strong> ${this.options.tenantId}</p>
            <p><strong>Verified:</strong> ${new Date().toLocaleString()}</p>
            <div class="c2pa-modal__status">
              <span class="c2pa-status c2pa-status--verified">✓ Verified</span>
            </div>
          </div>
        </div>
      </div>
    `;

    // Add modal to page
    document.body.appendChild(modal);

    // Add close handlers
    const closeBtn = modal.querySelector('.c2pa-modal__close');
    closeBtn.addEventListener('click', () => {
      document.body.removeChild(modal);
    });

    modal.addEventListener('click', (e) => {
      if (e.target === modal) {
        document.body.removeChild(modal);
      }
    });

    // Emit verification event
    this.emitVerificationEvent(img.src, manifestUrl);
  }

  trackVerification(assetUrl, manifestUrl) {
    // Validate inputs
    if (!assetUrl || !manifestUrl) {
      console.warn('C2PA Badge: Missing asset URL or manifest URL for tracking');
      return;
    }

    // Send tracking data to pilot dashboard
    if (this.options.tenantId && this.options.verifyUrl) {
      const trackingData = {
        tenant_id: this.options.tenantId,
        asset_url: assetUrl,
        manifest_url: manifestUrl,
        timestamp: new Date().toISOString(),
        user_agent: navigator.userAgent,
        page_type: this.getPageType(),
        badge_position: this.options.badgePosition
      };

      fetch(`${this.options.verifyUrl}/track`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(trackingData)
      }).catch(error => {
        // Silent fail for tracking - don't break user experience
        console.log('C2PA tracking failed:', error);
      });
    }
  }

  emitVerificationEvent(assetUrl, manifestUrl) {
    const event = new CustomEvent('c2pa:verify', {
      detail: {
        asset: assetUrl,
        manifest: manifestUrl,
        tenant: this.options.tenantId,
        timestamp: new Date().toISOString()
      }
    });
    document.dispatchEvent(event);
  }

  getPageType() {
    const path = window.location.pathname;
    
    if (path.includes('/product') || path.includes('/item')) return 'product';
    if (path.includes('/article') || path.includes('/blog')) return 'article';
    if (path.includes('/gallery') || path.includes('/collection')) return 'gallery';
    if (path === '/' || path.includes('/home')) return 'homepage';
    
    return 'other';
  }

  setupObserver() {
    try {
      const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
          try {
            mutation.addedNodes.forEach((node) => {
              if (node.nodeType === Node.ELEMENT_NODE) {
                const images = node.querySelectorAll ? 
                  node.querySelectorAll('img[data-c2pa-manifest], img[data-c2pa-tenant]') : [];
                
                images.forEach(img => {
                  try {
                    this.createBadge(img);
                  } catch (error) {
                    console.warn('C2PA Badge: Failed to create badge for observed image:', img.src, error);
                  }
                });
                
                // Check if the node itself is an image
                if (node.tagName === 'IMG' && 
                    (node.getAttribute('data-c2pa-manifest') || node.getAttribute('data-c2pa-tenant'))) {
                  try {
                    this.createBadge(node);
                  } catch (error) {
                    console.warn('C2PA Badge: Failed to create badge for observed node:', node.src, error);
                  }
                }
              }
            });
          } catch (error) {
            console.warn('C2PA Badge: Error processing mutation:', error);
          }
        });
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true
      });

      // Store observer reference for cleanup
      this.observer = observer;
      
    } catch (error) {
      console.error('C2PA Badge: Failed to setup mutation observer:', error);
    }
  }

  // Static initialization method
  static init(options = {}) {
    return new C2PABadge(options);
  }

  // Cleanup method for SPA applications
  destroy() {
    try {
      // Disconnect observer
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
      }

      // Remove all badges
      const badges = document.querySelectorAll('.c2pa-badge');
      badges.forEach(badge => {
        const img = badge.querySelector('img');
        if (img) {
          badge.parentNode.insertBefore(img, badge);
        }
        badge.remove();
      });

      // Remove all modals
      const modals = document.querySelectorAll('.c2pa-modal');
      modals.forEach(modal => modal.remove());

    } catch (error) {
      console.error('C2PA Badge: Error during cleanup:', error);
    }
  }

  // Update configuration method
  updateConfig(newOptions) {
    try {
      // Validate new options
      const validatedOptions = {
        manifestBase: this.validateUrl(newOptions.manifestBase) || this.options.manifestBase,
        tenantId: this.validateTenantId(newOptions.tenantId) || this.options.tenantId,
        verifyUrl: this.validateUrl(newOptions.verifyUrl) || this.options.verifyUrl,
        badgePosition: this.validateBadgePosition(newOptions.badgePosition) || this.options.badgePosition,
        showOnHover: typeof newOptions.showOnHover === 'boolean' ? newOptions.showOnHover : this.options.showOnHover
      };

      this.options = { ...this.options, ...validatedOptions };

      // Re-setup badges with new configuration
      this.destroy();
      this.init();

    } catch (error) {
      console.error('C2PA Badge: Error updating configuration:', error);
    }
  }
}

// Auto-initialize if global config is available
if (typeof window !== 'undefined') {
  window.C2PABadge = C2PABadge;
  
  // Look for global configuration
  if (window.C2PA_CONFIG) {
    C2PABadge.init(window.C2PA_CONFIG);
  }
}

export default C2PABadge;
