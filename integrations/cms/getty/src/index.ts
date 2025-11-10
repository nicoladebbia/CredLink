/**
 * Phase 19: Getty Adapter - Main Entry Point
 * Getty Images connector with OAuth, metadata fetching, and license mapping
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { 
  GettyApiConfig, 
  GettyIngestRequest, 
  GettyIngestResponse 
} from './types.js';
import { GettyMetadataFetcher } from './metadata-fetcher.js';
import {
  buildProviderManifestAssertion,
  formatLicenseForBadge,
  generateBadgeUrl
} from '../../src/assertion-builder.js';

export class GettyAdapter {
  private app: Hono<{ Variables: { tenantId: string } }>;
  private metadataFetcher: GettyMetadataFetcher;
  private config: GettyApiConfig;

  constructor(config: GettyApiConfig) {
    this.config = config;
    this.metadataFetcher = new GettyMetadataFetcher(config);
    this.app = new Hono<{ Variables: { tenantId: string } }>();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS for cross-origin requests
    this.app.use('*', cors({
      origin: ['https://c2c.example.com', 'https://verify.c2c.example.com'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID'],
      exposeHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining', 'X-RateLimit-Reset']
    }));

    // Request logging
    this.app.use('*', logger((message, ...rest) => {
      console.log(`Getty Adapter: ${message}`, ...rest);
    }));

    // Tenant validation middleware with UUID validation
    this.app.use('*', async (c, next) => {
      const tenantId = c.get('tenantId') || c.req.header('x-tenant-id');
      if (!tenantId) {
        return c.json({ error: 'Tenant ID required' }, 401);
      }
      
      // Validate tenant ID format (UUID)
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuidRegex.test(tenantId)) {
        return c.json({ error: 'Invalid tenant ID format' }, 401);
      }
      
      c.set('tenantId', tenantId);
      await next();
    });
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (c) => {
      const rateLimitStatus = this.metadataFetcher.getRateLimitStatus();
      return c.json({
        status: 'healthy',
        provider: 'getty',
        rate_limit: rateLimitStatus,
        timestamp: new Date().toISOString()
      });
    });

    // Ingest single asset
    this.app.post('/ingest', async (c) => {
      try {
        const tenantId = c.get('tenantId');
        const body = await c.req.json() as GettyIngestRequest;
        
        // Validate request
        if (!body.provider_asset_id) {
          return c.json({ error: 'provider_asset_id is required' }, 400);
        }

        if (!body.mode || !['reference', 'download'].includes(body.mode)) {
          return c.json({ error: 'mode must be "reference" or "download"' }, 400);
        }

        // Check download permissions
        if (body.mode === 'download' && !this.config.capabilities.download_allowed) {
          return c.json({ error: 'Download not allowed for Getty assets' }, 403);
        }

        const request: GettyIngestRequest = {
          ...body,
          tenant_id: tenantId as string
        };

        const result = await this.metadataFetcher.ingestAsset(request);
        
        if (result.success) {
          return c.json({
            success: true,
            asset_id: result.asset_id,
            manifest_hash: result.manifest_hash,
            license_assertion: result.license_assertion,
            verify_url: generateBadgeUrl(
              result.license_assertion,
              'https://verify.c2c.example.com',
              result.manifest_hash
            )
          });
        } else {
          return c.json({
            success: false,
            error: result.error,
            asset_id: result.asset_id
          }, 500);
        }
        
      } catch (error) {
        console.error('Getty ingest error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Batch ingest
    this.app.post('/ingest/batch', async (c) => {
      try {
        const tenantId = c.get('tenantId');
        const body = await c.req.json() as { requests: GettyIngestRequest[] };
        
        if (!body.requests || !Array.isArray(body.requests)) {
          return c.json({ error: 'requests array is required' }, 400);
        }

        if (body.requests.length > 10) {
          return c.json({ error: 'Maximum 10 requests per batch' }, 400);
        }

        // Add tenant ID to each request
        const requests = body.requests.map(req => ({
          ...req,
          tenant_id: tenantId as string
        }));

        const results = await this.metadataFetcher.ingestBatch(requests);
        
        return c.json({
          success: true,
          results,
          processed: results.length,
          successful: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        });
        
      } catch (error) {
        console.error('Getty batch ingest error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Search assets
    this.app.get('/search', async (c) => {
      try {
        const query = c.req.query('q') || '';
        const page = parseInt(c.req.query('page') || '1');
        const pageSize = Math.min(parseInt(c.req.query('page_size') || '20'), 100);
        const assetFamily = c.req.query('asset_family');
        const licenseModel = c.req.query('license_model');
        
        const results = await this.metadataFetcher.searchAssets({
          query,
          page,
          page_size: pageSize,
          asset_family: assetFamily,
          license_model: licenseModel
        });
        
        return c.json({
          success: true,
          query,
          page,
          page_size: pageSize,
          total_results: results.result_count,
          assets: results.images.map(asset => ({
            id: asset.id,
            title: asset.title,
            caption: asset.caption,
            credit_line: asset.credit_line,
            asset_family: asset.asset_family,
            license_model: asset.license_model,
            is_editorial: asset.is_editorial,
            display_sizes: asset.display_sizes.map(size => ({
              name: size.name,
              uri: size.uri,
              width: size.width,
              height: size.height
            })),
            referral_destinations: asset.referral_destinations
          }))
        });
        
      } catch (error) {
        console.error('Getty search error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Get asset details
    this.app.get('/asset/:id', async (c) => {
      try {
        const assetId = c.req.param('id');
        
        if (!assetId) {
          return c.json({ error: 'Asset ID is required' }, 400);
        }

        const asset = await this.metadataFetcher.fetchAsset(assetId);
        
        return c.json({
          success: true,
          asset: {
            id: asset.id,
            title: asset.title,
            caption: asset.caption,
            credit_line: asset.credit_line,
            date_created: asset.date_created,
            asset_family: asset.asset_family,
            license_model: asset.license_model,
            is_editorial: asset.is_editorial,
            keywords: asset.keywords,
            display_sizes: asset.display_sizes,
            referral_destinations: asset.referral_destinations
          }
        });
        
      } catch (error) {
        console.error('Getty asset fetch error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Rate limit status
    this.app.get('/rate-limit', (c) => {
      const status = this.metadataFetcher.getRateLimitStatus();
      return c.json({
        provider: 'getty',
        ...status
      });
    });
  }

  /**
   * Get Hono app instance
   */
  getApp(): Hono {
    return this.app as any;
  }

  /**
   * Get metadata fetcher instance
   */
  getMetadataFetcher(): GettyMetadataFetcher {
    return this.metadataFetcher;
  }
}

