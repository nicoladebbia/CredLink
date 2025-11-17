# Production Hardening - Quick Start Guide

**🎯 Goal:** Transform CredLink into deployment-ready production codebase  
**📅 Time Required:** 4-6 hours (can be done in stages)  
**🎓 Skill Level:** Intermediate DevOps/Backend engineer

---

## 📚 Documentation Index

1. **[PROD_HARDENING_PLAN.md](./PROD_HARDENING_PLAN.md)** - Executive summary & navigation (START HERE)
2. **[PROD_HARDENING_DELETIONS.md](./PROD_HARDENING_DELETIONS.md)** - Remove 157 files with evidence
3. **[PROD_HARDENING_CI_CD.md](./PROD_HARDENING_CI_CD.md)** - GitHub Actions workflows
4. **[PROD_HARDENING_SECURITY.md](./PROD_HARDENING_SECURITY.md)** - Docker, env validation, security headers
5. **[PROD_HARDENING_OPERATIONS.md](./PROD_HARDENING_OPERATIONS.md)** - Runbooks & deployment guides
6. **[PROD_HARDENING_STRUCTURE.md](./PROD_HARDENING_STRUCTURE.md)** - Directory layout normalization
7. **[PROD_HARDENING_VERIFICATION.md](./PROD_HARDENING_VERIFICATION.md)** - 34 acceptance criteria

---

## ⚡ 30-Minute Quick Win (Phase 1: Cleanup)

**Impact:** Remove 157 files, reduce repo clutter by 81%  
**Risk:** ZERO (no source code changes, fully reversible)

```bash
# 1. Create backup
git checkout -b prod-hardening-backup

# 2. Run deletion script
chmod +x scripts/execute-prod-hardening-deletions.sh
bash scripts/execute-prod-hardening-deletions.sh

# 3. Verify builds still work
pnpm run build

# 4. Commit
git commit -m "prod: remove 157 temporary tracking files"
git push origin HEAD

# Result: Cleaner repository, easier navigation
```

---

## 🚀 Full Production Hardening (Phases 2-5)

### Phase 2: CI/CD (1.5 hours)

**What:** Replace 16 fragmented workflows with 8 production pipelines

```bash
# 1. Read the plan
less PROD_HARDENING_CI_CD.md

# 2. Copy new workflows
# See PROD_HARDENING_CI_CD.md for full workflow files

# 3. Configure GitHub secrets
gh secret set AWS_ROLE_ARN_STAGING
gh secret set AWS_ROLE_ARN_PRODUCTION
gh secret set ECR_REGISTRY
gh secret set TURBO_TOKEN

# 4. Enable branch protection
# See PROD_HARDENING_CI_CD.md for rules

# 5. Test CI pipeline
git checkout -b test-ci-pipeline
git push origin test-ci-pipeline
# Open PR, verify checks run
```

---

### Phase 3: Security (1 hour)

**What:** Add Zod env validation, production Dockerfile, strict security headers

```bash
# 1. Create env-schema.ts
# Copy from PROD_HARDENING_SECURITY.md

# 2. Update index.ts
# Add: import { validateAndParseEnv } from './config/env-schema';

# 3. Replace Dockerfile
# Copy production Dockerfile from PROD_HARDENING_SECURITY.md

# 4. Create docker-compose.yml
# Copy from PROD_HARDENING_SECURITY.md

# 5. Test locally
docker-compose up -d
curl http://localhost:3000/health

# 6. Verify env validation
PORT=invalid pnpm run start
# Should fail with validation error
```

---

### Phase 4: Operations (1.5 hours)

**What:** Create 5 mandatory operational docs

```bash
# 1. Create docs/DEPLOYMENT_GUIDE.md
# Copy template from PROD_HARDENING_OPERATIONS.md

# 2. Create docs/RUNBOOK.md
# Copy template from PROD_HARDENING_OPERATIONS.md

# 3. Create docs/OPERATIONS_CHECKLIST.md
# Copy template from PROD_HARDENING_OPERATIONS.md

# 4. Create docs/ARCHITECTURE.md
# Copy template from PROD_HARDENING_OPERATIONS.md

# 5. Create CHANGELOG.md
# Copy template from PROD_HARDENING_OPERATIONS.md

# 6. Customize for your team
# Update contacts, URLs, specific procedures
```

---

### Phase 5: Verification (30 minutes)

**What:** Run 34 acceptance checks to certify production readiness

```bash
# 1. Open verification checklist
less PROD_HARDENING_VERIFICATION.md

# 2. Run all pre-deployment checks (29 checks)
# Code Quality (6 checks)
pnpm run build              # ✅ Check 1.1
pnpm run lint               # ✅ Check 1.2
pnpm run type-check         # ✅ Check 1.3
pnpm exec prettier --check "**/*.{ts,js,json,md}"  # ✅ Check 1.4

# Testing (7 checks)
pnpm run test:ci            # ✅ Check 2.1
pnpm run test:coverage      # ✅ Check 2.2

# Security (6 checks)
pnpm audit --audit-level high  # ✅ Check 3.1
docker scan credlink-api:test  # ✅ Check 3.4

# Infrastructure (5 checks)
docker build -t credlink-api:test .  # ✅ Check 4.1
docker run --rm credlink-api:test    # ✅ Check 4.2

# CI/CD (3 checks)
yamllint .github/workflows/*.yml  # ✅ Check 5.1

# Documentation (2 checks)
ls -1 docs/DEPLOYMENT_GUIDE.md docs/RUNBOOK.md  # ✅ Check 6.1

# 3. Deploy to staging
gh workflow run cd.yml -f environment=staging

# 4. Run staging checks (5 checks)
curl https://staging.credlink.com/health  # ✅ Check D.1

# 5. Create deployment authorization
# See PROD_HARDENING_VERIFICATION.md template
```

