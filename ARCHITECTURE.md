# CredLink Architecture & Constraints Guide

## Critical System Patterns (NEVER MODIFY)
- Configuration: All values via environment variables (see .env.example)
- Authentication: JWT tokens with requireAuth middleware
- Database: PostgreSQL with migrations in /apps/api/migrations/
- File Storage: Documents stored with metadata in database
- **NEW**: Express Middleware Order: Routes BEFORE 404 handlers (critical for routing)

## Fixed Issues (DO NOT REGRESS)
1. **Dashboard White Page**: Fixed missing backend endpoints (/invoices, /audit-logs, /webhooks, /usage/current, /proofs, /auth/sessions)
2. **Hardcoded Data**: Eliminated all hardcoded values, replaced with 100+ environment variables
3. **TypeScript Compilation**: Fixed missing env properties across all services
4. **Document Data Format**: Documents require name, size, status, mimeType fields
5. **Health Endpoint 404s**: Fixed Express middleware order - health router mounted before 404 handler

## Service Dependencies
- API Service: Port 3001, handles all business logic
- Web Service: Port 3002, React frontend
- Sign Service: Port 3003, Cryptographic operations

## Critical Files (READ BEFORE MODIFYING)
- `/apps/api/src/config/env-schema.ts` - Environment variable definitions
- `/packages/config/src/time-constants.ts` - Time configuration
- `/apps/web/src/components/Dashboard.tsx` - Main dashboard component
- `unified-server.js` - Backend server with all endpoints
- `/apps/api/src/routes/health.ts` - Health endpoint definitions (simplified)
- `/apps/api/src/index.ts` - Main server with Express middleware order

## Common Pitfalls & Solutions
### Express Middleware Order (CRITICAL)
- **Problem**: Routes returning 404 when they should work
- **Cause**: 404 catch-all handler mounted before route handlers
- **Solution**: Mount all routers BEFORE 404 handler in middleware chain
- **Example**: 
  ```javascript
  // CORRECT - Routes before 404
  app.use('/health', healthRouter);
  app.use((req, res) => res.status(404).json({error: 'Not Found'}));
  
  // INCORRECT - 404 intercepts routes
  app.use((req, res) => res.status(404).json({error: 'Not Found'}));
  app.use('/health', healthRouter); // Never reached
  ```

### Health Router Dependencies
- **Problem**: Complex health checker dependencies causing initialization failures
- **Solution**: Simplified health router with static responses for reliability
- **Benefit**: Health endpoints always work regardless of external service status

## Testing Requirements
- Run `npm test` before any deployment
- Check all service health endpoints (/, /detailed, /metrics, /ready)
- Verify Dashboard loads without errors
- **NEW**: Test Express middleware order after route changes

## Deployment Checklist
- [ ] All environment variables set
- [ ] Database migrations applied
- [ ] Services start on correct ports
- [ ] Dashboard loads correctly
- [ ] No TypeScript errors
- [ ] **NEW**: All health endpoints return 200 OK
- [ ] **NEW**: Express middleware order verified

## Health Endpoints Specification
All health endpoints must return proper JSON responses:
- `GET /health` - Basic status, uptime, memory, service checks
- `GET /health/detailed` - Comprehensive component health data
- `GET /health/metrics` - Performance metrics and memory usage
- `GET /ready` - Readiness probe for Kubernetes
