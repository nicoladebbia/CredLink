# Commissions, Attribution & Partner Relationship Management

## Referral Program Structure

### Revenue Share Tiers
```javascript
const COMMISSION_TIERS = {
  verified: {
    baseRate: 0.20,        // 20% of first-year subscription
    marketplaceAddOn: 0.05, // Additional 5% on marketplace add-ons
    minimumContract: 1000,  // $1,000 minimum contract value
    payoutFrequency: 'monthly'
  },
  advanced: {
    baseRate: 0.25,        // 25% of first-year subscription
    marketplaceAddOn: 0.07, // Additional 7% on marketplace add-ons
    minimumContract: 2500,  // $2,500 minimum contract value
    payoutFrequency: 'monthly'
  },
  premier: {
    baseRate: 0.30,        // 30% of first-year subscription
    marketplaceAddOn: 0.10, // Additional 10% on marketplace add-ons
    minimumContract: 5000,  // $5,000 minimum contract value
    payoutFrequency: 'monthly'
  }
};
```

### Fixed Bounty Structure (Alternative)
```javascript
const SKU_BOUNTIES = {
  'starter-plan': 500,
  'professional-plan': 1500,
  'enterprise-plan': 5000,
  'custom-integration': 2500,
  'survival-report': 200,
  'evidence-pack': 300,
  'compliance-audit': 1000
};
```

## Attribution System

### Partner-Scoped URL Generation
```javascript
class AttributionEngine {
  generatePartnerURL(partnerId, campaign = null) {
    const baseUrl = 'https://c2concierge.com';
    const utmParams = {
      utm_source: 'partner',
      utm_medium: 'referral',
      utm_campaign: campaign || 'marketplace',
      utm_content: partnerId,
      utm_term: `partner-${partnerId}`
    };
    
    const queryString = new URLSearchParams(utmParams).toString();
    return `${baseUrl}/?${queryString}`;
  }
  
  generateDealRegistrationURL(partnerId) {
    return `https://c2concierge.com/partners/register-deal?partner=${partnerId}&token=${this.generateDealToken(partnerId)}`;
  }
  
  generateDealToken(partnerId) {
    return jwt.sign(
      { 
        partnerId, 
        purpose: 'deal-registration',
        expires: Date.now() + (60 * 24 * 60 * 60 * 1000) // 60 days
      },
      process.env.ATTRIBUTION_SECRET
    );
  }
}
```

### GA4 Integration
```javascript
class GA4Attribution {
  trackPartnerAttribution(sessionData) {
    const { utm_source, utm_medium, utm_campaign, utm_content } = sessionData;
    
    if (utm_source === 'partner' && utm_content) {
      const attributionData = {
        event: 'partner_referral',
        parameters: {
          partner_id: utm_content,
          campaign: utm_campaign,
          medium: utm_medium,
          timestamp: new Date().toISOString(),
          session_id: sessionData.sessionId
        }
      };
      
      this.sendToGA4(attributionData);
      this.storeAttributionCookie(utm_content, utm_campaign);
    }
  }
  
