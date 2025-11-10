# Acceptance Tests & Exit Criteria

**Comprehensive Testing Framework for Pricing Experiments**

**Version**: 1.0.0  
**Implementation Date**: November 5, 2025  
**Test Coverage**: Functional, Integration, Performance, Security

---

## Testing Framework Overview

### Test Pyramid Structure

```
Testing Pyramid
├── Unit Tests (70%)
│   ├── Pricing Calculations
│   ├── Usage Meters
│   ├── Billing Logic
│   └── Alert Thresholds
├── Integration Tests (20%)
│   ├── Stripe Integration
│   ├── Optimizely Integration
│   ├── Analytics Integration
│   └── Database Operations
├── End-to-End Tests (10%)
│   ├── Customer Journey
│   ├── Billing Cycle
│   ├── Experiment Flow
│   └── Rollback Scenarios
```

### Test Environment Configuration

```javascript
const testEnvironments = {
  development: {
    name: 'Development',
    url: 'https://dev-api.credlink.com',
    database: 'dev_pricing_db',
    stripe_key: process.env.STRIPE_DEV_KEY,
    optimizely_sdk_key: process.env.OPTIMIZELY_DEV_KEY,
    monitoring: false
  },
  
  staging: {
    name: 'Staging',
    url: 'https://staging-api.credlink.com',
    database: 'staging_pricing_db',
    stripe_key: process.env.STRIPE_STAGING_KEY,
    optimizely_sdk_key: process.env.OPTIMIZELY_STAGING_KEY,
    monitoring: true,
    data_seeding: true
  },
  
  production: {
    name: 'Production',
    url: process.env.API_BASE_URL || 'https://api.credlink.com',
    database: 'prod_pricing_db',
    stripe_key: process.env.STRIPE_PROD_KEY,
    optimizely_sdk_key: process.env.OPTIMIZELY_PROD_KEY,
    monitoring: true,
    read_only: true
  }
};
```

---

## Unit Tests

### Pricing Calculation Tests

```javascript
// pricing-calculations.test.js
describe('Pricing Calculations', () => {
  describe('Plan Pricing', () => {
    test('Starter plan pricing should be correct', () => {
      const calculator = new PricingCalculator();
      const result = calculator.calculatePlanPrice('starter', {
        verifies: 1500,
        signs: 150,
        sites: 3
      });
      
      expect(result.basePrice).toBe(199);
      expect(result.overageCharges).toBe(0);
      expect(result.totalPrice).toBe(199);
    });
    
    test('Growth plan overage should be calculated correctly', () => {
      const calculator = new PricingCalculator();
      const result = calculator.calculatePlanPrice('growth', {
        verifies: 16000, // 1,000 over limit
        signs: 1100,     // 100 over limit
        sites: 12        // 2 over limit
      });
      
      expect(result.basePrice).toBe(699);
      expect(result.overageCharges).toBe(140); // (1000 * $0.08) + (100 * $0.60) + (2 * $20)
      expect(result.totalPrice).toBe(839);
    });
    
    test('Scale plan pricing should handle large volumes', () => {
      const calculator = new PricingCalculator();
      const result = calculator.calculatePlanPrice('scale', {
        verifies: 50000,
        signs: 5000,
        sites: 100
      });
      
      expect(result.basePrice).toBe(2000);
      expect(result.overageCharges).toBe(0);
      expect(result.totalPrice).toBe(2000);
    });
  });
  
  describe('Add-on Calculations', () => {
    test('Retro-Sign Pack should calculate correctly', () => {
      const calculator = new PricingCalculator();
      const result = calculator.calculateAddOnPrice('retro_sign_pack', {
        additionalSigns: 500
      });
      
      expect(result.basePrice).toBe(99);
      expect(result.overageCharges).toBe(200); // 500 * $0.40
      expect(result.totalPrice).toBe(299);
    });
    
    test('Analytics-Only Viewer should calculate correctly', () => {
      const calculator = new PricingCalculator();
      const result = calculator.calculateAddOnPrice('analytics_viewer', {
        additionalViewers: 5
      });
      
      expect(result.basePrice).toBe(49);
      expect(result.overageCharges).toBe(25); // 5 * $5
      expect(result.totalPrice).toBe(74);
    });
  });
  
  describe('Discount Calculations', () => {
    test('Annual discount should be applied correctly', () => {
      const calculator = new PricingCalculator();
      const result = calculator.calculateAnnualPrice('growth', {
        verifies: 10000,
        signs: 500,
        sites: 10,
        billingCycle: 'annual'
      });
      
      expect(result.monthlyPrice).toBe(699);
      expect(result.annualDiscount).toBe(0.20);
      expect(result.annualPrice).toBe(6710.40); // 699 * 12 * 0.8
    });
    
    test('Enterprise custom pricing should be handled', () => {
      const calculator = new PricingCalculator();
      const result = calculator.calculateCustomPrice({
        basePrice: 5000,
        discountRate: 0.15,
        billingCycle: 'annual'
      });
      
      expect(result.basePrice).toBe(5000);
      expect(result.discountAmount).toBe(750);
      expect(result.finalPrice).toBe(4250);
    });
  });
});
```

