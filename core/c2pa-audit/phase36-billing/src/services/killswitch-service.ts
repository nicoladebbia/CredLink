/**
 * Phase 39 - Kill Switch Service
 * Hard kill-switch logic for read-only verify mode and emergency controls
 */

import { Redis } from 'ioredis';

interface KillSwitchState {
  tenant_id: string;
  active: boolean;
  mode: 'read_only_verify' | 'full_shutdown' | 'emergency_cache';
  triggered_at: string;
  triggered_by: 'automatic' | 'manual';
  reason: string;
  exposure_limit: number;
  current_exposure: number;
  auto_reset_at?: string;
  conditions: {
    margin_threshold: boolean;
    burst_cap_exceeded: boolean;
    storm_conditions: boolean;
    manual_override: boolean;
  };
}

interface KillSwitchConfig {
  tenant_id: string;
  exposure_limit_usd: number;
  margin_threshold: number;
  auto_reset_hours: number;
  emergency_cache_ttl: number;
  notify_stakeholders: boolean;
  allow_self_service_topup: boolean;
}

interface EmergencyCacheConfig {
  max_age: number;
  stale_while_revalidate: number;
  must_revalidate: boolean;
  public: boolean;
  immutable: boolean;
}

export class KillSwitchService {
  private redis: Redis;
  private activeKillSwitches: Map<string, KillSwitchState> = new Map();
  private configs: Map<string, KillSwitchConfig> = new Map();

  constructor(redis: Redis) {
    this.redis = redis;
    this.initializeDefaultConfigs();
  }

  private initializeDefaultConfigs(): void {
    // Default configuration for enterprise tenants
    const defaultConfig: KillSwitchConfig = {
      tenant_id: 'default',
      exposure_limit_usd: 1000,
      margin_threshold: 0.6,
      auto_reset_hours: 24,
      emergency_cache_ttl: 3600,
      notify_stakeholders: true,
      allow_self_service_topup: true
    };

    this.configs.set('default', defaultConfig);
  }

  /**
   * Evaluate if kill switch should be triggered for tenant
   */
  async evaluateKillSwitch(tenantId: string, currentExposure: number, marginPercent: number, stormConditions: boolean): Promise<KillSwitchState | null> {
    const config = this.getConfigForTenant(tenantId);
    const existingState = await this.getKillSwitchState(tenantId);

    // Check if kill switch is already active
    if (existingState && existingState.active) {
      return existingState;
    }

    // Evaluate trigger conditions
    const conditions = {
      margin_threshold: marginPercent <= config.margin_threshold,
      burst_cap_exceeded: currentExposure >= config.exposure_limit_usd,
      storm_conditions: stormConditions,
      manual_override: false
    };

    // Determine if kill switch should be triggered
    const shouldTrigger = conditions.margin_threshold || conditions.burst_cap_exceeded || conditions.storm_conditions;

    if (shouldTrigger) {
      const mode = this.determineKillSwitchMode(conditions, currentExposure, config);
      const reason = this.generateTriggerReason(conditions, currentExposure, marginPercent);

      const killSwitchState: KillSwitchState = {
        tenant_id: tenantId,
        active: true,
        mode,
        triggered_at: new Date().toISOString(),
        triggered_by: 'automatic',
        reason,
        exposure_limit: config.exposure_limit_usd,
        current_exposure: currentExposure,
        auto_reset_at: new Date(Date.now() + config.auto_reset_hours * 3600000).toISOString(),
        conditions
      };

      await this.activateKillSwitch(killSwitchState);
      return killSwitchState;
    }

    return null;
  }

  private determineKillSwitchMode(conditions: any, currentExposure: number, config: KillSwitchConfig): 'read_only_verify' | 'full_shutdown' | 'emergency_cache' {
    // Full shutdown only for extreme cases
    if (currentExposure >= config.exposure_limit_usd * 1.5) {
      return 'full_shutdown';
    }

    // Emergency cache for storm conditions
    if (conditions.storm_conditions) {
      return 'emergency_cache';
    }

    // Read-only verify for margin or burst cap issues
    return 'read_only_verify';
  }

  private generateTriggerReason(conditions: any, currentExposure: number, marginPercent: number): string {
    const reasons: string[] = [];

    if (conditions.margin_threshold) {
      reasons.push(`Margin dropped to ${Math.round(marginPercent * 100)}%`);
    }

    if (conditions.burst_cap_exceeded) {
      reasons.push(`Exposure $${currentExposure.toFixed(2)} exceeded limit`);
    }

    if (conditions.storm_conditions) {
      reasons.push('Storm conditions detected');
    }

    return reasons.join('; ');
  }

