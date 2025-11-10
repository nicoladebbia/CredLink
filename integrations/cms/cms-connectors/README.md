# CredLink CMS Connectors

🔐 **Universal C2PA integration for popular CMS platforms**

CredLink provides seamless Content Authenticity Initiative (C2PA) integration for major Content Management Systems and Static Site Generators. Enable provenance tracking, content verification, and tamper-evident signing across your digital content ecosystem.

## 🚀 Quick Start

```bash
# Install the universal connector
npm install @c2concierge/cms-connectors

# Or use platform-specific packages
npm install @c2concierge/drupal-connector
npm install @c2concierge/webflow-connector
npm install @c2concierge/squarespace-connector
npm install @c2concierge/ghost-connector
npm install @c2concierge/ssg-connector
```

## 📋 Supported Platforms

| Platform | Integration Type | HTTP Link Headers | Badges | Webhooks | Status |
|----------|------------------|-------------------|--------|----------|---------|
| **Drupal** | Module + Event Subscriber | ✅ | ✅ | ✅ | ✅ Complete |
| **Webflow** | Code Injection + Head Script | ❌ | ✅ | ✅ | ✅ Complete |
| **Squarespace** | Code Injection + Commerce | ❌ | ✅ | ✅ | ✅ Complete |
| **Ghost** | Theme Partial + Code Injection | ❌ | ✅ | ✅ | ✅ Complete |
| **SSG** | CLI Tool + Edge Middleware | ✅ | ✅ | ❌ | ✅ Complete |
| **Next.js** | Vercel Middleware | ✅ | ✅ | ❌ | ✅ Complete |
| **Hugo/Jekyll** | CLI + Edge Workers | ✅ | ✅ | ❌ | ✅ Complete |

## 🏗️ Architecture

```
packages/cms-connectors/
├── shared/                 # Shared components
│   ├── base-connector.js  # Base connector class
│   ├── c2-badge.js        # Universal badge system
│   └── package.json
├── drupal/                # Drupal 9/10 module
│   ├── src/               # PHP source code
│   ├── *.yml             # Configuration files
│   └── package.json
├── webflow/               # Webflow connector
│   ├── connector-webflow.js
│   ├── webhook-server.js
│   └── package.json
├── squarespace/           # Squarespace connector
│   ├── connector-squarespace.js
│   ├── commerce-webhook.js
│   └── package.json
├── ghost/                 # Ghost connector
│   ├── connector-ghost.hbs
│   ├── ghost-connector.js
│   ├── ghost-webhook.js
│   └── package.json
├── ssg/                   # Static Site Generator
│   ├── cli/               # Command-line tools
│   ├── edge/              # Edge recipes
│   └── package.json
├── edge/                  # Universal edge connectors
│   ├── cloudflare-worker.js
│   ├── vercel-middleware.js
│   └── package.json
└── tests/                 # Acceptance tests
    ├── acceptance/
    ├── fixtures/
    └── package.json
```

## 🔧 Installation Guides

### Drupal Module

1. **Download the module**
   ```bash
   cd /path/to/drupal/modules/contrib
   git clone https://github.com/Nickiller04/CredLink.git c2c_c2pa
   ```

2. **Install via Drush**
   ```bash
   drush en c2c_c2pa -y
   drush config:set c2c_c2pa.settings sign_url "https://verify.c2concierge.org/sign"
   ```

3. **Configure permissions**
   - Navigate to `/admin/people/permissions`
   - Grant "Administer CredLink" to appropriate roles

4. **Test integration**
   ```bash
   drush cron
   drush c2c:test
   ```

### Webflow Integration

1. **Add Header Code**
   ```html
   <!-- Webflow Settings → SEO → Header Code -->
   <script>
     window.C2C_WEBFLOW_CONFIG = {
       platform: 'webflow',
       manifestHost: 'https://manifests.c2concierge.org',
       webhookUrl: 'https://verify.c2concierge.org/webflow-hook'
     };
   </script>
   <script src="https://cdn.c2concierge.org/webflow-connector.js" async></script>
   ```

