# Cross-Tenant Opt-In Signal Exchange System

## Overview
Privacy-preserving signal exchange system enabling tenants to optionally share PDQ hashes and minimal lineage fingerprints for cross-tenant collision detection. Implements hash-only sharing, granular opt-in controls, and audit logging for compliance.

## Dependencies
```json
{
  "dependencies": {
    "pg": "^8.11.3",
    "redis": "^4.6.8",
    "crypto": "^1.0.1",
    "jose": "^5.0.0",
    "zod": "^3.22.2",
    "date-fns": "^2.30.0"
  }
}
```

## Core Implementation

### Signal Exchange Configuration
```typescript
export interface SignalExchangeConfig {
  // Privacy Controls
  privacy: {
    hashOnlySharing: boolean;
    piiFiltering: boolean;
    dataMinimization: boolean;
    retentionPeriod: number; // days
  };
  
  // Sharing Controls
  sharing: {
    requireExplicitOptIn: boolean;
    allowGranularControls: boolean;
    defaultShareFields: string[];
    maxShareFields: string[];
    requireAdminApproval: boolean;
  };
  
  // Security Controls
  security: {
    encryptSharedData: boolean;
    signatureVerification: boolean;
    auditLogging: boolean;
    rateLimiting: {
      enabled: boolean;
      requestsPerMinute: number;
      burstLimit: number;
    };
  };
  
  // Network Controls
  network: {
    allowlistEnabled: boolean;
    participantTenants: string[];
    trustedIssuers: string[];
    endpointTimeout: number;
  };
}

export interface TenantOptIn {
  tenantId: string;
  optedIn: boolean;
  optInDate: Date;
  optInExpires?: Date;
  sharedFields: string[];
  restrictions: {
    maxQueriesPerDay: number;
    allowedQueryTypes: string[];
    excludeInternalAssets: boolean;
  };
  adminApproved: boolean;
  approvedBy?: string;
  auditLog: Array<{
    action: string;
    timestamp: Date;
    userId: string;
    details?: any;
  }>;
}

export interface SharedSignal {
  id: string;
  sourceTenantId: string;
  assetId: string;
  pdqHash: string;
  lineageFingerprint: {
    issuerKeyId: string;
    timestampBucket: string; // Coarse timestamp (e.g., 2023-10)
    assetType?: string;
  };
  shareMetadata: {
    sharedAt: Date;
    expiresAt: Date;
    shareCount: number;
    lastAccessed: Date;
  };
  signature?: string; // JWS signature for verification
}

export interface SignalExchangeRequest {
  requestingTenantId: string;
  queryType: 'similarity_search' | 'hash_lookup' | 'batch_match';
  queryData: {
    pdqHash?: string;
    pdqHashes?: string[];
    threshold?: number;
    limit?: number;
    filters?: {
      tenantIds?: string[];
      dateRange?: { start: Date; end: Date };
      assetTypes?: string[];
    };
  };
  options: {
    includeMetadata?: boolean;
    includeLineage?: boolean;
    maxResults?: number;
  };
}
```

