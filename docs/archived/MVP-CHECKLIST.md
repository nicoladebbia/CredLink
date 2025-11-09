# CredLink MVP Checklist
## Minimum Viable Product - 4 Week Sprint

**Goal:** Ship a working product that can sign, store, and verify 1 image end-to-end.

---

## Week 1: Foundation & Cleanup

### Day 1-2: Repository Cleanup ✅
- [ ] Run `bash scripts/rename-branding.sh` to rename CredLink → credlink
- [ ] Run `bash scripts/reorganize.sh` to restructure folders
- [ ] Update `package.json` workspaces to new structure
- [ ] Run `pnpm install` and fix any broken imports
- [ ] Delete `node_modules` and `pnpm-lock.yaml`, reinstall fresh
- [ ] Commit: "chore: repository restructure and rebranding"

### Day 3-4: Core Infrastructure Setup
- [ ] Sign up for Cloudflare account
- [ ] Create R2 bucket: `credlink-manifests`
- [ ] Set up domain: `credlink.com` (or use `.dev` for testing)
- [ ] Configure DNS:
  - `manifests.credlink.com` → R2
  - `api.credlink.com` → Cloudflare Worker
- [ ] Generate KMS key for signing (Cloudflare KMS or AWS KMS)
- [ ] Set up `.env` file with secrets

### Day 5-7: Development Environment
- [ ] Set up local development with:
  - Cloudflare Wrangler CLI
  - Docker (for local services)
  - PostgreSQL (for metadata)
- [ ] Create `docker-compose.yml` for local stack
- [ ] Test: Can you deploy a "Hello World" to Cloudflare Worker?
- [ ] Commit: "chore: development environment setup"

---

## Week 2: Core Signing Pipeline

### Day 8-10: Implement Signer Service
**File:** `core/signer/src/index.ts`

```typescript
import { createHash } from 'crypto';

export async function signAsset(params: {
  assetBuffer: Buffer;
  creator: string;
}): Promise<{
  manifestUrl: string;
  manifestHash: string;
}> {
  // 1. Generate manifest hash
  const hash = createHash('sha256')
    .update(assetBuffer)
    .digest('hex');
  
  // 2. Create C2PA manifest (using c2pa-node)
  const manifest = await createManifest({
    asset: assetBuffer,
    creator: params.creator,
    assertions: {
      created: new Date().toISOString()
    }
  });
  
  // 3. Sign manifest
  const signedManifest = await signWithKMS(manifest);
  
  // 4. Upload to R2
  const manifestUrl = await uploadToR2(signedManifest, hash);
  
  return {
    manifestUrl,
    manifestHash: hash
  };
}
```

**Tasks:**
- [ ] Install `c2pa-node` package
- [ ] Implement `createManifest()` function
- [ ] Implement `signWithKMS()` using Cloudflare KMS
- [ ] Test with a sample JPEG image
- [ ] Verify manifest is valid C2PA format

### Day 11-12: Implement Manifest Store
**File:** `core/manifest-store/src/index.ts`

```typescript
import { R2Bucket } from '@cloudflare/workers-types';

export async function uploadToR2(
  manifest: Buffer,
  hash: string
): Promise<string> {
  const key = `${hash}.c2pa`;
  
  // Upload to R2
  await env.MANIFESTS.put(key, manifest, {
    httpMetadata: {
      contentType: 'application/cbor',
      cacheControl: 'public, max-age=31536000, immutable'
    }
  });
  
  return `https://manifests.credlink.com/${key}`;
}

export async function getManifest(hash: string): Promise<Buffer | null> {
  const key = `${hash}.c2pa`;
  const object = await env.MANIFESTS.get(key);
  
  if (!object) return null;
  
  return Buffer.from(await object.arrayBuffer());
}
```

**Tasks:**
- [ ] Create Cloudflare Worker for R2 access
- [ ] Implement upload endpoint: `PUT /manifests/:hash`
- [ ] Implement fetch endpoint: `GET /manifests/:hash`
- [ ] Add hash verification (ensure hash matches content)
- [ ] Test: Upload a manifest, retrieve it, verify hash

### Day 13-14: Sign API Endpoint
**File:** `core/signer/api.ts`

```typescript
import { Hono } from 'hono';