2. **Add Footer Code**
   ```html
   <!-- Webflow Settings → SEO → Footer Code -->
   <script src="https://cdn.c2concierge.org/c2-badge.js" async></script>
   ```

3. **Configure Webhooks**
   - Site Settings → Integrations → Webhooks
   - Add webhook: `https://verify.c2concierge.org/webflow-hook`
   - Events: Site Published, Collection Item Created

### Squarespace Integration

1. **Add Header Code**
   ```html
   <!-- Settings → Advanced → Code Injection → Header -->
   <script>
     window.C2C_SQUARESPACE_CONFIG = {
       platform: 'squarespace',
       manifestHost: 'https://manifests.c2concierge.org',
       enableTelemetry: true
     };
   </script>
   ```

2. **Add Footer Code**
   ```html
   <!-- Settings → Advanced → Code Injection → Footer -->
   <script src="https://cdn.c2concierge.org/squarespace-connector.js" async></script>
   <script src="https://cdn.c2concierge.org/c2-badge.js" async></script>
   ```

3. **Commerce Webhooks** (Commerce plans only)
   - Commerce Settings → API & Webhooks
   - Add webhook: `https://verify.c2concierge.org/squarespace-hook`

### Ghost Integration

**Option 1: Theme Integration (Recommended)**

1. **Add theme partial**
   ```bash
   # Copy to your theme directory
   cp connector-ghost.hbs themes/your-theme/partials/
   ```

2. **Modify default.hbs**
   ```handlebars
   {{> head}}
   {{> connector-ghost}}
   {{> body}}
   ```

3. **Configure theme settings**
   - Ghost Admin → Settings → Design → Theme
   - Add custom theme settings for C2PA configuration

**Option 2: Code Injection**

1. **Site Header**
   ```html
   <script>
     window.C2C_GHOST_CONFIG = {
       platform: 'ghost',
       manifestHost: 'https://manifests.c2concierge.org',
       siteUrl: '{{@site.url}}'
     };
   </script>
   <script src="https://cdn.c2concierge.org/ghost-connector.js" async></script>
   ```

2. **Site Footer**
   ```html
   <script src="https://cdn.c2concierge.org/c2-badge.js" async></script>
   ```

### Static Site Generators

1. **Install CLI tool**
   ```bash
   npm install -g @c2concierge/ssg-connector
   ```

2. **Add to build process**
   ```json
   // package.json
   {
     "scripts": {
       "build": "next build && c2c-ssg-sign ./out",
       "build:hugo": "hugo && c2c-ssg-sign ./public",
       "build:jekyll": "jekyll build && c2c-ssg-sign ./_site"
     }
   }
   ```

3. **Edge deployment**
   ```javascript
   // Vercel (middleware.js)
   import { middleware } from '@c2concierge/edge-connectors';
   export { middleware, config };
   
   // Cloudflare (worker.js)
   import C2CWorker from '@c2concierge/edge-connectors/cloudflare-worker';
   export default C2CWorker;
   ```

## ⚙️ Configuration

### Universal Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `signUrl` | `https://verify.c2concierge.org/sign` | Asset signing service |
| `manifestHost` | `https://manifests.c2concierge.org` | Manifest storage host |
| `analyticsUrl` | `https://analytics.c2concierge.org/telemetry` | Telemetry endpoint |
| `enableTelemetry` | `true` | Enable usage analytics |
| `badgePosition` | `bottom-right` | Badge positioning |
| `badgeStyle` | `default` | Badge appearance |

### Platform-Specific Settings

#### Drupal
```php
// settings.php or configuration UI
$config['c2c_c2pa.settings']['sign_url'] = 'https://verify.c2concierge.org/sign';
$config['c2c_c2pa.settings']['webhook_secret'] = 'your-webhook-secret';
$config['c2c_c2pa.settings']['enable_telemetry'] = true;
```

#### Webflow
```javascript
window.C2C_WEBFLOW_CONFIG = {
  platform: 'webflow',
  signUrl: 'https://verify.c2concierge.org/sign',
  manifestHost: 'https://manifests.c2concierge.org',
  badgePosition: 'bottom-right',
  enableTelemetry: true
};
```

