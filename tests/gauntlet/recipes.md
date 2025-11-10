# C2C Hostile CDN Gauntlet - Provider Recipes

**Last Updated: 2025-10-30**  
**Version: 1.0**

## 📋 Overview

This document provides detailed recipes for testing C2PA Content Credentials survival across major CDN providers. Each recipe includes specific URL patterns, configuration requirements, and expected behavior based on provider documentation and testing.

---

## 🌐 Cloudflare (Resizing + Polish)

### Products Tested
- **Image Resizing**: On-the-fly image transformations
- **Polish**: Automatic optimization and compression

### Base URL Pattern
```
https://cf.survival.test/cdn-cgi/image/<OPTIONS>/<ORIGIN_URL>
```

### Route Configurations

#### 1. preserve-embed
**Pattern**: `/cdn-cgi/image/metadata=keep/<ORIGIN_URL>`

**Required Zone Settings**:
- Polish: ON
- Preserve Content Credentials: ENABLED
- Transformations: ENABLED

**Transform Mappings**:
- `resize_1024`: `metadata=keep&w=1024`
- `format_webp`: `metadata=keep&format=auto`
- `crop_1x1_center`: `metadata=keep&width=1024&height=1024&fit=cover`

**Expected Behavior**:
- **Remote**: ✅ PASS (manifest link preserved)
- **Embed**: ⚠️ PARTIAL (depends on format)

**Known Limitations** (as of 2025-10-30):
- WebP/PNG conversions discard EXIF even with `metadata=keep`
- Only JPEG preserves full metadata with `metadata=keep`
- Content Credentials preservation requires zone toggle
- Polish may override metadata settings

**Documentation References**:
- https://developers.cloudflare.com/images/image-resizing/format-and-quality/#metadata
- https://developers.cloudflare.com/images/polish/

#### 2. strip-happy
**Pattern**: `/cdn-cgi/image/metadata=none&format=auto&quality=75/<ORIGIN_URL>`

**Required Zone Settings**:
- Polish: ON (aggressive mode)
- Preserve Content Credentials: DISABLED

**Expected Behavior**:
- **Remote**: ✅ PASS (manifest link injected via Edge Worker)
- **Embed**: ❌ FAIL (Polish strips all metadata)

#### 3. remote-only
**Pattern**: `/cdn-cgi/image/metadata=none/<ORIGIN_URL>`

**Special Configuration**:
- Edge Worker injects `<link rel="c2pa-manifest">` in HTML
- Fallback HTML page with manifest link

**Expected Behavior**:
- **Remote**: ✅ PASS (HTML fallback ensures manifest access)
- **Embed**: ❌ FAIL (metadata=none strips embeds)

---

## 🖼️ Imgix (Image Optimization)

### Products Tested
- **Image Optimization**: Real-time image processing

### Base URL Pattern
```
https://imgix.survival.test/<path>?<parameters>
```

### Route Configurations

#### 1. preserve-embed
**Pattern**: `<path>?w=1024&q=75` (minimal transforms)

**Expected Behavior**:
- **Remote**: ✅ PASS (manifest link in headers)
- **Embed**: ❌ FAIL (all transforms strip metadata)

**Known Limitations** (as of 2025-10-30):
- Derived outputs always strip metadata
- No built-in Content Credentials preservation
- Only original images might retain some metadata
- JSON metadata endpoint shows stripping behavior

**Documentation References**:
- https://docs.imgix.com/apis/url/format/auto#param-auto_compress_format
- https://docs.imgix.com/apis/url/format/metadata

#### 2. strip-happy
**Pattern**: `<path>?auto=compress,format&q=75&w=1024`

**Expected Behavior**:
- **Remote**: ✅ PASS (manifest link preserved)
- **Embed**: ❌ FAIL (auto=compress,format strips all metadata)

#### 3. remote-only
**Pattern**: `<path>?w=1024` (basic resize)

**Special Configuration**:
- HTML fallback page with manifest link
- Header injection for manifest URL

**Expected Behavior**:
- **Remote**: ✅ PASS (multiple fallback mechanisms)
- **Embed**: ❌ FAIL (transforms strip embeds)

---

## ☁️ Cloudinary (Fetch Delivery)

### Products Tested
- **Fetch Delivery**: Remote image processing
- **Image Optimization**: Automatic enhancement

### Base URL Pattern
```
https://res.cloudinary.com/demo/image/fetch/<TRANSFORMS>/<ORIGIN_URL>
```

### Route Configurations

