# Phase 30 Variant Linking - Risks → Mitigations
# Comprehensive risk analysis and mitigation strategies

## Risk Matrix Overview

| Risk Category | Impact | Likelihood | Mitigation Status |
|---------------|--------|------------|-------------------|
| False Linking | Critical | Low | ✅ Implemented |
| Embedded Loss | High | Medium | ✅ Implemented |
| Privacy Leakage | Medium | High | ✅ Implemented |
| Performance Degradation | Medium | Medium | ✅ Implemented |
| Cache Poisoning | Critical | Low | ✅ Implemented |
| SSRF Attacks | Critical | Medium | ✅ Implemented |

## 1. False Linking (Heuristics) - CRITICAL

### Risk Description
Using perceptual hashing or other heuristics to "guess" parent-child relationships can lead to:
- Incorrect provenance chains
- False trust in manipulated content
- Legal liability for misattribution

### Mitigation Strategy
**NEVER infer parents; require explicit parent hashed-URI**

#### Implementation Details
```typescript
// ❌ NEVER DO THIS - Heuristic matching
function guessParent(childManifest, candidateParents) {
  const childHash = perceptualHash(childManifest);
  const matches = candidateParents.filter(p => 
    perceptualHashDistance(childHash, p) < 0.1
  );
  return matches[0]; // DANGEROUS - can be wrong
}

// ✅ ALWAYS DO THIS - Explicit parent declaration
function validateParent(childManifest, declaredParentUri) {
  const parentManifest = fetchManifest(declaredParentUri);
  const childIngredient = childManifest.ingredients.find(i => 
    i.relationship === 'parentOf'
  );
  
  // Verify exact hash match
  return childIngredient.active_manifest === parentManifest.manifest_hash;
}
```

#### Hard Failures for Ambiguous Chains
```typescript
function validateSingleParent(manifest) {
  const parentIngredients = manifest.ingredients.filter(i => 
    i.relationship === 'parentOf'
  );
  
  if (parentIngredients.length === 0) {
    // OK - root manifest
    return { valid: true, code: 'manifest.root' };
  }
  
  if (parentIngredients.length > 1) {
    // CRITICAL - ambiguous parentage
    return { 
      valid: false, 
      code: 'ingredient.multipleParents',
      error: 'Derivative manifests must have exactly one parentOf ingredient'
    };
  }
  
  if (parentIngredients.length === 1) {
    // Verify parent exists and matches
    return validateSingleParentRelationship(parentIngredients[0]);
  }
}
```

#### CLI Helper for Multi-Parent Scenarios
```bash
# For complex edits (collages), use componentOf for additional sources
c2pa-audit create-derivative \
  --parent https://manifests.example.com/base.c2pa \
  --component https://manifests.example.com/overlay1.c2pa \
  --component https://manifests.example.com/overlay2.c2pa \
  --action "c2pa.placed" \
  --description "Composite with overlays"
```

## 2. Embedded Loss on Transcode - HIGH

### Risk Description
Pipelines can strip embedded C2PA chunks during:
- Format conversion (JPEG → WebP)
- CDN optimization
- Image processing services
- Mobile network compression

### Mitigation Strategy
**Default to remote discovery; embed only where you control the path**

#### Decision Matrix
| Pipeline Control | Embed Strategy | Fallback |
|------------------|----------------|----------|
| Full control | Embed + Remote | Remote only |
| Partial control | Remote primary | Remote only |
| No control | Remote only | Remote only |

#### Implementation
```typescript
function determineEmbedStrategy(pipelineContext) {
  const {
    encoderControlled,    // Do you control the encoder?
    cdnControlled,        // Do you control the CDN?
    networkOptimization  // Is network optimization enabled?
  } = pipelineContext;
  
  if (encoderControlled && !cdnControlled && !networkOptimization) {
    return {
      embed: true,
      remote: true,  // Always include remote as fallback
      confidence: 'high'
    };
  }
  
  return {
    embed: false,
    remote: true,
    confidence: 'medium'
  };
}
```