## 🔍 Discovery Mechanisms

### HTTP Link Headers (Preferred)
```http
Link: <https://manifests.c2concierge.org/drupal/abc123.c2pa>; rel="c2pa-manifest"
```

### HTML Link Elements (Fallback)
```html
<link rel="c2pa-manifest" href="https://manifests.c2concierge.org/webflow/def456.c2pa">
```

### Data Attributes (Client-side)
```html
<img src="image.jpg" data-c2pa-manifest="https://manifests.c2concierge.org/ghi789.c2pa">
```

### Sidecar Files (Static Sites)
```
image.jpg
image.jpg.c2pa  # Manifest file
```

## 🏅 Badge System

### Universal Badge Features
- **Automatic discovery** of C2PA manifests
- **Platform detection** and adaptation
- **Responsive design** for all screen sizes
- **Accessibility support** (ARIA labels, keyboard navigation)
- **Verification modal** with detailed provenance info
- **Customizable styling** and positioning

### Badge States
| State | Color | Meaning |
|-------|-------|---------|
| ✅ Verified | Green | Manifest validated successfully |
| ❌ Unverified | Red | Manifest validation failed |
| ❓ Unknown | Yellow | Verification unavailable |
| ⏳ Loading | Gray | Checking manifest status |

### Customization
```javascript
window.C2C_BADGE_CONFIG = {
  badgePosition: 'top-left',      // top-left, top-right, bottom-left, bottom-right
  badgeStyle: 'prominent',        // default, minimal, prominent
  enableTelemetry: false,         // Disable analytics
  autoDiscover: true,             // Auto-find manifests
  debug: true                     // Enable debug logging
};
```

## 🔄 Webhook Integration

### Supported Events

#### Webflow
- `site_publish` - Site published
- `collection_item_created` - New content added
- `collection_item_updated` - Content modified
- `collection_item_deleted` - Content removed

#### Squarespace
- `order.created` - New order
- `order.updated` - Order modified
- `product.created` - New product
- `product.updated` - Product modified
- `variant.created` - New product variant

#### Ghost
- `post.added` - New post
- `post.edited` - Post modified
- `post.published` - Post published
- `page.added` - New page
- `page.edited` - Page modified

#### Drupal
- `entity_insert` - New content created
- `entity_update` - Content updated
- `media_insert` - New media uploaded
- `cron` - Periodic processing

### Webhook Payload Format
```json
{
  "event": "post.published",
  "timestamp": "2024-01-15T10:30:00Z",
  "platform": "ghost",
  "data": {
    "id": "post-123",
    "title": "Sample Post",
    "url": "https://example.com/sample-post",
    "images": [
      "https://example.com/content/images/2024/01/sample.jpg"
    ]
  }
}
```

## 🧪 Testing

### Acceptance Tests
```bash
# Install test dependencies
cd packages/cms-connectors/tests
npm install

# Run all tests
npm run test

# Run specific platform tests
npm run test:drupal
npm run test:webflow

# Run tests in parallel
npm run test:parallel

# Run tests in headed mode (for debugging)
npm run test:headed
```

### Manual Testing Checklist

#### Drupal
- [ ] Module installs without errors
- [ ] Configuration forms work
- [ ] Event subscriber injects headers
- [ ] Media upload triggers signing
- [ ] Cron processes retroactive content
- [ ] Badge displays on media pages
- [ ] Webhook endpoint responds

#### Webflow
- [ ] Header code loads configuration
- [ ] Badge script initializes
- [ ] Images get badges applied
- [ ] Verification modal opens
- [ ] Webhook events processed
- [ ] Responsive design works

#### Squarespace
- [ ] Code injection works
- [ ] Commerce webhooks configured
- [ ] Product images signed
- [ ] Badge displays correctly
- [ ] Mobile responsive

#### Ghost
- [ ] Theme partial renders
- [ ] Code injection works
- [ ] Post images signed
- [ ] Webhook events handled
- [ ] Badge positioning correct

