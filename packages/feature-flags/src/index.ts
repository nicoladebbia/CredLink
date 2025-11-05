/**
 * Feature Flags System - Phase 46
 * Short-lived flags for risky changes with tenant and route targeting
 * 
 * Design principles:
 * - Flags are NOT permanent config (must have expiry)
 * - Default off for new risky features
 * - Support tenant and route targeting
 * - Flags add complexity - keep disciplined
 */

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  description: string;
  createdAt: Date;
  expiresAt: Date;
  owner: string;
  targeting?: {
    tenants?: string[];
    routes?: string[];
    percentage?: number;
  };
}

export interface FlagStore {
  get(key: string): Promise<FeatureFlag | null>;
  set(flag: FeatureFlag): Promise<void>;
  delete(key: string): Promise<void>;
  list(): Promise<FeatureFlag[]>;
  listExpired(): Promise<FeatureFlag[]>;
}

/**
 * In-memory flag store (for testing)
 * In production, use KV, Redis, or database
 */
export class MemoryFlagStore implements FlagStore {
  private flags: Map<string, FeatureFlag> = new Map();

  async get(key: string): Promise<FeatureFlag | null> {
    const flag = this.flags.get(key);
    if (!flag) return null;
    
    // Check expiry
    if (new Date() > flag.expiresAt) {
      console.warn(`Flag '${key}' has expired and should be removed`);
      return null;
    }
    
    return flag;
  }

  async set(flag: FeatureFlag): Promise<void> {
    this.flags.set(flag.key, flag);
  }

  async delete(key: string): Promise<void> {
    this.flags.delete(key);
  }

  async list(): Promise<FeatureFlag[]> {
    return Array.from(this.flags.values());
  }

  async listExpired(): Promise<FeatureFlag[]> {
    const now = new Date();
    return Array.from(this.flags.values()).filter(flag => now > flag.expiresAt);
  }
}

/**
 * Feature flag client
 */
export class FeatureFlagClient {
  constructor(private store: FlagStore) {}

  /**
   * Check if a feature is enabled for a given context
   */
  async isEnabled(
    key: string,
    context?: {
      tenant?: string;
      route?: string;
      userId?: string;
    }
  ): Promise<boolean> {
    const flag = await this.store.get(key);
    
    // Flag doesn't exist or expired = disabled
    if (!flag) return false;
    
    // Global flag state
    if (!flag.enabled) return false;
    
    // No targeting = enabled for all
    if (!flag.targeting) return true;
    
    // Tenant targeting
    if (flag.targeting.tenants && context?.tenant) {
      if (!flag.targeting.tenants.includes(context.tenant)) {
        return false;
      }
    }
    
    // Route targeting
    if (flag.targeting.routes && context?.route) {
      if (!flag.targeting.routes.includes(context.route)) {
        return false;
      }
    }
    
    // Percentage rollout (simple hash-based)
    if (flag.targeting.percentage !== undefined) {
      const identifier = context?.userId || context?.tenant || 'anonymous';
      const hash = this.simpleHash(identifier + key);
      const bucket = hash % 100;
      return bucket < flag.targeting.percentage;
    }
    
    return true;
  }

  /**
   * Create a new feature flag
   */
  async createFlag(
    key: string,
    options: {
      description: string;
      owner: string;
      expiresInDays: number;
      enabled?: boolean;
      targeting?: FeatureFlag['targeting'];
    }
  ): Promise<FeatureFlag> {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + options.expiresInDays * 24 * 60 * 60 * 1000);
    
    const flag: FeatureFlag = {
      key,
      enabled: options.enabled ?? false,
      description: options.description,
      createdAt: now,
      expiresAt,
      owner: options.owner,
      targeting: options.targeting,
    };
    
    await this.store.set(flag);
    return flag;
  }

  /**
   * Enable a feature flag
   */
  async enable(key: string): Promise<void> {
    const flag = await this.store.get(key);
    if (!flag) throw new Error(`Flag '${key}' not found`);
    
    flag.enabled = true;
    await this.store.set(flag);
  }

  /**
   * Disable a feature flag
   */
  async disable(key: string): Promise<void> {
    const flag = await this.store.get(key);
    if (!flag) throw new Error(`Flag '${key}' not found`);
    
    flag.enabled = false;
    await this.store.set(flag);
  }

  /**
   * Delete a feature flag (cleanup)
   */
  async deleteFlag(key: string): Promise<void> {
    await this.store.delete(key);
  }

  /**
   * List all feature flags
   */
  async listFlags(): Promise<FeatureFlag[]> {
    return this.store.list();
  }

  /**
   * Audit expired flags (should be cleaned up)
   */
  async auditExpiredFlags(): Promise<FeatureFlag[]> {
    return this.store.listExpired();
  }

  /**
   * Simple hash function for percentage rollout
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

/**
 * Example usage:
 * 
 * const store = new MemoryFlagStore();
 * const client = new FeatureFlagClient(store);
 * 
 * // Create a flag for a risky feature
 * await client.createFlag('new-signing-algorithm', {
 *   description: 'Enable new C2PA signing algorithm',
 *   owner: 'security-team',
 *   expiresInDays: 30,
 *   enabled: true,
 *   targeting: {
 *     tenants: ['acme-corp-staging'],
 *     percentage: 5
 *   }
 * });
 * 
 * // Check if enabled for a request
 * const enabled = await client.isEnabled('new-signing-algorithm', {
 *   tenant: 'acme-corp-staging',
 *   route: '/api/sign'
 * });
 * 
 * if (enabled) {
 *   // Use new signing algorithm
 * } else {
 *   // Use existing algorithm
 * }
 */

// Export singleton for convenience
let defaultClient: FeatureFlagClient | null = null;

export function getFeatureFlagClient(store?: FlagStore): FeatureFlagClient {
  if (!defaultClient) {
    defaultClient = new FeatureFlagClient(store || new MemoryFlagStore());
  }
  return defaultClient;
}
