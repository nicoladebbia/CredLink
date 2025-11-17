# Production Hardening: Verification Checklist
## Harsh Acceptance Criteria - All Must Pass

**Purpose:** Gate deployment readiness with 29 mandatory checks  
**Failure Mode:** If ANY check fails, repository is NOT production-ready  
**Remedy:** Fix failures, re-run verification, repeat until 100% pass rate

---

## 🎯 Acceptance Criteria Philosophy

**Zero tolerance for:**
- ❌ Broken builds
- ❌ Failing tests
- ❌ Critical/high security vulnerabilities
- ❌ Broken imports after refactors
- ❌ Missing operational documentation
- ❌ Unverified deployments

**Required state:**
- ✅ All 29 checks passing
- ✅ Clean CI pipeline (green builds)
- ✅ Reproducible environment (locked dependencies)
- ✅ Production deployment tested in staging
- ✅ Rollback procedure verified

---

## 📋 Pre-Deployment Verification (29 Checks)

### Category 1: Code Quality (6 checks)

#### ✅ Check 1.1: Clean Build
```bash
pnpm run build
# Expected: Exit code 0, no TypeScript errors

# Failure symptoms:
# - "TS2307: Cannot find module"
# - "TS2345: Argument of type X is not assignable to type Y"
# - Build takes > 5 minutes

# Fix: Resolve TypeScript errors, check tsconfig.json
```

#### ✅ Check 1.2: Linting Passes
```bash
pnpm run lint
# Expected: Exit code 0, no ESLint errors

# Failure symptoms:
# - "error: Unexpected console statement"
# - "warning: 'X' is defined but never used"

# Fix: Run `pnpm run lint --fix` for auto-fixes
```

#### ✅ Check 1.3: Type Checking Passes
```bash
pnpm run type-check
# Expected: Exit code 0, no type errors

# Failure symptoms:
# - "error TS2322: Type 'string' is not assignable to type 'number'"

# Fix: Add proper types, fix @ts-ignore comments
```

#### ✅ Check 1.4: Code Formatting Valid
```bash
pnpm exec prettier --check "**/*.{ts,js,json,md}"
# Expected: All files formatted correctly

# Failure symptoms:
# - "Code style issues found in 12 files"

# Fix: Run `pnpm exec prettier --write "**/*.{ts,js,json,md}"`
```

#### ✅ Check 1.5: No Dead Code (Manual Review)
```bash
# Check for unused exports
pnpm exec ts-prune | grep -v "used in module"
# Expected: No unused exports (or documented exceptions)

# Manual verification:
# - No commented-out code blocks
# - No unused imports
# - No unreachable code
```

#### ✅ Check 1.6: Import Paths Valid
```bash
# Verify proof-storage-legacy refactored
grep -r "proof-storage-legacy" apps/api/src/ --include="*.ts"
# Expected: No matches

# Verify no broken imports
pnpm run build && node -e "require('./apps/api/dist/index.js')"
# Expected: Server starts without import errors
```

---

### Category 2: Testing (7 checks)

#### ✅ Check 2.1: All Tests Pass
```bash
pnpm run test:ci
# Expected: Exit code 0, all tests green

# Failure symptoms:
# - "FAIL apps/api/src/services/proof-storage.test.ts"
# - "Expected: 200, Received: 500"

# Fix: Debug failing tests, update snapshots if intentional
```

#### ✅ Check 2.2: Test Coverage ≥ 80%
```bash
pnpm run test:coverage
# Expected: Statements ≥ 80%, Branches ≥ 75%

# Check coverage report:
open coverage/lcov-report/index.html

# Failure symptoms:
# - "Statements: 65.2%"
# - Critical paths uncovered

# Fix: Add tests for uncovered code, prioritize critical paths
```

