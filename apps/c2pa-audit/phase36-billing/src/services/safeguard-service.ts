/**
 * Phase 39 - Safeguard Service
 * Real-time safeguard evaluation and auto-degradation system
 */

import { Redis } from 'ioredis';
import { EconomicsService } from './economics-service';

interface SafeguardEvaluation {
  tenant_id: string;
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  actions: string[];
  exposure_today: number;
  margin_percent: number;
  current_usage: {
    sign_events_today: number;
    verify_events_today: number;
    cache_hit_rate: number;
    tsa_enabled: boolean;
    avg_cpu_ms: number;
    traffic_multiplier: number;
  };
  recommendations: {
    immediate: string[];
    short_term: string[];
    long_term: string[];
  };
  degradation_state: {
    cache_ttl: number;
    stale_while_revalidate: boolean;
    tsa_batching: boolean;
    read_only_verify: boolean;
  };
}

interface BurstCapConfig {
  tenant_id: string;
  daily_cap_usd: number;
  qps_limit: number;
  alert_threshold: number; // percentage of cap
  auto_degrade_threshold: number; // percentage of cap
}

interface DegradationLadder {
  level: number;
  triggers: {
    exposure_percent: number;
    margin_percent: number;
    cache_hit_rate: number;
  };
  actions: {
    cache_ttl: number;
    enable_swr: boolean;
    batch_tsa: boolean;
    rate_limit_factor: number;
    read_only: boolean;
  };
}

export class SafeguardService {
  private economicsService: EconomicsService;
  private redis: Redis;
  private degradationLadder: DegradationLadder[];
  private burstCaps: Map<string, BurstCapConfig> = new Map();

  constructor(redis: Redis) {
    this.redis = redis;
    this.economicsService = new EconomicsService(redis);
    this.degradationLadder = [];
    this.initializeDegradationLadder();
  }

  private initializeDegradationLadder(): void {
    this.degradationLadder = [
      {
        level: 0,
        triggers: {
          exposure_percent: 0.5,
          margin_percent: 0.8,
          cache_hit_rate: 0.7
        },
        actions: {
          cache_ttl: 300,
          enable_swr: false,
          batch_tsa: false,
          rate_limit_factor: 1.0,
          read_only: false
        }
      },
      {
        level: 1,
        triggers: {
          exposure_percent: 0.7,
          margin_percent: 0.75,
          cache_hit_rate: 0.6
        },
        actions: {
          cache_ttl: 600,
          enable_swr: true,
          batch_tsa: false,
          rate_limit_factor: 0.9,
          read_only: false
        }
      },
      {
        level: 2,
        triggers: {
          exposure_percent: 0.85,
          margin_percent: 0.7,
          cache_hit_rate: 0.5
        },
        actions: {
          cache_ttl: 1200,
          enable_swr: true,
          batch_tsa: true,
          rate_limit_factor: 0.7,
          read_only: false
        }
      },
      {
        level: 3,
        triggers: {
          exposure_percent: 0.95,
          margin_percent: 0.65,
          cache_hit_rate: 0.4
        },
        actions: {
          cache_ttl: 1800,
          enable_swr: true,
          batch_tsa: true,
          rate_limit_factor: 0.5,
          read_only: false
        }
      },
      {
        level: 4,
        triggers: {
          exposure_percent: 1.0,
          margin_percent: 0.6,
          cache_hit_rate: 0.3
        },
        actions: {
          cache_ttl: 3600,
          enable_swr: true,
          batch_tsa: true,
          rate_limit_factor: 0.3,
          read_only: true
        }
      }
    ];
  }