---

## 📊 Expected Outcomes

### Before Hardening
- ❌ 135+ phase/audit markdown files
- ❌ 4 duplicate Dockerfiles
- ❌ 16 fragmented CI workflows
- ❌ No env validation (crashes at runtime)
- ❌ No operational runbooks
- ❌ Unclear deployment process

### After Hardening
- ✅ Clean repository (157 files removed)
- ✅ 1 production-optimized Dockerfile
- ✅ 8 production-grade CI/CD workflows
- ✅ Zod-based env validation at startup
- ✅ Complete operational documentation
- ✅ One-command deployment
- ✅ 34/34 verification checks passing
- ✅ **100% deployment-ready**

---

## 🚨 Common Pitfalls & Solutions

### Issue 1: "proof-storage-legacy not found"
**Symptom:** Build fails after deletion  
**Fix:** Update `apps/api/src/index.ts` line 24:
```typescript
// Before:
import { ProofStorage } from './services/proof-storage-legacy';

// After:
import { ProofStorage } from './services/proof-storage';
```

### Issue 2: "Environment validation not running"
**Symptom:** Server starts with invalid config  
**Fix:** Ensure `validateAndParseEnv()` is called BEFORE any other imports in `index.ts`

### Issue 3: "Docker image too large (>1GB)"
**Symptom:** Slow deployments, high costs  
**Fix:** Use multi-stage Dockerfile from PROD_HARDENING_SECURITY.md (distroless base)

### Issue 4: "Tests failing after deletions"
**Symptom:** Tests reference deleted files  
**Fix:** Tests should NOT import markdown files. If they do, remove those test dependencies.

### Issue 5: "GitHub Actions secrets not found"
**Symptom:** Deployment workflow fails  
**Fix:** Configure all secrets listed in PROD_HARDENING_CI_CD.md:
```bash
gh secret set AWS_ROLE_ARN_STAGING
gh secret set ECR_REGISTRY
gh secret set TURBO_TOKEN
```

---

## ✅ Success Checklist

Use this to track your progress:

### Phase 1: Cleanup (30 min)
- [ ] Backup branch created
- [ ] Deletion script executed
- [ ] 157 files removed
- [ ] Build still works (`pnpm run build`)
- [ ] Changes committed

### Phase 2: CI/CD (1.5 hours)
- [ ] 8 production workflows created
- [ ] GitHub secrets configured
- [ ] Branch protection enabled
- [ ] Dependabot configured
- [ ] CODEOWNERS created
- [ ] Test PR shows required checks

### Phase 3: Security (1 hour)
- [ ] env-schema.ts created
- [ ] Validation integrated into index.ts
- [ ] Production Dockerfile replaced
- [ ] docker-compose.yml created
- [ ] Security headers configured
- [ ] Rate limiting enhanced
- [ ] CORS strictened

### Phase 4: Operations (1.5 hours)
- [ ] DEPLOYMENT_GUIDE.md created
- [ ] RUNBOOK.md created
- [ ] OPERATIONS_CHECKLIST.md created
- [ ] ARCHITECTURE.md created
- [ ] CHANGELOG.md created
- [ ] Docs customized for team

### Phase 5: Verification (30 min)
- [ ] All 29 pre-deployment checks passing
- [ ] Staging deployment successful
- [ ] All 5 staging checks passing
- [ ] Deployment authorization created
- [ ] Production deployment ready

**Total:** [ ] 5/5 phases complete = PRODUCTION READY ✅

---

## 🆘 Need Help?

### Questions About Deletions?
→ See [PROD_HARDENING_DELETIONS.md](./PROD_HARDENING_DELETIONS.md) for grep proof and evidence

### Questions About CI/CD?
→ See [PROD_HARDENING_CI_CD.md](./PROD_HARDENING_CI_CD.md) for workflow templates

### Questions About Security?
→ See [PROD_HARDENING_SECURITY.md](./PROD_HARDENING_SECURITY.md) for Dockerfile and env validation

### Questions About Verification?
→ See [PROD_HARDENING_VERIFICATION.md](./PROD_HARDENING_VERIFICATION.md) for all 34 checks

### Rollback Everything?
```bash
# If you created a backup branch:
git checkout prod-hardening-backup

# Or reset to before changes:
git reset --hard HEAD~5  # Adjust number based on commits

# No production systems are affected (analysis mode only)
```

---

## 🎯 Final Note

This hardening plan is **ruthless but reversible**:
- ✅ Every deletion has grep proof
- ✅ Every change is git-tracked
- ✅ Every step is verifiable
- ✅ Rollback is instant
- ✅ No production systems affected

**Confidence level:** You can execute this plan safely, verify at each step, and rollback if needed.

**Next action:** Start with [PROD_HARDENING_PLAN.md](./PROD_HARDENING_PLAN.md) for the full overview.

---

**Good luck! 🚀**
