/**
 * Licensed Content Enforcement Hooks - CMS/CDN Adapters
 * Phase 32 v1.1 - WordPress, Shopify, and Cloudflare Worker integrations
 */

import { VerifyEventSystem } from '../core/verify-events.js';

// ==================== WordPress Adapter ====================

export interface WordPressConfig {
  /** API endpoint for verification */
  api_endpoint: string;
  /** Partner ID */
  partner_id: string;
  /** Webhook configuration */
  webhook_url: string;
  /** Preview degradation settings */
  preview_degrade: {
    enabled: boolean;
    scale: number;
    blur_px: number;
  };
}

/**
 * WordPress plugin adapter for license enforcement
 */
export class WordPressLicenseAdapter {
  constructor(_config: WordPressConfig) {
    // WordPress adapter initialization would be implemented here
  }
}

// ==================== Shopify Adapter ====================

export interface ShopifyConfig {
  /** App API key */
  api_key: string;
  /** App secret */
  app_secret: string;
  /** Store domain */
  store_domain: string;
  /** Theme app extension ID */
  extension_id: string;
  /** Verification settings */
  verification: {
    enabled: boolean;
    auto_block: boolean;
    allowlist: string[];
  };
}

/**
 * Shopify theme app extension adapter
 */
export class ShopifyLicenseAdapter {
  constructor(_config: ShopifyConfig) {
    // Shopify adapter initialization would be implemented here
  }
}

// ==================== Cloudflare Worker Adapter ====================

export interface CloudflareConfig {
  /** Manifest server URL */
  manifest_server: string;
  /** Partner ID */
  partner_id: string;
  /** Paths to preserve */
  preserve_paths: string[];
  /** Webhook URL for events */
  webhook_url: string;
}

/**
 * Cloudflare Worker adapter for manifest injection and verification
 */
export class CloudflareWorkerAdapter {
  private config: CloudflareConfig;

  constructor(config: CloudflareConfig) {
    this.config = config;
  }

  /**
   * Cloudflare Worker fetch handler
   */
  async fetchHandler(request: Request, _env: any, _ctx: any): Promise<Response> {
    const url = new URL(request.url);
    
    // Check if path should be processed
    if (!this.shouldProcessPath(url.pathname)) {
      return fetch(request);
    }

    // Handle different request types
    if (request.method === 'GET') {
      return this.handleGetRequest(request, url);
    } else if (request.method === 'POST') {
      return this.handlePostRequest(request, url);
    }

    return fetch(request);
  }

  /**
   * Handle GET requests - inject manifest links
   */
  private async handleGetRequest(request: Request, url: URL): Promise<Response> {
    const response = await fetch(request);
    
    if (!response.ok) {
      return response;
    }

    const contentType = response.headers.get('content-type') || '';
    
    if (contentType.includes('image/')) {
      return this.handleImageResponse(response, url);
    } else if (contentType.includes('text/html')) {
      return this.handleHtmlResponse(response, url);
    }

    return response;
  }

  /**
   * Handle image responses - add Link header for manifest
   */
  private async handleImageResponse(response: Response, _url: URL): Promise<Response> {
    const imageBuffer = await response.arrayBuffer();
    const imageHash = await this.calculateHash(imageBuffer);
    
    const manifestUrl = `${this.config.manifest_server}/manifests/${imageHash}.c2pa`;
    
    const newResponse = new Response(imageBuffer, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });

    // Add Link header for C2PA manifest
    newResponse.headers.set('Link', `<${manifestUrl}>; rel="c2pa-manifest"`);
    
    // Add CSP header
    newResponse.headers.set('Content-Security-Policy', 
      `connect-src ${this.config.manifest_server} https://verify.c2concierge.example`);

