# Alerting and Policy System

**Comprehensive Bill Shock Prevention Framework**

**Version**: 1.0.0  
**Implementation Date**: November 5, 2025  
**Objective**: Zero unexpected charges, predictable billing

---

## Alert System Architecture

### Multi-Layer Alert Framework

```
Alert System Layers
├── Real-Time Monitoring
│   ├── Usage Threshold Alerts
│   ├── Anomaly Detection
│   └── Rate Limit Monitoring
├── Predictive Analytics
│   ├── Usage Forecasting
│   ├── Bill Projection
│   └── Risk Scoring
├── Customer Communication
│   ├── Email Notifications
│   ├── In-App Messages
│   ├── SMS Alerts (Enterprise)
│   └── Webhook Integrations
└── Policy Enforcement
    ├── Auto-Degradation
    ├── Spend Caps
    └── Approval Workflows
```

### Alert Threshold Configuration

```javascript
const alertThresholds = {
  usage: {
    warning: 0.80,    // 80% of limit
    critical: 0.95,   // 95% of limit
    exceeded: 1.00    // 100%+ of limit
  },
  spend: {
    monthly_warning: 0.80,  // 80% of expected monthly spend
    monthly_critical: 0.95, // 95% of expected monthly spend
    annual_warning: 0.75,   // 75% of annual commitment
    annual_critical: 0.90   // 90% of annual commitment
  },
  rate: {
    spike_threshold: 3.0,   // 3x normal usage rate
    sustained_threshold: 2.0 // 2x normal for >1 hour
  },
  anomaly: {
    confidence_threshold: 0.95, // 95% confidence for anomaly detection
    min_deviation: 0.50        // 50% deviation from normal
  }
};
```

---

## Real-Time Usage Monitoring

### Usage Tracking Engine

