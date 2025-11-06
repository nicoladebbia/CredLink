# Partner Operations Console & APIs

## Partner Console Architecture

### Console Dashboard
```javascript
class PartnerConsole {
  constructor(partnerId) {
    this.partnerId = partnerId;
    this.apiClient = new PartnerAPIClient();
    this.dashboard = new DashboardManager();
  }
  
  async initialize() {
    const partnerData = await this.apiClient.getPartner(this.partnerId);
    const dashboardData = await this.dashboard.getDashboardData(this.partnerId);
    
    return {
      partner: partnerData,
      dashboard: dashboardData,
      navigation: this.getNavigationItems(partnerData.tier),
      permissions: this.getPermissions(partnerData.tier)
    };
  }
  
  getNavigationItems(tier) {
    const baseNav = [
      { id: 'overview', label: 'Overview', icon: 'dashboard' },
      { id: 'deals', label: 'Deal Registration', icon: 'handshake' },
      { id: 'commissions', label: 'Commissions', icon: 'payments' },
      { id: 'marketing', label: 'Marketing Assets', icon: 'megaphone' }
    ];
    
    if (tier === 'advanced' || tier === 'premier') {
      baseNav.push(
        { id: 'mdf', label: 'MDF Requests', icon: 'funds' },
        { id: 'co-sell', label: 'Co-Sell Opportunities', icon: 'people' }
      );
    }
    
    if (tier === 'premier') {
      baseNav.push(
        { id: 'analytics', label: 'Advanced Analytics', icon: 'chart-line' },
        { id: 'support', label: 'Premium Support', icon: 'headset' }
      );
    }
    
    return baseNav;
  }
}
```

### Deal Registration Interface
```javascript
class DealRegistrationUI {
  async renderDealForm() {
    return {
      title: 'Register New Opportunity',
      sections: [
        {
          id: 'company-info',
          title: 'Company Information',
          fields: [
            {
              name: 'companyName',
              type: 'text',
              label: 'Company Name',
              required: true,
              validation: 'min:3,max:100'
            },
            {
              name: 'website',
              type: 'url',
              label: 'Company Website',
              required: true,
              validation: 'url'
            },
            {
              name: 'industry',
              type: 'select',
              label: 'Industry',
              required: true,
              options: await this.getIndustryOptions()
            }
          ]
        },
        {
          id: 'opportunity-details',
          title: 'Opportunity Details',
          fields: [
            {
              name: 'dealValue',
              type: 'currency',
              label: 'Estimated Deal Value',
              required: true,
              min: 1000,
              validation: 'min:1000'
            },
            {
              name: 'expectedCloseDate',
              type: 'date',
              label: 'Expected Close Date',
              required: true,
              minDate: new Date(Date.now() + (7 * 24 * 60 * 60 * 1000))
            },
            {
              name: 'products',
              type: 'checkbox-group',
              label: 'Interested Products',
              required: true,
              options: [
                { value: 'starter-plan', label: 'Starter Plan' },
                { value: 'professional-plan', label: 'Professional Plan' },
                { value: 'enterprise-plan', label: 'Enterprise Plan' },
                { value: 'custom-integration', label: 'Custom Integration' }
              ]
            }
          ]
        },
        {
          id: 'competition',
          title: 'Competitive Landscape',
          fields: [
            {
              name: 'competitors',
              type: 'multi-select',
              label: 'Competing Solutions',
              options: await this.getCompetitorOptions()
            },
            {
              name: 'differentiation',
              type: 'textarea',
              label: 'Competitive Differentiation',
              maxLength: 500,
              placeholder: 'How will C2PA provide unique value?'
            }
          ]
        }
      ],
      actions: [
        {
          type: 'submit',
          label: 'Register Opportunity',
          validation: 'validateDealRegistration'
        },
        {
          type: 'save-draft',
          label: 'Save as Draft'
        }
      ]
    };
  }
  
  async submitDealRegistration(formData) {
    const validation = await this.validateDealData(formData);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }
    
    const deal = await this.apiClient.registerDeal(this.partnerId, formData);
    
    // Update UI
    await this.updateDealsList();
    await this.showSuccessNotification('Opportunity registered successfully');
    
    // Trigger workflows
    await this.triggerDealRegistrationWorkflows(deal);
    
    return deal;
  }
}
```

