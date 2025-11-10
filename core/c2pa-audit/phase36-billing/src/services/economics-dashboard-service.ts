/**
 * Phase 39 - Economics Dashboard Service
 * Real-time economics monitoring and dashboard data aggregation
 */

import { Redis } from 'ioredis';
import { EconomicsService } from './economics-service';
import { SafeguardService } from './safeguard-service';
import { KillSwitchService } from './killswitch-service';

interface EconomicsOverview {
  total_revenue: number;
  total_cogs: number;
  gross_margin_percent: number;
  total_tenants: number;
  active_kill_switches: number;
  period: {
    start: string;
    end: string;
    days: number;
  };
}

interface COGSBreakdown {
  storage: {
    cost: number;
    percentage: number;
    trend: 'up' | 'down' | 'stable';
  };
  compute: {
    cost: number;
    percentage: number;
    trend: 'up' | 'down' | 'stable';
  };
  tsa: {
    cost: number;
    percentage: number;
    trend: 'up' | 'down' | 'stable';
  };
  network_ops: {
    cost: number;
    percentage: number;
    trend: 'up' | 'down' | 'stable';
  };
}

interface TenantEconomics {
  tenant_id: string;
  plan: string;
  revenue: number;
  cogs: number;
  margin_percent: number;
  usage: {
    sign_events: number;
    verify_events: number;
    cache_hit_rate: number;
    avg_cpu_ms: number;
  };
  risk_level: 'low' | 'medium' | 'high' | 'critical';
  burst_cap_utilization: number;
  kill_switch_active: boolean;
}

interface BudgetGuard {
  metric: string;
  current_value: number;
  threshold: number;
  status: 'healthy' | 'warning' | 'critical';
  trend: 'improving' | 'degrading' | 'stable';
  alert_triggered: boolean;
  recommendation: string;
}

interface PricingCoherenceReport {
  date: string;
  total_simulated: number;
  total_invoiced: number;
  variance_percent: number;
  within_tolerance: boolean;
  discrepancies: Array<{
    tenant_id: string;
    simulated: number;
    invoiced: number;
    variance: number;
  }>;
}

