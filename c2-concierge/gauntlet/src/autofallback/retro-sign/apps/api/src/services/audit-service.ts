/**
 * Audit Logging Service
 * Production-ready audit trail with database persistence and monitoring
 */

import { FastifyRequest } from 'fastify';

// Audit event interface
export interface AuditEvent {
  id?: string;
  timestamp: string;
  action: string;
  user_id: string;
  session_id?: string;
  ip_address: string;
  user_agent?: string;
  resource_id?: string;
  resource_type?: string;
  details: Record<string, any>;
  severity: 'low' | 'medium' | 'high' | 'critical';
  success: boolean;
  error_message?: string;
  request_id?: string;
  correlation_id?: string;
}

// Database interface for audit storage
export interface AuditDatabase {
  insertAuditEvent(event: AuditEvent): Promise<string>;
  getAuditEvents(filters: AuditFilters): Promise<AuditEvent[]>;
  getAuditStatistics(timeRange: TimeRange): Promise<AuditStatistics>;
}

export interface AuditFilters {
  user_id?: string;
  action?: string;
  resource_id?: string;
  severity?: string;
  start_time?: string;
  end_time?: string;
  limit?: number;
  offset?: number;
}

export interface TimeRange {
  start: string;
  end: string;
}

export interface AuditStatistics {
  total_events: number;
  events_by_action: Record<string, number>;
  events_by_severity: Record<string, number>;
  events_by_user: Record<string, number>;
  failure_rate: number;
  critical_events: number;
}

// PostgreSQL implementation
export class PostgreSQLAuditDatabase implements AuditDatabase {
  constructor(private db: any) {}

  async insertAuditEvent(event: AuditEvent): Promise<string> {
    const query = `
      INSERT INTO audit_events (
        timestamp, action, user_id, session_id, ip_address, user_agent,
        resource_id, resource_type, details, severity, success, error_message,
        request_id, correlation_id
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
      ) RETURNING id
    `;

    const values = [
      event.timestamp,
      event.action,
      event.user_id,
      event.session_id || null,
      event.ip_address,
      event.user_agent || null,
      event.resource_id || null,
      event.resource_type || null,
      JSON.stringify(event.details),
      event.severity,
      event.success,
      event.error_message || null,
      event.request_id || null,
      event.correlation_id || null
    ];

    const result = await this.db.query(query, values);
    return result.rows[0].id;
  }

  async getAuditEvents(filters: AuditFilters): Promise<AuditEvent[]> {
    let query = `
      SELECT * FROM audit_events 
      WHERE 1=1
    `;
    const values: any[] = [];
    let paramIndex = 1;

    if (filters.user_id) {
      query += ` AND user_id = $${paramIndex++}`;
      values.push(filters.user_id);
    }

    if (filters.action) {
      query += ` AND action = $${paramIndex++}`;
      values.push(filters.action);
    }

    if (filters.resource_id) {
      query += ` AND resource_id = $${paramIndex++}`;
      values.push(filters.resource_id);
    }

    if (filters.severity) {
      query += ` AND severity = $${paramIndex++}`;
      values.push(filters.severity);
    }

    if (filters.start_time) {
      query += ` AND timestamp >= $${paramIndex++}`;
      values.push(filters.start_time);
    }

    if (filters.end_time) {
      query += ` AND timestamp <= $${paramIndex++}`;
      values.push(filters.end_time);
    }

    query += ` ORDER BY timestamp DESC`;

    if (filters.limit) {
      query += ` LIMIT $${paramIndex++}`;
      values.push(filters.limit);
    }

    if (filters.offset) {
      query += ` OFFSET $${paramIndex++}`;
      values.push(filters.offset);
    }

    const result = await this.db.query(query, values);
    return result.rows.map(this.mapRowToEvent);
  }

  async getAuditStatistics(timeRange: TimeRange): Promise<AuditStatistics> {
    const query = `
      SELECT 
        COUNT(*) as total_events,
        COUNT(CASE WHEN severity = 'critical' THEN 1 END) as critical_events,
        COUNT(CASE WHEN NOT success THEN 1 END)::float / COUNT(*) as failure_rate,
        jsonb_object_agg(action, action_count) as events_by_action,
        jsonb_object_agg(severity, severity_count) as events_by_severity,
        jsonb_object_agg(user_id, user_count) as events_by_user
      FROM (
        SELECT 
          action,
          severity,
          user_id,
          success,
          COUNT(*) as action_count,
          COUNT(*) FILTER (WHERE severity = severity) as severity_count,
          COUNT(*) FILTER (WHERE user_id = user_id) as user_count
        FROM audit_events 
        WHERE timestamp BETWEEN $1 AND $2
        GROUP BY action, severity, user_id, success
      ) stats
    `;

    const result = await this.db.query(query, [timeRange.start, timeRange.end]);
    const row = result.rows[0];

    return {
      total_events: parseInt(row.total_events),
      critical_events: parseInt(row.critical_events),
      failure_rate: parseFloat(row.failure_rate) || 0,
      events_by_action: row.events_by_action || {},
      events_by_severity: row.events_by_severity || {},
      events_by_user: row.events_by_user || {}
    };
  }

