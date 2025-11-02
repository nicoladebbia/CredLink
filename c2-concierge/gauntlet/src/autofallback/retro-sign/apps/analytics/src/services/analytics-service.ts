/**
 * Phase 13 Analytics - Core Analytics Service
 * Business logic for SLO monitoring, dashboards, and alerts
 */

import { ClickHouseClient } from '../db/clickhouse';
import { SLO_QUERIES, QueryBuilder } from '../queries/slo-queries';
import { Logger } from 'winston';
import {
  BurnRateMetrics,
  LatencyMetrics,
  CostMetrics,
  IncidentMetrics
} from '../queries/slo-queries';

export interface SLOStatus {
  tenant: string;
  route: string;
  mode: 'remote' | 'embed';
  survival_30d: number;
  survival_target: number;
  survival_status: 'PASS' | 'FAIL';
  budget_left: number;
  burn_rate_5m: number;
  burn_rate_1h: number;
  policy: 'NORMAL' | 'FALLBACK_REMOTE_ONLY' | 'RECOVERY_GUARD';
  last_policy_change?: Date;
}

export interface DashboardData {
  tenant: string;
  slo_status: SLOStatus[];
  incidents: IncidentMetrics[];
  latency_metrics: LatencyMetrics[];
  cost_metrics: CostMetrics;
  provider_performance: any[];
  last_updated: Date;
}

export interface AlertThreshold {
  window_minutes: number;
  target_survival: number;
  burn_rate_threshold: number;
}

export interface AlertRule {
  name: string;
  thresholds: AlertThreshold[];
  actions: AlertAction[];
}

export interface AlertAction {
  type: 'notify' | 'enforce_fallback' | 'open_incident' | 'open_ticket';
  config: any;
}

export class AnalyticsService {
  constructor(
    private clickhouse: ClickHouseClient,
    private logger: Logger
  ) {}

