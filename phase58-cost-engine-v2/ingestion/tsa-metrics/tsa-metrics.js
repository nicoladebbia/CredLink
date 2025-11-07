/**
 * TSA (Time Stamping Authority) Metrics Tracker
 * Tracks RFC 3161 timestamp token usage and costs
 * 
 * Reference: https://www.ietf.org/rfc/rfc3161.txt
 * 
 * Monitors:
 * - Tokens issued per asset
 * - Cost per token (vendor SKU dependent)
 * - Usage spikes and anomalies
 */

import { createLogger } from '../../src/utils/logger.js';
import pg from 'pg';

const logger = createLogger('TSAMetrics');
const { Pool } = pg;

export class TSAMetrics {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'cost_engine',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true',
      max: 10,
      idleTimeoutMillis: 30000
    });

    // Pricing per token (vendor dependent)
    this.tokenPrice = parseFloat(process.env.TSA_PRICE_PER_TOKEN) || 0.001; // $0.001 per token
  }

  /**
   * Read latest TSA metrics
   * Queries internal database for timestamp usage
   */
  async readLatest() {
    logger.info('Reading latest TSA metrics');

    try {
      const metrics = await this.getTokenMetrics();
      const costs = this.calculateCosts(metrics);

      logger.info('TSA metrics read successfully', {
        tokensIssued: metrics.tokensIssued,
        cost: costs.total
      });

      return {
        metrics,
        costs,
        readAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to read TSA metrics', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get timestamp token metrics from database
   */
  async getTokenMetrics() {
    try {
      // Query last 24 hours of token issuance
      const result = await this.pool.query(`
        SELECT
          COUNT(*) as tokens_issued,
          COUNT(DISTINCT asset_id) as assets_timestamped,
          AVG(tokens_per_asset) as avg_tokens_per_asset,
          tenant_id
        FROM (
          SELECT
            asset_id,
            tenant_id,
            COUNT(*) as tokens_per_asset
          FROM timestamps
          WHERE created_at >= NOW() - INTERVAL '24 hours'
          GROUP BY asset_id, tenant_id
        ) sub
        GROUP BY tenant_id
      `);

      const byTenant = {};
      let totalTokens = 0;
      let totalAssets = 0;

      for (const row of result.rows) {
        const tenantId = row.tenant_id || 'unknown';
        const tokensIssued = parseInt(row.tokens_issued) || 0;
        const assetsTimestamped = parseInt(row.assets_timestamped) || 0;
        const avgTokensPerAsset = parseFloat(row.avg_tokens_per_asset) || 0;

        byTenant[tenantId] = {
          tokensIssued,
          assetsTimestamped,
          avgTokensPerAsset,
          tokensPer1kAssets: assetsTimestamped > 0 
            ? (tokensIssued / assetsTimestamped) * 1000
            : 0
        };

        totalTokens += tokensIssued;
        totalAssets += assetsTimestamped;
      }

      return {
        tokensIssued: totalTokens,
        assetsTimestamped: totalAssets,
        avgTokensPerAsset: totalAssets > 0 ? totalTokens / totalAssets : 0,
        byTenant
      };
    } catch (error) {
      // If table doesn't exist or query fails, return empty metrics
      logger.warn('Failed to query TSA metrics, returning empty', {
        error: error.message
      });
      return {
        tokensIssued: 0,
        assetsTimestamped: 0,
        avgTokensPerAsset: 0,
        byTenant: {}
      };
    }
  }

  /**
   * Calculate TSA costs
   */
  calculateCosts(metrics) {
    const totalCost = metrics.tokensIssued * this.tokenPrice;
    const costPerAsset = metrics.assetsTimestamped > 0
      ? totalCost / metrics.assetsTimestamped
      : 0;

    const byTenant = {};
    for (const [tenantId, tenantMetrics] of Object.entries(metrics.byTenant)) {
      byTenant[tenantId] = {
        total: tenantMetrics.tokensIssued * this.tokenPrice,
        perAsset: tenantMetrics.assetsTimestamped > 0
          ? (tenantMetrics.tokensIssued * this.tokenPrice) / tenantMetrics.assetsTimestamped
          : 0
      };
    }

    return {
      total: totalCost,
      perAsset: costPerAsset,
      byTenant
    };
  }

  /**
   * Detect TSA token explosion
   * Alert if tokens per asset increases significantly
   */
  detectTokenExplosion(currentMetrics, historicalAvg, threshold = 0.5) {
    const current = currentMetrics.avgTokensPerAsset;
    const baseline = historicalAvg;
    
    if (baseline === 0) {
      return null;
    }

    const deltaPercent = ((current - baseline) / baseline) * 100;

    if (deltaPercent > threshold * 100) {
      return {
        current,
        baseline,
        deltaPercent,
        impactUsdDay: (current - baseline) * metrics.assetsTimestamped * this.tokenPrice,
        severity: deltaPercent / 100
      };
    }

    return null;
  }

  /**
   * Get TSA utilization rate (tokens per 1k assets)
   * Key metric for tracking TSA cost efficiency
   */
  async getUtilizationRate() {
    try {
      const result = await this.pool.query(`
        SELECT
          DATE(created_at) as date,
          COUNT(*) as tokens_issued,
          COUNT(DISTINCT asset_id) as assets_timestamped,
          (COUNT(*)::float / COUNT(DISTINCT asset_id)) * 1000 as tokens_per_1k_assets
        FROM timestamps
        WHERE created_at >= NOW() - INTERVAL '30 days'
        GROUP BY DATE(created_at)
        ORDER BY date DESC
      `);

      return result.rows.map(row => ({
        date: row.date,
        tokensIssued: parseInt(row.tokens_issued),
        assetsTimestamped: parseInt(row.assets_timestamped),
        tokensPer1kAssets: parseFloat(row.tokens_per_1k_assets)
      }));
    } catch (error) {
      logger.error('Failed to get utilization rate', {
        error: error.message
      });
      return [];
    }
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default TSAMetrics;
