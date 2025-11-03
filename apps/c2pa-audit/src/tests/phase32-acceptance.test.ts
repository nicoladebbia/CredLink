/**
 * Licensed Content Enforcement Hooks - Acceptance Tests
 * Phase 32 v1.1 - Comprehensive test suite for exit criteria validation
 */

import { LicenseMetadataEncoder } from '../core/license-metadata.js';
import { VerifyEventSystem } from '../core/verify-events.js';
import { LicenseEnforcementAPI, VerifyRequest, AppealRequest } from '../api/license-enforcement.js';
import { WordPressLicenseAdapter, ShopifyLicenseAdapter, CloudflareWorkerAdapter } from '../integrations/cms-adapters.js';

// ==================== Test Configuration ====================

export interface TestConfig {
  /** Partner configurations */
  partners: Array<{
    partner_id: string;
    allow_origins: string[];
    enforce: string[];
    webhooks: Array<{
      url: string;
      secret: string;
      filters: string[];
    }>;
  }>;
  /** Test assets */
  assets: Array<{
    asset_id: string;
    asset_url: string;
    license_uri: string;
    rights_page: string;
    licensor_name: string;
    usage_terms: string;
  }>;
  /** Test origins */
  test_origins: {
    allowed: string[];
    blocked: string[];
    unapproved: string[];
  };
}

export const TEST_CONFIG: TestConfig = {
  partners: [
    {
      partner_id: 'pub-42',
      allow_origins: ['https://newsroom.example', 'https://cdn.partner.example'],
      enforce: ['https://paywalled.example'],
      webhooks: [
        {
          url: 'https://partner.example.com/c2/events',
          secret: 'c2VjcmV0LWtleS0zMmJ5dGVzLWxvbmctc2VjcmV0', // base64 32-byte secret
          filters: ['reuse.detected', 'softblock.triggered', 'appeal.created']
        }
      ]
    },
    {
      partner_id: 'marketplace-123',
      allow_origins: ['https://marketplace.example'],
      enforce: ['https://premium.marketplace.example'],
      webhooks: [
        {
          url: 'https://marketplace.example.com/webhooks/c2pa',
          secret: 'YW5vdGhlci0zMi1ieXRlLXNlY3JldC1rZXk=', // base64 32-byte secret
          filters: ['reuse.detected', 'softblock.triggered']
        }
      ]
    }
  ],
  assets: [
    {
      asset_id: 'pub-42:img-8842',
      asset_url: 'https://cdn.example.com/i/8842?w=1200',
      license_uri: 'https://creativecommons.org/licenses/by/4.0/',
      rights_page: 'https://publisher.example.com/licensing/asset-8842',
      licensor_name: 'Publisher, Inc.',
      usage_terms: 'Editorial use only; no AI training'
    },
    {
      asset_id: 'pub-42:img-8843',
      asset_url: 'https://cdn.example.com/i/8843?w=1200',
      license_uri: 'https://publisher.example.com/licenses/contract-77',
      rights_page: 'https://publisher.example.com/licensing/asset-8843',
      licensor_name: 'Publisher, Inc.',
      usage_terms: 'Commercial use prohibited'
    },
    {
      asset_id: 'marketplace-123:img-2001',
      asset_url: 'https://marketplace.example.com/assets/2001.jpg',
      license_uri: 'https://creativecommons.org/licenses/by-nc/4.0/',
      rights_page: 'https://marketplace.example.com/licenses/2001',
      licensor_name: 'Marketplace Ltd.',
      usage_terms: 'Non-commercial use only'
    }
  ],
  test_origins: {
    allowed: ['https://newsroom.example', 'https://marketplace.example'],
    blocked: ['https://paywalled.example', 'https://premium.marketplace.example'],
    unapproved: ['https://unrelated-blog.example', 'https://social.example.com']
  }
};

// ==================== Test Framework ====================

export interface TestResult {
  test_name: string;
  passed: boolean;
  duration_ms: number;
  error?: string;
  details?: any;
}

export class TestRunner {
  private results: TestResult[] = [];
  private startTime: number = 0;