  /**
   * Get SLO status for tenant dashboard cards
   */
  async getSLOStatus(tenant: string, routes?: string[]): Promise<SLOStatus[]> {
    try {
      this.logger.debug('Getting SLO status', { tenant, routes });

      // Get survival metrics
      const survivalResult = await this.clickhouse.query(
        SLO_QUERIES.SLO_STATUS_SUMMARY,
        QueryBuilder.survivalParams(tenant, routes?.[0])
      );

      // Get burn rate for 5m and 1h windows
      const burnRate5m = await this.clickhouse.query(
        SLO_QUERIES.BURN_RATE_5M,
        QueryBuilder.burnRateParams(tenant)
      );

      const burnRate1h = await this.clickhouse.query(
        SLO_QUERIES.BURN_RATE_1H,
        QueryBuilder.burnRateParams(tenant)
      );

      // Combine metrics into SLO status
      const sloStatus: SLOStatus[] = [];
      
      for (const survival of survivalResult.data) {
        const burn5m = burnRate5m.data.find((r: any) => r.route === survival.route);
        const burn1h = burnRate1h.data.find((r: any) => r.route === survival.route);

        sloStatus.push({
          tenant,
          route: survival.route,
          mode: survival.mode,
          survival_30d: survival.survival,
          survival_target: survival.mode === 'remote' ? 0.999 : 0.95,
          survival_status: survival.survival_slo_status,
          budget_left: this.calculateBudgetLeft(survival.survival, survival.mode),
          burn_rate_5m: burn5m?.burn_rate || 0,
          burn_rate_1h: burn1h?.burn_rate || 0,
          policy: 'NORMAL', // TODO: Get from Phase 6 policy service
          last_policy_change: new Date() // TODO: Get from incidents
        });
      }

      this.logger.info('SLO status retrieved', {
        tenant,
        routes: sloStatus.length,
        status_count: sloStatus.filter(s => s.survival_status === 'FAIL').length
      });

      return sloStatus;

    } catch (error) {
      this.logger.error('Failed to get SLO status', {
        tenant,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get complete dashboard data
   */
  async getDashboardData(tenant: string, routes?: string[]): Promise<DashboardData> {
    try {
      this.logger.info('Getting dashboard data', { tenant, routes });

      const [
        sloStatus,
        incidents,
        latencyMetrics,
        costMetrics,
        providerPerformance
      ] = await Promise.all([
        this.getSLOStatus(tenant, routes),
        this.getRecentIncidents(tenant, routes),
        this.getLatencyMetrics(tenant, routes),
        this.getCostProjections(tenant),
        this.getProviderPerformance(tenant)
      ]);

      const dashboardData: DashboardData = {
        tenant,
        slo_status: sloStatus,
        incidents,
        latency_metrics: latencyMetrics,
        cost_metrics: costMetrics,
        provider_performance: providerPerformance,
        last_updated: new Date()
      };

      this.logger.info('Dashboard data retrieved', {
        tenant,
        slo_routes: sloStatus.length,
        incidents: incidents.length,
        latency_routes: latencyMetrics.length
      });

      return dashboardData;

    } catch (error) {
      this.logger.error('Failed to get dashboard data', {
        tenant,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get burn rate metrics for alerting
   */
  async getBurnRateMetrics(tenant: string, windowMinutes: number): Promise<BurnRateMetrics[]> {
    try {
      const query = windowMinutes === 5 ? 
        SLO_QUERIES.BURN_RATE_5M : 
        SLO_QUERIES.BURN_RATE_1H;

      const result = await this.clickhouse.query(
        query,
        QueryBuilder.burnRateParams(tenant)
      );

      return result.data.map((row: any) => ({
        ...row,
        window_start: new Date(row.window_start)
      }));

    } catch (error) {
      this.logger.error('Failed to get burn rate metrics', {
        tenant,
        windowMinutes,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get recent incidents for dashboard table
   */
  async getRecentIncidents(tenant: string, routes?: string[]): Promise<IncidentMetrics[]> {
    try {
      const result = await this.clickhouse.query(
        SLO_QUERIES.INCIDENTS_7D,
        QueryBuilder.incidentParams(tenant, routes?.[0])
      );

      return result.data.map((row: any) => ({
        ...row,
        ts: new Date(row.ts)
      }));

    } catch (error) {
      this.logger.error('Failed to get recent incidents', {
        tenant,
        routes,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get latency metrics for SLO monitoring
   */
  async getLatencyMetrics(tenant: string, routes?: string[]): Promise<LatencyMetrics[]> {
    try {
      const result = await this.clickhouse.query(
        SLO_QUERIES.VERIFY_LATENCY_24H,
        QueryBuilder.latencyParams(tenant, routes?.[0])
      );

      return result.data;

    } catch (error) {
      this.logger.error('Failed to get latency metrics', {
        tenant,
        routes,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get cost projections for billing
   */
  async getCostProjections(tenant: string): Promise<CostMetrics> {
    try {
      const result = await this.clickhouse.query(
        SLO_QUERIES.COST_PROJECTIONS,
        QueryBuilder.costParams(tenant)
      );

      if (result.data.length === 0) {
        return {
          tenant,
          sign_usd: 0,
          verify_usd: 0,
          storage_usd: 0,
          egress_usd: 0,
          total_usd: 0,
          projected_monthly: 0
        };
      }

      return result.data[0];

    } catch (error) {
      this.logger.error('Failed to get cost projections', {
        tenant,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get provider performance analysis
   */
  async getProviderPerformance(tenant: string): Promise<any[]> {
    try {
      const result = await this.clickhouse.query(
        SLO_QUERIES.PROVIDER_PERFORMANCE,
        { tenant }
      );

      return result.data.map((row: any) => ({
        ...row,
        first_seen: new Date(row.first_seen),
        last_seen: new Date(row.last_seen)
      }));

    } catch (error) {
      this.logger.error('Failed to get provider performance', {
        tenant,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Get daily survival matrix for public reports
   */
  async getSurvivalMatrix(tenant: string, startDate: Date, endDate: Date): Promise<any[]> {
    try {
      const result = await this.clickhouse.query(
        SLO_QUERIES.SURVIVAL_DAILY_MATRIX,
        QueryBuilder.reportParams(tenant, startDate, endDate)
      );

      return result.data.map((row: any) => ({
        ...row,
        date: new Date(row.date)
      }));

    } catch (error) {
      this.logger.error('Failed to get survival matrix', {
        tenant,
        startDate,
        endDate,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Check if routes exceed burn rate thresholds
   */
  async checkBurnRateThresholds(
    tenant: string, 
    rules: AlertRule[]
  ): Promise<Array<{ rule: AlertRule; violations: BurnRateMetrics[] }>> {
    try {
      const violations: Array<{ rule: AlertRule; violations: BurnRateMetrics[] }> = [];

      for (const rule of rules) {
        for (const threshold of rule.thresholds) {
          const metrics = await this.getBurnRateMetrics(tenant, threshold.window_minutes);
          
          const violatingRoutes = metrics.filter(
            metric => metric.burn_rate >= threshold.burn_rate_threshold
          );

          if (violatingRoutes.length > 0) {
            violations.push({
              rule,
              violations: violatingRoutes
            });

            this.logger.warn('Burn rate threshold exceeded', {
              tenant,
              rule: rule.name,
              threshold: threshold.burn_rate_threshold,
              window: threshold.window_minutes,
              violating_routes: violatingRoutes.length
            });
          }
        }
      }

      return violations;

    } catch (error) {
      this.logger.error('Failed to check burn rate thresholds', {
        tenant,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Calculate error budget remaining
   */
  private calculateBudgetLeft(survival: number, mode: 'remote' | 'embed'): number {
    const target = mode === 'remote' ? 0.999 : 0.95;
    const errorBudget = 1 - target;
    const currentErrorRate = 1 - survival;
    const budgetUsed = currentErrorRate / errorBudget;
    const budgetLeft = Math.max(0, 1 - budgetUsed);
    
    // Convert to requests (assuming 1000 requests per day for calculation)
    const dailyRequests = 1000;
    return Math.floor(budgetLeft * dailyRequests * errorBudget);
  }

  /**
   * Get SLO health summary for monitoring
   */
  async getSLOHealthSummary(tenant: string): Promise<{
    total_routes: number;
    healthy_routes: number;
    unhealthy_routes: number;
    overall_survival: number;
    alerts_triggered: number;
  }> {
    try {
      const sloStatus = await this.getSLOStatus(tenant);
      
      const totalRoutes = new Set(sloStatus.map(s => s.route)).size;
      const healthyRoutes = sloStatus.filter(s => s.survival_status === 'PASS').length;
      const unhealthyRoutes = sloStatus.filter(s => s.survival_status === 'FAIL').length;
      const alertsTriggered = sloStatus.filter(s => s.burn_rate_5m > 1.0).length;
      
      const overallSurvival = sloStatus.length > 0 ?
        sloStatus.reduce((sum, s) => sum + s.survival_30d, 0) / sloStatus.length : 0;

      return {
        total_routes: totalRoutes,
        healthy_routes: healthyRoutes,
        unhealthy_routes: unhealthyRoutes,
        overall_survival: Math.round(overallSurvival * 10000) / 10000,
        alerts_triggered: alertsTriggered
      };

    } catch (error) {
      this.logger.error('Failed to get SLO health summary', {
        tenant,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }

  /**
   * Validate data freshness
   */
  async validateDataFreshness(tenant: string): Promise<{
    fresh: boolean;
    last_data_time: Date;
    age_minutes: number;
  }> {
    try {
      const result = await this.clickhouse.query(`
        SELECT max(window_start) AS last_window
        FROM mv_survival_5m_table
        WHERE tenant = {tenant:String}
      `, { tenant });

      const lastDataTime = new Date(result.data[0]?.last_window || 0);
      const ageMinutes = (Date.now() - lastDataTime.getTime()) / (1000 * 60);
      const fresh = ageMinutes < 15; // Consider data fresh if less than 15 minutes old

      return {
        fresh,
        last_data_time: lastDataTime,
        age_minutes: Math.round(ageMinutes)
      };

    } catch (error) {
      this.logger.error('Failed to validate data freshness', {
        tenant,
        error: error instanceof Error ? error.message : String(error)
      });
      throw error;
    }
  }
}
