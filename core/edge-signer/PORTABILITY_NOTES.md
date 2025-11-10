# Phase 27: Portability Notes (Fastly, Vercel)

## Fastly Compute Adaptation

### Runtime Compatibility
```rust
// Fastly Compute WASM support
// ✅ Full WASM runtime support
// ✅ WebCrypto API (subset)
// ✅ HTTP client for external calls
// ✅ Edge KV for configuration
// ❌ Limited CPU time (50ms default, 300ms max)
```

### Fastly Implementation Changes
```typescript
// fastly/compute/src/main.ts
import { wasm } from "fastly:experimental-wasm";
import { env } from "fastly:env";

class FastlyEdgeSigner {
  private wasmModule: WebAssembly.Module;
  
  async initialize() {
    // Load WASM module (Fastly-specific path)
    const wasmBytes = await include_bytes!("../wasm/signer_core.wasm");
    this.wasmModule = await WebAssembly.compile(wasmBytes);
  }
  
  async signRequest(request: Request): Promise<Response> {
    // Fastly-specific request handling
    const body = await request.json();
    
    // Call central signer (Fastly HTTP client)
    const signerResponse = await fetch(env.get("CENTRAL_SIGNER_URL"), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${env.get("SIGNER_API_KEY")}`
      },
      body: JSON.stringify({
        tbs_bytes: await this.prepareTBS(body),
        tenant_id: body.tenant_id
      })
    });
    
    return this.createResponse(signerResponse);
  }
}
```

### Fastly Configuration
```toml
# fastly.toml
name = "c2pa-edge-signer"
description = "C2PA Edge Signing for Fastly Compute"
authors = ["CredLink Team"]

[scripts]
build = "cargo build --bin fastly_edge_signer --release --target wasm32-wasi"

[[services]]
name = "edge-signer"
path = "fastly/compute/src/main.ts"

[local_server]
backend_url = "http://localhost:3000"

[setup]
backends = [
  { name = "central_signer", url = "https://signer.example.com" }
]

[kv_stores]
[[kv_stores.config]]
name = "edge_config"
store_id = "your-kv-store-id"
```

### Fastly Limitations & Workarounds
| Limitation | Impact | Workaround |
|------------|--------|------------|
| CPU time 50ms default | May timeout on complex assets | Use simplified TBS preparation |
| No Smart Placement | Manual region optimization | Route to nearest POP |
| Limited WebCrypto | Ed25519 not supported | Use ES256 only |
| No Durable Objects | Rate limiting challenges | Use KV-based counters |

## Vercel Edge Functions Adaptation

### Runtime Compatibility
```typescript
// Vercel Edge Functions support
// ✅ WebCrypto API (modern curves)
// ✅ WASM support (limited size)
// ✅ Edge Runtime (Node.js API subset)
// ✅ Environment variables
// ❌ No KV storage (use external)
// ❌ Limited execution time (30s)
```

### Vercel Implementation
```typescript
// vercel/edge/api/edge-signer.ts
import { NextRequest, NextResponse } from 'next/server';
import { prepareTBS } from '../wasm/signer-core.js';

export const config = {
  runtime: 'edge',
  regions: ['iad1', 'sfo1', 'fra1'], // Vercel regions
};