### MDF Request Management
```javascript
class MDFRequestUI {
  async renderMDFRequestForm() {
    return {
      title: 'Market Development Funds Request',
      sections: [
        {
          id: 'campaign-info',
          title: 'Campaign Information',
          fields: [
            {
              name: 'campaignName',
              type: 'text',
              label: 'Campaign Name',
              required: true,
              validation: 'min:5,max:100'
            },
            {
              name: 'campaignType',
              type: 'select',
              label: 'Campaign Type',
              required: true,
              options: [
                { value: 'digital-advertising', label: 'Digital Advertising' },
                { value: 'conference-sponsorship', label: 'Conference Sponsorship' },
                { value: 'case-study', label: 'Customer Case Study' },
                { value: 'webinar', label: 'Webinar Production' }
              ]
            },
            {
              name: 'targetAudience',
              type: 'textarea',
              label: 'Target Audience Description',
              required: true,
              maxLength: 1000
            }
          ]
        },
        {
          id: 'financial-details',
          title: 'Financial Details',
          fields: [
            {
              name: 'requestedAmount',
              type: 'currency',
              label: 'Requested MDF Amount',
              required: true,
              min: 500,
              max: await this.getMaxMDFAmount()
            },
            {
              name: 'totalBudget',
              type: 'currency',
              label: 'Total Campaign Budget',
              required: true,
              validation: 'min:requestedAmount'
            },
            {
              name: 'expectedROI',
              type: 'text',
              label: 'Expected ROI (leads, pipeline, etc.)',
              required: true,
              maxLength: 500
            }
          ]
        },
        {
          id: 'timeline',
          title: 'Campaign Timeline',
          fields: [
            {
              name: 'startDate',
              type: 'date',
              label: 'Campaign Start Date',
              required: true,
              minDate: new Date(Date.now() + (14 * 24 * 60 * 60 * 1000))
            },
            {
              name: 'endDate',
              type: 'date',
              label: 'Campaign End Date',
              required: true,
              minDate: 'startDate'
            }
          ]
        }
      ],
      actions: [
        {
          type: 'submit',
          label: 'Submit MDF Request',
          validation: 'validateMDFRequest'
        }
      ]
    };
  }
  
  async submitMDFRequest(formData) {
    const request = {
      ...formData,
      partnerId: this.partnerId,
      submittedAt: new Date(),
      status: 'pending_review'
    };
    
    const mdfRequest = await this.apiClient.createMDFRequest(request);
    
    // Notify internal team
    await this.notifyMDFTeam(mdfRequest);
    
    // Update UI
    await this.updateMDFRequestsList();
    await this.showSuccessNotification('MDF request submitted for review');
    
    return mdfRequest;
  }
}
```

## REST API Implementation

### Core Partner API
```javascript
// Partner API Routes
app.use('/api/partners', partnerRouter);

// GET /api/partners/:id
partnerRouter.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const partner = await partnerService.getPartnerById(id);
    
    if (!partner) {
      return res.status(404).json({ error: 'Partner not found' });
    }
    
    // Check authorization
    if (req.user.partnerId !== id && !req.user.isAdmin) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    res.json(partner);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch partner' });
  }
});

// POST /api/partners/:id/deals
partnerRouter.post('/:id/deals', async (req, res) => {
  try {
    const { id } = req.params;
    const dealData = req.body;
    
    // Validate authorization
    if (req.user.partnerId !== id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    // Validate deal data
    const validation = await dealRegistrationService.validate(dealData);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors 
      });
    }
    
    const deal = await dealRegistrationService.register(id, dealData);
    
    // Trigger webhook
    await webhookService.triggerEvent('partner.deal_registered', {
      partnerId: id,
      dealId: deal.id,
      dealData
    });
    
    res.status(201).json(deal);
  } catch (error) {
    res.status(500).json({ error: 'Failed to register deal' });
  }
});

// GET /api/partners/:id/commissions
partnerRouter.get('/:id/commissions', async (req, res) => {
  try {
    const { id } = req.params;
    const { startDate, endDate, status } = req.query;
    
    // Validate authorization
    if (req.user.partnerId !== id) {
      return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const filters = {
      partnerId: id,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      status
    };
    
    const commissions = await commissionService.getCommissions(filters);
    
    res.json({
      commissions,
      summary: await commissionService.getSummary(filters),
      nextPayout: await commissionService.getNextPayout(id)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch commissions' });
  }
});
```

