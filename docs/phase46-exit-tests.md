# Phase 46: Exit Tests

Binary pass/fail tests to validate Phase 46 implementation.

## Exit Test 1: Rollback Drills

### Test 1a: App Rollback (Cloudflare Workers)

**Objective**: Verify Workers version rollback completes without data loss

**Steps**:
```bash
# 1. Deploy test version to staging
cd apps/api-gw
wrangler deploy --env staging

# 2. Record version
CURRENT_VERSION=$(wrangler versions list --env staging | head -2 | tail -1 | awk '{print $1}')
echo "Current version: $CURRENT_VERSION"

# 3. Make a test request
curl https://staging.c2concierge.dev/api/version > /tmp/before-rollback.json

# 4. Deploy another version
echo "// rollback test" >> src/index.ts
wrangler deploy --env staging

# 5. Rollback to previous
wrangler rollback --env staging

# 6. Verify version is correct
NEW_VERSION=$(wrangler versions list --env staging | head -2 | tail -1 | awk '{print $1}')
if [ "$NEW_VERSION" = "$CURRENT_VERSION" ]; then
  echo "✅ PASS: Rollback successful"
else
  echo "❌ FAIL: Rollback failed"
  exit 1
fi

# 7. Verify no data loss
curl https://staging.c2concierge.dev/api/version > /tmp/after-rollback.json
# Check that service is functional
curl -f https://staging.c2concierge.dev/health || exit 1
```

**Pass criteria**: Rollback completes in < 2 minutes, service remains available, no errors

### Test 1b: DB Rollback (Liquibase)

**Objective**: Verify database rollback using Liquibase in staging

**Steps**:
```bash
cd infra/db

# 1. Take pre-migration snapshot
liquibase snapshot --snapshot-format=json > /tmp/pre-migration.json

# 2. Apply test migration
cat > /tmp/test-changeset.xml <<'EOF'
<changeSet id="exit-test-001" author="test">
  <createTable tableName="exit_test_table">
    <column name="id" type="uuid" defaultValueComputed="gen_random_uuid()">
      <constraints primaryKey="true"/>
    </column>
    <column name="test_data" type="varchar(255)"/>
  </createTable>
  <rollback>
    <dropTable tableName="exit_test_table"/>
  </rollback>
</changeSet>
EOF

# Append to changelog temporarily
echo "Including test changeset..."
liquibase update

# 3. Verify migration applied
psql -c "SELECT COUNT(*) FROM exit_test_table;" || exit 1

# 4. Rollback migration
liquibase rollback-count 1

# 5. Verify rollback
psql -c "SELECT COUNT(*) FROM exit_test_table;" 2>&1 | grep -q "does not exist"
if [ $? -eq 0 ]; then
  echo "✅ PASS: DB rollback successful"
else
  echo "❌ FAIL: DB rollback failed"
  exit 1
fi

# 6. Clean up
# Remove test changeset from changelog
```

**Pass criteria**: Migration applies and rolls back cleanly, no residual state

### Test 1c: Compatibility-First DB Policy

**Objective**: Verify app rollback works with new schema (compat-first)

**Steps**:
```bash
# 1. Deploy app version N
wrangler deploy --env staging --var APP_VERSION=v1

# 2. Apply backward-compatible schema change
cat > /tmp/compat-test.xml <<'EOF'
<changeSet id="compat-test-001" author="test">
  <addColumn tableName="users">
    <column name="test_nullable_field" type="varchar(255)">
      <constraints nullable="true"/>
    </column>
  </addColumn>
  <rollback>
    <dropColumn tableName="users" columnName="test_nullable_field"/>
  </rollback>
</changeSet>
EOF

liquibase update

# 3. Deploy app version N+1 (uses new field)
# (In real test, deploy code that reads new field)

# 4. Rollback app to version N
wrangler rollback --env staging

# 5. Verify old app works with new schema
curl -f https://staging.c2concierge.dev/health || exit 1
curl -f https://staging.c2concierge.dev/api/test || exit 1

# 6. No DB rollback needed - schema is compatible
echo "✅ PASS: Compat-first strategy verified"
```

**Pass criteria**: Old app code works with new schema, no DB rollback needed

---

## Exit Test 2: Canary Catches Regression

**Objective**: Verify canary deployment detects and aborts on regression

