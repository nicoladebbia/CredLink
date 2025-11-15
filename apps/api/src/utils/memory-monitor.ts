/**
 * P-7: Memory Optimization and Monitoring
 * 
 * - Monitor heap usage with v8.getHeapStatistics()
 * - Force GC after large operations (when --expose-gc is enabled)
 * - Memory usage tracking
 * - Alerts for memory leaks
 */

import * as v8 from 'v8';
import { logger } from './logger';

export interface MemoryStats {
  heapUsed: number;
  heapTotal: number;
  heapLimit: number;
  external: number;
  rss: number;
  heapUsedPercent: number;
}

export interface MemoryThresholds {
  warningPercent: number;
  criticalPercent: number;
  gcThresholdMB: number;
}

const DEFAULT_THRESHOLDS: MemoryThresholds = {
  warningPercent: 75,
  criticalPercent: 90,
  gcThresholdMB: 100
};

/**
 * Memory Monitor class
 */
export class MemoryMonitor {
  private thresholds: MemoryThresholds;
  private monitoringInterval: NodeJS.Timeout | null = null;
  private lastGC: number = Date.now();
  private gcEnabled: boolean = false;

  constructor(thresholds: Partial<MemoryThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
    
    // Check if GC is exposed
    this.gcEnabled = typeof global.gc === 'function';
    if (!this.gcEnabled) {
      logger.warn('Garbage collection not exposed. Run with --expose-gc for manual GC');
    }
  }

  /**
   * Start monitoring memory usage
   */
  startMonitoring(intervalMs: number = 60000): void {
    if (this.monitoringInterval) {
      logger.warn('Memory monitoring already started');
      return;
    }

    this.monitoringInterval = setInterval(() => {
      const stats = this.getMemoryStats();
      this.checkThresholds(stats);
      
      logger.debug('Memory stats', {
        heapUsedMB: (stats.heapUsed / 1024 / 1024).toFixed(2),
        heapTotalMB: (stats.heapTotal / 1024 / 1024).toFixed(2),
        heapUsedPercent: stats.heapUsedPercent.toFixed(2),
        rssMB: (stats.rss / 1024 / 1024).toFixed(2)
      });
    }, intervalMs);

    logger.info('Memory monitoring started', {
      interval: `${intervalMs}ms`,
      thresholds: this.thresholds
    });
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
      logger.info('Memory monitoring stopped');
    }
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats {
    const heapStats = v8.getHeapStatistics();
    const memUsage = process.memoryUsage();

    return {
      heapUsed: memUsage.heapUsed,
      heapTotal: memUsage.heapTotal,
      heapLimit: heapStats.heap_size_limit,
      external: memUsage.external,
      rss: memUsage.rss,
      heapUsedPercent: (memUsage.heapUsed / heapStats.heap_size_limit) * 100
    };
  }

  /**
   * Get detailed V8 heap statistics
   */
  getDetailedHeapStats(): v8.HeapInfo {
    return v8.getHeapStatistics();
  }

  /**
   * Get heap space statistics
   */
  getHeapSpaceStats(): v8.HeapSpaceInfo[] {
    return v8.getHeapSpaceStatistics();
  }

  /**
   * Force garbage collection (requires --expose-gc)
   */
  forceGC(): boolean {
    if (!this.gcEnabled) {
      logger.warn('Cannot force GC: not exposed');
      return false;
    }

    const timeSinceLastGC = Date.now() - this.lastGC;
    if (timeSinceLastGC < 5000) {
      logger.debug('Skipping GC: too soon since last GC', {
        timeSinceLastGC: `${timeSinceLastGC}ms`
      });
      return false;
    }

    const beforeStats = this.getMemoryStats();
    
    try {
      global.gc!();
      this.lastGC = Date.now();
      
      const afterStats = this.getMemoryStats();
      const freedMB = (beforeStats.heapUsed - afterStats.heapUsed) / 1024 / 1024;
      
      logger.info('Manual GC completed', {
        freedMB: freedMB.toFixed(2),
        heapUsedMB: (afterStats.heapUsed / 1024 / 1024).toFixed(2)
      });
      
      return true;
    } catch (error: any) {
      logger.error('Manual GC failed', { error: error.message });
      return false;
    }
  }