### Marketing Assets API
```javascript
// GET /api/partners/:id/marketing-assets
partnerRouter.get('/:id/marketing-assets', async (req, res) => {
  try {
    const { id } = req.params;
    const { type, format } = req.query;
    
    // Validate partner status and tier
    const partner = await partnerService.getPartnerById(id);
    if (!partner || partner.status !== 'active') {
      return res.status(403).json({ error: 'Partner not active' });
    }
    
    // Check tier-based access
    if (type === 'webinar-deck' && partner.tier === 'verified') {
      return res.status(403).json({ 
        error: 'Webinar decks require Advanced tier or higher' 
      });
    }
    
    const assetGenerator = new MarketingAssetGenerator();
    
    switch (type) {
      case 'one-pager':
        const onePager = await assetGenerator.generateOnePager(id, format);
        return res.json(onePager);
        
      case 'webinar-deck':
        const webinarDeck = await assetGenerator.generateWebinarDeck(id, format);
        return res.json(webinarDeck);
        
      case 'badge-package':
        const badgePackage = await assetGenerator.generateBadgePackage(id);
        return res.json(badgePackage);
        
      case 'co-brand-kit':
        const coBrandKit = await assetGenerator.generateCoBrandKit(id);
        return res.json(coBrandKit);
        
      default:
        return res.status(400).json({ error: 'Invalid asset type' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Failed to generate assets' });
  }
});

// POST /api/partners/:id/mdf-requests
partnerRouter.post('/:id/mdf-requests', async (req, res) => {
  try {
    const { id } = req.params;
    const mdfData = req.body;
    
    // Validate authorization and tier
    const partner = await partnerService.getPartnerById(id);
    if (!partner || !['advanced', 'premier'].includes(partner.tier)) {
      return res.status(403).json({ 
        error: 'MDF requests require Advanced tier or higher' 
      });
    }
    
    // Validate MDF request
    const validation = await mdfService.validateRequest(mdfData, partner);
    if (!validation.valid) {
      return res.status(400).json({ 
        error: 'Validation failed', 
        details: validation.errors 
      });
    }
    
    const mdfRequest = await mdfService.createRequest(id, mdfData);
    
    // Trigger approval workflow
    await workflowService.startMDFApproval(mdfRequest);
    
    res.status(201).json(mdfRequest);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create MDF request' });
  }
});
```

## Webhook System

### Webhook Event Processing
```javascript
class WebhookProcessor {
  constructor() {
    this.eventTypes = {
      DEAL_REGISTERED: 'partner.deal_registered',
      ATTRIBUTION_MATCHED: 'partner.attribution_matched',
      COMMISSION_EARNED: 'partner.commission_earned',
      PAYOUT_CREATED: 'partner.payout_created',
      PAYOUT_PROCESSED: 'partner.payout_processed',
      TIER_UPDATED: 'partner.tier_updated',
      CERTIFICATION_EXPIRED: 'partner.certification_expired',
      MDF_REQUESTED: 'partner.mdf_requested',
      MDF_APPROVED: 'partner.mdf_approved'
    };
  }
  
  async processEvent(eventType, data) {
    const event = {
      id: this.generateEventId(),
      type: eventType,
      data,
      timestamp: new Date().toISOString(),
      version: '1.0'
    };
    
    // Store event
    await this.storeEvent(event);
    
    // Get subscribers for this event type
    const subscribers = await this.getEventSubscribers(eventType);
    
    // Send webhook to each subscriber
    const results = await Promise.allSettled(
      subscribers.map(subscriber => this.sendWebhook(subscriber, event))
    );
    
    // Log results
    await this.logWebhookResults(event.id, results);
    
    return event;
  }
  
  async sendWebhook(subscriber, event) {
    const payload = {
      event: event.type,
      data: event.data,
      timestamp: event.timestamp,
      signature: this.generateSignature(event, subscriber.secret)
    };
    
    const response = await fetch(subscriber.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-C2PA-Signature': payload.signature,
        'X-C2PA-Event': event.type,
        'X-C2PA-Delivery': this.generateDeliveryId()
      },
      body: JSON.stringify(payload),
      timeout: 10000
    });
    
    if (!response.ok) {
      throw new Error(`Webhook failed: ${response.status} ${response.statusText}`);
    }
    
    return {
      success: true,
      responseStatus: response.status,
      deliveredAt: new Date()
    };
  }
  
  generateSignature(event, secret) {
    const payload = JSON.stringify(event);
    return crypto
      .createHmac('sha256', secret)
      .update(payload)
      .digest('hex');
  }
}
```

