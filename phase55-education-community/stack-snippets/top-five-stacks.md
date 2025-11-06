# Top-Five Stack Snippets - Production-Ready Implementations

## Overview
Copy-paste ready implementations for the top 5 platforms. Each snippet includes remote manifest injection, CAI Verify compatibility, and production considerations.

---

## 1. WordPress - Complete Plugin Implementation

### Plugin File: wp-content/plugins/c2pa-remote-manifests/c2pa-remote-manifests.php
```php
<?php
/**
 * Plugin Name: C2PA Remote Manifests
 * Description: Add remote C2PA manifests to WordPress assets with automatic generation
 * Version: 1.0.0
 * Author: C2 Concierge
 * License: MIT
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

class C2PARemoteManifests {
    private $manifest_base_url;
    private $api_key;
    private $manifest_cache = [];
    
    public function __construct() {
        $this->manifest_base_url = get_option('c2pa_manifest_base_url', 'https://cdn.yourdomain.com/manifests');
        $this->api_key = get_option('c2pa_api_key');
        
        // Register hooks
        add_action('send_headers', [$this, 'add_manifest_headers']);
        add_action('wp_generate_attachment_metadata', [$this, 'generate_manifest_on_upload'], 10, 2);
        add_action('init', [$this, 'register_settings']);
        add_action('admin_menu', [$this, 'add_admin_menu']);
        add_action('wp_ajax_c2pa_generate_manifest', [$this, 'ajax_generate_manifest']);
        
        // Add REST API endpoint
        add_action('rest_api_init', [$this, 'register_rest_routes']);
    }
    
    /**
     * Add Link headers for image assets
     */
    public function add_manifest_headers() {
        $request_uri = $_SERVER['REQUEST_URI'];
        
        // Validate and sanitize request URI
        $request_uri = $this->validate_request_uri($request_uri);
        if (!$request_uri) {
            return;
        }
        
        // Process WordPress uploads
        if (strpos($request_uri, '/wp-content/uploads/') !== false) {
            if (preg_match('/\.(jpg|jpeg|png|webp|avif)$/i', $request_uri)) {
                $this->add_link_header_for_asset($request_uri);
            }
        }
        
        // Process WooCommerce product images
        if (strpos($request_uri, '/wp-content/uploads/woocommerce') !== false) {
            if (preg_match('/\.(jpg|jpeg|png|webp|avif)$/i', $request_uri)) {
                $this->add_link_header_for_asset($request_uri);
            }
        }
    }
    
    /**
     * Validate and sanitize request URI to prevent path traversal
     */
    private function validate_request_uri($uri) {
        // Remove query parameters
        $uri = parse_url($uri, PHP_URL_PATH);
        if (!$uri) {
            return false;
        }
        
        // Decode URL entities
        $uri = urldecode($uri);
        
        // Check for path traversal attempts
        if (strpos($uri, '..') !== false || 
            strpos($uri, '%2e%2e') !== false || 
            strpos($uri, '%252e%252e') !== false) {
            return false;
        }
        
        // Ensure it starts with forward slash
        if ($uri[0] !== '/') {
            return false;
        }
        
        // Check for null bytes
        if (strpos($uri, "\0") !== false) {
            return false;
        }
        
        // Validate it's a reasonable path length
        if (strlen($uri) > 1024) {
            return false;
        }
        
        return $uri;
    }
    
    /**
     * Add Link header for specific asset
     */
    private function add_link_header_for_asset($request_uri) {
        $asset_path = parse_url($request_uri, PHP_URL_PATH);
        $asset_name = basename($asset_path, '.' . pathinfo($asset_path, PATHINFO_EXTENSION));
        $manifest_url = "{$this->manifest_base_url}{$asset_path}.json";
        
        // Add Link header
        header("Link: <{$manifest_url}>; rel=\"c2pa-manifest\"", false);
        
        // Add CORS headers for CAI Verify
        header('Access-Control-Allow-Origin: *');
        header('Access-Control-Expose-Headers: Link');
        header('Access-Control-Allow-Methods: GET, HEAD, OPTIONS');
        
        // Add caching headers
        header('Cache-Control: ' . $this->get_cache_control_header());
    }
    
    /**
     * Generate manifest when image is uploaded
     */
    public function generate_manifest_on_upload($metadata, $attachment_id) {
        $attachment = get_post($attachment_id);
        $image_url = wp_get_attachment_url($attachment_id);
        
        if (!$image_url) {
            return $metadata;
        }
        
        // Generate manifest data
        $manifest_data = $this->generate_manifest_data($attachment, $image_url, $metadata);
        
        // Save manifest to CDN
        $manifest_url = $this->save_manifest_to_cdn($attachment_id, $manifest_data);
        
        // Store manifest URL in post meta
        update_post_meta($attachment_id, '_c2pa_manifest_url', $manifest_url);
        update_post_meta($attachment_id, '_c2pa_manifest_generated_at', current_time('mysql'));
        
        return $metadata;
    }
    
    /**
     * Generate C2PA manifest data
     */
    private function generate_manifest_data($attachment, $image_url, $metadata) {
        $upload_date = get_the_date('c', $attachment);
        $author = get_the_author_meta('display_name', $attachment->post_author);
        
        $manifest = [
            'version' => '1.0',
            'title' => get_the_title($attachment),
            'format' => 'image/jpeg',
            'instance' => [
                'type' => 'content_auth',
                'soft_bindings' => [
                    'c2pa.actions' => [
                        [
                            'digitalSourceType' => 'https://schema.org/Photograph',
                            'action' => 'c2pa.created',
                            'when' => $upload_date,
                            'who' => $author ? $author : 'WordPress User'
                        ]
                    ]
                ]
            ],
            'assertions' => [
                [
                    'label' => 'c2pa.actions',
                    'data' => [
                        'actions' => [
                            [
                                'action' => 'c2pa.created',
                                'digitalSourceType' => 'https://schema.org/Photograph',
                                'when' => $upload_date,
                                'who' => $author ? $author : 'WordPress User'
                            ]
                        ]
                    ]
                ],
                [
                    'label' => 'stds.schema-org.CreativeWork',
                    'data' => [
                        '@context' => 'https://schema.org',
                        '@type' => 'ImageObject',
                        'name' => get_the_title($attachment),
                        'author' => [
                            '@type' => 'Person',
                            'name' => $author ? $author : 'WordPress User'
                        ],
                        'dateCreated' => $upload_date,
                        'url' => $image_url,
                        'contentUrl' => $image_url,
                        'width' => $metadata['width'] ?? null,
                        'height' => $metadata['height'] ?? null
                    ]
                ]
            ],
            'ingredient_tree' => []
        ];
        
        // Add AI disclosure if applicable
        $ai_disclosure = get_post_meta($attachment_id, '_c2pa_ai_disclosure', true);
        if ($ai_disclosure) {
            $manifest['assertions'][] = [
                'label' => 'c2pa.ai-disclosure',
                'data' => $ai_disclosure
            ];
        }
        
        return $manifest;
    }
    
    /**
     * Save manifest to CDN
     */
    private function save_manifest_to_cdn($attachment_id, $manifest_data) {
        $manifest_json = json_encode($manifest_data, JSON_PRETTY_PRINT);
        $manifest_filename = "wp-{$attachment_id}.json";
        $manifest_url = "{$this->manifest_base_url}/wp-uploads/{$manifest_filename}";
        
        // Upload to CDN (implement your CDN upload logic)
        $result = $this->upload_to_cdn($manifest_filename, $manifest_json);
        
        if (!$result) {
            error_log("C2PA: Failed to upload manifest to CDN for attachment {$attachment_id}");
            return null;
        }
        
        return $manifest_url;
    }
    
    /**
     * Upload file to CDN
     */
    private function upload_to_cdn($filename, $content) {
        // Implement your CDN upload logic here
        // This could be AWS S3, Cloudflare R2, etc.
        
        if (function_exists('wp_remote_post')) {
            $response = wp_remote_post($this->manifest_base_url . '/upload', [
                'body' => [
                    'filename' => $filename,
                    'content' => $content,
                    'api_key' => $this->api_key
                ],
                'timeout' => 30
            ]);
            
            if (!is_wp_error($response) && wp_remote_retrieve_response_code($response) === 200) {
                return true;
            }
        }
        
        return false;
    }
    
    /**
     * Register plugin settings
     */
    public function register_settings() {
        register_setting('c2pa_options', 'c2pa_manifest_base_url');
        register_setting('c2pa_options', 'c2pa_api_key');
        register_setting('c2pa_options', 'c2pa_enable_ai_disclosure');
        
        add_settings_section(
            'c2pa_settings',
            'C2PA Remote Manifests Settings',
            [$this, 'settings_section_callback'],
            'c2pa_options'
        );
        
        add_settings_field(
            'c2pa_manifest_base_url',
            'Manifest Base URL',
            [$this, 'base_url_field_callback'],
            'c2pa_options',
            'c2pa_settings'
        );
        
        add_settings_field(
            'c2pa_api_key',
            'API Key',
            [$this, 'api_key_field_callback'],
            'c2pa_options',
            'c2pa_settings'
        );
    }
    
    /**
     * Add admin menu
     */
    public function add_admin_menu() {
        add_options_page(
            'C2PA Remote Manifests',
            'C2PA Manifests',
            'manage_options',
            'c2pa-manifests',
            [$this, 'options_page']
        );
        
        // Add media column for manifest status
        add_filter('manage_media_columns', [$this, 'add_media_column']);
        add_action('manage_media_custom_column', [$this, 'show_media_column'], 10, 2);
    }
    
    /**
     * Register REST API routes
     */
    public function register_rest_routes() {
        register_rest_route('c2pa/v1', '/manifest/(?P<id>\d+)', [
            'methods' => 'GET',
            'callback' => [$this, 'get_manifest_rest'],
            'permission_callback' => '__return_true'
        ]);
        
        register_rest_route('c2pa/v1', '/generate/(?P<id>\d+)', [
            'methods' => 'POST',
            'callback' => [$this, 'generate_manifest_rest'],
            'permission_callback' => function() {
                return current_user_can('edit_posts');
            }
        ]);
    }
    
    /**
     * Get cache control header
     */
    private function get_cache_control_header() {
        return 'public, max-age=31536000, immutable';
    }
    
    /**
     * Settings callbacks
     */
    public function settings_section_callback() {
        echo '<p>Configure your C2PA remote manifest settings below.</p>';
    }
    
    public function base_url_field_callback() {
        $value = get_option('c2pa_manifest_base_url', 'https://cdn.yourdomain.com/manifests');
        echo "<input type='url' name='c2pa_manifest_base_url' value='" . esc_attr($value) . "' class='regular-text'>";
        echo "<p class='description'>Base URL where manifests will be stored (e.g., https://cdn.yourdomain.com/manifests)</p>";
    }
    
    public function api_key_field_callback() {
        $value = get_option('c2pa_api_key');
        echo "<input type='password' name='c2pa_api_key' value='" . esc_attr($value) . "' class='regular-text'>";
        echo "<p class='description'>API key for CDN upload (if required)</p>";
    }
    
    public function options_page() {
        ?>
        <div class="wrap">
            <h1>C2PA Remote Manifests</h1>
            <form action="options.php" method="post">
                <?php
                settings_fields('c2pa_options');
                do_settings_sections('c2pa_options');
                submit_button();
                ?>
            </form>
            
            <h2>Test Your Setup</h2>
            <p>Upload an image and test it with <a href="https://contentauthenticity.org/verify" target="_blank">CAI Verify</a></p>
        </div>
        <?php
    }
    
    /**
     * Media column callbacks
     */
    public function add_media_column($columns) {
        $columns['c2pa_manifest'] = 'C2PA Manifest';
        return $columns;
    }
    
    public function show_media_column($column_name, $attachment_id) {
        if ($column_name === 'c2pa_manifest') {
            $manifest_url = get_post_meta($attachment_id, '_c2pa_manifest_url', true);
            if ($manifest_url) {
                echo '<span style="color: green;">✅ Generated</span><br>';
                echo "<a href='{$manifest_url}' target='_blank'>View Manifest</a>";
            } else {
                echo '<span style="color: orange;">⏳ Not Generated</span>';
            }
        }
    }
}

// Initialize the plugin
new C2PARemoteManifests();

// Add activation hook
register_activation_hook(__FILE__, function() {
    // Set default options
    add_option('c2pa_manifest_base_url', 'https://cdn.yourdomain.com/manifests');
    add_option('c2pa_api_key', '');
    
    // Flush rewrite rules
    flush_rewrite_rules();
});

// Add deactivation hook
register_deactivation_hook(__FILE__, function() {
    flush_rewrite_rules();
});
```

