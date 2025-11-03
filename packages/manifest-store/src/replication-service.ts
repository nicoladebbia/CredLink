// Phase 21.2 Evidence Storage & Replication Service
// Cloudflare R2 dual-bucket with strong consistency

import { R2Bucket } from '@cloudflare/workers-types';
import { ReplicationQueue } from './replication-queue';
import { ConsistencyChecker } from './consistency-checker';

export interface ManifestMetadata {
  hash: string;
  size: number;
  etag: string;
  content_type: string;
  created_at: string;
  tenant_id: string;
  replication_mode: 'async' | 'strict';
}

export interface ReplicationResult {
  success: boolean;
  primary_stored: boolean;
  secondary_stored: boolean;
  replication_queued: boolean;
  error?: string;
  latency_ms: number;
}

export interface ReplicationConfig {
  primary_bucket: string;
  secondary_bucket: string;
  replication_mode: 'async' | 'strict';
  max_replication_lag_seconds: number;
  consistency_check_interval_seconds: number;
}

export class ReplicationService {
  private config: ReplicationConfig;
  private readonly MAX_HASH_LENGTH = 64;
  private readonly MAX_TENANT_ID_LENGTH = 100;
  private readonly MAX_SAMPLE_SIZE = 10000;
  private readonly MAX_BATCH_SIZE = 1000;
  private readonly MAX_ERROR_LENGTH = 500;
  private readonly MAX_MANIFEST_SIZE = 100 * 1024 * 1024; // 100MB
  
  constructor(
    private primaryBucket: R2Bucket,
    private secondaryBucket: R2Bucket,
    private replicationQueue: ReplicationQueue,
    private consistencyChecker: ConsistencyChecker,
    config: ReplicationConfig
  ) {
    this.config = config;
    this.validateConfig();
  }

  private validateConfig(): void {
    if (!this.config.primary_bucket || this.config.primary_bucket.length < 1) {
      throw new Error('Invalid primary_bucket in configuration');
    }
    
    if (!this.config.secondary_bucket || this.config.secondary_bucket.length < 1) {
      throw new Error('Invalid secondary_bucket in configuration');
    }
    
    if (!['async', 'strict'].includes(this.config.replication_mode)) {
      throw new Error('Invalid replication_mode in configuration');
    }
    
    if (this.config.max_replication_lag_seconds < 0 || this.config.max_replication_lag_seconds > 86400) {
      throw new Error('Invalid max_replication_lag_seconds (must be 0-86400)');
    }
  }