  /**
   * Evaluate safeguards for a tenant
   */
  async evaluateSafeguards(tenantId: string): Promise<SafeguardEvaluation> {
    // Get current usage data
    const usageKey = `usage:window:${tenantId}:current`;
    const usageData = await this.redis.get(usageKey);
    
    if (!usageData) {
      return this.createDefaultEvaluation(tenantId);
    }

    let usage;
    try {
      usage = JSON.parse(usageData);
    } catch (error: any) {
      throw new Error(`Invalid usage data for tenant ${tenantId}: ${error?.message || error}`);
    }
    
    const evaluation = await this.economicsService.evaluateSafeguards(tenantId);

    // Determine degradation level
    const degradationLevel = this.calculateDegradationLevel(evaluation, usage);
    const degradationActions = this.degradationLadder[degradationLevel].actions;

    // Generate recommendations
    const recommendations = this.generateRecommendations(evaluation, usage, degradationLevel);

    const safeguardEvaluation: SafeguardEvaluation = {
      tenant_id: tenantId,
      risk_level: evaluation.risk_level,
      actions: evaluation.actions,
      exposure_today: evaluation.exposure_today,
      margin_percent: evaluation.margin_percent,
      current_usage: {
        sign_events_today: usage.sign_events_today || 0,
        verify_events_today: usage.verify_events_today || 0,
        cache_hit_rate: usage.cache_hit_rate || 0.8,
        tsa_enabled: usage.tsa_enabled || false,
        avg_cpu_ms: usage.avg_cpu_ms || 50,
        traffic_multiplier: usage.traffic_multiplier || 1.0
      },
      recommendations,
      degradation_state: {
        cache_ttl: degradationActions.cache_ttl,
        stale_while_revalidate: degradationActions.enable_swr,
        tsa_batching: degradationActions.batch_tsa,
        read_only_verify: degradationActions.read_only
      }
    };

    // Store evaluation for monitoring
    await this.storeSafeguardEvaluation(tenantId, safeguardEvaluation);

    return safeguardEvaluation;
  }

  private createDefaultEvaluation(tenantId: string): SafeguardEvaluation {
    return {
      tenant_id: tenantId,
      risk_level: 'low',
      actions: ['no_usage_data'],
      exposure_today: 0,
      margin_percent: 1.0,
      current_usage: {
        sign_events_today: 0,
        verify_events_today: 0,
        cache_hit_rate: 0.8,
        tsa_enabled: false,
        avg_cpu_ms: 50,
        traffic_multiplier: 1.0
      },
      recommendations: {
        immediate: ['Monitor initial usage patterns'],
        short_term: ['Configure caching headers'],
        long_term: ['Establish usage baselines']
      },
      degradation_state: {
        cache_ttl: 300,
        stale_while_revalidate: false,
        tsa_batching: false,
        read_only_verify: false
      }
    };
  }

  private calculateDegradationLevel(evaluation: any, usage: any): number {
    const costModel = this.economicsService.getCostModel();
    const tenantId = evaluation.tenant_id || 'default';
    const burstCap = this.getBurstCapForTenant(tenantId);
    
    const exposurePercent = evaluation.exposure_today / burstCap.daily_cap_usd;
    const marginPercent = evaluation.margin_percent;
    const cacheHitRate = usage.cache_hit_rate || 0.8;

    // Find the highest degradation level triggered
    for (let i = this.degradationLadder.length - 1; i >= 0; i--) {
      const level = this.degradationLadder[i];
      if (
        exposurePercent >= level.triggers.exposure_percent ||
        marginPercent <= level.triggers.margin_percent ||
        cacheHitRate <= level.triggers.cache_hit_rate
      ) {
        return i;
      }
    }

    return 0;
  }

