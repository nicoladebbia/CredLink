# Beta Metrics Dashboard Guide

Complete guide for tracking and analyzing beta program metrics.

---

## Table of Contents

1. [Overview](#overview)
2. [Key Metrics](#key-metrics)
3. [Usage Metrics](#usage-metrics)
4. [Quality Metrics](#quality-metrics)
5. [Customer Health](#customer-health)
6. [Growth Metrics](#growth-metrics)
7. [Financial Indicators](#financial-indicators)
8. [Reporting](#reporting)

---

## Overview

### Purpose
Track beta program health and identify areas for improvement.

### Update Frequency
- **Daily:** Usage metrics, error rates
- **Weekly:** Customer health, growth metrics
- **Bi-weekly:** NPS, feedback analysis
- **Monthly:** Comprehensive review

### Success Targets
- **10-20 customers** by Week 14
- **2x week-over-week** API call growth
- **NPS > 30**
- **60%+ would pay**
- **Error rate < 0.5%**

---

## Key Metrics

### North Star Metric
**Weekly Active Customers** - Customers who made at least 1 API call in the last 7 days

**Why:** Best indicator of product value and engagement

**Target:** 80% of total customers

---

### Supporting Metrics

1. **API Call Volume** - Total API calls per week
2. **Customer Retention** - % of customers active week-over-week
3. **NPS Score** - Net Promoter Score
4. **Willingness to Pay** - % who would pay for product
5. **Error Rate** - % of API calls that fail

---

## Usage Metrics

### Total API Calls

**Definition:** Total number of API requests (sign + verify)

**Formula:**
```
Total API Calls = Sign Requests + Verify Requests
```

**Tracking:**
- Daily count
- Weekly total
- Week-over-week growth %

**Targets:**
- Week 12: 500+ calls
- Week 13: 1,000+ calls (2x growth)
- Week 14: 2,000+ calls (2x growth)

**Red Flags:**
- 🚩 Negative growth
- 🚩 Flat growth for 2 weeks
- 🚩 Single customer > 80% of volume

---

### Sign vs Verify Ratio

**Definition:** Ratio of sign requests to verify requests

**Formula:**
```
Ratio = Verify Requests / Sign Requests
```

**Expected:** 1:1 to 3:1 (more verifications than signs)

**Why:** Indicates real-world usage patterns

**Red Flags:**
- 🚩 Ratio < 0.5 (not verifying enough)
- 🚩 Ratio > 10 (only verifying, not signing)

---

### API Calls Per Customer

**Definition:** Average API calls per customer per week

**Formula:**
```
Avg = Total API Calls / Active Customers
```

**Tracking:**
- Per customer
- Cohort average
- Power user threshold (>100 calls/week)

**Targets:**
- Average: 50+ calls/week
- Power users: 3+ customers

**Segmentation:**
- Power users: >100 calls/week
- Regular users: 10-100 calls/week
- Light users: 1-10 calls/week
- Inactive: 0 calls/week

---

### Proofs Stored

**Definition:** Total number of signed images with proofs

**Tracking:**
- Cumulative total
- Weekly additions
- Per customer

**Targets:**
- Week 12: 200+ proofs
- Week 13: 500+ proofs
- Week 14: 1,000+ proofs

---

## Quality Metrics

### Error Rate

**Definition:** Percentage of API calls that return errors

**Formula:**
```
Error Rate = (Failed Calls / Total Calls) × 100
```

**Tracking:**
- Overall rate
- Per endpoint (sign vs verify)
- Per customer
- By error type

**Targets:**
- Overall: < 0.5%
- Per customer: < 1%

**Red Flags:**
- 🚩 Error rate > 1%
- 🚩 Increasing trend
- 🚩 Customer-specific spike

**Common Errors:**
- 400: Invalid request (client error)
- 401: Invalid API key
- 413: Image too large
- 500: Server error
- 503: Service unavailable

---

### Response Time

**Definition:** Time from request to response

**Metrics:**
- P50 (median)
- P95 (95th percentile)
- P99 (99th percentile)
- Max

**Targets:**
- P50: < 500ms
- P95: < 2s
- P99: < 5s

**Tracking:**
- Per endpoint
- By image size
- Time of day patterns

**Red Flags:**
- 🚩 P95 > 3s
- 🚩 Increasing trend
- 🚩 High variance

---

### Availability

**Definition:** Percentage of time API is available

**Formula:**
```
Availability = (Uptime / Total Time) × 100
```

**Target:** > 99% (< 7 hours downtime/month)

**Tracking:**
- Daily uptime
- Incident count
- Mean time to recovery (MTTR)

---

## Customer Health

### Active Customers

**Definition:** Customers who made at least 1 API call in last 7 days

**Formula:**
```
Active % = (Active Customers / Total Customers) × 100
```

**Target:** > 80%

**Tracking:**
- Daily active users (DAU)
- Weekly active users (WAU)
- Monthly active users (MAU)

**Cohort Analysis:**
- Week 1 retention
- Week 2 retention
- Week 3 retention
- Week 4 retention

---

### Customer Lifecycle

**Stages:**

1. **Onboarded** - Signed up, received API key
2. **Activated** - Made first successful API call
3. **Engaged** - Using regularly (3+ calls/week)
4. **Power User** - High usage (>100 calls/week)
5. **At Risk** - No activity in 7 days
6. **Churned** - No activity in 14 days

**Conversion Rates:**
- Onboarded → Activated: > 90%
- Activated → Engaged: > 70%
- Engaged → Power User: > 20%

---

### Time to Value

**Metrics:**

1. **Time to First Call**
   - Target: < 24 hours
   - Measure: Hours from signup to first API call

2. **Time to First Success**
   - Target: < 48 hours
   - Measure: Hours from signup to first successful sign

3. **Time to Integration**
   - Target: < 1 week
   - Measure: Days from signup to production usage

**Red Flags:**
- 🚩 Time to first call > 48 hours
- 🚩 Time to first success > 72 hours
- 🚩 Time to integration > 2 weeks

---

### Support Metrics

**Metrics:**

1. **Tickets Per Customer**
   - Target: < 2 per customer
   - Measure: Total tickets / Total customers

2. **Response Time**
   - Target: < 4 hours
   - Measure: Time from ticket to first response

3. **Resolution Time**
   - Target: < 24 hours
   - Measure: Time from ticket to resolution

4. **Ticket Categories**
   - Bug reports
   - Feature requests
   - Integration help
   - Account issues

---

## Growth Metrics

### Customer Acquisition

**Metrics:**

1. **New Customers Per Week**
   - Target: 3-5 per week
   - Measure: Signups per week

2. **Conversion Rate**
   - Target: 5-10%
   - Formula: (Signups / Outreach Emails) × 100

3. **Time to Onboard**
   - Target: < 48 hours
   - Measure: Hours from application to first call

**Funnel:**
```
Outreach Email (100)
  ↓ 5-10% response rate
Application (5-10)
  ↓ 80% approval rate
Signup (4-8)
  ↓ 90% activation rate
Active Customer (3-7)
```

---

### Week-Over-Week Growth

**Formula:**
```
Growth % = ((This Week - Last Week) / Last Week) × 100
```

**Targets:**
- API calls: 2x growth (100%)
- Active customers: 20% growth
- Proofs stored: 2x growth

**Tracking:**
- API call volume
- Active customers
- New customers
- Proofs stored

**Red Flags:**
- 🚩 Negative growth
- 🚩 Flat growth for 2 weeks
- 🚩 Declining active customers

---

### Retention

**Cohort Retention:**

| Cohort | Week 1 | Week 2 | Week 3 | Week 4 |
|--------|--------|--------|--------|--------|
| Week 12 | 100% | 85% | 75% | 70% |
| Week 13 | 100% | 85% | 75% | - |
| Week 14 | 100% | 85% | - | - |

**Targets:**
- Week 1: 100% (all customers try it)
- Week 2: > 85%
- Week 3: > 75%
- Week 4: > 70%

**Red Flags:**
- 🚩 Week 2 retention < 80%
- 🚩 Week 3 retention < 70%
- 🚩 Declining retention trend

---

## Financial Indicators

### Willingness to Pay

**Definition:** % of customers who would pay for product

**Measurement:**
- Survey question: "Would you pay for this?"
- Responses: Definitely / Probably / Maybe / Probably not / Definitely not

**Scoring:**
- Definitely: 100%
- Probably: 75%
- Maybe: 50%
- Probably not: 25%
- Definitely not: 0%

**Target:** > 60% (Definitely + Probably)

---

### Pricing Expectations

**Buckets:**
- < $50/month
- $50-$100/month
- $100-$250/month
- $250-$500/month
- $500-$1,000/month
- > $1,000/month

**Analysis:**
- Median expectation
- By customer segment
- By usage level
- By use case

---

### Potential MRR

**Formula:**
```
Potential MRR = Σ (Customer Count × Expected Price)
```

**Example:**
```
5 customers × $100 = $500
3 customers × $250 = $750
2 customers × $500 = $1,000
Total Potential MRR = $2,250
```

**Target:** $1,000-$5,000 potential MRR by Week 14

---

## Reporting

### Daily Dashboard

**Metrics:**
- Total API calls (today)
- Active customers (today)
- Error rate (today)
- New signups (today)
- Support tickets (open)

**Format:** Slack notification or email

---

### Weekly Report

**Sections:**

1. **Summary**
   - Key metrics snapshot
   - Week-over-week changes
   - Highlights and lowlights

2. **Usage**
   - Total API calls
   - Active customers
   - Growth rate
   - Top customers

3. **Quality**
   - Error rate
   - Response time
   - Availability
   - Incidents

4. **Feedback**
   - NPS score
   - Feature requests
   - Bug reports
   - Customer quotes

5. **Action Items**
   - What to fix
   - What to build
   - Who to follow up with

**Distribution:** Team email, Monday morning

---

### Monthly Review

**Sections:**

1. **Program Health**
   - Customer count
   - Retention rate
   - NPS score
   - Willingness to pay

2. **Product Performance**
   - API reliability
   - Response times
   - Error patterns
   - Usage patterns

3. **Customer Insights**
   - Use case analysis
   - Feature requests
   - Pricing feedback
   - Success stories

4. **Roadmap**
   - Features shipped
   - Features planned
   - Timeline
   - Priorities

**Distribution:** All stakeholders, first Monday of month

---

## Metric Definitions

### Formulas

**NPS:**
```
NPS = % Promoters (9-10) - % Detractors (0-6)
```

**Churn Rate:**
```
Churn = (Customers Lost / Total Customers) × 100
```

**Retention Rate:**
```
Retention = (Active Customers / Total Customers) × 100
```

**Growth Rate:**
```
Growth = ((New Value - Old Value) / Old Value) × 100
```

**Error Rate:**
```
Error Rate = (Failed Calls / Total Calls) × 100
```

---

## Tools & Setup

### Data Sources
- API logs (CloudWatch)
- Customer database (beta-customers.json)
- Feedback spreadsheet
- Support tickets
- Survey responses

### Dashboards
- Grafana (real-time metrics)
- Google Sheets (customer tracking)
- Airtable (feedback management)
- Slack (daily updates)

### Automation
- Daily metrics → Slack
- Weekly report → Email
- Alerts → PagerDuty
- Surveys → Typeform

---

## Alert Thresholds

### Critical Alerts

🚨 **Error rate > 5%**
- Action: Investigate immediately
- Notify: Engineering team

🚨 **API down > 5 minutes**
- Action: Emergency response
- Notify: All hands

🚨 **Customer churned**
- Action: Exit interview
- Notify: Product team

---

### Warning Alerts

⚠️ **Error rate > 1%**
- Action: Monitor closely
- Notify: On-call engineer

⚠️ **Response time > 3s (P95)**
- Action: Performance review
- Notify: Engineering team

⚠️ **No new signups in 3 days**
- Action: Review outreach
- Notify: Growth team

⚠️ **Customer inactive 7 days**
- Action: Check-in email
- Notify: Customer success

---

## Success Criteria

### By End of Week 14

**Customers:**
- ✅ 10-20 customers
- ✅ 80%+ active weekly
- ✅ 70%+ retention (Week 3)

**Usage:**
- ✅ 2,000+ API calls/week
- ✅ 2x week-over-week growth
- ✅ 50+ calls per customer

**Quality:**
- ✅ Error rate < 0.5%
- ✅ P95 response time < 2s
- ✅ 99%+ availability

**Feedback:**
- ✅ NPS > 30
- ✅ 60%+ would pay
- ✅ < 2 tickets per customer

**Financial:**
- ✅ $1,000-$5,000 potential MRR
- ✅ Clear pricing model
- ✅ 3+ paying customers identified

---

## Next Steps

After Week 14:
1. Analyze all metrics
2. Identify patterns
3. Validate product-market fit
4. Plan pricing launch
5. Prepare for scale

---

**Goal:** Data-driven decisions for beta program

**Measure:** All key metrics tracked and analyzed

**Optimize:** Based on metric trends and customer feedback
