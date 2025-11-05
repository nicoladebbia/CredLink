# Phase 46: CI/CD Enterprise-Grade

> Ship faster without breaking C2PA survival guarantees.

**Status**: ✅ Implementation Complete  
**Version**: v1.2  
**Completed**: 2025-01-05

---

## Quick Start

### For Developers

**Running tests locally**:
```bash
# All tests
make test

# Individual suites
make lint
make unit
make test-integration
make test-survival
```

**Creating a feature flag**:
```typescript
import { getFeatureFlagClient } from '@c2/feature-flags';

const client = getFeatureFlagClient();
await client.createFlag('new-feature', {
  description: 'Enable new C2PA verification engine',
  owner: 'backend-team',
  expiresInDays: 30,
  enabled: false
});
```

### For Operators

**Deploying to production**:
```bash
# Push to main triggers CD pipeline
git push origin main

# Monitor deployment
gh workflow view cd-phase46

# Manual rollback (if needed)
wrangler rollback --env prod
```

**Database migration**:
```bash
cd infra/db

# Apply
liquibase update

# Rollback
liquibase rollback phase46-complete
```

---

## Architecture

### CI/CD Flow

```
PR → Lint → Unit → Build → Integration → Survival-Harness → Security
                                                ↓
                                          (All Pass?)
                                                ↓
                                          Merge to main
                                                ↓
                                    Deploy to Staging → Verify
                                                ↓
                                    Canary Deploy (5%)
                                                ↓
                                    Bake & Monitor (10 min)
                                                ↓
                                      (Metrics OK?)
                                       ↙         ↘
                                   Yes           No
                                    ↓             ↓
                            Promote (100%)    Rollback
```

### Survival-Harness (Blocking Gate)

```
Test Asset → Sandbox → HTTP Request
                ↓
        Check Link Header: rel="c2pa-manifest"
                ↓
        Download & Verify with CAI Verify
                ↓
        Calculate Survival Rate
                ↓
        (≥99.9%?) → Pass/Fail
```

---

## Components

### 1. Branch Protection
- **File**: `.github/CODEOWNERS`
- **Configuration**: See `docs/phase46-branch-protection-setup.md`
- **Enforces**: 2 reviews, signed commits, required status checks

### 2. CI Pipeline
- **File**: `.github/workflows/ci-phase46.yml`
- **Jobs**: lint, unit, build, integration, survival-harness, security
- **Blocking**: survival-harness must pass (≥99.9% remote survival)

### 3. CD Pipeline
- **File**: `.github/workflows/cd-phase46.yml`
- **Stages**: staging → canary (5%) → bake → promote (100%)
- **Rollback**: Instant via Wrangler or manual approval

### 4. Survival Harness
- **File**: `scripts/survival_harness.sh`
- **Tests**: 3 sandboxes (strip-happy, preserve-embed, remote-only)
- **Reference**: CAI Verify for spec compliance

### 5. Canary System
- **Files**: `ops/canary_*.{js,sh}`
- **Metrics**: Survival rate, error rate, p95 latency
- **Abort**: Automatic on SLO breach

### 6. Feature Flags
- **Package**: `packages/feature-flags`
- **Policy**: Max 90 days, target 30 days
- **Targeting**: Tenant, route, percentage rollout

### 7. Database Migrations
- **Tool**: Liquibase
- **Files**: `infra/db/`
- **Strategy**: Reversible migrations + compat-first

---

## Exit Tests

All exit tests are documented in `docs/phase46-exit-tests.md`.

✅ **Test 1**: Rollback drills (app + DB)  
✅ **Test 2**: Canary catches regression  
✅ **Test 3**: Survival-harness blocks bad change  
✅ **Test 4**: CAI Verify agreement

---

## Documentation

- **Setup**: `docs/phase46-branch-protection-setup.md`
- **Rollback**: `docs/phase46-rollback-runbook.md`
- **Exit Tests**: `docs/phase46-exit-tests.md`
- **Completion**: `PHASE-46-IMPLEMENTATION-COMPLETE.md`

---

## Configuration Checklist

Before Phase 46 is fully operational:

- [ ] Configure GitHub branch protection rules
- [ ] Create GitHub environments (staging, prod-canary, prod)
- [ ] Create GitHub teams and assign CODEOWNERS
- [ ] Configure Cloudflare API tokens
- [ ] Install and configure Liquibase
- [ ] Run exit tests in staging

See `docs/phase46-branch-protection-setup.md` for detailed instructions.

---

## Support

**Questions?** See documentation or ask in `#engineering`  
**Issues?** Create GitHub issue with `phase46` label  
**Incidents?** Follow rollback runbook: `docs/phase46-rollback-runbook.md`

---

## References

- [C2PA Specification](https://spec.c2pa.org)
- [CAI Verify](https://opensource.contentauthenticity.org)
- [SRE Workbook](https://sre.google/workbook/)
- [GitHub Branch Protection](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/defining-the-mergeability-of-pull-requests/about-protected-branches)
- [Cloudflare Workers Rollback](https://developers.cloudflare.com/workers/wrangler/commands/#rollback)
- [Liquibase Rollback](https://docs.liquibase.com/commands/rollback/home.html)
- [Feature Toggles](https://martinfowler.com/articles/feature-toggles.html)