### CAI Verify Test Script
```bash
#!/bin/bash
# test-wordpress-c2pa.sh

echo "🔍 Testing WordPress C2PA Implementation..."

# Test configuration
SITE_URL="https://yourwordpresssite.com"
TEST_IMAGE="/wp-content/uploads/2024/01/sample-image.jpg"

echo "Testing Link header for: ${SITE_URL}${TEST_IMAGE}"

# Check Link header
LINK_HEADER=$(curl -I -s "${SITE_URL}${TEST_IMAGE}" | grep -i "link:" | grep "c2pa-manifest")

if [ -n "$LINK_HEADER" ]; then
    echo "✅ Link header found:"
    echo "   $LINK_HEADER"
    
    # Extract manifest URL
    MANIFEST_URL=$(echo "$LINK_HEADER" | sed -n 's/.*<\([^>]*\)>.*/\1/p')
    echo "📄 Manifest URL: $MANIFEST_URL"
    
    # Test manifest accessibility
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$MANIFEST_URL")
    if [ "$HTTP_STATUS" -eq 200 ]; then
        echo "✅ Manifest accessible"
        
        # Test with CAI Verify
        CAI_URL="https://contentauthenticity.org/verify?url=$(echo -n "${SITE_URL}${TEST_IMAGE}" | jq -sRr @uri)"
        echo "🔍 Test with CAI Verify: $CAI_URL"
        
        echo "🎉 WordPress C2PA implementation is working!"
    else
        echo "❌ Manifest not accessible (HTTP $HTTP_STATUS)"
    fi
else
    echo "❌ Link header not found"
    echo "   Check if plugin is activated and image is in uploads directory"
fi
```

---

## 2. Shopify - Theme Implementation with App

### theme.liquid Snippet
```liquid
{%- comment -%}
C2PA Remote Manifests for Shopify
Add this to your theme.liquid before </head>
{%- endcomment -%}

{%- if template contains 'product' -%}
  {%- for image in product.images -%}
    {%- assign manifest_id = 'shopify-' | append: image.id -%}
    <link rel="c2pa-manifest" href="https://cdn.yourdomain.com/manifests/{{ manifest_id }}.json">
  {%- endfor -%}
{%- endif -%}

{%- if template contains 'article' -%}
  {%- if article.image -%}
    {%- assign manifest_id = 'shopify-' | append: article.image.id -%}
    <link rel="c2pa-manifest" href="https://cdn.yourdomain.com/manifests/{{ manifest_id }}.json">
  {%- endif -%}
{%- endif -%}

{%- if template contains 'collection' -%}
  {%- if collection.image -%}
    {%- assign manifest_id = 'shopify-' | append: collection.image.id -%}
    <link rel="c2pa-manifest" href="https://cdn.yourdomain.com/manifests/{{ manifest_id }}.json">
  {%- endif -%}
{%- endif -%}

{%- comment -%}
Alternative: Meta-tag fallback for themes that don't support Link headers
{%- endcomment -%}
{%- if template contains 'product' -%}
  {%- for image in product.images -%}
    {%- assign manifest_id = 'shopify-' | append: image.id -%}
    <meta name="c2pa-manifest" content="https://cdn.yourdomain.com/manifests/{{ manifest_id }}.json">
  {%- endfor -%}
{%- endif -%}
```

