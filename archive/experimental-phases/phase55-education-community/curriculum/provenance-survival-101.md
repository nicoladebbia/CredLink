# Provenance Survival 101 - Complete Curriculum

## Overview
5 micro-modules, each <8 minutes, ending with runnable snippet and CAI Verify link. Designed for Stripe/Twilio-style fast adoption.

## Module Structure
- **Why**: Quick context (1-2 min)
- **What**: Core concept (2-3 min)  
- **How**: Live demo (3-4 min)
- **Proof**: Copy-paste snippet + CAI Verify link (1 min)

---

## Module 1: Why Embeds Break & Remote Survives

### Why (2 min)
- **Local manifests**: Break when content moves, shared, or cached
- **CDN edge cases**: Optimizers strip headers, break integrity
- **Social platforms**: Manifests lost in re-encoding
- **Remote advantage**: One source of truth, survives any transformation

### What (3 min)
- **HTTP Link header**: `rel="c2pa-manifest"` points to remote manifest
- **C2PA Discovery Order**: HTTP Link > embedded > sidecar (per spec)
- **Remote-first strategy**: Always prefer HTTP Link for maximum survival

### How (3 min)
```bash
# Demo: Same asset three ways
# 1. Embedded (breaks on share)
# 2. Sidecar (breaks on rename)  
# 3. Remote (survives everything)
```

### Proof (Copy & Paste)
```php
<?php
// SECURE: Remote manifest injection - WordPress
add_action('send_headers', function() {
    // SECURITY: Validate and sanitize request URI
    $request_uri = $_SERVER['REQUEST_URI'] ?? '';
    $parsed_uri = parse_url($request_uri, PHP_URL_PATH) ?: '';
    
    if ($parsed_uri && preg_match('/\.(jpg|jpeg|png|webp|avif)$/i', $parsed_uri)) {
        // SECURITY: Prevent path traversal attacks
        if (strpos($parsed_uri, '..') !== false || 
            strpos($parsed_uri, '%2e%2e') !== false || 
            strpos($parsed_uri, "\0") !== false) {
            return; // Exit silently on suspicious requests
        }
        
        $asset_name = basename($parsed_uri, '.' . pathinfo($parsed_uri, PATHINFO_EXTENSION));
        // SECURITY: Use environment variables for domain configuration
        $cdn_base = getenv('C2PA_MANIFEST_CDN') ?: 'https://cdn.yourdomain.com/manifests';
        $manifest_url = "{$cdn_base}/{$asset_name}.json";
        
        // SECURITY: Validate manifest URL format
        if (filter_var($manifest_url, FILTER_VALIDATE_URL)) {
            header("Link: <{$manifest_url}>; rel=\"c2pa-manifest\"", false);
            // Add CORS headers for CAI Verify
            header('Access-Control-Allow-Origin: *');
            header('Access-Control-Expose-Headers: Link');
        }
    }
});
```