  private mapRowToEvent(row: any): AuditEvent {
    return {
      id: row.id,
      timestamp: row.timestamp,
      action: row.action,
      user_id: row.user_id,
      session_id: row.session_id,
      ip_address: row.ip_address,
      user_agent: row.user_agent,
      resource_id: row.resource_id,
      resource_type: row.resource_type,
      details: row.details,
      severity: row.severity,
      success: row.success,
      error_message: row.error_message,
      request_id: row.request_id,
      correlation_id: row.correlation_id
    };
  }
}

// Main Audit Service
export class AuditService {
  private auditDb: AuditDatabase;
  private fastify: any;

  constructor(fastify: any, auditDb: AuditDatabase) {
    this.fastify = fastify;
    this.auditDb = auditDb;
  }

  async logEvent(event: Partial<AuditEvent> & {
    action: string;
    user_id: string;
    request: FastifyRequest;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    success?: boolean;
  }): Promise<string> {
    const fullEvent: AuditEvent = {
      id: this.generateEventId(),
      timestamp: new Date().toISOString(),
      action: event.action,
      user_id: event.user_id,
      session_id: this.extractSessionId(event.request),
      ip_address: event.request.ip,
      user_agent: event.request.headers['user-agent'],
      resource_id: event.resource_id,
      resource_type: event.resource_type,
      details: event.details || {},
      severity: event.severity || 'medium',
      success: event.success !== undefined ? event.success : true,
      error_message: event.error_message,
      request_id: this.extractRequestId(event.request),
      correlation_id: this.extractCorrelationId(event.request)
    };

    try {
      // Store in database
      const eventId = await this.auditDb.insertAuditEvent(fullEvent);

      // Log to application logs
      this.logToApplication(fullEvent);

      // Send to monitoring system for critical events
      if (fullEvent.severity === 'critical') {
        await this.sendToMonitoring(fullEvent);
      }

      return eventId;
    } catch (error) {
      // Fallback logging if database fails
      console.error('AUDIT SERVICE ERROR:', error);
      console.error('FAILED AUDIT EVENT:', JSON.stringify(fullEvent));
      this.fastify.log.error('Audit service failure', { error, event: fullEvent });
      throw error;
    }
  }

  async getEvents(filters: AuditFilters): Promise<AuditEvent[]> {
    return this.auditDb.getAuditEvents(filters);
  }

  async getStatistics(timeRange: TimeRange): Promise<AuditStatistics> {
    return this.auditDb.getAuditStatistics(timeRange);
  }

  private generateEventId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private extractSessionId(request: FastifyRequest): string | undefined {
    // Try to extract from various possible locations
    return (request as any).sessionId || 
           request.headers['x-session-id'] as string ||
           (request as any).cookies?.sessionId;
  }

  private extractRequestId(request: FastifyRequest): string | undefined {
    return (request as any).id || 
           request.headers['x-request-id'] as string;
  }

  private extractCorrelationId(request: FastifyRequest): string | undefined {
    return request.headers['x-correlation-id'] as string;
  }

  private logToApplication(event: AuditEvent): void {
    const logLevel = this.getLogLevel(event.severity);
    const message = `AUDIT: ${event.action} by ${event.user_id}`;
    
    this.fastify.log[logLevel](message, {
      audit_id: event.id,
      action: event.action,
      user_id: event.user_id,
      severity: event.severity,
      success: event.success,
      ip_address: event.ip_address,
      resource_id: event.resource_id,
      details: event.details
    });
  }

  private getLogLevel(severity: string): string {
    switch (severity) {
      case 'critical': return 'error';
      case 'high': return 'warn';
      case 'medium': return 'info';
      case 'low': return 'debug';
      default: return 'info';
    }
  }

  private async sendToMonitoring(event: AuditEvent): Promise<void> {
    try {
      // TODO: Implement monitoring system integration
      // Examples: Send to Sentry, DataDog, Splunk, etc.
      
      console.error('CRITICAL AUDIT EVENT:', {
        id: event.id,
        action: event.action,
        user_id: event.user_id,
        ip_address: event.ip_address,
        timestamp: event.timestamp,
        details: event.details
      });

      // Example webhook for critical events
      if (process.env.AUDIT_WEBHOOK_URL) {
        await fetch(process.env.AUDIT_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            alert_type: 'SECURITY_AUDIT',
            severity: event.severity,
            event
          })
        });
      }
    } catch (error) {
      console.error('Failed to send audit event to monitoring:', error);
    }
  }
}

// Create audit service instance
export function createAuditService(fastify: any, db: any): AuditService {
  const auditDb = new PostgreSQLAuditDatabase(db);
  return new AuditService(fastify, auditDb);
}

// Helper function to create audit event from request
export function createAuditEventFromRequest(
  action: string,
  user: any,
  request: FastifyRequest,
  options: {
    resource_id?: string;
    resource_type?: string;
    details?: Record<string, any>;
    severity?: 'low' | 'medium' | 'high' | 'critical';
    success?: boolean;
    error_message?: string;
  } = {}
): Partial<AuditEvent> {
  return {
    action,
    user_id: user?.sub || 'anonymous',
    request,
    resource_id: options.resource_id,
    resource_type: options.resource_type,
    details: options.details || {},
    severity: options.severity,
    success: options.success,
    error_message: options.error_message
  };
}
