/**
 * Background Service Worker for C2 Concierge Extension
 * Handles manifest discovery via webRequest and verification relay
 */

import { parseLinkHeader } from '../lib/parse-link.js';

// Configuration with validation
const CONFIG = (() => {
  const config = {
    RELAY_ENDPOINT: 'https://verify.c2concierge.org/api/verify',
    CACHE_TTL: 5 * 60 * 1000, // 5 minutes
    MAX_CACHE_SIZE: 1000,
    MAX_URL_LENGTH: 2048,
    MAX_HEADER_LENGTH: 8192,
    REQUEST_TIMEOUT: 10000,
    FETCH_TIMEOUT: 5000
  };
  
  // Validate configuration
  if (!config.RELAY_ENDPOINT || typeof config.RELAY_ENDPOINT !== 'string') {
    throw new Error('Invalid RELAY_ENDPOINT');
  }
  if (typeof config.CACHE_TTL !== 'number' || config.CACHE_TTL <= 0) {
    throw new Error('Invalid CACHE_TTL');
  }
  if (typeof config.MAX_CACHE_SIZE !== 'number' || config.MAX_CACHE_SIZE <= 0) {
    throw new Error('Invalid MAX_CACHE_SIZE');
  }
  
  return Object.freeze(config);
})();

// In-memory cache for manifest URLs with size tracking
const manifestCache = new Map();
let totalCacheSize = 0;

// webRequest filter for image and media resources
const FILTER = { 
  urls: ["https://*/*"], 
  types: ["image", "media", "main_frame"] 
};

// Listen for response headers to discover Link headers
chrome.webRequest.onHeadersReceived.addListener((details) => {
  try {
    // Only process main documents and media resources
    if (!['main_frame', 'image', 'media'].includes(details.type)) {
      return;
    }
    
    // Validate tab ID to prevent injection
    if (!details.tabId || details.tabId < 0) {
      return;
    }
    
    // Validate response headers
    if (!details.responseHeaders || !Array.isArray(details.responseHeaders)) {
      return;
    }
    
    const linkHeader = details.responseHeaders
      .find(h => h && typeof h.name === 'string' && h.name.toLowerCase() === 'link');
    
    if (!linkHeader || !linkHeader.value || typeof linkHeader.value !== 'string') {
      return;
    }
    
    // Validate header value length to prevent DoS
    if (linkHeader.value.length > CONFIG.MAX_HEADER_LENGTH) {
      return;
    }
    
    const links = parseLinkHeader(linkHeader.value);
    if (!links || typeof links !== 'object') {
      return;
    }
    
    const manifestUrl = links['c2pa-manifest'];
    if (!manifestUrl || typeof manifestUrl !== 'string') {
      return;
    }
    
    // Validate URL length to prevent DoS
    if (manifestUrl.length > CONFIG.MAX_URL_LENGTH) {
      return;
    }
    
    // Validate URL security
    if (!isValidManifestUrl(manifestUrl)) {
      return;
    }
    
    // Send message to content script with error handling
    chrome.tabs.sendMessage(details.tabId, {
      type: 'manifest-found',
      url: details.url || '',
      manifest: manifestUrl,
      method: 'header'
    }).catch(() => {
      // Content script may not be ready, that's OK
    });
    
  } catch (error) {
    // Error processing headers, continue silently
  }
}, FILTER, ['responseHeaders', 'extraHeaders']);

// Handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  try {
    // Validate message structure
    if (!message || typeof message !== 'object' || !message.type || typeof message.type !== 'string') {
      return false;
    }
    
    // Validate sender
    if (!sender || !sender.tab || !sender.tab.url || typeof sender.tab.url !== 'string') {
      return false;
    }
    
    // Validate sender URL
    if (sender.tab.url.length > CONFIG.MAX_URL_LENGTH) {
      return false;
    }
    
    // Rate limiting per sender
    const senderKey = `${sender.tab.id}:${sender.tab.url}`;
    if (!messageRateLimit.has(senderKey)) {
      messageRateLimit.set(senderKey, { count: 0, resetTime: Date.now() + 60000 });
    }
    
    const rateLimit = messageRateLimit.get(senderKey);
    if (Date.now() > rateLimit.resetTime) {
      rateLimit.count = 0;
      rateLimit.resetTime = Date.now() + 60000;
    }
    
    if (rateLimit.count > 100) { // Max 100 messages per minute per sender
      return false;
    }
    rateLimit.count++;
    
    // Route message to appropriate handler
    switch (message.type) {
      case 'verify-manifest':
        return handleVerifyManifest(message, sendResponse);
      
      case 'fetch-manifest':
        return handleFetchManifest(message, sendResponse);
      
      case 'get-site-config':
        return handleGetSiteConfig(sender, sendResponse);
      
      case 'set-site-config':
        return handleSetSiteConfig(message, sender, sendResponse);
      
      default:
        return false;
    }
  } catch (error) {
    return false;
  }
});

