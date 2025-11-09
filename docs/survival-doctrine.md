# Survival Doctrine

**Purpose**: One page all developers and customers can cite for CredLink's provenance verification guarantees.

## Core Principles

### Remote-First Default
- Remote manifests are the default and required for all public assets
- Each asset receives `Link: rel="c2pa-manifest"` pointing to an immutable, hash-addressed `.c2pa` sidecar
- Remote manifests live at `/manifests/{sha256}.c2pa` where the URL path is the content hash

### Embed Survival (Advisory)
- Embedded C2PA claims are optional and only survive on preserve paths you fully control end-to-end
- Embed survival is measured only inside preserve-embed sandbox and is advisory
- All acceptance logic assumes remote-first by default

### Hostile Optimizer Assumption
- Optimizers (Cloudinary, Imgix, Fastly Image Optimizer, Akamai Image Manager, Cloudflare Polish/Images) are hostile until proven otherwise
- Any transformation may strip embedded claims; remote manifests must survive regardless

### Manifest Immutability
- Manifests are immutable once published
- If content changes, the manifest path changes (new hash)
- Bucket policies prevent overwrites (WORM-like behavior)

### Provenance Not Truth
- CredLink provides verifiable provenance of content; it does not assert truth, accuracy, or endorsement
- Assertions reflect source and transformations; we block deceptive claims
- We are a provenance layer, not a fact-checking service

## Service Level Objectives (Phase 0)

### Survival Rates
- **Remote survival**: ≥ 99.9% across all sandboxes
- **Embed survival**: ≥ 95% only in preserve-embed sandbox (advisory)
- **Verify API p95**: < 600 ms (placeholder; enforced in Phase 3)
- **Uptime**: 99.9% target (external monitoring defined but activated later)

### Auto-Fallback (Defined Now, Enforced in Phase 6)
If embed survival for any tenant drops below threshold for 10 minutes:
- Automatically flip tenant to remote-only mode
- Require badge verification for all assets
- Log the transition with audit trail

### Break-Glass Protocol
- Signed policy toggle allows bypassing header injection for single hostname
- Maximum duration: 2 hours
- All uses logged to deterministic audit logs
- Requires signed justification and expires automatically

## Failure Modes & Recovery

### Expected Failures (Handled by Design)
- CDN strips EXIF/JUMBF → embed fails, remote survives via Link header
- Optimizer converts JPEG→WebP → embed lost, remote survives (manifest hash unchanged)
- Proxy drops Link header → HTML `<link rel="c2pa-manifest">` fallback provides recovery
- Cache poisoning attempts → rejected by hash-alignment verification

### Critical Failures (Hard Gates)
- Remote survival rate drops below 99.9% → NO-GO to next phase
- Manifest hash mismatch → immediate failure and alert
- Break-glass protocol violation → security incident

## Compliance & Legal

### Hard Rule: Feature Acceptance Tests
**MANDATORY**: Every new feature MUST include acceptance tests in the hostile-path matrix before merge. See [Feature Policy](feature-policy.md) for complete requirements.

### Prohibited Uses
- Claims designed to mislead (e.g., asserting editorial facts inside technical assertions)
- Manipulation of provenance data to deceive end users
- Attempts to bypass remote-first policy without break-glass authorization

### Abuse Handling
- Report: abuse@ with required fields (asset URL, manifest URL, claim, harm)
- Actions: Revoke trust for issuer keys, flag manifests in Trust Graph
- Retention: Logs retained 24 months; access on subpoena or contractual audit

## Implementation Guarantees

### Deterministic Behavior
- Equal inputs produce equal outputs in all scenarios
- All logs are structurally logged and signed
- Acceptance tests are reproducible across environments

### Observability
- Per-tenant survival percentages tracked
- p95 latency monitoring (placeholder in Phase 0)
- Headers snapshots captured for all requests
- Manifest resolution logs with full trace

### Policy Enforcement
- Feature flags drive all behavior changes
- Remote-only policy enforced by CSP headers
- Preserve paths explicitly whitelisted
- All policy decisions logged and auditable

---

**Version**: 1.0  
**Effective**: 2025-10-30  
**Review**: Monthly or after any major incident
