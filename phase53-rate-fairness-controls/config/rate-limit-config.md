# Phase 53 — Configuration Implementation

## Minimal, Deterministic Rate Limit Configuration

### Core Configuration System
```typescript
import { z } from 'zod';
import { EventEmitter } from 'events';

/**
 * Minimal, deterministic configuration for rate limiting and fairness
 * Copy-exact implementation per specification
 */
export class RateLimitConfiguration extends EventEmitter {
  private config: RateLimitConfig;
  private readonly validator: ConfigValidator;
  private configVersion = 1;

  constructor(initialConfig?: Partial<RateLimitConfig>) {
    super();
    this.validator = new ConfigValidator();
    this.config = this.mergeWithDefaults(initialConfig || {});
    
    // Validate initial configuration
    this.validateConfig();
  }

  /**
   * Get current configuration
   */
  getConfig(): RateLimitConfig {
    return { ...this.config };
  }

  /**
   * Update configuration with validation
   */
  updateConfig(updates: Partial<RateLimitConfig>): void {
    const newConfig = this.mergeWithDefaults(updates);
    
    // Validate new configuration
    this.validator.validate(newConfig);
    
    const oldConfig = { ...this.config };
    this.config = newConfig;
    this.configVersion++;
    
    this.emit('config_updated', {
      oldConfig,
      newConfig,
      version: this.configVersion,
      timestamp: Date.now()
    });
  }

  /**
   * Get tenant-specific configuration
   */
  getTenantConfig(tier: TenantTier): TenantRateLimitConfig {
    return this.config.tiers[tier];
  }

  /**
   * Get scheduler configuration
   */
  getSchedulerConfig(): SchedulerConfig {
    return this.config.scheduler;
  }

  /**
   * Get cache configuration
   */
  getCacheConfig(): CacheConfig {
    return this.config.cache;
  }

  /**
   * Get abuse detection configuration
   */
  getAbuseConfig(): AbuseConfig {
    return this.config.abuse;
  }

  /**
   * Hot reload configuration from external source
   */
  async hotReload(): Promise<void> {
    try {
      // In a real implementation, load from external source
      // For now, simulate reload
      const externalConfig = await this.loadExternalConfig();
      
      if (this.hasConfigChanged(externalConfig)) {
        this.updateConfig(externalConfig);
        console.log('Configuration hot-reloaded successfully');
      }
    } catch (error) {
      console.error('Hot reload failed:', error);
      this.emit('hot_reload_failed', error);
    }
  }

  private mergeWithDefaults(partial: Partial<RateLimitConfig>): RateLimitConfig {
    return {
      ratelimit: {
        tenant_default: {
          steady_rps: partial.ratelimit?.tenant_default?.steady_rps || DEFAULT_RATE_LIMIT_CONFIG.ratelimit.tenant_default.steady_rps,
          burst_tokens: partial.ratelimit?.tenant_default?.burst_tokens || DEFAULT_RATE_LIMIT_CONFIG.ratelimit.tenant_default.burst_tokens
        },
        global_pool: {
          steady_rps: partial.ratelimit?.global_pool?.steady_rps || DEFAULT_RATE_LIMIT_CONFIG.ratelimit.global_pool.steady_rps,
          burst_tokens: partial.ratelimit?.global_pool?.burst_tokens || DEFAULT_RATE_LIMIT_CONFIG.ratelimit.global_pool.burst_tokens
        },
        tiers: {
          starter: partial.ratelimit?.tiers?.starter || DEFAULT_RATE_LIMIT_CONFIG.ratelimit.tiers.starter,
          growth: partial.ratelimit?.tiers?.growth || DEFAULT_RATE_LIMIT_CONFIG.ratelimit.tiers.growth,
          scale: partial.ratelimit?.tiers?.scale || DEFAULT_RATE_LIMIT_CONFIG.ratelimit.tiers.scale
        }
      },
      scheduler: {
        kind: partial.scheduler?.kind || DEFAULT_RATE_LIMIT_CONFIG.scheduler.kind,
        quantum_by_tier: {
          starter: partial.scheduler?.quantum_by_tier?.starter || DEFAULT_RATE_LIMIT_CONFIG.scheduler.quantum_by_tier.starter,
          growth: partial.scheduler?.quantum_by_tier?.growth || DEFAULT_RATE_LIMIT_CONFIG.scheduler.quantum_by_tier.growth,
          scale: partial.scheduler?.quantum_by_tier?.scale || DEFAULT_RATE_LIMIT_CONFIG.scheduler.quantum_by_tier.scale
        }
      },
      cache: {
        verify_ttl: partial.cache?.verify_ttl || DEFAULT_RATE_LIMIT_CONFIG.cache.verify_ttl,
        stale_while_revalidate: partial.cache?.stale_while_revalidate || DEFAULT_RATE_LIMIT_CONFIG.cache.stale_while_revalidate,
        key: partial.cache?.key || DEFAULT_RATE_LIMIT_CONFIG.cache.key
      },
      abuse: {
        free_anonymous: partial.abuse?.free_anonymous || DEFAULT_RATE_LIMIT_CONFIG.abuse.free_anonymous,
        read_only_mode_threshold: partial.abuse?.read_only_mode_threshold || DEFAULT_RATE_LIMIT_CONFIG.abuse.read_only_mode_threshold
      }
    };
  }

  private validateConfig(): void {
    this.validator.validate(this.config);
  }

  private async loadExternalConfig(): Promise<Partial<RateLimitConfig>> {
    // In a real implementation, load from Redis, file, or API
    // For now, return empty to simulate no changes
    return {};
  }

  private hasConfigChanged(externalConfig: Partial<RateLimitConfig>): boolean {
    // Compare current config with external config
    return JSON.stringify(this.config) !== JSON.stringify(this.mergeWithDefaults(externalConfig));
  }
}

/**
 * Configuration validator with Zod schemas
 */
export class ConfigValidator {
  private readonly rateLimitSchema = z.object({
    ratelimit: z.object({
      tenant_default: z.object({
        steady_rps: z.number().min(1).max(10000),
        burst_tokens: z.number().min(1).max(50000)
      }),
      global_pool: z.object({
        steady_rps: z.number().min(1000).max(100000),
        burst_tokens: z.number().min(1000).max(100000)
      }),
      tiers: z.object({
        starter: z.object({
          weight: z.number().min(0.1).max(10)
        }),
        growth: z.object({
          weight: z.number().min(0.1).max(10)
        }),
        scale: z.object({
          weight: z.number().min(0.1).max(10)
        })
      })
    }),
    scheduler: z.object({
      kind: z.enum(['DRR']),
      quantum_by_tier: z.object({
        starter: z.number().min(1).max(100),
        growth: z.number().min(1).max(100),
        scale: z.number().min(1).max(100)
      })
    }),
    cache: z.object({
      verify_ttl: z.number().min(30).max(3600), // 30s - 1h
      stale_while_revalidate: z.number().min(10).max(300), // 10s - 5m
      key: z.string().regex(/^\{asset_hash\}:\{policy_id\}$/)
    }),
    abuse: z.object({
      free_anonymous: z.enum(['cache_only']),
      read_only_mode_threshold: z.enum(['daily_spend_cap'])
    })
  });

  validate(config: RateLimitConfig): void {
    try {
      this.rateLimitSchema.parse(config);
    } catch (error) {
      throw new Error(`Configuration validation failed: ${error.message}`);
    }

    // Additional cross-field validation
    this.validateCrossFieldConstraints(config);
  }

  private validateCrossFieldConstraints(config: RateLimitConfig): void {
    // Ensure global pool is larger than any single tenant
    const maxTenantRps = Math.max(
      ...Object.values(config.ratelimit.tiers).map(tier => 
        config.ratelimit.tenant_default.steady_rps * tier.weight
      )
    );

    if (config.ratelimit.global_pool.steady_rps <= maxTenantRps) {
      throw new Error('Global pool steady RPS must be larger than max tenant RPS');
    }

    // Ensure quantum values are proportional to weights
    const starterWeight = config.ratelimit.tiers.starter.weight;
    const starterQuantum = config.scheduler.quantum_by_tier.starter;
    
    for (const [tier, tierConfig] of Object.entries(config.ratelimit.tiers)) {
      const expectedQuantum = Math.round(starterQuantum * (tierConfig.weight / starterWeight));
      const actualQuantum = config.scheduler.quantum_by_tier[tier as TenantTier];
      
      if (Math.abs(actualQuantum - expectedQuantum) > 2) {
        throw new Error(`Quantum for ${tier} tier should be approximately ${expectedQuantum} based on weight ratio`);
      }
    }

    // Ensure cache TTL is reasonable
    if (config.cache.verify_ttl <= config.cache.stale_while_revalidate) {
      throw new Error('Cache TTL must be greater than stale-while-revalidate period');
    }
  }
}

/**
 * Configuration provider for different environments
 */
export class ConfigurationProvider {
  private static instance: ConfigurationProvider;
  private config: RateLimitConfiguration;

  private constructor() {
    const env = process.env.NODE_ENV || 'development';
    const config = this.loadConfigForEnvironment(env);
    this.config = new RateLimitConfiguration(config);
  }

  static getInstance(): ConfigurationProvider {
    if (!ConfigurationProvider.instance) {
      ConfigurationProvider.instance = new ConfigurationProvider();
    }
    return ConfigurationProvider.instance;
  }

  getConfiguration(): RateLimitConfiguration {
    return this.config;
  }

  private loadConfigForEnvironment(env: string): Partial<RateLimitConfig> {
    switch (env) {
      case 'production':
        return this.getProductionConfig();
      case 'staging':
        return this.getStagingConfig();
      case 'development':
      default:
        return this.getDevelopmentConfig();
    }
  }

  private getProductionConfig(): Partial<RateLimitConfig> {
    return {
      ratelimit: {
        tenant_default: {
          steady_rps: 300,
          burst_tokens: 1200
        },
        global_pool: {
          steady_rps: 50000,
          burst_tokens: 50000
        }
      },
      cache: {
        verify_ttl: 60,
        stale_while_revalidate: 30
      }
    };
  }

  private getStagingConfig(): Partial<RateLimitConfig> {
    return {
      ratelimit: {
        tenant_default: {
          steady_rps: 150,
          burst_tokens: 600
        },
        global_pool: {
          steady_rps: 10000,
          burst_tokens: 10000
        }
      },
      cache: {
        verify_ttl: 30,
        stale_while_revalidate: 15
      }
    };
  }

  private getDevelopmentConfig(): Partial<RateLimitConfig> {
    return {
      ratelimit: {
        tenant_default: {
          steady_rps: 50,
          burst_tokens: 200
        },
        global_pool: {
          steady_rps: 1000,
          burst_tokens: 1000
        }
      },
      cache: {
        verify_ttl: 10,
        stale_while_revalidate: 5
      }
    };
  }
}

/**
 * Configuration exporter/importer for backup and restore
 */
export class ConfigurationManager {
  constructor(private config: RateLimitConfiguration) {}

  /**
   * Export configuration to JSON
   */
  exportConfig(): ConfigExport {
    const currentConfig = this.config.getConfig();
    
    return {
      version: 1,
      timestamp: Date.now(),
      config: currentConfig,
      checksum: this.calculateChecksum(currentConfig)
    };
  }

  /**
   * Import configuration from JSON
   */
  async importConfig(configExport: ConfigExport): Promise<void> {
    // Validate export format
    this.validateExport(configExport);
    
    // Verify checksum
    const calculatedChecksum = this.calculateChecksum(configExport.config);
    if (calculatedChecksum !== configExport.checksum) {
      throw new Error('Configuration checksum mismatch - data may be corrupted');
    }
    
    // Apply configuration
    this.config.updateConfig(configExport.config);
    
    console.log(`Configuration imported successfully (version ${configExport.version})`);
  }

  /**
   * Create configuration snapshot
   */
  createSnapshot(label: string): ConfigSnapshot {
    const configExport = this.exportConfig();
    
    return {
      label,
      export: configExport,
      appliedAt: Date.now()
    };
  }

  /**
   * Restore configuration from snapshot
   */
  async restoreFromSnapshot(snapshot: ConfigSnapshot): Promise<void> {
    console.log(`Restoring configuration from snapshot: ${snapshot.label}`);
    await this.importConfig(snapshot.export);
  }

  private validateExport(configExport: ConfigExport): void {
    if (!configExport.version || !configExport.timestamp || !configExport.config) {
      throw new Error('Invalid configuration export format');
    }
    
    if (configExport.version > 1) {
      throw new Error('Unsupported configuration version');
    }
  }

  private calculateChecksum(config: RateLimitConfig): string {
    // Simple checksum calculation
    const configString = JSON.stringify(config, Object.keys(config).sort());
    return require('crypto').createHash('sha256').update(configString).digest('hex').substring(0, 16);
  }
}

// Type definitions
export interface RateLimitConfig {
  ratelimit: {
    tenant_default: {
      steady_rps: number;
      burst_tokens: number;
    };
    global_pool: {
      steady_rps: number;
      burst_tokens: number;
    };
    tiers: {
      starter: { weight: number };
      growth: { weight: number };
      scale: { weight: number };
    };
  };
  scheduler: {
    kind: 'DRR';
    quantum_by_tier: {
      starter: number;
      growth: number;
      scale: number;
    };
  };
  cache: {
    verify_ttl: number;
    stale_while_revalidate: number;
    key: string;
  };
  abuse: {
    free_anonymous: 'cache_only';
    read_only_mode_threshold: 'daily_spend_cap';
  };
}

export interface TenantRateLimitConfig {
  steady_rps: number;
  burst_tokens: number;
  weight: number;
}

export interface SchedulerConfig {
  kind: 'DRR';
  quantum_by_tier: {
    starter: number;
    growth: number;
    scale: number;
  };
}

export interface CacheConfig {
  verify_ttl: number;
  stale_while_revalidate: number;
  key: string;
}

export interface AbuseConfig {
  free_anonymous: 'cache_only';
  read_only_mode_threshold: 'daily_spend_cap';
}

export type TenantTier = 'starter' | 'growth' | 'scale';

export interface ConfigExport {
  version: number;
  timestamp: number;
  config: RateLimitConfig;
  checksum: string;
}

export interface ConfigSnapshot {
  label: string;
  export: ConfigExport;
  appliedAt: number;
}

// Default configuration (copy-exact per specification)
export const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  ratelimit: {
    tenant_default: {
      steady_rps: 300,
      burst_tokens: 1200
    },
    global_pool: {
      steady_rps: 50000,
      burst_tokens: 50000
    },
    tiers: {
      starter: { weight: 1.0 },
      growth: { weight: 1.2 },
      scale: { weight: 2.0 }
    }
  },
  scheduler: {
    kind: 'DRR',
    quantum_by_tier: {
      starter: 20,
      growth: 24,
      scale: 40
    }
  },
  cache: {
    verify_ttl: 60,
    stale_while_revalidate: 30,
    key: '{asset_hash}:{policy_id}'
  },
  abuse: {
    free_anonymous: 'cache_only',
    read_only_mode_threshold: 'daily_spend_cap'
  }
};

/**
 * Environment-specific configuration overrides
 */
export const ENVIRONMENT_OVERRIDES: Record<string, Partial<RateLimitConfig>> = {
  production: {
    ratelimit: {
      tenant_default: {
        steady_rps: 300,
        burst_tokens: 1200
      },
      global_pool: {
        steady_rps: 50000,
        burst_tokens: 50000
      }
    }
  },
  staging: {
    ratelimit: {
      tenant_default: {
        steady_rps: 150,
        burst_tokens: 600
      },
      global_pool: {
        steady_rps: 10000,
        burst_tokens: 10000
      }
    }
  },
  development: {
    ratelimit: {
      tenant_default: {
        steady_rps: 50,
        burst_tokens: 200
      },
      global_pool: {
        steady_rps: 1000,
        burst_tokens: 1000
      }
    }
  }
};
```