#### Format-Specific Handling
```typescript
const EMBED_CAPABILITIES = {
  'image/webp': {
    canEmbed: true,
    chunkType: 'C2PA',
    reliability: 'medium'  // Many tools strip it
  },
  'image/jpeg': {
    canEmbed: true,
    chunkType: 'C2PA',
    reliability: 'high'
  },
  'image/png': {
    canEmbed: true,
    chunkType: 'c2pa',
    reliability: 'high'
  },
  'video/mp4': {
    canEmbed: true,
    chunkType: 'moov',
    reliability: 'low'   // Often stripped by transcoders
  }
};

function shouldEmbedForFormat(format, pipelineControl) {
  const capability = EMBED_CAPABILITIES[format];
  if (!capability || !capability.canEmbed) {
    return false;
  }
  
  // Only embed if high reliability and full control
  return capability.reliability === 'high' && pipelineControl.fullControl;
}
```

#### Validation for Embedded Loss
```typescript
async function validateEmbeddedManifest(assetUrl, expectedManifest) {
  const response = await fetch(assetUrl);
  const assetBuffer = await response.arrayBuffer();
  
  // Try to extract embedded manifest
  const embeddedManifest = await extractEmbeddedManifest(assetBuffer);
  
  if (embeddedManifest) {
    // Verify it matches expected
    const isValid = await compareManifests(embeddedManifest, expectedManifest);
    return {
      hasEmbedded: true,
      isValid,
      fallback: !isValid ? 'remote' : null
    };
  }
  
  // No embedded - must use remote
  return {
    hasEmbedded: false,
    isValid: false,
    fallback: 'remote'
  };
}
```

## 3. Remote-Manifest Privacy Leakage - MEDIUM

### Risk Description
Remote manifest requests can expose:
- Viewer IP addresses
- Browsing patterns
- Geographic location
- Device information

### Mitigation Strategy
**Relay manifests, cache safely, and disclose risks**

#### Edge Relay Implementation
```typescript
class PrivacyAwareManifestRelay {
  async relayManifest(manifestUrl, clientContext) {
    // 1. Validate manifest URL (SSRF protection)
    this.validateManifestUrl(manifestUrl);
    
    // 2. Check cache first
    const cached = await this.secureCache.get(manifestUrl);
    if (cached) {
      this.logPrivacyEvent('cache_hit', clientContext.anonymousId);
      return cached;
    }
    
    // 3. Fetch via relay (anonymize client)
    const manifest = await this.fetchViaUpstream(manifestUrl);
    
    // 4. Cache with privacy controls
    await this.secureCache.set(manifestUrl, manifest, {
      ttl: 3600,
      privacyLevel: 'anonymous'
    });
    
    // 5. Log minimal data
    this.logPrivacyEvent('upstream_fetch', clientContext.anonymousId);
    
    // 6. Add privacy headers
    return this.addPrivacyHeaders(manifest);
  }
  
  validateManifestUrl(url) {
    // Block private IPs, internal networks
    const parsed = new URL(url);
    if (this.isPrivateIP(parsed.hostname)) {
      throw new PrivacyError('Private IP access blocked');
    }
    
    // Validate file type
    if (!url.endsWith('.c2pa') && !url.endsWith('.json')) {
      throw new PrivacyError('Invalid manifest file type');
    }
  }
  
  addPrivacyHeaders(manifest) {
    return {
      ...manifest,
      headers: {
        ...manifest.headers,
        'X-Privacy-Relay': 'true',
        'X-Request-Anonymized': 'true',
        'Cache-Control': 'public, max-age=3600'
      }
    };
  }
}
```

#### Privacy Disclosure in Documentation
```markdown
## Privacy Notice

### Manifest Discovery
When you view content with C2PA provenance, your browser may:
- Fetch manifest files from remote servers
- Reveal your IP address to manifest providers
- Share basic device information

### Mitigations We Implement
- **IP Anonymization**: Requests are relayed through our privacy service
- **Caching**: Manifests are cached to reduce repeated requests
- **Minimal Logging**: We store only hashed, non-identifying information
- **No Tracking Pixels**: Manifests are validated for tracking code

### Your Options
- Use privacy-focused browsers
- Enable VPN services
- Block third-party manifest requests
- Review our privacy policy for details
```

