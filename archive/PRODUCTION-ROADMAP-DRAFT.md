# CredLink Production Roadmap
## From 15% → 100% Deployable & Sellable

**Created:** Nov 7, 2025  
**Status:** 🔴 Not production-ready  
**Target:** 100% functional MVP in 4-8 weeks

---

## **Phase 1: CRITICAL FIXES (Week 1-2) - NO SKIPPING**

### 1.1 Name Consolidation
**Problem:** Project called "CredLink" but code references "CredLink", "c2c", "C2 Concierge"  
**Fix:**
- [ ] Rename package.json `name` from `CredLink` to `credlink`
- [ ] Replace all `CredLink`, `c2c`, `C2 Concierge` with `CredLink` across codebase
- [ ] Update CLI binary from `c2c` to `credlink`
- [ ] Update all README references
- [ ] Update domain references to credlink.com

**Time:** 2-3 hours

### 1.2 Folder Structure Cleanup
**Problem:** Inconsistent, messy structure with phase-numbered folders and experimental paths  
**Fix:** Reorganize to standard production structure

```
credlink/
├── core/                      # Core services (MOVE everything here)
│   ├── signer/               # Phase 1: Signing service (Rust/TS)
│   ├── verify/               # Phase 3: Verification API
│   ├── manifest-store/       # Phase 2: Manifest storage
│   └── policy-engine/        # Phase 20: Policy compiler
├── integrations/             # Customer-facing integrations
│   ├── cms/                  # WordPress, Shopify, Drupal, etc.
│   ├── browser-extension/    # Phase 24
│   └── mobile/               # Phase 25: iOS/Android SDKs
├── ui/
│   ├── badge/                # Phase 3: <credlink-badge> web component
│   ├── admin/                # Phase 13: Analytics dashboard
│   └── landing/              # Marketing site
├── cli/                      # Phase 44: CLI tool
├── sdk/                      # Phase 43: JS/Python/Go SDKs
│   ├── javascript/
│   ├── python/
│   └── go/
├── infra/                    # Infrastructure as code
│   ├── terraform/            # Phase 45
│   ├── cloudflare/           # Workers, R2 config
│   └── kubernetes/           # If self-hosted
├── tests/
│   ├── acceptance/           # Phase 0: Survival tests
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── api/                  # API reference
│   ├── guides/               # Integration guides
│   └── compliance/           # Legal/compliance docs
├── .github/
│   └── workflows/            # CI/CD pipelines
└── README.md
```

**Actions:**
- [ ] Move `apps/*` to `core/*` (consolidate services)
- [ ] Move `packages/*` to appropriate locations
- [ ] Delete phase-numbered folders (phase51-*, phase52-*, etc.) → move content to proper places
- [ ] Archive experimental/incomplete work to `archive/` folder
- [ ] Update all import paths

**Time:** 1 day

### 1.3 Delete Dead Weight
**Problem:** 3.6GB repo with unused files, redundant docs, placeholder code  
**Delete:**
- [ ] All phase-XX numbered folders → consolidate into proper structure
- [ ] `temp-verification/` folder
- [ ] Duplicate markdown files (PHASE-XX-IMPLEMENTATION-COMPLETE.md) → merge into single changelog
- [ ] `survival-artifacts.zip` → regenerate on demand
- [ ] Empty folders
- [ ] Unused dependencies in package.json

**Time:** 2-3 hours

---

## **Phase 2: CORE MVP IMPLEMENTATION (Week 2-4)**

### 2.1 **CRITICAL: Working C2PA Signer**
**Current:** Demos and stubs  
**Needed:** Production-grade signing service

**Implementation:**
```typescript
// core/signer/src/index.ts
import { sign } from 'c2pa-node'; // or Rust FFI

export async function signAsset(params: {
  assetUrl: string;
  creator: string;
  assertions: Assertions;
}): Promise<{ manifestUrl: string; manifestHash: string }> {
  // 1. Fetch asset
  // 2. Generate C2PA manifest
  // 3. Sign with KMS key
  // 4. Upload to manifest store
  // 5. Return manifest URL
}
```

**Tasks:**
- [ ] Implement actual c2pa-node integration OR Rust signer with FFI
- [ ] Add KMS key management (AWS KMS, GCP KMS, or CloudFlare Workers KV)
- [ ] Implement TSA (timestamp authority) integration
- [ ] Add manifest generation logic
- [ ] Test with real images

