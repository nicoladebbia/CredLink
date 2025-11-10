/**
 * Phase 36 Billing - Usage Service
 * Usage metering, aggregation, and Stripe integration
 */

import { Redis } from 'ioredis';
import { 
  UsageEvent,
  UsageWindow,
  UsageAggregate,
  UsageCostBreakdown,
  TenantUsage
} from '@/types';

export interface UsageServiceConfig {
  redis: Redis;
  aggregationWindowMinutes: number;
  batchSize: number;
  retryAttempts: number;
  retryDelayMs: number;
}

export class UsageService {
  private redis: Redis;
  private config: UsageServiceConfig;

  constructor(config: UsageServiceConfig) {
    this.redis = config.redis;
    this.config = config;
  }

  /**
   * Record usage event
   */
  async recordUsage(event: UsageEvent): Promise<void> {
    try {
      // Store event in Redis with expiration
      const eventKey = `usage:event:${event.tenant_id}:${Date.now()}-${Math.random()}`;
      await this.redis.setex(
        eventKey,
        86400 * 7, // 7 days retention
        JSON.stringify(event)
      );

      // Update current window counter
      await this.updateWindowCounter(event);

      // Update tenant usage summary
      await this.updateTenantUsage(event);
    } catch (error) {
      throw new Error(`Failed to record usage: ${error}`);
    }
  }

  /**
   * Record multiple usage events (batch)
   */
  async recordUsageBatch(events: UsageEvent[]): Promise<void> {
    const promises = events.map(event => this.recordUsage(event));
    await Promise.all(promises);
  }

  /**
   * Get usage for tenant in a date range
   */
  async getUsage(
    tenantId: string,
    startDate: string,
    endDate: string,
    granularity: 'hour' | 'day' | 'month' = 'day'
  ): Promise<UsageAggregate[]> {
    try {
      const start = new Date(startDate);
      const end = new Date(endDate);
      const aggregates: UsageAggregate[] = [];

      // Generate time windows based on granularity
      const windows = this.generateTimeWindows(start, end, granularity);

      for (const window of windows) {
        const aggregate = await this.calculateAggregate(tenantId, window.start, window.end, granularity);
        aggregates.push(aggregate);
      }

      return aggregates;
    } catch (error) {
      throw new Error(`Failed to get usage: ${error}`);
    }
  }

  /**
   * Get current month usage for tenant
   */
  async getCurrentMonthUsage(tenantId: string): Promise<TenantUsage> {
    try {
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const aggregate = await this.calculateAggregate(tenantId, startOfMonth.toISOString(), endOfMonth.toISOString(), 'month');

      // Get lifetime usage
      const lifetimeKey = `usage:lifetime:${tenantId}`;
      const lifetimeData = await this.redis.get(lifetimeKey);
      const lifetime = lifetimeData ? JSON.parse(lifetimeData) : {
        sign_events: 0,
        verify_events: 0,
        rfc3161_timestamps: 0,
      };

      return {
        current_month: {
          sign_events: aggregate.sign_events,
          verify_events: aggregate.verify_events,
          rfc3161_timestamps: aggregate.rfc3161_timestamps,
        },
        lifetime,
        last_reset: startOfMonth.toISOString(),
      };
    } catch (error) {
      throw new Error(`Failed to get current month usage: ${error}`);
    }
  }

  /**
   * Get usage windows for a tenant
   */
  async getUsageWindows(tenantId: string, limit: number = 100): Promise<UsageWindow[]> {
    try {
      const pattern = `usage:window:${tenantId}:*`;
      const keys = await this.redis.keys(pattern);
      
      // Sort keys by timestamp (descending)
      keys.sort((a: string, b: string) => {
        const aTime = a.split(':').pop() || '';
        const bTime = b.split(':').pop() || '';
        return bTime.localeCompare(aTime);
      });

      const windows: UsageWindow[] = [];
      for (const key of keys.slice(0, limit)) {
        const data = await this.redis.get(key);
        if (data) {
          windows.push(JSON.parse(data));
        }
      }

      return windows;
    } catch (error) {
      throw new Error(`Failed to get usage windows: ${error}`);
    }
  }

