# Phase 33 — Optimizer Behavior Reverse-Lab (v1.1)

## Purpose

Fingerprint, track, and auto-diff CDN/optimizer behavior (preserve vs strip; embed vs remote manifest survival; header mutations) across provider/version/transform matrices. When a provider flips behavior, raise alerts, update rules, and push the change into the Hostile Gauntlet + Auto-Fallback within the 48-hour SLO.

## Architecture

### Core Components

1. **Orchestrator** (Node/Fastify) - Schedules provider/transform jobs
2. **Fetcher** (Rust reqwest) - Runs headless HTTP tests with robots.txt compliance
3. **Verifier** (Rust + CAI verify) - Parses manifests and validates integrity
4. **Profiler** - Builds Provider Profile vX.Y and commits to profiles store
5. **Documentation Adapter** - Scrapes provider docs for evidence and context

### Provider Coverage

- **Cloudflare Images** - metadata=keep|copyright, Preserve Content Credentials toggle
- **Fastly IO** - metadata={all|none|icc} (default strips EXIF/XMP/C2PA)
- **Akamai IVM** - XMP metadata preservation policy option
- **Cloudinary** - C2PA blog & metadata preferences
- **Imgix** - Format and quality transformations

### Transform Matrix

- Resize, crop, format swap (jpg/webp/avif), quality sliders
- Strip/keep metadata flags, DPR, sharpening
- Provider-specific switches (Preserve Content Credentials, XMP policy)

## Quick Start

### Prerequisites

- Node.js 20+
- Redis server
- Rust toolchain (for verifier components)

### Installation

```bash
# Install dependencies
pnpm install

# Build the project
pnpm build

# Start development server
pnpm dev
```

### Environment Configuration

```bash
# Server configuration
PORT=3000
HOST=0.0.0.0

# Redis configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0

# Rate limiting
GLOBAL_RATE_LIMIT=100
PROVIDER_RATE_LIMIT=10

# Scheduling
WEEKLY_JOB_CRON="0 2 * * 1"  # Monday 2 AM
DAILY_CHECK_CRON="0 6 * * *"  # Daily 6 AM

# Timeouts (milliseconds)
JOB_TIMEOUT=3600000
REQUEST_TIMEOUT=30000
VERIFICATION_TIMEOUT=15000

# Features
FEATURE_DOCS=true
FEATURE_CHANGE_DETECTION=true
FEATURE_AUTO_RULES=true
FEATURE_WEEKLY_REPORTS=true
```

## API Usage

### Submit Matrix Job

```bash
curl -X POST http://localhost:3000/reverse-lab/run \
  -H "Content-Type: application/json" \
  -d '{
    "providers": ["cloudflare-images", "fastly-io"],
    "transforms": ["resize_1200", "webp_q80"],
    "runs": 3,
    "priority": "weekly"
  }'
```

### Get Job Results

```bash
curl http://localhost:3000/reverse-lab/results/{jobId}
```

### Get Provider Profiles

```bash
curl http://localhost:3000/api/v1/profiles?provider=cloudflare-images
```

### Get Change Events

```bash
curl http://localhost:3000/api/v1/events?severity=critical
```

## CLI Tools

### Run Matrix Tests

```bash
# Run comprehensive matrix
pnpm run-matrix --providers=cloudflare-images,fastly-io --transforms=resize_1200,webp_q80 --runs=3 --wait

# Profile specific provider
pnpm profile-provider --provider=cloudflare-images --output=profile.json

# List providers
pnpm list-providers

# Get system status
pnpm status
```

## Provider Profiles

### Profile Schema

```json
{
  "provider": "fastly-io",
  "versionHint": {
    "serverHeader": "Fastly-Image-Optimizer/2025.10",
    "docUrl": "https://www.fastly.com/documentation/reference/io/",
    "observedAt": "2025-11-03T15:00:00Z",
    "profileVersion": "2025.44"
  },
  "matrix": [
    {
      "transform": "webp_q80_default",
      "request": { "url": "https://io.example/i.jpg?format=webp" },
      "response": { "status": 200, "headers": { "content-type": "image/webp" } },
      "bytes": { "size": 142332, "hash": "sha256:..." },
      "verify": {
        "embedded_manifest": false,
        "remote_link_header": false,
        "c2pa_status": "stripped"
      },
      "notes": "Matches docs: metadata removed unless `metadata` param set."
    }
  ],
  "policy": {
    "recommendation": "force-remote",
    "auto_fallback": true,
    "evidence": ["turn0search5", "turn0search12"],
    "confidence": 0.95
  }
}
```

