---
# ⚠️ CRITICAL: PROJECT STATUS - READ THIS FIRST

**This is a research/architecture project. The backend does NOT exist.**

## What DOESN'T Work (Yet):
- ❌ Backend signing service (not implemented)
- ❌ POST /sign endpoint (returns 404)
- ❌ POST /verify endpoint (returns 404)  
- ❌ Demo (will fail on button click)
- ❌ CLI signing commands (no backend to connect to)
- ❌ All "production ready" claims (false)

## What DOES Work:
- ✅ Policy engine tests (`pnpm test:acceptance`)
- ✅ Frontend UI (visual/mock only)
- ✅ Architecture documentation
- ✅ Project structure

## Honest Timeline:
- **Phase 1-2 (Honesty + Rebrand):** 1-2 weeks → Currently in progress
- **Phase 3 (Backend Build):** 4-8 weeks → Not started
- **Phase 4 (Infrastructure Deploy):** 4-8 weeks → Not started  
- **Phase 5 (Customer Validation):** 12-16 weeks → Not started
- **Full Production Ready:** 6-12 months minimum

## Current Score: 3.5/10
- Documentation honesty: 3/10 (dishonest claims present)
- Code quality: 7/10 (good architecture, no implementation)
- Completeness: 1/10 (backend missing)
- Production readiness: 0/10 (nothing deployed)

**We are committed to radical transparency. All claims will be measured and proven before stated.**

**See [APOLOGY.md](APOLOGY.md) for our honesty commitment and what we fixed.**

---

# CredLink: C2PA Content Authenticity Platform

**Status:** In Development (Backend 0% complete)  
**Timeline:** 6-12 months to production-ready system  
**Current Focus:** Phase 1 (Honesty Audit) - Removing dishonest claims  
**Project Type:** Commercial Product

*Building production C2PA content authenticity platform. Not production ready yet.*

See [COMMERCIAL-ROADMAP.md](COMMERCIAL-ROADMAP.md) for full 18-30 month plan.