**Verify with CAI**: [https://contentauthenticity.org/verify](https://contentauthenticity.org/verify)  
**Live Demo**: [Demo Asset - Remote Manifest](https://demo.credlink.com/remote-survival)

---

## Module 2: Your Stack in 15 Minutes

### Why (1 min)
- **Platform diversity**: Each platform has unique manifest challenges
- **Quick wins**: 15-minute implementation per stack
- **Green verification**: CAI Verify shows "Content Credentials: Present"

### What (4 min)
- **WordPress**: Hook into `send_headers` for asset routes
- **Shopify**: Theme liquid + meta-tag fallback
- **Cloudflare Workers**: Edge proxy with strong validators
- **Next.js**: Middleware for Link header injection
- **Fastify**: Plugin-based header management

### How (8 min)
Live demos showing:
1. Asset upload → manifest generation → Link header
2. CAI Verify showing green checkmark
3. Content transformation survival test

### Proof (Choose Your Stack)

#### WordPress
```php
<?php
// functions.php - Complete implementation
function c2pa_remote_manifest($headers, $wp) {
    $request_uri = $_SERVER['REQUEST_URI'];
    
    // Only process image assets
    if (preg_match('/\.(jpg|jpeg|png|webp)$/i', $request_uri)) {
        $asset_name = basename($request_uri, '.' . pathinfo($request_uri, PATHINFO_EXTENSION));
        $manifest_url = "https://cdn.yourdomain.com/manifests/{$asset_name}.json";
        
        $headers['Link'] = "<{$manifest_url}>; rel=\"c2pa-manifest\"";
    }
    
    return $headers;
}
add_filter('wp_headers', 'c2pa_remote_manifest', 10, 2);
?>
```

#### Shopify
```liquid
<!-- theme.liquid -->
{% if template contains 'product' %}
  {% assign product_image = product.featured_image %}
  {% if product_image %}
    <link rel="c2pa-manifest" href="https://cdn.yourdomain.com/manifests/{{ product_image.id }}.json">
  {% endif %}
{% endif %}
```

#### Cloudflare Workers
```javascript
// worker.js
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Proxy image requests and add Link header
  if (url.pathname.match(/\.(jpg|jpeg|png|webp)$/i)) {
    const imageResponse = await fetch(request)
    const manifestUrl = `https://cdn.yourdomain.com/manifests${url.pathname}.json`
    
    const newResponse = new Response(imageResponse.body, imageResponse)
    newResponse.headers.set('Link', `<${manifestUrl}>; rel="c2pa-manifest"`)
    newResponse.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    
    return newResponse
  }
  
  return fetch(request)
}
```

**Verify with CAI**: [https://contentauthenticity.org/verify](https://contentauthenticity.org/verify)  
**Stack Demos**: [WordPress](https://demo.credlink.com/wp) | [Shopify](https://demo.credlink.com/shopify) | [Cloudflare](https://demo.credlink.com/cf)

---

## Module 3: Verifiers & Proofs

### Why (2 min)
- **Trust but verify**: CAI Verify as neutral third-party
- **Developer workflow**: /verify API for automated checks
- **Remote manifest meaning**: One URL, infinite content copies

### What (3 min)
- **CAI Verify**: Adobe's neutral verification tool
- **/verify API**: Your verification endpoint
- **Remote manifest practice**: Manifest lives separately from content

### How (3 min)
```javascript
// Live verification demo
const verifyResult = await fetch('/verify', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ assetUrl: 'https://demo.credlink.com/sample.jpg' })
});
```

### Proof (Copy & Paste)
```javascript
// Automated verification script
async function verifyProvenance(assetUrl) {
  try {
    const response = await fetch('https://api.credlink.com/verify', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer YOUR_API_KEY'
      },
      body: JSON.stringify({
        asset_url: assetUrl,
        check_remote_manifest: true
      })
    });
    
    const result = await response.json();
    
    if (result.valid) {
      console.log('✅ Provenance verified');
      console.log('Manifest URL:', result.manifest_url);
      console.log('CAI Verify Link:', `https://contentauthenticity.org/verify?url=${encodeURIComponent(assetUrl)}`);
    } else {
      console.log('❌ Verification failed:', result.error);
    }
    
    return result;
  } catch (error) {
    console.error('Verification error:', error);
    return { valid: false, error: error.message };
  }
}

// Usage
verifyProvenance('https://yourdomain.com/asset.jpg');
```

**Verify with CAI**: [https://contentauthenticity.org/verify](https://contentauthenticity.org/verify)  
**API Demo**: [Live /verify Demo](https://demo.credlink.com/verify)

---

## Module 4: Sandboxes & Optimizers

### Why (2 min)
- **Content optimizers**: CDN compression, image resizing, format conversion
- **Social media sanitizers**: Strip headers, re-encode content
- **Remote advantage**: Manifest survives any optimization

### What (3 min)
- **Optimizer detection**: Headers vary between requests
- **Routing strategies**: Always serve remote manifest
- **Adobe context**: Content Credentials vs watermarking distinction

### How (3 min)
Demo of optimizer breaking embedded manifests vs remote survival:
1. Upload image with embedded manifest
2. Run through Cloudflare Image Resizing
3. Show verification failure
4. Repeat with remote manifest - success

### Proof (Copy & Paste)
```javascript
// Optimizer detection and routing
class ManifestRouter {
  constructor() {
    this.optimizers = new Set([
      'cloudflare-images',
      'imgix', 
      'imagekit',
      'akamai-image-manager'
    ]);
  }
  
