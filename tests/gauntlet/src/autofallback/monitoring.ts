/**
 * Phase 6 - Optimizer Auto-Fallback: Real Monitoring Infrastructure
 * Production-grade metrics, alerts, and observability
 */

export interface MetricSnapshot {
  timestamp: number;
  route: string;
  mode: string;
  score: number;
  samples: number;
  embedSurvival: number;
  responseTime: number;
  errorRate: number;
  circuitBreakerStatus: Record<string, string>;
  rateLimitStatus: Record<string, { used: number; limit: number }>;
  memoryUsage: number;
  cpuUsage: number;
}

export interface AlertRule {
  name: string;
  condition: string;
  threshold: number;
  severity: 'critical' | 'warning' | 'info';
  enabled: boolean;
  cooldown: number;
}

export interface AlertStatus {
  rule: string;
  triggered: boolean;
  timestamp: number;
  value: number;
  message: string;
}

export class ProductionMonitor {
  private metrics: Map<string, MetricSnapshot[]> = new Map();
  private alerts: Map<string, AlertStatus> = new Map();
  private alertRules: AlertRule[] = [];
  private retentionPeriod: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.initializeAlertRules();
    this.startMetricsCleanup();
  }

  // Record system metrics
  recordMetrics(snapshot: MetricSnapshot): void {
    const routeKey = snapshot.route;
    
    if (!this.metrics.has(routeKey)) {
      this.metrics.set(routeKey, []);
    }
    
    const routeMetrics = this.metrics.get(routeKey)!;
    routeMetrics.push(snapshot);
    
    // Keep only recent metrics
    const cutoff = Date.now() - this.retentionPeriod;
    const recentMetrics = routeMetrics.filter(m => m.timestamp > cutoff);
    this.metrics.set(routeKey, recentMetrics);
    
    // Check alert conditions
    this.checkAlerts(snapshot);
  }

  // Initialize production alert rules
  private initializeAlertRules(): void {
    this.alertRules = [
      {
        name: 'high_error_rate',
        condition: 'errorRate > 0.1',
        threshold: 0.1,
        severity: 'critical',
        enabled: true,
        cooldown: 300000 // 5 minutes
      },
      {
        name: 'high_response_time',
        condition: 'responseTime > 1000',
        threshold: 1000,
        severity: 'warning',
        enabled: true,
        cooldown: 600000 // 10 minutes
      },
      {
        name: 'low_embed_survival',
        condition: 'embedSurvival < 0.8',
        threshold: 0.8,
        severity: 'critical',
        enabled: true,
        cooldown: 300000 // 5 minutes
      },
      {
        name: 'circuit_breaker_open',
        condition: 'openCircuits > 0',
        threshold: 0,
        severity: 'warning',
        enabled: true,
        cooldown: 600000 // 10 minutes
      },
      {
        name: 'high_memory_usage',
        condition: 'memoryUsage > 0.9',
        threshold: 0.9,
        severity: 'critical',
        enabled: true,
        cooldown: 300000 // 5 minutes
      },
      {
        name: 'rate_limit_exceeded',
        condition: 'rateLimitHitRate > 0.8',
        threshold: 0.8,
        severity: 'warning',
        enabled: true,
        cooldown: 600000 // 10 minutes
      }
    ];
  }

  // Check alert conditions
  private checkAlerts(snapshot: MetricSnapshot): void {
    for (const rule of this.alertRules) {
      if (!rule.enabled) continue;
      
      const existingAlert = this.alerts.get(rule.name);
      const now = Date.now();
      
      // Check cooldown
      if (existingAlert && (now - existingAlert.timestamp) < rule.cooldown) {
        continue;
      }
      
      const triggered = this.evaluateCondition(rule.condition, snapshot);
      
      if (triggered) {
        const alert: AlertStatus = {
          rule: rule.name,
          triggered: true,
          timestamp: now,
          value: this.extractValue(rule.condition, snapshot),
          message: this.generateAlertMessage(rule, snapshot)
        };
        
        this.alerts.set(rule.name, alert);
        this.sendAlert(alert, rule.severity);
      } else if (existingAlert) {
        // Clear the alert
        this.alerts.delete(rule.name);
        this.sendAlertClearance(rule.name);
      }
    }
  }

  // Evaluate alert condition
  private evaluateCondition(condition: string, snapshot: MetricSnapshot): boolean {
    try {
      // Simple condition evaluator
      if (condition.includes('errorRate >')) {
        const threshold = parseFloat(condition.split('>').pop() || '0');
        return snapshot.errorRate > threshold;
      }
      if (condition.includes('responseTime >')) {
        const threshold = parseFloat(condition.split('>').pop() || '0');
        return snapshot.responseTime > threshold;
      }
      if (condition.includes('embedSurvival <')) {
        const threshold = parseFloat(condition.split('<').pop() || '0');
        return snapshot.embedSurvival < threshold;
      }
      if (condition.includes('memoryUsage >')) {
        const threshold = parseFloat(condition.split('>').pop() || '0');
        return snapshot.memoryUsage > threshold;
      }
      if (condition.includes('openCircuits >')) {
        const openCircuits = Object.values(snapshot.circuitBreakerStatus)
          .filter(status => status === 'OPEN').length;
        return openCircuits > 0;
      }
      if (condition.includes('rateLimitHitRate >')) {
        const threshold = parseFloat(condition.split('>').pop() || '0');
        const hitRate = this.calculateRateLimitHitRate(snapshot);
        return hitRate > threshold;
      }
      return false;
    } catch (error) {
      console.error('Failed to evaluate alert condition:', error);
      return false;
    }
  }

  // Extract value from condition
  private extractValue(condition: string, snapshot: MetricSnapshot): number {
    if (condition.includes('errorRate')) return snapshot.errorRate;
    if (condition.includes('responseTime')) return snapshot.responseTime;
    if (condition.includes('embedSurvival')) return snapshot.embedSurvival;
    if (condition.includes('memoryUsage')) return snapshot.memoryUsage;
    if (condition.includes('openCircuits')) {
      return Object.values(snapshot.circuitBreakerStatus)
        .filter(status => status === 'OPEN').length;
    }
    if (condition.includes('rateLimitHitRate')) {
      return this.calculateRateLimitHitRate(snapshot);
    }
    return 0;
  }

  // Calculate rate limit hit rate
  private calculateRateLimitHitRate(snapshot: MetricSnapshot): number {
    const rateLimits = Object.values(snapshot.rateLimitStatus);
    if (rateLimits.length === 0) return 0;
    
    const totalHitRate = rateLimits.reduce((sum, rl) => 
      sum + (rl.used / rl.limit), 0);
    return totalHitRate / rateLimits.length;
  }

  // Generate alert message
  private generateAlertMessage(rule: AlertRule, snapshot: MetricSnapshot): string {
    const value = this.extractValue(rule.condition, snapshot);
    return `${rule.name}: ${value} (threshold: ${rule.threshold}) for route ${snapshot.route}`;
  }

  // Send alert (in production, this would integrate with PagerDuty, Slack, etc.)
  private sendAlert(alert: AlertStatus, severity: string): void {
    const alertData = {
      alert: alert,
      severity,
      timestamp: new Date().toISOString(),
      service: 'c2-autofallback'
    };
    
    console.error('🚨 ALERT TRIGGERED:', JSON.stringify(alertData, null, 2));
    
    // In production, send to real alerting system
    // await this.alertingService.send(alertData);
  }

  // Send alert clearance
  private sendAlertClearance(ruleName: string): void {
    console.log(`✅ ALERT CLEARED: ${ruleName}`);
    
    // In production, send clearance to alerting system
    // await this.alertingService.clear(ruleName);
  }

  // Get Prometheus metrics format
  getPrometheusMetrics(): string {
    let output = '';
    
    // System metrics
    output += '# HELP c2_autofallback_error_rate Error rate per route\n';
    output += '# TYPE c2_autofallback_error_rate gauge\n';
    
    for (const [route, metrics] of this.metrics.entries()) {
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        output += `c2_autofallback_error_rate{route="${route}"} ${latest.errorRate}\n`;
      }
    }
    
    output += '\n# HELP c2_autofallback_response_time Response time in milliseconds\n';
    output += '# TYPE c2_autofallback_response_time gauge\n';
    
    for (const [route, metrics] of this.metrics.entries()) {
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        output += `c2_autofallback_response_time{route="${route}"} ${latest.responseTime}\n`;
      }
    }
    
    output += '\n# HELP c2_autofallback_embed_survival Embed survival rate\n';
    output += '# TYPE c2_autofallback_embed_survival gauge\n';
    
    for (const [route, metrics] of this.metrics.entries()) {
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        output += `c2_autofallback_embed_survival{route="${route}"} ${latest.embedSurvival}\n`;
      }
    }
    
    // Alert status
    output += '\n# HELP c2_autofallback_alert_active Active alerts\n';
    output += '# TYPE c2_autofallback_alert_active gauge\n';
    
    for (const [ruleName, alert] of this.alerts.entries()) {
      output += `c2_autofallback_alert_active{rule="${ruleName}"} 1\n`;
    }
    
    return output;
  }

  // Get Grafana dashboard data
  getGrafanaData(timeRange: { start: number; end: number }): {
    dashboard: {
      title: string;
      panels: Array<{
        title: string;
        type: string;
        targets: Array<{
          expr: string;
          legendFormat: string;
        }>;
      }>;
    };
  } {
    const data = {
      timeRange,
      metrics: {},
      alerts: Array.from(this.alerts.entries()).map(([name, alert]) => ({
        name,
        ...alert
      }))
    };
    
    for (const [route, metrics] of this.metrics.entries()) {
      const filteredMetrics = metrics.filter(m => 
        m.timestamp >= timeRange.start && m.timestamp <= timeRange.end
      );
      
      data.metrics[route] = {
        errorRate: filteredMetrics.map(m => ({ time: m.timestamp, value: m.errorRate })),
        responseTime: filteredMetrics.map(m => ({ time: m.timestamp, value: m.responseTime })),
        embedSurvival: filteredMetrics.map(m => ({ time: m.timestamp, value: m.embedSurvival })),
        score: filteredMetrics.map(m => ({ time: m.timestamp, value: m.score }))
      };
    }
    
    return data;
  }

  // Get system health summary
  getHealthSummary(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    score: number;
    issues: string[];
    recommendations: string[];
    lastUpdated: number;
  } {
    const now = Date.now();
    const recentMetrics = new Map<string, MetricSnapshot>();
    
    // Get latest metrics for each route
    for (const [route, metrics] of this.metrics.entries()) {
      if (metrics.length > 0) {
        const latest = metrics[metrics.length - 1];
        if (now - latest.timestamp < 60000) { // Last minute
          recentMetrics.set(route, latest);
        }
      }
    }
    
    const activeAlerts = Array.from(this.alerts.values());
    const criticalAlerts = activeAlerts.filter(a => 
      this.alertRules.find(r => r.name === a.rule)?.severity === 'critical'
    );
    
    return {
      status: criticalAlerts.length > 0 ? 'critical' : 
              activeAlerts.length > 0 ? 'warning' : 'healthy',
      routes: recentMetrics.size,
      activeAlerts: activeAlerts.length,
      criticalAlerts: criticalAlerts.length,
      lastUpdate: now
    };
  }

  // Start metrics cleanup
  private startMetricsCleanup(): void {
    setInterval(() => {
      const cutoff = Date.now() - this.retentionPeriod;
      
      for (const [route, metrics] of this.metrics.entries()) {
        const recentMetrics = metrics.filter(m => m.timestamp > cutoff);
        if (recentMetrics.length === 0) {
          this.metrics.delete(route);
        } else {
          this.metrics.set(route, recentMetrics);
        }
      }
    }, 60000); // Clean up every minute
  }

  // Export metrics for external monitoring
  exportMetrics(format: 'prometheus' | 'json' | 'grafana'): string {
    switch (format) {
      case 'prometheus':
        return this.getPrometheusMetrics();
      case 'grafana':
        return JSON.stringify(this.getGrafanaData({
          start: Date.now() - 3600000, // Last hour
          end: Date.now()
        }), null, 2);
      case 'json':
        return JSON.stringify({
          health: this.getHealthSummary(),
          alerts: Array.from(this.alerts.entries()),
          metrics: Object.fromEntries(this.metrics)
        }, null, 2);
      default:
        return '{}';
    }
  }
}

// Global monitoring instance
export const productionMonitor = new ProductionMonitor();
