/**
 * Tests for Phase 19: Edge Cache & 5xx Policy - Cache Service
 */

const { describe, it, expect, jest, beforeEach, afterEach } = require('@jest/globals');
import { EdgeCache, DEFAULT_CACHE_CONFIG } from './edge-cache.js';
import { IncidentDetector } from './incident-detector.js';
import { CacheMiddleware, createCacheMiddleware } from './middleware.js';
import { CacheService, createCacheService } from './index.js';
import type { CacheConfig, ProviderMetrics } from './types.js';

// Mock crypto
jest.mock('crypto', () => ({
  createHash: jest.fn(() => ({
    update: jest.fn().mockReturnThis(),
    digest: jest.fn((algorithm: string) => {
      if (algorithm === 'hex') return 'mock-hash-1234567890abcdef';
      if (algorithm === 'md5') return 'mock-md5-hash';
      return 'mock-hash';
    })
  }))
}));

describe('EdgeCache', () => {
  let cache: EdgeCache;
  let mockConfig: CacheConfig;

  beforeEach(() => {
    mockConfig = {
      ...DEFAULT_CACHE_CONFIG,
      storage: {
        ...DEFAULT_CACHE_CONFIG.storage,
        max_entries: 10,
        cleanup_interval_seconds: 1
      }
    };
    cache = new EdgeCache(mockConfig);
  });

  afterEach(() => {
    cache.stop();
  });

  describe('cache operations', () => {
    it('should store and retrieve cache entries', async () => {
      const key = {
        provider: 'getty',
        request_type: 'search',
        method: 'GET',
        url: 'https://api.gettyimages.com/v3/search/images'
      };

      const value = { images: [{ id: 'test-image' }] };
      
      await cache.set(key, value, 200);
      const result = await cache.get(key);
      
      expect(result.hit).toBe(true);
      expect(result.entry?.value).toEqual(value);
      expect(result.stale).toBe(false);
    });

    it('should handle cache misses', async () => {
      const key = {
        provider: 'getty',
        request_type: 'search',
        method: 'GET',
        url: 'https://api.gettyimages.com/v3/search/images'
      };

      const result = await cache.get(key);
      
      expect(result.hit).toBe(false);
      expect(result.entry).toBeUndefined();
    });

    it('should respect TTL by status code', async () => {
      const key = {
        provider: 'getty',
        request_type: 'search',
        method: 'GET',
        url: 'https://api.gettyimages.com/v3/search/images'
      };

      const value = { error: 'Rate limited' };
      
      // Test rate limited response (shorter TTL)
      await cache.set(key, value, 429);
      const result = await cache.get(key);
      
      expect(result.hit).toBe(true);
      expect(result.entry?.status_code).toBe(429);
    });

    it('should handle stale-while-revalidate', async () => {
      const config = {
        ...mockConfig,
        stale_while_revalidate: {
          enabled: true,
          ttl_multiplier: 2,
          max_ttl: 1800
        }
      };
      
      const staleCache = new EdgeCache(config);
      
      const key = {
        provider: 'getty',
        request_type: 'search',
        method: 'GET',
        url: 'https://api.gettyimages.com/v3/search/images'
      };

      const value = { images: [{ id: 'test-image' }] };
      
      await staleCache.set(key, value, 200);
      
      // Mock time passage to make entry stale
      const originalDate = Date.now;
      Date.now = jest.fn(() => originalDate() + 400000); // 400 seconds later
      
      const result = await staleCache.get(key);
      
      expect(result.hit).toBe(true);
      expect(result.stale).toBe(true);
      expect(result.background_refresh).toBe(true);
      
      // Restore original Date.now
      Date.now = originalDate;
      staleCache.stop();
    });

    it('should handle conditional requests with ETag', async () => {
      const key = {
        provider: 'getty',
        request_type: 'search',
        method: 'GET',
        url: 'https://api.gettyimages.com/v3/search/images'
      };

      const value = { images: [{ id: 'test-image' }] };
      const etag = 'test-etag-123';
      
      await cache.set(key, value, 200, { etag });
      
      // Test matching ETag
      const result1 = await cache.get(key, { if_none_match: etag });
      expect(result1.hit).toBe(true);
      
      // Test non-matching ETag
      const result2 = await cache.get(key, { if_none_match: 'different-etag' });
      expect(result2.hit).toBe(true);
    });

    it('should evict entries when cache is full', async () => {
      const key = {
        provider: 'getty',
        request_type: 'search',
        method: 'GET',
        url: 'https://api.gettyimages.com/v3/search/images'
      };

      // Fill cache to max capacity
      for (let i = 0; i < mockConfig.storage.max_entries; i++) {
        const testKey = { ...key, url: `${key.url}?page=${i}` };
        await cache.set(testKey, { data: i }, 200);
      }

      const stats = cache.getStats();
      expect(stats.entries).toBe(mockConfig.storage.max_entries);

      // Add one more entry to trigger eviction
      const overflowKey = { ...key, url: `${key.url}?page=${mockConfig.storage.max_entries}` };
      await cache.set(overflowKey, { data: 'overflow' }, 200);

      const finalStats = cache.getStats();
      expect(finalStats.entries).toBeLessThanOrEqual(mockConfig.storage.max_entries);
      expect(finalStats.evictions).toBeGreaterThan(0);
    });
  });

  describe('cache metrics', () => {
    it('should track cache statistics', async () => {
      const key = {
        provider: 'getty',
        request_type: 'search',
        method: 'GET',
        url: 'https://api.gettyimages.com/v3/search/images'
      };

      const value = { images: [{ id: 'test-image' }] };
      
      // Initial metrics
      let metrics = cache.getMetrics();
      expect(metrics.total_entries).toBe(0);
      
      // Add entry
      await cache.set(key, value, 200);
      metrics = cache.getMetrics();
      expect(metrics.total_entries).toBe(1);
      
      // Hit
      await cache.get(key);
      metrics = cache.getMetrics();
      expect(metrics.hit_rate).toBeGreaterThan(0);
      
      // Miss
      await cache.get({ ...key, url: 'different-url' });
      metrics = cache.getMetrics();
      expect(metrics.miss_rate).toBeGreaterThan(0);
    });
  });
});

