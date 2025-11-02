# Phase 14 Deliverables Checklist

Copy this list into the PR description and tick every item before requesting review.

- [ ] `apps/edge-relay` deployed with HMAC auth, host allowlists, mixed-content protection, and per-status cache control
- [ ] `packages/sw-relay` Service Worker published (stale-while-revalidate + offline mode)
- [ ] Badge bundle built with SRI metadata (`dist/badge.meta.json`) and CSP snippet updated
- [ ] Installation & troubleshooting doc (`docs/edge-relay.md`) shared with tenants
- [ ] Runbook updated (`docs/runbooks/edge-relay.md`)
- [ ] Test harness pages exercised (`docs/demos/edge-relay/`) with screenshots/logs attached to artifact log
- [ ] Acceptance drills recorded: zero-CORS demo, SRI tamper, mixed content, negative cache, offline, redirect, poison resistance