### Cross-Tenant Signal Exchange Manager
```typescript
import { createHash, createSign, createVerify } from 'crypto';
import { SignJWT, jwtVerify } from 'jose';
import pino from 'pino';

export class CrossTenantSignalExchange {
  private config: SignalExchangeConfig;
  private storage: UnifiedStorageManager;
  private logger: pino.Logger;
  private rateLimiter: Map<string, number[]> = new Map();

  constructor(
    config: SignalExchangeConfig,
    storage: UnifiedStorageManager
  ) {
    this.config = config;
    this.storage = storage;
    this.logger = pino({ level: 'info' });
  }

  /**
   * Register tenant for signal sharing
   */
  async registerTenant(
    tenantId: string,
    optInData: {
      sharedFields: string[];
      restrictions: Partial<TenantOptIn['restrictions']>;
      adminApprover?: string;
    }
  ): Promise<TenantOptIn> {
    try {
      // Validate tenant eligibility
      await this.validateTenantEligibility(tenantId);
      
      // Validate shared fields
      this.validateSharedFields(optInData.sharedFields);
      
      // Create opt-in record
      const optIn: TenantOptIn = {
        tenantId,
        optedIn: true,
        optInDate: new Date(),
        sharedFields: optInData.sharedFields,
        restrictions: {
          maxQueriesPerDay: 1000,
          allowedQueryTypes: ['similarity_search', 'hash_lookup'],
          excludeInternalAssets: true,
          ...optInData.restrictions
        },
        adminApproved: !this.config.sharing.requireAdminApproval,
        approvedBy: optInData.adminApprover,
        auditLog: [{
          action: 'opt_in_registered',
          timestamp: new Date(),
          userId: optInData.adminApprover || 'system',
          details: optInData
        }]
      };

      // Store opt-in configuration
      await this.storage.storeTenantOptIn(optIn);
      
      // Log audit event
      await this.logAuditEvent({
        tenantId,
        action: 'TENANT_OPT_IN',
        userId: optInData.adminApprover || 'system',
        details: { sharedFields: optInData.sharedFields.length }
      });

      this.logger.info({ tenantId }, 'Tenant registered for signal sharing');
      return optIn;

    } catch (error) {
      this.logger.error({ tenantId, error: error.message }, 'Failed to register tenant');
      throw new Error(`Tenant registration failed: ${error.message}`);
    }
  }

  /**
   * Share signal from tenant to exchange
   */
  async shareSignal(
    sourceTenantId: string,
    signalData: {
      assetId: string;
      pdqHash: string;
      manifestLineage: any;
    }
  ): Promise<string> {
    try {
      // Verify tenant opt-in status
      const optIn = await this.getTenantOptIn(sourceTenantId);
      if (!optIn || !optIn.optedIn) {
        throw new Error('Tenant not opted in for signal sharing');
      }

      // Check if opt-in has expired
      if (optIn.optInExpires && optIn.optInExpires < new Date()) {
        throw new Error('Tenant opt-in has expired');
      }

      // Create shared signal with data minimization
      const sharedSignal = await this.createSharedSignal(sourceTenantId, signalData, optIn);
      
      // Sign signal if verification is enabled
      if (this.config.security.signatureVerification) {
        sharedSignal.signature = await this.signSignal(sharedSignal);
      }

      // Store shared signal
      const signalId = await this.storage.storeSharedSignal(sharedSignal);
      
      // Update share metadata
      await this.updateShareMetadata(sourceTenantId, signalData.assetId);
      
      // Log audit event
      await this.logAuditEvent({
        tenantId: sourceTenantId,
        action: 'SIGNAL_SHARED',
        userId: 'system',
        details: { 
          signalId,
          assetId: signalData.assetId,
          fieldsShared: Object.keys(sharedSignal.lineageFingerprint).length
        }
      });

      this.logger.info({ 
        tenantId: sourceTenantId, 
        signalId, 
        assetId: signalData.assetId 
      }, 'Signal shared to exchange');

      return signalId;

    } catch (error) {
      this.logger.error({ 
        tenantId: sourceTenantId, 
        assetId: signalData.assetId, 
        error: error.message 
      }, 'Failed to share signal');
      throw new Error(`Signal sharing failed: ${error.message}`);
    }
  }

  /**
   * Query shared signals from exchange
   */
  async querySharedSignals(
    request: SignalExchangeRequest
  ): Promise<{
    signals: SharedSignal[];
    metadata: {
      totalResults: number;
      queryTime: number;
      sourceTenants: string[];
    };
  }> {
    const startTime = performance.now();

    try {
      // Validate requesting tenant
      await this.validateRequestingTenant(request.requestingTenantId);
      
      // Apply rate limiting
      await this.checkRateLimit(request.requestingTenantId);
      
      // Validate query request
      this.validateQueryRequest(request);
      
      // Execute query based on type
      let signals: SharedSignal[];
      
      switch (request.queryType) {
        case 'similarity_search':
          signals = await this.similaritySearch(request);
          break;
        case 'hash_lookup':
          signals = await this.hashLookup(request);
          break;
        case 'batch_match':
          signals = await this.batchMatch(request);
          break;
        default:
          throw new Error(`Unsupported query type: ${request.queryType}`);
      }

      // Apply tenant allowlist filtering
      signals = this.filterByAllowlist(signals);
      
      // Apply result limits
      const limitedSignals = signals.slice(0, request.options.maxResults || 100);
      
      // Verify signatures if enabled
      if (this.config.security.signatureVerification) {
        await this.verifySignalSignatures(limitedSignals);
      }

      const queryTime = performance.now() - startTime;
      
      // Log audit event
      await this.logAuditEvent({
        tenantId: request.requestingTenantId,
        action: 'SIGNALS_QUERIED',
        userId: 'system',
        details: {
          queryType: request.queryType,
          resultCount: limitedSignals.length,
          queryTime
        }
      });

      this.logger.info({
        tenantId: request.requestingTenantId,
        queryType: request.queryType,
        resultCount: limitedSignals.length,
        queryTime
      }, 'Signal query completed');

      return {
        signals: limitedSignals,
        metadata: {
          totalResults: signals.length,
          queryTime,
          sourceTenants: [...new Set(limitedSignals.map(s => s.sourceTenantId))]
        }
      };

    } catch (error) {
      this.logger.error({ 
        tenantId: request.requestingTenantId, 
        error: error.message 
      }, 'Signal query failed');
      throw new Error(`Signal query failed: ${error.message}`);
    }
  }

  /**
   * Batch share multiple signals
   */
  async batchShareSignals(
    sourceTenantId: string,
    signals: Array<{
      assetId: string;
      pdqHash: string;
      manifestLineage: any;
    }>
  ): Promise<string[]> {
    const signalIds: string[] = [];
    
    // Process in batches to avoid overwhelming the system
    const batchSize = 100;
    for (let i = 0; i < signals.length; i += batchSize) {
      const batch = signals.slice(i, i + batchSize);
      
      const batchPromises = batch.map(signal => 
        this.shareSignal(sourceTenantId, signal)
      );
      
      const batchResults = await Promise.allSettled(batchPromises);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          signalIds.push(result.value);
        } else {
          this.logger.warn({
            tenantId: sourceTenantId,
            assetId: batch[index].assetId,
            error: result.reason.message
          }, 'Failed to share signal in batch');
        }
      });
      
      // Brief pause between batches
      if (i + batchSize < signals.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
    
    return signalIds;
  }

  /**
   * Get tenant opt-in status
   */
  async getTenantOptIn(tenantId: string): Promise<TenantOptIn | null> {
    return await this.storage.getTenantOptIn(tenantId);
  }

  /**
   * Update tenant opt-in configuration
   */
  async updateTenantOptIn(
    tenantId: string,
    updates: {
      sharedFields?: string[];
      restrictions?: Partial<TenantOptIn['restrictions']>;
      optInExpires?: Date;
      adminApprover?: string;
    }
  ): Promise<TenantOptIn> {
    const existingOptIn = await this.getTenantOptIn(tenantId);
    if (!existingOptIn) {
      throw new Error('Tenant not found');
    }

    const updatedOptIn: TenantOptIn = {
      ...existingOptIn,
      ...updates,
      auditLog: [
        ...existingOptIn.auditLog,
        {
          action: 'opt_in_updated',
          timestamp: new Date(),
          userId: updates.adminApprover || 'system',
          details: updates
        }
      ]
    };

    await this.storage.updateTenantOptIn(updatedOptIn);
    
    await this.logAuditEvent({
      tenantId,
      action: 'TENANT_OPT_IN_UPDATED',
      userId: updates.adminApprover || 'system',
      details: updates
    });

    return updatedOptIn;
  }

  /**
   * Revoke tenant opt-in
   */
  async revokeTenantOptIn(
    tenantId: string,
    revokedBy: string
  ): Promise<void> {
    const optIn = await this.getTenantOptIn(tenantId);
    if (!optIn) {
      throw new Error('Tenant not found');
    }

    optIn.optedIn = false;
    optIn.auditLog.push({
      action: 'opt_in_revoked',
      timestamp: new Date(),
      userId: revokedBy,
      details: { revokedAt: new Date() }
    });

    await this.storage.updateTenantOptIn(optIn);
    
    // Remove all shared signals from exchange
    await this.storage.removeTenantSignals(tenantId);
    
    await this.logAuditEvent({
      tenantId,
      action: 'TENANT_OPT_IN_REVOKED',
      userId: revokedBy,
      details: { revokedAt: new Date() }
    });

    this.logger.info({ tenantId, revokedBy }, 'Tenant opt-in revoked');
  }

  /**
   * Get exchange statistics
   */
  async getExchangeStats(): Promise<{
    totalTenants: number;
    activeTenants: number;
    totalSharedSignals: number;
    signalsByTenant: Record<string, number>;
    queryStats: {
      totalQueries: number;
      queriesByType: Record<string, number>;
      avgQueryTime: number;
    };
  }> {
    return await this.storage.getExchangeStats();
  }

  /**
   * Create shared signal with data minimization
   */
  private async createSharedSignal(
    sourceTenantId: string,
    signalData: {
      assetId: string;
      pdqHash: string;
      manifestLineage: any;
    },
    optIn: TenantOptIn
  ): Promise<SharedSignal> {
    const fingerprint = this.createLineageFingerprint(
      signalData.manifestLineage,
      optIn.sharedFields
    );

    return {
      id: this.generateSignalId(),
      sourceTenantId,
      assetId: signalData.assetId,
      pdqHash: signalData.pdqHash,
      lineageFingerprint: fingerprint,
      shareMetadata: {
        sharedAt: new Date(),
        expiresAt: new Date(Date.now() + (this.config.privacy.retentionPeriod * 24 * 60 * 60 * 1000)),
        shareCount: 0,
        lastAccessed: new Date()
      }
    };
  }

  /**
   * Create lineage fingerprint with minimal data
   */
  private createLineageFingerprint(
    lineage: any,
    allowedFields: string[]
  ): SharedSignal['lineageFingerprint'] {
    const fingerprint: SharedSignal['lineageFingerprint'] = {
      issuerKeyId: '',
      timestampBucket: ''
    };

    // Include issuer key ID if allowed
    if (allowedFields.includes('issuerKeyId') && lineage.issuerKeyId) {
      fingerprint.issuerKeyId = lineage.issuerKeyId;
    }

    // Create coarse timestamp bucket (e.g., "2023-10")
    if (lineage.timestamp) {
      const date = new Date(lineage.timestamp);
      fingerprint.timestampBucket = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    // Include asset type if allowed
    if (allowedFields.includes('assetType') && lineage.assetType) {
      fingerprint.assetType = lineage.assetType;
    }

    return fingerprint;
  }

  /**
   * Sign signal for verification
   */
  private async signSignal(signal: SharedSignal): Promise<string> {
    const secret = new TextEncoder().encode(process.env.SIGNAL_EXCHANGE_SECRET!);
    
    const signature = await new SignJWT({
      signalId: signal.id,
      sourceTenantId: signal.sourceTenantId,
      assetId: signal.assetId,
      pdqHash: signal.pdqHash,
      lineageFingerprint: signal.lineageFingerprint
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(secret);

    return signature;
  }

  /**
   * Verify signal signature
   */
  private async verifySignalSignature(signal: SharedSignal): Promise<boolean> {
    if (!signal.signature) {
      return false;
    }

    try {
      const secret = new TextEncoder().encode(process.env.SIGNAL_EXCHANGE_SECRET!);
      const { payload } = await jwtVerify(signal.signature, secret);
      
      // Verify that signature matches signal data
      return payload.signalId === signal.id &&
             payload.sourceTenantId === signal.sourceTenantId &&
             payload.assetId === signal.assetId &&
             payload.pdqHash === signal.pdqHash;
             
    } catch (error) {
      this.logger.warn({ signalId: signal.id, error: error.message }, 'Signature verification failed');
      return false;
    }
  }

  /**
   * Similarity search query
   */
  private async similaritySearch(request: SignalExchangeRequest): Promise<SharedSignal[]> {
    if (!request.queryData.pdqHash) {
      throw new Error('PDQ hash required for similarity search');
    }

    return await this.storage.searchSimilarSignals(
      request.queryData.pdqHash,
      request.queryData.threshold || 0.85,
      request.queryData.limit || 50,
      request.queryData.filters
    );
  }

  /**
   * Hash lookup query
   */
  private async hashLookup(request: SignalExchangeRequest): Promise<SharedSignal[]> {
    if (!request.queryData.pdqHash) {
      throw new Error('PDQ hash required for hash lookup');
    }

    const signal = await this.storage.getSignalByHash(request.queryData.pdqHash);
    return signal ? [signal] : [];
  }

  /**
   * Batch match query
   */
  private async batchMatch(request: SignalExchangeRequest): Promise<SharedSignal[]> {
    if (!request.queryData.pdqHashes || request.queryData.pdqHashes.length === 0) {
      throw new Error('PDQ hashes required for batch match');
    }

    return await this.storage.batchMatchSignals(
      request.queryData.pdqHashes,
      request.queryData.threshold || 0.85,
      request.queryData.limit || 100
    );
  }

  /**
   * Validate tenant eligibility
   */
  private async validateTenantEligibility(tenantId: string): Promise<void> {
    if (this.config.network.allowlistEnabled && 
        !this.config.network.participantTenants.includes(tenantId)) {
      throw new Error('Tenant not in allowlist');
    }

    // Check if tenant exists and is in good standing
    const tenant = await this.storage.getTenant(tenantId);
    if (!tenant || tenant.status !== 'active') {
      throw new Error('Tenant not eligible for signal sharing');
    }
  }

  /**
   * Validate shared fields
   */
  private validateSharedFields(fields: string[]): void {
    const allowedFields = new Set(this.config.sharing.maxShareFields);
    
    for (const field of fields) {
      if (!allowedFields.has(field)) {
        throw new Error(`Field not allowed for sharing: ${field}`);
      }
    }

    if (fields.length === 0) {
      throw new Error('At least one field must be shared');
    }
  }

  /**
   * Validate requesting tenant
   */
  private async validateRequestingTenant(tenantId: string): Promise<void> {
    const optIn = await this.getTenantOptIn(tenantId);
    if (!optIn || !optIn.optedIn) {
      throw new Error('Tenant not opted in for signal exchange');
    }

    // Check query type restrictions
    // Implementation would check optIn.restrictions.allowedQueryTypes
  }

  /**
   * Check rate limiting
   */
  private async checkRateLimit(tenantId: string): Promise<void> {
    if (!this.config.security.rateLimiting.enabled) {
      return;
    }

    const now = Date.now();
    const windowStart = now - 60000; // 1 minute window
    const requests = this.rateLimiter.get(tenantId) || [];
    
    // Filter old requests
    const validRequests = requests.filter(timestamp => timestamp > windowStart);
    
    if (validRequests.length >= this.config.security.rateLimiting.requestsPerMinute) {
      throw new Error('Rate limit exceeded');
    }
    
    // Add current request
    validRequests.push(now);
    this.rateLimiter.set(tenantId, validRequests);
  }

  /**
   * Validate query request
   */
  private validateQueryRequest(request: SignalExchangeRequest): void {
    if (!request.requestingTenantId) {
      throw new Error('Requesting tenant ID required');
    }

    if (!request.queryType) {
      throw new Error('Query type required');
    }

    if (!['similarity_search', 'hash_lookup', 'batch_match'].includes(request.queryType)) {
      throw new Error('Invalid query type');
    }

    if (request.options.maxResults && request.options.maxResults > 1000) {
      throw new Error('Maximum results cannot exceed 1000');
    }
  }

  /**
   * Filter by allowlist
   */
  private filterByAllowlist(signals: SharedSignal[]): SharedSignal[] {
    if (!this.config.network.allowlistEnabled) {
      return signals;
    }

    return signals.filter(signal => 
      this.config.network.participantTenants.includes(signal.sourceTenantId)
    );
  }

  /**
   * Verify signal signatures
   */
  private async verifySignalSignatures(signals: SharedSignal[]): Promise<void> {
    const verificationPromises = signals.map(signal => 
      this.verifySignalSignature(signal)
    );
    
    const results = await Promise.all(verificationPromises);
    
    // Filter out signals with invalid signatures
    const validSignals = signals.filter((_, index) => results[index]);
    
    // Replace original array with verified signals
    signals.splice(0, signals.length, ...validSignals);
  }

  /**
   * Update share metadata
   */
  private async updateShareMetadata(tenantId: string, assetId: string): Promise<void> {
    await this.storage.incrementShareCount(tenantId, assetId);
  }

  /**
   * Log audit event
   */
  private async logAuditEvent(event: {
    tenantId: string;
    action: string;
    userId: string;
    details?: any;
  }): Promise<void> {
    if (!this.config.security.auditLogging) {
      return;
    }

    await this.storage.logAuditEvent({
      ...event,
      timestamp: new Date(),
      ipAddress: 'unknown', // Would be extracted from request
      userAgent: 'unknown'  // Would be extracted from request
    });
  }

  /**
   * Generate signal ID
   */
  private generateSignalId(): string {
    return createHash('sha256')
      .update(`${Date.now()}-${Math.random()}`)
      .digest('hex');
  }
}
```

