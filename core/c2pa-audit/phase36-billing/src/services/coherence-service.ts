/**
 * Phase 39 - Pricing-Invoice Coherence Service
 * Ensures pricing calculators match actual Stripe invoices within tolerance
 */

import { Redis } from 'ioredis';
import { EconomicsService } from './economics-service';

interface CoherenceCheck {
  date: string;
  tenant_id: string;
  simulated_amount: number;
  invoiced_amount: number;
  variance_percent: number;
  within_tolerance: boolean;
  discrepancies: Array<{
    meter_id: string;
    simulated_usage: number;
    invoiced_usage: number;
    variance: number;
  }>;
}

interface CoherenceReport {
  date: string;
  total_tenants: number;
  total_simulated: number;
  total_invoiced: number;
  overall_variance_percent: number;
  within_tolerance: boolean;
  tenant_checks: CoherenceCheck[];
  critical_discrepancies: CoherenceCheck[];
  summary: {
    tenants_with_issues: number;
    average_variance: number;
    max_variance: number;
    meters_with_discrepancies: string[];
  };
}

interface MeterMapping {
  stripe_meter_id: string;
  internal_metric: string;
  unit_price: number;
  tolerance_percent: number;
}

interface ReconciliationJob {
  id: string;
  date: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  started_at?: string;
  completed_at?: string;
  tenant_count: number;
  processed_tenants: number;
  errors: string[];
}

export class CoherenceService {
  private economicsService: EconomicsService;
  private redis: Redis;
  private meterMappings: Map<string, MeterMapping> = new Map();

  constructor(redis: Redis) {
    this.redis = redis;
    this.economicsService = new EconomicsService(redis);
    this.initializeMeterMappings();
  }

  private initializeMeterMappings(): void {
    // Map Stripe meters to internal metrics
    this.meterMappings.set('sign_events', {
      stripe_meter_id: 'meter_sign_events',
      internal_metric: 'sign_events',
      unit_price: 0.05,
      tolerance_percent: 0.02 // 2% tolerance
    });

    this.meterMappings.set('verify_events', {
      stripe_meter_id: 'meter_verify_events',
      internal_metric: 'verify_events',
      unit_price: 0.01,
      tolerance_percent: 0.02
    });

    this.meterMappings.set('tsa_tokens', {
      stripe_meter_id: 'meter_tsa_tokens',
      internal_metric: 'tsa_tokens',
      unit_price: 0.0012,
      tolerance_percent: 0.05 // Higher tolerance for TSA
    });

    this.meterMappings.set('storage_gb', {
      stripe_meter_id: 'meter_storage_gb',
      internal_metric: 'storage_gb',
      unit_price: 0.015,
      tolerance_percent: 0.03
    });
  }

  /**
   * Run daily coherence check
   */
  async runDailyCoherenceCheck(date: string): Promise<CoherenceReport> {
    const job = await this.createReconciliationJob(date);
    
    try {
      await this.updateJobStatus(job.id, 'running');
      
      const tenantIds = await this.getAllTenantIds();
      const tenantChecks: CoherenceCheck[] = [];
      const criticalDiscrepancies: CoherenceCheck[] = [];

      let totalSimulated = 0;
      let totalInvoiced = 0;
      let processedCount = 0;

      for (const tenantId of tenantIds) {
        try {
          const check = await this.checkTenantCoherence(tenantId, date);
          tenantChecks.push(check);
          
          totalSimulated += check.simulated_amount;
          totalInvoiced += check.invoiced_amount;
          
          if (!check.within_tolerance) {
            criticalDiscrepancies.push(check);
          }

          processedCount++;
          await this.updateJobProgress(job.id, processedCount);
          
        } catch (error: any) {
          console.error(`Failed to check coherence for tenant ${tenantId}:`, error);
          await this.addJobError(job.id, `Tenant ${tenantId}: ${error?.message || error}`);
        }
      }

      const overallVariance = totalSimulated > 0 ? 
        Math.abs((totalInvoiced - totalSimulated) / totalSimulated) : 0;

      const report: CoherenceReport = {
        date,
        total_tenants: tenantIds.length,
        total_simulated: totalSimulated,
        total_invoiced: totalInvoiced,
        overall_variance_percent: overallVariance,
        within_tolerance: overallVariance <= 0.02, // 2% overall tolerance
        tenant_checks: tenantChecks,
        critical_discrepancies: criticalDiscrepancies,
        summary: this.generateSummary(tenantChecks)
      };

      await this.storeCoherenceReport(report);
      await this.updateJobStatus(job.id, 'completed');

      // Trigger alerts for critical discrepancies
      if (criticalDiscrepancies.length > 0) {
        await this.triggerCoherenceAlerts(report);
      }

      return report;
      
    } catch (error) {
      await this.updateJobStatus(job.id, 'failed');
      await this.addJobError(job.id, `Job failed: ${error}`);
      throw error;
    }
  }