export default async function handler(req: NextRequest) {
  if (req.method !== 'POST') {
    return new NextResponse('Method not allowed', { status: 405 });
  }
  
  const body = await req.json();
  
  try {
    // Prepare TBS bytes (WASM module)
    const tbsBytes = await prepareTBS(body.assertions);
    
    // Call central signer
    const signerResponse = await fetch(process.env.CENTRAL_SIGNER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SIGNER_API_KEY}`,
      },
      body: JSON.stringify({
        tbs_hash: Array.from(tbsBytes),
        tenant_id: body.tenant_id,
        algorithm: 'ES256'
      })
    });
    
    const result = await signerResponse.json();
    
    return NextResponse.json({
      manifest_url: result.manifest_url,
      signing_mode: 'edge-tbs+remote-es256',
      ...result.timing
    });
    
  } catch (error) {
    return NextResponse.json(
      { error: 'Signing failed', message: error.message },
      { status: 500 }
    );
  }
}
```

### Vercel Configuration
```json
// vercel.json
{
  "functions": {
    "api/edge-signer.ts": {
      "runtime": "edge",
      "regions": ["iad1", "sfo1", "fra1"],
      "maxDuration": 30
    }
  },
  "env": {
    "CENTRAL_SIGNER_URL": "@central-signer-url",
    "SIGNER_API_KEY": "@signer-api-key",
    "KMS_REGION": "us-east-1"
  },
  "build": {
    "env": {
      "NEXT_PUBLIC_EDGE_SIGNER_ENABLED": "true"
    }
  }
}
```

### Vercel Security Considerations
```typescript
// Vercel-specific security validation
export function validateVercelRequest(req: NextRequest): boolean {
  // Validate origin (Vercel domains)
  const origin = req.headers.get('origin');
  const allowedOrigins = [
    'https://your-app.vercel.app',
    'https://your-custom-domain.com'
  ];
  
  if (!allowedOrigins.includes(origin)) {
    return false;
  }
  
  // Validate tenant (environment-based)
  const tenantId = req.headers.get('x-tenant-id');
  const allowedTenants = (process.env.TENANT_ALLOWLIST || '').split(',');
  
  return allowedTenants.includes(tenantId);
}
```

## Cross-Provider Compatibility Matrix

| Feature | Cloudflare Workers | Fastly Compute | Vercel Edge |
|---------|-------------------|----------------|-------------|
| WASM Support | ✅ Full | ✅ Full | ✅ Limited |
| WebCrypto ES256 | ✅ | ✅ | ✅ |
| WebCrypto Ed25519 | ✅ | ❌ | ✅ |
| Smart Placement | ✅ | ❌ | ❌ |
| KV Storage | ✅ | ✅ | ❌ |
| Rate Limiting | ✅ DO | ❌ KV | ❌ External |
| CPU Time | Configurable | 50-300ms | 30s max |
| Memory Limit | 128MB | 256MB | 50MB |
| Regions | 200+ | 50+ | 30+ |

## Implementation Migration Guide

### Cloudflare → Fastly Migration
```typescript
// 1. Replace Workers API with Fastly API
// Before: import { env } from '@cloudflare/workers-types';
// After:  import { env } from "fastly:env";

// 2. Update WASM loading
// Before: await import('./wasm/signer_core.js');
// After:  const wasmBytes = include_bytes!("signer_core.wasm");

// 3. Replace KV with Fastly KV
// Before: env.COUNTER_KV.get(key);
// After:  edge_config.get(key);

// 4. Update request handling
// Before: export default { fetch() };
// After:  async function handleRequest(request) { ... }
```

### Cloudflare → Vercel Migration
```typescript
// 1. Replace Workers with Next.js Edge
// Before: export default { fetch() };
// After:  export default function handler(req) { ... }

// 2. Update environment access
// Before: env.CENTRAL_SIGNER_URL;
// After:  process.env.CENTRAL_SIGNER_URL;

// 3. Replace KV with external storage
// Before: env.CONFIG_KV.get(key);
// After:  await fetch(`${CONFIG_API}/config/${key}`);

// 4. Update WebCrypto usage
// Before: crypto.subtle.sign(...);
// After:  crypto.subtle.sign(...); // Same API
```

## Performance Comparison

### Expected Performance by Provider
| Provider | p95 Latency | CPU Cost | Memory Limit | Regions |
|----------|-------------|----------|--------------|---------|
| Cloudflare | 120ms | $0.001/req | 128MB | 200+ |
| Fastly | 150ms | $0.0012/req | 256MB | 50+ |
| Vercel | 180ms | $0.0015/req | 50MB | 30+ |

### Optimization Strategies
```typescript
// Provider-specific optimizations
interface ProviderOptimization {
  cloudflare: {
    smart_placement: true;
    durable_objects_rate_limit: true;
    wasm_streaming: true;
  };
  
  fastly: {
    simplified_tbs: true; // Reduce CPU usage
    kv_rate_limit: true;
    backend_optimization: true;
  };
  
  vercel: {
    edge_caching: true;
    external_rate_limit: true;
    minimal_wasm: true; // Size constraints
  };
}
```

## Deployment Considerations

### Multi-Provider Strategy
```yaml
# deployment-strategy.yaml
multi_provider:
  primary: "cloudflare"  # Best performance
  secondary: "fastly"   # Fallback option
  experimental: "vercel" # Testing only
  
  routing:
    - region: "north-america"
      provider: "cloudflare"
    - region: "europe"
      provider: "cloudflare"
    - region: "asia"
      provider: "fastly"  # Better coverage
  
  failover:
    - condition: "provider_error_rate > 5%"
      action: "switch_provider"
    - condition: "latency_p95 > 300ms"
      action: "switch_provider"
```

### Configuration Management
```typescript
// Universal configuration interface
interface UniversalConfig {
  provider: 'cloudflare' | 'fastly' | 'vercel';
  central_signer_url: string;
  kms_region: string;
  rate_limits: {
    requests_per_second: number;
    burst_capacity: number;
  };
  performance: {
    cpu_timeout_ms: number;
    memory_limit_mb: number;
  };
}
```

## Testing Strategy

### Cross-Provider Testing
```typescript
// Provider abstraction for testing
abstract class EdgeSignerProvider {
  abstract async initialize(): Promise<void>;
  abstract async prepareTBS(data: any): Promise<Uint8Array>;
  abstract async callCentralSigner(tbs: Uint8Array): Promise<any>;
  abstract async storeManifest(manifest: any): Promise<string>;
}

// Test implementations
class CloudflareSigner extends EdgeSignerProvider { ... }
class FastlySigner extends EdgeSignerProvider { ... }
class VercelSigner extends EdgeSignerProvider { ... }

// Universal test suite
async function runProviderTests(provider: EdgeSignerProvider) {
  const results = await Promise.all([
    testPerformance(provider),
    testReliability(provider),
    testSecurity(provider),
    testScalability(provider)
  ]);
  
  return results;
}
```

## Conclusion

The edge signer probe is designed with portability in mind:

1. **Cloudflare Workers**: Primary target with full feature support
2. **Fastly Compute**: Viable alternative with some limitations
3. **Vercel Edge**: Experimental support for specific use cases

The core architecture (WASM + remote signing) remains consistent across providers, with only the runtime-specific implementations requiring adaptation. This approach ensures we can evaluate edge computing benefits across multiple platforms while maintaining security and performance standards.