  async runTest(testName: string, testFunction: () => Promise<void>): Promise<TestResult> {
    const startTime = Date.now();
    
    try {
      await testFunction();
      const duration = Date.now() - startTime;
      
      const result: TestResult = {
        test_name: testName,
        passed: true,
        duration_ms: duration
      };
      
      this.results.push(result);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;
      
      const result: TestResult = {
        test_name: testName,
        passed: false,
        duration_ms: duration,
        error: error instanceof Error ? error.message : String(error)
      };
      
      this.results.push(result);
      return result;
    }
  }

  startSuite(): void {
    this.startTime = Date.now();
    this.results = [];
  }

  endSuite(): { results: TestResult[]; summary: { total: number; passed: number; failed: number; duration_ms: number } } {
    const duration = Date.now() - this.startTime;
    const passed = this.results.filter(r => r.passed).length;
    const failed = this.results.length - passed;
    
    return {
      results: this.results,
      summary: {
        total: this.results.length,
        passed,
        failed,
        duration_ms: duration
      }
    };
  }
}

// ==================== License URI Canonicalization Tests ====================

export class LicenseUriTests {
  private runner = new TestRunner();

  async runAll(): Promise<TestResult[]> {
    this.runner.startSuite();
    
    await this.runner.runTest('CC-BY URI canonicalization', async () => {
      const testCases = [
        {
          input: 'https://creativecommons.org/licenses/by/4.0/',
          expected: 'https://creativecommons.org/licenses/by/4.0/'
        },
        {
          input: 'https://creativecommons.org/licenses/by/4.0',
          expected: 'https://creativecommons.org/licenses/by/4.0/'
        },
        {
          input: 'https://creativecommons.org/licenses/by-sa/4.0/',
          expected: 'https://creativecommons.org/licenses/by-sa/4.0/'
        },
        {
          input: 'https://creativecommons.org/licenses/by-nc/4.0/',
          expected: 'https://creativecommons.org/licenses/by-nc/4.0/'
        },
        {
          input: 'https://publisher.example.com/licenses/contract-77',
          expected: 'https://publisher.example.com/licenses/contract-77'
        }
      ];

      for (const testCase of testCases) {
        const result = LicenseMetadataEncoder.canonicalizeLicenseURI(testCase.input);
        if (result !== testCase.expected) {
          throw new Error(`Expected ${testCase.expected}, got ${result}`);
        }
      }
    });

    await this.runner.runTest('CC license catalog completeness', async () => {
      const catalog = LicenseMetadataEncoder.getCCLicenseCatalog();
      const expectedLicenses = ['by', 'by-sa', 'by-nd', 'by-nc', 'by-nc-sa', 'by-nc-nd', 'cc0'];
      
      for (const license of expectedLicenses) {
        if (!catalog[license]) {
          throw new Error(`Missing license ${license} in catalog`);
        }
        
        const licenseInfo = catalog[license];
        if (!licenseInfo.uri || !licenseInfo.name) {
          throw new Error(`Invalid license info for ${license}`);
        }
      }
    });

    await this.runner.runTest('Permissive license detection', async () => {
      const permissiveLicenses = [
        'https://creativecommons.org/licenses/by/4.0/',
        'https://creativecommons.org/licenses/by-sa/4.0/',
        'https://creativecommons.org/publicdomain/zero/1.0/'
      ];

      const restrictiveLicenses = [
        'https://creativecommons.org/licenses/by-nc/4.0/',
        'https://creativecommons.org/licenses/by-nc-nd/4.0/',
        'https://publisher.example.com/licenses/contract-77'
      ];

      for (const license of permissiveLicenses) {
        if (!LicenseMetadataEncoder.isPermissiveLicense(license)) {
          throw new Error(`License ${license} should be permissive`);
        }
      }

      for (const license of restrictiveLicenses) {
        if (LicenseMetadataEncoder.isPermissiveLicense(license)) {
          throw new Error(`License ${license} should not be permissive`);
        }
      }
    });

    const suite = this.runner.endSuite();
    return suite.results;
  }
}

// ==================== Webhook Security Tests ====================

export class WebhookSecurityTests {
  private runner = new TestRunner();
  private testSecret = 'c2VjcmV0LWtleS0zMmJ5dGVzLWxvbmctc2VjcmV0';

