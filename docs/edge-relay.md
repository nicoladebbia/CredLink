# Edge Relay (Zero-CORS) Deployment Guide

The edge relay removes CORS and mixed-content friction by routing manifest requests through a Cloudflare Worker and an optional Service Worker. This guide covers deployment, tenant configuration, CSP/SRI policy, and validation drills.

## 1. Deploy the Cloudflare Worker

1. `cd apps/edge-relay`
2. Set your tenant configuration (see below) as `TENANT_CONFIG` in `wrangler.toml` or an environment secret: `wrangler secret put TENANT_CONFIG`
3. Deploy with `pnpm --filter @c2/edge-relay build && pnpm --filter @c2/edge-relay deploy`
4. Configure a Cloudflare Route, e.g. `https://badge.example.com/c2/relay*` → `c2-edge-relay`

### Worker bindings

| Variable | Purpose |
| --- | --- |
| `TENANT_CONFIG` | JSON map of tenant rules (secret, allowlist, upstream signing) |
| `RELAY_DEBUG` | Optional (`"1"`) to enable structured console logs |

Example `TENANT_CONFIG`:

```json
{
  "demo-tenant": {
    "secret": "l0ng-base64url-secret",
    "allowlist": ["manifests.demo.example", "*.trusted.demo.example"],
    "originSigningSecret": "upstream-base64url-secret",
    "enforceHttpsOnly": true
  }
}
```

* `secret` is used to verify `sig = HMAC_SHA256(secret, u|ts)`.
* `allowlist` accepts exact hosts, wildcards (`*.example.com`), or full HTTPS prefixes.
* `originSigningSecret` (optional) instructs the relay to sign upstream requests with `X-C2C-Sign`.
* Set `allowHttpManifests` to `true` only for legacy HTTP manifests.

### Request shape

```
GET /c2/relay?u=<url-encoded manifest>&t=<tenant>&sig=<hmac>&ts=<unix seconds>
```

* `ts` must be within ±5 minutes of the relay clock.
* Mixed content is blocked: HTTP manifests from HTTPS pages return `497 MixedContentBlocked`.
* When the origin emits 5xx, the worker serves the last cached manifest with `Warning: 110 - response is stale`.

## 2. Install the Service Worker

1. Build the package: `pnpm --filter @c2/sw-relay build`
2. Publish `packages/sw-relay/dist/sw.js` alongside your tenant site
3. Register from the host page:

```html
<script type="module">
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js', { scope: '/' })
    .then(() => console.log('C2 relay SW ready'))
    .catch(err => console.error('SW registration failed', err));
}
</script>
```

The Service Worker intercepts `/c2/relay` and `*.c2pa` fetches, implements stale-while-revalidate, announces degraded mode when serving cached manifests, and caches the badge module for offline demos.

## 3. Badge CSP and SRI

1. Build the badge: `pnpm --filter @c2/c2-badge build`
2. Inspect `packages/c2-badge/dist/badge.meta.json` for the current filename and integrity string:

```json
{
  "version": "0.1.0",
  "file": "badge-v0.1.0.mjs",
  "integrity": "sha384-XXXXXXXXXXXXXXXX",
  "generatedAt": "2024-07-01T12:00:00.000Z"
}
```

3. Embed with CSP and SRI:

```html
<script type="module"
  src="https://static.c2c.example/badge-v0.1.0.mjs"
  integrity="sha384-XXXXXXXXXXXXXXXX"
  crossorigin="anonymous" defer></script>
```

Suggested CSP header/meta:

```
Content-Security-Policy:
  script-src 'self' https://static.c2c.example 'sha384-XXXXXXXXXXXXXXXX' 'strict-dynamic';
  object-src 'none'; base-uri 'self'; upgrade-insecure-requests;
```

Add a lightweight bootstrap to surface SRI failures:

```html
<script>
window.addEventListener('error', (evt) => {
  if (evt.target && evt.target.src && /badge-v/.test(evt.target.src)) {
    console.warn('C2 badge integrity failed', evt);
    document.documentElement.classList.add('c2-badge-degraded');
  }
}, true);
</script>
```

## 4. Tenant checklist

- [ ] All manifests routed via `/c2/relay`
- [ ] Tenants configured with strict host allowlists
- [ ] SRI hashes refreshed every badge release
- [ ] Service Worker deployed at the tenant origin
- [ ] Mixed-content attempts raise a `497 MixedContentBlocked` problem+json response
- [ ] Origin 5xx returns cached manifest with `Warning: 110`
- [ ] Offline demo confirmed (toggle network → Degraded mode with timestamp)

## 5. Troubleshooting

| Symptom | Response | Fix |
| --- | --- | --- |
| `401 RelayAuth` | Problem+JSON | Regenerate HMAC signature; check timestamp skew |
| `403 RelayHostDenied` | Problem+JSON | Add manifest host/prefix to tenant allowlist |
| `497 MixedContentBlocked` | Problem+JSON | Ensure manifest is served over HTTPS or enable `allowHttpManifests` temporarily |
| No `Warning` header on stale | HTTP response | Confirm Service Worker registered and cached manifest exists |
| Badge shows “Integrity failed” | UI + browser console | Update embed to latest `badge.meta.json`; confirm CDN flush |
| Offline demo loads nothing | Browser offline | Verify Service Worker scope includes page and `/c2/relay` |

## 6. Validation suite

Use the HTML harness in `docs/demos/edge-relay/`:

* `mixed-content.html` – ensures HTTP manifests are blocked with a clear error
* `redirect.html` – exercises HTTPS redirect chains and enforces max hops
* `stale-cache.html` – simulates origin 5xx and confirms stale manifest reuse
* `offline.html` – toggles Service Worker offline mode and shows Degraded banner

Record the drill (console output + screenshots) before marking Phase 14 complete.
