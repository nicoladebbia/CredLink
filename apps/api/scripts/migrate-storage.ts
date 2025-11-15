#!/usr/bin/env ts-node

/**
 * Storage Migration Script
 * 
 * Migrates proofs from old in-memory/filesystem storage to cloud storage (S3/R2)
 * 
 * Usage:
 *   pnpm migrate:storage --dry-run
 *   pnpm migrate:storage --batch-size=50
 *   pnpm migrate:storage --delete-after
 *   pnpm migrate:storage --verify
 */

import { ProofStorage } from '../src/services/proof-storage';
import { CloudProofStorage } from '../src/services/cloud-proof-storage';
import { StorageMigrator } from '../src/storage/storage-migrator';
import { StorageFactory } from '../src/storage/storage-factory';

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  batchSize: parseInt(args.find(arg => arg.startsWith('--batch-size='))?.split('=')[1] || '100'),
  deleteAfter: args.includes('--delete-after'),
  verify: args.includes('--verify'),
  skipExisting: !args.includes('--no-skip')
};

async function main() {
  console.log('🚀 Storage Migration Tool\n');
  console.log('Options:', options);
  console.log('');

  try {
    // Initialize storage services
    console.log('Initializing storage services...');
    const oldStorage = new ProofStorage();
    
    // Create cloud storage with fallback
    const primaryStorage = StorageFactory.fromEnv();
    const newStorage = new CloudProofStorage(primaryStorage);

    // Create migrator
    const migrator = new StorageMigrator(oldStorage, newStorage);

    if (options.verify) {
      // Verify existing migration
      console.log('\n📊 Verifying migration...\n');
      const verification = await migrator.verifyMigration();
      
      console.log('Verification Results:');
      console.log(`  Total:      ${verification.total}`);
      console.log(`  Verified:   ${verification.verified}`);
      console.log(`  Missing:    ${verification.missing}`);
      console.log(`  Corrupted:  ${verification.corrupted}`);
      
      if (verification.missingProofs.length > 0) {
        console.log('\nMissing Proofs:');
        verification.missingProofs.forEach(id => console.log(`  - ${id}`));
      }

      process.exit(verification.missing > 0 || verification.corrupted > 0 ? 1 : 0);
    }

    // Run migration
    console.log('\n🔄 Starting migration...\n');
    
    if (options.dryRun) {
      console.log('⚠️  DRY RUN MODE - No changes will be made\n');
    }

    const result = await migrator.migrateAll({
      batchSize: options.batchSize,
      dryRun: options.dryRun,
      skipExisting: options.skipExisting,
      deleteAfterMigration: options.deleteAfter
    });

    // Display results
    console.log('\n✅ Migration Complete!\n');
    console.log(migrator.generateReport(result));

    // Check for errors
    if (result.failed > 0) {
      console.log('\n⚠️  Some proofs failed to migrate. Check logs for details.');
      process.exit(1);
    }

    // Health check
    console.log('\n🏥 Running health check...');
    const health = await newStorage.healthCheck();
    console.log(`  Status: ${health.healthy ? '✅ Healthy' : '❌ Unhealthy'}`);
    console.log(`  Provider: ${health.primary.provider}`);
    console.log(`  Latency: ${health.primary.latency}ms`);

    // Get stats
    console.log('\n📈 Storage Statistics:');
    const stats = await newStorage.getStats();
    console.log(`  Total Objects: ${stats.storage.totalObjects}`);
    console.log(`  Total Size: ${(stats.storage.totalSize / 1024 / 1024).toFixed(2)} MB`);
    console.log(`  Cache Size: ${stats.cache.size}/${stats.cache.maxSize}`);
    console.log(`  Cache Hit Rate: ${(stats.cache.hitRate * 100).toFixed(2)}%`);
    console.log(`  Avg Store Time: ${stats.metrics.avgStoreTime.toFixed(2)}ms`);
    console.log(`  Avg Retrieve Time: ${stats.metrics.avgRetrieveTime.toFixed(2)}ms`);

    console.log('\n✨ Migration successful!');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