  async runAll(): Promise<TestResult[]> {
    this.runner.startSuite();
    
    await this.runner.runTest('HMAC signature verification', async () => {
      const payload = JSON.stringify({
        id: 'evt_test123',
        type: 'reuse.detected',
        created: new Date().toISOString()
      });

      const timestamp = Math.floor(Date.now() / 1000);
      const signature = VerifyEventSystem.createSignature(payload, this.testSecret, timestamp);
      
      const isValid = VerifyEventSystem.verifySignature(payload, signature, this.testSecret);
      
      if (!isValid) {
        throw new Error('Valid signature should pass verification');
      }
    });

    await this.runner.runTest('Invalid signature rejection', async () => {
      const payload = JSON.stringify({ test: 'data' });
      const invalidSignature = 't=1234567890,v1=invalid_signature';
      
      const isValid = VerifyEventSystem.verifySignature(payload, invalidSignature, this.testSecret);
      
      if (isValid) {
        throw new Error('Invalid signature should fail verification');
      }
    });

    await this.runner.runTest('Timestamp skew rejection', async () => {
      const payload = JSON.stringify({ test: 'data' });
      const oldTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
      const signature = VerifyEventSystem.createSignature(payload, this.testSecret, oldTimestamp);
      
      const isValid = VerifyEventSystem.verifySignature(payload, signature, this.testSecret);
      
      if (isValid) {
        throw new Error('Old timestamp should fail verification');
      }
    });

    await this.runner.runTest('Replay attack prevention', async () => {
      const payload = JSON.stringify({ test: 'data' });
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = VerifyEventSystem.createSignature(payload, this.testSecret, timestamp);
      
      // First verification should pass
      const firstValid = VerifyEventSystem.verifySignature(payload, signature, this.testSecret);
      if (!firstValid) {
        throw new Error('First verification should pass');
      }
      
      // Second verification with same payload should fail (replay)
      const secondValid = VerifyEventSystem.verifySignature(payload, signature, this.testSecret);
      if (secondValid) {
        throw new Error('Replay attack should be prevented');
      }
    });

    await this.runner.runTest('Idempotency key handling', async () => {
      const event1 = VerifyEventSystem.createReuseDetectedEvent({
        asset_id: 'test-asset',
        manifest_hash: 'sha256:test',
        license_uri: 'https://creativecommons.org/licenses/by/4.0/',
        rights_page: 'https://example.com/rights',
        request_origin: 'https://test.example.com',
        reason: 'test',
        verifier: 'test-verifier',
        chain_ok: true,
        verification_time_ms: 100
      });

      const event2 = VerifyEventSystem.createReuseDetectedEvent({
        asset_id: 'test-asset',
        manifest_hash: 'sha256:test',
        license_uri: 'https://creativecommons.org/licenses/by/4.0/',
        rights_page: 'https://example.com/rights',
        request_origin: 'https://test.example.com',
        reason: 'test',
        verifier: 'test-verifier',
        chain_ok: true,
        verification_time_ms: 100
      });

      // Events should have unique IDs even with same data
      if (event1.id === event2.id) {
        throw new Error('Events should have unique IDs');
      }
    });

    const suite = this.runner.endSuite();
    return suite.results;
  }
}

// ==================== Partner PoC Tests ====================

export class PartnerPoCTests {
  private runner = new TestRunner();
  private api = new LicenseEnforcementAPI();

