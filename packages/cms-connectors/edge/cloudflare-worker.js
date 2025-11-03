/**
 * C2 Concierge Universal Cloudflare Worker
 * Edge recipe for adding HTTP Link headers across all platforms
 * 
 * Features:
 * - Universal C2PA Link header injection
 * - Platform detection and routing
 * - Manifest URL generation
 * - Security headers
 * - Performance optimization
 * - Analytics and telemetry
 */

class C2CUniversalWorker {
  constructor(config = {}) {
    this.config = {
      manifestHost: config.manifestHost || 'https://manifests.c2concierge.org',
      analyticsUrl: config.analyticsUrl || 'https://analytics.c2concierge.org/telemetry',
      enableTelemetry: config.enableTelemetry !== false,
      debug: config.debug || false,
      cacheTTL: config.cacheTTL || 3600,
      supportedPlatforms: ['drupal', 'webflow', 'squarespace', 'ghost', 'ssg', 'nextjs', 'nuxt', 'astro'],
      ...config
    };
    
    this.version = '1.0.0';
  }

  /**
   * Main fetch handler
   */
  async fetch(request) {
    const startTime = Date.now();
    const url = new URL(request.url);
    
    try {
      // Handle different request types
      if (request.method === 'GET') {
        return this.handleGetRequest(request, url, startTime);
      } else if (request.method === 'POST') {
        return this.handlePostRequest(request, url);
      } else {
        return new Response('Method not allowed', { status: 405 });
      }
      
    } catch (error) {
      console.error('Worker error:', error);
      
      // Return original request on error
      return fetch(request);
    }
  }

  /**
   * Handle GET requests
   */
  async handleGetRequest(request, url, startTime) {
    // Get original response
    const originalResponse = await fetch(request);
    
    // Create new response with modified headers
    const response = new Response(originalResponse.body, originalResponse);
    
    // Detect platform
    const platform = this.detectPlatform(url, request);
    
    // Add C2PA Link header if applicable
    await this.addC2PALinkHeader(response, url, platform);
    
    // Add security headers
    this.addSecurityHeaders(response);
    
    // Add performance headers
    this.addPerformanceHeaders(response);
    
    // Send telemetry
    if (this.config.enableTelemetry) {
      this.sendTelemetry('worker_request', {
        url: url.href,
        platform,
        hasManifest: response.headers.has('Link'),
        duration: Date.now() - startTime,
        userAgent: request.headers.get('User-Agent')
      }).catch(() => {
        // Silently fail telemetry
      });
    }
    
    return response;
  }

  /**
   * Handle POST requests (webhooks)
   */
  async handlePostRequest(request, url) {
    const path = url.pathname;
    
    // Route webhook requests
    if (path.includes('/webflow-hook')) {
      return this.handleWebflowWebhook(request);
    } else if (path.includes('/squarespace-hook')) {
      return this.handleSquarespaceWebhook(request);
    } else if (path.includes('/ghost-hook')) {
      return this.handleGhostWebhook(request);
    } else if (path.includes('/drupal-hook')) {
      return this.handleDrupalWebhook(request);
    } else {
      return new Response('Webhook endpoint not found', { status: 404 });
    }
  }

  /**
   * Detect platform from request
   */
  detectPlatform(url, request) {
    const hostname = url.hostname;
    const pathname = url.pathname;
    const referer = request.headers.get('Referer') || '';
    const userAgent = request.headers.get('User-Agent') || '';
    
    // Check hostname patterns
    if (hostname.includes('webflow.io')) return 'webflow';
    if (hostname.includes('squarespace.com')) return 'squarespace';
    
    // Check path patterns
    if (pathname.includes('/ghost/')) return 'ghost';
    if (pathname.includes('/drupal/') || pathname.includes('/node/')) return 'drupal';
    
    // Check referer patterns
    if (referer.includes('webflow.io')) return 'webflow';
    if (referer.includes('squarespace.com')) return 'squarespace';
    if (referer.includes('ghost.org')) return 'ghost';
    
    // Check user agent patterns
    if (userAgent.includes('Drupal')) return 'drupal';
    
    // Check for SSG patterns
    const ssgPatterns = [
      '/_next/', '/_nuxt/', '/.vite/', '/dist/', '/build/',
      'index.html', '.html', '/static/', '/assets/'
    ];
    
    if (ssgPatterns.some(pattern => pathname.includes(pattern))) {
      return 'ssg';
    }
    
    // Default to unknown
    return 'unknown';
  }

