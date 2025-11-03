# Phase 35 Public Survival Leaderboard - Methodology

## Purpose

Publish a neutral, reproducible ranking of CDNs/CMS/themes on how well they preserve C2PA Content Credentials in realistic "out-of-the-box" settings.

## Scope

### What We Score

1. **Embed Survival** - JUMBF intact after common transforms
2. **Remote-manifest Survival** - Honors Link: rel="c2pa-manifest"
3. **Discovery** - Verifiers can find manifest reliably
4. **Defaults vs Tuned** - Stock config vs minimal vendor-recommended toggle
5. **Docs Alignment** - Behavior matches vendor's public docs

### Who's in v1.1

#### CDN/Optimizers
- Cloudflare Images/Polish
- Fastly Image Optimizer
- Akamai IVM
- Cloudinary
- Imgix

#### CMS
- WordPress (core + popular themes)
- Shopify (popular themes)

### Ground Truth

We rely on CAI/C2PA Verify tools as the ground truth:
- opensource.contentauthenticity.org
- c2patool for command-line verification
- c2pa-python for programmatic verification

## Test Assets

### Asset Configuration

- **24 public demo images**: 6 JPEG, 6 PNG, 6 WEBP, 6 AVIF
- **Deterministic signing**: Each signed with c2pa-rs signer
- **Remote-manifest twins**: Each asset has embedded and remote variants
- **Verification**: Ground truth verified with CAI Verify + c2pa-python before testing

### Asset Properties

| Property | Specification |
|----------|---------------|
| Source | opensource.contentauthenticity.org |
| Formats | JPEG, PNG, WebP, AVIF |
| Sizes | 1MB - 5MB range |
| Signing | c2pa-rs deterministic signer |
| Manifests | Embedded + Remote variants |
| Verification | Pre-tested with CAI tools |

## Transforms

### Standard Transform Matrix

Each vendor is tested with 12 transformations:

1. **Resize** - w=800, h=600, fit=cover
2. **Crop** - w=400, h=400, fit=crop
3. **Format WebP** - format=webp
4. **Format AVIF** - format=avif
5. **Quality 85** - quality=85
6. **Quality 65** - quality=65
7. **DPR 2x** - dpr=2
8. **Sharpen** - sharpen=10
9. **Metadata Strip** - metadata=none
10. **Metadata Keep** - metadata=all
11. **Vendor Preserve** - Vendor-specific C2PA toggle
12. **Combined** - Multiple transforms together

### Configuration Testing

- **Default**: Stock out-of-the-box settings
- **Best Practice**: With vendor-documented C2PA preservation toggle
- **Two-score model**: Separate scores for each configuration

## Verification Process

### Per-Output Verification

For each transformed output we store:

1. **HTTP Headers** - Complete response headers
2. **Content Hash** - SHA-256 of transformed content
3. **Content Type** - MIME type and format
4. **Verify Result** - c2patool verification output
5. **Discovery Trace** - Remote manifest discovery process
6. **Performance Metrics** - Latency and timing data

### Verification Steps

1. **Embedded Manifest Check**
   ```bash
   c2patool transformed-image.jpg --output json
   ```

2. **Remote Manifest Discovery**
   ```bash
   curl -I "transformed-url" | grep -i "link.*c2pa-manifest"
   ```

3. **Manifest Accessibility**
   ```bash
   curl -I "manifest-url" | head -1
   ```

4. **CAI Verification**
   ```bash
   cai-verify transformed-image.jpg --format json
   ```

## Scoring Rubric

### 100-Point Scale

| Dimension | Points | Test Type | Weight |
|-----------|--------|-----------|--------|
| Embedded Manifest Survival | 35 | Scaled | 35% |
| Remote Manifest Honored | 25 | Binary | 25% |
| Discovery Reliability | 15 | Threshold | 15% |
| Documentation Alignment | 15 | Binary | 15% |
| Reproducibility | 10 | Binary | 10% |

### Dimension Details

#### 1. Embedded Manifest Survival (35 points)

- **Test Type**: Scaled scoring based on transformation complexity
- **Weighting**: Basic transforms (15%), Format conversions (12%), Quality (8%), Display (5%), Complex (15%)
- **Success Criteria**: Manifest found and valid after transformation
- **Verification**: c2patool manifest detection and validation

#### 2. Remote Manifest Honored (25 points)

- **Test Type**: Binary (present/absent)
- **Success Criteria**: Link header with rel="c2pa-manifest" preserved
- **Verification**: HTTP header parsing and manifest accessibility test
- **Bonus**: Proper MIME type and CORS configuration

#### 3. Discovery Reliability (15 points)

- **Test Type**: Threshold-based
- **Latency Threshold**: Green <500ms, Yellow <1000ms, Red >1000ms
- **Reliability Threshold**: Green >95%, Yellow >85%, Red <85%
- **Mixed Content**: Penalty for HTTP manifest on HTTPS page

#### 4. Documentation Alignment (15 points)

- **Test Type**: Binary comparison
- **Success Criteria**: Observed behavior matches vendor documentation
- **Sources**: Official docs, blog posts, press releases
- **Process**: Documentation review vs actual test results

