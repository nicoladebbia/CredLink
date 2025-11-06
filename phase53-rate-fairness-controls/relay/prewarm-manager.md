# Phase 53 — Verified Cache Prewarm Implementation

## Cache Prewarm Manager

### Prewarm Manager Implementation
```typescript
import { Redis } from 'ioredis';
import { EventEmitter } from 'events';
import { randomBytes } from 'crypto';

/**
 * Cache prewarm manager for hot assets
 * Prewarms verify cache for front-page/breaking assets
 */
export class PrewarmManager extends EventEmitter {
  private readonly redis: Redis;
  private readonly verifyCache: VerifyCache;
  private readonly config: PrewarmConfig;
  private readonly prewarmQueue: PrewarmQueue;
  private readonly hotAssetTracker: HotAssetTracker;

  constructor(
    redis: Redis,
    verifyCache: VerifyCache,
    config: PrewarmConfig
  ) {
    super();
    this.redis = redis;
    this.verifyCache = verifyCache;
    this.config = config;
    this.prewarmQueue = new PrewarmQueue(config.maxConcurrentPrewarms);
    this.hotAssetTracker = new HotAssetTracker(redis);
    
    // Start prewarm worker
    this.startPrewarmWorker();
    
    // Start hot asset detection
    this.startHotAssetDetection();
  }

  /**
   * Manually trigger prewarm for specific assets
   */
  async triggerPrewarm(assets: HotAssetRequest[]): Promise<PrewarmResult> {
    const hotAssets = assets.map(req => ({
      assetHash: req.assetHash,
      policyId: req.policyId || 'default',
      priority: req.priority || 1,
      expectedRequests: req.expectedRequests
    }));

    return this.verifyCache.prewarm(hotAssets);
  }

  /**
   * Prewarm assets based on prediction model
   */
  async triggerPredictivePrewarm(): Promise<PrewarmResult> {
    const predictedAssets = await this.predictHotAssets();
    
    if (predictedAssets.length === 0) {
      return { total: 0, successful: 0, failed: 0, errors: [] };
    }

    this.emit('predictive_prewarm_triggered', { count: predictedAssets.length });
    return this.verifyCache.prewarm(predictedAssets);
  }

  /**
   * Schedule prewarm for future assets (e.g., scheduled publications)
   */
  async schedulePrewarm(
    assetHash: string,
    scheduledTime: Date,
    policyId: string = 'default',
    priority: number = 1
  ): Promise<void> {
    const scheduledPrewarm: ScheduledPrewarm = {
      assetHash,
      policyId,
      priority,
      scheduledTime: scheduledTime.getTime(),
      createdAt: Date.now()
    };

    await this.redis.zadd(
      'prewarm:scheduled',
      scheduledTime.getTime(),
      JSON.stringify(scheduledPrewarm)
    );

    this.emit('prewarm_scheduled', { assetHash, scheduledTime });
  }

  /**
   * Add asset to hot list based on real-time traffic
   */
  async addToHotList(
    assetHash: string,
    policyId: string = 'default',
    trafficMetrics: TrafficMetrics
  ): Promise<void> {
    const hotAsset: HotAsset = {
      assetHash,
      policyId,
      priority: this.calculatePriority(trafficMetrics),
      expectedRequests: trafficMetrics.requestsPerMinute
    };

    await this.hotAssetTracker.addHotAsset(hotAsset);
    
    // Trigger immediate prewarm if traffic is high
    if (trafficMetrics.requestsPerMinute > this.config.immediatePrewarmThreshold) {
      this.verifyCache.prewarm([hotAsset]).catch(error => {
        this.emit('prewarm_error', { type: 'immediate', error });
      });
    }
  }

  private startPrewarmWorker(): void {
    setInterval(async () => {
      await this.processScheduledPrewarms();
    }, 5000); // Check every 5 seconds
  }

  private startHotAssetDetection(): void {
    setInterval(async () => {
      await this.detectAndPrewarmHotAssets();
    }, 60000); // Check every minute
  }

  private async processScheduledPrewarms(): Promise<void> {
    const now = Date.now();
    const scheduledPrewarms = await this.redis.zrangebyscore(
      'prewarm:scheduled',
      0,
      now,
      'LIMIT',
      0,
      this.config.maxScheduledPrewarmsPerBatch
    );

    for (const prewarmData of scheduledPrewarms) {
      try {
        const scheduledPrewarm: ScheduledPrewarm = JSON.parse(prewarmData);
        
        // Remove from scheduled list
        await this.redis.zrem('prewarm:scheduled', prewarmData);
        
        // Add to processing queue
        this.prewarmQueue.enqueue({
          assetHash: scheduledPrewarm.assetHash,
          policyId: scheduledPrewarm.policyId,
          priority: scheduledPrewarm.priority,
          source: 'scheduled'
        });
        
      } catch (error) {
        this.emit('prewarm_error', { type: 'scheduled', error });
      }
    }
  }

  private async detectAndPrewarmHotAssets(): Promise<void> {
    const hotAssets = await this.hotAssetTracker.getHotAssets(this.config.maxHotAssetsPerBatch);
    
    if (hotAssets.length > 0) {
      this.emit('hot_assets_detected', { count: hotAssets.length });
      
      // Filter out already cached assets
      const uncachedAssets = await this.filterUncachedAssets(hotAssets);
      
      if (uncachedAssets.length > 0) {
        this.verifyCache.prewarm(uncachedAssets).catch(error => {
          this.emit('prewarm_error', { type: 'hot_asset', error });
        });
      }
    }
  }

  private async filterUncachedAssets(assets: HotAsset[]): Promise<HotAsset[]> {
    const uncached: HotAsset[] = [];
    
    for (const asset of assets) {
      const cacheResult = await this.verifyCache.get(asset.assetHash, asset.policyId);
      
      if (cacheResult.status === 'miss') {
        uncached.push(asset);
      }
    }
    
    return uncached;
  }

  private async predictHotAssets(): Promise<HotAsset[]> {
    // In a real implementation, this would use ML models
    // For now, use simple heuristics based on recent traffic
    
    const recentAssets = await this.hotAssetTracker.getRecentTrendingAssets(
      this.config.predictionWindowMinutes
    );
    
    return recentAssets.map(asset => ({
      ...asset,
      priority: Math.ceil(asset.expectedRequests / 10) // Scale priority based on traffic
    }));
  }

  private calculatePriority(metrics: TrafficMetrics): number {
    // Higher priority for higher traffic and growth rate
    const trafficScore = Math.min(metrics.requestsPerMinute / 100, 10);
    const growthScore = Math.min(metrics.growthRate * 5, 5);
    
    return Math.ceil(trafficScore + growthScore);
  }

  /**
   * Get prewarm statistics
   */
  async getStatistics(): Promise<PrewarmStatistics> {
    const scheduledCount = await this.redis.zcard('prewarm:scheduled');
    const hotAssetsCount = await this.hotAssetTracker.getHotAssetsCount();
    const queueMetrics = this.prewarmQueue.getMetrics();
    
    return {
      scheduledPrewarms: scheduledCount,
      hotAssetsTracked: hotAssetsCount,
      queueMetrics,
      lastPrewarmTime: await this.getLastPrewarmTime(),
      prewarmHitRate: await this.calculatePrewarmHitRate()
    };
  }

  private async getLastPrewarmTime(): Promise<number> {
    const lastPrewarm = await this.redis.get('prewarm:last_time');
    return lastPrewarm ? parseInt(lastPrewarm, 10) : 0;
  }

  private async calculatePrewarmHitRate(): Promise<number> {
    // In a real implementation, track prewarm effectiveness
    // For now, return a simulated value
    return 0.85; // 85% hit rate for prewarmed assets
  }
}

/**
 * Queue for managing concurrent prewarm operations
 */
class PrewarmQueue {
  private readonly maxConcurrent: number;
  private readonly queue: PrewarmTask[] = [];
  private running = 0;

  constructor(maxConcurrent: number) {
    this.maxConcurrent = maxConcurrent;
  }

  enqueue(task: PrewarmTask): void {
    this.queue.push(task);
    this.processQueue();
  }

  private async processQueue(): Promise<void> {
    if (this.running >= this.maxConcurrent || this.queue.length === 0) {
      return;
    }

    const task = this.queue.shift()!;
    this.running++;

    try {
      await this.executeTask(task);
    } catch (error) {
      this.emit('task_error', { task, error });
    } finally {
      this.running--;
      this.processQueue(); // Process next task
    }
  }

  private async executeTask(task: PrewarmTask): Promise<void> {
    this.emit('task_started', { assetHash: task.assetHash, source: task.source });
    
    // Simulate prewarm execution
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // In a real implementation, this would call the verify cache prewarm
  }

  getMetrics(): QueueMetrics {
    return {
      queueLength: this.queue.length,
      runningTasks: this.running,
      maxConcurrent: this.maxConcurrent
    };
  }
}

/**
 * Track hot assets based on traffic patterns
 */
class HotAssetTracker {
  private readonly redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
  }

  async addHotAsset(asset: HotAsset): Promise<void> {
    const key = `hot_assets:${asset.assetHash}:${asset.policyId}`;
    const data = {
      ...asset,
      lastSeen: Date.now()
    };

    await this.redis.hset(key, 'data', JSON.stringify(data));
    await this.redis.expire(key, 3600); // 1 hour expiry
    
    // Add to trending list with score based on traffic
    await this.redis.zadd(
      'hot_assets:trending',
      asset.expectedRequests || 0,
      `${asset.assetHash}:${asset.policyId}`
    );
    await this.redis.expire('hot_assets:trending', 3600);
  }

  async getHotAssets(limit: number = 100): Promise<HotAsset[]> {
    const trendingKeys = await this.redis.zrevrange(
      'hot_assets:trending',
      0,
      limit - 1
    );

    const assets: HotAsset[] = [];
    
    for (const key of trendingKeys) {
      const [assetHash, policyId] = key.split(':');
      const data = await this.redis.hget(key, 'data');
      
      if (data) {
        try {
          const parsedData = JSON.parse(data);
          if (parsedData && parsedData.assetHash && parsedData.policyId) {
            assets.push(parsedData);
          }
        } catch (error) {
          this.emit('parse_error', { key, error });
        }
      }
    }

    return assets;
  }

  async getRecentTrendingAssets(windowMinutes: number): Promise<HotAsset[]> {
    // Get assets with recent traffic spikes
    const now = Date.now();
    const windowStart = now - (windowMinutes * 60 * 1000);
    
    // In a real implementation, this would query traffic metrics
    // For now, return empty array
    return [];
  }

  async getHotAssetsCount(): Promise<number> {
    return await this.redis.zcard('hot_assets:trending');
  }
}

// Type definitions
export interface HotAssetRequest {
  assetHash: string;
  policyId?: string;
  priority?: number;
  expectedRequests?: number;
}

export interface HotAsset {
  assetHash: string;
  policyId: string;
  priority: number;
  expectedRequests?: number;
}

export interface TrafficMetrics {
  requestsPerMinute: number;
  growthRate: number;
  uniqueUsers: number;
}

export interface ScheduledPrewarm {
  assetHash: string;
  policyId: string;
  priority: number;
  scheduledTime: number;
  createdAt: number;
}

export interface PrewarmTask {
  assetHash: string;
  policyId: string;
  priority: number;
  source: 'manual' | 'scheduled' | 'predicted';
}

export interface QueueMetrics {
  queueLength: number;
  runningTasks: number;
  maxConcurrent: number;
}

export interface PrewarmStatistics {
  scheduledPrewarms: number;
  hotAssetsTracked: number;
  queueMetrics: QueueMetrics;
  lastPrewarmTime: number;
  prewarmHitRate: number;
}

export interface PrewarmConfig {
  maxConcurrentPrewarms: number;
  maxHotAssetsPerBatch: number;
  maxScheduledPrewarmsPerBatch: number;
  immediatePrewarmThreshold: number;
  predictionWindowMinutes: number;
}

// Default configuration
export const DEFAULT_PREWARM_CONFIG: PrewarmConfig = {
  maxConcurrentPrewarms: 10,
  maxHotAssetsPerBatch: 50,
  maxScheduledPrewarmsPerBatch: 20,
  immediatePrewarmThreshold: 100, // requests per minute
  predictionWindowMinutes: 30
};
```

