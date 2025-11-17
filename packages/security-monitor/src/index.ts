/**
 * @credlink/security-monitor
 * 
 * Comprehensive security monitoring and threat detection system
 * Tracks suspicious activities, failed authentication, and anomalies
 */

import { AlertProvider, SecurityAlert, PagerDutyAlertProvider, ConsoleFallbackProvider } from './alert-providers';
import { initializeAlertProviders, validateAlertConfig } from './config';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  source: {
    ip: string;
    userAgent?: string;
    tenantId?: string;
    userId?: string;
  };
  details: Record<string, any>;
  metadata?: {
    requestId?: string;
    endpoint?: string;
    method?: string;
  };
}

export enum SecurityEventType {
  // Authentication & Authorization
  FAILED_AUTH = 'failed_auth',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  FORBIDDEN_ACCESS = 'forbidden_access',
  
  // Input Attacks
  XSS_ATTEMPT = 'xss_attempt',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  PATH_TRAVERSAL_ATTEMPT = 'path_traversal_attempt',
  MALICIOUS_UPLOAD = 'malicious_upload',
  
  // Anomalies
  SUSPICIOUS_PATTERN = 'suspicious_pattern',
  ABNORMAL_VOLUME = 'abnormal_volume',
  UNUSUAL_LOCATION = 'unusual_location',
  
  // System Security
  MEMORY_LEAK_DETECTED = 'memory_leak_detected',
  LOCK_TIMEOUT = 'lock_timeout',
  SERVICE_ANOMALY = 'service_anomaly'
}

export interface SecurityMonitorOptions {
  enabled?: boolean;
  alertProviders?: AlertProvider[];
  alertThresholds?: {
    failedAuthPerMinute?: number;
    rateLimitViolationsPerMinute?: number;
    suspiciousPatternsPerMinute?: number;
  };
  retention?: {
    eventsHours?: number;
    metricsDays?: number;
  };
}

import { LRUCacheFactory } from '@credlink/cache';

export class SecurityMonitor {
  private enabled: boolean;
  private events: SecurityEvent[] = [];
  private metrics: Map<string, number[]> = new Map();
  private readonly MAX_EVENTS = 10000; // 🔥 CRITICAL FIX: Limit events array size
  private readonly MAX_METRICS_ENTRIES = 1000; // 🔥 CRITICAL FIX: Limit metrics array size
  private alertThresholds: Required<SecurityMonitorOptions>['alertThresholds'];
  private retention: Required<SecurityMonitorOptions>['retention'];
  private cleanupInterval: NodeJS.Timeout | null = null;
  private alertProviders: AlertProvider[];