### Usage Meter Tests

```javascript
// usage-meters.test.js
describe('Usage Meters', () => {
  describe('Verification Meter', () => {
    test('Should track verify operations correctly', async () => {
      const meter = new VerificationMeter();
      await meter.initialize('test-customer-123');
      
      // Record usage
      await meter.recordUsage(100);
      await meter.recordUsage(50);
      
      const usage = await meter.getCurrentUsage();
      expect(usage.total).toBe(150);
      expect(usage.period).toBe('current_month');
    });
    
    test('Should enforce usage limits correctly', async () => {
      const meter = new VerificationMeter();
      await meter.initialize('test-customer-456', { limit: 200 });
      
      // Record usage up to limit
      await meter.recordUsage(199);
      expect(await meter.isLimitExceeded()).toBe(false);
      
      // Exceed limit
      await meter.recordUsage(2);
      expect(await meter.isLimitExceeded()).toBe(true);
      expect(await meter.getOverageAmount()).toBe(1);
    });
    
    test('Should calculate overage charges correctly', async () => {
      const meter = new VerificationMeter();
      await meter.initialize('test-customer-789', { 
        limit: 1000, 
        overageRate: 0.08 
      });
      
      await meter.recordUsage(1200);
      const overage = await meter.calculateOverageCharges();
      
      expect(overage.overageAmount).toBe(200);
      expect(overage.overageCharges).toBe(16); // 200 * $0.08
    });
  });
  
  describe('Signing Meter', () => {
    test('Should track sign operations correctly', async () => {
      const meter = new SigningMeter();
      await meter.initialize('test-customer-abc');
      
      await meter.recordUsage(25);
      await meter.recordUsage(15);
      
      const usage = await meter.getCurrentUsage();
      expect(usage.total).toBe(40);
    });
    
    test('Should handle concurrent operations', async () => {
      const meter = new SigningMeter();
      await meter.initialize('test-customer-def');
      
      // Simulate concurrent operations
      const operations = Array(10).fill().map(() => meter.recordUsage(10));
      await Promise.all(operations);
      
      const usage = await meter.getCurrentUsage();
      expect(usage.total).toBe(100);
    });
  });
  
  describe('Storage Meter', () => {
    test('Should track storage usage correctly', async () => {
      const meter = new StorageMeter();
      await meter.initialize('test-customer-ghi');
      
      await meter.recordStorageUsage(1024); // 1GB
      await meter.recordStorageUsage(512);  // 0.5GB
      
      const usage = await meter.getCurrentUsage();
      expect(usage.totalGB).toBe(1.5);
    });
    
    test('Should calculate storage overage correctly', async () => {
      const meter = new StorageMeter();
      await meter.initialize('test-customer-jkl', { 
        limitGB: 5, 
        overageRate: 0.20 
      });
      
      await meter.recordStorageUsage(6144); // 6GB
      const overage = await meter.calculateOverageCharges();
      
      expect(overage.overageAmount).toBe(1); // 1GB over
      expect(overage.overageCharges).toBe(0.20);
    });
  });
});
```

### Billing Logic Tests