export class EconomicsDashboardService {
  private economicsService: EconomicsService;
  private safeguardService: SafeguardService;
  private killSwitchService: KillSwitchService;
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
    this.economicsService = new EconomicsService(redis);
    this.safeguardService = new SafeguardService(redis);
    this.killSwitchService = new KillSwitchService(redis);
  }

  /**
   * Get economics overview for dashboard
   */
  async getEconomicsOverview(periodDays: number = 30): Promise<EconomicsOverview> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (periodDays * 24 * 60 * 60 * 1000));

    // Get aggregated metrics from Redis or calculate
    const overviewKey = `economics:overview:${periodDays}d`;
    const cachedData = await this.redis.get(overviewKey);

    if (cachedData) {
      try {
        return JSON.parse(cachedData);
      } catch (error: any) {
        // Remove corrupted cache and continue
        await this.redis.del(overviewKey);
      }
    }

    // Calculate overview (simplified for demonstration)
    const totalRevenue = await this.calculateTotalRevenue(startDate, endDate);
    const totalCogs = await this.calculateTotalCogs(startDate, endDate);
    const grossMargin = totalRevenue > 0 ? (totalRevenue - totalCogs) / totalRevenue : 0;
    const totalTenants = await this.getTotalTenants();
    const activeKillSwitches = (await this.killSwitchService.getActiveKillSwitches()).length;

    const overview: EconomicsOverview = {
      total_revenue: totalRevenue,
      total_cogs: totalCogs,
      gross_margin_percent: grossMargin,
      total_tenants: totalTenants,
      active_kill_switches: activeKillSwitches,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
        days: periodDays
      }
    };

    // Cache for 5 minutes
    await this.redis.setex(overviewKey, 300, JSON.stringify(overview));

    return overview;
  }

  /**
   * Get COGS breakdown by category
   */
  async getCOGSBreakdown(periodDays: number = 30): Promise<COGSBreakdown> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - (periodDays * 24 * 60 * 60 * 1000));

    const breakdownKey = `economics:cogs_breakdown:${periodDays}d`;
    const cachedData = await this.redis.get(breakdownKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Calculate COGS by category (simplified)
    const storageCost = await this.calculateStorageCosts(startDate, endDate);
    const computeCost = await this.calculateComputeCosts(startDate, endDate);
    const tsaCost = await this.calculateTSACosts(startDate, endDate);
    const networkOpsCost = await this.calculateNetworkOpsCosts(startDate, endDate);

    const total = storageCost + computeCost + tsaCost + networkOpsCost;

    const breakdown: COGSBreakdown = {
      storage: {
        cost: storageCost,
        percentage: total > 0 ? storageCost / total : 0,
        trend: await this.calculateTrend('storage', periodDays)
      },
      compute: {
        cost: computeCost,
        percentage: total > 0 ? computeCost / total : 0,
        trend: await this.calculateTrend('compute', periodDays)
      },
      tsa: {
        cost: tsaCost,
        percentage: total > 0 ? tsaCost / total : 0,
        trend: await this.calculateTrend('tsa', periodDays)
      },
      network_ops: {
        cost: networkOpsCost,
        percentage: total > 0 ? networkOpsCost / total : 0,
        trend: await this.calculateTrend('network_ops', periodDays)
      }
    };

    // Cache for 5 minutes
    await this.redis.setex(breakdownKey, 300, JSON.stringify(breakdown));

    return breakdown;
  }

  /**
   * Get top tenants by economics metrics
   */
  async getTopTenants(limit: number = 10, sortBy: 'revenue' | 'margin' | 'risk' = 'revenue'): Promise<TenantEconomics[]> {
    const tenantsKey = `economics:top_tenants:${sortBy}:${limit}`;
    const cachedData = await this.redis.get(tenantsKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Get all tenant IDs (simplified)
    const tenantIds = await this.getAllTenantIds();
    const tenantEconomics: TenantEconomics[] = [];

    for (const tenantId of tenantIds.slice(0, 50)) { // Limit to 50 for performance
      try {
        const economics = await this.getTenantEconomics(tenantId);
        tenantEconomics.push(economics);
      } catch (error) {
        console.error(`Failed to get economics for tenant ${tenantId}:`, error);
      }
    }

    // Sort by specified metric
    const sorted = tenantEconomics.sort((a, b) => {
      switch (sortBy) {
        case 'revenue':
          return b.revenue - a.revenue;
        case 'margin':
          return b.margin_percent - a.margin_percent;
        case 'risk':
          const riskOrder = { 'critical': 4, 'high': 3, 'medium': 2, 'low': 1 };
          return riskOrder[b.risk_level] - riskOrder[a.risk_level];
        default:
          return 0;
      }
    });

    const result = sorted.slice(0, limit);

    // Cache for 2 minutes
    await this.redis.setex(tenantsKey, 120, JSON.stringify(result));

    return result;
  }

  /**
   * Get budget guard status
   */
  async getBudgetGuards(): Promise<BudgetGuard[]> {
    const guardsKey = 'economics:budget_guards';
    const cachedData = await this.redis.get(guardsKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    const overview = await this.getEconomicsOverview(7); // 7-day window
    const costModel = this.economicsService.getCostModel();

    const guards: BudgetGuard[] = [
      {
        metric: 'Gross Margin',
        current_value: overview.gross_margin_percent,
        threshold: costModel.safeguards.margin_threshold,
        status: overview.gross_margin_percent >= costModel.safeguards.margin_threshold ? 'healthy' : 
                overview.gross_margin_percent >= costModel.safeguards.margin_threshold * 0.9 ? 'warning' : 'critical',
        trend: await this.calculateMarginTrend(),
        alert_triggered: overview.gross_margin_percent < costModel.safeguards.margin_threshold,
        recommendation: overview.gross_margin_percent < costModel.safeguards.margin_threshold ? 
                       'Immediate pricing review required' : 'Monitor closely'
      },
      {
        metric: 'Active Kill Switches',
        current_value: overview.active_kill_switches,
        threshold: overview.total_tenants * 0.1, // 10% of tenants
        status: overview.active_kill_switches === 0 ? 'healthy' :
                overview.active_kill_switches <= overview.total_tenants * 0.05 ? 'warning' : 'critical',
        trend: await this.calculateKillSwitchTrend(),
        alert_triggered: overview.active_kill_switches > overview.total_tenants * 0.05,
        recommendation: overview.active_kill_switches > 0 ? 
                       'Review affected tenants and root causes' : 'Continue monitoring'
      },
      {
        metric: 'Daily COGS Growth',
        current_value: await this.calculateDailyCogsGrowth(),
        threshold: 0.2, // 20% daily growth threshold
        status: 'healthy', // Would be calculated based on actual growth
        trend: 'stable',
        alert_triggered: false,
        recommendation: 'Monitor for unusual cost patterns'
      }
    ];

    // Cache for 1 minute
    await this.redis.setex(guardsKey, 60, JSON.stringify(guards));

    return guards;
  }

  /**
   * Get pricing-invoice coherence report
   */
  async getPricingCoherenceReport(date: string): Promise<PricingCoherenceReport> {
    const reportKey = `economics:coherence:${date}`;
    const cachedData = await this.redis.get(reportKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Calculate coherence (simplified for demonstration)
    const totalSimulated = await this.calculateTotalSimulated(date);
    const totalInvoiced = await this.calculateTotalInvoiced(date);
    const variance = totalSimulated > 0 ? Math.abs((totalInvoiced - totalSimulated) / totalSimulated) : 0;
    const withinTolerance = variance <= 0.02; // 2% tolerance

    const report: PricingCoherenceReport = {
      date,
      total_simulated: totalSimulated,
      total_invoiced: totalInvoiced,
      variance_percent: variance,
      within_tolerance: withinTolerance,
      discrepancies: [] // Would be populated with actual discrepancies
    };

    // Cache for 24 hours
    await this.redis.setex(reportKey, 86400, JSON.stringify(report));

    return report;
  }

  /**
   * Get real-time metrics for monitoring
   */
  async getRealTimeMetrics(): Promise<{
    timestamp: string;
    current_qps: number;
    active_verifications: number;
    cache_hit_rate: number;
    avg_response_time: number;
    error_rate: number;
  }> {
    const metricsKey = 'economics:realtime:current';
    const cachedData = await this.redis.get(metricsKey);

    if (cachedData) {
      return JSON.parse(cachedData);
    }

    // Get real-time metrics (simplified)
    const metrics = {
      timestamp: new Date().toISOString(),
      current_qps: await this.getCurrentQPS(),
      active_verifications: await this.getActiveVerifications(),
      cache_hit_rate: await this.getCurrentCacheHitRate(),
      avg_response_time: await this.getAverageResponseTime(),
      error_rate: await this.getErrorRate()
    };

    // Cache for 10 seconds
    await this.redis.setex(metricsKey, 10, JSON.stringify(metrics));

    return metrics;
  }

  // Helper methods (simplified implementations)

  private async calculateTotalRevenue(startDate: Date, endDate: Date): Promise<number> {
    // This would aggregate from billing data
    return 50000; // Placeholder
  }

  private async calculateTotalCogs(startDate: Date, endDate: Date): Promise<number> {
    // This would aggregate from cost tracking
    return 15000; // Placeholder
  }

  private async getTotalTenants(): Promise<number> {
    // This would count active tenants
    return 150; // Placeholder
  }

  private async calculateStorageCosts(startDate: Date, endDate: Date): Promise<number> {
    return 5000; // Placeholder
  }

  private async calculateComputeCosts(startDate: Date, endDate: Date): Promise<number> {
    return 7000; // Placeholder
  }

  private async calculateTSACosts(startDate: Date, endDate: Date): Promise<number> {
    return 2000; // Placeholder
  }

  private async calculateNetworkOpsCosts(startDate: Date, endDate: Date): Promise<number> {
    return 1000; // Placeholder
  }

  private async calculateTrend(category: string, periodDays: number): Promise<'up' | 'down' | 'stable'> {
    // This would compare current period to previous period
    return 'stable'; // Placeholder
  }

  private async getAllTenantIds(): Promise<string[]> {
    // This would get all tenant IDs from database
    return ['tenant1', 'tenant2', 'tenant3']; // Placeholder
  }

  private async getTenantEconomics(tenantId: string): Promise<TenantEconomics> {
    // This would calculate economics for specific tenant
    return {
      tenant_id: tenantId,
      plan: 'pro_699',
      revenue: 699,
      cogs: 200,
      margin_percent: 0.71,
      usage: {
        sign_events: 100,
        verify_events: 1000,
        cache_hit_rate: 0.85,
        avg_cpu_ms: 45
      },
      risk_level: 'low',
      burst_cap_utilization: 0.3,
      kill_switch_active: false
    }; // Placeholder
  }

  private async calculateMarginTrend(): Promise<'improving' | 'degrading' | 'stable'> {
    return 'stable'; // Placeholder
  }

  private async calculateKillSwitchTrend(): Promise<'improving' | 'degrading' | 'stable'> {
    return 'stable'; // Placeholder
  }

  private async calculateDailyCogsGrowth(): Promise<number> {
    return 0.05; // Placeholder
  }

  private async calculateTotalSimulated(date: string): Promise<number> {
    return 48000; // Placeholder
  }

  private async calculateTotalInvoiced(date: string): Promise<number> {
    return 47500; // Placeholder
  }

  private async getCurrentQPS(): Promise<number> {
    return 150; // Placeholder
  }

  private async getActiveVerifications(): Promise<number> {
    return 25; // Placeholder
  }

  private async getCurrentCacheHitRate(): Promise<number> {
    return 0.87; // Placeholder
  }

  private async getAverageResponseTime(): Promise<number> {
    return 120; // Placeholder
  }

  private async getErrorRate(): Promise<number> {
    return 0.002; // Placeholder
  }

  /**
   * Trigger pricing review when margins are low
   */
  async triggerPricingReview(reason: string, metrics: any): Promise<void> {
    const reviewKey = 'economics:pricing_review:pending';
    const review = {
      id: Date.now().toString(),
      triggered_at: new Date().toISOString(),
      reason,
      metrics,
      status: 'pending',
      assigned_to: 'pricing_council',
      due_date: new Date(Date.now() + 72 * 3600000).toISOString() // 72 hours
    };

    await this.redis.lpush(reviewKey, JSON.stringify(review));
    
    // Send alert to monitoring system
    console.log(`PRICING REVIEW TRIGGERED: ${reason}`, metrics);
  }

  /**
   * Get economics alerts
   */
  async getEconomicsAlerts(): Promise<Array<{
    id: string;
    type: 'margin_warning' | 'cost_spike' | 'burst_cap' | 'coherence_error';
    severity: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    created_at: string;
    resolved: boolean;
  }>> {
    const alertsKey = 'economics:alerts:active';
    const alertsData = await this.redis.lrange(alertsKey, 0, -1);

    return alertsData.map(data => JSON.parse(data));
  }

  /**
   * Create economics alert
   */
  async createEconomicsAlert(type: string, severity: string, message: string): Promise<void> {
    const alert = {
      id: Date.now().toString(),
      type,
      severity,
      message,
      created_at: new Date().toISOString(),
      resolved: false
    };

    const alertsKey = 'economics:alerts:active';
    await this.redis.lpush(alertsKey, JSON.stringify(alert));
    await this.redis.ltrim(alertsKey, 0, 99); // Keep last 100 alerts

    // Send to monitoring system
    console.log(`ECONOMICS ALERT [${severity.toUpperCase()}]: ${message}`);
  }
}