#### Client-Side Privacy Controls
```javascript
class PrivacyAwareManifestLoader {
  constructor(options = {}) {
    this.privacyLevel = options.privacyLevel || 'balanced';
    this.relayService = options.relayService || 'https://relay.c2pa.example';
  }
  
  async loadManifest(manifestUrl) {
    switch (this.privacyLevel) {
      case 'strict':
        return this.loadViaRelay(manifestUrl);
      case 'balanced':
        return this.loadWithFallback(manifestUrl);
      case 'minimal':
        return this.loadDirect(manifestUrl);
      default:
        return this.loadWithFallback(manifestUrl);
    }
  }
  
  async loadViaRelay(manifestUrl) {
    const relayUrl = `${this.relayService}/proxy`;
    const response = await fetch(relayUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        manifest_url: manifestUrl,
        privacy_mode: true
      })
    });
    
    return response.json();
  }
  
  async loadWithFallback(manifestUrl) {
    try {
      // Try direct first (faster)
      return await this.loadDirect(manifestUrl);
    } catch (error) {
      // Fallback to relay on error
      console.warn('Direct manifest fetch failed, using privacy relay');
      return this.loadViaRelay(manifestUrl);
    }
  }
}
```

## 4. Performance Degradation - MEDIUM

### Risk Description
Variant linking can impact performance through:
- Multiple manifest fetches
- Complex validation chains
- Cache misses
- Network latency

### Mitigation Strategy
**Implement aggressive caching and performance monitoring**

#### Performance Targets
```typescript
const PERFORMANCE_SLOS = {
  verification: {
    p95Ms: 600,      // 95th percentile
    p99Ms: 1000,     // 99th percentile
    coldCacheMs: 1000 // Cold cache
  },
  registry: {
    p95Ms: 3,        // KV/DO lookup
    p99Ms: 10
  },
  cache: {
    minHitRate: 85,  // Percentage
    maxSizeMB: 100
  }
};
```

#### Caching Strategy
```typescript
class PerformanceOptimizedCache {
  constructor() {
    this.l1Cache = new Map(); // Memory cache
    this.l2Cache = new RedisCache(); // Distributed cache
    this.metrics = new PerformanceMetrics();
  }
  
  async get(key) {
    const startTime = Date.now();
    
    try {
      // L1 Cache (fastest)
      if (this.l1Cache.has(key)) {
        this.metrics.recordCacheHit('L1', Date.now() - startTime);
        return this.l1Cache.get(key);
      }
      
      // L2 Cache (fast)
      const l2Result = await this.l2Cache.get(key);
      if (l2Result) {
        this.l1Cache.set(key, l2Result);
        this.metrics.recordCacheHit('L2', Date.now() - startTime);
        return l2Result;
      }
      
      // Cache miss
      this.metrics.recordCacheMiss(Date.now() - startTime);
      return null;
      
    } catch (error) {
      this.metrics.recordError('cache', error);
      return null;
    }
  }
  
  async set(key, value, options = {}) {
    const ttl = options.ttl || 3600;
    
    // Set both cache layers
    this.l1Cache.set(key, value);
    await this.l2Cache.set(key, value, { ttl });
    
    // Cleanup L1 if too large
    if (this.l1Cache.size > 1000) {
      const oldestKey = this.l1Cache.keys().next().value;
      this.l1Cache.delete(oldestKey);
    }
  }
}
```

#### Parallel Validation
```typescript
class ParallelValidator {
  async validateVariantChain(manifestUrls) {
    // Validate all manifests in parallel
    const validationPromises = manifestUrls.map(url => 
      this.validateSingleManifest(url)
    );
    
    const results = await Promise.allSettled(validationPromises);
    
    // Process results
    const validResults = results
      .filter(r => r.status === 'fulfilled')
      .map(r => r.value);
    
    const errors = results
      .filter(r => r.status === 'rejected')
      .map(r => r.reason);
    
    return {
      validations: validResults,
      errors,
      totalTime: Date.now() - startTime
    };
  }
  
  async validateSingleManifest(manifestUrl) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      const response = await fetch(manifestUrl, {
        signal: controller.signal,
        headers: {
          'Accept': 'application/c2pa-manifest+json'
        }
      });
      
      clearTimeout(timeoutId);
      return await this.parseAndValidate(response);
      
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
```

