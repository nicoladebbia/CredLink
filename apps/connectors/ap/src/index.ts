/**
 * Phase 19: AP Adapter - Main Entry Point with Nightly Sync
 * Associated Press connector with quota handling, usage terms, and nightly feed sync
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { 
  APApiConfig, 
  APIngestRequest, 
  APIngestResponse 
} from './types.js';
import { APMetadataFetcher } from './metadata-fetcher.js';
import { 
  buildProviderManifestAssertion,
  formatLicenseForBadge,
  generateBadgeUrl
} from '../../src/assertion-builder.js';

export class APAdapter {
  private app: Hono<{ Variables: { tenantId: string } }>;
  private metadataFetcher: APMetadataFetcher;
  private config: APApiConfig;
  private syncInterval: NodeJS.Timeout | null = null;

  constructor(config: APApiConfig) {
    this.config = config;
    this.metadataFetcher = new APMetadataFetcher(config);
    this.app = new Hono<{ Variables: { tenantId: string } }>();
    
    this.setupMiddleware();
    this.setupRoutes();
    this.startNightlySync();
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
      console.log(`AP Adapter: ${message}`, ...rest);
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
      const canRequest = this.metadataFetcher.canMakeRequest();
      
      return c.json({
        status: 'healthy',
        provider: 'ap',
        rate_limit: rateLimitStatus,
        can_request: canRequest,
        timestamp: new Date().toISOString()
      });
    });

    // Ingest single content
    this.app.post('/ingest', async (c) => {
      try {
        const tenantId = c.get('tenantId');
        const body = await c.req.json() as APIngestRequest;
        
        // Validate request
        if (!body.provider_asset_id) {
          return c.json({ error: 'provider_asset_id is required' }, 400);
        }

        if (!body.mode || !['reference', 'download'].includes(body.mode)) {
          return c.json({ error: 'mode must be "reference" or "download"' }, 400);
        }

        // Check download permissions
        if (body.mode === 'download' && !this.config.capabilities.download_allowed) {
          return c.json({ error: 'Download not allowed for AP content' }, 403);
        }

        // Check rate limits
        const canRequest = this.metadataFetcher.canMakeRequest();
        if (!canRequest.can_request) {
          return c.json({ 
            error: `Rate limit exceeded: ${canRequest.reason}`,
            wait_time_ms: canRequest.wait_time_ms 
          }, 429);
        }

        const request: APIngestRequest = {
          ...body,
          tenant_id: tenantId as string
        };

        const result = await this.metadataFetcher.ingestContent(request);
        
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
          }, result.error?.includes('Rate limit') ? 429 : 500);
        }
        
      } catch (error) {
        console.error('AP ingest error:', error);
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
        const body = await c.req.json() as { requests: APIngestRequest[] };
        
        if (!body.requests || !Array.isArray(body.requests)) {
          return c.json({ error: 'requests array is required' }, 400);
        }

        if (body.requests.length > 5) { // Lower limit for AP
          return c.json({ error: 'Maximum 5 requests per batch for AP content' }, 400);
        }

        // Check rate limits for batch
        const canRequest = this.metadataFetcher.canMakeRequest();
        if (!canRequest.can_request) {
          return c.json({ 
            error: `Rate limit exceeded: ${canRequest.reason}`,
            wait_time_ms: canRequest.wait_time_ms 
          }, 429);
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
        console.error('AP batch ingest error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Search content
    this.app.get('/search', async (c) => {
      try {
        const query = c.req.query('q') || '';
        const page = parseInt(c.req.query('page') || '1');
        const pageSize = Math.min(parseInt(c.req.query('page_size') || '20'), 50); // Lower limit for AP
        const type = c.req.query('type');
        const category = c.req.query('category');
        const language = c.req.query('language');
        
        // Check rate limits
        const canRequest = this.metadataFetcher.canMakeRequest();
        if (!canRequest.can_request) {
          return c.json({ 
            error: `Rate limit exceeded: ${canRequest.reason}`,
            wait_time_ms: canRequest.wait_time_ms 
          }, 429);
        }
        
        const results = await this.metadataFetcher.searchContent({
          query,
          page,
          page_size: pageSize,
          type,
          category,
          language
        });
        
        return c.json({
          success: true,
          query,
          page,
          page_size: pageSize,
          total_results: results.meta.total_items,
          returned_items: results.meta.returned_items,
          content: results.data.map(content => ({
            id: content.item.id,
            type: content.item.type,
            subtype: content.item.subtype,
            headline: content.item.headline,
            slugline: content.item.slugline,
            byline: content.item.byline,
            creditline: content.item.creditline,
            timestamp_first_created: content.item.timestamp_first_created,
            category: content.item.category,
            language: content.item.language,
            media_count: content.item.media.length,
            restrictions: content.item.restrictions,
            links: content.item.links
          }))
        });
        
      } catch (error) {
        console.error('AP search error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Get content details
    this.app.get('/content/:id', async (c) => {
      try {
        const contentId = c.req.param('id');
        
        if (!contentId) {
          return c.json({ error: 'Content ID is required' }, 400);
        }

        // Check rate limits
        const canRequest = this.metadataFetcher.canMakeRequest();
        if (!canRequest.can_request) {
          return c.json({ 
            error: `Rate limit exceeded: ${canRequest.reason}`,
            wait_time_ms: canRequest.wait_time_ms 
          }, 429);
        }

        const content = await this.metadataFetcher.fetchContent(contentId);
        
        return c.json({
          success: true,
          content: {
            id: content.item.id,
            type: content.item.type,
            subtype: content.item.subtype,
            headline: content.item.headline,
            slugline: content.item.slugline,
            story: content.item.story,
            byline: content.item.byline,
            creditline: content.item.creditline,
            timestamp_first_created: content.item.timestamp_first_created,
            urgency: content.item.urgency,
            priority: content.item.priority,
            category: content.item.category,
            subject: content.item.subject,
            location: content.item.location,
            language: content.item.language,
            media: content.item.media,
            restrictions: content.item.restrictions,
            rights_info: content.item.rights_info,
            links: content.item.links
          }
        });
        
      } catch (error) {
        console.error('AP content fetch error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Rate limit status
    this.app.get('/rate-limit', (c) => {
      const status = this.metadataFetcher.getRateLimitStatus();
      const canRequest = this.metadataFetcher.canMakeRequest();
      
      return c.json({
        provider: 'ap',
        ...status,
        can_request: canRequest
      });
    });

    // Admin endpoint: Trigger nightly sync
    this.app.post('/admin/sync', async (c) => {
      try {
        // TODO: Verify admin permissions
        const result = await this.performNightlySync();
        
        return c.json({
          success: true,
          sync_result: result,
          timestamp: new Date().toISOString()
        });
        
      } catch (error) {
        console.error('AP sync error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });
  }

  /**
   * Start nightly sync process
   */
  private startNightlySync(): void {
    // Schedule sync to run at 2 AM UTC every day
    const scheduleSync = () => {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setUTCHours(2, 0, 0, 0);
      
      const msUntilTomorrow = tomorrow.getTime() - now.getTime();
      
      console.log(`AP nightly sync scheduled for ${tomorrow.toISOString()}`);
      
      setTimeout(() => {
        this.performNightlySync().catch(error => {
          console.error('AP nightly sync failed:', error);
        });
        
        // Schedule next sync
        scheduleSync();
      }, msUntilTomorrow);
    };

    scheduleSync();
  }

  /**
   * Perform nightly sync of AP content
   */
  private async performNightlySync(): Promise<{
    total_processed: number;
    successful: number;
    failed: number;
    errors: string[];
  }> {
    console.log('Starting AP nightly sync...');
    
    const result = {
      total_processed: 0,
      successful: 0,
      failed: 0,
      errors: [] as string[]
    };

    try {
      // TODO: Get list of tenants to sync for
      const tenants = ['tenant-1', 'tenant-2']; // Mock tenants
      
      for (const tenantId of tenants) {
        try {
          // TODO: Get sync cursor for tenant
          // const syncState = await this.getSyncState(tenantId);
          
          // Fetch recent content (last 24 hours)
          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          
          const searchResults = await this.metadataFetcher.searchContent({
            date_range: {
              from: yesterday.toISOString().split('T')[0],
              to: new Date().toISOString().split('T')[0]
            },
            page_size: 50 // Limit for sync
          });

          console.log(`AP sync: Found ${searchResults.meta.total_items} items for tenant ${tenantId}`);

          // Process each content item
          for (const contentData of searchResults.data) {
            result.total_processed++;
            
            try {
              const ingestRequest: APIngestRequest = {
                provider_asset_id: contentData.item.id,
                mode: 'reference',
                tenant_id: tenantId
              };

              const ingestResult = await this.metadataFetcher.ingestContent(ingestRequest);
              
              if (ingestResult.success) {
                result.successful++;
              } else {
                result.failed++;
                result.errors.push(`Content ${contentData.item.id}: ${ingestResult.error}`);
              }
              
            } catch (error) {
              result.failed++;
              result.errors.push(`Content ${contentData.item.id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
            }
          }

          // TODO: Update sync cursor
          // await this.updateSyncState(tenantId, newCursor);
          
        } catch (error) {
          result.errors.push(`Tenant ${tenantId}: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
      }

      console.log(`AP nightly sync completed: ${result.successful}/${result.total_processed} successful`);
      
    } catch (error) {
      result.errors.push(`Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    return result;
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
  getMetadataFetcher(): APMetadataFetcher {
    return this.metadataFetcher;
  }

  /**
   * Stop nightly sync (for cleanup)
   */
  stopNightlySync(): void {
    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }
}

// Default AP configuration
export const DEFAULT_AP_CONFIG: APApiConfig = {
  base_url: 'https://api.ap.org',
  api_key: process.env.AP_API_KEY || '',
  rate_limits: {
    requests_per_minute: 60, // AP has stricter limits
    burst: 5,
    daily_limit: 1000
  },
  capabilities: {
    download_allowed: false,
    embed_allowed: true,
    hotlink_allowed: false,
    commercial_use_allowed: false // Most AP content is editorial
  },
  terms_links: {
    usage_terms: 'https://www.ap.org/terms-and-conditions',
    api_terms: 'https://developer.ap.org/docs/terms',
    license_info: 'https://www.ap.org/license'
  }
};

// Create default adapter instance
export function createAPAdapter(config?: Partial<APApiConfig>): APAdapter {
  const finalConfig = {
    ...DEFAULT_AP_CONFIG,
    ...config,
    rate_limits: {
      ...DEFAULT_AP_CONFIG.rate_limits,
      ...(config?.rate_limits || {})
    },
    capabilities: {
      ...DEFAULT_AP_CONFIG.capabilities,
      ...(config?.capabilities || {})
    },
    terms_links: {
      ...DEFAULT_AP_CONFIG.terms_links,
      ...(config?.terms_links || {})
    }
  };

  return new APAdapter(finalConfig);
}
