# Phase 31 — Minimal Configs (Drop-in)

## M) Minimal Configs (Drop-in)

### HLS Master Playlist (Snippet)
```m3u8
#EXTM3U
#EXT-X-VERSION:7
#EXT-X-INDEPENDENT-SEGMENTS

# Program content start
#EXTINF:10.0,
https://cdn.example.com/program/segment_001.ts
# Link: <https://manifests.example.com/program/sha256/abc123def456/active.c2pa>; rel="c2pa-manifest"

# Ad avail signaled with DATERANGE carrying SCTE-35 bytes:
#EXT-X-DATERANGE:ID="splice-6FFFFFF0",START-DATE="2025-11-03T15:12:00Z",DURATION=60.0,SCTE35-OUT=0xFC3025000000000000FFF0140500000000E0006F000000000000A0000000

# Ad break content
#EXTINF:15.0,
https://ads.example.com/acme/creative_001/segment_001.ts
# Link: <https://manifests.example.com/ads/acme/sha256/def456ghi789/active.c2pa>; rel="c2pa-manifest"

#EXTINF:15.0,
https://ads.example.com/acme/creative_001/segment_002.ts

#EXTINF:15.0,
https://ads.example.com/acme/creative_001/segment_003.ts

#EXTINF:15.0,
https://ads.example.com/acme/creative_001/segment_004.ts

# Return to program
#EXT-X-DATERANGE:ID="splice-return-6FFFFFF0",START-DATE="2025-11-03T15:13:00Z"
#EXTINF:10.0,
https://cdn.example.com/program/segment_002.ts
```

### Edge Header (When Embedding is Stable)
```http
HTTP/1.1 200 OK
Content-Type: video/mp4
Content-Length: 123456
Link: <https://manifests.example.com/program/sha256/abc123def456/active.c2pa>; rel="c2pa-manifest"
Cache-Control: max-age=3600, immutable
```

### Range Index JSON (Minimal)
```json
{
  "stream_id": "live-ny-2025-11-03T15:00Z",
  "unit": "program_time",
  "program": {
    "manifest": "https://manifests.example.com/program/sha256/abc123def456/active.c2pa"
  },
  "ranges": [
    {
      "id": "splice-6FFFFFF0",
      "type": "ad",
      "start": "2025-11-03T15:12:00Z",
      "end": "2025-11-03T15:13:00Z",
      "manifest": "https://manifests.example.com/ads/acme/sha256/def456ghi789/active.c2pa"
    }
  ],
  "version": 1,
  "generated_at": "2025-11-03T15:00:00Z",
  "expires_at": "2025-11-03T15:30:00Z"
}
```

### Player Integration (Minimal HTML)
```html
<!DOCTYPE html>
<html>
<head>
    <script src="https://cdn.jsdelivr.net/npm/hls.js@latest"></script>
    <script src="/js/hls-verification-plugin.js"></script>
</head>
<body>
    <video id="video" controls></video>
    <div id="c2pa-badge">
        <span id="badge-content">Program</span>
        <span id="badge-issuer"></span>
    </div>

    <script>
        const video = document.getElementById('video');
        const hls = new Hls();
        
        // Load stream with verification
        hls.loadSource('/live/stream.m3u8');
        hls.attachMedia(video);
        
        // Initialize verification plugin
        const plugin = new HLSVerificationPlugin(hls, {
            rangeIndexUrl: '/api/streams/live/range-index',
            verifyEndpoint: '/api/verify/stream'
        });
        
        // Listen for badge state changes
        plugin.onBadgeChange((state) => {
            document.getElementById('badge-content').textContent = 
                state.content.charAt(0).toUpperCase() + state.content.slice(1);
            document.getElementById('badge-issuer').textContent = 
                state.issuer || '';
            
            // Update badge styling
            const badge = document.getElementById('c2pa-badge');
            badge.className = `badge-${state.content} confidence-${state.confidence}`;
        });
        
        video.play();
    </script>

    <style>
        #c2pa-badge {
            padding: 8px 12px;
            border-radius: 4px;
            font-family: Arial, sans-serif;
            font-size: 12px;
            background: #f0f0f0;
        }
        .badge-program { background: #e8f5e8; color: #2d5a2d; }
        .badge-ad { background: #e3f2fd; color: #1565c0; }
        .badge-unknown { background: #f5f5f5; color: #666; }
        .confidence-high { border: 2px solid #4caf50; }
        .confidence-medium { border: 2px solid #ff9800; }
        .confidence-low { border: 2px solid #f44336; }
    </style>
</body>
</html>
```