// Rate limiting for messages
const messageRateLimit = new Map();

// Handle verify-manifest message
function handleVerifyManifest(message, sendResponse) {
  try {
    // Validate input parameters
    if (!message.manifestUrl || typeof message.manifestUrl !== 'string' || 
        !message.assetUrl || typeof message.assetUrl !== 'string') {
      sendResponse({ success: false, error: 'Invalid parameters' });
      return true;
    }
    
    // Validate URL lengths
    if (message.manifestUrl.length > CONFIG.MAX_URL_LENGTH || 
        message.assetUrl.length > CONFIG.MAX_URL_LENGTH) {
      sendResponse({ success: false, error: 'URL too long' });
      return true;
    }
    
    // Validate URLs
    if (!isValidManifestUrl(message.manifestUrl) || !isValidAssetUrl(message.assetUrl)) {
      sendResponse({ success: false, error: 'Invalid URLs' });
      return true;
    }
    
    verifyManifest(message.manifestUrl, message.assetUrl)
      .then(result => {
        if (result && typeof result === 'object') {
          sendResponse({ success: true, result });
        } else {
          sendResponse({ success: false, error: 'Invalid verification result' });
        }
      })
      .catch(error => {
        const errorMessage = error && typeof error.message === 'string' ? error.message : 'Verification failed';
        sendResponse({ success: false, error: errorMessage });
      });
    return true; // Keep message channel open for async response
  } catch (error) {
    sendResponse({ success: false, error: 'Handler error' });
    return true;
  }
}

// Handle fetch-manifest message
function handleFetchManifest(message, sendResponse) {
  try {
    // Validate input parameters
    if (!message.url || typeof message.url !== 'string') {
      sendResponse({ success: false, error: 'Invalid URL' });
      return true;
    }
    
    // Validate URL length
    if (message.url.length > CONFIG.MAX_URL_LENGTH) {
      sendResponse({ success: false, error: 'URL too long' });
      return true;
    }
    
    fetchManifestHeaders(message.url)
      .then(result => {
        if (result && typeof result === 'object') {
          sendResponse({ success: true, result });
        } else {
          sendResponse({ success: false, error: 'Invalid fetch result' });
        }
      })
      .catch(error => {
        const errorMessage = error && typeof error.message === 'string' ? error.message : 'Fetch failed';
        sendResponse({ success: false, error: errorMessage });
      });
    return true;
  } catch (error) {
    sendResponse({ success: false, error: 'Handler error' });
    return true;
  }
}

// Handle get-site-config message
function handleGetSiteConfig(sender, sendResponse) {
  try {
    getSiteConfig(sender.tab.url)
      .then(config => {
        if (config && typeof config === 'object') {
          sendResponse({ success: true, config });
        } else {
          sendResponse({ success: false, error: 'Invalid config' });
        }
      })
      .catch(error => {
        const errorMessage = error && typeof error.message === 'string' ? error.message : 'Config failed';
        sendResponse({ success: false, error: errorMessage });
      });
    return true;
  } catch (error) {
    sendResponse({ success: false, error: 'Handler error' });
    return true;
  }
}

// Handle set-site-config message
function handleSetSiteConfig(message, sender, sendResponse) {
  try {
    // Validate config structure
    if (!message.config || typeof message.config !== 'object') {
      sendResponse({ success: false, error: 'Invalid config' });
      return true;
    }
    
    setSiteConfig(sender.tab.url, message.config)
      .then(() => sendResponse({ success: true }))
      .catch(error => {
        const errorMessage = error && typeof error.message === 'string' ? error.message : 'Config save failed';
        sendResponse({ success: false, error: errorMessage });
      });
    return true;
  } catch (error) {
    sendResponse({ success: false, error: 'Handler error' });
    return true;
  }
}