  /**
   * Check coherence for specific tenant
   */
  async checkTenantCoherence(tenantId: string, date: string): Promise<CoherenceCheck> {
    // Get simulated pricing from internal model
    const simulatedPricing = await this.calculateSimulatedPricing(tenantId, date);
    
    // Get actual invoice data from Stripe
    const invoiceData = await this.getStripeInvoiceData(tenantId, date);
    
    // Compare and calculate variance
    const variance = this.calculateVariance(simulatedPricing, invoiceData);
    const withinTolerance = variance.overall_variance <= 0.02;

    const discrepancies = this.identifyDiscrepancies(simulatedPricing, invoiceData);

    return {
      date,
      tenant_id: tenantId,
      simulated_amount: simulatedPricing.total_amount,
      invoiced_amount: invoiceData.total_amount,
      variance_percent: variance.overall_variance,
      within_tolerance: withinTolerance,
      discrepancies
    };
  }

  private async calculateSimulatedPricing(tenantId: string, date: string): Promise<{
    total_amount: number;
    meter_breakdown: Map<string, { usage: number; amount: number }>;
  }> {
    // Get tenant's actual usage for the date
    const usageData = await this.getTenantUsage(tenantId, date);
    
    // Get tenant's plan configuration
    const tenantConfig = await this.getTenantConfig(tenantId);
    
    // Calculate pricing using internal model
    const meterBreakdown = new Map<string, { usage: number; amount: number }>();
    let totalAmount = tenantConfig.base_monthly_fee;

    // Calculate per-meter costs
    for (const [metric, mapping] of this.meterMappings.entries()) {
      const usage = usageData.get(mapping.internal_metric) || 0;
      const includedUsage = tenantConfig.included_usage.get(mapping.internal_metric) || 0;
      const billableUsage = Math.max(0, usage - includedUsage);
      const amount = billableUsage * mapping.unit_price;
      
      meterBreakdown.set(mapping.stripe_meter_id, { usage: billableUsage, amount });
      totalAmount += amount;
    }

    return {
      total_amount: totalAmount,
      meter_breakdown: meterBreakdown
    };
  }

  private async getStripeInvoiceData(tenantId: string, date: string): Promise<{
    total_amount: number;
    meter_breakdown: Map<string, { usage: number; amount: number }>;
  }> {
    // This would integrate with Stripe API to get actual invoice data
    // For demonstration, return simulated data
    
    const meterBreakdown = new Map<string, { usage: number; amount: number }>();
    
    // Simulate getting invoice data from Stripe
    meterBreakdown.set('meter_sign_events', { usage: 1200, amount: 60 });
    meterBreakdown.set('meter_verify_events', { usage: 52000, amount: 520 });
    meterBreakdown.set('meter_tsa_tokens', { usage: 1200, amount: 1.44 });
    meterBreakdown.set('meter_storage_gb', { usage: 25, amount: 0.375 });

    const totalAmount = 699 + 60 + 520 + 1.44 + 0.375; // Base fee + usage

    return {
      total_amount: totalAmount,
      meter_breakdown: meterBreakdown
    };
  }

  private calculateVariance(simulated: any, invoice: any): {
    overall_variance: number;
    meter_variances: Map<string, number>;
  } {
    const overallVariance = simulated.total_amount > 0 ? 
      Math.abs((invoice.total_amount - simulated.total_amount) / simulated.total_amount) : 0;

    const meterVariances = new Map<string, number>();

    for (const [meterId, mapping] of this.meterMappings.entries()) {
      const simulatedMeter = simulated.meter_breakdown.get(mapping.stripe_meter_id);
      const invoiceMeter = invoice.meter_breakdown.get(mapping.stripe_meter_id);

      if (simulatedMeter && invoiceMeter) {
        const variance = simulatedMeter.amount > 0 ? 
          Math.abs((invoiceMeter.amount - simulatedMeter.amount) / simulatedMeter.amount) : 0;
        meterVariances.set(mapping.stripe_meter_id, variance);
      }
    }

    return {
      overall_variance: overallVariance,
      meter_variances: meterVariances
    };
  }

