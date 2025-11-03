/**
 * Content Script for C2 Concierge Extension
 * Discovers media elements and renders Shadow DOM badges
 */

// Configuration with validation
const CONFIG = (() => {
  const config = {
    BADGE_CLASS: 'c2-concierge-badge',
    SHADOW_HOST_ID: 'c2-concierge-shadow-host',
    SCAN_THROTTLE: 100, // ms between scans
    MAX_BADGES: 100, // Prevent performance issues
    OBSERVER_DEBOUNCE: 50, // ms for mutation observer
    MAX_URL_LENGTH: 2048,
    MAX_SELECTOR_LENGTH: 100,
    MAX_ELEMENTS_PER_SCAN: 1000,
    MUTATION_LIMIT: 1000, // Max mutations per minute
    RESET_INTERVAL: 60000, // 1 minute
    MAX_MUTATIONS_PROCESSED: 50
  };
  
  // Validate configuration
  if (typeof config.BADGE_CLASS !== 'string' || config.BADGE_CLASS.length === 0) {
    throw new Error('Invalid BADGE_CLASS');
  }
  if (typeof config.SHADOW_HOST_ID !== 'string' || config.SHADOW_HOST_ID.length === 0) {
    throw new Error('Invalid SHADOW_HOST_ID');
  }
  if (typeof config.SCAN_THROTTLE !== 'number' || config.SCAN_THROTTLE <= 0) {
    throw new Error('Invalid SCAN_THROTTLE');
  }
  if (typeof config.MAX_BADGES !== 'number' || config.MAX_BADGES <= 0) {
    throw new Error('Invalid MAX_BADGES');
  }
  if (typeof config.OBSERVER_DEBOUNCE !== 'number' || config.OBSERVER_DEBOUNCE <= 0) {
    throw new Error('Invalid OBSERVER_DEBOUNCE');
  }
  
  return Object.freeze(config);
})();

// State tracking with validation
const seenElements = new WeakSet();
const manifestCache = new Map();
let shadowHost = null;
let shadowRoot = null;
let scanTimer = null;
let observerTimer = null;
let isInitialized = false;

// Initialize with comprehensive error handling
(function init() {
  try {
    // Prevent multiple initializations
    if (isInitialized) {
      return;
    }
    
    // Validate environment
    if (!window || !document || typeof window.location !== 'object') {
      return;
    }
    
    // Validate origin to prevent cross-site attacks
    if (!isValidOrigin()) {
      return;
    }
    
    // Validate DOM methods
    if (typeof document.createElement !== 'function' || 
        typeof document.querySelector !== 'function') {
      return;
    }
    
    // Initialize components
    if (!createShadowDOM()) {
      return;
    }
    
    startMediaDiscovery();
    setupMessageHandlers();
    
    isInitialized = true;
  } catch (error) {
    // Initialization failed, continue silently
  }
})();