  private generateRecommendations(evaluation: any, usage: any, degradationLevel: number): {
    immediate: string[];
    short_term: string[];
    long_term: string[];
  } {
    const recommendations = {
      immediate: [] as string[],
      short_term: [] as string[],
      long_term: [] as string[]
    };

    // Critical recommendations
    if (evaluation.risk_level === 'critical') {
      recommendations.immediate.push('Enable read-only verify mode immediately');
      recommendations.immediate.push('Contact customer for plan upgrade');
      recommendations.immediate.push('Force aggressive caching');
    }

    // High risk recommendations
    if (evaluation.risk_level === 'high') {
      recommendations.immediate.push('Enable stale-while-revalidate caching');
      recommendations.immediate.push('Batch TSA requests');
      recommendations.short_term.push('Review and optimize caching strategy');
    }

    // Medium risk recommendations
    if (evaluation.risk_level === 'medium') {
      recommendations.short_term.push('Monitor traffic patterns closely');
      recommendations.short_term.push('Consider cache optimization');
    }

    // Performance-based recommendations
    if (usage.cache_hit_rate < 0.8) {
      recommendations.short_term.push('Implement CDN caching headers');
      recommendations.short_term.push('Optimize manifest delivery');
    }

    if (usage.avg_cpu_ms > 100) {
      recommendations.short_term.push('Optimize verification logic');
      recommendations.long_term.push('Consider edge compute optimization');
    }

    // Cost-based recommendations
    if (evaluation.margin_percent < 0.7) {
      recommendations.immediate.push('Review pricing for this tenant');
      recommendations.short_term.push('Suggest plan upgrade');
    }

    // Degradation-based recommendations
    if (degradationLevel >= 2) {
      recommendations.immediate.push('Auto-degradation activated');
      recommendations.short_term.push('Investigate cause of high usage');
    }

    return recommendations;
  }

  /**
   * Apply degradation actions for a tenant
   */
  async applyDegradation(tenantId: string, degradationLevel: number): Promise<void> {
    const actions = this.degradationLadder[degradationLevel].actions;
    
    // Update tenant's degradation state in Redis
    const degradationKey = `safeguards:degradation:${tenantId}`;
    await this.redis.setex(degradationKey, 3600, JSON.stringify({
      level: degradationLevel,
      actions,
      applied_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 3600000).toISOString()
    }));

    // Update rate limiting
    const rateLimitKey = `ratelimit:${tenantId}`;
    if (actions.rate_limit_factor < 1.0) {
      await this.redis.setex(rateLimitKey, 3600, actions.rate_limit_factor.toString());
    }

    // Update caching configuration
    const cacheConfigKey = `cache:config:${tenantId}`;
    await this.redis.setex(cacheConfigKey, 3600, JSON.stringify({
      ttl: actions.cache_ttl,
      swr_enabled: actions.enable_swr,
      swr_duration: 300
    }));

