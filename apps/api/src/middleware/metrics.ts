import { Request, Response, NextFunction } from 'express';
import { Registry, Counter, Histogram, Gauge } from 'prom-client';
import { logger } from '../utils/logger';

/**
 * Prometheus Metrics Middleware
 * 
 * Collects and exposes metrics for monitoring:
 * - HTTP request duration
 * - Request count by status code
 * - Active requests
 * - Image processing metrics
 * - Error rates
 */

export class MetricsCollector {
  public registry: Registry;
  private httpRequestDuration: Histogram;
  private httpRequestTotal: Counter;
  private httpRequestsInProgress: Gauge;
  private imageSigningDuration: Histogram;
  private imageSigningTotal: Counter;
  private imageSigningErrors: Counter;
  private imageSizeBytes: Histogram;
  private proofStorageSize: Gauge;

  constructor() {
    this.registry = new Registry();
    
    // HTTP request duration histogram
    this.httpRequestDuration = new Histogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: [0.1, 0.5, 1, 2, 5, 10]
    });

    // HTTP request counter
    this.httpRequestTotal = new Counter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code']
    });

    // Active HTTP requests gauge
    this.httpRequestsInProgress = new Gauge({
      name: 'http_requests_in_progress',
      help: 'Number of HTTP requests currently being processed',
      labelNames: ['method', 'route']
    });

    // Image signing duration histogram
    this.imageSigningDuration = new Histogram({
      name: 'image_signing_duration_seconds',
      help: 'Duration of image signing operations in seconds',
      labelNames: ['format', 'success'],
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30]
    });

    // Image signing counter
    this.imageSigningTotal = new Counter({
      name: 'image_signing_total',
      help: 'Total number of image signing operations',
      labelNames: ['format', 'success']
    });

    // Image signing errors
    this.imageSigningErrors = new Counter({
      name: 'image_signing_errors_total',
      help: 'Total number of image signing errors',
      labelNames: ['error_type']
    });

    // Image size histogram
    this.imageSizeBytes = new Histogram({
      name: 'image_size_bytes',
      help: 'Size of images being processed in bytes',
      labelNames: ['format', 'operation'],
      buckets: [1024, 10240, 102400, 1024000, 10240000, 52428800] // 1KB to 50MB
    });

    // Proof storage size gauge
    this.proofStorageSize = new Gauge({
      name: 'proof_storage_size_total',
      help: 'Total number of proofs in storage'
    });

    // Register all metrics
    this.registry.registerMetric(this.httpRequestDuration);
    this.registry.registerMetric(this.httpRequestTotal);
    this.registry.registerMetric(this.httpRequestsInProgress);
    this.registry.registerMetric(this.imageSigningDuration);
    this.registry.registerMetric(this.imageSigningTotal);
    this.registry.registerMetric(this.imageSigningErrors);
    this.registry.registerMetric(this.imageSizeBytes);
    this.registry.registerMetric(this.proofStorageSize);

    // Collect default metrics (CPU, memory, etc.)
    if (process.env.ENABLE_DEFAULT_METRICS === 'true') {
      const collectDefaultMetrics = require('prom-client').collectDefaultMetrics;
      collectDefaultMetrics({ register: this.registry });
    }

    logger.info('Prometheus metrics initialized');
  }

  /**
   * Middleware to track HTTP requests
   */
  trackHttpRequest = (req: Request, res: Response, next: NextFunction): void => {
    const start = Date.now();
    const route = req.route?.path || req.path;
    const method = req.method;

    // Increment in-progress counter
    this.httpRequestsInProgress.inc({ method, route });

    // Track response
    res.on('finish', () => {
      const duration = (Date.now() - start) / 1000;
      const statusCode = res.statusCode.toString();

      // Record metrics
      this.httpRequestDuration.observe({ method, route, status_code: statusCode }, duration);
      this.httpRequestTotal.inc({ method, route, status_code: statusCode });
      this.httpRequestsInProgress.dec({ method, route });
    });

    next();
  };

  /**
   * Track image signing operation
   */
  trackImageSigning(format: string, sizeBytes: number, durationMs: number, success: boolean): void {
    const durationSeconds = durationMs / 1000;
    
    this.imageSigningDuration.observe(
      { format, success: success.toString() },
      durationSeconds
    );
    
    this.imageSigningTotal.inc({ format, success: success.toString() });
    
    this.imageSizeBytes.observe({ format, operation: 'sign' }, sizeBytes);
  }

  /**
   * Track image signing error
   */
  trackSigningError(errorType: string): void {
    this.imageSigningErrors.inc({ error_type: errorType });
  }

  /**
   * Update proof storage size
   */
  updateProofStorageSize(count: number): void {
    this.proofStorageSize.set(count);
  }

  /**
   * Increment a counter metric (generic method)
   */
  incrementCounter(metricName: string, labels?: Record<string, string>): void {
    // Map common metric names to existing counters
    if (metricName === 'certificate_rotation_failures' || metricName.includes('error')) {
      this.imageSigningErrors.inc(labels || {});
    } else {
      logger.warn('incrementCounter called with unknown metric', { metricName });
    }
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }
}

// Export singleton instance
export const metricsCollector = new MetricsCollector();
