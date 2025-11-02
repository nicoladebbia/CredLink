/**
 * Audit Service - Append-only log writer with WORM storage
 * Implements tamper-evident, hash-chained audit records
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { check, Subject } from '@c2/rbac';

interface AuditRecord {
  ts: string;
  actor: {
    user_id: string;
    idp: string;
    ip: string;
  };
  request_id: string;
  action: string;
  resource: {
    tenant: string;
    key_id?: string;
    type: string;
  };
  before?: any;
  after?: any;
  policy_eval?: {
    policy: string;
    result: string;
  };
  hash: string;
  sig: string;
}

interface AuditExportOptions {
  from?: string;
  to?: string;
  format?: 'csv' | 'json';
  actions?: string[];
  users?: string[];
}

const app = new Hono();

// CORS for cross-origin requests with strict origin validation
app.use('/*', cors({
  origin: (origin, c) => {
    // Strict origin validation
    const allowedOrigins = [
      'https://admin.company.com',
      'https://admin.company.com:443'
    ];
    
    if (!origin) {
      // Allow requests without origin header (same-origin)
      return null;
    }
    
    if (allowedOrigins.includes(origin)) {
      return origin;
    }
    
    // Reject all other origins
    return null;
  },
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
  credentials: true,
  maxAge: 86400 // 24 hours
}));

// Secure environment for development (use proper secrets in production)
const secureEnv = {
  AUDIT_BUCKET: {
    put: async (key: string, value: string) => {
      // Input validation
      if (!key || typeof key !== 'string' || !value || typeof value !== 'string') {
        throw new Error('Invalid bucket parameters');
      }
      // In production, would use proper WORM storage
    },
    get: async (key: string) => {
      if (!key || typeof key !== 'string') {
        return null;
      }
      // In production, would query WORM storage
      return null;
    },
    list: async (options?: any) => {
      // In production, would list WORM storage objects
      return { objects: [] };
    }
  },
  AUDIT_SIGNING_KEY: 'mock-signing-key', // Replace with proper key in production
  PREVIOUS_HASH: 'genesis_hash'
};

/**
 * Audit Log Writer
 */
export class AuditLogger {
  private previousHash: string = secureEnv.PREVIOUS_HASH;