  private identifyDiscrepancies(simulated: any, invoice: any): Array<{
    meter_id: string;
    simulated_usage: number;
    invoiced_usage: number;
    variance: number;
  }> {
    const discrepancies = [];

    for (const [meterId, mapping] of this.meterMappings.entries()) {
      const simulatedMeter = simulated.meter_breakdown.get(mapping.stripe_meter_id);
      const invoiceMeter = invoice.meter_breakdown.get(mapping.stripe_meter_id);

      if (simulatedMeter && invoiceMeter) {
        const usageVariance = simulatedMeter.usage > 0 ? 
          Math.abs((invoiceMeter.usage - simulatedMeter.usage) / simulatedMeter.usage) : 0;

        if (usageVariance > mapping.tolerance_percent) {
          discrepancies.push({
            meter_id: mapping.stripe_meter_id,
            simulated_usage: simulatedMeter.usage,
            invoiced_usage: invoiceMeter.usage,
            variance: usageVariance
          });
        }
      }
    }

    return discrepancies;
  }

  private generateSummary(tenantChecks: CoherenceCheck[]): {
    tenants_with_issues: number;
    average_variance: number;
    max_variance: number;
    meters_with_discrepancies: string[];
  } {
    const tenantsWithIssues = tenantChecks.filter(check => !check.within_tolerance).length;
    const variances = tenantChecks.map(check => check.variance_percent);
    const averageVariance = variances.reduce((sum, variances) => sum + variances, 0) / variances.length;
    const maxVariance = Math.max(...variances);

    const metersWithDiscrepancies = new Set<string>();
    for (const check of tenantChecks) {
      for (const discrepancy of check.discrepancies) {
        metersWithDiscrepancies.add(discrepancy.meter_id);
      }
    }

    return {
      tenants_with_issues: tenantsWithIssues,
      average_variance: averageVariance,
      max_variance: maxVariance,
      meters_with_discrepancies: Array.from(metersWithDiscrepancies)
    };
  }

  /**
   * Get coherence report for specific date
   */
  async getCoherenceReport(date: string): Promise<CoherenceReport | null> {
    const reportKey = `coherence:report:${date}`;
    const reportData = await this.redis.get(reportKey);
    
    return reportData ? JSON.parse(reportData) : null;
  }

  /**
   * Get coherence trends over time
   */
  async getCoherenceTrends(days: number = 30): Promise<{
    dates: string[];
    overall_variance: number[];
    tenants_with_issues: number[];
    within_tolerance_count: number[];
  }> {
    const trends = {
      dates: [] as string[],
      overall_variance: [] as number[],
      tenants_with_issues: [] as number[],
      within_tolerance_count: [] as number[]
    };

    for (let i = days - 1; i >= 0; i--) {
      const date = new Date(Date.now() - (i * 24 * 60 * 60 * 1000)).toISOString().split('T')[0];
      const report = await this.getCoherenceReport(date);
      
      if (report) {
        trends.dates.push(date);
        trends.overall_variance.push(report.overall_variance_percent);
        trends.tenants_with_issues.push(report.summary.tenants_with_issues);
        trends.within_tolerance_count.push(report.tenant_checks.filter(check => check.within_tolerance).length);
      }
    }

    return trends;
  }

  /**
   * Trigger manual coherence check for tenant
   */
  async triggerManualCheck(tenantId: string, date: string): Promise<CoherenceCheck> {
    const check = await this.checkTenantCoherence(tenantId, date);
    
    // Store individual check
    const checkKey = `coherence:check:${tenantId}:${date}`;
    await this.redis.setex(checkKey, 86400 * 30, JSON.stringify(check)); // Keep for 30 days

    // Log manual check
    await this.logManualCheck(tenantId, date, check);

    return check;
  }

  /**
   * Fix coherence discrepancy
   */
  async fixDiscrepancy(tenantId: string, date: string, meterId: string, fixType: 'adjustment' | 'recalculation' | 'investigation'): Promise<void> {
    const fix = {
      tenant_id: tenantId,
      date,
      meter_id: meterId,
      fix_type: fixType,
      applied_at: new Date().toISOString(),
      applied_by: 'coherence_service'
    };

    const fixKey = `coherence:fix:${tenantId}:${date}:${meterId}`;
    await this.redis.setex(fixKey, 86400 * 90, JSON.stringify(fix)); // Keep for 90 days

    // Log the fix
    await this.logDiscrepancyFix(fix);

    // If it's an adjustment, notify billing system
    if (fixType === 'adjustment') {
      await this.notifyBillingAdjustment(tenantId, date, meterId);
    }
  }

  // Helper methods (simplified implementations)

  private async createReconciliationJob(date: string): Promise<ReconciliationJob> {
    const tenantIds = await this.getAllTenantIds();
    const job: ReconciliationJob = {
      id: Date.now().toString(),
      date,
      status: 'pending',
      tenant_count: tenantIds.length,
      processed_tenants: 0,
      errors: []
    };

    const jobKey = `coherence:job:${job.id}`;
    await this.redis.setex(jobKey, 86400, JSON.stringify(job));

    return job;
  }