#### SSG
- [ ] CLI tool processes images
- [ ] Manifest files generated
- [ ] HTML links injected
- [ ] Edge headers added
- [ ] Build process integrated

## 🚀 Deployment

### Production Considerations

#### Security
- **HTTPS required** for all endpoints
- **Webhook secrets** for event verification
- **CORS headers** properly configured
- **Content Security Policy** includes C2PA domains

#### Performance
- **Edge caching** for manifest files
- **Lazy loading** of badge scripts
- **Optimized image signing** workflow
- **Telemetry sampling** in production

#### Monitoring
- **Health check endpoints** for webhooks
- **Error tracking** for signing failures
- **Analytics dashboard** for usage metrics
- **Log aggregation** for debugging

### Environment Variables

```bash
# Signing Service
C2C_SIGN_URL=https://verify.c2concierge.org/sign
C2C_MANIFEST_HOST=https://manifests.c2concierge.org

# Analytics
C2C_ANALYTICS_URL=https://analytics.c2concierge.org/telemetry
C2C_ENABLE_TELEMETRY=true

# Webhook Security
WEBFLOW_WEBHOOK_SECRET=your-webflow-secret
SQUARESPACE_WEBHOOK_SECRET=your-squarespace-secret
GHOST_WEBHOOK_SECRET=your-ghost-secret
DRUPAL_WEBHOOK_SECRET=your-drupal-secret

# Edge Configuration
MANIFEST_HOST=https://manifests.c2concierge.org
ENABLE_TELEMETRY=false
DEBUG=false
```

## 📚 API Reference

### Base Connector Class

```javascript
import BaseConnector from '@c2concierge/shared/base-connector';

class MyConnector extends BaseConnector {
  constructor(config) {
    super({
      platform: 'my-platform',
      ...config
    });
  }
  
  async processAsset(imageUrl) {
    return await this.signAsset(imageUrl, {
      platform: 'my-platform',
      timestamp: new Date().toISOString()
    });
  }
}
```

### Badge System

```javascript
import C2CBadge from '@c2concierge/shared/c2-badge';

// Initialize with custom config
const badge = new C2CBadge({
  badgePosition: 'top-left',
  badgeStyle: 'prominent',
  enableTelemetry: false
});

// Manual badge addition
badge.addBadgeToImage(imageElement, manifestUrl);

// Show verification modal
badge.showVerificationModal(manifestUrl, imageElement);
```

### CLI Tool

```bash
# Basic usage
c2c-ssg-sign ./public

# Advanced options
c2c-ssg-sign ./out \
  --manifest-host "https://my-manifests.com" \
  --concurrency 10 \
  --exclude-patterns "**/*.min.*" \
  --dry-run

# Configuration file
c2c-ssg-sign --config ./c2c.config.js
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone repository
git clone https://github.com/Nickiller04/CredLink.git
cd CredLink/packages/cms-connectors

# Install dependencies
npm install

# Run tests
npm test

# Build all packages
npm run build

# Run development servers
npm run dev:drupal
npm run dev:webflow
npm run dev:edge
```

### Code Standards

- **ESLint** for JavaScript linting
- **Prettier** for code formatting
- **TypeScript** types where applicable
- **Unit tests** for all functions
- **Acceptance tests** for integrations

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: [docs.c2concierge.org](https://docs.c2concierge.org)
- **Issues**: [GitHub Issues](https://github.com/Nickiller04/CredLink/issues)
- **Discussions**: [GitHub Discussions](https://github.com/Nickiller04/CredLink/discussions)
- **Email**: support@c2concierge.org

## 🔗 Related Projects

- **[CredLink Core](https://github.com/Nickiller04/CredLink)** - Core signing and verification services
- **[CredLink SDK](https://github.com/Nickiller04/CredLink-sdk)** - JavaScript/TypeScript SDK
- **[CredLink CLI](https://github.com/Nickiller04/CredLink-cli)** - Command-line tools

---

**Built with ❤️ by the CredLink team**

*Enabling trustworthy content across the web*
