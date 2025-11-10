/**
 * Phase 39 - Disaster Economics & Pricing Engine
 * Unit economics simulator for cost modeling and safeguard evaluation
 */

import { readFile } from 'fs/promises';
import { join } from 'path';
import { Redis } from 'ioredis';

interface CostModel {
  version: string;
  last_updated: string;
  storage: {
    r2: {
      storage_rate_per_gb: number;
      class_a_per_million: number;
      class_b_per_million: number;
    };
    s3_fallback: {
      storage_rate_per_gb: number;
      put_per_1k: number;
      get_per_1k: number;
      list_per_1k: number;
    };
  };
  egress: {
    r2: number;
    s3: number;
  };
  edge: {
    workers: {
      req_per_million: number;
      cpu_per_million_ms: number;
      included_req: number;
      included_cpu_ms: number;
    };
  };
  tsa: {
    globalsign: {
      token_usd: number;
      p95_ms: number;
      vendor_code: string;
    };
    digicert: {
      token_usd: number;
      p95_ms: number;
      vendor_code: string;
    };
  };
  plans: {
    [key: string]: {
      monthly_fee: number;
      included_sign_events: number;
      included_verify_events: number;
      burst_cap_daily: number;
      storage_gb_included: number;
    };
  };
  safeguards: {
    margin_threshold: number;
    storm_cache_hit_threshold: number;
    storm_traffic_multiplier: number;
    storm_duration_minutes: number;
    degradation_cache_ttl: number;
    swr_duration: number;
  };
  discounts: {
    annual_multiplier: number;
    volume_cache_hit_threshold: number;
    volume_discount_tiers: Array<{
      min_verify: number;
      discount: number;
    }>;
  };
}

interface SignCostInputs {
  tsa_enabled: boolean;
  tsa_vendor?: 'globalsign' | 'digicert';
  manifest_bytes: number;
  storage_provider: 'r2' | 's3';
  ts_cpu_ms?: number;
}

interface VerifyCostInputs {
  cache_hit_rate: number;
  manifest_bytes: number;
  storage_provider: 'r2' | 's3';
  edge_cpu_ms: number;
  requests_per_verify: number;
  audit_logging: boolean;
}

interface SimulationRequest {
  assets: number;
  verifies_per_asset: number;
  cache_hit_rate: number;
  tsa: boolean;
  stack: 'r2+workers' | 's3+workers';
  plan: string;
  period_days?: number;
}

interface SimulationResult {
  cogs_breakdown: {
    storage: number;
    compute: number;
    tsa: number;
    network_ops: number;
    total: number;
  };
  gross_margin_percent: number;
  revenue: number;
  exposure_today: number;
  cap_recommendations: {
    daily_burst_cap: number;
    recommended_degradation: string[];
    kill_switch_risk: boolean;
  };
  invoice_estimate: {
    base_fee: number;
    overage_sign: number;
    overage_verify: number;
    total: number;
  };
  storm_impact: {
    worst_case_daily: number;
    cache_miss_cost_multiplier: number;
    recommended_swr_settings: {
      max_age: number;
      stale_while_revalidate: number;
    };
  };
}