// Verify manifest via relay or local parsing
async function verifyManifest(manifestUrl, assetUrl) {
  try {
    // Validate inputs
    if (!manifestUrl || !assetUrl || typeof manifestUrl !== 'string' || typeof assetUrl !== 'string') {
      throw new Error('Invalid inputs');
    }
    
    // Create secure cache key to prevent collision attacks
    const manifestHash = await hashString(manifestUrl);
    const assetHash = await hashString(assetUrl);
    const cacheKey = `${manifestHash}:${assetHash}`;
    
    // Check cache first
    if (manifestCache.has(cacheKey)) {
      const cached = manifestCache.get(cacheKey);
      if (cached && typeof cached === 'object' && 
          typeof cached.timestamp === 'number' && 
          typeof cached.result === 'object' &&
          Date.now() - cached.timestamp < CONFIG.CACHE_TTL) {
        return cached.result;
      }
    }
    
    let result;
    
    try {
      // Use relay for remote manifests to avoid CORS and protect privacy
      result = await verifyViaRelay(manifestUrl, assetUrl);
    } catch (error) {
      // Verification failed, return safe error result
      result = {
        verified: false,
        error: error && typeof error.message === 'string' ? error.message : 'Verification failed',
        manifestUrl,
        assetUrl,
        timestamp: new Date().toISOString(),
        method: 'error'
      };
    }
    
    // Validate result structure
    if (!result || typeof result !== 'object') {
      result = {
        verified: false,
        error: 'Invalid result',
        manifestUrl,
        assetUrl,
        timestamp: new Date().toISOString(),
        method: 'error'
      };
    }
    
    // Validate result size before caching
    const resultSize = JSON.stringify(result).length;
    if (resultSize > 10240) { // 10KB limit per entry
      // Don't cache oversized results
      return result;
    }
    
    // Update total cache size
    totalCacheSize += resultSize;
    
    // Cache result with size limit
    manifestCache.set(cacheKey, {
      result,
      timestamp: Date.now(),
      size: resultSize
    });
    
    // Clean cache if too large
    while (manifestCache.size > CONFIG.MAX_CACHE_SIZE || totalCacheSize > 1048576) { // 1MB total limit
      const oldestKey = manifestCache.keys().next().value;
      const oldestEntry = manifestCache.get(oldestKey);
      if (oldestEntry && typeof oldestEntry.size === 'number') {
        totalCacheSize -= oldestEntry.size;
      }
      manifestCache.delete(oldestKey);
    }
    
    return result;
  } catch (error) {
    // Return safe error result
    return {
      verified: false,
      error: error && typeof error.message === 'string' ? error.message : 'Verification error',
      manifestUrl: manifestUrl || '',
      assetUrl: assetUrl || '',
      timestamp: new Date().toISOString(),
      method: 'error'
    };
  }
}

