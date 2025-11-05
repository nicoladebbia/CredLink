# Experiment Framework

**Pre-Registered Pricing Experiments - One Variable Per Cohort**

**Version**: 1.0.0  
**Framework Start**: November 5, 2025  
**Total Duration**: 60 days  
**Statistical Confidence**: 95%  
**Power**: 80%

---

## Experimental Design Principles

### Core Requirements

1. **Pre-Registration**: All hypotheses must be documented before experiment start
2. **One Variable Per Cohort**: Isolate single pricing variables for clean attribution
3. **Statistical Rigor**: Proper sample size calculation and no peeking
4. **Margin Protection**: Stop any arm that drives gross margin <65%
5. **Customer Experience**: Monitor complaint rates and satisfaction

### Experiment Structure

```
Control Group (20%)
├── Current pricing v1.0
└── Standard caps and overage

Test Cohorts (80% total)
├── Cohort A: Cap Posture (20%)
├── Cohort B: Verify Bundle (20%)
├── Cohort C: Overage Curve (20%)
└── Cohort D: Annual Discount (20%)
```

---

## Pre-Registration Template

### Hypothesis Format

```
Hypothesis: [Variable change] will [impact] [metric] by [magnitude] because [reasoning]

Variables:
- Independent: [Single pricing variable being tested]
- Dependent: [Primary success metric]
- Control Variables: [All other factors held constant]

Success Criteria:
- Primary: [Metric threshold for success]
- Secondary: [Additional metrics to monitor]
- Guardrails: [Metrics that must NOT degrade]

Sample Size: [Calculated based on MDE and baseline]
Duration: [Fixed period with no early stopping]
Statistical Power: [80% standard]
Significance Level: [5% standard]
```

---

## Test Cohorts Definition

### Cohort A: Cap Posture Experiment

**Hypothesis**: Soft caps with alerts will improve NDR by 5% while maintaining gross margin ≥70% compared to hard caps, because customers feel more comfortable with predictable overage costs.

**Variables**:
- **Independent**: Cap type (Hard vs Soft with 80/95% alerts)
- **Dependent**: Net Dollar Retention (NDR)
- **Control**: All pricing, overage rates, and features identical

**Success Criteria**:
- **Primary**: NDR ≥110% (vs 105% control)
- **Secondary**: Overage complaints ≤1.5/100 customers
- **Guardrails**: Gross margin ≥68%

**Sample Size Calculation**:
- Baseline NDR: 105%
- Minimum Detectable Effect (MDE): 5%
- Standard Deviation: 15%
- **Required Sample**: 1,200 customers per variant
- **Duration**: 6 weeks

---

### Cohort B: Verify Bundle Size Experiment

**Hypothesis**: Increasing Starter plan verify bundle from 2k to 5k (same price) will improve trial-to-paid conversion by 8% and 90-day retention by 5% because customers experience full product value sooner.

**Variables**:
- **Independent**: Verify bundle size (2k vs 5k)
- **Dependent**: Trial-to-paid conversion rate
- **Control**: Price at $199, all other features identical

**Success Criteria**:
- **Primary**: Trial→Paid ≥27% (vs 25% control)
- **Secondary**: 90-day retention ≥85% (vs 80% control)
- **Guardrails**: Gross margin ≥65%

**Sample Size Calculation**:
- Baseline Conversion: 25%
- Minimum Detectable Effect (MDE): 8%
- Standard Deviation: 12%
- **Required Sample**: 800 trials per variant
- **Duration**: 4 weeks

---

### Cohort C: Overage Curve Experiment

**Hypothesis**: Tiered overage pricing (≥25k verifies at $0.025) will improve gross margin by 3% while maintaining complaint rates ≤2/100 customers because high-volume customers receive volume discounts.

**Variables**:
- **Independent**: Overage pricing structure (Flat $0.03 vs Tiered)
- **Dependent**: Gross margin percentage
- **Control**: All base pricing and caps identical

**Success Criteria**:
- **Primary**: Gross margin ≥73% (vs 70% control)
- **Secondary**: Overage revenue per customer +15%
- **Guardrails**: Complaint rate ≤2.5/100 customers

**Sample Size Calculation**:
- Baseline Margin: 70%
- Minimum Detectable Effect (MDE): 3%
- Standard Deviation: 8%
- **Required Sample**: 600 customers per variant
- **Duration**: 6 weeks

---

### Cohort D: Annual Discount Experiment

**Hypothesis**: Increasing annual discount from -15% to -20% with 30-day satisfaction guarantee will improve annual conversion by 12% and reduce churn by 8% because lower upfront cost accelerates decision making.

**Variables**:
- **Independent**: Annual discount rate (-15% vs -20%)
- **Dependent**: Annual plan conversion rate
- **Control**: Monthly pricing identical, guarantee only for -20% group

**Success Criteria**:
- **Primary**: Annual conversion ≥22% (vs 19% control)
- **Secondary**: 90-day churn ≤3% (vs 5% control)
- **Guardrails**: Cash flow neutral or positive

**Sample Size Calculation**:
- Baseline Annual Conversion: 19%
- Minimum Detectable Effect (MDE): 12%
- Standard Deviation: 10%
- **Required Sample**: 500 customers per variant
- **Duration**: 8 weeks

---

## Statistical Design Specifications

### Optimizely Configuration