  async sendToGA4(data) {
    const measurementId = process.env.GA4_MEASUREMENT_ID;
    const apiSecret = process.env.GA4_API_SECRET;
    
    const response = await fetch(`https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: data.parameters.session_id,
        events: [{
          name: data.event,
          parameters: data.parameters
        }]
      })
    });
    
    return response.ok;
  }
}
```

### CRM Integration
```javascript
class CRMAttribution {
  async createAttributedLead(contactData, attributionData) {
    const lead = {
      firstName: contactData.firstName,
      lastName: contactData.lastName,
      email: contactData.email,
      company: contactData.company,
      phone: contactData.phone,
      
      // Attribution fields
      leadSource: 'Partner Referral',
      partnerId: attributionData.partnerId,
      partnerCampaign: attributionData.campaign,
      partnerTier: attributionData.partnerTier,
      attributionDate: new Date().toISOString(),
      
      // Deal registration
      dealRegistrationId: attributionData.dealId,
      dealStatus: 'New',
      expectedCloseDate: this.calculateExpectedCloseDate(),
      
      // Commission tracking
      commissionRate: this.getCommissionRate(attributionData.partnerTier),
      commissionStatus: 'Pending',
      coolingPeriodEnds: this.calculateCoolingPeriodEnd()
    };
    
    const result = await this.crmService.createLead(lead);
    
    // Update partner attribution tracking
    await this.updatePartnerAttribution(attributionData.partnerId, {
      leadId: result.id,
      attributionDate: new Date(),
      status: 'attributed'
    });
    
    return result;
  }
  
  calculateCoolingPeriodEnd() {
    // 90-day cooling period for commission attribution
    return new Date(Date.now() + (90 * 24 * 60 * 60 * 1000));
  }
}
```

## Deal Registration System

### Opportunity Registration
```javascript
class DealRegistration {
  async registerOpportunity(partnerId, opportunityData) {
    const registration = {
      id: this.generateRegistrationId(),
      partnerId,
      
      // Opportunity details
      companyName: opportunityData.companyName,
      dealValue: opportunityData.dealValue,
      expectedCloseDate: opportunityData.expectedCloseDate,
      dealStage: 'Registered',
      
      // Product interest
      interestedProducts: opportunityData.products,
      estimatedContractValue: opportunityData.estimatedValue,
      
      // Competition
      competingSolutions: opportunityData.competitors || [],
      differentiation: opportunityData.differentiation || '',
      
      // Registration metadata
      registeredAt: new Date(),
      expiresAt: this.calculateExpiryDate(),
      status: 'Active',
      
      // Commission calculation
      estimatedCommission: this.calculateEstimatedCommission(
        opportunityData.estimatedValue,
        await this.getPartnerTier(partnerId)
      )
    };
    
    // Validate registration rules
    const validation = await this.validateRegistration(registration);
    if (!validation.valid) {
      throw new Error(`Registration failed: ${validation.errors.join(', ')}`);
    }
    
    // Check for duplicates
    const duplicate = await this.checkDuplicateRegistration(partnerId, opportunityData.companyName);
    if (duplicate) {
      throw new Error('Opportunity already registered by this partner');
    }
    
    // Save registration
    await this.saveRegistration(registration);
    
    // Notify partner and internal teams
    await this.notifyRegistrationCreated(registration);
    
    return registration;
  }
  
  calculateExpiryDate() {
    // Auto-expire in 60 days unless advanced
    return new Date(Date.now() + (60 * 24 * 60 * 60 * 1000));
  }
  
  async validateRegistration(registration) {
    const errors = [];
    
    // Validate partner status
    const partner = await this.getPartner(registration.partnerId);
    if (!partner || partner.status !== 'active') {
      errors.push('Partner not found or inactive');
    }
    
    // Validate deal value
    if (registration.dealValue < 1000) {
      errors.push('Deal value must be at least $1,000');
    }
    
    // Validate close date
    const minCloseDate = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
    if (new Date(registration.expectedCloseDate) < minCloseDate) {
      errors.push('Expected close date must be at least 7 days from now');
    }
    
    // Check registration limits
    const activeRegistrations = await this.getActiveRegistrationCount(registration.partnerId);
    if (activeRegistrations >= 10) {
      errors.push('Partner has reached maximum active registrations');
    }
    
    return {
      valid: errors.length === 0,
      errors
    };
  }
}
```

## Commission Calculation & Payouts

### Commission Engine
```javascript
class CommissionEngine {
  calculateCommission(deal, partnerTier) {
    const tier = COMMISSION_TIERS[partnerTier];
    
    let commission = 0;
    
    // Base commission on first-year subscription value
    if (deal.contractType === 'subscription') {
      commission = deal.firstYearValue * tier.baseRate;
    }
    
    // Add marketplace add-on commission
    if (deal.marketplaceAddOns && deal.marketplaceAddOns.length > 0) {
      const addOnValue = deal.marketplaceAddOns.reduce((sum, addOn) => sum + addOn.value, 0);
      commission += addOnValue * tier.marketplaceAddOn;
    }
    
    // Apply fixed bounty if applicable
    if (deal.pricingModel === 'bounty') {
      commission = SKU_BOUNTIES[deal.sku] || 0;
    }
    
    // Apply minimum commission guarantee
    commission = Math.max(commission, tier.minimumContract * 0.05);
    
    return {
      grossCommission: commission,
      netCommission: commission * 0.92, // 8% platform fee
      tier: partnerTier,
      calculationDate: new Date(),
      dealId: deal.id
    };
  }
  
  async processMonthlyPayouts(partnerId) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    
    // Get eligible commissions
    const commissions = await this.getEligibleCommissions(partnerId, monthStart, monthEnd);
    
    // Calculate total payout
    const totalPayout = commissions.reduce((sum, commission) => sum + commission.netCommission, 0);
    
    // Apply payout thresholds
    if (totalPayout < 100) {
      return { status: 'below_threshold', amount: totalPayout, threshold: 100 };
    }
    
    // Create payout record
    const payout = {
      id: this.generatePayoutId(),
      partnerId,
      period: { start: monthStart, end: monthEnd },
      totalAmount: totalPayout,
      commissionCount: commissions.length,
      status: 'Processing',
      createdAt: new Date(),
      scheduledFor: this.calculatePayoutDate()
    };
    
    await this.savePayout(payout);
    await this.scheduleStripeTransfer(payout);
    
    return payout;
  }
  
  calculatePayoutDate() {
    // Net-30 payment terms
    const payoutDate = new Date();
    payoutDate.setDate(payoutDate.getDate() + 30);
    return payoutDate;
  }
}
```

### Stripe Connect Integration
```javascript
class StripeConnectIntegration {
  async createPartnerAccount(partnerData) {
    const account = await stripe.accounts.create({
      type: 'express',
      country: partnerData.country,
      email: partnerData.email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true }
      },
      business_profile: {
        name: partnerData.companyName,
        url: partnerData.website,
        product_description: 'C2PA implementation and integration services'
      }
    });
    
    // Create account link for onboarding
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: `${process.env.BASE_URL}/partners/stripe/refresh`,
      return_url: `${process.env.BASE_URL}/partners/stripe/complete`,
      type: 'account_onboarding'
    });
    
    return {
      accountId: account.id,
      onboardingUrl: accountLink.url
    };
  }
  
  async processPayout(payout) {
    const partner = await this.getPartner(payout.partnerId);
    
    try {
      const transfer = await stripe.transfers.create({
        amount: Math.round(payout.totalAmount * 100), // Convert to cents
        currency: 'usd',
        destination: partner.stripeAccountId,
        transfer_group: `payout-${payout.id}`,
        metadata: {
          payoutId: payout.id,
          partnerId: payout.partnerId,
          period: `${payout.period.start.toISOString()}_${payout.period.end.toISOString()}`
        }
      });
      
      // Update payout status
      await this.updatePayoutStatus(payout.id, 'Transferred', {
        stripeTransferId: transfer.id,
        transferredAt: new Date()
      });
      
      // Notify partner
      await this.notifyPayoutProcessed(payout, transfer);
      
      return transfer;
    } catch (error) {
      await this.updatePayoutStatus(payout.id, 'Failed', {
        error: error.message,
        failedAt: new Date()
      });
      
      throw error;
    }
  }
}
```

## Webhook Events

### Event System
```javascript
class PartnerWebhookService {
  async triggerEvent(eventType, data) {
    const event = {
      id: this.generateEventId(),
      type: eventType,
      data,
      timestamp: new Date(),
      version: '1.0'
    };
    
    // Store event
    await this.storeEvent(event);
    
    // Trigger webhook handlers
    await this.processWebhooks(event);
    
    return event;
  }
  
  async processWebhooks(event) {
    const webhooks = await this.getActiveWebhooks(event.type);
    
    for (const webhook of webhooks) {
      try {
        await this.sendWebhook(webhook, event);
        await this.logWebhookSuccess(webhook.id, event.id);
      } catch (error) {
        await this.logWebhookFailure(webhook.id, event.id, error);
        // Implement retry logic
        await this.scheduleRetry(webhook, event);
      }
    }
  }
  
  async sendWebhook(webhook, event) {
    const payload = {
      event: event.type,
      data: event.data,
      timestamp: event.timestamp,
      signature: this.generateSignature(event, webhook.secret)
    };
    
    const response = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-C2PA-Signature': payload.signature,
        'X-C2PA-Event': event.type
      },
      body: JSON.stringify(payload),
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }
    
    return response;
  }
}
```

### Event Types
```javascript
const WEBHOOK_EVENTS = {
  DEAL_REGISTERED: 'partner.deal_registered',
  ATTRIBUTION_MATCHED: 'partner.attribution_matched',
  COMMISSION_EARNED: 'partner.commission_earned',
  PAYOUT_CREATED: 'partner.payout_created',
  PAYOUT_PROCESSED: 'partner.payout_processed',
  TIER_UPDATED: 'partner.tier_updated',
  CERTIFICATION_EXPIRED: 'partner.certification_expired'
};
```

## Dashboard & Reporting

### Partner Dashboard
```javascript
class PartnerDashboard {
  async getPartnerDashboard(partnerId, timeframe = '90d') {
    const [
      metrics,
      recentDeals,
      commissionHistory,
      payoutSchedule,
      attributionFunnel
    ] = await Promise.all([
      this.getPartnerMetrics(partnerId, timeframe),
      this.getRecentDeals(partnerId, 10),
      this.getCommissionHistory(partnerId, timeframe),
      this.getPayoutSchedule(partnerId),
      this.getAttributionFunnel(partnerId, timeframe)
    ]);
    
    return {
      overview: metrics,
      deals: recentDeals,
      commissions: commissionHistory,
      payouts: payoutSchedule,
      attribution: attributionFunnel
    };
  }
  
  async getAttributionFunnel(partnerId, timeframe) {
    return {
      referrals: await this.countReferrals(partnerId, timeframe),
      leads: await this.countAttributedLeads(partnerId, timeframe),
      opportunities: await this.countDealsRegistered(partnerId, timeframe),
      closedWon: await this.countClosedWonDeals(partnerId, timeframe),
      conversionRates: {
        leadToOpportunity: await this.calculateLeadToOpportunityRate(partnerId, timeframe),
        opportunityToClose: await this.calculateOpportunityToCloseRate(partnerId, timeframe),
        overall: await this.calculateOverallConversionRate(partnerId, timeframe)
      }
    };
  }
}
```

## Testing & Validation

### Attribution Test Suite
```bash
# Test URL generation and tracking
npm run test:attribution-urls

# Test commission calculations
npm run test:commission-calculations

# Test deal registration
npm run test:deal-registration

# Test Stripe integration
npm run test:stripe-connect

# Test webhook delivery
npm run test:webhook-events
```

### Performance Monitoring
```javascript
class AttributionMonitoring {
  trackAttributionMetrics() {
    return {
      utmConversionRate: this.getUTMConversionRate(),
      partnerLeadQuality: this.getPartnerLeadQuality(),
      commissionAccuracy: this.getCommissionAccuracy(),
      payoutProcessingTime: this.getPayoutProcessingTime(),
      webhookDeliveryRate: this.getWebhookDeliveryRate()
    };
  }
}
```