// Validate current origin is safe with enhanced checks
function isValidOrigin() {
  try {
    if (!window.location || typeof window.location.origin !== 'string') {
      return false;
    }
    
    const origin = window.location.origin;
    
    // Length validation
    if (origin.length === 0 || origin.length > 100) {
      return false;
    }
    
    // Block dangerous origins
    const blockedOrigins = [
      'chrome-extension://',
      'moz-extension://',
      'safari-web-extension://',
      'edge-extension://',
      'data:',
      'about:',
      'javascript:',
      'file:',
      'ftp:'
    ];
    
    // Check if origin starts with any blocked prefix
    for (const blocked of blockedOrigins) {
      if (origin.startsWith(blocked)) {
        return false;
      }
    }
    
    // Block localhost and private IP ranges in production
    const hostname = window.location.hostname;
    if (typeof hostname !== 'string') {
      return false;
    }
    
    if (hostname === 'localhost' || 
        hostname.startsWith('127.') ||
        hostname.startsWith('192.168.') ||
        hostname.startsWith('10.') ||
        hostname.startsWith('172.') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.localhost')) {
      return false;
    }
    
    // Validate protocol
    const protocol = window.location.protocol;
    if (protocol !== 'https:' && protocol !== 'http:') {
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

// Create Shadow DOM for isolated UI with enhanced security
function createShadowDOM() {
  try {
    // Validate DOM methods
    if (typeof document.createElement !== 'function') {
      return false;
    }
    
    // Create shadow host
    shadowHost = document.createElement('div');
    if (!shadowHost) {
      return false;
    }
    
    shadowHost.id = CONFIG.SHADOW_HOST_ID;
    shadowHost.style.display = 'none';
    
    // Attach shadow root with error handling
    try {
      shadowRoot = shadowHost.attachShadow({ mode: 'open' });
    } catch (shadowError) {
      return false;
    }
    
    if (!shadowRoot) {
      return false;
    }
    
    // Create safe CSS with validation
    const safeBadgeClass = CONFIG.BADGE_CLASS.replace(/[^a-zA-Z0-9-_]/g, '');
    const safeHostId = CONFIG.SHADOW_HOST_ID.replace(/[^a-zA-Z0-9-_]/g, '');
    
    // Inject styles and HTML safely
    const shadowContent = `
      <style>
        :host {
          all: initial;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          font-size: 12px;
          z-index: 2147483647;
          position: relative;
        }
        
        .${safeBadgeClass} {
          position: absolute;
          top: 8px;
          right: 8px;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
          padding: 4px 8px;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.1);
          cursor: pointer;
          transition: all 0.2s ease;
          display: flex;
          align-items: center;
          gap: 4px;
          max-width: 200px;
          opacity: 0;
          transform: translateY(-4px);
          pointer-events: none;
        }
        
        .${safeBadgeClass}.visible {
          opacity: 1;
          transform: translateY(0);
          pointer-events: auto;
        }
        
        .${safeBadgeClass}.verified {
          border-color: #16a34a;
          background: #f0fdf4;
          color: #166534;
        }
        
        .${safeBadgeClass}.unverified {
          border-color: #dc2626;
          background: #fef2f2;
          color: #991b1b;
        }
        
        .${safeBadgeClass}.unknown {
          border-color: #6b7280;
          background: #f9fafb;
          color: #374151;
        }
        
        .badge-icon {
          width: 12px;
          height: 12px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        
        .badge-icon.verified {
          background: #16a34a;
        }
        
        .badge-icon.unverified {
          background: #dc2626;
        }
        
        .badge-icon.unknown {
          background: #6b7280;
        }
        
        .badge-text {
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .detail-panel {
          position: fixed;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background: white;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          max-width: 400px;
          max-height: 300px;
          overflow-y: auto;
          z-index: 2147483647;
          opacity: 0;
          transform: translate(-50%, -50%) scale(0.9);
          pointer-events: none;
          transition: all 0.2s ease;
        }
        
        .detail-panel.visible {
          opacity: 1;
          transform: translate(-50%, -50%) scale(1);
          pointer-events: auto;
        }
        
        .panel-header {
          padding: 16px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .panel-title {
          font-size: 14px;
          font-weight: 600;
          color: #1f2937;
        }
        
        .panel-close {
          background: none;
          border: none;
          font-size: 18px;
          cursor: pointer;
          color: #6b7280;
          padding: 0;
          width: 24px;
          height: 24px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .panel-close:hover {
          color: #374151;
        }
        
        .panel-content {
          padding: 16px;
        }
        
        .verdict-banner {
          padding: 12px;
          border-radius: 6px;
          margin-bottom: 16px;
          text-align: center;
          font-weight: 600;
        }
        
        .verdict-banner.verified {
          background: #f0fdf4;
          color: #166534;
          border: 1px solid #bbf7d0;
        }
        
        .verdict-banner.unverified {
          background: #fef2f2;
          color: #991b1b;
          border: 1px solid #fecaca;
        }
        
        .verdict-banner.unknown {
          background: #f9fafb;
          color: #374151;
          border: 1px solid #e5e7eb;
        }
        
        .panel-section {
          margin-bottom: 12px;
        }
        
        .panel-label {
          font-size: 12px;
          font-weight: 600;
          color: #6b7280;
          margin-bottom: 4px;
        }
        
        .panel-value {
          font-size: 13px;
          color: #1f2937;
          word-break: break-all;
        }
      </style>
      
      <div id="detail-panel" class="detail-panel">
        <div class="panel-header">
          <div class="panel-title">Content Credentials</div>
          <button class="panel-close" id="panel-close">×</button>
        </div>
        <div class="panel-content" id="panel-content"></div>
      </div>
    `;
    
    // Validate content length
    if (shadowContent.length > 50000) { // 50KB limit
      return false;
    }
    
    shadowRoot.innerHTML = shadowContent;
    
    // Append to body with error handling
    try {
      if (document.body) {
        document.body.appendChild(shadowHost);
      }
    } catch (appendError) {
      return false;
    }
    
    return true;
  } catch (error) {
    return false;
  }
}

// Setup detail panel interactions
function setupDetailPanel() {
  try {
    if (!shadowRoot) {
      return;
    }
    
    const panel = shadowRoot.getElementById('detail-panel');
    const closeBtn = shadowRoot.getElementById('panel-close');
    
    if (!panel || !closeBtn) {
      return;
    }
    
    // Close button handler
    closeBtn.addEventListener('click', () => {
      panel.classList.remove('visible');
    });
    
    // Escape key handler
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && panel.classList.contains('visible')) {
        panel.classList.remove('visible');
      }
    });
    
    // Click outside to close
    document.addEventListener('click', (e) => {
      if (panel.classList.contains('visible') && !panel.contains(e.target) && !isElementInBadge(e.target)) {
        panel.classList.remove('visible');
      }
    });
  } catch (error) {
    // Error setting up panel handlers
  }
}