**Dependencies:**
- `c2pa-node` OR custom Rust build
- KMS provider SDK
- TSA client library

**Time:** 1 week

### 2.2 **CRITICAL: Manifest Storage (Cloudflare R2)**
**Current:** Stubbed  
**Needed:** Hash-addressed immutable storage

**Implementation:**
```typescript
// core/manifest-store/src/index.ts
import { R2Bucket } from '@cloudflare/workers-types';

export async function storeManifest(
  manifest: Buffer,
  hash: string
): Promise<string> {
  const key = `${hash}.c2pa`;
  await R2.put(key, manifest, {
    httpMetadata: {
      contentType: 'application/cbor',
      cacheControl: 'public, max-age=31536000, immutable'
    }
  });
  return `https://manifests.credlink.com/${key}`;
}
```

**Tasks:**
- [ ] Set up Cloudflare R2 bucket
- [ ] Implement upload API
- [ ] Add hash verification
- [ ] Implement Link header injection (Cloudflare Worker)
- [ ] Test immutability (prevent overwrites)

**Time:** 3-4 days

### 2.3 **CRITICAL: Verify API**
**Current:** Partial implementation  
**Needed:** Full cryptographic verification

**Implementation:**
```typescript
// core/verify/src/index.ts
export async function verifyAsset(params: {
  assetUrl?: string;
  manifestUrl?: string;
}): Promise<VerificationResult> {
  // 1. Discover manifest (Link header or explicit URL)
  // 2. Fetch manifest from R2
  // 3. Verify cryptographic signature
  // 4. Check TSA timestamp
  // 5. Validate trust chain
  // 6. Return result with warnings
}
```

**Tasks:**
- [ ] Implement manifest discovery (Link headers)
- [ ] C2PA signature verification
- [ ] Trust root validation
- [ ] Error handling with actionable warnings
- [ ] API endpoint implementation (Fastify/Express)

**Time:** 1 week

### 2.4 **CRITICAL: Badge Web Component**
**Current:** Stubbed  
**Needed:** Working `<credlink-badge>` element

**Implementation:**
```typescript
// ui/badge/src/credlink-badge.ts
class CredLinkBadge extends HTMLElement {
  connectedCallback() {
    const assetUrl = this.getAttribute('asset-url');
    this.fetchVerification(assetUrl).then(result => {
      this.render(result);
    });
  }
  
  async fetchVerification(url: string) {
    const response = await fetch(`https://api.credlink.com/verify`, {
      method: 'POST',
      body: JSON.stringify({ assetUrl: url })
    });
    return response.json();
  }
  
  render(result: VerificationResult) {
    this.innerHTML = `
      <div class="credlink-badge">
        ${result.valid ? '✓ Verified' : '❌ Not Verified'}
        <button>View Details</button>
      </div>
    `;
  }
}

customElements.define('credlink-badge', CredLinkBadge);
```

**Tasks:**
- [ ] Build web component (vanilla JS, no framework)
- [ ] Add CSP-safe implementation (no eval)
- [ ] Implement modal for details
- [ ] Add accessibility (ARIA, keyboard navigation)
- [ ] Create NPM package
- [ ] Add SRI hash support

**Time:** 4-5 days

---

## **Phase 3: DEPLOYMENT & INFRASTRUCTURE (Week 4-5)**

### 3.1 Cloudflare Deployment
**Tasks:**
- [ ] Set up Cloudflare account
- [ ] Create R2 bucket for manifests
- [ ] Deploy edge worker for Link injection
- [ ] Set up DNS (manifests.credlink.com, api.credlink.com)
- [ ] Configure SSL/TLS

**Time:** 1-2 days

### 3.2 CI/CD Pipeline
**Tasks:**
- [ ] GitHub Actions for tests
- [ ] Automated deployments to Cloudflare
- [ ] Docker builds for self-hosted option
- [ ] Release automation
- [ ] Version tagging

**Files to create:**
```yaml
# .github/workflows/deploy.yml
name: Deploy to Production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Deploy to Cloudflare
        run: pnpm deploy:production
