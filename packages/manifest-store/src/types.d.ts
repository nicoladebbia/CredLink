export interface ManifestStoreConfig {
    baseUrl: string;
    bucket: string;
    region: string;
    writeOnceEnabled: boolean;
    signedUrlTtl: number;
    negativeCacheTtl: number;
    maxObjectSize: number;
    allowedMimeTypes: string[];
}
export interface ManifestMetadata {
    hash: string;
    contentType: string;
    contentLength: number;
    etag: string;
    lastModified: string;
    tenantId: string;
    author: string;
    signature: string;
    checksum: string;
    createdAt: string;
}
export interface AuditRecord {
    id: string;
    timestamp: string;
    operation: 'create' | 'attempt_overwrite' | 'delete' | 'access';
    objectKey: string;
    tenantId: string;
    author: string;
    requestSignature: string;
    objectChecksum: string;
    beforeState: ManifestMetadata | null;
    afterState: ManifestMetadata | null;
    ip: string;
    userAgent: string;
    result: 'success' | 'failure';
    reason?: string;
}
export interface SignedUrlRequest {
    objectKey: string;
    contentType: string;
    contentLength: number;
    tenantId: string;
    author: string;
    signature: string;
    expires?: number;
}
export interface SignedUrlResponse {
    url: string;
    method: 'PUT' | 'POST';
    headers: Record<string, string>;
    expires: string;
    maxFileSize: number;
    allowedContentTypes: string[];
}
export interface IntegrityCheckRequest {
    objectKey: string;
    content: Buffer | Uint8Array;
}
export interface IntegrityCheckResult {
    valid: boolean;
    expectedHash: string;
    actualHash: string;
    sizeMatch: boolean;
    contentTypeValid: boolean;
    errors: string[];
}
export interface ListObjectsOptions {
    prefix?: string;
    limit?: number;
    continuationToken?: string;
    tenantId?: string;
    createdAfter?: string;
    createdBefore?: string;
}
export interface ListObjectsResult {
    objects: ManifestMetadata[];
    continuationToken?: string;
    isTruncated: boolean;
    totalCount: number;
}
export interface StoreMetrics {
    totalObjects: number;
    totalSize: number;
    objectCountByTenant: Record<string, number>;
    sizeByTenant: Record<string, number>;
    averageObjectSize: number;
    oldestObject: string;
    newestObject: string;
    writeAttempts24h: number;
    writeSuccesses24h: number;
    readRequests24h: number;
    cacheHitRate24h: number;
}
//# sourceMappingURL=types.d.ts.map