```javascript
class UsageMonitoringEngine {
  constructor(config) {
    // Input validation
    if (!config || typeof config !== 'object') {
      throw new Error('Configuration object is required');
    }
    
    this.config = config;
    this.alertThresholds = alertThresholds;
    this.alertCooldowns = new Map();
    this.usageHistory = new Map();
    this.anomalyDetector = new AnomalyDetector();
    this.alertManager = new AlertManager(config);
    
    // Start monitoring
    this.startRealTimeMonitoring();
  }
  
  startRealTimeMonitoring() {
    this.alertManager.startMonitoring();
  }
  
  async checkAllCustomersUsage() {
    const activeCustomers = await this.getActiveCustomers();
    
    for (const customer of activeCustomers) {
      try {
        await this.checkCustomerUsage(customer.id);
      } catch (error) {
        console.error(`Error checking usage for customer ${customer.id.substring(0, 8)}...:`, error.message);
      }
    }
  }
  
  async checkCustomerUsage(customerId) {
    const currentUsage = await this.getCurrentUsage(customerId);
    const subscription = await this.getSubscription(customerId);
    const alerts = [];
    
    // Check each usage meter
    for (const [meterId, usage] of Object.entries(currentUsage)) {
      const meterConfig = subscription.meters[meterId];
      if (!meterConfig) continue;
      
      const utilization = usage.used / meterConfig.limit;
      const alertLevel = this.getAlertLevel(utilization);
      
      if (alertLevel) {
        const alertKey = `${customerId}-${meterId}-${alertLevel}`;
        
        if (this.shouldSendAlert(alertKey, alertLevel)) {
          alerts.push({
            customerId,
            meterId,
            level: alertLevel,
            utilization,
            usage: {
              used: usage.used,
              limit: meterConfig.limit,
              remaining: Math.max(0, meterConfig.limit - usage.used)
            },
            projectedOverage: this.calculateProjectedOverage(usage, meterConfig),
            costImpact: this.calculateCostImpact(usage, meterConfig, utilization)
          });
        }
      }
    }
    
    // Send alerts if any
    if (alerts.length > 0) {
      await this.alertManager.sendAlerts(alerts);
    }
    
    // Check for anomalies
    await this.checkUsageAnomalies(customerId, currentUsage);
  }
  
  getAlertLevel(utilization) {
    if (utilization >= this.alertThresholds.usage.exceeded) return 'exceeded';
    if (utilization >= this.alertThresholds.usage.critical) return 'critical';
    if (utilization >= this.alertThresholds.usage.warning) return 'warning';
    return null;
  }
  
  shouldSendAlert(alertKey, level) {
    const now = Date.now();
    const lastSent = this.alertCooldowns.get(alertKey);
    
    // Cooldown periods to prevent alert fatigue
    const cooldownPeriods = {
      warning: 24 * 60 * 60 * 1000,    // 24 hours
      critical: 4 * 60 * 60 * 1000,     // 4 hours
      exceeded: 1 * 60 * 60 * 1000      // 1 hour
    };
    
    if (!lastSent || (now - lastSent) > cooldownPeriods[level]) {
      this.alertCooldowns.set(alertKey, now);
      return true;
    }
    
    return false;
  }
  
  calculateProjectedOverage(usage, meterConfig) {
    const daysInMonth = 30;
    const daysElapsed = new Date().getDate();
    const daysRemaining = daysInMonth - daysElapsed;
    
    if (daysElapsed === 0) return 0;
    
    const dailyAverage = usage.used / daysElapsed;
    const projectedTotal = dailyAverage * daysInMonth;
    const projectedOverage = Math.max(0, projectedTotal - meterConfig.limit);
    
    return {
      projectedOverage,
      projectedTotal,
      estimatedCost: projectedOverage * meterConfig.overageRate
    };
  }
  
  async checkRateSpikes() {
    const recentUsage = await this.getRecentUsage(300); // Last 5 minutes
    
    for (const [customerId, usageData] of Object.entries(recentUsage)) {
      const normalRate = await this.getNormalUsageRate(customerId);
      const currentRate = usageData.rate;
      
      if (currentRate > normalRate * this.alertThresholds.rate.spike_threshold) {
        await this.alertManager.sendRateSpikeAlert(customerId, {
          currentRate,
          normalRate,
          spikeMultiplier: currentRate / normalRate,
          duration: usageData.duration
        });
      }
    }
  }
  
  async checkUsageAnomalies(customerId, currentUsage) {
    const historicalUsage = await this.getHistoricalUsage(customerId, 30); // Last 30 days
    
    for (const [meterId, usage] of Object.entries(currentUsage)) {
      const anomaly = this.anomalyDetector.detectAnomaly(
        usage.used,
        historicalUsage[meterId] || []
      );
      
      if (anomaly.isAnomaly && anomaly.confidence >= this.alertThresholds.anomaly.confidence_threshold) {
        await this.alertManager.sendAnomalyAlert(customerId, {
          meterId,
          currentValue: usage.used,
          expectedRange: anomaly.expectedRange,
          confidence: anomaly.confidence,
          deviation: anomaly.deviation
        });
      }
    }
  }
}
```

### Anomaly Detection System

```javascript
class AnomalyDetector {
  constructor() {
    this.models = new Map();
    this.initializeModels();
  }
  
  initializeModels() {
    // Initialize statistical models for each meter type
    this.models.set('verify_operations', new StatisticalModel('verify_operations'));
    this.models.set('sign_operations', new StatisticalModel('sign_operations'));
    this.models.set('storage_gb', new StatisticalModel('storage_gb'));
    this.models.set('sites', new StatisticalModel('sites'));
  }
  
  detectAnomaly(currentValue, historicalValues) {
    if (historicalValues.length < 7) {
      // Not enough data for anomaly detection
      return { isAnomaly: false, confidence: 0 };
    }
    
    // Calculate statistical parameters
    const mean = this.calculateMean(historicalValues);
    const stdDev = this.calculateStandardDeviation(historicalValues, mean);
    
    // Calculate Z-score
    const zScore = Math.abs((currentValue - mean) / stdDev);
    
    // Determine if this is an anomaly
    const confidence = this.calculateConfidence(zScore);
    const isAnomaly = confidence >= alertThresholds.anomaly.confidence_threshold &&
                     Math.abs((currentValue - mean) / mean) >= alertThresholds.anomaly.min_deviation;
    
    return {
      isAnomaly,
      confidence,
      zScore,
      expectedRange: {
        lower: mean - (2 * stdDev),
        upper: mean + (2 * stdDev)
      },
      deviation: Math.abs((currentValue - mean) / mean)
    };
  }
  
  calculateMean(values) {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }
  
  calculateStandardDeviation(values, mean) {
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    const avgSquaredDiff = squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
    return Math.sqrt(avgSquaredDiff);
  }
  
  calculateConfidence(zScore) {
    // Convert Z-score to confidence using normal distribution
    // This is a simplified calculation
    return Math.min(0.99, zScore / 3.0);
  }
}
```

