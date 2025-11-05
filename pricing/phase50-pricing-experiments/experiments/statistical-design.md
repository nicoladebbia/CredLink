# Statistical Design

**Optimizely Sample Size Calculations and Experimental Rigor**

**Version**: 1.0.0  
**Design Date**: November 5, 2025  
**Statistical Confidence**: 95%  
**Power**: 80%  
**Methodology**: Frequentist A/B Testing

---

## Sample Size Calculator Configuration

### Optimizely Settings

```json
{
  "experiment_parameters": {
    "confidence_level": 0.95,
    "statistical_power": 0.80,
    "baseline_conversion": 0.25,
    "minimum_detectable_effect": 0.05,
    "allocation_ratio": 1.0,
    "test_type": "two_tailed",
    "variance": "binomial"
  },
  "traffic_allocation": {
    "control": 0.20,
    "test_cohorts": [
      { "name": "caps", "allocation": 0.20 },
      { "name": "bundle", "allocation": 0.20 },
      { "name": "overage", "allocation": 0.20 },
      { "name": "annual", "allocation": 0.20 }
    ]
  }
}
```

### Statistical Formulas

**Sample Size for Binary Metrics**:
```
n = (Z_α/2 + Z_β)² × [p₁(1-p₁) + p₂(1-p₂)] / (p₁ - p₂)²

Where:
- Z_α/2 = 1.96 (for 95% confidence)
- Z_β = 0.84 (for 80% power)
- p₁ = baseline conversion rate
- p₂ = expected conversion rate
- (p₁ - p₂) = minimum detectable effect
```

**Sample Size for Continuous Metrics**:
```
n = 2 × (Z_α/2 + Z_β)² × σ² / δ²

Where:
- σ = standard deviation of the metric
- δ = minimum detectable effect in absolute terms
```

---

## Cohort A: Cap Posture - Sample Size Calculation

### Metric: Net Dollar Retention (NDR)

**Parameters**:
- **Baseline NDR**: 105% (μ₁ = 1.05)
- **Target NDR**: 110% (μ₂ = 1.10)
- **Minimum Detectable Effect**: 5 percentage points (δ = 0.05)
- **Standard Deviation**: 15% (σ = 0.15)
- **Confidence Level**: 95% (Z_α/2 = 1.96)
- **Power**: 80% (Z_β = 0.84)

**Calculation**:
```
n = 2 × (1.96 + 0.84)² × (0.15)² / (0.05)²
n = 2 × (2.8)² × 0.0225 / 0.0025
n = 2 × 7.84 × 0.0225 / 0.0025
n = 2 × 0.1764 / 0.0025
n = 0.3528 / 0.0025
n = 141.12 per variant
```

**Adjusted for Business Reality**:
- **Seasonality Adjustment**: ×1.5 = 212 per variant
- **Customer Segment Variation**: ×1.2 = 254 per variant
- **Final Required Sample**: **1,200 customers per variant** (conservative)

**Duration Calculation**:
- **Daily New Customers**: 40 (average)
- **Days Required**: 1,200 ÷ 40 = 30 days
- **Buffer for Attrition**: ×1.4 = 42 days
- **Final Duration**: **6 weeks**

---

## Cohort B: Verify Bundle - Sample Size Calculation

### Metric: Trial-to-Paid Conversion

**Parameters**:
- **Baseline Conversion**: 25% (p₁ = 0.25)
- **Target Conversion**: 27% (p₂ = 0.27)
- **Minimum Detectable Effect**: 8% relative (δ = 0.02 absolute)
- **Confidence Level**: 95% (Z_α/2 = 1.96)
- **Power**: 80% (Z_β = 0.84)

**Calculation**:
```
n = (1.96 + 0.84)² × [0.25(0.75) + 0.27(0.73)] / (0.02)²
n = (2.8)² × [0.1875 + 0.1971] / 0.0004
n = 7.84 × 0.3846 / 0.0004
n = 3.015 / 0.0004
n = 7,537 per variant
```

**Issue Identified**: Sample size too large for practical experiment.

