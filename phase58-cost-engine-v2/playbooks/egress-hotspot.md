# Playbook: Egress Hotspot

## Symptom

High egress costs from manifest origin due to cache bypasses and large file transfers.

## Detection Criteria

- Egress per request increases by >50%
- High cache-bypass rate (>50%) on specific routes
- Large response sizes combined with high request volume
- Impact: $100-1000/day in egress charges

## Root Causes

1. **Origin on S3**: Paying AWS egress fees ($0.09/GB)
2. **Embed-chasing**: Optimizers/validators re-requesting manifests
3. **Cache misses**: Manifests not being cached at edge
4. **Large manifest files**: Unoptimized C2PA manifests

## Remediation Steps

### Step 1: Migrate Manifest Origin to R2

**Why**: Cloudflare R2 has ZERO egress charges when serving through Cloudflare CDN.

**Pricing Comparison**:

- AWS S3 egress: $0.09/GB
- Cloudflare R2 egress (via Cloudflare): **$0.00/GB** ✅

**Reference**: [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/)

```bash
# 1. Create R2 bucket
wrangler r2 bucket create c2pa-manifests

# 2. Sync existing manifests from S3 to R2
rclone sync s3:your-bucket r2:c2pa-manifests --progress

# 3. Update Workers to point to R2
```

Workers code example:

```javascript
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const manifestPath = url.pathname.replace('/manifests/', '');

    // Fetch from R2 (zero egress!)
    const object = await env.MANIFESTS_BUCKET.get(manifestPath);

    if (!object) {
      return new Response('Manifest not found', { status: 404 });
    }

    // Return with proper cache headers
    return new Response(object.body, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600, immutable',
        'X-Origin': 'R2'
      }
    });
  }
};
```

### Step 2: Force Remote-Only for Embeds

If optimizers are stripping manifests, force remote-only delivery:

```javascript
// Detect optimizer user agents
const optimizerAgents = ['imgix', 'cloudinary', 'imagekit', 'GoogleImageProxy', 'TelegramBot'];

function isOptimizer(userAgent) {
  return optimizerAgents.some(agent => userAgent.toLowerCase().includes(agent.toLowerCase()));
}

// In Workers
if (isOptimizer(request.headers.get('user-agent'))) {
  // Return manifest URL instead of embedding
  return new Response(
    JSON.stringify({
      manifestUrl: `https://manifests.yourdomain.com/${assetId}.c2pa`
    }),
    {
      headers: { 'Content-Type': 'application/json' }
    }
  );
}
```

### Step 3: Add Regional R2 Buckets

For global traffic, use regional R2 buckets:

```javascript
// Select nearest R2 bucket based on Cloudflare colo
const regionMap = {
  NA: 'manifests-us',
  EU: 'manifests-eu',
  APAC: 'manifests-apac'
};

const region = getRegionFromColo(request.cf.colo);
const bucket = env[regionMap[region]] || env.MANIFESTS_BUCKET;

const object = await bucket.get(manifestPath);
```

**Regional Colos**:

- North America: IAD, ORD, DFW, LAX, SEA, MIA
- Europe: LHR, FRA, AMS, CDG
- APAC: SIN, NRT, HKG, SYD

### Step 4: Implement Cache Warming

Pre-warm cache for popular manifests:

```javascript
// Cache warming Worker (scheduled)
export default {
  async scheduled(event, env, ctx) {
    // Get top 1000 manifests from analytics
    const topManifests = await getTopManifests(env, 1000);

    // Warm cache
    for (const manifestId of topManifests) {
      const url = `https://manifests.yourdomain.com/${manifestId}.c2pa`;

      // Make request to warm cache
      await fetch(url, {
        cf: { cacheTtl: 3600 }
      });
    }
  }
};
```

### Step 5: Monitor Egress Reduction

Track egress before and after migration:

```sql
-- AWS CUR query for S3 egress
SELECT
  DATE(line_item_usage_start_date) as date,
  SUM(line_item_usage_amount) as egress_gb,
  SUM(line_item_unblended_cost) as cost_usd
FROM cur_table
WHERE product_servicename = 'Amazon Simple Storage Service'
  AND line_item_usage_type LIKE '%DataTransfer-Out%'
GROUP BY DATE(line_item_usage_start_date)
ORDER BY date DESC;
```

```sql
-- R2 egress query (should be ~0)
SELECT
  DATE(timestamp) as date,
  SUM(egress_bytes) / (1024*1024*1024) as egress_gb,
  SUM(egress_bytes) * 0.0 as cost_usd  -- Zero egress!
FROM r2_usage
GROUP BY DATE(timestamp)
ORDER BY date DESC;
```

## Success Criteria

- Egress costs drop by 90%+ (S3 → R2)
- Cache hit rate increases to >80%
- Response times improve due to edge caching
- Manifest availability remains 99.9%+

## Rollback Plan

If R2 migration causes issues:

1. **Immediate**: Update Workers to point back to S3:

   ```javascript
   const S3_FALLBACK = 'https://your-bucket.s3.amazonaws.com';
   const object = await fetch(`${S3_FALLBACK}/${manifestPath}`);
   ```

2. **Within 1 hour**: Verify all manifests are accessible
3. **Monitor**: Watch error rates and latency

## Cost Impact Calculation

```
# Example calculation
Daily requests: 10,000,000
Avg manifest size: 50 KB
Egress per day: 10M * 50KB = 500 GB/day

S3 egress cost: 500 GB * $0.09/GB = $45/day = $1,350/month
R2 egress cost: 500 GB * $0.00/GB = $0/day = $0/month ✅

Monthly savings: $1,350
Annual savings: $16,200
```

## References

- [Cloudflare R2 Documentation](https://developers.cloudflare.com/r2/)
- [R2 Pricing Calculator](https://r2-calculator.cloudflare.com/)
- [AWS S3 Pricing](https://aws.amazon.com/s3/pricing/)
- [Zero Egress Announcement](https://blog.cloudflare.com/introducing-r2-object-storage/)

## Additional Optimizations

1. **Compress manifests**: Use Brotli compression for 30-50% size reduction
2. **Manifest deduplication**: Store common chunks once
3. **Smart caching**: Cache based on content hash, not URL
4. **CDN optimization**: Use Tiered Cache for better hit rates
