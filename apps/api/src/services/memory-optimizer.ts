import { logger } from '../utils/logger';

/**
 * Memory thresholds
 */
export interface MemoryThresholds {
  maxHeapSize: number;
  maxIncreasePerMinute: number;
  gcThreshold: number;
}

/**
 * Memory usage snapshot
 */
export interface MemorySnapshot {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
  timestamp: number;
}

/**
 * Memory Optimizer
 * 
 * Monitors and optimizes memory usage
 */
export class MemoryOptimizer {
  private memoryThresholds: MemoryThresholds;
  private gcInterval?: NodeJS.Timeout;
  private memoryMonitorInterval?: NodeJS.Timeout;
  private snapshots: MemorySnapshot[] = [];
  private readonly maxSnapshots = 100;

  constructor(thresholds?: Partial<MemoryThresholds>) {
    this.memoryThresholds = {
      maxHeapSize: thresholds?.maxHeapSize ?? 512 * 1024 * 1024, // 512MB
      maxIncreasePerMinute: thresholds?.maxIncreasePerMinute ?? 50 * 1024 * 1024, // 50MB/min
      gcThreshold: thresholds?.gcThreshold ?? 400 * 1024 * 1024 // 400MB
    };

    logger.info('Memory Optimizer initialized', { thresholds: this.memoryThresholds });
  }

  /**
   * Start monitoring memory usage
   */
  startMonitoring(): void {
    // Monitor memory usage every 30 seconds
    this.memoryMonitorInterval = setInterval(() => {
      this.checkMemoryUsage();
    }, 30000);

    // Force garbage collection every 5 minutes if available
    if (global.gc) {
      this.gcInterval = setInterval(() => {
        if (global.gc) {
          global.gc();
          logger.info('Forced garbage collection completed');
        }
      }, 5 * 60 * 1000);
    } else {
      logger.warn('Garbage collection not available. Run with --expose-gc flag.');
    }

    logger.info('Memory monitoring started');
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.memoryMonitorInterval) {
      clearInterval(this.memoryMonitorInterval);
      this.memoryMonitorInterval = undefined;
    }
    if (this.gcInterval) {
      clearInterval(this.gcInterval);
      this.gcInterval = undefined;
    }

    logger.info('Memory monitoring stopped');
  }

  /**
   * Check current memory usage
   */
  private checkMemoryUsage(): void {
    const memUsage = process.memoryUsage();
    const heapUsed = memUsage.heapUsed;

    // Store snapshot
    const snapshot: MemorySnapshot = {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      timestamp: Date.now()
    };

    this.snapshots.push(snapshot);
    if (this.snapshots.length > this.maxSnapshots) {
      this.snapshots.shift();
    }

    // Check if we're approaching the heap size limit
    if (heapUsed > this.memoryThresholds.maxHeapSize) {
      logger.warn('Memory usage exceeds threshold', {
        heapUsed: (heapUsed / 1024 / 1024).toFixed(2) + 'MB',
        threshold: (this.memoryThresholds.maxHeapSize / 1024 / 1024).toFixed(2) + 'MB'
      });

      // Force GC if available
      if (global.gc) {
        global.gc();
        logger.info('Forced garbage collection due to high memory usage');
      }
    }

    // Check rate of increase
    if (this.snapshots.length >= 2) {
      const oneMinuteAgo = Date.now() - 60000;
      const oldSnapshot = this.snapshots.find(s => s.timestamp <= oneMinuteAgo);

      if (oldSnapshot) {
        const increase = heapUsed - oldSnapshot.heapUsed;
        if (increase > this.memoryThresholds.maxIncreasePerMinute) {
          logger.warn('Memory increase rate exceeds threshold', {
            increase: (increase / 1024 / 1024).toFixed(2) + 'MB/min',
            threshold: (this.memoryThresholds.maxIncreasePerMinute / 1024 / 1024).toFixed(2) + 'MB/min'
          });
        }
      }
    }

    // Check if we should trigger GC
    if (heapUsed > this.memoryThresholds.gcThreshold && global.gc) {
      global.gc();
      logger.debug('Triggered garbage collection', {
        heapUsed: (heapUsed / 1024 / 1024).toFixed(2) + 'MB'
      });
    }
  }

  /**
   * Get current memory usage
   */
  getCurrentMemoryUsage(): MemorySnapshot {
    const memUsage = process.memoryUsage();
    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      external: memUsage.external,
      rss: memUsage.rss,
      timestamp: Date.now()
    };
  }

  /**
   * Get memory statistics
   */
  getMemoryStats(): {
    current: MemorySnapshot;
    peak: number;
    average: number;
    snapshots: number;
  } {
    const current = this.getCurrentMemoryUsage();
    const peak = Math.max(...this.snapshots.map(s => s.heapUsed), current.heapUsed);
    const average = this.snapshots.length > 0
      ? this.snapshots.reduce((sum, s) => sum + s.heapUsed, 0) / this.snapshots.length
      : current.heapUsed;

    return {
      current,
      peak,
      average,
      snapshots: this.snapshots.length
    };
  }

  /**
   * Force garbage collection
   */
  forceGC(): boolean {
    if (global.gc) {
      global.gc();
      logger.info('Forced garbage collection');
      return true;
    }
    logger.warn('Garbage collection not available');
    return false;
  }

  /**
   * Clear snapshots
   */
  clearSnapshots(): void {
    this.snapshots = [];
    logger.info('Memory snapshots cleared');
  }
}