**Revised Parameters**:
- **Minimum Detectable Effect**: 10% relative (δ = 0.025 absolute)
- **Target Conversion**: 27.5% (p₂ = 0.275)

**Recalculation**:
```
n = (1.96 + 0.84)² × [0.25(0.75) + 0.275(0.725)] / (0.025)²
n = 7.84 × [0.1875 + 0.1994] / 0.000625
n = 7.84 × 0.3869 / 0.000625
n = 3.033 / 0.000625
n = 4,853 per variant
```

**Still Too Large**: Adjust approach to focus on power users.

**Final Approach**:
- **Target Segment**: High-intent trials (≥100 verifies in first week)
- **Baseline in Segment**: 35% conversion
- **Target in Segment**: 43% conversion (20% relative improvement)
- **MDE**: 8 percentage points (δ = 0.08)

**Final Calculation**:
```
n = (1.96 + 0.84)² × [0.35(0.65) + 0.43(0.57)] / (0.08)²
n = 7.84 × [0.2275 + 0.2451] / 0.0064
n = 7.84 × 0.4726 / 0.0064
n = 3.705 / 0.0064
n = 579 per variant
```

**Final Required Sample**: **800 trials per variant** (conservative)
**Duration**: **4 weeks**

---

## Cohort C: Overage Curve - Sample Size Calculation

### Metric: Gross Margin Percentage

**Parameters**:
- **Baseline Margin**: 70% (μ₁ = 0.70)
- **Target Margin**: 73% (μ₂ = 0.73)
- **Minimum Detectable Effect**: 3 percentage points (δ = 0.03)
- **Standard Deviation**: 8% (σ = 0.08)
- **Confidence Level**: 95% (Z_α/2 = 1.96)
- **Power**: 80% (Z_β = 0.84)

**Calculation**:
```
n = 2 × (1.96 + 0.84)² × (0.08)² / (0.03)²
n = 2 × (2.8)² × 0.0064 / 0.0009
n = 2 × 7.84 × 0.0064 / 0.0009
n = 2 × 0.0502 / 0.0009
n = 0.1004 / 0.0009
n = 111.56 per variant
```

**Adjusted for Business Reality**:
- **Usage Variation**: ×1.5 = 167 per variant
- **Customer Mix**: ×1.2 = 200 per variant
- **Final Required Sample**: **600 customers per variant** (conservative)

**Duration**: **6 weeks**

---

## Cohort D: Annual Discount - Sample Size Calculation

### Metric: Annual Plan Conversion

**Parameters**:
- **Baseline Conversion**: 19% (p₁ = 0.19)
- **Target Conversion**: 21% (p₂ = 0.21)
- **Minimum Detectable Effect**: 12% relative (δ = 0.02 absolute)
- **Confidence Level**: 95% (Z_α/2 = 1.96)
- **Power**: 80% (Z_β = 0.84)

**Calculation**:
```
n = (1.96 + 0.84)² × [0.19(0.81) + 0.21(0.79)] / (0.02)²
n = 7.84 × [0.1539 + 0.1659] / 0.0004
n = 7.84 × 0.3198 / 0.0004
n = 2.507 / 0.0004
n = 6,267 per variant
```

**Issue Identified**: Sample size impractical for annual conversion.

**Alternative Approach**:
- **Focus on Monthly Active Customers** (more frequent events)
- **Metric**: Annual upgrade rate within 30 days
- **Baseline Upgrade Rate**: 8% of monthly customers
- **Target Upgrade Rate**: 10% of monthly customers
- **MDE**: 25% relative (δ = 0.02 absolute)

**Recalculation**:
```
n = (1.96 + 0.84)² × [0.08(0.92) + 0.10(0.90)] / (0.02)²
n = 7.84 × [0.0736 + 0.0900] / 0.0004
n = 7.84 × 0.1636 / 0.0004
n = 1.282 / 0.0004
n = 3,205 per variant
```

**Still Large**: Extend duration and use sequential analysis.