describe('IncidentDetector', () => {
  let detector: IncidentDetector;
  let mockConfig: CacheConfig;

  beforeEach(() => {
    mockConfig = {
      ...DEFAULT_CACHE_CONFIG,
      incident_detection: {
        error_rate_threshold: 0.1,
        window_size_minutes: 5,
        min_requests: 5,
        spike_multiplier: 2.0
      }
    };
    detector = new IncidentDetector(mockConfig);
  });

  describe('incident detection', () => {
    it('should detect incidents based on error rate threshold', () => {
      const metrics: ProviderMetrics = {
        provider: 'getty',
        window_start: new Date().toISOString(),
        window_end: new Date().toISOString(),
        total_requests: 10,
        successful_requests: 8,
        error_requests: 2,
        rate_limited_requests: 0,
        timeout_requests: 0,
        connection_errors: 0,
        error_rate: 0.2, // 20% error rate - above 10% threshold
        average_response_time_ms: 500,
        p95_response_time_ms: 1000,
        status_code_distribution: { '2xx': 8, '5xx': 2 },
        endpoint_metrics: {
          search: { requests: 10, errors: 2, error_rate: 0.2, avg_response_time_ms: 500 }
        }
      };

      detector.recordMetrics(metrics);
      
      const incidents = detector.getActiveIncidents();
      expect(incidents.length).toBeGreaterThan(0);
      expect(incidents[0].provider).toBe('getty');
      expect(incidents[0].incident_type).toBe('5xx_spike');
      expect(incidents[0].severity).toBe('medium');
    });

    it('should detect error rate spikes over baseline', () => {
      // First, establish baseline with low error rate
      const baselineMetrics: ProviderMetrics = {
        provider: 'getty',
        window_start: new Date().toISOString(),
        window_end: new Date().toISOString(),
        total_requests: 10,
        successful_requests: 10,
        error_requests: 0,
        rate_limited_requests: 0,
        timeout_requests: 0,
        connection_errors: 0,
        error_rate: 0.0, // 0% error rate
        average_response_time_ms: 300,
        p95_response_time_ms: 600,
        status_code_distribution: { '2xx': 10 },
        endpoint_metrics: {
          search: { requests: 10, errors: 0, error_rate: 0.0, avg_response_time_ms: 300 }
        }
      };

      detector.recordMetrics(baselineMetrics);

      // Then record spike
      const spikeMetrics: ProviderMetrics = {
        provider: 'getty',
        window_start: new Date().toISOString(),
        window_end: new Date().toISOString(),
        total_requests: 10,
        successful_requests: 5,
        error_requests: 5,
        rate_limited_requests: 0,
        timeout_requests: 0,
        connection_errors: 0,
        error_rate: 0.5, // 50% error rate - huge spike
        average_response_time_ms: 800,
        p95_response_time_ms: 1500,
        status_code_distribution: { '2xx': 5, '5xx': 5 },
        endpoint_metrics: {
          search: { requests: 10, errors: 5, error_rate: 0.5, avg_response_time_ms: 800 }
        }
      };

      detector.recordMetrics(spikeMetrics);
      
      const incidents = detector.getActiveIncidents();
      expect(incidents.length).toBeGreaterThan(0);
      expect(incidents[0].description).toContain('spike');
    });

    it('should detect rate limit spikes', () => {
      const metrics: ProviderMetrics = {
        provider: 'getty',
        window_start: new Date().toISOString(),
        window_end: new Date().toISOString(),
        total_requests: 10,
        successful_requests: 5,
        error_requests: 0,
        rate_limited_requests: 5, // 50% rate limited
        timeout_requests: 0,
        connection_errors: 0,
        error_rate: 0.0,
        average_response_time_ms: 500,
        p95_response_time_ms: 1000,
        status_code_distribution: { '2xx': 5, '4xx': 5 },
        endpoint_metrics: {
          search: { requests: 10, errors: 0, error_rate: 0.0, avg_response_time_ms: 500 }
        }
      };

      detector.recordMetrics(metrics);
      
      const incidents = detector.getActiveIncidents();
      expect(incidents.length).toBeGreaterThan(0);
      expect(incidents[0].incident_type).toBe('rate_limit_spike');
    });

    it('should not detect incidents with normal metrics', () => {
      const metrics: ProviderMetrics = {
        provider: 'getty',
        window_start: new Date().toISOString(),
        window_end: new Date().toISOString(),
        total_requests: 10,
        successful_requests: 9,
        error_requests: 1,
        rate_limited_requests: 0,
        timeout_requests: 0,
        connection_errors: 0,
        error_rate: 0.1, // Exactly at threshold
        average_response_time_ms: 300,
        p95_response_time_ms: 600,
        status_code_distribution: { '2xx': 9, '5xx': 1 },
        endpoint_metrics: {
          search: { requests: 10, errors: 1, error_rate: 0.1, avg_response_time_ms: 300 }
        }
      };

      detector.recordMetrics(metrics);
      
      const incidents = detector.getActiveIncidents();
      expect(incidents.length).toBe(0);
    });
  });

  describe('incident management', () => {
    it('should provide incident summary', () => {
      const metrics: ProviderMetrics = {
        provider: 'getty',
        window_start: new Date().toISOString(),
        window_end: new Date().toISOString(),
        total_requests: 10,
        successful_requests: 5,
        error_requests: 5,
        rate_limited_requests: 0,
        timeout_requests: 0,
        connection_errors: 0,
        error_rate: 0.5,
        average_response_time_ms: 800,
        p95_response_time_ms: 1500,
        status_code_distribution: { '2xx': 5, '5xx': 5 },
        endpoint_metrics: {
          search: { requests: 10, errors: 5, error_rate: 0.5, avg_response_time_ms: 800 }
        }
      };

      detector.recordMetrics(metrics);
      
      const summary = detector.getIncidentSummary();
      expect(summary.total_incidents).toBeGreaterThan(0);
      expect(summary.active_incidents).toBeGreaterThan(0);
      expect(summary.by_severity).toBeDefined();
      expect(summary.by_type).toBeDefined();
      expect(summary.by_provider).toBeDefined();
    });
  });
});

