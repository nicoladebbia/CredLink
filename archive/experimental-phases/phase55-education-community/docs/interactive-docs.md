# Interactive Documentation - Time-to-First-Verify Optimization

## Strategy Overview
Reduce TTFV by embedding live "Try It" demos and copy-paste snippets on every page, following Stripe's proven documentation pattern.

---

## Interactive API Documentation

### /verify Endpoint - Live Demo

```javascript
// SECURE: Try It Now - Verify Asset Provenance
const verifyAsset = async () => {
  const assetUrlInput = document.getElementById('asset-url');
  const resultContainer = document.getElementById('verify-result');
  
  // SECURITY: Validate input elements exist
  if (!assetUrlInput || !resultContainer) {
    console.error('Required DOM elements not found');
    return;
  }
  
  const assetUrl = assetUrlInput.value.trim();
  
  // SECURITY: Validate URL format
  if (!assetUrl || !isValidUrl(assetUrl)) {
    resultContainer.innerHTML = `
      <div class="result error">
        <h4>❌ Invalid URL</h4>
        <p>Please enter a valid URL</p>
      </div>
    `;
    return;
  }
  
  try {
    // SECURITY: Use environment variable for API endpoint
    const apiEndpoint = process.env.C2PA_API_ENDPOINT || 'https://api.credlink.com/verify';
    const apiKey = process.env.C2PA_DE_API_KEY; // Never expose in client code
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey, // Use custom header instead of Bearer
        'X-Requested-With': 'XMLHttpRequest' // CSRF protection
      },
      body: JSON.stringify({
        asset_url: assetUrl,
        check_remote_manifest: true,
        origin: window.location.origin // Track source for analytics
      })
    });
    
    // SECURITY: Validate response
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // SECURITY: Sanitize result before rendering
    const sanitizedResult = sanitizeVerificationResult(result);
    
    resultContainer.innerHTML = `
      <div class="result ${sanitizedResult.valid ? 'success' : 'error'}">
        <h4>${sanitizedResult.valid ? '✅ Verified' : '❌ Failed'}</h4>
        <pre>${escapeHtml(JSON.stringify(sanitizedResult, null, 2))}</pre>
        ${sanitizedResult.valid ? `
          <a href="https://contentauthenticity.org/verify?url=${encodeURIComponent(assetUrl)}" 
             target="_blank" 
             rel="noopener noreferrer">Verify with CAI →</a>
        ` : ''}
      </div>
    `;
  } catch (error) {
    // SECURITY: Don't expose sensitive error details
    resultContainer.innerHTML = `
      <div class="result error">
        <h4>❌ Verification Failed</h4>
        <p>${escapeHtml(error.message || 'An error occurred')}</p>
      </div>
    `;
  }
};

// SECURITY: URL validation function
function isValidUrl(string) {
  try {
    const url = new URL(string);
    return ['http:', 'https:'].includes(url.protocol);
  } catch (_) {
    return false;
  }
}

// SECURITY: HTML escaping to prevent XSS
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// SECURITY: Sanitize verification result
function sanitizeVerificationResult(result) {
  const sanitized = {
    valid: Boolean(result.valid),
    manifest_present: Boolean(result.manifest_present),
    signature_valid: Boolean(result.signature_valid)
  };
  
  // Only include safe, non-sensitive fields
  if (result.asset_url && isValidUrl(result.asset_url)) {
    sanitized.asset_url = result.asset_url;
  }
  
  if (result.verification_timestamp) {
    sanitized.verification_timestamp = result.verification_timestamp;
  }
  
  return sanitized;
}
```