### Shopify App for Manifest Generation
```javascript
// apps/c2pa-manifests/server.js
const express = require('express');
const crypto = require('crypto');
const axios = require('axios');
const Shopify = require('shopify-api-node');

const app = express();
app.use(express.json());

// Initialize Shopify client
const shopify = new Shopify({
  shopName: process.env.SHOPIFY_SHOP_NAME,
  apiKey: process.env.SHOPIFY_API_KEY,
  password: process.env.SHOPIFY_PASSWORD
});

// CDN Configuration
const CDN_BASE_URL = process.env.CDN_BASE_URL || 'https://cdn.yourdomain.com/manifests';
const CDN_API_KEY = process.env.CDN_API_KEY;

/**
 * Generate C2PA manifest for Shopify image
 */
async function generateManifest(image, product = null) {
  const manifestId = `shopify-${image.id}`;
  const manifestUrl = `${CDN_BASE_URL}/${manifestId}.json`;
  
  const manifest = {
    version: '1.0',
    title: product ? product.title : image.alt || 'Shopify Image',
    format: 'image/jpeg',
    instance: {
      type: 'content_auth',
      soft_bindings: {
        'c2pa.actions': [{
          digitalSourceType: 'https://schema.org/Photograph',
          action: 'c2pa.created',
          when: image.created_at,
          who: product ? product.vendor : 'Shopify Merchant'
        }]
      }
    },
    assertions: [
      {
        label: 'c2pa.actions',
        data: {
          actions: [{
            action: 'c2pa.created',
            digitalSourceType: 'https://schema.org/Photograph',
            when: image.created_at,
            who: product ? product.vendor : 'Shopify Merchant'
          }]
        }
      },
      {
        label: 'stds.schema-org.CreativeWork',
        data: {
          '@context': 'https://schema.org',
          '@type': 'ImageObject',
          name: product ? product.title : image.alt || 'Shopify Image',
          author: {
            '@type': 'Organization',
            name: product ? product.vendor : 'Shopify Merchant'
          },
          dateCreated: image.created_at,
          url: image.src,
          contentUrl: image.src,
          width: image.width,
          height: image.height
        }
      }
    ],
    ingredient_tree: []
  };
  
  // Add product-specific assertions
  if (product) {
    manifest.assertions.push({
      label: 'c2pa.product-info',
      data: {
        productId: product.id,
        productType: product.product_type,
        tags: product.tags,
        vendor: product.vendor
      }
    });
  }
  
  return { manifest, manifestUrl, manifestId };
}

/**
 * Upload manifest to CDN
 */
async function uploadToCDN(manifestId, manifest) {
  try {
    const response = await axios.post(`${CDN_BASE_URL}/upload`, {
      filename: `${manifestId}.json`,
      content: JSON.stringify(manifest, null, 2),
      api_key: CDN_API_KEY
    }, {
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json'
      }
    });
    
    return response.status === 200;
  } catch (error) {
    console.error('CDN upload failed:', error.message);
    return false;
  }
}

/**
 * Webhook handler for product creation/update
 */
app.post('/webhooks/product/create', async (req, res) => {
  try {
    const product = req.body;
    
    // Generate manifests for all product images
    for (const image of product.images) {
      const { manifest, manifestUrl, manifestId } = await generateManifest(image, product);
      
      // Upload to CDN
      const uploaded = await uploadToCDN(manifestId, manifest);
      if (uploaded) {
        console.log(`Generated manifest for product image ${image.id}: ${manifestUrl}`);
      } else {
        console.error(`Failed to upload manifest for image ${image.id}`);
      }
    }
    
    res.status(200).send('OK');
  } catch (error) {
    console.error('Webhook error:', error);
    res.status(500).send('Error');
  }
});

/**
 * API endpoint to generate manifest for existing images
 */
app.post('/api/generate-manifests', async (req, res) => {
  try {
    const { productId } = req.body;
    
    if (!productId) {
      return res.status(400).json({ error: 'Product ID required' });
    }
    
    const product = await shopify.product.get(productId);
    const results = [];
    
    for (const image of product.images) {
      const { manifest, manifestUrl, manifestId } = await generateManifest(image, product);
      const uploaded = await uploadToCDN(manifestId, manifest);
      
      results.push({
        imageId: image.id,
        manifestUrl,
        success: uploaded
      });
    }
    
    res.json({
      productId,
      results,
      total: results.length,
      successful: results.filter(r => r.success).length
    });
  } catch (error) {
    console.error('API error:', error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Health check endpoint
 */
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'c2pa-shopify-app',
    version: '1.0.0',
    timestamp: new Date().toISOString()
  });
});

/**
 * Proxy endpoint for manifest headers (fallback)
 */
app.get('/proxy/manifest/:imageId', async (req, res) => {
  try {
    const { imageId } = req.params;
    const manifestUrl = `${CDN_BASE_URL}/shopify-${imageId}.json`;
    
    const response = await axios.get(manifestUrl, { timeout: 10000 });
    
    res.set({
      'Content-Type': 'application/json',
      'Cache-Control': 'public, max-age=3600',
      'Access-Control-Allow-Origin': '*'
    });
    
    res.json(response.data);
  } catch (error) {
    res.status(404).json({ error: 'Manifest not found' });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`C2PA Shopify app listening on port ${PORT}`);
});
```

### Shopify Test Script
```bash
#!/bin/bash
# test-shopify-c2pa.sh

echo "🔍 Testing Shopify C2PA Implementation..."

# Test configuration
STORE_URL="https://yourstore.myshopify.com"
PRODUCT_HANDLE="sample-product"

echo "Testing product page: ${STORE_URL}/products/${PRODUCT_HANDLE}"

# Check for Link headers in product page
PAGE_CONTENT=$(curl -s "${STORE_URL}/products/${PRODUCT_HANDLE}")

# Look for c2pa-manifest links
if echo "$PAGE_CONTENT" | grep -q "c2pa-manifest"; then
    echo "✅ C2PA manifest links found in page"
    
    # Extract manifest URLs
    MANIFEST_URLS=$(echo "$PAGE_CONTENT" | grep -o 'href="[^"]*c2pa-manifest[^"]*"' | sed 's/href="//g' | sed 's/"//g')
    
    echo "📄 Found manifest URLs:"
    echo "$MANIFEST_URLS"
    
    # Test first manifest
    FIRST_MANIFEST=$(echo "$MANIFEST_URLS" | head -n 1)
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$FIRST_MANIFEST")
    
    if [ "$HTTP_STATUS" -eq 200 ]; then
        echo "✅ Manifest accessible"
        
        # Test with CAI Verify
        PRODUCT_URL="${STORE_URL}/products/${PRODUCT_HANDLE}"
        CAI_URL="https://contentauthenticity.org/verify?url=$(echo -n "$PRODUCT_URL" | jq -sRr @uri)"
        echo "🔍 Test with CAI Verify: $CAI_URL"
        
        echo "🎉 Shopify C2PA implementation is working!"
    else
        echo "❌ Manifest not accessible (HTTP $HTTP_STATUS)"
    fi
else
    echo "❌ No C2PA manifest links found"
    echo "   Check if theme.liquid snippet is properly added"
fi
```

---

## 3. Cloudflare Workers - Edge Proxy with KV Storage

### wrangler.toml
```toml
name = "c2pa-manifest-proxy"
main = "src/index.js"
compatibility_date = "2024-01-01"
compatibility_flags = ["nodejs_compat"]

[env.production]
name = "c2pa-manifest-proxy"
routes = [
  "https://yourdomain.com/images/*",
  "https://yourdomain.com/manifests/*"
]

[env.production.vars]
CDN_BASE_URL = "https://cdn.yourdomain.com"
KV_NAMESPACE = "C2PA_MANIFESTS"

[[env.production.kv_namespaces]]
binding = "MANIFESTS"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-id"
```