### Signal Exchange Storage Extensions
```typescript
export class SignalExchangeStorage {
  private postgres: PostgreSQLStorageManager;

  constructor(postgres: PostgreSQLStorageManager) {
    this.postgres = postgres;
  }

  /**
   * Store tenant opt-in configuration
   */
  async storeTenantOptIn(optIn: TenantOptIn): Promise<void> {
    const query = `
      INSERT INTO tenant_opt_in 
        (tenant_id, opted_in, opt_in_date, opt_in_expires, shared_fields, 
         restrictions, admin_approved, approved_by, audit_log)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      ON CONFLICT (tenant_id) 
      DO UPDATE SET
        opted_in = EXCLUDED.opted_in,
        opt_in_expires = EXCLUDED.opt_in_expires,
        shared_fields = EXCLUDED.shared_fields,
        restrictions = EXCLUDED.restrictions,
        admin_approved = EXCLUDED.admin_approved,
        approved_by = EXCLUDED.approved_by,
        audit_log = EXCLUDED.audit_log;
    `;

    const values = [
      optIn.tenantId,
      optIn.optedIn,
      optIn.optInDate,
      optIn.optInExpires,
      JSON.stringify(optIn.sharedFields),
      JSON.stringify(optIn.restrictions),
      optIn.adminApproved,
      optIn.approvedBy,
      JSON.stringify(optIn.auditLog)
    ];

    await this.postgres.pool.query(query, values);
  }

  /**
   * Store shared signal
   */
  async storeSharedSignal(signal: SharedSignal): Promise<string> {
    const query = `
      INSERT INTO shared_signals 
        (id, source_tenant_id, asset_id, pdq_hash, lineage_fingerprint, 
         share_metadata, signature)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id;
    `;

    const values = [
      signal.id,
      signal.sourceTenantId,
      signal.assetId,
      signal.pdqHash,
      JSON.stringify(signal.lineageFingerprint),
      JSON.stringify(signal.shareMetadata),
      signal.signature
    ];

    const result = await this.postgres.pool.query(query, values);
    return result.rows[0].id;
  }

  /**
   * Search similar signals
   */
  async searchSimilarSignals(
    queryHash: string,
    threshold: number,
    limit: number,
    filters?: any
  ): Promise<SharedSignal[]> {
    // Implementation would use the collision index for similarity search
    // This is a simplified version
    const query = `
      SELECT 
        id, source_tenant_id, asset_id, pdq_hash, lineage_fingerprint,
        share_metadata, signature
      FROM shared_signals
      WHERE pdq_hash = $1
      LIMIT $2;
    `;

    const result = await this.postgres.pool.query(query, [queryHash, limit]);
    return result.rows.map(this.mapRowToSignal);
  }

  /**
   * Get signal by hash
   */
  async getSignalByHash(hash: string): Promise<SharedSignal | null> {
    const query = `
      SELECT 
        id, source_tenant_id, asset_id, pdq_hash, lineage_fingerprint,
        share_metadata, signature
      FROM shared_signals
      WHERE pdq_hash = $1;
    `;

    const result = await this.postgres.pool.query(query, [hash]);
    return result.rows.length > 0 ? this.mapRowToSignal(result.rows[0]) : null;
  }

  /**
   * Remove tenant signals
   */
  async removeTenantSignals(tenantId: string): Promise<number> {
    const query = 'DELETE FROM shared_signals WHERE source_tenant_id = $1;';
    const result = await this.postgres.pool.query(query, [tenantId]);
    return result.rowCount;
  }

  /**
   * Log audit event
   */
  async logAuditEvent(event: any): Promise<void> {
    const query = `
      INSERT INTO audit_log 
        (tenant_id, action, user_id, timestamp, details, ip_address, user_agent)
      VALUES 
        ($1, $2, $3, $4, $5, $6, $7);
    `;

    const values = [
      event.tenantId,
      event.action,
      event.userId,
      event.timestamp,
      JSON.stringify(event.details || {}),
      event.ipAddress,
      event.userAgent
    ];

    await this.postgres.pool.query(query, values);
  }

  /**
   * Map database row to SharedSignal
   */
  private mapRowToSignal(row: any): SharedSignal {
    return {
      id: row.id,
      sourceTenantId: row.source_tenant_id,
      assetId: row.asset_id,
      pdqHash: row.pdq_hash,
      lineageFingerprint: JSON.parse(row.lineage_fingerprint),
      shareMetadata: JSON.parse(row.share_metadata),
      signature: row.signature
    };
  }
}
```