```javascript
// billing-logic.test.js
describe('Billing Logic', () => {
  describe('Subscription Management', () => {
    test('Should create subscription correctly', async () => {
      const billing = new BillingService();
      const subscription = await billing.createSubscription({
        customerId: 'cust_123',
        planId: 'growth',
        billingCycle: 'monthly',
        startDate: '2025-11-01'
      });
      
      expect(subscription.status).toBe('active');
      expect(subscription.planId).toBe('growth');
      expect(subscription.nextBillingDate).toBe('2025-12-01');
    });
    
    test('Should handle plan upgrades correctly', async () => {
      const billing = new BillingService();
      const result = await billing.changePlan('cust_123', 'growth', 'scale');
      
      expect(result.previousPlan).toBe('growth');
      expect(result.newPlan).toBe('scale');
      expect(result.proratedCharge).toBeGreaterThan(0);
      expect(result.effectiveDate).toBe(new Date().toISOString().split('T')[0]);
    });
    
    test('Should calculate proration correctly', async () => {
      const billing = new BillingService();
      const proration = await billing.calculateProration({
        customerId: 'cust_123',
        oldPlan: 'growth',
        newPlan: 'scale',
        daysInMonth: 30,
        daysRemaining: 15
      });
      
      expect(proration.oldPlanRefund).toBe(349.50); // 699 * 15/30
      expect(proration.newPlanCharge).toBe(1000);   // 2000 * 15/30
      expect(proration.netCharge).toBe(650.50);     // 1000 - 349.50
    });
  });
  
  describe('Invoice Generation', () => {
    test('Should generate monthly invoice correctly', async () => {
      const billing = new BillingService();
      const invoice = await billing.generateInvoice('cust_123', '2025-11');
      
      expect(invoice.customerId).toBe('cust_123');
      expect(invoice.period).toBe('2025-11');
      expect(invoice.lineItems).toHaveLength(3); // Base plan + 2 add-ons
      expect(invoice.total).toBeGreaterThan(0);
    });
    
    test('Should include overage charges in invoice', async () => {
      const billing = new BillingService();
      const usage = {
        verifies: 16000, // 1,000 over
        signs: 1100,     // 100 over
        storage: 6       // 1GB over
      };
      
      const invoice = await billing.generateInvoice('cust_123', '2025-11', usage);
      const overageItems = invoice.lineItems.filter(item => item.type === 'overage');
      
      expect(overageItems).toHaveLength(3);
      expect(invoice.overageTotal).toBe(140.20);
    });
  });
});
```

---

## Integration Tests

### Stripe Integration Tests

```javascript
// stripe-integration.test.js
describe('Stripe Integration', () => {
  let stripeClient;
  
  beforeAll(() => {
    stripeClient = new StripeClient(process.env.STRIPE_TEST_KEY);
  });
  
  describe('Customer Management', () => {
    test('Should create Stripe customer correctly', async () => {
      const customerData = {
        email: 'test@example.com',
        name: 'Test Customer',
        metadata: {
          internal_id: 'cust_123',
          plan: 'growth'
        }
      };
      
      const customer = await stripeClient.createCustomer(customerData);
      
      expect(customer.id).toMatch(/^cus_/);
      expect(customer.email).toBe('test@example.com');
      expect(customer.metadata.internal_id).toBe('cust_123');
    });
    
    test('Should update customer payment method', async () => {
      const paymentMethod = await stripeClient.createPaymentMethod({
        type: 'card',
        card: {
          token: 'tok_visa'
        }
      });
      
      const updatedCustomer = await stripeClient.updatePaymentMethod(
        'cus_123', 
        paymentMethod.id
      );
      
      expect(updatedCustomer.invoice_settings.default_payment_method).toBe(paymentMethod.id);
    });
  });
  
  describe('Subscription Management', () => {
    test('Should create subscription with usage meters', async () => {
      const subscriptionData = {
        customer: 'cus_123',
        items: [
          { price: 'price_growth_monthly' },
          { price: 'price_verify_meter' },
          { price: 'price_sign_meter' }
        ],
        billing_cycle_anchor: 'now',
        proration_behavior: 'create_prorations'
      };
      
      const subscription = await stripeClient.createSubscription(subscriptionData);
      
      expect(subscription.status).toBe('active');
      expect(subscription.items.data).toHaveLength(3);
      expect(subscription.items.data[1].price.type).toBe('usage');
    });
    
    test('Should handle subscription upgrades with proration', async () => {
      const subscription = await stripeClient.updateSubscription('sub_123', {
        items: [{
          id: 'si_123',
          price: 'price_scale_monthly'
        }],
        proration_behavior: 'create_prorations'
      });
      
      expect(subscription.items.data[0].price.id).toBe('price_scale_monthly');
      expect(subscription.latest_invoice).toBeDefined();
    });
    
    test('Should record usage correctly', async () => {
      const usageRecord = await stripeClient.createUsageRecord(
        'si_123',
        {
          quantity: 150,
          timestamp: Math.floor(Date.now() / 1000),
          action: 'increment'
        }
      );
      
      expect(usageRecord.id).toMatch(/^usage_/);
      expect(usageRecord.quantity).toBe(150);
    });
  });
  
  describe('Invoice and Payment', () => {
    test('Should create and finalize invoice', async () => {
      const invoice = await stripeClient.createInvoice({
        customer: 'cus_123',
        auto_advance: true
      });
      
      const finalizedInvoice = await stripeClient.finalizeInvoice(invoice.id);
      
      expect(finalizedInvoice.status).toBe('open');
      expect(finalizedInvoice.amount_due).toBeGreaterThan(0);
    });
    
    test('Should handle payment failures correctly', async () => {
      // Mock payment failure
      const paymentIntent = await stripeClient.createPaymentIntent({
        amount: 69900, // $699.00
        currency: 'usd',
        customer: 'cus_123',
        payment_method: 'pm_card_chargeDeclined',
        confirm: true
      });
      
      expect(paymentIntent.status).toBe('requires_payment_method');
      expect(paymentIntent.last_payment_error).toBeDefined();
    });
  });
});
```