### Change Detection

The system detects behavior changes using:

- **Verify outcome diff** (embedded→stripped or vice versa)
- **Header drift** (new Server, cf-images flags, x-akamai hints)
- **Bytes diff** beyond transform-expected delta (±5%)
- **Thresholds**: Fire Change Event when ≥3 of 10 sentinel transforms flip

## Documentation Integration

### Capturing Provider Documentation

```bash
curl http://localhost:3000/api/v1/docs/cloudflare-images
```

### Searching Documentation

```bash
curl "http://localhost:3000/api/v1/docs/cloudflare-images/search?q=c2pa"
```

### Extracting C2PA Statements

```bash
curl http://localhost:3000/api/v1/docs/cloudflare-images/c2pa
```

## Weekly Reports

### Generating Reports

Reports are automatically generated weekly and include:

- **Optimizer Delta** section with provider behavior changes
- **Performance metrics** and compliance statistics
- **Evidence binding** with vendor documentation links
- **Tenant impact analysis** and recommendations

### Report Structure

```markdown
# C2PA Reverse Lab - Weekly Survival Report

## 📊 Executive Summary
- Providers Monitored: 5
- Transforms Tested: 12
- Total Test Cases: 720
- Change Events Detected: 2
- Policy Updates Required: 1

## 🚨 Optimizer Behavior Deltas
### 🔴 fastly-io
**Change Type:** behavior_flip
**Description:** C2PA manifest loss detected in 4 transforms
**Impact:** embed survival dropped 25.3%; 156 tenants affected

## 📈 Provider Status Summary
| Provider | Latest Profile | Recommendation | Confidence | Changes |
|----------|----------------|----------------|------------|---------|
| cloudflare-images | 2025.44 | embed | 98.2% | ✅ |
| fastly-io | 2025.44 | remote-only | 94.1% | 🔴 4 |
```

## Auto-Wiring to Production

### Change Event → Rules PR

When behavior changes are detected:

1. **Update** `/packages/policies/optimizer-rules.json`
2. **Re-seed** Hostile Gauntlet with new profile
3. **Flip** Auto-Fallback (embed→remote-only) on SLO breach
4. **Send** tenant advisories with evidence and links

### Example Rules Update

```json
{
  "fastly-io": {
    "embed_survival": false,
    "remote_survival": true,
    "enforce_remote": true,
    "gauntlet_profile": "v2025.44",
    "recommendation": "remote-only",
    "evidence": ["behavior_flip_detected_2025-11-03"],
    "last_checked": "2025-11-03T15:00:00Z"
  },
  "cloudflare-images": {
    "embed_survival": "depends_on_preserve_toggle",
    "remote_survival": true,
    "enforce_remote": false,
    "gauntlet_profile": "v2025.44",
    "recommendation": "embed",
    "evidence": ["preserve_toggle_working"],
    "last_checked": "2025-11-03T15:00:00Z"
  }
}
```

## Robots.txt Compliance

### RFC 9309 Compliance

- **Obey robots.txt** rules for all providers
- **Throttle aggressively** (5–30 rps global cap)
- **Cache public demo assets** to reduce load
- **Skip auth-gated surfaces** - fingerprint optimizers, not people
- **Per-domain concurrency** limits (1–3 concurrent requests)
- **Exponential backoff** on 429/403 responses

### Rate Limiting Policy

```javascript
{
  "global": {
    "rps": 30,
    "burst": 50
  },
  "perProvider": {
    "cloudflare-images": { "rps": 5, "concurrency": 1 },
    "fastly-io": { "rps": 10, "concurrency": 2 },
    "akamai-ivm": { "rps": 8, "concurrency": 2 },
    "cloudinary": { "rps": 15, "concurrency": 3 },
    "imgix": { "rps": 12, "concurrency": 2 }
  }
}
```

## Test Assets

### Public Demo Set

- **24 images** (JPEG/PNG/AVIF/WEBP) signed with c2pa-rs
- **Remote-manifest variants** for Link header testing
- **Control images** without C2PA for baseline
- **Various sizes** from 256KB to 10MB for size scaling tests

### Sentinel Assets

Critical assets monitored for change detection:

