# C2C Hostile CDN Gauntlet v1.0

**Vendor-neutral C2PA Content Credentials survival testing across major CDN providers**

## 🎯 Purpose

Tests C2PA Content Credentials survival through hostile CDN transformations with:
- **Remote-manifest authority**: Remote manifests win over embedded data
- **Public reproducibility**: Anyone can click URLs to verify results
- **P0 incidenting**: Automatic regression detection and alerting
- **Weekly automation**: Continuous monitoring of provider behavior

## 📊 Current Status

**Last Run**: 2025-10-30  
**Remote Survival**: 100% ✅  
**Embed Survival**: 23% ⚠️  
**Report**: [View Live Report](https://docs.c2concierge.com/survival-reports/2025-10-30/)

## 🏗️ Architecture

```
Origin (S3/R2) → CDN Providers → Testing Harness → Report Artifacts
```

### Providers Tested
- **Cloudflare** (Resizing + Polish)
- **Imgix** (Image Optimization)
- **Cloudinary** (Fetch Delivery)
- **Fastly IO** (Image Optimizer)
- **Akamai IVM** (Image & Video Manager)

### Test Routes
1. **preserve-embed**: Provider configured to preserve metadata
2. **strip-happy**: Aggressive transforms that strip metadata
3. **remote-only**: Embed ignored, remote manifest only

### Transform Matrix
- resize:1024w, q=75, format:webp, format:avif, crop:1:1
- progressive-jpeg, rotate:90, sharpen, gamma/contrast
- png↔jpeg conversion, dpr:2, provider auto-optimize

## 🔍 Methodology

### Remote Survival (Authoritative)
1. Check `Link: <...sha256.c2pa>; rel="c2pa-manifest"` header
2. Fallback: HTML `<link rel="c2pa-manifest">` element
3. Fetch manifest and verify SHA256 alignment
4. **PASS** = Manifest reachable and hash matches

### Embed Survival (Advisory)
1. Run `c2patool` verify on delivered asset
2. Check for intact C2PA JUMBF payload
3. **PASS** = C2PA data present and verifiable

## 📋 Provider Behavior (as of 2025-10-30)

### Cloudflare
- **Polish**: Strips metadata by design
- **Resizing**: `metadata=none|copyright|keep` option available
- **WebP/PNG**: Discard EXIF even with `metadata=keep`
- **Content Credentials**: Zone toggle required for preservation

### Imgix
- **Default**: Strips all image metadata
- **auto=compress/format**: Aggressive metadata removal
- **Preservation**: Not possible on derived outputs

### Cloudinary
- **Transforms**: Strip metadata unless `fl_keep_iptc`
- **q_auto**: Negates metadata preservation
- **Fetch**: Supports explicit keep flags

### Fastly IO
- **Default**: Removes all metadata
- **metadata=keep**: Preserves when explicitly set
- **Format conversion**: May strip some metadata

### Akamai IVM
- **STRIP policy**: Removes metadata by default
- **Policy Manager**: Configurable preservation rules
- **Transform rules**: Override preservation settings

## 🚨 P0 Incident Process

Any remote survival regression triggers:
1. **Automatic GitHub issue** with `incident` label
2. **Immediate alert** to on-call team
3. **Hotfix window**: 1 hour to resolve
4. **Force remote-only**: Fallback if provider fails
5. **Public notification**: Update to live report

## 📅 Weekly Automation

**Schedule**: Every Tuesday 09:00 ET  
**Process**:
1. Generate URL matrix from `matrix.yaml`
2. Execute all test cases with backoff
3. Compare results with previous run
4. Generate diff report and artifacts
5. Publish to `/docs/survival-reports/YYYY-MM-DD/`
6. Open P0 incidents on regressions

## 🔗 Public URLs

All test URLs are stable and unauthenticated:
- Origin: `https://origin.survival.test/gauntlet/corpus/...`
- Cloudflare: `https://cf.survival.test/...`
- Imgix: `https://imgix.survival.test/...`
- Cloudinary: `https://cloudinary.survival.test/...`
- Fastly: `https://fastly.survival.test/...`
- Akamai: `https://akamai.survival.test/...`

## 📊 Current Results

| Provider | Route | Transform | Remote | Embed | Notes |
|----------|-------|-----------|--------|-------|-------|
| Cloudflare | preserve-embed | resize_1024 | ✅ | ⚠️ | WebP strips EXIF |
| Imgix | strip-happy | format_webp | ✅ | ❌ | auto=format strips metadata |
| Cloudinary | preserve-embed | q_75 | ✅ | ✅ | fl_keep_iptc works |
| Fastly | remote-only | format_avif | ✅ | N/A | Remote manifest only |
| Akamai | strip-happy | crop_1x1 | ✅ | ❌ | STRIP policy active |

## 🛠️ Development

### Running Tests
```bash
cd gauntlet
npm install
npm run build
npm run test
npm run report
```

### Adding New Providers
1. Create `providers/<name>.yaml`
2. Add to `matrix.yaml` providers list
3. Implement URL mapping in `src/buildUrls.ts`
4. Add provider-specific probes in `src/probes/`

### Updating Corpus
```bash
# Add new assets to corpus/images/
# Update corpus/manifest.json with SHA256
npm run update-corpus
```

## 📄 License

MIT License - see LICENSE file for details

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Add tests for new functionality
4. Submit pull request

---

**Last Updated**: 2025-10-30  
**Next Run**: 2025-11-05 09:00 ET
