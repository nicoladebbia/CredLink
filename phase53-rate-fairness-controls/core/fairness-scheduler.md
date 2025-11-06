# Phase 53 — Fairness Scheduler Implementation

## Deficit Round Robin (DRR) Scheduler

### DRR Fairness Scheduler
```typescript
import { EventEmitter } from 'events';

/**
 * Deficit Round Robin (DRR) scheduler for tenant fairness
 * O(1) per enqueue, appropriate for 10⁴–10⁵ rps per node
 * Weighted by tenant tier: Scale(2x), Growth(1.2x), Starter(1x)
 */
export class DRRFairnessScheduler extends EventEmitter {
  private readonly queues: Map<string, TenantQueue> = new Map();
  private readonly config: SchedulerConfig;
  private readonly activeQueues: TenantQueue[] = [];
  private currentQueueIndex = 0;
  private readonly maxQueueSize = 10000;

  constructor(config: SchedulerConfig) {
    super();
    this.config = config;
    
    // Start scheduling loop
    this.startSchedulingLoop();
  }

  /**
   * Enqueue request for tenant
   * Returns queue position and estimated wait time
   */
  enqueue(request: ScheduledRequest): QueuePosition {
    const tenantId = request.tenantId;
    const tier = request.tier;
    
    let queue = this.queues.get(tenantId);
    if (!queue) {
      const tierConfig = this.config.tiers[tier];
      queue = new TenantQueue(
        tenantId,
        tier,
        tierConfig.quantum,
        tierConfig.weight
      );
      this.queues.set(tenantId, queue);
      this.activeQueues.push(queue);
    }

    // Check queue size limit
    if (queue.size() >= this.maxQueueSize) {
      // Don't leak tenant ID in error message
      throw new Error('Queue is full');
    }

    const position = queue.enqueue(request);
    this.emit('request_enqueued', { tenantId, queueSize: queue.size() });
    
    return {
      position,
      estimatedWaitMs: this.calculateWaitTime(queue, position)
    };
  }

  /**
   * Main scheduling loop - runs every millisecond
   * Implements DRR algorithm with weighted quantums
   */
  private startSchedulingLoop(): void {
    setInterval(() => {
      this.scheduleRound();
    }, 1);
  }

  private scheduleRound(): void {
    if (this.activeQueues.length === 0) {
      return;
    }

    const startTime = Date.now();
    let processed = 0;
    const maxProcessTime = 10; // Max 10ms per scheduling cycle

    while (Date.now() - startTime < maxProcessTime && processed < 100) {
      const queue = this.getCurrentQueue();
      if (!queue || queue.isEmpty()) {
        this.moveToNextQueue();
        continue;
      }

      // Serve requests up to quantum
      const served = queue.serveUpToQuantum();
      processed += served;

      if (served > 0) {
        this.emit('requests_served', {
          tenantId: queue.tenantId,
          count: served,
          quantum: queue.quantum
        });
      }

      // If queue used less than quantum, move to next
      if (queue.deficit < this.config.minQuantum) {
        this.moveToNextQueue();
      }
    }
  }

  private getCurrentQueue(): TenantQueue | null {
    if (this.activeQueues.length === 0) {
      return null;
    }
    
    return this.activeQueues[this.currentQueueIndex];
  }

  private moveToNextQueue(): void {
    if (this.activeQueues.length === 0) {
      return;
    }

    // Reset deficit of current queue
    const currentQueue = this.activeQueues[this.currentQueueIndex];
    if (currentQueue) {
      currentQueue.resetDeficit();
    }

    // Move to next queue
    this.currentQueueIndex = (this.currentQueueIndex + 1) % this.activeQueues.length;
  }

  private calculateWaitTime(queue: TenantQueue, position: number): number {
    // Rough estimate based on queue position and service rate
    const avgServiceTime = 1; // 1ms per request
    const queueAhead = position;
    const tierConfig = this.config.tiers[queue.tier];
    const quantumCycleTime = tierConfig.quantum * avgServiceTime;
    
    return queueAhead * avgServiceTime + quantumCycleTime;
  }

  /**
   * Get fairness metrics for monitoring
   */
  getFairnessMetrics(): FairnessMetrics {
    const metrics: FairnessMetrics = {
      totalQueues: this.activeQueues.length,
      totalQueued: 0,
      queueDepths: {},
      tierUtilization: {
        starter: { served: 0, entitled: 0 },
        growth: { served: 0, entitled: 0 },
        scale: { served: 0, entitled: 0 }
      },
      fairnessScore: 0
    };

    for (const queue of this.activeQueues) {
      const depth = queue.size();
      metrics.totalQueued += depth;
      metrics.queueDepths[queue.tenantId] = depth;
      
      const tierMetrics = metrics.tierUtilization[queue.tier];
      tierMetrics.served += queue.totalServed;
      tierMetrics.entitled += this.config.tiers[queue.tier].weight;
    }

    // Calculate fairness score (0-1, where 1 is perfect fairness)
    metrics.fairnessScore = this.calculateFairnessScore(metrics.tierUtilization);

    return metrics;
  }

  private calculateFairnessScore(tierUtilization: Record<string, TierUtilization>): number {
    let totalVariance = 0;
    let totalEntitled = 0;
    
    for (const tier of ['starter', 'growth', 'scale'] as const) {
      const utilization = tierUtilization[tier];
      if (utilization.entitled > 0) {
        const actualShare = utilization.served / utilization.entitled;
        const expectedShare = 1.0; // Expected share is proportional to weight
        const variance = Math.abs(actualShare - expectedShare);
        totalVariance += variance;
        totalEntitled += utilization.entitled;
      }
    }

    if (totalEntitled === 0) {
      return 1.0;
    }

    // Fairness score decreases with variance
    return Math.max(0, 1 - (totalVariance / 3)); // Normalize by number of tiers
  }

  /**
   * Emergency drain for maintenance
   */
  async drain(timeoutMs: number = 30000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeoutMs) {
      let totalQueued = 0;
      for (const queue of this.activeQueues) {
        totalQueued += queue.size();
      }
      
      if (totalQueued === 0) {
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
}

/**
 * Per-tenant queue with DRR deficit tracking
 */
class TenantQueue {
  public readonly tenantId: string;
  public readonly tier: TenantTier;
  public readonly quantum: number;
  public readonly weight: number;
  
  private requests: ScheduledRequest[] = [];
  private deficit = 0;
  public totalServed = 0;

  constructor(tenantId: string, tier: TenantTier, quantum: number, weight: number) {
    this.tenantId = tenantId;
    this.tier = tier;
    this.quantum = quantum;
    this.weight = weight;
  }

  enqueue(request: ScheduledRequest): number {
    this.requests.push(request);
    return this.requests.length;
  }

  serveUpToQuantum(): number {
    if (this.requests.length === 0) {
      return 0;
    }

    // Add quantum to deficit
    this.deficit += this.quantum;
    
    let served = 0;
    const toServe: ScheduledRequest[] = [];
    
    // Serve requests while we have deficit
    while (this.requests.length > 0 && this.deficit > 0) {
      const request = this.requests.shift()!;
      const cost = this.getRequestCost(request);
      
      if (cost <= this.deficit) {
        this.deficit -= cost;
        toServe.push(request);
        served++;
      } else {
        // Put request back and stop serving
        this.requests.unshift(request);
        break;
      }
    }

    // Process served requests
    for (const request of toServe) {
      request.resolve();
      this.totalServed++;
    }

    return served;
  }

  private getRequestCost(request: ScheduledRequest): number {
    // Different request types have different costs
    switch (request.type) {
      case 'verify':
        return 1;
      case 'sign':
        return 2; // More expensive
      case 'batch':
        return request.batchSize || 1;
      default:
        return 1;
    }
  }

  resetDeficit(): void {
    this.deficit = 0;
  }

  size(): number {
    return this.requests.length;
  }

  isEmpty(): boolean {
    return this.requests.length === 0;
  }
}

/**
 * Request wrapper for scheduling
 */
interface ScheduledRequest {
  tenantId: string;
  tier: TenantTier;
  type: 'verify' | 'sign' | 'batch';
  priority: number;
  timestamp: number;
  resolve: () => void;
  reject: (error: Error) => void;
  batchSize?: number;
}

interface QueuePosition {
  position: number;
  estimatedWaitMs: number;
}

interface FairnessMetrics {
  totalQueues: number;
  totalQueued: number;
  queueDepths: Record<string, number>;
  tierUtilization: Record<TenantTier, {
    served: number;
    entitled: number;
  }>;
  fairnessScore: number;
}

// Configuration per specification
export interface SchedulerConfig {
  tiers: Record<TenantTier, TierSchedulerConfig>;
  quantumByTier: Record<TenantTier, number>;
  minQuantum: number;
}

export interface TierSchedulerConfig {
  weight: number;
  quantum: number;
}

export type TenantTier = 'starter' | 'growth' | 'scale';

export const DEFAULT_SCHEDULER_CONFIG: SchedulerConfig = {
  tiers: {
    starter: {
      weight: 1.0,
      quantum: 20
    },
    growth: {
      weight: 1.2,
      quantum: 24
    },
    scale: {
      weight: 2.0,
      quantum: 40
    }
  },
  quantumByTier: {
    starter: 20,
    growth: 24,
    scale: 40
  },
  minQuantum: 5
};
```

