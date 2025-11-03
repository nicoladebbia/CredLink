/**
 * Phase 35 Leaderboard - Security Monitoring
 * Comprehensive security event monitoring and alerting
 */

import { createHash, randomBytes } from 'crypto';
import crypto from 'crypto';
import { Redis } from 'ioredis';

export interface SecurityEvent {
  id: string;
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  timestamp: number;
  source: {
    ip: string;
    userAgent?: string;
    userId?: string;
    sessionId?: string;
  };
  details: Record<string, any>;
  blocked: boolean;
}

export type SecurityEventType = 
  | 'auth_failure'
  | 'rate_limit_exceeded'
  | 'invalid_input'
  | 'ssrf_attempt'
  | 'path_traversal'
  | 'injection_attempt'
  | 'privilege_escalation'
  | 'unauthorized_access'
  | 'suspicious_pattern'
  | 'resource_exhaustion'
  | 'process_violation';

export interface MonitoringConfig {
  eventRetentionDays: number;
  alertThresholds: {
    authFailuresPerMinute: number;
    rateLimitHitsPerMinute: number;
    suspiciousPatternsPerMinute: number;
  };
  blockThresholds: {
    authFailuresPerHour: number;
    suspiciousEventsPerHour: number;
  };
}

export class SecurityMonitor {
  private redis: Redis;
  private config: MonitoringConfig;
  private eventCounts = new Map<string, number>();

  constructor(redis: Redis, config: MonitoringConfig) {
    this.redis = redis;
    this.config = config;
  }

  /**
   * Record a security event
   */
  async recordEvent(event: Omit<SecurityEvent, 'id' | 'timestamp'>): Promise<string> {
    const eventId = this.generateEventId();
    const fullEvent: SecurityEvent = {
      ...event,
      id: eventId,
      timestamp: Date.now(),
    };

    // Store event
    const eventKey = `security:event:${eventId}`;
    await this.redis.setex(
      eventKey,
      this.config.eventRetentionDays * 24 * 60 * 60,
      JSON.stringify(fullEvent)
    );

    // Update counters
    await this.updateEventCounters(event.type, event.source.ip);

    // Check for alert conditions
    await this.checkAlertConditions(fullEvent);

    // Check for block conditions
    const shouldBlock = await this.checkBlockConditions(fullEvent);
    if (shouldBlock) {
      await this.blockSource(event.source.ip);
    }

    // Log event
    this.logSecurityEvent(fullEvent);

    return eventId;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `evt_${Date.now()}_${randomBytes(8).toString('hex')}`;
  }

  /**
   * Update event counters for rate limiting
   */
  private async updateEventCounters(eventType: SecurityEventType, ip: string): Promise<void> {
    const now = Date.now();
    const minuteKey = `security:count:${eventType}:${Math.floor(now / 60000)}`;
    const hourKey = `security:count:${eventType}:${Math.floor(now / 3600000)}`;

    await this.redis.incr(minuteKey);
    await this.redis.expire(minuteKey, 120); // Keep for 2 minutes

    await this.redis.incr(hourKey);
    await this.redis.expire(hourKey, 7200); // Keep for 2 hours
  }

  /**
   * Check if alert conditions are met
   */
  private async checkAlertConditions(event: SecurityEvent): Promise<void> {
    const now = Date.now();
    const minute = Math.floor(now / 60000);

    // Check auth failure rate
    if (event.type === 'auth_failure') {
      const count = await this.getEventCount('auth_failure', minute, 60);
      if (count >= this.config.alertThresholds.authFailuresPerMinute) {
        await this.triggerAlert('high_auth_failure_rate', {
          count,
          threshold: this.config.alertThresholds.authFailuresPerMinute,
          ip: event.source.ip
        });
      }
    }

    // Check rate limit hit rate
    if (event.type === 'rate_limit_exceeded') {
      const count = await this.getEventCount('rate_limit_exceeded', minute, 60);
      if (count >= this.config.alertThresholds.rateLimitHitsPerMinute) {
        await this.triggerAlert('high_rate_limit_hits', {
          count,
          threshold: this.config.alertThresholds.rateLimitHitsPerMinute,
          ip: event.source.ip
        });
      }
    }

    // Check suspicious pattern rate
    if (event.type === 'suspicious_pattern') {
      const count = await this.getEventCount('suspicious_pattern', minute, 60);
      if (count >= this.config.alertThresholds.suspiciousPatternsPerMinute) {
        await this.triggerAlert('high_suspicious_activity', {
          count,
          threshold: this.config.alertThresholds.suspiciousPatternsPerMinute,
          ip: event.source.ip
        });
      }
    }
  }

  /**
   * Check if source should be blocked
   */
  private async checkBlockConditions(event: SecurityEvent): Promise<boolean> {
    const now = Date.now();
    const hour = Math.floor(now / 3600000);

    // Check auth failure block threshold
    const authFailures = await this.getEventCount('auth_failure', hour, 3600);
    if (authFailures >= this.config.blockThresholds.authFailuresPerHour) {
      return true;
    }

    // Check suspicious events block threshold
    const suspiciousEvents = await this.getEventCount('suspicious_pattern', hour, 3600) +
                           await this.getEventCount('injection_attempt', hour, 3600) +
                           await this.getEventCount('ssrf_attempt', hour, 3600);
    
    if (suspiciousEvents >= this.config.blockThresholds.suspiciousEventsPerHour) {
      return true;
    }

    // Immediate block for critical events
    if (event.severity === 'critical') {
      return true;
    }

    return false;
  }