#### ✅ Check 2.3: No Flaky Tests
```bash
# Run tests 5 times to detect flakiness
for i in {1..5}; do
  echo "Run $i/5"
  pnpm run test || echo "❌ FLAKY TEST DETECTED"
done
# Expected: 5/5 runs pass

# Failure symptoms:
# - Intermittent failures
# - Race conditions
# - Time-dependent tests

# Fix: Use deterministic mocks, avoid setTimeout, mock Date.now()
```

#### ✅ Check 2.4: Integration Tests Pass
```bash
pnpm run test:integration
# Expected: Exit code 0

# Failure symptoms:
# - Database connection refused
# - Redis unavailable
# - S3 access denied

# Fix: Start dependencies (docker-compose up), check credentials
```

#### ✅ Check 2.5: Acceptance Tests Pass
```bash
pnpm run test:acceptance
# Expected: 16+ scenarios pass

# Failure symptoms:
# - "Scenario: Sign image with invalid cert - FAILED"

# Fix: Review acceptance test output, fix business logic
```

#### ✅ Check 2.6: No Skipped Tests (Without Justification)
```bash
grep -r "test.skip\|it.skip\|describe.skip" --include="*.test.ts" --include="*.spec.ts"
# Expected: No matches (or documented reasons in comments)

# Failure symptoms:
# - "test.skip('should handle edge case')"

# Fix: Unskip tests, add proper implementations, or document why skipped
```

#### ✅ Check 2.7: Test Performance Acceptable
```bash
pnpm run test:ci --verbose | grep "Time:"
# Expected: Full test suite < 2 minutes

# Failure symptoms:
# - "Time: 8.5 minutes"
# - Individual tests > 5 seconds

# Fix: Optimize slow tests, parallelize, reduce setup/teardown
```

---

### Category 3: Security (6 checks)

#### ✅ Check 3.1: Zero Critical/High Vulnerabilities
```bash
pnpm audit --audit-level high
# Expected: 0 high/critical vulnerabilities

# Alternative:
pnpm audit --json | jq '.vulnerabilities | to_entries[] | select(.value.severity | IN("high", "critical"))'
# Expected: Empty output

# Failure symptoms:
# - "found 3 high severity vulnerabilities"

# Fix: Run `pnpm audit --fix`, upgrade dependencies, or document accepted risk
```

#### ✅ Check 3.2: No Hardcoded Secrets
```bash
# Run Gitleaks scan
docker run --rm -v $(pwd):/repo zricethezav/gitleaks:latest detect --source /repo --no-git
# Expected: Exit code 0, no secrets found

# Failure symptoms:
# - "Secret detected: AWS_SECRET_ACCESS_KEY"
# - "Hardcoded password in config"

# Fix: Remove secrets, use env vars, rotate compromised credentials
```

#### ✅ Check 3.3: CodeQL Analysis Passes
```bash
# Run locally (requires CodeQL CLI)
codeql database create codeql-db --language=javascript-typescript
codeql database analyze codeql-db --format=sarif-latest --output=results.sarif
# Expected: No high-severity issues

# Or check GitHub Actions:
gh run list --workflow=security-scan.yml --limit 1 --json conclusion
# Expected: "conclusion": "success"

# Failure symptoms:
# - "SQL injection vulnerability detected"
# - "Unvalidated user input"

# Fix: Apply CodeQL recommendations, add input validation
```

#### ✅ Check 3.4: Docker Image Scan Passes
```bash
docker build -t credlink-api:test .
docker scan credlink-api:test
# Expected: 0 high/critical vulnerabilities

# Alternative: Use Trivy
trivy image credlink-api:test --severity HIGH,CRITICAL
# Expected: Exit code 0

# Failure symptoms:
# - "CVE-2024-1234: Node.js prototype pollution"

# Fix: Upgrade base image, update dependencies
```

