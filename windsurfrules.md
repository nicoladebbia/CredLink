# CredLink Development Rules

## Core Principles
- Remote-first provenance verification is the default
- Optimizers are hostile until proven otherwise
- Manifests are immutable - new content gets new hash
- We provide provenance, not truth or fact-checking
- Dates never slip - scope does

## Development Standards
- All code must be TypeScript with strict mode
- Use ES modules throughout the codebase
- Follow functional programming patterns where possible
- Implement comprehensive error handling with logging
- All HTTP responses must include proper headers
- Security headers (CSP, X-Content-Type-Options) are mandatory

## Testing Requirements (Phase 4 Targets - Not Currently Met)
- All scenarios in hostile-path-matrix.yaml must pass (Phase 4)
- Remote survival rate TARGET: ≥ 99.9% (not measured yet)
- Embed survival rate TARGET: ≥ 95% in preserve-embed sandbox (not measured yet)
- Tests must be deterministic and reproducible
- All logs must be signed and structured (Phase 4)

## Architecture Guidelines
- Modular design with clear separation of concerns
- Shared utilities in packages/utils
- Policy configuration in packages/policy
- Acceptance testing in packages/acceptance
- Edge logic in apps/edge-worker
- Sandboxes simulate real-world hostile conditions

## Security & Compliance
- Never hardcode credentials or secrets
- All manifests must be hash-addressed and immutable
- Break-glass protocol requires audit trail
- Abuse handling must be documented and implemented
- Data retention policies must be followed

## Performance Requirements
- Edge worker processing < 5ms
- Manifest fetch < 100ms
- Total verification < 600ms p95
- Cache headers must be set for immutable assets
- Monitor and log all performance metrics

## Documentation Standards
- All public APIs must have JSDoc comments
- Policy decisions must be documented in docs/
- Survival doctrine must be kept up to date
- All changes must update relevant documentation
- README must reflect current system state