**Live Demo**: [Interactive /verify Demo](https://docs.credlink.com/verify-demo)

### /sign Endpoint - Live Demo

```javascript
// SECURE: Try It Now - Sign Content with Remote Manifest
const signContent = async () => {
  const contentInput = document.getElementById('content-to-sign');
  const manifestUrlInput = document.getElementById('manifest-url');
  const resultContainer = document.getElementById('sign-result');
  
  // SECURITY: Validate DOM elements
  if (!contentInput || !manifestUrlInput || !resultContainer) {
    console.error('Required DOM elements not found');
    return;
  }
  
  const content = contentInput.value.trim();
  const manifestUrl = manifestUrlInput.value.trim();
  
  // SECURITY: Validate inputs
  if (!content || content.length > 10000) {
    resultContainer.innerHTML = `
      <div class="result error">
        <h4>❌ Invalid Content</h4>
        <p>Content is required and must be under 10,000 characters</p>
      </div>
    `;
    return;
  }
  
  if (!manifestUrl || !isValidUrl(manifestUrl)) {
    resultContainer.innerHTML = `
      <div class="result error">
        <h4>❌ Invalid Manifest URL</h4>
        <p>Please enter a valid manifest URL</p>
      </div>
    `;
    return;
  }
  
  try {
    // SECURITY: Use environment variables for API configuration
    const apiEndpoint = process.env.C2PA_SIGN_ENDPOINT || 'https://api.credlink.com/sign';
    const apiKey = process.env.C2PA_SIGN_API_KEY;
    
    const response = await fetch(apiEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': apiKey,
        'X-Requested-With': 'XMLHttpRequest'
      },
      body: JSON.stringify({
        content: sanitizeContent(content),
        manifest_url: manifestUrl,
        sign_with_remote_manifest: true,
        origin: window.location.origin
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    // SECURITY: Sanitize result before rendering
    resultContainer.innerHTML = `
      <div class="result success">
        <h4>✅ Signed Successfully</h4>
        <p><strong>Signature ID:</strong> ${escapeHtml(result.signature_id || 'N/A')}</p>
        <p><strong>Manifest URL:</strong> 
          <a href="${escapeHtml(result.manifest_url)}" 
             target="_blank" 
             rel="noopener noreferrer">${escapeHtml(result.manifest_url)}</a>
        </p>
        ${result.signed_url ? `
          <p><strong>CAI Verify:</strong> 
            <a href="https://contentauthenticity.org/verify?url=${encodeURIComponent(result.signed_url)}" 
               target="_blank" 
               rel="noopener noreferrer">Verify →</a>
          </p>
        ` : ''}
      </div>
    `;
  } catch (error) {
    resultContainer.innerHTML = `
      <div class="result error">
        <h4>❌ Signing Failed</h4>
        <p>${escapeHtml(error.message || 'An error occurred during signing')}</p>
      </div>
    `;
  }
};

// SECURITY: Content sanitization
function sanitizeContent(content) {
  return content
    .replace(/[\x00-\x1F\x7-\x2F]/g, '') // Remove control characters
    .replace(/[<>]/g, '') // Remove HTML tags
    .trim()
    .substring(0, 10000);
}
```

**Live Demo**: [Interactive /sign Demo](https://docs.credlink.com/sign-demo)

---

## Markdoc/MDX Style Recipes

### Recipe Template Structure
```markdown
---
title: "WordPress Remote Manifest Setup"
description: "Add remote C2PA manifests to WordPress in 5 minutes"
stack: ["wordpress", "php"]
time: "5 min"
difficulty: "beginner"
---

# WordPress Remote Manifest Setup

## Overview
Add remote C2PA manifests to your WordPress site to ensure provenance survival through CDNs, social sharing, and content optimizers.

## Live Demo
<div data-demo="wordpress-manifest">
  <!-- Interactive demo component -->
</div>

## Quick Start

### 1. Copy this snippet
```php
<?php
// Add to functions.php
add_action('send_headers', function() {
    $request_uri = $_SERVER['REQUEST_URI'];
    if (preg_match('/\.(jpg|jpeg|png|webp)$/i', $request_uri)) {
        $asset_name = basename($request_uri, '.' . pathinfo($request_uri, PATHINFO_EXTENSION));
        $manifest_url = "https://cdn.yourdomain.com/manifests/{$asset_name}.json";
        header('Link: <' . $manifest_url . '>; rel="c2pa-manifest"');
    }
});
?>
```

### 2. Test it
```bash
curl -I "https://yoursite.com/wp-content/uploads/2024/01/sample.jpg"
# Look for: Link: <https://cdn.yourdomain.com/manifests/sample.jpg.json>; rel="c2pa-manifest"
```

### 3. Verify with CAI
[Verify Sample Image →](https://contentauthenticity.org/verify?url=https://demo.credlink.com/wp-sample.jpg)

## How It Works
1. **Hook Detection**: WordPress `send_headers` action runs before asset delivery
2. **Pattern Matching**: Only processes image files (jpg, jpeg, png, webp)
3. **Manifest URL**: Constructs remote manifest URL based on asset name
4. **Link Header**: Adds `rel="c2pa-manifest"` header pointing to remote manifest

## Next Steps
- [Set up manifest generation](/docs/manifest-generation)
- [Configure CDN caching](/docs/cdn-setup)
- [Add compliance disclosures](/docs/compliance)

## Copy Snippet → Verify Link
✅ **Snippet copied** - Now [verify it works with CAI](https://contentauthenticity.org/verify)
```

---

## Live Code Blocks Implementation

### React Component for Interactive Demos
```jsx
// InteractiveCodeBlock.jsx
import React, { useState } from 'react';
import { CopyToClipboard } from 'react-copy-to-clipboard';

const InteractiveCodeBlock = ({ 
  code, 
  language, 
  demoUrl, 
  verifyUrl,
  title 
}) => {
  const [copied, setCopied] = useState(false);
  const [demoResult, setDemoResult] = useState(null);

  const handleCopy = () => {
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const runDemo = async () => {
    try {
      // Execute demo code in sandbox
      const result = await executeCode(code);
      setDemoResult(result);
    } catch (error) {
      setDemoResult({ error: error.message });
    }
  };

  return (
    <div className="interactive-code-block">
      <div className="code-header">
        <h4>{title}</h4>
        <div className="actions">
          <CopyToClipboard text={code} onCopy={handleCopy}>
            <button className="copy-btn">
              {copied ? '✅ Copied!' : '📋 Copy'}
            </button>
          </CopyToClipboard>
          {demoUrl && (
            <button onClick={runDemo} className="demo-btn">
              ▶️ Try It Live
            </button>
          )}
        </div>
      </div>
      
      <pre className="code-content">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      
      {demoResult && (
        <div className={`demo-result ${demoResult.error ? 'error' : 'success'}`}>
          <h5>{demoResult.error ? '❌ Error' : '✅ Result'}</h5>
          <pre>{JSON.stringify(demoResult, null, 2)}</pre>
        </div>
      )}
      
      {verifyUrl && (
        <div className="verify-section">
          <a href={verifyUrl} target="_blank" rel="noopener noreferrer" className="verify-btn">
            🔍 Verify with CAI →
          </a>
        </div>
      )}
    </div>
  );
};

export default InteractiveCodeBlock;
```

### CSS for Interactive Components
```css
/* Interactive Docs Styles */
.interactive-code-block {
  border: 1px solid #e1e5e9;
  border-radius: 8px;
  margin: 1.5rem 0;
  overflow: hidden;
  background: #fff;
}

.code-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background: #f8f9fa;
  border-bottom: 1px solid #e1e5e9;
}

.code-header h4 {
  margin: 0;
  font-size: 1rem;
  color: #2d3748;
}

.actions {
  display: flex;
  gap: 0.5rem;
}

.copy-btn, .demo-btn {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 4px;
  font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.2s;
}

.copy-btn {
  background: #edf2f7;
  color: #4a5568;
}

.copy-btn:hover {
  background: #e2e8f0;
}

.demo-btn {
  background: #4299e1;
  color: white;
}

.demo-btn:hover {
  background: #3182ce;
}

.code-content {
  padding: 1rem;
  overflow-x: auto;
  background: #2d3748;
  color: #e2e8f0;
}

.demo-result {
  padding: 1rem;
  border-top: 1px solid #e1e5e9;
}

.demo-result.success {
  background: #f0fff4;
  color: #22543d;
}

.demo-result.error {
  background: #fff5f5;
  color: #742a2a;
}

.verify-section {
  padding: 1rem;
  background: #f8f9fa;
  border-top: 1px solid #e1e5e9;
  text-align: center;
}

.verify-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.5rem;
  background: #38a169;
  color: white;
  text-decoration: none;
  border-radius: 6px;
  font-weight: 500;
  transition: background 0.2s;
}

.verify-btn:hover {
  background: #2f855a;
}
```

---

## Repo Starters - One-File Examples

### WordPress Starter
```php
<?php
/**
 * Plugin Name: C2PA Remote Manifests
 * Description: Add remote C2PA manifests to WordPress assets
 * Version: 1.0.0
 * Author: C2 Concierge
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class C2PARemoteManifests {
    private $manifest_base_url;
    
    public function __construct() {
        $this->manifest_base_url = 'https://cdn.yourdomain.com/manifests';
        add_action('send_headers', [$this, 'add_manifest_headers']);
        add_action('init', [$this, 'register_settings']);
    }
    
    public function add_manifest_headers() {
        $request_uri = $_SERVER['REQUEST_URI'];
        
        // Process image uploads
        if (strpos($request_uri, '/wp-content/uploads/') !== false) {
            if (preg_match('/\.(jpg|jpeg|png|webp)$/i', $request_uri)) {
                $asset_path = parse_url($request_uri, PHP_URL_PATH);
                $asset_name = basename($asset_path, '.' . pathinfo($asset_path, PATHINFO_EXTENSION));
                $manifest_url = "{$this->manifest_base_url}{$asset_path}.json";
                
                header("Link: <{$manifest_url}>; rel=\"c2pa-manifest\"");
                header('Access-Control-Allow-Origin: *');
                header('Access-Control-Expose-Headers: Link');
            }
        }
    }
    
    public function register_settings() {
        add_option('c2pa_manifest_base_url', $this->manifest_base_url);
        register_setting('c2pa_options', 'c2pa_manifest_base_url');
    }
}

// Initialize the plugin
new C2PARemoteManifests();
```

### Shopify Starter
```liquid
{%- comment -%}
  C2PA Remote Manifests for Shopify
  Add to theme.liquid before </head>
{%- endcomment -%}

{%- if template contains 'product' -%}
  {%- for image in product.images -%}
    <link rel="c2pa-manifest" href="https://cdn.yourdomain.com/manifests/shopify-{{ image.id }}.json">
  {%- endfor -%}
{%- endif -%}

{%- if template contains 'article' -%}
  {%- if article.image -%}
    <link rel="c2pa-manifest" href="https://cdn.yourdomain.com/manifests/shopify-{{ article.image.id }}.json">
  {%- endif -%}
{%- endif -%}

{%- comment -%}
  Proxy route for manifest headers (add to routes)
{%- endcomment -%}
{% comment %}
  Add this to your Shopify theme's JavaScript:
  
  fetch('/apps/c2pa/manifest-proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ imageId: '{{ product.featured_image.id }}' })
  })
{% endcomment %}
```

### Cloudflare Workers Starter
```javascript
// wrangler.toml
name = "c2pa-manifest-proxy"
main = "src/index.js"
compatibility_date = "2024-01-01"

// src/index.js
addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  const url = new URL(request.url)
  
  // Health check
  if (url.pathname === '/health') {
    return new Response(JSON.stringify({
      status: 'ok',
      service: 'c2pa-manifest-proxy',
      version: '1.0.0'
    }), {
      headers: { 'Content-Type': 'application/json' }
    })
  }
  
  // Proxy images with manifest headers
  if (url.pathname.match(/\.(jpg|jpeg|png|webp)$/i)) {
    return handleImageRequest(request, url)
  }
  
  // Serve manifests
  if (url.pathname.endsWith('.json')) {
    return handleManifestRequest(request, url)
  }
  
  return new Response('Not found', { status: 404 })
}

async function handleImageRequest(request, url) {
  // Fetch original image
  const imageResponse = await fetch(request)
  
  if (!imageResponse.ok) {
    return imageResponse
  }
  
  // Create manifest URL
  const manifestUrl = `https://cdn.yourdomain.com/manifests${url.pathname}.json`
  
  // Clone response and add headers
  const newResponse = new Response(imageResponse.body, {
    status: imageResponse.status,
    statusText: imageResponse.statusText,
    headers: imageResponse.headers
  })
  
  newResponse.headers.set('Link', `<${manifestUrl}>; rel="c2pa-manifest"`)
  newResponse.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  newResponse.headers.set('X-C2PA-Proxy', 'cloudflare-worker')
  
  return newResponse
}

async function handleManifestRequest(request, url) {
  // Fetch manifest from CDN
  const manifestUrl = `https://cdn.yourdomain.com/manifests${url.pathname}`
  const manifestResponse = await fetch(manifestUrl)
  
  if (!manifestResponse.ok) {
    return new Response('Manifest not found', { status: 404 })
  }
  
  const manifest = await manifestResponse.json()
  
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    }
  })
}
```

### Next.js Starter
```javascript
// middleware.js
import { NextResponse } from 'next/server'

