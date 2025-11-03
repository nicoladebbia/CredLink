/**
 * Phase 36 Billing - Acceptance Tests
 * Comprehensive test suite for self-serve onboarding & billing
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import axios from 'axios';
import { randomBytes } from 'crypto';
import {
  TenantService,
  StripeService,
  OnboardingService,
  UsageService,
  InstallHealthService,
  ExportService,
  CaiVerifyService,
  RFC3161Service,
} from '@/services';
import {
  CreateTenantRequest,
  WizardStep,
  UsageEvent,
  InstallCheckRequest,
  CancelTenantRequest,
  RFC3161TimestampRequest,
} from '@/types';

describe('Phase 36 Billing - Acceptance Tests', () => {
  // Test configuration
  const testConfig = {
    baseUrl: process.env['TEST_BASE_URL'] || 'http://localhost:3002',
    stripe: {
      secretKey: process.env['STRIPE_SECRET_KEY'] || 'sk_test_...',
      webhookSecret: process.env['STRIPE_WEBHOOK_SECRET'] || 'whsec_...',
    },
    redis: {
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379'),
    },
    timeout: 30000,
  };

  let services: {
    tenant: TenantService;
    stripe: StripeService;
    onboarding: OnboardingService;
    usage: UsageService;
    installHealth: InstallHealthService;
    export: ExportService;
    caiVerify: CaiVerifyService;
    rfc3161: RFC3161Service;
  };

  let testTenant: {
    id: string;
    apiKey: string;
    email: string;
    stripeCustomerId: string;
    stripeSubscriptionId: string;
  };

  beforeAll(async () => {
    // Initialize services for testing
    // Note: In a real test environment, you'd initialize these with test configurations
    console.log('Initializing Phase 36 test services...');
  });

  afterAll(async () => {
    // Cleanup test data
    if (testTenant?.id) {
      try {
        await cleanupTestTenant(testTenant.id);
      } catch (error) {
        console.error('Failed to cleanup test tenant:', error);
      }
    }
  });

  beforeEach(async () => {
    // Reset test state
  });

  describe('Tenant Provisioning', () => {
    it('should create a new tenant with Stripe integration', async () => {
      const request: CreateTenantRequest = {
        email: `test-${randomBytes(8).toString('hex')}@example.com`,
        company_name: 'Test Company Inc',
        plan: 'starter',
        payment_method_id: 'pm_test_visa', // Test payment method
        domains: ['https://test.example.com'],
        cms: 'wordpress',
        manifest_host: 'https://test-manifest.example.com',
      };

      const response = await axios.post(
        `${testConfig.baseUrl}/tenants`,
        request,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('tenant_id');
      expect(response.data).toHaveProperty('api_key');
      expect(response.data).toHaveProperty('stripe_customer_id');
      expect(response.data).toHaveProperty('stripe_subscription_id');
      expect(response.data.policy.mode).toBe('remote-first');
      expect(response.data.policy.badge).toBe(true);
      expect(response.data.trial.is_active).toBe(true);
      expect(response.data.trial.cap.sign_assets).toBe(200);

      // Store test tenant for cleanup
      testTenant = {
        id: response.data.tenant_id,
        apiKey: response.data.api_key,
        email: request.email,
        stripeCustomerId: response.data.stripe_customer_id,
        stripeSubscriptionId: response.data.stripe_subscription_id,
      };
    });

    it('should reject invalid tenant creation requests', async () => {
      const invalidRequest = {
        email: 'invalid-email',
        plan: 'invalid-plan',
        payment_method_id: '',
        domains: ['invalid-domain'],
        cms: 'invalid-cms',
      };

      try {
        await axios.post(`${testConfig.baseUrl}/tenants`, invalidRequest);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        expect(error.response.data).toHaveProperty('code');
        expect(error.response.data).toHaveProperty('message');
      }
    });

    it('should authenticate tenant with API key', async () => {
      const response = await axios.get(
        `${testConfig.baseUrl}/tenants/${testTenant.id}`,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.tenant_id).toBe(testTenant.id);
      expect(response.data.email).toBe(testTenant.email);
    });

    it('should reject requests with invalid API key', async () => {
      try {
        await axios.get(
          `${testConfig.baseUrl}/tenants/${testTenant.id}`,
          {
            headers: {
              'Authorization': 'Bearer invalid-api-key',
            },
            timeout: testConfig.timeout,
          }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(401);
      }
    });
  });

  describe('Onboarding Wizard', () => {
    it('should initialize onboarding wizard for new tenant', async () => {
      const response = await axios.get(
        `${testConfig.baseUrl}/tenants/${testTenant.id}/wizard`,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.current_step).toBe('domain_setup');
      expect(response.data.completed_steps).toEqual([]);
      expect(response.data.status).toBe('in_progress');
    });

    it('should execute domain setup step successfully', async () => {
      const response = await axios.post(
        `${testConfig.baseUrl}/tenants/${testTenant.id}/wizard/domain_setup`,
        {
          domains: ['https://test.example.com', 'https://www.test.example.com'],
        },
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.completed).toBe(true);
      expect(response.data.data.domains).toContain('https://test.example.com');
      expect(response.data.validation_results).toHaveLength(2);
    });

    it('should execute manifest configuration step', async () => {
      const response = await axios.post(
        `${testConfig.baseUrl}/tenants/${testTenant.id}/wizard/manifest_config`,
        {
          manifest_host: 'https://test-manifest.example.com',
        },
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.completed).toBe(true);
      expect(response.data.data.manifest_host).toBe('https://test-manifest.example.com');
    });

    it('should execute CMS selection step', async () => {
      const response = await axios.post(
        `${testConfig.baseUrl}/tenants/${testTenant.id}/wizard/cms_selection`,
        {
          cms: 'wordpress',
        },
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.completed).toBe(true);
      expect(response.data.data.cms).toBe('wordpress');
      expect(response.data.data.guidance).toContain('WordPress plugin');
    });

    it('should track wizard progress correctly', async () => {
      const response = await axios.get(
        `${testConfig.baseUrl}/tenants/${testTenant.id}/wizard`,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.completed_steps).toContain('domain_setup');
      expect(response.data.completed_steps).toContain('manifest_config');
      expect(response.data.completed_steps).toContain('cms_selection');
      expect(response.data.current_step).toBe('plugin_install');
    });
  });

  describe('Usage Metering', () => {
    it('should record usage events correctly', async () => {
      const usageEvent: UsageEvent = {
        tenant_id: testTenant.id,
        event_type: 'sign_events',
        value: 5,
        timestamp: new Date().toISOString(),
        metadata: {
          asset_type: 'image',
          format: 'jpeg',
        },
      };

      const response = await axios.post(
        `${testConfig.baseUrl}/usage`,
        { events: [usageEvent] },
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(201);
      expect(response.data.recorded).toBe(1);
    });

    it('should get current month usage', async () => {
      // Record some usage first
      await axios.post(
        `${testConfig.baseUrl}/usage`,
        {
          events: [
            {
              tenant_id: testTenant.id,
              event_type: 'sign_events',
              value: 10,
              timestamp: new Date().toISOString(),
            },
            {
              tenant_id: testTenant.id,
              event_type: 'verify_events',
              value: 100,
              timestamp: new Date().toISOString(),
            },
          ],
        },
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
        }
      );

      const response = await axios.get(
        `${testConfig.baseUrl}/tenants/${testTenant.id}/usage`,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.current_month.sign_events).toBeGreaterThan(0);
      expect(response.data.current_month.verify_events).toBeGreaterThan(0);
      expect(response.data.lifetime.sign_events).toBeGreaterThan(0);
      expect(response.data.lifetime.verify_events).toBeGreaterThan(0);
    });

    it('should enforce trial limits', async () => {
      // Try to exceed trial limit (this would need to be configured with a low limit for testing)
      const largeUsageEvent: UsageEvent = {
        tenant_id: testTenant.id,
        event_type: 'sign_events',
        value: 1000, // Exceeds trial limit of 200
        timestamp: new Date().toISOString(),
      };

      try {
        await axios.post(
          `${testConfig.baseUrl}/usage`,
          { events: [largeUsageEvent] },
          {
            headers: {
              'Authorization': `Bearer ${testTenant.apiKey}`,
            },
          }
        );
        expect.fail('Should have thrown an error for exceeding trial limit');
      } catch (error) {
        expect(error.response.status).toBe(429);
        expect(error.response.data.code).toBe('TRIAL_LIMIT_EXCEEDED');
      }
    });
  });

  describe('Install Health Monitoring', () => {
    it('should perform install health check', async () => {
      const healthRequest: InstallCheckRequest = {
        tenant_id: testTenant.id,
        demo_asset_url: 'https://example.com/demo.jpg',
        test_page_url: 'https://example.com/test-page',
      };

      const response = await axios.post(
        `${testConfig.baseUrl}/install/check`,
        healthRequest,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.health).toHaveProperty('tenant_id', testTenant.id);
      expect(response.data.health).toHaveProperty('status');
      expect(response.data.health).toHaveProperty('embed_survival');
      expect(response.data.health).toHaveProperty('remote_survival');
      expect(response.data.health).toHaveProperty('badge_ok');
      expect(response.data.health).toHaveProperty('remediation_steps');
      expect(response.data).toHaveProperty('can_checkout');
      expect(response.data).toHaveProperty('next_steps');
    });

    it('should block checkout when health is not green', async () => {
      // Mock a failing health check
      const failingHealthRequest: InstallCheckRequest = {
        tenant_id: testTenant.id,
        demo_asset_url: 'https://example.com/non-existent.jpg',
        test_page_url: 'https://example.com/non-existent-page',
      };

      const response = await axios.post(
        `${testConfig.baseUrl}/install/check`,
        failingHealthRequest,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data.can_checkout).toBe(false);
      expect(response.data.health.status).not.toBe('green');
      expect(response.data.next_steps.length).toBeGreaterThan(0);
    });

    it('should get health check history', async () => {
      const response = await axios.get(
        `${testConfig.baseUrl}/tenants/${testTenant.id}/health/history`,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      if (response.data.length > 0) {
        expect(response.data[0]).toHaveProperty('tenant_id');
        expect(response.data[0]).toHaveProperty('status');
        expect(response.data[0]).toHaveProperty('last_checked');
      }
    });
  });

  describe('CAI Verify Integration', () => {
    it('should verify asset with CAI Verify', async () => {
      const verifyRequest = {
        url: 'https://example.com/test-asset.jpg',
        format: 'json',
        include_thumbnail: false,
        include_manifest: true,
      };

      const response = await axios.post(
        `${testConfig.baseUrl}/verify`,
        verifyRequest,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('verified');
      expect(response.data).toHaveProperty('trace_id');
      expect(response.data).toHaveProperty('validation_results');
      expect(response.data).toHaveProperty('verified_at');
      expect(Array.isArray(response.data.validation_results)).toBe(true);
    });

    it('should discover remote manifests', async () => {
      const response = await axios.post(
        `${testConfig.baseUrl}/discover`,
        {
          asset_url: 'https://example.com/test-asset.jpg',
        },
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      if (response.data.length > 0) {
        expect(response.data[0]).toHaveProperty('url');
        expect(response.data[0]).toHaveProperty('method');
        expect(response.data[0]).toHaveProperty('accessible');
      }
    });

    it('should perform smoke test on asset', async () => {
      const smokeTestRequest = {
        asset_url: 'https://example.com/test-asset.jpg',
        transformations: ['resize', 'compress', 'crop'],
      };

      const response = await axios.post(
        `${testConfig.baseUrl}/smoke-test`,
        smokeTestRequest,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('original');
      expect(response.data).toHaveProperty('transformed');
      expect(response.data).toHaveProperty('summary');
      expect(response.data.summary).toHaveProperty('total_transforms');
      expect(response.data.summary).toHaveProperty('embed_survival_rate');
      expect(response.data.summary).toHaveProperty('remote_survival_rate');
      expect(response.data.summary).toHaveProperty('badge_intact_rate');
    });
  });

  describe('RFC-3161 Timestamp Service', () => {
    it('should create timestamp for asset', async () => {
      const timestampRequest: RFC3161TimestampRequest = {
        tenant_id: testTenant.id,
        asset_hash: 'a'.repeat(64), // Mock SHA-256 hash
        content_url: 'https://example.com/test-asset.jpg',
        metadata: {
          asset_type: 'image',
          format: 'jpeg',
        },
      };

      const response = await axios.post(
        `${testConfig.baseUrl}/timestamps`,
        timestampRequest,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('timestamp_id');
      expect(response.data).toHaveProperty('timestamp_token');
      expect(response.data).toHaveProperty('timestamp_url');
      expect(response.data).toHaveProperty('verification_url');
      expect(response.data).toHaveProperty('created_at');
    });

    it('should verify timestamp', async () => {
      // First create a timestamp
      const createResponse = await axios.post(
        `${testConfig.baseUrl}/timestamps`,
        {
          tenant_id: testTenant.id,
          asset_hash: 'b'.repeat(64),
          content_url: 'https://example.com/test-asset-2.jpg',
        },
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
        }
      );

      const timestampId = createResponse.data.timestamp_id;

      // Then verify it
      const verifyResponse = await axios.get(
        `${testConfig.baseUrl}/timestamps/${timestampId}/verify`,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(verifyResponse.status).toBe(200);
      expect(verifyResponse.data).toHaveProperty('valid');
      expect(verifyResponse.data).toHaveProperty('timestamp_time');
      expect(verifyResponse.data).toHaveProperty('hash_match');
      expect(verifyResponse.data).toHaveProperty('certificate_chain');
    });

    it('should get timestamp history', async () => {
      const response = await axios.get(
        `${testConfig.baseUrl}/tenants/${testTenant.id}/timestamps`,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      if (response.data.length > 0) {
        expect(response.data[0]).toHaveProperty('timestamp_id');
        expect(response.data[0]).toHaveProperty('asset_hash');
        expect(response.data[0]).toHaveProperty('created_at');
        expect(response.data[0]).toHaveProperty('verified');
      }
    });
  });

  describe('Export and Cancellation', () => {
    it('should create export job', async () => {
      const exportRequest = {
        includes: {
          manifests: true,
          verify_logs: true,
          invoices: true,
          compliance_reports: true,
          usage_data: true,
        },
      };

      const response = await axios.post(
        `${testConfig.baseUrl}/tenants/${testTenant.id}/export`,
        exportRequest,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(201);
      expect(response.data).toHaveProperty('export_id');
      expect(response.data).toHaveProperty('status', 'preparing');
      expect(response.data).toHaveProperty('created_at');
      expect(response.data).toHaveProperty('expires_at');
    });

    it('should cancel tenant subscription', async () => {
      const cancelRequest: CancelTenantRequest = {
        export_data: true,
        reason: 'Test cancellation',
        feedback: 'Testing cancellation flow',
      };

      const response = await axios.post(
        `${testConfig.baseUrl}/tenants/${testTenant.id}/cancel`,
        cancelRequest,
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('cancellation_date');
      expect(response.data).toHaveProperty('final_invoice_date');
      expect(response.data).toHaveProperty('data_retention_days');
      expect(response.data).toHaveProperty('export_url');
    });
  });

  describe('Billing Integration', () => {
    it('should get available plans', async () => {
      const response = await axios.get(
        `${testConfig.baseUrl}/billing/plans`,
        {
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(Array.isArray(response.data)).toBe(true);
      expect(response.data.length).toBe(3); // starter, pro, enterprise
      
      const starterPlan = response.data.find(p => p.id === 'starter');
      expect(starterPlan).toHaveProperty('name', 'Starter');
      expect(starterPlan).toHaveProperty('monthly_price', 199);
      expect(starterPlan).toHaveProperty('features');
      expect(starterPlan).toHaveProperty('limits');
    });

    it('should create customer portal session', async () => {
      const response = await axios.post(
        `${testConfig.baseUrl}/billing/portal`,
        {
          return_url: `${testConfig.baseUrl}/billing`,
        },
        {
          headers: {
            'Authorization': `Bearer ${testTenant.apiKey}`,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('portal_url');
      expect(response.data.portal_url).toContain('stripe.com');
    });

    it('should process webhook events', async () => {
      // Mock Stripe webhook event
      const webhookEvent = {
        id: 'evt_test_webhook',
        object: 'event',
        api_version: '2023-10-16',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: 'in_test_invoice',
            object: 'invoice',
            customer: testTenant.stripeCustomerId,
            paid: true,
            amount_paid: 19900,
          },
        },
        livemode: false,
        pending_webhooks: 1,
        request: null,
        type: 'invoice.payment_succeeded',
      };

      const signature = 'mock-signature'; // In real tests, you'd generate proper signature

      const response = await axios.post(
        `${testConfig.baseUrl}/webhooks/stripe`,
        JSON.stringify(webhookEvent),
        {
          headers: {
            'Content-Type': 'application/json',
            'Stripe-Signature': signature,
          },
          timeout: testConfig.timeout,
        }
      );

      expect(response.status).toBe(200);
    });
  });

  describe('Security and Rate Limiting', () => {
    it('should enforce rate limits', async () => {
      const requests = [];
      
      // Make multiple requests quickly to trigger rate limiting
      for (let i = 0; i < 150; i++) {
        requests.push(
          axios.get(
            `${testConfig.baseUrl}/tenants/${testTenant.id}`,
            {
              headers: {
                'Authorization': `Bearer ${testTenant.apiKey}`,
              },
            }
          )
        );
      }

      const results = await Promise.allSettled(requests);
      const rateLimitedRequests = results.filter(r => 
        r.status === 'rejected' && 
        r.value.response?.status === 429
      );

      expect(rateLimitedRequests.length).toBeGreaterThan(0);
    });

    it('should reject malformed requests', async () => {
      try {
        await axios.post(
          `${testConfig.baseUrl}/tenants`,
          'invalid-json',
          {
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
      }
    });

    it('should sanitize inputs properly', async () => {
      const maliciousRequest = {
        email: '<script>alert("xss")</script>@example.com',
        company_name: '"; DROP TABLE tenants; --',
        domains: ['javascript:alert(1)'],
        cms: '<img src=x onerror=alert(1)>',
      };

      try {
        await axios.post(`${testConfig.baseUrl}/tenants`, maliciousRequest);
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.response.status).toBe(400);
        // Ensure malicious content was not processed
        expect(error.response.data.message).not.toContain('<script>');
      }
    });
  });

  describe('Performance and Scalability', () => {
    it('should handle concurrent requests', async () => {
      const concurrentRequests = 50;
      const requests = [];

      for (let i = 0; i < concurrentRequests; i++) {
        requests.push(
          axios.get(
            `${testConfig.baseUrl}/billing/plans`,
            {
              timeout: testConfig.timeout,
            }
          )
        );
      }

      const results = await Promise.allSettled(requests);
      const successfulRequests = results.filter(r => r.status === 'fulfilled');
      
      expect(successfulRequests.length).toBeGreaterThan(concurrentRequests * 0.95); // 95% success rate
    });

    it('should respond within acceptable time limits', async () => {
      const startTime = Date.now();
      
      await axios.get(
        `${testConfig.baseUrl}/billing/plans`,
        {
          timeout: testConfig.timeout,
        }
      );

      const responseTime = Date.now() - startTime;
      expect(responseTime).toBeLessThan(5000); // Should respond within 5 seconds
    });
  });

  // Helper function to cleanup test tenant
  async function cleanupTestTenant(tenantId: string): Promise<void> {
    try {
      // Cancel subscription if active
      if (testTenant?.stripeSubscriptionId) {
        // In a real cleanup, you'd call Stripe to cancel the subscription
      }

      // Delete tenant data from Redis
      // This would be done through the service layer
    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }
});