---

## Predictive Analytics

### Usage Forecasting

```javascript
class UsageForecastingEngine {
  constructor() {
    this.forecastModels = new Map();
    this.initializeForecastModels();
  }
  
  initializeForecastModels() {
    // Initialize forecasting models for each meter type
    this.forecastModels.set('verify_operations', new TimeSeriesForecastModel('verify_operations'));
    this.forecastModels.set('sign_operations', new TimeSeriesForecastModel('sign_operations'));
    this.forecastModels.set('storage_gb', new TimeSeriesForecastModel('storage_gb'));
    this.forecastModels.set('sites', new TimeSeriesForecastModel('sites'));
  }
  
  async forecastUsage(customerId, forecastDays = 30) {
    const historicalUsage = await this.getHistoricalUsage(customerId, 90); // Last 90 days
    const forecasts = {};
    
    for (const [meterId, model] of this.forecastModels) {
      const meterHistory = historicalUsage[meterId] || [];
      
      if (meterHistory.length >= 14) { // Need at least 2 weeks of data
        const forecast = await model.forecast(meterHistory, forecastDays);
        forecasts[meterId] = forecast;
      } else {
        // Use simple linear extrapolation for insufficient data
        forecasts[meterId] = this.simpleExtrapolation(meterHistory, forecastDays);
      }
    }
    
    return {
      customerId,
      forecastDays,
      forecasts,
      confidence: this.calculateOverallConfidence(forecasts),
      generatedAt: new Date().toISOString()
    };
  }
  
  async forecastBillImpact(customerId, forecast) {
    const subscription = await this.getSubscription(customerId);
    const projectedCosts = {};
    
    for (const [meterId, forecastData] of Object.entries(forecast.forecasts)) {
      const meterConfig = subscription.meters[meterId];
      if (!meterConfig) continue;
      
      const projectedUsage = forecastData.projectedValue;
      const includedLimit = meterConfig.limit;
      
      if (projectedUsage > includedLimit) {
        const overageAmount = projectedUsage - includedLimit;
        const overageCost = overageAmount * meterConfig.overageRate;
        
        projectedCosts[meterId] = {
          projectedUsage,
          includedLimit,
          overageAmount,
          overageCost,
          totalCost: subscription.basePrice + overageCost
        };
      } else {
        projectedCosts[meterId] = {
          projectedUsage,
          includedLimit,
          overageAmount: 0,
          overageCost: 0,
          totalCost: subscription.basePrice
        };
      }
    }
    
    const totalProjectedCost = Object.values(projectedCosts)
      .reduce((sum, cost) => sum + cost.totalCost, 0);
    
    return {
      customerId,
      forecastPeriod: `${forecast.forecastDays} days`,
      currentMonthlyBill: subscription.basePrice,
      projectedMonthlyBill: totalProjectedCost,
      projectedOverage: totalProjectedCost - subscription.basePrice,
      projectedCosts,
      riskLevel: this.calculateBillRiskLevel(totalProjectedCost, subscription.basePrice)
    };
  }
  
  calculateBillRiskLevel(projectedCost, baseCost) {
    const increasePercentage = (projectedCost - baseCost) / baseCost;
    
    if (increasePercentage >= 0.5) return 'critical';    // 50%+ increase
    if (increasePercentage >= 0.25) return 'high';       // 25%+ increase
    if (increasePercentage >= 0.10) return 'medium';     // 10%+ increase
    return 'low';
  }
}
```

### Risk Scoring System

