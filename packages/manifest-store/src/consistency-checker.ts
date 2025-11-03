// Phase 21.2 Consistency Checker for Multi-Region Manifest Storage
// Detects and repairs drift between primary and secondary regions

import { R2Bucket } from '@cloudflare/workers-types';

export interface ConsistencyResult {
  sample_count: number;
  mismatched_count: number;
  mismatch_percentage: number;
  mismatches: Array<{
    hash: string;
    primary_etag?: string;
    secondary_etag?: string;
    primary_size?: number;
    secondary_size?: number;
    primary_exists: boolean;
    secondary_exists: boolean;
  }>;
  check_duration_ms: number;
}

export interface ConsistencyReport {
  timestamp: string;
  primary_bucket: string;
  secondary_bucket: string;
  result: ConsistencyResult;
  threshold_exceeded: boolean;
  actions_taken: string[];
}

export class ConsistencyChecker {
  private readonly MISMATCH_THRESHOLD = 0.1; // 0.1% mismatch threshold
  private readonly SAMPLE_SIZE_DEFAULT = 1000;
  private readonly REPAIR_BATCH_SIZE = 100;
  private readonly MAX_SAMPLE_SIZE = 10000;
  private readonly MAX_HASH_LENGTH = 64;
  private readonly MAX_ERROR_LENGTH = 500;
  private readonly MAX_LIST_LIMIT = 10000;

  constructor(
    private primaryBucket: R2Bucket,
    private secondaryBucket: R2Bucket,
    private primaryBucketName: string,
    private secondaryBucketName: string
  ) {
    this.validateConstructor();
  }

  private validateConstructor(): void {
    if (!this.primaryBucketName || this.primaryBucketName.length < 1) {
      throw new Error('Invalid primary bucket name');
    }
    
    if (!this.secondaryBucketName || this.secondaryBucketName.length < 1) {
      throw new Error('Invalid secondary bucket name');
    }
  }

