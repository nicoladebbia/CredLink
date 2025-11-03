# Phase 30 Variant Linking - Minimal Configs
# Copy/paste configurations for immediate deployment

## Link Header Configurations

### Rendition Link Header (Same Manifest)
```http
Link: <https://manifests.example.com/sha256/abcd1234ef567890/active.c2pa>; rel="c2pa-manifest"
```

### Derivative Child Link Header
```http
Link: <https://manifests.example.com/sha256/ef567890abcd1234/active.c2pa>; rel="c2pa-manifest"
```

### Multiple Link Headers (Multiple Variants)
```http
Link: <https://manifests.example.com/sha256/parent/active.c2pa>; rel="c2pa-manifest",
      <https://manifests.example.com/sha256/child-crop/active.c2pa>; rel="c2pa-manifest"
```

## Cloudflare Worker Configuration

### Basic Worker Script (wrangler.toml)
```toml
name = "c2pa-variant-worker"
main = "src/edge/variant-worker.ts"
compatibility_date = "2024-01-01"

[env.production]
name = "c2pa-variant-worker-prod"
vars = { ENVIRONMENT = "production" }

[[env.production.kv_namespaces]]
binding = "VARIANT_POLICIES"
id = "your-kv-namespace-id"
preview_id = "your-preview-kv-id"

[[env.production.durable_objects.bindings]]
name = "ASSET_METADATA"
class_name = "AssetMetadataDO"
```

### Worker Environment Variables
```bash
# Production
MANIFEST_SERVICE=https://manifests.yourdomain.com
ENVIRONMENT=production
KV_NAMESPACE=your-kv-namespace-id

# Staging
MANIFEST_SERVICE=https://manifests-staging.yourdomain.com
ENVIRONMENT=staging
KV_NAMESPACE=your-staging-kv-id
```

## Nginx Configuration

### Link Header Injection
```nginx
# For renditions (same manifest)
location ~* ^/media/(.+)/(.+)\.(jpg|jpeg|png|webp)$ {
    add_header "Link" '<https://manifests.example.com/sha256/$1/active.c2pa>; rel="c2pa-manifest"' always;
    
    # Security headers
    add_header "X-Content-Type-Options" "nosniff" always;
    add_header "X-Frame-Options" "DENY" always;
    
    # Proxy to upstream
    proxy_pass https://cdn.example.com;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}

# For derivatives (child manifests)
location ~* ^/media/(.+)/crop-(.+)\.(jpg|jpeg|png|webp)$ {
    add_header "Link" '<https://manifests.example.com/sha256/$1-crop-$2/active.c2pa>; rel="c2pa-manifest"' always;
    
    proxy_pass https://cdn.example.com;
}
```

## Apache Configuration

### .htaccess for Link Headers
```apache
# Enable mod_headers
LoadModule headers_module modules/mod_headers.so

# Rendition Link Headers
<FilesMatch "\.(jpg|jpeg|png|webp)$">
    Header set Link '<https://manifests.example.com/sha256/abcd1234/active.c2pa>; rel="c2pa-manifest"'
</FilesMatch>

# Security Headers
Header always set X-Content-Type-Options "nosniff"
Header always set X-Frame-Options "DENY"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
```

## CDN Configuration

### CloudFront (AWS)
```json
{
  "DistributionConfig": {
    "DefaultCacheBehavior": {
      "ViewerProtocolPolicy": "redirect-to-https",
      "Compress": true,
      "ForwardedValues": {
        "Headers": {
          "Quantity": 1,
          "Items": ["Accept"]
        }
      }
    },
    "CacheBehaviors": {
      "Quantity": 1,
      "Items": [{
        "PathPattern": "/media/*",
        "ViewerProtocolPolicy": "redirect-to-https",
        "ResponseHeadersPolicyId": "your-response-headers-policy-id"
      }]
    }
  }
}
```

### Response Headers Policy (AWS)
```json
{
  "ResponseHeadersPolicyConfig": {
    "Name": "C2PAVariantLinking",
    "CorsConfig": {
      "AccessControlAllowOrigins": {
        "Quantity": 1,
        "Items": ["https://yourdomain.com"]
      }
    },
    "SecurityHeadersConfig": {
      "XSSProtection": {
        "Override": true,
        "Protection": true,
        "ModeBlock": true
      },
      "ContentTypeOptions": {
        "Override": true
      },
      "FrameOptions": {
        "Override": true,
        "FrameOption": "DENY"
      }
    },
    "CustomHeadersConfig": {
      "Quantity": 1,
      "Items": [{
        "Header": "Link",
        "Value": "<https://manifests.example.com/sha256/abcd1234/active.c2pa>; rel=\"c2pa-manifest\"",
        "Override": true
      }]
    }
  }
}
```