  constructor(options: SecurityMonitorOptions = {}) {
    this.enabled = options.enabled ?? true;
    this.alertProviders = options.alertProviders ?? [new ConsoleFallbackProvider()];
    this.alertThresholds = {
      failedAuthPerMinute: 10,
      rateLimitViolationsPerMinute: 20,
      suspiciousPatternsPerMinute: 5,
      ...options.alertThresholds
    };
    this.retention = {
      eventsHours: 24,
      metricsDays: 7,
      ...options.retention
    };

    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60 * 60 * 1000); // Every hour
  }

  /**
   * Record a security event
   */
  recordEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): void {
    if (!this.enabled) return;

    const securityEvent: SecurityEvent = {
      id: this.generateEventId(),
      timestamp: Date.now(),
      ...event
    };

    this.events.push(securityEvent);
    
    // 🔥 CRITICAL FIX: Prevent unbounded array growth
    if (this.events.length > this.MAX_EVENTS) {
      // Remove oldest events to maintain size limit
      const excess = this.events.length - this.MAX_EVENTS;
      this.events.splice(0, excess);
    }
    
    // Update metrics
    const metricKey = `${event.type}:${event.severity}`;
    const timestamp = Date.now();
    
    if (!this.metrics.has(metricKey)) {
      this.metrics.set(metricKey, []);
    }
    const metricArray = this.metrics.get(metricKey)!;
    metricArray.push(timestamp);
    
    // 🔥 CRITICAL FIX: Prevent unbounded metrics array growth
    if (metricArray.length > this.MAX_METRICS_ENTRIES) {
      const excess = metricArray.length - this.MAX_METRICS_ENTRIES;
      metricArray.splice(0, excess);
    }

    // Check for alert conditions (fire-and-forget to maintain API compatibility)
    void this.checkAlertConditions(securityEvent).catch(err => 
      console.error('Alert processing failed:', err)
    );

    // Log critical events
    if (event.severity === 'critical' || event.severity === 'high') {
      console.error('🚨 SECURITY EVENT:', {
        type: event.type,
        severity: event.severity,
        source: event.source,
        details: event.details,
        id: securityEvent.id
      });
    }
  }

  /**
   * Check for suspicious patterns in input
   */
  detectSuspiciousInput(input: string, context: {
    ip: string;
    endpoint?: string;
    tenantId?: string;
  }): { isSuspicious: boolean; patterns: string[] } {
    const suspiciousPatterns = [
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /data:text\/html/gi,
      /vbscript:/gi,
      /onload\s*=/gi,
      /onerror\s*=/gi,
      /onclick\s*=/gi,
      /<iframe/gi,
      /<object/gi,
      /<embed/gi,
      /eval\s*\(/gi,
      /exec\s*\(/gi,
      /system\s*\(/gi,
      /\.\./gi,  // Path traversal
      /union\s+select/gi,  // SQL injection
      /drop\s+table/gi,
      /insert\s+into/gi,
      /delete\s+from/gi
    ];

    const detectedPatterns: string[] = [];
    
    for (const pattern of suspiciousPatterns) {
      if (pattern.test(input)) {
        detectedPatterns.push(pattern.source);
      }
    }

    const isSuspicious = detectedPatterns.length > 0;

    if (isSuspicious) {
      this.recordEvent({
        type: SecurityEventType.SUSPICIOUS_PATTERN,
        severity: detectedPatterns.length > 3 ? 'high' : 'medium',
        source: {
          ip: context.ip,
          tenantId: context.tenantId
        },
        details: {
          input: input.substring(0, 200), // Limit length
          patterns: detectedPatterns,
          endpoint: context.endpoint
        },
        metadata: {
          endpoint: context.endpoint
        }
      });
    }

    return { isSuspicious, patterns: detectedPatterns };
  }

  /**
   * Detect anomalies in request patterns
   */
  detectAnomalies(metrics: {
    requestCount: number;
    errorRate: number;
    avgResponseTime: number;
    tenantId?: string;
    ip?: string;
  }): { anomalies: string[]; riskScore: number } {
    const anomalies: string[] = [];
    let riskScore = 0;

    // High request volume anomaly
    if (metrics.requestCount > 1000) {
      anomalies.push('high_request_volume');
      riskScore += 30;
    }

    // High error rate anomaly
    if (metrics.errorRate > 0.1) { // 10% error rate
      anomalies.push('high_error_rate');
      riskScore += 40;
    }

    // Slow response time anomaly
    if (metrics.avgResponseTime > 5000) { // 5 seconds
      anomalies.push('slow_response_time');
      riskScore += 20;
    }

    if (anomalies.length > 0) {
      this.recordEvent({
        type: SecurityEventType.ABNORMAL_VOLUME,
        severity: riskScore > 70 ? 'high' : riskScore > 40 ? 'medium' : 'low',
        source: {
          ip: metrics.ip || 'unknown',
          tenantId: metrics.tenantId
        },
        details: {
          anomalies,
          metrics,
          riskScore
        }
      });
    }

    return { anomalies, riskScore };
  }

  /**
   * Get security metrics
   */
  getMetrics(): {
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsBySeverity: Record<string, number>;
    recentAlerts: SecurityEvent[];
  } {
    const eventsByType: Record<string, number> = {};
    const eventsBySeverity: Record<string, number> = {};
    const oneHourAgo = Date.now() - (60 * 60 * 1000);

    const recentEvents = this.events.filter(e => e.timestamp > oneHourAgo);
    const recentAlerts = recentEvents.filter(e => e.severity === 'high' || e.severity === 'critical');

    recentEvents.forEach(event => {
      eventsByType[event.type] = (eventsByType[event.type] || 0) + 1;
      eventsBySeverity[event.severity] = (eventsBySeverity[event.severity] || 0) + 1;
    });

    return {
      totalEvents: recentEvents.length,
      eventsByType,
      eventsBySeverity,
      recentAlerts
    };
  }

  /**
   * Get events by filters
   */
  getEvents(filters: {
    type?: SecurityEventType;
    severity?: string;
    since?: number;
    limit?: number;
  }): SecurityEvent[] {
    let filtered = [...this.events];

    if (filters.type) {
      filtered = filtered.filter(e => e.type === filters.type);
    }

    if (filters.severity) {
      filtered = filtered.filter(e => e.severity === filters.severity);
    }

    if (filters.since) {
      filtered = filtered.filter(e => e.timestamp >= filters.since!);
    }

    // Sort by timestamp (newest first)
    filtered.sort((a, b) => b.timestamp - a.timestamp);

    if (filters.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  private async checkAlertConditions(event: SecurityEvent): Promise<void> {
    const now = Date.now();
    const oneMinuteAgo = now - (60 * 1000);

    // Check failed auth threshold
    if (event.type === SecurityEventType.FAILED_AUTH) {
      const recentFailedAuth = this.events.filter(e => 
        e.type === SecurityEventType.FAILED_AUTH && 
        e.timestamp > oneMinuteAgo
      ).length;

      if (recentFailedAuth >= (this.alertThresholds?.failedAuthPerMinute || 10)) {
        await this.triggerAlert({
          type: 'brute_force_attack',
          severity: 'high',
          details: {
            failedAttempts: recentFailedAuth,
            timeWindow: '1 minute'
          },
          source: event.source
        });
      }
    }

    // Check rate limit threshold
    if (event.type === SecurityEventType.RATE_LIMIT_EXCEEDED) {
      const recentRateLimits = this.events.filter(e => 
        e.type === SecurityEventType.RATE_LIMIT_EXCEEDED && 
        e.timestamp > oneMinuteAgo
      ).length;

      if (recentRateLimits >= (this.alertThresholds?.rateLimitViolationsPerMinute || 20)) {
        await this.triggerAlert({
          type: 'ddos_attack',
          severity: 'critical',
          details: {
            violations: recentRateLimits,
            timeWindow: '1 minute'
          },
          source: event.source
        });
      }
    }
  }

  private async triggerAlert(alert: {
    type: string;
    severity: 'medium' | 'high' | 'critical';
    details: Record<string, any>;
    source: SecurityEvent['source'];
  }): Promise<void> {
    const securityAlert: SecurityAlert = {
      type: alert.type,
      severity: alert.severity,
      message: `Security Alert: ${alert.type}`,
      details: alert.details,
      timestamp: new Date(),
      source: `${alert.source.ip}:${alert.source.userId || 'anonymous'}`,
      correlationId: this.generateEventId()
    };

    // Send to all configured alert providers
    const alertPromises = this.alertProviders.map(async (provider) => {
      try {
        await provider.send(securityAlert);
      } catch (error) {
        console.error('Alert provider failed:', {
          provider: provider.constructor.name,
          error: error instanceof Error ? error.message : 'Unknown error',
          alert: securityAlert.type
        });
      }
    });

    // Wait for all alerts to be sent (or fail gracefully)
    await Promise.allSettled(alertPromises);
  }

  private cleanup(): void {
    const now = Date.now();
    const eventRetentionMs = (this.retention?.eventsHours || 24) * 60 * 60 * 1000;
    const metricsRetentionMs = (this.retention?.metricsDays || 7) * 24 * 60 * 60 * 1000;

    // Clean old events
    const originalEventCount = this.events.length;
    this.events = this.events.filter(e => now - e.timestamp < eventRetentionMs);
    
    // Clean old metrics
    for (const [key, timestamps] of this.metrics.entries()) {
      const filtered = timestamps.filter(t => now - t < metricsRetentionMs);
      if (filtered.length === 0) {
        this.metrics.delete(key);
      } else {
        this.metrics.set(key, filtered);
      }
    }

    const cleanedEvents = originalEventCount - this.events.length;
    if (cleanedEvents > 0) {
      console.log(`Security monitor cleanup: removed ${cleanedEvents} old events`);
    }
  }

  private generateEventId(): string {
    return `sec_${Date.now()}_${Math.random().toString(36).substring(2)}`;
  }

  /**
   * Cleanup method for graceful shutdown
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }
}

// Global security monitor instance with auto-initialized SIEM integration
export const securityMonitor = new SecurityMonitor({
  alertProviders: initializeAlertProviders()
});

// Export configuration functions for external use
export { initializeAlertProviders, validateAlertConfig } from './config';

// Export alert providers for external use
export { 
  SentryAlertProvider, 
  PagerDutyAlertProvider, 
  ConsoleFallbackProvider,
  type SecurityAlert,
  type AlertProvider 
} from './alert-providers';
