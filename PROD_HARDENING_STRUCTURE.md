# Production Hardening: Repository Structure
## Normalized Directory Layout and Import Path Updates

**Goal:** Establish conventional, production-grade folder organization  
**Impact:** Improved navigation, clearer separation of concerns  
**Risk:** LOW (primarily organizational, minimal code changes)

---

## 🎯 Current vs. Target Structure

### Current State Analysis

**Strengths:**
- ✅ Clean monorepo with Turborepo
- ✅ Logical separation: apps/, packages/, infra/
- ✅ Conventional naming (src/, dist/, tests/)

**Issues:**
- ❌ 135+ temporary tracking docs cluttering root
- ❌ Multiple config file duplicates
- ❌ Inconsistent test placement (tests/ vs apps/api/tests/)
- ❌ Mixed purpose in docs/ (operational + archive + phase docs)

### Target Structure

```
credlink/
├── .github/                      # GitHub-specific configs
│   ├── workflows/                # CI/CD (8 production workflows)
│   │   ├── ci.yml
│   │   ├── cd.yml
│   │   ├── security-scan.yml
│   │   ├── release.yml
│   │   ├── terraform-ci.yml
│   │   └── survival.yml
│   ├── CODEOWNERS               # Code ownership rules
│   ├── dependabot.yml           # Dependency updates
│   └── ISSUE_TEMPLATE/          # Bug/feature templates
│
├── apps/                         # Application services
│   ├── api/                      # Main REST API
│   │   ├── src/
│   │   │   ├── config/           # Environment, validation
│   │   │   ├── middleware/       # Auth, RBAC, rate-limit
│   │   │   ├── routes/           # API endpoints
│   │   │   ├── services/         # Business logic
│   │   │   ├── utils/            # Helpers, logger
│   │   │   └── index.ts          # Entry point
│   │   ├── tests/                # API-specific tests
│   │   ├── Dockerfile            # Production image
│   │   └── package.json
│   │
│   └── beta-landing/             # Marketing site (Next.js)
│
├── packages/                     # Shared libraries
│   ├── rbac/                     # Role-based access control
│   ├── storage/                  # S3/local storage abstraction
│   ├── cache/                    # Redis/memory cache
│   ├── config/                   # Shared configuration
│   ├── health/                   # Health check utilities
│   ├── policy-engine/            # C2PA policy DSL
│   ├── c2pa-sdk/                 # C2PA signing/verification
│   └── types/                    # Shared TypeScript types
│
├── infra/                        # Infrastructure as Code
│   ├── terraform/                # AWS resources
│   │   ├── modules/              # Reusable Terraform modules
│   │   │   ├── ecs-service/
│   │   │   ├── rds-postgres/
│   │   │   └── s3-bucket/
│   │   ├── environments/         # Environment-specific configs
│   │   │   ├── staging/
│   │   │   └── production/
│   │   └── github-oidc.tf        # GitHub Actions IAM roles
│   │
│   ├── k8s/                      # Kubernetes manifests (if used)
│   └── monitoring/               # Prometheus, Grafana configs
│
├── tests/                        # Cross-cutting tests
│   ├── acceptance/               # End-to-end acceptance tests
│   ├── integration/              # Multi-service integration
│   └── performance/              # Load/stress tests
│
├── scripts/                      # Utility scripts
│   ├── deploy/                   # Deployment helpers
│   ├── security/                 # Security scanning
│   └── migrations/               # Database migrations
│
├── docs/                         # OPERATIONAL documentation only
│   ├── DEPLOYMENT_GUIDE.md       # How to deploy
│   ├── RUNBOOK.md                # On-call procedures
│   ├── OPERATIONS_CHECKLIST.md   # Pre/post-deploy checks
│   ├── ARCHITECTURE.md           # System design
│   ├── api/                      # API documentation
│   │   └── openapi.yaml
│   ├── runbooks/                 # Specific incident runbooks
│   └── security/                 # Security policies
│
├── sdk/                          # Client SDKs
│   ├── go/                       # Go SDK
│   ├── js/                       # JavaScript SDK
│   └── python/                   # Python SDK
│
├── legal/                        # Legal documents
│   ├── contracts/                # MSA, DPA, Order Form
│   ├── clauses/                  # Standard clauses
│   └── buyer-facing/             # Customer-facing docs
│
├── .env.example                  # Environment template (SINGLE)
├── .gitignore                    # Git ignore rules
├── .prettierrc                   # Code formatting
├── .eslintrc.json                # Linting rules
├── docker-compose.yml            # Local development
├── Dockerfile                    # Production image (SINGLE)
├── turbo.json                    # Turborepo config
├── package.json                  # Root dependencies
├── pnpm-workspace.yaml           # Workspace config
├── tsconfig.json                 # TypeScript config
├── README.md                     # Project overview
├── CHANGELOG.md                  # Release notes
├── CONTRIBUTING.md               # Contribution guide
├── LICENSE.txt                   # License
└── SECURITY.md                   # Security policy
```

