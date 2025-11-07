# Playbook: Cache Bypass Spike

## Symptom
Cache-bypass rate increases significantly on `/verify/badge` or other endpoints, causing unnecessary origin hits and increased latency/cost.

## Detection Criteria
- `CacheCacheStatus` shows high rate of `bypass`, `dynamic`, or `ignored`
- Cache-bypass rate increases by >30 percentage points
- Impact: Increased origin load, egress costs (if not on R2), slower response times

## Root Causes
1. **Cache-ineligible responses**: Missing or incorrect cache headers
2. **Dynamic content**: Responses vary per request
3. **Query string variations**: Different query params bypassing cache
4. **Cookie-based bypass**: Presence of cookies preventing caching

## Remediation Steps

### Step 1: Verify Cache-Status Header
Check actual `Cache-Status` header in responses (RFC 9211 compliant):

```bash
curl -I https://your-domain.com/verify/badge/asset-id \
  -H "Accept: application/json"
```

Expected: `Cache-Status: cloudflare; hit` or `revalidated`
Actual (problem): `Cache-Status: cloudflare; bypass` or `dynamic`

**Reference**: [RFC 9211 - HTTP Cache-Status Header](https://www.rfc-editor.org/rfc/rfc9211.html)

### Step 2: Add/Raise Cache TTL
Ensure proper `Cache-Control` header with TTL:

```javascript
// Workers example
export default {
  async fetch(request, env) {
    const response = await fetch(request);
    
    // Clone response to modify headers
    const newResponse = new Response(response.body, response);
    
    // Add cache headers for verification responses
    newResponse.headers.set('Cache-Control', 'public, max-age=300, s-maxage=300');
    newResponse.headers.set('Vary', 'Accept');
    
    return newResponse;
  }
};
```

**TTL Guidelines**:
- Badge verification: 5 minutes (300s)
- Manifest retrieval: 1 hour (3600s)
- Static assets: 24 hours (86400s)

### Step 3: Enable Revalidation
Use `stale-while-revalidate` for better cache hit rates:

```
Cache-Control: public, max-age=300, stale-while-revalidate=60
```

This allows serving stale content while revalidating in the background.

**Reference**: [RFC 5861 - HTTP Cache-Control Extensions](https://www.rfc-editor.org/rfc/rfc5861.html)

### Step 4: Verify Cache Eligibility
Cloudflare caches responses when:
- HTTP method is GET or HEAD
- Status code is 200, 301, 404 (configurable)
- No `Set-Cookie` header in response
- `Cache-Control` doesn't contain `private`, `no-store`, or `no-cache`

Check for these conditions in your responses.

### Step 5: Handle Query String Variations
If bypass is due to query params, use Cache Key customization:

```javascript
// Cloudflare Page Rule or Workers
// Ignore query string variations for caching
const url = new URL(request.url);
const cacheKey = new Request(url.origin + url.pathname, request);
return fetch(cacheKey);
```

### Step 6: Monitor Cache Performance
After changes, monitor `Cache-Status` header distribution:

```sql
-- Sample Cloudflare Analytics Engine query
SELECT
  CacheCacheStatus,
  COUNT(*) as requests,
  COUNT(*) * 100.0 / SUM(COUNT(*)) OVER () as percentage
FROM WorkersInvocationsAdaptive
WHERE EdgeStartTimestamp >= timestamp_sub(current_timestamp(), INTERVAL 1 HOUR)
GROUP BY CacheCacheStatus
ORDER BY requests DESC;
```

## Success Criteria
- Cache hit rate >80% (hit + revalidated)
- Cache bypass rate <10%
- `Cache-Status` header shows `hit` or `revalidated` for most requests
- P95 latency decreases due to edge serving

## Rollback Plan
If changes cause issues:

1. Remove added cache headers immediately
2. Restore previous `Cache-Control` values
3. Clear cache if needed:
   ```bash
   curl -X POST "https://api.cloudflare.com/client/v4/zones/{zone_id}/purge_cache" \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     --data '{"purge_everything":true}'
   ```

## References
- [Cloudflare Cache Documentation](https://developers.cloudflare.com/cache/)
- [RFC 9211 - HTTP Cache-Status Header](https://www.rfc-editor.org/rfc/rfc9211.html)
- [RFC 5861 - Cache-Control Extensions](https://www.rfc-editor.org/rfc/rfc5861.html)

## Cost Impact
- **Before**: High origin hits, increased egress (if S3), slower responses
- **After**: 80%+ cache hit rate, reduced origin load, faster responses, lower egress costs
- **Estimated Savings**: $50-500/day depending on traffic volume