export class EconomicsService {
  private costModel: CostModel;
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
    this.costModel = {} as CostModel;
    this.loadCostModel();
  }

  private async loadCostModel(): Promise<void> {
    try {
      const modelPath = join(__dirname, '../config/pricing-model-v1.json');
      const modelData = await readFile(modelPath, 'utf8');
      this.costModel = JSON.parse(modelData);
    } catch (error: any) {
      throw new Error(`Failed to load cost model: ${error?.message || error}`);
    }
  }

  /**
   * Calculate cost per asset signing event
   */
  calculateSignCost(inputs: SignCostInputs): number {
    const { storage_provider, tsa_enabled, manifest_bytes, tsa_vendor = 'globalsign', ts_cpu_ms = 220 } = inputs;
    
    let cost = 0;

    // TSA cost
    if (tsa_enabled) {
      const tsaRate = this.costModel.tsa[tsa_vendor].token_usd;
      const cpuCost = (ts_cpu_ms / 1000000) * this.costModel.edge.workers.cpu_per_million_ms;
      cost += tsaRate + cpuCost;
    }

    // Storage ingestion costs
    if (storage_provider === 'r2') {
      const storageCost = (manifest_bytes / (1024 * 1024 * 1024)) * this.costModel.storage.r2.storage_rate_per_gb;
      const classAOps = 2; // PUT + LIST
      const opsCost = (classAOps / 1000000) * this.costModel.storage.r2.class_a_per_million;
      cost += storageCost + opsCost;
    } else {
      // S3 fallback
      const storageCost = (manifest_bytes / (1024 * 1024 * 1024)) * this.costModel.storage.s3_fallback.storage_rate_per_gb;
      const opsCost = (2 / 1000) * this.costModel.storage.s3_fallback.put_per_1k;
      cost += storageCost + opsCost;
    }

    return cost;
  }

  /**
   * Calculate cost per verification event
   */
  calculateVerifyCost(inputs: VerifyCostInputs): number {
    const { cache_hit_rate, manifest_bytes, storage_provider, edge_cpu_ms, requests_per_verify, audit_logging } = inputs;
    
    let cost = 0;

    // Edge compute costs (always incurred)
    const edgeCost = (requests_per_verify / 1000000) * this.costModel.edge.workers.req_per_million;
    const cpuCost = (edge_cpu_ms / 1000000) * this.costModel.edge.workers.cpu_per_million_ms;
    cost += edgeCost + cpuCost;

    // Storage read costs (only on cache miss)
    const missRate = 1 - cache_hit_rate;
    if (missRate > 0) {
      if (storage_provider === 'r2') {
        const classBOps = 1; // GET
        const opsCost = (classBOps / 1000000) * this.costModel.storage.r2.class_b_per_million;
        cost += opsCost * missRate;
      } else {
        // S3 fallback
        const opsCost = (1 / 1000) * this.costModel.storage.s3_fallback.get_per_1k;
        cost += opsCost * missRate;
      }
    }

    // Audit logging costs
    if (audit_logging) {
      const logOps = 1;
      const logCost = (logOps / 1000000) * this.costModel.storage.r2.class_a_per_million;
      cost += logCost;
    }

    return cost;
  }

  /**
   * Calculate tenant daily exposure
   */
  calculateDailyExposure(
    basePlanFee: number,
    signEvents: number,
    verifyEvents: number,
    cache_hit_rate: number,
    signCostPerEvent: number,
    verifyCostPerEventHit: number,
    verifyCostPerEventMiss: number
  ): number {
    const dailyBaseFee = basePlanFee / 30;
    const signCost = signEvents * signCostPerEvent;
    
    // Weighted verify cost based on cache hit rate
    const verifyCost = verifyEvents * (
      cache_hit_rate * verifyCostPerEventHit + 
      (1 - cache_hit_rate) * verifyCostPerEventMiss
    );

    return dailyBaseFee + signCost + verifyCost;
  }

  /**
   * Run full pricing simulation
   */
  async simulatePricing(request: SimulationRequest): Promise<SimulationResult> {
    const { assets, verifies_per_asset, cache_hit_rate, tsa, stack, plan, period_days = 30 } = request;
    
    const planConfig = this.costModel.plans[plan];
    if (!planConfig) {
      throw new Error(`Unknown plan: ${plan}`);
    }

    const storage_provider = stack.includes('r2') ? 'r2' : 's3';
    const total_sign_events = assets;
    const total_verify_events = assets * verifies_per_asset;

    // Calculate per-event costs
    const signCostPerEvent = this.calculateSignCost({
      tsa_enabled: tsa,
      manifest_bytes: 1024, // 1KB average manifest
      storage_provider,
      tsa_vendor: 'globalsign'
    });

    const verifyCostPerEvent = this.calculateVerifyCost({
      cache_hit_rate: cache_hit_rate,
      manifest_bytes: 1024,
      storage_provider,
      edge_cpu_ms: 50, // 50ms average edge compute
      requests_per_verify: 2, // Edge + manifest fetch
      audit_logging: true
    });

    // Calculate worst-case (cache miss) verify cost
    const verifyCostPerEventMiss = this.calculateVerifyCost({
      cache_hit_rate: 0,
      manifest_bytes: 1024,
      storage_provider,
      edge_cpu_ms: 50,
      requests_per_verify: 2,
      audit_logging: true
    });

    // COGS breakdown
    const storageCost = (total_sign_events * signCostPerEvent * 0.3) + 
                       (total_verify_events * verifyCostPerEvent * 0.2);
    const computeCost = (total_verify_events * verifyCostPerEvent * 0.6) + 
                       (total_sign_events * signCostPerEvent * 0.4);
    const tsaCost = tsa ? total_sign_events * this.costModel.tsa.globalsign.token_usd : 0;
    const networkOpsCost = (total_sign_events + total_verify_events) * 0.000001; // $1 per million ops
    
    const totalCogs = storageCost + computeCost + tsaCost + networkOpsCost;

    // Revenue calculation
    const baseRevenue = planConfig.monthly_fee;
    const overageSign = Math.max(0, total_sign_events - planConfig.included_sign_events) * 0.05; // $0.05 per sign
    const overageVerify = Math.max(0, total_verify_events - planConfig.included_verify_events) * 0.01; // $0.01 per verify
    const totalRevenue = baseRevenue + overageSign + overageVerify;

    // Daily exposure
    const dailyExposure = this.calculateDailyExposure(
      planConfig.monthly_fee,
      total_sign_events / period_days,
      total_verify_events / period_days,
      cache_hit_rate,
      signCostPerEvent,
      verifyCostPerEvent,
      verifyCostPerEventMiss
    );

    // Gross margin
    const grossMarginPercent = (totalRevenue - totalCogs) / totalRevenue;

    // Storm impact analysis
    const worstCaseDaily = this.calculateDailyExposure(
      planConfig.monthly_fee,
      total_sign_events / period_days,
      (total_verify_events * 10) / period_days, // 10x traffic
      0, // Complete cache miss
      signCostPerEvent,
      verifyCostPerEvent,
      verifyCostPerEventMiss
    );

    const cacheMissMultiplier = verifyCostPerEventMiss / verifyCostPerEvent;

    // Recommendations
    const killSwitchRisk = dailyExposure > planConfig.burst_cap_daily;
    const recommendedDegradation = [];
    
    if (grossMarginPercent < this.costModel.safeguards.margin_threshold) {
      recommendedDegradation.push('increase_cache_ttl');
      recommendedDegradation.push('enable_stale_while_revalidate');
    }
    
    if (cache_hit_rate < this.costModel.safeguards.storm_cache_hit_threshold) {
      recommendedDegradation.push('force_anonymous_cache');
      recommendedDegradation.push('batch_tsa_requests');
    }

    if (killSwitchRisk) {
      recommendedDegradation.push('read_only_verify');
    }

    return {
      cogs_breakdown: {
        storage: storageCost,
        compute: computeCost,
        tsa: tsaCost,
        network_ops: networkOpsCost,
        total: totalCogs
      },
      gross_margin_percent: grossMarginPercent,
      revenue: totalRevenue,
      exposure_today: dailyExposure,
      cap_recommendations: {
        daily_burst_cap: planConfig.burst_cap_daily,
        recommended_degradation: recommendedDegradation,
        kill_switch_risk: killSwitchRisk
      },
      invoice_estimate: {
        base_fee: baseRevenue,
        overage_sign: overageSign,
        overage_verify: overageVerify,
        total: totalRevenue
      },
      storm_impact: {
        worst_case_daily: worstCaseDaily,
        cache_miss_cost_multiplier: cacheMissMultiplier,
        recommended_swr_settings: {
          max_age: 60,
          stale_while_revalidate: 300
        }
      }
    };
  }

  /**
   * Evaluate safeguards for a tenant
   */
  async evaluateSafeguards(tenantId: string): Promise<{
    actions: string[];
    risk_level: 'low' | 'medium' | 'high' | 'critical';
    exposure_today: number;
    margin_percent: number;
  }> {
    // Get tenant's current usage metrics
    const usageKey = `usage:window:${tenantId}:current`;
    const usageData = await this.redis.get(usageKey);
    
    if (!usageData) {
      return {
        actions: ['no_usage_data'],
        risk_level: 'low',
        exposure_today: 0,
        margin_percent: 1.0
      };
    }

    let usage;
    try {
      usage = JSON.parse(usageData);
    } catch (error: any) {
      throw new Error(`Invalid usage data for tenant ${tenantId}: ${error?.message || error}`);
    }
    
    const planKey = `tenant:${tenantId}`;
    const tenantData = await this.redis.get(planKey);
    
    if (!tenantData) {
      throw new Error(`Tenant not found: ${tenantId}`);
    }

    let tenant;
    try {
      tenant = JSON.parse(tenantData);
    } catch (error: any) {
      throw new Error(`Invalid tenant data for ${tenantId}: ${error?.message || error}`);
    }
    
    const planConfig = this.costModel.plans[tenant.plan];

    // Calculate current exposure
    const signCostPerEvent = this.calculateSignCost({
      tsa_enabled: usage.tsa_enabled || false,
      manifest_bytes: 1024,
      storage_provider: 'r2',
      tsa_vendor: usage.tsa_vendor || 'globalsign'
    });

    const verifyCostPerEvent = this.calculateVerifyCost({
      cache_hit_rate: usage.cache_hit_rate || 0.8,
      manifest_bytes: 1024,
      storage_provider: 'r2',
      edge_cpu_ms: usage.avg_cpu_ms || 50,
      requests_per_verify: 2,
      audit_logging: true
    });

    const dailyExposure = this.calculateDailyExposure(
      planConfig.monthly_fee,
      usage.sign_events_today || 0,
      usage.verify_events_today || 0,
      usage.cache_hit_rate || 0.8,
      signCostPerEvent,
      verifyCostPerEvent,
      verifyCostPerEvent * 2 // Miss cost
    );

    // Calculate margin (simplified)
    const dailyRevenue = planConfig.monthly_fee / 30;
    const dailyCogs = dailyExposure - dailyRevenue;
    const marginPercent = dailyRevenue / (dailyRevenue + dailyCogs);

    const actions: string[] = [];
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';

    // Evaluate risk conditions
    if (marginPercent < this.costModel.safeguards.margin_threshold) {
      riskLevel = 'high';
      actions.push('pricing_review_required');
    }

    if (dailyExposure > planConfig.burst_cap_daily * 0.8) {
      riskLevel = 'medium';
      actions.push('approaching_burst_cap');
    }

    if (dailyExposure > planConfig.burst_cap_daily) {
      riskLevel = 'critical';
      actions.push('burst_cap_exceeded');
      actions.push('enable_degradation');
    }

    if (usage.cache_hit_rate < this.costModel.safeguards.storm_cache_hit_threshold) {
      if (riskLevel !== 'critical') riskLevel = 'medium';
      actions.push('cache_performance_degraded');
    }

    if (usage.traffic_multiplier > this.costModel.safeguards.storm_traffic_multiplier) {
      riskLevel = 'critical';
      actions.push('storm_conditions_detected');
      actions.push('force_anonymous_cache');
    }

    return {
      actions,
      risk_level: riskLevel,
      exposure_today: dailyExposure,
      margin_percent: marginPercent
    };
  }

  /**
   * Get current cost model
   */
  getCostModel(): CostModel {
    return this.costModel;
  }

  /**
   * Update cost model (admin only)
   */
  updateCostModel(updates: Partial<CostModel>): void {
    this.costModel = { ...this.costModel, ...updates };
  }
}
