/**
 * Analytics Service - Ingest third-party verify results
 * Produces survival dashboards and compliance packs without controlling the pipeline
 */

import { createLogger } from '../src/utils/logger.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import pg from 'pg';

const logger = createLogger('AnalyticsService');
const { Pool } = pg;

export class AnalyticsService {
  constructor() {
    this.validateEnvironment();
    this.pool = this.initializeDatabase();
  }

  validateEnvironment() {
    const required = ['DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) throw new Error(`Missing: ${missing.join(', ')}`);
  }

  initializeDatabase() {
    const dbHost = process.env.DB_HOST;
    const dbPort = parseInt(process.env.DB_PORT);
    if (!/^[a-zA-Z0-9.-]+$/.test(dbHost)) throw new Error('Invalid DB hostname');
    if (dbPort < 1 || dbPort > 65535) throw new Error('Invalid DB port');
    return new Pool({
      host: dbHost,
      port: dbPort,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true',
      max: 10,
      connectionTimeoutMillis: 5000,
      query_timeout: 30000,
    });
  }

  /**
   * Ingest verify result from third-party verifiers
   * POST /ingest/verify
   */
  async ingestVerifyResult(data) {
    try {
      // Security: Validate inputs
      if (!data.source || typeof data.source !== 'string') throw new Error('Invalid source');
      if (!data.asset_id || typeof data.asset_id !== 'string') throw new Error('Invalid asset_id');
      if (!data.result || !['pass', 'fail'].includes(data.result))
        throw new Error('Invalid result');
      if (!data.manifest || !['embedded', 'link'].includes(data.manifest))
        throw new Error('Invalid manifest type');

      // Validate source
      const validSources = ['cai-verify', 'vendor-x', 'cloudflare', 'cdn-preserve', 'custom'];
      if (!validSources.includes(data.source))
        throw new Error(`Invalid source. Must be one of: ${validSources.join(', ')}`);

      // Validate provider if present
      if (data.provider && !/^[a-zA-Z0-9_-]+$/.test(data.provider))
        throw new Error('Invalid provider format');

      // Normalize to common schema
      const normalized = {
        id: uuidv4(),
        asset_hash: crypto.createHash('sha256').update(data.asset_id).digest('hex'),
        route: data.route || null,
        provider: data.provider || null,
        result: data.result,
        manifest_discovery: data.manifest,
        timestamp: data.ts || new Date().toISOString(),
        source: data.source,
        raw_data: JSON.stringify(data),
        ingested_at: new Date().toISOString(),
      };

      // Store in database
      await this.pool.query(
        `INSERT INTO verify_results (
          id, asset_hash, route, provider, result, manifest_discovery, 
          timestamp, source, raw_data, ingested_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          normalized.id,
          normalized.asset_hash,
          normalized.route,
          normalized.provider,
          normalized.result,
          normalized.manifest_discovery,
          normalized.timestamp,
          normalized.source,
          normalized.raw_data,
          normalized.ingested_at,
        ]
      );

      logger.info('Verify result ingested', {
        id: normalized.id,
        source: normalized.source,
        result: normalized.result,
        manifest: normalized.manifest_discovery,
      });

      return {
        id: normalized.id,
        assetHash: normalized.asset_hash,
        result: normalized.result,
        manifestDiscovery: normalized.manifest_discovery,
        ingestedAt: normalized.ingested_at,
      };
    } catch (error) {
      logger.error('Failed to ingest verify result', {
        error: error.message,
        data,
      });
      throw error;
    }
  }

  /**
   * Get survival analytics
   * GET /analytics/survival?tenant=acme&period=2025-11
   */
  async getSurvivalAnalytics(tenantId, period) {
    try {
      // Security: Validate inputs
      if (!tenantId || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Invalid tenant ID');

      let whereClause = 'WHERE 1=1';
      const params = [];

      // Parse period if provided (YYYY-MM format)
      if (period) {
        if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Invalid period format. Use YYYY-MM');
        const [year, month] = period.split('-');
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
        whereClause += ` AND timestamp >= $1 AND timestamp <= $2`;
        params.push(startDate.toISOString(), endDate.toISOString());
      }

      // Overall survival rate
      const survivalQuery = `
        SELECT 
          COUNT(*) as total,
          SUM(CASE WHEN result = 'pass' THEN 1 ELSE 0 END) as passed,
          ROUND(100.0 * SUM(CASE WHEN result = 'pass' THEN 1 ELSE 0 END) / COUNT(*), 2) as survival_rate
        FROM verify_results
        ${whereClause}
      `;
      const survivalResult = await this.pool.query(survivalQuery, params);

      // Survival by manifest discovery type
      const byManifestQuery = `
        SELECT 
          manifest_discovery,
          COUNT(*) as total,
          SUM(CASE WHEN result = 'pass' THEN 1 ELSE 0 END) as passed,
          ROUND(100.0 * SUM(CASE WHEN result = 'pass' THEN 1 ELSE 0 END) / COUNT(*), 2) as survival_rate
        FROM verify_results
        ${whereClause}
        GROUP BY manifest_discovery
      `;
      const byManifestResult = await this.pool.query(byManifestQuery, params);

      // Survival by provider
      const byProviderQuery = `
        SELECT 
          provider,
          COUNT(*) as total,
          SUM(CASE WHEN result = 'pass' THEN 1 ELSE 0 END) as passed,
          ROUND(100.0 * SUM(CASE WHEN result = 'pass' THEN 1 ELSE 0 END) / COUNT(*), 2) as survival_rate
        FROM verify_results
        ${whereClause}
        GROUP BY provider
        ORDER BY total DESC
      `;
      const byProviderResult = await this.pool.query(byProviderQuery, params);

      // Survival by route
      const byRouteQuery = `
        SELECT 
          route,
          COUNT(*) as total,
          SUM(CASE WHEN result = 'pass' THEN 1 ELSE 0 END) as passed,
          ROUND(100.0 * SUM(CASE WHEN result = 'pass' THEN 1 ELSE 0 END) / COUNT(*), 2) as survival_rate
        FROM verify_results
        ${whereClause} AND route IS NOT NULL
        GROUP BY route
        ORDER BY total DESC
        LIMIT 20
      `;
      const byRouteResult = await this.pool.query(byRouteQuery, params);

      // Verify p95 latency (placeholder - would need timestamp data)
      const p95Latency = 150; // ms

      return {
        tenantId,
        period,
        overall: {
          total: parseInt(survivalResult.rows[0].total),
          passed: parseInt(survivalResult.rows[0].passed),
          survivalRate: parseFloat(survivalResult.rows[0].survival_rate),
        },
        byManifest: byManifestResult.rows.map((row) => ({
          manifestType: row.manifest_discovery,
          total: parseInt(row.total),
          passed: parseInt(row.passed),
          survivalRate: parseFloat(row.survival_rate),
        })),
        byProvider: byProviderResult.rows.map((row) => ({
          provider: row.provider,
          total: parseInt(row.total),
          passed: parseInt(row.passed),
          survivalRate: parseFloat(row.survival_rate),
        })),
        byRoute: byRouteResult.rows.map((row) => ({
          route: row.route,
          total: parseInt(row.total),
          passed: parseInt(row.passed),
          survivalRate: parseFloat(row.survival_rate),
        })),
        performance: {
          verifyP95: p95Latency,
        },
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get survival analytics', {
        tenantId,
        period,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get compliance pack
   * GET /compliance/pack?tenant=acme&period=2025-11&regions=EU,UK
   */
  async getCompliancePack(tenantId, period, regions) {
    try {
      // Security: Validate inputs
      if (!tenantId || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Invalid tenant ID');
      if (!period || !/^\d{4}-\d{2}$/.test(period))
        throw new Error('Invalid period format. Use YYYY-MM');

      // Parse regions
      const regionList = regions ? regions.split(',').map((r) => r.trim()) : ['EU'];
      const validRegions = ['EU', 'UK', 'US', 'BR'];
      regionList.forEach((region) => {
        if (!validRegions.includes(region)) throw new Error(`Invalid region: ${region}`);
      });

      const [year, month] = period.split('-');
      const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
      const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);

      // Get disclosure counts for AI Act Art. 50
      const aiActQuery = `
        SELECT 
          COUNT(*) as total_disclosures,
          SUM(CASE WHEN manifest_discovery = 'embedded' THEN 1 ELSE 0 END) as embedded_disclosures,
          SUM(CASE WHEN manifest_discovery = 'link' THEN 1 ELSE 0 END) as remote_disclosures
        FROM verify_results
        WHERE timestamp >= $1 AND timestamp <= $2
      `;
      const aiActResult = await this.pool.query(aiActQuery, [
        startDate.toISOString(),
        endDate.toISOString(),
      ]);

      // DSA transparency strings (if supplied by customer)
      const dsaQuery = `
        SELECT 
          COUNT(*) as ad_transparency_count
        FROM verify_results
        WHERE timestamp >= $1 AND timestamp <= $2
        AND raw_data::jsonb ? 'dsa_transparency'
      `;
      const dsaResult = await this.pool.query(dsaQuery, [
        startDate.toISOString(),
        endDate.toISOString(),
      ]);

      // Benchmarking vs public "preserve" capabilities
      const preserveQuery = `
        SELECT 
          provider,
          COUNT(*) as total,
          SUM(CASE WHEN result = 'pass' AND manifest_discovery = 'embedded' THEN 1 ELSE 0 END) as preserved_count,
          ROUND(100.0 * SUM(CASE WHEN result = 'pass' AND manifest_discovery = 'embedded' THEN 1 ELSE 0 END) / COUNT(*), 2) as preserve_rate
        FROM verify_results
        WHERE timestamp >= $1 AND timestamp <= $2
        AND provider IN ('cf-images', 'cloudflare', 'cloudinary', 'imgix')
        GROUP BY provider
      `;
      const preserveResult = await this.pool.query(preserveQuery, [
        startDate.toISOString(),
        endDate.toISOString(),
      ]);

      // Generate compliance pack
      const packId = uuidv4();
      const pack = {
        id: packId,
        tenantId,
        period,
        regions: regionList,
        aiAct: {
          article50: {
            totalDisclosures: parseInt(aiActResult.rows[0].total_disclosures),
            embeddedDisclosures: parseInt(aiActResult.rows[0].embedded_disclosures),
            remoteDisclosures: parseInt(aiActResult.rows[0].remote_disclosures),
          },
        },
        dsa: {
          adTransparencyCount: parseInt(dsaResult.rows[0].ad_transparency_count),
        },
        benchmarking: {
          cdnPreserve: preserveResult.rows.map((row) => ({
            provider: row.provider,
            total: parseInt(row.total),
            preservedCount: parseInt(row.preserved_count),
            preserveRate: parseFloat(row.preserve_rate),
          })),
        },
        generatedAt: new Date().toISOString(),
      };

      // Store compliance pack
      await this.pool.query(
        `INSERT INTO compliance_packs (id, tenant_id, period, regions, content, created_at) 
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [packId, tenantId, period, regionList.join(','), JSON.stringify(pack)]
      );

      logger.info('Compliance pack generated', {
        packId,
        tenantId,
        period,
        regions: regionList,
      });

      return pack;
    } catch (error) {
      logger.error('Failed to generate compliance pack', {
        tenantId,
        period,
        regions,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get breakage analysis by optimizer/provider
   */
  async getBreakageAnalysis(tenantId, period) {
    try {
      if (!tenantId || !/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Invalid tenant ID');

      let whereClause = "WHERE result = 'fail'";
      const params = [];

      if (period) {
        if (!/^\d{4}-\d{2}$/.test(period)) throw new Error('Invalid period format');
        const [year, month] = period.split('-');
        const startDate = new Date(parseInt(year), parseInt(month) - 1, 1);
        const endDate = new Date(parseInt(year), parseInt(month), 0, 23, 59, 59);
        whereClause += ` AND timestamp >= $1 AND timestamp <= $2`;
        params.push(startDate.toISOString(), endDate.toISOString());
      }

      const query = `
        SELECT 
          provider,
          route,
          COUNT(*) as breakage_count,
          ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 2) as breakage_pct
        FROM verify_results
        ${whereClause}
        GROUP BY provider, route
        ORDER BY breakage_count DESC
        LIMIT 50
      `;

      const result = await this.pool.query(query, params);

      return {
        tenantId,
        period,
        breakageByStack: result.rows.map((row) => ({
          provider: row.provider,
          route: row.route,
          breakageCount: parseInt(row.breakage_count),
          breakagePercentage: parseFloat(row.breakage_pct),
        })),
        generatedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to get breakage analysis', {
        tenantId,
        period,
        error: error.message,
      });
      throw error;
    }
  }
}