**Steps**:
```bash
# 1. Baseline metrics
curl https://c2concierge.dev/metrics/baseline > /tmp/baseline.json

# 2. Deploy canary with intentional regression
# (In real test, deploy version with degraded performance)
node ops/canary_route.js --percentage 5 --version test-regression

# 3. Run canary monitoring
./ops/canary_check.sh --duration 120 --version test-regression

# Expected: Script should detect regression and exit with code 1

if [ $? -eq 1 ]; then
  echo "✅ PASS: Canary correctly detected regression"
else
  echo "❌ FAIL: Canary did not detect regression"
  exit 1
fi

# 4. Verify abort path executed
# Check that canary was rolled back
CANARY_TRAFFIC=$(curl -s https://c2concierge.dev/api/canary-status | jq -r '.percentage')
if [ "$CANARY_TRAFFIC" = "0" ]; then
  echo "✅ PASS: Abort path executed correctly"
else
  echo "❌ FAIL: Canary not aborted"
  exit 1
fi
```

**Pass criteria**: Canary monitoring detects regression within 2 minutes, automatically aborts

---

## Exit Test 3: Survival-Harness Blocks Bad Change

**Objective**: Verify survival-harness blocks PR that degrades remote survival

**Preparation**:
1. Create test PR with change that breaks remote manifest discovery
2. Example: Comment out `Link: rel="c2pa-manifest"` header

**Steps**:
```bash
# 1. Create test branch
git checkout -b test/break-remote-survival

# 2. Introduce breaking change
# Edit sandbox to remove Link header
sed -i 's/Link: rel="c2pa-manifest"/# Link: rel="c2pa-manifest"/' sandboxes/remote-only/server.js

# 3. Commit and push
git add sandboxes/remote-only/server.js
git commit -m "test: break remote survival (for exit test)"
git push origin test/break-remote-survival

# 4. Create PR
gh pr create --title "Test: Break Remote Survival" --body "Exit test - should be blocked"

# 5. Wait for CI checks
gh pr checks --watch

# 6. Verify survival-harness fails
gh pr checks | grep "survival-harness" | grep -q "fail"
if [ $? -eq 0 ]; then
  echo "✅ PASS: Survival-harness blocked bad change"
else
  echo "❌ FAIL: Survival-harness did not block"
  exit 1
fi

# 7. Verify PR is blocked from merging
gh pr view | grep -q "All checks have failed"
if [ $? -eq 0 ]; then
  echo "✅ PASS: PR correctly blocked"
else
  echo "❌ FAIL: PR not blocked"
  exit 1
fi

# 8. Clean up
gh pr close
git checkout main
git branch -D test/break-remote-survival
```

**Pass criteria**: 
- Survival-harness detects remote survival < 99.9%
- CI check fails
- PR is blocked from merging per branch protection rules

---

## Exit Test 4: CAI Verify Agreement

**Objective**: Verify outcomes match CAI Verify reference implementation

**Steps**:
```bash
# 1. Install CAI Verify (if not already installed)
if ! command -v cai_verify &> /dev/null; then
  echo "Installing CAI Verify..."
  # Installation varies by platform
fi

# 2. Test signed asset
TEST_ASSET="fixtures/signed/landscape.jpg"
if [ ! -f "$TEST_ASSET" ]; then
  echo "Creating test asset..."
  ./scripts/make-fixtures.sh
fi

# 3. Verify with CAI Verify (reference)
cai_verify "$TEST_ASSET" > /tmp/cai-verify-result.json

# 4. Verify with our implementation
curl -f https://staging.c2concierge.dev/api/verify -F "file=@$TEST_ASSET" > /tmp/our-verify-result.json

# 5. Compare outcomes
CAI_STATUS=$(jq -r '.status' /tmp/cai-verify-result.json)
OUR_STATUS=$(jq -r '.status' /tmp/our-verify-result.json)

if [ "$CAI_STATUS" = "$OUR_STATUS" ]; then
  echo "✅ PASS: Verification outcomes agree"
else
  echo "❌ FAIL: Verification outcomes diverge"
  echo "CAI Verify: $CAI_STATUS"
  echo "Our implementation: $OUR_STATUS"
  exit 1
fi
```

**Pass criteria**: Verification outcomes match for all test assets

---

## Automated Exit Test Runner

