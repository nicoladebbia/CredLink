# Gross Margin Analysis

**Phase 50 SKU Economics - Target ≥70% Gross Margin**

**Version**: 1.0.0  
**Analysis Date**: November 5, 2025  
**Currency**: USD

---

## COGS Components Breakdown

### Compute Costs (per operation)

| Service | Verify Cost | Sign Cost | Storage Cost | Unit |
|---------|-------------|-----------|--------------|------|
| AWS Lambda | $0.008 | $0.025 | N/A | per 1,000 operations |
| AWS S3 | $0.002 | $0.010 | $0.15 | per GB/month |
| AWS KMS | $0.001 | $0.005 | N/A | per 1,000 operations |
| CloudFront | $0.001 | $0.003 | $0.05 | per GB transferred |
| **Subtotal** | **$0.012** | **$0.043** | **$0.20** | **per unit** |

### TSA (Timestamp Authority) Costs

| Provider | Cost per Timestamp | Monthly Volume Tiers |
|----------|-------------------|---------------------|
| DigiCert | $0.001 | ≤10,000: $0.001 |
| Sectigo | $0.0008 | 10,001-50,000: $0.0008 |
| GlobalSign | $0.0006 | >50,000: $0.0006 |

### Support & Operations

| Plan Type | Monthly Support Cost | Cost per Customer |
|-----------|---------------------|-------------------|
| Starter | $15 | $15 |
| Growth | $45 | $45 |
| Scale | $150 | $150 |

### Infrastructure Overhead

| Component | Monthly Cost | Allocation Method |
|-----------|--------------|-------------------|
| Monitoring | $2,000 | Per customer |
| Compliance | $3,000 | Per customer |
| Development | $10,000 | Amortized per customer |

---

## Plan-Level Margin Analysis

### Starter Plan - $199/month

| Revenue Component | Amount | % of Total |
|-------------------|--------|------------|
| Base Subscription | $199 | 100.0% |
| **Total Revenue** | **$199** | **100.0%** |

| Cost Component | Amount | % of Revenue |
|----------------|--------|--------------|
| Compute (2k verifies @ $0.012) | $24 | 12.1% |
| Compute (200 signs @ $0.043) | $8.60 | 4.3% |
| Storage (10 GB @ $0.20) | $2 | 1.0% |
| TSA (2.2k operations) | $2.20 | 1.1% |
| Support | $15 | 7.5% |
| Infrastructure Overhead | $5 | 2.5% |
| **Total COGS** | **$56.80** | **28.5%** |
| **Gross Margin** | **$142.20** | **71.5%** |

**Margin Status**: ✅ **Above 70% target**

---

### Growth Plan - $699/month

| Revenue Component | Amount | % of Total |
|-------------------|--------|------------|
| Base Subscription | $699 | 100.0% |
| **Total Revenue** | **$699** | **100.0%** |

| Cost Component | Amount | % of Revenue |
|----------------|--------|--------------|
| Compute (15k verifies @ $0.012) | $180 | 25.8% |
| Compute (1k signs @ $0.043) | $43 | 6.2% |
| Storage (50 GB @ $0.20) | $10 | 1.4% |
| TSA (16k operations) | $12.80 | 1.8% |
| Support | $45 | 6.4% |
| Infrastructure Overhead | $15 | 2.1% |
| **Total COGS** | **$305.80** | **43.8%** |
| **Gross Margin** | **$393.20** | **56.2%** |

**Issue Identified**: Growth plan below 70% margin target.

**Required Price for 70% Margin**: $1,019/month (46% increase)

**Option**: Reduce included usage or increase overage rates.

---

### Scale Plan - $2,000+/month

| Revenue Component | Amount | % of Total |
|-------------------|--------|------------|
| Base Subscription | $2,000 | 100.0% |
| **Total Revenue** | **$2,000** | **100.0%** |

| Cost Component | Amount | % of Revenue |
|----------------|--------|--------------|
| Compute (60k verifies @ $0.012) | $720 | 36.0% |
| Compute (5k signs @ $0.043) | $215 | 10.8% |
| Storage (200 GB @ $0.20) | $40 | 2.0% |
| TSA (65k operations) | $39 | 2.0% |
| Support | $150 | 7.5% |
| Infrastructure Overhead | $50 | 2.5% |
| **Total COGS** | **$1,214** | **60.7%** |
| **Gross Margin** | **$786** | **39.3%** |

**Critical Issue**: Scale plan significantly below 70% margin target.

**Required Price for 70% Margin**: $4,047/month (102% increase)

---

## Revised Pricing for 70% Margin Targets

### Option A: Price Adjustments