```

**Time:** 2-3 days

### 3.3 Monitoring & Observability
**Tasks:**
- [ ] Set up error tracking (Sentry)
- [ ] Add structured logging
- [ ] Create health check endpoints
- [ ] Set up uptime monitoring (Better Uptime)
- [ ] Add performance monitoring

**Time:** 1-2 days

---

## **Phase 4: INTEGRATION & PLUGINS (Week 5-6)**

### 4.1 WordPress Plugin (MVP)
**Implementation:**
```php
// integrations/cms/wordpress/credlink.php
<?php
/*
Plugin Name: CredLink
Description: Cryptographic image provenance
Version: 1.0.0
*/

add_action('add_attachment', 'credlink_sign_image');

function credlink_sign_image($attachment_id) {
    $image_url = wp_get_attachment_url($attachment_id);
    
    $response = wp_remote_post('https://api.credlink.com/sign', [
        'body' => json_encode(['assetUrl' => $image_url])
    ]);
    
    $manifest_url = json_decode($response['body'])->manifestUrl;
    update_post_meta($attachment_id, 'credlink_manifest', $manifest_url);
}

add_filter('wp_get_attachment_image', 'credlink_inject_badge');
function credlink_inject_badge($html, $attachment_id) {
    $manifest = get_post_meta($attachment_id, 'credlink_manifest', true);
    if ($manifest) {
        $html .= "<credlink-badge manifest-url='$manifest'></credlink-badge>";
    }
    return $html;
}
```

**Tasks:**
- [ ] Build WordPress plugin
- [ ] Add settings page (API key config)
- [ ] Test with common themes
- [ ] Submit to WordPress.org plugin directory
- [ ] Write installation guide

**Time:** 3-4 days

### 4.2 Shopify App (MVP)
**Implementation:**
```typescript
// integrations/cms/shopify/app.ts
import { Shopify } from '@shopify/shopify-api';

app.post('/webhooks/product-create', async (req, res) => {
  const product = req.body;
  
  for (const image of product.images) {
    const { manifestUrl } = await signAsset(image.src);
    
    // Store in metafields
    await Shopify.rest.Metafield.create({
      session,
      metafield: {
        namespace: 'credlink',
        key: 'manifest_url',
        value: manifestUrl,
        type: 'single_line_text_field'
      }
    });
  }
});
```

**Tasks:**
- [ ] Build Shopify app
- [ ] Add OAuth flow
- [ ] Implement webhook handlers
- [ ] Create Liquid snippet for badge
- [ ] Submit to Shopify App Store
- [ ] Write installation guide

**Time:** 4-5 days

---

## **Phase 5: DOCUMENTATION & MARKETING (Week 6-7)**

### 5.1 GitHub README Overhaul
**Current:** Good but needs polish  
**Improvements:**
- [ ] Add hero image/logo
- [ ] Add demo GIF showing verify flow
- [ ] Add "Quick Start" in first 100 lines
- [ ] Add badges (build status, license, version)
- [ ] Add screenshots of badge in action
- [ ] Add comparison table (vs Adobe, Truepic)
- [ ] Add customer testimonials (after pilots)

### 5.2 GitHub Pages Website
**Create:**
```
docs/
├── index.html          # Landing page
├── demo.html           # Interactive demo
├── pricing.html        # Pricing page
├── docs/               # Documentation
│   ├── quickstart.md
│   ├── api.md
│   └── integrations/
└── assets/
    ├── images/
    └── css/
