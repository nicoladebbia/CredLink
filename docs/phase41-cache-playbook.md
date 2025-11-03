# Phase 41 — Cache Discipline Operational Playbook

**Purpose**: Fast debugging and resolution of cache-related issues  
**Standards**: RFC 9110/9111 HTTP Semantics + Caching  
**Target**: Support engineers and operations teams

---

## Quick Reference

### Cache TTL Values
- **Manifest**: `max-age=30, s-maxage=120, must-revalidate, stale-while-revalidate=300`
- **Verify**: `max-age=300, s-maxage=900, must-revalidate, stale-while-revalidate=600, stale-if-error=120`
- **Negative (404/410)**: `max-age=0, must-revalidate`

### Health Probe Endpoint
```bash
GET /health/cache?manifest={hash}&verify={key}
```

---

## Incident Response Procedures

### 1. Customer Reports Stale Badge

**Symptoms**: Badge shows outdated verification status; manifest appears cached

**Diagnosis Steps**:

1. **Check cache health**:
   ```bash
   curl -H "Authorization: Bearer $TOKEN" \
     "https://verify.example.com/health/cache?manifest=$MANIFEST_HASH"
   ```

2. **Compare ETags**:
   ```json
   {
     "manifest": {
       "manifestETagSeen": "\"7b1e4f2a\"",
       "manifestAgeSeconds": 45,
       "isStale": true
     }
   }
   ```

3. **Check if ETag mismatch**:
   - If `manifestETagSeen` differs from current manifest ETag → cache poisoning or stale content
   - If `isStale: true` → TTL expired, should revalidate

**Resolution**:

1. **Immediate**: Purge manifest cache
   ```bash
   curl -X POST \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"files": ["https://manifests.example.com/'$MANIFEST_HASH'.c2pa"]}' \
     "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache"
   ```

2. **If signed URLs in use**: Re-issue with fresh expiry
   ```bash
   # Generate new signed URL with 1-hour expiry
   curl -X POST \
     -H "Authorization: Bearer $TOKEN" \
     "https://verify.example.com/api/manifest/sign?hash=$MANIFEST_HASH&expiry=3600"
   ```

3. **Verify resolution**: Check health probe again
   ```bash
   curl "https://verify.example.com/health/cache?manifest=$MANIFEST_HASH"
   # Confirm: isStale=false, manifestETagSeen matches current
   ```

**Prevention**:
- Ensure `must-revalidate` directive is present
- Verify strong ETags are generated for all manifests
- Monitor cache hit rates for anomalies

---

### 2. Slow Verification Performance

**Symptoms**: High p95 latency on verify endpoints; cache hit rate low

**Diagnosis Steps**:

1. **Check cache statistics**:
   ```bash
   curl "https://verify.example.com/health/cache/stats"
   ```

2. **Analyze hit rates**:
   ```json
   {
     "manifestHitRate": 45.2,
     "verifyHitRate": 38.7,
     "notModifiedRate": 12.3
   }
   ```

3. **Identify issues**:
   - Hit rate < 50% → TTL too short or excessive purging
   - `notModifiedRate` < 20% → Clients not sending `If-None-Match`
   - High cache misses → Check for cache key collisions

**Resolution**:

1. **Review TTL settings**: Ensure values match Phase 41 spec
   ```typescript
   // Verify in code:
   MANIFEST_MAX_AGE = 30
   MANIFEST_S_MAXAGE = 120
   VERIFY_MAX_AGE = 300
   VERIFY_S_MAXAGE = 900
   ```

2. **Check purge frequency**:
   ```bash
   curl "https://verify.example.com/health/cache/purge-stats"
   ```
   - If `totalPurges` is very high → investigate purge triggers
   - If `errors > 0` → check Cloudflare API credentials

3. **Optimize client behavior**:
   - Ensure clients send `If-None-Match` headers
   - Verify `Accept-Encoding` is consistent (affects `Vary` header)

**Prevention**:
- Monitor cache hit rates continuously
- Alert on hit rate < 60% for manifests, < 70% for verify
- Review purge patterns weekly

---

### 3. Cache Poisoning Detected

**Symptoms**: Different content served for same URL; ETag mismatches; security alerts

**Diagnosis Steps**:

1. **Verify ETag integrity**:
   ```bash
   # Fetch manifest multiple times, compare ETags
   for i in {1..5}; do
     curl -I "https://manifests.example.com/$MANIFEST_HASH.c2pa" | grep ETag
   done
   ```

2. **Check validator consistency**:
   ```bash
   curl "https://verify.example.com/health/cache?manifest=$MANIFEST_HASH"
   # Look for: manifestETagSeen changes between requests
   ```

3. **Inspect edge cache status**:
   ```bash
   curl -I "https://manifests.example.com/$MANIFEST_HASH.c2pa" | grep cf-cache-status
   # Should be: HIT, MISS, EXPIRED, REVALIDATED (not STALE)
   ```

**Resolution**:

1. **Immediate**: Purge all caches
   ```bash
   # Purge by cache tags
   curl -X POST \
     -H "Authorization: Bearer $CF_API_TOKEN" \
     -H "Content-Type: application/json" \
     -d '{"tags": ["manifest:'$MANIFEST_HASH'", "verify:'$MANIFEST_HASH'"]}' \
     "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache"
   ```

2. **Verify strong ETags**:
   - Confirm ETags are quoted: `"abc123def456"`
   - Ensure byte-exact hashing (SHA-256 of content)

3. **Enable additional validation**:
   ```typescript
   // In middleware, add:
   if (!VALID_ETAG_REGEX.test(etag)) {
     throw new Error('Invalid ETag format');
   }
   ```

4. **Incident report**: Document ETag values, timestamps, affected requests

**Prevention**:
- Run acceptance test suite regularly
- Monitor for ETag format violations
- Enable Cloudflare cache analytics

---

### 4. Manifest Update Not Propagating

**Symptoms**: New assertions not visible; old manifest still served; ETag unchanged

**Diagnosis Steps**:

1. **Verify manifest was updated**:
   ```bash
   # Check origin directly (bypass cache)
   curl -H "Cache-Control: no-cache" \
     "https://manifests.example.com/$MANIFEST_HASH.c2pa"
   ```

2. **Compare ETags**:
   ```bash
   # Old ETag (from health probe)
   OLD_ETAG=$(curl "https://verify.example.com/health/cache?manifest=$MANIFEST_HASH" | jq -r '.manifest.manifestETagSeen')
   
   # New ETag (from origin)
   NEW_ETAG=$(curl -I -H "Cache-Control: no-cache" \
     "https://manifests.example.com/$MANIFEST_HASH.c2pa" | grep ETag | cut -d' ' -f2)
   
   echo "Old: $OLD_ETAG"
   echo "New: $NEW_ETAG"
   ```

3. **Check purge execution**:
   ```bash
   curl "https://verify.example.com/health/cache/purge-stats"
   # Verify: lastPurge is recent, errors=0
   ```

**Resolution**:

1. **Trigger manual purge**:
   ```bash
   # Via API
   curl -X POST \
     -H "Authorization: Bearer $TOKEN" \
     "https://verify.example.com/api/purge/manifest/$MANIFEST_HASH"
   ```

2. **Verify purge propagation**:
   ```bash
   # Wait 5 seconds, then check
   sleep 5
   curl -I "https://manifests.example.com/$MANIFEST_HASH.c2pa" | grep cf-cache-status
   # Should be: MISS (first request after purge)
   ```

3. **Confirm ETag update**:
   ```bash
   curl "https://verify.example.com/health/cache?manifest=$MANIFEST_HASH"
   # manifestETagSeen should match NEW_ETAG
   ```

**Prevention**:
- Automate purge on manifest updates (signer hooks)
- Monitor purge latency (should be < 5 seconds)
- Alert on purge failures

---

### 5. Mixed Content Warnings

**Symptoms**: Browser console shows mixed content errors; badges not loading; CSP violations

**Diagnosis Steps**:

1. **Check URL protocols**:
   ```bash
   # Verify all URLs are HTTPS
   curl "https://verify.example.com/api/verify" | jq '.manifestUrl'
   # Must start with https://
   ```

2. **Inspect CSP headers**:
   ```bash
   curl -I "https://verify.example.com/api/verify" | grep Content-Security-Policy
   ```

3. **Review browser console**:
   - Look for: "Mixed Content: The page at 'https://...' was loaded over HTTPS, but requested an insecure resource 'http://...'"
   - Check for CSP violations

