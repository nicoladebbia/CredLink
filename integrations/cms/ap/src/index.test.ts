/**
 * Tests for Phase 19: AP Adapter - API Client and Metadata Fetching
 */

const { describe, it, expect, jest, beforeEach, afterEach } = require('@jest/globals');
import { APApiClient } from './api-client.js';
import { APMetadataFetcher } from './metadata-fetcher.js';
import { APAdapter, createAPAdapter, DEFAULT_AP_CONFIG } from './index.js';
import type { APApiConfig, APAssetResponse } from './types.js';

// Mock fetch
global.fetch = jest.fn();

describe('APApiClient', () => {
  let apiClient: APApiClient;
  let mockConfig: APApiConfig;

  beforeEach(() => {
    mockConfig = {
      ...DEFAULT_AP_CONFIG,
      api_key: 'test-api-key'
    };
    apiClient = new APApiClient(mockConfig);
    jest.clearAllMocks();
  });

  describe('makeRequest', () => {
    it('should make authenticated request with API key', async () => {
      const mockApiResponse = { item: { id: 'test-content', headline: 'Test Content' } };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });

      const result = await apiClient.makeRequest('https://api.ap.org/content/test');
      
      expect(result).toEqual(mockApiResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.ap.org/content/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'X-Api-Key': 'test-api-key'
          })
        })
      );
    });

    it('should handle 429 rate limit with retry-after', async () => {
      // Mock 429 response
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers({ 'retry-after': '10' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ item: { id: 'test-content' } })
        });

      const result = await apiClient.makeRequest('https://api.ap.org/content/test');
      
      expect(result).toEqual({ item: { id: 'test-content' } });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should handle 429 rate limit with exponential backoff', async () => {
      // Mock 429 response without retry-after
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 429,
          headers: new Headers()
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ item: { id: 'test-content' } })
        });

      const result = await apiClient.makeRequest('https://api.ap.org/content/test');
      
      expect(result).toEqual({ item: { id: 'test-content' } });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on 5xx errors', async () => {
      // Mock 500 response then success
      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error'
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ item: { id: 'test-content' } })
        });

      const result = await apiClient.makeRequest('https://api.ap.org/content/test');
      
      expect(result).toEqual({ item: { id: 'test-content' } });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('canMakeRequest', () => {
    it('should allow request when under limits', () => {
      const canRequest = apiClient.canMakeRequest();
      
      expect(canRequest.can_request).toBe(true);
      expect(canRequest.reason).toBeUndefined();
    });

    it('should block request when minute limit exceeded', () => {
      // Simulate hitting minute limit
      apiClient['requestCount'] = mockConfig.rate_limits.requests_per_minute;
      
      const canRequest = apiClient.canMakeRequest();
      
      expect(canRequest.can_request).toBe(false);
      expect(canRequest.reason).toBe('Minute rate limit exceeded');
      expect(canRequest.wait_time_ms).toBeGreaterThan(0);
    });

    it('should block request when daily limit exceeded', () => {
      // Simulate hitting daily limit
      apiClient['dailyRequestCount'] = mockConfig.rate_limits.daily_limit!;
      
      const canRequest = apiClient.canMakeRequest();
      
      expect(canRequest.can_request).toBe(false);
      expect(canRequest.reason).toBe('Daily rate limit exceeded');
      expect(canRequest.wait_time_ms).toBeGreaterThan(0);
    });
  });
});