const app = new Hono();

app.post('/sign', async (c) => {
  const { assetUrl, creator } = await c.req.json();
  
  // Fetch asset
  const response = await fetch(assetUrl);
  const assetBuffer = Buffer.from(await response.arrayBuffer());
  
  // Sign it
  const result = await signAsset({
    assetBuffer,
    creator
  });
  
  return c.json(result);
});

export default app;
```

**Tasks:**
- [ ] Create API using Hono (lightweight framework)
- [ ] Deploy to Cloudflare Workers
- [ ] Add authentication (API key validation)
- [ ] Add rate limiting
- [ ] Test: `curl -X POST https://api.credlink.com/sign -d '{"assetUrl":"...","creator":"..."}'`

**Milestone:** ✅ You can sign an image and get a manifest URL back

---

## Week 3: Verification Pipeline

### Day 15-17: Implement Verify Service
**File:** `core/verify/src/index.ts`

```typescript
export async function verifyAsset(params: {
  assetUrl?: string;
  manifestUrl?: string;
}): Promise<VerificationResult> {
  let manifestUrl = params.manifestUrl;
  
  // 1. Discover manifest if not provided
  if (!manifestUrl && params.assetUrl) {
    manifestUrl = await discoverManifest(params.assetUrl);
  }
  
  if (!manifestUrl) {
    return {
      valid: false,
      error: 'No manifest found'
    };
  }
  
  // 2. Fetch manifest
  const manifest = await fetchManifest(manifestUrl);
  
  // 3. Verify signature
  const isValid = await verifySignature(manifest);
  
  // 4. Parse assertions
  const assertions = parseAssertions(manifest);
  
  return {
    valid: isValid,
    creator: assertions.creator,
    createdAt: assertions.createdAt,
    manifestUrl
  };
}
```

**Tasks:**
- [ ] Implement `discoverManifest()` - check Link headers
- [ ] Implement `fetchManifest()` - fetch from R2
- [ ] Implement `verifySignature()` - C2PA signature validation
- [ ] Implement `parseAssertions()` - extract metadata
- [ ] Test with signed images from Week 2

### Day 18-19: Verify API Endpoint
**File:** `core/verify/api.ts`

```typescript
app.post('/verify', async (c) => {
  const { assetUrl, manifestUrl } = await c.req.json();
  
  const result = await verifyAsset({
    assetUrl,
    manifestUrl
  });
  
  return c.json(result);
});
```

**Tasks:**
- [ ] Deploy verify API to Cloudflare Workers
- [ ] Add CORS headers for badge access
- [ ] Add caching (cache verification results for 5 minutes)
- [ ] Test: `curl -X POST https://api.credlink.com/verify -d '{"assetUrl":"..."}'`

### Day 20-21: Link Header Injection
**File:** `core/edge-worker/src/index.ts`

```typescript
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    
    // Pass through request
    const response = await fetch(request);
    
    // Inject Link header for images
    if (url.pathname.match(/\.(jpg|jpeg|png|webp)$/i)) {
      const hash = extractHashFromPath(url.pathname);
      const manifestUrl = `https://manifests.credlink.com/${hash}.c2pa`;
      
      const newResponse = new Response(response.body, response);
      newResponse.headers.set(
        'Link',
        `<${manifestUrl}>; rel="c2pa-manifest"`
      );
      
      return newResponse;
    }
    
    return response;
  }
};
```

**Tasks:**
- [ ] Deploy edge worker
- [ ] Configure routes for image serving
- [ ] Test: Image responses include Link header
- [ ] Verify: Can you discover manifest from just image URL?

**Milestone:** ✅ You can verify an image and get creator info back

---

## Week 4: Badge & End-to-End Integration

### Day 22-24: Build Badge Web Component
**File:** `ui/badge/src/credlink-badge.ts`

```typescript
class CredLinkBadge extends HTMLElement {
  private verified: boolean = false;
  private result: VerificationResult | null = null;
  
