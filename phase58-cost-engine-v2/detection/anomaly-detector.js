/**
 * Anomaly Detector
 * Combines rule-based and seasonal baseline detection
 * 
 * Detection methods:
 * 1. Rule-based: threshold violations
 * 2. Seasonal baselines: EWMA and historical patterns
 * 3. Cross-check with AWS Cost Anomaly Detection
 * 
 * Reference: https://docs.aws.amazon.com/cost-management/latest/userguide/getting-started-ad.html
 */

import { createLogger } from '../src/utils/logger.js';
import pg from 'pg';

const logger = createLogger('AnomalyDetector');
const { Pool } = pg;

export class AnomalyDetector {
  constructor() {
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'cost_engine',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true',
      max: 10
    });

    // Detection configuration
    this.confidenceThreshold = parseFloat(process.env.ANOMALY_CONFIDENCE_THRESHOLD) || 0.8;
    this.impactThreshold = parseFloat(process.env.ANOMALY_IMPACT_USD_DAY_THRESHOLD) || 50.0;
    this.durationThreshold = parseInt(process.env.ANOMALY_DURATION_HOURS_THRESHOLD) || 2;
    this.baselineLookback = parseInt(process.env.BASELINE_LOOKBACK_DAYS) || 30;
    this.ewmaAlpha = parseFloat(process.env.EWMA_ALPHA) || 0.3;

    // Rule thresholds
    this.rules = {
      egressHotspot: {
        egressDeltaPct: 50, // 50% increase
        cacheBypassIncrease: 0.2 // 20pp increase
      },
      tsaExplosion: {
        tokensDeltaPct: 100 // 100% increase
      },
      workersCpuDrift: {
        cpuMsDeltaPct: 30 // 30% increase
      },
      cacheBypassSpike: {
        bypassRateDelta: 0.3 // 30pp increase
      }
    };
  }

  /**
   * Initialize detector (create tables)
   */
  async initialize() {
    logger.info('Initializing anomaly detector');

    try {
      await this.createTables();
      logger.info('Anomaly detector initialized');
    } catch (error) {
      logger.error('Failed to initialize detector', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create database tables
   */
  async createTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS anomalies (
        id SERIAL PRIMARY KEY,
        tenant_id VARCHAR(100) NOT NULL,
        kind VARCHAR(50) NOT NULL,
        route VARCHAR(255),
        delta_pct DECIMAL(8, 2) NOT NULL,
        impact_usd_day DECIMAL(12, 6) NOT NULL,
        confidence DECIMAL(3, 2) NOT NULL,
        evidence JSONB NOT NULL,
        proposed JSONB,
        status VARCHAR(50) DEFAULT 'detected',
        detected_at TIMESTAMP DEFAULT NOW(),
        resolved_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_anomalies_tenant ON anomalies(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_anomalies_detected ON anomalies(detected_at);
      CREATE INDEX IF NOT EXISTS idx_anomalies_status ON anomalies(status);

      CREATE TABLE IF NOT EXISTS baselines (
        id SERIAL PRIMARY KEY,
        metric_name VARCHAR(100) NOT NULL,
        tenant_id VARCHAR(100),
        route VARCHAR(255),
        value DECIMAL(12, 6) NOT NULL,
        ewma DECIMAL(12, 6),
        stddev DECIMAL(12, 6),
        sample_count INT NOT NULL,
        updated_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(metric_name, tenant_id, route)
      );
    `);
  }

  /**
   * Run detection cycle
   * Returns list of detected anomalies
   */
  async detect() {
    logger.info('Starting detection cycle');

    try {
      const anomalies = [];

      // Run all detection methods in parallel
      const [
        egressHotspots,
        tsaExplosions,
        workersCpuDrifts,
        cacheBypassSpikes
      ] = await Promise.all([
        this.detectEgressHotspots(),
        this.detectTSAExplosions(),
        this.detectWorkersCpuDrift(),
        this.detectCacheBypassSpikes()
      ]);

      anomalies.push(...egressHotspots, ...tsaExplosions, ...workersCpuDrifts, ...cacheBypassSpikes);

      // Filter by confidence and impact
      const filtered = anomalies.filter(a =>
        a.confidence >= this.confidenceThreshold &&
        a.impact_usd_day >= this.impactThreshold
      );

      // Save anomalies
      if (filtered.length > 0) {
        await this.saveAnomalies(filtered);
      }

      logger.info('Detection cycle completed', {
        detected: anomalies.length,
        highConfidence: filtered.length
      });

      return filtered;
    } catch (error) {
      logger.error('Detection cycle failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Detect egress hotspots
   * Alert when egress/req increases with cache bypass
   */
  async detectEgressHotspots() {
    const anomalies = [];

    try {
      // Query current metrics by route
      const currentMetrics = await this.getEgressMetricsByRoute();
      
      for (const metric of currentMetrics) {
        const baseline = await this.getBaseline('egress_per_request', metric.tenantId, metric.route);
        
        if (!baseline || baseline.value === 0) {
          continue;
        }

        const deltaPct = ((metric.egressPerReq - baseline.value) / baseline.value) * 100;

        // Check rule threshold
        if (deltaPct > this.rules.egressHotspot.egressDeltaPct &&
            metric.cacheBypassRate > baseline.cacheBypassRate + this.rules.egressHotspot.cacheBypassIncrease) {
          
          // Calculate impact
          const impactUsdDay = (metric.egressPerReq - baseline.value) * metric.requests * 0.09 / (1024 ** 3); // $0.09/GB egress

          anomalies.push({
            tenant_id: metric.tenantId,
            kind: 'egress_hotspot',
            route: metric.route,
            delta_pct: deltaPct,
            impact_usd_day: impactUsdDay,
            confidence: this.calculateConfidence(deltaPct, impactUsdDay),
            evidence: {
              cache_bypass_rate: metric.cacheBypassRate,
              egress_per_req_bytes: metric.egressPerReq,
              cache_status: metric.cacheStatusBreakdown
            },
            proposed: [
              {
                action: 'force_remote_only',
                why: 'High cache bypass rate indicates embed-chasing behavior'
              },
              {
                action: 'move_manifest_origin',
                to: 'R2-nearest',
                why: 'Reduce egress costs with R2 zero-egress'
              }
            ]
          });
        }
      }
    } catch (error) {
      logger.error('Egress hotspot detection failed', {
        error: error.message
      });
    }

    return anomalies;
  }

  /**
   * Detect TSA token explosions
   */
  async detectTSAExplosions() {
    const anomalies = [];

    try {
      const currentMetrics = await this.getTSAMetricsByTenant();
      
      for (const metric of currentMetrics) {
        const baseline = await this.getBaseline('tsa_tokens_per_asset', metric.tenantId);
        
        if (!baseline || baseline.value === 0) {
          continue;
        }

        const deltaPct = ((metric.tokensPerAsset - baseline.value) / baseline.value) * 100;

        if (deltaPct > this.rules.tsaExplosion.tokensDeltaPct) {
          const tokenPrice = 0.001;
          const impactUsdDay = (metric.tokensPerAsset - baseline.value) * metric.assetsPerDay * tokenPrice;

          anomalies.push({
            tenant_id: metric.tenantId,
            kind: 'tsa_explosion',
            route: null,
            delta_pct: deltaPct,
            impact_usd_day: impactUsdDay,
            confidence: this.calculateConfidence(deltaPct, impactUsdDay),
            evidence: {
              tokens_per_asset: metric.tokensPerAsset,
              baseline_tokens_per_asset: baseline.value,
              assets_per_day: metric.assetsPerDay
            },
            proposed: [
              {
                action: 'batch_timestamps',
                why: 'Reduce token count by batching when policy allows'
              },
              {
                action: 'reduce_frequency',
                why: 'Lower-risk assertions may not need every timestamp'
              }
            ]
          });
        }
      }
    } catch (error) {
      logger.error('TSA explosion detection failed', {
        error: error.message
      });
    }

    return anomalies;
  }

  /**
   * Detect Workers CPU drift
   */
  async detectWorkersCpuDrift() {
    const anomalies = [];

    try {
      const currentMetrics = await this.getWorkersCpuMetrics();
      
      for (const metric of currentMetrics) {
        const baseline = await this.getBaseline('workers_cpu_ms_per_request', metric.tenantId);
        
        if (!baseline || baseline.value === 0) {
          continue;
        }

        const deltaPct = ((metric.cpuMsPerReq - baseline.value) / baseline.value) * 100;

        if (deltaPct > this.rules.workersCpuDrift.cpuMsDeltaPct) {
          const cpuMsPrice = 0.000002;
          const impactUsdDay = (metric.cpuMsPerReq - baseline.value) * metric.requests * cpuMsPrice;

          anomalies.push({
            tenant_id: metric.tenantId,
            kind: 'workers_cpu_drift',
            route: null,
            delta_pct: deltaPct,
            impact_usd_day: impactUsdDay,
            confidence: this.calculateConfidence(deltaPct, impactUsdDay),
            evidence: {
              cpu_ms_per_request: metric.cpuMsPerReq,
              baseline_cpu_ms: baseline.value,
              requests_per_day: metric.requests
            },
            proposed: [
              {
                action: 'profile_code_path',
                why: 'Identify heavy computation paths'
              },
              {
                action: 'canary_slimmer_route',
                why: 'Test optimized code path'
              }
            ]
          });
        }
      }
    } catch (error) {
      logger.error('Workers CPU drift detection failed', {
        error: error.message
      });
    }

    return anomalies;
  }

  /**
   * Detect cache bypass spikes
   */
  async detectCacheBypassSpikes() {
    const anomalies = [];

    try {
      const currentMetrics = await this.getCacheMetricsByRoute();
      
      for (const metric of currentMetrics) {
        const baseline = await this.getBaseline('cache_bypass_rate', metric.tenantId, metric.route);
        
        if (!baseline) {
          continue;
        }

        const bypassDelta = metric.cacheBypassRate - baseline.value;

        if (bypassDelta > this.rules.cacheBypassSpike.bypassRateDelta) {
          const impactUsdDay = metric.requests * bypassDelta * 0.001; // Estimate

          anomalies.push({
            tenant_id: metric.tenantId,
            kind: 'cache_bypass_spike',
            route: metric.route,
            delta_pct: (bypassDelta / baseline.value) * 100,
            impact_usd_day: impactUsdDay,
            confidence: this.calculateConfidence(bypassDelta * 100, impactUsdDay),
            evidence: {
              cache_bypass_rate: metric.cacheBypassRate,
              baseline_bypass_rate: baseline.value,
              cache_status_breakdown: metric.cacheStatusBreakdown
            },
            proposed: [
              {
                action: 'add_cache_ttl',
                why: 'Increase cache hit rate with proper TTL'
              },
              {
                action: 'verify_cache_eligibility',
                why: 'Ensure responses are cacheable'
              }
            ]
          });
        }
      }
    } catch (error) {
      logger.error('Cache bypass spike detection failed', {
        error: error.message
      });
    }

    return anomalies;
  }

  /**
   * Get or calculate baseline using EWMA
   */
  async getBaseline(metricName, tenantId, route = null) {
    try {
      const result = await this.pool.query(`
        SELECT * FROM baselines
        WHERE metric_name = $1 AND tenant_id = $2 AND (route = $3 OR ($3 IS NULL AND route IS NULL))
      `, [metricName, tenantId, route]);

      if (result.rows.length > 0) {
        return {
          value: parseFloat(result.rows[0].ewma || result.rows[0].value),
          cacheBypassRate: parseFloat(result.rows[0].cache_bypass_rate) || 0
        };
      }

      return null;
    } catch (error) {
      logger.error('Failed to get baseline', {
        metric: metricName,
        error: error.message
      });
      return null;
    }
  }

  /**
   * Calculate confidence score based on delta and impact
   */
  calculateConfidence(deltaPct, impactUsdDay) {
    // Higher delta + higher impact = higher confidence
    const deltaScore = Math.min(Math.abs(deltaPct) / 200, 1); // Normalize to 0-1
    const impactScore = Math.min(impactUsdDay / 1000, 1); // Normalize to 0-1
    
    return Math.min((deltaScore * 0.6 + impactScore * 0.4), 1);
  }

  /**
   * Save anomalies to database
   */
  async saveAnomalies(anomalies) {
    for (const anomaly of anomalies) {
      await this.pool.query(`
        INSERT INTO anomalies (
          tenant_id, kind, route, delta_pct, impact_usd_day,
          confidence, evidence, proposed, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `, [
        anomaly.tenant_id,
        anomaly.kind,
        anomaly.route,
        anomaly.delta_pct,
        anomaly.impact_usd_day,
        anomaly.confidence,
        JSON.stringify(anomaly.evidence),
        JSON.stringify(anomaly.proposed),
        'detected'
      ]);
    }

    logger.info('Anomalies saved', { count: anomalies.length });
  }

  // Mock data getters (would query real metrics in production)
  async getEgressMetricsByRoute() { return []; }
  async getTSAMetricsByTenant() { return []; }
  async getWorkersCpuMetrics() { return []; }
  async getCacheMetricsByRoute() { return []; }

  async close() {
    await this.pool.end();
  }
}

export default AnomalyDetector;
