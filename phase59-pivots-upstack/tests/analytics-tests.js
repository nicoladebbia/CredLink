/**
 * Analytics Tests - Verify third-party verify ingestion and dashboards
 */

import { AnalyticsService } from '../analytics/analytics-service.js';
import { createLogger } from '../src/utils/logger.js';
import dotenv from 'dotenv';

dotenv.config();

const logger = createLogger('AnalyticsTests');

async function runAnalyticsTests() {
  const analyticsService = new AnalyticsService();
  const testTenant = `test-${Date.now()}`;
  let testsPassed = 0;
  let testsFailed = 0;

  try {
    logger.info('Starting analytics tests');

    // Test 1: Ingest CAI Verify results
    try {
      logger.info('Test 1: Ingest CAI Verify results');

      const verifyResults = [
        {
          source: 'cai-verify',
          asset_id: 'test-asset-1.jpg',
          result: 'pass',
          manifest: 'embedded',
          provider: 'cf-images',
          route: '/images/processed',
          ts: new Date().toISOString(),
        },
        {
          source: 'cai-verify',
          asset_id: 'test-asset-2.jpg',
          result: 'pass',
          manifest: 'link',
          provider: 'cloudflare',
          route: '/images/optimized',
          ts: new Date().toISOString(),
        },
        {
          source: 'cai-verify',
          asset_id: 'test-asset-3.jpg',
          result: 'fail',
          manifest: 'embedded',
          provider: 'cloudinary',
          route: '/images/transformed',
          ts: new Date().toISOString(),
        },
      ];

      for (const result of verifyResults) {
        await analyticsService.ingestVerifyResult(result);
      }

      logger.info('✅ Test 1 passed: CAI Verify results ingested', {
        count: verifyResults.length,
      });
      testsPassed++;
    } catch (error) {
      logger.error('❌ Test 1 failed:', error.message);
      testsFailed++;
    }

    // Test 2: Get survival analytics
    try {
      logger.info('Test 2: Get survival analytics');

      const survival = await analyticsService.getSurvivalAnalytics(
        testTenant,
        new Date().toISOString().substring(0, 7) // YYYY-MM
      );

      if (!survival.overall || typeof survival.overall.survivalRate !== 'number') {
        throw new Error('Survival analytics missing overall data');
      }

      if (!Array.isArray(survival.byManifest)) {
        throw new Error('Survival analytics missing byManifest data');
      }

      if (!Array.isArray(survival.byProvider)) {
        throw new Error('Survival analytics missing byProvider data');
      }

      logger.info('✅ Test 2 passed: Survival analytics retrieved', {
        survivalRate: survival.overall.survivalRate,
        manifestTypes: survival.byManifest.length,
        providers: survival.byProvider.length,
      });
      testsPassed++;
    } catch (error) {
      logger.error('❌ Test 2 failed:', error.message);
      testsFailed++;
    }

    // Test 3: Get compliance pack
    try {
      logger.info('Test 3: Get compliance pack');

      const compliancePack = await analyticsService.getCompliancePack(
        testTenant,
        new Date().toISOString().substring(0, 7), // YYYY-MM
        'EU,UK'
      );

      if (!compliancePack.id || !compliancePack.aiAct) {
        throw new Error('Compliance pack missing required fields');
      }

      if (
        !compliancePack.aiAct.article50 ||
        typeof compliancePack.aiAct.article50.totalDisclosures !== 'number'
      ) {
        throw new Error('Compliance pack missing AI Act data');
      }

      logger.info('✅ Test 3 passed: Compliance pack generated', {
        packId: compliancePack.id,
        regions: compliancePack.regions,
        totalDisclosures: compliancePack.aiAct.article50.totalDisclosures,
      });
      testsPassed++;
    } catch (error) {
      logger.error('❌ Test 3 failed:', error.message);
      testsFailed++;
    }

    // Test 4: Get breakage analysis
    try {
      logger.info('Test 4: Get breakage analysis');

      const breakage = await analyticsService.getBreakageAnalysis(
        testTenant,
        new Date().toISOString().substring(0, 7) // YYYY-MM
      );

      if (!Array.isArray(breakage.breakageByStack)) {
        throw new Error('Breakage analysis missing data');
      }

      logger.info('✅ Test 4 passed: Breakage analysis retrieved', {
        stackCount: breakage.breakageByStack.length,
      });
      testsPassed++;
    } catch (error) {
      logger.error('❌ Test 4 failed:', error.message);
      testsFailed++;
    }

    // Test 5: Ingest from multiple sources
    try {
      logger.info('Test 5: Ingest from multiple verify sources');

      const multiSourceResults = [
        {
          source: 'vendor-x',
          asset_id: 'multi-1.jpg',
          result: 'pass',
          manifest: 'embedded',
          provider: 'imgix',
        },
        {
          source: 'cloudflare',
          asset_id: 'multi-2.jpg',
          result: 'pass',
          manifest: 'link',
          provider: 'cf-images',
        },
        {
          source: 'cdn-preserve',
          asset_id: 'multi-3.jpg',
          result: 'pass',
          manifest: 'embedded',
          provider: 'cloudflare',
        },
      ];

      for (const result of multiSourceResults) {
        await analyticsService.ingestVerifyResult(result);
      }

      logger.info('✅ Test 5 passed: Multiple sources ingested', {
        sources: [...new Set(multiSourceResults.map((r) => r.source))],
      });
      testsPassed++;
    } catch (error) {
      logger.error('❌ Test 5 failed:', error.message);
      testsFailed++;
    }

    // Summary
    logger.info('\n=== Analytics Tests Summary ===');
    logger.info(`Total tests: ${testsPassed + testsFailed}`);
    logger.info(`Passed: ${testsPassed}`);
    logger.info(`Failed: ${testsFailed}`);

    if (testsFailed > 0) {
      process.exit(1);
    }
  } catch (error) {
    logger.error('Analytics tests failed', { error: error.message, stack: error.stack });
    process.exit(1);
  }
}

runAnalyticsTests();