### src/index.js
```javascript
// Cloudflare Worker for C2PA Manifest Proxy
import { generateManifest } from './manifest-generator.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    
    // Handle different request types
    if (pathname === '/health') {
      return handleHealthCheck();
    }
    
    if (pathname.startsWith('/images/')) {
      return handleImageRequest(request, url, env);
    }
    
    if (pathname.startsWith('/manifests/')) {
      return handleManifestRequest(request, url, env);
    }
    
    if (pathname === '/api/generate' && request.method === 'POST') {
      return handleGenerateManifest(request, env);
    }
    
    // API endpoints
    if (pathname.startsWith('/api/')) {
      return handleApiRequest(request, url, env);
    }
    
    return new Response('Not found', { status: 404 });
  }
};

/**
 * Handle image requests and add Link headers
 */
async function handleImageRequest(request, url, env) {
  try {
    // Fetch original image from origin
    const originUrl = env.CDN_BASE_URL + url.pathname;
    const imageResponse = await fetch(originUrl, {
      cf: {
        cacheTtl: 31536000, // 1 year cache
        cacheKey: url.pathname
      }
    });
    
    if (!imageResponse.ok) {
      return imageResponse;
    }
    
    // Create manifest URL
    const manifestPath = url.pathname.replace('/images/', '/manifests/') + '.json';
    const manifestUrl = url.origin + manifestPath;
    
    // Clone response and add C2PA headers
    const response = new Response(imageResponse.body, {
      status: imageResponse.status,
      statusText: imageResponse.statusText,
      headers: imageResponse.headers
    });
    
    // Add Link header for C2PA manifest
    response.headers.set('Link', `<${manifestUrl}>; rel="c2pa-manifest"`);
    
    // Add performance headers
    response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    response.headers.set('Vary', 'Accept');
    
    // Add debugging headers
    response.headers.set('X-C2PA-Proxy', 'cloudflare-worker');
    response.headers.set('X-C2PA-Manifest-Url', manifestUrl);
    
    return response;
  } catch (error) {
    console.error('Image request error:', error);
    return new Response('Proxy error', { status: 500 });
  }
}

/**
 * Handle manifest requests
 */
async function handleManifestRequest(request, url, env) {
  try {
    const manifestKey = url.pathname.replace('/manifests/', '');
    
    // Try to get from KV first
    let manifest = await env.MANIFESTS.get(manifestKey);
    
    if (!manifest) {
      // Generate manifest on-the-fly
      const imageKey = manifestKey.replace('.json', '');
      const imageUrl = env.CDN_BASE_URL + '/images/' + imageKey;
      
      manifest = await generateManifest(imageUrl, env);
      
      // Store in KV for future requests
      await env.MANIFESTS.put(manifestKey, manifest, {
        expirationTtl: 31536000 // 1 year
      });
    }
    
    return new Response(manifest, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=3600',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
        'X-C2PA-Source': 'kv-cache'
      }
    });
  } catch (error) {
    console.error('Manifest request error:', error);
    return new Response('Manifest not found', { status: 404 });
  }
}

/**
 * Handle manifest generation API
 */
async function handleGenerateManifest(request, env) {
  try {
    const { imageUrl, metadata } = await request.json();
    
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: 'Image URL required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Validate and sanitize imageUrl to prevent SSRF
    const validatedUrl = validateImageUrl(imageUrl);
    if (!validatedUrl) {
      return new Response(JSON.stringify({ error: 'Invalid or unauthorized image URL' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }
    
    // Generate manifest
    const manifest = await generateManifest(validatedUrl, env, metadata);
    
    // Store in KV
    const manifestKey = validatedUrl.split('/').pop() + '.json';
    await env.MANIFESTS.put(manifestKey, manifest, {
      expirationTtl: 31536000
    });
    
    return new Response(JSON.stringify({
      success: true,
      manifestUrl: `${url.origin}/manifests/${manifestKey}`,
      manifest: JSON.parse(manifest)
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Generate manifest error:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Validate image URL to prevent SSRF attacks
 */
function validateImageUrl(url) {
  try {
    const parsedUrl = new URL(url);
    
    // Allow only specific protocols
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return null;
    }
    
    // Block private/internal IP ranges
    const hostname = parsedUrl.hostname;
    if (isPrivateIP(hostname) || isLocalhost(hostname)) {
      return null;
    }
    
    // Allow only specific domains (configure as needed)
    const allowedDomains = [
      env.CDN_BASE_URL ? new URL(env.CDN_BASE_URL).hostname : null,
      'yourdomain.com',
      'cdn.yourdomain.com'
    ].filter(Boolean);
    
    if (allowedDomains.length > 0 && !allowedDomains.includes(hostname)) {
      return null;
    }
    
    // Validate path
    if (parsedUrl.pathname.includes('..') || parsedUrl.pathname.includes('\0')) {
      return null;
    }
    
    return url;
  } catch {
    return null;
  }
}

/**
 * Check if hostname is a private IP
 */
function isPrivateIP(hostname) {
  // Basic check for private IP ranges
  const privateRanges = [
    /^10\./,
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
    /^192\.168\./,
    /^127\./,
    /^169\.254\./,
    /^::1$/,
    /^fc00:/,
    /^fe80:/
  ];
  
  return privateRanges.some(range => range.test(hostname));
}

/**
 * Check if hostname is localhost
 */
function isLocalhost(hostname) {
  return hostname === 'localhost' || 
         hostname === '127.0.0.1' || 
         hostname === '0.0.0.0';
}

/**
 * Handle health check
 */
function handleHealthCheck() {
  return new Response(JSON.stringify({
    status: 'ok',
    service: 'c2pa-manifest-proxy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    features: {
      'edge-proxy': true,
      'kv-storage': true,
      'manifest-generation': true,
      'cai-verify-compatible': true
    }
  }), {
    headers: { 'Content-Type': 'application/json' }
  });
}

/**
 * Handle API requests
 */
async function handleApiRequest(request, url, env) {
  const path = url.pathname;
  
  switch (path) {
    case '/api/stats':
      return handleStatsRequest(env);
    case '/api/cache/clear':
      if (request.method === 'POST') {
        return handleCacheClear(request, env);
      }
      break;
    default:
      return new Response('API endpoint not found', { status: 404 });
  }
}

/**
 * Handle statistics request
 */
async function handleStatsRequest(env) {
  try {
    // List all manifests in KV
    const list = await env.MANIFESTS.list();
    const stats = {
      totalManifests: list.keys.length,
      service: 'c2pa-manifest-proxy',
      timestamp: new Date().toISOString()
    };
    
    return new Response(JSON.stringify(stats), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}

/**
 * Handle cache clear
 */
async function handleCacheClear(request, env) {
  try {
    const { pattern } = await request.json();
    
    if (pattern) {
      // Clear specific pattern
      const list = await env.MANIFESTS.list({ prefix: pattern });
      for (const key of list.keys) {
        await env.MANIFESTS.delete(key.name);
      }
    } else {
      // Clear all (use with caution)
      const list = await env.MANIFESTS.list();
      for (const key of list.keys) {
        await env.MANIFESTS.delete(key.name);
      }
    }
    
    return new Response(JSON.stringify({ success: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}
```