```json
{
  "experiment_settings": {
    "confidence_level": 95,
    "statistical_power": 80,
    "allocation_mode": "traffic_split",
    "traffic_allocation": {
      "control": 0.20,
      "cohort_a": 0.20,
      "cohort_b": 0.20,
      "cohort_c": 0.20,
      "cohort_d": 0.20
    }
  },
  "sample_size_calculator": {
    "baseline_conversion": 0.25,
    "minimum_detectable_effect": 0.05,
    "standard_deviation": 0.12,
    "alpha": 0.05,
    "power": 0.80
  }
}
```

### Sample Size Validation

| Cohort | Baseline | MDE | Required N | Duration | Status |
|--------|----------|-----|------------|----------|--------|
| A (Caps) | 105% NDR | 5% | 1,200 | 6 weeks | ✅ Validated |
| B (Bundle) | 25% Conv | 8% | 800 | 4 weeks | ✅ Validated |
| C (Overage) | 70% Margin | 3% | 600 | 6 weeks | ✅ Validated |
| D (Annual) | 19% Conv | 12% | 500 | 8 weeks | ✅ Validated |

---

## Pre-Registration Documentation

### Experiment Registry

All experiments must be registered in the internal experiment registry with:

1. **Hypothesis Statement**: Clear, testable prediction
2. **Variable Isolation**: Single independent variable identified
3. **Success Metrics**: Primary and secondary KPIs defined
4. **Sample Size**: Statistical calculation documented
5. **Duration**: Fixed period with no peeking
6. **Stop Criteria**: Clear conditions for early termination
7. **Risk Assessment**: Potential negative impacts identified

### Approval Process

```
1. Draft Hypothesis (Product Team)
2. Statistical Review (Data Science Team)
3. Financial Impact Review (Finance Team)
4. Customer Experience Review (Support Team)
5. Technical Implementation Review (Engineering Team)
6. Final Approval (Pricing Committee)
```

---

## Measurement Framework

### Primary Metrics

| Metric | Definition | Measurement Method | Target |
|--------|------------|-------------------|--------|
| Gross Margin | (Revenue - COGS) / Revenue | Stripe + COGS tracking | ≥70% |
| Trial→Paid | Trials converting to paid within 14 days | Amplitude funnel tracking | ≥25% |
| 90-Day Retention | Customers active after 90 days | Amplitude cohort analysis | ≥85% |
| NDR | Net Dollar Retention including expansion | Revenue tracking | ≥110% |

### Secondary Metrics

| Metric | Definition | Alert Threshold |
|--------|------------|-----------------|
| Overage Complaints | Support tickets about billing | ≤2/100 customers |
| Customer Satisfaction | NPS or CSAT score | ≥8.0/10 |
| Upgrade Rate | Customers moving to higher tiers | ≥15% quarterly |
| Churn Rate | Customer cancellation rate | ≤5% monthly |

### Guardrail Metrics

| Metric | Stop Condition | Action |
|--------|----------------|--------|
| Gross Margin | <65% for any cohort | Immediate stop |
| Complaint Rate | >2× control | Pause and review |
| Conversion Rate | <80% of control | Investigate and fix |
| Support Load | >150% of control | Add resources or stop |

---

## Experiment Execution Protocol

### Launch Sequence

```
Week 0: Finalize pre-registration and technical setup
Week 1: Launch Cohort B (Bundle) - 4 week duration
Week 1: Launch Cohort D (Annual) - 8 week duration  
Week 3: Launch Cohort A (Caps) - 6 week duration
Week 3: Launch Cohort C (Overage) - 6 week duration
Week 8: All experiments complete, begin analysis
```

### Monitoring Schedule

| Frequency | Activity | Owner |
|-----------|----------|-------|
| Daily | Automated health checks | Data Science |
| Weekly | KPI review and guardrail check | Product Team |
| Bi-weekly | Financial impact assessment | Finance Team |
| Monthly | Customer satisfaction survey | Support Team |

### Data Collection Requirements

- **Revenue Data**: Stripe webhook events to data warehouse
- **Usage Data**: API metering events to analytics platform
- **Behavior Data**: Amplitude events for funnel analysis
- **Support Data**: Zendesk tickets for complaint tracking
- **Financial Data**: COGS calculations for margin analysis

---

## Analysis and Decision Framework

### Statistical Analysis Plan

1. **Primary Analysis**: Two-tailed t-tests for continuous metrics
2. **Secondary Analysis**: Chi-square tests for conversion metrics
3. **Segment Analysis**: Cohort performance by customer segment
4. **Time Series**: Trend analysis for retention and churn
5. **Financial Impact**: ROI calculation for pricing changes

### Decision Criteria

| Outcome | Action |
|---------|--------|
| Statistically significant + positive impact | Implement for all customers |
| Statistically significant + negative impact | Revert to control |
| No statistical significance | Extend test or maintain status quo |
| Mixed results (positive primary, negative secondary) | Optimize and retest |

### Implementation Timeline

- **Week 9**: Analysis complete and recommendations ready
- **Week 10**: Pricing committee decision on winners
- **Week 11-12**: Technical implementation of winning changes
- **Week 13**: Full rollout and communication to customers

---

*Last Updated: November 5, 2025*  
**Statistical Review**: Required before launch  
**Finance Approval**: Required for all pricing changes  
**Customer Experience**: Monitored throughout experiment period
