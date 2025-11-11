import { ProofStorage, ProofRecord } from '../services/proof-storage';
import { CloudProofStorage } from '../services/cloud-proof-storage';
import { logger } from '../utils/logger';

/**
 * Migration result
 */
export interface MigrationResult {
  total: number;
  migrated: number;
  failed: number;
  skipped: number;
  duration: number;
  errors: Array<{ proofId: string; error: string }>;
}

/**
 * Migration options
 */
export interface MigrationOptions {
  batchSize?: number;
  dryRun?: boolean;
  skipExisting?: boolean;
  deleteAfterMigration?: boolean;
}

/**
 * Storage Migrator
 * 
 * Migrates proofs from old in-memory/filesystem storage to cloud storage
 */
export class StorageMigrator {
  constructor(
    private oldStorage: ProofStorage,
    private newStorage: CloudProofStorage
  ) {
    logger.info('Storage Migrator initialized');
  }

  /**
   * Migrate all proofs from old to new storage
   */
  async migrateAll(options: MigrationOptions = {}): Promise<MigrationResult> {
    const startTime = Date.now();
    const {
      batchSize = 100,
      dryRun = false,
      skipExisting = true,
      deleteAfterMigration = false
    } = options;

    logger.info('Starting migration', {
      batchSize,
      dryRun,
      skipExisting,
      deleteAfterMigration
    });

    const result: MigrationResult = {
      total: 0,
      migrated: 0,
      failed: 0,
      skipped: 0,
      duration: 0,
      errors: []
    };

    try {
      // Get all proofs from old storage
      const oldProofs = await this.getAllOldProofs();
      result.total = oldProofs.length;

      logger.info(`Found ${oldProofs.length} proofs to migrate`);

      // Process in batches
      for (let i = 0; i < oldProofs.length; i += batchSize) {
        const batch = oldProofs.slice(i, i + batchSize);
        
        logger.info(`Processing batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(oldProofs.length / batchSize)}`);

        for (const oldProof of batch) {
          try {
            // Check if already exists in new storage
            if (skipExisting) {
              const existing = await this.newStorage.retrieveProof(oldProof.proofId);
              if (existing) {
                result.skipped++;
                logger.debug(`Skipping existing proof: ${oldProof.proofId}`);
                continue;
              }
            }

            if (!dryRun) {
              // Migrate the proof
              await this.newStorage.storeProof(
                oldProof.imageHash,
                oldProof.manifest,
                oldProof.signature
              );

              // Delete from old storage if requested
              if (deleteAfterMigration) {
                await this.oldStorage.deleteProof(oldProof.proofId);
              }
            }

            result.migrated++;
            logger.debug(`Migrated proof: ${oldProof.proofId}`);

          } catch (error) {
            result.failed++;
            const err = error instanceof Error ? error : new Error(String(error));
            result.errors.push({
              proofId: oldProof.proofId,
              error: err.message
            });
            logger.error(`Failed to migrate proof: ${oldProof.proofId}`, { error: err.message });
          }
        }

        // Small delay between batches to avoid overwhelming the system
        if (i + batchSize < oldProofs.length) {
          await this.delay(100);
        }
      }

      result.duration = Date.now() - startTime;

      logger.info('Migration complete', {
        total: result.total,
        migrated: result.migrated,
        failed: result.failed,
        skipped: result.skipped,
        duration: result.duration,
        dryRun
      });

      return result;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error('Migration failed', { error: err.message });
      throw error;
    }
  }

  /**
   * Migrate a single proof
   */
  async migrateSingle(proofId: string, options: MigrationOptions = {}): Promise<boolean> {
    const { dryRun = false, deleteAfterMigration = false } = options;

    try {
      // Get proof from old storage
      const oldProof = await this.oldStorage.getProof(proofId);
      if (!oldProof) {
        logger.warn(`Proof not found in old storage: ${proofId}`);
        return false;
      }

      if (!dryRun) {
        // Store in new storage
        await this.newStorage.storeProof(
          oldProof.imageHash,
          oldProof.manifest,
          oldProof.signature
        );

        // Delete from old storage if requested
        if (deleteAfterMigration) {
          await this.oldStorage.deleteProof(proofId);
        }
      }

      logger.info(`Successfully migrated proof: ${proofId}`, { dryRun });
      return true;

    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Failed to migrate proof: ${proofId}`, { error: err.message });
      return false;
    }
  }

  /**
   * Verify migration integrity
   */
  async verifyMigration(): Promise<{
    total: number;
    verified: number;
    missing: number;
    corrupted: number;
    missingProofs: string[];
  }> {
    logger.info('Starting migration verification');

    const result = {
      total: 0,
      verified: 0,
      missing: 0,
      corrupted: 0,
      missingProofs: [] as string[]
    };

    try {
      const oldProofs = await this.getAllOldProofs();
      result.total = oldProofs.length;

      for (const oldProof of oldProofs) {
        try {
          const newProof = await this.newStorage.retrieveProof(oldProof.proofId);
          
          if (!newProof) {
            result.missing++;
            result.missingProofs.push(oldProof.proofId);
            continue;
          }

          // Verify data integrity
          if (
            newProof.imageHash === oldProof.imageHash &&
            newProof.signature === oldProof.signature
          ) {
            result.verified++;
          } else {
            result.corrupted++;
            logger.warn(`Data mismatch for proof: ${oldProof.proofId}`);
          }

        } catch (error) {
          result.corrupted++;
          logger.error(`Verification failed for proof: ${oldProof.proofId}`, { error });
        }
      }

      logger.info('Verification complete', result);
      return result;

    } catch (error) {
      logger.error('Verification failed', { error });
      throw error;
    }
  }

  /**
   * Get all proofs from old storage
   */
  private async getAllOldProofs(): Promise<ProofRecord[]> {
    // This is a simplified version - actual implementation depends on ProofStorage internals
    // You may need to add a method to ProofStorage to list all proofs
    const proofs: ProofRecord[] = [];
    
    try {
      // Access the internal storage map (this is a hack for migration)
      const storage = (this.oldStorage as unknown as { storage: Map<string, ProofRecord> }).storage;
      
      for (const [, proof] of storage) {
        proofs.push(proof);
      }

      return proofs;
    } catch (error) {
      logger.error('Failed to get old proofs', { error });
      return [];
    }
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Generate migration report
   */
  generateReport(result: MigrationResult): string {
    const successRate = result.total > 0 
      ? ((result.migrated / result.total) * 100).toFixed(2)
      : '0.00';

    return `
Migration Report
================
Total Proofs:     ${result.total}
Migrated:         ${result.migrated}
Failed:           ${result.failed}
Skipped:          ${result.skipped}
Success Rate:     ${successRate}%
Duration:         ${(result.duration / 1000).toFixed(2)}s
Errors:           ${result.errors.length}

${result.errors.length > 0 ? '\nErrors:\n' + result.errors.map(e => `- ${e.proofId}: ${e.error}`).join('\n') : ''}
    `.trim();
  }
}