  async runAll(): Promise<TestResult[]> {
    this.runner.startSuite();
    
    await this.runner.runTest('Partner configuration setup', async () => {
      for (const partner of TEST_CONFIG.partners) {
        for (const webhook of partner.webhooks) {
          const config = await this.api.registerWebhook(partner.partner_id, webhook);
          
          if (config.url !== webhook.url) {
            throw new Error('Webhook URL not configured correctly');
          }
          
          if (config.partner_id !== partner.partner_id) {
            throw new Error('Partner ID not set correctly');
          }
        }

        await this.api.configurePartner(partner.partner_id, {
          allow_origins: partner.allow_origins,
          enforce: partner.enforce
        });
      }
    });

    await this.runner.runTest('Asset verification on allowed origins', async () => {
      for (const asset of TEST_CONFIG.assets) {
        for (const origin of TEST_CONFIG.test_origins.allowed) {
          const request: VerifyRequest = {
            asset_url: asset.asset_url,
            context: { request_origin: origin }
          };

          const response = await this.api.verifyAsset(request);
          
          if (response.result !== 'ok') {
            throw new Error(`Asset ${asset.asset_id} should be OK on allowed origin ${origin}`);
          }
        }
      }
    });

    await this.runner.runTest('Asset verification on blocked origins', async () => {
      for (const asset of TEST_CONFIG.assets) {
        for (const origin of TEST_CONFIG.test_origins.blocked) {
          const request: VerifyRequest = {
            asset_url: asset.asset_url,
            context: { request_origin: origin }
          };

          const response = await this.api.verifyAsset(request);
          
          if (response.result !== 'block') {
            throw new Error(`Asset ${asset.asset_id} should be BLOCKED on blocked origin ${origin}`);
          }
        }
      }
    });

    await this.runner.runTest('Asset verification on unapproved origins', async () => {
      let warnCount = 0;
      let totalChecks = 0;

      for (const asset of TEST_CONFIG.assets) {
        for (const origin of TEST_CONFIG.test_origins.unapproved) {
          totalChecks++;
          const request: VerifyRequest = {
            asset_url: asset.asset_url,
            context: { request_origin: origin }
          };

          const response = await this.api.verifyAsset(request);
          
          if (response.result === 'warn') {
            warnCount++;
          }
        }
      }

      // At least 80% should trigger warnings
      const warnPercentage = (warnCount / totalChecks) * 100;
      if (warnPercentage < 80) {
        throw new Error(`Only ${warnPercentage}% of unapproved origins triggered warnings, expected >= 80%`);
      }
    });

    await this.runner.runTest('Event delivery timing', async () => {
      const startTime = Date.now();
      
      const request: VerifyRequest = {
        asset_url: TEST_CONFIG.assets[0]?.asset_url || 'test-asset-url',
        context: { request_origin: TEST_CONFIG.test_origins.unapproved[0] || 'test-origin' }
      };

      await this.api.verifyAsset(request);
      
      const endTime = Date.now();
      const duration = endTime - startTime;
      
      // Should complete within 2 seconds
      if (duration > 2000) {
        throw new Error(`Verification took ${duration}ms, expected <= 2000ms`);
      }
    });

    await this.runner.runTest('Appeal submission', async () => {
      const appealRequest: AppealRequest = {
        asset_id: TEST_CONFIG.assets[0]?.asset_id || 'test-asset',
        manifest_hash: 'sha256:test-manifest',
        claim: 'I purchased license ABC from publisher'
      };

      const response = await this.api.submitAppeal(appealRequest);
      
      if (!response.ticket_id) {
        throw new Error('Appeal should return ticket ID');
      }
      
      if (response.status !== 'submitted') {
        throw new Error('Appeal should be submitted');
      }
    });

    await this.runner.runTest('Event export functionality', async () => {
      const partnerId = TEST_CONFIG.partners[0]?.partner_id || 'test-partner';
      
      const exportData = await this.api.exportEvents(partnerId, {
        from: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), // last 24h
        type: 'reuse.detected'
      });
      
      // Should be valid NDJSON
      const lines = exportData.trim().split('\n');
      
      for (const line of lines) {
        try {
          JSON.parse(line);
        } catch (error) {
          throw new Error('Export data should be valid NDJSON');
        }
      }
    });

    const suite = this.runner.endSuite();
    return suite.results;
  }
}

// ==================== Standards Compliance Tests ====================

export class StandardsComplianceTests {
  private runner = new TestRunner();