## Fastly Configuration

### VCL for Link Header Injection
```vcl
# Rendition Link Header
sub vcl_deliver {
    if (req.url ~ "^/media/" && req.url ~ "\.(jpg|jpeg|png|webp)$") {
        # Extract asset ID from URL
        set resp.http.Link = "<https://manifests.example.com/sha256/" + regsub(req.url, "^/media/([^/]+).*$", "\1") + "/active.c2pa>; rel=\"c2pa-manifest\"";
    }
    
    # Security headers
    set resp.http.X-Content-Type-Options = "nosniff";
    set resp.http.X-Frame-Options = "DENY";
    set resp.http.Referrer-Policy = "strict-origin-when-cross-origin";
}

# Backend selection for manifest service
sub vcl_backend_response {
    if (bereq.url ~ "^/api/sign/derivative") {
        set beresp.ttl = 1h;
        set beresp.grace = 1h;
    }
}
```

## WordPress Plugin

### Minimal WordPress Plugin (c2pa-variant-linking.php)
```php
<?php
/**
 * Plugin Name: C2PA Variant Linking
 * Description: Injects C2PA manifest Link headers for media variants
 * Version: 1.0.0
 */

// Prevent direct access
if (!defined('ABSPATH')) {
    exit;
}

function c2pa_variant_linking_headers($headers) {
    $request_uri = $_SERVER['REQUEST_URI'];
    
    // Check if request is for media file
    if (strpos($request_uri, '/wp-content/uploads/') !== false) {
        // Extract asset ID from filename
        $asset_id = c2pa_extract_asset_id($request_uri);
        if ($asset_id) {
            $manifest_url = 'https://manifests.example.com/wp/' . $asset_id . '/active.c2pa';
            $headers['Link'] = '<' . $manifest_url . '>; rel="c2pa-manifest"';
        }
    }
    
    return $headers;
}

function c2pa_extract_asset_id($url) {
    // Extract numeric ID from WordPress media URL
    if (preg_match('/wp-content/uploads/.*?(\d+)\./', $url, $matches)) {
        return $matches[1];
    }
    return null;
}

// Hook into WordPress headers
add_filter('wp_headers', 'c2pa_variant_linking_headers');

// Add security headers
function c2pa_security_headers($headers) {
    $headers['X-Content-Type-Options'] = 'nosniff';
    $headers['X-Frame-Options'] = 'DENY';
    $headers['Referrer-Policy'] = 'strict-origin-when-cross-origin';
    return $headers;
}
add_filter('wp_headers', 'c2pa_security_headers');
?>
```

## Shopify Theme Integration

### Liquid Template for Link Tags
```liquid
{% comment %} Add to theme.liquid in <head> section {% endcomment %}
{% if product.featured_image contains 'cdn.shopify.com' %}
  {% assign image_id = product.featured_image | split: 'files/' | last | split: '.' | first %}
  <link rel="c2pa-manifest" href="https://manifests.example.com/shopify/{{ image_id }}/active.c2pa">
{% endif %}

{% comment %} For all product images {% endcomment %}
{% for image in product.images %}
  {% assign image_id = image.src | split: 'files/' | last | split: '.' | first %}
  <link rel="c2pa-manifest" href="https://manifests.example.com/shopify/{{ image_id }}/active.c2pa">
{% endfor %}
```

### Shopify JavaScript for Dynamic Content
```javascript
// Add to theme.js
(function() {
    function injectC2PALinks() {
        const images = document.querySelectorAll('img[src*="cdn.shopify.com"]');
        images.forEach(img => {
            const src = img.src;
            const imageId = src.match(/files\/(\d+)/)?.[1];
            if (imageId && !img.dataset.c2paProcessed) {
                const manifestUrl = `https://manifests.example.com/shopify/${imageId}/active.c2pa`;
                const link = document.createElement('link');
                link.rel = 'c2pa-manifest';
                link.href = manifestUrl;
                document.head.appendChild(link);
                img.dataset.c2paProcessed = 'true';
            }
        });
    }
    
    // Run on page load
    document.addEventListener('DOMContentLoaded', injectC2PALinks);
    
    // Watch for dynamic content
    const observer = new MutationObserver(injectC2PALinks);
    observer.observe(document.body, { childList: true, subtree: true });
})();
```

## Static Site HTML

### HTML with Link Tags
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Page with C2PA Variants</title>
    
    <!-- C2PA Manifest Links -->
    <link rel="c2pa-manifest" href="https://manifests.example.com/sha256/abcd1234/active.c2pa">
    <link rel="c2pa-manifest" href="https://manifests.example.com/sha256/ef567890/active.c2pa">
    
    <!-- Security Headers -->
    <meta http-equiv="X-Content-Type-Options" content="nosniff">
    <meta http-equiv="X-Frame-Options" content="DENY">
    <meta http-equiv="Referrer-Policy" content="strict-origin-when-cross-origin">
</head>
<body>
    <!-- Content with variants -->
    <img src="/media/1234.jpg" alt="Original">
    <img src="/media/1234?w=800.jpg" alt="Resize">
    <img src="/media/1234-crop.jpg" alt="Crop">
</body>
</html>
```