#### ✅ Check 3.5: Environment Validation Enforced
```bash
# Test that invalid env crashes on startup
PORT=invalid node apps/api/dist/index.js
# Expected: Exit code 1, "Environment validation failed"

# Test that missing required env crashes
unset DATABASE_URL
NODE_ENV=production node apps/api/dist/index.js
# Expected: Exit code 1, "DATABASE_URL required in production"

# Failure symptoms:
# - Server starts with invalid config
# - No env validation errors

# Fix: Ensure env-schema.ts is imported and called in index.ts
```

#### ✅ Check 3.6: Security Headers Present
```bash
# Start server locally
pnpm run start &
sleep 5

# Check security headers
curl -I http://localhost:3000/health | grep -E "Strict-Transport-Security|X-Content-Type-Options|X-Frame-Options"
# Expected: All 3 headers present

# Failure symptoms:
# - Missing headers
# - Permissive values

# Fix: Verify helmet() configuration in index.ts
```

---

### Category 4: Infrastructure (5 checks)

#### ✅ Check 4.1: Docker Image Builds
```bash
docker build -t credlink-api:test .
# Expected: Exit code 0, image created

docker images credlink-api:test --format "{{.Size}}"
# Expected: < 500MB (distroless should be ~200MB)

# Failure symptoms:
# - "ERROR: failed to solve: process "/bin/sh -c pnpm install" did not complete successfully"
# - Image size > 1GB

# Fix: Check Dockerfile syntax, optimize layers
```

#### ✅ Check 4.2: Docker Image Runs
```bash
docker run --rm -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://test:test@localhost:5432/test \
  -e STORAGE_BACKEND=memory \
  credlink-api:test
# Expected: Server starts, health endpoint responds

curl http://localhost:3000/health
# Expected: {"status": "ok"}

# Failure symptoms:
# - Server crashes on startup
# - Health endpoint returns 500

# Fix: Check logs, verify dependencies included in image
```

#### ✅ Check 4.3: Docker Compose Works
```bash
docker-compose up -d
# Expected: All services start (api, postgres, redis)

docker-compose ps
# Expected: All services "Up" and "healthy"

docker-compose logs api | tail -20
# Expected: "Server started on port 3000"

# Cleanup:
docker-compose down

# Failure symptoms:
# - Services in "Exit" state
# - Health checks failing

# Fix: Check docker-compose.yml, verify networking
```

#### ✅ Check 4.4: Terraform Validates
```bash
cd infra/terraform
terraform init
terraform validate
# Expected: "Success! The configuration is valid."

terraform fmt -check
# Expected: No formatting changes needed

# Failure symptoms:
# - "Error: Missing required argument"
# - "Error: Unsupported block type"

# Fix: Fix Terraform syntax, add missing variables
```

#### ✅ Check 4.5: Kubernetes Manifests Valid (if using)
```bash
kubectl apply --dry-run=client -f k8s/
# Expected: No errors

kubectl apply --dry-run=server -f k8s/
# Expected: No validation errors from API server

# Failure symptoms:
# - "error: error validating data: unknown field"

# Fix: Update manifests to match K8s API version
```

---

### Category 5: CI/CD (3 checks)

#### ✅ Check 5.1: All Workflows Valid
```bash
# Validate workflow syntax
for file in .github/workflows/*.yml; do
  echo "Validating $file"
  yamllint $file || echo "❌ INVALID YAML"
done
# Expected: All workflows valid

# Test workflows locally with act
act -l
# Expected: Lists all jobs without errors

# Failure symptoms:
# - "Syntax error at line 42"
# - "Unknown action: actions/checkout@v99"

# Fix: Fix YAML syntax, verify action versions
```

#### ✅ Check 5.2: CI Pipeline Passes on Main
```bash
gh run list --branch main --limit 5 --json conclusion,workflowName
# Expected: All recent runs "conclusion": "success"

# Failure symptoms:
# - "conclusion": "failure"
# - Red builds on main branch

# Fix: Debug CI failures, merge only after green builds
```

