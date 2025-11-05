# Operations Tools - Phase 46

Deployment automation and canary management tools for CI/CD pipeline.

## Scripts

### `canary_route.js`
Routes traffic percentage to canary Worker version.

**Usage**:
```bash
node canary_route.js --percentage 5 --version <sha>
```

**Environment variables**:
- `CLOUDFLARE_API_TOKEN` (required)
- `CLOUDFLARE_ACCOUNT_ID` (optional)
- `CLOUDFLARE_WORKER_NAME` (optional)

### `canary_check.sh`
Monitors canary deployment during bake period.

**Usage**:
```bash
./canary_check.sh --duration 600 --version <sha>
```

**Exit codes**:
- `0` = Canary approved (metrics acceptable)
- `1` = Canary rejected (rollback recommended)

### `canary_evaluate.js`
Evaluates canary metrics against control group.

**Usage**:
```bash
node canary_evaluate.js --version <sha>
```

### `canary_rollback.js`
Emergency rollback of canary deployment.

**Usage**:
```bash
node canary_rollback.js
```

## Workflow Integration

These scripts are called by `.github/workflows/cd-phase46.yml`:

1. **Deploy canary** → `canary_route.js --percentage 5`
2. **Bake period** → `canary_check.sh --duration 600`
3. **Evaluate** → `canary_evaluate.js`
4. **Abort (if needed)** → `canary_rollback.js`
5. **Promote** → `canary_route.js --percentage 100`

## Development

Run locally against staging:
```bash
export CLOUDFLARE_API_TOKEN="your-token"
export CANARY_ENDPOINT="https://staging.c2concierge.dev"

# Test canary routing
node canary_route.js --percentage 5 --version test-123

# Test evaluation
node canary_evaluate.js --version test-123
```

## Production

All scripts are executed via GitHub Actions with appropriate secrets and environment configuration.
