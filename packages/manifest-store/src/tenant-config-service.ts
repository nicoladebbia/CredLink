// Phase 21.10 Per-Tenant Configuration Knobs
// Replication mode, failover policy, and queue budget management

export interface TenantDRConfig {
  tenant_id: string;
  replication_mode: 'strict' | 'async' | 'eventual';
  failover_policy: 'immediate' | 'graceful' | 'manual';
  queue_budget: {
    max_queue_size: number;
    max_replication_lag_seconds: number;
    priority: 'low' | 'medium' | 'high';
  };
  consistency_requirements: {
    consistency_percentage_threshold: number;
    auto_repair_enabled: boolean;
    repair_strategy: 'primary_wins' | 'secondary_wins' | 'latest_wins';
  };
  performance_tuning: {
    cache_ttl_seconds: number;
    batch_size: number;
    retry_attempts: number;
    timeout_seconds: number;
  };
  notification_settings: {
    alert_on_failover: boolean;
    alert_on_consistency_mismatch: boolean;
    alert_on_queue_overflow: boolean;
    webhook_urls: string[];
  };
  created_at: string;
  updated_at: string;
}

export interface TenantConfigUpdate {
  replication_mode?: 'strict' | 'async' | 'eventual';
  failover_policy?: 'immediate' | 'graceful' | 'manual';
  queue_budget?: {
    max_queue_size?: number;
    max_replication_lag_seconds?: number;
    priority?: 'low' | 'medium' | 'high';
  };
  consistency_requirements?: {
    consistency_percentage_threshold?: number;
    auto_repair_enabled?: boolean;
    repair_strategy?: 'primary_wins' | 'secondary_wins' | 'latest_wins';
  };
  performance_tuning?: {
    cache_ttl_seconds?: number;
    batch_size?: number;
    retry_attempts?: number;
    timeout_seconds?: number;
  };
  notification_settings?: {
    alert_on_failover?: boolean;
    alert_on_consistency_mismatch?: boolean;
    alert_on_queue_overflow?: boolean;
    webhook_urls?: string[];
  };
}

export class TenantConfigService {
  private configs: Map<string, TenantDRConfig> = new Map();
  private defaultConfig: TenantDRConfig;
  
  private readonly MAX_TENANT_ID_LENGTH = 100;
  private readonly MAX_WEBHOOK_URLS = 10;
  private readonly MAX_WEBHOOK_URL_LENGTH = 500;
  private readonly MAX_QUEUE_SIZE = 10000;
  private readonly MAX_REPLICATION_LAG = 86400; // 24 hours
  private readonly MAX_CACHE_TTL = 86400; // 24 hours
  private readonly MAX_BATCH_SIZE = 1000;
  private readonly MAX_RETRY_ATTEMPTS = 10;
  private readonly MAX_TIMEOUT = 3600; // 1 hour
  private readonly VALID_REPLICATION_MODES = ['strict', 'async', 'eventual'];
  private readonly VALID_FAILOVER_POLICIES = ['immediate', 'graceful', 'manual'];
  private readonly VALID_PRIORITIES = ['low', 'medium', 'high'];
  private readonly VALID_REPAIR_STRATEGIES = ['primary_wins', 'secondary_wins', 'latest_wins'];
  private readonly ALLOWED_WEBHOOK_PROTOCOLS = ['https:', 'http:'];

  constructor() {
    this.defaultConfig = this.createDefaultConfig();
    this.initializeDefaultConfigs();
  }