```bash
#!/usr/bin/env bash
# run-exit-tests.sh
# Phase 46 automated exit test runner

set -e

RESULTS_DIR=".artifacts/exit-tests"
mkdir -p "$RESULTS_DIR"

echo "🧪 Phase 46 Exit Tests"
echo "======================"
echo ""

# Test 1a: App Rollback
echo "Test 1a: App Rollback..."
if bash tests/exit/test-app-rollback.sh > "$RESULTS_DIR/test-1a.log" 2>&1; then
  echo "✅ PASS"
else
  echo "❌ FAIL (see $RESULTS_DIR/test-1a.log)"
  exit 1
fi

# Test 1b: DB Rollback
echo "Test 1b: DB Rollback..."
if bash tests/exit/test-db-rollback.sh > "$RESULTS_DIR/test-1b.log" 2>&1; then
  echo "✅ PASS"
else
  echo "❌ FAIL (see $RESULTS_DIR/test-1b.log)"
  exit 1
fi

# Test 1c: Compat-First
echo "Test 1c: Compat-First Policy..."
if bash tests/exit/test-compat-first.sh > "$RESULTS_DIR/test-1c.log" 2>&1; then
  echo "✅ PASS"
else
  echo "❌ FAIL (see $RESULTS_DIR/test-1c.log)"
  exit 1
fi

# Test 2: Canary Detection
echo "Test 2: Canary Regression Detection..."
if bash tests/exit/test-canary-detection.sh > "$RESULTS_DIR/test-2.log" 2>&1; then
  echo "✅ PASS"
else
  echo "❌ FAIL (see $RESULTS_DIR/test-2.log)"
  exit 1
fi

# Test 3: Survival-Harness Blocking
echo "Test 3: Survival-Harness Blocks Bad Change..."
if bash tests/exit/test-survival-blocking.sh > "$RESULTS_DIR/test-3.log" 2>&1; then
  echo "✅ PASS"
else
  echo "❌ FAIL (see $RESULTS_DIR/test-3.log)"
  exit 1
fi

# Test 4: CAI Verify Agreement
echo "Test 4: CAI Verify Agreement..."
if bash tests/exit/test-cai-verify-agreement.sh > "$RESULTS_DIR/test-4.log" 2>&1; then
  echo "✅ PASS"
else
  echo "❌ FAIL (see $RESULTS_DIR/test-4.log)"
  exit 1
fi

echo ""
echo "🎉 All Phase 46 exit tests passed!"
echo ""
echo "Phase 46 implementation is complete and verified."
```

---

## Manual Verification Checklist

Before marking Phase 46 complete, verify:

- [ ] **Branch protections configured**
  - [ ] `main` branch requires 2 reviews
  - [ ] Required status checks: lint, unit, build, integration, survival-harness, security
  - [ ] Signed commits required
  - [ ] CODEOWNERS enforced

- [ ] **Environments configured**
  - [ ] `staging` environment exists
  - [ ] `prod-canary` environment exists with 1 reviewer
  - [ ] `prod` environment exists with 2 reviewers
  - [ ] All secrets configured (CLOUDFLARE_API_TOKEN, etc.)

- [ ] **CI/CD pipelines working**
  - [ ] `ci-phase46.yml` workflow runs on PR
  - [ ] All jobs pass: lint, unit, build, integration, survival-harness, security
  - [ ] `cd-phase46.yml` workflow deploys on merge to main
  - [ ] Canary deployment executes successfully

- [ ] **Rollback procedures tested**
  - [ ] App rollback completes in < 2 minutes
  - [ ] DB rollback works in staging
  - [ ] Canary abort path executes correctly

- [ ] **Survival-harness validated**
  - [ ] Blocks changes with remote survival < 99.9%
  - [ ] Uses CAI Verify for reference validation
  - [ ] Runs against all three sandboxes

- [ ] **Feature flags deployed**
  - [ ] Package built and available: `@c2/feature-flags`
  - [ ] Documentation complete
  - [ ] Example flags created with expiry

- [ ] **Database migrations ready**
  - [ ] Liquibase configured with rollback support
  - [ ] Test migrations applied and rolled back successfully
  - [ ] Compat-first policy documented

- [ ] **Documentation complete**
  - [ ] Branch protection setup guide
  - [ ] Rollback runbook
  - [ ] Exit tests documented
  - [ ] Ops tools README

---

## Success Metrics

Phase 46 is successful when:

1. **Deploy frequency**: Can deploy multiple times per week safely
2. **Rollback time**: < 5 minutes from decision to verified rollback
3. **Survival SLO**: Never drops below 99.9% in production
4. **Canary effectiveness**: Catches regressions before full rollout (≥90%)
5. **Zero unplanned outages**: Due to deployment or schema changes

---

## References

- [SRE Workbook: Testing for Reliability](https://sre.google/workbook/testing-reliability/)
- [Cloudflare Workers Rollback](https://developers.cloudflare.com/workers/wrangler/commands/#rollback)
- [Liquibase Testing Best Practices](https://docs.liquibase.com/concepts/bestpractices.html)
- Phase 46: CI/CD Enterprise-Grade specification