  /**
   * Add C2PA Link header to response
   */
  async addC2PALinkHeader(response, url, platform) {
    try {
      // Only add to HTML responses
      const contentType = response.headers.get('Content-Type') || '';
      if (!contentType.includes('text/html')) {
        return;
      }
      
      // Generate manifest URL based on platform and URL
      const manifestUrl = this.generateManifestUrl(url, platform);
      
      if (manifestUrl) {
        const linkHeader = `<${manifestUrl}>; rel="c2pa-manifest"`;
        
        // Add Link header (preserve existing headers)
        const existingLink = response.headers.get('Link');
        if (existingLink) {
          response.headers.set('Link', `${existingLink}, ${linkHeader}`);
        } else {
          response.headers.set('Link', linkHeader);
        }
        
        if (this.config.debug) {
          console.log(`Added C2PA Link header for ${platform}: ${linkHeader}`);
        }
      }
      
    } catch (error) {
      console.warn('Failed to add C2PA Link header:', error);
    }
  }

  /**
   * Generate manifest URL for request
   */
  generateManifestUrl(url, platform) {
    const cleanPath = url.pathname;
    const searchParams = url.searchParams;
    
    // Skip certain paths
    const skipPaths = [
      '/api/', '/admin/', '/_next/', '/_nuxt/', '/.well-known/',
      '/robots.txt', '/sitemap.xml', '/favicon.ico'
    ];
    
    if (skipPaths.some(path => cleanPath.startsWith(path))) {
      return null;
    }
    
    // Generate hash based on platform and path
    const hash = this.generatePathHash(cleanPath, platform);
    
    // Construct manifest URL
    return `${this.config.manifestHost}/${platform}/${hash}.c2pa`;
  }