## Docker Configuration

### Dockerfile for API Service
```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY src/ ./src/
COPY dist/ ./dist/

# Environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV MANIFEST_SERVICE=https://manifests.example.com

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
CMD ["node", "dist/index.js"]
```

### Docker Compose
```yaml
version: '3.8'

services:
  c2pa-variant-api:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MANIFEST_SERVICE=https://manifests.example.com
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    restart: unless-stopped

volumes:
  redis_data:
```

## Kubernetes Configuration

### Deployment YAML
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: c2pa-variant-api
spec:
  replicas: 3
  selector:
    matchLabels:
      app: c2pa-variant-api
  template:
    metadata:
      labels:
        app: c2pa-variant-api
    spec:
      containers:
      - name: api
        image: c2pa-variant-api:latest
        ports:
        - containerPort: 3000
        env:
        - name: NODE_ENV
          value: "production"
        - name: MANIFEST_SERVICE
          value: "https://manifests.example.com"
        - name: REDIS_URL
          value: "redis://redis-service:6379"
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 3000
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: c2pa-variant-service
spec:
  selector:
    app: c2pa-variant-api
  ports:
  - port: 80
    targetPort: 3000
  type: ClusterIP
```

## Environment Configuration

### .env.example
```bash
# Variant Linking Configuration
MANIFEST_SERVICE=https://manifests.example.com
ENVIRONMENT=production
LOG_LEVEL=info

# Cache Configuration
REDIS_URL=redis://localhost:6379
CACHE_TTL=3600

# Security Configuration
ENABLE_SECURITY_HEADERS=true
BLOCK_PRIVATE_IPS=true
RATE_LIMIT_REQUESTS=100
RATE_LIMIT_WINDOW=60000

# Performance Configuration
MAX_VARIANT_CACHE_SIZE=1000
VERIFICATION_TIMEOUT=30000

# CDN Configuration
CDN_ORIGIN=https://cdn.example.com
ENABLE_CDN_LINK_INJECTION=true
```

## Monitoring Configuration

### Prometheus Metrics
```yaml
# prometheus.yml
global:
  scrape_interval: 15s

scrape_configs:
  - job_name: 'c2pa-variant-api'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scrape_interval: 5s
```

### Grafana Dashboard (JSON excerpt)
```json
{
  "dashboard": {
    "title": "C2PA Variant Linking",
    "panels": [
      {
        "title": "Verification P95 Latency",
        "type": "stat",
        "targets": [
          {
            "expr": "histogram_quantile(0.95, rate(c2pa_verification_duration_seconds_bucket[5m]))",
            "legendFormat": "P95"
          }
        ]
      },
      {
        "title": "Cache Hit Rate",
        "type": "stat",
        "targets": [
          {
            "expr": "rate(c2pa_cache_hits_total[5m]) / (rate(c2pa_cache_hits_total[5m]) + rate(c2pa_cache_misses_total[5m])) * 100",
            "legendFormat": "Hit Rate %"
          }
        ]
      }
    ]
  }
}
```

---

**Usage Instructions:**

1. **Copy the relevant configuration** for your infrastructure
2. **Replace placeholder values** (manifest URLs, domains, etc.)
3. **Deploy according to your platform's deployment process**
4. **Test with acceptance tests** to ensure compliance
5. **Monitor performance** using provided metrics configurations

**Critical Requirements:**

- All Link headers must include `rel="c2pa-manifest"`
- Security headers must be present on all responses
- Private IP blocking must be enabled
- Rate limiting should be configured (100 req/min default)
- Monitoring should track P95 ≤ 600ms verification time
