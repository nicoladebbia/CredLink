# Usage Meters Implementation

**Stripe Billing Meter Configuration for C2PA-as-a-Service**

**Version**: 1.0.0  
**Implementation Date**: November 5, 2025  
**Platform**: Stripe Billing v2

---

## Meter Architecture Overview

### Primary Usage Meters

| Meter | Event Type | Aggregation | Reset Period | Billing Impact |
|-------|------------|-------------|--------------|----------------|
| `verify_operations` | `verify.completed` | Sum | Monthly | Overage charges |
| `sign_operations` | `sign.completed` | Sum | Monthly | Overage charges |
| `storage_gb` | `storage.measured` | Max | Monthly | Overage charges |
| `active_sites` | `site.activated` | Count | Monthly | Overage charges |

### Secondary Meters (Analytics)

| Meter | Event Type | Aggregation | Purpose |
|-------|------------|-------------|---------|
| `api_calls` | `api.request` | Sum | Usage analytics |
| `support_requests` | `support.ticket.created` | Count | Service metrics |
| `dashboard_views` | `dashboard.viewed` | Sum | Engagement tracking |

---

## Stripe Meter Configuration

### Verify Operations Meter

```json
{
  "event_name": "verify_operations",
  "display_name": "Verify Operations",
  "unit_label": "verify",
  "aggregation": {
    "type": "sum",
    "reset_on": "billing_period_start"
  },
  "event_schema": {
    "event_type": "verify.completed",
    "properties": {
      "customer_id": "string",
      "subscription_id": "string", 
      "timestamp": "timestamp",
      "manifest_id": "string",
      "verification_result": "boolean",
      "processing_time_ms": "integer"
    }
  },
  "filter_conditions": {
    "verification_result": "true"
  },
  "billing_integration": {
    "meter_id": "meter_verify_operations_v1",
    "price_parameter": "verify_usage",
    "included_quantities": {
      "starter": 2000,
      "growth": 15000,
      "scale": 60000
    }
  }
}
```

### Sign Operations Meter

```json
{
  "event_name": "sign_operations", 
  "display_name": "Sign Operations",
  "unit_label": "sign",
  "aggregation": {
    "type": "sum",
    "reset_on": "billing_period_start"
  },
  "event_schema": {
    "event_type": "sign.completed",
    "properties": {
      "customer_id": "string",
      "subscription_id": "string",
      "timestamp": "timestamp",
      "manifest_id": "string",
      "asset_type": "string",
      "file_size_bytes": "integer"
    }
  },
  "billing_integration": {
    "meter_id": "meter_sign_operations_v1",
    "price_parameter": "sign_usage",
    "included_quantities": {
      "starter": 200,
      "growth": 1000,
      "scale": 5000
    }
  }
}
```

### Storage GB Meter

```json
{
  "event_name": "storage_gb",
  "display_name": "Storage (GB)",
  "unit_label": "gb",
  "aggregation": {
    "type": "max",
    "reset_on": "billing_period_start"
  },
  "event_schema": {
    "event_type": "storage.measured",
    "properties": {
      "customer_id": "string",
      "subscription_id": "string",
      "timestamp": "timestamp",
      "storage_gb": "float",
      "evidence_gb": "float",
      "manifest_gb": "float"
    }
  },
  "calculation_logic": "storage_gb + evidence_gb + manifest_gb",
  "billing_integration": {
    "meter_id": "meter_storage_gb_v1",
    "price_parameter": "storage_usage",
    "included_quantities": {
      "starter": 10,
      "growth": 50,
      "scale": 200
    }
  }
}
```

### Active Sites Meter

```json
{
  "event_name": "active_sites",
  "display_name": "Active Sites",
  "unit_label": "site",
  "aggregation": {
    "type": "count",
    "reset_on": "billing_period_start",
    "unique_key": "domain"
  },
  "event_schema": {
    "event_type": "site.activated",
    "properties": {
      "customer_id": "string",
      "subscription_id": "string",
      "timestamp": "timestamp",
      "domain": "string",
      "site_type": "string"
    }
  },
  "billing_integration": {
    "meter_id": "meter_active_sites_v1",
    "price_parameter": "sites_usage",
    "included_quantities": {
      "starter": 2,
      "growth": 5,
      "scale": 10
    }
  }
}
```

---

## Event Implementation

### Event Sending Infrastructure

