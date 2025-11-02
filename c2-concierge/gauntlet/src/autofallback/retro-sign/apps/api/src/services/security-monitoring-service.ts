/**
 * Security Monitoring Service
 * Real-time threat detection, alerting, and incident response
 */

import { FastifyRequest } from 'fastify';

export interface SecurityEvent {
  id: string;
  timestamp: string;
  type: SecurityEventType;
  severity: 'low' | 'medium' | 'high' | 'critical';
  source: {
    ip_address: string;
    user_agent?: string;
    user_id?: string;
    session_id?: string;
  };
  details: Record<string, any>;
  status: 'open' | 'investigating' | 'resolved' | 'false_positive';
  assigned_to?: string;
  resolved_at?: string;
  resolution_notes?: string;
}

export type SecurityEventType = 
  | 'brute_force_attempt'
  | 'suspicious_activity'
  | 'privilege_escalation'
  | 'data_access_violation'
  | 'authentication_failure'
  | 'authorization_failure'
  | 'rate_limit_exceeded'
  | 'cors_violation'
  | 'injection_attempt'
  | 'abnormal_api_usage'
  | 'security_misconfiguration'
  | 'key_revocation_abuse';

export interface SecurityRule {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  conditions: SecurityCondition[];
  actions: SecurityAction[];
  severity: 'low' | 'medium' | 'high' | 'critical';
  cooldown_period: number; // seconds
}

export interface SecurityCondition {
  field: string;
  operator: 'eq' | 'ne' | 'gt' | 'lt' | 'gte' | 'lte' | 'in' | 'contains' | 'regex';
  value: any;
  time_window?: number; // seconds
}

export interface SecurityAction {
  type: 'alert' | 'block_ip' | 'require_captcha' | 'escalate' | 'log_only';
  parameters?: Record<string, any>;
}

export interface ThreatIntelligence {
  malicious_ips: Set<string>;
  suspicious_user_agents: Set<string>;
  known_attack_patterns: RegExp[];
  rate_limit_thresholds: Record<string, number>;
}

/**
 * Security Monitoring Service
 */
export class SecurityMonitoringService {
  private events: Map<string, SecurityEvent> = new Map();
  private rules: Map<string, SecurityRule> = new Map();
  private blockedIPs: Set<string> = new Set();
  private threatIntel: ThreatIntelligence;
  private eventCallbacks: Array<(event: SecurityEvent) => void> = [];

  constructor() {
    this.threatIntel = {
      malicious_ips: new Set(),
      suspicious_user_agents: new Set(),
      known_attack_patterns: [],
      rate_limit_thresholds: {}
    };
    
    this.initializeDefaultRules();
    this.loadThreatIntelligence();
  }

  /**
   * Analyze request for security threats
   */
  async analyzeRequest(request: FastifyRequest, context: {
    user?: any;
    action?: string;
    resource?: string;
  } = {}): Promise<SecurityEvent[]> {
    const events: SecurityEvent[] = [];
    
    // Check against all enabled security rules
    for (const rule of this.rules.values()) {
      if (!rule.enabled) continue;
      
      if (await this.evaluateRule(rule, request, context)) {
        const event = await this.createSecurityEvent(rule, request, context);
        events.push(event);
        
        // Execute rule actions
        await this.executeActions(rule.actions, event, request);
      }
    }
    
    return events;
  }

  /**
   * Report a security event
   */
  async reportEvent(event: Partial<SecurityEvent>): Promise<SecurityEvent> {
    const fullEvent: SecurityEvent = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      type: event.type || 'suspicious_activity',
      severity: event.severity || 'medium',
      source: event.source || { ip_address: 'unknown' },
      details: event.details || {},
      status: 'open',
      ...event
    };
    
    this.events.set(fullEvent.id, fullEvent);
    
    // Notify callbacks
    this.eventCallbacks.forEach(callback => {
      try {
        callback(fullEvent);
      } catch (error) {
        console.error('Security event callback error:', error);
      }
    });
    
    // Log based on severity
    this.logSecurityEvent(fullEvent);
    