    // Log degradation action
    await this.logDegradationAction(tenantId, degradationLevel, actions);
  }

  /**
   * Check if tenant exceeds burst caps and take action
   */
  async checkBurstCaps(tenantId: string): Promise<boolean> {
    const evaluation = await this.evaluateSafeguards(tenantId);
    const burstCap = this.getBurstCapForTenant(tenantId);
    
    const exposurePercent = evaluation.exposure_today / burstCap.daily_cap_usd;
    
    if (exposurePercent >= burstCap.auto_degrade_threshold) {
      const degradationLevel = this.calculateDegradationLevel(evaluation, evaluation.current_usage);
      await this.applyDegradation(tenantId, degradationLevel);
      
      // Send alert
      await this.sendBurstCapAlert(tenantId, evaluation, exposurePercent);
      
      return true;
    }

    if (exposurePercent >= burstCap.alert_threshold) {
      await this.sendBurstCapWarning(tenantId, evaluation, exposurePercent);
    }

    return false;
  }

  /**
   * Handle storm conditions (cache miss + high traffic)
   */
  async handleStormConditions(tenantId: string): Promise<void> {
    const usageKey = `usage:window:${tenantId}:current`;
    const usageData = await this.redis.get(usageKey);
    
    if (!usageData) return;

    const usage = JSON.parse(usageData);
    const costModel = this.economicsService.getCostModel();

    const isStorm = 
      (usage.cache_hit_rate || 0.8) < costModel.safeguards.storm_cache_hit_threshold &&
      (usage.traffic_multiplier || 1.0) > costModel.safeguards.storm_traffic_multiplier;

    if (isStorm) {
      // Force anonymous cache with aggressive settings
      const cacheConfigKey = `cache:storm:${tenantId}`;
      await this.redis.setex(cacheConfigKey, 1800, JSON.stringify({
        max_age: 60,
        stale_while_revalidate: 300,
        must_revalidate: false,
        public: true
      }));

      // Enable emergency mode
      const emergencyKey = `safeguards:emergency:${tenantId}`;
      await this.redis.setex(emergencyKey, 1800, JSON.stringify({
        mode: 'storm',
        activated_at: new Date().toISOString(),
        cache_hit_rate: usage.cache_hit_rate,
        traffic_multiplier: usage.traffic_multiplier
      }));

      // Log storm activation
      await this.logStormActivation(tenantId, usage);
    }
  }

  /**
   * Reset tenant to normal operations
   */
  async resetTenant(tenantId: string): Promise<void> {
    const keys = [
      `safeguards:degradation:${tenantId}`,
      `ratelimit:${tenantId}`,
      `cache:config:${tenantId}`,
      `cache:storm:${tenantId}`,
      `safeguards:emergency:${tenantId}`
    ];

    for (const key of keys) {
      await this.redis.del(key);
    }

    // Log reset action
    await this.logResetAction(tenantId);
  }

  /**
   * Get burst cap configuration for tenant
   */
  private getBurstCapForTenant(tenantId: string): BurstCapConfig {
    if (this.burstCaps.has(tenantId)) {
      return this.burstCaps.get(tenantId)!;
    }

    // Default configuration based on plan
    const defaultCaps: BurstCapConfig = {
      tenant_id: tenantId,
      daily_cap_usd: 200, // Default to Pro plan cap
      qps_limit: 1000,
      alert_threshold: 0.8,
      auto_degrade_threshold: 0.9
    };

    return defaultCaps;
  }

  /**
   * Set burst cap configuration for tenant
   */
  setBurstCap(tenantId: string, config: BurstCapConfig): void {
    this.burstCaps.set(tenantId, config);
  }

  private async storeSafeguardEvaluation(tenantId: string, evaluation: SafeguardEvaluation): Promise<void> {
    const key = `safeguards:evaluation:${tenantId}:${Date.now()}`;
    await this.redis.setex(key, 86400 * 7, JSON.stringify(evaluation)); // Keep for 7 days
  }

  private async logDegradationAction(tenantId: string, level: number, actions: any): Promise<void> {
    const logKey = `safeguards:log:${tenantId}`;
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: 'degradation_applied',
      level,
      actions,
      tenant_id: tenantId
    };
    
    await this.redis.lpush(logKey, JSON.stringify(logEntry));
    await this.redis.ltrim(logKey, 0, 999); // Keep last 1000 entries
  }

  private async logStormActivation(tenantId: string, usage: any): Promise<void> {
    const logKey = `safeguards:log:${tenantId}`;
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: 'storm_activated',
      usage,
      tenant_id: tenantId
    };
    
    await this.redis.lpush(logKey, JSON.stringify(logEntry));
    await this.redis.ltrim(logKey, 0, 999);
  }

  private async logResetAction(tenantId: string): Promise<void> {
    const logKey = `safeguards:log:${tenantId}`;
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: 'tenant_reset',
      tenant_id: tenantId
    };
    
    await this.redis.lpush(logKey, JSON.stringify(logEntry));
    await this.redis.ltrim(logKey, 0, 999);
  }

  private async sendBurstCapAlert(tenantId: string, evaluation: any, exposurePercent: number): Promise<void> {
    // Implementation would send alert to monitoring system
    console.log(`BURST CAP ALERT: Tenant ${tenantId} at ${Math.round(exposurePercent * 100)}% of daily cap`);
  }

  private async sendBurstCapWarning(tenantId: string, evaluation: any, exposurePercent: number): Promise<void> {
    // Implementation would send warning to monitoring system
    console.log(`BURST CAP WARNING: Tenant ${tenantId} at ${Math.round(exposurePercent * 100)}% of daily cap`);
  }
}
