# Edge Relay Runbook

Authoritative procedures for handling degraded relay conditions.

## 1. Origin outage → serve stale

**Detect**
- Cloudflare Worker logs show `Warning: 110 - response is stale`
- Status panel receives `C2_RELAY_STATUS` message with `status=stale`
- Upstream monitoring reports 5xx or timeouts

**Action**
1. Confirm stale manifest age via response headers `X-C2P-Integrity-Length` and `X-C2P-SW-Stored-At`
2. Page operators notify stakeholders: “relay serving cached copy from <timestamp>”
3. Leave relay running; cached content continues validating
4. Escalate to origin team if outage exceeds 15 minutes
5. Once origin recovers, confirm new manifest fetched (cache header `X-C2P-Cache: MISS`)

## 2. SRI failure on badge script

**Detect**
- Browser console: `Failed to find a valid digest in the 'integrity' attribute`
- UI banner: “Integrity failed” with degraded styling
- Analytics event `badge.integrity_failed`

**Action**
1. Fetch `badge.meta.json` and confirm current integrity hash
2. Purge CDN cache for `/badge-v*.mjs`
3. Re-upload latest `badge-vX.mjs` with matching integrity string
4. Re-test embed page; expect network response 200 + correct `integrity`
5. Close incident when UI exits degraded state

## 3. DNS misconfiguration (tenant)

**Detect**
- Worker returns `502 RelayUpstreamError`
- Service Worker emits `status=error` with `reason=network-failure`
- DNS logs show SERVFAIL/ NXDOMAIN for manifest host

**Action**
1. Validate tenant allowlist host resolves via `dig host @1.1.1.1`
2. If DNS recently changed, ensure TTL expired across resolvers
3. Update tenant docs to reflect correct manifest endpoint
4. Keep relay active; stale cache serves manifests while DNS converges
5. Once fix propagates, verify `X-C2P-Cache: MISS` and remove degraded banner

## 4. Negative cache TTL sanity

**Detect**
- Operators notice stale error responses persisting longer than 60s or 5s windows
- DevTools shows `Cache-Control` not matching configured policy

**Action**
1. Inspect response headers from `/c2/relay`: ensure 5xx uses `Cache-Control: no-store`
2. Run `docs/demos/edge-relay/stale-cache.html` to simulate 5xx and time recovery
3. If TTL incorrect, redeploy worker ensuring environment does not override cache behavior (`cf.cacheTtlByStatus` disabled)
4. Re-run harness and document results in incident log

## Escalation
- P1: Complete relay outage (no stale cache) – page on-call engineer & infra lead
- P2: Stale mode > 60 minutes – engage origin SRE + customer success
- P3: SRI mismatch limited to single tenant – coordinate with release engineering

Always log remediation in the survival ledger with timestamps and links to demos/evidence.