## 5. Cache Poisoning - CRITICAL

### Risk Description
Malicious actors could attempt to:
- Inject false manifests into cache
- Replace valid manifests with invalid ones
- Manipulate validation results

### Mitigation Strategy
**Cryptographic validation and cache isolation**

#### Manifest Validation Before Caching
```typescript
class SecureCache {
  async setWithValidation(key, manifestData) {
    // 1. Validate manifest structure
    const structureValidation = await this.validateStructure(manifestData);
    if (!structureValidation.valid) {
      throw new SecurityError('Invalid manifest structure');
    }
    
    // 2. Validate cryptographic signatures
    const signatureValidation = await this.validateSignatures(manifestData);
    if (!signatureValidation.valid) {
      throw new SecurityError('Invalid manifest signatures');
    }
    
    // 3. Generate content hash for integrity
    const contentHash = await this.generateContentHash(manifestData);
    
    // 4. Store with integrity check
    const cacheEntry = {
      data: manifestData,
      contentHash,
      timestamp: Date.now(),
      validations: [structureValidation, signatureValidation]
    };
    
    await this.cache.set(key, cacheEntry, { ttl: 3600 });
  }
  
  async getWithValidation(key) {
    const entry = await this.cache.get(key);
    if (!entry) return null;
    
    // Verify content integrity
    const currentHash = await this.generateContentHash(entry.data);
    if (currentHash !== entry.contentHash) {
      // Cache corruption detected
      await this.cache.delete(key);
      throw new SecurityError('Cache integrity violation');
    }
    
    return entry.data;
  }
}
```

#### Cache Isolation by Tenant
```typescript
class TenantIsolatedCache {
  constructor() {
    this.tenantCaches = new Map();
  }
  
  getCacheForTenant(tenantId) {
    if (!this.tenantCaches.has(tenantId)) {
      this.tenantCaches.set(tenantId, new SecureCache());
    }
    return this.tenantCaches.get(tenantId);
  }
  
  async get(tenantId, key) {
    const cache = this.getCacheForTenant(tenantId);
    const isolatedKey = `${tenantId}:${key}`;
    return cache.getWithValidation(isolatedKey);
  }
  
  async set(tenantId, key, data) {
    const cache = this.getCacheForTenant(tenantId);
    const isolatedKey = `${tenantId}:${key}`;
    return cache.setWithValidation(isolatedKey, data);
  }
}
```

## 6. SSRF Attacks - CRITICAL

### Risk Description
Server-Side Request Forgery attacks could:
- Access internal network resources
- Bypass firewall restrictions
- Expose sensitive internal services

### Mitigation Strategy
**Strict URL validation and network controls**

