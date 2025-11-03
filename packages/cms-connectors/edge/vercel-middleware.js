/**
 * C2 Concierge Universal Vercel Middleware
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

import { NextResponse } from 'next/server';
import { createHmac } from 'crypto';

class C2CUniversalMiddleware {
  constructor(config = {}) {
    this.config = {
      manifestHost: config.manifestHost || process.env.MANIFEST_HOST || 'https://manifests.c2concierge.org',
      analyticsUrl: config.analyticsUrl || process.env.ANALYTICS_URL || 'https://analytics.c2concierge.org/telemetry',
      enableTelemetry: config.enableTelemetry !== false && process.env.ENABLE_TELEMETRY !== 'false',
      debug: config.debug || process.env.DEBUG === 'true',
      supportedPlatforms: ['drupal', 'webflow', 'squarespace', 'ghost', 'ssg', 'nextjs', 'nuxt', 'astro'],
      ...config
    };
  }

  /**
   * Middleware entry point
   */
  async middleware(request) {
    const startTime = Date.now();
    const url = request.nextUrl;
    
    try {
      // Handle different request types
      if (request.method === 'GET') {
        return this.handleGetRequest(request, url, startTime);
      } else if (request.method === 'POST') {
        return this.handlePostRequest(request, url);
      } else {
        return NextResponse.next();
      }
      
    } catch (error) {
      console.error('Vercel middleware error:', error);
      
      // Return original response on error
      return NextResponse.next();
    }
  }

  /**
   * Handle GET requests
   */
  async handleGetRequest(request, url, startTime) {
    // Create response
    const response = NextResponse.next();
    
    // Detect platform
    const platform = this.detectPlatform(url, request);
    
    // Add C2PA Link header if applicable
    await this.addC2PALinkHeader(response, url, platform);
    
    // Add security headers
    this.addSecurityHeaders(response);
    
    // Add performance headers
    this.addPerformanceHeaders(response);
    
    // Send telemetry asynchronously
    if (this.config.enableTelemetry) {
      this.sendTelemetry('middleware_request', {
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
      return NextResponse.next();
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
    if (hostname.includes('ghost.io')) return 'ghost';
    
    // Check path patterns
    if (pathname.includes('/ghost/')) return 'ghost';
    if (pathname.includes('/drupal/') || pathname.includes('/node/')) return 'drupal';
    if (pathname.includes('/_next/')) return 'nextjs';
    if (pathname.includes('/_nuxt/')) return 'nuxt';
    if (pathname.includes('/_astro/')) return 'astro';
    
    // Check referer patterns
    if (referer.includes('webflow.io')) return 'webflow';
    if (referer.includes('squarespace.com')) return 'squarespace';
    if (referer.includes('ghost.io')) return 'ghost';
    if (referer.includes('drupal')) return 'drupal';
    
    // Check user agent patterns
    if (userAgent.includes('Drupal')) return 'drupal';
    
    // Check for SSG patterns
    const ssgPatterns = [
      '/_next/static/', '/_nuxt/', '/_astro/', '/.vite/', '/dist/', '/build/',
      'index.html', '.html', '/static/', '/assets/'
    ];
    
    if (ssgPatterns.some(pattern => pathname.includes(pattern))) {
      // Determine specific SSG platform
      if (pathname.includes('/_next/')) return 'nextjs';
      if (pathname.includes('/_nuxt/')) return 'nuxt';
      if (pathname.includes('/_astro/')) return 'astro';
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
      const acceptHeader = request.headers.get('Accept') || '';
      if (!acceptHeader.includes('text/html')) {
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
    
    // Skip certain paths
    const skipPaths = [
      '/api/', '/admin/', '/_next/', '/_nuxt/', '/_astro/', '/.well-known/',
      '/robots.txt', '/sitemap.xml', '/favicon.ico', '/manifest.json'
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
      response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      response.headers.set('Cache-Control', 'public, max-age=0, must-revalidate');
    }
    
    // Compression
    response.headers.set('Vary', 'Accept-Encoding');
    
    // Edge caching
    response.headers.set('Cache-Control', 's-maxage=31536000');
  }

  /**
   * Handle Webflow webhook
   */
  async handleWebflowWebhook(request) {
    try {
      const body = await request.json();
      
      // Verify webhook signature if configured
      if (process.env.WEBFLOW_WEBHOOK_SECRET) {
        const signature = request.headers.get('X-Webflow-Signature');
        if (!this.verifyWebhookSignature(body, signature, process.env.WEBFLOW_WEBHOOK_SECRET)) {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      }
      
      // Process webhook event
      const result = await this.processWebflowEvent(body);
      
      return NextResponse.json(result);
      
    } catch (error) {
      console.error('Webflow webhook error:', error);
      return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
  }

  /**
   * Handle Squarespace webhook
   */
  async handleSquarespaceWebhook(request) {
    try {
      const body = await request.json();
      
      // Verify webhook signature
      if (process.env.SQUARESPACE_WEBHOOK_SECRET) {
        const signature = request.headers.get('X-Squarespace-Signature');
        if (!this.verifyWebhookSignature(body, signature, process.env.SQUARESPACE_WEBHOOK_SECRET)) {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      }
      
      const result = await this.processSquarespaceEvent(body);
      
      return NextResponse.json(result);
      
    } catch (error) {
      console.error('Squarespace webhook error:', error);
      return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
  }

  /**
   * Handle Ghost webhook
   */
  async handleGhostWebhook(request) {
    try {
      const body = await request.json();
      
      // Verify webhook signature
      if (process.env.GHOST_WEBHOOK_SECRET) {
        const signature = request.headers.get('X-Ghost-Signature');
        if (!this.verifyWebhookSignature(body, signature, process.env.GHOST_WEBHOOK_SECRET)) {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      }
      
      const result = await this.processGhostEvent(body);
      
      return NextResponse.json(result);
      
    } catch (error) {
      console.error('Ghost webhook error:', error);
      return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
    }
  }

  /**
   * Handle Drupal webhook
   */
  async handleDrupalWebhook(request) {
    try {
      const body = await request.json();
      
      // Verify webhook signature
      if (process.env.DRUPAL_WEBHOOK_SECRET) {
        const signature = request.headers.get('X-Drupal-Signature');
        if (!this.verifyWebhookSignature(body, signature, process.env.DRUPAL_WEBHOOK_SECRET)) {
          return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }
      }
      
      const result = await this.processDrupalEvent(body);
      
      return NextResponse.json(result);
      
    } catch (error) {
      console.error('Drupal webhook error:', error);
      return NextResponse.json({ error: 'Webhook processing failed' }, { status: 500 });
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
    const expectedSignature = createHmac('sha256', secret)
      .update(JSON.stringify(body))
      .digest('hex');
    
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
          platform: 'vercel-middleware',
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

// Create middleware instance
const universalMiddleware = new C2CUniversalMiddleware();

// Export middleware function for Next.js
export function middleware(request) {
  return universalMiddleware.middleware(request);
}

// Export config for Next.js middleware
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - robots.txt (SEO file)
     * - sitemap.xml (SEO file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(png|jpg|jpeg|gif|webp|svg|ico|css|js)).*)',
  ],
};

// Alternative export for other frameworks
module.exports = {
  middleware: (request) => universalMiddleware.middleware(request),
  config
};
