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
    if (missing.length > 0) {
      logger.error('Missing required environment variables', { count: missing.length });
      throw new Error('Configuration incomplete');
    }
  }

  initializeDatabase() {
    const dbHost = process.env.DB_HOST;
    const dbPort = parseInt(process.env.DB_PORT);

    // Critical security: Strict hostname validation to prevent SSRF
    if (!dbHost || typeof dbHost !== 'string') throw new Error('DB hostname required');

    // Check for localhost variations (allowed for development)
    const allowedLocalhosts = ['localhost', '127.0.0.1', '::1'];
    if (!allowedLocalhosts.includes(dbHost.toLowerCase())) {
      // Strict RFC-compliant hostname validation
      const hostnameRegex =
        /^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)*[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;

      if (!hostnameRegex.test(dbHost) && !ipRegex.test(dbHost)) {
        throw new Error('Invalid DB hostname format');
      }

      // Additional security checks
      if (dbHost.startsWith('.') || dbHost.endsWith('.') || dbHost.includes('..')) {
        throw new Error('Invalid DB hostname format');
      }

      // Validate IP address ranges if it's an IP
      if (ipRegex.test(dbHost)) {
        const octets = dbHost.split('.').map(Number);
        if (octets.some((octet) => octet < 0 || octet > 255)) {
          throw new Error('Invalid IP address');
        }
        // Block private ranges except localhost
        if (
          octets[0] === 10 ||
          (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
          (octets[0] === 192 && octets[1] === 168)
        ) {
          throw new Error('Private IP ranges not allowed for database connections');
        }
      }
    }

    if (isNaN(dbPort) || dbPort < 1 || dbPort > 65535) throw new Error('Invalid DB port');
    
    // Enhanced SSL configuration for production
    const sslConfig = process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
      ca: process.env.DB_SSL_CA || undefined,
    } : false;
    
    return new Pool({
      host: dbHost,
      port: dbPort,
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      ssl: sslConfig,
      max: 10,
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30000,
      queryTimeout: 30000,
      allowExitOnIdle: true,
    });
  }

  /**
   * Ingest verify result from third-party verifiers
   * POST /ingest/verify
   */
  async ingestVerifyResult(data) {
    try {
      // Critical security: Strict input validation
      if (!data || typeof data !== 'object') throw new Error('Invalid data format');

      // Validate source
      if (!data.source || typeof data.source !== 'string') throw new Error('Invalid source');
      if (data.source.length < 1 || data.source.length > 50)
        throw new Error('Invalid source length');
      if (!/^[a-zA-Z0-9_-]+$/.test(data.source)) throw new Error('Invalid source format');

      // Validate asset_id
      if (!data.asset_id || typeof data.asset_id !== 'string') throw new Error('Invalid asset_id');
      if (data.asset_id.length < 1 || data.asset_id.length > 255)
        throw new Error('Invalid asset_id length');
      if (!/^[a-zA-Z0-9_-]+$/.test(data.asset_id)) throw new Error('Invalid asset_id format');

      // Check data size to prevent DoS
      const dataSize = JSON.stringify(data).length;
      if (dataSize > 5 * 1024 * 1024) {
        // 5MB limit
        throw new Error('Data too large');
      }

      // Validate result
      if (!data.result || !['pass', 'fail'].includes(data.result))
        throw new Error('Invalid result');

      // Validate manifest type
      if (!data.manifest || !['embedded', 'link'].includes(data.manifest))
        throw new Error('Invalid manifest type');

      // Validate source against allowed list
      const validSources = ['cai-verify', 'vendor-x', 'cloudflare', 'cdn-preserve', 'custom'];
      if (!validSources.includes(data.source)) throw new Error('Invalid source');

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
      // Critical security: Strict tenant ID validation
      if (!tenantId || typeof tenantId !== 'string') throw new Error('Tenant ID required');
      if (tenantId.length < 3 || tenantId.length > 64)
        throw new Error('Tenant ID must be 3-64 characters');
      if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Invalid tenant ID format');

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
      // Critical security: Strict tenant ID validation
      if (!tenantId || typeof tenantId !== 'string') throw new Error('Tenant ID required');
      if (tenantId.length < 3 || tenantId.length > 64)
        throw new Error('Tenant ID must be 3-64 characters');
      if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Invalid tenant ID format');
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
      // Critical security: Strict tenant ID validation
      if (!tenantId || typeof tenantId !== 'string') throw new Error('Tenant ID required');
      if (tenantId.length < 3 || tenantId.length > 64)
        throw new Error('Tenant ID must be 3-64 characters');
      if (!/^[a-zA-Z0-9_-]+$/.test(tenantId)) throw new Error('Invalid tenant ID format');

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

      // First get total failures for percentage calculation
      const totalQuery = `
        SELECT COUNT(*) as total_failures
        FROM verify_results
        ${whereClause}
      `;
      const totalResult = await this.pool.query(totalQuery, params);
      const totalFailures = parseInt(totalResult.rows[0].total_failures);

      // Then get breakdown by provider/route
      const query = `
        SELECT 
          provider,
          route,
          COUNT(*) as breakage_count
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
          breakagePercentage:
            totalFailures > 0
              ? parseFloat(((100.0 * parseInt(row.breakage_count)) / totalFailures).toFixed(2))
              : 0,
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
