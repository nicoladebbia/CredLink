# Authentication & Authorization Codemap

## Scope
API key authentication, RBAC system, and security monitoring infrastructure

## Main Components

### API Key Authentication (apps/api/src/middleware/auth.ts)
- **Implementation**: ApiKeyAuth class with multi-source key loading
- **Key sources priority**: AWS Secrets Manager → mounted file → environment variables
- **Security warnings**: Extensive comments about env var insecurity in production
- **Key format**: `key:client:Name` comma-separated, supports Bearer and X-API-Key headers
- **Initialization**: Async loading with waitForInitialization() method
- **Integration**: Optional via ENABLE_API_KEY_AUTH environment variable

### Security Monitor (packages/security-monitor)
- **Event tracking**: Comprehensive SecurityEvent interface with 8 event types
- **Threat detection**: Suspicious input patterns, anomaly detection, rate limiting alerts
- **Pattern matching**: 17 suspicious patterns including XSS, SQLi, path traversal
- **Metrics**: Event aggregation by type/severity, configurable retention
- **Alerting**: Console-based alerts for brute force and DDoS detection
- **Cleanup**: Automatic event cleanup with hourly intervals

### RBAC System (packages/rbac)
- **Role hierarchy**: 7 built-in roles from super_admin to viewer
- **Permission model**: verb:resource pattern with wildcard support
- **Organization isolation**: Enforced org_id matching for resource access
- **Role inheritance**: Supported but not implemented in built-in roles
- **Validation**: Comprehensive input validation with detailed error messages
- **Storage**: In-memory RoleStore (not production-ready)

## Key Flows

### Authentication Flow
1. Request → extract API key (Bearer/X-API-Key) → validate against loaded keys
2. Attach clientId/apiKey to request → continue to route handlers
3. Security monitor logs failed attempts with IP/context

### Authorization Flow (RBAC)
1. Subject validation (user_id, org_id, roles) → action validation (verb, resource)
2. Organization boundary check → role permission matching
3. Return CheckResult with allow/deny and detailed reasoning

### Security Monitoring Flow
1. Event recording → metric aggregation → alert condition checking
2. Suspicious input detection → pattern matching → security event creation
3. Anomaly detection → risk scoring → automated alerting

## Obvious Risks & Weirdness

### Critical Security Issues
1. **In-memory role storage** - RoleStore uses Map, no persistence (packages/rbac/src/rbac.ts:90-111)
2. **Hardcoded security patterns** - 17 patterns embedded in security-monitor (packages/security-monitor/src/index.ts:138-157)
3. **Console-only alerting** - Security alerts only logged to console (packages/security-monitor/src/index.ts:354-367)
4. **Sync file operations** - Certificate loading blocks requests (apps/api/src/routes/verify.ts:311-313)

### Architectural Concerns
1. **No session management** - API key auth is stateless, no revocation mechanism
2. **Missing audit trail** - RBAC decisions not logged for compliance
3. **Single security monitor instance** - Global singleton, not multi-tenant aware
4. **No rate limit per API key** - Rate limiting only by IP, not by authenticated client

### Production Readiness Issues
1. **Development role store** - Comment admits database backing needed (packages/rbac/src/rbac.ts:88)
2. **Env var key loading** - Despite security warnings, still supported as fallback
3. **No API key rotation** - No mechanism to rotate or expire API keys
4. **Missing RBAC middleware** - RBAC system exists but no Express middleware integration

### Performance & Reliability
1. **Synchronous pattern matching** - 17 regex patterns tested sequentially
2. **Memory leak potential** - Events stored in arrays with only hourly cleanup
3. **No circuit breaking** - Security monitor continues processing even when overloaded
4. **Single point of failure** - If security monitor fails, entire auth system affected

## Evidence
- API key auth: apps/api/src/middleware/auth.ts:41-142 (key loading), 166-210 (validation)
- Security monitor: packages/security-monitor/src/index.ts:133-189 (input detection), 303-346 (alerting)
- RBAC implementation: packages/rbac/src/rbac.ts:126-217 (permission checking), 12-85 (built-in roles)
- Role storage issue: packages/rbac/src/rbac.ts:88-89 (comment about database backing)