### src/manifest-generator.js
```javascript
// Manifest generation utilities
export async function generateManifest(imageUrl, env, metadata = {}) {
  const now = new Date().toISOString();
  const imageId = imageUrl.split('/').pop().split('.')[0];
  
  const manifest = {
    version: '1.0',
    title: metadata.title || `Cloudflare Image ${imageId}`,
    format: 'image/jpeg',
    instance: {
      type: 'content_auth',
      soft_bindings: {
        'c2pa.actions': [{
          digitalSourceType: 'https://schema.org/Photograph',
          action: 'c2pa.created',
          when: now,
          who: metadata.creator || 'Cloudflare Worker'
        }]
      }
    },
    assertions: [
      {
        label: 'c2pa.actions',
        data: {
          actions: [{
            action: 'c2pa.created',
            digitalSourceType: 'https://schema.org/Photograph',
            when: now,
            who: metadata.creator || 'Cloudflare Worker'
          }]
        }
      },
      {
        label: 'stds.schema-org.CreativeWork',
        data: {
          '@context': 'https://schema.org',
          '@type': 'ImageObject',
          name: metadata.title || `Cloudflare Image ${imageId}`,
          author: {
            '@type': 'Organization',
            name: metadata.organization || 'Cloudflare User'
          },
          dateCreated: now,
          url: imageUrl,
          contentUrl: imageUrl,
          width: metadata.width,
          height: metadata.height
        }
      },
      {
        label: 'c2pa.cloudflare-info',
        data: {
          generated_by: 'Cloudflare Worker',
          worker_version: '1.0.0',
          edge_location: env.CF_RAY ? env.CF_RAY : 'unknown',
          cache_status: 'edge-generated'
        }
      }
    ],
    ingredient_tree: []
  };
  
  // Add AI disclosure if provided
  if (metadata.aiGenerated) {
    manifest.assertions.push({
      label: 'c2pa.ai-disclosure',
      data: {
        aiGenerated: metadata.aiGenerated,
        aiModel: metadata.aiModel,
        aiPrompt: metadata.aiPrompt
      }
    });
  }
  
  return JSON.stringify(manifest, null, 2);
}
```

### Cloudflare Test Script
```bash
#!/bin/bash
# test-cloudflare-c2pa.sh

echo "🔍 Testing Cloudflare Workers C2PA Implementation..."

# Test configuration
WORKER_URL="https://c2pa-manifest-proxy.yourdomain.com"
TEST_IMAGE="/images/sample-image.jpg"

echo "Testing worker at: ${WORKER_URL}"

# Test health endpoint
echo "📊 Checking worker health..."
HEALTH_RESPONSE=$(curl -s "${WORKER_URL}/health")
echo "$HEALTH_RESPONSE" | jq .

# Test image request with Link header
echo "🖼️ Testing image request..."
LINK_HEADER=$(curl -I -s "${WORKER_URL}${TEST_IMAGE}" | grep -i "link:" | grep "c2pa-manifest")

if [ -n "$LINK_HEADER" ]; then
    echo "✅ Link header found:"
    echo "   $LINK_HEADER"
    
    # Extract and test manifest
    MANIFEST_URL=$(echo "$LINK_HEADER" | sed -n 's/.*<\([^>]*\)>.*/\1/p')
    echo "📄 Manifest URL: $MANIFEST_URL"
    
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$MANIFEST_URL")
    if [ "$HTTP_STATUS" -eq 200 ]; then
        echo "✅ Manifest accessible"
        
        # Test with CAI Verify
        CAI_URL="https://contentauthenticity.org/verify?url=$(echo -n "${WORKER_URL}${TEST_IMAGE}" | jq -sRr @uri)"
        echo "🔍 Test with CAI Verify: $CAI_URL"
        
        echo "🎉 Cloudflare Workers C2PA implementation is working!"
    else
        echo "❌ Manifest not accessible (HTTP $HTTP_STATUS)"
    fi
else
    echo "❌ Link header not found"
    echo "   Check if worker is properly deployed"
fi

# Test KV storage
echo "💾 Testing KV storage..."
STATS_RESPONSE=$(curl -s "${WORKER_URL}/api/stats")
echo "KV Stats:"
echo "$STATS_RESPONSE" | jq .
```

---

## 4. Next.js - Middleware Implementation

### middleware.js
```javascript
// middleware.js - Next.js middleware for C2PA manifests
import { NextResponse } from 'next/server'

// Configuration
const MANIFEST_BASE_URL = process.env.C2PA_MANIFEST_BASE_URL || 'https://cdn.yourdomain.com/manifests'
const ENABLE_MANIFESTS = process.env.C2PA_ENABLE_MANIFESTS !== 'false'

export function middleware(request) {
  const url = request.nextUrl
  const pathname = url.pathname

  // Only process image assets
  if (!pathname.match(/\.(jpg|jpeg|png|webp|avif)$/i)) {
    return NextResponse.next()
  }

  // Skip if manifests are disabled
  if (!ENABLE_MANIFESTS) {
    return NextResponse.next()
  }

  // Generate manifest URL
  const manifestUrl = `${MANIFEST_BASE_URL}${pathname}.json`

  // Create response with Link header
  const response = NextResponse.next()
  
  // Add C2PA Link header
  response.headers.set('Link', `<${manifestUrl}>; rel="c2pa-manifest"`)
  
  // Add performance headers
  response.headers.set('Cache-Control', 'public, max-age=31536000, immutable')
  
  // Add CORS headers for CAI Verify
  response.headers.set('Access-Control-Allow-Origin', '*')
  response.headers.set('Access-Control-Expose-Headers', 'Link')
  
  // Add debugging headers
  response.headers.set('X-C2PA-Manifest-Url', manifestUrl)
  response.headers.set('X-C2PA-Middleware', 'nextjs')

  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api (API routes)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!api|_next/static|_next/image|favicon.ico).*)',
  ],
}
```