  /**
   * Force GC if memory usage is high
   */
  forceGCIfNeeded(): boolean {
    const stats = this.getMemoryStats();
    const heapUsedMB = stats.heapUsed / 1024 / 1024;

    if (heapUsedMB > this.thresholds.gcThresholdMB) {
      logger.info('Triggering GC due to high memory usage', {
        heapUsedMB: heapUsedMB.toFixed(2),
        threshold: this.thresholds.gcThresholdMB
      });
      return this.forceGC();
    }

    return false;
  }

  /**
   * Check memory thresholds and log warnings
   */
  private checkThresholds(stats: MemoryStats): void {
    const { heapUsedPercent } = stats;

    if (heapUsedPercent >= this.thresholds.criticalPercent) {
      logger.error('CRITICAL: Memory usage exceeds threshold', {
        heapUsedPercent: heapUsedPercent.toFixed(2),
        threshold: this.thresholds.criticalPercent,
        heapUsedMB: (stats.heapUsed / 1024 / 1024).toFixed(2),
        heapLimitMB: (stats.heapLimit / 1024 / 1024).toFixed(2)
      });
      
      // Try to free memory
      this.forceGC();
    } else if (heapUsedPercent >= this.thresholds.warningPercent) {
      logger.warn('WARNING: Memory usage approaching limit', {
        heapUsedPercent: heapUsedPercent.toFixed(2),
        threshold: this.thresholds.warningPercent,
        heapUsedMB: (stats.heapUsed / 1024 / 1024).toFixed(2)
      });
    }
  }

  /**
   * Take a heap snapshot
   */
  takeHeapSnapshot(filename?: string): string {
    const path = filename || `heap-${Date.now()}.heapsnapshot`;
    
    try {
      v8.writeHeapSnapshot(path);
      logger.info('Heap snapshot saved', { path });
      return path;
    } catch (error: any) {
      logger.error('Failed to save heap snapshot', { error: error.message });
      throw error;
    }
  }
}

// Global memory monitor instance
let memoryMonitor: MemoryMonitor | null = null;

/**
 * Initialize memory monitoring
 */
export function initializeMemoryMonitor(
  thresholds?: Partial<MemoryThresholds>,
  monitoringInterval: number = 60000
): MemoryMonitor {
  if (memoryMonitor) {
    logger.warn('Memory monitor already initialized');
    return memoryMonitor;
  }

  memoryMonitor = new MemoryMonitor(thresholds);
  memoryMonitor.startMonitoring(monitoringInterval);

  // Set up process handlers
  process.on('warning', (warning) => {
    if (warning.name === 'MaxListenersExceededWarning') {
      logger.warn('MaxListenersExceededWarning detected', {
        name: warning.name,
        message: warning.message
      });
    }
  });

  logger.info('Memory monitor initialized');
  return memoryMonitor;
}

/**
 * Get global memory monitor instance
 */
export function getMemoryMonitor(): MemoryMonitor | null {
  return memoryMonitor;
}

/**
 * Middleware to force GC after large operations
 */
export function forceGCAfterLargeOperation(thresholdMB: number = 50) {
  return async (req: any, res: any, next: any) => {
    const startMemory = process.memoryUsage().heapUsed;

    res.on('finish', () => {
      const endMemory = process.memoryUsage().heapUsed;
      const usedMB = (endMemory - startMemory) / 1024 / 1024;

      if (usedMB > thresholdMB && memoryMonitor) {
        logger.debug('Large operation detected, checking if GC needed', {
          usedMB: usedMB.toFixed(2)
        });
        memoryMonitor.forceGCIfNeeded();
      }
    });

    next();
  };
}