#### ✅ Check 5.3: Branch Protection Enforced
```bash
gh api repos/:owner/:repo/branches/main/protection | jq '.required_status_checks.checks'
# Expected: Required checks configured

# Failure symptoms:
# - Empty checks array
# - No branch protection

# Fix: Configure branch protection in GitHub settings
```

---

### Category 6: Documentation (2 checks)

#### ✅ Check 6.1: All Operational Docs Exist
```bash
ls -1 docs/DEPLOYMENT_GUIDE.md docs/RUNBOOK.md docs/OPERATIONS_CHECKLIST.md docs/ARCHITECTURE.md CHANGELOG.md
# Expected: All 5 files exist

# Failure symptoms:
# - "No such file or directory"

# Fix: Create missing docs from templates in PROD_HARDENING_OPERATIONS.md
```

#### ✅ Check 6.2: Documentation Links Valid
```bash
# Check all markdown files for broken links
find . -name "*.md" -exec markdown-link-check {} \;
# Expected: All links valid (200 OK)

# Failure symptoms:
# - "404 Not Found"
# - "Dead link"

# Fix: Update broken links, remove dead references
```

---

## 🚀 Deployment Verification (Staging)

### After Staging Deployment

#### ✅ Check D.1: Health Endpoint Responds
```bash
curl -f https://staging.credlink.com/health
# Expected: {"status": "ok", "version": "1.2.3"}

# Failure symptoms:
# - 500 Internal Server Error
# - Timeout

# Fix: Check logs, verify environment variables
```

#### ✅ Check D.2: API Endpoints Functional
```bash
# Test sign endpoint
curl -X POST https://staging.credlink.com/api/v1/sign \
  -H "X-API-Key: $STAGING_API_KEY" \
  -F "file=@test-image.jpg"
# Expected: 200 OK, signed image returned

# Test verify endpoint
curl -X POST https://staging.credlink.com/api/v1/verify \
  -F "file=@signed-image.jpg"
# Expected: 200 OK, verification result
```

#### ✅ Check D.3: Metrics & Logs Available
```bash
# Check CloudWatch logs
aws logs tail /ecs/credlink-api --follow --region us-east-1

# Check Sentry for errors
open https://sentry.io/organizations/credlink/projects/api/

# Check Prometheus metrics
curl https://staging.credlink.com/metrics | grep credlink_requests_total
# Expected: Metrics exposed
```

#### ✅ Check D.4: Database Connection Stable
```bash
# Check connection pool metrics
curl https://staging.credlink.com/metrics | grep pg_pool
# Expected: active_connections < max_connections

# Check for connection errors
aws logs tail /ecs/credlink-api --since 5m | grep "database connection"
# Expected: No connection errors
```

#### ✅ Check D.5: Rollback Procedure Works
```bash
# Test manual rollback (without breaking production)
# In staging environment:
PREV_TASK=$(aws ecs describe-services --cluster credlink-staging --services api --query 'services[0].deployments[1].taskDefinition' --output text)
aws ecs update-service --cluster credlink-staging --service api --task-definition $PREV_TASK
aws ecs wait services-stable --cluster credlink-staging --services api

# Verify rollback completed
curl https://staging.credlink.com/health
# Expected: Previous version health check
```

---

## 📊 Verification Summary Report

**Template for recording verification results:**