  /**
   * Write audit record to WORM storage
   */
  async write(record: Omit<AuditRecord, 'hash' | 'sig'>): Promise<string> {
    // Input validation
    if (!record || typeof record !== 'object') {
      throw new Error('Invalid audit record');
    }
    
    // Validate required fields
    const requiredFields = ['ts', 'actor', 'request_id', 'action', 'resource'];
    for (const field of requiredFields) {
      if (!record[field as keyof typeof record]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    // Validate timestamp format
    if (!this.isValidISODate(record.ts)) {
      throw new Error('Invalid timestamp format');
    }
    
    // Validate actor
    if (!record.actor || typeof record.actor !== 'object' || 
        !record.actor.user_id || !record.actor.idp || !record.actor.ip) {
      throw new Error('Invalid actor information');
    }
    
    // Validate request_id format
    if (!/^[a-zA-Z0-9_-]+$/.test(record.request_id)) {
      throw new Error('Invalid request_id format');
    }
    
    // Validate action
    if (!/^[a-zA-Z0-9_.:-]+$/.test(record.action)) {
      throw new Error('Invalid action format');
    }
    
    // Sanitize record data
    const sanitizedRecord = {
      ts: record.ts,
      actor: {
        user_id: record.actor.user_id.trim().replace(/[<>]/g, ''),
        idp: record.actor.idp.trim().replace(/[<>]/g, ''),
        ip: record.actor.ip.trim()
      },
      request_id: record.request_id.trim(),
      action: record.action.trim(),
      resource: {
        tenant: record.resource.tenant?.trim().replace(/[<>]/g, '') || 'unknown',
        key_id: record.resource.key_id?.trim(),
        type: record.resource.type?.trim().toLowerCase() || 'unknown'
      },
      before: record.before,
      after: record.after,
      policy_eval: record.policy_eval
    };
    
    // Create hash chain
    const recordBody = JSON.stringify({
      ...sanitizedRecord,
      hash: this.previousHash
    });
    
    const hash = await this.computeHash(recordBody);
    
    // Sign the record
    const signature = await this.signRecord(recordBody, hash);
    
    const auditRecord: AuditRecord = {
      ...sanitizedRecord,
      hash,
      sig: signature
    };

    // Store in WORM bucket
    const key = `audit/${sanitizedRecord.ts.replace(/[:.]/g, '-')}_${sanitizedRecord.request_id}.json`;
    await secureEnv.AUDIT_BUCKET.put(key, JSON.stringify(auditRecord, null, 2));
    
    // Update previous hash for chaining
    this.previousHash = hash;
    
    return key;
  }
  
  /**
   * Validate ISO date format
   */
  private isValidISODate(dateString: string): boolean {
    if (!dateString || typeof dateString !== 'string') {
      return false;
    }
    const date = new Date(dateString);
    return date instanceof Date && !isNaN(date.getTime()) && dateString === date.toISOString();
  }

  /**
   * Query audit records
   */
  async query(options: AuditExportOptions): Promise<AuditRecord[]> {
    const records: AuditRecord[] = [];
    
    // Input validation
    if (!options || typeof options !== 'object') {
      throw new Error('Invalid query options');
    }
    
    // Validate date formats if provided
    if (options.from && !this.isValidISODate(options.from)) {
      throw new Error('Invalid "from" date format');
    }
    
    if (options.to && !this.isValidISODate(options.to)) {
      throw new Error('Invalid "to" date format');
    }
    
    // Validate format
    if (options.format && !['csv', 'json'].includes(options.format)) {
      throw new Error('Invalid export format');
    }
    
    // Validate arrays
    if (options.actions && (!Array.isArray(options.actions) || options.actions.some(a => typeof a !== 'string'))) {
      throw new Error('Invalid actions array');
    }
    
    if (options.users && (!Array.isArray(options.users) || options.users.some(u => typeof u !== 'string'))) {
      throw new Error('Invalid users array');
    }
    
    // List audit files
    const listResult = await secureEnv.AUDIT_BUCKET.list({
      prefix: 'audit/'
    });

    for (const object of listResult.objects) {
      const recordData = await secureEnv.AUDIT_BUCKET.get((object as any).key);
      if (recordData) {
        try {
          const record = JSON.parse(recordData) as AuditRecord;
          
          // Validate record structure
          if (!this.isValidAuditRecord(record)) {
            continue; // Skip invalid records
          }
          
          // Apply filters
          if (this.matchesFilters(record, options)) {
            records.push(record);
          }
        } catch (error) {
          // Skip malformed records
          continue;
        }
      }
    }

    return records.sort((a, b) => new Date(a.ts).getTime() - new Date(b.ts).getTime());
  }
  
  /**
   * Validate audit record structure
   */
  private isValidAuditRecord(record: any): record is AuditRecord {
    return record && 
           typeof record === 'object' &&
           typeof record.ts === 'string' &&
           typeof record.actor === 'object' &&
           typeof record.request_id === 'string' &&
           typeof record.action === 'string' &&
           typeof record.resource === 'object' &&
           typeof record.hash === 'string' &&
           typeof record.sig === 'string';
  }

  /**
   * Export audit records as CSV
   */
  async exportCSV(options: AuditExportOptions): Promise<string> {
    const records = await this.query(options);
    
    // Define CSV headers with proper escaping
    const headers = [
      'Timestamp',
      'User ID',
      'IP Address',
      'Request ID',
      'Action',
      'Resource Type',
      'Resource Tenant',
      'Policy Evaluated',
      'Hash'
    ];

    const csvRows: string[] = [headers.join(',')];

    for (const record of records) {
      // Validate and sanitize record data
      if (!this.isValidAuditRecord(record)) {
        continue;
      }
      
      const row = [
        record.ts || '',
        record.actor?.user_id || '',
        record.actor?.ip || '',
        record.request_id || '',
        record.action || '',
        record.resource?.type || '',
        record.resource?.tenant || '',
        record.policy_eval?.policy || '',
        record.hash || ''
      ];
      
      // Escape CSV values properly
      const escapedRow = row.map(value => {
        if (typeof value !== 'string') {
          value = String(value);
        }
        // Remove any line breaks and control characters
        value = value.replace(/[\r\n\t]/g, ' ').trim();
        // Escape quotes and wrap in quotes if contains comma or quote
        if (value.includes(',') || value.includes('"')) {
          return `"${value.replace(/"/g, '""')}"`;
        }
        return value;
      });
      
      csvRows.push(escapedRow.join(','));
    }

    return csvRows.join('\n');
  }

  /**
   * Verify audit log integrity
   */
  async verifyIntegrity(): Promise<{ valid: boolean; issues: string[] }> {
    const issues: string[] = [];
    let valid = true;
    
    try {
      const records = await this.query({});
      
      if (records.length === 0) {
        return { valid: true, issues: [] };
      }
      
      for (let i = 0; i < records.length; i++) {
        const record = records[i];
        
        // Validate record structure
        if (!this.isValidAuditRecord(record)) {
          issues.push(`Invalid record structure at index ${i}`);
          valid = false;
          continue;
        }
        
        try {
          // Verify hash chain
          const expectedHashInput = JSON.stringify({
            ...record,
            hash: i > 0 ? records[i - 1].hash : secureEnv.PREVIOUS_HASH
          });
          
          const expectedHash = await this.computeHash(expectedHashInput);
          
          if (record.hash !== expectedHash) {
            issues.push(`Hash mismatch in record ${record.request_id} at index ${i}`);
            valid = false;
          }
          
          // Verify signature format
          if (!record.sig || typeof record.sig !== 'string') {
            issues.push(`Invalid signature format in record ${record.request_id}`);
            valid = false;
          } else {
            const signatureValid = await this.verifySignature(
              expectedHashInput,
              record.hash,
              record.sig
            );
            
            if (!signatureValid) {
              issues.push(`Invalid signature in record ${record.request_id}`);
              valid = false;
            }
          }
        } catch (error) {
          issues.push(`Verification error for record ${record.request_id}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          valid = false;
        }
      }
    } catch (error) {
      issues.push(`Integrity verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      valid = false;
    }

    return { valid, issues };
  }

  private async computeHash(data: string): Promise<string> {
    // Input validation
    if (!data || typeof data !== 'string') {
      throw new Error('Invalid data for hashing');
    }
    
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    return Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async signRecord(data: string, hash: string): Promise<string> {
    // Input validation
    if (!data || typeof data !== 'string' || !hash || typeof hash !== 'string') {
      throw new Error('Invalid data or hash for signing');
    }
    
    // In production, would use proper asymmetric signing with hardware security module
    // For now, return a mock signature with proper format
    const signatureData = `${hash}_${Date.now()}`;
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(signatureData);
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
    const signature = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
    
    return `ES256:${Buffer.from(signature).toString('base64')}`;
  }

  private async verifySignature(data: string, hash: string, signature: string): Promise<boolean> {
    // Input validation
    if (!data || typeof data !== 'string' || 
        !hash || typeof hash !== 'string' || 
        !signature || typeof signature !== 'string') {
      return false;
    }
    
    // In production, would verify with public key or hardware security module
    // For now, just check format and basic structure
    if (!signature.startsWith('ES256:')) {
      return false;
    }
    
    const signaturePart = signature.substring(6);
    if (!signaturePart || signaturePart.length === 0) {
      return false;
    }
    
    try {
      // Basic validation - check if it's valid base64
      Buffer.from(signaturePart, 'base64');
      return true;
    } catch (error) {
      return false;
    }
  }

  private matchesFilters(record: AuditRecord, options: AuditExportOptions): boolean {
    // Input validation
    if (!record || !options) {
      return false;
    }
    
    // Time range filter with proper date validation
    if (options.from) {
      try {
        const fromDate = new Date(options.from);
        const recordDate = new Date(record.ts);
        if (isNaN(fromDate.getTime()) || isNaN(recordDate.getTime()) || recordDate < fromDate) {
          return false;
        }
      } catch (error) {
        return false;
      }
    }
    
    if (options.to) {
      try {
        const toDate = new Date(options.to);
        const recordDate = new Date(record.ts);
        if (isNaN(toDate.getTime()) || isNaN(recordDate.getTime()) || recordDate > toDate) {
          return false;
        }
      } catch (error) {
        return false;
      }
    }

    // Action filter with validation
    if (options.actions && Array.isArray(options.actions)) {
      if (!options.actions.includes(record.action)) {
        return false;
      }
    }

    // User filter with validation
    if (options.users && Array.isArray(options.users)) {
      if (!options.users.includes(record.actor.user_id)) {
        return false;
      }
    }

    return true;
  }
}

// Singleton instance
export const auditLogger = new AuditLogger();

/**
 * Authentication Middleware
 */
async function authenticateAudit(c: any): Promise<Subject | null> {
  const authHeader = c.req.header('Authorization');
  
  // Input validation
  if (!authHeader || typeof authHeader !== 'string') {
    return null;
  }
  
  if (!authHeader.startsWith('Bearer ')) {
    return null;
  }

  const token = authHeader.substring(7);
  
  // Validate token format
  if (!token || typeof token !== 'string' || token.length < 10) {
    return null;
  }
  
  // Mock authentication - in production would validate JWT with proper signature verification
  if (constantTimeEquals(token, 'mock-admin-token')) {
    // Extract IP from request headers
    const ipHeaders = [
      'CF-Connecting-IP',
      'X-Real-IP',
      'X-Forwarded-For',
      'X-Client-IP'
    ];
    
    let ipAddress = '0.0.0.0'; // Safe default
    for (const header of ipHeaders) {
      const ip = c.req.header(header);
      if (ip && typeof ip === 'string') {
        const firstIP = ip.split(',')[0].trim();
        if (isValidIPv4(firstIP)) {
          ipAddress = firstIP;
          break;
        }
      }
    }
    
    return {
      user_id: 'admin_123',
      org_id: 'org_123',
      roles: ['org_admin'],
      ip_address: ipAddress
    };
  }

  return null;
}

/**
 * Timing-safe string comparison to prevent timing attacks
 */
function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) {
    return false;
  }
  
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  
  return result === 0;
}

/**
 * Validate IPv4 address format
 */
function isValidIPv4(ip: string): boolean {
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  return ipv4Regex.test(ip);
}

/**
 * Audit Endpoints
 */

// Write audit record
app.post('/audit', async (c) => {
  const subject = await authenticateAudit(c);
  if (!subject) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Check authorization
  const canWrite = check(
    subject,
    { verb: 'create', resource: 'audit' },
    { type: 'audit', org_id: subject.org_id },
    { timestamp: new Date(), request_id: `write_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }
  );

  if (!canWrite.allow) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  try {
    const record = await c.req.json().catch(() => null);
    
    // Validate request body
    if (!record || typeof record !== 'object') {
      return c.json({ error: 'Invalid request body' }, 400);
    }
    
    // Validate required fields
    const requiredFields = ['ts', 'actor', 'request_id', 'action'];
    for (const field of requiredFields) {
      if (!record[field]) {
        return c.json({ error: `Missing required field: ${field}` }, 400);
      }
    }
    
    // Additional validation for nested objects
    if (!record.actor || typeof record.actor !== 'object' || 
        !record.actor.user_id || !record.actor.idp || !record.actor.ip) {
      return c.json({ error: 'Invalid actor information' }, 400);
    }
    
    if (!record.resource || typeof record.resource !== 'object' || 
        !record.resource.tenant || !record.resource.type) {
      return c.json({ error: 'Invalid resource information' }, 400);
    }

    const key = await auditLogger.write(record);
    
    return c.json({ 
      success: true, 
      key,
      hash: record.hash 
    });
  } catch (error) {
    // Log error without exposing sensitive information
    console.error('Write audit error:', error instanceof Error ? error.message : 'Unknown error');
    return c.json({ error: 'Failed to write audit record' }, 500);
  }
});

// Query audit records
app.get('/audit', async (c) => {
  const subject = await authenticateAudit(c);
  if (!subject) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Check authorization
  const canRead = check(
    subject,
    { verb: 'read', resource: 'audit' },
    { type: 'audit', org_id: subject.org_id },
    { timestamp: new Date(), request_id: `query_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }
  );

  if (!canRead.allow) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  try {
    // Build query options with validation
    const options: AuditExportOptions = {};
    
    const from = c.req.query('from');
    if (from) {
      if (!isValidISODate(from)) {
        return c.json({ error: 'Invalid "from" date format' }, 400);
      }
      options.from = from;
    }
    
    const to = c.req.query('to');
    if (to) {
      if (!isValidISODate(to)) {
        return c.json({ error: 'Invalid "to" date format' }, 400);
      }
      options.to = to;
    }
    
    const format = c.req.query('format');
    if (format && !['csv', 'json'].includes(format)) {
      return c.json({ error: 'Invalid format. Must be "csv" or "json"' }, 400);
    }
    options.format = format as 'csv' | 'json';
    
    const actions = c.req.query('actions');
    if (actions) {
      const actionArray = actions.split(',').map(a => a.trim()).filter(a => a.length > 0);
      if (actionArray.some(a => !/^[a-zA-Z0-9_.:-]+$/.test(a))) {
        return c.json({ error: 'Invalid action format' }, 400);
      }
      options.actions = actionArray;
    }
    
    const users = c.req.query('users');
    if (users) {
      const userArray = users.split(',').map(u => u.trim()).filter(u => u.length > 0);
      if (userArray.some(u => !/^[a-zA-Z0-9_-]+$/.test(u))) {
        return c.json({ error: 'Invalid user format' }, 400);
      }
      options.users = userArray;
    }

    if (options.format === 'csv') {
      const csv = await auditLogger.exportCSV(options);
      return c.text(csv, 200, {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-export-${new Date().toISOString().split('T')[0]}.csv"`,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      });
    } else {
      const records = await auditLogger.query(options);
      return c.json({
        records,
        total: records.length,
        exported_at: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Query audit error:', error instanceof Error ? error.message : 'Unknown error');
    return c.json({ error: 'Failed to query audit records' }, 500);
  }
});

// Verify audit integrity
app.get('/audit/verify', async (c) => {
  const subject = await authenticateAudit(c);
  if (!subject) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  // Check authorization
  const canVerify = check(
    subject,
    { verb: 'read', resource: 'audit' },
    { type: 'audit', org_id: subject.org_id },
    { timestamp: new Date(), request_id: `verify_${Date.now()}_${Math.random().toString(36).substr(2, 9)}` }
  );

  if (!canVerify.allow) {
    return c.json({ error: 'Forbidden' }, 403);
  }

  try {
    const result = await auditLogger.verifyIntegrity();
    
    // Add security headers
    c.header('Cache-Control', 'no-cache, no-store, must-revalidate');
    c.header('Pragma', 'no-cache');
    c.header('Expires', '0');
    
    return c.json({
      ...result,
      verified_at: new Date().toISOString(),
      verified_by: subject.user_id
    });
  } catch (error) {
    console.error('Verify audit error:', error instanceof Error ? error.message : 'Unknown error');
    return c.json({ error: 'Failed to verify audit integrity' }, 500);
  }
});

/**
 * Helper Functions
 */

/**
 * Log audit event (for use by other services)
 */
export async function logAuditEvent(
  actor: { user_id: string; idp: string; ip: string },
  action: string,
  resource: { tenant: string; type: string; key_id?: string },
  before?: any,
  after?: any,
  policyEval?: { policy: string; result: string }
): Promise<void> {
  // Input validation
  if (!actor || typeof actor !== 'object' || 
      !actor.user_id || !actor.idp || !actor.ip ||
      !action || typeof action !== 'string' ||
      !resource || typeof resource !== 'object' || 
      !resource.tenant || !resource.type) {
    console.error('Invalid audit event parameters');
    return;
  }
  
  // Validate and sanitize inputs
  const sanitizedActor = {
    user_id: actor.user_id.trim().replace(/[<>]/g, ''),
    idp: actor.idp.trim().replace(/[<>]/g, ''),
    ip: actor.ip.trim()
  };
  
  const sanitizedAction = action.trim();
  const sanitizedResource = {
    tenant: resource.tenant.trim().replace(/[<>]/g, ''),
    type: resource.type.trim().toLowerCase(),
    key_id: resource.key_id?.trim()
  };
  
  const record = {
    ts: new Date().toISOString(),
    actor: sanitizedActor,
    request_id: `evt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    action: sanitizedAction,
    resource: sanitizedResource,
    before,
    after,
    policy_eval: policyEval
  };

  try {
    await auditLogger.write(record);
  } catch (error) {
    // Log error without exposing sensitive information
    console.error('Failed to log audit event:', error instanceof Error ? error.message : 'Unknown error');
    // In production, would implement retry logic or dead letter queue
  }
}

/**
 * Validate ISO date format (moved here for reuse)
 */
function isValidISODate(dateString: string): boolean {
  if (!dateString || typeof dateString !== 'string') {
    return false;
  }
  const date = new Date(dateString);
  return date instanceof Date && !isNaN(date.getTime()) && dateString === date.toISOString();
}

export default app;
