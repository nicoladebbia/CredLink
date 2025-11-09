# Survival Report Specification

**Purpose**: Define the structure, format, and interpretation of CredLink survival reports.

## Report Overview

Survival reports are generated after running the hostile-path matrix acceptance tests. They provide comprehensive metrics on how well CredLink's remote-first provenance system survives various hostile conditions.

## Report Structure

### Core Metadata
```json
{
  "run_id": "run-1698678400000",
  "timestamp": "2025-10-30T14:00:00.000Z",
  "matrix_version": 1,
  "total_scenarios": 16,
  "remote_survival_rate": 1.0,
  "embed_survival_rate_preserve_only": 0.93,
  "scenarios_failed": 0
}
```

#### Field Definitions
- **run_id**: Unique identifier for this test run (timestamp-based)
- **timestamp**: ISO 8601 timestamp when the report was generated
- **matrix_version**: Version of the hostile-path matrix used
- **total_scenarios**: Total number of scenarios executed
- **remote_survival_rate**: Percentage of scenarios where remote manifest survived
- **embed_survival_rate_preserve_only**: Embed survival rate in preserve-embed sandbox only
- **scenarios_failed**: Number of scenarios where remote survival failed

### Scenario Results Array
```json
{
  "results": [
    {
      "scenario_id": "IMG_JPEG_Q75_STRIP",
      "sandbox": "strip-happy",
      "remote_survives": true,
      "embed_survives": false,
      "headers_snapshot": {...},
      "manifest_fetch": {...},
      "timings_ms": {...},
      "error": null
    }
  ]
}
```

#### Scenario Result Fields
- **scenario_id**: Unique identifier from the matrix
- **sandbox**: Which sandbox environment was tested
- **remote_survives**: Boolean indicating if remote manifest survived
- **embed_survives**: Boolean indicating if embedded claims survived
- **headers_snapshot**: Complete HTTP headers from the asset request
- **manifest_fetch**: Details about manifest resolution and verification
- **timings_ms**: Performance metrics in milliseconds
- **error**: Error message if the scenario failed (null if successful)

## Detailed Field Specifications

### Headers Snapshot
```json
{
  "headers_snapshot": {
    "content-type": "image/jpeg",
    "cache-control": "public, max-age=31536000, immutable",
    "etag": "\"W/abc123\"",
    "link": "<https://manifests.survival.test/hash.c2pa>; rel=\"c2pa-manifest\"",
    "x-c2-policy": "remote-only",
    "x-manifest-hash": "a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456"
  }
}
```

### Manifest Fetch Details
```json
{
  "manifest_fetch": {
    "status": 200,
    "hash_alignment": true,
    "url": "https://manifests.survival.test/a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456.c2pa"
  }
}
```

#### Manifest Fetch Fields
- **status**: HTTP status code from manifest fetch (200 = success)
- **hash_alignment**: Boolean indicating if manifest content hash matches URL hash
- **url**: Full URL of the manifest that was fetched

### Timing Metrics
```json
{
  "timings_ms": {
    "edge_worker": 2,
    "origin": 11,
    "manifest_fetch": 6
  }
}
```

#### Timing Fields
- **edge_worker**: Time spent in Cloudflare edge worker processing
- **origin**: Time from edge worker to origin server response
- **manifest_fetch**: Time to fetch and verify the remote manifest

## Success Criteria & Thresholds

### Phase 0 Hard Gates
- **Remote Survival Rate**: Must be ≥ 99.9% (0.999)
- **Failed Scenarios**: Must be 0 for remote survival
- **Hash Alignment**: Must be true for all successful scenarios

### Phase 0 Advisory Metrics
- **Embed Survival Rate**: Target ≥ 95% in preserve-embed sandbox
- **Performance**: All scenarios should complete in < 10 seconds
- **Consistency**: Results should be reproducible across runs

### Failure Classification
```json
{
  "error": "Manifest hash mismatch - expected a1b2c3... got d4e5f6..."
}
```