---

## 📋 Structural Changes Required

### 1. Root Directory Cleanup (From Deletions Plan)

**Remove (157 files):**
- All PHASE-*.md, ATOMIC_*.md, DELIVERABLE-*.md
- All *-COMPLETE.md, *-RESULTS.md
- .audit/, .baseline/ folders
- Duplicate Dockerfiles (keep only production)
- Duplicate .env templates

**Result:** Root directory goes from 80+ files to ~15 essential files.

### 2. docs/ Reorganization

**Current:** 95+ files (operational + archive + phase tracking)  
**Target:** ~25 files (operational only)

```bash
# Keep operational docs
docs/
├── DEPLOYMENT_GUIDE.md          ✅ NEW
├── RUNBOOK.md                   ✅ NEW
├── OPERATIONS_CHECKLIST.md      ✅ NEW
├── ARCHITECTURE.md              ✅ NEW
├── break-glass.md               ✅ KEEP
├── disaster-recovery-objectives.md  ✅ KEEP
├── solution-validation.md       ✅ KEEP
├── api/                         ✅ KEEP (API specs)
├── runbooks/                    ✅ KEEP (incident procedures)
└── security/                    ✅ KEEP (policies)

# Archive or delete
docs/archive/                    ❌ DELETE (33 files already archived)
docs/DELIVERABLE-*.md            ❌ DELETE (temporary tracking)
docs/FINAL-*.md                  ❌ DELETE (completion markers)
docs/phase*.md                   ❌ DELETE (phase-specific)
```

### 3. Test Organization

**Current:** Tests scattered across multiple locations  
**Target:** Centralized with clear boundaries

```bash
# Keep structure as-is (already good):
apps/api/tests/           # Unit tests for API service
packages/*/tests/         # Unit tests for packages
tests/acceptance/         # E2E acceptance tests
tests/integration/        # Multi-service integration
tests/gauntlet/          # Survival/resilience tests (KEEP - valuable)
```

**Recommendation:** Keep current test structure (already follows best practices).

### 4. Configuration Consolidation

**Remove duplicates:**
```bash
❌ .env.consolidated.example
❌ .env.security.example
❌ .env.template
✅ .env.example (enhanced with comments)
```

**Enhance .env.example:**
```bash
# Add sections:
# ==== REQUIRED IN PRODUCTION ====
# ==== OPTIONAL (development) ====
# ==== SECURITY (sensitive) ====
```

---

## 🔧 Import Path Updates Required

### Update 1: proof-storage-legacy → proof-storage

**File:** `apps/api/src/index.ts` (line 24)

```diff
--- a/apps/api/src/index.ts
+++ b/apps/api/src/index.ts
@@ -21,7 +21,7 @@ import { ipWhitelists } from './middleware/ip-whitelist';
 import { cleanupServices, registerService } from './utils/service-registry';
 import { JobScheduler } from './services/job-scheduler';
-import { ProofStorage } from './services/proof-storage-legacy';
+import { ProofStorage } from './services/proof-storage';
 import { C2PAService } from './services/c2pa-service';
 import { initializeTrustedRootCertificates } from './services/certificate-rotation';
```

**Verification:**
```bash
grep -r "proof-storage-legacy" apps/api/src/ --include="*.ts"
# Should return: No matches (after change)
```

### Update 2: Add new env-schema import

**File:** `apps/api/src/index.ts` (line 19)

```diff
--- a/apps/api/src/index.ts
+++ b/apps/api/src/index.ts
@@ -16,6 +16,7 @@ import { ApiKeyAuth } from './middleware/auth';
 import { ApiKeyService } from './services/api-key-service';
 import { AtomicCertificateManager } from './services/certificate-manager-atomic';
 import { errorHandler } from './middleware/error-handler';
+import { validateAndParseEnv } from './config/env-schema';
 import { validateEnvironment } from './config/env';
 import { validateSecrets } from './config/secrets';
```

### Update 3: No other import path changes needed

**Analysis complete:** Codebase already uses proper relative imports within each package.

---

## 📊 Before/After Comparison

### Root Directory

**Before:**
```
.
├── ATOMIC_REMEDIATION_COMPLETE.md
├── ATOMIC_STEP_0_0_STATE_FINGERPRINTING.md
├── ATOMIC_STEP_0_1_DEPENDENCY_GRAPH.md
... (75+ more .md files)
├── Dockerfile
├── Dockerfile.optimized
├── Dockerfile.reproducible
├── Dockerfile.secure
├── .env.consolidated.example
├── .env.example
├── .env.security.example
├── .env.template
... (20+ more config files)
```

