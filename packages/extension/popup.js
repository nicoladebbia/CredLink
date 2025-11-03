/**
 * Popup Script for C2 Concierge Extension
 * Handles popup UI and site configuration
 */

// State
let currentTab = null;
let siteConfig = { enabled: true, showBadges: true };
let pageStats = { mediaCount: 0, verifiedCount: 0, warningCount: 0 };

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  try {
    await initializePopup();
    setupEventListeners();
    updateUI();
  } catch (error) {
    // Popup initialization failed, show error
    showError('Failed to initialize popup');
  }
});

// Initialize popup data
async function initializePopup() {
  // Get current tab with validation
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  
  if (!tabs || !Array.isArray(tabs) || tabs.length === 0) {
    throw new Error('No active tab found');
  }
  
  currentTab = tabs[0];
  
  // Validate tab object
  if (!currentTab || typeof currentTab !== 'object' || !currentTab.url) {
    throw new Error('Invalid tab data');
  }
  
  // Validate tab URL
  if (typeof currentTab.url !== 'string' || currentTab.url.length > 2048) {
    throw new Error('Invalid tab URL');
  }
  
  // Block dangerous URLs
  if (currentTab.url.startsWith('chrome-extension://') ||
      currentTab.url.startsWith('javascript:') ||
      currentTab.url.startsWith('data:text/html')) {
    throw new Error('Blocked URL type');
  }
  
  // Load site configuration
  await loadSiteConfig();
  
  // Load page statistics
  await loadPageStats();
  
  // Update site URL display
  updateSiteUrl();
}

// Load site configuration
async function loadSiteConfig() {
  try {
    const response = await chrome.runtime.sendMessage({
      type: 'get-site-config'
    });
    
    if (response.success) {
      siteConfig = response.config;
    }
  } catch (error) {
    // Failed to load site config, use defaults
  }
}

// Load page statistics from content script
async function loadPageStats() {
  try {
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'get-stats'
    });
    
    if (response) {
      pageStats = response;
    }
  } catch (error) {
    // Content script might not be ready
  }
}

// Update site URL display
function updateSiteUrl() {
  const siteUrlElement = document.getElementById('site-url');
  if (!siteUrlElement) {
    return;
  }
  
  if (currentTab && currentTab.url) {
    try {
      const url = new URL(currentTab.url);
      
      // Validate and sanitize origin
      let origin = url.origin;
      
      // Length validation
      if (origin.length > 100) {
        origin = origin.substring(0, 97) + '...';
      }
      
      // Remove any potential script content
      origin = origin.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      origin = origin.replace(/javascript:/gi, '');
      origin = origin.replace(/data:/gi, '');
      
      // Set text content safely
      siteUrlElement.textContent = origin || 'Unknown site';
    } catch {
      siteUrlElement.textContent = 'Unknown site';
    }
  } else {
    siteUrlElement.textContent = 'Unknown site';
  }
}

// Setup event listeners
function setupEventListeners() {
  // Site configuration toggles
  const enableToggle = document.getElementById('enable-site');
  const badgesToggle = document.getElementById('show-badges');
  
  enableToggle.addEventListener('change', async (e) => {
    siteConfig.enabled = e.target.checked;
    await saveSiteConfig();
    notifyContentScript('config-changed', siteConfig);
  });
  
  badgesToggle.addEventListener('change', async (e) => {
    siteConfig.showBadges = e.target.checked;
    await saveSiteConfig();
    notifyContentScript('config-changed', siteConfig);
  });
  
  // Action buttons
  document.getElementById('verify-all').addEventListener('click', verifyAllMedia);
  document.getElementById('refresh-page').addEventListener('click', refreshPage);
  
  // Footer links
  document.getElementById('settings').addEventListener('click', openSettings);
  document.getElementById('help').addEventListener('click', openHelp);
  document.getElementById('feedback').addEventListener('click', openFeedback);
  
  // Privacy links
  document.getElementById('privacy-policy').addEventListener('click', openPrivacyPolicy);
  document.getElementById('learn-more').addEventListener('click', openLearnMore);
}

// Update UI with current state
function updateUI() {
  // Update toggles
  document.getElementById('enable-site').checked = siteConfig.enabled;
  document.getElementById('show-badges').checked = siteConfig.showBadges;
  
  // Update statistics
  document.getElementById('media-count').textContent = pageStats.mediaCount;
  document.getElementById('verified-count').textContent = pageStats.verifiedCount;
  document.getElementById('warning-count').textContent = pageStats.warningCount;
  
  // Update status indicator
  updateStatusIndicator();
}