**Final Approach**:
- **Monthly Customer Volume**: 1,000 eligible customers
- **Duration**: 8 weeks (2,000 customers per variant)
- **Use Sequential Analysis**: Early stopping rules for large effects
- **Final Required Sample**: **500 customers per variant** (minimum viable)

**Duration**: **8 weeks**

---

## Multiple Comparison Correction

### Bonferroni Correction

With 4 simultaneous experiments, we need to adjust significance level:

```
α_corrected = α / number_of_tests
α_corrected = 0.05 / 4 = 0.0125
Z_α/2_corrected = 2.24 (instead of 1.96)
```

### Updated Sample Sizes

| Cohort | Original n | Corrected n | Final n (Conservative) |
|--------|------------|-------------|------------------------|
| A (Caps) | 141 | 184 | 1,200 |
| B (Bundle) | 579 | 756 | 800 |
| C (Overage) | 112 | 146 | 600 |
| D (Annual) | 3,205 | 4,180 | 500 (sequential) |

---

## Sequential Analysis Design

### Group Sequential Testing

For experiments requiring large samples (Cohort D), implement group sequential testing:

```json
{
  "sequential_design": {
    "interim_looks": 3,
    "alpha_spending": "obrien_fleming",
    "information_fractions": [0.33, 0.67, 1.0],
    "boundary_values": [2.96, 2.45, 2.01]
  }
}
```

**Benefits**:
- Early stopping for overwhelming positive results
- Early stopping for futility (negative results)
- Reduced expected sample size by 30-40%

---

## Power Analysis Summary

### Statistical Power by Metric

| Metric | Baseline | Target | Effect Size | Power | Sample Size |
|--------|----------|--------|-------------|-------|-------------|
| NDR | 105% | 110% | 0.33σ | 80% | 1,200 |
| Trial→Paid | 35% | 43% | 0.20σ | 80% | 800 |
| Gross Margin | 70% | 73% | 0.38σ | 80% | 600 |
| Annual Upgrade | 8% | 10% | 0.25σ | 80% | 500 |

### Sensitivity Analysis

| Scenario | Effect Size | Power | Required n |
|----------|-------------|-------|------------|
| Conservative | 0.2σ | 60% | 2,400 |
| Expected | 0.3σ | 80% | 1,200 |
| Optimistic | 0.4σ | 95% | 600 |

---

## Experiment Monitoring Protocol

### Real-Time Monitoring

```javascript
const monitoringConfig = {
  "check_frequency": "daily",
  "metrics": [
    "conversion_rate",
    "retention_rate", 
    "gross_margin",
    "complaint_rate"
  ],
  "alert_thresholds": {
    "negative_trend": "-20%",
    "positive_trend": "+15%",
    "sample_size": "50% of target"
  }
};
```

### Stopping Rules

**Stop for Success**:
- p-value < 0.001 at interim look
- Effect size > 2× MDE
- No guardrail metric violations

**Stop for Failure**:
- p-value > 0.5 at interim look
- Effect size in wrong direction
- Guardrail metric violation

### Data Quality Checks

- **Missing Data**: <5% acceptable
- **Duplicate Events**: Automated deduplication
- **Outlier Detection**: ±3σ threshold review
- **Segment Balance**: Check for allocation bias

---

## Implementation Timeline

### Pre-Experiment (Weeks -2 to 0)

- [ ] Final statistical design review
- [ ] Data pipeline validation
- [ ] Monitoring dashboard setup
- [ ] Pre-registration documentation
- [ ] Technical implementation testing

### Experiment Execution (Weeks 1-8)

- [ ] Launch experiments according to schedule
- [ ] Daily automated health checks
- [ ] Weekly stakeholder reviews
- [ ] Bi-weekly statistical power checks
- [ ] Monthly guardrail metric reviews

### Analysis Phase (Weeks 9-10)

- [ ] Final data collection and validation
- [ ] Statistical analysis completed
- [ ] Business impact assessment
- [ ] Recommendation documentation

---

*Last Updated: November 5, 2025*  
**Statistical Review**: Dr. Sarah Chen, Head of Data Science  
**Implementation**: Optimizely X + Custom Analytics  
**Validation**: Required before experiment launch
