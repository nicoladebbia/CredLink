/**
 * Tests for Phase 19: Getty Adapter - OAuth and Metadata Fetching
 */

const { describe, it, expect, jest, beforeEach, afterEach } = require('@jest/globals');
import { GettyOAuthClient } from './oauth-client.js';
import { GettyMetadataFetcher } from './metadata-fetcher.js';
import { GettyAdapter, createGettyAdapter, DEFAULT_GETTY_CONFIG } from './index.js';
import type { GettyApiConfig, GettyAssetResponse } from './types.js';

// Mock fetch
global.fetch = jest.fn();

describe('GettyOAuthClient', () => {
  let oauthClient: GettyOAuthClient;
  let mockConfig: GettyApiConfig;

  beforeEach(() => {
    mockConfig = {
      ...DEFAULT_GETTY_CONFIG,
      oauth: {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        token_url: 'https://api.gettyimages.com/oauth2/token'
      }
    };
    oauthClient = new GettyOAuthClient(mockConfig);
    jest.clearAllMocks();
  });

  describe('getAccessToken', () => {
    it('should fetch and cache access token', async () => {
      const mockTokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse
      });

      const token = await oauthClient.getAccessToken();
      
      expect(token).toBe('test-access-token');
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.gettyimages.com/oauth2/token',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('grant_type=client_credentials')
        })
      );
    });

    it('should reuse cached token', async () => {
      const mockTokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse
      });

      const token1 = await oauthClient.getAccessToken();
      const token2 = await oauthClient.getAccessToken();
      
      expect(token1).toBe('test-access-token');
      expect(token2).toBe('test-access-token');
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should refresh expired token', async () => {
      const mockTokenResponse = {
        access_token: 'new-access-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => mockTokenResponse
      });

      // First call
      await oauthClient.getAccessToken();
      
      // Simulate token expiry
      oauthClient['tokenExpiry'] = Date.now() - 1000;
      
      // Second call should refresh
      const newToken = await oauthClient.getAccessToken();
      
      expect(newToken).toBe('new-access-token');
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('makeRequest', () => {
    beforeEach(async () => {
      // Mock token
      const mockTokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse
      });

      await oauthClient.getAccessToken();
    });

    it('should make authenticated request', async () => {
      const mockApiResponse = { id: 'test-asset', title: 'Test Asset' };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse
      });

      const result = await oauthClient.makeRequest('https://api.gettyimages.com/v3/assets/test');
      
      expect(result).toEqual(mockApiResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.gettyimages.com/v3/assets/test',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer test-access-token'
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
          headers: new Headers({ 'retry-after': '5' })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'test-asset' })
        });

      const result = await oauthClient.makeRequest('https://api.gettyimages.com/v3/assets/test');
      
      expect(result).toEqual({ id: 'test-asset' });
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
          json: async () => ({ id: 'test-asset' })
        });

      const result = await oauthClient.makeRequest('https://api.gettyimages.com/v3/assets/test');
      
      expect(result).toEqual({ id: 'test-asset' });
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
          json: async () => ({ id: 'test-asset' })
        });

      const result = await oauthClient.makeRequest('https://api.gettyimages.com/v3/assets/test');
      
      expect(result).toEqual({ id: 'test-asset' });
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });
});