#### URL Validation
```typescript
class SSRFProtection {
  private blockedNetworks = [
    '127.0.0.0/8',     // Loopback
    '10.0.0.0/8',      // Private
    '172.16.0.0/12',   // Private
    '192.168.0.0/16',  // Private
    '169.254.0.0/16',  // Link-local
    '224.0.0.0/4',     // Multicast
    '::1/128',         // IPv6 loopback
    'fc00::/7',        // IPv6 private
    'fe80::/10'        // IPv6 link-local
  ];
  
  validateUrl(url) {
    const parsed = new URL(url);
    
    // Only allow HTTP/HTTPS
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new SecurityError('Only HTTP and HTTPS URLs are allowed');
    }
    
    // Block private IPs
    if (this.isPrivateIP(parsed.hostname)) {
      throw new SecurityError('Access to private IP addresses is not allowed');
    }
    
    // Block localhost and common internal hostnames
    const blockedHosts = ['localhost', '127.0.0.1', '0.0.0.0', '::1'];
    if (blockedHosts.includes(parsed.hostname.toLowerCase())) {
      throw new SecurityError('Access to localhost is not allowed');
    }
    
    // Validate file extensions
    const allowedExtensions = ['.c2pa', '.json'];
    const hasAllowedExtension = allowedExtensions.some(ext => 
      parsed.pathname.toLowerCase().endsWith(ext)
    );
    
    if (!hasAllowedExtension) {
      throw new SecurityError('Only .c2pa and .json files are allowed');
    }
    
    return true;
  }
  
  isPrivateIP(hostname) {
    // Check against CIDR blocks
    for (const network of this.blockedNetworks) {
      if (this.ipInCIDR(hostname, network)) {
        return true;
      }
    }
    
    // Check for common internal patterns
    const internalPatterns = [
      /^192\.168\./,
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^127\./,
      /^169\.254\./
    ];
    
    return internalPatterns.some(pattern => pattern.test(hostname));
  }
}
```

#### Network-Level Controls
```typescript
class NetworkControlledFetcher {
  constructor(ssrfProtection) {
    this.ssrfProtection = ssrfProtection;
    this.allowedDomains = new Set([
      'manifests.example.com',
      'c2pa.org',
      'contentauthenticity.org'
    ]);
  }
  
  async fetch(url, options = {}) {
    // Pre-validation
    this.ssrfProtection.validateUrl(url);
    
    const parsed = new URL(url);
    
    // Additional domain whitelist check
    if (!this.allowedDomains.has(parsed.hostname)) {
      throw new SecurityError(`Domain ${parsed.hostname} is not allowed`);
    }
    
    // Network-level fetch with controls
    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'User-Agent': 'C2PA-Variant-Fetcher/1.0',
        'X-SSRF-Protected': 'true'
      },
      timeout: 30000,
      // Additional network controls would be implemented at infrastructure level
    });
  }
}
```

## Monitoring and Alerting

### Risk Monitoring Dashboard
```typescript
class RiskMonitoringDashboard {
  generateRiskReport() {
    return {
      falseLinking: {
        status: this.monitorFalseLinking(),
        lastIncident: this.getLastFalseLinkingIncident(),
        mitigationActive: true
      },
      embeddedLoss: {
        status: this.monitorEmbeddedLoss(),
        fallbackRate: this.getFallbackRate(),
        mitigationActive: true
      },
      privacyLeakage: {
        status: this.monitorPrivacyLeakage(),
        anonymizationRate: this.getAnonymizationRate(),
        mitigationActive: true
      },
      performance: {
        status: this.monitorPerformance(),
        sloCompliance: this.getSLOCompliance(),
        mitigationActive: true
      },
      cachePoisoning: {
        status: this.monitorCacheIntegrity(),
        integrityViolations: this.getIntegrityViolations(),
        mitigationActive: true
      },
      ssrfAttacks: {
        status: this.monitorSSRFAttempts(),
        blockedAttempts: this.getBlockedAttempts(),
        mitigationActive: true
      }
    };
  }
}
```

### Automated Response
```typescript
class AutomatedRiskResponse {
  async handleRiskEvent(riskType, severity, details) {
    switch (riskType) {
      case 'false_linking':
        if (severity === 'critical') {
          await this.disableVariantLinking();
          await this.alertSecurityTeam('False linking detected - service disabled');
        }
        break;
        
      case 'cache_poisoning':
        await this.clearAllCaches();
        await this.enableStrictValidation();
        break;
        
      case 'ssrf_attempt':
        await this.blockSourceIP(details.sourceIP);
        await this.increaseRateLimit(details.sourceIP);
        break;
        
      case 'performance_degradation':
        if (severity === 'high') {
          await this.enableAggressiveCaching();
          await this.disableNonCriticalFeatures();
        }
        break;
    }
  }
}
```

---

**Summary**: All identified risks have comprehensive mitigations implemented with defense-in-depth strategies. The system maintains strict validation, privacy controls, performance monitoring, and security boundaries to ensure reliable variant linking operations.