  /**
   * Activate kill switch for tenant
   */
  async activateKillSwitch(state: KillSwitchState): Promise<void> {
    // Store in Redis
    const key = `killswitch:${state.tenant_id}`;
    await this.redis.setex(key, state.auto_reset_at ? 
      Math.ceil((new Date(state.auto_reset_at).getTime() - Date.now()) / 1000) : 
      86400, JSON.stringify(state));

    // Store in memory for fast access
    this.activeKillSwitches.set(state.tenant_id, state);

    // Apply kill switch effects based on mode
    await this.applyKillSwitchEffects(state);

    // Log activation
    await this.logKillSwitchActivation(state);

    // Send notifications if configured
    const config = this.getConfigForTenant(state.tenant_id);
    if (config.notify_stakeholders) {
      await this.sendKillSwitchNotification(state);
    }
  }

  private async applyKillSwitchEffects(state: KillSwitchState): Promise<void> {
    const tenantId = state.tenant_id;

    switch (state.mode) {
      case 'read_only_verify':
        await this.applyReadOnlyVerify(tenantId);
        break;
      case 'full_shutdown':
        await this.applyFullShutdown(tenantId);
        break;
      case 'emergency_cache':
        await this.applyEmergencyCache(tenantId);
        break;
    }
  }

  private async applyReadOnlyVerify(tenantId: string): Promise<void> {
    // Disable signing endpoints
    const signingDisabledKey = `killswitch:signing_disabled:${tenantId}`;
    await this.redis.setex(signingDisabledKey, 86400, JSON.stringify({
      disabled: true,
      reason: 'Kill switch activated - read-only verify mode',
      disabled_at: new Date().toISOString()
    }));

    // Enable cached verify only
    const verifyModeKey = `killswitch:verify_mode:${tenantId}`;
    await this.redis.setex(verifyModeKey, 86400, JSON.stringify({
      mode: 'cache_only',
      reason: 'Kill switch activated - read-only verify mode',
      set_at: new Date().toISOString()
    }));

    // Update rate limiting to be very restrictive
    const rateLimitKey = `ratelimit:${tenantId}`;
    await this.redis.setex(rateLimitKey, 86400, '0.1'); // 90% reduction
  }

  private async applyFullShutdown(tenantId: string): Promise<void> {
    // Disable all endpoints
    const allDisabledKey = `killswitch:all_disabled:${tenantId}`;
    await this.redis.setex(allDisabledKey, 86400, JSON.stringify({
      disabled: true,
      reason: 'Kill switch activated - full shutdown',
      disabled_at: new Date().toISOString()
    }));

    // Block all requests at middleware level
    const blockAllKey = `killswitch:block_all:${tenantId}`;
    await this.redis.setex(blockAllKey, 86400, 'true');
  }

  private async applyEmergencyCache(tenantId: string): Promise<void> {
    const config = this.getConfigForTenant(tenantId);
    
    // Set aggressive caching
    const emergencyCacheKey = `killswitch:emergency_cache:${tenantId}`;
    const cacheConfig: EmergencyCacheConfig = {
      max_age: 60,
      stale_while_revalidate: 300,
      must_revalidate: false,
      public: true,
      immutable: true
    };

    await this.redis.setex(emergencyCacheKey, config.emergency_cache_ttl, JSON.stringify(cacheConfig));

    // Disable TSA (expensive operation)
    const tsaDisabledKey = `killswitch:tsa_disabled:${tenantId}`;
    await this.redis.setex(tsaDisabledKey, config.emergency_cache_ttl, JSON.stringify({
      disabled: true,
      reason: 'Emergency cache mode - TSA disabled',
      disabled_at: new Date().toISOString()
    }));

    // Moderate rate limiting
    const rateLimitKey = `ratelimit:${tenantId}`;
    await this.redis.setex(rateLimitKey, config.emergency_cache_ttl, '0.5'); // 50% reduction
  }

  /**
   * Deactivate kill switch for tenant
   */
  async deactivateKillSwitch(tenantId: string, reason: string): Promise<void> {
    const state = await this.getKillSwitchState(tenantId);
    
    if (!state || !state.active) {
      return;
    }

    // Remove from Redis
    const keys = [
      `killswitch:${tenantId}`,
      `killswitch:signing_disabled:${tenantId}`,
      `killswitch:verify_mode:${tenantId}`,
      `killswitch:all_disabled:${tenantId}`,
      `killswitch:block_all:${tenantId}`,
      `killswitch:emergency_cache:${tenantId}`,
      `killswitch:tsa_disabled:${tenantId}`,
      `ratelimit:${tenantId}`
    ];

    for (const key of keys) {
      await this.redis.del(key);
    }

    // Remove from memory
    this.activeKillSwitches.delete(tenantId);

    // Log deactivation
    await this.logKillSwitchDeactivation(tenantId, reason);

    // Send notification
    await this.sendKillSwitchRecoveryNotification(tenantId, reason);
  }