### Publisher API Integration
```typescript
/**
 * Publisher API for prewarm management
 */
export class PublisherPrewarmAPI {
  private readonly prewarmManager: PrewarmManager;

  constructor(prewarmManager: PrewarmManager) {
    this.prewarmManager = prewarmManager;
  }

  /**
   * Handle publisher prewarm request
   */
  async handlePrewarmRequest(request: PublisherPrewarmRequest): Promise<PrewarmResponse> {
    try {
      // Validate request
      this.validateRequest(request);
      
      // Trigger prewarm
      const result = await this.prewarmManager.triggerPrewarm(request.assets);
      
      return {
        success: true,
        result,
        requestId: this.generateRequestId(),
        timestamp: Date.now()
      };
      
    } catch (error) {
      return {
        success: false,
        error: 'Prewarm request failed',
        requestId: this.generateRequestId(),
        timestamp: Date.now()
      };
    }
  }

  /**
   * Schedule prewarm for future publication
   */
  async schedulePrewarm(request: SchedulePrewarmRequest): Promise<ScheduleResponse> {
    try {
      this.validateScheduleRequest(request);
      
      await this.prewarmManager.schedulePrewarm(
        request.assetHash,
        new Date(request.scheduledTime),
        request.policyId,
        request.priority
      );
      
      return {
        success: true,
        scheduledTime: request.scheduledTime,
        requestId: this.generateRequestId(),
        timestamp: Date.now()
      };
      
    } catch (error) {
      return {
        success: false,
        error: 'Prewarm request failed',
        requestId: this.generateRequestId(),
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get prewarm status
   */
  async getStatus(requestId: string): Promise<StatusResponse> {
    // In a real implementation, track request status
    return {
      requestId,
      status: 'completed',
      progress: 100,
      timestamp: Date.now()
    };
  }

  /**
   * Get prewarm statistics
   */
  async getStatistics(): Promise<PrewarmStatistics> {
    return await this.prewarmManager.getStatistics();
  }

  private validateRequest(request: PublisherPrewarmRequest): void {
    if (!request.assets || request.assets.length === 0) {
      throw new Error('At least one asset must be specified');
    }
    
    if (request.assets.length > 100) {
      throw new Error('Maximum 100 assets per request');
    }
    
    for (const asset of request.assets) {
      if (!asset.assetHash || asset.assetHash.length !== 64 || !/^[a-f0-9]{64}$/i.test(asset.assetHash)) {
        throw new Error('Invalid asset hash format');
      }
    }
  }

  private validateScheduleRequest(request: SchedulePrewarmRequest): void {
    if (!request.assetHash || request.assetHash.length !== 64 || !/^[a-f0-9]{64}$/i.test(request.assetHash)) {
      throw new Error('Invalid asset hash format');
    }
    
    const scheduledTime = new Date(request.scheduledTime);
    if (isNaN(scheduledTime.getTime())) {
      throw new Error('Invalid scheduled time format');
    }
    if (scheduledTime.getTime() <= Date.now()) {
      throw new Error('Scheduled time must be in the future');
    }
    // Prevent scheduling too far in the future (max 7 days)
    const maxFutureTime = Date.now() + (7 * 24 * 60 * 60 * 1000);
    if (scheduledTime.getTime() > maxFutureTime) {
      throw new Error('Scheduled time cannot be more than 7 days in the future');
    }
    

private generatePrewarmId(): string {
return `prewarm_${Date.now()}_${randomBytes(8).toString('hex')}`;
}
}

/**
 * Worker job for automated prewarm
 */
export class PrewarmWorker {
  private readonly prewarmManager: PrewarmManager;
  private readonly config: WorkerConfig;

  constructor(prewarmManager: PrewarmManager, config: WorkerConfig) {
    this.prewarmManager = prewarmManager;
    this.config = config;
  }

  /**
   * Run automated prewarm job
   */
  async runAutomatedPrewarm(): Promise<void> {
    this.emit('job_started', { type: 'automated_prewarm' });
    
    try {
      // Trigger predictive prewarm
      const predictiveResult = await this.prewarmManager.triggerPredictivePrewarm();
      this.emit('predictive_complete', { successful: predictiveResult.successful, total: predictiveResult.total });
      
      // Process scheduled prewarms
      await this.processScheduledPrewarms();
      
      // Update statistics
      await this.updateStatistics();
      
    } catch (error) {
      this.emit('job_error', { type: 'automated_prewarm', error });
    }
  }

  private async processScheduledPrewarms(): Promise<void> {
    // This is handled by PrewarmManager's internal worker
    this.emit('processing_scheduled', {});
  }

  private async updateStatistics(): Promise<void> {
    const stats = await this.prewarmManager.getStatistics();
    this.emit('statistics_updated', { stats });
  }
}

// Type definitions
export interface PublisherPrewarmRequest {
  assets: HotAssetRequest[];
  priority?: number;
  timeout?: number;
}

export interface PrewarmResponse {
  success: boolean;
  result?: PrewarmResult;
  error?: string;
  requestId: string;
  timestamp: number;
}

export interface SchedulePrewarmRequest {
  assetHash: string;
  policyId?: string;
  scheduledTime: string; // ISO 8601
  priority?: number;
}

export interface ScheduleResponse {
  success: boolean;
  scheduledTime: string;
  error?: string;
  requestId: string;
  timestamp: number;
}

export interface StatusResponse {
  requestId: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  progress: number; // 0-100
  error?: string;
  timestamp: number;
}

export interface WorkerConfig {
  runIntervalMinutes: number;
  enablePredictivePrewarm: boolean;
  maxProcessingTimeMinutes: number;
}

// Default worker configuration
export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
  runIntervalMinutes: 5,
  enablePredictivePrewarm: true,
  maxProcessingTimeMinutes: 10
};
```