```javascript
class BillRiskScoringSystem {
  constructor() {
    this.riskFactors = {
      usageGrowth: { weight: 0.3, threshold: 1.5 },
      utilizationRate: { weight: 0.25, threshold: 0.9 },
      paymentHistory: { weight: 0.2, threshold: 0.95 },
      supportTickets: { weight: 0.15, threshold: 5 },
      contractValue: { weight: 0.1, threshold: 10000 }
    };
  }
  
  async calculateRiskScore(customerId) {
    const customerData = await this.getCustomerRiskData(customerId);
    let totalScore = 0;
    
    for (const [factor, config] of Object.entries(this.riskFactors)) {
      const factorScore = this.calculateFactorScore(customerData[factor], config);
      totalScore += factorScore * config.weight;
    }
    
    const riskLevel = this.categorizeRiskLevel(totalScore);
    
    return {
      customerId,
      riskScore: Math.round(totalScore * 100),
      riskLevel,
      factors: this.getFactorBreakdown(customerData),
      recommendations: this.generateRiskRecommendations(riskLevel),
      calculatedAt: new Date().toISOString()
    };
  }
  
  calculateFactorScore(value, config) {
    // Normalize factor score to 0-1 range
    if (typeof value === 'number') {
      return Math.min(1, value / config.threshold);
    } else if (typeof value === 'boolean') {
      return value ? 1 : 0;
    }
    return 0;
  }
  
  categorizeRiskLevel(score) {
    if (score >= 0.8) return 'critical';
    if (score >= 0.6) return 'high';
    if (score >= 0.4) return 'medium';
    return 'low';
  }
  
  generateRiskRecommendations(riskLevel) {
    const recommendations = {
      critical: [
        'Immediate customer success manager intervention',
        'Implement hard spend caps',
        'Require approval for additional usage',
        'Daily monitoring and check-ins'
      ],
      high: [
        'Proactive outreach with usage optimization',
        'Implement soft spend caps with alerts',
        'Weekly usage reviews',
        'Offer upgrade options'
      ],
      medium: [
        'Monthly usage reports',
        'Automated alerts at 80% utilization',
        'Self-service optimization tools'
      ],
      low: [
        'Standard monitoring',
        'Monthly billing summaries'
      ]
    };
    
    return recommendations[riskLevel] || recommendations.low;
  }
}
```

---

## Customer Communication System

### Multi-Channel Alert Delivery

```javascript
class AlertCommunicationSystem {
  constructor() {
    this.channels = {
      email: new EmailChannel(),
      inApp: new InAppChannel(),
      webhook: new WebhookChannel(),
      sms: new SMSChannel() // Enterprise only
    };
    
    this.templates = new AlertTemplateManager();
    this.preferences = new CustomerPreferenceManager();
  }
  
  async sendAlert(customerId, alertData) {
    const customerPreferences = await this.preferences.getPreferences(customerId);
    const channels = this.determineChannels(alertData.level, customerPreferences);
    
    const results = [];
    
    for (const channelType of channels) {
      try {
        const channel = this.channels[channelType];
        const template = this.templates.getTemplate(channelType, alertData.level);
        const message = this.renderMessage(template, alertData, customerId);
        
        const result = await channel.send(customerId, message);
        results.push({ channel: channelType, success: true, result });
        
      } catch (error) {
        console.error(`Failed to send ${channelType} alert to customer ${customerId.substring(0, 8)}...:`, error.message);
        results.push({ channel: channelType, success: false, error: error.message });
      }
    }
    
    // Log alert delivery
    await this.logAlertDelivery(customerId, alertData, results);
    
    return results;
  }
  
  determineChannels(alertLevel, preferences) {
    const channels = [];
    
    // Base channels for all alerts
    if (preferences.email !== false) {
      channels.push('email');
    }
    
    if (preferences.inApp !== false) {
      channels.push('inApp');
    }
    
    // Critical alerts go to all enabled channels
    if (alertLevel === 'critical') {
      if (preferences.sms && preferences.tier === 'enterprise') {
        channels.push('sms');
      }
      
      if (preferences.webhook) {
        channels.push('webhook');
      }
    }
    
    // High severity alerts include webhook if configured
    if (alertLevel === 'high' && preferences.webhook) {
      channels.push('webhook');
    }
    
    return channels;
  }
  
  renderMessage(template, alertData, customerId) {
    const context = {
      ...alertData,
      customerName: alertData.customerName || 'Valued Customer',
      companyName: alertData.companyName || 'Your Company',
      dashboardUrl: `https://dashboard.credlink.com/customers/${customerId}`,
      supportUrl: 'https://support.credlink.com',
      billingUrl: `https://billing.credlink.com/customers/${customerId}`
    };
    
    return template.render(context);
  }
}