  connectedCallback() {
    const assetUrl = this.getAttribute('asset-url');
    const manifestUrl = this.getAttribute('manifest-url');
    
    this.render('loading');
    
    this.verify(assetUrl, manifestUrl).then(result => {
      this.result = result;
      this.verified = result.valid;
      this.render('loaded');
    });
  }
  
  async verify(assetUrl?: string, manifestUrl?: string) {
    const response = await fetch('https://api.credlink.com/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assetUrl, manifestUrl })
    });
    
    return response.json();
  }
  
  render(state: 'loading' | 'loaded') {
    if (state === 'loading') {
      this.innerHTML = `<div class="credlink-badge loading">Verifying...</div>`;
      return;
    }
    
    const status = this.verified ? 'verified' : 'unverified';
    const icon = this.verified ? '✓' : '❌';
    
    this.innerHTML = `
      <div class="credlink-badge ${status}">
        <span class="icon">${icon}</span>
        <span class="text">${this.verified ? 'Verified' : 'Not Verified'}</span>
        <button class="details" onclick="this.getRootNode().host.showModal()">
          Details
        </button>
      </div>
      <div class="credlink-modal" style="display:none">
        <div class="modal-content">
          <h3>Verification Details</h3>
          <p><strong>Creator:</strong> ${this.result?.creator}</p>
          <p><strong>Created:</strong> ${this.result?.createdAt}</p>
          <p><strong>Manifest:</strong> <a href="${this.result?.manifestUrl}">View</a></p>
          <button onclick="this.getRootNode().querySelector('.credlink-modal').style.display='none'">
            Close
          </button>
        </div>
      </div>
    `;
  }
  
  showModal() {
    this.querySelector('.credlink-modal').style.display = 'flex';
  }
}

customElements.define('credlink-badge', CredLinkBadge);
```

**Tasks:**
- [ ] Build web component
- [ ] Add CSS (inline or Shadow DOM)
- [ ] Make it keyboard accessible (Tab, Enter, Esc)
- [ ] Add loading states
- [ ] Build with Rollup/Vite
- [ ] Publish to NPM: `@credlink/badge`
- [ ] Create CDN version: `https://cdn.credlink.com/badge.js`

### Day 25-26: End-to-End Demo
**File:** `demos/basic-demo.html`

```html
<!DOCTYPE html>
<html>
<head>
  <title>CredLink Demo</title>
  <script src="https://cdn.credlink.com/badge.js"></script>
</head>
<body>
  <h1>CredLink Demo</h1>
  
  <h2>Upload & Sign</h2>
  <input type="file" id="upload" accept="image/*">
  <button onclick="signImage()">Sign Image</button>
  
  <h2>Signed Image</h2>
  <img id="signed-image" src="" style="max-width:400px">
  <credlink-badge asset-url="" manifest-url=""></credlink-badge>
  
  <script>
    async function signImage() {
      const file = document.getElementById('upload').files[0];
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('https://api.credlink.com/sign', {
        method: 'POST',
        body: formData
      });
      
      const result = await response.json();
      
      document.getElementById('signed-image').src = result.assetUrl;
      document.querySelector('credlink-badge').setAttribute('manifest-url', result.manifestUrl);
    }
  </script>
</body>
</html>
```

**Tasks:**
- [ ] Create demo page
- [ ] Deploy to GitHub Pages
- [ ] Test full flow: Upload → Sign → Display → Verify
- [ ] Record screen capture for demo video

### Day 27-28: WordPress Plugin (Basic)
**File:** `integrations/cms/wordpress/credlink.php`