  /**
   * Generate hash from path and platform
   */
  generatePathHash(path, platform) {
    // Create a consistent hash for the same content across platforms
    const hashInput = `${platform}:${path}`;
    let hash = 0;
    
    for (let i = 0; i < hashInput.length; i++) {
      const char = hashInput.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    
    return Math.abs(hash).toString(16);
  }

  /**
   * Add security headers
   */
  addSecurityHeaders(response) {
    // HSTS
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    // Content Security Policy
    response.headers.set('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://cdn.c2concierge.org; " +
      "style-src 'self' 'unsafe-inline' https://cdn.c2concierge.org; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://verify.c2concierge.org https://manifests.c2concierge.org https://analytics.c2concierge.org; " +
      "font-src 'self' https://cdn.c2concierge.org; " +
      "frame-ancestors 'none';"
    );
    
    // Other security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  }

  /**
   * Add performance headers
   */
  addPerformanceHeaders(response) {
    // Cache control for static assets
    const url = new URL(response.url);
    const isStaticAsset = /\.(css|js|png|jpg|jpeg|gif|webp|svg|woff|woff2)$/i.test(url.pathname);
    
    if (isStaticAsset) {
      response.headers.set('Cache-Control', `public, max-age=${this.config.cacheTTL}`);
    } else {
      response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    
    // Compression
    response.headers.set('Vary', 'Accept-Encoding');
  }

  /**
   * Handle Webflow webhook
   */
  async handleWebflowWebhook(request) {
    try {
      const body = await request.json();
      
      // Verify webhook signature if configured
      if (this.env.WEBFLOW_WEBHOOK_SECRET) {
        const signature = request.headers.get('X-Webflow-Signature');
        if (!this.verifyWebhookSignature(body, signature, this.env.WEBFLOW_WEBHOOK_SECRET)) {
          return new Response('Invalid signature', { status: 401 });
        }
      }
      
      // Process webhook event
      const result = await this.processWebflowEvent(body);
      
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('Webflow webhook error:', error);
      return new Response('Webhook processing failed', { status: 500 });
    }
  }

  /**
   * Handle Squarespace webhook
   */
  async handleSquarespaceWebhook(request) {
    try {
      const body = await request.json();
      
      // Verify webhook signature
      if (this.env.SQUARESPACE_WEBHOOK_SECRET) {
        const signature = request.headers.get('X-Squarespace-Signature');
        if (!this.verifyWebhookSignature(body, signature, this.env.SQUARESPACE_WEBHOOK_SECRET)) {
          return new Response('Invalid signature', { status: 401 });
        }
      }
      
      const result = await this.processSquarespaceEvent(body);
      
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('Squarespace webhook error:', error);
      return new Response('Webhook processing failed', { status: 500 });
    }
  }

  /**
   * Handle Ghost webhook
   */
  async handleGhostWebhook(request) {
    try {
      const body = await request.json();
      
      // Verify webhook signature
      if (this.env.GHOST_WEBHOOK_SECRET) {
        const signature = request.headers.get('X-Ghost-Signature');
        if (!this.verifyWebhookSignature(body, signature, this.env.GHOST_WEBHOOK_SECRET)) {
          return new Response('Invalid signature', { status: 401 });
        }
      }
      
      const result = await this.processGhostEvent(body);
      
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('Ghost webhook error:', error);
      return new Response('Webhook processing failed', { status: 500 });
    }
  }

  /**
   * Handle Drupal webhook
   */
  async handleDrupalWebhook(request) {
    try {
      const body = await request.json();
      
      // Verify webhook signature
      if (this.env.DRUPAL_WEBHOOK_SECRET) {
        const signature = request.headers.get('X-Drupal-Signature');
        if (!this.verifyWebhookSignature(body, signature, this.env.DRUPAL_WEBHOOK_SECRET)) {
          return new Response('Invalid signature', { status: 401 });
        }
      }
      
      const result = await this.processDrupalEvent(body);
      
      return new Response(JSON.stringify(result), {
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error) {
      console.error('Drupal webhook error:', error);
      return new Response('Webhook processing failed', { status: 500 });
    }
  }

  /**
   * Process Webflow event
   */
  async processWebflowEvent(body) {
    // Forward to Webflow webhook processor
    const response = await fetch('https://verify.c2concierge.org/webflow-hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    return response.json();
  }

  /**
   * Process Squarespace event
   */
  async processSquarespaceEvent(body) {
    const response = await fetch('https://verify.c2concierge.org/squarespace-hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    return response.json();
  }

  /**
   * Process Ghost event
   */
  async processGhostEvent(body) {
    const response = await fetch('https://verify.c2concierge.org/ghost-hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    return response.json();
  }

  /**
   * Process Drupal event
   */
  async processDrupalEvent(body) {
    const response = await fetch('https://verify.c2concierge.org/drupal-hook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    
    return response.json();
  }

  /**
   * Verify webhook signature
   */
  async verifyWebhookSignature(body, signature, secret) {
    if (!secret || !signature) return false;
    
    // This is a simplified verification
    // In production, use proper HMAC verification
    const encoder = new TextEncoder();
    const keyData = encoder.encode(secret);
    const messageData = encoder.encode(JSON.stringify(body));
    
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, messageData);
    const expectedSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return signature === expectedSignature;
  }

  /**
   * Send telemetry data
   */
  async sendTelemetry(event, data) {
    if (!this.config.enableTelemetry) return;

    try {
      await fetch(this.config.analyticsUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          event,
          platform: 'cloudflare-worker',
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          ...data
        })
      });
    } catch (error) {
      // Silently fail telemetry
      if (this.config.debug) {
        console.warn('Telemetry failed:', error.message);
      }
    }
  }
}

// Export worker for Cloudflare Workers
export default {
  async fetch(request, env, ctx) {
    const worker = new C2CUniversalWorker(env);
    return worker.fetch(request);
  }
};

// Alternative export for other platforms
module.exports = {
  async fetch(request, env, ctx) {
    const worker = new C2CUniversalWorker(env);
    return worker.fetch(request);
  }
};