```javascript
// Stripe Event Sender Configuration
const stripeEventSender = {
  apiKey: process.env.STRIPE_SECRET_KEY,
  endpoint: 'https://api.stripe.com/v1/billing/meter_events',
  batchSize: 100,
  retryAttempts: 3,
  timeout: 5000
};

// Verify Operation Event
async function reportVerifyOperation(data) {
  // Input validation and sanitization
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data object');
  }
  
  const sanitizedData = {
    customerId: sanitizeCustomerId(data.customerId),
    manifestId: sanitizeManifestId(data.manifestId),
    result: sanitizeResult(data.result),
    processingTime: Math.max(0, parseInt(data.processingTime) || 0)
  };
  
  if (!sanitizedData.customerId || !sanitizedData.manifestId) {
    throw new Error('Missing required fields');
  }
  
  const event = {
    event_name: 'verify_operations',
    payload: {
      value: 1, // Count as 1 verify operation
      stripe_customer_id: sanitizedData.customerId,
      timestamp: Math.floor(Date.now() / 1000),
      metadata: {
        manifest_id: sanitizedData.manifestId,
        verification_result: sanitizedData.result,
        processing_time_ms: sanitizedData.processingTime
      }
    }
  };
  
  return await sendStripeEvent(event);
}

// Sign Operation Event
async function reportSignOperation(data) {
  // Input validation and sanitization
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data object');
  }
  
  const sanitizedData = {
    customerId: sanitizeCustomerId(data.customerId),
    manifestId: sanitizeManifestId(data.manifestId),
    assetType: sanitizeAssetType(data.assetType),
    fileSize: Math.max(0, parseInt(data.fileSize) || 0)
  };
  
  if (!sanitizedData.customerId || !sanitizedData.manifestId) {
    throw new Error('Missing required fields');
  }
  
  const event = {
    event_name: 'sign_operations',
    payload: {
      value: 1, // Count as 1 sign operation
      stripe_customer_id: sanitizedData.customerId,
      timestamp: Math.floor(Date.now() / 1000),
      metadata: {
        manifest_id: sanitizedData.manifestId,
        asset_type: sanitizedData.assetType,
        file_size_bytes: sanitizedData.fileSize
      }
    }
  };
  
  return await sendStripeEvent(event);
}

// Storage Measurement Event
async function reportStorageUsage(data) {
  // Input validation and sanitization
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data object');
  }
  
  const sanitizedData = {
    customerId: sanitizeCustomerId(data.customerId),
    evidenceGb: Math.max(0, parseFloat(data.evidenceGb) || 0),
    manifestGb: Math.max(0, parseFloat(data.manifestGb) || 0),
    backupGb: Math.max(0, parseFloat(data.backupGb) || 0)
  };
  
  if (!sanitizedData.customerId) {
    throw new Error('Missing customer ID');
  }
  
  const totalStorage = sanitizedData.evidenceGb + sanitizedData.manifestGb + sanitizedData.backupGb;
  
  const event = {
    event_name: 'storage_gb',
    payload: {
      value: totalStorage,
      stripe_customer_id: sanitizedData.customerId,
      timestamp: Math.floor(Date.now() / 1000),
      metadata: {
        evidence_gb: sanitizedData.evidenceGb,
        manifest_gb: sanitizedData.manifestGb,
        backup_gb: sanitizedData.backupGb
      }
    }
  };
  
  return await sendStripeEvent(event);
}

// Site Activation Event
async function reportSiteActivation(data) {
  // Input validation and sanitization
  if (!data || typeof data !== 'object') {
    throw new Error('Invalid data object');
  }
  
  const sanitizedData = {
    customerId: sanitizeCustomerId(data.customerId),
    domain: sanitizeDomain(data.domain),
    siteType: sanitizeSiteType(data.siteType)
  };
  
  if (!sanitizedData.customerId || !sanitizedData.domain) {
    throw new Error('Missing required fields');
  }
  
  const event = {
    event_name: 'active_sites',
    payload: {
      value: 1, // Count as 1 active site
      stripe_customer_id: sanitizedData.customerId,
      timestamp: Math.floor(Date.now() / 1000),
      metadata: {
        domain: sanitizedData.domain,
        site_type: sanitizedData.siteType
      }
    }
  };
  
  return await sendStripeEvent(event);
}

// Sanitization helper functions
function sanitizeCustomerId(id) {
  if (!id || typeof id !== 'string') return null;
  return id.replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 100);
}

function sanitizeManifestId(id) {
  if (!id || typeof id !== 'string') return null;
  return id.replace(/[^a-zA-Z0-9_\-]/g, '').substring(0, 100);
}

function sanitizeResult(result) {
  if (!result || typeof result !== 'string') return 'unknown';
  return ['success', 'failed', 'pending'].includes(result) ? result : 'unknown';
}

function sanitizeAssetType(type) {
  if (!type || typeof type !== 'string') return 'unknown';
  return ['image', 'video', 'document', 'audio'].includes(type) ? type : 'unknown';
}

function sanitizeDomain(domain) {
  if (!domain || typeof domain !== 'string') return null;
  return domain.toLowerCase().replace(/[^a-zA-Z0-9.\-]/g, '').substring(0, 253);
}

function sanitizeSiteType(type) {
  if (!type || typeof type !== 'string') return 'unknown';
  return ['wordpress', 'shopify', 'custom', 'drupal'].includes(type) ? type : 'unknown';
}
```

