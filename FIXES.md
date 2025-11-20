# CredLink Fixed Issues Registry

## Issue 1: Dashboard White Page (RESOLVED)
**Date**: Nov 2025  
**Root Cause**: Missing backend endpoints causing 404 errors  
**Fix**: Added 6 endpoints in unified-server.js  
**Files Modified**: 
- `unified-server.js` (added /invoices, /audit-logs, /webhooks, /usage/current, /proofs, /auth/sessions)
- `Dashboard.tsx` (fixed useEffect dependencies, added safe fallbacks)

## Issue 2: Hardcoded Data (RESOLVED)
**Date**: Nov 2025  
**Root Cause**: 100+ hardcoded values throughout codebase  
**Fix**: Created comprehensive configuration system  
**Files Modified**:
- Created `/packages/config/src/time-constants.ts`
- Created `/apps/api/src/config/job-config.ts`
- Updated all services to use environment variables
- Fixed `env-schema.ts` missing properties

## Issue 3: TypeScript Compilation Errors (RESOLVED)
**Date**: Nov 2025  
**Root Cause**: Missing environment variable properties  
**Fix**: Added all missing properties to env-schema.ts  
**Files Modified**: `/apps/api/src/config/env-schema.ts`

## Issue 4: Document Data Format Issues (RESOLVED)
**Date**: Nov 2025  
**Root Cause**: Documents missing required fields for Dashboard  
**Fix**: Enhanced document objects with name, size, status, mimeType  
**Files Modified**: API endpoints returning document data

## Issue 5: Health Endpoint 404 Errors (RESOLVED)
**Date**: Nov 2025  
**Root Cause**: Health router mounted AFTER 404 catch-all handler in Express middleware chain  
**Fix**: Fixed Express middleware order and simplified health router  
**Technical Details**:
- **Problem**: `/health`, `/health/detailed`, `/health/metrics` returned 404 while `/ready` worked (200)
- **Root Cause**: Express middleware order - 404 handler intercepted all requests before health router
- **Solution**: Moved health router mount to module level BEFORE 404 handler
- **Approach**: Simplified health router to remove complex dependencies (HealthChecker, HealthMonitoring)

**Files Modified**:
- `apps/api/src/routes/health.ts` (simplified routes, removed external dependencies)
- `apps/api/src/index.ts` (moved health router mount before 404 handler)
- `apps/api/src/routes/verify.ts` (fixed lazy initialization)
- `apps/api/src/services/proof-storage-async.ts` (fixed DataEncryption config)

**Final Test Results**:
✅ `/health` - 200 OK (status, uptime, memory, checks)  
✅ `/health/detailed` - 200 OK (comprehensive health data)  
✅ `/health/metrics` - 200 OK (metrics and memory usage)  
✅ `/ready` - 200 OK (readiness status)

**Key Learning**: In Express, routes must be mounted BEFORE catch-all 404 handlers. Middleware order is critical.

## Regression Prevention Checklist
Before making any changes:
1. Read ARCHITECTURE.md for constraints
2. Check FIXES.md for related resolved issues
3. Run tests to verify current state
4. Make minimal, targeted changes
5. Test immediately after changes
6. **NEW**: Verify Express middleware order - routes before 404 handlers