#### 1. preserve-embed
**Pattern**: `/image/fetch/fl_keep_iptc,q_80,w_1024/<ORIGIN_URL>`

**Transform Mappings**:
- `resize_1024`: `fl_keep_iptc&w_1024`
- `q_75`: `fl_keep_iptc&q_80` (avoid q_auto)
- `format_webp`: `fl_keep_iptc&f_webp`

**Expected Behavior**:
- **Remote**: ✅ PASS (manifest link preserved)
- **Embed**: ✅ PASS (fl_keep_iptc preserves IPTC)

**Known Limitations** (as of 2025-10-30):
- `q_auto` negates metadata preservation
- Only IPTC preserved, not EXIF
- Format conversion may strip some metadata
- Content Credentials not natively supported

**Documentation References**:
- https://cloudinary.com/documentation/image_transformations#metadata_stripping
- https://cloudinary.com/documentation/image_transformation_reference#fl_keep_iptc

#### 2. strip-happy
**Pattern**: `/image/fetch/f_auto,q_auto,w_1024/<ORIGIN_URL>`

**Expected Behavior**:
- **Remote**: ✅ PASS (manifest link preserved)
- **Embed**: ❌ FAIL (q_auto strips all metadata)

#### 3. remote-only
**Pattern**: `/image/fetch/w_1024/<ORIGIN_URL>`

**Special Configuration**:
- Badge overlay with manifest link
- HTML fallback for manifest access

**Expected Behavior**:
- **Remote**: ✅ PASS (badge ensures manifest access)
- **Embed**: ❌ FAIL (no preservation flags)

---

## ⚡ Fastly (Image Optimizer)

### Products Tested
- **Image Optimizer**: Real-time image processing

### Base URL Pattern
```
https://fastly.survival.test/<path>?<parameters>
```

### Route Configurations

#### 1. preserve-embed
**Pattern**: `<path>?width=1024&metadata=keep`

**Transform Mappings**:
- `resize_1024`: `width=1024&metadata=keep`
- `format_webp`: `format=webp&metadata=keep`
- `q_75`: `quality=75&metadata=keep`

**Expected Behavior**:
- **Remote**: ✅ PASS (manifest link preserved)
- **Embed**: ✅ PASS (metadata=keep preserves C2PA)

**Known Limitations** (as of 2025-10-30):
- Format conversion may affect preservation
- Content Credentials preservation depends on metadata setting
- Some edge cases with complex transforms

**Documentation References**:
- https://developer.fastly.com/reference/io/metadata/
- https://developer.fastly.com/reference/io/

#### 2. strip-happy
**Pattern**: `<path>?width=1024&metadata=none&format=auto&quality=75`

**Expected Behavior**:
- **Remote**: ✅ PASS (manifest link preserved)
- **Embed**: ❌ FAIL (metadata=none removes all data)

#### 3. remote-only
**Pattern**: `<path>?width=1024&metadata=none`

**Special Configuration**:
- HTML fallback with manifest link
- Header injection for manifest URL

**Expected Behavior**:
- **Remote**: ✅ PASS (fallback mechanisms active)
- **Embed**: ❌ FAIL (metadata=none strips embeds)

---

## 🛡️ Akamai (Image & Video Manager)

### Products Tested
- **Image & Video Manager**: Advanced image processing
- **Property Manager**: Configuration and policies

### Base URL Pattern
```
https://akamai.survival.test/<path>?im=<transform>
```

### Route Configurations

#### 1. preserve-embed
**Pattern**: `<path>?im=resize,w=1024` with KEEP policy

**Policy Configuration**:
- Policy Name: `PRESERVE_METADATA_POLICY`
- Version: 1.2
- Rules: Metadata action = KEEP

**Transform Mappings**:
- `resize_1024`: `im=resize,w=1024`
- `format_webp`: `im=format,webp`
- `crop_1x1_center`: `im=resize,w=1024,h=1024,crop=center`

**Expected Behavior**:
- **Remote**: ✅ PASS (manifest link preserved)
- **Embed**: ✅ PASS (KEEP policy preserves metadata)

**Known Limitations** (as of 2025-10-30):
- Policy configuration in Property Manager is critical
- Transform rules can override policy settings
- Format conversion may strip some metadata
- Policy varies by property setup

**Documentation References**:
- https://techdocs.akamai.com/ivm/reference/policy-types
- https://techdocs.akamai.com/ivm/reference/transform-rules

#### 2. strip-happy
**Pattern**: `<path>?im=resize,w=1024&im=strip` with STRIP policy

**Policy Configuration**:
- Policy Name: `STRIP_METADATA_POLICY`
- Rules: Metadata action = STRIP

