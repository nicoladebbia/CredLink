# Acceptance Tests Documentation

**Purpose**: Technical documentation for CredLink's hostile-path matrix acceptance testing framework.

## Overview

The acceptance test framework validates that CredLink's remote-first survival doctrine holds under various hostile conditions. It simulates real-world scenarios where content transformations, CDN optimizations, and proxy behaviors might impact provenance verification.

## Architecture

### Components
- **Matrix Runner**: Orchestrates scenario execution
- **Sandbox Manager**: Manages test environments
- **Transform Engine**: Applies content transformations
- **Probe System**: Validates headers and manifest resolution
- **Report Generator**: Creates survival reports and artifacts

### Test Flow
1. Load hostile-path matrix from YAML
2. Start required sandboxes
3. For each scenario:
   - Apply specified transforms
   - Probe headers and link resolution
   - Validate manifest hash alignment
   - Record timing and performance metrics
4. Generate comprehensive survival report

## Scenario Structure

### YAML Definition
```yaml
- id: IMG_JPEG_Q75_STRIP
  sandbox: strip-happy
  transforms:
    - tool: "magick"
      args: ["-strip", "-quality", "75"]
  expected:
    remote_survives: true
    embed_survives: false
  notes: "EXIF/IPTC removed; embedded JUMBF likely stripped"
```

### Required Fields
- **id**: Unique scenario identifier
- **sandbox**: Target test environment
- **transforms**: List of transformations to apply
- **expected**: Expected survival outcomes
- **notes**: Optional explanatory notes

### Transform Types
- **magick**: ImageMagick transformations (resize, quality, format conversion)
- **simulate-proxy**: HTTP-level transformations (header manipulation, caching)
- **copy**: No-op transformation for baseline testing

## Sandbox Environments

### Strip-Happy (Port 4101)
Simulates aggressive CDN/optimizer behavior:
- Strips all metadata including EXIF, IPTC, JUMBF
- Recompresses images with lower quality
- Converts between formats (JPEG, WebP, AVIF)
- May drop or modify HTTP headers

### Preserve-Embed (Port 4102)
Simulates first-party controlled origin:
- Preserves all metadata and embedded claims
- Minimal quality loss
- Supports HTML fallback for missing Link headers
- Allows embed survival testing

### Remote-Only (Port 4103)
Enforces strict remote-only policy:
- Blocks embedded content extraction via CSP
- Requires remote manifest resolution
- No embedded claims present
- Tests policy enforcement mechanisms

## Probing & Validation

### Headers Probe
Validates HTTP headers for policy compliance:
- Link header presence and format
- X-C2-Policy header values
- Content-Type and Cache-Control headers
- CSP headers for remote-only enforcement

### Link Resolution Probe
Tests manifest discovery and retrieval:
- Link header extraction
- HTML fallback mechanism
- Manifest fetch success/failure
- Hash alignment verification

### Timing Probe
Measures performance characteristics:
- Edge worker processing time
- Origin response time
- Manifest fetch latency
- Total end-to-end latency

## Success Criteria

### Remote Survival (Hard Gate)
- **Threshold**: ≥ 99.9% across all scenarios
- **Requirement**: Zero failures in Phase 0 matrix
- **Measurement**: Successful manifest fetch with hash alignment

### Embed Survival (Advisory)
- **Threshold**: ≥ 95% in preserve-embed sandbox
- **Scope**: Only measured in preserve-embed environment
- **Status**: Advisory in Phase 0, enforced in later phases

### Hash Alignment
- **Requirement**: Manifest path hash matches content hash
- **Failure**: Indicates cache poisoning or tampering
- **Recovery**: Immediate failure and alert generation

## Running Tests

### Local Development
```bash
# Install dependencies
pnpm install

# Create test fixtures
./scripts/make-fixtures.sh

# Start sandboxes
./scripts/run-sandboxes.sh &

# Run acceptance tests
pnpm -w test:acceptance

# Generate HTML report
./scripts/report.sh
```

### CI/CD Integration
```bash
# Full test suite (includes survival gates)
pnpm -w test

# Acceptance only
pnpm -w test:acceptance

# With specific sandbox
node packages/acceptance/bin/acceptance \
  --matrix docs/hostile-path-matrix.yaml \
  --out .artifacts/acceptance \
  --sandbox strip-happy
```

## Artifacts & Outputs

### Survival Report (JSON)
```json
{
  "run_id": "run-1698678400000",
  "timestamp": "2025-10-30T14:00:00.000Z",
  "matrix_version": 1,
  "total_scenarios": 16,
  "remote_survival_rate": 1.0,
  "embed_survival_rate_preserve_only": 0.93,
  "scenarios_failed": 0,
  "results": [...]
}
```

### Per-Scenario Logs
- `headers.json`: HTTP headers snapshot
- `manifest_fetch.json`: Manifest resolution details
- `verdict.json`: Survival determination logic
- `timings.json`: Performance metrics

### Deterministic Logs
Signed, structured logs for audit trails:
- HMAC-signed for integrity
- JSON ND format for processing
- Includes policy snapshot and timing data

## Debugging & Troubleshooting

### Common Issues

#### Sandbox Failures
```bash
# Check sandbox health
curl http://127.0.0.1:4101/health
curl http://127.0.0.1:4102/health
curl http://127.0.0.1:4103/health

# View sandbox logs
tail -f .artifacts/logs/strip-happy.log
tail -f .artifacts/logs/preserve-embed.log
tail -f .artifacts/logs/remote-only.log
```

#### Manifest Resolution Issues
```bash
# Test manifest fetch manually
curl -I http://127.0.0.1:4101/assets/test.jpg
curl http://127.0.0.1:4101/manifests/hash.c2pa
```

#### Hash Alignment Failures
- Check manifest file integrity
- Verify X-Manifest-Hash header values
- Validate transform pipeline

### Performance Analysis
```bash
# Analyze timing data
jq '.results[] | select(.timings_ms.origin > 1000)' .artifacts/acceptance/survival.json

# Check for slow scenarios
jq '.results | sort_by(.timings_ms.origin) | reverse | .[0:5]' .artifacts/acceptance/survival.json
```

## Extending the Framework

### Adding New Scenarios
1. Update `docs/hostile-path-matrix.yaml`
2. Add transform logic if needed
3. Update expected outcomes
4. Run tests to validate

### New Transform Types
1. Implement in `packages/acceptance/src/transforms/`
2. Register in `transforms/index.ts`
3. Add documentation and examples

### Additional Probes
1. Create probe in `packages/acceptance/src/probes/`
2. Integrate in `runScenario.ts`
3. Update result schema and reporting

## Performance Benchmarks

### Phase 0 Targets
- **Total Runtime**: < 5 minutes for full matrix
- **Per Scenario**: < 10 seconds average
- **Memory Usage**: < 512MB peak
- **Network**: < 100MB total transfer

### Scaling Considerations
- Parallel scenario execution
- Caching of transform results
- Optimized manifest fetching
- Efficient artifact generation

## Integration Points

### CI/CD Pipeline
- Triggers on main branch pushes
- Runs daily via cron schedule
- Uploads artifacts to GitHub Pages
- Comments on PRs with results

### Monitoring & Alerting
- Survival rate below threshold alerts
- Scenario failure notifications
- Performance degradation warnings
- System health monitoring

### External Dependencies
- ImageMagick for image transformations
- Node.js runtime environment
- pnpm package manager
- GitHub Actions for CI/CD

---

**Version**: 1.0  
**Effective**: 2025-10-30  
**Review**: Monthly or after major framework changes
