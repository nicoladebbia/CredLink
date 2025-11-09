# CredLink SDK - JavaScript/TypeScript v1.3.0

[![npm version](https://badge.fury.io/js/%40c2concierge%2Fsdk.svg)](https://badge.fury.io/js/%40c2concierge%2Fsdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-4.9+-blue.svg)](https://www.typescriptlang.org/)

A comprehensive JavaScript/TypeScript SDK for cryptographic provenance verification and signing with the CredLink API.

## ✨ Features

- 🚀 **HTTP API wrapper** with automatic retries and exponential backoff
- 🔒 **Comprehensive error handling** with actionable hints and search-friendly messages
- ⚡ **Circuit breaker** for resilience against service outages
- 📊 **Optional OpenTelemetry telemetry** for observability
- 🎯 **Full TypeScript support** with generated types from OpenAPI
- 🔄 **Idempotency support** for safe retry mechanisms
- 📦 **Streaming responses** for batch operations
- 🛡️ **Security hardening** with timeout enforcement and input validation

## 📦 Installation

```bash
npm install @c2concierge/sdk
```

## 🚀 Quick Start

```typescript
import { Client } from '@c2concierge/sdk';

// Initialize client
const client = new Client({ 
  apiKey: process.env.C2_API_KEY 
});

// Verify an asset
const result = await client.verify('https://example.com/image.jpg', {
  policyId: 'default'
});

console.log('Asset verified:', result.data.verified);

// Verify page assets during build
for await (const asset of client.verifyPage('https://site.example/article')) {
  if (!asset.verified) {
    throw new Error(`Verification failed: ${asset.error}`);
  }
}
```

## 📖 API Reference

### Client Configuration

```typescript
const client = new Client({
  apiKey: 'your-api-key',
  baseUrl: 'https://api.c2concierge.com/v1',     // Optional
  timeoutMs: 30000,                              // Optional
  telemetry: {                                   // Optional
    enabled: true,
    otel: {
      serviceName: 'my-app',
      serviceVersion: '1.0.0'
    }
  },
  retries: {                                     // Optional
    maxAttempts: 5,
    baseMs: 250,
    maxMs: 5000,
    jitter: true
  }
});
```

### Asset Verification

```typescript
// Verify by URL
const result = await client.verify('https://example.com/image.jpg', {
  policyId: 'default',
  timeout: 5000,
  cachedEtag: '"abc123def456"',
  enableDelta: true
});

// Verify by content
const result = await client.verify('base64-encoded-content', {
  policyId: 'default',
  contentType: 'image/jpeg'
});
```

### Page Verification

```typescript
// Verify all assets on a page
for await (const asset of client.verifyPage('https://example.com/article', {
  followLinks: true,
  maxDepth: 2,
  policyId: 'default'
})) {
  console.log(`${asset.url}: ${asset.verified ? '✅' : '❌'}`);
}
```

### Batch Verification

```typescript
// Verify multiple assets
const assets = [
  'https://example.com/image1.jpg',
  'https://example.com/image2.png',
  'https://example.com/video.mp4'
];

for await (const result of client.batchVerify(assets, {
  parallel: true,
  timeoutPerAsset: 5000
})) {
  if (result.result?.verified) {
    console.log(`✅ ${result.asset.url}`);
  } else {
    console.log(`❌ ${result.asset.url}: ${result.error?.message}`);
  }
}
```

### Link Injection

```typescript
// Inject C2PA manifest links into HTML
const modifiedHtml = await client.injectLink(htmlContent, {
  manifestUrl: 'https://manifests.example.com/{sha256}.c2pa',
  strategy: 'sha256_path',
  selector: 'img[src], video[src]'
});
```

### Folder Signing

```typescript
// Sign a folder with RFC-3161 timestamps
const job = await client.signFolder('./public/images', {
  profileId: 'newsroom-default',
  tsa: true,
  recursive: true,
  filePatterns: ['*.jpg', '*.png', '*.mp4']
});

// Monitor job progress
const status = await client.getJobStatus(job.data.job_id);
console.log('Job status:', status.status);
```

### Manifest Operations

```typescript
// Get manifest with conditional request
const manifest = await client.getManifest(hash, {
  cachedEtag: '"abc123def456"',
  format: 'json'
});

// Store manifest with idempotency
const result = await client.putManifest(hash, manifestContent, {
  contentType: 'application/c2pa',
  idempotencyKey: 'unique-key-for-this-manifest'
});
```

## 🔧 Error Handling

The SDK provides comprehensive error handling with actionable hints:

```typescript
import { 
  C2ConciergeError, 
  RateLimitError, 
  ValidationError,
  AuthError 
} from '@c2concierge/sdk';

try {
  await client.verify('https://example.com/image.jpg', { policyId: 'default' });
} catch (error) {
  if (error instanceof RateLimitError) {
    console.log(error.getSummary()); // "C2C RateLimitError: 429 (Retry-After=60s) - Rate limit exceeded"
    console.log(error.retryAfter);   // 60
    console.log(error.getNextSteps()); // ["Implement exponential backoff with jitter", ...]
  } else if (error instanceof ValidationError) {
    console.log(error.hint); // "Check required fields and data formats"
  } else if (error instanceof C2ConciergeError) {
    console.log(error.requestId); // Request ID for debugging
    console.log(error.docsUrl);   // Link to documentation
  }
}
```

## 📊 Telemetry

Enable OpenTelemetry for observability:

```typescript
import { Client } from '@c2concierge/sdk';

const client = new Client({
  apiKey: process.env.C2_API_KEY,
  telemetry: {
    enabled: true,
    otel: {
      serviceName: 'my-app',
      serviceVersion: '1.0.0'
    }
  }
});
```

Install the optional telemetry packages:

```bash
npm install @opentelemetry/api @opentelemetry/sdk-node @opentelemetry/exporter-otlp-grpc
```

## 🔄 Retries and Backoff

The SDK automatically handles retries with exponential backoff:

- **Default attempts**: 5 (1 initial + 4 retries)
- **Base delay**: 250ms
- **Maximum delay**: 5s
- **Jitter**: Full jitter enabled
- **Retry conditions**: 429, 408, 409 (with same idempotency key), 5xx, network errors

Configure custom retry behavior:

```typescript
const client = new Client({
  apiKey: process.env.C2_API_KEY,
  retries: {
    maxAttempts: 3,
    baseMs: 500,
    maxMs: 10000,
    jitter: true
  }
});
```

## 🛡️ Security Best Practices

### API Key Management

```typescript
// Never hardcode API keys
const client = new Client({ 
  apiKey: process.env.C2_API_KEY 
});

// Use environment variables or secret management
```

### Content Security

```typescript
// Always validate content type when using buffers
await client.verify(base64Content, {
  policyId: 'default',
  contentType: 'image/jpeg' // Required for buffer verification
});
```

### Idempotency

```typescript
// Use idempotency keys for safe retries
const result = await client.signFolder('./images', {
  profileId: 'default',
  idempotencyKey: 'unique-operation-id'
});
```

## 📝 Examples

### Build Integration

```typescript
// verify-build.js - Verify assets during build process
import { Client } from '@c2concierge/sdk';

const client = new Client({ apiKey: process.env.C2_API_KEY });

async function verifyBuildAssets(pageUrls: string[]) {
  for (const url of pageUrls) {
    let verifiedCount = 0;
    let totalCount = 0;

    for await (const asset of client.verifyPage(url)) {
      totalCount++;
      if (asset.verified) {
        verifiedCount++;
      } else {
        console.error(`❌ ${asset.url}: ${asset.error}`);
        process.exit(1);
      }
    }

    console.log(`✅ ${url}: ${verifiedCount}/${totalCount} assets verified`);
  }
}

verifyBuildAssets([
  'https://mysite.com/home',
  'https://mysite.com/about',
  'https://mysite.com/contact'
]);
```

### Batch Processing

```typescript
// batch-verify.js - Process RSS feeds or asset lists
import { Client } from '@c2concierge/sdk';

const client = new Client({ apiKey: process.env.C2_API_KEY });

async function batchVerifyFromFeed(feedUrl: string) {
  // Extract URLs from RSS feed
  const assetUrls = await extractUrlsFromFeed(feedUrl);
  
  const results = [];
  for await (const result of client.batchVerify(assetUrls)) {
    results.push({
      url: result.asset.url,
      verified: result.result?.verified || false,
      error: result.error?.message
    });
  }

  // Generate report
  const verified = results.filter(r => r.verified).length;
  console.log(`Batch verification complete: ${verified}/${results.length} verified`);
  
  return results;
}
```

## 🔧 Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage

# Build the package
npm run build

# Run linting
npm run lint

# Format code
npm run format

# Type checking
npm run verify
```

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details.

## 🔗 Links

- [Documentation](https://docs.c2concierge.com)
- [API Reference](https://docs.c2concierge.com/api)
- [Examples](../../examples/)
- [GitHub Repository](https://github.com/Nickiller04/CredLink)
- [Bug Reports](https://github.com/Nickiller04/CredLink/issues)
- [Security Policy](../../SECURITY.md)

## 🤝 Contributing

Contributions are welcome! Please see [CONTRIBUTING.md](../../CONTRIBUTING.md) for details.

## 📋 Changelog

See [CHANGELOG.md](CHANGELOG.md) for a detailed history of changes.