// Update status indicator
function updateStatusIndicator() {
  const statusDot = document.querySelector('.status-dot');
  const statusText = document.querySelector('.status-text');
  
  if (siteConfig.enabled) {
    statusDot.style.background = 'var(--color-success)';
    statusText.textContent = 'Active';
  } else {
    statusDot.style.background = 'var(--color-gray-400)';
    statusText.textContent = 'Disabled';
  }
}

// Save site configuration
async function saveSiteConfig() {
  try {
    await chrome.runtime.sendMessage({
      type: 'set-site-config',
      config: siteConfig
    });
  } catch (error) {
    showError('Failed to save configuration');
  }
}

// Notify content script of changes
function notifyContentScript(type, data) {
  if (currentTab) {
    chrome.tabs.sendMessage(currentTab.id, {
      type: type,
      data: data
    }).catch(() => {
      // Content script might not be ready
    });
  }
}

// Verify all media on page
async function verifyAllMedia() {
  const button = document.getElementById('verify-all');
  const originalText = button.innerHTML;
  
  try {
    // Show loading state
    button.disabled = true;
    button.innerHTML = '<span class="button-icon">⏳</span> Verifying...';
    
    // Send message to content script
    const response = await chrome.tabs.sendMessage(currentTab.id, {
      type: 'verify-all'
    });
    
    if (response) {
      // Update statistics
      pageStats = response;
      updateUI();
      
      // Show success message
      showSuccess(`Verified ${response.verifiedCount} media items`);
    }
    
  } catch (error) {
    showError('Failed to verify media');
  } finally {
    // Restore button state
    button.disabled = false;
    button.innerHTML = originalText;
  }
}

// Refresh current page
function refreshPage() {
  if (currentTab) {
    chrome.tabs.reload(currentTab.id);
    window.close();
  }
}

// Open settings page
function openSettings() {
  chrome.runtime.openOptionsPage();
}

// Open help page
function openHelp() {
  chrome.tabs.create({
    url: 'https://github.com/Nickiller04/c2-concierge/blob/main/docs/browser-extension-help.md'
  });
}

// Open feedback form
function openFeedback() {
  chrome.tabs.create({
    url: 'https://github.com/Nickiller04/c2-concierge/issues/new?template=extension-feedback.md'
  });
}

// Open privacy policy
function openPrivacyPolicy(e) {
  e.preventDefault();
  chrome.tabs.create({
    url: 'https://github.com/Nickiller04/c2-concierge/blob/main/PRIVACY.md'
  });
}

// Open learn more page
function openLearnMore(e) {
  e.preventDefault();
  chrome.tabs.create({
    url: 'https://c2pa.org/specifications/specifications-1.0/'
  });
}

// Show success message
function showSuccess(message) {
  showNotification(message, 'success');
}

// Show error message
function showError(message) {
  showNotification(message, 'error');
}

// Show notification
function showNotification(message, type = 'info') {
  // Create notification element
  const notification = document.createElement('div');
  notification.className = `notification ${type}`;
  notification.textContent = message;
  
  // Add styles
  notification.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    right: 10px;
    padding: 12px;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 500;
    z-index: 10000;
    animation: slideDown 0.3s ease;
  `;
  
  // Set color based on type
  switch (type) {
    case 'success':
      notification.style.background = '#f0fdf4';
      notification.style.color = '#16a34a';
      notification.style.border = '1px solid #bbf7d0';
      break;
    case 'error':
      notification.style.background = '#fef2f2';
      notification.style.color = '#dc2626';
      notification.style.border = '1px solid #fecaca';
      break;
    default:
      notification.style.background = '#eff6ff';
      notification.style.color = '#2563eb';
      notification.style.border = '1px solid #bfdbfe';
  }
  
  // Add to document
  document.body.appendChild(notification);
  
  // Remove after 3 seconds
  setTimeout(() => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  }, 3000);
}

// Add slide down animation
const style = document.createElement('style');
style.textContent = `
  @keyframes slideDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
`;
document.head.appendChild(style);

// Handle keyboard shortcuts
document.addEventListener('keydown', (e) => {
  // Ctrl/Cmd + Enter to verify all
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    verifyAllMedia();
  }
  
  // Escape to close popup
  if (e.key === 'Escape') {
    window.close();
  }
});

// Listen for messages from background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'stats-updated') {
    pageStats = message.stats;
    updateUI();
  }
});

// Periodic stats update
setInterval(async () => {
  if (currentTab) {
    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, {
        type: 'get-stats'
      });
      
      if (response && JSON.stringify(response) !== JSON.stringify(pageStats)) {
        pageStats = response;
        updateUI();
      }
    } catch {
      // Content script might not be ready
    }
  }
}, 5000); // Update every 5 seconds