// Email Channel Implementation
class EmailChannel {
  constructor() {
    this.emailProvider = new SendGridClient();
  }
  
  async send(customerId, message) {
    const customerEmail = await this.getCustomerEmail(customerId);
    
    const email = {
      to: customerEmail,
      from: 'alerts@credlink.com',
      subject: message.subject,
      html: message.html,
      text: message.text
    };
    
    const result = await this.emailProvider.send(email);
    
    return {
      messageId: result.messageId,
      status: 'sent',
      timestamp: new Date().toISOString()
    };
  }
}

// In-App Channel Implementation
class InAppChannel {
  constructor() {
    this.notificationService = new NotificationService();
  }
  
  async send(customerId, message) {
    const notification = {
      customerId,
      type: message.type,
      title: message.title,
      body: message.body,
      priority: message.priority,
      actions: message.actions,
      expiresAt: message.expiresAt
    };
    
    const result = await this.notificationService.create(notification);
    
    return {
      notificationId: result.id,
      status: 'delivered',
      timestamp: new Date().toISOString()
    };
  }
}
```

### Alert Templates

```javascript
class AlertTemplateManager {
  constructor() {
    this.templates = {
      email: {
        warning: new EmailTemplate('usage_warning'),
        critical: new EmailTemplate('usage_critical'),
        exceeded: new EmailTemplate('usage_exceeded'),
        anomaly: new EmailTemplate('usage_anomaly')
      },
      inApp: {
        warning: new InAppTemplate('usage_warning'),
        critical: new InAppTemplate('usage_critical'),
        exceeded: new InAppTemplate('usage_exceeded'),
        anomaly: new InAppTemplate('usage_anomaly')
      },
      webhook: {
        warning: new WebhookTemplate('usage_warning'),
        critical: new WebhookTemplate('usage_critical'),
        exceeded: new WebhookTemplate('usage_exceeded'),
        anomaly: new WebhookTemplate('usage_anomaly')
      }
    };
  }
  
  getTemplate(channel, level) {
    return this.templates[channel]?.[level] || this.templates[channel].warning;
  }
}

// Email Template for Usage Warning
class EmailTemplate {
  constructor(type) {
    this.type = type;
    this.templates = {
      usage_warning: {
        subject: 'C2 Concierge: Usage approaching monthly limit',
        html: this.getWarningEmailTemplate(),
        text: this.getWarningTextTemplate()
      },
      usage_critical: {
        subject: 'URGENT: C2 Concierge usage at critical level - action required',
        html: this.getCriticalEmailTemplate(),
        text: this.getCriticalTextTemplate()
      },
      usage_exceeded: {
        subject: 'C2 Concierge: Monthly limit exceeded - overage charges applied',
        html: this.getExceededEmailTemplate(),
        text: this.getExceededTextTemplate()
      }
    };
  }
  
  render(context) {
    const template = this.templates[this.type];
    if (!template) throw new Error(`Template not found: ${this.type}`);
    
    return {
      subject: this.interpolate(template.subject, context),
      html: this.interpolate(template.html, context),
      text: this.interpolate(template.text, context)
    };
  }
  
  getWarningEmailTemplate() {
    return `
      <div class="alert-content" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #f3f4f6; padding: 20px; border-radius: 8px;">
          <h2 style="color: #d97706; margin-bottom: 16px;">⚠️ Usage Alert: 80% of Monthly Limit Reached</h2>
          
          <p>Hi {{customerName}},</p>
          
          <p>Your C2 Concierge usage has reached 80% of your monthly limit for the following metrics:</p>
          
          <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
            <tr style="background: #e5e7eb;">
              <th style="padding: 8px; text-align: left; border: 1px solid #d1d5db;">Metric</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #d1d5db;">Used</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #d1d5db;">Included</th>
              <th style="padding: 8px; text-align: left; border: 1px solid #d1d5db;">Remaining</th>
            </tr>
            {{#each usageBreakdown}}
            <tr>
              <td style="padding: 8px; border: 1px solid #d1d5db;">{{metric}}</td>
              <td style="padding: 8px; border: 1px solid #d1d5db;">{{used}}</td>
              <td style="padding: 8px; border: 1px solid #d1d5db;">{{included}}</td>
              <td style="padding: 8px; border: 1px solid #d1d5db; color: #d97706;">{{remaining}}</td>
            </tr>
            {{/each}}
          </table>
          
          <div style="background: #fef3c7; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #92400e; margin-bottom: 8px;">Projected Month-End Impact</h3>
            <p style="color: #78350f; margin: 0;">
              If current usage continues: <strong>${{projectedOverage}}</strong> in overage charges
            </p>
            <p style="color: #78350f; margin: 8px 0 0 0;">
              Estimated total bill: <strong>${{projectedBill}}</strong>
            </p>
          </div>
          
          <div style="margin: 24px 0;">
            <a href="{{dashboardUrl}}" style="background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 12px;">
              View Detailed Usage
            </a>
            <a href="{{billingUrl}}/upgrade" style="background: #10b981; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Upgrade Plan
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px;">
            Questions? Contact us at <a href="mailto:billing@credlink.com" style="color: #3b82f6;">billing@credlink.com</a>
          </p>
        </div>
      </div>
    `;
  }
  