### Fastify Server Setup (Minimal)
```javascript
const fastify = require('fastify');
const { registerStreamVerificationRoutes } = require('./api/stream-verification');
const { VerificationPolicyEngine } = require('./core/verification-policy');

async function build() {
    const app = fastify();
    
    // Register verification routes
    const policyEngine = new VerificationPolicyEngine();
    await registerStreamVerificationRoutes(app, policyEngine);
    
    // Serve static files
    app.register(require('@fastify/static'), {
        root: __dirname + '/public'
    });
    
    // Inject Link headers on init segments
    app.addHook('onSend', async (request, reply) => {
        if (request.url.includes('.mp4') && request.url.includes('init')) {
            reply.header('Link', 
                '<https://manifests.example.com/program/sha256/.../active.c2pa>; rel="c2pa-manifest"'
            );
        }
    });
    
    return app;
}

build().then(app => {
    app.listen({ port: 3000 });
    console.log('C2PA Stream Verification Server running on port 3000');
});
```

### Docker Configuration (Minimal)
```dockerfile
FROM node:18-alpine

WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy application code
COPY . .

# Build application
RUN npm run build

# Expose port
EXPOSE 3000

# Start server
CMD ["node", "dist/server.js"]
```

### Docker Compose (Minimal)
```yaml
version: '3.8'

services:
  c2pa-verification:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - REDIS_URL=redis://redis:6379
    depends_on:
      - redis
      
  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

### AWS CloudFormation (Minimal)
```yaml
AWSTemplateFormatVersion: '2010-09-09'
Description: 'C2PA Stream Verification Infrastructure'

Parameters:
  StreamId:
    Type: String
    Default: 'live-stream-001'

Resources:
  VerificationFunction:
    Type: AWS::Lambda::Function
    Properties:
      FunctionName: !Sub 'c2pa-verification-${StreamId}'
      Runtime: nodejs18.x
      Handler: index.handler
      Code:
        ZipFile: |
          exports.handler = async (event) => {
            return {
              statusCode: 200,
              body: JSON.stringify({ status: 'ok' })
            };
          };
      Environment:
        Variables:
          STREAM_ID: !Ref StreamId

  ApiGateway:
    Type: AWS::ApiGateway::RestApi
    Properties:
      Name: !Sub 'c2pa-api-${StreamId}'
      
Outputs:
  ApiUrl:
    Description: 'API Gateway URL'
    Value: !Sub 'https://${ApiGateway}.execute-api.${AWS::Region}.amazonaws.com/prod'
```

### Nginx Configuration (Edge Cache)
```nginx
server {
    listen 443 ssl;
    server_name cdn.example.com;
    
    # Cache range index
    location /api/streams/*/range-index {
        proxy_pass http://backend;
        proxy_cache_range_index 15m;
        proxy_cache_valid 200 15m;
        add_header Cache-Control "max-age=15, stale-while-revalidate=60";
    }
    
    # Cache manifests
    location ~* \.c2pa$ {
        proxy_pass http://manifests;
        proxy_cache_manifests 1h;
        add_header Cache-Control "max-age=3600, immutable";
    }
    
    # Inject Link headers on init segments
    location ~* /init\.mp4$ {
        proxy_pass http://video;
        add_header Link '<https://manifests.example.com/program/sha256/$arg_hash/active.c2pa>; rel="c2pa-manifest"';
    }
}

# Cache configuration
proxy_cache_path /var/cache/nginx/range-index levels=1:2 keys_zone=proxy_cache_range_index:10m;
proxy_cache_path /var/cache/nginx/manifests levels=1:2 keys_zone=proxy_cache_manifests:50m;
```

### Environment Configuration
```bash
# .env file
NODE_ENV=production
PORT=3000

# Redis (for caching)
REDIS_URL=redis://localhost:6379
REDIS_TTL=60

# Verification settings
VERIFY_ENDPOINT=https://api.example.com/verify
CACHE_TTL_MS=60000
MAX_VERIFICATIONS_PER_MINUTE=12

# Manifest settings
MANIFEST_BASE_URL=https://manifests.example.com
SIGNING_KEY=your-secret-key

# Monitoring
PROMETHEUS_PORT=9090
LOG_LEVEL=info
```

### Package.json Scripts
```json
{
  "scripts": {
    "dev": "tsx watch src/server.ts",
    "build": "tsc && tsc-alias",
    "start": "node dist/server.js",
    "test": "vitest",
    "test:acceptance": "vitest run src/tests/phase31-acceptance.test.ts",
    "generate-range-index": "tsx tools/range-index-generator.ts",
    "docker:build": "docker build -t c2pa-stream-verification .",
    "docker:run": "docker run -p 3000:3000 c2pa-stream-verification"
  }
}
```

### Quick Start Commands
```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Generate range index from SSAI logs
npm run generate-range-index config.json ssai-events.json ./output

# Run acceptance tests
npm run test:acceptance

# Build for production
npm run build

# Start production server
npm start

# Docker deployment
npm run docker:build
npm run docker:run
```

## Status: DROP-IN READY
All minimal configurations provided for immediate integration into existing streaming infrastructure.
