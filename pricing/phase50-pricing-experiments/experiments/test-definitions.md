# Test Definitions

**Detailed Specifications for Pricing Experiment Variables**

**Version**: 1.0.0  
**Experiment Start**: November 5, 2025  
**Total Tests**: 4 concurrent experiments  
**Duration**: 4-8 weeks per test

---

## Test 1: Cap Posture Experiment

### Test Configuration

| Variable | Control Group | Test Group |
|----------|---------------|------------|
| Cap Type | Hard caps (service stops) | Soft caps (alerts + overage) |
| Alert Thresholds | None | 80% and 95% email alerts |
| Overage Billing | Not applicable | Standard overage rates |
| Price Points | Identical | Identical |

### Technical Implementation

```javascript
// Control Group - Hard Caps
const hardCapConfig = {
  starter: {
    verifies: { limit: 2000, action: "stop_service", overage: null },
    signs: { limit: 200, action: "stop_service", overage: null }
  },
  growth: {
    verifies: { limit: 15000, action: "stop_service", overage: null },
    signs: { limit: 1000, action: "stop_service", overage: null }
  }
};

// Test Group - Soft Caps
const softCapConfig = {
  starter: {
    verifies: { limit: 2000, action: "alert", overage: 0.04 },
    signs: { limit: 200, action: "alert", overage: 0.15 }
  },
  growth: {
    verifies: { limit: 15000, action: "alert", overage: 0.03 },
    signs: { limit: 1000, action: "alert", overage: 0.12 }
  }
};
```

### Alert Configuration

```json
{
  "alerts": {
    "80_percent": {
      "channels": ["email", "dashboard"],
      "message": "You've used 80% of your monthly quota. Upgrade now to avoid service interruption.",
      "cta": "Upgrade Plan"
    },
    "95_percent": {
      "channels": ["email", "webhook", "in_app_modal"],
      "message": "URGENT: You've used 95% of your monthly quota. Service will continue with overage charges.",
      "cta": "View Overage Costs"
    }
  }
}
```

### Success Metrics

| Metric | Control Target | Test Target | Success Condition |
|--------|----------------|-------------|-------------------|
| NDR | 105% | ≥110% | +5 percentage points |
| Overage Complaints | 2.5/100 | ≤1.5/100 | -40% reduction |
| Gross Margin | 70% | ≥68% | No more than 2% decline |
| Customer Satisfaction | 8.0/10 | ≥8.2/10 | +0.2 improvement |

### Hypothesis

**Primary**: Soft caps with proactive alerts will increase customer comfort with predictable billing, leading to higher expansion revenue (NDR) while maintaining acceptable margins.

**Secondary**: Clear communication at 80%/95% thresholds will reduce billing complaints by giving customers control over their spending.

---

## Test 2: Verify Bundle Size Experiment

### Test Configuration

| Variable | Control Group | Test Group |
|----------|---------------|------------|
| Starter Verify Limit | 2,000/month | 5,000/month |
| Price | $199/month | $199/month (identical) |
| All Other Features | Identical | Identical |
| Overage Rate | $0.04/verify | $0.04/verify (identical) |

### Technical Implementation

```javascript
// Control Group Configuration
const controlStarter = {
  plan: "starter",
  price: 19900, // $199 in cents
  usage: {
    verifies: { included: 2000, overage_rate: 4 }, // $0.04
    signs: { included: 200, overage_rate: 15 }    // $0.15
  }
};

// Test Group Configuration  
const testStarter = {
  plan: "starter",
  price: 19900, // $199 in cents
  usage: {
    verifies: { included: 5000, overage_rate: 4 }, // $0.04
    signs: { included: 200, overage_rate: 15 }    // $0.15
  }
};
```

### Customer Journey Impact

| Stage | Control Experience | Test Experience |
|-------|-------------------|-----------------|
| Trial | Limited to 500 verifies | Full 5,000 verify experience |
| Value Realization | Hits cap quickly, may upgrade | Experiences full product value |
| Conversion Decision | Based on limited experience | Based on comprehensive experience |
| Long-term Usage | More likely to upgrade | Higher satisfaction with base plan |

