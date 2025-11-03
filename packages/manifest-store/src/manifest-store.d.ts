import { ManifestStoreConfig, ManifestMetadata, AuditRecord, SignedUrlRequest, SignedUrlResponse, IntegrityCheckResult, ListObjectsOptions, ListObjectsResult, StoreMetrics } from './types.js';
export declare class ManifestStore {
    private config;
    private auditLog;
    private objectMetadata;
    private readonly lock;
    private readonly MAX_TENANT_ID_LENGTH;
    private readonly MAX_AUTHOR_LENGTH;
    private readonly MAX_AUDIT_LOG_SIZE;
    private readonly AUDIT_LOG_TRIM_SIZE;
    private readonly MAX_LIST_LIMIT;
    private readonly DEFAULT_LIST_LIMIT;
    private readonly MAX_AUDIT_LIMIT;
    private readonly DEFAULT_AUDIT_LIMIT;
    private readonly VALID_OBJECT_KEY_PATTERN;
    private readonly MAX_RETRY_ATTEMPTS;
    private readonly LOCK_TIMEOUT_MS;
    private readonly rateLimitMap;
    private readonly RATE_LIMIT_WINDOW;
    private readonly RATE_LIMIT_MAX_REQUESTS;
    constructor(config: ManifestStoreConfig);
    private validateConfig;
    private sanitizeInput;
    private validateTenantId;
    private validateAuthor;
    private checkRateLimit;
    private acquireLock;
    private releaseLock;
    /**
     * Generate a signed URL for secure manifest uploads
     */
    generateSignedUrl(request: SignedUrlRequest): Promise<SignedUrlResponse>;
    /**
     * Store manifest with write-once semantics
     */
    storeManifest(objectKey: string, content: Buffer | Uint8Array, metadata: Omit<ManifestMetadata, 'createdAt'>): Promise<ManifestMetadata>;
    /**
     * Retrieve manifest metadata
     */
    getManifest(objectKey: string): Promise<ManifestMetadata | null>;
    /**
     * Check manifest integrity
     */
    checkIntegrity(objectKey: string, content: Buffer | Uint8Array): Promise<IntegrityCheckResult>;
    /**
     * List objects with pagination and filtering
     */
    listObjects(options?: ListObjectsOptions): Promise<ListObjectsResult>;
    /**
     * Get store metrics
     */
    getMetrics(): Promise<StoreMetrics>;
    /**
     * Get audit records
     */
    getAuditRecords(options?: {
        limit?: number;
        offset?: number;
        tenantId?: string;
        operation?: string;
        since?: string;
    }): Promise<{
        records: AuditRecord[];
        total: number;
    }>;
    private validateSignedUrlRequest;
    private validateMetadata;
    private validateManifestContent;
    private generateSignature;
    private verifySignature;
    private generateSecureId;
    private sanitizeError;
    private sanitizeMetadata;
    private sanitizeAuditRecord;
    private logAuditRecord;
}
//# sourceMappingURL=manifest-store.d.ts.map