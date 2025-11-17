import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';

interface MetricsData {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  totalProcessingTime: number;
  requestByMethod: Record<string, number>;
  requestByStatus: Record<string, number>;
  imageSigningMetrics: {
    totalSigned: number;
    successful: number;
    failed: number;
    totalSize: number;
    totalProcessingTime: number;
    byFormat: Record<string, number>;
  };
  batchSigningMetrics: {
    totalBatches: number;
    successful: number;
    failed: number;
    totalFiles: number;
    totalProcessingTime: number;
  };
}

class MetricsCollector {
  private metrics: MetricsData = {
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    totalProcessingTime: 0,
    requestByMethod: {},
    requestByStatus: {},
    imageSigningMetrics: {
      totalSigned: 0,
      successful: 0,
      failed: 0,
      totalSize: 0,
      totalProcessingTime: 0,
      byFormat: {}
    },
    batchSigningMetrics: {
      totalBatches: 0,
      successful: 0,
      failed: 0,
      totalFiles: 0,
      totalProcessingTime: 0
    }
  };

  private resetTime: number = Date.now();
  private readonly resetInterval: number = 24 * 60 * 60 * 1000; // 24 hours

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const requestId = req.headers['x-request-id'] as string || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const startTime = Date.now();

      // Track request start
      this.trackRequestStart(req);

      // Override res.end to log response completion
      const originalEnd = res.end;
      res.end = function(chunk?: any, encoding?: any): Response {
        const duration = Date.now() - startTime;
        
        logger.info('Request completed', {
          requestId,
          method: req.method,
          url: req.url,
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('Content-Length') || '0'
        });

        return originalEnd.call(this, chunk, encoding);
      };

      next();
    };
  }

  private trackRequestStart(req: Request): void {
    this.metrics.totalRequests++;
    
    const method = req.method;
    this.metrics.requestByMethod[method] = (this.metrics.requestByMethod[method] || 0) + 1;
  }

  private trackRequestCompletion(req: Request, res: Response, duration: number): void {
    this.metrics.totalProcessingTime += duration;
    
    const statusCode = res.statusCode.toString();
    this.metrics.requestByStatus[statusCode] = (this.metrics.requestByStatus[statusCode] || 0) + 1;

    if (statusCode.startsWith('2')) {
      this.metrics.successfulRequests++;
    } else {
      this.metrics.failedRequests++;
    }

    // Check if metrics need reset
    if (Date.now() - this.resetTime > this.resetInterval) {
      this.resetMetrics();
    }
  }

  trackImageSigning(format: string, size: number, duration: number, success: boolean): void {
    this.metrics.imageSigningMetrics.totalSigned++;
    this.metrics.imageSigningMetrics.totalSize += size;
    this.metrics.imageSigningMetrics.totalProcessingTime += duration;
    
    if (success) {
      this.metrics.imageSigningMetrics.successful++;
    } else {
      this.metrics.imageSigningMetrics.failed++;
    }

    this.metrics.imageSigningMetrics.byFormat[format] = 
      (this.metrics.imageSigningMetrics.byFormat[format] || 0) + 1;

    logger.debug('Image signing metrics tracked', {
      format,
      size,
      duration,
      success
    });
  }

  trackBatchSigning(fileCount: number, totalSize: number, duration: number, success: boolean): void {
    this.metrics.batchSigningMetrics.totalBatches++;
    this.metrics.batchSigningMetrics.totalFiles += fileCount;
    this.metrics.batchSigningMetrics.totalProcessingTime += duration;
    
    if (success) {
      this.metrics.batchSigningMetrics.successful++;
    } else {
      this.metrics.batchSigningMetrics.failed++;
    }

    logger.debug('Batch signing metrics tracked', {
      fileCount,
      totalSize,
      duration,
      success
    });
  }

  getMetrics(): MetricsData & { uptime: number; lastReset: string } {
    return {
      ...this.metrics,
      uptime: Date.now() - this.resetTime,
      lastReset: new Date(this.resetTime).toISOString()
    };
  }

  private resetMetrics(): void {
    this.metrics = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      totalProcessingTime: 0,
      requestByMethod: {},
      requestByStatus: {},
      imageSigningMetrics: {
        totalSigned: 0,
        successful: 0,
        failed: 0,
        totalSize: 0,
        totalProcessingTime: 0,
        byFormat: {}
      },
      batchSigningMetrics: {
        totalBatches: 0,
        successful: 0,
        failed: 0,
        totalFiles: 0,
        totalProcessingTime: 0
      }
    };
    
    this.resetTime = Date.now();
    logger.info('Metrics reset');
  }

  getHealthMetrics(): {
    status: 'healthy' | 'warning' | 'critical';
    details: any;
  } {
    const errorRate = this.metrics.totalRequests > 0 
      ? (this.metrics.failedRequests / this.metrics.totalRequests) * 100 
      : 0;

    const avgProcessingTime = this.metrics.totalRequests > 0
      ? this.metrics.totalProcessingTime / this.metrics.totalRequests
      : 0;

    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    const details: any = {
      errorRate: Math.round(errorRate * 100) / 100,
      avgProcessingTime: Math.round(avgProcessingTime),
      totalRequests: this.metrics.totalRequests
    };

    if (errorRate > 10 || avgProcessingTime > 30000) {
      status = 'critical';
      details.reason = errorRate > 10 ? 'High error rate' : 'Slow processing time';
    } else if (errorRate > 5 || avgProcessingTime > 15000) {
      status = 'warning';
      details.reason = errorRate > 5 ? 'Elevated error rate' : 'Elevated processing time';
    }

    return { status, details };
  }
}

export const metricsCollector = new MetricsCollector();
export { MetricsCollector };