  /**
   * Check if tenant has active kill switch
   */
  async hasActiveKillSwitch(tenantId: string): Promise<boolean> {
    const state = await this.getKillSwitchState(tenantId);
    return state ? state.active : false;
  }

  /**
   * Get kill switch state for tenant
   */
  async getKillSwitchState(tenantId: string): Promise<KillSwitchState | null> {
    // Check memory first
    if (this.activeKillSwitches.has(tenantId)) {
      return this.activeKillSwitches.get(tenantId)!;
    }

    // Check Redis
    const key = `killswitch:${tenantId}`;
    const data = await this.redis.get(key);
    
    if (data) {
      try {
        const state: KillSwitchState = JSON.parse(data);
        this.activeKillSwitches.set(tenantId, state);
        return state;
      } catch (error: any) {
        // Remove corrupted data
        await this.redis.del(key);
        return null;
      }
    }

    return null;
  }

  /**
   * Manually trigger kill switch
   */
  async manualTrigger(tenantId: string, mode: 'read_only_verify' | 'full_shutdown' | 'emergency_cache', reason: string): Promise<void> {
    const config = this.getConfigForTenant(tenantId);
    
    const state: KillSwitchState = {
      tenant_id: tenantId,
      active: true,
      mode,
      triggered_at: new Date().toISOString(),
      triggered_by: 'manual',
      reason,
      exposure_limit: config.exposure_limit_usd,
      current_exposure: 0, // Manual trigger doesn't need current exposure
      auto_reset_at: new Date(Date.now() + config.auto_reset_hours * 3600000).toISOString(),
      conditions: {
        margin_threshold: false,
        burst_cap_exceeded: false,
        storm_conditions: false,
        manual_override: true
      }
    };

    await this.activateKillSwitch(state);
  }

  /**
   * Get configuration for tenant
   */
  private getConfigForTenant(tenantId: string): KillSwitchConfig {
    return this.configs.get(tenantId) || this.configs.get('default')!;
  }

  /**
   * Set configuration for tenant
   */
  setConfig(tenantId: string, config: KillSwitchConfig): void {
    this.configs.set(tenantId, config);
  }

  /**
   * Check for auto-reset conditions
   */
  async checkAutoResets(): Promise<void> {
    const now = new Date();
    
    for (const [tenantId, state] of this.activeKillSwitches.entries()) {
      if (state.auto_reset_at && new Date(state.auto_reset_at) <= now) {
        await this.deactivateKillSwitch(tenantId, 'Auto-reset timer expired');
      }
    }
  }

  private async logKillSwitchActivation(state: KillSwitchState): Promise<void> {
    const logKey = `killswitch:log:${state.tenant_id}`;
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: 'activated',
      state
    };
    
    await this.redis.lpush(logKey, JSON.stringify(logEntry));
    await this.redis.ltrim(logKey, 0, 999);
  }

  private async logKillSwitchDeactivation(tenantId: string, reason: string): Promise<void> {
    const logKey = `killswitch:log:${tenantId}`;
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: 'deactivated',
      tenant_id: tenantId,
      reason
    };
    
    await this.redis.lpush(logKey, JSON.stringify(logEntry));
    await this.redis.ltrim(logKey, 0, 999);
  }

  private async sendKillSwitchNotification(state: KillSwitchState): Promise<void> {
    // Implementation would send notifications to monitoring systems
    console.log(`KILL SWITCH ACTIVATED: Tenant ${state.tenant_id} - ${state.mode} - ${state.reason}`);
  }

  private async sendKillSwitchRecoveryNotification(tenantId: string, reason: string): Promise<void> {
    // Implementation would send recovery notifications
    console.log(`KILL SWITCH DEACTIVATED: Tenant ${tenantId} - ${reason}`);
  }

  /**
   * Get all active kill switches
   */
  async getActiveKillSwitches(): Promise<KillSwitchState[]> {
    return Array.from(this.activeKillSwitches.values());
  }

  /**
   * Get kill switch statistics
   */
  async getStatistics(): Promise<{
    total_active: number;
    by_mode: Record<string, number>;
    by_trigger: Record<string, number>;
    avg_duration_hours: number;
  }> {
    const active = Array.from(this.activeKillSwitches.values());
    
    const byMode = active.reduce((acc, state) => {
      acc[state.mode] = (acc[state.mode] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const byTrigger = active.reduce((acc, state) => {
      acc[state.triggered_by] = (acc[state.triggered_by] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const avgDuration = active.length > 0 ? 
      active.reduce((sum, state) => {
        const duration = (Date.now() - new Date(state.triggered_at).getTime()) / (1000 * 60 * 60);
        return sum + duration;
      }, 0) / active.length : 0;

    return {
      total_active: active.length,
      by_mode: byMode,
      by_trigger: byTrigger,
      avg_duration_hours: avgDuration
    };
  }
}