[![Status](https://img.shields.io/badge/Status-Early%20Development-red)](README.md)
[![Build](https://img.shields.io/badge/Build-Passing-green)](README.md)
[![Tests](https://img.shields.io/badge/Tests-Passing-green)](README.md)

⚠️ **STATUS: Early Development - Not Production Ready**

**This is development code.** Core architecture and test framework work. Most features are planned but not yet implemented.

### Quick Links
- 🚀 [Quick Start](START-HERE.md)
- 📖 [Technical Architecture](CREDLINK-TECHNICAL-HOW-IT-WORKS.md)
- 📋 [Project Structure](phasemap.md)
- 🤝 [How to Contribute](CONTRIBUTING.md)
- 🔒 [Security Policy](SECURITY.md)

---

**Research goal:** Explore if remote-first C2PA architecture can achieve high survival rates for content authenticity across hostile internet infrastructure.

**Currently researching:** Whether cryptographic proofs can survive CDN optimization, sharing, and compression when stored remotely rather than embedded.

CredLink is a content authenticity platform that attaches cryptographic proof to images, proving they're genuine—even after 1,000 shares, compression, and CDN optimization. Works for newsrooms fighting deepfakes, e-commerce reducing chargebacks, brands proving compliance, and anyone who needs to prove an image is real.

---

## The Problem (Why This Exists)

- **Deepfakes are mainstream**: 14M created in 2023, growing 300% YoY. Anyone can fake anything.
- **Trust is broken**: 64% of people can't tell real from fake photos.
- **Current solutions fail**: Adobe Verify, Truepic, and others require both parties to use their tool—or the proof disappears when the image is shared, compressed, or optimized by a CDN.
- **Regulatory pressure**: EU AI Act now requires you to document image origins and prove they're authentic.
- **Economic impact**: Counterfeit product photos cost e-commerce $4.2T annually in losses + disputes.

**The hard truth**: There is no mainstream way to prove an image is real at scale.

---

## How CredLink Works (3-Step Flow)

### 1️⃣ **Sign Your Image**
```
Upload image → CredLink creates digital proof → Get manifest URL
```
- You upload an image (or just provide a URL)
- CredLink generates a cryptographic signature proving:
  - Who created this image? (creator ID)
  - When was it created? (timestamp)
  - What camera/tool was used? (device info)
  - How was it edited? (edit history)
- Returns a manifest URL you can store or embed

### 2️⃣ **Share It Anywhere**
```
Your image circulates: shared, compressed, optimized by CDNs
CredLink's proof survives 99.9% of transformations
```
Unlike competitors, our **remote-first architecture** means:
- Proof lives on Cloudflare's edge network (globally distributed, <50ms latency)
- Works even if recipient doesn't use CredLink
- Survives JPEG quality reduction, format conversion, CDN optimization, file compression

### 3️⃣ **Viewers Verify**
```
Viewer sees image → Clicks "Verify" button → Sees proof it's real
```
- One-click verification in any browser
- Shows: ✓ This is authentic ✓ Created by X on date Y ✓ Edit history
- Shows: ❌ This is NOT verified (deepfake/unverified)

---

## Who Should Use CredLink

| Audience | Problem CredLink Solves | Benefit |
|----------|------------------------|---------|
| **Newsrooms** | Readers doubt your photos because deepfakes exist | Prove your journalism is real. Competitive advantage. Reader trust. |
| **E-commerce** | Sellers upload fake product photos → chargebacks | Reduce disputes 20-30%. Proof matches reality. Fewer refunds. |
| **Brands** | Competitors fake your marketing images | Prove authenticity. EU AI Act compliance. Document your content origins. |
| **Marketplaces** | Counterfeit goods destroy trust | Verify seller photos. Reduce liability. Cut chargeback costs. |
| **Developers** | You need to add authenticity to your platform | Simple REST API. 10 minutes to integrate. Works everywhere. |

---

## The Key Differentiator: 99.9% Survival

## Competitor Comparisons

**Status:** Not available yet

We don't compare to competitors until we have:
1. ✅ Working backend (Phase 3)
2. ✅ Deployed infrastructure (Phase 4)
3. ✅ Measured survival rates (Phase 4)
4. ✅ Real customer validation (Phase 5)

**Timeline:** 6-8 months until fair comparison possible

**Previous mistake:** We had a comparison table comparing our architecture 
(not product) to shipping products. That was dishonest. We deleted it.

**What "99.9% survival" means**: Your proof stays attached even after:
- ✓ JPEG quality reduction (Q75)
- ✓ Format conversion (JPG → WebP)
- ✓ CDN optimization (Imgix, Cloudinary, etc.)
- ✓ Shared 1,000+ times
- ✓ File compression
- ✓ Metadata stripping

Competitors fail because they embed proof in image metadata. CDNs strip it. We put proof on our edge network instead.

---

## Current Development Status

### ⚠️ **NOT Production Ready** - Development/Testing Only

---

## What Works Right Now

✅ **Acceptance Test Framework** - 16+ hostile-path scenarios testing CDN survival  
✅ **Policy Compiler** - Deterministic policy engine with remote-first doctrine  
✅ **Security Architecture** - HMAC signing, SSRF protection, rate limiting, input validation  
✅ **CLI Tool** - Basic C2PA signing and verification (development version)  
✅ **SDKs** - Python, Go, and JavaScript development SDKs  
✅ **Monorepo Structure** - pnpm workspaces with proper organization  
✅ **Development Sandboxes** - Test environments (strip-happy, preserve-embed, remote-only)

**These components are functional and tested.** You can run the test suite now.

---

## What's In Active Development

🚀 **Image Signing API** - Production /sign endpoint (needs implementation)  
🚀 **Verification API** - Production /verify endpoint (needs implementation)  
🚀 **Web Badge Component** - Browser verification UI (needs implementation)  

**These are designed but not yet built.**

---

## What's Not Started

📋 **Cloud Infrastructure** - Cloudflare Edge Workers, R2 storage  
📋 **CMS Integrations** - WordPress plugin, Shopify app  
📋 **Browser Extensions** - Chrome, Safari, Edge  
📋 **Mobile SDKs** - iOS, Android  
📋 **Analytics Dashboard** - Metrics and monitoring  
📋 **Production Deployment** - Live infrastructure  

**These are planned for future phases.**

---

## Getting Started

**If you want to help:**
1. Read [START-HERE.md](START-HERE.md) for quick demo
2. Check [CONTRIBUTING.md](CONTRIBUTING.md) to contribute
3. See [phasemap.md](phasemap.md) for detailed architecture

**For development/testing only:**
```bash
# Prerequisites: Node.js ≥ 20.0.0, pnpm ≥ 8.0.0
git clone https://github.com/your-org/credlink.git
cd credlink
pnpm install
pnpm build
pnpm test:acceptance  # Run test suite
open .artifacts/acceptance/report.html  # View results
```

---

## What It Will Look Like

⚠️ **Visual demos not yet available.**

**Expected user experience** (once built):

1. **Publisher signs image:**
   - Upload photo to CMS (WordPress, Shopify, etc.)
   - CredLink auto-signs in background
   - Publisher gets manifest URL: `https://manifests.credlink.com/sha256:abc...`

2. **Image circulates the internet:**
   - Shared on social media 1,000+ times
   - Compressed by CDNs
   - Metadata stripped
   - **Proof survives** via manifest URL

3. **Viewer verifies authenticity:**
   - Sees verification badge on image
   - Clicks badge → modal opens
   - Shows: ✓ Creator, ✓ Timestamp, ✓ Edit history
   - Or shows: ❌ NOT VERIFIED (no proof found)

**Visual demos coming soon:**
- 📹 30-second GIF of full flow
- 📸 Badge on product page
- 📸 Verification modal
- 📸 Admin dashboard

For now, see [Component Status Table](#implementation-status) for what's actually built.

---

### API Overview (Planned)

⚠️ **These endpoints don't exist yet.** See [docs/API.md](docs/API.md) (in progress)

**Planned: Sign an image**
```javascript
// NOT YET IMPLEMENTED
POST /sign
Input: image URL or upload
Output: manifest_url (proof of authenticity)

// Pseudocode example:
const response = await fetch('https://api.credlink.com/sign', {
  method: 'POST',
  body: formData  // image file + metadata
});
// Response: { manifest_url, survival_rate, created_at }
```

**Planned: Verify an image**
```javascript
// NOT YET IMPLEMENTED
POST /verify
Input: image URL or manifest URL
Output: valid (true/false), creator info, edit history

// Pseudocode example:
const response = await fetch('https://api.credlink.com/verify', {
  method: 'POST',
  body: JSON.stringify({ image_url: '...' })
});
// Response: { valid, creator, created_at, manifest_url, warnings }
```

### Integration Examples (Planned)

⚠️ **None of these exist yet. Planned for future release.**

**Planned: WordPress Plugin**
```bash
# NOT YET AVAILABLE
# Future: wp plugin install credlink
# Future: Configure with API key
# Future: Auto-sign images on upload
```

**Planned: Shopify App**
```bash
# NOT YET AVAILABLE
# Future: Install from Shopify App Store
# Future: Auto-sign product photos
# Future: Show verification badge on product pages
```

**Planned: JavaScript SDK**
```javascript
// NOT YET IMPLEMENTED
// Pseudocode for future SDK:
import { CredLink } from '@credlink/sdk';

const credlink = new CredLink({ apiKey: 'your-key' });

// Sign image (future)
const result = await credlink.sign({
  imageUrl: 'https://cdn.example.com/product.jpg',
  creator: 'seller@example.com',
  assertions: { ai_generated: false }
});

// Verify image (future)
const verification = await credlink.verify({
  imageUrl: 'https://cdn.example.com/product.jpg'
});
```

---

## Architecture: How It Actually Works

```
┌─────────────────────────────────────────────────────────┐
│                    CREDLINK SYSTEM                       │
└─────────────────────────────────────────────────────────┘

1. SIGNING LAYER (Your Image → Proof)
   ┌──────────────┐
   │ Your Image   │
   └──────┬───────┘
          │ Upload via API or plugin
          ▼
   ┌──────────────────────────┐
   │ Rust C2PA Signer         │  ← Signs with cryptographic key
   │ (production-grade)       │     Generates C2PA manifest
   └──────┬───────────────────┘
          │ manifest.cbor (signed metadata)
          ▼
   ┌──────────────────────────┐
   │ Cloudflare R2 Storage    │  ← Immutable, edge-distributed
   │ (hash-addressed)         │     Survives forever
   └──────┬───────────────────┘
          │ Returns: https://manifests.credlink.com/sha256:abc...
          ▼
   You get a manifest URL ← Share this with images

2. DELIVERY LAYER (Image Circulates)
   ┌─────────────────────────────────────────────────────┐
   │ Your image shared 1,000x                            │
   │ Compressed, optimized, CDN'd, metadata stripped...  │
   │ BUT: Manifest URL stays intact                      │
   └─────────────────────────────────────────────────────┘

3. VERIFICATION LAYER (Viewer Clicks "Verify")
   ┌──────────────┐
   │ Viewer sees  │
   │ image + URL  │
   └──────┬───────┘
          │ Browser makes request to manifest URL
          ▼
   ┌──────────────────────────┐
   │ Cloudflare Edge Worker   │  ← Injects Link header
   │ (policy enforcement)     │     Responds in <50ms globally
   └──────┬───────────────────┘
          │
          ▼
   ┌──────────────────────────┐
   │ C2PA Verification        │  ← Checks cryptographic signature
   │ (client-side or server)  │     Validates: creator, timestamp, edits
   └──────┬───────────────────┘
          │
          ▼
   ┌──────────────────────────┐
   │ Verify Badge             │  ← Shows proof or "NOT VERIFIED"
   │ (Chrome, Safari, Edge)   │     Links to edit history
   └──────────────────────────┘
```

### Why This Architecture Wins

1. **Remote-First**: Proof lives on Cloudflare edge, not in image metadata
   - CDNs can't strip what's not in the file
   - Works globally with <50ms latency

2. **Immutable**: Manifests are hash-addressed, never change
   - Once signed, proof can't be tampered with
   - New content gets new hash

3. **No Network Effect**: Doesn't require both parties on platform
   - Viewer doesn't need CredLink account
   - Works with any image URL

4. **Standards-Based**: Uses C2PA (Content Credentials)
   - Industry standard backed by Adobe, Google, Twitter
   - Future-proof

---

## What Gets Tested (Hostile-Path Matrix)

We don't trust CDNs. We test real-world hostile scenarios:

| Scenario | What Happens | Remote Survives? | Embed Survives? |
|----------|--------------|------------------|-----------------|
| **IMG_JPEG_Q75_STRIP** | Aggressive quality reduction | ✅ YES | ❌ NO |
| **IMG_CONVERT_WEBP** | Format conversion to WebP | ✅ YES | ❌ NO |
| **IMG_PRESERVE_EMBED_NOP** | Careful handling (preserve-embed sandbox) | ✅ YES | ✅ YES |
| **REMOTE_ONLY_BASELINE** | Strict remote-only policy | ✅ YES | ❌ NO |
| **CDN_METADATA_STRIP** | Imgix/Cloudinary optimization | ✅ YES | ❌ NO |

**The data is brutal**: Embedded proof dies in hostile environments. Remote proof survives everything.

See `/docs/hostile-path-matrix.yaml` for all 16+ scenarios.

---

## Project Structure (What Each Part Does)

```
credlink/
├── apps/
│   ├── edge-worker/          ← Cloudflare Worker (policy enforcement, <50ms global)
│   └── reportgen/            ← Generates HTML survival reports
│
├── packages/
│   ├── acceptance/           ← Hostile-path test harness (runs 16+ scenarios)
│   ├── policy/               ← Shared policy & feature flags
│   ├── utils/                ← Logging, HTTP helpers
│   └── c2pa-signer/          ← Rust C2PA signing (production-grade crypto)
│
├── sandboxes/
│   ├── strip-happy/          ← Aggressive optimizer simulation
│   ├── preserve-embed/       ← First-party controlled origin
│   └── remote-only/          ← Strict remote-only enforcement
│
├── docs/
│   ├── survival-doctrine.md  ← Philosophy & core principles
│   ├── hostile-path-matrix.yaml ← All test scenarios
│   └── api.md                ← Full API reference
│
├── infra/
│   ├── cloudflare/           ← Worker, R2, KMS config
│   └── terraform/            ← Infrastructure as code
│
└── scripts/
    ├── make-fixtures.sh      ← Create test images
    ├── run-sandboxes.sh      ← Start test environments
    └── report.sh             ← Generate survival report
```

---

## Core Principles (Read This If You Fork)

1. **Remote-First by Default**
   - All public images require hash-addressed remote manifests
   - Embed is "advisory" only (nice-to-have, not required)

2. **Hostile Optimizer Assumption**
   - CDNs and optimizers strip metadata until proven otherwise
   - Default behavior: assume worst-case

3. **Manifest Immutability**
   - Once published, manifests never change
   - New content = new hash-addressed manifest

4. **Provenance ≠ Truth**
   - We verify technical authenticity, not factual accuracy
   - We don't detect deepfakes—we prove legitimate images
   - Abuse policies and legal framework separate

5. **Ruthless Survival Targets**
   - Remote survival: ≥ 99.9%
   - Response time: < 600ms p95
   - Uptime: 99.9%

---

## Pricing

**Not available yet.** Pricing will be determined after:
1. Backend implementation (Phase 3)
2. Infrastructure deployment (Phase 4)  
3. Actual cost measurement (Phase 4)
4. Customer validation (Phase 5)

**Honest timeline for pricing:** 6-8 months minimum.

**Previous pricing ($199/$699/$2,499):** Made up. Removed. See APOLOGY.md (to be created).

---

## How to Actually Use This (Current State)

### What You Can Do Right Now:

1. **Run Architecture Tests:**
   ```bash
   pnpm install
   pnpm test:acceptance
   ```
   This tests the policy engine architecture (no backend needed).

2. **Explore the Frontend UI:**
   ```bash
   cd demo
   open gallery.html  # View in browser
   ```
   This shows the UI mockup only. Clicking "Sign" will error.

3. **Read the Architecture:**
   - See `/docs/` for architecture documentation
   - See `/docs/roadmap/` for honest development timeline

### What You CANNOT Do:
- ❌ Sign images (backend doesn't exist)
- ❌ Verify signatures (backend doesn't exist)
- ❌ Deploy to production (nothing to deploy)
- ❌ Use in production (not ready, unsafe)

### When Will It Work?

See [docs/roadmap/ROADMAP-OVERVIEW.md](docs/roadmap/ROADMAP-OVERVIEW.md) for detailed timeline.

**Shortest realistic path:** 6-12 months to production-ready system.

---

## Honest Development Timeline

We're building this properly, with no shortcuts:
- **Phase 1-2:** Honesty + Rebrand (2 weeks) ← IN PROGRESS
- **Phase 3:** Backend Implementation (4-8 weeks)
- **Phase 4:** Infrastructure Deployment (4-8 weeks)  
- **Phase 5:** Customer Validation (12-16 weeks)
- **Phase 6-10:** Enterprise Features & Excellence (12-18 months)

**Total: 18-30 months to world-class product.**

See full roadmap: [COMMERCIAL-ROADMAP.md](COMMERCIAL-ROADMAP.md)

---

## Installation & Deployment

### Development (What Actually Works)
```bash
# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run acceptance tests (this works!)
pnpm test:acceptance

# View test results
open .artifacts/acceptance/report.html
```

### Production Deployment

⚠️ **NOT READY FOR PRODUCTION**

The following deployment methods are **planned but not functional yet**:

**Planned: Self-Hosted**
```bash
# NOT YET WORKING
# Future: docker build -f Dockerfile -t credlink:latest .
# Future: terraform apply in /infra/terraform/
```

**Planned: Cloudflare**
```bash
# NOT YET WORKING
# Future: wrangler publish
# Future: wrangler secret put HMAC_SECRET
```

**Timeline**: No production deployment date set yet

---

## Configuration (Planned)

⚠️ **Most configuration options are not implemented yet.**

### Planned: Environment Variables
```bash
# NOT YET IMPLEMENTED
# Future configuration:
REMOTE_ONLY=1                          # Force remote manifests
PRESERVE_PATHS=/media/preserve/        # Paths allowing embeds
MANIFEST_BASE=https://manifests.credlink.com

HMAC_SECRET=your-256-bit-key          # Log signing secret
KMS_KEY_ID=arn:aws:kms:...            # Key encryption

CLOUDFLARE_ACCOUNT_ID=...
CLOUDFLARE_API_TOKEN=...
R2_BUCKET=credlink-manifests
```

### Planned: Policy Configuration
```json
// NOT YET IMPLEMENTED
// Future policy config:
{
  "remote_only": true,
  "preserve_paths": ["/media/preserve/"],
  "drop_if_link_missing": false,
  "break_glass_hosts": [],
  "allowed_ai_signers": ["openai", "anthropic", "midjourney"]
}
```

---

## Monitoring & Observability

### Key Metrics (What We Track)
```
Remote Survival Rate    → % of scenarios with successful manifest resolution
Embed Survival Rate     → Embed survival in preserve-embed environment
Hash Alignment Rate     → Successful manifest content verification
Response Latency        → End-to-end verification timing (target: <600ms p95)
Uptime                  → System availability (target: 99.9%)
```

### Structured Logs (All Signed)
```json
{
  "ts": "2025-11-06T14:05:21.123Z",
  "tenant_id": "newsroom-123",
  "asset_id": "sha256:abc123...",
  "manifest_hash": "sha256:def456...",
  "scenario_id": "IMG_JPEG_Q75_STRIP",
  "policy": "remote-only",
  "verdict": {
    "remote_survives": true,
    "embed_survives": false,
    "latency_ms": 245
  },
  "sig": "HMAC-SHA256(...)"
}
```

### Alerts (What Triggers Pages)
- **CRITICAL**: Remote survival < 99.9%
- **WARNING**: Embed survival < 95%
- **INFO**: Latency degradation or system health

---

## Security & Legal

### Threat Model (What We Defend Against)
| Threat | How We Stop It |
|--------|----------------|
| Cache Poisoning | Hash alignment verification |
| Header Stripping | Remote manifest fallback |
| Manifest Tampering | Immutable R2 storage, cryptographic signatures |
| Policy Bypass | CSP headers, audit logging, break-glass auditing |

### Data Retention
- **Logs**: 24 months (compliance requirement)
- **Manifests**: Forever (content never changes)
- **User data**: Deleted on request (GDPR compliant)

### Legal Framework
See `/legal/`:
- `terms-of-service.md` — Usage rights
- `privacy-policy.md` — Data handling
- `abuse-policy.md` — Prohibited uses (deepfakes, misinformation, revenge porn, etc.)
- `break-glass-protocol.md` — Emergency overrides

---

## Implementation Status

### Component Status Table

| Component | Status | Notes |
|-----------|--------|-------|
| **Architecture & Design** | ✅ Complete | Remote-first doctrine, hostile-path matrix |
| **Test Framework** | ✅ Complete | 16+ scenarios, acceptance harness |
| **Core C2PA Logic** | ✅ Complete | Sign/verify works in tests |
| **Monorepo Structure** | ✅ Complete | pnpm workspaces, reorganized folders |
| **CLI Tool** | ✅ Complete | Basic signing/verification |
| **SDKs (Python, Go, JS)** | ✅ Complete | Development versions |
| **Image Signing API** | ❌ Not Started | Production /sign endpoint needed |
| **Verification API** | ❌ Not Started | Production /verify endpoint needed |
| **Badge Web Component** | ❌ Not Started | Browser verification UI needed |
| **Cloudflare Infrastructure** | ❌ Not Started | Edge workers, R2 storage needed |
| **WordPress Plugin** | ❌ Not Started | CMS integration needed |
| **Shopify App** | ❌ Not Started | E-commerce integration needed |
| **Browser Extensions** | ❌ Not Started | Chrome, Safari, Edge needed |
| **Mobile SDKs** | ❌ Not Started | iOS, Android needed |
| **Analytics Dashboard** | ❌ Not Started | Metrics/monitoring needed |

**Legend**: ✅ Complete (works now) | ❌ Not Started (planned)

---

### Visual Proof of Concept

⚠️ **No demo visuals available yet.**

**Planned visuals** (not yet created):
- 📹 30-second demo GIF: sign → verify → badge flow
- 📸 Screenshot: Verification badge on product page
- 📸 Screenshot: Verification modal with metadata
- 📸 Screenshot: Admin dashboard

**Current state**: Text-based documentation only. Visual demos will be added once components are functional.

**Want to see it work?** Run the test suite:
```bash
pnpm test:acceptance
open .artifacts/acceptance/report.html
```

---

### Detailed Roadmap

### ✅ What Actually Works (~8% Complete - Architecture phase, backend 0%)
- [x] Monorepo structure with pnpm workspaces
- [x] Acceptance test framework
- [x] Hostile-path test scenarios (16+)
- [x] Development sandbox environments
- [x] Core C2PA signing/verification logic
- [x] HTML report generation for tests

### ⚠️ What's NOT Working Yet
- [ ] Production API endpoints
- [ ] Real infrastructure deployment
- [ ] Cloudflare Edge Worker (policy enforcement)
- [ ] Timestamp Authority integration
- [ ] Key management system
- [ ] All plugins (WordPress, Shopify, etc.)
- [ ] All SDKs (JavaScript, Python, etc.)
- [ ] Browser extensions
- [ ] Mobile SDKs
- [ ] Production monitoring/alerting

### 🚀 Next Steps
- [ ] Production-ready C2PA signer
- [ ] Live Cloudflare + R2 infrastructure
- [ ] Working API endpoints (/sign, /verify)
- [ ] Basic JavaScript SDK
- [ ] First beta customers

---

## Support & Community

⚠️ **Project is in alpha. No production support available yet.**

### For Developers
- **Docs**: Read `/docs/` directory (work in progress)
- **Issues**: GitHub issue tracker (for bugs/features)
- **Discussions**: GitHub discussions for Q&A

### Security Issues
- See [SECURITY.md](SECURITY.md) for security policy
- Email: security@credlink.com (when production-ready)

### Abuse Reports
- Not applicable yet (no production service)

---

## Contributing

We welcome contributions. See `CONTRIBUTING.md` for:
- Code style & standards
- Testing requirements
- PR process
- CLA (if applicable)

**Quick start for contributors:**
```bash
git checkout -b feat/your-feature
pnpm install
pnpm test:acceptance
# Make changes
git commit -m "feat: description"
git push origin feat/your-feature
# Open PR
```

---

## License

CredLink is [AGPLv3](LICENSE) with commercial licenses available.

- **Open Source**: Free for non-commercial use
- **Commercial**: Contact sales@credlink.com

---

## FAQs

### "Does this detect deepfakes?"
No. We don't use AI to detect fakes. Instead, we attach proof showing "This image was created by Person X on Date Y." If someone creates a deepfake, it won't have this proof. Users see "NOT VERIFIED" and know to be suspicious.

### "Why should companies use this?"
Three reasons:
1. **Regulatory**: EU AI Act requires image provenance
2. **Revenue**: Fewer chargebacks on verified photos = more profit
3. **Trust**: Customers trust you more when you prove authenticity

### "Can people fake the proof?"
No. We use HMAC-SHA256 cryptographic signatures (same tech banks use). Faking them requires breaking military-grade encryption—mathematically impossible.

### "What if someone's offline?"
Proof is embedded in image metadata. Offline, they see "Created by John Smith on Jan 1, 2025." They just can't verify it's legitimate without internet.

### "How is this different from blockchain?"
Blockchain requires everyone on the same chain. We use Cloudflare's edge network (already serving 60% of internet traffic). No blockchain needed, works everywhere.

---

## Contact

⚠️ **Alpha project - no official website/social media yet**

- **GitHub**: This repository
- **Email**: TBD
- **Website**: In development

---

**Version**: 0.1.0 (Phase 0)
**Status**: 🚧 In Development
**Last Updated**: Nov 6, 2025

> *"Provenance proves authenticity. Authenticity builds trust."*
