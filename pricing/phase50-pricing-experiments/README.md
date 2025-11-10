# Phase 50: Pricing Experiments & SKUs

**⚠️ STATUS: PLANNED - NOT AVAILABLE YET**

**Current Reality:** No customers, no product to price. This is Phase 50 planning.

**Timeline:** Available in Phase 5 (6-8 months minimum) after:
1. ✅ Phase 3: Backend implementation (4-8 weeks)
2. ✅ Phase 4: Infrastructure deployment (4-8 weeks)
3. ✅ Phase 5: Customer validation (12-16 weeks)

**What this directory contains:** Future pricing experiments and SKU planning for when we have actual customers and measured costs.

---

**Margin-First Playbook - 90-Day Test Window**

**Purpose**: Converge on >70% gross margin and low churn using controlled, pre-registered pricing experiments: caps, verify allotments, overage math, annual discounts; plus two add-ons: Retro-Sign Pack (stepwise volume) and Analytics-Only Viewer for pipelines that can't change yet.

**Planned Execution Date**: After Phase 5 completion
**Test Window**: 90 days  
**Target Gross Margin**: ≥70%  
**Key Metrics**: Trial→Paid, 90-day retention, NDR, overage complaints per 100 customers

---

## Directory Structure

### `/sku-grid/`
- **v1.0-pricing-grid.md** - Complete SKU grid with plans, caps, overage rates
- **add-ons.md** - Retro-Sign Pack and Analytics-Only Viewer pricing
- **margin-analysis.md** - Gross margin calculations by SKU

### `/experiments/`
- **experiment-framework.md** - Pre-registration and cohort design
- **test-definitions.md** - One-variable-per-cohort test specifications
- **statistical-design.md** - Optimizely sizing, MDE, duration calculations

### `/billing-config/`
- **stripe-pricing.json** - Production Stripe configuration
- **usage-meters.md** - Verify and sign meter implementations
- **overage-handling.md** - Alerts, proration, downgrade policies

### `/calculators/`
- **pricing-calculator.md** - Public calculator implementation
- **cost-estimator.md** - Customer-facing cost estimation
- **roi-calculator.md** - ROI and value proposition calculator

### `/measurement/`
- **metrics-framework.md** - Gross margin, retention, NDR tracking
- **cohort-analysis.md** - 30/60/90-day cohort retention patterns
- **experiment-analytics.md** - Statistical analysis of pricing experiments

### `/alerts-policy/`
- **bill-shock-prevention.md** - 80/95% alerts and throttling
- **spend-ceilings.md** - Auto-degrade and cap policies
- **customer-notifications.md** - Email and webhook alert templates

### `/experiment-calendar/`
- **60-day-roadmap.md** - Weekly milestones and gates
- **test-schedule.md** - Detailed experiment timing
- **gate-criteria.md** - Stop/go decision points

### `/acceptance-tests/`
- **exit-criteria.md** - Phase 50 completion requirements
- **test-procedures.md** - Binary pass/fail validation
- **success-metrics.md** - Quantitative success thresholds

### `/risks-mitigations/`
- **risk-register.md** - Identified risks and mitigation strategies
- **contingency-plans.md** - Backup plans for critical risks
- **monitoring-dashboard.md** - Real-time risk monitoring

---

## Quick Start

1. **Review SKU Grid**: Start with `/sku-grid/v1.0-pricing-grid.md`
2. **Configure Stripe**: Implement `/billing-config/stripe-pricing.json`
3. **Deploy Calculators**: Make `/calculators/` publicly accessible
4. **Set Up Measurement**: Install `/measurement/` tracking framework
5. **Begin Experiments**: Follow `/experiment-calendar/60-day-roadmap.md`

---

## Stakeholder References

- **SaaS CFO**: Margin analysis and unit economics
- **Stripe**: Billing configuration and usage meters
- **Optimizely**: Statistical experiment design
- **Sawtooth Software**: Van Westendorp (PSM) and conjoint analysis
- **Amplitude**: Cohort analysis and retention tracking

---

*Last Updated: November 5, 2025*  
*Phase Lead: Pricing Operations Team*  
*Review Date: February 5, 2026*