### Success Metrics

| Metric | Control Target | Test Target | Success Condition |
|--------|----------------|-------------|-------------------|
| Trial→Paid Conversion | 25% | ≥27% | +8% relative improvement |
| 90-Day Retention | 80% | ≥84% | +5 percentage points |
| Time to First Value | 7 days | ≤5 days | -30% reduction |
| Upgrade Rate | 15% | ≤12% | Acceptable if retention improves |
| Gross Margin | 71.5% | ≥68% | No more than 3.5% decline |

### Hypothesis

**Primary**: Customers who experience the full product capabilities during trial (5,000 verifies vs 2,000) will perceive more value and convert at higher rates.

**Secondary**: Early value realization will improve long-term retention as customers integrate the product more deeply into their workflows.

---

## Test 3: Overage Curve Experiment

### Test Configuration

| Variable | Control Group | Test Group |
|----------|---------------|------------|
| Overage Structure | Flat rate | Tiered volume discount |
| 0-25,000 verifies | $0.03/verify | $0.03/verify |
| 25,001+ verifies | $0.03/verify | $0.025/verify |
| Sign Overage | $0.12/sign | $0.12/sign (unchanged) |

### Technical Implementation

```javascript
// Control Group - Flat Overage
const flatOverage = {
  verifies: {
    tiers: [
      { min: 0, max: Infinity, rate: 3.0 } // $0.03 flat
    ]
  },
  signs: {
    tiers: [
      { min: 0, max: Infinity, rate: 12.0 } // $0.12 flat
    ]
  }
};

// Test Group - Tiered Overage
const tieredOverage = {
  verifies: {
    tiers: [
      { min: 0, max: 25000, rate: 3.0 },    // $0.03 up to 25k
      { min: 25001, max: Infinity, rate: 2.5 } // $0.025 above 25k
    ]
  },
  signs: {
    tiers: [
      { min: 0, max: Infinity, rate: 12.0 } // $0.12 unchanged
    ]
  }
};
```

### Pricing Examples

| Monthly Usage | Control Cost | Test Cost | Savings |
|---------------|--------------|-----------|---------|
| 20,000 verifies | $600 | $600 | $0 |
| 30,000 verifies | $900 | $775 | $125 |
| 50,000 verifies | $1,500 | $1,125 | $375 |
| 100,000 verifies | $3,000 | $2,125 | $875 |

### Success Metrics

| Metric | Control Target | Test Target | Success Condition |
|--------|----------------|-------------|-------------------|
| Gross Margin | 70% | ≥73% | +3 percentage points |
| Overage Revenue/Customer | $45/month | ≥$52/month | +15% increase |
| High-Volume Retention | 85% | ≥88% | +3 percentage points |
| Complaint Rate | 2.0/100 | ≤2.5/100 | No significant increase |
| Expansion Revenue | $100/month | ≥$115/month | +15% increase |

### Hypothesis

**Primary**: Tiered overage pricing will encourage higher usage among growth customers while improving overall margin through volume-based efficiency.

**Secondary**: Volume discounts will reduce price sensitivity for high-usage customers, leading to better retention and expansion.

---

## Test 4: Annual Discount Experiment

### Test Configuration

| Variable | Control Group | Test Group |
|----------|---------------|------------|
| Annual Discount | -15% | -20% |
| Satisfaction Guarantee | None | 30-day money-back guarantee |
| Monthly Price | Identical | Identical |
| Plan Features | Identical | Identical |

### Technical Implementation