```markdown
# Production Hardening Verification Report
**Date:** 2025-11-17
**Engineer:** [Your Name]
**Repository:** Nickiller04/c2-concierge
**Commit:** [SHA]

## Pre-Deployment Checks (29 total)

### Code Quality (6/6)
- [x] 1.1 Clean Build
- [x] 1.2 Linting Passes
- [x] 1.3 Type Checking Passes
- [x] 1.4 Code Formatting Valid
- [x] 1.5 No Dead Code
- [x] 1.6 Import Paths Valid

### Testing (7/7)
- [x] 2.1 All Tests Pass
- [x] 2.2 Test Coverage ≥ 80%
- [x] 2.3 No Flaky Tests
- [x] 2.4 Integration Tests Pass
- [x] 2.5 Acceptance Tests Pass
- [x] 2.6 No Skipped Tests
- [x] 2.7 Test Performance Acceptable

### Security (6/6)
- [x] 3.1 Zero Critical/High Vulns
- [x] 3.2 No Hardcoded Secrets
- [x] 3.3 CodeQL Analysis Passes
- [x] 3.4 Docker Image Scan Passes
- [x] 3.5 Environment Validation Enforced
- [x] 3.6 Security Headers Present

### Infrastructure (5/5)
- [x] 4.1 Docker Image Builds
- [x] 4.2 Docker Image Runs
- [x] 4.3 Docker Compose Works
- [x] 4.4 Terraform Validates
- [x] 4.5 Kubernetes Manifests Valid

### CI/CD (3/3)
- [x] 5.1 All Workflows Valid
- [x] 5.2 CI Pipeline Passes
- [x] 5.3 Branch Protection Enforced

### Documentation (2/2)
- [x] 6.1 All Operational Docs Exist
- [x] 6.2 Documentation Links Valid

**Pre-Deployment Result:** ✅ 29/29 PASS

## Staging Deployment Checks (5 total)
- [x] D.1 Health Endpoint Responds
- [x] D.2 API Endpoints Functional
- [x] D.3 Metrics & Logs Available
- [x] D.4 Database Connection Stable
- [x] D.5 Rollback Procedure Works

**Staging Verification Result:** ✅ 5/5 PASS

## Final Decision
✅ **PRODUCTION READY** - All 34 checks passed

Deployment approved by: [Your Name]
Next step: Deploy to production with manual approval
```

---

## 🚨 Failure Recovery Procedures

### If ANY Check Fails

1. **STOP immediately** - Do not proceed to next check
2. **Document failure** - Note exact error, check number
3. **Fix root cause** - Do not apply workarounds
4. **Re-run verification** - Start from beginning (all 29 checks)
5. **Repeat until 100% pass** - Zero tolerance for failures

### Common Failure Patterns

| Failure Type | Recovery Time | Rollback Required? |
|--------------|---------------|-------------------|
| **Build failure** | 30 minutes | No |
| **Test failure** | 1-2 hours | No |
| **Security vuln** | 2-4 hours | Yes (if deployed) |
| **Docker build failure** | 30 minutes | No |
| **Staging health fail** | Immediate | Yes |

---

## ✅ Production Deployment Authorization

**Only after ALL 34 checks pass:**

```bash
# Create deployment authorization record
cat > DEPLOYMENT_AUTH_$(date +%Y%m%d).md << EOF
# Deployment Authorization

**Date:** $(date)
**Commit:** $(git rev-parse HEAD)
**Authorized by:** [Your Name]
**Verification Report:** PROD_HARDENING_VERIFICATION_PASSED.md

## Verification Summary
- Pre-deployment checks: 29/29 PASS
- Staging deployment checks: 5/5 PASS
- Total: 34/34 PASS

## Authorization
This deployment is APPROVED for production.

Signature: [Your Name]
Date: $(date)
EOF

# Deploy to production
gh workflow run cd.yml -f environment=production
```

---

**Congratulations!** If all checks pass, your repository is now **production-ready**.

---

## 🎯 Final Checklist

- [ ] Read all 7 PROD_HARDENING_*.md files
- [ ] Execute deletions (157 files)
- [ ] Apply CI/CD workflows (8 files)
- [ ] Apply security configs (Dockerfile, env-schema, etc.)
- [ ] Create operational docs (5 docs)
- [ ] Run all 29 pre-deployment checks
- [ ] Deploy to staging
- [ ] Run all 5 staging verification checks
- [ ] Create deployment authorization record
- [ ] Deploy to production (with manual approval)
- [ ] Monitor for 24 hours post-deployment

**Status:** Ready to transform from 12% implemented to **100% deployment-ready**.