---

## Integration Points

### API Middleware Implementation

```javascript
// Express.js Middleware for Usage Tracking
const usageTrackingMiddleware = {
  // Security headers middleware
  securityHeadersMiddleware: (req, res, next) => {
    // HSTS
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
    
    // Prevent clickjacking
    res.setHeader('X-Frame-Options', 'DENY');
    
    // Prevent MIME type sniffing
    res.setHeader('X-Content-Type-Options', 'nosniff');
    
    // XSS Protection
    res.setHeader('X-XSS-Protection', '1; mode=block');
    
    // Content Security Policy
    res.setHeader('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
      "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net https://cdnjs.cloudflare.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://api.stripe.com https://api.c2concierge.com wss://api.c2concierge.com"
    );
    
    // Referrer Policy
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    
    next();
  },
  
  // CORS middleware
  corsMiddleware: (req, res, next) => {
    const allowedOrigins = [
      process.env.FRONTEND_URL || 'https://app.c2concierge.com',
      'https://staging.c2concierge.com',
      'http://localhost:3000'
    ];
    
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
    
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    
    next();
  },
  
  verifyOperation: async (req, res, next) => {
    try {
      // Authentication validation
      if (!req.user || !req.user.stripeCustomerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      // Input validation
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Invalid request body' });
      }
      
      const startTime = Date.now();
      
      // Process verification with rate limiting check
      const rateLimitKey = `verify_${req.user.id}`;
      if (await isRateLimited(rateLimitKey, 100, 60000)) { // 100 requests per minute
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }
      
      const result = await processVerification(req.body);
      
      // Report usage to Stripe with error handling
      try {
        await reportVerifyOperation({
          customerId: req.user.stripeCustomerId,
          manifestId: result.manifestId,
          result: result.success,
          processingTime: Date.now() - startTime
        });
      } catch (stripeError) {
        console.error('Failed to report usage to Stripe:', stripeError.message);
        // Continue with response even if Stripe reporting fails
      }
      
      res.json(result);
    } catch (error) {
      console.error('Verification operation error:', error.message);
      next(error);
    }
  },
  
  signOperation: async (req, res, next) => {
    try {
      // Authentication validation
      if (!req.user || !req.user.stripeCustomerId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      
      // Input validation
      if (!req.body || typeof req.body !== 'object') {
        return res.status(400).json({ error: 'Invalid request body' });
      }
      
      // Rate limiting check
      const rateLimitKey = `sign_${req.user.id}`;
      if (await isRateLimited(rateLimitKey, 50, 60000)) { // 50 requests per minute
        return res.status(429).json({ error: 'Rate limit exceeded' });
      }
      
      // Process signing
      const result = await processSigning(req.body);
      
      // Report usage to Stripe with error handling
      try {
        await reportSignOperation({
          customerId: req.user.stripeCustomerId,
          manifestId: result.manifestId,
          assetType: req.body.assetType,
          fileSize: req.body.fileSize
        });
      } catch (stripeError) {
        console.error('Failed to report usage to Stripe:', stripeError.message);
        // Continue with response even if Stripe reporting fails
      }
      
      res.json(result);
    } catch (error) {
      console.error('Signing operation error:', error.message);
      next(error);
    }
  }
};

// Rate limiting helper
const rateLimitStore = new Map();

async function isRateLimited(key, maxRequests, windowMs) {
  const now = Date.now();
  const requests = rateLimitStore.get(key) || [];
  
  // Remove expired requests
  const validRequests = requests.filter(timestamp => now - timestamp < windowMs);
  
  if (validRequests.length >= maxRequests) {
    return true;
  }
  
  validRequests.push(now);
  rateLimitStore.set(key, validRequests);
  
  // Clean up old entries periodically
  if (Math.random() < 0.01) { // 1% chance to clean up
    for (const [k, reqs] of rateLimitStore.entries()) {
      const filtered = reqs.filter(timestamp => now - timestamp < windowMs);
      if (filtered.length === 0) {
        rateLimitStore.delete(k);
      } else {
        rateLimitStore.set(k, filtered);
      }
    }
  }
  
  return false;
}
```