```javascript
// Control Group Pricing
const controlAnnual = {
  starter: { monthly: 199, annual: 2029, discount: 0.15 },
  growth: { monthly: 699, annual: 6711, discount: 0.15 },
  scale: { monthly: 2000, annual: 20400, discount: 0.15 }
};

// Test Group Pricing
const testAnnual = {
  starter: { monthly: 199, annual: 1910, discount: 0.20, guarantee: 30 },
  growth: { monthly: 699, annual: 6711, discount: 0.20, guarantee: 30 },
  scale: { monthly: 2000, annual: 19200, discount: 0.20, guarantee: 30 }
};
```

### Satisfaction Guarantee Terms

```json
{
  "satisfaction_guarantee": {
    "duration_days": 30,
    "coverage": "Full refund of annual prepayment",
    "conditions": [
      "Customer must request refund within 30 days of annual purchase",
      "Refund prorated for any usage beyond monthly equivalent",
      "Support tickets reviewed for legitimate service issues"
    ],
    "process": "Email support@credlink.com with refund request"
  }
}
```

### Success Metrics

| Metric | Control Target | Test Target | Success Condition |
|--------|----------------|-------------|-------------------|
| Annual Conversion Rate | 19% | ≥21% | +12% relative improvement |
| 90-Day Churn | 5% | ≤4% | -20% reduction |
| Cash Flow (Annual Prepay) | $50,000/month | ≥$55,000/month | +10% improvement |
| Refund Rate | N/A | ≤3% | Acceptable loss rate |
| Customer Satisfaction | 8.0/10 | ≥8.3/10 | +0.3 improvement |

### Hypothesis

**Primary**: Increased annual discount (-20% vs -15%) will accelerate purchase decisions for customers committed to long-term usage.

**Secondary**: 30-day satisfaction guarantee will reduce purchase friction while maintaining acceptable refund rates through strong product-market fit.

---

## Experiment Execution Matrix

### Timeline Overview

```
Week 0: Technical setup and pre-registration complete
Week 1: Launch Test 2 (Bundle) and Test 4 (Annual)
Week 3: Launch Test 1 (Caps) and Test 3 (Overage)  
Week 5: Test 2 completes, begin analysis
Week 7: Tests 1 and 3 complete, begin analysis
Week 9: Test 4 completes, begin analysis
Week 10: All analyses complete, prepare recommendations
Week 11: Pricing committee decisions
Week 12-13: Implementation of winning variants
```

### Resource Allocation

| Resource | Test 1 | Test 2 | Test 3 | Test 4 |
|----------|--------|--------|--------|--------|
| Engineering | 40 hrs | 20 hrs | 30 hrs | 25 hrs |
| Data Science | 20 hrs | 15 hrs | 20 hrs | 15 hrs |
| Support | 10 hrs | 5 hrs | 10 hrs | 15 hrs |
| Finance | 10 hrs | 5 hrs | 15 hrs | 20 hrs |

### Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Technical Implementation Issues | Medium | High | Extensive testing, rollback plan |
| Customer Confusion | Low | Medium | Clear communication, support training |
| Margin Erosion | Medium | High | Real-time monitoring, stop criteria |
| Statistical Power Issues | Low | Medium | Sample size validation, duration fixed |

---

## Data Collection Plan

### Required Events

```javascript
// Billing Events
billing_events = [
  'plan_purchase',
  'annual_upgrade', 
  'overage_charged',
  'refund_processed'
];

// Usage Events
usage_events = [
  'verify_operation',
  'sign_operation',
  'cap_reached',
  'alert_triggered'
];

// Behavioral Events
behavioral_events = [
  'trial_started',
  'trial_converted',
  'plan_upgraded',
  'plan_downgraded',
  'customer_canceled'
];
```

### Integration Points

- **Stripe**: Webhook events for all billing activity
- **Amplitude**: Funnel and cohort tracking
- **Zendesk**: Support ticket categorization
- **Data Warehouse**: COGS and margin calculations
- **Custom Dashboard**: Real-time experiment monitoring

---

*Last Updated: November 5, 2025*  
**Technical Review**: Required before implementation  
**Finance Sign-off**: Required for all pricing changes  
**Support Training**: Required before customer launch