**Resolution**:

1. **Update URLs to HTTPS**:
   ```typescript
   // In code, validate:
   if (!manifestUrl.startsWith('https://')) {
     throw new Error('Manifest URL must be HTTPS');
   }
   ```

2. **Verify CSP headers**:
   ```typescript
   // Ensure CSP includes:
   'Content-Security-Policy': 'upgrade-insecure-requests; ...'
   ```

3. **Add HSTS header**:
   ```typescript
   'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
   ```

**Prevention**:
- Enforce HTTPS in URL validation
- Run acceptance test: `testMixedContentPrevention()`
- Monitor CSP violation reports

---

## Monitoring & Alerts

### Key Metrics to Track

1. **Cache Hit Rates**:
   - Manifest: > 60%
   - Verify: > 70%
   - Alert if below threshold for > 5 minutes

2. **Purge Statistics**:
   - Purge latency: < 5 seconds
   - Purge errors: 0
   - Alert on any purge failure

3. **ETag Consistency**:
   - Monitor for ETag changes without manifest updates
   - Alert on suspected cache poisoning

4. **Conditional Request Rate**:
   - `notModifiedRate`: > 20%
   - Alert if clients not using conditional requests

### Dashboard Queries

```sql
-- Cache hit rate (last 1 hour)
SELECT 
  COUNT(CASE WHEN cf_cache_status = 'HIT' THEN 1 END) * 100.0 / COUNT(*) as hit_rate
FROM requests
WHERE timestamp > NOW() - INTERVAL '1 hour'
  AND path LIKE '%.c2pa';

-- Purge latency (last 24 hours)
SELECT 
  AVG(purge_duration_ms) as avg_latency,
  MAX(purge_duration_ms) as max_latency
FROM purge_events
WHERE timestamp > NOW() - INTERVAL '24 hours';

-- ETag mismatches (potential poisoning)
SELECT 
  manifest_hash,
  COUNT(DISTINCT etag) as unique_etags
FROM cache_events
WHERE timestamp > NOW() - INTERVAL '1 hour'
GROUP BY manifest_hash
HAVING COUNT(DISTINCT etag) > 1;
```

---

## Troubleshooting Decision Tree

```
Customer reports issue
    ↓
Is badge stale?
    ├─ YES → Check ETag mismatch → Purge cache → Verify resolution
    └─ NO → Is performance slow?
              ├─ YES → Check hit rates → Optimize TTL/purging
              └─ NO → Mixed content?
                        ├─ YES → Verify HTTPS URLs → Update CSP
                        └─ NO → Check health probe for anomalies
```

---

## Emergency Contacts

- **Cache Infrastructure**: cache-team@example.com
- **Cloudflare Support**: support.cloudflare.com
- **On-Call Engineer**: oncall@example.com
- **Escalation**: engineering-leads@example.com

---

## Useful Commands Reference

### Health Checks
```bash
# Full cache health
curl "https://verify.example.com/health/cache?manifest=$HASH&verify=$KEY"

# Cache statistics only
curl "https://verify.example.com/health/cache/stats"

# Purge statistics
curl "https://verify.example.com/health/cache/purge-stats"
```

### Cloudflare Purge
```bash
# Purge by URL
curl -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"files": ["https://example.com/file.c2pa"]}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache"

# Purge by cache tag
curl -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"tags": ["manifest:abc123"]}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache"

# Purge everything (use with caution)
curl -X POST \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"purge_everything": true}' \
  "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache"
```

### Testing
```bash
# Run acceptance tests
npm run test:phase41

# Test specific scenario
npm run test:phase41 -- --grep "Cache Poisoning"

# Verify ETag generation
curl -I "https://manifests.example.com/$HASH.c2pa" | grep ETag
```

---

## Appendix: RFC References

- **RFC 9110**: HTTP Semantics (validators, conditional requests)
- **RFC 9111**: HTTP Caching (freshness, revalidation, stale-while-revalidate)
- **Cloudflare Docs**: Instant Purge API, Cache-Control directives
- **MDN**: CSP, mixed content, HSTS

---

**Last Updated**: 2025-11-03  
**Version**: 1.0  
**Owner**: Cache Infrastructure Team