  getCriticalEmailTemplate() {
    return `
      <div class="alert-content" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: #fef2f2; padding: 20px; border-radius: 8px; border: 2px solid #ef4444;">
          <h2 style="color: #dc2626; margin-bottom: 16px;">🚨 URGENT: Usage at Critical Level - Immediate Action Required</h2>
          
          <p>Hi {{customerName}},</p>
          
          <p><strong>Immediate action required:</strong> Your usage has reached 95% of your monthly limit.</p>
          
          <div style="background: #fee2e2; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #991b1b; margin-bottom: 8px;">Current Status:</h3>
            <ul style="color: #7f1d1d; margin: 0; padding-left: 20px;">
              <li><strong>Time Remaining:</strong> {{daysRemaining}} days in billing cycle</li>
              <li><strong>Estimated Overage:</strong> ${{estimatedOverage}}</li>
              <li><strong>Service Impact:</strong> {{serviceImpact}}</li>
              <li><strong>Auto-Degradation:</strong> Scheduled in {{hoursUntilDegradation}} hours</li>
            </ul>
          </div>
          
          <div style="background: #fca5a5; padding: 16px; border-radius: 6px; margin: 20px 0;">
            <h3 style="color: #7f1d1d; margin-bottom: 8px;">Immediate Actions Required:</h3>
            <ol style="color: #7f1d1d; margin: 0; padding-left: 20px;">
              <li><strong>Upgrade Now:</strong> Increase limits to avoid service interruption</li>
              <li><strong>Optimize Usage:</strong> Review and reduce non-critical operations</li>
              <li><strong>Set Alerts:</strong> Configure custom alerts for earlier warning</li>
              <li><strong>Contact Support:</strong> Schedule emergency consultation</li>
            </ol>
          </div>
          
          <div style="margin: 24px 0;">
            <a href="{{billingUrl}}/upgrade?urgent=true" style="background: #dc2626; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin-right: 12px;">
              Upgrade Immediately
            </a>
            <a href="{{supportUrl}}/emergency" style="background: #6b7280; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Emergency Support
            </a>
          </div>
          
          <p style="color: #6b7280; font-size: 14px; font-style: italic;">
            This is an automated urgent alert. Service degradation may occur if action is not taken.
          </p>
        </div>
      </div>
    `;
  }
  
  interpolate(template, context) {
    // Simple template interpolation
    return template.replace(/\{\{([^}]+)\}\}/g, (match, key) => {
      return context[key] || match;
    });
  }
}
```

---

## Policy Enforcement System

### Spend Cap Management

```javascript
class SpendCapManager {
  constructor() {
    this.capPolicies = {
      starter: { monthly: 500, annual: 5000, auto_degrade: true },
      growth: { monthly: 2000, annual: 20000, auto_degrade: true },
      scale: { monthly: 10000, annual: 100000, auto_degrade: false }
    };
    
    this.enforcementActions = {
      warning: 'send_alerts',
      soft_limit: 'throttle_usage',
      hard_limit: 'stop_service',
      admin_override: 'require_approval'
    };
  }
  
