/**
 * C2 Concierge Webflow Webhook Server
 * Handles Webflow publish events and signs assets
 */

import express from 'express';
import crypto from 'crypto';
import fetch from 'node-fetch';

class WebflowWebhookServer {
  constructor(config = {}) {
    this.config = {
      port: config.port || 3000,
      signUrl: config.signUrl || 'https://verify.c2concierge.org/sign',
      manifestHost: config.manifestHost || 'https://manifests.c2concierge.org',
      webhookSecret: config.webhookSecret || process.env.WEBFLOW_WEBHOOK_SECRET,
      webflowApiKey: config.webflowApiKey || process.env.WEBFLOW_API_KEY,
      webflowSiteId: config.webflowSiteId || process.env.WEBFLOW_SITE_ID,
      analyticsUrl: config.analyticsUrl || 'https://analytics.c2concierge.org/telemetry',
      enableTelemetry: config.enableTelemetry !== false,
      timeout: config.timeout || 30000,
      retryAttempts: config.retryAttempts || 3,
      retryDelay: config.retryDelay || 1000,
      maxPayloadSize: config.maxPayloadSize || '10mb',
      rateLimitWindow: config.rateLimitWindow || 60000,
      rateLimitMax: config.rateLimitMax || 100,
      ...config
    };

    this.app = express();
    this.rateLimitStore = new Map();
    this.validateConfig();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * CRITICAL: Validate configuration on initialization
   */
  validateConfig() {
    if (!this.config.webhookSecret) {
      throw new Error('webhookSecret is required for security');
    }
    
    if (typeof this.config.port !== 'number' || this.config.port < 1 || this.config.port > 65535) {
      throw new Error('Invalid port: must be between 1 and 65535');
    }
    
    const requiredUrls = ['signUrl', 'manifestHost', 'analyticsUrl'];
    for (const urlKey of requiredUrls) {
      if (!this.config[urlKey] || !this.isValidUrl(this.config[urlKey])) {
        throw new Error(`Invalid ${urlKey}: must be valid HTTPS URL`);
      }
    }
    
    if (typeof this.config.timeout !== 'number' || this.config.timeout <= 0) {
      throw new Error('Invalid timeout: must be positive number');
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
   * Setup Express middleware with enhanced security
   */
  setupMiddleware() {
    this.app.use(express.json({ 
      limit: this.config.maxPayloadSize,
      strict: true
    }));
    
    this.app.use(this.rateLimitMiddleware.bind(this));
    this.app.use(this.requestLogger.bind(this));
    this.app.use(this.securityHeaders.bind(this));
  }

  /**
   * CRITICAL: Rate limiting middleware
   */
  rateLimitMiddleware(req, res, next) {
    const clientId = req.ip || req.connection.remoteAddress || 'unknown';
    const now = Date.now();
    const windowStart = now - this.config.rateLimitWindow;
    
    if (!this.rateLimitStore.has(clientId)) {
      this.rateLimitStore.set(clientId, []);
    }
    
    const requests = this.rateLimitStore.get(clientId);
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    
    if (validRequests.length >= this.config.rateLimitMax) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(this.config.rateLimitWindow / 1000)
      });
    }
    
    validRequests.push(now);
    this.rateLimitStore.set(clientId, validRequests);
    
    res.setHeader('X-RateLimit-Limit', this.config.rateLimitMax);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, this.config.rateLimitMax - validRequests.length));
    res.setHeader('X-RateLimit-Reset', Math.floor((windowStart + this.config.rateLimitWindow) / 1000));
    
    next();
  }

  /**
   * CRITICAL: Security headers middleware
   */
  securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Content-Security-Policy', "default-src 'self'");
    
    next();
  }

  /**
   * Setup routes with enhanced security
   */
  setupRoutes() {
    // Main webhook endpoint
    this.app.post('/webflow-hook', this.handleWebhook.bind(this));

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        platform: 'webflow',
        uptime: process.uptime(),
        memory: process.memoryUsage()
      });
    });

    // Installation instructions endpoint
    this.app.get('/install', (req, res) => {
      try {
        res.json(this.getInstallationInstructions());
      } catch (error) {
        res.status(500).json({ error: 'Failed to get installation instructions' });
      }
    });
  }

  /**
   * Handle incoming Webflow webhooks
   */
  async handleWebhook(req, res) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(req)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const payload = req.body;
      console.log('Received Webflow webhook:', payload.event);

      let result;

      switch (payload.event) {
        case 'site_publish':
          result = await this.handleSitePublish(payload);
          break;
        case 'cms_item_publish':
          result = await this.handleCmsItemPublish(payload);
          break;
        case 'cms_item_unpublish':
          result = await this.handleCmsItemUnpublish(payload);
          break;
        case 'form_submission':
          // Ignore form submissions
          result = { processed: false, reason: 'form_submission_ignored' };
          break;
        default:
          result = { processed: false, reason: 'unknown_event' };
      }

      await this.sendTelemetry('webhook_processed', {
        event: payload.event,
        processed: result.processed,
        siteId: this.config.webflowSiteId
      });

      res.json({
        status: 'success',
        processed: result.processed,
        message: result.message || 'Webhook processed',
        data: result.data || null
      });

    } catch (error) {
      console.error('Webhook processing failed:', error);
      
      await this.sendTelemetry('webhook_error', {
        error: error.message,
        siteId: this.config.webflowSiteId
      });

      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * CRITICAL: Verify webhook signature with strict security
   */
  verifyWebhookSignature(req) {
    // CRITICAL: Reject all requests if webhook secret is not configured
    if (!this.config.webhookSecret) {
      console.error('CRITICAL: Webhook secret not configured - rejecting request');
      return false;
    }

    const signature = req.headers['x-webflow-signature'];
    if (!signature) {
      console.error('CRITICAL: Missing webhook signature header');
      return false;
    }

    // CRITICAL: Validate signature format
    if (typeof signature !== 'string' || signature.length !== 64) {
      console.error('CRITICAL: Invalid signature format');
      return false;
    }

    try {
      const expectedSignature = crypto
        .createHmac('sha256', this.config.webhookSecret)
        .update(JSON.stringify(req.body))
        .digest('hex');

      // CRITICAL: Use timing-safe comparison to prevent timing attacks
      return crypto.timingSafeEqual(
        Buffer.from(signature, 'hex'),
        Buffer.from(expectedSignature, 'hex')
      );
    } catch (error) {
      console.error('CRITICAL: Signature verification failed', error);
      return false;
    }
  }

  /**
   * Handle site publish event
   */
  async handleSitePublish(payload) {
    try {
      const siteUrl = payload.site || payload.siteUrl;
      if (!siteUrl) {
        throw new Error('No site URL in payload');
      }

      console.log('Processing site publish for:', siteUrl);

      // Get site pages and assets
      const pages = await this.getSitePages();
      const processedAssets = [];

      for (const page of pages) {
        const pageAssets = await this.processPageAssets(page);
        processedAssets.push(...pageAssets);
      }

      return {
        processed: true,
        message: `Processed ${processedAssets.length} assets from ${pages.length} pages`,
        data: {
          pagesProcessed: pages.length,
          assetsProcessed: processedAssets.length,
          assets: processedAssets
        }
      };

    } catch (error) {
      console.error('Site publish failed:', error);
      return {
        processed: false,
        message: error.message
      };
    }
  }

  /**
   * Handle CMS item publish event
   */
  async handleCmsItemPublish(payload) {
    try {
      const cmsItem = payload.cmsItem;
      if (!cmsItem) {
        throw new Error('No CMS item in payload');
      }

      console.log('Processing CMS item:', cmsItem._id, cmsItem.name);

      const assets = await this.processCmsItemAssets(cmsItem);

      return {
        processed: true,
        message: `Processed ${assets.length} assets for CMS item ${cmsItem.name}`,
        data: {
          itemId: cmsItem._id,
          itemName: cmsItem.name,
          assetsProcessed: assets.length,
          assets: assets
        }
      };

    } catch (error) {
      console.error('CMS item publish failed:', error);
      return {
        processed: false,
        message: error.message
      };
    }
  }

  /**
   * Handle CMS item unpublish event
   */
  async handleCmsItemUnpublish(payload) {
    try {
      const cmsItem = payload.cmsItem;
      if (!cmsItem) {
        throw new Error('No CMS item in payload');
      }

      console.log('Processing CMS item unpublish:', cmsItem._id);

      // Clean up manifests for unpublished items
      await this.cleanupCmsItemManifests(cmsItem);

      return {
        processed: true,
        message: `Cleaned up manifests for CMS item ${cmsItem.name}`,
        data: {
          itemId: cmsItem._id,
          itemName: cmsItem.name
        }
      };

    } catch (error) {
      console.error('CMS item unpublish failed:', error);
      return {
        processed: false,
        message: error.message
      };
    }
  }

  /**
   * Get site pages from Webflow API
   */
  async getSitePages() {
    if (!this.config.webflowApiKey || !this.config.webflowSiteId) {
      throw new Error('Webflow API credentials not configured');
    }

    const response = await fetch(
      `https://api.webflow.com/v2/sites/${this.config.webflowSiteId}/pages`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.webflowApiKey}`,
          'Accept-Version': '2.0.0'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Webflow API error: ${response.status}`);
    }

    const data = await response.json();
    return data.pages || [];
  }

  /**
   * Process assets for a page
   */
  async processPageAssets(page) {
    const assets = [];
    
    try {
      // Get page HTML to extract images
      const pageHtml = await this.getPageHtml(page._id);
      const imageUrls = this.extractImageUrls(pageHtml);

      for (const imageUrl of imageUrls) {
        try {
          const manifest = await this.signAsset(imageUrl, {
            pageId: page._id,
            pageName: page.name,
            pageUrl: page.url
          });
          
          assets.push({
            url: imageUrl,
            manifestUrl: manifest.manifest_url,
            pageId: page._id
          });
        } catch (error) {
          console.warn('Failed to sign asset:', imageUrl, error.message);
        }
      }

    } catch (error) {
      console.error('Failed to process page assets:', page._id, error);
    }

    return assets;
  }

  /**
   * Process assets for a CMS item
   */
  async processCmsItemAssets(cmsItem) {
    const assets = [];

    try {
      // Extract image URLs from CMS item fields
      const imageUrls = this.extractCmsItemImages(cmsItem);

      for (const imageUrl of imageUrls) {
        try {
          const manifest = await this.signAsset(imageUrl, {
            itemId: cmsItem._id,
            itemName: cmsItem.name,
            itemType: cmsItem._cid
          });
          
          assets.push({
            url: imageUrl,
            manifestUrl: manifest.manifest_url,
            itemId: cmsItem._id
          });
        } catch (error) {
          console.warn('Failed to sign CMS asset:', imageUrl, error.message);
        }
      }

    } catch (error) {
      console.error('Failed to process CMS item assets:', cmsItem._id, error);
    }

    return assets;
  }

  /**
   * Get page HTML
   */
  async getPageHtml(pageId) {
    const response = await fetch(
      `https://api.webflow.com/v2/sites/${this.config.webflowSiteId}/pages/${pageId}/html`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.webflowApiKey}`,
          'Accept-Version': '2.0.0'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Failed to get page HTML: ${response.status}`);
    }

    const data = await response.json();
    return data.html || '';
  }

  /**
   * Extract image URLs from HTML
   */
  extractImageUrls(html) {
    const urls = [];
    const imgRegex = /<img[^>]+src="([^">]+)"/g;
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
      const url = match[1];
      if (url && !url.startsWith('data:') && !urls.includes(url)) {
        urls.push(url);
      }
    }

    return urls;
  }

  /**
   * Extract images from CMS item
   */
  extractCmsItemImages(cmsItem) {
    const urls = [];

    // Check for image fields in the CMS item
    for (const [key, value] of Object.entries(cmsItem)) {
      if (typeof value === 'object' && value.url) {
        // Image field with URL
        if (value.url && !urls.includes(value.url)) {
          urls.push(value.url);
        }
      } else if (typeof value === 'string' && value.startsWith('https://')) {
        // URL field that might be an image
        if (value.match(/\.(jpg|jpeg|png|gif|webp)$/i)) {
          if (!urls.includes(value)) {
            urls.push(value);
          }
        }
      }
    }

    return urls;
  }

  /**
   * Sign an asset
   */
  async signAsset(assetUrl, metadata = {}) {
    const response = await fetch(this.config.signUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-C2C-Platform': 'webflow',
        'X-C2C-Version': '1.0.0'
      },
      body: JSON.stringify({
        asset: {
          url: assetUrl,
          type: 'remote'
        },
        metadata: {
          platform: 'webflow',
          timestamp: new Date().toISOString(),
          remoteOnly: true,
          ...metadata
        }
      })
    });

    if (!response.ok) {
      throw new Error(`Signing failed: ${response.status} ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Clean up manifests for unpublished CMS item
   */
  async cleanupCmsItemManifests(cmsItem) {
    // Implementation depends on your manifest storage
    // This would typically delete or archive manifests
    console.log('Cleaning up manifests for CMS item:', cmsItem._id);
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
          platform: 'webflow',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          siteId: this.config.webflowSiteId,
          ...data
        })
      });
    } catch (error) {
      console.warn('Telemetry failed:', error.message);
    }
  }

  /**
   * Request logger middleware
   */
  requestLogger(req, res, next) {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
    next();
  }

  /**
   * Get installation instructions
   */
  getInstallationInstructions() {
    return {
      title: 'C2 Concierge Webflow Integration',
      steps: [
        {
          title: '1. Add Head Code',
          description: 'Copy this code into Webflow Project Settings → Custom Code → Head:',
          code: `<script src="https://cdn.c2concierge.org/webflow-connector.js" async></script>`
        },
        {
          title: '2. Configure Webhooks',
          description: 'In Webflow Project Settings → Webhooks, add a webhook pointing to:',
          code: `${req.protocol}://${req.get('host')}/webflow-hook`
        },
        {
          title: '3. Enable Badge',
          description: 'Add data-c2pa-signed attribute to images that should show the verification badge',
          code: `<img src="your-image.jpg" data-c2pa-signed="true">`
        }
      ],
      webhookEvents: ['site_publish', 'cms_item_publish', 'cms_item_unpublish']
    };
  }

  /**
   * Start the server
   */
  start() {
    this.app.listen(this.config.port, () => {
      console.log(`C2 Concierge Webflow webhook server listening on port ${this.config.port}`);
      console.log(`Health check: http://localhost:${this.config.port}/health`);
      console.log(`Installation: http://localhost:${this.config.port}/install`);
    });
  }
}

// Export for use as module
export default WebflowWebhookServer;

// Auto-start if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new WebflowWebhookServer();
  server.start();
}