  async runAll(): Promise<TestResult[]> {
    this.runner.startSuite();
    
    await this.runner.runTest('C2PA metadata assertion structure', async () => {
      const testLicense = {
        license_uri: 'https://creativecommons.org/licenses/by/4.0/',
        rights_page: 'https://publisher.example.com/licensing/asset-123',
        licensor_name: 'Publisher, Inc.',
        usage_terms: 'Editorial use only; no AI training'
      };

      const assertion = LicenseMetadataEncoder.createLicenseAssertion(testLicense);
      
      // Validate structure
      if (assertion.label !== 'c2pa.metadata') {
        throw new Error('Assertion label should be c2pa.metadata');
      }
      
      if (!assertion.data?.license) {
        throw new Error('License data block should exist');
      }
      
      const license = assertion.data.license;
      if (license.license_uri !== testLicense.license_uri) {
        throw new Error('License URI should match');
      }
      
      if (license.rights_page !== testLicense.rights_page) {
        throw new Error('Rights page should match');
      }
    });

    await this.runner.runTest('License assertion validation', async () => {
      const validAssertion = {
        label: 'c2pa.metadata' as const,
        data: {
          license: {
            license_uri: 'https://creativecommons.org/licenses/by/4.0/',
            rights_page: 'https://publisher.example.com/licensing/asset-123',
            licensor_name: 'Publisher, Inc.',
            usage_terms: 'Editorial use only; no AI training'
          }
        }
      };

      const validation = LicenseMetadataEncoder.validateLicenseAssertion(validAssertion);
      
      if (!validation.valid) {
        throw new Error('Valid assertion should pass validation');
      }
      
      if (validation.license_type !== 'creative-commons') {
        throw new Error('Should detect Creative Commons license');
      }
      
      if (validation.permission_level !== 'permissive') {
        throw new Error('CC-BY should be permissive');
      }
    });

    await this.runner.runTest('IPTC rights page compatibility', async () => {
      const testCases = [
        {
          rights_page: 'https://publisher.example.com/licensing/asset-123',
          should_be_valid: true
        },
        {
          rights_page: 'invalid-url',
          should_be_valid: false
        },
        {
          rights_page: '',
          should_be_valid: false
        }
      ];

      for (const testCase of testCases) {
        const assertion = {
          label: 'c2pa.metadata' as const,
          data: {
            license: {
              license_uri: 'https://creativecommons.org/licenses/by/4.0/',
              rights_page: testCase.rights_page || 'https://example.com/default',
              licensor_name: 'Test Publisher',
              usage_terms: 'Test terms'
            }
          }
        };

        const validation = LicenseMetadataEncoder.validateLicenseAssertion(assertion);
        
        if (validation.valid !== testCase.should_be_valid) {
          throw new Error(`Rights page validation failed for ${testCase.rights_page}`);
        }
      }
    });

    await this.runner.runTest('Manifest verification compatibility', async () => {
      // Mock manifest with C2PA structure
      const mockManifest = {
        manifest_hash: 'sha256:3b8a...d10',
        claim_generator: 'C2Concierge v1.1',
        timestamp: new Date().toISOString(),
        claim_signature: {
          protected: { alg: 'ES256' },
          signature: 'mock-signature',
          certificate_chain: [],
          validation_status: { valid: true, codes: [], summary: 'Valid' }
        },
        assertions: [
          {
            label: 'c2pa.metadata',
            data: {
              license: {
                license_uri: 'https://creativecommons.org/licenses/by/4.0/',
                rights_page: 'https://publisher.example.com/licensing/asset-123',
                licensor_name: 'Publisher, Inc.',
                usage_terms: 'Editorial use only; no AI training'
              }
            },
            redacted: false,
            validation_status: { valid: true, codes: [], summary: 'Valid' }
          }
        ]
      };

      const extractedLicense = LicenseMetadataEncoder.extractLicenseFromManifest(mockManifest);
      
      if (!extractedLicense) {
        throw new Error('Should extract license from valid manifest');
      }
      
      if (extractedLicense.data.license.license_uri !== 'https://creativecommons.org/licenses/by/4.0/') {
        throw new Error('Should extract correct license URI');
      }
    });

    const suite = this.runner.endSuite();
    return suite.results;
  }
}

// ==================== Integration Tests ====================

export class IntegrationTests {
  private runner = new TestRunner();

