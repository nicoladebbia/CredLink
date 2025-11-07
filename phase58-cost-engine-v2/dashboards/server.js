/**
 * Dashboard Server
 * Serves P&L, gross margin trends, and anomaly ledger
 * 
 * Endpoints:
 * - GET /api/pnl/:tenant - Per-tenant P&L
 * - GET /api/margins - Gross margin trends
 * - GET /api/anomalies - Anomaly ledger
 * - GET /api/drains - Top cost drains
 */

import express from 'express';
import { createLogger } from '../src/utils/logger.js';
import pg from 'pg';

const logger = createLogger('DashboardServer');
const { Pool } = pg;

export class DashboardServer {
  constructor() {
    this.app = express();
    this.port = parseInt(process.env.DASHBOARD_PORT) || 3000;
    this.host = process.env.DASHBOARD_HOST || '0.0.0.0';
    
    this.pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT) || 5432,
      database: process.env.DB_NAME || 'cost_engine',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD,
      ssl: process.env.DB_SSL === 'true',
      max: 10
    });

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware
   */
  setupMiddleware() {
    this.app.use(express.json());
    
    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      next();
    });

    // Request logging
    this.app.use((req, res, next) => {
      logger.debug('Request', {
        method: req.method,
        path: req.path,
        ip: req.ip
      });
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Per-tenant P&L
    this.app.get('/api/pnl/:tenant', async (req, res) => {
      try {
        const { tenant } = req.params;
        const period = req.query.period || '30d';
        
        const pnl = await this.getTenantPnL(tenant, period);
        res.json(pnl);
      } catch (error) {
        logger.error('Failed to get P&L', {
          tenant: req.params.tenant,
          error: error.message
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Gross margin trends
    this.app.get('/api/margins', async (req, res) => {
      try {
        const period = req.query.period || '30d';
        const tenant = req.query.tenant;
        
        const margins = await this.getGrossMargins(period, tenant);
        res.json(margins);
      } catch (error) {
        logger.error('Failed to get margins', {
          error: error.message
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Anomaly ledger
    this.app.get('/api/anomalies', async (req, res) => {
      try {
        const status = req.query.status;
        const tenant = req.query.tenant;
        const limit = parseInt(req.query.limit) || 100;
        
        const anomalies = await this.getAnomalies(status, tenant, limit);
        res.json(anomalies);
      } catch (error) {
        logger.error('Failed to get anomalies', {
          error: error.message
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Top drains
    this.app.get('/api/drains', async (req, res) => {
      try {
        const period = req.query.period || '7d';
        const limit = parseInt(req.query.limit) || 10;
        
        const drains = await this.getTopDrains(period, limit);
        res.json(drains);
      } catch (error) {
        logger.error('Failed to get top drains', {
          error: error.message
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Action approval
    this.app.post('/api/actions/:id/approve', async (req, res) => {
      try {
        const { id } = req.params;
        
        const action = await this.approveAction(id);
        res.json(action);
      } catch (error) {
        logger.error('Failed to approve action', {
          id: req.params.id,
          error: error.message
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Action rollback
    this.app.post('/api/actions/:id/rollback', async (req, res) => {
      try {
        const { id } = req.params;
        
        const action = await this.rollbackAction(id);
        res.json(action);
      } catch (error) {
        logger.error('Failed to rollback action', {
          id: req.params.id,
          error: error.message
        });
        res.status(500).json({ error: 'Internal server error' });
      }
    });
  }

  /**
   * Get per-tenant P&L
   */
  async getTenantPnL(tenantId, period) {
    const days = parseInt(period.replace('d', ''));
    
    const result = await this.pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN source = 'revenue' THEN cost_usd ELSE 0 END), 0) as mrr,
        COALESCE(SUM(CASE WHEN source = 'workers' THEN cost_usd ELSE 0 END), 0) as workers_cost,
        COALESCE(SUM(CASE WHEN source = 'r2' THEN cost_usd ELSE 0 END), 0) as r2_cost,
        COALESCE(SUM(CASE WHEN source = 'egress' THEN cost_usd ELSE 0 END), 0) as egress_cost,
        COALESCE(SUM(CASE WHEN source = 'tsa' THEN cost_usd ELSE 0 END), 0) as tsa_cost,
        COALESCE(SUM(CASE WHEN source = 'logpush' THEN cost_usd ELSE 0 END), 0) as logpush_cost
      FROM cost_allocations
      WHERE tenant_id = $1
        AND allocated_at >= NOW() - INTERVAL '${days} days'
    `, [tenantId]);

    const row = result.rows[0];
    const mrr = parseFloat(row.mrr) || 0;
    const cogs = {
      workers: parseFloat(row.workers_cost) || 0,
      r2: parseFloat(row.r2_cost) || 0,
      egress: parseFloat(row.egress_cost) || 0,
      tsa: parseFloat(row.tsa_cost) || 0,
      logpush: parseFloat(row.logpush_cost) || 0
    };
    const totalCogs = Object.values(cogs).reduce((sum, cost) => sum + cost, 0);
    const gm = mrr - totalCogs;
    const gmPct = mrr > 0 ? (gm / mrr) * 100 : 0;

    return {
      tenant_id: tenantId,
      period,
      mrr: mrr.toFixed(2),
      cogs,
      gross_margin: gm.toFixed(2),
      gm_pct: gmPct.toFixed(1)
    };
  }

  /**
   * Get gross margin trends
   */
  async getGrossMargins(period, tenantId = null) {
    const days = parseInt(period.replace('d', ''));
    
    const whereClause = tenantId ? 'AND tenant_id = $2' : '';
    const params = tenantId ? [days, tenantId] : [days];
    
    const result = await this.pool.query(`
      SELECT
        DATE(allocated_at) as date,
        tenant_id,
        SUM(CASE WHEN source = 'revenue' THEN cost_usd ELSE -cost_usd END) as gross_margin
      FROM cost_allocations
      WHERE allocated_at >= NOW() - INTERVAL '$1 days'
        ${whereClause}
      GROUP BY DATE(allocated_at), tenant_id
      ORDER BY date DESC
    `, params);

    return result.rows.map(row => ({
      date: row.date,
      tenant_id: row.tenant_id,
      gross_margin: parseFloat(row.gross_margin)
    }));
  }

  /**
   * Get anomalies
   */
  async getAnomalies(status, tenantId, limit) {
    let whereClause = '1=1';
    const params = [];
    let paramCount = 1;

    if (status) {
      whereClause += ` AND status = $${paramCount}`;
      params.push(status);
      paramCount++;
    }

    if (tenantId) {
      whereClause += ` AND tenant_id = $${paramCount}`;
      params.push(tenantId);
      paramCount++;
    }

    params.push(limit);

    const result = await this.pool.query(`
      SELECT
        id,
        tenant_id,
        kind,
        route,
        delta_pct,
        impact_usd_day,
        confidence,
        evidence,
        proposed,
        status,
        detected_at,
        resolved_at
      FROM anomalies
      WHERE ${whereClause}
      ORDER BY detected_at DESC
      LIMIT $${paramCount}
    `, params);

    return result.rows.map(row => ({
      id: row.id,
      tenant_id: row.tenant_id,
      kind: row.kind,
      route: row.route,
      delta_pct: parseFloat(row.delta_pct),
      impact_usd_day: parseFloat(row.impact_usd_day),
      confidence: parseFloat(row.confidence),
      evidence: row.evidence,
      proposed: row.proposed,
      status: row.status,
      detected_at: row.detected_at,
      resolved_at: row.resolved_at
    }));
  }

  /**
   * Get top cost drains
   */
  async getTopDrains(period, limit) {
    const days = parseInt(period.replace('d', ''));
    
    const result = await this.pool.query(`
      SELECT
        'tsa_per_1k_assets' as metric,
        tenant_id,
        (COUNT(*) / NULLIF(COUNT(DISTINCT asset_id), 0)) * 1000 as value
      FROM timestamps
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY tenant_id
      ORDER BY value DESC
      LIMIT $1
    `, [limit]);

    return result.rows.map(row => ({
      metric: row.metric,
      tenant_id: row.tenant_id,
      value: parseFloat(row.value)
    }));
  }

  /**
   * Approve action
   */
  async approveAction(actionId) {
    const result = await this.pool.query(`
      UPDATE actions
      SET status = 'approved', applied_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [actionId]);

    if (result.rows.length === 0) {
      throw new Error('Action not found');
    }

    return result.rows[0];
  }

  /**
   * Rollback action
   */
  async rollbackAction(actionId) {
    const result = await this.pool.query(`
      UPDATE actions
      SET status = 'rolled_back', rolled_back_at = NOW()
      WHERE id = $1
      RETURNING *
    `, [actionId]);

    if (result.rows.length === 0) {
      throw new Error('Action not found');
    }

    return result.rows[0];
  }

  /**
   * Start server
   */
  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, this.host, () => {
        logger.info('Dashboard server started', {
          host: this.host,
          port: this.port
        });
        resolve();
      });
    });
  }

  /**
   * Stop server
   */
  async stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          logger.info('Dashboard server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }
}

export default DashboardServer;
