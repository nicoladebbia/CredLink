# Overage Handling Configuration

**Comprehensive Overage Management and Alerting System**

**Version**: 1.0.0  
**Implementation Date**: November 5, 2025  
**Target**: Zero bill shock, predictable costs

---

## Overage Policy Framework

### Cap Types and Behaviors

| Cap Type | Definition | Customer Experience | Billing Impact |
|----------|------------|---------------------|----------------|
| **Hard Cap** | Service stops when limit reached | Immediate interruption | No overage charges |
| **Soft Cap** | Service continues with alerts | Seamless service + overage | Overage billing applied |
| **Pooled Cap** | Shared across multiple metrics | Flexible resource allocation | Overage billing applied |

### Plan-Specific Overage Rules

```javascript
const overagePolicies = {
  starter: {
    verify_operations: {
      cap_type: "hard",
      action: "stop_service",
      overage_rate: null,
      alert_thresholds: [0.8, 0.95]
    },
    sign_operations: {
      cap_type: "hard", 
      action: "stop_service",
      overage_rate: null,
      alert_thresholds: [0.8, 0.95]
    },
    storage_gb: {
      cap_type: "soft",
      action: "alert_and_bill",
      overage_rate: 200, // $2.00 per GB
      alert_thresholds: [0.8, 0.95]
    },
    sites: {
      cap_type: "hard",
      action: "block_new_sites",
      overage_rate: 5000, // $50.00 per site
      alert_thresholds: [0.8, 0.95]
    }
  },
  growth: {
    verify_operations: {
      cap_type: "soft",
      action: "alert_and_bill",
      overage_rate: 3, // $0.03 per verify
      tiered_overage: [
        { up_to: 25000, rate: 3 },
        { up_to: null, rate: 2.5 }
      ],
      alert_thresholds: [0.8, 0.95]
    },
    sign_operations: {
      cap_type: "soft",
      action: "alert_and_bill", 
      overage_rate: 12, // $0.12 per sign
      alert_thresholds: [0.8, 0.95]
    },
    storage_gb: {
      cap_type: "soft",
      action: "alert_and_bill",
      overage_rate: 150, // $1.50 per GB
      alert_thresholds: [0.8, 0.95]
    },
    sites: {
      cap_type: "soft",
      action: "alert_and_bill",
      overage_rate: 4000, // $40.00 per site
      alert_thresholds: [0.8, 0.95]
    }
  },
  scale: {
    verify_operations: {
      cap_type: "pooled",
      action: "bill_overage",
      overage_rate: 2, // $0.02 per verify
      tiered_overage: [
        { up_to: 100000, rate: 2 },
        { up_to: null, rate: 1.5 }
      ]
    },
    sign_operations: {
      cap_type: "pooled",
      action: "bill_overage",
      overage_rate: 10 // $0.10 per sign
    },
    storage_gb: {
      cap_type: "pooled",
      action: "bill_overage",
      overage_rate: 125 // $1.25 per GB
    },
    sites: {
      cap_type: "pooled",
      action: "bill_overage",
      overage_rate: 3500 // $35.00 per site
    }
  }
};
```

---

## Alert System Implementation

### Multi-Channel Alert Configuration

```javascript
const alertSystem = {
  channels: {
    email: {
      enabled: true,
      templates: {
        warning_80: {
          subject: "C2 Concierge: Usage at 80% of monthly limit",
          template: "usage_warning_80_percent",
          timing: "immediate"
        },
        critical_95: {
          subject: "URGENT: C2 Concierge usage at 95% - action required",
          template: "usage_critical_95_percent", 
          timing: "immediate"
        },
        exceeded_100: {
          subject: "C2 Concierge: Monthly limit exceeded - overage charges applied",
          template: "usage_exceeded_100_percent",
          timing: "immediate"
        }
      }
    },
    webhook: {
      enabled: true,
      url: `${process.env.API_BASE_URL || 'https://api.c2concierge.com'}/webhooks/usage-alerts`,
      events: ["usage.warning", "usage.critical", "usage.exceeded"],
      retry_policy: {
        max_attempts: 3,
        backoff: "exponential"
      }
    },
    in_app: {
      enabled: true,
      display: {
        warning: {
          type: "banner",
          color: "yellow",
          dismissible: true,
          action_button: "View Usage"
        },
        critical: {
          type: "modal",
          color: "red",
          dismissible: false,
          action_button: "Upgrade Now"
        },
        exceeded: {
          type: "persistent_banner",
          color: "orange",
          dismissible: true,
          action_button: "View Bill"
        }
      }
    },
    sms: {
      enabled: false, // Optional for enterprise customers
      threshold: "critical_only",
      opt_in_required: true
    }
  }
};
```

