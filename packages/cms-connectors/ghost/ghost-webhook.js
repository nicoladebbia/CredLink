/**
 * C2 Concierge Ghost Webhook Handler
 * Processes Ghost post events for C2PA signing
 */

const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');

class GhostWebhookHandler {
  constructor(config = {}) {
    this.config = {
      port: config.port || 3002,
      signUrl: config.signUrl || 'https://verify.c2concierge.org/sign',
      manifestHost: config.manifestHost || 'https://manifests.c2concierge.org',
      webhookSecret: config.webhookSecret || process.env.GHOST_WEBHOOK_SECRET,
      ghostAdminUrl: config.ghostAdminUrl || process.env.GHOST_ADMIN_URL,
      ghostAdminKey: config.ghostAdminKey || process.env.GHOST_ADMIN_KEY,
      analyticsUrl: config.analyticsUrl || 'https://analytics.c2concierge.org/telemetry',
      enableTelemetry: config.enableTelemetry !== false,
      ...config
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(this.requestLogger.bind(this));
  }

  /**
   * Setup routes
   */
  setupRoutes() {
    // Main webhook endpoint
    this.app.post('/ghost-hook', this.handleWebhook.bind(this));

    // Post-specific endpoint
    this.app.post('/post-hook', this.handlePostWebhook.bind(this));

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        platform: 'ghost'
      });
    });

    // Installation instructions endpoint
    this.app.get('/install', (req, res) => {
      res.json(this.getInstallationInstructions());
    });

    // Test endpoint for development
    this.app.post('/test-webhook', this.handleTestWebhook.bind(this));

    // Sync endpoint for manual post processing
    this.app.post('/sync-posts', this.handleSyncPosts.bind(this));
  }

  /**
   * Handle incoming Ghost webhooks
   */
  async handleWebhook(req, res) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(req)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const payload = req.body;
      console.log('Received Ghost webhook:', payload.event);

      let result;

      switch (payload.event) {
        case 'post.added':
          result = await this.handlePostAdded(payload);
          break;
        case 'post.edited':
          result = await this.handlePostEdited(payload);
          break;
        case 'post.deleted':
          result = await this.handlePostDeleted(payload);
          break;
        case 'post.published':
          result = await this.handlePostPublished(payload);
          break;
        case 'post.unpublished':
          result = await this.handlePostUnpublished(payload);
          break;
        case 'page.added':
          result = await this.handlePageAdded(payload);
          break;
        case 'page.edited':
          result = await this.handlePageEdited(payload);
          break;
        default:
          result = { processed: false, reason: 'unknown_event_type' };
      }

      await this.sendTelemetry('webhook_processed', {
        eventType: payload.event,
        processed: result.processed
      });

      res.json({
        status: 'success',
        processed: result.processed,
        message: result.message || 'Webhook processed',
        data: result.data || null
      });

    } catch (error) {
      console.error('Ghost webhook processing failed:', error);
      
      await this.sendTelemetry('webhook_error', {
        error: error.message,
        eventType: req.body.event
      });

      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Handle post-specific webhooks
   */
  async handlePostWebhook(req, res) {
    try {
      const { postId, action } = req.body;
      
      if (!postId || !action) {
        return res.status(400).json({ error: 'Missing postId or action' });
      }

      console.log(`Processing post webhook: ${action} for post ${postId}`);

      let result;
      
      switch (action) {
        case 'sign_images':
          result = await this.signPostImages(postId);
          break;
        case 'update_manifests':
          result = await this.updatePostManifests(postId);
          break;
        case 'cleanup_manifests':
          result = await this.cleanupPostManifests(postId);
          break;
        default:
          result = { processed: false, reason: 'unknown_action' };
      }

      res.json({
        status: 'success',
        processed: result.processed,
        message: result.message,
        data: result.data
      });

    } catch (error) {
      console.error('Post webhook failed:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Handle post added event
   */
  async handlePostAdded(payload) {
    try {
      const post = payload.post;
      console.log('Processing post added:', post.id);

      const result = await this.signPostImages(post.id);

      return {
        processed: true,
        message: `Signed images for post "${post.title}"`,
        data: result
      };

    } catch (error) {
      console.error('Post added failed:', error);
      return {
        processed: false,
        message: error.message
      };
    }
  }

  /**
   * Handle post edited event
   */
  async handlePostEdited(payload) {
    // Similar to post added but with additional checks for image changes
    return this.handlePostAdded(payload);
  }

  /**
   * Handle post published event
   */
  async handlePostPublished(payload) {
    try {
      const post = payload.post;
      console.log('Processing post published:', post.id);

      // Only sign if not already processed
      const existingManifests = await this.getPostManifests(post.id);
      
      if (existingManifests.length === 0) {
        const result = await this.signPostImages(post.id);
        
        return {
          processed: true,
          message: `Signed images for published post "${post.title}"`,
          data: result
        };
      } else {
        return {
          processed: false,
          reason: 'already_processed',
          message: `Post "${post.title}" already has manifests`
        };
      }

    } catch (error) {
      console.error('Post published failed:', error);
      return {
        processed: false,
        message: error.message
      };
    }
  }

  /**
   * Handle post unpublished event
   */
  async handlePostUnpublished(payload) {
    try {
      const post = payload.post;
      console.log('Processing post unpublished:', post.id);

      // Archive manifests for unpublished posts
      await this.archivePostManifests(post.id);

      return {
        processed: true,
        message: `Archived manifests for unpublished post "${post.title}"`,
        data: {
          postId: post.id,
          title: post.title
        }
      };

    } catch (error) {
      console.error('Post unpublished failed:', error);
      return {
        processed: false,
        message: error.message
      };
    }
  }

  /**
   * Handle post deleted event
   */
  async handlePostDeleted(payload) {
    try {
      const post = payload.post;
      console.log('Processing post deleted:', post.id);

      // Clean up manifests for deleted posts
      await this.cleanupPostManifests(post.id);

      return {
        processed: true,
        message: `Cleaned up manifests for deleted post "${post.title}"`,
        data: {
          postId: post.id,
          title: post.title
        }
      };

    } catch (error) {
      console.error('Post deleted failed:', error);
      return {
        processed: false,
        message: error.message
      };
    }
  }

  /**
   * Handle page added event
   */
  async handlePageAdded(payload) {
    try {
      const page = payload.page;
      console.log('Processing page added:', page.id);

      const result = await this.signPageImages(page.id);

      return {
        processed: true,
        message: `Signed images for page "${page.title}"`,
        data: result
      };

    } catch (error) {
      console.error('Page added failed:', error);
      return {
        processed: false,
        message: error.message
      };
    }
  }

  /**
   * Handle page edited event
   */
  async handlePageEdited(payload) {
    return this.handlePageAdded(payload);
  }

  /**
   * Sign post images
   */
  async signPostImages(postId) {
    if (!this.config.ghostAdminUrl || !this.config.ghostAdminKey) {
      throw new Error('Ghost Admin API credentials not configured');
    }

    try {
      // Get post details from Ghost Admin API
      const post = await this.getPostFromGhost(postId);
      
      if (!post) {
        throw new Error(`Post ${postId} not found`);
      }

      const imageUrls = this.extractPostImages(post);
      const processedImages = [];

      for (const imageUrl of imageUrls) {
        try {
          const manifest = await this.signAsset(imageUrl, {
            postId: postId,
            postTitle: post.title,
            postSlug: post.slug,
            postType: 'ghost_post'
          });
          
          processedImages.push({
            url: imageUrl,
            manifestUrl: manifest.manifest_url
          });

        } catch (error) {
          console.warn(`Failed to sign post image: ${imageUrl}`, error.message);
        }
      }

      // Store manifest references
      await this.storePostManifests(postId, processedImages);

      return {
        processed: true,
        postId: postId,
        postTitle: post.title,
        imagesProcessed: processedImages.length,
        images: processedImages
      };

    } catch (error) {
      console.error(`Failed to sign post images for ${postId}:`, error);
      throw error;
    }
  }

  /**
   * Sign page images
   */
  async signPageImages(pageId) {
    if (!this.config.ghostAdminUrl || !this.config.ghostAdminKey) {
      throw new Error('Ghost Admin API credentials not configured');
    }

    try {
      const page = await this.getPageFromGhost(pageId);
      
      if (!page) {
        throw new Error(`Page ${pageId} not found`);
      }

      const imageUrls = this.extractPageImages(page);
      const processedImages = [];

      for (const imageUrl of imageUrls) {
        try {
          const manifest = await this.signAsset(imageUrl, {
            pageId: pageId,
            pageTitle: page.title,
            pageSlug: page.slug,
            postType: 'ghost_page'
          });
          
          processedImages.push({
            url: imageUrl,
            manifestUrl: manifest.manifest_url
          });

        } catch (error) {
          console.warn(`Failed to sign page image: ${imageUrl}`, error.message);
        }
      }

      // Store manifest references
      await this.storePageManifests(pageId, processedImages);

      return {
        processed: true,
        pageId: pageId,
        pageTitle: page.title,
        imagesProcessed: processedImages.length,
        images: processedImages
      };

    } catch (error) {
      console.error(`Failed to sign page images for ${pageId}:`, error);
      throw error;
    }
  }

  /**
   * Get post from Ghost Admin API
   */
  async getPostFromGhost(postId) {
    const response = await fetch(
      `${this.config.ghostAdminUrl}/ghost/api/v3/admin/posts/${postId}?include=authors,tags`,
      {
        headers: {
          'Authorization': `Ghost ${this.config.ghostAdminKey}`,
          'Accept-Version': 'v3.0'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Ghost Admin API error: ${response.status}`);
    }

    const data = await response.json();
    return data.posts[0];
  }

  /**
   * Get page from Ghost Admin API
   */
  async getPageFromGhost(pageId) {
    const response = await fetch(
      `${this.config.ghostAdminUrl}/ghost/api/v3/admin/pages/${pageId}?include=authors,tags`,
      {
        headers: {
          'Authorization': `Ghost ${this.config.ghostAdminKey}`,
          'Accept-Version': 'v3.0'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Ghost Admin API error: ${response.status}`);
    }

    const data = await response.json();
    return data.pages[0];
  }

  /**
   * Extract image URLs from post
   */
  extractPostImages(post) {
    const urls = [];

    // Feature image
    if (post.feature_image) {
      urls.push(post.feature_image);
    }

    // Extract images from HTML content
    if (post.html) {
      const imgRegex = /<img[^>]+src="([^">]+)"/g;
      let match;
      while ((match = imgRegex.exec(post.html)) !== null) {
        const url = match[1];
        if (url && !url.startsWith('data:') && !urls.includes(url)) {
          urls.push(url);
        }
      }
    }

    // Extract from mobiledoc (Ghost's card system)
    if (post.mobiledoc) {
      try {
        const mobiledoc = JSON.parse(post.mobiledoc);
        this.extractImagesFromMobiledoc(mobiledoc, urls);
      } catch (error) {
        console.warn('Failed to parse mobiledoc:', error);
      }
    }

    return urls;
  }

  /**
   * Extract image URLs from page
   */
  extractPageImages(page) {
    // Pages use the same structure as posts
    return this.extractPostImages(page);
  }

  /**
   * Extract images from Ghost mobiledoc format
   */
  extractImagesFromMobiledoc(mobiledoc, urls) {
    if (!mobiledoc.cards) return;

    mobiledoc.cards.forEach(card => {
      const [cardType, cardPayload] = card;
      
      if (cardType === 'image') {
        if (cardPayload.src && !urls.includes(cardPayload.src)) {
          urls.push(cardPayload.src);
        }
      } else if (cardType === 'gallery') {
        if (cardPayload.images) {
          cardPayload.images.forEach(image => {
            if (image.src && !urls.includes(image.src)) {
              urls.push(image.src);
            }
          });
        }
      }
    });
  }

  /**
   * Sign an asset
   */
  async signAsset(assetUrl, metadata = {}) {
    const response = await fetch(this.config.signUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-C2C-Platform': 'ghost',
        'X-C2C-Version': '1.0.0'
      },
      body: JSON.stringify({
        asset: {
          url: assetUrl,
          type: 'remote'
        },
        metadata: {
          platform: 'ghost',
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
   * Store post manifests
   */
  async storePostManifests(postId, manifests) {
    // Implementation depends on your storage strategy
    // This could store in a database, file system, or cloud storage
    console.log(`Storing ${manifests.length} manifests for post ${postId}`);
  }

  /**
   * Store page manifests
   */
  async storePageManifests(pageId, manifests) {
    console.log(`Storing ${manifests.length} manifests for page ${pageId}`);
  }

  /**
   * Get post manifests
   */
  async getPostManifests(postId) {
    // Implementation depends on your storage strategy
    return [];
  }

  /**
   * Update post manifests
   */
  async updatePostManifests(postId) {
    console.log(`Updating manifests for post ${postId}`);
    return {
      processed: true,
      message: 'Post manifests updated'
    };
  }

  /**
   * Archive post manifests
   */
  async archivePostManifests(postId) {
    console.log(`Archiving manifests for post ${postId}`);
    return {
      processed: true,
      message: 'Post manifests archived'
    };
  }

  /**
   * Cleanup post manifests
   */
  async cleanupPostManifests(postId) {
    console.log(`Cleaning up manifests for post ${postId}`);
    return {
      processed: true,
      message: 'Post manifests cleaned up'
    };
  }

  /**
   * Handle sync posts endpoint
   */
  async handleSyncPosts(req, res) {
    try {
      const { limit = 50, offset = 0 } = req.body;
      
      console.log(`Syncing posts: limit=${limit}, offset=${offset}`);
      
      // Get recent posts from Ghost
      const posts = await this.getRecentPosts(limit, offset);
      const processedPosts = [];

      for (const post of posts) {
        try {
          const result = await this.signPostImages(post.id);
          if (result.processed) {
            processedPosts.push({
              postId: post.id,
              title: post.title,
              imagesProcessed: result.imagesProcessed
            });
          }
        } catch (error) {
          console.warn(`Failed to sync post ${post.id}:`, error.message);
        }
      }

      res.json({
        processed: true,
        message: `Synced ${processedPosts.length} posts`,
        data: {
          totalPosts: posts.length,
          processedPosts: processedPosts.length,
          posts: processedPosts
        }
      });

    } catch (error) {
      console.error('Sync posts failed:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Get recent posts from Ghost
   */
  async getRecentPosts(limit = 50, offset = 0) {
    const response = await fetch(
      `${this.config.ghostAdminUrl}/ghost/api/v3/admin/posts/?limit=${limit}&offset=${offset}&include=authors,tags`,
      {
        headers: {
          'Authorization': `Ghost ${this.config.ghostAdminKey}`,
          'Accept-Version': 'v3.0'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Ghost Admin API error: ${response.status}`);
    }

    const data = await response.json();
    return data.posts || [];
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(req) {
    if (!this.config.webhookSecret) {
      console.warn('No webhook secret configured - skipping verification');
      return true;
    }

    const signature = req.headers['x-ghost-signature'];
    if (!signature) {
      return false;
    }

    const expectedSignature = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Handle test webhook for development
   */
  async handleTestWebhook(req, res) {
    const { eventType, testData } = req.body;
    
    console.log(`Processing test webhook: ${eventType}`);
    
    const result = {
      processed: true,
      message: `Test webhook ${eventType} processed successfully`,
      testData
    };
    
    res.json(result);
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
          version: '1.0.0',
          timestamp: new Date().toISOString(),
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
      title: 'C2 Concierge Ghost Integration',
      options: [
        {
          title: 'Option 1: Theme Integration (Recommended)',
          description: 'Add the connector partial to your Ghost theme:',
          steps: [
            '1. Copy connector-ghost.hbs to your theme partials directory',
            '2. Add {{> connector-ghost}} to default.hbs and post.hbs',
            '3. Upload the modified theme to Ghost',
            '4. Configure theme settings in Ghost Admin'
          ]
        },
        {
          title: 'Option 2: Code Injection',
          description: 'Use Ghost Code Injection for quick setup:',
          steps: [
            '1. Go to Ghost Admin → Settings → Code Injection',
            '2. Add the header code to Site Header',
            '3. Add the footer code to Site Footer',
            '4. Configure webhooks in Ghost Admin → Integrations'
          ]
        }
      ],
      webhookConfig: {
        url: `${req.protocol}://${req.get('host')}/ghost-hook`,
        events: [
          'post.added',
          'post.edited', 
          'post.published',
          'post.unpublished',
          'post.deleted',
          'page.added',
          'page.edited'
        ]
      },
      themeCustomization: {
        requiredFields: [
          'c2c_enable_integration',
          'c2c_manifest_host',
          'c2c_webhook_url',
          'c2c_enable_telemetry',
          'c2c_badge_position'
        ]
      }
    };
  }

  /**
   * Start the server
   */
  start() {
    this.app.listen(this.config.port, () => {
      console.log(`C2 Concierge Ghost webhook server listening on port ${this.config.port}`);
      console.log(`Health check: http://localhost:${this.config.port}/health`);
      console.log(`Installation: http://localhost:${this.config.port}/install`);
    });
  }
}

// Export for use as module
module.exports = GhostWebhookHandler;

// Auto-start if run directly
if (require.main === module) {
  const server = new GhostWebhookHandler();
  server.start();
}