#### Common Error Types
- **Network failures**: Unable to reach sandbox or manifest server
- **Hash alignment failures**: Manifest content doesn't match URL hash
- **Policy violations**: Remote-only policy not properly enforced
- **Transform failures**: Unable to apply specified transformations

## Report Generation Process

### Data Collection
1. Execute each scenario in the hostile-path matrix
2. Capture HTTP headers and timing data
3. Verify manifest resolution and hash alignment
4. Calculate survival verdicts based on expected outcomes

### Aggregation
1. Calculate overall survival rates
2. Identify failed scenarios and error patterns
3. Generate timing statistics and percentiles
4. Create summary metrics for dashboard display

### Output Generation
1. Write structured JSON report
2. Generate human-readable HTML report
3. Create per-scenario log files
4. Produce deterministic audit logs

## HTML Report Format

### Visual Design
- **Header**: Run metadata and overall status badge
- **Metrics Grid**: Key performance indicators with visual emphasis
- **Scenario List**: Detailed results with status indicators
- **Footer**: Timestamps and run identification

### Status Indicators
- **✅ PASS**: Green badge for meeting criteria
- **❌ FAIL**: Red badge for missing thresholds
- **⚠️ WARN**: Yellow badge for advisory issues

### Interactive Elements
- **Expandable Details**: Click scenarios to see full headers and timing data
- **Filter Options**: Filter by sandbox, status, or error type
- **Export Functions**: Download JSON, CSV, or PDF versions

## Integration & Consumption

### CI/CD Integration
```yaml
# GitHub Actions example
- name: Validate survival thresholds
  run: |
    REMOTE_RATE=$(jq -r '.remote_survival_rate' .artifacts/acceptance/survival.json)
    if (( $(echo "$REMOTE_RATE < 0.999" | bc -l) )); then
      echo "❌ Remote survival below threshold"
      exit 1
    fi
```

### Monitoring Integration
```javascript
// Prometheus metrics example
c2_survival_remote_rate{job="CredLink"} 1.0
c2_survival_embed_rate{job="CredLink"} 0.93
c2_scenarios_failed{job="CredLink"} 0
```

### Alerting Rules
```yaml
# Alertmanager rules
- alert: C2SurvivalRateLow
  expr: c2_survival_remote_rate < 0.999
  for: 5m
  labels:
    severity: critical
  annotations:
    summary: "CredLink remote survival rate below threshold"
```

## Historical Analysis

### Trend Tracking
- Track survival rates over time
- Identify degradation patterns
- Monitor performance regressions
- Analyze failure mode evolution

### Comparative Analysis
- Compare different matrix versions
- Assess impact of code changes
- Evaluate infrastructure modifications
- Measure optimization effectiveness

### Predictive Analytics
- Forecast survival rate trends
- Predict breach of thresholds
- Identify at-risk scenarios
- Recommend preventive actions

## Compliance & Audit

### Data Retention
- **Primary Reports**: 24 months retention
- **Raw Logs**: 90 days retention (extended for incidents)
- **Aggregate Data**: 7 years retention for compliance
- **Personal Data**: Follow GDPR/CCPA requirements

### Audit Trail
- All reports include HMAC signatures for integrity
- Immutable storage in append-only systems
- Cryptographic hash verification possible
- Full change history maintained

### Regulatory Reporting
- Quarterly survival rate summaries
- Annual compliance attestations
- Incident response documentation
- Third-party audit support

## API Access

### Report Endpoints
```http
GET /api/v1/reports/latest
GET /api/v1/reports/{run_id}
GET /api/v1/reports/history?limit=10&offset=0
```

### Response Format
```json
{
  "reports": [...],
  "pagination": {
    "total": 156,
    "limit": 10,
    "offset": 0
  },
  "summary": {
    "avg_remote_survival": 0.9987,
    "avg_embed_survival": 0.9456
  }
}
```

### Real-time Updates
- WebSocket endpoint for live test results
- Server-sent events for progress updates
- Webhook notifications for completion
- Slack integration for team alerts

---

**Version**: 1.0  
**Effective**: 2025-10-30  
**Review**: Monthly or after major specification changes