### Optimizely Integration Tests

```javascript
// optimizely-integration.test.js
describe('Optimizely Integration', () => {
  let optimizelyClient;
  
  beforeAll(() => {
    optimizelyClient = new OptimizelyClient({
      sdkKey: process.env.OPTIMIZELY_TEST_SDK_KEY
    });
  });
  
  describe('Experiment Activation', () => {
    test('Should activate experiment correctly', async () => {
      const userContext = {
        userId: 'user_123',
        attributes: {
          plan: 'growth',
          industry: 'technology',
          companySize: 'medium'
        }
      };
      
      const variation = await optimizelyClient.activateExperiment(
        'caps_experiment',
        userContext
      );
      
      expect(variation).toBeDefined();
      expect(['control', 'variant_a', 'variant_b']).toContain(variation.key);
    });
    
    test('Should bucket users consistently', async () => {
      const userContext = {
        userId: 'user_456',
        attributes: { plan: 'starter' }
      };
      
      const variation1 = await optimizelyClient.activateExperiment(
        'bundle_experiment',
        userContext
      );
      
      const variation2 = await optimizelyClient.activateExperiment(
        'bundle_experiment',
        userContext
      );
      
      expect(variation1.key).toBe(variation2.key);
    });
    
    test('Should handle experiment attributes correctly', async () => {
      const userContext = {
        userId: 'user_789',
        attributes: {
          plan: 'scale',
          monthlyRevenue: 50000,
          employeeCount: 200
        }
      };
      
      const variation = await optimizelyClient.activateExperiment(
        'annual_discount_experiment',
        userContext
      );
      
      expect(variation).toBeDefined();
      expect(variation.variables).toBeDefined();
    });
  });
  
  describe('Event Tracking', () => {
    test('Should track conversion events correctly', async () => {
      const eventContext = {
        userId: 'user_123',
        eventName: 'trial_conversion',
        attributes: {
          conversion_value: 699,
          conversion_time: '2025-11-05T10:30:00Z'
        }
      };
      
      const result = await optimizelyClient.trackEvent(eventContext);
      
      expect(result.success).toBe(true);
      expect(result.eventKey).toBe('trial_conversion');
    });
    
    test('Should track revenue events correctly', async () => {
      const eventContext = {
        userId: 'user_456',
        eventName: 'purchase_completed',
        attributes: {
          revenue: 1398, // $13.98
          currency: 'USD'
        }
      };
      
      const result = await optimizelyClient.trackEvent(eventContext);
      
      expect(result.success).toBe(true);
      expect(result.attributes.revenue).toBe(1398);
    });
  });
});
```

---

## End-to-End Tests

### Customer Journey Tests