    return newResponse;
  }

  /**
   * Handle HTML responses - inject badge script
   */
  private async handleHtmlResponse(response: Response, _url: URL): Promise<Response> {
    const html = await response.text();
    
    // Inject C2 badge script
    const badgeScript = `
      <script src="https://cdn.c2concierge.example/badge/v1.1/c2-badge.js"></script>
      <script>
        document.addEventListener('DOMContentLoaded', function() {
          initializeC2Badges();
        });
      </script>
    `;
    
    const modifiedHtml = html.replace('</head>', badgeScript + '</head>');
    
    return new Response(modifiedHtml, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  }

  /**
   * Handle POST requests - verification endpoints
   */
  private async handlePostRequest(request: Request, url: URL): Promise<Response> {
    if (url.pathname === '/verify') {
      return this.handleVerificationRequest(request);
    }
    
    if (url.pathname === '/events') {
      return this.handleEventRequest(request);
    }

    return new Response('Not Found', { status: 404 });
  }

  /**
   * Handle verification requests
   */
  private async handleVerificationRequest(request: Request): Promise<Response> {
    try {
      const body = await request.json() as { asset_url?: string };
      const assetUrl = body.asset_url;
      
      if (!assetUrl) {
        return new Response('Missing asset_url', { status: 400 });
      }

      // Verify asset using remote API
      const verificationResponse = await fetch(`${this.config.manifest_server}/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.partner_id}`
        },
        body: JSON.stringify({
          asset_url: assetUrl,
          context: {
            request_origin: request.headers.get('Origin') || 'unknown',
            user_agent: request.headers.get('User-Agent') || 'unknown'
          }
        })
      });

      const result = await verificationResponse.json();
      
      return new Response(JSON.stringify(result), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
      });
      
    } catch (error: unknown) {
      console.error('Verification request error:', error);
      return new Response('Verification failed', { status: 500 });
    }
  }

  /**
   * Handle event requests
   */
  private async handleEventRequest(request: Request): Promise<Response> {
    try {
      const signature = request.headers.get('C2-Signature');
      const body = await request.text();
      
      if (!signature) {
        return new Response('Missing signature', { status: 401 });
      }

      // Verify signature (would use partner secret)
      const isValid = await this.verifyWebhookSignature(body, signature);
      
      if (!isValid) {
        return new Response('Invalid signature', { status: 401 });
      }

      const event = JSON.parse(body);
      
      // Forward to partner webhook
      await this.forwardEventToPartner(event);
      
      return new Response('OK', { status: 200 });
      
    } catch (error: unknown) {
      console.error('Event request error:', error);
      return new Response('Event processing failed', { status: 500 });
    }
  }

  /**
   * Check if path should be processed
   */
  private shouldProcessPath(pathname: string): boolean {
    return this.config.preserve_paths.some(pattern => {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return pathname.startsWith(prefix);
      }
      return pathname === pattern;
    });
  }

  /**
   * Calculate SHA-256 hash of buffer
   */
  private async calculateHash(buffer: ArrayBuffer): Promise<string> {
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Verify webhook signature
   */
  private async verifyWebhookSignature(_body: string, _signature: string): Promise<boolean> {
    // Implementation would verify HMAC signature
    return true; // Placeholder
  }

  /**
   * Forward event to partner webhook
   */
  private async forwardEventToPartner(event: any): Promise<void> {
    if (!this.config.webhook_url) return;
    
    await fetch(this.config.webhook_url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'C2-Signature': VerifyEventSystem.createSignature(
          JSON.stringify(event),
          'partner-secret',
          Math.floor(Date.now() / 1000)
        )
      },
      body: JSON.stringify(event)
    });
  }

  /**
   * Generate Cloudflare Worker script
   */
  generateWorkerScript(): string {
    return `
// Cloudflare Worker for C2PA License Enforcement
export default {
  async fetch(request, env, ctx) {
    const adapter = new CloudflareWorkerAdapter({
      manifest_server: '${this.config.manifest_server}',
      partner_id: '${this.config.partner_id}',
      preserve_paths: ${JSON.stringify(this.config.preserve_paths)},
      webhook_url: '${this.config.webhook_url}'
    });
    
    return adapter.fetchHandler(request, env, ctx);
  }
};
    `;
  }
}

// Export adapter classes
export {
  WordPressLicenseAdapter as WordPress,
  ShopifyLicenseAdapter as Shopify,
  CloudflareWorkerAdapter as CloudflareWorker
};