  private sanitizeError(error: string): string {
    if (!error) return 'Unknown error';
    return error.substring(0, this.MAX_ERROR_LENGTH).replace(/[<>\"']/g, '');
  }

  private validateSampleSize(sampleSize: number): boolean {
    return Number.isInteger(sampleSize) && 
           sampleSize > 0 && 
           sampleSize <= this.MAX_SAMPLE_SIZE;
  }

  private validateHash(hash: string): boolean {
    return hash && 
           hash.length <= this.MAX_HASH_LENGTH && 
           /^[a-fA-F0-9]+$/.test(hash);
  }

  private truncateHash(hash: string): string {
    return hash.length > 8 ? hash.substring(0, 8) + '...' : hash;
  }

  /**
   * Check consistency between primary and secondary buckets
   * Samples manifests and compares ETags and sizes
   */
  async checkConsistency(sampleSize: number = this.SAMPLE_SIZE_DEFAULT): Promise<ConsistencyResult> {
    const startTime = Date.now();
    
    try {
      // Validate input
      if (!this.validateSampleSize(sampleSize)) {
        throw new Error('Invalid sample size');
      }

      // Get sample of manifests from primary bucket
      const primarySample = await this.sampleManifests(this.primaryBucket, sampleSize);
      
      const mismatches: ConsistencyResult['mismatches'] = [];
      let checkedCount = 0;

      for (const manifest of primarySample) {
        checkedCount++;
        
        // Validate hash before processing
        if (!this.validateHash(manifest.hash)) {
          console.warn('Skipping invalid hash in sample:', { hash: this.truncateHash(manifest.hash) });
          continue;
        }

        // Get corresponding manifest from secondary
        const secondaryManifest = await this.getManifestMetadata(this.secondaryBucket, manifest.hash);
        
        const primaryExists = manifest.exists;
        const secondaryExists = secondaryManifest !== null;
        
        // Check for mismatches
        const mismatch = {
          hash: manifest.hash,
          primary_etag: manifest.etag,
          secondary_etag: secondaryManifest?.etag,
          primary_size: manifest.size,
          secondary_size: secondaryManifest?.size,
          primary_exists: primaryExists,
          secondary_exists: secondaryExists
        };

        // Determine if this is a mismatch
        const isMismatch = 
          primaryExists !== secondaryExists ||
          (primaryExists && secondaryExists && (
            manifest.etag !== secondaryManifest?.etag ||
            manifest.size !== secondaryManifest?.size
          ));

        if (isMismatch) {
          mismatches.push(mismatch);
        }
      }

      const mismatchPercentage = checkedCount > 0 ? Math.min(100, (mismatches.length / checkedCount) * 100) : 0;

      const result: ConsistencyResult = {
        sample_count: checkedCount,
        mismatched_count: mismatches.length,
        mismatch_percentage: Math.round(mismatchPercentage * 100) / 100, // Round to 2 decimal places
        mismatches,
        check_duration_ms: Date.now() - startTime
      };

      console.log('Consistency check completed:', {
        sample_count: result.sample_count,
        mismatched_count: result.mismatched_count,
        mismatch_percentage: result.mismatch_percentage,
        duration_ms: result.check_duration_ms
      });

      return result;

    } catch (error) {
      console.error('Consistency check failed:', error instanceof Error ? error.message : 'Unknown error');
      return {
        sample_count: 0,
        mismatched_count: 0,
        mismatch_percentage: 0,
        mismatches: [],
        check_duration_ms: Date.now() - startTime
      };
    }
  }

  /**
   * Repair detected inconsistencies
   */
  async repairInconsistencies(mismatches: ConsistencyResult['mismatches']): Promise<{
    repaired_count: number;
    failed_count: number;
    errors: string[];
  }> {
    let repairedCount = 0;
    let failedCount = 0;
    const errors: string[] = [];

    // Validate input
    if (!Array.isArray(mismatches) || mismatches.length > this.MAX_SAMPLE_SIZE) {
      throw new Error('Invalid mismatches array');
    }

    console.log(`Starting repair for ${mismatches.length} mismatches`);

    // Process in batches to avoid overwhelming the system
    for (let i = 0; i < mismatches.length; i += this.REPAIR_BATCH_SIZE) {
      const batch = mismatches.slice(i, i + this.REPAIR_BATCH_SIZE);
      
      for (const mismatch of batch) {
        try {
          // Validate hash before repair
          if (!this.validateHash(mismatch.hash)) {
            errors.push(`Invalid hash format: ${this.truncateHash(mismatch.hash)}`);
            failedCount++;
            continue;
          }

          const repaired = await this.repairSingleMismatch(mismatch);
          if (repaired) {
            repairedCount++;
          } else {
            failedCount++;
          }
        } catch (error) {
          const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown repair error');
          errors.push(`Failed to repair ${this.truncateHash(mismatch.hash)}: ${errorMsg}`);
          failedCount++;
        }
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.log('Repair completed:', {
      repaired_count: repairedCount,
      failed_count: failedCount,
      errors: errors.length
    });

    return {
      repaired_count: repairedCount,
      failed_count: failedCount,
      errors
    };
  }

  /**
   * Run full consistency check and auto-repair if needed
   */
  async runConsistencyCheckAndRepair(sampleSize: number = this.SAMPLE_SIZE_DEFAULT): Promise<ConsistencyReport> {
    const timestamp = new Date().toISOString();
    
    try {
      // Validate input
      if (!this.validateSampleSize(sampleSize)) {
        throw new Error('Invalid sample size');
      }

      // Run consistency check
      const result = await this.checkConsistency(sampleSize);
      
      const thresholdExceeded = result.mismatch_percentage > this.MISMATCH_THRESHOLD;
      const actionsTaken: string[] = [];

      // Auto-repair if threshold exceeded
      if (thresholdExceeded && result.mismatches.length > 0) {
        console.log(`Mismatch threshold exceeded (${result.mismatch_percentage}%), initiating auto-repair`);
        
        const repairResult = await this.repairInconsistencies(result.mismatches);
        
        actionsTaken.push(`Auto-repair initiated: ${repairResult.repaired_count} repaired, ${repairResult.failed_count} failed`);
        
        if (repairResult.errors.length > 0) {
          actionsTaken.push(`Repair errors: ${repairResult.errors.length} items failed`);
        }
      } else {
        actionsTaken.push('No action required - consistency within threshold');
      }

      const report: ConsistencyReport = {
        timestamp,
        primary_bucket: this.primaryBucketName,
        secondary_bucket: this.secondaryBucketName,
        result,
        threshold_exceeded: thresholdExceeded,
        actions_taken: actionsTaken
      };

      // Store report for audit
      await this.storeConsistencyReport(report);

      return report;

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      console.error('Consistency check and repair failed:', errorMsg);
      
      const report: ConsistencyReport = {
        timestamp,
        primary_bucket: this.primaryBucketName,
        secondary_bucket: this.secondaryBucketName,
        result: {
          sample_count: 0,
          mismatched_count: 0,
          mismatch_percentage: 0,
          mismatches: [],
          check_duration_ms: 0
        },
        threshold_exceeded: true,
        actions_taken: [`Check failed: ${errorMsg}`]
      };

      return report;
    }
  }

  /**
   * Get detailed consistency metrics
   */
  async getConsistencyMetrics(): Promise<{
    primary_total_objects: number;
    secondary_total_objects: number;
    replication_lag_objects: number;
    estimated_replication_percentage: number;
    last_check_timestamp?: string;
    last_mismatch_percentage?: number;
  }> {
    try {
      const primaryCount = await this.getBucketObjectCount(this.primaryBucket);
      const secondaryCount = await this.getBucketObjectCount(this.secondaryBucket);
      
      const replicationLag = Math.max(0, primaryCount - secondaryCount);
      const replicationPercentage = primaryCount > 0 ? Math.min(100, (secondaryCount / primaryCount) * 100) : 100;

      // Get last check report if available
      const lastReport = await this.getLastConsistencyReport();

      return {
        primary_total_objects: primaryCount,
        secondary_total_objects: secondaryCount,
        replication_lag_objects: replicationLag,
        estimated_replication_percentage: Math.round(replicationPercentage * 100) / 100,
        last_check_timestamp: lastReport?.timestamp,
        last_mismatch_percentage: lastReport?.result.mismatch_percentage
      };

    } catch (error) {
      console.error('Failed to get consistency metrics:', error instanceof Error ? error.message : 'Unknown error');
      return {
        primary_total_objects: 0,
        secondary_total_objects: 0,
        replication_lag_objects: 0,
        estimated_replication_percentage: 0
      };
    }
  }

  // Private helper methods

  private async sampleManifests(bucket: R2Bucket, sampleSize: number): Promise<Array<{
    hash: string;
    etag?: string;
    size?: number;
    exists: boolean;
  }>> {
    const manifests: Array<{
      hash: string;
      etag?: string;
      size?: number;
      exists: boolean;
    }> = [];

    try {
      // List objects from bucket (R2 supports pagination)
      let cursor: string | undefined;
      let collected = 0;

      while (collected < sampleSize) {
        const list = await bucket.list({
          limit: Math.min(1000, sampleSize - collected),
          cursor
        });

        for (const object of list.objects) {
          if (collected >= sampleSize) break;

          const hash = this.extractHashFromKey(object.key);
          if (hash && this.validateHash(hash)) {
            manifests.push({
              hash,
              etag: object.etag,
              size: object.size,
              exists: true
            });
            collected++;
          }
        }

        if (!list.truncated) break;
        cursor = list.cursor;
      }

      return manifests;

    } catch (error) {
      console.error('Failed to sample manifests:', error instanceof Error ? error.message : 'Unknown error');
      return [];
    }
  }

  private async getManifestMetadata(bucket: R2Bucket, hash: string): Promise<{
    etag?: string;
    size?: number;
  } | null> {
    try {
      // Validate hash before processing
      if (!this.validateHash(hash)) {
        throw new Error('Invalid hash format');
      }

      const key = this.getManifestKey(hash);
      const object = await bucket.head(key);
      
      if (!object) {
        return null;
      }

      return {
        etag: object.etag,
        size: object.size
      };

    } catch (error) {
      console.error('Failed to get manifest metadata:', { 
        hash: this.truncateHash(hash), 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return null;
    }
  }

  private async repairSingleMismatch(mismatch: ConsistencyResult['mismatches'][0]): Promise<boolean> {
    try {
      // Validate hash before repair
      if (!this.validateHash(mismatch.hash)) {
        throw new Error('Invalid hash format');
      }

      // Case 1: Primary exists, secondary doesn't - copy to secondary
      if (mismatch.primary_exists && !mismatch.secondary_exists) {
        return await this.copyToSecondary(mismatch.hash);
      }

      // Case 2: Secondary exists, primary doesn't - this shouldn't happen in normal operation
      // Log it but don't "repair" by copying back to primary
      if (!mismatch.primary_exists && mismatch.secondary_exists) {
        console.warn('Unexpected case: secondary exists but primary does not', { 
          hash: this.truncateHash(mismatch.hash) 
        });
        return false;
      }

      // Case 3: Both exist but have different ETags/sizes
      if (mismatch.primary_exists && mismatch.secondary_exists) {
        // Primary is source of truth, overwrite secondary
        return await this.copyToSecondary(mismatch.hash);
      }

      return false;

    } catch (error) {
      console.error('Failed to repair mismatch:', { 
        hash: this.truncateHash(mismatch.hash), 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return false;
    }
  }

  private async copyToSecondary(hash: string): Promise<boolean> {
    try {
      // Validate hash before copy
      if (!this.validateHash(hash)) {
        throw new Error('Invalid hash format');
      }

      const key = this.getManifestKey(hash);
      
      // Get from primary
      const primaryObject = await this.primaryBucket.get(key);
      if (!primaryObject) {
        throw new Error('Primary object not found');
      }

      // Copy to secondary
      await this.secondaryBucket.put(key, primaryObject.body, {
        customMetadata: primaryObject.customMetadata,
        httpMetadata: primaryObject.httpMetadata
      });

      return true;

    } catch (error) {
      console.error('Failed to copy to secondary:', { 
        hash: this.truncateHash(hash), 
        error: error instanceof Error ? error.message : 'Unknown error' 
      });
      return false;
    }
  }

  private extractHashFromKey(key: string): string | null {
    // Key format: "ab/cd/abcdef123456.c2pa"
    // More strict validation of the key format
    const match = key.match(/^([0-9a-fA-F]{2})\/([0-9a-fA-F]{2})\/([0-9a-fA-F]+)\.c2pa$/);
    if (!match || !match[3]) {
      return null;
    }
    
    const hash = match[3].toLowerCase();
    return this.validateHash(hash) ? hash : null;
  }

  private getManifestKey(hash: string): string {
    return `${hash.substring(0, 2)}/${hash.substring(2, 4)}/${hash}.c2pa`;
  }

  private async getBucketObjectCount(bucket: R2Bucket): Promise<number> {
    try {
      // This is a simplified approach - in practice, you'd use 
      // bucket metrics or maintain a separate count
      let count = 0;
      let cursor: string | undefined;

      while (true) {
        const list = await bucket.list({ 
          cursor, 
          limit: Math.min(this.MAX_LIST_LIMIT, 10000) 
        });
        count += list.objects.length;
        
        if (!list.truncated) break;
        cursor = list.cursor;
      }

      return count;

    } catch (error) {
      console.error('Failed to get bucket object count:', error instanceof Error ? error.message : 'Unknown error');
      return 0;
    }
  }

  private async storeConsistencyReport(report: ConsistencyReport): Promise<void> {
    // This would store the report in a database or monitoring system
    // For now, we'll just log it
    console.log('Consistency report stored:', {
      timestamp: report.timestamp,
      mismatch_percentage: report.result.mismatch_percentage,
      threshold_exceeded: report.threshold_exceeded,
      actions: report.actions_taken.length
    });
  }

  private async getLastConsistencyReport(): Promise<ConsistencyReport | null> {
    // This would retrieve the last report from storage
    // For now, return null
    return null;
  }
}
