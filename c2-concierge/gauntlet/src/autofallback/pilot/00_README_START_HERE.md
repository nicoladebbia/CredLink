# C2PA Pilot Program - 5 Minute Setup

## 🎯 Your 14-Day Content Credentials Survival Pilot

**Promise**: By Day 7, you'll have a publicly reproducible report showing where your stack breaks and a fix plan. By Day 14, we'll either show all green checks or a documented reason we can publish.

## ⚡ Quick Start (5 minutes)

### Step 1: Install Injector
Choose your platform:

**WordPress:**
```bash
wp plugin install c2pa-pilot.zip --activate
```

**Shopify:**
1. Install dev app from your pilot welcome email
2. Enable "Content Credentials" app block

**Custom Site:**
```html
<script type="module" src="/c2-badge.esm.js"></script>
```

### Step 2: Verify Installation
Visit any page with images. You should see:
- `<link rel="c2pa-manifest" href="...">` in page source
- Blue "Content Credentials" badge on images

### Step 3: First Asset Check
```bash
curl -H "Accept: application/json" "https://your-domain.com/_c2/verify?asset=first-image.jpg"
```

## 📋 Day-by-Day Expectations

| Day | What Happens | Time Commitment | Success Criteria |
|-----|--------------|-----------------|------------------|
| 0 (Today) | Kickoff & Installation | 30 min | 10 assets signed, injectors live |
| 1-2 | Baseline Capture | 0 min (async) | Metering dashboard active |
| 3 | Check-in #1 | 20 min | Survival % visible, fixes planned |
| 7 | Demo #1 + Report v1 | 25 min | Breakpoints identified, LOI signed |
| 10 | Fix Review | 15 min | Most issues resolved |
| 14 | Final Decision | 25 min | Go/No-go on paid plan |

## 🎯 Demo Dates

- **Demo #1**: Scheduled during Day 3 check-in
- **Final Decision**: Scheduled during Day 10 check-in

## ✅ Success Criteria

**Technical Gates:**
- Remote manifest survival ≥99.9% on tenant routes
- p95 verify latency <600ms
- ≥200 assets processed
- ≥3 routes exercised

**Business Gates:**
- LOI signed by Day 7
- Pilot→paid conversion ≥40%
- Anonymized public report authorized

## 🚨 What If Something Breaks?

**Immediate Actions:**
1. Check survival dashboard (URL provided in welcome email)
2. Review incident log (URL provided in welcome email)
3. Contact pilot support: pilot@credlink.io

**Rollback:** Remove injector/plugin - all changes reverse in 2 minutes

## 📞 Support

- **Technical Issues**: pilot@credlink.io
- **Commercial Questions**: sales@credlink.io
- **Urgent**: +1-555-C2PA-HELP

## 📋 Next Steps

1. **Right Now**: Install injector (Step 1 above)
2. **Within 1 Hour**: Verify installation (Step 2)
3. **Today**: Complete first asset check (Step 3)
4. **Day 3**: Join check-in call

---

**Remember**: We don't promise features; we promise survival and evidence. By Day 14, you'll have proof that Content Credentials work in your stack, or a documented reason why they don't.