  private async updateJobStatus(jobId: string, status: ReconciliationJob['status']): Promise<void> {
    const jobKey = `coherence:job:${jobId}`;
    const jobData = await this.redis.get(jobKey);
    
    if (jobData) {
      const job: ReconciliationJob = JSON.parse(jobData);
      job.status = status;
      
      if (status === 'running') {
        job.started_at = new Date().toISOString();
      } else if (status === 'completed' || status === 'failed') {
        job.completed_at = new Date().toISOString();
      }
      
      await this.redis.setex(jobKey, 86400, JSON.stringify(job));
    }
  }

  private async updateJobProgress(jobId: string, processed: number): Promise<void> {
    const jobKey = `coherence:job:${jobId}`;
    const jobData = await this.redis.get(jobKey);
    
    if (jobData) {
      const job: ReconciliationJob = JSON.parse(jobData);
      job.processed_tenants = processed;
      await this.redis.setex(jobKey, 86400, JSON.stringify(job));
    }
  }

  private async addJobError(jobId: string, error: string): Promise<void> {
    const jobKey = `coherence:job:${jobId}`;
    const jobData = await this.redis.get(jobKey);
    
    if (jobData) {
      const job: ReconciliationJob = JSON.parse(jobData);
      job.errors.push(error);
      await this.redis.setex(jobKey, 86400, JSON.stringify(job));
    }
  }

  private async getAllTenantIds(): Promise<string[]> {
    // This would get all tenant IDs from database
    return ['tenant1', 'tenant2', 'tenant3']; // Placeholder
  }

  private async getTenantUsage(tenantId: string, date: string): Promise<Map<string, number>> {
    // This would get actual usage data from usage tracking system
    const usage = new Map<string, number>();
    usage.set('sign_events', 1200);
    usage.set('verify_events', 52000);
    usage.set('tsa_tokens', 1200);
    usage.set('storage_gb', 25);
    return usage;
  }

  private async getTenantConfig(tenantId: string): Promise<{
    base_monthly_fee: number;
    included_usage: Map<string, number>;
  }> {
    // This would get tenant's plan configuration
    const includedUsage = new Map<string, number>();
    includedUsage.set('sign_events', 1000);
    includedUsage.set('verify_events', 50000);
    includedUsage.set('tsa_tokens', 1000);
    includedUsage.set('storage_gb', 50);

    return {
      base_monthly_fee: 699,
      included_usage: includedUsage
    };
  }

  private async storeCoherenceReport(report: CoherenceReport): Promise<void> {
    const reportKey = `coherence:report:${report.date}`;
    await this.redis.setex(reportKey, 86400 * 30, JSON.stringify(report)); // Keep for 30 days
  }

  private async triggerCoherenceAlerts(report: CoherenceReport): Promise<void> {
    // Send alerts to monitoring system
    console.log(`COHERENCE ALERT: ${report.critical_discrepancies.length} tenants with pricing discrepancies on ${report.date}`);
    
    for (const discrepancy of report.critical_discrepancies) {
      console.log(`- Tenant ${discrepancy.tenant_id}: ${Math.round(discrepancy.variance_percent * 100)}% variance`);
    }
  }

  private async logManualCheck(tenantId: string, date: string, check: CoherenceCheck): Promise<void> {
    const logKey = `coherence:manual_checks:${tenantId}`;
    const logEntry = {
      date,
      check,
      triggered_at: new Date().toISOString()
    };
    
    await this.redis.lpush(logKey, JSON.stringify(logEntry));
    await this.redis.ltrim(logKey, 0, 99);
  }

  private async logDiscrepancyFix(fix: any): Promise<void> {
    const logKey = 'coherence:fixes:all';
    await this.redis.lpush(logKey, JSON.stringify(fix));
    await this.redis.ltrim(logKey, 0, 999);
  }

  private async notifyBillingAdjustment(tenantId: string, date: string, meterId: string): Promise<void> {
    // This would notify the billing system of the adjustment
    console.log(`BILLING ADJUSTMENT: Tenant ${tenantId}, meter ${meterId}, date ${date}`);
  }

  /**
   * Get reconciliation job status
   */
  async getJobStatus(jobId: string): Promise<ReconciliationJob | null> {
    const jobKey = `coherence:job:${jobId}`;
    const jobData = await this.redis.get(jobKey);
    
    return jobData ? JSON.parse(jobData) : null;
  }

  /**
   * Get recent reconciliation jobs
   */
  async getRecentJobs(limit: number = 10): Promise<ReconciliationJob[]> {
    const jobKeys = await this.redis.keys('coherence:job:*');
    const jobs: ReconciliationJob[] = [];

    for (const key of jobKeys.slice(-limit)) {
      const jobData = await this.redis.get(key);
      if (jobData) {
        jobs.push(JSON.parse(jobData));
      }
    }

    return jobs.sort((a, b) => b.id.localeCompare(a.id));
  }
}
