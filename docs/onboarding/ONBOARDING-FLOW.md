# Beta Customer Onboarding Flow

Step-by-step onboarding process for new beta customers.

---

## Overview

**Goal:** Get customers from "approved" to "first successful API call" in under 10 minutes.

**Steps:**
1. Send welcome email with API key
2. Customer makes first /sign request
3. Customer makes first /verify request
4. Customer explores dashboard
5. Schedule feedback call

---

## Step 1: Welcome Email

### Timing
Send immediately after approving beta application.

### Email Template

```
Subject: Welcome to CredLink Beta! 🎉

Hi [Name],

Welcome to the CredLink beta program! We're excited to have [Company] on board.

Your API Key:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
cl_beta_[unique_key_here]
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  Keep this secret! Never commit to git or expose client-side.

Quick Start:
1. Read the integration guide: https://docs.credlink.com/integration
2. Make your first request (see below)
3. Check your dashboard: https://dashboard.credlink.com

Your First Request:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
curl -X POST https://api.credlink.com/v1/sign \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64_encoded_image",
    "metadata": {
      "creator": "[Company]",
      "timestamp": "2025-01-01T00:00:00Z"
    }
  }'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Resources:
• Integration Guide: https://docs.credlink.com/integration
• API Reference: https://docs.credlink.com/api
• Dashboard: https://dashboard.credlink.com
• Support: support@credlink.com

Beta Program Details:
• Duration: 3 months
• Usage: Unlimited (no charges)
• Support: Direct founder access
• Pricing: Early adopter rates locked for 2 years

Next Steps:
1. Make your first API call (takes 5 minutes)
2. Explore the dashboard
3. Schedule a feedback call: [Calendly link]

Questions? Just reply to this email.

Looking forward to your feedback!

Best,
[Your name]
CredLink Team

P.S. Join our Slack channel for faster support: [Slack invite]
```

### Checklist
- [ ] API key generated
- [ ] Welcome email sent
- [ ] Dashboard access granted
- [ ] Slack invite sent (optional)
- [ ] Calendly link shared

---

## Step 2: First Sign Request

### Goal
Customer successfully signs their first image within 24 hours.

### Success Criteria
- API call returns 200 status
- Signed image received
- Proof URL generated
- Dashboard shows first request

### Monitoring
Track in dashboard:
- Time to first request
- Success/failure status
- Error messages (if any)

### If No Request After 24 Hours

**Send reminder email:**

```
Subject: Need help getting started with CredLink?

Hi [Name],

I noticed you haven't made your first API request yet. 
Need any help getting started?

Common issues:
• API key not set correctly
• Image encoding problems
• Network/firewall issues

I'm happy to jump on a quick call to help you get set up.

Just reply to this email or book a time: [Calendly link]

Best,
[Your name]
```

---

## Step 3: First Verify Request

### Goal
Customer verifies the signed image to see the full workflow.

### Success Criteria
- Verification returns valid=true
- Metadata matches original
- Customer understands the flow

### Monitoring
Track in dashboard:
- Sign → Verify completion rate
- Time between sign and verify
- Verification success rate

### If No Verify After Sign

**Send nudge email:**

```
Subject: Complete your first CredLink workflow

Hi [Name],

Great job signing your first image! 🎉

Next step: Verify it to see the full workflow.

Quick verify request:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
curl -X POST https://api.credlink.com/v1/verify \
  -H "X-API-Key: YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "image": "base64_encoded_signed_image"
  }'
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

You should see:
{
  "valid": true,
  "creator": "[Company]",
  "timestamp": "..."
}

Questions? Just reply.

Best,
[Your name]
```

---

## Step 4: Dashboard Exploration

### Goal
Customer explores dashboard and understands their usage.

### Dashboard Features
- **API Calls:** Total requests, sign vs verify
- **Proofs Stored:** Number of signed images
- **Recent Activity:** Last 10 requests
- **Usage Trends:** Daily/weekly charts
- **API Key:** Copy, regenerate
- **Documentation:** Quick links

### Monitoring
Track dashboard visits:
- First visit timestamp
- Pages viewed
- Time spent
- Features used

---

## Step 5: Feedback Call

### Timing
Schedule within first week of onboarding.

### Invitation Email

```
Subject: Let's chat about your CredLink experience

Hi [Name],

How's your experience with CredLink so far?

I'd love to hear your feedback and answer any questions. 
Can we schedule a 30-minute call?

Book a time: [Calendly link]

Topics to discuss:
• Your use case and goals
• Integration experience
• Feature requests
• Pain points
• Pricing expectations

Looking forward to chatting!

Best,
[Your name]
```

### Call Agenda

**1. Introduction (5 min)**
- Thank them for joining beta
- Confirm their use case

**2. Experience Review (10 min)**
- How was integration?
- Any issues or blockers?
- What worked well?
- What was confusing?

**3. Feature Discussion (10 min)**
- What features do they need?
- What's missing?
- What would make it better?

**4. Pricing & Plans (3 min)**
- Discuss pricing expectations
- Confirm early adopter pricing
- Timeline for paid plans

**5. Next Steps (2 min)**
- Action items
- Follow-up timeline
- Additional resources

### Post-Call Follow-Up