    return fullEvent;
  }

  /**
   * Block an IP address
   */
  async blockIP(ipAddress: string, reason: string, duration: number = 3600): Promise<void> {
    this.blockedIPs.add(ipAddress);
    
    await this.reportEvent({
      type: 'suspicious_activity',
      severity: 'high',
      source: { ip_address: ipAddress },
      details: { 
        action: 'ip_blocked',
        reason,
        duration,
        blocked_at: new Date().toISOString()
      }
    });
    
    // TODO: Store in Redis with expiration for distributed blocking
    console.warn(`IP BLOCKED: ${ipAddress} - Reason: ${reason}`);
  }

  /**
   * Check if IP is blocked
   */
  isIPBlocked(ipAddress: string): boolean {
    return this.blockedIPs.has(ipAddress);
  }

  /**
   * Get security events
   */
  getEvents(filters: {
    type?: SecurityEventType;
    severity?: string;
    status?: string;
    start_time?: string;
    end_time?: string;
    limit?: number;
  } = {}): SecurityEvent[] {
    let events = Array.from(this.events.values());
    
    if (filters.type) {
      events = events.filter(e => e.type === filters.type);
    }
    
    if (filters.severity) {
      events = events.filter(e => e.severity === filters.severity);
    }
    
    if (filters.status) {
      events = events.filter(e => e.status === filters.status);
    }
    
    if (filters.start_time) {
      events = events.filter(e => e.timestamp >= filters.start_time);
    }
    
    if (filters.end_time) {
      events = events.filter(e => e.timestamp <= filters.end_time);
    }
    
    events.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    
    if (filters.limit) {
      events = events.slice(0, filters.limit);
    }
    
    return events;
  }

  /**
   * Get security statistics
   */
  getStatistics(): {
    total_events: number;
    events_by_type: Record<string, number>;
    events_by_severity: Record<string, number>;
    blocked_ips: number;
    active_threats: number;
    recent_events: SecurityEvent[];
  } {
    const events = Array.from(this.events.values());
    
    const eventsByType = events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const eventsBySeverity = events.reduce((acc, event) => {
      acc[event.severity] = (acc[event.severity] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    
    const activeThreats = events.filter(e => 
      e.status === 'open' && 
      (e.severity === 'high' || e.severity === 'critical')
    ).length;
    
    const recentEvents = events
      .filter(e => new Date(e.timestamp).getTime() > Date.now() - 24 * 60 * 60 * 1000)
      .slice(0, 10);
    
    return {
      total_events: events.length,
      events_by_type: eventsByType,
      events_by_severity: eventsBySeverity,
      blocked_ips: this.blockedIPs.size,
      active_threats: activeThreats,
      recent_events: recentEvents
    };
  }

  /**
   * Add security event callback
   */
  onSecurityEvent(callback: (event: SecurityEvent) => void): void {
    this.eventCallbacks.push(callback);
  }

  /**
   * Initialize default security rules
   */
  private initializeDefaultRules(): void {
    // Brute force detection
    this.addRule({
      id: 'brute_force_detection',
      name: 'Brute Force Attack Detection',
      description: 'Detects multiple failed authentication attempts',
      enabled: true,
      conditions: [
        {
          field: 'auth_failures',
          operator: 'gte',
          value: 5,
          time_window: 300 // 5 minutes
        }
      ],
      actions: [
        { type: 'alert' },
        { type: 'block_ip', parameters: { duration: 900 } } // 15 minutes
      ],
      severity: 'high',
      cooldown_period: 300
    });
    
    // Rate limit abuse
    this.addRule({
      id: 'rate_limit_abuse',
      name: 'Rate Limit Abuse Detection',
      description: 'Detects repeated rate limit violations',
      enabled: true,
      conditions: [
        {
          field: 'rate_limit_hits',
          operator: 'gte',
          value: 10,
          time_window: 60 // 1 minute
        }
      ],
      actions: [
        { type: 'alert' },
        { type: 'escalate' }
      ],
      severity: 'medium',
      cooldown_period: 300
    });
    
    // Suspicious user agents
    this.addRule({
      id: 'suspicious_user_agent',
      name: 'Suspicious User Agent Detection',
      description: 'Detects known malicious or automated user agents',
      enabled: true,
      conditions: [
        {
          field: 'user_agent',
          operator: 'regex',
          value: /(bot|crawler|scanner|sqlmap|nikto|nmap)/i
        }
      ],
      actions: [
        { type: 'alert' },
        { type: 'require_captcha' }
      ],
      severity: 'medium',
      cooldown_period: 600
    });
    
    // Key revocation abuse
    this.addRule({
      id: 'key_revocation_abuse',
      name: 'Key Revocation Abuse Detection',
      description: 'Detects excessive key revocation attempts',
      enabled: true,
      conditions: [
        {
          field: 'revocation_attempts',
          operator: 'gte',
          value: 3,
          time_window: 3600 // 1 hour
        }
      ],
      actions: [
        { type: 'alert' },
        { type: 'escalate' }
      ],
      severity: 'critical',
      cooldown_period: 1800
    });
  }

  /**
   * Load threat intelligence
   */
  private async loadThreatIntelligence(): Promise<void> {
    try {
      // TODO: Load from external threat intelligence feeds
      // For now, add some known patterns
      
      this.threatIntel.known_attack_patterns = [
        /(<script|javascript:|onload=)/i,
        /(union.*select|drop.*table|insert.*into)/i,
        /\.\.\//,
        /(\${|#\{|\%7B)/,
        /(cmd=|exec=|system=)/i
      ];
      
      this.threatIntel.suspicious_user_agents = new Set([
        'sqlmap',
        'nikto',
        'nmap',
        'masscan',
        'dirb',
        'gobuster',
        'hydra',
        'medusa'
      ]);
      
    } catch (error) {
      console.error('Failed to load threat intelligence:', error);
    }
  }

  /**
   * Evaluate security rule against request
   */
  private async evaluateRule(
    rule: SecurityRule, 
    request: FastifyRequest, 
    context: any
  ): Promise<boolean> {
    // This would implement the actual rule evaluation logic
    // For now, return false (no matches)
    return false;
  }

  /**
   * Create security event from rule
   */
  private async createSecurityEvent(
    rule: SecurityRule,
    request: FastifyRequest,
    context: any
  ): Promise<SecurityEvent> {
    return {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      type: 'suspicious_activity',
      severity: rule.severity,
      source: {
        ip_address: request.ip,
        user_agent: request.headers['user-agent'],
        user_id: context.user?.sub,
        session_id: context.session_id
      },
      details: {
        rule_id: rule.id,
        rule_name: rule.name,
        action: context.action,
        resource: context.resource
      },
      status: 'open'
    };
  }

  /**
   * Execute security actions
   */
  private async executeActions(
    actions: SecurityAction[],
    event: SecurityEvent,
    request: FastifyRequest
  ): Promise<void> {
    for (const action of actions) {
      switch (action.type) {
        case 'alert':
          // Send alert to monitoring system
          console.error('SECURITY ALERT:', event);
          break;
          
        case 'block_ip':
          await this.blockIP(request.ip, event.details.rule_name, action.parameters?.duration);
          break;
          
        case 'require_captcha':
          // Mark session for captcha requirement
          console.warn('CAPTCHA required for:', request.ip);
          break;
          
        case 'escalate':
          // Escalate to security team
          console.error('SECURITY ESCALATION:', event);
          break;
      }
    }
  }

  /**
   * Add security rule
   */
  private addRule(rule: SecurityRule): void {
    this.rules.set(rule.id, rule);
  }

  /**
   * Log security event based on severity
   */
  private logSecurityEvent(event: SecurityEvent): void {
    const message = `SECURITY EVENT: ${event.type} from ${event.source.ip_address}`;
    
    switch (event.severity) {
      case 'critical':
        console.error('🚨 CRITICAL:', message, event);
        break;
      case 'high':
        console.error('⚠️ HIGH:', message, event);
        break;
      case 'medium':
        console.warn('⚡ MEDIUM:', message, event);
        break;
      case 'low':
        console.info('ℹ️ LOW:', message, event);
        break;
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    return `sec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Global security monitoring instance
 */
export const securityMonitoring = new SecurityMonitoringService();

/**
 * Security monitoring middleware
 */
export function createSecurityMonitoringMiddleware() {
  return async (request: FastifyRequest, reply: any) => {
    // Check if IP is blocked
    if (securityMonitoring.isIPBlocked(request.ip)) {
      return reply.status(403).send({
        error: 'Access denied',
        message: 'Your IP address has been blocked due to suspicious activity'
      });
    }
    
    // Analyze request for security threats
    try {
      const events = await securityMonitoring.analyzeRequest(request, {
        user: (request as any).user,
        action: request.routeOptions?.config?.url,
        resource: request.url
      });
      
      // If any critical events were detected, block the request
      if (events.some(e => e.severity === 'critical')) {
        return reply.status(403).send({
          error: 'Security violation detected',
          message: 'Request blocked for security reasons'
        });
      }
      
    } catch (error) {
      console.error('Security monitoring error:', error);
      // Don't block requests if monitoring fails
    }
  };
}