  /**
   * Process usage aggregation and push to Stripe
   */
  async processUsageAggregation(): Promise<void> {
    try {
      // Get all tenants with usage
      const pattern = `usage:window:*`;
      const keys = await this.redis.keys(pattern);

      // Group by tenant
      const tenantGroups = new Map<string, string[]>();
      for (const key of keys) {
        const parts = key.split(':');
        const tenantId = parts[2];
        
        if (!tenantId) {
          continue; // Skip invalid keys
        }
        
        if (!tenantGroups.has(tenantId)) {
          tenantGroups.set(tenantId, []);
        }
        tenantGroups.get(tenantId)!.push(key);
      }

      // Process each tenant's usage
      for (const [tenantId, windowKeys] of tenantGroups) {
        await this.processTenantUsage(tenantId, windowKeys);
      }
    } catch (error) {
      console.error('Failed to process usage aggregation:', error);
      throw error;
    }
  }

  /**
   * Calculate usage costs for billing
   */
  async calculateUsageCosts(
    tenantId: string,
    plan: 'starter' | 'pro' | 'enterprise',
    usage: UsageAggregate
  ): Promise<UsageCostBreakdown> {
    try {
      // Plan pricing
      const planPricing = {
        starter: { base: 199, included_signs: 500, included_verifies: 10000 },
        pro: { base: 699, included_signs: 2000, included_verifies: 50000 },
        enterprise: { base: 2000, included_signs: 10000, included_verifies: 250000 },
      };

      const pricing = planPricing[plan];
      
      // Calculate overage costs
      const signOverage = Math.max(0, usage.sign_events - pricing.included_signs);
      const verifyOverage = Math.max(0, usage.verify_events - pricing.included_verifies);

      // Overage pricing (per unit)
      const signOveragePricing = this.getSignOveragePricing(signOverage);
      const verifyOveragePricing = this.getVerifyOveragePricing(usage.verify_events);
      const timestampPricing = usage.rfc3161_timestamps * 0.50; // $0.50 per timestamp

      const costBreakdown: UsageCostBreakdown = {
        base_plan: pricing.base,
        sign_events_overage: signOveragePricing.total,
        verify_events_usage: verifyOveragePricing.total,
        rfc3161_timestamps_usage: timestampPricing,
        total: pricing.base + signOveragePricing.total + verifyOveragePricing.total + timestampPricing,
      };

      return costBreakdown;
    } catch (error) {
      throw new Error(`Failed to calculate usage costs: ${error}`);
    }
  }

  /**
   * Reset monthly usage counters
   */
  async resetMonthlyUsage(tenantId: string): Promise<void> {
    try {
      const monthlyKey = `usage:monthly:${tenantId}`;
      await this.redis.del(monthlyKey);

      // Update last reset timestamp
      const resetKey = `usage:reset:${tenantId}`;
      await this.redis.set(resetKey, new Date().toISOString());
    } catch (error) {
      throw new Error(`Failed to reset monthly usage: ${error}`);
    }
  }