describe('APMetadataFetcher', () => {
  let metadataFetcher: APMetadataFetcher;
  let mockConfig: APApiConfig;

  beforeEach(() => {
    mockConfig = {
      ...DEFAULT_AP_CONFIG,
      api_key: 'test-api-key'
    };
    metadataFetcher = new APMetadataFetcher(mockConfig);
    jest.clearAllMocks();
  });

  describe('fetchContent', () => {
    beforeEach(async () => {
      // Mock API client
      const mockApiResponse = { 
        item: { 
          id: 'test-content-id',
          headline: 'Test Content',
          type: 'text'
        } 
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });
    });

    it('should fetch content metadata', async () => {
      const mockContent: APAssetResponse = {
        item: {
          id: 'test-content-id',
          type: 'text',
          subtype: 'story',
          headline: 'Test Headline',
          slugline: 'Test Slugline',
          story: {
            body: 'Test body content',
            dateline: 'NEW YORK'
          },
          byline: 'Test Author',
          creditline: 'Associated Press',
          timestamp_first_created: '2024-01-01T00:00:00Z',
          timestamp_version_created: '2024-01-01T00:00:00Z',
          urgency: 3,
          priority: 1,
          category: 'International',
          subject: [],
          location: [],
          language: 'en',
          altids: [],
          links: {
            self: { href: 'https://api.ap.org/content/test-content-id' },
            alternate: [],
            related: []
          },
          media: [],
          restrictions: {
            usage: 'Editorial only',
            embargo: '',
            geography: '',
            language: ''
          },
          rights_info: {
            copyright: '© 2024 Associated Press',
            credit: 'Associated Press',
            usage_terms: 'For editorial use only',
            special_instructions: ''
          }
        },
        links: {
          self: { href: 'https://api.ap.org/content/test-content-id' },
          first: { href: 'https://api.ap.org/content' },
          last: { href: 'https://api.ap.org/content' }
        },
        total_items: 1
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockContent
      });

      const result = await metadataFetcher.fetchContent('test-content-id');
      
      expect(result).toEqual(mockContent);
    });

    it('should throw error for missing content', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ item: null })
      });

      await expect(metadataFetcher.fetchContent('missing-content')).rejects.toThrow('AP content not found');
    });
  });

  describe('ingestContent', () => {
    beforeEach(async () => {
      // Mock API client
      const mockApiResponse = { 
        item: { 
          id: 'test-content-id',
          headline: 'Test Content',
          type: 'text'
        } 
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });
    });

    it('should ingest content successfully', async () => {
      const mockContent: APAssetResponse = {
        item: {
          id: 'test-content-id',
          type: 'text',
          subtype: 'story',
          headline: 'Test Headline',
          slugline: 'Test Slugline',
          story: {
            body: 'Test body content',
            dateline: 'NEW YORK'
          },
          byline: 'Test Author',
          creditline: 'Associated Press',
          timestamp_first_created: '2024-01-01T00:00:00Z',
          timestamp_version_created: '2024-01-01T00:00:00Z',
          urgency: 3,
          priority: 1,
          category: 'International',
          subject: [],
          location: [],
          language: 'en',
          altids: [],
          links: {
            self: { href: 'https://api.ap.org/content/test-content-id' },
            alternate: [],
            related: []
          },
          media: [],
          restrictions: {
            usage: 'Editorial only',
            embargo: '',
            geography: '',
            language: ''
          },
          rights_info: {
            copyright: '© 2024 Associated Press',
            credit: 'Associated Press',
            usage_terms: 'For editorial use only',
            special_instructions: ''
          }
        },
        links: {
          self: { href: 'https://api.ap.org/content/test-content-id' },
          first: { href: 'https://api.ap.org/content' },
          last: { href: 'https://api.ap.org/content' }
        },
        total_items: 1
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockContent
      });

      const result = await metadataFetcher.ingestContent({
        provider_asset_id: 'test-content-id',
        mode: 'reference',
        tenant_id: 'test-tenant'
      });
      
      expect(result.success).toBe(true);
      expect(result.asset_id).toBe('test-content-id');
      expect(result.manifest_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.license_assertion).toBeDefined();
    });

    it('should handle rate limit exceeded', async () => {
      // Mock canMakeRequest to return false
      jest.spyOn(metadataFetcher['apiClient'], 'canMakeRequest').mockReturnValue({
        can_request: false,
        reason: 'Minute rate limit exceeded',
        wait_time_ms: 30000
      });

      const result = await metadataFetcher.ingestContent({
        provider_asset_id: 'test-content-id',
        mode: 'reference',
        tenant_id: 'test-tenant'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Rate limit exceeded');
    });
  });
});

describe('APAdapter', () => {
  let adapter: APAdapter;

  beforeEach(() => {
    adapter = createAPAdapter({
      api_key: 'test-api-key'
    });
    jest.clearAllMocks();
  });

  describe('health endpoint', () => {
    it('should return health status', async () => {
      const app = adapter.getApp();
      const response = await app.request('/health');
      
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.status).toBe('healthy');
      expect(body.provider).toBe('ap');
      expect(body.rate_limit).toBeDefined();
      expect(body.can_request).toBeDefined();
    });
  });

  describe('rate limit endpoint', () => {
    it('should return rate limit status', async () => {
      const app = adapter.getApp();
      const response = await app.request('/rate-limit');
      
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.provider).toBe('ap');
      expect(body.requests_used).toBeDefined();
      expect(body.requests_limit).toBe(60);
      expect(body.can_request).toBeDefined();
    });
  });
});

describe('createAPAdapter', () => {
  it('should create adapter with default config', () => {
    const adapter = createAPAdapter();
    expect(adapter).toBeInstanceOf(APAdapter);
  });

  it('should create adapter with custom config', () => {
    const adapter = createAPAdapter({
      rate_limits: {
        requests_per_minute: 30,
        burst: 3
      }
    });
    expect(adapter).toBeInstanceOf(APAdapter);
  });
});
