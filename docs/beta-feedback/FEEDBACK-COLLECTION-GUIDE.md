# Beta Feedback Collection Guide

Complete guide for collecting, analyzing, and acting on beta customer feedback.

---

## Table of Contents

1. [Overview](#overview)
2. [Feedback Collection Methods](#feedback-collection-methods)
3. [Weekly Pulse Checks](#weekly-pulse-checks)
4. [Feedback Call Templates](#feedback-call-templates)
5. [Survey Templates](#survey-templates)
6. [Metrics to Track](#metrics-to-track)
7. [Analysis Framework](#analysis-framework)
8. [Action Planning](#action-planning)

---

## Overview

### Goals
- Understand customer use cases
- Identify pain points and blockers
- Discover feature requests
- Validate product-market fit
- Determine pricing willingness

### Success Metrics
- **NPS > 30** (good for beta)
- **60%+ would pay** for the product
- **80%+ successful** first API call
- **< 2 support tickets** per customer
- **2x growth** in API calls per week

---

## Feedback Collection Methods

### 1. Onboarding Calls (Week 1)

**Timing:** Within 48 hours of signup

**Duration:** 30 minutes

**Goals:**
- Understand use case
- Guide first API call
- Build relationship
- Set expectations

**Template:** See [Onboarding Call Template](#onboarding-call-template)

---

### 2. Weekly Pulse Checks (Weeks 1-3)

**Timing:** Every Monday

**Duration:** 5-10 minutes (email or quick call)

**Goals:**
- Check if they're using it
- Identify blockers
- Collect quick feedback
- Show you care

**Template:** See [Weekly Pulse Check Template](#weekly-pulse-check-template)

---

### 3. Deep Dive Calls (Week 2-3)

**Timing:** After 1-2 weeks of usage

**Duration:** 45 minutes

**Goals:**
- Deep dive into use case
- Understand integration
- Discuss pricing
- Collect feature requests

**Template:** See [Deep Dive Call Template](#deep-dive-call-template)

---

### 4. Surveys (Ongoing)

**Timing:** After key milestones

**Duration:** 2-3 minutes

**Goals:**
- Quantitative feedback
- NPS measurement
- Feature prioritization
- Pricing validation

**Template:** See [Survey Templates](#survey-templates)

---

### 5. Async Feedback (Ongoing)

**Methods:**
- Slack channel
- Email
- In-app feedback
- Support tickets

**Response time:** < 4 hours

---

## Weekly Pulse Checks

### Week 1 Pulse Check

**Email Template:**

```
Subject: How's your first week with CredLink?

Hi [Name],

Quick check-in on your first week with CredLink!

3 quick questions:
1. Have you made your first API call? (Yes/No)
2. Any blockers or issues? (If yes, let's fix them)
3. What's your first impression? (1-2 sentences)

Reply with answers or book a quick call: [Calendly]

Thanks!
[Your name]
```

**What to track:**
- First API call completed?
- Any blockers?
- Initial sentiment

---

### Week 2 Pulse Check

**Email Template:**

```
Subject: CredLink Week 2 check-in

Hi [Name],

How's week 2 going with CredLink?

Quick questions:
1. How many images have you signed so far?
2. Is the API working as expected?
3. What's the #1 thing we should improve?

5-minute call? [Calendly]

Best,
[Your name]
```

**What to track:**
- Usage volume
- API reliability
- Top improvement request

---

### Week 3 Pulse Check

**Email Template:**

```
Subject: CredLink feedback + pricing discussion

Hi [Name],

You've been using CredLink for 3 weeks now!

Let's chat about:
1. Your experience so far
2. Integration into your workflow
3. Pricing expectations

30-minute call? [Calendly]

Looking forward to it!
[Your name]
```

**What to track:**
- Integration status
- Pricing willingness
- Long-term fit

---

## Feedback Call Templates

### Onboarding Call Template

**Duration:** 30 minutes

**Agenda:**

**1. Introduction (5 min)**
```
- Thank them for joining beta
- Confirm their use case
- Set expectations for call
```

**2. Use Case Deep Dive (10 min)**
```
Questions:
- What problem are you trying to solve?
- How are you solving it today?
- Why is image authenticity important to you?
- What volume of images do you handle?
- Who are your end users?
```

**3. First API Call (10 min)**
```
- Share screen
- Walk through integration guide
- Make first /sign request together
- Make first /verify request
- Celebrate success!
```

**4. Next Steps (5 min)**
```
- Share resources (docs, examples)
- Set up Slack channel
- Schedule Week 2 check-in
- Answer questions
```

**Post-Call:**
- Send summary email
- Add to feedback spreadsheet
- Set reminder for Week 2 check-in

---

### Deep Dive Call Template

**Duration:** 45 minutes

**Agenda:**

**1. Usage Review (10 min)**
```
Questions:
- How many images have you signed?
- How's the integration going?
- Any issues or bugs?
- What's working well?
```

**2. Feature Discussion (15 min)**
```
Questions:
- What features are you missing?
- What would make this 10x better?
- What would you use more if we had X?
- Any deal-breakers?
```

**3. Pricing Discussion (10 min)**
```
Questions:
- Would you pay for this?
- What's a fair price?
- How much value does this provide?
- What's your budget for this type of tool?
```

**4. Roadmap Preview (5 min)**
```
- Share upcoming features
- Get feedback on priorities
- Discuss timeline
```

**5. Wrap Up (5 min)**
```
- Summarize feedback
- Confirm action items
- Schedule next check-in
```

**Post-Call:**
- Send detailed summary
- Update feedback spreadsheet
- Add feature requests to roadmap
- Follow up on action items

---

## Survey Templates

### NPS Survey

**Timing:** After 2 weeks of usage

**Questions:**

1. **On a scale of 0-10, how likely are you to recommend CredLink to a colleague?**
   - 0-6: Detractor
   - 7-8: Passive
   - 9-10: Promoter

2. **What's the primary reason for your score?**
   - Open text

3. **What could we do to improve your score?**
   - Open text

**Calculate NPS:**
```
NPS = % Promoters - % Detractors
```

**Targets:**
- NPS > 30: Good for beta
- NPS > 50: Excellent
- NPS < 0: Red flag

---

### Feature Prioritization Survey

**Timing:** After 3 weeks

**Questions:**

1. **Which features would be most valuable to you?**
   - [ ] Batch signing API
   - [ ] Webhook notifications
   - [ ] Custom metadata fields
   - [ ] Video support
   - [ ] Advanced analytics
   - [ ] White-label solution
   - Other: ___________

2. **Rank your top 3 features:**
   - 1st: ___________
   - 2nd: ___________
   - 3rd: ___________

3. **What feature would make you use CredLink 10x more?**
   - Open text

---

### Pricing Survey

**Timing:** After 3-4 weeks

**Questions:**

1. **Would you pay for CredLink after the beta?**
   - Yes, definitely
   - Yes, probably
   - Maybe
   - Probably not
   - Definitely not

2. **What's a fair monthly price for your usage level?**
   - < $50
   - $50-$100
   - $100-$250
   - $250-$500
   - $500-$1000
   - > $1000

3. **What would justify the price for you?**
   - Open text

4. **What's your budget for this type of tool?**
   - Open text

---

## Metrics to Track

### Usage Metrics

**Per Customer:**
- Total API calls
- Sign requests
- Verify requests
- Proofs stored
- Last activity date
- Days active
- Average calls per day

**Aggregate:**
- Total customers
- Active customers (used in last 7 days)
- Total API calls
- Week-over-week growth
- Retention rate

---

### Quality Metrics

**Per Customer:**
- Error rate
- Average response time
- Support tickets opened
- Time to first success
- Success rate

**Aggregate:**
- Overall error rate
- P95 response time
- Support ticket volume
- Average resolution time

---

### Feedback Metrics

**Per Customer:**
- NPS score
- Would pay? (Yes/No)
- Pricing expectation
- Feature requests
- Bug reports

**Aggregate:**
- Average NPS
- % would pay
- Average pricing expectation
- Top feature requests
- Top bugs

---

## Analysis Framework

### Weekly Analysis

**Every Monday, analyze:**

1. **Usage Trends**
   - Are customers using it more?
   - Who's most active?
   - Who's churned?

2. **Feedback Themes**
   - Common feature requests
   - Common pain points
   - Common praise

3. **Health Metrics**
   - NPS trend
   - Error rate trend
   - Support ticket trend

4. **Action Items**
   - What to fix this week
   - What to build next
   - Who to follow up with

---

### Customer Segmentation

**Segment by:**

1. **Usage Level**
   - Power users (>100 calls/week)
   - Regular users (10-100 calls/week)
   - Light users (<10 calls/week)
   - Inactive (0 calls last week)

2. **Use Case**
   - Newsrooms
   - E-commerce
   - Real estate
   - NFT/Crypto
   - Stock photos
   - Academic

3. **Satisfaction**
   - Promoters (NPS 9-10)
   - Passives (NPS 7-8)
   - Detractors (NPS 0-6)

4. **Willingness to Pay**
   - Definitely would pay
   - Probably would pay
   - Maybe
   - Probably not
   - Definitely not

---

### Red Flags

🚩 **Customer hasn't made first API call after 3 days**
- Action: Personal outreach, offer setup call

🚩 **Customer hasn't used API in 7 days**
- Action: Check-in email, ask if blocked

🚩 **Error rate > 5% for a customer**
- Action: Debug immediately, offer support

🚩 **NPS < 5**
- Action: Deep dive call, understand issues

🚩 **"Would not pay" response**
- Action: Understand why, validate pricing

---

## Action Planning

### Feature Prioritization

**Framework:**

1. **Impact** (How many customers want it?)
   - High: >50% of customers
   - Medium: 20-50% of customers
   - Low: <20% of customers

2. **Effort** (How hard to build?)
   - Low: <1 day
   - Medium: 1-3 days
   - High: >3 days

3. **Priority Matrix:**
   - High Impact + Low Effort = Do now
   - High Impact + High Effort = Plan for later
   - Low Impact + Low Effort = Nice to have
   - Low Impact + High Effort = Don't do

---

### Bug Prioritization

**Severity:**

1. **Critical** (Blocking usage)
   - Fix immediately
   - Notify affected customers

2. **High** (Major pain point)
   - Fix within 24 hours
   - Update customers

3. **Medium** (Annoying but workable)
   - Fix within 1 week
   - Add to changelog

4. **Low** (Minor issue)
   - Fix when convenient
   - Document workaround

---

### Feedback Response Templates

**Feature Request:**
```
Hi [Name],

Thanks for the feedback! We've added "[Feature]" to our roadmap.

We're prioritizing based on customer demand. If others request 
this too, we'll move it up.

I'll keep you posted on progress.

Best,
[Your name]
```

**Bug Report:**
```
Hi [Name],

Thanks for reporting this! We've identified the issue and are 
working on a fix.

Expected resolution: [Timeframe]

I'll update you as soon as it's fixed.

Best,
[Your name]
```

**Pricing Feedback:**
```
Hi [Name],

Thanks for the pricing feedback! We're still finalizing our 
pricing model based on beta feedback.

Your input is super valuable. We'll make sure early adopters 
get special pricing.

More details coming soon.

Best,
[Your name]
```

---

## Feedback Collection Checklist

### Per Customer

**Week 1:**
- [ ] Onboarding call completed
- [ ] First API call successful
- [ ] Week 1 pulse check sent
- [ ] Initial feedback recorded

**Week 2:**
- [ ] Week 2 pulse check sent
- [ ] Usage metrics reviewed
- [ ] Issues addressed
- [ ] Feedback recorded

**Week 3:**
- [ ] Week 3 pulse check sent
- [ ] Deep dive call scheduled
- [ ] NPS survey sent
- [ ] Pricing discussion completed

**Week 4:**
- [ ] Feature survey sent
- [ ] Feedback analyzed
- [ ] Action items completed
- [ ] Next steps planned

---

### Aggregate

**Weekly:**
- [ ] Usage metrics updated
- [ ] Feedback themes identified
- [ ] Top feature requests ranked
- [ ] Top bugs prioritized
- [ ] Action plan created

**Bi-weekly:**
- [ ] NPS calculated
- [ ] Customer segmentation updated
- [ ] Roadmap adjusted
- [ ] Team sync on feedback

**Monthly:**
- [ ] Comprehensive feedback report
- [ ] Product improvements shipped
- [ ] Customer success stories
- [ ] Beta program review

---

## Success Criteria

### By End of Week 12-14

**Customers:**
- ✅ 10+ beta customers onboarded
- ✅ 80%+ successful first API call
- ✅ 60%+ active weekly

**Feedback:**
- ✅ NPS > 30
- ✅ 60%+ would pay
- ✅ 20+ feature requests collected
- ✅ 10+ bugs identified and fixed

**Usage:**
- ✅ 2x week-over-week growth
- ✅ Error rate < 0.5%
- ✅ < 2 support tickets per customer

**Insights:**
- ✅ Clear use case patterns
- ✅ Pricing expectations defined
- ✅ Top 5 features identified
- ✅ Product-market fit validated

---

## Tools & Templates

### Spreadsheets
- Customer feedback tracker
- Usage metrics dashboard
- Feature request log
- Bug tracking sheet

### Communication
- Email templates
- Call scripts
- Survey forms
- Slack channels

### Analysis
- NPS calculator
- Cohort analysis
- Retention tracking
- Churn prediction

---

## Next Steps

After collecting feedback:
1. Analyze and prioritize
2. Build top features
3. Fix critical bugs
4. Refine pricing
5. Prepare for launch

---

**Goal:** Collect actionable feedback from 10-20 beta customers

**Measure:** NPS, willingness to pay, feature requests, usage growth

**Optimize:** Based on feedback themes and customer success