  /**
   * Get usage statistics for dashboard
   */
  async getUsageStats(tenantId: string): Promise<{
    current_month: TenantUsage;
    last_month: TenantUsage;
    trend: {
      sign_events_change: number;
      verify_events_change: number;
      rfc3161_timestamps_change: number;
    };
  }> {
    try {
      const current = await this.getCurrentMonthUsage(tenantId);
      
      // Get last month usage
      const now = new Date();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
      
      const lastMonthAggregates = await this.getUsage(
        tenantId,
        lastMonthStart.toISOString(),
        lastMonthEnd.toISOString(),
        'month'
      );

      const lastMonthUsage = lastMonthAggregates[0] || {
        sign_events: 0,
        verify_events: 0,
        rfc3161_timestamps: 0,
      };

      const lastMonth: TenantUsage = {
        current_month: lastMonthUsage,
        lifetime: current.lifetime, // Lifetime doesn't change
        last_reset: lastMonthStart.toISOString(),
      };

      // Calculate trend
      const trend = {
        sign_events_change: this.calculatePercentageChange(
          lastMonthUsage.sign_events,
          current.current_month.sign_events
        ),
        verify_events_change: this.calculatePercentageChange(
          lastMonthUsage.verify_events,
          current.current_month.verify_events
        ),
        rfc3161_timestamps_change: this.calculatePercentageChange(
          lastMonthUsage.rfc3161_timestamps,
          current.current_month.rfc3161_timestamps
        ),
      };

      return {
        current_month: current,
        last_month: lastMonth,
        trend,
      };
    } catch (error) {
      throw new Error(`Failed to get usage stats: ${error}`);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async updateWindowCounter(event: UsageEvent): Promise<void> {
    const windowStart = this.getWindowStart(event.timestamp);
    const windowKey = `usage:window:${event.tenant_id}:${windowStart}`;

    // Use Redis atomic operations
    const pipeline = this.redis.pipeline();
    pipeline.hincrby(windowKey, event.event_type, event.value);
    pipeline.expire(windowKey, 86400 * 30); // 30 days retention
    await pipeline.exec();

    // Update window metadata
    const windowData: UsageWindow = {
      tenant_id: event.tenant_id,
      window: windowStart,
      sign_events: event.event_type === 'sign_events' ? event.value : 0,
      verify_events: event.event_type === 'verify_events' ? event.value : 0,
      rfc3161_timestamps: event.event_type === 'rfc3161_timestamps' ? event.value : 0,
      created_at: new Date().toISOString(),
    };

    // Get existing window data and update
    const existingData = await this.redis.hgetall(windowKey);
    if (Object.keys(existingData).length > 0) {
      windowData['sign_events'] += parseInt(existingData['sign_events'] || '0');
      windowData['verify_events'] += parseInt(existingData['verify_events'] || '0');
      windowData['rfc3161_timestamps'] += parseInt(existingData['rfc3161_timestamps'] || '0');
    }

    await this.redis.setex(windowKey, 86400 * 30, JSON.stringify(windowData));
  }

  private async updateTenantUsage(event: UsageEvent): Promise<void> {
    const monthlyKey = `usage:monthly:${event.tenant_id}`;
    const lifetimeKey = `usage:lifetime:${event.tenant_id}`;

    const pipeline = this.redis.pipeline();
    
    // Update monthly usage
    pipeline.hincrby(monthlyKey, event.event_type, event.value);
    pipeline.expire(monthlyKey, 86400 * 45); // 45 days retention
    
    // Update lifetime usage
    pipeline.hincrby(lifetimeKey, event.event_type, event.value);
    pipeline.expire(lifetimeKey, 86400 * 3650); // 10 years retention
    
    await pipeline.exec();
  }

  private getWindowStart(timestamp: string): string {
    const date = new Date(timestamp);
    const windowStart = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      Math.floor(date.getHours() / this.config.aggregationWindowMinutes) * this.config.aggregationWindowMinutes,
      0,
      0,
      0
    );
    return windowStart.toISOString().replace(/:\d+\.\d+Z$/, ':00Z');
  }

  private generateTimeWindows(start: Date, end: Date, granularity: 'hour' | 'day' | 'month'): Array<{ start: string; end: string }> {
    const windows = [];
    const current = new Date(start);

    while (current < end) {
      const windowStart = new Date(current);
      let windowEnd: Date;

      switch (granularity) {
        case 'hour':
          windowEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate(), current.getHours() + 1, 0, 0, 0);
          current.setHours(current.getHours() + 1);
          break;
        case 'day':
          windowEnd = new Date(current.getFullYear(), current.getMonth(), current.getDate() + 1, 0, 0, 0, 0);
          current.setDate(current.getDate() + 1);
          break;
        case 'month':
          windowEnd = new Date(current.getFullYear(), current.getMonth() + 1, 1, 0, 0, 0, 0);
          current.setMonth(current.getMonth() + 1);
          break;
      }

      windows.push({
        start: windowStart.toISOString(),
        end: windowEnd.toISOString(),
      });
    }

    return windows;
  }