#### 5. Reproducibility (10 points)

- **Test Type**: Binary verification
- **Success Criteria**: All outputs re-verify with public tools
- **Verification**: Independent tool verification
- **Consistency**: Same result across multiple runs

### Grade Boundaries

- 🟢 **Green**: ≥90 points
- 🟡 **Yellow**: 75-89 points
- 🔴 **Red**: <75 points

### Tie-Breakers

1. **Configuration Complexity** - Smaller changes to get to green
2. **Documentation Clarity** - Clearer implementation guidance
3. **Performance Impact** - Lower overhead for C2PA preservation
4. **Ecosystem Adoption** - Broader support and integration

## Test Execution

### Automated Matrix

```
/leaderboard/run?matrix=v2025.44
```

Executes Reverse-Lab matrix against all vendors:
- NDJSON per case output
- verify.json per transformation
- Complete headers and metadata
- Performance timing data

### Rate Limiting

- **Respect robots.txt** and RFC standards
- **Throttled requests**: 10 req/sec per vendor
- **Burst limits**: 20 req/sec max
- **Backoff**: Exponential backoff on failures
- **Cache**: Public demo assets cached locally

### Error Handling

- **Retry Logic**: 3 attempts with 1s backoff
- **Timeout**: 30 seconds per request
- **Validation**: Input sanitization and validation
- **Logging**: Complete audit trail

## Data Pipeline

### Jobs API

```bash
POST /leaderboard/run?matrix=v2025.44
```

- Executes complete test matrix
- Emits NDJSON per test case
- Generates verify.json artifacts
- Stores headers and metadata

### Viewer Interface

- **Vendor Cards**: Logo, scores, last test date
- **Reproduce Buttons**: curl + c2patool commands
- **Historical Trends**: Score changes over time
- **Raw Data Access**: Download complete results

### Artifacts

- **Weekly Zips**: Complete run data
- **Headers**: HTTP response headers
- **Byte Hashes**: Content verification hashes
- **Verifier Logs**: Complete tool output
- **Command Logs**: Reproduction commands

## Vendor Correction Process

### Submission

```bash
POST /leaderboard/corrections
{
  "vendorId": "cloudflare-images",
  "correctionType": "docs",
  "description": "Documentation update needed",
  "docUrls": ["https://docs.cloudflare.com/..."],
  "testUrls": ["https://example.com/test.jpg"],
  "proposedConfig": {"preserve-credentials": "true"}
}
```

### Review Process

1. **Validation**: Verify submission completeness
2. **Documentation Review**: Check cited sources
3. **Testing**: Execute proposed configuration
4. **Results**: Compare with current scores
5. **Publication**: Update with changelog note

### Retesting

- **Timeline**: Within 7 days of submission
- **Public**: Retest process is transparent
- **Documentation**: Links to vendor docs included
- **Changelog**: Before/after diffs published

## Ethics and Neutrality

### Reproducibility

- **Public Methodology**: Complete protocol published
- **Raw Data**: All inputs, commands, outputs available
- **Tool Versions**: Specific tool versions documented
- **Environment**: Test environment fully specified

### Neutral Tone

- **Objective Language**: Describe what we measured
- **No Motives**: Avoid assumptions about vendor intentions
- **Evidence-Based**: All claims backed by test data
- **Citations**: Reference vendor documentation

### Collaboration

- **Right-to-Reply**: Vendors can submit corrections
- **Credit**: Improvements attributed to vendors
- **Transparency**: All changes publicly documented
- **Process**: Clear correction and retest path

## Technical Implementation

### Security

- **SSRF Protection**: Private IP range blocking
- **Input Validation**: Comprehensive sanitization
- **Rate Limiting**: Per-client throttling
- **Access Control**: API authentication where required

### Performance

- **Parallel Execution**: Concurrent test runs
- **Caching**: Asset and result caching
- **Optimization**: Efficient data structures
- **Monitoring**: Performance metrics collection

### Reliability

- **Error Recovery**: Graceful failure handling
- **Retry Logic**: Automatic retry on failures
- **Monitoring**: Health checks and alerts
- **Backup**: Redundant data storage

## Quality Assurance

### Validation

- **Unit Tests**: Core logic validation
- **Integration Tests**: End-to-end workflows
- **Security Tests**: Vulnerability scanning
- **Performance Tests**: Load and timing validation

### Review Process

- **Code Review**: All changes reviewed
- **Documentation**: Updated with each change
- **Testing**: Comprehensive test coverage
- **Security**: Security audit for each release

## Continuous Improvement

### Feedback Loop

- **User Feedback**: Community input integration
- **Vendor Input**: Industry expert consultation
- **Technical Updates**: Tool and specification updates
- **Methodology Review**: Regular process improvement

### Evolution

- **New Vendors**: Added based on market demand
- **New Features**: Enhanced scoring and testing
- **Tool Updates**: Latest verification tools
- **Specification Changes**: C2PA standard evolution

---

**Version**: 1.1.0  
**Last Updated**: 2025-01-03  
**Next Review**: 2025-04-03