  /**
   * Get event count for time window
   */
  private async getEventCount(eventType: SecurityEventType, timeSlot: number, windowSize: number): Promise<number> {
    const keys = [];
    for (let i = 0; i < windowSize / 60; i++) {
      keys.push(`security:count:${eventType}:${timeSlot - i}`);
    }

    const counts = await this.redis.mget(...keys);
    return counts.reduce((sum, count) => sum + parseInt(count || '0'), 0);
  }

  /**
   * Block malicious source
   */
  private async blockSource(ip: string): Promise<void> {
    const blockKey = `security:block:${ip}`;
    await this.redis.setex(blockKey, 24 * 60 * 60, '1'); // Block for 24 hours
    
    await this.triggerAlert('source_blocked', { ip, duration: '24 hours' });
  }

  /**
   * Check if IP is blocked
   */
  async isBlocked(ip: string): Promise<boolean> {
    const blockKey = `security:block:${ip}`;
    return (await this.redis.exists(blockKey)) > 0;
  }

  /**
   * Trigger security alert
   */
  private async triggerAlert(alertType: string, details: Record<string, any>): Promise<void> {
    const alert = {
      id: randomBytes(16).toString('hex'),
      type: alertType,
      timestamp: Date.now(),
      details,
    };

    const alertKey = `security:alert:${alert.id}`;
    await this.redis.setex(alertKey, 7 * 24 * 60 * 60, JSON.stringify(alert)); // Keep for 7 days

    // Log alert
    console.error('SECURITY ALERT:', JSON.stringify(alert, null, 2));
    
    // In production, integrate with external monitoring system
    if (process.env['NODE_ENV'] === 'production') {
      // External alerting integration point for production deployment
    }
  }

  /**
   * Log security event
   */
  private logSecurityEvent(event: SecurityEvent): void {
    const logLevel = event.severity === 'critical' ? 'error' : 
                    event.severity === 'high' ? 'warn' : 'info';
    
    console[logLevel]('SECURITY EVENT:', {
      id: event.id,
      type: event.type,
      severity: event.severity,
      ip: event.source.ip,
      userId: event.source.userId,
      blocked: event.blocked,
      details: event.details
    });
  }

  /**
   * Get security metrics
   */
  async getSecurityMetrics(): Promise<Record<string, any>> {
    const now = Date.now();
    const hour = Math.floor(now / 3600000);
    const day = Math.floor(now / 86400000);

    const metrics = {
      lastHour: {
        authFailures: await this.getEventCount('auth_failure', hour, 3600),
        rateLimitHits: await this.getEventCount('rate_limit_exceeded', hour, 3600),
        suspiciousPatterns: await this.getEventCount('suspicious_pattern', hour, 3600),
        blockedIps: await this.getBlockedIPCount(),
      },
      lastDay: {
        authFailures: await this.getEventCount('auth_failure', day, 86400),
        rateLimitHits: await this.getEventCount('rate_limit_exceeded', day, 86400),
        suspiciousPatterns: await this.getEventCount('suspicious_pattern', day, 86400),
      },
      currentlyBlocked: await this.getBlockedIPs(),
    };

    return metrics;
  }

  /**
   * Get blocked IP count
   */
  private async getBlockedIPCount(): Promise<number> {
    const keys = await this.redis.keys('security:block:*');
    return keys.length;
  }

  /**
   * Get blocked IPs
   */
  private async getBlockedIPs(): Promise<string[]> {
    const keys = await this.redis.keys('security:block:*');
    return keys.map(key => key.replace('security:block:', ''));
  }

  /**
   * Unblock IP
   */
  async unblockIP(ip: string): Promise<void> {
    const blockKey = `security:block:${ip}`;
    await this.redis.del(blockKey);
  }

  /**
   * Cleanup old events
   */
  async cleanup(): Promise<void> {
    // Redis TTL handles automatic cleanup
    console.log('Security monitor cleanup completed');
  }
}

/**
 * Security monitoring middleware
 */
export function createSecurityMonitoringMiddleware(monitor: SecurityMonitor) {
  return async (request: any, reply: any, done: any) => {
    const ip = request.ip || request.headers['x-forwarded-for'] || request.headers['x-real-ip'];
    const userAgent = request.headers['user-agent'];
    
    // Check if IP is blocked
    if (await monitor.isBlocked(ip)) {
      await monitor.recordEvent({
        type: 'unauthorized_access',
        severity: 'high',
        source: { ip, userAgent },
        details: { path: request.url, method: request.method },
        blocked: true
      });
      
      reply.code(403);
      reply.send({
        error: 'Forbidden',
        message: 'Access denied'
      });
      return;
    }
    
    // Attach monitor to request for event recording
    request.securityMonitor = monitor;
    request.securityContext = { ip, userAgent };
    
    done();
  };
}

/**
 * Input validation monitoring
 */
export function monitorSuspiciousInput(monitor: SecurityMonitor, input: string, context: string) {
  const suspiciousPatterns = [
    /javascript:/i,
    /<script/i,
    /eval\(/i,
    /exec\(/i,
    /\$\(/i,
    /document\.cookie/i,
    /union\s+select/i,
    /drop\s+table/i,
    /<iframe/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(input)) {
      monitor.recordEvent({
        type: 'suspicious_pattern',
        severity: 'medium',
        source: { ip: 'unknown' }, // Will be set by middleware
        details: { pattern: pattern.source, context, input: input.substring(0, 100) },
        blocked: false
      });
      break;
    }
  }
}