### Alert Content Templates

#### 80% Warning Email Template

```html
<div class="alert-content">
  <h2>Usage Alert: 80% of Monthly Limit Reached</h2>
  
  <p>Hi {{customer_name}},</p>
  
  <p>Your C2 Concierge usage has reached 80% of your monthly limit:</p>
  
  <table class="usage-table">
    <tr>
      <th>Metric</th>
      <th>Used</th>
      <th>Included</th>
      <th>Remaining</th>
    </tr>
    {{#each usage_metrics}}
    <tr>
      <td>{{display_name}}</td>
      <td>{{used}}</td>
      <td>{{included}}</td>
      <td>{{remaining}}</td>
    </tr>
    {{/each}}
  </table>
  
  <div class="projections">
    <h3>Projected Month-End Bill</h3>
    <p>If current usage continues: <strong>${{projected_bill}}</strong></p>
    <p>Overage estimate: <strong>${{overage_estimate}}</strong></p>
  </div>
  
  <div class="actions">
    <a href="{{dashboard_url}}/billing/usage" class="btn-primary">View Detailed Usage</a>
    <a href="{{dashboard_url}}/billing/upgrade" class="btn-secondary">Upgrade Plan</a>
  </div>
  
  <p>Questions? Contact us at <a href="mailto:billing@c2concierge.com">billing@c2concierge.com</a></p>
</div>
```

#### 95% Critical Email Template

```html
<div class="alert-content critical">
  <h2>⚠️ URGENT: 95% Usage Limit - Action Required</h2>
  
  <p>Hi {{customer_name}},</p>
  
  <p><strong>Immediate action required:</strong> Your usage has reached 95% of your monthly limit.</p>
  
  <div class="critical-info">
    <h3>Current Status:</h3>
    <ul>
      <li><strong>Time Remaining:</strong> {{days_remaining}} days in billing cycle</li>
      <li><strong>Estimated Overage:</strong> ${{estimated_overage}}</li>
      <li><strong>Service Impact:</strong> {{service_impact}}</li>
    </ul>
  </div>
  
  <div class="immediate-actions">
    <h3>Recommended Actions:</h3>
    <ol>
      <li><strong>Upgrade Now:</strong> Increase your limits to avoid service interruption</li>
      <li><strong>Optimize Usage:</strong> Review your usage patterns and reduce non-critical operations</li>
      <li><strong>Set Alerts:</strong> Configure custom alerts for earlier warning</li>
    </ol>
  </div>
  
  <div class="actions">
    <a href="{{dashboard_url}}/billing/upgrade?urgent=true" class="btn-urgent">Upgrade Immediately</a>
    <a href="{{dashboard_url}}/billing/usage" class="btn-secondary">Review Usage</a>
  </div>
  
  <p><em>This is an automated urgent alert. Please respond promptly to avoid service disruption.</em></p>
</div>
```

---

## Real-Time Usage Monitoring

### Usage Calculation Engine

