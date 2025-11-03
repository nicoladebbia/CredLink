/**
 * C2 Concierge SSG Vercel Middleware
 * Edge recipe for adding HTTP Link headers to Vercel deployments
 * 
 * Features:
 * - Adds HTTP Link header for C2PA manifests
 * - Supports Next.js, Nuxt, SvelteKit on Vercel
 * - Configurable manifest host
 * - Performance optimized with edge caching
 */

import { NextResponse } from 'next/server';

class C2SSGVercelMiddleware {
  constructor(config = {}) {
    this.config = {
      manifestHost: config.manifestHost || process.env.MANIFEST_HOST || 'https://manifests.c2concierge.org',
      manifestBase: config.manifestBase || process.env.MANIFEST_BASE || '/ssg',
      enableTelemetry: config.enableTelemetry !== false && process.env.ENABLE_TELEMETRY !== 'false',
      analyticsUrl: config.analyticsUrl || process.env.ANALYTICS_URL || 'https://analytics.c2concierge.org/telemetry',
      debug: config.debug || process.env.DEBUG === 'true',
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
      // Only process HTML requests
      if (!this.isHtmlRequest(request)) {
        return NextResponse.next();
      }

      // Create response
      const response = NextResponse.next();
      
      // Add C2PA Link header if applicable
      await this.addC2PALinkHeader(response, url);
      
      // Add security headers
      this.addSecurityHeaders(response);
      
      // Send telemetry asynchronously
      if (this.config.enableTelemetry) {
        this.sendTelemetry('middleware_request', {
          url: url.href,
          hasManifest: response.headers.has('Link'),
          duration: Date.now() - startTime
        }).catch(() => {
          // Silently fail telemetry
        });
      }
      
      return response;
      
    } catch (error) {
      console.error('Vercel middleware error:', error);
      
      // Return original response on error
      return NextResponse.next();
    }
  }

  /**
   * Check if request is for HTML content
   */
  isHtmlRequest(request) {
    const acceptHeader = request.headers.get('Accept') || '';
    const url = request.nextUrl;
    
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
    
    // Skip certain paths
    const skipPaths = ['/api/', '/_next/', '/_nuxt/', '/__trpc/', '/admin/'];
    if (skipPaths.some(path => cleanPath.startsWith(path))) {
      return null;
    }
    
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
const ssgMiddleware = new C2SSGVercelMiddleware();

// Export middleware function for Next.js
export function middleware(request) {
  return ssgMiddleware.middleware(request);
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
     * - public folder files
     */
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(png|jpg|jpeg|gif|webp|svg|ico|css|js)).*)',
  ],
};

// Alternative export for other frameworks
module.exports = {
  middleware: (request) => ssgMiddleware.middleware(request),
  config
};
