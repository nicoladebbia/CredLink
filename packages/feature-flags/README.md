# Feature Flags - Phase 46

Short-lived feature flags for risky changes with tenant and route targeting.

## Design Principles

- **Flags are NOT permanent config** - All flags must have expiry dates
- **Default off** - New risky features start disabled
- **Disciplined** - Flags add complexity; remove within one release train
- **Targeted** - Support tenant, route, and percentage-based rollout

## Usage

```typescript
import { FeatureFlagClient, MemoryFlagStore } from '@c2/feature-flags';

// Initialize
const store = new MemoryFlagStore();
const client = new FeatureFlagClient(store);

// Create a flag for a risky feature
await client.createFlag('new-verification-engine', {
  description: 'Enable experimental C2PA verification engine',
  owner: 'c2pa-team',
  expiresInDays: 30,
  enabled: true,
  targeting: {
    tenants: ['pilot-customer-1', 'internal-testing'],
    percentage: 10  // Gradual rollout to 10% of traffic
  }
});

// Check if enabled in request handler
const enabled = await client.isEnabled('new-verification-engine', {
  tenant: req.headers['x-tenant-id'],
  route: req.path,
  userId: req.user.id
});

if (enabled) {
  // Use new verification engine
  return newVerificationEngine.verify(asset);
} else {
  // Use existing engine
  return legacyVerificationEngine.verify(asset);
}
```

## Flag Lifecycle

1. **Create** - Flag starts disabled by default
2. **Enable** - Turn on for specific tenants/routes/percentage
3. **Expand** - Gradually increase rollout percentage
4. **Promote** - Feature becomes default behavior (remove flag)
5. **Cleanup** - Delete flag within one release train

## Flag Expiry Policy

All flags MUST have an expiry date. Flags without clear removal plans create technical debt.

- **Maximum lifetime**: 90 days
- **Target lifetime**: 30 days (one release train)
- **Audit expired flags**: Run `client.auditExpiredFlags()` weekly

## Production Store

In production, use Cloudflare KV or similar:

```typescript
import { FeatureFlagClient } from '@c2/feature-flags';
import { KVFlagStore } from '@c2/feature-flags/kv';

const store = new KVFlagStore(env.FEATURE_FLAGS_KV);
const client = new FeatureFlagClient(store);
```

## Kill Switch Pattern

For emergency rollback of risky features:

```typescript
// Immediately disable a problematic feature
await client.disable('new-verification-engine');

// Or delete it entirely
await client.deleteFlag('new-verification-engine');
```

## Best Practices

1. **Use flags sparingly** - Only for genuinely risky changes
2. **Name clearly** - `enable-new-signing-v2`, not `flag1`
3. **Document owner** - Every flag has a team responsible
4. **Set expiry** - No exceptions, even for "permanent" features
5. **Clean up promptly** - Remove flags after feature stabilizes
6. **Audit regularly** - Track flag debt and expired flags

## Anti-Patterns to Avoid

❌ Using flags for configuration (use env vars instead)  
❌ Permanent flags (defeats the purpose)  
❌ Nested flags (creates combinatorial complexity)  
❌ Flags without expiry dates  
❌ Forgetting to remove flags after rollout

## References

- Martin Fowler: [Feature Toggles](https://martinfowler.com/articles/feature-toggles.html)
- Phase 46: CI/CD Enterprise-Grade specification