  async enforceSpendCaps(customerId) {
    const customer = await this.getCustomer(customerId);
    const currentSpend = await this.calculateCurrentSpend(customerId);
    const capPolicy = this.capPolicies[customer.plan] || this.capPolicies.starter;
    
    const utilization = currentSpend.monthly / capPolicy.monthly;
    const action = this.determineEnforcementAction(utilization, capPolicy);
    
    switch (action) {
      case 'send_alerts':
        await this.sendSpendAlerts(customerId, currentSpend, capPolicy);
        break;
        
      case 'throttle_usage':
        await this.throttleCustomerUsage(customerId, utilization);
        await this.sendThrottleNotification(customerId);
        break;
        
      case 'stop_service':
        await this.stopCustomerService(customerId);
        await this.sendServiceStopNotification(customerId);
        break;
        
      case 'require_approval':
        await this.requireAdminApproval(customerId, currentSpend);
        break;
    }
    
    return {
      customerId,
      currentSpend,
      capPolicy,
      utilization,
      action,
      enforcedAt: new Date().toISOString()
    };
  }
  
  determineEnforcementAction(utilization, capPolicy) {
    if (utilization >= 1.0) {
      return capPolicy.auto_degrade ? 'stop_service' : 'require_approval';
    } else if (utilization >= 0.95) {
      return capPolicy.auto_degrade ? 'throttle_usage' : 'send_alerts';
    } else if (utilization >= 0.8) {
      return 'send_alerts';
    }
    
    return null;
  }
  
  async throttleCustomerUsage(customerId, utilization) {
    const throttleConfig = {
      rateLimit: Math.max(1, Math.floor(100 * (1 - utilization))), // Reduce rate limit
      priorityQueue: utilization >= 0.9, // Enable priority queue for high utilization
      batchProcessing: utilization >= 0.95 // Enable batch processing only
    };
    
    await this.updateCustomerThrottling(customerId, throttleConfig);
    
    // Log throttling action
    await this.logPolicyEnforcement(customerId, 'usage_throttled', {
      utilization,
      config: throttleConfig
    });
  }
}
```

### Auto-Degradation Policies

```javascript
class AutoDegradationManager {
  constructor() {
    this.degradationPolicies = {
      starter: {
        triggers: [
          { metric: 'verify_operations', threshold: 1.0, action: 'hard_stop' },
          { metric: 'sign_operations', threshold: 1.0, action: 'hard_stop' },
          { metric: 'storage_gb', threshold: 1.2, action: 'read_only' },
          { metric: 'monthly_spend', threshold: 1.0, action: 'service_suspend' }
        ]
      },
      growth: {
        triggers: [
          { metric: 'verify_operations', threshold: 1.5, action: 'rate_limit' },
          { metric: 'sign_operations', threshold: 1.5, action: 'rate_limit' },
          { metric: 'storage_gb', threshold: 1.5, action: 'throttle_writes' },
          { metric: 'monthly_spend', threshold: 1.2, action: 'admin_review' }
        ]
      },
      scale: {
        triggers: [
          { metric: 'verify_operations', threshold: 2.0, action: 'priority_queue' },
          { metric: 'sign_operations', threshold: 2.0, action: 'priority_queue' },
          { metric: 'monthly_spend', threshold: 1.5, action: 'notify_only' }
        ]
      }
    };
  }
  
  async checkDegradationTriggers(customerId) {
    const customer = await this.getCustomer(customerId);
    const currentUsage = await this.getCurrentUsage(customerId);
    const currentSpend = await this.getCurrentSpend(customerId);
    
    const policy = this.degradationPolicies[customer.plan] || this.degradationPolicies.starter;
    const triggeredActions = [];
    
    for (const trigger of policy.triggers) {
      let currentValue;
      
      if (trigger.metric === 'monthly_spend') {
        currentValue = currentSpend.monthly;
        const monthlyLimit = await this.getMonthlySpendLimit(customerId);
        currentValue = currentValue / monthlyLimit;
      } else {
        const usage = currentUsage[trigger.metric];
        const limit = await this.getUsageLimit(customerId, trigger.metric);
        currentValue = usage.used / limit;
      }
      
      if (currentValue >= trigger.threshold) {
        const action = await this.executeDegradationAction(
          customerId,
          trigger.action,
          trigger.metric,
          currentValue
        );
        
        triggeredActions.push({
          trigger: trigger.metric,
          threshold: trigger.threshold,
          currentValue,
          action: trigger.action,
          result: action
        });
      }
    }
    
    if (triggeredActions.length > 0) {
      await this.sendDegradationNotification(customerId, triggeredActions);
    }
    
    return triggeredActions;
  }
  
