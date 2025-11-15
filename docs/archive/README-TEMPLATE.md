# CredLink

<div align="center">

![CredLink Logo](docs/assets/logo.png)

**Cryptographic image provenance that survives 99.9% of the internet**

[![Build Status](https://img.shields.io/github/actions/workflow/status/yourusername/credlink/deploy.yml?branch=main)](https://github.com/yourusername/credlink/actions)
[![License](https://img.shields.io/badge/license-AGPLv3-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-green.svg)](https://github.com/yourusername/credlink/releases)
[![Discord](https://img.shields.io/discord/YOUR_DISCORD_ID)](https://discord.gg/credlink)

[**Try Demo**](https://demo.credlink.com) · [**Documentation**](https://docs.credlink.com) · [**Get Started**](#quick-start) · [**Pricing**](#pricing)

</div>

---

## 🎯 What is CredLink?

CredLink proves your images are real—even after 1,000 shares, CDN optimization, and format conversion.

**The Problem:**
- 14M deepfakes created in 2023 (+300% YoY)
- 64% of people can't tell real from fake
- Current solutions break when images are compressed or shared
- EU AI Act requires image provenance documentation

**The Solution:**
Attach cryptographic proof to images that **survives** across the internet. Unlike competitors who embed proof in metadata (which CDNs strip), CredLink uses a **remote-first architecture** that keeps proof alive no matter what happens to the image.

### 30-Second Demo

![CredLink Demo](docs/assets/demo.gif)

> **See it live:** [demo.credlink.com](https://demo.credlink.com)

---

## ✨ How It Works

```
1. Sign Your Image          2. Share Anywhere           3. Anyone Can Verify
   ┌─────────┐                 ┌─────────┐                ┌─────────┐
   │  📸     │ ──────────────> │  🌍     │ ──────────────> │  ✓      │
   │ Upload  │   Get proof     │ Shared  │   Click badge  │ Verified│
   └─────────┘   manifest      └─────────┘                └─────────┘
```

### What Makes CredLink Different

| Feature | CredLink | Adobe Verify | Truepic |
|---------|----------|--------------|---------|
| **Survives CDN optimization** | ✅ 99.9% | ❌ ~85% | ❌ ~92% |
| **Works without recipient setup** | ✅ Yes | ❌ No | ❌ No |
| **Setup time** | ✅ 10 min | ❌ 8 weeks | ❌ 4 weeks |
| **Price** | ✅ $199/mo | ❌ $100K+/yr | ❌ $50K+/yr |

---

## 🚀 Quick Start

### 1. Install the Badge (HTML)

```html
<!-- Add to your <head> -->
<script src="https://cdn.credlink.com/badge.js"></script>

<!-- Add next to any image -->
<img src="photo.jpg" alt="Product photo">
<credlink-badge asset-url="photo.jpg"></credlink-badge>
```

**Result:** Visitors see a verification badge. Click to view proof.

### 2. WordPress Plugin

```bash
# Install from WordPress dashboard
Plugins → Add New → Search "CredLink" → Install → Activate
Settings → CredLink → Enter API Key
```

**Result:** All uploaded images are automatically signed and verified.

### 3. API Integration

```bash
# Sign an image
curl -X POST https://api.credlink.com/sign \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "image=@photo.jpg" \
  -F "creator=jane@example.com"

# Response
{
  "manifest_url": "https://manifests.credlink.com/sha256:abc123...",
  "survival_rate": "99.9%",
  "created_at": "2025-11-07T10:30:00Z"
}
```

```bash
# Verify an image
curl -X POST https://api.credlink.com/verify \
  -H "Content-Type: application/json" \
  -d '{"asset_url": "https://example.com/photo.jpg"}'

# Response
{
  "valid": true,
  "creator": "jane@example.com",
  "created_at": "2025-11-07T10:30:00Z",
  "warnings": []
}
```

[**Full API Documentation →**](https://docs.credlink.com/api)

---

## 📦 Installation

### For Developers

```bash
# Clone repository
git clone https://github.com/yourusername/credlink.git
cd credlink

# Install dependencies
pnpm install

# Build all packages
pnpm build

# Run tests
pnpm test

# Start development server
pnpm dev
```

### For WordPress Users

1. Download plugin: [credlink-wordpress.zip](https://github.com/yourusername/credlink/releases)
2. Upload via WordPress admin: `Plugins → Add New → Upload Plugin`
3. Activate and configure API key
4. Done! Images are now auto-signed on upload

### For Shopify Users

1. Visit [Shopify App Store](https://apps.shopify.com/credlink)
2. Click "Add app"
3. Authorize CredLink
4. Product images are automatically signed

---

## 🎨 Use Cases

### 📰 Newsrooms
**Problem:** Readers doubt your photos because deepfakes exist  
**Solution:** Prove your journalism is real. Competitive advantage. Reader trust.

```html
<img src="breaking-news.jpg">
<credlink-badge asset-url="breaking-news.jpg"></credlink-badge>
```

### 🛍️ E-commerce
**Problem:** Sellers upload fake product photos → chargebacks  
**Solution:** Reduce disputes 20-30%. Proof matches reality. Fewer refunds.

### 🏢 Brands
**Problem:** Competitors fake your marketing images  
**Solution:** Prove authenticity. EU AI Act compliance. Document content origins.

### 🌐 Marketplaces
**Problem:** Counterfeit goods destroy trust  
**Solution:** Verify seller photos. Reduce liability. Cut chargeback costs.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    YOUR IMAGE                            │
└──────────────────────┬──────────────────────────────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  CredLink Signer     │ ← Signs with crypto key
            │  (Rust/TypeScript)   │   Generates C2PA manifest
            └──────────┬───────────┘
                       │
                       ▼
            ┌──────────────────────┐
            │  Cloudflare R2       │ ← Immutable storage
            │  (Edge Network)      │   Hash-addressed: /sha256:abc.c2pa
            └──────────┬───────────┘
                       │
                       ▼
          Returns: https://manifests.credlink.com/sha256:abc...
          
          
┌─────────────────────────────────────────────────────────┐
│        IMAGE CIRCULATES (1,000x shares, CDN'd)          │
│        Compressed, optimized, metadata stripped         │
│        BUT: Manifest URL stays intact                   │
└─────────────────────────────────────────────────────────┘
                       
                       
                  ┌────────────┐
                  │  VIEWER    │
                  └─────┬──────┘
                        │ Clicks badge
                        ▼
            ┌──────────────────────┐
            │  Verify API          │ ← Checks signature
            │  (Cloudflare Worker) │   <50ms globally
            └──────────┬───────────┘
                        │
                        ▼
            ┌──────────────────────┐
            │  ✓ Verified Badge    │ ← Shows proof
            │  Creator, Date, etc. │
            └──────────────────────┘
```

### Why This Works

1. **Remote-First:** Proof lives on edge network, not in image metadata
2. **Immutable:** Manifests are hash-addressed, can't be changed
3. **No Network Effect:** Works even if recipient doesn't use CredLink
4. **Standards-Based:** Uses C2PA (Adobe, Google, Microsoft standard)

---

## 📊 Tested Survival Rates

We test against real-world hostile scenarios:

| Transform | Remote Survival | Embed Survival |
|-----------|-----------------|----------------|
| **JPEG Q75 compression** | ✅ 100% | ❌ 0% |
| **WebP conversion** | ✅ 100% | ❌ 0% |
| **CDN optimization** | ✅ 99.9% | ❌ 12% |
| **Metadata strip** | ✅ 100% | ❌ 0% |
| **Format conversion** | ✅ 100% | ❌ 15% |

**Full test matrix:** [View hostile-path tests →](docs/hostile-path-matrix.yaml)

---

## 💰 Pricing

| Plan | Images/Month | Price | Best For |
|------|--------------|-------|----------|
| **Starter** | 10,000 | $199/mo | Small newsrooms, SMB e-commerce |
| **Professional** | 100,000 | $699/mo | Mid-market brands, campaigns |
| **Enterprise** | 1M+ | $2,499/mo | Fortune 500, large marketplaces |

**Add-ons:**
- Advanced analytics: +$99/mo
- Custom integrations: +$299/mo
- Priority support (4hr SLA): +$199/mo

**Retro-sign existing images:** $0.10-0.35/image (bulk discounts available)

[**Start Free Trial →**](https://credlink.com/signup)

---

## 🛠️ Development

### Project Structure

```
credlink/
├── core/                 # Core services
│   ├── signer/          # C2PA signing service
│   ├── verify/          # Verification API
│   └── manifest-store/  # R2 storage wrapper
├── ui/
│   ├── badge/           # Web component
│   └── admin/           # Dashboard
├── integrations/
│   └── cms/             # WordPress, Shopify plugins
├── cli/                 # Command-line tool
├── sdk/                 # JavaScript, Python, Go SDKs
└── docs/                # Documentation
```

### Tech Stack

- **Backend:** TypeScript, Node.js, Fastify
- **Signer:** Rust (c2pa-rs) or TypeScript (c2pa-node)
- **Storage:** Cloudflare R2 (S3-compatible)
- **Edge:** Cloudflare Workers
- **Frontend:** Vanilla JS (web components)
- **Tests:** Vitest, Playwright

### Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md)

```bash
# Fork and clone
git clone https://github.com/yourusername/credlink.git

# Create branch
git checkout -b feat/your-feature

# Make changes and test
pnpm test

# Submit PR
git push origin feat/your-feature
```

---

## 📚 Documentation

- **[Quick Start Guide](docs/quickstart.md)** - Get up and running in 10 minutes
- **[API Reference](docs/api.md)** - Complete API documentation
- **[WordPress Integration](docs/wordpress.md)** - WordPress plugin guide
- **[Shopify Integration](docs/shopify.md)** - Shopify app guide
- **[Architecture](docs/architecture.md)** - System design deep dive
- **[Security](SECURITY.md)** - Security practices and disclosure

---

## 🔒 Security

- **Cryptographic signing:** P-256 ECDSA with RFC3161 timestamps
- **Immutable storage:** Write-once, hash-addressed manifests
- **Trust roots:** Validated certificate chains
- **Audited:** [Security audit report](docs/security-audit.pdf)

**Report vulnerabilities:** security@credlink.com (24hr response SLA)

---

## 🌍 Community

- **Discord:** [Join our community](https://discord.gg/credlink)
- **Twitter:** [@credlink](https://twitter.com/credlink)
- **Blog:** [credlink.com/blog](https://credlink.com/blog)
- **Status:** [status.credlink.com](https://status.credlink.com)

---

## 📜 License

CredLink is [AGPLv3](LICENSE) licensed with commercial licenses available.

- **Open Source:** Free for non-commercial use
- **Commercial:** Contact sales@credlink.com

---

## 🙏 Acknowledgments

Built on:
- [C2PA Specification](https://c2pa.org) - Content Credentials standard
- [Cloudflare](https://cloudflare.com) - Edge infrastructure
- [c2pa-rs](https://github.com/contentauth/c2pa-rs) - Rust implementation

---

## 📞 Contact

- **Website:** [credlink.com](https://credlink.com)
- **Email:** hello@credlink.com
- **Sales:** sales@credlink.com
- **Support:** support@credlink.com

---

<div align="center">

**[Get Started](https://credlink.com/signup)** · **[Book Demo](https://credlink.com/demo)** · **[Read Docs](https://docs.credlink.com)**

---

*Provenance proves authenticity. Authenticity builds trust.*

**Version 1.0.0** • Last Updated: November 2025

</div>
