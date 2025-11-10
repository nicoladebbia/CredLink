/**
 * Phase 19: Edge Cache & 5xx Policy - Main Entry Point
 * Health monitoring, admin endpoints, and cache management
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { logger } from 'hono/logger';
import { CacheMiddleware, createCacheMiddleware } from './middleware.js';
import { EdgeCache, DEFAULT_CACHE_CONFIG } from './edge-cache.js';
import { IncidentDetector } from './incident-detector.js';
import { CacheConfig } from './types.js';

export class CacheService {
  private app: Hono<{ Variables: { tenantId: string } }>;
  private middleware: CacheMiddleware;
  private config: CacheConfig;

  constructor(config?: Partial<CacheConfig>) {
    this.config = {
      ...DEFAULT_CACHE_CONFIG,
      ...config
    };
    
    this.middleware = createCacheMiddleware(this.config);
    this.app = new Hono<{ Variables: { tenantId: string } }>();
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // CORS for cross-origin requests
    this.app.use('*', cors({
      origin: ['https://c2c.example.com', 'https://verify.c2c.example.com'],
      allowMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization', 'X-Tenant-ID', 'X-Provider']
    }));

    // Request logging
    this.app.use('*', logger((message, ...rest) => {
      console.log(`Cache Service: ${message}`, ...rest);
    }));
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (c) => {
      const status = this.middleware.getStatus();
      
      return c.json({
        status: 'healthy',
        service: 'edge-cache',
        timestamp: new Date().toISOString(),
        cache: status.cache,
        incidents: status.incidents
      });
    });

    // Cache statistics
    this.app.get('/stats', (c) => {
      const status = this.middleware.getStatus();
      
      return c.json({
        service: 'edge-cache',
        timestamp: new Date().toISOString(),
        cache: status.cache,
        config: status.config
      });
    });

    // Cache metrics
    this.app.get('/metrics', (c) => {
      const cache = this.middleware.getCache();
      const metrics = cache.getMetrics();
      
      return c.json({
        service: 'edge-cache',
        timestamp: new Date().toISOString(),
        metrics
      });
    });

    // Incident management
    this.app.get('/incidents', (c) => {
      const detector = this.middleware.getIncidentDetector();
      const activeOnly = c.req.query('active') === 'true';
      const provider = c.req.query('provider');
      
      let incidents;
      if (provider) {
        incidents = detector.getIncidentsByProvider(provider);
      } else if (activeOnly) {
        incidents = detector.getActiveIncidents();
      } else {
        incidents = detector.getAllIncidents();
      }
      
      return c.json({
        service: 'edge-cache',
        timestamp: new Date().toISOString(),
        incidents,
        count: incidents.length
      });
    });

    // Incident summary
    this.app.get('/incidents/summary', (c) => {
      const detector = this.middleware.getIncidentDetector();
      const summary = detector.getIncidentSummary();
      
      return c.json({
        service: 'edge-cache',
        timestamp: new Date().toISOString(),
        summary
      });
    });

    // Cache management endpoints
    this.app.post('/admin/cache/clear', async (c) => {
      try {
        // TODO: Verify admin permissions
        const cache = this.middleware.getCache();
        await cache.clear();
        
        return c.json({
          success: true,
          message: 'Cache cleared successfully',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Cache clear error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Clear provider cache with validation
    this.app.post('/admin/cache/clear/:provider', async (c) => {
      try {
        const provider = c.req.param('provider');
        
        if (!provider) {
          return c.json({ error: 'Provider is required' }, 400);
        }
        
        // Validate provider against allowed list
        const allowedProviders = ['getty', 'ap', 'shutterstock', 'reuters', 'cache'];
        if (!allowedProviders.includes(provider.toLowerCase())) {
          return c.json({ error: 'Invalid provider' }, 400);
        }

        const cache = this.middleware.getCache();
        const clearedCount = await cache.clearProvider(provider.toLowerCase());
        
        return c.json({
          success: true,
          message: `Cleared ${clearedCount} cache entries for provider ${provider}`,
          provider,
          cleared_count: clearedCount,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Provider cache clear error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Force refresh cache entry with validation
    this.app.post('/admin/cache/refresh', async (c) => {
      try {
        const body = await c.req.json();
        const { provider, request_type, url } = body;
        
        if (!provider || !url) {
          return c.json({ error: 'Provider and URL are required' }, 400);
        }
        
        // Validate provider
        const allowedProviders = ['getty', 'ap', 'shutterstock', 'reuters', 'cache'];
        if (!allowedProviders.includes(provider.toLowerCase())) {
          return c.json({ error: 'Invalid provider' }, 400);
        }
        
        // Validate URL format and prevent SSRF
        try {
          const parsedUrl = new URL(url);
          // Only allow HTTPS URLs from approved domains
          const allowedDomains = [
            'api.gettyimages.com',
            'api.ap.org',
            'api.shutterstock.com',
            'api.reuters.com'
          ];
          
          if (parsedUrl.protocol !== 'https:') {
            return c.json({ error: 'Only HTTPS URLs are allowed' }, 400);
          }
          
          if (!allowedDomains.includes(parsedUrl.hostname)) {
            return c.json({ error: 'Domain not allowed' }, 400);
          }
          
        } catch (urlError) {
          return c.json({ error: 'Invalid URL format' }, 400);
        }

        const cache = this.middleware.getCache();
        const cacheKey = {
          provider: provider.toLowerCase(),
          request_type: request_type || 'api',
          method: 'GET',
          url,
          tenant_id: c.get('tenantId') as string || undefined
        };

        const deleted = await cache.delete(cacheKey);
        
        return c.json({
          success: true,
          message: deleted ? 'Cache entry deleted for refresh' : 'No cache entry found',
          provider,
          url,
          deleted,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Cache refresh error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Get cache entry details
    this.app.get('/admin/cache/entry', async (c) => {
      try {
        const provider = c.req.query('provider');
        const url = c.req.query('url');
        const requestType = c.req.query('request_type') || 'api';
        
        if (!provider || !url) {
          return c.json({ error: 'Provider and URL are required' }, 400);
        }

        const cache = this.middleware.getCache();
        const cacheKey = {
          provider,
          request_type: requestType,
          method: 'GET',
          url,
          tenant_id: c.get('tenantId') as string || undefined
        };

        const result = await cache.get(cacheKey);
        
        if (!result.hit) {
          return c.json({
            hit: false,
            message: 'Cache entry not found'
          });
        }

        return c.json({
          hit: true,
          stale: result.stale || false,
          entry: {
            key: result.entry?.key,
            status_code: result.entry?.status_code,
            created_at: result.entry?.created_at,
            expires_at: result.entry?.expires_at,
            stale_until: result.entry?.stale_until,
            access_count: result.entry?.access_count,
            last_accessed: result.entry?.last_accessed,
            provider: result.entry?.provider,
            request_type: result.entry?.request_type,
            etag: result.entry?.etag
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Cache entry lookup error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Incident management endpoints
    this.app.post('/admin/incidents/:incidentId/resolve', async (c) => {
      try {
        const incidentId = c.req.param('incidentId');
        const body = await c.req.json();
        const { resolution_notes } = body;
        
        const detector = this.middleware.getIncidentDetector();
        const incidents = detector.getAllIncidents();
        const incident = incidents.find(i => i.id === incidentId);
        
        if (!incident) {
          return c.json({ error: 'Incident not found' }, 404);
        }

        if (incident.resolved_at) {
          return c.json({ error: 'Incident already resolved' }, 400);
        }

        // Resolve the incident
        incident.resolved_at = new Date().toISOString();
        incident.duration_minutes = Math.round(
          (new Date(incident.resolved_at).getTime() - new Date(incident.started_at).getTime()) / 60000
        );
        incident.resolution_notes = resolution_notes || 'Manually resolved via admin interface';
        
        console.log(`✅ INCIDENT MANUALLY RESOLVED: ${incident.provider} - ${incident.incident_type}`);
        console.log(`   Resolution: ${incident.resolution_notes}`);
        
        return c.json({
          success: true,
          message: 'Incident resolved successfully',
          incident,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Incident resolution error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });

    // Configuration endpoint
    this.app.get('/config', (c) => {
      const status = this.middleware.getStatus();
      
      return c.json({
        service: 'edge-cache',
        timestamp: new Date().toISOString(),
        config: status.config
      });
    });

    // Update configuration (limited subset)
    this.app.post('/admin/config', async (c) => {
      try {
        const body = await c.req.json();
        const { ttl_by_status, stale_while_revalidate } = body;
        
        // Only allow certain config changes
        if (ttl_by_status) {
          this.config.ttl_by_status = {
            ...this.config.ttl_by_status,
            ...ttl_by_status
          };
        }
        
        if (stale_while_revalidate) {
          this.config.stale_while_revalidate = {
            ...this.config.stale_while_revalidate,
            ...stale_while_revalidate
          };
        }
        
        return c.json({
          success: true,
          message: 'Configuration updated successfully',
          config: {
            ttl_by_status: this.config.ttl_by_status,
            stale_while_revalidate: this.config.stale_while_revalidate
          },
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        console.error('Config update error:', error);
        return c.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 500);
      }
    });
  }

  /**
   * Get Hono app instance
   */
  getApp(): Hono {
    return this.app as any;
  }

  /**
   * Get cache middleware instance
   */
  getMiddleware(): CacheMiddleware {
    return this.middleware;
  }

  /**
   * Get cache service status
   */
  getStatus() {
    return this.middleware.getStatus();
  }

  /**
   * Cleanup resources
   */
  cleanup(): void {
    this.middleware.cleanup();
  }
}

// Factory function for easy deployment
export function createCacheService(config?: Partial<CacheConfig>): CacheService {
  return new CacheService(config);
}

// Default service instance
export const defaultCacheService = createCacheService();