### Background Job for Storage Measurement

```javascript
// Daily Storage Usage Calculation
const storageMeasurementJob = {
  schedule: '0 2 * * *', // 2 AM daily
  timeout: 300000, // 5 minutes timeout
  maxRetries: 3,
  retryDelay: 60000, // 1 minute
  
  handler: async () => {
    const startTime = Date.now();
    let processedCustomers = 0;
    let failedCustomers = 0;
    
    try {
      const customers = await getActiveCustomers();
      console.log(`Starting storage measurement for ${customers.length} customers`);
      
      // Process customers in batches to avoid memory issues
      const batchSize = 100;
      for (let i = 0; i < customers.length; i += batchSize) {
        const batch = customers.slice(i, i + batchSize);
        
        await Promise.allSettled(
          batch.map(async (customer) => {
            try {
              // Validate customer data
              if (!customer.id || !customer.stripeCustomerId) {
                console.error(`Invalid customer data: missing ID or Stripe customer ID`);
                failedCustomers++;
                return;
              }
              
              const storage = await calculateCustomerStorage(customer.id);
              
              // Validate storage calculation
              if (!storage || typeof storage !== 'object') {
                console.error(`Invalid storage calculation for customer ${customer.id}`);
                failedCustomers++;
                return;
              }
              
              await reportStorageUsage({
                customerId: customer.stripeCustomerId,
                evidenceGb: Math.max(0, parseFloat(storage.evidence) || 0),
                manifestGb: Math.max(0, parseFloat(storage.manifests) || 0),
                backupGb: Math.max(0, parseFloat(storage.backup) || 0)
              });
              
              processedCustomers++;
            } catch (error) {
              console.error(`Failed to process storage for customer ${customer.id}:`, error.message);
              failedCustomers++;
            }
          })
        );
        
        // Add delay between batches to prevent overwhelming the system
        if (i + batchSize < customers.length) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
      
      const duration = Date.now() - startTime;
      console.log(`Storage measurement completed: ${processedCustomers} processed, ${failedCustomers} failed, ${duration}ms`);
      
      // Alert if failure rate is too high
      if (failedCustomers > customers.length * 0.1) { // More than 10% failures
        await sendAlert('Storage measurement failure rate too high', {
          total: customers.length,
          failed: failedCustomers,
          rate: (failedCustomers / customers.length * 100).toFixed(2) + '%'
        });
      }
      
    } catch (error) {
      console.error('Storage measurement job failed:', error);
      throw error;
    }
  }
};
```

---

## Overage Calculation Logic

### Real-Time Overage Tracking