```
Subject: Thanks for the feedback call!

Hi [Name],

Thanks for taking the time to chat today! Here's a summary:

What We Discussed:
• [Key point 1]
• [Key point 2]
• [Key point 3]

Action Items:
• [Action 1] - [Owner] - [Due date]
• [Action 2] - [Owner] - [Due date]

Feature Requests:
• [Feature 1] - Added to roadmap
• [Feature 2] - In development
• [Feature 3] - Planned for Q2

Next Steps:
• [Next step 1]
• [Next step 2]

Questions? Just reply.

Thanks again for your feedback!

Best,
[Your name]
```

---

## Onboarding Metrics

### Success Metrics

| Metric | Target | Good | Needs Improvement |
|--------|--------|------|-------------------|
| Time to first request | < 24 hours | < 48 hours | > 48 hours |
| Sign → Verify completion | > 80% | > 60% | < 60% |
| Dashboard visit | > 90% | > 70% | < 70% |
| Feedback call scheduled | > 70% | > 50% | < 50% |
| Active after 1 week | > 80% | > 60% | < 60% |

### Red Flags

🚩 **No API call after 48 hours**
- Action: Personal outreach
- Offer: Setup call

🚩 **Multiple failed requests**
- Action: Debug assistance
- Offer: Code review

🚩 **No dashboard visit**
- Action: Send dashboard tour
- Offer: Walkthrough call

🚩 **Feedback call declined**
- Action: Send survey instead
- Offer: Async feedback

---

## Onboarding Checklist

### Day 0 (Application Approved)
- [ ] Generate API key
- [ ] Send welcome email
- [ ] Grant dashboard access
- [ ] Add to Slack (optional)
- [ ] Add to CRM

### Day 1
- [ ] Monitor first API call
- [ ] Check for errors
- [ ] Send reminder if no activity

### Day 2-3
- [ ] Monitor sign → verify flow
- [ ] Send nudge if incomplete
- [ ] Offer help if errors

### Day 4-7
- [ ] Check dashboard usage
- [ ] Send feedback call invite
- [ ] Schedule call

### Week 2
- [ ] Conduct feedback call
- [ ] Send call summary
- [ ] Add feature requests to roadmap
- [ ] Follow up on action items

### Week 3-4
- [ ] Check ongoing usage
- [ ] Send check-in email
- [ ] Offer additional support

---

## Automation Opportunities

### Automated Emails

1. **Welcome email** - Triggered on approval
2. **First request reminder** - 24 hours after welcome
3. **Verify nudge** - After first sign request
4. **Dashboard tour** - 48 hours after welcome
5. **Feedback invite** - 1 week after onboarding
6. **Check-in** - 2 weeks after onboarding

### Dashboard Notifications

1. **First successful request** - Celebrate!
2. **10th request** - Milestone achieved
3. **100th request** - Power user!
4. **Error spike** - Offer help

### Slack Notifications

1. **New customer onboarded** - Team notification
2. **First API call** - Celebrate with team
3. **Feedback call scheduled** - Reminder
4. **Feature request** - Log to product board

---

## Support Channels

### Email
- **Address:** support@credlink.com
- **Response time:** < 24 hours
- **Best for:** Non-urgent questions

### Slack
- **Channel:** #beta-customers
- **Response time:** < 4 hours (business days)
- **Best for:** Quick questions, discussions

### Calls
- **Booking:** [Calendly link]
- **Duration:** 30 minutes
- **Best for:** Complex issues, feedback

---

## Common Issues & Solutions

### Issue: API Key Not Working

**Symptoms:**
- 401 Unauthorized error
- "Invalid API key" message

**Solutions:**
1. Check key is correct (copy-paste)
2. Verify header format: `X-API-Key: cl_beta_...`
3. Ensure no extra spaces
4. Try regenerating key

---

### Issue: Image Encoding Problems

**Symptoms:**
- 400 Bad Request
- "Invalid image data"

**Solutions:**
1. Verify base64 encoding
2. Check image format (JPEG, PNG, WebP)
3. Ensure no data URI prefix
4. Test with sample image

---

### Issue: Large Image Timeout

**Symptoms:**
- Request timeout
- 413 Payload Too Large

**Solutions:**
1. Compress image before sending
2. Reduce image dimensions
3. Use JPEG instead of PNG
4. Stay under 10MB limit

---

### Issue: Verification Fails

**Symptoms:**
- `valid: false` response
- "No manifest found"

**Solutions:**
1. Ensure image was signed by CredLink
2. Check image wasn't re-encoded
3. Verify image wasn't cropped
4. Test with freshly signed image

---

## Onboarding Timeline

```
Day 0:  Application approved → Welcome email sent
Day 1:  First API call → Success celebration
Day 2:  First verify → Workflow complete
Day 3:  Dashboard exploration
Day 7:  Feedback call scheduled
Day 14: Feedback call conducted
Day 21: Check-in email
Day 30: Beta review
```

---

## Success Stories

Share success stories to motivate new customers:

```
"[Company] signed 1,000 images in their first week!"

"[Company] integrated CredLink in under 2 hours"

"[Company] reduced fraud by 40% using CredLink"
```

---

## Next Steps

After successful onboarding:
1. Regular check-ins (weekly → monthly)
2. Feature updates and announcements
3. Beta program graduation
4. Transition to paid plan

---

**Goal:** 80% of customers successfully onboarded within 7 days

**Measure:** Time to first request, completion rate, satisfaction score

**Optimize:** Based on feedback and metrics