// Verify via Edge Relay (privacy-preserving)
async function verifyViaRelay(manifestUrl, assetUrl) {
  try {
    // Validate inputs
    if (!manifestUrl || !assetUrl || typeof manifestUrl !== 'string' || typeof assetUrl !== 'string') {
      throw new Error('Invalid inputs for relay verification');
    }
    
    // Validate URL lengths
    if (manifestUrl.length > CONFIG.MAX_URL_LENGTH || assetUrl.length > CONFIG.MAX_URL_LENGTH) {
      throw new Error('URL too long for relay verification');
    }
    
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);
    
    try {
      // Prepare request body with validation
      const requestBody = {
        manifest_url: manifestUrl,
        asset_url: assetUrl,
        client: 'c2-concierge-extension-v1'
      };
      
      // Validate request body size
      const bodySize = JSON.stringify(requestBody).length;
      if (bodySize > 8192) { // 8KB limit for request body
        throw new Error('Request body too large');
      }
      
      const response = await fetch(CONFIG.RELAY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'C2Concierge-Extension/0.1.0',
          'Accept': 'application/json'
        },
        body: JSON.stringify(requestBody),
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      
      // Validate response
      if (!response || typeof response.ok !== 'boolean') {
        throw new Error('Invalid response object');
      }
      
      if (!response.ok) {
        throw new Error(`Verification failed: ${response.status} ${response.statusText || ''}`);
      }
      
      // Validate response headers
      if (!response.headers || typeof response.headers.get !== 'function') {
        throw new Error('Invalid response headers');
      }
      
      // Validate response size
      const contentLength = response.headers.get('content-length');
      if (contentLength) {
        const parsedLength = parseInt(contentLength, 10);
        if (!isNaN(parsedLength) && parsedLength > 1048576) { // 1MB limit
          throw new Error('Response too large');
        }
      }
      
      // Parse response with error handling
      let result;
      try {
        result = await response.json();
      } catch (parseError) {
        throw new Error('Invalid JSON response');
      }
      
      // Validate response structure
      if (!result || typeof result !== 'object') {
        throw new Error('Invalid response format');
      }
      
      if (!result.verified && !result.error) {
        throw new Error('Invalid verification response');
      }
      
      // Validate response size
      const resultSize = JSON.stringify(result).length;
      if (resultSize > 10240) { // 10KB limit
        throw new Error('Response data too large');
      }
      
      // Sanitize response
      const sanitizedResult = {
        verified: !!result.verified,
        error: result.error && typeof result.error === 'string' ? result.error.substring(0, 500) : null,
        manifestUrl,
        assetUrl,
        method: 'relay',
        timestamp: new Date().toISOString()
      };
      
      // Add optional fields if present and valid
      if (result.issuer && typeof result.issuer === 'string' && result.issuer.length < 200) {
        sanitizedResult.issuer = result.issuer;
      }
      
      if (result.title && typeof result.title === 'string' && result.title.length < 200) {
        sanitizedResult.title = result.title;
      }
      
      return sanitizedResult;
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      throw fetchError;
    }
  } catch (error) {
    // Re-throw with context
    throw new Error(error && typeof error.message === 'string' ? error.message : 'Relay verification failed');
  }
}

// Fetch manifest headers as fallback
async function fetchManifestHeaders(url) {
  try {
    // Validate input
    if (!url || typeof url !== 'string' || url.length > CONFIG.MAX_URL_LENGTH) {
      throw new Error('Invalid URL');
    }
    
    // Validate URL format
    if (!url.startsWith('https://') && !url.startsWith('http://')) {
      throw new Error('Invalid URL protocol');
    }
    
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), CONFIG.FETCH_TIMEOUT);
    
    try {
      const response = await fetch(url, { 
        method: 'HEAD',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'User-Agent': 'C2Concierge-Extension/0.1.0',
          'Accept': '*/*'
        }
      });
      
      clearTimeout(timeoutId);
      
      // Validate response
      if (!response || typeof response !== 'object') {
        return { manifest: null, headers: {} };
      }
      
      if (!response.headers || typeof response.headers.get !== 'function') {
        return { manifest: null, headers: {} };
      }
      
      const linkHeader = response.headers.get('link');
      if (!linkHeader || typeof linkHeader !== 'string') {
        return { manifest: null, headers: {} };
      }
      
      // Validate header length
      if (linkHeader.length > CONFIG.MAX_HEADER_LENGTH) {
        return { manifest: null, headers: {} };
      }
      
      // Parse link header safely
      let links;
      try {
        links = parseLinkHeader(linkHeader);
      } catch (parseError) {
        return { manifest: null, headers: {} };
      }
      
      // Validate parsed links
      if (!links || typeof links !== 'object') {
        return { manifest: null, headers: {} };
      }
      
      // Get headers safely
      let headers = {};
      try {
        if (typeof response.headers.entries === 'function') {
          headers = Object.fromEntries(response.headers.entries());
        }
      } catch (headerError) {
        headers = {};
      }
      
      // Validate manifest URL
      const manifestUrl = links['c2pa-manifest'];
      if (manifestUrl && typeof manifestUrl === 'string') {
        if (manifestUrl.length <= CONFIG.MAX_URL_LENGTH && isValidManifestUrl(manifestUrl)) {
          return { manifest: manifestUrl, headers };
        }
      }
      
      return { manifest: null, headers };
      
    } catch (fetchError) {
      clearTimeout(timeoutId);
      
      // Handle abort specifically
      if (fetchError.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      
      throw new Error(`Failed to fetch headers: ${fetchError && typeof fetchError.message === 'string' ? fetchError.message : 'Network error'}`);
    }
  } catch (error) {
    // Return safe error result
    return { 
      manifest: null, 
      headers: {},
      error: error && typeof error.message === 'string' ? error.message : 'Fetch failed'
    };
  }
}