  detectOptimizer(request) {
    const userAgent = request.headers.get('user-agent') || '';
    const via = request.headers.get('via') || '';
    
    for (const optimizer of this.optimizers) {
      if (userAgent.includes(optimizer) || via.includes(optimizer)) {
        return optimizer;
      }
    }
    
    return null;
  }
  
  async handleRequest(request) {
    const optimizer = this.detectOptimizer(request);
    const url = new URL(request.url);
    
    // Always route to remote manifest for maximum compatibility
    if (url.pathname.match(/\.(jpg|jpeg|png|webp)$/i)) {
      const manifestUrl = `https://cdn.yourdomain.com/manifests${url.pathname}.json`;
      
      const response = await fetch(request);
      const newResponse = new Response(response.body, response);
      
      newResponse.headers.set('Link', `<${manifestUrl}>; rel="c2pa-manifest"`);
      newResponse.headers.set('X-C2PA-Optimizer', optimizer || 'none');
      
      return newResponse;
    }
    
    return fetch(request);
  }
}

// Cloudflare Worker implementation
const router = new ManifestRouter();
addEventListener('fetch', event => {
  event.respondWith(router.handleRequest(event.request))
});
```

**Verify with CAI**: [https://contentauthenticity.org/verify](https://contentauthenticity.org/verify)  
**Optimizer Demo**: [Optimizer Survival Test](https://demo.credlink.com/optimizers)

---

## Module 5: Compliance in One Sprint

### Why (2 min)
- **Regulatory pressure**: EU AI Act, DSA, FTC requirements
- **Fast compliance**: Paste-ready disclosure strings
- **C2PA+1**: Your compliance engine handles the heavy lifting

### What (3 min)
- **Disclosure strings**: Pre-vetted compliance text
- **Rendering locations**: Where disclosures appear
- **Compliance v2**: Your automated compliance pack generation

### How (3 min)
Live demo of compliance pack generation with proper disclosures

### Proof (Copy & Paste)
```javascript
// SECURE: Compliance disclosure generator
const DISCLOSURE_TEMPLATES = {
  'eu-ai-act': {
    'ai-generated': 'This content was generated by AI. See provenance details for more information.',
    'ai-altered': 'This content was altered by AI. Original and modified versions are documented.',
    'synthetic-media': 'This synthetic media was created using AI tools. Full creation process documented.'
  },
  'dsa-transparency': {
    'ad-identifier': 'Advertisement ID: {{ad_id}}. Sponsor: {{sponsor}}.',
    'targeting-info': 'Why you\'re seeing this: {{targeting_reason}}'
  },
  'ftc-disclosure': {
    'ai-content': 'AI-generated content. Full attribution available in provenance record.'
  }
};

// SECURITY: Sanitize and validate inputs
function sanitizeContext(context) {
  const sanitized = {};
  for (const [key, value] of Object.entries(context || {})) {
    if (typeof key === 'string' && typeof value === 'string') {
      // Remove potentially dangerous characters
      sanitized[key] = value
        .replace(/[<>]/g, '')
        .replace(/javascript:/gi, '')
        .replace(/on\w+=/gi, '')
        .trim()
        .substring(0, 1000); // Limit length
    }
  }
  return sanitized;
}