### Webhook Event Examples
```javascript
// Deal Registration Event
const dealRegisteredEvent = {
  type: 'partner.deal_registered',
  data: {
    partnerId: 'partner-uuid',
    dealId: 'deal-uuid',
    companyName: 'Example Corp',
    dealValue: 25000,
    products: ['professional-plan', 'custom-integration'],
    expectedCloseDate: '2024-03-15',
    registeredAt: '2024-01-15T10:30:00Z'
  }
};

// Commission Earned Event
const commissionEarnedEvent = {
  type: 'partner.commission_earned',
  data: {
    partnerId: 'partner-uuid',
    commissionId: 'commission-uuid',
    dealId: 'deal-uuid',
    amount: 7500,
    rate: 0.30,
    tier: 'premier',
    calculatedAt: '2024-01-15T10:30:00Z',
    payoutDate: '2024-02-15T00:00:00Z'
  }
};

// Payout Processed Event
const payoutProcessedEvent = {
  type: 'partner.payout_processed',
  data: {
    partnerId: 'partner-uuid',
    payoutId: 'payout-uuid',
    amount: 12500,
    commissionCount: 5,
    transferredAt: '2024-02-15T14:30:00Z',
    stripeTransferId: 'tr_1234567890',
    status: 'completed'
  }
};
```

## Payout Processing System

### Monthly Payout Engine
```javascript
class PayoutEngine {
  async processMonthlyPayouts(partnerId) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);
    
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    
    // Get eligible commissions
    const commissions = await this.getEligibleCommissions(partnerId, monthStart, monthEnd);
    
    // Calculate total payout
    const totalPayout = commissions.reduce((sum, commission) => sum + commission.netAmount, 0);
    
    // Apply minimum threshold
    if (totalPayout < 100) {
      return { 
        status: 'below_threshold', 
        amount: totalPayout, 
        threshold: 100,
        message: 'Payout below minimum threshold. Amount rolled over to next period.'
      };
    }
    
    // Create payout record
    const payout = {
      id: this.generatePayoutId(),
      partnerId,
      period: { start: monthStart, end: monthEnd },
      grossAmount: commissions.reduce((sum, c) => sum + c.grossAmount, 0),
      netAmount: totalPayout,
      commissionCount: commissions.length,
      status: 'processing',
      createdAt: new Date(),
      scheduledFor: this.calculatePayoutDate()
    };
    
    await this.savePayout(payout);
    
    // Process Stripe transfer
    const transferResult = await this.processStripeTransfer(payout);
    
    if (transferResult.success) {
      payout.status = 'completed';
      payout.transferredAt = transferResult.transferredAt;
      payout.stripeTransferId = transferResult.transferId;
      
      await this.updatePayout(payout);
      await this.triggerPayoutWebhook(payout);
      await this.sendPayoutNotification(partnerId, payout);
    } else {
      payout.status = 'failed';
      payout.error = transferResult.error;
      payout.failedAt = new Date();
      
      await this.updatePayout(payout);
      await this.notifyPayoutFailure(partnerId, payout);
    }
    
    return payout;
  }
  
  async processStripeTransfer(payout) {
    try {
      const partner = await this.getPartner(payout.partnerId);
      
      const transfer = await stripe.transfers.create({
        amount: Math.round(payout.netAmount * 100), // Convert to cents
        currency: 'usd',
        destination: partner.stripeAccountId,
        transfer_group: `payout-${payout.id}`,
        metadata: {
          payoutId: payout.id,
          partnerId: payout.partnerId,
          period: `${payout.period.start.toISOString()}_${payout.period.end.toISOString()}`
        }
      });
      
      return {
        success: true,
        transferId: transfer.id,
        transferredAt: new Date()
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  calculatePayoutDate() {
    // Net-30 payment terms
    const payoutDate = new Date();
    payoutDate.setDate(payoutDate.getDate() + 30);
    return payoutDate;
  }
}
```

## Testing & Deployment

### API Test Suite
```bash
# Run partner API tests
npm run test:partner-api

# Test webhook delivery
npm run test:webhook-delivery

# Test payout processing
npm run test:payout-processing

# Test console UI
npm run test:console-ui
```

### Deployment Configuration
```yaml
# partner-console-deployment.yml
version: '3.8'
services:
  partner-console:
    image: c2concierge/partner-console:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
      - WEBHOOK_SECRET=${WEBHOOK_SECRET}
    ports:
      - "3001:3000"
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
    depends_on:
      - database
      - redis
      
  webhook-processor:
    image: c2concierge/webhook-processor:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - REDIS_URL=${REDIS_URL}
    restart: unless-stopped
    depends_on:
      - database
      - redis
      
  payout-engine:
    image: c2concierge/payout-engine:latest
    environment:
      - NODE_ENV=production
      - DATABASE_URL=${DATABASE_URL}
      - STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}
    restart: unless-stopped
    depends_on:
      - database
```
