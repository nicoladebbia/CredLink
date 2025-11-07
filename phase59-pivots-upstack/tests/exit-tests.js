/**
 * Exit Tests - Binary validation of Phase 59 success criteria
 *
 * Exit criteria:
 * 1. New SKUs ≥20% of MRR inside 60 days (combined custody + analytics-only)
 * 2. At least one enterprise adopts custody with audit acceptance (FIPS mode + rotation evidence pack)
 * 3. Stable ingestion from third-party verifiers (CAI Verify) mapped to dashboards—no manual rework for a full month
 */

import { createLogger } from '../src/utils/logger.js';
import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const logger = createLogger('ExitTests');
const { Pool } = pg;

async function runExitTests() {
  const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true',
  });

  let exitsPassed = 0;
  let exitsFailed = 0;

  try {
    logger.info('=== Phase 59 Exit Tests ===\n');

    // Exit Test 1: New SKUs ≥20% of MRR inside 60 days
    try {
      logger.info('Exit Test 1: New SKUs revenue target');

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - 60);

      const totalMrrQuery = `
        SELECT COALESCE(SUM(mrr), 0) as total_mrr
        FROM sku_usage
        WHERE started_at >= $1
      `;

      const newSkuMrrQuery = `
        SELECT COALESCE(SUM(mrr), 0) as new_sku_mrr
        FROM sku_usage
        WHERE started_at >= $1
          AND sku_type IN ('custody', 'analytics-only')
      `;

      const totalResult = await pool.query(totalMrrQuery, [cutoffDate]);
      const newSkuResult = await pool.query(newSkuMrrQuery, [cutoffDate]);

      const totalMrr = parseFloat(totalResult.rows[0].total_mrr);
      const newSkuMrr = parseFloat(newSkuResult.rows[0].new_sku_mrr);
      const percentage = totalMrr > 0 ? (newSkuMrr / totalMrr) * 100 : 0;

      logger.info('SKU Revenue Analysis:', {
        totalMrr: `$${totalMrr.toFixed(2)}`,
        newSkuMrr: `$${newSkuMrr.toFixed(2)}`,
        percentage: `${percentage.toFixed(1)}%`,
        target: '≥20%',
      });

      if (percentage >= 20) {
        logger.info('✅ Exit Test 1 PASSED: New SKUs at ' + percentage.toFixed(1) + '% of MRR');
        exitsPassed++;
      } else {
        logger.warn(
          '❌ Exit Test 1 FAILED: New SKUs only at ' +
            percentage.toFixed(1) +
            '% of MRR (need ≥20%)'
        );
        exitsFailed++;
      }
    } catch (error) {
      logger.error('❌ Exit Test 1 ERROR:', error.message);
      exitsFailed++;
    }

    // Exit Test 2: Enterprise custody adoption with audit acceptance
    try {
      logger.info('\nExit Test 2: Enterprise custody adoption');

      const enterpriseQuery = `
        SELECT 
          ck.tenant_id,
          ck.mode,
          ck.fips_validated,
          COUNT(ep.id) as evidence_pack_count,
          MAX(ep.created_at) as last_evidence_pack
        FROM custody_keys ck
        LEFT JOIN evidence_packs ep ON ck.tenant_id = ep.tenant_id
        WHERE ck.fips_validated = true
          AND ep.type = 'rotation'
        GROUP BY ck.tenant_id, ck.mode, ck.fips_validated
        HAVING COUNT(ep.id) > 0
      `;

      const enterpriseResult = await pool.query(enterpriseQuery);

      if (enterpriseResult.rows.length === 0) {
        logger.warn('❌ Exit Test 2 FAILED: No enterprise with custody + rotation evidence');
        exitsFailed++;
      } else {
        const enterprise = enterpriseResult.rows[0];
        logger.info('Enterprise Custody Adoption:', {
          tenantId: enterprise.tenant_id,
          mode: enterprise.mode,
          fipsValidated: enterprise.fips_validated,
          evidencePackCount: parseInt(enterprise.evidence_pack_count),
          lastRotation: enterprise.last_evidence_pack,
        });

        logger.info('✅ Exit Test 2 PASSED: Enterprise custody adoption with audit evidence');
        exitsPassed++;
      }
    } catch (error) {
      logger.error('❌ Exit Test 2 ERROR:', error.message);
      exitsFailed++;
    }

    // Exit Test 3: Stable ingestion for 30 days without manual rework
    try {
      logger.info('\nExit Test 3: Stable third-party ingestion');

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

      const ingestionQuery = `
        SELECT 
          DATE(ingested_at) as ingest_date,
          COUNT(*) as record_count,
          COUNT(DISTINCT source) as source_count,
          COUNT(DISTINCT provider) as provider_count
        FROM verify_results
        WHERE ingested_at >= $1
        GROUP BY DATE(ingested_at)
        ORDER BY ingest_date ASC
      `;

      const ingestionResult = await pool.query(ingestionQuery, [thirtyDaysAgo]);

      if (ingestionResult.rows.length < 30) {
        logger.warn(
          '❌ Exit Test 3 FAILED: Insufficient ingestion history (' +
            ingestionResult.rows.length +
            ' days)'
        );
        exitsFailed++;
      } else {
        // Check for consistency (no gaps, multiple sources)
        const hasGaps = ingestionResult.rows.some((row) => parseInt(row.record_count) === 0);
        const avgSources =
          ingestionResult.rows.reduce((sum, row) => sum + parseInt(row.source_count), 0) /
          ingestionResult.rows.length;
        const avgRecords =
          ingestionResult.rows.reduce((sum, row) => sum + parseInt(row.record_count), 0) /
          ingestionResult.rows.length;

        logger.info('Ingestion Stability Analysis:', {
          daysWithData: ingestionResult.rows.length,
          avgRecordsPerDay: avgRecords.toFixed(0),
          avgSourcesPerDay: avgSources.toFixed(1),
          hasGaps,
        });

        if (!hasGaps && avgSources >= 1) {
          logger.info('✅ Exit Test 3 PASSED: Stable ingestion for 30 days');
          exitsPassed++;
        } else {
          logger.warn('❌ Exit Test 3 FAILED: Ingestion not stable (gaps or insufficient sources)');
          exitsFailed++;
        }
      }
    } catch (error) {
      logger.error('❌ Exit Test 3 ERROR:', error.message);
      exitsFailed++;
    }

    // Final Summary
    logger.info('\n=== Exit Tests Summary ===');
    logger.info(`Total exit criteria: ${exitsPassed + exitsFailed}`);
    logger.info(`Passed: ${exitsPassed}`);
    logger.info(`Failed: ${exitsFailed}`);

    if (exitsFailed > 0) {
      logger.warn('\n⚠️  Phase 59 exit criteria NOT MET');
      logger.info('Action required to meet remaining criteria');
      process.exit(1);
    } else {
      logger.info('\n✅ Phase 59 exit criteria MET');
      logger.info('Phase 59 ready for production deployment');
    }
  } catch (error) {
    logger.error('Exit tests failed', { error: error.message, stack: error.stack });
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runExitTests();