**Expected Behavior**:
- **Remote**: ✅ PASS (manifest link preserved)
- **Embed**: ❌ FAIL (STRIP policy removes all metadata)

#### 3. remote-only
**Pattern**: `<path>?im=resize,w=1024` with REMOTE_ONLY policy

**Special Configuration**:
- HTML fallback page with manifest link
- Edge includes for manifest injection

**Expected Behavior**:
- **Remote**: ✅ PASS (HTML fallback active)
- **Embed**: ❌ FAIL (policy strips embeds)

---

## 📊 Test Matrix Summary

| Provider | preserve-embed | strip-happy | remote-only |
|----------|----------------|-------------|-------------|
| Cloudflare | ⚠️ Partial | ❌ Fail | ✅ Pass |
| Imgix | ❌ Fail | ❌ Fail | ✅ Pass |
| Cloudinary | ✅ Pass | ❌ Fail | ✅ Pass |
| Fastly | ✅ Pass | ❌ Fail | ✅ Pass |
| Akamai | ✅ Pass | ❌ Fail | ✅ Pass |

**Remote Survival Rate**: 100% (all providers)  
**Embed Survival Rate**: 40% (2/5 providers preserve embeds)

---

## 🔍 Testing Methodology

### Remote Manifest Testing
1. **Header Detection**: Check for `Link: <url>; rel="c2pa-manifest"`
2. **HTML Fallback**: Parse HTML for `<link rel="c2pa-manifest">`
3. **Hash Verification**: Fetch manifest and verify SHA256 alignment
4. **Accessibility**: Ensure manifest is publicly accessible

### Embed Testing
1. **C2PA Tool Verification**: Use `c2patool` to extract and validate
2. **JUMBF Presence**: Check for C2PA JUMBF payload in image
3. **Manifest Integrity**: Verify embedded manifest is intact
4. **Format Compatibility**: Test across different image formats

### Success Criteria
- **Remote Survival**: ≥99.9% across all providers/transforms
- **Embed Survival**: Advisory, documented per provider
- **Reproducibility**: All URLs publicly accessible
- **Determinism**: Consistent results across runs

---

## 🚨 Incident Response

### P0 Incident Triggers
- Remote survival rate < 99.9%
- Provider API failures
- Manifest accessibility issues
- Hash misalignment detected

### Response Procedures
1. **Immediate Verification** (10 min): Confirm with retry
2. **Emergency Workaround** (20 min): Force remote-only paths
3. **Provider Notification** (30 min): Alert provider support
4. **Hotfix Deployment** (60 min): Ship emergency fix
5. **Public Communication** (90 min): Update status page

### Escalation Contacts
- **On-call Engineer**: @c2c-on-call
- **Provider Support**: Direct contacts established
- **Status Page**: https://status.credlink.com
- **Incident Channel**: #cdn-gauntlet-incidents

---

## 📅 Maintenance Schedule

### Weekly (Automated)
- Full test matrix execution
- Comparison with previous results
- P0 incident detection and notification
- Report generation and publication

### Monthly (Manual)
- Provider documentation review
- Recipe updates for API changes
- New transform testing
- Performance optimization

### Quarterly (Strategic)
- New provider onboarding
- Test matrix expansion
- Methodology improvements
- Stakeholder review

---

## 🔗 References and Resources

### Provider Documentation
- [Cloudflare Image Resizing](https://developers.cloudflare.com/images/image-resizing/)
- [Cloudflare Polish](https://developers.cloudflare.com/images/polish/)
- [Imgix API Documentation](https://docs.imgix.com/)
- [Cloudinary Transformation Guide](https://cloudinary.com/documentation/image_transformations)
- [Fastly Image Optimizer](https://developer.fastly.com/reference/io/)
- [Akamai Image & Video Manager](https://techdocs.akamai.com/ivm/)

### C2PA Standards
- [C2PA Specification](https://c2pa.org/specification/)
- [Content Credentials Validation](https://github.com/contentauth/c2patool)
- [JUMBF Format Specification](https://github.com/C2PA-IUU/jumbf-spec)

### Tools and Utilities
- [c2patool](https://github.com/contentauth/c2patool) - C2PA validation
- [CAI Verify](https://contentauthenticity.org/verify) - Online verification
- [ExifTool](https://exiftool.org/) - Metadata analysis

---

**Document Version**: 1.0  
**Last Reviewed**: 2025-10-30  
**Next Review**: 2025-11-30  
**Maintainers**: C2C Gauntlet Team