// Start media discovery with throttling
function startMediaDiscovery() {
  // Initial scan
  scheduleScan();
  
  // Rate limiting for mutation observer
  let mutationCount = 0;
  let lastReset = Date.now();
  const MUTATION_LIMIT = 1000; // Max mutations per minute
  const RESET_INTERVAL = 60000; // 1 minute
  
  // Setup mutation observer
  const observer = new MutationObserver((mutations) => {
    // Rate limiting check
    const now = Date.now();
    if (now - lastReset > RESET_INTERVAL) {
      mutationCount = 0;
      lastReset = now;
    }
    
    mutationCount += mutations.length;
    if (mutationCount > MUTATION_LIMIT) {
      // Too many mutations, disable observer temporarily
      observer.disconnect();
      setTimeout(() => {
        mutationCount = 0;
        observer.observe(document.documentElement, {
          subtree: true,
          childList: true,
          attributes: false
        });
      }, RESET_INTERVAL);
      return;
    }
    
    clearTimeout(observerTimer);
    observerTimer = setTimeout(() => {
      // Limit number of mutations processed
      const mutationsToProcess = mutations.slice(0, 50); // Max 50 mutations
      
      for (const mutation of mutationsToProcess) {
        if (mutation.type === 'childList') {
          for (const node of mutation.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              scanMediaElements(node);
            }
          }
        }
      }
    }, CONFIG.OBSERVER_DEBOUNCE);
  });
  
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: false
  });
}

// Throttled scanning
function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    scanMediaElements(document);
  }, CONFIG.SCAN_THROTTLE);
}

// Scan for media elements
function scanMediaElements(root = document) {
  try {
    // Validate root parameter
    if (!root || typeof root.querySelectorAll !== 'function') {
      return;
    }
    
    const selectors = [
      'img',
      'picture img', 
      'video',
      'source',
      '[style*="background-image"]',
      '[data-c2pa]'
    ];
    
    // Use safe selectors to prevent CSS injection
    const safeSelectors = selectors.filter(s => 
      s.length < 100 && !s.includes('javascript:') && !s.includes('data:')
    );
    
    const media = root.querySelectorAll(safeSelectors.join(','));
    
    // Validate query result size to prevent DoS
    if (media.length > 1000) {
      return; // Too many elements, skip scan
    }
    
    let processed = 0;
    
    for (const element of media) {
      if (processed >= CONFIG.MAX_BADGES) break;
      
      // Validate element
      if (!element || typeof element.tagName !== 'string') {
        continue;
      }
      
      if (!seenElements.has(element)) {
        seenElements.add(element);
        handleMediaElement(element);
        processed++;
      }
    }
  } catch (error) {
    // Error scanning media elements, continue silently
  }
}

// Handle individual media element
async function handleMediaElement(element) {
  try {
    const siteConfig = await getSiteConfig();
    if (!siteConfig.enabled || !siteConfig.showBadges) {
      return;
    }
    
    const elementUrl = getElementUrl(element);
    if (!elementUrl) return;
    
    // Check if already processed
    if (manifestCache.has(elementUrl)) {
      const cached = manifestCache.get(elementUrl);
      if (cached) {
        createBadge(element, cached);
      }
      return;
    }
    
    // Try to discover manifest
    const manifestUrl = await discoverManifest(elementUrl);
    if (!manifestUrl) {
      createBadge(element, null); // No credentials found
      return;
    }
    
    // Verify manifest
    const result = await verifyManifest(manifestUrl, elementUrl);
    manifestCache.set(elementUrl, result);
    
    createBadge(element, result);
    
  } catch (error) {
    // Error handling media element, continue silently
  }
}