```javascript
// customer-journey.e2e.test.js
describe('Customer Journey E2E', () => {
  let page;
  let customerEmail;
  
  beforeAll(async () => {
    page = await browser.newPage();
    customerEmail = `test-${Date.now()}@example.com`;
  });
  
  describe('Trial to Paid Conversion', () => {
    test('Complete trial signup and conversion flow', async () => {
      // Navigate to pricing page
      await page.goto('https://app.credlink.com/pricing');
      
      // Start trial
      await page.click('[data-testid="start-trial-growth"]');
      await page.fill('[data-testid="email"]', customerEmail);
      await page.fill('[data-testid="password"]', 'TestPassword123!');
      await page.click('[data-testid="create-account"]');
      
      // Verify trial activation
      await expect(page.locator('[data-testid="trial-active"]')).toBeVisible();
      await expect(page.locator('[data-testid="trial-days-remaining"]')).toContainText('14');
      
      // Complete onboarding
      await page.click('[data-testid="complete-onboarding"]');
      await page.fill('[data-testid="company-name"]', 'Test Company');
      await page.selectOption('[data-testid="industry"]', 'technology');
      await page.click('[data-testid="continue"]');
      
      // Use the product (simulate verification)
      await page.goto('https://app.credlink.com/verify');
      await page.setInputFiles('[data-testid="file-input"]', 'test-assets/sample.pdf');
      await page.click('[data-testid="verify-button"]');
      
      // Wait for verification to complete
      await expect(page.locator('[data-testid="verification-complete"]')).toBeVisible();
      
      // Convert to paid
      await page.goto('https://app.credlink.com/billing');
      await page.click('[data-testid="convert-to-paid"]');
      await page.fill('[data-testid="card-number"]', '4242424242424244242');
      await page.fill('[data-testid="card-expiry"]', '12/25');
      await page.fill('[data-testid="card-cvc"]', '123');
      await page.click('[data-testid="subscribe"]');
      
      // Verify conversion
      await expect(page.locator('[data-testid="subscription-active"]')).toBeVisible();
      await expect(page.locator('[data-testid="plan-growth"]')).toBeVisible();
    });
    
    test('Should handle usage limits during trial', async () => {
      // Sign in as trial user
      await page.goto('https://app.credlink.com/login');
      await page.fill('[data-testid="email"]', customerEmail);
      await page.fill('[data-testid="password"]', 'TestPassword123!');
      await page.click('[data-testid="login"]');
      
      // Exceed usage limits
      for (let i = 0; i < 100; i++) {
        await page.goto('https://app.credlink.com/verify');
        await page.setInputFiles('[data-testid="file-input"]', 'test-assets/sample.pdf');
        await page.click('[data-testid="verify-button"]');
        await page.waitForTimeout(1000);
      }
      
      // Verify usage warning
      await expect(page.locator('[data-testid="usage-warning"]')).toBeVisible();
      await expect(page.locator('[data-testid="upgrade-prompt"]')).toBeVisible();
    });
  });
  
  describe('Plan Upgrade Flow', () => {
    test('Should handle plan upgrade with proration', async () => {
      // Navigate to billing page
      await page.goto('https://app.credlink.com/billing');
      
      // Click upgrade button
      await page.click('[data-testid="upgrade-to-scale"]');
      
      // Review upgrade details
      await expect(page.locator('[data-testid="proration-details"]')).toBeVisible();
      await expect(page.locator('[data-testid="upgrade-summary"]')).toContainText('$2,000');
      
      // Confirm upgrade
      await page.click('[data-testid="confirm-upgrade"]');
      
      // Verify upgrade completion
      await expect(page.locator('[data-testid="upgrade-success"]')).toBeVisible();
      await expect(page.locator('[data-testid="plan-scale"]')).toBeVisible();
      
      // Check invoice for proration
      await page.click('[data-testid="view-invoice"]');
      await expect(page.locator('[data-testid="proration-charge"]')).toBeVisible();
    });
  });
  
  describe('Overage Handling', () => {
    test('Should handle overage gracefully', async () => {
      // Simulate high usage
      await page.goto('https://app.credlink.com/billing');
      
      // Check usage dashboard
      await page.click('[data-testid="usage-dashboard"]');
      await expect(page.locator('[data-testid="usage-meters"]')).toBeVisible();
      
      // Verify overage calculation
      const overageAmount = await page.textContent('[data-testid="overage-amount"]');
      expect(overageAmount).toMatch(/\$\d+\.\d+/);
      
      // Test overage alert
      await page.click('[data-testid="test-overage-alert"]');
      await expect(page.locator('[data-testid="overage-warning-modal"]')).toBeVisible();
    });
  });
});
```

### Billing Cycle Tests

```javascript
// billing-cycle.e2e.test.js
describe('Billing Cycle E2E', () => {
  describe('Monthly Billing', () => {
    test('Should process monthly billing correctly', async () => {
      const billingService = new BillingService();
      
      // Generate monthly invoices for all active customers
      const invoices = await billingService.processMonthlyBilling('2025-11');
      
      expect(invoices.length).toBeGreaterThan(0);
      
      // Verify invoice accuracy
      for (const invoice of invoices) {
        expect(invoice.total).toBeGreaterThan(0);
        expect(invoice.lineItems).toHaveLength.greaterThan(0);
        expect(invoice.status).toBe('open');
      }
      
      // Process payments
      const paymentResults = await billingService.processPayments(invoices);
      
      const successfulPayments = paymentResults.filter(r => r.status === 'succeeded');
      const failedPayments = paymentResults.filter(r => r.status === 'failed');
      
      expect(successfulPayments.length).toBeGreaterThan(0);
      expect(failedPayments.length).toBeLessThan(invoices.length * 0.05); // < 5% failure rate
    });
    
    test('Should handle payment failures with retry logic', async () => {
      const billingService = new BillingService();
      
      // Simulate failed payment
      const failedPayment = await billingService.simulatePaymentFailure('invoice_123');
      
      expect(failedPayment.status).toBe('failed');
      expect(failedPayment.retryCount).toBe(0);
      
      // Process retry
      const retryResult = await billingService.retryPayment('invoice_123');
      
      expect(retryResult.retryCount).toBe(1);
      expect(retryResult.nextRetryDate).toBeDefined();
    });
  });
  
  describe('Usage Reporting', () => {
    test('Should report usage to Stripe correctly', async () => {
      const usageReporter = new UsageReporter();
      
      // Get usage data for the period
      const usageData = await usageReporter.getUsageData('2025-11');
      
      expect(usageData.customers).toHaveLength.greaterThan(0);
      
      // Report usage to Stripe
      const reportResults = await usageReporter.reportToStripe(usageData);
      
      for (const result of reportResults) {
        expect(result.success).toBe(true);
        expect(result.usageRecords).toHaveLength.greaterThan(0);
      }
    });
  });
});
```