```javascript
class UsageMonitoringEngine {
  constructor(config) {
    // Input validation
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration object is required');
    }
    
    if (!config.stripeSecretKey || typeof config.stripeSecretKey !== 'string') {
      throw new Error('Valid Stripe secret key is required');
    }
    
    this.config = config;
    this.stripe = new Stripe(config.stripeSecretKey);
    this.checkInterval = Math.max(60000, parseInt(config.checkInterval) || 300000); // Min 1 minute
    this.monitoringInterval = null;
    this.maxConcurrentChecks = 10; // Prevent overwhelming the system
    this.errorThreshold = 0.1; // Alert if more than 10% of checks fail
    this.alertThresholds = {
      warning: 0.8,
      critical: 0.95,
      exceeded: 1.0
    };
    this.alertCache = new Map();
  }
  
  async startMonitoring() {
    // Clear any existing interval
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
    }
    
    this.monitoringInterval = setInterval(async () => {
      await this.checkAllCustomers();
    }, this.checkInterval);
  }
  
  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }
  
  async checkAllCustomers() {
    const startTime = Date.now();
    let processedCount = 0;
    let errorCount = 0;
    
    try {
      const activeCustomers = await this.getActiveCustomers();
      
      if (!Array.isArray(activeCustomers)) {
        throw new Error('Invalid customer data received');
      }
      
      console.log(`Starting usage check for ${activeCustomers.length} customers`);
      
      // Process customers in batches to prevent overwhelming the system
      const batches = [];
      for (let i = 0; i < activeCustomers.length; i += this.maxConcurrentChecks) {
        batches.push(activeCustomers.slice(i, i + this.maxConcurrentChecks));
      }
      
      for (const batch of batches) {
        await Promise.allSettled(
          batch.map(async (customer) => {
            try {
              // Validate customer object
              if (!customer || !customer.id) {
                console.error('Invalid customer object: missing ID');
                errorCount++;
                return;
              }
              
              await this.checkCustomerUsage(customer.id);
              processedCount++;
            } catch (error) {
              console.error(`Error checking usage for customer ${customer.id.substring(0, 8)}...:`, error.message);
              errorCount++;
            }
          })
        );
        
        // Add small delay between batches
        if (batches.indexOf(batch) < batches.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }
      
      const duration = Date.now() - startTime;
      const errorRate = errorCount / activeCustomers.length;
      
      console.log(`Usage check completed: ${processedCount} processed, ${errorCount} errors, ${duration}ms`);
      
      // Alert if error rate is too high
      if (errorRate > this.errorThreshold) {
        await this.sendSystemAlert('High error rate in usage monitoring', {
          total: activeCustomers.length,
          errors: errorCount,
          rate: (errorRate * 100).toFixed(2) + '%'
        });
      }
      
    } catch (error) {
      console.error('Failed to check all customers:', error.message);
      throw error;
    }
  }
  
  async checkCustomerUsage(customerId) {
    try {
      // Input validation
      if (!customerId || typeof customerId !== 'string') {
        throw new Error('Valid customer ID is required');
      }
      
      const usage = await this.getCurrentUsage(customerId);
      const subscription = await this.getSubscription(customerId);
      const alerts = [];
      
      // Validate usage data
      if (!usage || typeof usage !== 'object') {
        throw new Error('Invalid usage data received');
      }
      
      // Validate subscription data
      if (!subscription || typeof subscription !== 'object') {
        throw new Error('Invalid subscription data received');
      }
      
      if (!subscription.included_usage || typeof subscription.included_usage !== 'object') {
        throw new Error('Invalid included usage data in subscription');
      }
      
      for (const [meter, usageData] of Object.entries(usage)) {
        // Validate meter data
        if (!usageData || typeof usageData !== 'object') {
          console.warn(`Invalid usage data for meter ${meter}`);
          continue;
        }
        
        const included = parseFloat(subscription.included_usage[meter]) || 0;
        
        if (typeof usageData.used !== 'number' || usageData.used < 0) {
          console.warn(`Invalid usage amount for meter ${meter}: ${usageData.used}`);
          continue;
        }
        
        const utilization = usageData.used / Math.max(1, included);
        
        // Validate utilization
        if (utilization < 0 || utilization > 1000) { // Sanity check
          console.warn(`Unusual utilization for meter ${meter}: ${utilization}`);
          continue;
        }
        
        const alertLevel = this.getAlertLevel(utilization);
        
        if (alertLevel) {
          // Prevent duplicate alerts within cooldown period
          const alertKey = `${customerId}_${meter}_${alertLevel}`;
          if (this.shouldSendAlert(alertKey, alertLevel)) {
            alerts.push({
              customerId,
              meter,
              level: alertLevel,
              utilization,
              usageData: {
                used: usageData.used,
                included,
                remaining: Math.max(0, included - usageData.used)
              },
              projectedOverage: this.calculateProjectedOverage(usageData, included),
              timestamp: new Date().toISOString()
            });
          }
        }
      }
      
      // Send alerts for this customer
      if (alerts.length > 0) {
        await this.sendAlerts(customerId, alerts);
      }
      
    } catch (error) {
      console.error(`Failed to check usage for customer ${customerId.substring(0, 8)}...:`, error.message);
      throw error;
    }
  }
  
  getAlertLevel(utilization) {
    if (utilization >= this.alertThresholds.exceeded) return 'exceeded';
    if (utilization >= this.alertThresholds.critical) return 'critical';
    if (utilization >= this.alertThresholds.warning) return 'warning';
    return null;
  }
  
  shouldSendAlert(alertKey, level) {
    const now = Date.now();
    const lastSent = this.alertCache.get(alertKey);
    
    // Cooldown periods
    const cooldownPeriods = {
      warning: 24 * 60 * 60 * 1000, // 24 hours
      critical: 4 * 60 * 60 * 1000,  // 4 hours
      exceeded: 1 * 60 * 60 * 1000   // 1 hour
    };
    
    if (!lastSent || (now - lastSent) > cooldownPeriods[level]) {
      this.alertCache.set(alertKey, now);
      return true;
    }
    
    return false;
  }
  
  calculateProjectedOverage(usageData, included) {
    try {
      if (!usageData || typeof usageData.used !== 'number' || typeof included !== 'number') {
        return 0;
      }
      
      const currentUsage = usageData.used;
      const daysInMonth = 30; // Simplified
      const daysElapsed = new Date().getDate();
      
      if (daysElapsed === 0) return 0;
      
      const dailyAverage = currentUsage / daysElapsed;
      const projectedMonthly = dailyAverage * daysInMonth;
      
      return Math.max(0, projectedMonthly - included);
    } catch (error) {
      console.error('Failed to calculate projected overage:', error.message);
      return 0;
    }
  }
  
  async sendAlerts(customerId, alerts) {
    try {
      for (const alert of alerts) {
        await this.sendAlert(customerId, alert);
      }
    } catch (error) {
      console.error('Failed to send alerts:', error.message);
    }
  }
  
  async sendAlert(customerId, alert) {
    // Implementation would depend on alert system
    console.log(`Alert sent to customer ${customerId.substring(0, 8)}...: ${alert.level} - ${alert.meter} at ${(alert.utilization * 100).toFixed(1)}%`);
  }
  
  async sendSystemAlert(message, data) {
    // Implementation would depend on system alert system
    console.log(`SYSTEM ALERT: ${message}`, data);
  }
  
  async getActiveCustomers() {
    // Implementation would fetch active customers from database
    return [];
  }
  
  async getCurrentUsage(customerId) {
    // Implementation would fetch current usage from Stripe
    return {};
  }
  
  async getSubscription(customerId) {
    // Implementation would fetch subscription details
    return { included_usage: {} };
  }
```