| Plan | Current Price | Target Price | % Increase |
|------|---------------|--------------|------------|
| Starter | $199 | $199 | 0% |
| Growth | $699 | $1,019 | 46% |
| Scale | $2,000 | $4,047 | 102% |

### Option B: Usage Adjustments (Keep Prices)

| Plan | Current Usage | Target Usage | Reduction |
|------|---------------|--------------|-----------|
| Starter | 2k verifies, 200 signs | No change | 0% |
| Growth | 15k verifies, 1k signs | 8k verifies, 500 signs | 47% |
| Scale | 60k verifies, 5k signs | 25k verifies, 2k signs | 58% |

### Option C: Hybrid Approach (Recommended)

| Plan | New Price | New Usage | Margin |
|------|-----------|-----------|--------|
| Starter | $199 | 2k verifies, 200 signs | 71.5% |
| Growth | $899 | 12k verifies, 800 signs | 70.2% |
| Scale | $2,999 | 40k verifies, 3k signs | 70.1% |

---

## Overage Economics

### Tiered Overage Pricing

| Usage Tier | Verify Rate | Sign Rate | Margin Impact |
|------------|-------------|-----------|---------------|
| Base | As included | As included | Base margin |
| Overage Level 1 | $0.03/verify | $0.12/sign | 60% margin |
| Overage Level 2 | $0.025/verify | $0.10/sign | 52% margin |
| Enterprise | Custom | Custom | 45% margin |

### Overage Contribution Analysis

Assuming 20% overage on average:
- **Starter**: +$40/month revenue, +$16 margin (40% contribution)
- **Growth**: +$180/month revenue, +$72 margin (40% contribution)
- **Scale**: +$600/month revenue, +$240 margin (40% contribution)

---

## Add-On Margin Analysis

### Retro-Sign Pack (Revised Pricing)

| Tier | Revenue | COGS | Gross Margin | Margin % |
|------|---------|------|--------------|----------|
| Bronze (10k) | $8,333 | $2,500 | $5,833 | 70.0% |
| Silver (50k) | $28,333 | $8,500 | $19,833 | 70.0% |
| Gold (250k) | $116,667 | $35,000 | $81,667 | 70.0% |

### Analytics-Only Viewer (Revised Pricing)

| Metric | Monthly | Annual |
|--------|---------|--------|
| Revenue | $134 | $1,447 |
| COGS | $40 | $480 |
| Gross Margin | $94 | $967 |
| Margin % | **70.1%** | **66.8%** |

---

## Volume Economics

### Economies of Scale Effects

| Customer Volume | Unit Cost Reduction | Margin Improvement |
|-----------------|---------------------|-------------------|
| 1-100 customers | Base | Base margin |
| 101-500 customers | -5% | +2% margin |
| 501-1,000 customers | -8% | +4% margin |
| 1,000+ customers | -12% | +7% margin |

### Break-Even Analysis

| Plan | Monthly Customers | Break-Even Revenue |
|------|-------------------|-------------------|
| Starter | 50 customers | $9,950 |
| Growth | 25 customers | $17,475 |
| Scale | 10 customers | $20,000 |

---

## Margin Optimization Strategies

### Cost Reduction Initiatives

1. **TSA Optimization**: Multi-provider strategy to reduce timestamp costs by 30%
2. **Compute Efficiency**: Lambda optimization to reduce compute costs by 15%
3. **Storage Tiering**: S3 Intelligent-Tiering to reduce storage costs by 20%

### Revenue Enhancement

1. **Usage-Based Pricing**: Align pricing with actual value delivered
2. **Premium Features**: High-margin add-ons for enterprise customers
3. **Annual Prepayment**: Cash flow optimization with 2% additional margin

### Target Margin Trajectory

| Quarter | Target Margin | Key Initiatives |
|---------|---------------|-----------------|
| Q1 2026 | 70% | Base pricing optimization |
| Q2 2026 | 72% | Cost reduction programs |
| Q3 2026 | 75% | Enterprise premium features |
| Q4 2026 | 78% | Full economies of scale |

---

## Financial Risk Assessment

### Margin Sensitivity Analysis

| Risk Factor | Impact | Probability | Mitigation |
|-------------|--------|-------------|------------|
| Compute Cost Increase | -5% margin | Medium | Multi-cloud strategy |
| TSA Price Increase | -3% margin | High | Long-term contracts |
| Support Cost Overrun | -2% margin | Low | Automated support |

### Scenario Planning

| Scenario | Gross Margin | Action Required |
|----------|--------------|-----------------|
| Base Case | 70% | Proceed as planned |
| Downside | 65% | Implement cost reductions |
| Upside | 75% | Accelerate growth investments |

---

*Last Updated: November 5, 2025*  
*Finance Team Review: Required*  
*Board Approval: Required for pricing changes*