### Security Headers Tests

```javascript
describe('Security Headers', () => {
  test('Should enforce HTTPS with HSTS', async () => {
    const response = await fetch(`${API_BASE_URL}/pricing/plans`, {
      headers: { 'Authorization': `Bearer ${validToken}` }
    });
    
    expect(response.headers.get('Strict-Transport-Security')).toContain('max-age=31536000');
    expect(response.headers.get('Strict-Transport-Security')).toContain('includeSubDomains');
  });
  
  test('Should prevent clickjacking', async () => {
    const response = await fetch(`${API_BASE_URL}/pricing/plans`);
    
    expect(response.headers.get('X-Frame-Options')).toBe('DENY');
    expect(response.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'none'");
  });
  
  test('Should prevent MIME type sniffing', async () => {
    const response = await fetch(`${API_BASE_URL}/pricing/plans`);
    
    expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
  });
  
  test('Should enable XSS protection', async () => {
    const response = await fetch(`${API_BASE_URL}/pricing/plans`);
    
    expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
  });
});
```

---

## Performance Tests

### Load Testing

```javascript
// performance.test.js
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.credlink.com';

describe('Performance Tests', () => {
  describe('API Response Times', () => {
    test('Pricing API should respond within 200ms', async () => {
      const response = await fetch(`${API_BASE_URL}/pricing/calculate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          plan: 'growth',
          usage: { verifies: 10000, signs: 500, sites: 10 }
        })
      });
      
      const responseTime = Date.now() - startTime;
      
      expect(response.status).toBe(200);
      expect(responseTime).toBeLessThan(200);
    });
    
    test('Usage meter should handle 1000 concurrent requests', async () => {
      const promises = Array(1000).fill().map(() =>
        fetch(`${API_BASE_URL}/usage/record`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customerId: 'perf_test_customer',
            meterType: 'verify',
            amount: 1
          })
        })
      );
      
      const startTime = Date.now();
      const results = await Promise.all(promises);
      const totalTime = Date.now() - startTime;
      
      const successfulResults = results.filter(r => r.status === 200);
      
      expect(successfulResults.length).toBe(1000);
      expect(totalTime).toBeLessThan(5000); // All requests within 5 seconds
    });
  });
  
  describe('Database Performance', () => {
    test('Usage queries should execute within 100ms', async () => {
      const db = new DatabaseClient();
      
      const startTime = Date.now();
      const results = await db.query(`
        SELECT * FROM usage_records 
        WHERE customer_id = $1 AND date >= $2
      `, ['test_customer', '2025-11-01']);
      
      const queryTime = Date.now() - startTime;
      
      expect(results.rows).toBeDefined();
      expect(queryTime).toBeLessThan(100);
    });
    
    test('Should handle large dataset queries efficiently', async () => {
      const db = new DatabaseClient();
      
      const startTime = Date.now();
      const results = await db.query(`
        SELECT customer_id, SUM(amount) as total_usage
        FROM usage_records 
        WHERE date >= $1
        GROUP BY customer_id
        HAVING SUM(amount) > 1000
      `, ['2025-10-01']);
      
      const queryTime = Date.now() - startTime;
      
      expect(results.rows).toBeDefined();
      expect(queryTime).toBeLessThan(500); // Even complex queries under 500ms
    });
  });
});
```

---

## Security Tests

### Authentication & Authorization

```javascript
// security.test.js
describe('Security Tests', () => {
  describe('Authentication', () => {
    test('Should reject requests without authentication', async () => {
      const response = await fetch(`${API_BASE_URL}/pricing/plans`, {
        headers: { 'Authorization': '' }
      });
      
      expect(response.status).toBe(401);
    });
    
    test('Should reject requests with invalid tokens', async () => {
      const response = await fetch(`${API_BASE_URL}/pricing/plans`, {
        headers: { 'Authorization': 'Bearer invalid_token' }
      });
      
      expect(response.status).toBe(401);
    });
    
    test('Should allow requests with valid tokens', async () => {
      const validToken = await generateValidToken();
      
      const response = await fetch(`${API_BASE_URL}/pricing/plans`, {
        headers: { 'Authorization': `Bearer ${validToken}` }
      });
      
      expect(response.status).toBe(200);
    });
  });
  
  describe('Authorization', () => {
    test('Should enforce customer data isolation', async () => {
      const customerAToken = await generateCustomerToken('customer_a');
      const customerBToken = await generateCustomerToken('customer_b');
      
      // Customer A should not access Customer B's data
      const response = await fetch(`${API_BASE_URL}/billing/invoices`, {
        headers: { 'Authorization': `Bearer ${customerAToken}` },
        body: JSON.stringify({ customerId: 'customer_b' })
      });
      
      expect(response.status).toBe(403);
    });
    
    test('Should enforce role-based access control', async () => {
      const customerToken = await generateCustomerToken('customer_a');
      
      // Customer should not access admin endpoints
      const response = await fetch(`${API_BASE_URL}/admin/experiments`, {
        headers: { 'Authorization': `Bearer ${customerToken}` }
      });
      
      expect(response.status).toBe(403);
    });
    
    test('Should enforce CSRF protection', async () => {
      const response = await fetch(`${API_BASE_URL}/billing/update`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${validToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ customerId: 'test_customer', plan: 'growth' })
      });
      
      expect(response.status).toBe(403);
      expect(response.headers.get('X-CSRF-Token')).toBeDefined();
    });
    
    test('Should allow requests with valid CSRF token', async () => {
      const csrfToken = await getCSRFToken();
      
      const response = await fetch(`${API_BASE_URL}/billing/update`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${validToken}`,
          'X-CSRF-Token': csrfToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ customerId: 'test_customer', plan: 'growth' })
      });
      
      expect(response.status).toBe(200);
    });
  });
  
  describe('Data Protection', () => {
    test('Should encrypt sensitive data at rest', async () => {
      const db = new DatabaseClient();
      
      // Check that payment methods are encrypted
      const result = await db.query(`
        SELECT payment_method FROM customers WHERE id = $1
      `, ['test_customer']);
      
      const paymentMethod = result.rows[0].payment_method;
      
      expect(paymentMethod).not.toContain('4242424242424244242'); // Not plain text
      expect(paymentMethod).toMatch(/^enc_/); // Encrypted format
    });
    
    test('Should sanitize data in responses', async () => {
      const response = await fetch(`${API_BASE_URL}/customers/profile`, {
        headers: { 'Authorization': `Bearer ${await generateCustomerToken('test_customer')}` }
      });
      
      const profile = await response.json();
      
      expect(profile).not.toHaveProperty('password');
      expect(profile).not.to.haveProperty('stripe_customer_id');
      expect(profile).not.to.haveProperty('internal_notes');
    });
  });
});
```

---

## Acceptance Criteria

### Functional Acceptance Criteria

| Feature | Acceptance Criteria | Test Method | Priority |
|---------|-------------------|-------------|----------|
| **Plan Pricing** | All plans calculate correct base prices | Unit test | Critical |
| **Usage Meters** | Overage calculated within 1% accuracy | Integration test | Critical |
| **Billing Cycle** | Monthly invoices generated accurately | E2E test | Critical |
| **Plan Changes** | Proration calculated correctly | Integration test | High |
| **Payment Processing** | 95%+ payment success rate | Performance test | Critical |
| **Usage Alerts** | Alerts sent at 80%/95%/100% thresholds | E2E test | High |
| **Experiment Bucketing** | Users consistently assigned to cohorts | Integration test | High |
| **Data Privacy** | Customer data encrypted and isolated | Security test | Critical |

### Performance Acceptance Criteria

| Metric | Target | Measurement | Test Method |
|--------|--------|-------------|-------------|
| **API Response Time** | < 200ms (95th percentile) | Continuous monitoring | Load test |
| **Database Query Time** | < 100ms (average) | Query performance monitoring | Performance test |
| **System Availability** | ≥99.9% uptime | Uptime monitoring | Integration test |
| **Concurrent Users** | 10,000 simultaneous users | Load testing | Performance test |
| **Billing Processing** | < 5 minutes for 10,000 invoices | Batch processing time | Performance test |

### Security Acceptance Criteria

| Requirement | Acceptance Criteria | Test Method |
|-------------|-------------------|-------------|
| **Authentication** | All API endpoints require valid JWT | Security test |
| **Authorization** | Role-based access control enforced | Security test |
| **Data Encryption** | Sensitive data encrypted at rest and in transit | Security audit |
| **PCI Compliance** | Payment card data handled per PCI DSS | Compliance audit |
| **GDPR Compliance** | Personal data protected per GDPR requirements | Legal review |

---

## Exit Criteria

### Primary Exit Criteria

The pricing experiment will be considered successful when ALL of the following criteria are met:

#### Financial Metrics
- [ ] **Gross Margin**: ≥70% sustained for 30 days
- [ ] **Revenue Growth**: +5% to +15% increase vs baseline
- [ ] **Overage Revenue**: ≤20% of total revenue
- [ ] **Customer Lifetime Value**: ≥2x acquisition cost

#### Customer Experience Metrics
- [ ] **Trial-to-Paid Conversion**: ≥25% (30-day average)
- [ ] **Customer Satisfaction**: ≥8.0/10 (NPS or CSAT)
- [ ] **90-Day Retention**: ≥85% (Starter), ≥90% (Growth/Scale)
- [ ] **Support Ticket Volume**: ≤10% increase vs baseline

#### Operational Metrics
- [ ] **System Availability**: ≥99.9% uptime during experiment
- [ ] **Payment Success Rate**: ≥95% for billing transactions
- [ ] **Alert Accuracy**: ≤5% false positive rate
- [ ] **Data Accuracy**: ≥99.9% billing calculation accuracy

#### Statistical Requirements
- [ ] **Statistical Power**: ≥80% for all primary metrics
- [ ] **Confidence Level**: ≥95% for key decisions
- [ ] **Sample Size**: Minimum 1,000 customers per cohort
- [ ] **Experiment Duration**: Minimum 60 days

### Secondary Exit Criteria

These criteria are desirable but not mandatory for success:

#### Growth Metrics
- [ ] **Net Dollar Retention**: ≥110%
- [ ] **Upgrade Rate**: ≥15% of customers upgrade within 90 days
- [ ] **Referral Rate**: ≥10% of new customers from referrals
- [ ] **Feature Adoption**: ≥60% adoption of key features

#### Competitive Position
- [ ] **Market Share**: Positive trend in market share
- [ ] **Price Competitiveness**: Within 10% of competitor pricing
- [ ] **Value Proposition**: Clear differentiation validated
- [ ] **Customer Preference**: ≥70% prefer new pricing in surveys

### Exit Decision Matrix

| Scenario | Financial | Customer | Operational | Statistical | Decision |
|----------|-----------|----------|-------------|-------------|----------|
| **All Primary Met** | ✅ | ✅ | ✅ | ✅ | **GO - Full Rollout** |
| **Minor Issues** | ✅ | ⚠️ | ✅ | ✅ | **GO - With Adjustments** |
| **Major Issues** | ❌ | ❌ | ✅ | ✅ | **NO - Redesign Required** |
| **Critical Failure** | ❌ | ❌ | ❌ | ❌ | **STOP - Immediate Rollback** |

### Exit Gates Timeline

| Week | Gate | Criteria | Decision Point |
|------|------|----------|----------------|
| 2 | Early Validation | System stability, data accuracy | Continue/Pause |
| 4 | Primary Metrics | Gross margin, conversion, satisfaction | Continue/Optimize/Stop |
| 6 | Operational Review | System performance, support load | Scale/Maintain/Reduce |
| 8 | Final Decision | All primary criteria met | Full Rollout/Partial/None |

---

## Test Automation & CI/CD

### Automated Test Pipeline

```yaml
# .github/workflows/pricing-tests.yml
name: Pricing Tests Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  unit-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:coverage
      
  integration-tests:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:14
        env:
          POSTGRES_PASSWORD: test
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run test:integration
      - run: npm run test:stripe
      - run: npm run test:optimizely
      
  e2e-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm run test:e2e
      
  performance-tests:
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run test:performance
      
  security-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm run test:security
      - run: npm audit --audit-level high
```

### Test Coverage Requirements

| Test Type | Coverage Target | Measurement |
|-----------|----------------|-------------|
| **Unit Tests** | 90% line coverage | Istanbul/nyc |
| **Integration Tests** | 80% endpoint coverage | Custom coverage tool |
| **E2E Tests** | 100% critical paths | Playwright coverage |
| **Security Tests** | 100% authentication | OWASP ZAP |

---

*Last Updated: November 5, 2025*  
**Test Environment**: Staging mirror of production  
**Automation**: 100% automated test execution  
**Reporting**: Real-time test results and coverage dashboards
