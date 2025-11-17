import { HealthChecker } from './health-checker';
import { ServiceHealth, HealthAlert, AlertThresholds } from './types';
import { healthMetrics } from './prometheus-metrics';
import { logger } from './logger';

export class HealthMonitoringIntegration {
  private healthChecker: HealthChecker;
  private metricsInterval: NodeJS.Timeout | null = null;
  private alertThresholds: AlertThresholds = {
    responseTime: 5000, // 5 seconds
    consecutiveFailures: 3,
    degradedThreshold: 2 // 2 degraded components triggers alert
  };
  private failureCount: Map<string, number> = new Map();

  constructor(healthChecker: HealthChecker, thresholds?: Partial<AlertThresholds>) {
    this.healthChecker = healthChecker;
    if (thresholds) {
      this.alertThresholds = { ...this.alertThresholds, ...thresholds };
    }
  }

  startMetricsCollection(intervalMs: number = 30000) {
    this.metricsInterval = setInterval(async () => {
      try {
        const health = await this.healthChecker.getOverallHealth();
        await this.recordHealthMetrics(health);
        await this.checkAlertConditions(health);
      } catch (error) {
        logger.error('Health metrics collection failed:', error);
      }
    }, intervalMs);
    
    logger.info(`Health metrics collection started with ${intervalMs}ms interval`);
  }

  stopMetricsCollection() {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
      logger.info('Health metrics collection stopped');
    }
  }

  private async recordHealthMetrics(health: ServiceHealth) {
    // Update Prometheus metrics
    healthMetrics.updateHealthMetrics(health);
    
    // Record to Prometheus/Datadog (legacy logging for compatibility)
    health.checks.forEach((check: any) => {
      const labels = {
        service: health.service,
        component: check.component,
        status: check.status
      };
      
      // Response time metric
      this.recordMetric('health_check_response_time', check.responseTime || 0, labels);
      
      // Status metric (1 for healthy, 0.5 for degraded, 0 for unhealthy)
      const statusValue = check.status === 'healthy' ? 1 : 
                         check.status === 'degraded' ? 0.5 : 0;
      this.recordMetric('health_check_status', statusValue, labels);
    });
    
    // Overall service health
    this.recordMetric('service_health_status', 
      health.overallStatus === 'healthy' ? 1 : 
      health.overallStatus === 'degraded' ? 0.5 : 0,
      { service: health.service });

    // Uptime metric
    this.recordMetric('service_uptime_seconds', health.uptime, { service: health.service });
  }

  private async checkAlertConditions(health: ServiceHealth) {
    const unhealthyComponents = health.checks.filter((c: any) => c.status === 'unhealthy');
    const degradedComponents = health.checks.filter((c: any) => c.status === 'degraded');
    
    // Track consecutive failures
    const serviceKey = health.service;
    if (health.overallStatus === 'unhealthy') {
      const currentFailures = this.failureCount.get(serviceKey) || 0;
      this.failureCount.set(serviceKey, currentFailures + 1);
    } else {
      this.failureCount.delete(serviceKey);
    }
    
    // Critical alerts for unhealthy components
    if (unhealthyComponents.length > 0) {
      await this.sendAlert({
        severity: 'critical',
        title: `Unhealthy Components Detected`,
        message: `${unhealthyComponents.length} components are unhealthy: ${unhealthyComponents.map((c: any) => c.component).join(', ')}`,
        details: health
      });
    }
    
    // Warning alerts for degraded components
    if (degradedComponents.length >= this.alertThresholds.degradedThreshold) {
      await this.sendAlert({
        severity: 'warning',
        title: `Service Degraded`,
        message: `${degradedComponents.length} components are degraded: ${degradedComponents.map((c: any) => c.component).join(', ')}`,
        details: health
      });
    }
    
    // Performance alerts
    const slowChecks = health.checks.filter((c: any) => 
      c.responseTime && c.responseTime > this.alertThresholds.responseTime
    );
    
    if (slowChecks.length > 0) {
      await this.sendAlert({
        severity: 'warning',
        title: `Slow Health Checks Detected`,
        message: `${slowChecks.length} components have slow response times: ${slowChecks.map((c: any) => `${c.component} (${c.responseTime}ms)`).join(', ')}`,
        details: health
      });
    }

    // Consecutive failure alerts
    const consecutiveFailures = this.failureCount.get(serviceKey) || 0;
    if (consecutiveFailures >= this.alertThresholds.consecutiveFailures) {
      await this.sendAlert({
        severity: 'critical',
        title: `Service Consecutive Failures`,
        message: `Service ${health.service} has failed ${consecutiveFailures} consecutive health checks`,
        details: health
      });
    }
  }

  private recordMetric(name: string, value: number, labels: Record<string, string>) {
    // Prometheus format
    const labelString = Object.entries(labels)
      .map(([key, val]) => `${key}="${val}"`)
      .join(',');
    
    logger.info(`METRIC: ${name}{${labelString}} ${value}`);
    
    // Would integrate with actual monitoring client
    // prometheusClient.gauge(name).set(labels, value);
    // datadogClient.gauge(name, value, labels);
  }

  private async sendAlert(alert: HealthAlert) {
    logger.error(`ALERT [${alert.severity.toUpperCase()}] ${alert.title}: ${alert.message}`, {
      service: alert.details.service,
      overallStatus: alert.details.overallStatus,
      components: alert.details.checks.map((c: any) => ({
        component: c.component,
        status: c.status,
        responseTime: c.responseTime
      }))
    });
    
    // Would integrate with actual alerting system
    // await pagerDutyClient.trigger(alert);
    // await sentryClient.captureMessage(alert.title, { level: alert.severity, extra: alert });
    // await slackClient.postMessage(`#${alert.severity}-alerts`, alert.message);
  }

  // Get current alert thresholds
  getAlertThresholds(): AlertThresholds {
    return { ...this.alertThresholds };
  }

  // Update alert thresholds
  updateAlertThresholds(newThresholds: Partial<AlertThresholds>) {
    this.alertThresholds = { ...this.alertThresholds, ...newThresholds };
    logger.info('Alert thresholds updated', this.alertThresholds);
  }

  // Get current failure counts
  getFailureCounts(): Record<string, number> {
    return Object.fromEntries(this.failureCount);
  }

  // Reset failure counts
  resetFailureCounts() {
    this.failureCount.clear();
    logger.info('Failure counts reset');
  }
}
