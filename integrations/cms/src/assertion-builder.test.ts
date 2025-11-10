/**
 * Tests for Phase 19: Marketplace Connectors - Manifest Assertion Builder
 */

const { describe, it, expect } = require('@jest/globals');
import {
  buildLicenseAssertion,
  buildReleaseAssertion,
  buildProviderManifestAssertion,
  validateLicenseAssertion,
  formatLicenseForBadge,
  generateManifestHash,
  getManifestStoragePath,
  type ProviderAssetMetadata,
  type LicenseAssertion
} from './assertion-builder';

describe('Manifest Assertion Builder', () => {
  const mockMetadata: ProviderAssetMetadata = {
    provider: 'getty',
    provider_asset_id: '123456789',
    asset_url: 'https://example.com/image.jpg',
    asset_kind: 'image',
    title: 'Test Image',
    caption: 'Test Caption',
    credit: 'Test Photographer',
    license: {
      license_id: '123456789',
      license_type: 'editorial',
      license_url: 'https://www.gettyimages.com/eula',
      licensor_name: 'Getty Images',
      usage_terms: 'Editorial use only',
      restrictions: ['No commercial use', 'No modifications'],
      download_allowed: false,
      embed_allowed: true,
      commercial_use_allowed: false
    },
    rights_window: {
      from: new Date('2025-10-01T00:00:00Z'),
      to: new Date('2026-10-01T00:00:00Z')
    },
    releases: {
      model_release_status: 'MR-NOT-APPLICABLE',
      property_release_status: 'PR-NOT-APPLICABLE'
    },
    source_urls: {
      api_endpoint: 'https://api.gettyimages.com/v3/assets/123456789',
      asset_page: 'https://www.gettyimages.com/detail/photo/test-image/123456789',
      embed_url: 'https://embed.gettyimages.com/123456789'
    }
  };

  describe('buildLicenseAssertion', () => {
    it('should build license assertion with IPTC fields', () => {
      const assertion = buildLicenseAssertion(mockMetadata);
      
      expect(assertion.provider).toBe('getty');
      expect(assertion.license_id).toBe('123456789');
      expect(assertion.license_type).toBe('editorial');
      expect(assertion.license_url).toBe('https://www.gettyimages.com/eula');
      expect(assertion.iptc.LicensorName).toBe('Getty Images');
      expect(assertion.iptc.WebStatement).toBe('https://www.gettyimages.com/eula');
      expect(assertion.iptc.UsageTerms).toBe('Editorial use only');
      expect(assertion.iptc.Source).toBe('GETTY');
      expect(assertion.iptc.Credit).toBe('Test Photographer');
      expect(assertion.rights_window?.from).toBe('2025-10-01T00:00:00.000Z');
      expect(assertion.rights_window?.to).toBe('2026-10-01T00:00:00.000Z');
      expect(assertion.restrictions).toEqual(['No commercial use', 'No modifications']);
    });

    it('should handle missing optional fields', () => {
      const minimalMetadata = {
        ...mockMetadata,
        license: {
          ...mockMetadata.license,
          license_type: undefined,
          license_url: undefined,
          licensor_name: undefined,
          usage_terms: undefined,
          restrictions: undefined
        },
        rights_window: undefined
      };

      const assertion = buildLicenseAssertion(minimalMetadata);
      
      expect(assertion.provider).toBe('getty');
      expect(assertion.license_id).toBe('123456789');
      expect(assertion.license_type).toBeUndefined();
      expect(assertion.license_url).toBeUndefined();
      expect(assertion.iptc.LicensorName).toBe('Getty Images'); // Fallback to provider name
      expect(assertion.iptc.UsageTerms).toBe('See provider terms'); // Fallback
      expect(assertion.rights_window).toBeUndefined();
    });
  });

  describe('buildReleaseAssertion', () => {
    it('should build release assertion', () => {
      const assertion = buildReleaseAssertion(mockMetadata);
      
      expect(assertion.model_release_status).toBe('MR-NOT-APPLICABLE');
      expect(assertion.property_release_status).toBe('PR-NOT-APPLICABLE');
    });
  });

  describe('buildProviderManifestAssertion', () => {
    it('should build complete manifest assertion', () => {
      const assertion = buildProviderManifestAssertion(
        mockMetadata,
        'tenant-123',
        'c2c.example.com'
      );
      
      expect(assertion.version).toBe('1.0');
      expect(assertion.asset.primary_url).toBe('https://example.com/image.jpg');
      expect(assertion.asset.kind).toBe('image');
      expect(assertion.assertions.license.provider).toBe('getty');
      expect(assertion.assertions.releases.model_release_status).toBe('MR-NOT-APPLICABLE');
      expect(assertion.links.source_provider).toBe('https://api.gettyimages.com/v3/assets/123456789');
      expect(assertion.signature.alg).toBe('ES256');
      expect(assertion.signature.issuer).toBe('c2c.example.com/tenants/tenant-123');
      expect(assertion.signature.created_at).toBeDefined();
    });
  });

  describe('validateLicenseAssertion', () => {
    it('should validate correct assertion', () => {
      const assertion = buildLicenseAssertion(mockMetadata);
      const result = validateLicenseAssertion(assertion);
      
      expect(result.is_valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should detect missing required fields', () => {
      const invalidAssertion: LicenseAssertion = {
        provider: 'getty',
        license_id: '',
        iptc: {
          LicensorName: '',
          Source: ''
        }
      };

      const result = validateLicenseAssertion(invalidAssertion);
      
      expect(result.is_valid).toBe(false);
      expect(result.errors).toContain('License ID is required');
      expect(result.errors).toContain('IPTC LicensorName is required');
      expect(result.errors).toContain('IPTC Source is required');
    });

    it('should validate rights window', () => {
      const assertion = buildLicenseAssertion(mockMetadata);
      // Invalid rights window
      assertion.rights_window = {
        from: '2026-10-01T00:00:00Z',
        to: '2025-10-01T00:00:00Z'
      };

      const result = validateLicenseAssertion(assertion);
      
      expect(result.is_valid).toBe(false);
      expect(result.errors).toContain('Rights window "from" must be before "to"');
    });
  });

  describe('formatLicenseForBadge', () => {
    it('should format license information for badge', () => {
      const assertion = buildLicenseAssertion(mockMetadata);
      const formatted = formatLicenseForBadge(assertion);
      
      expect(formatted).toContain('Licensed from Getty Images');
      expect(formatted).toContain('License 123456789');
      expect(formatted).toContain('Editorial');
      expect(formatted).toContain('→');
    });

    it('should handle minimal license information', () => {
      const minimalAssertion = {
        provider: 'ap' as const,
        license_id: 'ABC123',
        iptc: {
          LicensorName: 'Associated Press',
          Source: 'AP'
        }
      };

      const formatted = formatLicenseForBadge(minimalAssertion);
      
      expect(formatted).toBe('Licensed from Associated Press • License ABC123');
    });
  });

  describe('generateManifestHash', () => {
    it('should generate consistent hash', () => {
      const assertion = buildProviderManifestAssertion(
        mockMetadata,
        'tenant-123',
        'c2c.example.com'
      );
      
      const hash1 = generateManifestHash(assertion);
      const hash2 = generateManifestHash(assertion);
      
      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex
    });
  });

  describe('getManifestStoragePath', () => {
    it('should generate R2 storage path', () => {
      const manifestHash = 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456';
      const path = getManifestStoragePath(manifestHash);
      
      expect(path).toBe(`manifests/${manifestHash}.c2pa.json`);
    });
  });

  describe('Provider-specific tests', () => {
    const providers: Array<'getty' | 'ap' | 'shutterstock' | 'reuters'> = ['getty', 'ap', 'shutterstock', 'reuters'];
    
    it.each(providers)('should handle %s provider', (provider: 'getty' | 'ap' | 'shutterstock' | 'reuters') => {
      const providerMetadata = {
        ...mockMetadata,
        provider,
        license: {
          ...mockMetadata.license,
          licensor_name: undefined // Test fallback
        }
      };

      const assertion = buildLicenseAssertion(providerMetadata);
      
      expect(assertion.provider).toBe(provider);
      expect(assertion.iptc.Source).toBe(provider.toUpperCase());
      expect(assertion.iptc.LicensorName).toBeDefined();
    });
  });
});