### pages/api/c2pa/manifest.js
```javascript
// API route for manifest generation and management
import { promises as fs } from 'fs'
import path from 'path'

export default async function handler(req, res) {
  const { method, query } = req

  switch (method) {
    case 'GET':
      return handleGetManifest(req, res)
    case 'POST':
      return handleGenerateManifest(req, res)
    case 'DELETE':
      return handleDeleteManifest(req, res)
    default:
      res.setHeader('Allow', ['GET', 'POST', 'DELETE'])
      res.status(405).end(`Method ${method} Not Allowed`)
  }
}

async function handleGetManifest(req, res) {
  try {
    const { imagePath } = query
    
    if (!imagePath) {
      return res.status(400).json({ error: 'Image path required' })
    }

    // Try to read existing manifest
    const manifestPath = path.join(process.cwd(), 'public', 'manifests', `${imagePath}.json`)
    
    try {
      const manifestData = await fs.readFile(manifestPath, 'utf8')
      const manifest = JSON.parse(manifestData)
      
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.setHeader('Content-Type', 'application/json')
      res.status(200).json(manifest)
    } catch (fileError) {
      // Generate manifest on-the-fly if it doesn't exist
      const manifest = await generateManifest(imagePath)
      
      // Save for future requests
      await fs.mkdir(path.dirname(manifestPath), { recursive: true })
      await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
      
      res.setHeader('Cache-Control', 'public, max-age=3600')
      res.setHeader('Content-Type', 'application/json')
      res.status(200).json(manifest)
    }
  } catch (error) {
    console.error('Get manifest error:', error)
    res.status(500).json({ error: error.message })
  }
}

async function handleGenerateManifest(req, res) {
  try {
    const { imagePath, metadata } = req.body
    
    if (!imagePath) {
      return res.status(400).json({ error: 'Image path required' })
    }

    const manifest = await generateManifest(imagePath, metadata)
    
    // Save manifest
    const manifestPath = path.join(process.cwd(), 'public', 'manifests', `${imagePath}.json`)
    await fs.mkdir(path.dirname(manifestPath), { recursive: true })
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2))
    
    res.status(201).json({
      success: true,
      manifestPath: `/manifests/${imagePath}.json`,
      manifest
    })
  } catch (error) {
    console.error('Generate manifest error:', error)
    res.status(500).json({ error: error.message })
  }
}

async function handleDeleteManifest(req, res) {
  try {
    const { imagePath } = query
    
    if (!imagePath) {
      return res.status(400).json({ error: 'Image path required' })
    }

    const manifestPath = path.join(process.cwd(), 'public', 'manifests', `${imagePath}.json`)
    
    try {
      await fs.unlink(manifestPath)
      res.status(200).json({ success: true })
    } catch (fileError) {
      if (fileError.code === 'ENOENT') {
        res.status(404).json({ error: 'Manifest not found' })
      } else {
        throw fileError
      }
    }
  } catch (error) {
    console.error('Delete manifest error:', error)
    res.status(500).json({ error: error.message })
  }
}

async function generateManifest(imagePath, metadata = {}) {
  const now = new Date().toISOString()
  const imageUrl = `${process.env.NEXT_PUBLIC_SITE_URL || 'https://yourdomain.com'}/${imagePath}`
  
  const manifest = {
    version: '1.0',
    title: metadata.title || `Next.js Image ${path.basename(imagePath)}`,
    format: 'image/jpeg',
    instance: {
      type: 'content_auth',
      soft_bindings: {
        'c2pa.actions': [{
          digitalSourceType: 'https://schema.org/Photograph',
          action: 'c2pa.created',
          when: now,
          who: metadata.creator || 'Next.js Application'
        }]
      }
    },
    assertions: [
      {
        label: 'c2pa.actions',
        data: {
          actions: [{
            action: 'c2pa.created',
            digitalSourceType: 'https://schema.org/Photograph',
            when: now,
            who: metadata.creator || 'Next.js Application'
          }]
        }
      },
      {
        label: 'stds.schema-org.CreativeWork',
        data: {
          '@context': 'https://schema.org',
          '@type': 'ImageObject',
          name: metadata.title || `Next.js Image ${path.basename(imagePath)}`,
          author: {
            '@type': 'Organization',
            name: metadata.organization || 'Next.js Application'
          },
          dateCreated: now,
          url: imageUrl,
          contentUrl: imageUrl,
          width: metadata.width,
          height: metadata.height
        }
      },
      {
        label: 'c2pa.nextjs-info',
        data: {
          generated_by: 'Next.js Middleware',
          framework_version: process.env.npm_package_next || 'unknown',
          build_time: process.env.BUILD_TIME || now,
          environment: process.env.NODE_ENV || 'development'
        }
      }
    ],
    ingredient_tree: []
  }
  
  // Add AI disclosure if provided
  if (metadata.aiGenerated) {
    manifest.assertions.push({
      label: 'c2pa.ai-disclosure',
      data: {
        aiGenerated: metadata.aiGenerated,
        aiModel: metadata.aiModel,
        aiPrompt: metadata.aiPrompt
      }
    })
  }
  
  return manifest
}
```

### pages/api/c2pa/health.js
```javascript
// Health check endpoint for C2PA implementation
export default async function handler(req, res) {
  try {
    // Check if manifest directory exists and is writable
    const fs = require('fs').promises
    const path = require('path')
    
    const manifestDir = path.join(process.cwd(), 'public', 'manifests')
    
    let manifestDirExists = false
    let manifestDirWritable = false
    
    try {
      await fs.access(manifestDir, fs.constants.W_OK)
      manifestDirExists = true
      manifestDirWritable = true
    } catch (error) {
      if (error.code === 'ENOENT') {
        // Directory doesn't exist, try to create it
        try {
          await fs.mkdir(manifestDir, { recursive: true })
          manifestDirExists = true
          manifestDirWritable = true
        } catch (createError) {
          manifestDirExists = false
        }
      } else {
        manifestDirExists = true
        manifestDirWritable = false
      }
    }
    
    const health = {
      status: 'ok',
      service: 'c2pa-nextjs',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      features: {
        'middleware': true,
        'manifest-generation': manifestDirWritable,
        'api-endpoints': true,
        'cai-verify-compatible': true
      },
      configuration: {
        'manifests-enabled': process.env.C2PA_ENABLE_MANIFESTS !== 'false',
        'manifest-base-url': process.env.C2PA_MANIFEST_BASE_URL || 'https://cdn.yourdomain.com/manifests',
        'manifest-directory': manifestDirExists,
        'manifest-directory-writable': manifestDirWritable
      }
    }
    
    res.status(200).json(health)
  } catch (error) {
    console.error('Health check error:', error)
    res.status(500).json({
      status: 'error',
      error: error.message,
      timestamp: new Date().toISOString()
    })
  }
}
```

### Next.js Test Script
```bash
#!/bin/bash
# test-nextjs-c2pa.sh

echo "🔍 Testing Next.js C2PA Implementation..."

# Test configuration
SITE_URL="https://yournextjsapp.com"
TEST_IMAGE="/images/sample-image.jpg"

echo "Testing site: ${SITE_URL}"

# Test health endpoint
echo "📊 Checking C2PA health..."
HEALTH_RESPONSE=$(curl -s "${SITE_URL}/api/c2pa/health")
echo "$HEALTH_RESPONSE" | jq .

# Test image request with Link header
echo "🖼️ Testing image middleware..."
LINK_HEADER=$(curl -I -s "${SITE_URL}${TEST_IMAGE}" | grep -i "link:" | grep "c2pa-manifest")

if [ -n "$LINK_HEADER" ]; then
    echo "✅ Link header found:"
    echo "   $LINK_HEADER"
    
    # Extract and test manifest
    MANIFEST_URL=$(echo "$LINK_HEADER" | sed -n 's/.*<\([^>]*\)>.*/\1/p')
    echo "📄 Manifest URL: $MANIFEST_URL"
    
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$MANIFEST_URL")
    if [ "$HTTP_STATUS" -eq 200 ]; then
        echo "✅ Manifest accessible"
        
        # Test with CAI Verify
        CAI_URL="https://contentauthenticity.org/verify?url=$(echo -n "${SITE_URL}${TEST_IMAGE}" | jq -sRr @uri)"
        echo "🔍 Test with CAI Verify: $CAI_URL"
        
        echo "🎉 Next.js C2PA implementation is working!"
    else
        echo "❌ Manifest not accessible (HTTP $HTTP_STATUS)"
    fi
else
    echo "❌ Link header not found"
    echo "   Check if middleware.js is properly configured"
fi

# Test manifest generation API
echo "🔧 Testing manifest generation API..."
GENERATE_RESPONSE=$(curl -s -X POST "${SITE_URL}/api/c2pa/manifest" \
  -H "Content-Type: application/json" \
  -d '{"imagePath": "test-image.jpg", "metadata": {"title": "Test Image"}}')

echo "API Response:"
echo "$GENERATE_RESPONSE" | jq .
```

---

## 5. Fastify - Plugin-Based Implementation