// Get element URL
function getElementUrl(element) {
  try {
    // Validate element
    if (!element || typeof element.tagName !== 'string') {
      return null;
    }
    
    let url = null;
    
    if (element.tagName === 'IMG' || element.tagName === 'VIDEO') {
      url = element.src || element.currentSrc;
    }
    
    if (element.tagName === 'SOURCE') {
      if (element.srcset && typeof element.srcset === 'string') {
        // Safe parsing of srcset
        const firstUrl = element.srcset.split(' ')[0];
        url = firstUrl;
      } else {
        url = element.src;
      }
    }
    
    if (element.style && element.style.backgroundImage) {
      // Safe regex with proper escaping
      const match = element.style.backgroundImage.match(/^url\(['"]?([^'"]+)['"]?\)$/);
      url = match?.[1];
    }
    
    if (element.dataset && element.dataset.c2pa) {
      url = element.dataset.c2pa;
    }
    
    // Validate URL
    if (!url || typeof url !== 'string') {
      return null;
    }
    
    // Length validation
    if (url.length > 2048) {
      return null;
    }
    
    // Protocol validation
    if (!url.startsWith('http') && !url.startsWith('data') && !url.startsWith('blob')) {
      return null;
    }
    
    // Additional validation
    if (url.includes('javascript:') || url.includes('data:text/html')) {
      return null;
    }
    
    return url;
  } catch (error) {
    return null;
  }
}

// Discover manifest URL
async function discoverManifest(elementUrl) {
  try {
    // Validate input
    if (!elementUrl || typeof elementUrl !== 'string' || elementUrl.length > 2048) {
      return null;
    }
    
    // First check if background script already found it via headers
    const response = await chrome.runtime.sendMessage({
      type: 'fetch-manifest',
      url: elementUrl
    });
    
    if (response.success && response.result.manifest) {
      return response.result.manifest;
    }
    
    // Try same-path .c2pa sidecar with validation
    try {
      // Safe URL construction
      const sidecarUrl = elementUrl.replace(/(\.[^.]+)$/, '.c2pa$1');
      
      // Validate constructed URL
      if (!sidecarUrl || sidecarUrl.length > 2048 || sidecarUrl === elementUrl) {
        return null;
      }
      
      // Validate sidecar URL format
      if (!sidecarUrl.endsWith('.c2pa') && !sidecarUrl.includes('.c2pa.')) {
        return null;
      }
      
      // Create AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 3000); // 3 second timeout
      
      const sidecarResponse = await fetch(sidecarUrl, { 
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      if (sidecarResponse.ok) {
        return sidecarUrl;
      }
    } catch {
      // Sidecar not found or failed
    }
    
    return null;
  } catch (error) {
    // Manifest discovery failed, return null
    return null;
  }
}

// Verify manifest
async function verifyManifest(manifestUrl, assetUrl) {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'verify-manifest',
      manifestUrl,
      assetUrl
    });
    
    if (response.success) {
      return response.result;
    } else {
      throw new Error(response.error);
    }
  } catch (error) {
    return {
      verified: false,
      error: error.message,
      manifestUrl,
      assetUrl
    };
  }
}

// Create badge overlay
function createBadge(element, verificationResult) {
  try {
    // Remove existing badge
    const existing = element.querySelector(`.${CONFIG.BADGE_CLASS}`);
    if (existing) existing.remove();
    
    // Create badge
    const badge = document.createElement('div');
    badge.className = CONFIG.BADGE_CLASS;
    
    // Set state and content
    const state = getBadgeState(verificationResult);
    badge.classList.add(state.class);
    
    // Create badge content safely
    const iconDiv = document.createElement('div');
    iconDiv.className = `badge-icon ${state.class}`;
    
    const textDiv = document.createElement('div');
    textDiv.className = 'badge-text';
    textDiv.textContent = state.text;
    
    badge.appendChild(iconDiv);
    badge.appendChild(textDiv);
    
    // Position badge
    positionBadge(element, badge);
    
    // Add hover handlers
    badge.addEventListener('mouseenter', () => {
      badge.classList.add('visible');
    });
    
    badge.addEventListener('mouseleave', () => {
      if (!shadowRoot.getElementById('detail-panel').classList.contains('visible')) {
        badge.classList.remove('visible');
      }
    });
    
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showDetailPanel(verificationResult);
    });
    
    // Add to page
    document.body.appendChild(badge);
    
    // Show on hover of parent element
    element.addEventListener('mouseenter', () => {
      badge.classList.add('visible');
    });
    
    element.addEventListener('mouseleave', () => {
      if (!shadowRoot.getElementById('detail-panel').classList.contains('visible')) {
        badge.classList.remove('visible');
      }
    });
    
  } catch (error) {
    // Error creating badge, continue silently
  }
}

