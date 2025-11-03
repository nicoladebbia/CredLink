import {
  ManifestStoreConfig,
  ManifestMetadata,
  AuditRecord,
  SignedUrlRequest,
  SignedUrlResponse,
  IntegrityCheckResult,
  ListObjectsOptions,
  ListObjectsResult,
  StoreMetrics
} from './types.js';
import { createHash, createHmac, timingSafeEqual } from 'crypto';
import { randomBytes } from 'crypto';

export class ManifestStore {
  private config: ManifestStoreConfig;
  private auditLog: AuditRecord[] = [];
  private objectMetadata = new Map<string, ManifestMetadata>();
  private readonly lock = new Map<string, Promise<void>>();
  
  // Security constants
  private readonly MAX_TENANT_ID_LENGTH = 100;
  private readonly MAX_AUTHOR_LENGTH = 200;
  private readonly MAX_AUDIT_LOG_SIZE = 100000;
  private readonly AUDIT_LOG_TRIM_SIZE = 50000;
  private readonly MAX_LIST_LIMIT = 10000;
  private readonly DEFAULT_LIST_LIMIT = 1000;
  private readonly MAX_AUDIT_LIMIT = 1000;
  private readonly DEFAULT_AUDIT_LIMIT = 100;
  private readonly VALID_OBJECT_KEY_PATTERN = /^[a-f0-9]{64}\.c2pa$/;
  private readonly MAX_RETRY_ATTEMPTS = 3;
  private readonly LOCK_TIMEOUT_MS = 30000;
  
  // Rate limiting
  private readonly rateLimitMap = new Map<string, { count: number; resetTime: number }>();
  private readonly RATE_LIMIT_WINDOW = 60000; // 1 minute
  private readonly RATE_LIMIT_MAX_REQUESTS = 100;

  constructor(config: ManifestStoreConfig) {
    this.validateConfig(config);
    this.config = config;
  }

  private validateConfig(config: ManifestStoreConfig): void {
    if (!config) {
      throw new Error('Configuration is required');
    }
    
    if (!config.baseUrl || typeof config.baseUrl !== 'string') {
      throw new Error('Invalid base URL');
    }
    
    if (!Array.isArray(config.allowedMimeTypes) || config.allowedMimeTypes.length === 0) {
      throw new Error('Allowed MIME types must be a non-empty array');
    }
    
    if (!Number.isInteger(config.maxObjectSize) || config.maxObjectSize <= 0) {
      throw new Error('Max object size must be a positive integer');
    }
    
    if (!Number.isInteger(config.signedUrlTtl) || config.signedUrlTtl <= 0) {
      throw new Error('Signed URL TTL must be a positive integer');
    }
  }