---

## Mid-Term Change Handling

### Subscription Change Logic

```javascript
class SubscriptionChangeManager {
  constructor() {
    this.stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  }
  
  async handleUpgrade(subscriptionId, newPriceId) {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    
    // Calculate proration
    const prorationInvoice = await this.stripe.invoices.create({
      customer: subscription.customer,
      subscription: subscriptionId,
      description: 'Plan upgrade proration',
      proration_behavior: 'create_prorations'
    });
    
    // Update subscription immediately
    const updatedSubscription = await this.stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: newPriceId
      }],
      proration_behavior: 'create_prorations',
      billing_cycle_anchor: 'now' // Immediate effect
    });
    
    // Send confirmation
    await this.sendUpgradeConfirmation(updatedSubscription);
    
    return updatedSubscription;
  }
  
  async handleDowngrade(subscriptionId, newPriceId) {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    
    // Schedule downgrade for next billing cycle
    const updatedSubscription = await this.stripe.subscriptions.update(subscriptionId, {
      items: [{
        id: subscription.items.data[0].id,
        price: newPriceId
      }],
      proration_behavior: 'none', // No immediate credits
      billing_cycle_anchor: 'unchanged', // Keep current cycle
      metadata: {
        scheduled_change: 'downgrade',
        effective_date: subscription.current_period_end
      }
    });
    
    // Send scheduled change notification
    await this.sendDowngradeSchedule(updatedSubscription);
    
    return updatedSubscription;
  }
  
  async handleAddOnPurchase(subscriptionId, addOnPriceId) {
    const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
    const existingItems = subscription.items.data.map(item => ({
      id: item.id,
      price: item.price.id
    }));
    
    // Add-on takes effect immediately with proration
    const updatedSubscription = await this.stripe.subscriptions.update(subscriptionId, {
      items: [
        ...existingItems,
        { price: addOnPriceId, quantity: 1 }
      ],
      proration_behavior: 'create_prorations'
    });
    
    await this.sendAddOnConfirmation(updatedSubscription);
    
    return updatedSubscription;
  }
  
  async handleCancellation(subscriptionId) {
    const subscription = await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true,
      metadata: {
        cancellation_reason: 'customer_request',
        requested_at: new Date().toISOString()
      }
    });
    
    await this.sendCancellationConfirmation(subscription);
    
    return subscription;
  }
}
```

