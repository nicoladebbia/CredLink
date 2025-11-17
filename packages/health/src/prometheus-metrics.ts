import client from 'prom-client';
import { HealthCheckResult, ServiceHealth } from './types.js';

// Prometheus metrics for health monitoring
export class HealthMetrics {
  private healthCheckGauge: client.Gauge<string>;
  private responseTimeGauge: client.Gauge<string>;
  private serviceStatusGauge: client.Gauge<string>;
  private serviceUptimeGauge: client.Gauge<string>;
  private failureCounter: client.Counter<string>;

  constructor() {
    // Health check status for each component (1=healthy, 0.5=degraded, 0=unhealthy)
    this.healthCheckGauge = new client.Gauge({
      name: 'credlink_health_check_status',
      help: 'Health check status for each component',
      labelNames: ['service', 'component', 'status'],
    });

    // Response time for each health check in milliseconds
    this.responseTimeGauge = new client.Gauge({
      name: 'credlink_health_check_response_time_ms',
      help: 'Response time for health checks in milliseconds',
      labelNames: ['service', 'component'],
    });

    // Overall service health status
    this.serviceStatusGauge = new client.Gauge({
      name: 'credlink_service_health_status',
      help: 'Overall service health status (1=healthy, 0.5=degraded, 0=unhealthy)',
      labelNames: ['service'],
    });

    // Service uptime in seconds
    this.serviceUptimeGauge = new client.Gauge({
      name: 'credlink_service_uptime_seconds',
      help: 'Service uptime in seconds',
      labelNames: ['service'],
    });

    // Health check failure counter
    this.failureCounter = new client.Counter({
      name: 'credlink_health_check_failures_total',
      help: 'Total number of health check failures',
      labelNames: ['service', 'component', 'error_type'],
    });
  }

  /**
   * Update metrics based on health check results
   */
  updateHealthMetrics(health: ServiceHealth): void {
    const { service, overallStatus, checks, uptime } = health;

    // Update overall service status
    const overallValue = overallStatus === 'healthy' ? 1 : 
                        overallStatus === 'degraded' ? 0.5 : 0;
    this.serviceStatusGauge.set({ service }, overallValue);

    // Update service uptime
    this.serviceUptimeGauge.set({ service }, uptime);

    // Update component-specific metrics
    checks.forEach((check: HealthCheckResult) => {
      const { component, status, responseTime, errorMessage } = check;

      // Update health status
      const statusValue = status === 'healthy' ? 1 : 
                         status === 'degraded' ? 0.5 : 0;
      this.healthCheckGauge.set(
        { service, component, status }, 
        statusValue
      );

      // Update response time
      if (responseTime !== undefined) {
        this.responseTimeGauge.set({ service, component }, responseTime);
      }

      // Increment failure counter if unhealthy
      if (status === 'unhealthy' && errorMessage) {
        const errorType = this.categorizeError(errorMessage);
        this.failureCounter.inc({ service, component, error_type: errorType });
      }
    });
  }

  /**
   * Get Prometheus metrics in text format for scraping
   */
  getMetrics(): Promise<string> {
    return client.register.metrics();
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clearMetrics(): void {
    client.register.clear();
  }

  /**
   * Categorize error types for better alerting
   */
  private categorizeError(errorMessage: string): string {
    if (errorMessage.includes('timeout') || errorMessage.includes('ETIMEDOUT')) {
      return 'timeout';
    } else if (errorMessage.includes('connection') || errorMessage.includes('ECONNREFUSED')) {
      return 'connection';
    } else if (errorMessage.includes('database') || errorMessage.includes('postgres')) {
      return 'database';
    } else if (errorMessage.includes('redis')) {
      return 'redis';
    } else if (errorMessage.includes('certificate') || errorMessage.includes('cert')) {
      return 'certificate';
    } else {
      return 'unknown';
    }
  }

  /**
   * Get current metric values for debugging
   */
  async getMetricValues(): Promise<Record<string, any>> {
    const metrics = await this.getMetrics();
    const values: Record<string, any> = {};

    // Parse metrics to extract current values
    const lines = metrics.split('\n');
    lines.forEach(line => {
      if (line.startsWith('credlink_') && !line.startsWith('#')) {
        const [metric, value] = line.split(' ');
        values[metric] = parseFloat(value);
      }
    });

    return values;
  }
}

// Export singleton instance
export const healthMetrics = new HealthMetrics();