  private sanitizeInput(input: string, maxLength: number): string {
    if (!input || typeof input !== 'string') return '';
    return input.substring(0, maxLength).replace(/[<>"'&]/g, '');
  }

  private validateTenantId(tenantId: string): boolean {
    return tenantId && 
           typeof tenantId === 'string' && 
           tenantId.length > 0 && 
           tenantId.length <= this.MAX_TENANT_ID_LENGTH &&
           /^[a-zA-Z0-9_-]+$/.test(tenantId);
  }

  private validateAuthor(author: string): boolean {
    return author && 
           typeof author === 'string' && 
           author.length > 0 && 
           author.length <= this.MAX_AUTHOR_LENGTH &&
           /^[a-zA-Z0-9_\-\s@.]+$/.test(author);
  }

  private checkRateLimit(identifier: string): boolean {
    const now = Date.now();
    const key = identifier;
    const current = this.rateLimitMap.get(key);
    
    if (!current || now > current.resetTime) {
      this.rateLimitMap.set(key, { count: 1, resetTime: now + this.RATE_LIMIT_WINDOW });
      return true;
    }
    
    if (current.count >= this.RATE_LIMIT_MAX_REQUESTS) {
      return false;
    }
    
    current.count++;
    return true;
  }

  private async acquireLock(key: string): Promise<void> {
    const startTime = Date.now();
    
    while (this.lock.has(key)) {
      if (Date.now() - startTime > this.LOCK_TIMEOUT_MS) {
        throw new Error('Lock acquisition timeout');
      }
      
      try {
        await Promise.race([
          this.lock.get(key)!,
          new Promise((_, reject) => setTimeout(() => reject(new Error('Lock timeout')), 5000))
        ]);
      } catch {
        // Lock timeout, continue trying
      }
      
      // Add small delay to prevent CPU spinning
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    const promise = Promise.resolve();
    this.lock.set(key, promise);
  }

  private releaseLock(key: string): void {
    this.lock.delete(key);
  }

  /**
   * Generate a signed URL for secure manifest uploads
   */
  async generateSignedUrl(request: SignedUrlRequest): Promise<SignedUrlResponse> {
    try {
      // Rate limiting check
      if (!this.checkRateLimit(request.tenantId)) {
        throw new Error('Rate limit exceeded');
      }

      // Validate request
      this.validateSignedUrlRequest(request);

      // Check if object already exists (write-once semantics)
      if (this.objectMetadata.has(request.objectKey) && this.config.writeOnceEnabled) {
        throw new Error('Object already exists: write-once semantics prohibit overwrites');
      }

      // Generate signature with secure expiration
      const expires = Date.now() + Math.min(request.expires || this.config.signedUrlTtl, 3600000); // Max 1 hour
      const payload = {
        objectKey: request.objectKey,
        contentType: request.contentType,
        contentLength: request.contentLength,
        tenantId: request.tenantId,
        expires,
        method: 'PUT'
      };

      const signature = this.generateSignature(payload, request.signature);

      // Construct signed URL
      const url = `${this.config.baseUrl.replace(/\/$/, '')}/${request.objectKey}`;
      
      return {
        url,
        method: 'PUT',
        headers: {
          'Content-Type': request.contentType,
          'Content-Length': request.contentLength.toString(),
          'Authorization': `C2-Signature ${signature}`,
          'X-C2-Tenant': this.sanitizeInput(request.tenantId, this.MAX_TENANT_ID_LENGTH),
          'X-C2-Author': this.sanitizeInput(request.author, this.MAX_AUTHOR_LENGTH),
          'X-C2-Expires': expires.toString()
        },
        expires: new Date(expires).toISOString(),
        maxFileSize: this.config.maxObjectSize,
        allowedContentTypes: [...this.config.allowedMimeTypes]
      };
    } catch (error) {
      throw new Error(`Failed to generate signed URL: ${this.sanitizeError(error)}`);
    }
  }

  /**
   * Store manifest with write-once semantics
   */
  async storeManifest(
    objectKey: string,
    content: Buffer | Uint8Array,
    metadata: Omit<ManifestMetadata, 'createdAt'>
  ): Promise<ManifestMetadata> {
    try {
      // Rate limiting check
      if (!this.checkRateLimit(metadata.tenantId)) {
        throw new Error('Rate limit exceeded');
      }

      await this.acquireLock(objectKey);
      
      // Validate hash-addressed path
      if (!this.VALID_OBJECT_KEY_PATTERN.test(objectKey)) {
        throw new Error('Invalid object key: must be SHA-256 hash with .c2pa extension');
      }

      // Check write-once semantics
      if (this.objectMetadata.has(objectKey) && this.config.writeOnceEnabled) {
        const existing = this.objectMetadata.get(objectKey)!;
        await this.logAuditRecord({
          id: this.generateSecureId(),
          timestamp: new Date().toISOString(),
          operation: 'attempt_overwrite',
          objectKey: this.sanitizeInput(objectKey, 100),
          tenantId: this.sanitizeInput(metadata.tenantId, this.MAX_TENANT_ID_LENGTH),
          author: this.sanitizeInput(metadata.author, this.MAX_AUTHOR_LENGTH),
          requestSignature: this.sanitizeInput(metadata.signature, 200),
          objectChecksum: this.sanitizeInput(metadata.checksum, 64),
          beforeState: this.sanitizeMetadata(existing),
          afterState: null,
          ip: 'internal',
          userAgent: 'manifest-store',
          result: 'failure',
          reason: 'Write-once semantics prohibit overwrite'
        });
        throw new Error('Object already exists: write-once semantics prohibit overwrites');
      }

      // Validate content and metadata
      this.validateManifestContent(content, metadata);
      this.validateMetadata(metadata);

      // Create manifest metadata
      const manifestMetadata: ManifestMetadata = {
        ...metadata,
        createdAt: new Date().toISOString()
      };

      // Store the manifest
      this.objectMetadata.set(objectKey, manifestMetadata);

      // Log successful creation
      await this.logAuditRecord({
        id: this.generateSecureId(),
        timestamp: new Date().toISOString(),
        operation: 'create',
        objectKey: this.sanitizeInput(objectKey, 100),
        tenantId: this.sanitizeInput(metadata.tenantId, this.MAX_TENANT_ID_LENGTH),
        author: this.sanitizeInput(metadata.author, this.MAX_AUTHOR_LENGTH),
        requestSignature: this.sanitizeInput(metadata.signature, 200),
        objectChecksum: this.sanitizeInput(metadata.checksum, 64),
        beforeState: null,
        afterState: this.sanitizeMetadata(manifestMetadata),
        ip: 'internal',
        userAgent: 'manifest-store',
        result: 'success'
      });

      return manifestMetadata;
    } catch (error) {
      // Log any unexpected errors
      if (error instanceof Error && !error.message.includes('write-once') && !error.message.includes('Rate limit')) {
        await this.logAuditRecord({
          id: this.generateSecureId(),
          timestamp: new Date().toISOString(),
          operation: 'create',
          objectKey: this.sanitizeInput(objectKey, 100),
          tenantId: this.sanitizeInput(metadata.tenantId, this.MAX_TENANT_ID_LENGTH),
          author: this.sanitizeInput(metadata.author, this.MAX_AUTHOR_LENGTH),
          requestSignature: this.sanitizeInput(metadata.signature, 200),
          objectChecksum: this.sanitizeInput(metadata.checksum, 64),
          beforeState: null,
          afterState: null,
          ip: 'internal',
          userAgent: 'manifest-store',
          result: 'failure',
          reason: this.sanitizeError(error)
        });
      }
      throw error;
    } finally {
      this.releaseLock(objectKey);
    }
  }

  /**
   * Retrieve manifest metadata
   */
  async getManifest(objectKey: string): Promise<ManifestMetadata | null> {
    try {
      // Validate object key format
      if (!this.VALID_OBJECT_KEY_PATTERN.test(objectKey)) {
        return null;
      }

      const metadata = this.objectMetadata.get(objectKey) || null;

      // Log access with sanitized data
      await this.logAuditRecord({
        id: this.generateSecureId(),
        timestamp: new Date().toISOString(),
        operation: 'access',
        objectKey: this.sanitizeInput(objectKey, 100),
        tenantId: this.sanitizeInput(metadata?.tenantId || 'unknown', this.MAX_TENANT_ID_LENGTH),
        author: 'system',
        requestSignature: '',
        objectChecksum: this.sanitizeInput(metadata?.checksum || '', 64),
        beforeState: null,
        afterState: null,
        ip: 'internal',
        userAgent: 'manifest-store',
        result: metadata ? 'success' : 'failure',
        reason: metadata ? undefined : 'Object not found'
      });

      return metadata;
    } catch (error) {
      // Return null on any error to prevent information disclosure
      return null;
    }
  }

  /**
   * Check manifest integrity
   */
  async checkIntegrity(objectKey: string, content: Buffer | Uint8Array): Promise<IntegrityCheckResult> {
    try {
      // Validate object key format
      if (!this.VALID_OBJECT_KEY_PATTERN.test(objectKey)) {
        return {
          valid: false,
          expectedHash: '',
          actualHash: '',
          sizeMatch: false,
          contentTypeValid: false,
          errors: ['Invalid object key format']
        };
      }

      const metadata = this.objectMetadata.get(objectKey);
      if (!metadata) {
        return {
          valid: false,
          expectedHash: '',
          actualHash: '',
          sizeMatch: false,
          contentTypeValid: false,
          errors: ['Object not found']
        };
      }

      const errors: string[] = [];
      const actualHash = createHash('sha256').update(content).digest('hex');
      const sizeMatch = content.length === metadata.contentLength;
      const contentTypeValid = this.config.allowedMimeTypes.includes(metadata.contentType);

      if (actualHash !== metadata.hash) {
        errors.push('Hash mismatch');
      }

      if (!sizeMatch) {
        errors.push('Size mismatch');
      }

      if (!contentTypeValid) {
        errors.push('Invalid content type');
      }

      // Extract hash from filename
      const expectedHash = objectKey.replace('.c2pa', '');

      return {
        valid: errors.length === 0 && actualHash === expectedHash,
        expectedHash,
        actualHash,
        sizeMatch,
        contentTypeValid,
        errors
      };
    } catch (error) {
      return {
        valid: false,
        expectedHash: '',
        actualHash: '',
        sizeMatch: false,
        contentTypeValid: false,
        errors: ['Integrity check failed']
      };
    }
  }

  /**
   * List objects with pagination and filtering
   */
  async listObjects(options: ListObjectsOptions = {}): Promise<ListObjectsResult> {
    try {
      let objects = Array.from(this.objectMetadata.values());

      // Validate and apply filters
      if (options.tenantId) {
        if (!this.validateTenantId(options.tenantId)) {
          return {
            objects: [],
            continuationToken: undefined,
            isTruncated: false,
            totalCount: 0
          };
        }
        objects = objects.filter(obj => obj.tenantId === options.tenantId);
      }

      if (options.createdAfter) {
        const afterDate = new Date(options.createdAfter);
        if (isNaN(afterDate.getTime())) {
          return {
            objects: [],
            continuationToken: undefined,
            isTruncated: false,
            totalCount: 0
          };
        }
        objects = objects.filter(obj => new Date(obj.createdAt) >= afterDate);
      }

      if (options.createdBefore) {
        const beforeDate = new Date(options.createdBefore);
        if (isNaN(beforeDate.getTime())) {
          return {
            objects: [],
            continuationToken: undefined,
            isTruncated: false,
            totalCount: 0
          };
        }
        objects = objects.filter(obj => new Date(obj.createdAt) <= beforeDate);
      }

      if (options.prefix) {
        const sanitizedPrefix = this.sanitizeInput(options.prefix, 64);
        if (!/^[a-f0-9]*$/.test(sanitizedPrefix)) {
          return {
            objects: [],
            continuationToken: undefined,
            isTruncated: false,
            totalCount: 0
          };
        }
        objects = objects.filter(obj => obj.hash.startsWith(sanitizedPrefix));
      }

      // Sort by creation time (newest first)
      objects.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Apply pagination with strict limits
      const limit = Math.min(
        Math.max(options.limit || this.DEFAULT_LIST_LIMIT, 1), 
        this.MAX_LIST_LIMIT
      );
      
      let startIndex = 0;
      if (options.continuationToken) {
        const parsed = parseInt(options.continuationToken, 10);
        startIndex = isNaN(parsed) || parsed < 0 ? 0 : parsed;
      }
      
      startIndex = Math.min(startIndex, objects.length);
      const paginatedObjects = objects.slice(startIndex, startIndex + limit);

      return {
        objects: paginatedObjects,
        continuationToken: startIndex + limit < objects.length ? (startIndex + limit).toString() : undefined,
        isTruncated: startIndex + limit < objects.length,
        totalCount: objects.length
      };
    } catch (error) {
      return {
        objects: [],
        continuationToken: undefined,
        isTruncated: false,
        totalCount: 0
      };
    }
  }

  /**
   * Get store metrics
   */
  async getMetrics(): Promise<StoreMetrics> {
    try {
      const objects = Array.from(this.objectMetadata.values());
      const totalObjects = objects.length;
      const totalSize = objects.reduce((sum, obj) => sum + obj.contentLength, 0);
      const averageObjectSize = totalObjects > 0 ? totalSize / totalObjects : 0;

      const objectCountByTenant: Record<string, number> = {};
      const sizeByTenant: Record<string, number> = {};

      objects.forEach(obj => {
        const tenantId = this.sanitizeInput(obj.tenantId, this.MAX_TENANT_ID_LENGTH);
        objectCountByTenant[tenantId] = (objectCountByTenant[tenantId] || 0) + 1;
        sizeByTenant[tenantId] = (sizeByTenant[tenantId] || 0) + obj.contentLength;
      });

      const sortedObjects = objects.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const oldestObject = sortedObjects[0]?.createdAt || '';
      const newestObject = sortedObjects[sortedObjects.length - 1]?.createdAt || '';

      // Calculate recent metrics with proper date validation
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recentAudits = this.auditLog.filter(audit => {
        try {
          return new Date(audit.timestamp) >= yesterday;
        } catch {
          return false;
        }
      });

      const writeAttempts24h = recentAudits.filter(audit => 
        audit.operation === 'create' || audit.operation === 'attempt_overwrite'
      ).length;
      
      const writeSuccesses24h = recentAudits.filter(audit => 
        audit.operation === 'create' && audit.result === 'success'
      ).length;
      
      const readRequests24h = recentAudits.filter(audit => audit.operation === 'access').length;
      
      const readFailures24h = recentAudits.filter(audit => 
        audit.operation === 'access' && audit.result === 'failure'
      ).length;
      
      const cacheHitRate24h = readRequests24h > 0 ? (readRequests24h - readFailures24h) / readRequests24h : 0;

      return {
        totalObjects,
        totalSize,
        objectCountByTenant,
        sizeByTenant,
        averageObjectSize,
        oldestObject,
        newestObject,
        writeAttempts24h,
        writeSuccesses24h,
        readRequests24h,
        cacheHitRate24h
      };
    } catch (error) {
      // Return empty metrics on error to prevent information disclosure
      return {
        totalObjects: 0,
        totalSize: 0,
        objectCountByTenant: {},
        sizeByTenant: {},
        averageObjectSize: 0,
        oldestObject: '',
        newestObject: '',
        writeAttempts24h: 0,
        writeSuccesses24h: 0,
        readRequests24h: 0,
        cacheHitRate24h: 0
      };
    }
  }

  /**
   * Get audit records
   */
  async getAuditRecords(options: {
    limit?: number;
    offset?: number;
    tenantId?: string;
    operation?: string;
    since?: string;
  } = {}): Promise<{ records: AuditRecord[]; total: number }> {
    try {
      let records = [...this.auditLog];

      // Validate and apply filters
      if (options.tenantId) {
        if (!this.validateTenantId(options.tenantId)) {
          return { records: [], total: 0 };
        }
        records = records.filter(record => record.tenantId === options.tenantId);
      }

      if (options.operation) {
        const sanitizedOperation = this.sanitizeInput(options.operation, 50);
        const validOperations = ['create', 'access', 'attempt_overwrite'];
        if (!validOperations.includes(sanitizedOperation)) {
          return { records: [], total: 0 };
        }
        records = records.filter(record => record.operation === sanitizedOperation);
      }

      if (options.since) {
        const sinceDate = new Date(options.since);
        if (isNaN(sinceDate.getTime())) {
          return { records: [], total: 0 };
        }
        records = records.filter(record => {
          try {
            return new Date(record.timestamp) >= sinceDate;
          } catch {
            return false;
          }
        });
      }

      // Sort by timestamp (newest first)
      records.sort((a, b) => {
        try {
          return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
        } catch {
          return 0;
        }
      });

      // Apply pagination with strict limits
      const limit = Math.min(
        Math.max(options.limit || this.DEFAULT_AUDIT_LIMIT, 1), 
        this.MAX_AUDIT_LIMIT
      );
      
      const offset = Math.max(options.offset || 0, 0);
      const paginatedRecords = records.slice(offset, offset + limit);

      // Sanitize records before returning
      const sanitizedRecords = paginatedRecords.map(record => this.sanitizeAuditRecord(record));

      return {
        records: sanitizedRecords,
        total: records.length
      };
    } catch (error) {
      return {
        records: [],
        total: 0
      };
    }
  }

  private validateSignedUrlRequest(request: SignedUrlRequest): void {
    if (!this.VALID_OBJECT_KEY_PATTERN.test(request.objectKey)) {
      throw new Error('Invalid object key: must be SHA-256 hash with .c2pa extension');
    }

    if (!this.config.allowedMimeTypes.includes(request.contentType)) {
      throw new Error(`Content type not allowed`);
    }

    if (!Number.isInteger(request.contentLength) || request.contentLength <= 0 || request.contentLength > this.config.maxObjectSize) {
      throw new Error(`Invalid content size`);
    }

    if (!this.validateTenantId(request.tenantId)) {
      throw new Error('Invalid tenant ID');
    }

    if (!this.validateAuthor(request.author)) {
      throw new Error('Invalid author');
    }

    if (request.expires && (!Number.isInteger(request.expires) || request.expires <= 0 || request.expires > 3600000)) {
      throw new Error('Invalid expiration time');
    }
  }

  private validateMetadata(metadata: Omit<ManifestMetadata, 'createdAt'>): void {
    if (!this.validateTenantId(metadata.tenantId)) {
      throw new Error('Invalid tenant ID in metadata');
    }

    if (!this.validateAuthor(metadata.author)) {
      throw new Error('Invalid author in metadata');
    }

    if (!metadata.hash || !/^[a-f0-9]{64}$/.test(metadata.hash)) {
      throw new Error('Invalid hash format');
    }

    if (!metadata.checksum || !/^[a-f0-9]{32}$/.test(metadata.checksum)) {
      throw new Error('Invalid checksum format');
    }

    if (!this.config.allowedMimeTypes.includes(metadata.contentType)) {
      throw new Error(`Content type not allowed in metadata`);
    }

    if (!Number.isInteger(metadata.contentLength) || metadata.contentLength <= 0 || metadata.contentLength > this.config.maxObjectSize) {
      throw new Error(`Invalid content length in metadata`);
    }
  }

  private validateManifestContent(content: Buffer | Uint8Array, metadata: Omit<ManifestMetadata, 'createdAt'>): void {
    if (!content || content.length === 0) {
      throw new Error('Content cannot be empty');
    }
    
    const contentLength = content.length;
    
    if (!Number.isInteger(contentLength) || contentLength > this.config.maxObjectSize) {
      throw new Error(`Invalid content size`);
    }

    if (!this.config.allowedMimeTypes.includes(metadata.contentType)) {
      throw new Error(`Content type not allowed`);
    }

    // Verify hash matches content
    const actualHash = createHash('sha256').update(content).digest('hex');
    if (actualHash !== metadata.hash) {
      throw new Error('Content hash does not match metadata hash');
    }

    // Verify checksum
    const actualChecksum = createHash('md5').update(content).digest('hex');
    if (actualChecksum !== metadata.checksum) {
      throw new Error('Content checksum does not match metadata checksum');
    }
  }

  private generateSignature(payload: unknown, secret: string): string {
    if (!secret || typeof secret !== 'string') {
      throw new Error('Invalid secret for signature generation');
    }
    
    const payloadString = JSON.stringify(payload, Object.keys(payload as Record<string, unknown>).sort());
    return createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  private verifySignature(payload: unknown, signature: string, secret: string): boolean {
    try {
      if (!secret || !signature) {
        return false;
      }
      
      const expectedSignature = this.generateSignature(payload, secret);
      const signatureBuffer = Buffer.from(signature, 'hex');
      const expectedBuffer = Buffer.from(expectedSignature, 'hex');
      
      return signatureBuffer.length === expectedBuffer.length && 
             timingSafeEqual(signatureBuffer, expectedBuffer);
    } catch {
      return false;
    }
  }

  private generateSecureId(): string {
    const timestamp = Date.now();
    const randomBytes = Buffer.from(randomBytes(16));
    return `${timestamp}_${randomBytes.toString('hex')}`;
  }

  private sanitizeError(error: unknown): string {
    if (!error) return 'Unknown error';
    if (typeof error === 'string') return error.substring(0, 200).replace(/[<>"'&]/g, '');
    if (error instanceof Error) return error.message.substring(0, 200).replace(/[<>"'&]/g, '');
    return 'Unknown error';
  }

  private sanitizeMetadata(metadata: ManifestMetadata): ManifestMetadata {
    return {
      ...metadata,
      tenantId: this.sanitizeInput(metadata.tenantId, this.MAX_TENANT_ID_LENGTH),
      author: this.sanitizeInput(metadata.author, this.MAX_AUTHOR_LENGTH),
      signature: this.sanitizeInput(metadata.signature, 200),
      checksum: this.sanitizeInput(metadata.checksum, 64),
      hash: this.sanitizeInput(metadata.hash, 64),
      contentType: this.sanitizeInput(metadata.contentType, 100)
    };
  }

  private sanitizeAuditRecord(record: AuditRecord): AuditRecord {
    return {
      ...record,
      id: this.sanitizeInput(record.id, 100),
      objectKey: this.sanitizeInput(record.objectKey, 100),
      tenantId: this.sanitizeInput(record.tenantId, this.MAX_TENANT_ID_LENGTH),
      author: this.sanitizeInput(record.author, this.MAX_AUTHOR_LENGTH),
      requestSignature: this.sanitizeInput(record.requestSignature, 200),
      objectChecksum: this.sanitizeInput(record.objectChecksum, 64),
      ip: this.sanitizeInput(record.ip, 45),
      userAgent: this.sanitizeInput(record.userAgent, 200),
      reason: record.reason ? this.sanitizeInput(record.reason, 200) : undefined
    };
  }

  private async logAuditRecord(record: AuditRecord): Promise<void> {
    try {
      // Sanitize record before storing
      const sanitizedRecord = this.sanitizeAuditRecord(record);
      this.auditLog.push(sanitizedRecord);
      
      // Keep audit log size manageable with secure trimming
      if (this.auditLog.length > this.MAX_AUDIT_LOG_SIZE) {
        this.auditLog = this.auditLog.slice(-this.AUDIT_LOG_TRIM_SIZE);
      }
    } catch (error) {
      // Don't let audit logging failures break the main operation
      // In production, this should go to a proper logging service
    }
  }
}