### Fairness Monitoring and Alarms
```typescript
/**
 * Fairness monitoring with alerts for paid tenant protection
 */
export class FairnessMonitor {
  private readonly scheduler: DRRFairnessScheduler;
  private readonly metrics: Map<string, TierMetrics[]> = new Map();
  private readonly alertThresholds: AlertThresholds;

  constructor(
    scheduler: DRRFairnessScheduler,
    alertThresholds: AlertThresholds
  ) {
    this.scheduler = scheduler;
    this.alertThresholds = alertThresholds;
    
    // Start monitoring every minute
    setInterval(() => this.collectMetrics(), 60000);
    
    // Check fairness every 5 minutes
    setInterval(() => this.checkFairness(), 300000);
  }

  private collectMetrics(): void {
    const fairnessMetrics = this.scheduler.getFairnessMetrics();
    const timestamp = Date.now();
    
    for (const tier of ['starter', 'growth', 'scale'] as const) {
      const tierMetrics = fairnessMetrics.tierUtilization[tier];
      
      if (!this.metrics.has(tier)) {
        this.metrics.set(tier, []);
      }
      
      const tierHistory = this.metrics.get(tier)!;
      tierHistory.push({
        timestamp,
        served: tierMetrics.served,
        entitled: tierMetrics.entitled,
        utilization: tierMetrics.entitled > 0 ? tierMetrics.served / tierMetrics.entitled : 0
      });
      
      // Keep only last hour of data
      const oneHourAgo = timestamp - 3600000;
      tierHistory.splice(0, tierHistory.findIndex(m => m.timestamp > oneHourAgo));
    }
  }

  private checkFairness(): void {
    const fairnessMetrics = this.scheduler.getFairnessMetrics();
    
    // Check if any paid tenant's 5-min share < 80% of entitlement during contention
    for (const tier of ['growth', 'scale'] as const) {
      const tierMetrics = fairnessMetrics.tierUtilization[tier];
      
      if (tierMetrics.entitled > 0) {
        const actualShare = tierMetrics.served / tierMetrics.entitled;
        const minRequiredShare = this.alertThresholds.minPaidTenantShare;
        
        if (actualShare < minRequiredShare) {
          this.emitAlert({
            type: 'fairness_violation',
            tier,
            actualShare,
            requiredShare: minRequiredShare,
            timestamp: Date.now()
          });
        }
      }
    }
    
    // Check overall fairness score
    if (fairnessMetrics.fairnessScore < this.alertThresholds.minFairnessScore) {
      this.emitAlert({
        type: 'low_fairness_score',
        score: fairnessMetrics.fairnessScore,
        threshold: this.alertThresholds.minFairnessScore,
        timestamp: Date.now()
      });
    }
  }

  private emitAlert(alert: FairnessAlert): void {
    // Send to monitoring system
    this.emit('fairness_alert', alert);
    
    // Could integrate with PagerDuty, Slack, etc.
  }

  /**
   * Get detailed fairness report
   */
  getFairnessReport(): FairnessReport {
    const currentMetrics = this.scheduler.getFairnessMetrics();
    
    return {
      timestamp: Date.now(),
      currentMetrics,
      historicalTrends: this.getHistoricalTrends(),
      alerts: this.getRecentAlerts(),
      recommendations: this.generateRecommendations(currentMetrics)
    };
  }

  private getHistoricalTrends(): Record<TenantTier, TrendMetrics> {
    const trends: Record<string, TrendMetrics> = {};
    
    for (const [tier, history] of this.metrics.entries()) {
      if (history.length < 2) {
        continue;
      }
      
      const recent = history.slice(-10); // Last 10 data points
      const avgUtilization = recent.reduce((sum, m) => sum + m.utilization, 0) / recent.length;
      const utilizationVariance = this.calculateVariance(recent.map(m => m.utilization));
      
      trends[tier] = {
        avgUtilization,
        utilizationVariance,
        trend: this.calculateTrend(recent.map(m => m.utilization))
      };
    }
    
    return trends as Record<TenantTier, TrendMetrics>;
  }

  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    return variance;
  }

  private calculateTrend(values: number[]): 'increasing' | 'decreasing' | 'stable' {
    if (values.length < 3) {
      return 'stable';
    }
    
    const firstHalf = values.slice(0, Math.floor(values.length / 2));
    const secondHalf = values.slice(Math.floor(values.length / 2));
    
    const firstAvg = firstHalf.reduce((sum, val) => sum + val, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((sum, val) => sum + val, 0) / secondHalf.length;
    
    const diff = secondAvg - firstAvg;
    if (Math.abs(diff) < 0.1) {
      return 'stable';
    }
    
    return diff > 0 ? 'increasing' : 'decreasing';
  }

  private getRecentAlerts(): FairnessAlert[] {
    // In a real implementation, this would query an alert store
    return [];
  }

  private generateRecommendations(metrics: FairnessMetrics): string[] {
    const recommendations: string[] = [];
    
    if (metrics.fairnessScore < 0.8) {
      recommendations.push('Consider adjusting tier weights or quantums');
    }
    
    for (const tier of ['growth', 'scale'] as const) {
      const tierMetrics = metrics.tierUtilization[tier];
      if (tierMetrics.entitled > 0) {
        const utilization = tierMetrics.served / tierMetrics.entitled;
        if (utilization < 0.8) {
          recommendations.push(`${tier} tier experiencing under-utilization`);
        }
      }
    }
    
    if (metrics.totalQueued > 1000) {
      recommendations.push('High queue depth detected - consider scaling');
    }
    
    return recommendations;
  }
}

interface TierMetrics {
  timestamp: number;
  served: number;
  entitled: number;
  utilization: number;
}

interface TrendMetrics {
  avgUtilization: number;
  utilizationVariance: number;
  trend: 'increasing' | 'decreasing' | 'stable';
}

interface FairnessAlert {
  type: 'fairness_violation' | 'low_fairness_score';
  tier?: TenantTier;
  actualShare?: number;
  requiredShare?: number;
  score?: number;
  threshold?: number;
  timestamp: number;
}

interface FairnessReport {
  timestamp: number;
  currentMetrics: FairnessMetrics;
  historicalTrends: Record<TenantTier, TrendMetrics>;
  alerts: FairnessAlert[];
  recommendations: string[];
}

interface AlertThresholds {
  minPaidTenantShare: number; // Default 0.8 (80%)
  minFairnessScore: number;   // Default 0.7
}

export const DEFAULT_ALERT_THRESHOLDS: AlertThresholds = {
  minPaidTenantShare: 0.8,
  minFairnessScore: 0.7
};
```