// Get badge state based on verification result
function getBadgeState(result) {
  if (!result) {
    return {
      class: 'unknown',
      text: 'No credentials'
    };
  }
  
  if (result.verified) {
    return {
      class: 'verified',
      text: 'Verified'
    };
  }
  
  if (result.error) {
    return {
      class: 'unverified',
      text: 'Invalid'
    };
  }
  
  return {
    class: 'warning',
    text: 'Warning'
  };
}

// Position badge relative to element
function positionBadge(element, badge) {
  const rect = element.getBoundingClientRect();
  const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
  const scrollLeft = window.pageXOffset || document.documentElement.scrollLeft;
  
  badge.style.position = 'absolute';
  badge.style.top = `${rect.top + scrollTop + 8}px`;
  badge.style.left = `${rect.left + scrollLeft + rect.width - 208}px`; // 200px badge width + 8px margin
  badge.style.width = '200px';
  badge.style.height = '24px';
}

// Show detail panel
function showDetailPanel(verificationResult) {
  const panel = shadowRoot.getElementById('detail-panel');
  const content = shadowRoot.getElementById('panel-content');
  
  content.innerHTML = generateDetailContent(verificationResult);
  panel.classList.add('visible');
}

// Generate detail panel content
function generateDetailContent(result) {
  if (!result) {
    return `
      <div class="verdict-banner unknown">
        No Content Credentials Found
      </div>
      <div class="panel-section">
        <div class="panel-label">Status</div>
        <div class="panel-value">No C2PA manifest was discovered for this media.</div>
      </div>
    `;
  }
  
  const verdict = result.verified ? 'verified' : 'unverified';
  const status = result.verified ? 'Verified' : 'Verification Failed';
  
  return `
    <div class="verdict-banner ${verdict}">
      ${status}
    </div>
    <div class="panel-section">
      <div class="panel-label">Asset URL</div>
      <div class="panel-value">${escapeHtml(result.assetUrl || 'Unknown')}</div>
    </div>
    <div class="panel-section">
      <div class="panel-label">Manifest URL</div>
      <div class="panel-value">${escapeHtml(result.manifestUrl || 'Unknown')}</div>
    </div>
    ${result.issuer ? `
    <div class="panel-section">
      <div class="panel-label">Issuer</div>
      <div class="panel-value">${escapeHtml(result.issuer)}</div>
    </div>
    ` : ''}
    ${result.timestamp ? `
    <div class="panel-section">
      <div class="panel-label">Timestamp</div>
      <div class="panel-value">${new Date(result.timestamp).toLocaleString()}</div>
    </div>
    ` : ''}
    ${result.error ? `
    <div class="panel-section">
      <div class="panel-label">Error</div>
      <div class="panel-value">${escapeHtml(result.error)}</div>
    </div>
    ` : ''}
  `;
}

// Check if element is in a badge
function isElementInBadge(element) {
  return element.closest(`.${CONFIG.BADGE_CLASS}`) !== null;
}

// Escape HTML to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Get site configuration
async function getSiteConfig() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'get-site-config'
    });
    
    if (response.success) {
      return response.config;
    }
  } catch (error) {
    // Failed to get site config, use defaults
  }
  
  return { enabled: true, showBadges: true };
}

// Setup message handlers
function setupMessageHandlers() {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'manifest-found') {
      // Manifest found via headers, update relevant badges
      handleManifestFound(message);
    }
  });
}

// Handle manifest found from background script
function handleManifestFound(message) {
  // Find elements matching the URL and update their badges
  const elements = document.querySelectorAll(`img[src="${message.url}"], video[src="${message.url}"]`);
  
  for (const element of elements) {
    if (!seenElements.has(element)) {
      seenElements.add(element);
      
      // Verify the discovered manifest
      verifyManifest(message.manifest, message.url)
        .then(result => {
          manifestCache.set(message.url, result);
          createBadge(element, result);
        })
        .catch(error => {
          // Verification failed, continue silently
        });
    }
  }
}

// Performance monitoring
if (typeof performance !== 'undefined' && performance.mark) {
  performance.mark('c2-concierge-content-loaded');
}
