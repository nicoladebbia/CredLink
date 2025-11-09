# Phase 46: Rollback Runbook

Comprehensive rollback procedures for application and database with instant rollback capabilities.

## Table of Contents
1. [Quick Reference](#quick-reference)
2. [Rollback Decision Tree](#rollback-decision-tree)
3. [Application Rollback](#application-rollback)
4. [Database Rollback](#database-rollback)
5. [Canary Abort](#canary-abort)
6. [Verification](#verification)
7. [Incident Correlation](#incident-correlation)

---

## Quick Reference

### Emergency Rollback (< 5 minutes)

**Application only** (no DB changes):
```bash
# Dashboard
wrangler rollback --env prod

# OR CLI
wrangler versions list --env prod
wrangler versions deploy VERSION_ID --env prod
```

**With database changes**:
```bash
# 1. Rollback app first
wrangler rollback --env prod

# 2. Then rollback DB
cd infra/db
liquibase rollback phase46-complete
```

**Verification**:
```bash
curl -f https://c2concierge.dev/health
./scripts/survival_harness.sh
```

---

## Rollback Decision Tree

```
Is there a production incident?
│
├─ YES → Is it related to recent deployment?
│   │
│   ├─ YES → How long ago was deployment?
│   │   │
│   │   ├─ < 1 hour → IMMEDIATE ROLLBACK
│   │   │   └─> Follow "Immediate Rollback" procedure
│   │   │
│   │   ├─ 1-24 hours → EVALUATED ROLLBACK
│   │   │   └─> Check if DB migrations occurred
│   │   │       ├─ No DB changes → App rollback only
│   │   │       └─ DB changes → Compatibility-first strategy
│   │   │
│   │   └─ > 24 hours → FIX FORWARD (unless critical)
│   │       └─> Rollback risky; prefer hotfix
│   │
│   └─ NO → Investigate root cause (not deployment-related)
│
└─ NO → Continue normal operations
```

---

## Application Rollback

### 1. Cloudflare Workers Rollback

#### Method A: Dashboard (GUI)
1. Navigate to Cloudflare Dashboard
2. Workers & Pages → Select `CredLink-api`
3. Click "Rollbacks" tab
4. Select previous stable version
5. Click "Rollback" → Confirm

**Time**: ~2 minutes  
**Blast radius**: Immediate (all traffic)

#### Method B: Wrangler CLI
```bash
# List versions
wrangler versions list --env prod

# Example output:
# Version ID  | Created         | Traffic
# v2024-001   | 2024-01-15 10:00 | 100%
# v2024-000   | 2024-01-14 09:00 | 0%

# Rollback to previous
wrangler rollback --env prod

# OR deploy specific version
wrangler versions deploy v2024-000 --env prod --percentage 100
```

**Verification**:
```bash
# Check version
curl -s https://c2concierge.dev/api/version

# Health check
curl -f https://c2concierge.dev/health || echo "FAILED"

# Quick survival test
curl -s https://c2concierge.dev/api/verify/test.jpg | jq .
```

### 2. Cloudflare Pages Rollback (UI/Badge)

```bash
# Pages automatic rollback
# Dashboard → Pages → c2-badge → Rollbacks → Select previous

# OR via CLI
npx wrangler pages deployment list --project-name=c2-badge
npx wrangler pages deployment create --project-name=c2-badge --branch=main
```

### 3. Verify Application Rollback

```bash
# 1. Health check all endpoints
./scripts/health-check.sh

# 2. Run survival harness
./scripts/survival_harness.sh

# 3. Check error rates (Datadog/New Relic)
# Verify error rate returned to baseline

# 4. Check p95 latency
# Verify latency returned to baseline
```

---

## Database Rollback

### Scenario 1: Reversible Migration (Liquibase)

**When**: Migration has explicit rollback defined

```bash
cd infra/db

# 1. Check current state
liquibase status

# 2. Rollback by tag
liquibase rollback phase46-complete

# 3. Verify
liquibase status
psql -c "SELECT * FROM databasechangelog ORDER BY dateexecuted DESC LIMIT 5;"

# 4. Validate schema
./scripts/validate-schema.sh
```

**Rollback by count** (last N changesets):
```bash
liquibase rollback-count 3
```

**Rollback by date**:
```bash
liquibase rollback-to-date "2024-01-15 10:00:00"
```

### Scenario 2: Compatibility-First (No DB Rollback Needed)

**When**: Migration used compat-first strategy

```bash
# 1. Rollback app only
wrangler rollback --env prod

# 2. Database remains in compatible state
# No DB rollback needed - app works with new schema

# 3. Verify app on old code with new schema
./scripts/survival_harness.sh
```

**Example**:
```sql
-- Migration added nullable column
ALTER TABLE users ADD COLUMN email_verified boolean DEFAULT NULL;

-- App rollback works because:
-- - Old code ignores new column
-- - New schema is backward-compatible
```

### Scenario 3: Non-Reversible Migration

**When**: Data transformation with no clear rollback

⚠️ **Prevention is key** - These should be rare!

**Options**:
1. **Fix forward** (preferred)
   ```bash
   # Deploy hotfix that handles both states
   git checkout -b hotfix/fix-migration-issue
   # ... make fixes ...
   git push
   # Deploy via hotfix lane (requires approval)
   ```

2. **Manual rollback** (last resort)
   ```sql
   -- Restore from backup (if available)
   -- Requires DBA and on-call lead approval
   
   -- Example: Undo data transformation
   UPDATE users 
   SET old_column = new_column 
   WHERE old_column IS NULL;
   ```

### Scenario 4: Point-in-Time Recovery (PITR)

**When**: Catastrophic data corruption

```bash
# PostgreSQL PITR
# 1. Identify target timestamp
TARGET_TIME="2024-01-15 09:55:00"

# 2. Contact DBA team
# 3. Restore from continuous archiving
pg_restore --target-time="$TARGET_TIME" /backup/location

# 4. Verify data integrity
./scripts/verify-data-integrity.sh
```

---

## Canary Abort

### Automatic Abort (Triggered by Metrics)

**When**: Canary metrics fail during bake period

```bash
# Automatically triggered by cd-phase46.yml workflow
# Manual trigger:
cd ops
node canary_rollback.js
```

**What it does**:
1. Routes 0% traffic to canary
2. Removes canary Worker version
3. Verifies stable version
4. Notifies on-call

### Manual Canary Abort

```bash
# 1. Stop canary traffic immediately
node ops/canary_route.js --percentage 0

# 2. Verify control version is handling 100%
curl -s https://c2concierge.dev/api/version | jq .

# 3. Delete canary version
wrangler versions delete CANARY_VERSION_ID --env prod

# 4. Verify stable state
./scripts/survival_harness.sh
```

---

## Verification

### Post-Rollback Checklist

```bash
# 1. Health checks
curl -f https://c2concierge.dev/health || exit 1
curl -f https://staging.c2concierge.dev/health || exit 1

# 2. Survival harness (critical)
./scripts/survival_harness.sh
# MUST show ≥99.9% remote survival

# 3. Integration tests
pnpm test:integration

# 4. Manual smoke tests
# - Sign an asset
# - Verify a signed asset
# - Check remote manifest discovery
# - Test badge rendering

# 5. Metrics verification
# Check Datadog/New Relic dashboards:
# - Error rate < 0.1%
# - P95 latency within baseline ± 10%
# - Remote survival ≥ 99.9%

# 6. Database integrity
psql -c "SELECT COUNT(*) FROM audit_logs WHERE created_at > NOW() - INTERVAL '1 hour';"
# Verify no anomalies
```

### Rollback Verification Script

```bash
#!/bin/bash
# verify-rollback.sh

set -e

echo "🔍 Verifying rollback..."

# Health checks
echo "1. Health checks..."
curl -f https://c2concierge.dev/health

# Version check
echo "2. Version check..."
CURRENT_VERSION=$(curl -s https://c2concierge.dev/api/version | jq -r .sha)
echo "Current version: $CURRENT_VERSION"

# Survival harness
echo "3. Survival harness..."
./scripts/survival_harness.sh

# Database check
echo "4. Database connectivity..."
psql -c "SELECT 1;" > /dev/null

echo "✅ Rollback verified successfully"
```

---

## Incident Correlation

### Link Rollback to Incident

```bash
# 1. Record rollback metadata
cat > .artifacts/rollback-$(date +%s).json <<EOF
{
  "incident_id": "INC-12345",
  "rollback_timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "rolled_back_from": "$DEPLOYED_SHA",
  "rolled_back_to": "$PREVIOUS_SHA",
  "triggered_by": "$USER",
  "reason": "High error rate observed",
  "verification_status": "passed"
}
EOF

# 2. Link to monitoring
curl -X POST "https://api.datadoghq.com/api/v1/events" \
  -H "DD-API-KEY: $DD_API_KEY" \
  -d '{
    "title": "Rollback: '$DEPLOYED_SHA' → '$PREVIOUS_SHA'",
    "text": "Rolled back due to incident INC-12345",
    "tags": ["rollback", "incident:INC-12345"]
  }'

# 3. Post-incident review
# Schedule blameless post-mortem within 48 hours
```

### Rollback Metrics

Track rollback frequency and impact:

```sql
-- Rollback frequency
SELECT 
  COUNT(*) as total_rollbacks,
  AVG(EXTRACT(EPOCH FROM (verified_at - triggered_at))) as avg_rollback_time_seconds
FROM deployment_rollbacks
WHERE created_at > NOW() - INTERVAL '30 days';

-- Rollback success rate
SELECT 
  COUNT(*) FILTER (WHERE status = 'success') * 100.0 / COUNT(*) as success_rate
FROM deployment_rollbacks
WHERE created_at > NOW() - INTERVAL '30 days';
```

---

## Rollback Drills

### Monthly Drill Schedule

**Objective**: Verify rollback procedures and train on-call engineers

**Frequency**: Monthly (first Tuesday of each month)

**Procedure**:
```bash
# 1. Announce drill in #engineering
# "🚨 Rollback drill starting - this is a drill"

# 2. Deploy test version to staging
wrangler deploy --env staging

# 3. Perform rollback
wrangler rollback --env staging

# 4. Verify
./scripts/survival_harness.sh

# 5. Document timing
# Record: Time to detect, time to rollback, time to verify

# 6. Debrief
# Discuss: What went well, what can be improved
```

---

## Emergency Contacts

**On-call Lead**: Check PagerDuty  
**Database Team**: #db-team Slack channel  
**Security Team**: #security-incidents  
**Engineering Leads**: escalation@company.com

---

## References

- [Cloudflare Wrangler Rollback](https://developers.cloudflare.com/workers/wrangler/commands/#rollback)
- [Liquibase Rollback Commands](https://docs.liquibase.com/commands/rollback/home.html)
- [SRE Workbook: Emergency Response](https://sre.google/workbook/emergency-response/)
- Phase 46: CI/CD Enterprise-Grade specification
