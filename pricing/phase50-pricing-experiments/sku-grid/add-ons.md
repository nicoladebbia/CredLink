# Add-On Products - Unit Economics

**Retro-Sign Pack and Analytics-Only Viewer**

**Version**: 1.0.0  
**Effective Date**: November 5, 2025  
**Target Margin**: ≥70% gross margin

---

## Retro-Sign Pack

### Product Definition
**Purpose**: One-time bulk signing of existing content libraries for customers who need to backfile historical content with C2PA manifests.

**Target Customers**: 
- Publishers with large content archives
- E-commerce platforms with product catalogs
- Media companies with video/photo libraries

### Pricing Structure

| Tier | Asset Volume | One-Time Fee | Unit Price | TSA Passthrough | Total Customer Cost |
|------|--------------|--------------|------------|-----------------|-------------------|
| Bronze | 10,000 assets | $2,500 | $0.25 | $500 | $3,000 |
| Silver | 50,000 assets | $10,000 | $0.20 | $2,500 | $12,500 |
| Gold | 250,000 assets | $40,000 | $0.16 | $12,500 | $52,500 |

### Cost Breakdown (Per Asset)

| Cost Component | Bronze | Silver | Gold |
|----------------|--------|--------|------|
| Compute (signing) | $0.08 | $0.07 | $0.06 |
| Storage (24 months) | $0.04 | $0.04 | $0.04 |
| TSA (timestamping) | $0.05 | $0.04 | $0.05 |
| Support & QA | $0.03 | $0.02 | $0.01 |
| **Total COGS** | **$0.20** | **$0.17** | **$0.16** |
| **Gross Margin** | **20%** | **15%** | **0%** |
| **Margin with TSA** | **0%** | **-5%** | **-20%** |

**Issue Identified**: Current pricing doesn't meet ≥70% margin target after TSA costs.

### Revised Pricing (70% Margin Target)

| Tier | Asset Volume | One-Time Fee | Unit Price | TSA Passthrough | Total Customer Cost | Gross Margin |
|------|--------------|--------------|------------|-----------------|-------------------|--------------|
| Bronze | 10,000 assets | $8,333 | $0.83 | $500 | $8,833 | 70% |
| Silver | 50,000 assets | $28,333 | $0.57 | $2,500 | $30,833 | 70% |
| Gold | 250,000 assets | $116,667 | $0.47 | $12,500 | $129,167 | 70% |

### Billing Implementation

```json
{
  "retro_sign_pack": {
    "bronze": {
      "price": 833300,
      "currency": "usd",
      "product_id": "prod_retro_bronze",
      "meter": "retro_assets_bronze",
      "max_assets": 10000
    },
    "silver": {
      "price": 2833330,
      "currency": "usd", 
      "product_id": "prod_retro_silver",
      "meter": "retro_assets_silver",
      "max_assets": 50000
    },
    "gold": {
      "price": 11666670,
      "currency": "usd",
      "product_id": "prod_retro_gold", 
      "meter": "retro_assets_gold",
      "max_assets": 250000
    }
  }
}
```

### Success Metrics
- **Attach Rate**: ≥15% of new customers
- **Conversion Time**: ≤30 days from purchase to completion
- **Quality Score**: ≤2% rework rate
- **Customer Satisfaction**: ≥4.5/5 rating

---

## Analytics-Only Viewer

### Product Definition
**Purpose**: Entry-level analytics for publishers who want to monitor C2PA adoption but aren't ready to implement full signing pipeline.

**Target Customers**:
- Digital publishers monitoring industry trends
- Brands researching C2PA implementation
- Agencies evaluating C2PA for clients

### Pricing Structure

| Component | Monthly Price | Annual Price | Annual Discount |
|-----------|---------------|--------------|-----------------|
| Base Subscription | $99/month | $1,069/year | -10% |

### Features Included

| Feature | Description | Value |
|---------|-------------|-------|
| Dashboard Access | Real-time analytics interface | Core value |
| Survival Leaderboard | Industry benchmarking | Competitive insight |
| Compliance Reports | Monthly regulatory summaries | Compliance value |
| Read-Only API | Data export capabilities | Integration value |
| Email Support | Standard support (24h response) | Basic service |

### Cost Breakdown (Monthly)

| Cost Component | Monthly Cost | Annual Cost |
|----------------|--------------|-------------|
| Dashboard Hosting | $15 | $180 |
| Data Processing | $8 | $96 |
| API Infrastructure | $5 | $60 |
| Support Staff | $12 | $144 |
| **Total COGS** | **$40** | **$480** |
| **Gross Margin** | **59.6%** | **55.1%** |

**Issue Identified**: Current pricing doesn't meet ≥70% margin target.

### Revised Pricing (70% Margin Target)

| Component | Monthly Price | Annual Price | Annual Discount |
|-----------|---------------|--------------|-----------------|
| Base Subscription | $133/month | $1,437/year | -10% |

### Updated Cost Structure

| Metric | Monthly | Annual |
|--------|---------|--------|
| Revenue | $133 | $1,437 |
| COGS | $40 | $480 |
| Gross Margin | $93 | $957 |
| Margin % | **69.9%** | **66.6%** |

**Adjustment Needed**: Monthly price at $134 to achieve exactly 70% margin.

### Final Pricing (70% Margin)

| Component | Monthly Price | Annual Price | Annual Discount |
|-----------|---------------|--------------|-----------------|
| Base Subscription | $134/month | $1,447/year | -10% |

### Upsell Funnel Metrics

| Metric | Target | Measurement |
|--------|--------|-------------|
| Viewer → Growth Conversion | ≥25% within 60 days | Track upgrade events |
| Lead Quality Score | ≥8/10 | Customer qualification |
| Sales Cycle Reduction | ≤30 days | Time to upgrade |
| Deal Size Influence | +20% ARR | Impact on enterprise deals |

---

## Unit Economics Summary

### Gross Margin by Product

| Product | Revenue | COGS | Gross Margin | Margin % |
|---------|---------|------|--------------|----------|
| Retro Bronze | $8,333 | $2,500 | $5,833 | 70.0% |
| Retro Silver | $28,333 | $8,500 | $19,833 | 70.0% |
| Retro Gold | $116,667 | $35,000 | $81,667 | 70.0% |
| Analytics Viewer | $134 | $40 | $94 | 70.1% |

### Strategic Impact

**Retro-Sign Pack**:
- High-margin one-time revenue
- Accelerates customer onboarding
- Creates sticky evidence storage relationships

**Analytics-Only Viewer**:
- Low-friction entry point
- Generates qualified leads
- Builds brand awareness and trust

### Cross-Sell Opportunities

| Path | Conversion Target | Time Frame |
|------|-------------------|------------|
| Analytics → Growth | 25% | 60 days |
| Retro → Scale | 40% | 90 days |
| Retro + Analytics → Enterprise | 15% | 120 days |

---

*Last Updated: November 5, 2025*  
*Finance Review: Required*  
*Implementation: Stripe Billing*