```javascript
class OverageTracker {
  constructor(stripeCustomerId) {
    // Input validation
    if (!stripeCustomerId || typeof stripeCustomerId !== 'string') {
      throw new Error('Valid Stripe customer ID is required');
    }
    
    this.customerId = stripeCustomerId;
    this.usage = {};
    this.cacheTimeout = 60000; // 1 minute cache
    this.lastUpdate = 0;
  }
  
  async getCurrentUsage() {
    try {
      // Check cache first
      const now = Date.now();
      if (now - this.lastUpdate < this.cacheTimeout && Object.keys(this.usage).length > 0) {
        return this.usage;
      }
      
      // Validate customer exists
      const customer = await stripe.customers.retrieve(this.customerId);
      if (!customer || customer.deleted) {
        throw new Error('Customer not found or deleted');
      }
      
      const subscription = await stripe.subscriptions.list({
        customer: this.customerId,
        status: 'active',
        limit: 1,
        expand: ['data.customer.subscription']
      });
      
      if (!subscription.data || subscription.data.length === 0) {
        throw new Error('No active subscription found');
      }
      
      const activeSubscription = subscription.data[0];
      
      // Validate subscription period
      if (!activeSubscription.current_period_start || !activeSubscription.current_period_end) {
        throw new Error('Invalid subscription period');
      }
      
      const meterEvents = await stripe.billing.meter_events.list({
        customer: this.customerId,
        start_time: activeSubscription.current_period_start,
        end_time: activeSubscription.current_period_end,
        limit: 10000 // Prevent excessive data retrieval
      });
      
      if (!meterEvents.data) {
        console.warn('No meter events found for customer');
        return {};
      }
      
      this.usage = this.aggregateUsage(meterEvents.data);
      this.lastUpdate = now;
      
      return this.usage;
    } catch (error) {
      console.error(`Failed to get current usage for customer ${this.customerId}:`, error.message);
      throw new Error(`Unable to retrieve usage: ${error.message}`);
    }
  }
  
  calculateOverage(usage, included, overageRates) {
    try {
      // Input validation
      if (!usage || typeof usage !== 'object') {
        throw new Error('Usage data is required');
      }
      
      if (!included || typeof included !== 'object') {
        throw new Error('Included amounts data is required');
      }
      
      if (!overageRates || typeof overageRates !== 'object') {
        throw new Error('Overage rates data is required');
      }
      
      const overage = {};
      
      for (const [meter, used] of Object.entries(usage)) {
        // Validate meter data
        if (typeof used !== 'number' || used < 0) {
          console.warn(`Invalid usage amount for meter ${meter}: ${used}`);
          continue;
        }
        
        const includedAmount = Math.max(0, parseFloat(included[meter]) || 0);
        const overageAmount = Math.max(0, used - includedAmount);
        
        // Validate rate configuration
        const rateConfig = overageRates[meter];
        if (!rateConfig || typeof rateConfig !== 'object') {
          console.warn(`Missing or invalid rate configuration for meter ${meter}`);
          continue;
        }
        
        overage[meter] = {
          units: overageAmount,
          cost: this.calculateOverageCost(overageAmount, rateConfig)
        };
      }
      
      return overage;
    } catch (error) {
      console.error('Failed to calculate overage:', error.message);
      throw new Error(`Overage calculation failed: ${error.message}`);
    }
  }
  
  calculateOverageCost(units, rateConfig) {
    try {
      // Input validation
      if (typeof units !== 'number' || units < 0) {
        return 0;
      }
      
      if (!rateConfig || typeof rateConfig !== 'object') {
        return 0;
      }
      
      if (units === 0) {
        return 0;
      }
      
      if (rateConfig.type === 'flat') {
        const unitAmount = parseFloat(rateConfig.unit_amount) || 0;
        if (unitAmount < 0) {
          console.warn('Invalid unit amount in rate configuration');
          return 0;
        }
        return units * unitAmount;
      }
      
      if (rateConfig.type === 'tiered') {
        if (!Array.isArray(rateConfig.tiers)) {
          console.warn('Invalid tiers configuration');
          return 0;
        }
        return this.calculateTieredCost(units, rateConfig.tiers);
      }
      
      console.warn(`Unknown rate configuration type: ${rateConfig.type}`);
      return 0;
    } catch (error) {
      console.error('Failed to calculate overage cost:', error.message);
      return 0;
    }
  }
  
  calculateTieredCost(units, tiers) {
    try {
      if (!Array.isArray(tiers) || tiers.length === 0) {
        return 0;
      }
      
      let totalCost = 0;
      let remainingUnits = units;
      let previousUpTo = 0;
      
      // Sort tiers by up_to value
      const sortedTiers = tiers.sort((a, b) => (a.up_to || Infinity) - (b.up_to || Infinity));
      
      for (const tier of sortedTiers) {
        if (remainingUnits <= 0) break;
        
        const upTo = tier.up_to || Infinity;
        const tierUnits = Math.min(remainingUnits, upTo - previousUpTo);
        
        if (tierUnits > 0) {
          const unitAmount = parseFloat(tier.unit_amount) || 0;
          if (unitAmount >= 0) {
            totalCost += tierUnits * unitAmount;
          }
        }
        
        remainingUnits -= tierUnits;
        previousUpTo = upTo;
      }
      
      return Math.max(0, totalCost);
    } catch (error) {
      console.error('Failed to calculate tiered cost:', error.message);
      return 0;
    }
  }
  
  aggregateUsage(meterEvents) {
    try {
      if (!Array.isArray(meterEvents)) {
        return {};
      }
      
      const aggregated = {};
      
      for (const event of meterEvents) {
        if (!event || !event.event_name || !event.payload) {
          continue;
        }
        
        const meter = event.event_name;
        const value = parseFloat(event.payload.value) || 0;
        
        if (value >= 0) {
          aggregated[meter] = (aggregated[meter] || 0) + value;
        }
      }
      
      return aggregated;
    } catch (error) {
      console.error('Failed to aggregate usage:', error.message);
      return {};
    }
  }
}
```