describe('CacheMiddleware', () => {
  let middleware: CacheMiddleware;

  beforeEach(() => {
    middleware = createCacheMiddleware({
      storage: {
        ...DEFAULT_CACHE_CONFIG.storage,
        max_entries: 10,
        cleanup_interval_seconds: 1
      }
    });
  });

  afterEach(() => {
    middleware.cleanup();
  });

  describe('middleware functionality', () => {
    it('should create cache middleware', () => {
      expect(middleware).toBeInstanceOf(CacheMiddleware);
      expect(middleware.getCache()).toBeDefined();
      expect(middleware.getIncidentDetector()).toBeDefined();
    });

    it('should provide cache status', () => {
      const status = middleware.getStatus();
      expect(status.cache).toBeDefined();
      expect(status.incidents).toBeDefined();
      expect(status.config).toBeDefined();
    });
  });
});

describe('CacheService', () => {
  let service: CacheService;

  beforeEach(() => {
    service = createCacheService({
      storage: {
        ...DEFAULT_CACHE_CONFIG.storage,
        max_entries: 10,
        cleanup_interval_seconds: 1
      }
    });
  });

  afterEach(() => {
    service.cleanup();
  });

  describe('service endpoints', () => {
    it('should create cache service', () => {
      expect(service).toBeInstanceOf(CacheService);
      expect(service.getApp()).toBeDefined();
      expect(service.getMiddleware()).toBeDefined();
    });

    it('should provide service status', () => {
      const status = service.getStatus();
      expect(status.cache).toBeDefined();
      expect(status.incidents).toBeDefined();
      expect(status.config).toBeDefined();
    });
  });
});

describe('factory functions', () => {
  it('should create cache middleware with default config', () => {
    const middleware = createCacheMiddleware();
    expect(middleware).toBeInstanceOf(CacheMiddleware);
  });

  it('should create cache service with default config', () => {
    const service = createCacheService();
    expect(service).toBeInstanceOf(CacheService);
  });
});
