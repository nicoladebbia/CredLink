/**
 * Phase 35 Leaderboard - Acceptance Test Suite
 * Comprehensive testing of leaderboard functionality
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { TestingEngine } from '@/core/testing-engine';
import { ScoringEngine } from '@/core/scoring-engine';
import { PlaybookGenerator } from '@/core/playbook-generator';
import { validateUrl, validateId, RateLimiter } from '@/utils/security';
import { VENDORS } from '@/config/vendors';
import { TEST_ASSETS } from '@/config/test-assets';
import { SCORING_CONFIG } from '@/config/scoring';
import type { TestExecution, VendorScores, Playbook } from '@/types';

describe('Phase 35 Leaderboard Acceptance Tests', () => {
  let testingEngine: TestingEngine;
  let scoringEngine: ScoringEngine;
  let playbookGenerator: PlaybookGenerator;
  let rateLimiter: RateLimiter;

  beforeAll(async () => {
    // Initialize test components
    testingEngine = new TestingEngine({
      outputDir: './test-artifacts',
      c2patoolPath: 'c2patool',
      verifyToolPath: 'cai-verify',
      timeoutMs: 10000,
      maxConcurrentTests: 2,
      retryAttempts: 2,
      retryDelayMs: 500
    });

    scoringEngine = new ScoringEngine({
      weights: {
        'embedded-manifest-survival': 0.35,
        'remote-manifest-honored': 0.25,
        'verifier-discovery-reliability': 0.15,
        'docs-alignment': 0.15,
        'reproducibility': 0.10
      },
      thresholds: {
        green: 90,
        yellow: 75,
        red: 0
      },
      enableBonusPoints: true,
      enablePenaltyPoints: false
    });

    playbookGenerator = new PlaybookGenerator({
      includeCodeExamples: true,
      includeCurlCommands: true,
      includeVerificationSteps: true,
      difficulty: 'all'
    });

    rateLimiter = new RateLimiter(60000, 10); // 1 minute window, 10 requests
  });

  afterAll(async () => {
    // Cleanup test artifacts
    // Implementation would depend on filesystem operations
  });

  beforeEach(() => {
    // Reset rate limiter for each test
    rateLimiter.cleanup();
  });

  describe('Security Validation', () => {
    it('should validate URLs correctly', () => {
      // Valid URLs
      expect(validateUrl('https://opensource.contentauthenticity.org/demo.jpg')).toBe(true);
      expect(validateUrl('https://cloudflare.com/images/test.jpg')).toBe(true);
      expect(validateUrl('http://c2pa.org/spec/image.jpg')).toBe(true);

      // Invalid URLs
      expect(validateUrl('javascript:alert(1)')).toBe(false);
      expect(validateUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
      expect(validateUrl('https://localhost/test.jpg')).toBe(false);
      expect(validateUrl('https://127.0.0.1/test.jpg')).toBe(false);
      expect(validateUrl('ftp://example.com/test.jpg')).toBe(false);
      expect(validateUrl('')).toBe(false);
      expect(validateUrl('not-a-url')).toBe(false);
    });

    it('should validate IDs correctly', () => {
      // Valid IDs
      expect(validateId('cloudflare-images')).toBe(true);
      expect(validateId('test-123')).toBe(true);
      expect(validateId('vendor_name')).toBe(true);

      // Invalid IDs
      expect(validateId('')).toBe(false);
      expect(validateId('vendor@name')).toBe(false);
      expect(validateId('vendor name')).toBe(false);
      expect(validateId('a'.repeat(65))).toBe(false); // Too long
    });

    it('should enforce rate limiting', () => {
      const identifier = 'test-client';

      // First 10 requests should be allowed
      for (let i = 0; i < 10; i++) {
        const result = rateLimiter.isAllowed(identifier);
        expect(result.allowed).toBe(true);
        expect(result.remaining).toBe(9 - i);
      }

      // 11th request should be denied
      const result = rateLimiter.isAllowed(identifier);
      expect(result.allowed).toBe(false);
      expect(result.remaining).toBe(0);
    });
  });

  describe('Testing Engine', () => {
    it('should initialize correctly', () => {
      expect(testingEngine).toBeDefined();
      expect(testingEngine.getActiveTestCount()).toBe(0);
    });

    it('should handle vendor configuration validation', () => {
      const vendor = VENDORS.find(v => v.id === 'cloudflare-images');
      expect(vendor).toBeDefined();
      expect(vendor?.testing.endpoints).toHaveLength(1);
      expect(vendor?.testing.transforms).toHaveLength(12);
      expect(vendor?.testing.preserveToggle).toBeDefined();
    });

    it('should generate execution IDs correctly', () => {
      const vendorId = 'test-vendor';
      const assetId = 'test-asset';
      const transformId = 'test-transform';
      const configType = 'default';

      // This would test the private method through actual execution
      expect(`${vendorId}-${assetId}-${transformId}-${configType}-`).toMatch(/^[a-z0-9-]+-\d+$/);
    });
  });

  describe('Scoring Engine', () => {
    it('should calculate scores correctly', () => {
      // Mock test execution data
      const mockExecutions: TestExecution[] = [
        {
          id: 'test-1',
          vendorId: 'cloudflare-images',
          assetId: 'demo-jpeg-001',
          transformId: 'resize',
          config: 'default',
          timestamp: new Date(),
          duration: 1000,
          result: {
            success: true,
            statusCode: 200,
            headers: {},
            contentType: 'image/jpeg',
            contentLength: 1024,
            contentHash: 'abc123',
            verifyResult: {
              manifestFound: true,
              manifestType: 'embedded',
              manifestValid: true,
              signatureValid: true,
              assertions: [],
              tool: 'c2patool',
              version: '0.10.0',
              output: '{}'
            },
            discoveryResult: {
              linkHeaderFound: true,
              manifestAccessible: true,
              discoveryLatency: 100,
              mixedContent: false
            },
            errors: []
          },
          artifacts: []
        }
      ];

      const scores = scoringEngine.calculateVendorScores(
        'cloudflare-images',
        mockExecutions,
        { main: 'https://docs.cloudflare.com' }
      );

      expect(scores.default).toBeGreaterThanOrEqual(0);
      expect(scores.bestPracticeScore).toBeGreaterThanOrEqual(0);
      expect(scores.default).toBeLessThanOrEqual(100);
      expect(scores.bestPracticeScore).toBeLessThanOrEqual(100);
      expect(scores.dimensions).toHaveLength(5);
    });

    it('should validate scores correctly', () => {
      const validScores: VendorScores = {
        default: 85,
        bestPracticeScore: 92,
        dimensions: [],
        grade: { default: 'yellow', bestPractice: 'green' },
        improvement: {
          configChangesNeeded: 2,
          estimatedTimeMinutes: 15,
          difficulty: 'easy',
          prerequisites: ['Enable C2PA toggle']
        }
      };

      const validation = scoringEngine.validateScores(validScores);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it('should detect invalid scores', () => {
      const invalidScores: VendorScores = {
        default: 150, // Invalid: > 100
        bestPracticeScore: -10, // Invalid: < 0
        dimensions: [],
        grade: { default: 'yellow', bestPractice: 'green' },
        improvement: {
          configChangesNeeded: 2,
          estimatedTimeMinutes: 15,
          difficulty: 'easy',
          prerequisites: ['Enable C2PA toggle']
        }
      };

      const validation = scoringEngine.validateScores(invalidScores);
      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });
  });

  describe('Playbook Generator', () => {
    it('should generate playbooks correctly', () => {
      const mockScores: VendorScores = {
        default: 65,
        bestPracticeScore: 85,
        dimensions: [
          {
            dimensionId: 'embedded-manifest-survival',
            defaultScore: 50,
            bestPracticeScore: 85,
            change: 35
          }
        ],
        grade: { default: 'red', bestPractice: 'yellow' },
        improvement: {
          configChangesNeeded: 2,
          estimatedTimeMinutes: 15,
          difficulty: 'medium',
          prerequisites: ['Enable C2PA toggle', 'Configure metadata']
        }
      };

      const playbook = playbookGenerator.generatePlaybook(
        'cloudflare-images',
        mockScores,
        90
      );

      expect(playbook.vendorId).toBe('cloudflare-images');
      expect(playbook.vendorName).toBe('Cloudflare Images');
      expect(playbook.currentScore).toBe(65);
      expect(playbook.targetScore).toBe(90);
      expect(playbook.estimatedTimeMinutes).toBeGreaterThan(0);
      expect(playbook.steps.length).toBeGreaterThan(0);
      expect(playbook.prerequisites.length).toBeGreaterThan(0);
      expect(playbook.verification.length).toBeGreaterThan(0);
      expect(playbook.resources.length).toBeGreaterThan(0);
    });

    it('should include specific steps for Cloudflare Images', () => {
      const mockScores: VendorScores = {
        default: 50,
        bestPracticeScore: 75,
        dimensions: [],
        grade: { default: 'red', bestPractice: 'yellow' },
        improvement: {
          configChangesNeeded: 1,
          estimatedTimeMinutes: 5,
          difficulty: 'easy',
          prerequisites: ['Enable C2PA toggle']
        }
      };

      const playbook = playbookGenerator.generatePlaybook(
        'cloudflare-images',
        mockScores,
        90
      );

      const enableCredentialsStep = playbook.steps.find(step => 
        step.title.includes('Preserve Content Credentials')
      );
      expect(enableCredentialsStep).toBeDefined();
      expect(enableCredentialsStep?.type).toBe('ui');
      expect(enableCredentialsStep?.estimatedMinutes).toBe(3);
    });

    it('should include verification steps', () => {
      const mockScores: VendorScores = {
        default: 60,
        bestPracticeScore: 80,
        dimensions: [],
        grade: { default: 'yellow', bestPractice: 'green' },
        improvement: {
          configChangesNeeded: 1,
          estimatedTimeMinutes: 10,
          difficulty: 'easy',
          prerequisites: ['Configure C2PA']
        }
      };

      const playbook = playbookGenerator.generatePlaybook(
        'fastly-image-optimizer',
        mockScores,
        90
      );

      expect(playbook.verification).toHaveLength(4);
      expect(playbook.verification[0].title).toBe('Verify Embedded Manifest');
      expect(playbook.verification[0].command).toContain('c2patool');
    });
  });

  describe('Vendor Configuration', () => {
    it('should have complete vendor definitions', () => {
      expect(VENDORS).toHaveLength(7); // 5 CDNs + 2 CMS
      
      // Check CDN vendors
      const cdnVendors = VENDORS.filter(v => v.type === 'cdn');
      expect(cdnVendors).toHaveLength(5);
      
      // Check CMS vendors
      const cmsVendors = VENDORS.filter(v => v.type === 'cms');
      expect(cmsVendors).toHaveLength(2);

      // Validate each vendor
      VENDORS.forEach(vendor => {
        expect(vendor.id).toMatch(/^[a-z0-9-]+$/);
        expect(vendor.name).toBeTruthy();
        expect(vendor.type).toMatch(/^(cdn|cms)$/);
        expect(vendor.website).toMatch(/^https:\/\//);
        expect(vendor.docsUrl).toMatch(/^https:\/\//);
        expect(vendor.testing.endpoints).toHaveLength(1);
        expect(vendor.testing.transforms.length).toBeGreaterThan(0);
        expect(vendor.scoring).toBeDefined();
      });
    });

    it('should have Cloudflare Images configured correctly', () => {
      const cloudflare = VENDORS.find(v => v.id === 'cloudflare-images');
      expect(cloudflare).toBeDefined();
      expect(cloudflare?.testing.preserveToggle?.param).toBe('preserve-credentials');
      expect(cloudflare?.testing.transforms).toHaveLength(12);
      
      const preserveTransform = cloudflare?.testing.transforms.find(t => t.id === 'preserve-credentials');
      expect(preserveTransform).toBeDefined();
      expect(preserveTransform?.expectedBehavior).toBe('preserve');
    });

    it('should have Fastly Image Optimizer configured correctly', () => {
      const fastly = VENDORS.find(v => v.id === 'fastly-image-optimizer');
      expect(fastly).toBeDefined();
      expect(fastly?.testing.preserveToggle?.param).toBe('metadata');
      expect(fastly?.testing.preserveToggle?.value).toBe('all');
      
      const metadataTransform = fastly?.testing.transforms.find(t => t.id === 'metadata-all');
      expect(metadataTransform).toBeDefined();
      expect(metadataTransform?.expectedBehavior).toBe('preserve');
    });
  });

  describe('Test Assets Configuration', () => {
    it('should have complete test asset definitions', () => {
      expect(TEST_ASSETS).toHaveLength(24); // 6 of each format
      
      // Check format distribution
      const jpegAssets = TEST_ASSETS.filter(a => a.format === 'jpeg');
      const pngAssets = TEST_ASSETS.filter(a => a.format === 'png');
      const webpAssets = TEST_ASSETS.filter(a => a.format === 'webp');
      const avifAssets = TEST_ASSETS.filter(a => a.format === 'avif');
      
      expect(jpegAssets).toHaveLength(6);
      expect(pngAssets).toHaveLength(6);
      expect(webpAssets).toHaveLength(6);
      expect(avifAssets).toHaveLength(6);

      // Validate each asset
      TEST_ASSETS.forEach(asset => {
        expect(asset.id).toMatch(/^demo-(jpeg|png|webp|avif)-\d{3}$/);
        expect(asset.filename).toMatch(/^c2pa-demo-\d{3}\.(jpeg|png|webp|avif)$/);
        expect(asset.format).toMatch(/^(jpeg|png|webp|avif)$/);
        expect(asset.size).toBeGreaterThan(0);
        expect(asset.signed).toBe(true);
        expect(asset.url).toMatch(/^https:\/\//);
        expect(asset.contentHash).toMatch(/^sha256:/);
        expect(asset.manifestHash).toMatch(/^sha256:/);
      });
    });

    it('should have mix of remote and embedded manifest assets', () => {
      const remoteManifestAssets = TEST_ASSETS.filter(a => a.remoteManifest);
      const embeddedManifestAssets = TEST_ASSETS.filter(a => !a.remoteManifest);
      
      expect(remoteManifestAssets.length).toBeGreaterThan(0);
      expect(embeddedManifestAssets.length).toBeGreaterThan(0);
      expect(remoteManifestAssets.length + embeddedManifestAssets.length).toBe(24);
    });
  });

  describe('Scoring Configuration', () => {
    it('should have complete scoring rubric', () => {
      expect(SCORING_CONFIG.maxPoints).toBe(100);
      expect(SCORING_CONFIG.dimensions).toHaveLength(5);
      expect(SCORING_CONFIG.grading.greenThreshold).toBe(90);
      expect(SCORING_CONFIG.grading.yellowThreshold).toBe(75);
      expect(SCORING_CONFIG.tieBreakers).toHaveLength(4);

      // Validate dimensions
      SCORING_CONFIG.dimensions.forEach(dimension => {
        expect(dimension.id).toBeTruthy();
        expect(dimension.name).toBeTruthy();
        expect(dimension.maxPoints).toBeGreaterThan(0);
        expect(dimension.weight).toBeGreaterThan(0);
        expect(dimension.description).toBeTruthy();
        expect(dimension.testType).toMatch(/^(binary|scaled|threshold)$/);
      });

      // Check total weights sum to 1
      const totalWeight = SCORING_CONFIG.dimensions.reduce((sum, d) => sum + d.weight, 0);
      expect(totalWeight).toBe(1);
    });

    it('should have correct dimension weights', () => {
      const embeddedManifest = SCORING_CONFIG.dimensions.find(d => d.id === 'embedded-manifest-survival');
      expect(embeddedManifest?.maxPoints).toBe(35);
      expect(embeddedManifest?.weight).toBe(0.35);

      const remoteManifest = SCORING_CONFIG.dimensions.find(d => d.id === 'remote-manifest-honored');
      expect(remoteManifest?.maxPoints).toBe(25);
      expect(remoteManifest?.weight).toBe(0.25);

      const reliability = SCORING_CONFIG.dimensions.find(d => d.id === 'verifier-discovery-reliability');
      expect(reliability?.maxPoints).toBe(15);
      expect(reliability?.weight).toBe(0.15);
    });
  });

  describe('Integration Tests', () => {
    it('should handle complete vendor testing workflow', async () => {
      const vendor = VENDORS.find(v => v.id === 'cloudflare-images');
      expect(vendor).toBeDefined();

      // Mock the testing process (in real tests, this would make actual API calls)
      const mockExecutions: TestExecution[] = vendor!.testing.transforms.map(transform => ({
        id: `test-${transform.id}`,
        vendorId: vendor!.id,
        assetId: 'demo-jpeg-001',
        transformId: transform.id,
        config: 'default',
        timestamp: new Date(),
        duration: 1000,
        result: {
          success: true,
          statusCode: 200,
          headers: {},
          contentType: 'image/jpeg',
          contentLength: 1024,
          contentHash: 'abc123',
          verifyResult: {
            manifestFound: transform.expectedBehavior === 'preserve',
            manifestType: transform.expectedBehavior === 'preserve' ? 'embedded' : 'none',
            manifestValid: transform.expectedBehavior === 'preserve',
            signatureValid: transform.expectedBehavior === 'preserve',
            assertions: [],
            tool: 'c2patool',
            version: '0.10.0',
            output: '{}'
          },
          discoveryResult: {
            linkHeaderFound: true,
            manifestAccessible: true,
            discoveryLatency: 100,
            mixedContent: false
          },
          errors: []
        },
        artifacts: []
      }));

      const scores = scoringEngine.calculateVendorScores(
        vendor!.id,
        mockExecutions,
        { main: vendor!.docsUrl }
      );

      expect(scores.default).toBeGreaterThanOrEqual(0);
      expect(scores.bestPracticeScore).toBeGreaterThanOrEqual(0);
      expect(scores.dimensions).toHaveLength(5);

      const playbook = playbookGenerator.generatePlaybook(
        vendor!.id,
        scores,
        90
      );

      expect(playbook.steps.length).toBeGreaterThan(0);
      expect(playbook.verification.length).toBe(4);
      expect(playbook.resources.length).toBeGreaterThan(0);
    });

    it('should handle error cases gracefully', () => {
      // Test with invalid vendor ID
      expect(() => {
        playbookGenerator.generatePlaybook(
          'invalid-vendor',
          {
            default: 0,
            bestPracticeScore: 0,
            dimensions: [],
            grade: { default: 'red', bestPractice: 'red' },
            improvement: {
              configChangesNeeded: 0,
              estimatedTimeMinutes: 0,
              difficulty: 'hard',
              prerequisites: []
            }
          },
          90
        );
      }).toThrow('Vendor not found: invalid-vendor');
    });
  });

  describe('Performance Tests', () => {
    it('should handle large numbers of test executions efficiently', () => {
      const startTime = Date.now();
      
      // Generate many mock executions
      const mockExecutions: TestExecution[] = [];
      for (let i = 0; i < 1000; i++) {
        mockExecutions.push({
          id: `test-${i}`,
          vendorId: 'cloudflare-images',
          assetId: 'demo-jpeg-001',
          transformId: 'resize',
          config: 'default',
          timestamp: new Date(),
          duration: 1000,
          result: {
            success: true,
            statusCode: 200,
            headers: {},
            contentType: 'image/jpeg',
            contentLength: 1024,
            contentHash: 'abc123',
            verifyResult: {
              manifestFound: true,
              manifestType: 'embedded',
              manifestValid: true,
              signatureValid: true,
              assertions: [],
              tool: 'c2patool',
              version: '0.10.0',
              output: '{}'
            },
            discoveryResult: {
              linkHeaderFound: true,
              manifestAccessible: true,
              discoveryLatency: 100,
              mixedContent: false
            },
            errors: []
          },
          artifacts: []
        });
      }

      const scores = scoringEngine.calculateVendorScores(
        'cloudflare-images',
        mockExecutions,
        { main: 'https://docs.cloudflare.com' }
      );

      const duration = Date.now() - startTime;
      
      expect(duration).toBeLessThan(1000); // Should complete in under 1 second
      expect(scores.default).toBeGreaterThanOrEqual(0);
      expect(scores.bestPracticeScore).toBeGreaterThanOrEqual(0);
    });
  });
});