---

## Alert Configuration

### Usage Alert Implementation

```javascript
class UsageAlertManager {
  constructor() {
    this.thresholds = {
      warning: 0.8,
      critical: 0.95,
      exceeded: 1.0
    };
  }
  
  async checkUsageThresholds(customerId) {
    const tracker = new OverageTracker(customerId);
    const usage = await tracker.getCurrentUsage();
    const subscription = await this.getCustomerSubscription(customerId);
    
    for (const [meter, used] of Object.entries(usage)) {
      const included = subscription.included_usage[meter];
      const utilization = used / included;
      
      if (utilization >= this.thresholds.exceeded) {
        await this.sendAlert(customerId, meter, 'exceeded', utilization);
      } else if (utilization >= this.thresholds.critical) {
        await this.sendAlert(customerId, meter, 'critical', utilization);
      } else if (utilization >= this.thresholds.warning) {
        await this.sendAlert(customerId, meter, 'warning', utilization);
      }
    }
  }
  
  async sendAlert(customerId, meter, level, utilization) {
    const customer = await this.getCustomer(customerId);
    
    // Send email alert
    await emailService.send({
      to: customer.billingEmail,
      template: `usage_${level}`,
      data: {
        meter: this.formatMeterName(meter),
        utilization: Math.round(utilization * 100),
        remaining: Math.round((1 - utilization) * 100)
      }
    });
    
    // Send webhook
    await webhookService.send({
      url: process.env.USAGE_WEBHOOK_URL,
      payload: {
        customer_id: customerId,
        meter,
        level,
        utilization,
        timestamp: new Date().toISOString()
      }
    });
    
    // Update in-app notification
    await notificationService.create({
      customerId,
      type: 'usage_alert',
      level,
      message: `${this.formatMeterName(meter)} usage at ${Math.round(utilization * 100)}%`,
      actionUrl: '/billing/usage'
    });
  }
}
```

---

## Testing and Validation

### Meter Testing Framework

```javascript
class MeterTestSuite {
  async testVerifyMeter() {
    const testData = {
      customerId: 'cus_test_123',
      manifestId: 'man_test_456',
      result: true,
      processingTime: 250
    };
    
    // Send test event
    const result = await reportVerifyOperation(testData);
    
    // Verify event received
    const events = await stripe.billing.meter_events.list({
      customer: testData.customerId,
      limit: 1
    });
    
    assert(events.data.length === 1);
    assert(events.data[0].event_name === 'verify_operations');
    assert(events.data[0].payload.value === 1);
  }
  
  async testOverageCalculation() {
    const tracker = new OverageTracker('cus_test_123');
    
    const usage = { verify_operations: 2500 };
    const included = { verify_operations: 2000 };
    const overageRates = {
      verify_operations: {
        type: 'flat',
        unit_amount: 4 // $0.04 in cents
      }
    };
    
    const overage = tracker.calculateOverage(usage, included, overageRates);
    
    assert(overage.verify_operations.units === 500);
    assert(overage.verify_operations.cost === 2000); // 500 * 4 cents
  }
}
```

---

## Monitoring and Analytics

### Meter Performance Metrics

| Metric | Description | Target |
|--------|-------------|--------|
| Event Latency | Time from operation to Stripe event | <5 seconds |
| Event Success Rate | Percentage of events successfully sent | >99.9% |
| Billing Accuracy | Correctness of usage calculations | 100% |
| Alert Timeliness | Time from threshold breach to alert | <15 minutes |

### Dashboard Configuration

```json
{
  "dashboard_widgets": [
    {
      "type": "usage_gauge",
      "title": "Current Usage",
      "meters": ["verify_operations", "sign_operations"],
      "display": "percentage_of_included"
    },
    {
      "type": "overage_projection",
      "title": "Projected Month-End Bill",
      "calculation": "current_usage * (days_in_month / days_elapsed)"
    },
    {
      "type": "alert_history",
      "title": "Recent Alerts",
      "timeframe": "30_days"
    }
  ]
}
```

---

*Last Updated: November 5, 2025*  
**Implementation**: Stripe Billing v2 + Custom Event Layer  
**Testing**: Required before production deployment  
**Monitoring**: Real-time dashboards and alerting