  async executeDegradationAction(customerId, action, metric, currentValue) {
    switch (action) {
      case 'hard_stop':
        return await this.hardStopService(customerId, metric);
        
      case 'rate_limit':
        return await this.applyRateLimit(customerId, metric, currentValue);
        
      case 'read_only':
        return await this.setReadOnly(customerId, metric);
        
      case 'service_suspend':
        return await this.suspendService(customerId);
        
      case 'priority_queue':
        return await this.enablePriorityQueue(customerId, metric);
        
      case 'admin_review':
        return await this.flagForAdminReview(customerId, metric, currentValue);
        
      default:
        return { status: 'unknown_action', action };
    }
  }
  
  async hardStopService(customerId, metric) {
    // Completely stop the specific service
    await this.updateServiceStatus(customerId, metric, 'stopped');
    
    return {
      status: 'stopped',
      metric,
      timestamp: new Date().toISOString(),
      reason: 'Usage limit exceeded - hard stop applied'
    };
  }
  
  async applyRateLimit(customerId, metric, utilization) {
    // Apply dynamic rate limiting based on utilization
    const reductionFactor = Math.max(0.1, 2 - utilization); // Reduce to minimum 10%
    
    await this.updateRateLimit(customerId, metric, {
      requestsPerSecond: Math.floor(100 * reductionFactor),
      burstCapacity: Math.floor(200 * reductionFactor)
    });
    
    return {
      status: 'rate_limited',
      metric,
      utilization,
      reductionFactor,
      timestamp: new Date().toISOString()
    };
  }
}
```

---

## Configuration and Management

### Alert Policy Configuration

```javascript
const alertPolicyConfig = {
  global: {
    enabled: true,
    timezone: 'UTC',
    businessHoursOnly: false,
    weekendsEnabled: true
  },
  
  thresholds: {
    usage: {
      warning: 0.80,
      critical: 0.95,
      exceeded: 1.00
    },
    spend: {
      monthlyWarning: 0.80,
      monthlyCritical: 0.95,
      annualWarning: 0.75,
      annualCritical: 0.90
    },
    rate: {
      spikeMultiplier: 3.0,
      sustainedMultiplier: 2.0,
      sustainedDuration: 3600 // 1 hour
    }
  },
  
  channels: {
    email: {
      enabled: true,
      templates: {
        warning: 'usage_warning',
        critical: 'usage_critical',
        exceeded: 'usage_exceeded'
      },
      rateLimits: {
        perHour: 5,
        perDay: 20
      }
    },
    
    inApp: {
      enabled: true,
      displayDuration: 300000, // 5 minutes
      maxActive: 3
    },
    
    webhook: {
      enabled: true,
      retryPolicy: {
        maxAttempts: 3,
        backoff: 'exponential'
      },
      timeout: 10000 // 10 seconds
    },
    
    sms: {
      enabled: false, // Enterprise only
      tierRequirement: 'enterprise',
      rateLimits: {
        perHour: 3,
        perDay: 10
      }
    }
  },
  
  enforcement: {
    autoDegrade: {
      enabled: true,
      plans: ['starter', 'growth'],
      warningPeriod: 3600000 // 1 hour before degradation
    },
    
    spendCaps: {
      enabled: true,
      strictEnforcement: ['starter'],
      approvalRequired: ['growth', 'scale']
    }
  },
  
  escalation: {
    levels: [
      {
        name: 'level_1',
        delay: 0, // Immediate
        channels: ['email', 'inApp'],
        recipients: ['customer']
      },
      {
        name: 'level_2',
        delay: 3600000, // 1 hour
        channels: ['email', 'webhook'],
        recipients: ['customer', 'customer_success']
      },
      {
        name: 'level_3',
        delay: 7200000, // 2 hours
        channels: ['email', 'webhook', 'sms'],
        recipients: ['customer', 'customer_success', 'management']
      }
    ]
  }
};
```

---

*Last Updated: November 5, 2025*  
**Monitoring**: 24/7 automated monitoring with human oversight  
**Response Time**: < 5 minutes for critical alerts  
**Compliance**: GDPR Art. 28 compliant data handling