  private async calculateAggregate(
    tenantId: string,
    startDate: string,
    endDate: string,
    granularity: 'hour' | 'day' | 'month'
  ): Promise<UsageAggregate> {
    const pattern = `usage:window:${tenantId}:*`;
    const keys = await this.redis.keys(pattern);

    let totalSignEvents = 0;
    let totalVerifyEvents = 0;
    let totalTimestamps = 0;

    for (const key of keys) {
      const data = await this.redis.get(key);
      if (data) {
        const window: UsageWindow = JSON.parse(data);
        
        // Check if window is within date range
        if (window.window >= startDate && window.window < endDate) {
          totalSignEvents += window.sign_events;
          totalVerifyEvents += window.verify_events;
          totalTimestamps += window.rfc3161_timestamps;
        }
      }
    }

    const costBreakdown: UsageCostBreakdown = {
      base_plan: 0, // Will be calculated based on plan
      sign_events_overage: 0,
      verify_events_usage: 0,
      rfc3161_timestamps_usage: 0,
      total: 0,
    };

    return {
      tenant_id: tenantId,
      period: granularity,
      start_date: startDate,
      end_date: endDate,
      sign_events: totalSignEvents,
      verify_events: totalVerifyEvents,
      rfc3161_timestamps: totalTimestamps,
      cost_breakdown: costBreakdown,
    };
  }

  private async processTenantUsage(tenantId: string, windowKeys: string[]): Promise<void> {
    // Group windows by processing status
    const processedWindows = [];
    const unprocessedWindows = [];

    for (const key of windowKeys) {
      const processed = await this.redis.get(`${key}:processed`);
      if (processed) {
        processedWindows.push(key);
      } else {
        unprocessedWindows.push(key);
      }
    }

    // Process unprocessed windows
    for (const key of unprocessedWindows) {
      try {
        const data = await this.redis.get(key);
        if (data) {
          const window: UsageWindow = JSON.parse(data);
          
          // Push to Stripe (this would integrate with StripeService)
          await this.pushUsageToStripe(window);
          
          // Mark as processed
          await this.redis.setex(`${key}:processed`, 86400 * 7, 'true');
        }
      } catch (error) {
        console.error(`Failed to process window ${key}:`, error);
      }
    }
  }

  private async pushUsageToStripe(window: UsageWindow): Promise<void> {
    // This would integrate with StripeService to create usage events
    console.log(`Pushing usage to Stripe for tenant ${window.tenant_id}:`, {
      sign_events: window.sign_events,
      verify_events: window.verify_events,
      rfc3161_timestamps: window.rfc3161_timestamps,
    });
  }

  private getSignOveragePricing(overageUnits: number): { tiers: Array<{ units: number; rate: number; cost: number }>; total: number } {
    const tiers = [
      { units: Math.min(overageUnits, 1000), rate: 0.50, cost: 0 }, // $0.50 per sign for first 1k overage
      { units: Math.min(Math.max(overageUnits - 1000, 0), 5000), rate: 0.40, cost: 0 }, // $0.40 per sign for next 5k
      { units: Math.max(overageUnits - 6000, 0), rate: 0.30, cost: 0 }, // $0.30 per sign for remaining
    ].filter(tier => tier.units > 0);

    // Calculate cost for each tier
    tiers.forEach(tier => {
      tier.cost = tier.units * tier.rate;
    });

    const total = tiers.reduce((sum, tier) => sum + tier.cost, 0);

    return { tiers, total };
  }

  private getVerifyOveragePricing(totalVerifications: number): { tiers: Array<{ units: number; rate: number; cost: number }>; total: number } {
    const tiers = [
      { units: Math.min(totalVerifications, 10000), rate: 0.01, cost: 0 }, // $0.01 per verify for first 10k
      { units: Math.min(Math.max(totalVerifications - 10000, 0), 50000), rate: 0.008, cost: 0 }, // $0.008 per verify for next 50k
      { units: Math.min(Math.max(totalVerifications - 60000, 0), 100000), rate: 0.006, cost: 0 }, // $0.006 per verify for next 100k
      { units: Math.max(totalVerifications - 160000, 0), rate: 0.004, cost: 0 }, // $0.004 per verify for remaining
    ].filter(tier => tier.units > 0);

    // Calculate cost for each tier
    tiers.forEach(tier => {
      tier.cost = tier.units * tier.rate;
    });

    const total = tiers.reduce((sum, tier) => sum + tier.cost, 0);

    return { tiers, total };
  }

  private calculatePercentageChange(previous: number, current: number): number {
    if (previous === 0) {
      return current > 0 ? 100 : 0;
    }
    return Math.round(((current - previous) / previous) * 100);
  }
}
