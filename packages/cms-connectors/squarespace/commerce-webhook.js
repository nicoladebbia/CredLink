/**
 * C2 Concierge Squarespace Commerce Webhook Handler
 * Processes Squarespace commerce events for C2PA signing
 */

const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');

class SquarespaceCommerceWebhook {
  constructor(config = {}) {
    this.config = {
      port: config.port || 3001,
      signUrl: config.signUrl || 'https://verify.c2concierge.org/sign',
      manifestHost: config.manifestHost || 'https://manifests.c2concierge.org',
      webhookSecret: config.webhookSecret || process.env.SQUARESPACE_WEBHOOK_SECRET,
      squarespaceApiKey: config.squarespaceApiKey || process.env.SQUARESPACE_API_KEY,
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
    this.app.post('/squarespace-hook', this.handleWebhook.bind(this));

    // Product-specific endpoint
    this.app.post('/product-hook', this.handleProductWebhook.bind(this));

    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({ 
        status: 'healthy', 
        timestamp: new Date().toISOString(),
        platform: 'squarespace'
      });
    });

    // Installation instructions endpoint
    this.app.get('/install', (req, res) => {
      res.json(this.getInstallationInstructions());
    });

    // Test endpoint for development
    this.app.post('/test-webhook', this.handleTestWebhook.bind(this));
  }

  /**
   * Handle incoming Squarespace webhooks
   */
  async handleWebhook(req, res) {
    try {
      // Verify webhook signature
      if (!this.verifyWebhookSignature(req)) {
        return res.status(401).json({ error: 'Invalid signature' });
      }

      const payload = req.body;
      console.log('Received Squarespace webhook:', payload.type);

      let result;

      switch (payload.type) {
        case 'order.created':
          result = await this.handleOrderCreated(payload);
          break;
        case 'order.updated':
          result = await this.handleOrderUpdated(payload);
          break;
        case 'product.created':
          result = await this.handleProductCreated(payload);
          break;
        case 'product.updated':
          result = await this.handleProductUpdated(payload);
          break;
        case 'variant.created':
          result = await this.handleVariantCreated(payload);
          break;
        case 'variant.updated':
          result = await this.handleVariantUpdated(payload);
          break;
        default:
          result = { processed: false, reason: 'unknown_event_type' };
      }

      await this.sendTelemetry('webhook_processed', {
        eventType: payload.type,
        processed: result.processed
      });

      res.json({
        status: 'success',
        processed: result.processed,
        message: result.message || 'Webhook processed',
        data: result.data || null
      });

    } catch (error) {
      console.error('Squarespace webhook processing failed:', error);
      
      await this.sendTelemetry('webhook_error', {
        error: error.message,
        eventType: req.body.type
      });

      res.status(500).json({
        error: 'Internal server error',
        message: error.message
      });
    }
  }

  /**
   * Handle product-specific webhooks
   */
  async handleProductWebhook(req, res) {
    try {
      const { productId, action } = req.body;
      
      if (!productId || !action) {
        return res.status(400).json({ error: 'Missing productId or action' });
      }

      console.log(`Processing product webhook: ${action} for product ${productId}`);

      let result;
      
      switch (action) {
        case 'sign_images':
          result = await this.signProductImages(productId);
          break;
        case 'update_manifests':
          result = await this.updateProductManifests(productId);
          break;
        case 'cleanup_manifests':
          result = await this.cleanupProductManifests(productId);
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
      console.error('Product webhook failed:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * Handle order created event
   */
  async handleOrderCreated(payload) {
    try {
      const order = payload.data;
      console.log('Processing order created:', order.id);

      // Process product images in the order
      const processedProducts = [];
      
      if (order.lineItems && Array.isArray(order.lineItems)) {
        for (const lineItem of order.lineItems) {
          if (lineItem.productId) {
            const productResult = await this.signProductImages(lineItem.productId);
            if (productResult.processed) {
              processedProducts.push({
                productId: lineItem.productId,
                imagesProcessed: productResult.imagesProcessed
              });
            }
          }
        }
      }

      return {
        processed: true,
        message: `Processed ${processedProducts.length} products in order`,
        data: {
          orderId: order.id,
          processedProducts
        }
      };

    } catch (error) {
      console.error('Order created failed:', error);
      return {
        processed: false,
        message: error.message
      };
    }
  }

  /**
   * Handle product created event
   */
  async handleProductCreated(payload) {
    try {
      const product = payload.data;
      console.log('Processing product created:', product.id);

      const result = await this.signProductImages(product.id);

      return {
        processed: true,
        message: `Signed images for product ${product.name || product.id}`,
        data: result
      };

    } catch (error) {
      console.error('Product created failed:', error);
      return {
        processed: false,
        message: error.message
      };
    }
  }

  /**
   * Handle product updated event
   */
  async handleProductUpdated(payload) {
    // Similar to product created but with additional checks
    return this.handleProductCreated(payload);
  }

  /**
   * Handle variant created event
   */
  async handleVariantCreated(payload) {
    try {
      const variant = payload.data;
      console.log('Processing variant created:', variant.id);

      const result = await this.signVariantImages(variant.id, variant.productId);

      return {
        processed: true,
        message: `Signed images for variant ${variant.id}`,
        data: result
      };

    } catch (error) {
      console.error('Variant created failed:', error);
      return {
        processed: false,
        message: error.message
      };
    }
  }

  /**
   * Handle variant updated event
   */
  async handleVariantUpdated(payload) {
    return this.handleVariantCreated(payload);
  }

  /**
   * Handle order updated event
   */
  async handleOrderUpdated(payload) {
    // Usually no processing needed for order updates
    return {
      processed: false,
      reason: 'order_update_ignored'
    };
  }

  /**
   * Sign product images
   */
  async signProductImages(productId) {
    if (!this.config.squarespaceApiKey) {
      throw new Error('Squarespace API key not configured');
    }

    try {
      // Get product details from Squarespace API
      const product = await this.getProductFromSquarespace(productId);
      
      if (!product) {
        throw new Error(`Product ${productId} not found`);
      }

      const imageUrls = this.extractProductImages(product);
      const processedImages = [];

      for (const imageUrl of imageUrls) {
        try {
          const manifest = await this.signAsset(imageUrl, {
            productId: productId,
            productName: product.name,
            productType: 'squarespace_product'
          });
          
          processedImages.push({
            url: imageUrl,
            manifestUrl: manifest.manifest_url
          });

        } catch (error) {
          console.warn(`Failed to sign product image: ${imageUrl}`, error.message);
        }
      }

      return {
        processed: true,
        productId: productId,
        productName: product.name,
        imagesProcessed: processedImages.length,
        images: processedImages
      };

    } catch (error) {
      console.error(`Failed to sign product images for ${productId}:`, error);
      throw error;
    }
  }

  /**
   * Sign variant images
   */
  async signVariantImages(variantId, productId) {
    try {
      const variant = await this.getVariantFromSquarespace(variantId);
      
      if (!variant) {
        throw new Error(`Variant ${variantId} not found`);
      }

      const imageUrls = this.extractVariantImages(variant);
      const processedImages = [];

      for (const imageUrl of imageUrls) {
        try {
          const manifest = await this.signAsset(imageUrl, {
            variantId: variantId,
            productId: productId,
            variantName: variant.name,
            productType: 'squarespace_variant'
          });
          
          processedImages.push({
            url: imageUrl,
            manifestUrl: manifest.manifest_url
          });

        } catch (error) {
          console.warn(`Failed to sign variant image: ${imageUrl}`, error.message);
        }
      }

      return {
        processed: true,
        variantId: variantId,
        productId: productId,
        imagesProcessed: processedImages.length,
        images: processedImages
      };

    } catch (error) {
      console.error(`Failed to sign variant images for ${variantId}:`, error);
      throw error;
    }
  }

  /**
   * Get product from Squarespace API
   */
  async getProductFromSquarespace(productId) {
    const response = await fetch(
      `https://api.squarespace.com/v1/commerce/products/${productId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.squarespaceApiKey}`,
          'User-Agent': 'C2Concierge-Webhook/1.0'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Squarespace API error: ${response.status}`);
    }

    const data = await response.json();
    return data.product;
  }

  /**
   * Get variant from Squarespace API
   */
  async getVariantFromSquarespace(variantId) {
    const response = await fetch(
      `https://api.squarespace.com/v1/commerce/variants/${variantId}`,
      {
        headers: {
          'Authorization': `Bearer ${this.config.squarespaceApiKey}`,
          'User-Agent': 'C2Concierge-Webhook/1.0'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Squarespace API error: ${response.status}`);
    }

    const data = await response.json();
    return data.variant;
  }

  /**
   * Extract image URLs from product
   */
  extractProductImages(product) {
    const urls = [];

    // Main product images
    if (product.images && Array.isArray(product.images)) {
      product.images.forEach(image => {
        if (image.url && !urls.includes(image.url)) {
          urls.push(image.url);
        }
      });
    }

    // Variant images
    if (product.variants && Array.isArray(product.variants)) {
      product.variants.forEach(variant => {
        const variantUrls = this.extractVariantImages(variant);
        variantUrls.forEach(url => {
          if (!urls.includes(url)) {
            urls.push(url);
          }
        });
      });
    }

    return urls;
  }

  /**
   * Extract image URLs from variant
   */
  extractVariantImages(variant) {
    const urls = [];

    if (variant.images && Array.isArray(variant.images)) {
      variant.images.forEach(image => {
        if (image.url && !urls.includes(image.url)) {
          urls.push(image.url);
        }
      });
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
        'X-C2C-Platform': 'squarespace',
        'X-C2C-Version': '1.0.0'
      },
      body: JSON.stringify({
        asset: {
          url: assetUrl,
          type: 'remote'
        },
        metadata: {
          platform: 'squarespace',
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
   * Update product manifests
   */
  async updateProductManifests(productId) {
    console.log(`Updating manifests for product ${productId}`);
    // Implementation depends on your manifest storage strategy
    return {
      processed: true,
      message: 'Product manifests updated'
    };
  }

  /**
   * Cleanup product manifests
   */
  async cleanupProductManifests(productId) {
    console.log(`Cleaning up manifests for product ${productId}`);
    // Implementation depends on your manifest storage strategy
    return {
      processed: true,
      message: 'Product manifests cleaned up'
    };
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(req) {
    if (!this.config.webhookSecret) {
      console.warn('No webhook secret configured - skipping verification');
      return true;
    }

    const signature = req.headers['x-squarespace-signature'];
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
    
    // Simulate webhook processing
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
          platform: 'squarespace',
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
      title: 'C2 Concierge Squarespace Integration',
      steps: [
        {
          title: '1. Add Header Code',
          description: 'Copy this code into Squarespace Settings → Advanced → Code Injection → Header:',
          code: `<script src="https://cdn.c2concierge.org/squarespace-connector.js" async></script>`
        },
        {
          title: '2. Add Footer Code',
          description: 'Copy this code into Squarespace Settings → Advanced → Code Injection → Footer:',
          code: `<script src="https://cdn.c2concierge.org/squarespace-footer.js" async></script>`
        },
        {
          title: '3. Configure Commerce Webhooks (Commerce plans only)',
          description: 'Set up webhooks in Squarespace Commerce Settings pointing to:',
          code: `${req.protocol}://${req.get('host')}/squarespace-hook`
        }
      ],
      webhookEvents: [
        'order.created',
        'product.created', 
        'product.updated',
        'variant.created',
        'variant.updated'
      ],
      notes: [
        'Commerce webhooks require a Squarespace Commerce plan',
        'Header/Footer injection works on all Squarespace plans',
        'Badges will appear on product images automatically'
      ]
    };
  }

  /**
   * Start the server
   */
  start() {
    this.app.listen(this.config.port, () => {
      console.log(`C2 Concierge Squarespace webhook server listening on port ${this.config.port}`);
      console.log(`Health check: http://localhost:${this.config.port}/health`);
      console.log(`Installation: http://localhost:${this.config.port}/install`);
    });
  }
}

// Export for use as module
module.exports = SquarespaceCommerceWebhook;

// Auto-start if run directly
if (require.main === module) {
  const server = new SquarespaceCommerceWebhook();
  server.start();
}