// Default Getty configuration
export const DEFAULT_GETTY_CONFIG: GettyApiConfig = {
  base_url: 'https://api.gettyimages.com',
  oauth: {
    client_id: process.env.GETTY_CLIENT_ID || '',
    client_secret: process.env.GETTY_CLIENT_SECRET || '',
    token_url: 'https://api.gettyimages.com/oauth2/token',
    scope: ['']
  },
  rate_limits: {
    requests_per_minute: 100,
    burst: 10,
    daily_limit: 10000
  },
  capabilities: {
    download_allowed: false,
    embed_allowed: true,
    hotlink_allowed: false,
    commercial_use_allowed: false
  },
  terms_links: {
    eula: 'https://www.gettyimages.com/eula',
    usage_terms: 'https://www.gettyimages.com/terms-and-conditions',
    api_terms: 'https://www.gettyimages.com/api/terms'
  }
};

// Create default adapter instance
export function createGettyAdapter(config?: Partial<GettyApiConfig>): GettyAdapter {
  const finalConfig = {
    ...DEFAULT_GETTY_CONFIG,
    ...config,
    oauth: {
      ...DEFAULT_GETTY_CONFIG.oauth,
      ...(config?.oauth || {})
    },
    rate_limits: {
      ...DEFAULT_GETTY_CONFIG.rate_limits,
      ...(config?.rate_limits || {})
    },
    capabilities: {
      ...DEFAULT_GETTY_CONFIG.capabilities,
      ...(config?.capabilities || {})
    },
    terms_links: {
      ...DEFAULT_GETTY_CONFIG.terms_links,
      ...(config?.terms_links || {})
    }
  };

  return new GettyAdapter(finalConfig);
}