```

**Content:**
- [ ] Landing page with value prop
- [ ] Interactive demo (upload image → sign → verify)
- [ ] API documentation
- [ ] Integration guides
- [ ] Pricing page
- [ ] FAQ

**Time:** 3-4 days

### 5.3 Demo Videos
**Create:**
- [ ] 30-second product demo (for outreach)
- [ ] 5-minute deep dive (for qualified leads)
- [ ] WordPress integration walkthrough
- [ ] Shopify integration walkthrough

**Time:** 2-3 days

### 5.4 Sales Collateral
**Create:**
- [ ] One-pager PDF (problem → solution → pricing)
- [ ] Deck (15 slides max)
- [ ] ROI calculator (embed on site)
- [ ] Case study template
- [ ] Email templates for outreach

**Time:** 2-3 days

---

## **Phase 6: LEGAL & COMPLIANCE (Week 7-8)**

### 6.1 Essential Legal Docs
**Create:**
- [ ] Terms of Service
- [ ] Privacy Policy
- [ ] Data Processing Agreement (GDPR)
- [ ] Acceptable Use Policy
- [ ] SLA (Service Level Agreement)

**Resources:**
- Use Termly.io or similar for templates
- Have lawyer review (budget $1-2K)

**Time:** 2-3 days + legal review

### 6.2 Security & Compliance
**Tasks:**
- [ ] Run penetration test (budget $2-5K)
- [ ] Get SOC 2 Type 1 started (if targeting enterprise)
- [ ] GDPR compliance audit
- [ ] Create security.txt file
- [ ] Set up responsible disclosure program

**Time:** Ongoing, 1 week for initial setup

---

## **Phase 7: GO-TO-MARKET (Week 8+)**

### 7.1 Launch Checklist
- [ ] Domain: credlink.com registered and DNS configured
- [ ] Infrastructure: Cloudflare, R2, Workers deployed
- [ ] Core APIs: Sign, Verify, Badge all working
- [ ] At least 1 CMS plugin: WordPress OR Shopify
- [ ] Documentation: Complete and public
- [ ] Pricing: Finalized and published
- [ ] Payment: Stripe integration for self-serve billing
- [ ] Support: Email set up (support@credlink.com)
- [ ] Status page: status.credlink.com

### 7.2 Soft Launch
**Week 8-10:**
- [ ] 5 beta customers (free)
- [ ] Gather feedback
- [ ] Fix critical bugs
- [ ] Refine onboarding
- [ ] Get first testimonials

### 7.3 Public Launch
**Week 10-12:**
- [ ] Product Hunt launch
- [ ] Hacker News Show HN
- [ ] LinkedIn/Twitter announcement
- [ ] Press outreach (TechCrunch, VentureBeat)
- [ ] SEO optimization
- [ ] Content marketing (blog posts)

---

## **CRITICAL RISKS & MITIGATIONS**

### Risk 1: C2PA Integration Complexity
**Mitigation:** Use c2pa-node library; don't build from scratch

### Risk 2: Cloudflare Costs
**Mitigation:** R2 is cheap; budget $50-200/mo for MVP

### Risk 3: Market Doesn't Care
**Mitigation:** Get 3 LOIs before building more features

### Risk 4: Incumbent Competition
**Mitigation:** Focus on 99.9% survival metric; they can't match it

### Risk 5: Regulatory Changes
**Mitigation:** Build standards-compliant (C2PA); easy to adapt

---

## **RESOURCE REQUIREMENTS**

### Time (Solo Founder)
- **Full-time:** 8 weeks to MVP
- **Part-time (20h/week):** 16 weeks to MVP

### Budget
- **Hosting:** $100-500/mo (Cloudflare)
- **Legal:** $2-5K (one-time)
- **Security audit:** $2-5K (one-time)
- **Domain/SSL:** $50/year
- **Tools:** $100/mo (Sentry, Better Uptime, etc.)
- **Total Year 1:** $10-15K

### Skills Needed
- TypeScript/Node.js ✅ (you have this)
- Rust (optional, for signer)
- Cryptography basics
- Cloudflare Workers
- Web components
- DevOps/CI/CD

---

## **SUCCESS METRICS**

### Technical Metrics
- ✅ 99.9% remote survival across CDNs
- ✅ <600ms p95 verify latency
- ✅ 99.9% uptime
- ✅ Zero security incidents

### Business Metrics
- 🎯 5 beta customers by Week 10
- 🎯 First paying customer by Week 12
- 🎯 $1K MRR by Month 4
- 🎯 $10K MRR by Month 12

---

## **IMMEDIATE NEXT STEPS (This Week)**

1. **Rename everything** from CredLink to CredLink (2 hours)
2. **Reorganize folders** per new structure (1 day)
3. **Delete dead weight** - archive phase folders (2 hours)
4. **Pick ONE core feature** to finish: Signer OR Verify (1 week)
5. **Set up Cloudflare** account and R2 bucket (1 day)

---

## **STOP DOING**

- ❌ Adding new phases/features
- ❌ Writing more documentation
- ❌ Planning phase 61-100
- ❌ Experimenting with new tech
- ❌ Refactoring perfect code

## **START DOING**

- ✅ Shipping working code
- ✅ Testing with real images
- ✅ Talking to potential customers
- ✅ Getting feedback
- ✅ Iterating fast

---

**Remember:** A working MVP with 3 features beats a perfect plan with 60 phases.

Ship → Learn → Iterate → Grow.