### Change Notification Templates

#### Upgrade Confirmation

```javascript
const upgradeConfirmationTemplate = {
  subject: "C2 Concierge: Plan Upgrade Confirmed",
  content: `
    Hi {{customer_name}},
    
    Your plan has been successfully upgraded to {{new_plan_name}}.
    
    Change Details:
    - Previous Plan: {{previous_plan_name}} (${{previous_price}})
    - New Plan: {{new_plan_name}} (${{new_price}})
    - Effective Date: {{effective_date}}
    - Proration Credit: ${{proration_credit}}
    - Next Invoice Amount: ${{next_invoice_amount}}
    
    Your new usage limits are now active:
    {{#each new_limits}}
    - {{display_name}}: {{included}} included
    {{/each}}
    
    View your updated subscription: {{dashboard_url}}/billing/subscription
  `
};
```

#### Downgrade Schedule

```javascript
const downgradeScheduleTemplate = {
  subject: "C2 Concierge: Plan Downgrade Scheduled",
  content: `
    Hi {{customer_name}},
    
    Your plan downgrade has been scheduled for {{effective_date}}.
    
    Change Details:
    - Current Plan: {{current_plan_name}} (${{current_price}})
    - Future Plan: {{future_plan_name}} (${{future_price}})
    - Effective Date: {{effective_date}}
    
    Important Notes:
    - Your current limits remain active until {{effective_date}}
    - No immediate charges or credits
    - You can cancel this change anytime before {{effective_date}}
    
    Manage your subscription: {{dashboard_url}}/billing/subscription
  `
};
```

---

## Bill Shock Prevention

### Spend Ceiling Configuration

```javascript
const spendCeilingConfig = {
  enabled: true,
  default_ceiling: {
    starter: 500, // $500 maximum monthly spend
    growth: 2000, // $2,000 maximum monthly spend
    scale: 10000  // $10,000 maximum monthly spend
  },
  auto_degrade: {
    enabled: true,
    threshold: 0.95, // Trigger at 95% of ceiling
    actions: {
      starter: "stop_non_critical_operations",
      growth: "throttle_verify_operations",
      scale: "alert_only"
    }
  },
  customer_override: {
    enabled: true,
    min_ceiling: 100, // $100 minimum
    max_ceiling: 50000, // $50,000 maximum
    approval_required: true
  }
};
```

### Auto-Degradation Logic

```javascript
class SpendCeilingManager {
  async checkSpendCeiling(customerId) {
    const currentSpend = await this.calculateCurrentSpend(customerId);
    const ceiling = await this.getCustomerCeiling(customerId);
    const utilization = currentSpend / ceiling;
    
    if (utilization >= 0.95) {
      await this.triggerAutoDegradation(customerId, utilization);
    }
  }
  
  async triggerAutoDegradation(customerId, utilization) {
    const subscription = await this.getSubscription(customerId);
    const plan = subscription.plan.nickname;
    
    switch (plan) {
      case 'starter':
        await this.stopNonCriticalOperations(customerId);
        break;
      case 'growth':
        await this.throttleVerifyOperations(customerId);
        break;
      case 'scale':
        await this.sendHighUsageAlert(customerId, utilization);
        break;
    }
    
    await this.notifyDegradation(customerId, plan, utilization);
  }
  
  async stopNonCriticalOperations(customerId) {
    // Disable non-critical API endpoints
    await this.updateCustomerLimits(customerId, {
      verify_operations: 'hard_stop',
      sign_operations: 'hard_stop',
      storage_gb: 'read_only'
    });
  }
  
  async throttleVerifyOperations(customerId) {
    // Reduce verify operation rate limit
    await this.updateRateLimits(customerId, {
      verify_operations: '10_per_minute' // Reduced from normal
    });
  }
}
```

---

## Customer Self-Service Tools

### Usage Dashboard Components

```javascript
const usageDashboard = {
  components: {
    currentUsageGauge: {
      type: 'gauge_chart',
      title: 'Current Usage',
      meters: ['verify_operations', 'sign_operations', 'storage_gb'],
      display: 'percentage_of_included',
      refresh_interval: 300000 // 5 minutes
    },
    projectedBill: {
      type: 'calculation_card',
      title: 'Projected Month-End Bill',
      calculation: 'current_daily_average * days_remaining',
      includes_overage: true,
      confidence_interval: true
    },
    usageHistory: {
      type: 'line_chart',
      title: 'Usage Trends (30 Days)',
      metrics: ['daily_usage', 'cumulative_usage'],
      comparison: 'previous_period'
    },
    overageSimulator: {
      type: 'interactive_calculator',
      title: 'Estimate Your Bill',
      inputs: ['expected_verifies', 'expected_signs', 'expected_storage'],
      real_time_calculation: true
    },
    upgradeOptions: {
      type: 'comparison_table',
      title: 'Upgrade Options',
      show_roi: true,
      highlight_best_value: true
    }
  }
};
```

---

## Testing and Validation

### Overage Test Scenarios

```javascript
const overageTestSuite = {
  scenarios: [
    {
      name: "Hard Cap Enforcement",
      setup: {
        plan: "starter",
        usage: { verify_operations: 2001 }
      },
      expected: {
        service_stopped: true,
        overage_charged: false,
        alert_sent: true
      }
    },
    {
      name: "Soft Cap with Overage",
      setup: {
        plan: "growth", 
        usage: { verify_operations: 16000 }
      },
      expected: {
        service_continues: true,
        overage_charged: true,
        overage_amount: 30, // 1000 * $0.03
        alert_sent: true
      }
    },
    {
      name: "Tiered Overage Calculation",
      setup: {
        plan: "growth",
        usage: { verify_operations: 30000 }
      },
      expected: {
        base_overage: 10000 * 0.03, // $300
        tiered_overage: 5000 * 0.025, // $125
        total_overage: 425 // $425
      }
    }
  ]
};
```

---

*Last Updated: November 5, 2025*  
**Implementation**: Stripe Billing + Custom Alert Engine  
**Testing**: Required before production deployment  
**Monitoring**: Real-time usage tracking and alert delivery