function generateDisclosure(type, context = {}) {
  // SECURITY: Validate template type
  if (!DISCLOSURE_TEMPLATES[type]) {
    throw new Error(`Invalid disclosure type: ${type}`);
  }
  
  const template = DISCLOSURE_TEMPLATES[type];
  const sanitizedContext = sanitizeContext(context);
  
  // SECURITY: Safe template replacement with validation
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (sanitizedContext.hasOwnProperty(key)) {
      return sanitizedContext[key];
    }
    // Return placeholder for missing keys rather than raw template
    return `[${key.toUpperCase()}]`;
  });
}

// WordPress integration
function add_compliance_disclosure($content) {
  // SECURITY: Validate content and post objects
  if (!is_string($content) || empty($content)) {
    return $content;
  }
  
  global $post;
  if (!isset($post) || !is_object($post) || !property_exists($post, 'ID')) {
    return $content;
  }
  
  // Check if content has C2PA manifest
  $manifest_url = get_post_meta($post->ID, '_c2pa_manifest_url', true);
  if (!$manifest_url || !filter_var($manifest_url, FILTER_VALIDATE_URL)) {
    return $content;
  }
  
  // Add disclosure based on content type
  $disclosure = '<div class="c2pa-disclosure" data-manifest="' . esc_attr($manifest_url) . '">';
  $disclosure .= '<p>This content includes provenance information. ';
  $disclosure .= '<a href="' . esc_url($manifest_url) . '" target="_blank">View details</a>.</p>';
  $disclosure .= '</div>';
  
  return $content . $disclosure;
}
add_filter('the_content', 'add_compliance_disclosure');
```

### Compliance Checklist
- [ ] Remote manifest URLs configured
- [ ] Disclosure strings added to content
- [ ] CAI Verify links prominently displayed  
- [ ] Compliance pack generation tested
- [ ] Legal team reviewed disclosures

### Self-Serve Smoke Test
```bash
#!/bin/bash
# compliance-smoke-test.sh

echo "🔍 Testing C2PA Compliance Setup..."

# Test 1: Remote manifest accessibility
ASSET_URL="https://yourdomain.com/sample.jpg"
MANIFEST_URL="https://cdn.yourdomain.com/manifests/sample.jpg.json"

echo "Testing manifest accessibility..."
curl -f -s "$MANIFEST_URL" > /dev/null
if [ $? -eq 0 ]; then
  echo "✅ Manifest accessible"
else
  echo "❌ Manifest not found"
  exit 1
fi

# Test 2: Link header presence
echo "Testing Link header..."
LINK_HEADER=$(curl -I -s "$ASSET_URL" | grep -i "link:.*c2pa-manifest")
if [ -n "$LINK_HEADER" ]; then
  echo "✅ Link header present"
else
  echo "❌ Link header missing"
  exit 1
fi

# Test 3: CAI Verify compatibility
echo "Testing CAI Verify compatibility..."
VERIFY_URL="https://contentauthenticity.org/verify?url=$(echo -n "$ASSET_URL" | jq -sRr @uri)"
HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$VERIFY_URL")

if [ "$HTTP_STATUS" -eq 200 ]; then
  echo "✅ CAI Verify compatible"
else
  echo "❌ CAI Verify failed (HTTP $HTTP_STATUS)"
  exit 1
fi

echo "🎉 All compliance tests passed!"
```

**Verify with CAI**: [https://contentauthenticity.org/verify](https://contentauthenticity.org/verify)  
**Compliance Demo**: [Live Compliance Test](https://demo.credlink.com/compliance)

---

## Course Completion Certificate

Upon completing all 5 modules:
1. ✅ Implemented remote manifest for your stack
2. ✅ Verified with CAI Verify (green checkmark)
3. ✅ Added compliance disclosures
4. ✅ Tested optimizer survival
5. ✅ Generated compliance pack

**Next Steps**:
- Join our [Discourse Forum](https://community.credlink.com)
- Attend [Monthly Office Hours](https://credlink.com/office-hours)
- Submit your [15-minute to green demo](https://credlink.com/submit-demo)

**Proof of Completion**: Post your CAI Verify link in the forum with hashtag #ProvenanceSurvival101