describe('GettyMetadataFetcher', () => {
  let metadataFetcher: GettyMetadataFetcher;
  let mockConfig: GettyApiConfig;

  beforeEach(() => {
    mockConfig = {
      ...DEFAULT_GETTY_CONFIG,
      oauth: {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        token_url: 'https://api.gettyimages.com/oauth2/token'
      }
    };
    metadataFetcher = new GettyMetadataFetcher(mockConfig);
    jest.clearAllMocks();
  });

  describe('fetchAsset', () => {
    beforeEach(async () => {
      // Mock OAuth
      const mockTokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse
      });

      await metadataFetcher['oauthClient'].getAccessToken();
    });

    it('should fetch asset metadata', async () => {
      const mockAsset: GettyAssetResponse = {
        id: 'test-asset-id',
        asset_family: 'creative',
        asset_type: 'image',
        caption: 'Test caption',
        title: 'Test title',
        credit_line: 'Test Credit',
        date_created: '2024-01-01T00:00:00Z',
        display_sizes: [
          {
            name: 'preview',
            uri: 'https://example.com/preview.jpg',
            width: 400,
            height: 300
          }
        ],
        image_family: 'photography',
        is_editorial: false,
        is_vector: false,
        is_illustration: false,
        license_model: 'royaltyfree',
        max_dimensions: { width: 4000, height: 3000 },
        orientation: 'horizontal',
        keywords: [],
        product_types: [],
        quality: 1,
        referral_destinations: [
          {
            site_name: 'gettyimages',
            uri: 'https://www.gettyimages.com/detail/photo/test/test-asset-id'
          }
        ],
        signature: 'test-signature'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: [mockAsset] })
      });

      const result = await metadataFetcher.fetchAsset('test-asset-id');
      
      expect(result).toEqual(mockAsset);
    });

    it('should throw error for missing asset', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: [] })
      });

      await expect(metadataFetcher.fetchAsset('missing-asset')).rejects.toThrow('Getty asset not found');
    });
  });

  describe('ingestAsset', () => {
    beforeEach(async () => {
      // Mock OAuth
      const mockTokenResponse = {
        access_token: 'test-access-token',
        token_type: 'Bearer',
        expires_in: 3600
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockTokenResponse
      });

      await metadataFetcher['oauthClient'].getAccessToken();
    });

    it('should ingest asset successfully', async () => {
      const mockAsset: GettyAssetResponse = {
        id: 'test-asset-id',
        asset_family: 'creative',
        asset_type: 'image',
        caption: 'Test caption',
        title: 'Test title',
        credit_line: 'Test Credit',
        date_created: '2024-01-01T00:00:00Z',
        display_sizes: [
          {
            name: 'preview',
            uri: 'https://example.com/preview.jpg',
            width: 400,
            height: 300
          }
        ],
        image_family: 'photography',
        is_editorial: false,
        is_vector: false,
        is_illustration: false,
        license_model: 'royaltyfree',
        max_dimensions: { width: 4000, height: 3000 },
        orientation: 'horizontal',
        keywords: [],
        product_types: [],
        quality: 1,
        referral_destinations: [
          {
            site_name: 'gettyimages',
            uri: 'https://www.gettyimages.com/detail/photo/test/test-asset-id'
          }
        ],
        signature: 'test-signature'
      };

      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({ images: [mockAsset] })
      });

      const result = await metadataFetcher.ingestAsset({
        provider_asset_id: 'test-asset-id',
        mode: 'reference',
        tenant_id: 'test-tenant'
      });
      
      expect(result.success).toBe(true);
      expect(result.asset_id).toBe('test-asset-id');
      expect(result.manifest_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(result.license_assertion).toBeDefined();
    });

    it('should handle ingest failure', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found'
      });

      const result = await metadataFetcher.ingestAsset({
        provider_asset_id: 'missing-asset',
        mode: 'reference',
        tenant_id: 'test-tenant'
      });
      
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});

describe('GettyAdapter', () => {
  let adapter: GettyAdapter;

  beforeEach(() => {
    adapter = createGettyAdapter({
      oauth: {
        client_id: 'test-client-id',
        client_secret: 'test-client-secret',
        token_url: 'https://api.gettyimages.com/oauth2/token'
      }
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
      expect(body.provider).toBe('getty');
      expect(body.rate_limit).toBeDefined();
    });
  });

  describe('rate limit endpoint', () => {
    it('should return rate limit status', async () => {
      const app = adapter.getApp();
      const response = await app.request('/rate-limit');
      
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.provider).toBe('getty');
      expect(body.requests_used).toBeDefined();
      expect(body.requests_limit).toBe(100);
    });
  });
});

describe('createGettyAdapter', () => {
  it('should create adapter with default config', () => {
    const adapter = createGettyAdapter();
    expect(adapter).toBeInstanceOf(GettyAdapter);
  });

  it('should create adapter with custom config', () => {
    const adapter = createGettyAdapter({
      rate_limits: {
        requests_per_minute: 50,
        burst: 5
      }
    });
    expect(adapter).toBeInstanceOf(GettyAdapter);
  });
});