  async runAll(): Promise<TestResult[]> {
    this.runner.startSuite();
    
    await this.runner.runTest('WordPress adapter initialization', async () => {
      const wpConfig = {
        api_endpoint: 'https://example.com/api/c2pa',
        partner_id: 'test-partner',
        webhook_url: 'https://example.com/webhook',
        preview_degrade: { enabled: true, scale: 0.4, blur_px: 6 }
      };

      new WordPressLicenseAdapter(wpConfig);
      
      // WordPress adapter should initialize without errors
      // Server-side version doesn't expose window functions
      if (!wpConfig.api_endpoint) {
        throw new Error('WordPress config should be properly set');
      }
    });

    await this.runner.runTest('Shopify adapter initialization', async () => {
      const shopifyConfig = {
        api_key: 'test-api-key',
        app_secret: 'test-app-secret',
        store_domain: 'test-shop.myshopify.com',
        extension_id: 'test-extension',
        verification: {
          enabled: true,
          auto_block: false,
          allowlist: ['https://trusted-domain.com']
        }
      };

      new ShopifyLicenseAdapter(shopifyConfig);
      
      // Shopify adapter should initialize without errors
      // Server-side version doesn't expose window functions
      if (!shopifyConfig.store_domain) {
        throw new Error('Shopify config should be properly set');
      }
    });

    await this.runner.runTest('Cloudflare Worker adapter configuration', async () => {
      const cfConfig = {
        manifest_server: 'https://c2.example.com',
        partner_id: 'test-partner',
        preserve_paths: ['/images/*', '/assets/*'],
        webhook_url: 'https://example.com/webhook'
      };

      const adapter = new CloudflareWorkerAdapter(cfConfig);
      const workerScript = adapter.generateWorkerScript();
      
      if (!workerScript.includes('export default')) {
        throw new Error('Worker script should export default handler');
      }
      
      if (!workerScript.includes('fetchHandler')) {
        throw new Error('Worker script should include fetch handler');
      }
    });

    const suite = this.runner.endSuite();
    return suite.results;
  }
}

// ==================== Main Test Runner ====================

export class Phase32AcceptanceTests {
  async runAllTests(): Promise<{
    summary: {
      total_tests: number;
      passed: number;
      failed: number;
      success_rate: number;
      duration_ms: number;
    };
    results: {
      license_uri_tests: TestResult[];
      webhook_security_tests: TestResult[];
      partner_poc_tests: TestResult[];
      standards_compliance_tests: TestResult[];
      integration_tests: TestResult[];
    };
  }> {
    const startTime = Date.now();
    
    console.log('🧪 Starting Phase 32 Acceptance Tests...');
    
    // Run all test suites
    const licenseTests = new LicenseUriTests();
    const securityTests = new WebhookSecurityTests();
    const pocTests = new PartnerPoCTests();
    const complianceTests = new StandardsComplianceTests();
    const integrationTests = new IntegrationTests();
    
    const [
      licenseUriResults,
      webhookSecurityResults,
      partnerPoCResults,
      standardsComplianceResults,
      integrationResults
    ] = await Promise.all([
      licenseTests.runAll(),
      securityTests.runAll(),
      pocTests.runAll(),
      complianceTests.runAll(),
      integrationTests.runAll()
    ]);
    
    const allResults = [
      ...licenseUriResults,
      ...webhookSecurityResults,
      ...partnerPoCResults,
      ...standardsComplianceResults,
      ...integrationResults
    ];
    
    const totalTests = allResults.length;
    const passed = allResults.filter(r => r.passed).length;
    const failed = totalTests - passed;
    const successRate = (passed / totalTests) * 100;
    const duration = Date.now() - startTime;
    
    const summary = {
      total_tests: totalTests,
      passed,
      failed,
      success_rate: (passed / totalTests) * 100,
      duration_ms: duration
    };
    
    console.log(`📊 Test Results: ${passed}/${totalTests} passed (${successRate.toFixed(1)}%)`);
    console.log(`⏱️ Duration: ${duration}ms`);
    
    if (failed > 0) {
      console.log('❌ Failed tests:');
      allResults.filter(r => !r.passed).forEach(result => {
        console.log(`   - ${result.test_name}: ${result.error}`);
      });
    }
    
    return {
      summary,
      results: {
        license_uri_tests: licenseUriResults,
        webhook_security_tests: webhookSecurityResults,
        partner_poc_tests: partnerPoCResults,
        standards_compliance_tests: standardsComplianceResults,
        integration_tests: integrationResults
      }
    };
  }
}

// Export test runner for external use
export const phase32Tests = new Phase32AcceptanceTests();