export function middleware(request) {
  const url = request.nextUrl
  
  // Add Link header to image assets
  if (url.pathname.match(/\.(jpg|jpeg|png|webp)$/i)) {
    const manifestUrl = `https://cdn.yourdomain.com/manifests${url.pathname}.json`
    
    const response = NextResponse.next()
    response.headers.set('Link', `<${manifestUrl}>; rel="c2pa-manifest"`)
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
    
    return response
  }
  
  return NextResponse.next()
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
```

### Fastify Starter
```javascript
// c2pa-plugin.js
export default async function c2paPlugin(fastify, options) {
  const manifestBaseUrl = options.manifestBaseUrl || 'https://cdn.yourdomain.com/manifests'
  
  // Add Link header to image routes
  fastify.addHook('onSend', async (request, reply, payload) => {
    const url = request.url
    
    if (url.match(/\.(jpg|jpeg|png|webp)$/i)) {
      const manifestUrl = `${manifestBaseUrl}${url}.json`
      reply.header('Link', `<${manifestUrl}>; rel="c2pa-manifest"`)
      reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    }
    
    return payload
  })
  
  // Health check endpoint
  fastify.get('/c2pa-health', async (request, reply) => {
    return {
      status: 'ok',
      service: 'c2pa-plugin',
      manifestBaseUrl
    }
  })
}

// server.js
import Fastify from 'fastify'
import c2paPlugin from './c2pa-plugin.js'

const fastify = Fastify({ logger: true })

// Register C2PA plugin
await fastify.register(c2paPlugin, {
  manifestBaseUrl: process.env.C2PA_MANIFEST_BASE_URL || 'https://cdn.yourdomain.com/manifests'
})

// Serve static files
fastify.register(import('@fastify/static'), {
  root: './public',
  prefix: '/'
})

// Start server
try {
  await fastify.listen({ port: 3000, host: '0.0.0.0' })
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
```

---

## Documentation Metrics

### TTFV Tracking Implementation
```javascript
// Track time-to-first-verify
class TTFVTracker {
  constructor() {
    this.startTime = Date.now()
    this.events = []
  }
  
  track(event, data = {}) {
    this.events.push({
      event,
      timestamp: Date.now() - this.startTime,
      data
    })
    
    // Send to analytics
    if (typeof gtag !== 'undefined') {
      gtag('event', event, {
        custom_parameter: data,
        time_to_event: Date.now() - this.startTime
      })
    }
  }
  
  trackFirstVerify() {
    this.track('first_verify_attempt')
  }
  
  trackVerifySuccess() {
    this.track('verify_success', {
      time_to_verify: Date.now() - this.startTime
    })
  }
}

// Initialize on page load
const ttfvTracker = new TTFVTracker()

// Track interactions
document.addEventListener('DOMContentLoaded', () => {
  // Track when user first tries the verify demo
  const verifyButtons = document.querySelectorAll('[data-verify-demo]')
  verifyButtons.forEach(button => {
    button.addEventListener('click', () => {
      ttfvTracker.trackFirstVerify()
    })
  })
})
```

This interactive documentation system reduces TTFV by providing:
- Live "Try It" demos for every API endpoint
- Copy-paste ready code snippets
- One-file repo starters for each stack
- Direct CAI Verify links on every page
- Real-time result feedback
- Comprehensive tracking of user journey
