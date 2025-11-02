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

  constructor(config: ManifestStoreConfig) {
    this.config = config;
  }

  private async acquireLock(key: string): Promise<void> {
    while (this.lock.has(key)) {
      await this.lock.get(key);
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
    // Validate request
    this.validateSignedUrlRequest(request);

    // Check if object already exists (write-once semantics)
    if (this.objectMetadata.has(request.objectKey)) {
      throw new Error('Object already exists: write-once semantics prohibit overwrites');
    }

    // Generate signature
    const expires = Date.now() + (request.expires || this.config.signedUrlTtl);
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
    const url = `${this.config.baseUrl}/${request.objectKey}`;
    
    return {
      url,
      method: 'PUT',
      headers: {
        'Content-Type': request.contentType,
        'Content-Length': request.contentLength.toString(),
        'Authorization': `C2-Signature ${signature}`,
        'X-C2-Tenant': request.tenantId,
        'X-C2-Author': request.author,
        'X-C2-Expires': expires.toString()
      },
      expires: new Date(expires).toISOString(),
      maxFileSize: this.config.maxObjectSize,
      allowedContentTypes: this.config.allowedMimeTypes
    };
  }

  /**
   * Store manifest with write-once semantics
   */
  async storeManifest(
    objectKey: string,
    content: Buffer | Uint8Array,
    metadata: Omit<ManifestMetadata, 'createdAt'>
  ): Promise<ManifestMetadata> {
    await this.acquireLock(objectKey);
    try {
      // Validate hash-addressed path
      if (!objectKey.match(/^[a-f0-9]{64}\.c2pa$/)) {
        throw new Error('Invalid object key: must be SHA-256 hash with .c2pa extension');
      }

      // Check write-once semantics
      if (this.objectMetadata.has(objectKey) && this.config.writeOnceEnabled) {
        const existing = this.objectMetadata.get(objectKey)!;
        await this.logAuditRecord({
          id: this.generateId(),
          timestamp: new Date().toISOString(),
          operation: 'attempt_overwrite',
          objectKey,
          tenantId: metadata.tenantId,
          author: metadata.author,
          requestSignature: metadata.signature,
          objectChecksum: metadata.checksum,
          beforeState: existing,
          afterState: null,
          ip: 'internal',
          userAgent: 'manifest-store',
          result: 'failure',
          reason: 'Write-once semantics prohibit overwrite'
        });
        throw new Error('Object already exists: write-once semantics prohibit overwrites');
      }

      // Validate content
      this.validateManifestContent(content, metadata);

      // Create manifest metadata
      const manifestMetadata: ManifestMetadata = {
        ...metadata,
        createdAt: new Date().toISOString()
      };

      // Store the manifest
      this.objectMetadata.set(objectKey, manifestMetadata);

      // Log successful creation
      await this.logAuditRecord({
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        operation: 'create',
        objectKey,
        tenantId: metadata.tenantId,
        author: metadata.author,
        requestSignature: metadata.signature,
        objectChecksum: metadata.checksum,
        beforeState: null,
        afterState: manifestMetadata,
        ip: 'internal',
        userAgent: 'manifest-store',
        result: 'success'
      });

      return manifestMetadata;
    } catch (error) {
      // Log any unexpected errors
      if (error instanceof Error && !error.message.includes('write-once')) {
        await this.logAuditRecord({
          id: this.generateId(),
          timestamp: new Date().toISOString(),
          operation: 'create',
          objectKey,
          tenantId: metadata.tenantId,
          author: metadata.author,
          requestSignature: metadata.signature,
          objectChecksum: metadata.checksum,
          beforeState: null,
          afterState: null,
          ip: 'internal',
          userAgent: 'manifest-store',
          result: 'failure',
          reason: error.message
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
      const metadata = this.objectMetadata.get(objectKey) || null;

      // Log access
      await this.logAuditRecord({
        id: this.generateId(),
        timestamp: new Date().toISOString(),
        operation: 'access',
        objectKey,
        tenantId: metadata?.tenantId || 'unknown',
        author: 'system',
        requestSignature: '',
        objectChecksum: metadata?.checksum || '',
        beforeState: null,
        afterState: null,
        ip: 'internal',
        userAgent: 'manifest-store',
        result: metadata ? 'success' : 'failure',
        reason: metadata ? undefined : 'Object not found'
      });

      return metadata;
    } catch (error) {
      // Log audit errors but don't fail the operation
      // In production, this should go to a proper logging service
      // For now, we silently ignore audit logging failures to prevent leaks
      return this.objectMetadata.get(objectKey) || null;
    }
  }

  /**
   * Check manifest integrity
   */
  async checkIntegrity(objectKey: string, content: Buffer | Uint8Array): Promise<IntegrityCheckResult> {
    try {
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
        errors: [`Integrity check failed: ${error instanceof Error ? error.message : 'Unknown error'}`]
      };
    }
  }

  /**
   * List objects with pagination and filtering
   */
  async listObjects(options: ListObjectsOptions = {}): Promise<ListObjectsResult> {
    try {
      let objects = Array.from(this.objectMetadata.values());

      // Apply filters
      if (options.tenantId) {
        objects = objects.filter(obj => obj.tenantId === options.tenantId);
      }

      if (options.createdAfter) {
        objects = objects.filter(obj => obj.createdAt >= options.createdAfter!);
      }

      if (options.createdBefore) {
        objects = objects.filter(obj => obj.createdAt <= options.createdBefore!);
      }

      if (options.prefix) {
        objects = objects.filter(obj => obj.hash.startsWith(options.prefix!));
      }

      // Sort by creation time (newest first)
      objects.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      // Apply pagination
      const limit = Math.min(options.limit || 1000, 10000); // Cap at 10k for safety
      const startIndex = options.continuationToken ? Math.max(0, parseInt(options.continuationToken, 10) || 0) : 0;
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
        objectCountByTenant[obj.tenantId] = (objectCountByTenant[obj.tenantId] || 0) + 1;
        sizeByTenant[obj.tenantId] = (sizeByTenant[obj.tenantId] || 0) + obj.contentLength;
      });

      const sortedObjects = objects.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      const oldestObject = sortedObjects[0]?.createdAt || '';
      const newestObject = sortedObjects[sortedObjects.length - 1]?.createdAt || '';

      // Calculate recent metrics (simplified for demo)
      const now = new Date();
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      const recentAudits = this.auditLog.filter(audit => new Date(audit.timestamp) >= yesterday);

      const writeAttempts24h = recentAudits.filter(audit => audit.operation === 'create' || audit.operation === 'attempt_overwrite').length;
      const writeSuccesses24h = recentAudits.filter(audit => audit.operation === 'create' && audit.result === 'success').length;
      const readRequests24h = recentAudits.filter(audit => audit.operation === 'access').length;
      const cacheHitRate24h = readRequests24h > 0 ? (readRequests24h - recentAudits.filter(audit => audit.operation === 'access' && audit.result === 'failure').length) / readRequests24h : 0;

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
      // Return empty metrics on error
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

      // Apply filters
      if (options.tenantId) {
        records = records.filter(record => record.tenantId === options.tenantId);
      }

      if (options.operation) {
        records = records.filter(record => record.operation === options.operation);
      }

      if (options.since) {
        records = records.filter(record => record.timestamp >= options.since!);
      }

      // Sort by timestamp (newest first)
      records.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      // Apply pagination
      const limit = Math.min(options.limit || 100, 1000); // Cap at 1k for safety
      const offset = options.offset || 0;
      const paginatedRecords = records.slice(offset, offset + limit);

      return {
        records: paginatedRecords,
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
    if (!request.objectKey.match(/^[a-f0-9]{64}\.c2pa$/)) {
      throw new Error('Invalid object key: must be SHA-256 hash with .c2pa extension');
    }

    if (!this.config.allowedMimeTypes.includes(request.contentType)) {
      throw new Error(`Content type ${request.contentType} not allowed`);
    }

    if (request.contentLength > this.config.maxObjectSize) {
      throw new Error(`Content size ${request.contentLength} exceeds maximum ${this.config.maxObjectSize}`);
    }

    if (!request.tenantId || request.tenantId.length > 100) {
      throw new Error('Invalid tenant ID');
    }

    if (!request.author || request.author.length > 200) {
      throw new Error('Invalid author');
    }
  }

  private validateManifestContent(content: Buffer | Uint8Array, metadata: Omit<ManifestMetadata, 'createdAt'>): void {
    const contentLength = content.length;
    
    if (contentLength > this.config.maxObjectSize) {
      throw new Error(`Content size ${contentLength} exceeds maximum ${this.config.maxObjectSize}`);
    }

    if (!this.config.allowedMimeTypes.includes(metadata.contentType)) {
      throw new Error(`Content type ${metadata.contentType} not allowed`);
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
    const payloadString = JSON.stringify(payload, Object.keys(payload as Record<string, unknown>).sort());
    return createHmac('sha256', secret).update(payloadString).digest('hex');
  }

  private verifySignature(payload: unknown, signature: string, secret: string): boolean {
    try {
      const expectedSignature = this.generateSignature(payload, secret);
      return timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'));
    } catch {
      return false;
    }
  }

  private generateId(): string {
    return randomBytes(16).toString('hex');
  }

  private async logAuditRecord(record: AuditRecord): Promise<void> {
    try {
      this.auditLog.push(record);
      
      // Keep audit log size manageable (in production, this would go to a persistent store)
      if (this.auditLog.length > 100000) {
        this.auditLog = this.auditLog.slice(-50000);
      }
    } catch (error) {
      // Don't let audit logging failures break the main operation
      // In production, this should go to a proper logging service
      // For now, we silently ignore audit logging failures to prevent leaks
    }
  }
}