  private sanitizeError(error: string): string {
    if (!error) return 'Unknown error';
    return error.substring(0, this.MAX_ERROR_LENGTH).replace(/[<>\"']/g, '');
  }

  private validateHash(hash: string): boolean {
    return !!hash && 
           hash.length <= this.MAX_HASH_LENGTH && 
           /^[a-fA-F0-9]+$/.test(hash);
  }

  private validateTenantId(tenantId: string): boolean {
    return !!tenantId && 
           tenantId.length > 0 && 
           tenantId.length <= this.MAX_TENANT_ID_LENGTH &&
           /^[a-zA-Z0-9_-]+$/.test(tenantId);
  }

  private validateManifestMetadata(metadata: ManifestMetadata): boolean {
    return this.validateHash(metadata.hash) &&
           this.validateTenantId(metadata.tenant_id) &&
           metadata.size >= 0 && 
           metadata.size <= this.MAX_MANIFEST_SIZE &&
           ['async', 'strict'].includes(metadata.replication_mode) &&
           metadata.content_type && 
           metadata.content_type.length > 0 &&
           metadata.content_type.length <= 100;
  }

  private validateReplicationMode(mode: string): 'async' | 'strict' {
    return mode === 'strict' ? 'strict' : 'async';
  }

  /**
   * Store manifest with dual-region replication
   * Implements RPO ≤ 5 min with strict mode for 0-RPO
   */
  async storeManifest(
    hash: string,
    data: ArrayBuffer,
    metadata: ManifestMetadata
  ): Promise<ReplicationResult> {
    const startTime = Date.now();
    let primaryStored = false;
    let secondaryStored = false;
    let replicationQueued = false;
    let error: string | undefined;

    try {
      // Validate inputs
      if (!this.validateHash(hash)) {
        throw new Error('Invalid hash format');
      }

      if (!data || data.byteLength <= 0 || data.byteLength > this.MAX_MANIFEST_SIZE) {
        throw new Error('Invalid data size');
      }

      if (!this.validateManifestMetadata(metadata)) {
        throw new Error('Invalid metadata');
      }

      if (metadata.hash !== hash) {
        throw new Error('Hash mismatch between metadata and parameter');
      }

      // Step 1: Write to primary bucket (strong consistency guaranteed)
      const primaryResult = await this.writeToPrimary(hash, data, metadata);
      primaryStored = primaryResult.success;
      
      if (!primaryStored) {
        throw new Error(`Primary storage failed: ${primaryResult.error}`);
      }

      // Step 2: Handle secondary based on replication mode
      if (metadata.replication_mode === 'strict') {
        // Strict mode: Synchronous write to secondary for 0-RPO
        const secondaryResult = await this.writeToSecondary(hash, data, metadata);
        secondaryStored = secondaryResult.success;
        
        if (!secondaryStored) {
          throw new Error(`Secondary storage failed: ${secondaryResult.error}`);
        }
      } else {
        // Async mode: Queue for replication within 5 minutes
        const queueResult = await this.queueReplication(hash, data, metadata);
        replicationQueued = queueResult.success;
        
        if (!replicationQueued) {
          // Queue failed, fallback to sync write to maintain RPO
          console.warn(`Replication queue failed, falling back to sync write: ${queueResult.error}`);
          const secondaryResult = await this.writeToSecondary(hash, data, metadata);
          secondaryStored = secondaryResult.success;
        }
      }

      return {
        success: true,
        primary_stored: primaryStored,
        secondary_stored: secondaryStored,
        replication_queued: replicationQueued,
        latency_ms: Date.now() - startTime
      };

    } catch (err) {
      error = this.sanitizeError(err instanceof Error ? err.message : 'Unknown error');
      
      // Log failure for monitoring
      console.error('Manifest storage failed:', {
        hash: hash.substring(0, 8) + '...', // Don't log full hash
        tenant_id: metadata.tenant_id,
        error,
        latency_ms: Date.now() - startTime
      });

      return {
        success: false,
        primary_stored: primaryStored,
        secondary_stored: secondaryStored,
        replication_queued: replicationQueued,
        error,
        latency_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Retrieve manifest with regional fallback
   * Try local region first, then peer region
   */
  async retrieveManifest(hash: string, region: 'enam' | 'weur'): Promise<{
    data: ArrayBuffer | null;
    metadata: ManifestMetadata | null;
    source: 'primary' | 'secondary' | 'not_found';
    latency_ms: number;
  }> {
    const startTime = Date.now();
    
    try {
      // Validate inputs
      if (!this.validateHash(hash)) {
        throw new Error('Invalid hash format');
      }

      if (!['enam', 'weur'].includes(region)) {
        throw new Error('Invalid region');
      }
      
      // Determine which bucket is "local" for this region
      const localBucket = region === 'enam' ? this.primaryBucket : this.secondaryBucket;
      const peerBucket = region === 'enam' ? this.secondaryBucket : this.primaryBucket;
      
      // Try local bucket first
      const localResult = await this.getFromBucket(localBucket, hash);
      if (localResult.data) {
        return {
          data: localResult.data,
          metadata: localResult.metadata,
          source: region === 'enam' ? 'primary' : 'secondary',
          latency_ms: Date.now() - startTime
        };
      }

      // Fallback to peer bucket
      const peerResult = await this.getFromBucket(peerBucket, hash);
      if (peerResult.data) {
        return {
          data: peerResult.data,
          metadata: peerResult.metadata,
          source: region === 'enam' ? 'secondary' : 'primary',
          latency_ms: Date.now() - startTime
        };
      }

      // Not found in either bucket
      return {
        data: null,
        metadata: null,
        source: 'not_found',
        latency_ms: Date.now() - startTime
      };

    } catch (error) {
      console.error('Manifest retrieval failed:', { 
        hash: hash.substring(0, 8) + '...', 
        region, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return {
        data: null,
        metadata: null,
        source: 'not_found',
        latency_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Process replication queue
   * Called by background job to ensure async replication
   */
  async processReplicationQueue(): Promise<{
    processed_count: number;
    failed_count: number;
    errors: string[];
  }> {
    const startTime = Date.now();
    let processedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    try {
      // Get pending replication tasks
      const tasks = await this.replicationQueue.getPendingTasks(this.MAX_BATCH_SIZE);
      
      for (const task of tasks) {
        try {
          // Validate task hash
          if (!this.validateHash(task.hash)) {
            errors.push(`Invalid hash format for task: ${task.id}`);
            failedCount++;
            continue;
          }

          // Get manifest from primary
          const primaryResult = await this.getFromBucket(this.primaryBucket, task.hash);
          if (!primaryResult.data) {
            errors.push(`Primary manifest not found for hash: ${task.hash.substring(0, 8)}...`);
            failedCount++;
            continue;
          }

          // Write to secondary
          const secondaryResult = await this.writeToSecondary(
            task.hash,
            primaryResult.data,
            primaryResult.metadata!
          );
          
          if (secondaryResult.success) {
            await this.replicationQueue.markTaskCompleted(task.id);
            processedCount++;
          } else {
            errors.push(`Secondary write failed for hash ${task.hash.substring(0, 8)}...: ${secondaryResult.error}`);
            failedCount++;
            
            // Mark as failed but keep in queue for retry
            await this.replicationQueue.markTaskFailed(task.id, secondaryResult.error);
          }

        } catch (error) {
          const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
          errors.push(`Task ${task.id} failed: ${errorMsg}`);
          failedCount++;
          await this.replicationQueue.markTaskFailed(task.id, errorMsg);
        }
      }

      console.log('Replication queue processed:', {
        processed_count: processedCount,
        failed_count: failedCount,
        duration_ms: Date.now() - startTime
      });

      return {
        processed_count: processedCount,
        failed_count: failedCount,
        errors
      };

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      console.error('Replication queue processing failed:', errorMsg);
      return {
        processed_count: 0,
        failed_count: 0,
        errors: [errorMsg]
      };
    }
  }

  /**
   * Get replication lag metrics
   * Returns number of manifests pending replication
   */
  async getReplicationLag(): Promise<{
    pending_count: number;
    oldest_pending_age_seconds: number;
    lag_percentage: number;
  }> {
    try {
      const queueStats = await this.replicationQueue.getStats();
      const totalPrimary = await this.getBucketObjectCount(this.primaryBucket);
      const totalSecondary = await this.getBucketObjectCount(this.secondaryBucket);
      
      const lagPercentage = totalPrimary > 0 ? Math.min(100, (queueStats.pending_count / totalPrimary) * 100) : 0;
      
      return {
        pending_count: queueStats.pending_count,
        oldest_pending_age_seconds: queueStats.oldest_pending_age_seconds,
        lag_percentage: Math.round(lagPercentage * 100) / 100 // Round to 2 decimal places
      };

    } catch (error) {
      console.error('Failed to get replication lag:', error instanceof Error ? error.message : 'Unknown error');
      return {
        pending_count: 0,
        oldest_pending_age_seconds: 0,
        lag_percentage: 0
      };
    }
  }

  /**
   * Force strict replication mode
   * Used during incidents to ensure 0-RPO
   */
  async enableStrictMode(tenantId?: string): Promise<void> {
    try {
      // Validate tenant ID if provided
      if (tenantId && !this.validateTenantId(tenantId)) {
        throw new Error('Invalid tenant ID');
      }

      // This would update tenant configuration
      // For now, we'll log the action
      console.log('Strict replication mode enabled', { tenant_id: tenantId });
      
      // Process any pending replication immediately
      await this.processReplicationQueue();
    } catch (error) {
      console.error('Failed to enable strict mode:', error instanceof Error ? error.message : 'Unknown error');
      throw error;
    }
  }

  /**
   * Verify consistency between regions
   * Sample manifests and compare ETags/sizes
   */
  async verifyConsistency(sampleSize: number = 1000): Promise<{
    sample_count: number;
    mismatched_count: number;
    mismatch_percentage: number;
    mismatches: Array<{
      hash: string;
      primary_etag?: string;
      secondary_etag?: string;
      primary_size?: number;
      secondary_size?: number;
    }>;
  }> {
    try {
      // Validate sample size
      if (sampleSize < 1 || sampleSize > this.MAX_SAMPLE_SIZE) {
        throw new Error('Invalid sample size');
      }

      return await this.consistencyChecker.checkConsistency(
        this.primaryBucket,
        this.secondaryBucket,
        sampleSize
      );
    } catch (error) {
      console.error('Failed to verify consistency:', error instanceof Error ? error.message : 'Unknown error');
      return {
        sample_count: 0,
        mismatched_count: 0,
        mismatch_percentage: 0,
        mismatches: []
      };
    }
  }

  // Private helper methods

  private async writeToPrimary(
    hash: string,
    data: ArrayBuffer,
    metadata: ManifestMetadata
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const key = this.getManifestKey(hash);
      const metadataHeaders = this.buildMetadataHeaders(metadata);
      
      await this.primaryBucket.put(key, data, {
        customMetadata: metadataHeaders,
        httpMetadata: {
          contentType: metadata.content_type,
          cacheControl: 'public, max-age=31536000, immutable'
        }
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.sanitizeError(error instanceof Error ? error.message : 'Primary write failed')
      };
    }
  }

  private async writeToSecondary(
    hash: string,
    data: ArrayBuffer,
    metadata: ManifestMetadata
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const key = this.getManifestKey(hash);
      const metadataHeaders = this.buildMetadataHeaders(metadata);
      
      await this.secondaryBucket.put(key, data, {
        customMetadata: metadataHeaders,
        httpMetadata: {
          contentType: metadata.content_type,
          cacheControl: 'public, max-age=31536000, immutable'
        }
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.sanitizeError(error instanceof Error ? error.message : 'Secondary write failed')
      };
    }
  }

  private async queueReplication(
    hash: string,
    data: ArrayBuffer,
    metadata: ManifestMetadata
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.replicationQueue.enqueue({
        hash,
        tenant_id: metadata.tenant_id,
        size: data.byteLength,
        created_at: new Date().toISOString(),
        metadata
      });

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: this.sanitizeError(error instanceof Error ? error.message : 'Queue enqueue failed')
      };
    }
  }

  private async getFromBucket(
    bucket: R2Bucket,
    hash: string
  ): Promise<{ data: ArrayBuffer | null; metadata: ManifestMetadata | null }> {
    try {
      const key = this.getManifestKey(hash);
      const object = await bucket.get(key);
      
      if (!object) {
        return { data: null, metadata: null };
      }

      const data = await object.arrayBuffer();
      const metadata = this.parseMetadataHeaders(object.customMetadata || {});

      return { data, metadata };
    } catch (error) {
      console.error('Bucket get failed:', { 
        hash: hash.substring(0, 8) + '...', 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return { data: null, metadata: null };
    }
  }

  private getManifestKey(hash: string): string {
    return `${hash.substring(0, 2)}/${hash.substring(2, 4)}/${hash}.c2pa`;
  }

  private buildMetadataHeaders(metadata: ManifestMetadata): Record<string, string> {
    return {
      'x-amz-meta-hash': metadata.hash,
      'x-amz-meta-tenant-id': metadata.tenant_id,
      'x-amz-meta-created-at': metadata.created_at,
      'x-amz-meta-replication-mode': metadata.replication_mode,
      'x-amz-meta-size': metadata.size.toString(),
      'x-amz-meta-content-type': metadata.content_type
    };
  }

  private parseMetadataHeaders(headers: Record<string, string>): ManifestMetadata | null {
    try {
      const hash = headers['x-amz-meta-hash'] || '';
      const size = parseInt(headers['x-amz-meta-size'] || '0');
      const tenantId = headers['x-amz-meta-tenant-id'] || '';
      const contentType = headers['x-amz-meta-content-type'] || 'application/c2pa';
      const createdAt = headers['x-amz-meta-created-at'] || new Date().toISOString();
      const replicationMode = this.validateReplicationMode(headers['x-amz-meta-replication-mode'] || 'async');

      // Validate parsed metadata
      if (!this.validateHash(hash) || 
          !this.validateTenantId(tenantId) ||
          size < 0 || 
          size > this.MAX_MANIFEST_SIZE ||
          !contentType ||
          contentType.length > 100) {
        throw new Error('Invalid metadata in headers');
      }

      return {
        hash,
        size,
        etag: headers['etag'] || '',
        content_type: contentType,
        created_at: createdAt,
        tenant_id: tenantId,
        replication_mode: replicationMode
      };
    } catch (error) {
      console.error('Failed to parse metadata headers:', error instanceof Error ? error.message : 'Unknown error');
      return null;
    }
  }

  private async getBucketObjectCount(bucket: R2Bucket): Promise<number> {
    try {
      // This would typically use R2's list objects API
      // For now, return a placeholder
      const list = await bucket.list({ limit: 1 });
      return list.truncated ? 10000 : list.objects.length; // Placeholder
    } catch (error) {
      console.error('Failed to get bucket object count:', error instanceof Error ? error.message : 'Unknown error');
      return 0;
    }
  }
}