**After:**
```
.
├── .github/                 # CI/CD workflows
├── apps/                    # Application services
├── packages/                # Shared libraries
├── infra/                   # Infrastructure
├── tests/                   # Cross-cutting tests
├── scripts/                 # Utility scripts
├── docs/                    # Operational docs
├── sdk/                     # Client SDKs
├── legal/                   # Legal documents
├── .env.example             # Single env template
├── .gitignore
├── .prettierrc
├── .eslintrc.json
├── docker-compose.yml
├── Dockerfile               # Single production image
├── turbo.json
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.json
├── README.md
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE.txt
└── SECURITY.md
```

**Improvement:** 80+ files → 15 files (81% reduction in clutter)

---

## 🚀 Migration Steps

```bash
# 1. Execute deletion plan (see PROD_HARDENING_DELETIONS.md)
bash scripts/execute-prod-hardening-deletions.sh

# 2. Apply import path updates
# Edit apps/api/src/index.ts manually (2 lines)

# 3. Create new configuration files
# - apps/api/src/config/env-schema.ts
# - docker-compose.yml
# - .github/dependabot.yml
# - .github/CODEOWNERS

# 4. Enhance .env.example with sections
# (See PROD_HARDENING_SECURITY.md for full template)

# 5. Verify structure
pnpm run build
pnpm run test

# 6. Commit changes
git add -A
git commit -m "prod: normalize repository structure

- Remove 157 temporary/phase tracking files
- Consolidate to single Dockerfile and .env.example
- Add production operational documentation
- Refactor proof-storage-legacy import
- Add Zod-based env validation

Result: 81% reduction in root directory clutter, production-ready structure."
```

---

## ✅ Verification Checklist

```bash
# 1. Verify root directory is clean
ls -1 | wc -l
# Should be ≤ 20 files/dirs

# 2. Verify no phase/audit docs remain
find . -name "*PHASE*.md" -o -name "*ATOMIC*.md" -o -name "*DELIVERABLE*.md" | wc -l
# Should be: 0

# 3. Verify operational docs exist
ls -1 docs/{DEPLOYMENT_GUIDE,RUNBOOK,OPERATIONS_CHECKLIST,ARCHITECTURE}.md
# Should list 4 files

# 4. Verify build still works
pnpm run build
# Should succeed with no errors

# 5. Verify tests still pass
pnpm run test
# Should pass (or show only pre-existing failures)

# 6. Verify imports are correct
pnpm run type-check
# Should succeed with no errors

# 7. Verify Docker builds
docker build -t credlink-api:test .
# Should complete without errors

# 8. Verify structure matches conventions
tree -L 2 -I 'node_modules|dist|coverage'
# Should show clean, conventional structure
```

---

## 📐 Naming Conventions

### Files
- **Configuration:** `kebab-case.config.ts` (e.g., `jest.config.ts`)
- **Source code:** `kebab-case.ts` (e.g., `proof-storage.ts`)
- **Tests:** `*.test.ts` or `*.spec.ts`
- **Documentation:** `SCREAMING_SNAKE_CASE.md` for root docs, `kebab-case.md` for subdocs

### Directories
- **Apps/Packages:** `kebab-case` (e.g., `api`, `proof-storage`)
- **Source folders:** `lowercase` (e.g., `src`, `tests`, `dist`)
- **Documentation:** `lowercase` (e.g., `docs`, `runbooks`)

### Exports
- **Classes:** `PascalCase` (e.g., `ProofStorage`)
- **Functions:** `camelCase` (e.g., `validateEnvironment`)
- **Constants:** `SCREAMING_SNAKE_CASE` (e.g., `MAX_FILE_SIZE`)
- **Types/Interfaces:** `PascalCase` (e.g., `Env`, `Config`)

---

## 🎯 Impact Summary

| Category | Before | After | Change |
|----------|--------|-------|--------|
| **Root .md files** | 80+ | 5 | -94% |
| **Root config files** | 15+ | 8 | -47% |
| **Dockerfiles** | 4 | 1 | -75% |
| **docs/ files** | 95+ | 25 | -74% |
| **Import paths changed** | - | 2 | Manual fix |
| **New files created** | - | 8 | Operational docs |
| **Clarity** | Low | High | +400% |

**Net result:** Lean, professional repository structure aligned with industry standards.

---

**Next:** [PROD_HARDENING_VERIFICATION.md](./PROD_HARDENING_VERIFICATION.md)
