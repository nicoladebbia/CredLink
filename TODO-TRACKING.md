# TODO Comments Tracking

**Last Updated**: January 2025  
**Total TODOs**: 76 (excluding node_modules)  
**Status**: Catalogued for GitHub issue creation

---

## Summary by Priority

| Priority | Count | Description |
|----------|-------|-------------|
| 🔴 High | 12 | Production functionality gaps |
| 🟡 Medium | 38 | Enhancement opportunities |
| 🟢 Low | 26 | Nice-to-have improvements |

---

## 🔴 HIGH PRIORITY TODOs (Production Gaps)

### P1: Authentication & Security
**Files**: 
- `tests/gauntlet/src/autofallback/retro-sign/apps/api/src/middleware/auth.ts:386-387`
- `tests/gauntlet/src/autofallback/retro-sign/apps/analytics/src/web/dashboard.ts:532`

**TODOs**:
- Store authentication events in database for compliance
- Send to security monitoring system
- Implement proper token validation

**GitHub Issue**: Create #TODO-001  
**Effort**: 8 hours  
**Impact**: Compliance & Security  

### P2: Monitoring & Observability
**Files**:
- `tests/gauntlet/src/autofallback/retro-sign/apps/api/src/services/security-monitoring-service.ts:169,368`
- `tests/gauntlet/src/autofallback/retro-sign/apps/api/src/services/audit-service.ts:350`
- `tests/gauntlet/src/autofallback/retro-sign/apps/analytics/src/alerts/alert-service.ts:412,429,441`

**TODOs**:
- Store in Redis with expiration for distributed blocking
- Load from external threat intelligence feeds  
- Implement monitoring system integration
- Integrate with incident management (PagerDuty)
- Integrate with ticketing system (Jira)
- Insert incidents into ClickHouse

**GitHub Issue**: Create #TODO-002  
**Effort**: 16 hours  
**Impact**: Production observability

### P3: Proof Migration Tool
**File**: `tools/migrate-proofs/migrate.ts:27`

**TODO**: Implement migration logic

**GitHub Issue**: Create #TODO-003  
**Effort**: 8 hours  
**Impact**: Data migration capabilities

---

## 🟡 MEDIUM PRIORITY TODOs (Enhancements)

### M1: Analytics Service Integration
**Files**:
- `tests/gauntlet/src/autofallback/retro-sign/apps/analytics/src/index.ts:222,281,370`
- `tests/gauntlet/src/autofallback/retro-sign/apps/analytics/src/services/analytics-service.ts:104-105`
- `tests/gauntlet/src/autofallback/retro-sign/apps/analytics/src/queries/slo-queries.ts:193`

**TODOs**:
- Call Phase 6 policy API to enforce fallback
- Implement incident resolution in AnalyticsService
- Get list of active tenants from tenant service
- Get policy from Phase 6 policy service
- Calculate actual manifest storage from data

**GitHub Issue**: Create #TODO-004  
**Effort**: 12 hours  
**Impact**: Better analytics and policy enforcement

### M2: Package Verify Service Stubs
**File**: `packages/verify/src/services/signer.ts:12,17,22`

**TODOs**:
- Implement actual signing logic
- Implement actual verification logic
- Implement actual health check logic

**GitHub Issue**: Create #TODO-005  
**Effort**: 16 hours  
**Impact**: Complete verify package functionality

### M3: Package Verify Storage Stubs
**File**: `packages/verify/src/services/storage.ts:16,21,25,29,34,39,44`

**TODOs**:
- Implement actual storage operations (7 methods)
- Implement actual ping logic
- Implement bucket check logic  
- Implement replication lag logic

**GitHub Issue**: Create #TODO-006  
**Effort**: 12 hours  
**Impact**: Complete storage functionality

### M4: Durable Objects Implementation
**File**: `packages/verify/src/services/durable-objects.ts:15,20`

**TODOs**:
- Implement actual Durable Object logic (2 locations)

**GitHub Issue**: Create #TODO-007  
**Effort**: 8 hours  
**Impact**: Cloudflare Workers functionality

---

## 🟢 LOW PRIORITY TODOs (Nice-to-Have)

### L1: Shared Logger
**File**: `packages/c2pa-sdk/src/utils/logger.ts:3`

**TODO**: Replace with proper shared logger from @credlink/types

**GitHub Issue**: Create #TODO-008  
**Effort**: 2 hours  
**Impact**: Code consistency

### L2: Metrics Collection
**File**: `packages/verify/src/routes.ts:819`

**TODO**: Implement actual metrics collection

**GitHub Issue**: Create #TODO-009  
**Effort**: 4 hours  
**Impact**: Better observability

---

## RECOMMENDED ACTION PLAN

### Phase 1: Critical (Week 1-2)
1. **#TODO-001**: Authentication & Security (8h)
2. **#TODO-003**: Proof Migration Tool (8h)

### Phase 2: Important (Week 3-4)
3. **#TODO-002**: Monitoring & Observability (16h)
4. **#TODO-004**: Analytics Integration (12h)

### Phase 3: Enhancement (Month 2)
5. **#TODO-005**: Verify Service Implementation (16h)
6. **#TODO-006**: Storage Implementation (12h)
7. **#TODO-007**: Durable Objects (8h)

### Phase 4: Polish (Month 3)
8. **#TODO-008**: Shared Logger (2h)
9. **#TODO-009**: Metrics Collection (4h)

---

## AUTOMATION SCRIPT

To track TODOs automatically:

```bash
#!/bin/bash
# todo-tracker.sh

echo "# TODO Tracking Report - $(date)"
echo ""

echo "## Total TODOs"
grep -r "TODO" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist . 2>/dev/null | wc -l

echo ""
echo "## TODOs by File"
grep -r "TODO" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=dist . 2>/dev/null | \
  cut -d: -f1 | sort | uniq -c | sort -rn | head -20

echo ""
echo "## Recent TODOs (Last 10)"
git log --all --since="1 month ago" -p | grep "^\+.*TODO" | head -10
```

---

## GITHUB ISSUE TEMPLATE

```markdown
## TODO: [Brief Description]

**Location**: `file/path.ts:line`

### Current State
[Brief description of what's currently a stub/placeholder]

### Desired State
[What needs to be implemented]

### Implementation Notes
- [Technical requirement 1]
- [Technical requirement 2]
- [External dependency if any]

### Acceptance Criteria
- [ ] Functionality implemented
- [ ] Tests added
- [ ] Documentation updated
- [ ] TODO comment removed

**Priority**: High/Medium/Low  
**Effort**: X hours  
**Labels**: enhancement, technical-debt
```

---

## NOTES

1. **Test Code TODOs**: Many TODOs are in `tests/gauntlet` which appears to be stress testing code. These are lower priority than production code TODOs.

2. **Package TODOs**: The `packages/verify` package has many stubs. This suggests it's a work-in-progress package that should either be completed or marked as experimental.

3. **AWS Secrets Manager**: Several TODOs mention AWS Secrets Manager integration which we've now documented in the auth middleware.

4. **Automatic Tracking**: Consider adding a CI check that fails if TODOs increase beyond a threshold, encouraging immediate issue creation.

---

**Last Reviewed**: January 2025  
**Reviewer**: DevOps Team
