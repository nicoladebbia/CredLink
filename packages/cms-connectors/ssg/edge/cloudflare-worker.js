/**
 * C2 Concierge SSG Cloudflare Worker
 * Edge recipe for adding HTTP Link headers to static sites
 * 
 * Features:
 * - Adds HTTP Link header for C2PA manifests
 * - Supports multiple SSG platforms
 * - Configurable manifest host
 * - Performance optimized with caching
 */

class C2SSGWorker {
  constructor(env) {
    this.env = env;
    this.config = {
      manifestHost: env.MANIFEST_HOST || 'https://manifests.c2concierge.org',
      manifestBase: env.MANIFEST_BASE || '/ssg',
      enableTelemetry: env.ENABLE_TELEMETRY !== 'false',
      analyticsUrl: env.ANALYTICS_URL || 'https://analytics.c2concierge.org/telemetry',
      cacheTTL: env.CACHE_TTL || 3600, // 1 hour
      debug: env.DEBUG === 'true'
    };
  }

  /**
   * Main fetch handler
   */
  async fetch(request) {
    const startTime = Date.now();
    const url = new URL(request.url);
    
    try {
      // Only process HTML requests
      if (!this.isHtmlRequest(request)) {
        return fetch(request);
      }

      // Get original response
      const originalResponse = await fetch(request);
      
      // Create new response with modified headers
      const response = new Response(originalResponse.body, originalResponse);
      
      // Add C2PA Link header if applicable
      await this.addC2PALinkHeader(response, url);
      
      // Add security headers
      this.addSecurityHeaders(response);
      
      // Send telemetry
      if (this.config.enableTelemetry) {
        this.sendTelemetry('worker_request', {
          url: url.href,
          hasManifest: response.headers.has('Link'),
          duration: Date.now() - startTime
        });
      }
      
      return response;
      
    } catch (error) {
      console.error('Worker error:', error);
      
      // Return original request on error
      return fetch(request);
    }
  }

  /**
   * Check if request is for HTML content
   */
  isHtmlRequest(request) {
    const url = new URL(request.url);
    const acceptHeader = request.headers.get('Accept') || '';
    
    // Check Accept header
    if (acceptHeader.includes('text/html')) {
      return true;
    }
    
    // Check file extension
    const htmlExtensions = ['.html', '.htm'];
    return htmlExtensions.some(ext => url.pathname.endsWith(ext));
  }

  /**
   * Add C2PA Link header to response
   */
  async addC2PALinkHeader(response, url) {
    try {
      // Generate manifest URL based on request URL
      const manifestUrl = this.generateManifestUrl(url);
      
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
          console.log(`Added C2PA Link header: ${linkHeader}`);
        }
      }
      
    } catch (error) {
      console.warn('Failed to add C2PA Link header:', error);
    }
  }

  /**
   * Generate manifest URL for request
   */
  generateManifestUrl(url) {
    // Remove query parameters and hash
    const cleanPath = url.pathname;
    
    // Generate hash from URL path
    const hash = this.generatePathHash(cleanPath);
    
    // Construct manifest URL
    return `${this.config.manifestHost}${this.config.manifestBase}/${hash}.c2pa`;
  }

  /**
   * Generate hash from URL path
   */
  generatePathHash(path) {
    // Simple hash function for demonstration
    // In production, you might want to use a more sophisticated approach
    let hash = 0;
    for (let i = 0; i < path.length; i++) {
      const char = path.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Add security headers
   */
  addSecurityHeaders(response) {
    // HSTS
    response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    
    // Content Security Policy (allow C2PA resources)
    response.headers.set('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://cdn.c2concierge.org; " +
      "style-src 'self' 'unsafe-inline' https://cdn.c2concierge.org; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://verify.c2concierge.org https://manifests.c2concierge.org; " +
      "font-src 'self' https://cdn.c2concierge.org;"
    );
    
    // Other security headers
    response.headers.set('X-Content-Type-Options', 'nosniff');
    response.headers.set('X-Frame-Options', 'DENY');
    response.headers.set('X-XSS-Protection', '1; mode=block');
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
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

// Export worker
export default {
  async fetch(request, env, ctx) {
    const worker = new C2SSGWorker(env);
    return worker.fetch(request);
  }
};

// Alternative syntax for different deployment methods
module.exports = {
  async fetch(request, env, ctx) {
    const worker = new C2SSGWorker(env);
    return worker.fetch(request);
  }
};