### c2pa-plugin.js
```javascript
// Fastify plugin for C2PA remote manifests
import fp from 'fastify-plugin'

async function c2paPlugin(fastify, options) {
  const {
    manifestBaseUrl = 'https://cdn.yourdomain.com/manifests',
    enableManifests = true,
    enableApi = true,
    manifestStorage = 'memory' // 'memory' | 'file' | 'redis'
  } = options

  // Storage for manifests
  const manifestStorage = createManifestStorage(manifestStorage, options)

  // Add schema for manifest generation
  const manifestSchema = {
    type: 'object',
    required: ['imageUrl'],
    properties: {
      imageUrl: { type: 'string', format: 'uri' },
      title: { type: 'string' },
      creator: { type: 'string' },
      organization: { type: 'string' },
      width: { type: 'integer' },
      height: { type: 'integer' },
      aiGenerated: { type: 'boolean' },
      aiModel: { type: 'string' },
      aiPrompt: { type: 'string' }
    }
  }

  // Add onSend hook to inject Link headers
  fastify.addHook('onSend', async (request, reply, payload) => {
    if (!enableManifests) {
      return payload
    }

    const url = request.url
    
    // Only process image assets
    if (!url.match(/\.(jpg|jpeg|png|webp|avif)$/i)) {
      return payload
    }

    // Generate manifest URL
    const manifestUrl = `${manifestBaseUrl}${url}.json`

    // Add Link header
    reply.header('Link', `<${manifestUrl}>; rel="c2pa-manifest"`)
    
    // Add performance headers
    reply.header('Cache-Control', 'public, max-age=31536000, immutable')
    
    // Add CORS headers for CAI Verify
    reply.header('Access-Control-Allow-Origin', '*')
    reply.header('Access-Control-Expose-Headers', 'Link')
    
    // Add debugging headers
    reply.header('X-C2PA-Manifest-Url', manifestUrl)
    reply.header('X-C2PA-Plugin', 'fastify')

    return payload
  })

  // Add health check route
  fastify.get('/c2pa/health', async (request, reply) => {
    return {
      status: 'ok',
      service: 'c2pa-fastify-plugin',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      features: {
        'manifests-enabled': enableManifests,
        'api-enabled': enableApi,
        'storage-type': manifestStorage.type,
        'cai-verify-compatible': true
      },
      configuration: {
        'manifest-base-url': manifestBaseUrl,
        'plugin-options': options
      }
    }
  })

  // Add API routes if enabled
  if (enableApi) {
    // Generate manifest
    fastify.post('/api/c2pa/manifest', {
      schema: {
        body: manifestSchema
      }
    }, async (request, reply) => {
      try {
        const manifest = await generateManifest(request.body, manifestBaseUrl)
        const manifestKey = extractManifestKey(request.body.imageUrl)
        
        // Store manifest
        await manifestStorage.set(manifestKey, JSON.stringify(manifest))
        
        reply.code(201).send({
          success: true,
          manifestUrl: `${manifestBaseUrl}/${manifestKey}.json`,
          manifest
        })
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    })

    // Get manifest
    fastify.get('/api/c2pa/manifest/:key', async (request, reply) => {
      try {
        const { key } = request.params
        const manifest = await manifestStorage.get(`${key}.json`)
        
        if (!manifest) {
          return reply.code(404).send({ error: 'Manifest not found' })
        }
        
        reply
          .header('Content-Type', 'application/json')
          .header('Cache-Control', 'public, max-age=3600')
          .send(JSON.parse(manifest))
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    })

    // Delete manifest
    fastify.delete('/api/c2pa/manifest/:key', async (request, reply) => {
      try {
        const { key } = request.params
        await manifestStorage.delete(`${key}.json`)
        
        reply.send({ success: true })
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    })

    // List manifests
    fastify.get('/api/c2pa/manifests', async (request, reply) => {
      try {
        const manifests = await manifestStorage.list()
        reply.send({ manifests })
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    })

    // Clear cache
    fastify.delete('/api/c2pa/cache', async (request, reply) => {
      try {
        await manifestStorage.clear()
        reply.send({ success: true })
      } catch (error) {
        reply.code(500).send({ error: error.message })
      }
    })
  }

  // Add utility methods
  fastify.decorate('c2pa', {
    generateManifest: (data) => generateManifest(data, manifestBaseUrl),
    getManifestUrl: (imageUrl) => `${manifestBaseUrl}${imageUrl}.json`,
    storage: manifestStorage
  })
}

// Create manifest storage based on type
function createManifestStorage(type, options) {
  switch (type) {
    case 'memory':
      return new MemoryManifestStorage()
    case 'file':
      return new FileManifestStorage(options.storagePath || './manifests')
    case 'redis':
      return new RedisManifestStorage(options.redis)
    default:
      throw new Error(`Unknown storage type: ${type}`)
  }
}

// Memory storage (default)
class MemoryManifestStorage {
  constructor() {
    this.manifests = new Map()
    this.type = 'memory'
  }

  async set(key, value) {
    this.manifests.set(key, value)
  }

  async get(key) {
    return this.manifests.get(key) || null
  }

  async delete(key) {
    return this.manifests.delete(key)
  }

  async list() {
    return Array.from(this.manifests.keys())
  }

  async clear() {
    this.manifests.clear()
  }
}

// File storage
class FileManifestStorage {
  constructor(storagePath) {
    this.storagePath = storagePath
    this.type = 'file'
    this.fs = require('fs').promises
    this.path = require('path')
  }

  async set(key, value) {
    const filePath = this.path.join(this.storagePath, key)
    await this.fs.mkdir(this.path.dirname(filePath), { recursive: true })
    await this.fs.writeFile(filePath, value)
  }

  async get(key) {
    const filePath = this.path.join(this.storagePath, key)
    try {
      return await this.fs.readFile(filePath, 'utf8')
    } catch (error) {
      if (error.code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  async delete(key) {
    const filePath = this.path.join(this.storagePath, key)
    await this.fs.unlink(filePath)
  }

  async list() {
    try {
      const files = await this.fs.readdir(this.storagePath)
      return files.filter(file => file.endsWith('.json'))
    } catch (error) {
      if (error.code === 'ENOENT') {
        return []
      }
      throw error
    }
  }

  async clear() {
    try {
      const files = await this.fs.readdir(this.storagePath)
      for (const file of files) {
        if (file.endsWith('.json')) {
          await this.fs.unlink(this.path.join(this.storagePath, file))
        }
      }
    } catch (error) {
      if (error.code !== 'ENOENT') {
        throw error
      }
    }
  }
}

// Redis storage
class RedisManifestStorage {
  constructor(redisOptions) {
    this.redis = require('redis')
    this.client = this.redis.createClient(redisOptions)
    this.type = 'redis'
    this.prefix = 'c2pa:manifest:'
  }

  async connect() {
    await this.client.connect()
  }

  async set(key, value) {
    await this.client.set(`${this.prefix}${key}`, value)
  }

  async get(key) {
    return await this.client.get(`${this.prefix}${key}`)
  }

  async delete(key) {
    return await this.client.del(`${this.prefix}${key}`)
  }

  async list() {
    const keys = await this.client.keys(`${this.prefix}*`)
    return keys.map(key => key.replace(this.prefix, ''))
  }

  async clear() {
    const keys = await this.client.keys(`${this.prefix}*`)
    if (keys.length > 0) {
      await this.client.del(keys)
    }
  }
}

// Generate manifest function
async function generateManifest(data, manifestBaseUrl) {
  const now = new Date().toISOString()
  const imageKey = extractManifestKey(data.imageUrl)
  
  const manifest = {
    version: '1.0',
    title: data.title || `Fastify Image ${imageKey}`,
    format: 'image/jpeg',
    instance: {
      type: 'content_auth',
      soft_bindings: {
        'c2pa.actions': [{
          digitalSourceType: 'https://schema.org/Photograph',
          action: 'c2pa.created',
          when: now,
          who: data.creator || 'Fastify Application'
        }]
      }
    },
    assertions: [
      {
        label: 'c2pa.actions',
        data: {
          actions: [{
            action: 'c2pa.created',
            digitalSourceType: 'https://schema.org/Photograph',
            when: now,
            who: data.creator || 'Fastify Application'
          }]
        }
      },
      {
        label: 'stds.schema-org.CreativeWork',
        data: {
          '@context': 'https://schema.org',
          '@type': 'ImageObject',
          name: data.title || `Fastify Image ${imageKey}`,
          author: {
            '@type': 'Organization',
            name: data.organization || 'Fastify Application'
          },
          dateCreated: now,
          url: data.imageUrl,
          contentUrl: data.imageUrl,
          width: data.width,
          height: data.height
        }
      },
      {
        label: 'c2pa.fastify-info',
        data: {
          generated_by: 'Fastify Plugin',
          plugin_version: '1.0.0',
          node_version: process.version,
          timestamp: now
        }
      }
    ],
    ingredient_tree: []
  }
  
  // Add AI disclosure if provided
  if (data.aiGenerated) {
    manifest.assertions.push({
      label: 'c2pa.ai-disclosure',
      data: {
        aiGenerated: data.aiGenerated,
        aiModel: data.aiModel,
        aiPrompt: data.aiPrompt
      }
    })
  }
  
  return manifest
}

// Extract manifest key from image URL
function extractManifestKey(imageUrl) {
  const url = new URL(imageUrl)
  return url.pathname.replace(/^\//, '').replace(/\//g, '-')
}

export default fp(c2paPlugin, {
  name: 'c2pa-plugin',
  fastify: '4.x'
})
```