  private sanitizeError(error: string): string {
    if (!error) return 'Unknown error';
    return error.substring(0, 200).replace(/[<>\"']/g, '');
  }

  private sanitizeTenantId(tenantId: string): string {
    if (!tenantId) return '';
    return tenantId.substring(0, this.MAX_TENANT_ID_LENGTH).replace(/[<>\"']/g, '');
  }

  private validateTenantId(tenantId: string): boolean {
    return !!tenantId && 
           tenantId.length > 0 && 
           tenantId.length <= this.MAX_TENANT_ID_LENGTH &&
           /^[a-zA-Z0-9_-]+$/.test(tenantId);
  }

  private isValidWebhookUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return this.ALLOWED_WEBHOOK_PROTOCOLS.includes(parsed.protocol) &&
             url.length <= this.MAX_WEBHOOK_URL_LENGTH;
    } catch {
      return false;
    }
  }

  private validateNumber(value: number, min: number, max: number): boolean {
    return Number.isInteger(value) && value >= min && value <= max;
  }

  /**
   * Get tenant DR configuration
   */
  getTenantConfig(tenantId: string): TenantDRConfig {
    try {
      // Validate tenant ID
      if (!this.validateTenantId(tenantId)) {
        throw new Error('Invalid tenant ID format');
      }

      const config = this.configs.get(tenantId);
      if (!config) {
        console.warn(`Tenant ${this.sanitizeTenantId(tenantId)} not found, using default config`);
        return { ...this.defaultConfig, tenant_id: this.sanitizeTenantId(tenantId) };
      }
      return config;
    } catch (error) {
      throw new Error(`Failed to get tenant config: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
    }
  }

  /**
   * Update tenant DR configuration
   */
  async updateTenantConfig(tenantId: string, update: TenantConfigUpdate): Promise<{
    success: boolean;
    config?: TenantDRConfig;
    error?: string;
  }> {
    try {
      // Validate tenant ID
      if (!this.validateTenantId(tenantId)) {
        return { success: false, error: 'Invalid tenant ID format' };
      }

      const existingConfig = this.getTenantConfig(tenantId);
      const updatedConfig = this.mergeConfigUpdate(existingConfig, update);
      
      // Validate configuration
      const validation = this.validateConfig(updatedConfig);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.error
        };
      }

      // Store updated configuration
      updatedConfig.updated_at = new Date().toISOString();
      this.configs.set(tenantId, updatedConfig);

      // Apply configuration changes
      await this.applyConfigChanges(tenantId, updatedConfig);

      console.log(`Updated tenant ${this.sanitizeTenantId(tenantId)} DR configuration`, {
        replication_mode: updatedConfig.replication_mode,
        failover_policy: updatedConfig.failover_policy
      });

      return {
        success: true,
        config: updatedConfig
      };

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      console.error(`Failed to update tenant config:`, errorMsg);
      return {
        success: false,
        error: `Failed to update tenant config: ${errorMsg}`
      };
    }
  }

  /**
   * Reset tenant configuration to defaults
   */
  async resetTenantConfig(tenantId: string): Promise<{
    success: boolean;
    config?: TenantDRConfig;
    error?: string;
  }> {
    try {
      // Validate tenant ID
      if (!this.validateTenantId(tenantId)) {
        return { success: false, error: 'Invalid tenant ID format' };
      }

      const resetConfig = { ...this.defaultConfig, tenant_id: this.sanitizeTenantId(tenantId) };
      resetConfig.updated_at = new Date().toISOString();
      
      this.configs.set(tenantId, resetConfig);
      await this.applyConfigChanges(tenantId, resetConfig);

      console.log(`Reset tenant ${this.sanitizeTenantId(tenantId)} DR configuration to defaults`);

      return {
        success: true,
        config: resetConfig
      };

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      return {
        success: false,
        error: `Failed to reset tenant config: ${errorMsg}`
      };
    }
  }

  /**
   * Get all tenant configurations
   */
  getAllTenantConfigs(): TenantDRConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Delete tenant configuration
   */
  async deleteTenantConfig(tenantId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Validate tenant ID
      if (!this.validateTenantId(tenantId)) {
        return { success: false, error: 'Invalid tenant ID format' };
      }

      this.configs.delete(tenantId);
      console.log(`Deleted tenant ${this.sanitizeTenantId(tenantId)} DR configuration`);
      return { success: true };
    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      return { success: false, error: `Failed to delete tenant config: ${errorMsg}` };
    }
  }

  /**
   * Get tenant-specific replication settings
   */
  getReplicationSettings(tenantId: string): {
    mode: 'strict' | 'async' | 'eventual';
    batch_size: number;
    timeout_seconds: number;
    retry_attempts: number;
  } {
    try {
      // Validate tenant ID
      if (!this.validateTenantId(tenantId)) {
        throw new Error('Invalid tenant ID format');
      }

      const config = this.getTenantConfig(tenantId);
      return {
        mode: config.replication_mode,
        batch_size: config.performance_tuning.batch_size,
        timeout_seconds: config.performance_tuning.timeout_seconds,
        retry_attempts: config.performance_tuning.retry_attempts
      };
    } catch (error) {
      throw new Error(`Failed to get replication settings: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
    }
  }

  /**
   * Get tenant-specific failover settings
   */
  getFailoverSettings(tenantId: string): {
    policy: 'immediate' | 'graceful' | 'manual';
    alert_on_failover: boolean;
    webhook_urls: string[];
  } {
    try {
      // Validate tenant ID
      if (!this.validateTenantId(tenantId)) {
        throw new Error('Invalid tenant ID format');
      }

      const config = this.getTenantConfig(tenantId);
      return {
        policy: config.failover_policy,
        alert_on_failover: config.notification_settings.alert_on_failover,
        webhook_urls: config.notification_settings.webhook_urls
      };
    } catch (error) {
      throw new Error(`Failed to get failover settings: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
    }
  }

  /**
   * Get tenant-specific queue settings
   */
  getQueueSettings(tenantId: string): {
    max_queue_size: number;
    max_replication_lag_seconds: number;
    priority: 'low' | 'medium' | 'high';
    alert_on_queue_overflow: boolean;
  } {
    try {
      // Validate tenant ID
      if (!this.validateTenantId(tenantId)) {
        throw new Error('Invalid tenant ID format');
      }

      const config = this.getTenantConfig(tenantId);
      return {
        max_queue_size: config.queue_budget.max_queue_size,
        max_replication_lag_seconds: config.queue_budget.max_replication_lag_seconds,
        priority: config.queue_budget.priority,
        alert_on_queue_overflow: config.notification_settings.alert_on_queue_overflow
      };
    } catch (error) {
      throw new Error(`Failed to get queue settings: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
    }
  }

  /**
   * Get tenant-specific consistency settings
   */
  getConsistencySettings(tenantId: string): {
    consistency_percentage_threshold: number;
    auto_repair_enabled: boolean;
    repair_strategy: 'primary_wins' | 'secondary_wins' | 'latest_wins';
    alert_on_consistency_mismatch: boolean;
  } {
    try {
      // Validate tenant ID
      if (!this.validateTenantId(tenantId)) {
        throw new Error('Invalid tenant ID format');
      }

      const config = this.getTenantConfig(tenantId);
      return {
        consistency_percentage_threshold: config.consistency_requirements.consistency_percentage_threshold,
        auto_repair_enabled: config.consistency_requirements.auto_repair_enabled,
        repair_strategy: config.consistency_requirements.repair_strategy,
        alert_on_consistency_mismatch: config.notification_settings.alert_on_consistency_mismatch
      };
    } catch (error) {
      throw new Error(`Failed to get consistency settings: ${this.sanitizeError(error instanceof Error ? error.message : 'Unknown error')}`);
    }
  }

  // Private helper methods

  private createDefaultConfig(): TenantDRConfig {
    const now = new Date().toISOString();
    return {
      tenant_id: 'default',
      replication_mode: 'async',
      failover_policy: 'graceful',
      queue_budget: {
        max_queue_size: 1000,
        max_replication_lag_seconds: 300, // 5 minutes
        priority: 'medium'
      },
      consistency_requirements: {
        consistency_percentage_threshold: 99.9,
        auto_repair_enabled: true,
        repair_strategy: 'primary_wins'
      },
      performance_tuning: {
        cache_ttl_seconds: 300, // 5 minutes
        batch_size: 10,
        retry_attempts: 3,
        timeout_seconds: 30
      },
      notification_settings: {
        alert_on_failover: true,
        alert_on_consistency_mismatch: true,
        alert_on_queue_overflow: true,
        webhook_urls: []
      },
      created_at: now,
      updated_at: now
    };
  }

  private initializeDefaultConfigs(): void {
    // Initialize with some common tenant profiles
    const enterpriseConfig: TenantDRConfig = {
      ...this.defaultConfig,
      tenant_id: 'enterprise',
      replication_mode: 'strict',
      failover_policy: 'immediate',
      queue_budget: {
        max_queue_size: 500,
        max_replication_lag_seconds: 60, // 1 minute
        priority: 'high'
      },
      consistency_requirements: {
        consistency_percentage_threshold: 99.99,
        auto_repair_enabled: true,
        repair_strategy: 'primary_wins'
      },
      performance_tuning: {
        cache_ttl_seconds: 60, // 1 minute
        batch_size: 5,
        retry_attempts: 5,
        timeout_seconds: 10
      }
    };

    const standardConfig: TenantDRConfig = {
      ...this.defaultConfig,
      tenant_id: 'standard',
      replication_mode: 'async',
      failover_policy: 'graceful'
    };

    const basicConfig: TenantDRConfig = {
      ...this.defaultConfig,
      tenant_id: 'basic',
      replication_mode: 'eventual',
      failover_policy: 'manual',
      queue_budget: {
        max_queue_size: 2000,
        max_replication_lag_seconds: 900, // 15 minutes
        priority: 'low'
      },
      consistency_requirements: {
        consistency_percentage_threshold: 99.0,
        auto_repair_enabled: false,
        repair_strategy: 'latest_wins'
      },
      performance_tuning: {
        cache_ttl_seconds: 1800, // 30 minutes
        batch_size: 50,
        retry_attempts: 2,
        timeout_seconds: 60
      }
    };

    this.configs.set('enterprise', enterpriseConfig);
    this.configs.set('standard', standardConfig);
    this.configs.set('basic', basicConfig);
  }

  private mergeConfigUpdate(existing: TenantDRConfig, update: TenantConfigUpdate): TenantDRConfig {
    const merged = { ...existing };

    if (update.replication_mode) {
      merged.replication_mode = update.replication_mode;
    }

    if (update.failover_policy) {
      merged.failover_policy = update.failover_policy;
    }

    if (update.queue_budget) {
      merged.queue_budget = { ...merged.queue_budget, ...update.queue_budget };
    }

    if (update.consistency_requirements) {
      merged.consistency_requirements = { ...merged.consistency_requirements, ...update.consistency_requirements };
    }

    if (update.performance_tuning) {
      merged.performance_tuning = { ...merged.performance_tuning, ...update.performance_tuning };
    }

    if (update.notification_settings) {
      merged.notification_settings = { ...merged.notification_settings, ...update.notification_settings };
    }

    return merged;
  }

  private validateConfig(config: TenantDRConfig): { valid: boolean; error?: string } {
    // Validate tenant ID
    if (!this.validateTenantId(config.tenant_id)) {
      return { valid: false, error: 'Invalid tenant ID format' };
    }

    // Validate replication mode
    if (!this.VALID_REPLICATION_MODES.includes(config.replication_mode)) {
      return { valid: false, error: `Invalid replication mode: ${config.replication_mode}` };
    }

    // Validate failover policy
    if (!this.VALID_FAILOVER_POLICIES.includes(config.failover_policy)) {
      return { valid: false, error: `Invalid failover policy: ${config.failover_policy}` };
    }

    // Validate queue budget
    if (!this.validateNumber(config.queue_budget.max_queue_size, 1, this.MAX_QUEUE_SIZE)) {
      return { valid: false, error: 'Max queue size must be between 1 and 10000' };
    }

    if (!this.validateNumber(config.queue_budget.max_replication_lag_seconds, 1, this.MAX_REPLICATION_LAG)) {
      return { valid: false, error: 'Max replication lag must be between 1 and 86400 seconds' };
    }

    if (!this.VALID_PRIORITIES.includes(config.queue_budget.priority)) {
      return { valid: false, error: `Invalid priority: ${config.queue_budget.priority}` };
    }

    // Validate consistency requirements
    if (config.consistency_requirements.consistency_percentage_threshold < 0 || 
        config.consistency_requirements.consistency_percentage_threshold > 100) {
      return { valid: false, error: 'Consistency percentage threshold must be between 0 and 100' };
    }

    if (!this.VALID_REPAIR_STRATEGIES.includes(config.consistency_requirements.repair_strategy)) {
      return { valid: false, error: `Invalid repair strategy: ${config.consistency_requirements.repair_strategy}` };
    }

    // Validate performance tuning
    if (!this.validateNumber(config.performance_tuning.cache_ttl_seconds, 1, this.MAX_CACHE_TTL)) {
      return { valid: false, error: 'Cache TTL must be between 1 and 86400 seconds' };
    }

    if (!this.validateNumber(config.performance_tuning.batch_size, 1, this.MAX_BATCH_SIZE)) {
      return { valid: false, error: 'Batch size must be between 1 and 1000' };
    }

    if (!this.validateNumber(config.performance_tuning.retry_attempts, 0, this.MAX_RETRY_ATTEMPTS)) {
      return { valid: false, error: 'Retry attempts must be between 0 and 10' };
    }

    if (!this.validateNumber(config.performance_tuning.timeout_seconds, 1, this.MAX_TIMEOUT)) {
      return { valid: false, error: 'Timeout must be between 1 and 3600 seconds' };
    }

    // Validate webhook URLs
    if (!Array.isArray(config.notification_settings.webhook_urls)) {
      return { valid: false, error: 'Webhook URLs must be an array' };
    }

    if (config.notification_settings.webhook_urls.length > this.MAX_WEBHOOK_URLS) {
      return { valid: false, error: `Maximum ${this.MAX_WEBHOOK_URLS} webhook URLs allowed` };
    }

    for (const url of config.notification_settings.webhook_urls) {
      if (!this.isValidWebhookUrl(url)) {
        return { valid: false, error: `Invalid webhook URL: ${url}` };
      }
    }

    return { valid: true };
  }

  private async applyConfigChanges(tenantId: string, config: TenantDRConfig): Promise<void> {
    // This would apply the configuration changes to the actual services
    // For now, we'll just log what would be applied
    
    console.log(`Applying config changes for tenant ${this.sanitizeTenantId(tenantId)}:`, {
      replication_mode: config.replication_mode,
      failover_policy: config.failover_policy,
      max_queue_size: config.queue_budget.max_queue_size,
      max_replication_lag: config.queue_budget.max_replication_lag_seconds,
      priority: config.queue_budget.priority,
      consistency_threshold: config.consistency_requirements.consistency_percentage_threshold,
      auto_repair: config.consistency_requirements.auto_repair_enabled,
      repair_strategy: config.consistency_requirements.repair_strategy,
      cache_ttl: config.performance_tuning.cache_ttl_seconds,
      batch_size: config.performance_tuning.batch_size,
      retry_attempts: config.performance_tuning.retry_attempts,
      timeout: config.performance_tuning.timeout_seconds,
      alert_failover: config.notification_settings.alert_on_failover,
      alert_consistency: config.notification_settings.alert_on_consistency_mismatch,
      alert_queue: config.notification_settings.alert_on_queue_overflow,
      webhook_count: config.notification_settings.webhook_urls.length
    });

    // In a real implementation, this would:
    // 1. Update replication service configuration
    // 2. Update load balancer failover policies
    // 3. Update queue management settings
    // 4. Update consistency checker thresholds
    // 5. Update performance tuning parameters
    // 6. Update notification webhooks
  }
}

// Configuration presets for common use cases
export const CONFIG_PRESETS = {
  // High-security enterprise with strict consistency
  enterprise: {
    replication_mode: 'strict' as const,
    failover_policy: 'immediate' as const,
    queue_budget: {
      max_queue_size: 500,
      max_replication_lag_seconds: 60,
      priority: 'high' as const
    },
    consistency_requirements: {
      consistency_percentage_threshold: 99.99,
      auto_repair_enabled: true,
      repair_strategy: 'primary_wins' as const
    },
    performance_tuning: {
      cache_ttl_seconds: 60,
      batch_size: 5,
      retry_attempts: 5,
      timeout_seconds: 10
    }
  },

  // Standard business with balanced performance
  standard: {
    replication_mode: 'async' as const,
    failover_policy: 'graceful' as const,
    queue_budget: {
      max_queue_size: 1000,
      max_replication_lag_seconds: 300,
      priority: 'medium' as const
    },
    consistency_requirements: {
      consistency_percentage_threshold: 99.9,
      auto_repair_enabled: true,
      repair_strategy: 'primary_wins' as const
    },
    performance_tuning: {
      cache_ttl_seconds: 300,
      batch_size: 10,
      retry_attempts: 3,
      timeout_seconds: 30
    }
  },

  // Cost-optimized with eventual consistency
  basic: {
    replication_mode: 'eventual' as const,
    failover_policy: 'manual' as const,
    queue_budget: {
      max_queue_size: 2000,
      max_replication_lag_seconds: 900,
      priority: 'low' as const
    },
    consistency_requirements: {
      consistency_percentage_threshold: 99.0,
      auto_repair_enabled: false,
      repair_strategy: 'latest_wins' as const
    },
    performance_tuning: {
      cache_ttl_seconds: 1800,
      batch_size: 50,
      retry_attempts: 2,
      timeout_seconds: 60
    }
  },

  // Development/testing with relaxed settings
  development: {
    replication_mode: 'eventual' as const,
    failover_policy: 'manual' as const,
    queue_budget: {
      max_queue_size: 100,
      max_replication_lag_seconds: 3600,
      priority: 'low' as const
    },
    consistency_requirements: {
      consistency_percentage_threshold: 95.0,
      auto_repair_enabled: false,
      repair_strategy: 'latest_wins' as const
    },
    performance_tuning: {
      cache_ttl_seconds: 60,
      batch_size: 1,
      retry_attempts: 1,
      timeout_seconds: 5
    }
  }
};