// Site configuration management
async function getSiteConfig(url) {
  try {
    // Validate input
    if (!url || typeof url !== 'string' || url.length > CONFIG.MAX_URL_LENGTH) {
      return { enabled: true, showBadges: true };
    }
    
    // Parse URL safely
    let origin;
    try {
      const parsedUrl = new URL(url);
      origin = parsedUrl.origin;
    } catch (urlError) {
      return { enabled: true, showBadges: true };
    }
    
    // Validate origin
    if (!origin || typeof origin !== 'string' || origin.length > 100) {
      return { enabled: true, showBadges: true };
    }
    
    // Get configuration from storage
    let result;
    try {
      result = await chrome.storage.sync.get(`site:${origin}`);
    } catch (storageError) {
      return { enabled: true, showBadges: true };
    }
    
    // Validate retrieved configuration
    const config = result[`site:${origin}`];
    if (!config || typeof config !== 'object') {
      return { enabled: true, showBadges: true };
    }
    
    // Return sanitized configuration
    return {
      enabled: !!config.enabled,
      showBadges: !!config.showBadges
    };
  } catch (error) {
    return { enabled: true, showBadges: true };
  }
}

async function setSiteConfig(url, config) {
  try {
    // Validate inputs
    if (!url || typeof url !== 'string' || url.length > CONFIG.MAX_URL_LENGTH) {
      throw new Error('Invalid URL');
    }
    
    if (!config || typeof config !== 'object') {
      throw new Error('Invalid configuration');
    }
    
    // Parse URL safely
    let origin;
    try {
      const parsedUrl = new URL(url);
      origin = parsedUrl.origin;
    } catch (urlError) {
      throw new Error('Invalid URL format');
    }
    
    // Validate origin
    if (!origin || typeof origin !== 'string' || origin.length > 100) {
      throw new Error('Invalid origin');
    }
    
    // Sanitize configuration
    const sanitizedConfig = {
      enabled: !!config.enabled,
      showBadges: !!config.showBadges
    };
    
    // Save to storage with error handling
    try {
      await chrome.storage.sync.set({ [`site:${origin}`]: sanitizedConfig });
    } catch (storageError) {
      throw new Error('Failed to save configuration to storage');
    }
    
  } catch (error) {
    throw new Error(error && typeof error.message === 'string' ? error.message : 'Configuration save failed');
  }
}

// Utility functions with enhanced validation
function isValidManifestUrl(url) {
  try {
    if (!url || typeof url !== 'string' || url.length > CONFIG.MAX_URL_LENGTH) {
      return false;
    }
    
    const parsed = new URL(url);
    
    // Validate protocol
    if (!['https:', 'data:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Additional validation for data URLs
    if (parsed.protocol === 'data:') {
      // Block dangerous data URL types
      if (url.includes('text/html') || url.includes('javascript:')) {
        return false;
      }
    }
    
    return true;
  } catch {
    return false;
  }
}

function isValidAssetUrl(url) {
  try {
    if (!url || typeof url !== 'string' || url.length > CONFIG.MAX_URL_LENGTH) {
      return false;
    }
    
    const parsed = new URL(url);
    
    // Validate protocol
    if (!['https:', 'http:', 'data:', 'blob:'].includes(parsed.protocol)) {
      return false;
    }
    
    // Block dangerous URLs
    if (url.includes('javascript:') || url.includes('data:text/html')) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
}

async function hashString(str) {
  try {
    if (!str || typeof str !== 'string' || str.length > CONFIG.MAX_URL_LENGTH) {
      return 'default';
    }
    
    // Create a simple hash for cache keys to prevent collision attacks
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  } catch {
    return 'default';
  }
}

// Extension install/update handlers
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Extension installed
  } else if (details.reason === 'update') {
    // Extension updated
  }
});

// Clean up old cache entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of manifestCache.entries()) {
    if (now - value.timestamp > CONFIG.CACHE_TTL) {
      manifestCache.delete(key);
    }
  }
}, CONFIG.CACHE_TTL);