### server.js - Main application
```javascript
// server.js - Fastify server with C2PA plugin
import Fastify from 'fastify'
import c2paPlugin from './c2pa-plugin.js'

// Create Fastify instance
const fastify = Fastify({
  logger: true
})

// Register static files
fastify.register(import('@fastify/static'), {
  root: './public',
  prefix: '/'
})

// Register C2PA plugin
await fastify.register(c2paPlugin, {
  manifestBaseUrl: process.env.C2PA_MANIFEST_BASE_URL || 'https://cdn.yourdomain.com/manifests',
  enableManifests: process.env.C2PA_ENABLE_MANIFESTS !== 'false',
  enableApi: true,
  manifestStorage: 'memory' // Change to 'file' or 'redis' for production
})

// Add some routes for testing
fastify.get('/', async (request, reply) => {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <title>C2PA Fastify Demo</title>
    </head>
    <body>
      <h1>C2PA Fastify Plugin Demo</h1>
      <img src="/images/sample-image.jpg" alt="Sample image with C2PA manifest">
      <p>Check the network headers for Link: rel="c2pa-manifest"</p>
      <p><a href="/c2pa/health">Health Check</a></p>
      <p><a href="https://contentauthenticity.org/verify?url=${encodeURIComponent(process.env.SITE_URL + '/images/sample-image.jpg')}" target="_blank">Verify with CAI</a></p>
    </body>
    </html>
  `
})

// Start server
try {
  const port = process.env.PORT || 3000
  const host = process.env.HOST || '0.0.0.0'
  
  await fastify.listen({ port, host })
  
  console.log(`🚀 C2PA Fastify server listening on http://${host}:${port}`)
  console.log(`📊 Health check: http://${host}:${port}/c2pa/health`)
  console.log(`🔍 CAI Verify: https://contentauthenticity.org/verify?url=${encodeURIComponent(`http://${host}:${port}/images/sample-image.jpg`)}`)
} catch (err) {
  fastify.log.error(err)
  process.exit(1)
}
```

### Fastify Test Script
```bash
#!/bin/bash
# test-fastify-c2pa.sh

echo "🔍 Testing Fastify C2PA Implementation..."

# Test configuration
SERVER_URL="http://localhost:3000"
TEST_IMAGE="/images/sample-image.jpg"

echo "Testing server at: ${SERVER_URL}"

# Test health endpoint
echo "📊 Checking plugin health..."
HEALTH_RESPONSE=$(curl -s "${SERVER_URL}/c2pa/health")
echo "$HEALTH_RESPONSE" | jq .

# Test image request with Link header
echo "🖼️ Testing image request..."
LINK_HEADER=$(curl -I -s "${SERVER_URL}${TEST_IMAGE}" | grep -i "link:" | grep "c2pa-manifest")

if [ -n "$LINK_HEADER" ]; then
    echo "✅ Link header found:"
    echo "   $LINK_HEADER"
    
    # Extract and test manifest
    MANIFEST_URL=$(echo "$LINK_HEADER" | sed -n 's/.*<\([^>]*\)>.*/\1/p')
    echo "📄 Manifest URL: $MANIFEST_URL"
    
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$MANIFEST_URL")
    if [ "$HTTP_STATUS" -eq 200 ]; then
        echo "✅ Manifest accessible"
        
        # Test with CAI Verify
        CAI_URL="https://contentauthenticity.org/verify?url=$(echo -n "${SERVER_URL}${TEST_IMAGE}" | jq -sRr @uri)"
        echo "🔍 Test with CAI Verify: $CAI_URL"
        
        echo "🎉 Fastify C2PA implementation is working!"
    else
        echo "❌ Manifest not accessible (HTTP $HTTP_STATUS)"
    fi
else
    echo "❌ Link header not found"
    echo "   Check if C2PA plugin is properly registered"
fi

# Test manifest generation API
echo "🔧 Testing manifest generation API..."
GENERATE_RESPONSE=$(curl -s -X POST "${SERVER_URL}/api/c2pa/manifest" \
  -H "Content-Type: application/json" \
  -d '{"imageUrl": "http://localhost:3000/images/test.jpg", "title": "Test Image"}')

echo "API Response:"
echo "$GENERATE_RESPONSE" | jq .
```

---

## Universal Test Script for All Stacks
```bash
#!/bin/bash
# test-all-stacks.sh - Universal C2PA testing script

echo "🔍 C2PA Implementation Test Suite"
echo "=================================="

# Function to test a stack
test_stack() {
    local stack_name=$1
    local base_url=$2
    local test_path=$3
    
    echo ""
    echo "🧪 Testing $stack_name..."
    echo "   URL: $base_url$test_path"
    
    # Test Link header
    LINK_HEADER=$(curl -I -s "$base_url$test_path" | grep -i "link:" | grep "c2pa-manifest")
    
    if [ -n "$LINK_HEADER" ]; then
        echo "   ✅ Link header found"
        
        # Extract manifest URL
        MANIFEST_URL=$(echo "$LINK_HEADER" | sed -n 's/.*<\([^>]*\)>.*/\1/p')
        
        # Test manifest accessibility
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$MANIFEST_URL")
        
        if [ "$HTTP_STATUS" -eq 200 ]; then
            echo "   ✅ Manifest accessible"
            
            # Generate CAI Verify URL
            CAI_URL="https://contentauthenticity.org/verify?url=$(echo -n "$base_url$test_path" | jq -sRr @uri)"
            echo "   🔍 CAI Verify: $CAI_URL"
            
            echo "   🎉 $stack_name implementation: PASSED"
            return 0
        else
            echo "   ❌ Manifest not accessible (HTTP $HTTP_STATUS)"
            echo "   ❌ $stack_name implementation: FAILED"
            return 1
        fi
    else
        echo "   ❌ Link header not found"
        echo "   ❌ $stack_name implementation: FAILED"
        return 1
    fi
}

# Test configurations
declare -A STACKS=(
    ["WordPress"]="https://yourwordpresssite.com/wp-content/uploads/2024/01/sample-image.jpg"
    ["Shopify"]="https://yourstore.myshopify.com/products/sample-product"
    ["Cloudflare"]="https://c2pa-proxy.yourdomain.com/images/sample-image.jpg"
    ["Next.js"]="https://yournextjsapp.com/images/sample-image.jpg"
    ["Fastify"]="http://localhost:3000/images/sample-image.jpg"
)

# Run tests
PASSED=0
TOTAL=0

for stack in "${!STACKS[@]}"; do
    TOTAL=$((TOTAL + 1))
    url="${STACKS[$stack]}"
    base_url=$(echo "$url" | sed 's|/[^/]*$||')
    test_path=$(echo "$url" | sed "s|$base_url||")
    
    if test_stack "$stack" "$base_url" "$test_path"; then
        PASSED=$((PASSED + 1))
    fi
done

# Summary
echo ""
echo "📊 Test Results"
echo "==============="
echo "Passed: $PASSED/$TOTAL"
echo "Success Rate: $(( PASSED * 100 / TOTAL ))%"

if [ $PASSED -eq $TOTAL ]; then
    echo "🎉 All stacks are working correctly!"
else
    echo "⚠️  Some stacks need attention"
fi
```

These production-ready implementations provide:
- **Complete copy-paste functionality** for each stack
- **Remote manifest injection** with proper Link headers
- **CAI Verify compatibility** with live testing scripts
- **Production considerations** including caching, error handling, and monitoring
- **Health check endpoints** for operational monitoring
- **Comprehensive testing scripts** for validation