1. `c2pa-demo-001` - Standard JPEG with embedded C2PA
2. `c2pa-remote-001` - JPEG with remote manifest
3. `c2pa-mixed-001` - JPEG with both embedded and remote
4. `c2pa-webp-002` - WebP with embedded C2PA
5. `c2pa-avif-002` - AVIF with embedded C2PA
6. `c2pa-control-001` - Control image without C2PA

## Exit Tests & Acceptance Criteria

### ✅ Automated Acceptance Checks

1. **Fingerprint coverage**: 5 providers × 12 transforms × 4 formats × 3 runs = 720 cases/week
2. **Spec compliance**: Remote-manifest discovery validated from Link header
3. **Evidence binding**: Every rules change references vendor doc URLs
4. **Customer safety**: Auto-fallback on embed survival < 95%

### ✅ 48-Hour SLO Test

Scenario: Provider flips behavior (e.g., Fastly toggles default)

**Timeline:**
- **T+0h**: Behavior change detected in weekly matrix
- **T+2h**: Change event raised, evidence collected
- **T+6h**: Rules PR auto-generated and submitted
- **T+12h**: Hostile Gauntlet re-seeded with new profile
- **T+24h**: Auto-Fallback activated for affected tenants
- **T+36h**: Tenant advisories sent with impact analysis
- **T+48h**: Weekly report includes delta with citations

**Evidence Required:**
- Profile vΔ with hash changes
- Rule diff with vendor doc references  
- Gauntlet pass/fail results
- Tenant communication logs

### ✅ Reproducibility Test

Anyone can re-run the matrix and match profile hashes:

```bash
# Reproduce weekly matrix
pnpm run-matrix --providers=all --transforms=all --runs=3 --cache-bust

# Verify hash matches
curl http://localhost:3000/api/v1/profiles | jq '.data[].hash'
```

## Risk Mitigation

### Rate Limits / Blocking
- **Respect robots.txt** with exponential backoff
- **Per-domain concurrency caps** with rotating endpoints
- **Cached artifacts** to reduce redundant requests
- **Conservative defaults** when compliance unclear

### Doc Drift vs Actual Behavior
- **Docs as hints only** - ground truth = measured + verified
- **Store both observed result** and doc source with date
- **Weight evidence** from actual behavior over documentation

### False Positives
- **Require 3/3 sentinel flips** across fresh URLs
- **Cache-busting** before change-point detection
- **Manual review** for critical severity events
- **Rollback capability** for mistaken rule changes

## Performance & Scaling

### Throughput Targets
- **720 test cases/week** with 3-run validation
- **30 second average** per test case execution
- **95% success rate** across all providers
- **< 5% rate limit hits** with proper throttling

### Storage Requirements
- **Profile storage**: ~10MB per provider per year
- **Event logs**: ~100MB per year with compression
- **Documentation cache**: ~500MB with TTL cleanup
- **Redis cache**: 1GB with weekly expiration

## Monitoring & Alerting

### Key Metrics
- **Job success rate** by provider and transform
- **Change event frequency** and severity distribution
- **Rate limit hit rate** and backoff frequency
- **Documentation freshness** and change detection lag

### Alert Thresholds
- **Success rate < 90%** for any provider
- **> 5 change events** within 24 hours
- **Rate limit hits > 20%** of total requests
- **Documentation drift** without corresponding behavior change

## Contributing

### Development Setup

```bash
# Clone repository
git clone https://github.com/Nickiller04/c2-concierge.git
cd c2-concierge/apps/c2pa-audit/phase33-reverse-lab

# Install dependencies
pnpm install

# Run tests
pnpm test

# Start development server
pnpm dev
```

### Code Style

- **TypeScript strict mode** with comprehensive type checking
- **ESLint + Prettier** for consistent formatting
- **Vitest** for unit and integration tests
- **100% coverage** requirement for core components

### Submitting Changes

1. Fork repository and create feature branch
2. Add tests for new functionality
3. Ensure all tests pass and coverage maintained
4. Submit PR with detailed description and evidence

## License

MIT License - see LICENSE file for details.

## Support

- **Issues**: https://github.com/Nickiller04/c2-concierge/issues
- **Discussions**: https://github.com/Nickiller04/c2-concierge/discussions
- **Documentation**: https://github.com/Nickiller04/c2-concierge/wiki

---

**Generated by C2PA Reverse Lab v1.1.0**  
*Last updated: November 3, 2025*