```php
<?php
/*
Plugin Name: CredLink
Description: Cryptographic image verification
Version: 1.0.0
*/

function credlink_sign_attachment($attachment_id) {
    $image_url = wp_get_attachment_url($attachment_id);
    $api_key = get_option('credlink_api_key');
    
    $response = wp_remote_post('https://api.credlink.com/sign', [
        'headers' => ['Authorization' => "Bearer $api_key"],
        'body' => json_encode(['assetUrl' => $image_url])
    ]);
    
    if (is_wp_error($response)) {
        return;
    }
    
    $data = json_decode(wp_remote_retrieve_body($response));
    update_post_meta($attachment_id, '_credlink_manifest', $data->manifestUrl);
}

add_action('add_attachment', 'credlink_sign_attachment');

function credlink_inject_badge($html, $attachment_id) {
    $manifest = get_post_meta($attachment_id, '_credlink_manifest', true);
    
    if ($manifest) {
        $badge = sprintf(
            '<credlink-badge manifest-url="%s"></credlink-badge>',
            esc_attr($manifest)
        );
        $html .= $badge;
    }
    
    return $html;
}

add_filter('wp_get_attachment_image', 'credlink_inject_badge', 10, 2);

// Settings page
function credlink_settings_page() {
    ?>
    <div class="wrap">
        <h1>CredLink Settings</h1>
        <form method="post" action="options.php">
            <?php settings_fields('credlink'); ?>
            <table class="form-table">
                <tr>
                    <th>API Key</th>
                    <td>
                        <input type="text" name="credlink_api_key" 
                               value="<?php echo esc_attr(get_option('credlink_api_key')); ?>"
                               class="regular-text">
                    </td>
                </tr>
            </table>
            <?php submit_button(); ?>
        </form>
    </div>
    <?php
}

add_action('admin_menu', function() {
    add_options_page('CredLink', 'CredLink', 'manage_options', 'credlink', 'credlink_settings_page');
});
?>
```

**Tasks:**
- [ ] Build WordPress plugin
- [ ] Test on local WordPress install
- [ ] Package as ZIP
- [ ] Create installation guide
- [ ] (Optional) Submit to WordPress.org

**Milestone:** ✅ You have a working WordPress plugin

---

## Final Sprint: Polish & Launch Prep

### Documentation
- [ ] Update README.md with demo GIF
- [ ] Write API documentation
- [ ] Write integration guides (WordPress, manual HTML)
- [ ] Create FAQ

### Testing
- [ ] Test sign → verify flow with 10 different images
- [ ] Test WordPress plugin on 3 different themes
- [ ] Test badge on different browsers (Chrome, Firefox, Safari)
- [ ] Load test: Can your API handle 100 requests/minute?

### Launch Checklist
- [ ] Domain configured: credlink.com
- [ ] SSL certificates valid
- [ ] APIs deployed and responding
- [ ] Badge published to CDN
- [ ] WordPress plugin available for download
- [ ] Demo site live
- [ ] Monitoring set up (Sentry, Better Uptime)
- [ ] Support email configured

---

## Success Criteria

✅ **You can:**
1. Upload an image to your demo site
2. Sign it via API
3. Get back a manifest URL
4. Display the image with badge
5. Badge shows "✓ Verified" with creator info
6. Install WordPress plugin and auto-sign uploads
7. Verify images work after CDN optimization

✅ **Performance:**
- Sign request: < 2 seconds
- Verify request: < 1 second
- Badge load: < 500ms

✅ **Reliability:**
- APIs return 200 OK for valid requests
- No crashes during basic testing
- Error messages are helpful

---

## What You're NOT Building (Yet)

- ❌ Shopify app
- ❌ Mobile SDKs
- ❌ Browser extension
- ❌ Advanced analytics
- ❌ Multi-region deployment
- ❌ Enterprise SSO
- ❌ Compliance reports
- ❌ Partner marketplace

**These come AFTER you have 5 paying customers.**

---

## Budget for MVP

- Cloudflare: $5/month (Workers + R2)
- Domain: $12/year
- Sentry (error tracking): Free tier
- Better Uptime: Free tier
- **Total: ~$10/month**

---

## Time Commitment

- **Full-time (40h/week):** 4 weeks
- **Part-time (20h/week):** 8 weeks
- **Evenings (10h/week):** 16 weeks

---

## Next Step RIGHT NOW

```bash
cd /Users/nicoladebbia/Code_Ideas/CredLink
chmod +x scripts/*.sh
bash scripts/rename-branding.sh
# Review changes, then:
git add -A
git commit -m "chore: rebrand to CredLink"
```

Then open `PRODUCTION-ROADMAP.md` and start Week 1, Day 1.

**Good luck! 🚀**
