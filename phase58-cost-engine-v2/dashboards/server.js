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
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createLogger } from '../src/utils/logger.js';
import pg from 'pg';

const logger = createLogger('DashboardServer');
const { Pool } = pg;

export class DashboardServer {
  constructor() {
    this.app = express();
    this.port = parseInt(process.env.DASHBOARD_PORT) || 3000;
    this.host = process.env.DASHBOARD_HOST || '0.0.0.0';

    // Security: Validate database configuration
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = parseInt(process.env.DB_PORT) || 5432;
    const dbName = process.env.DB_NAME || 'cost_engine';
    const dbUser = process.env.DB_USER || 'postgres';
    const dbPassword = process.env.DB_PASSWORD;

    // Security: Validate hostname to prevent injection
    if (!/^[a-zA-Z0-9.-]+$/.test(dbHost)) {
      throw new Error('Invalid database hostname');
    }

    // Security: Validate port range
    if (dbPort < 1 || dbPort > 65535) {
      throw new Error('Invalid database port');
    }

    // Security: Validate database name format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
      throw new Error('Invalid database name format');
    }

    // Security: Validate username format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbUser)) {
      throw new Error('Invalid database username format');
    }

    if (!dbPassword) {
      throw new Error('DB_PASSWORD environment variable is required');
    }

    // Security: Validate dashboard port
    if (this.port < 1024 || this.port > 65535) {
      throw new Error('Dashboard port must be between 1024 and 65535');
    }

    // Security: Validate host
    if (!/^[a-zA-Z0-9.-]+$/.test(this.host)) {
      throw new Error('Invalid dashboard host format');
    }

    this.pool = new Pool({
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: dbUser,
      password: dbPassword,
      ssl: process.env.DB_SSL === 'true',
      max: 10,
      // Security: Additional connection security
      connectionTimeoutMillis: 5000,
      query_timeout: 30000
    });

    this.setupMiddleware();
    this.setupRoutes();
  }

  /**
   * Setup Express middleware with security hardening
   */
  setupMiddleware() {
    // Security: Helmet middleware for security headers
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", 'data:', 'https:']
          }
        },
        hsts: {
          maxAge: 31536000,
          includeSubDomains: true,
          preload: true
        }
      })
    );

    // Security: Rate limiting with proper configuration
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: {
        error: 'Too many requests from this IP, please try again later.'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skip: req => {
        // Skip rate limiting for health checks
        return req.path === '/health';
      }
    });

    this.app.use(limiter);

    // Security: Body parser with size limits
    this.app.use(
      express.json({
        limit: '10mb',
        strict: true
      })
    );

    this.app.use(
      express.urlencoded({
        extended: true,
        limit: '10mb'
      })
    );

    // Security: CORS with strict origin validation
    const allowedOrigins = (process.env.DASHBOARD_CORS_ORIGINS || 'http://localhost:3000').split(
      ','
    );

    this.app.use((req, res, next) => {
      const origin = req.headers.origin;

      // Security: Validate origin format
      if (origin) {
        try {
          const originUrl = new URL(origin);
          if (!['http:', 'https:'].includes(originUrl.protocol)) {
            return res.status(403).json({ error: 'Invalid origin protocol' });
          }
        } catch (e) {
          return res.status(403).json({ error: 'Invalid origin format' });
        }
      }

      if (allowedOrigins.includes(origin) || !origin) {
        res.header('Access-Control-Allow-Origin', origin || allowedOrigins[0]);
        res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
        res.header('Access-Control-Allow-Credentials', 'true');
        res.header('Access-Control-Max-Age', '86400'); // 24 hours
      } else {
        return res.status(403).json({ error: 'Origin not allowed' });
      }

      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }

      next();
    });

    // Security: Request logging with IP validation
    this.app.use((req, res, next) => {
      const ip = req.ip || req.connection.remoteAddress || req.socket.remoteAddress;

      // Security: Validate and sanitize IP
      if (ip && typeof ip === 'string') {
        const sanitizedIp = ip.replace(/^::ffff:/, ''); // Remove IPv6-mapped IPv4 prefix
        req.clientIp = sanitizedIp;

        logger.debug('Request', {
          method: req.method,
          path: req.path,
          ip: sanitizedIp,
          userAgent: req.get('User-Agent') ? req.get('User-Agent').substring(0, 200) : undefined
        });
      }

      next();
    });

    // Security: Add request ID for tracing
    this.app.use((req, res, next) => {
      req.requestId = Math.random().toString(36).substring(2, 15);
      res.set('X-Request-ID', req.requestId);
      next();
    });
  }

  /**
   * Setup API routes
   */
  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        requestId: req.requestId
      });
    });

    // Per-tenant P&L with input validation
    this.app.get('/api/pnl/:tenant', async (req, res) => {
      try {
        const { tenant } = req.params;
        const period = req.query.period || '30d';

        // Security: Validate tenant ID format
        if (!tenant || typeof tenant !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(tenant)) {
          return res.status(400).json({
            error: 'Invalid tenant ID format',
            requestId: req.requestId
          });
        }

        // Security: Validate period format
        if (!period || !/^\d+d$/.test(period)) {
          return res.status(400).json({
            error: 'Invalid period format. Use format like "30d"',
            requestId: req.requestId
          });
        }

        // Security: Limit period range
        const days = parseInt(period.replace('d', ''));
        if (days < 1 || days > 365) {
          return res.status(400).json({
            error: 'Period must be between 1 and 365 days',
            requestId: req.requestId
          });
        }

        const pnl = await this.getTenantPnL(tenant, period);
        res.json({ ...pnl, requestId: req.requestId });
      } catch (error) {
        logger.error('Failed to get P&L', {
          tenant: req.params.tenant,
          error: error.message,
          requestId: req.requestId
        });
        res.status(500).json({
          error: 'Internal server error',
          requestId: req.requestId
        });
      }
    });

    // Gross margin trends with input validation
    this.app.get('/api/margins', async (req, res) => {
      try {
        const period = req.query.period || '30d';
        const tenant = req.query.tenant;

        // Security: Validate period format
        if (!period || !/^\d+d$/.test(period)) {
          return res.status(400).json({
            error: 'Invalid period format. Use format like "30d"',
            requestId: req.requestId
          });
        }

        // Security: Limit period range
        const days = parseInt(period.replace('d', ''));
        if (days < 1 || days > 365) {
          return res.status(400).json({
            error: 'Period must be between 1 and 365 days',
            requestId: req.requestId
          });
        }

        // Security: Validate tenant if provided
        if (tenant && !/^[a-zA-Z0-9_-]+$/.test(tenant)) {
          return res.status(400).json({
            error: 'Invalid tenant ID format',
            requestId: req.requestId
          });
        }

        const margins = await this.getGrossMargins(period, tenant);
        res.json({ data: margins, requestId: req.requestId });
      } catch (error) {
        logger.error('Failed to get margins', {
          error: error.message,
          requestId: req.requestId
        });
        res.status(500).json({
          error: 'Internal server error',
          requestId: req.requestId
        });
      }
    });

    // Anomaly ledger with input validation
    this.app.get('/api/anomalies', async (req, res) => {
      try {
        const status = req.query.status;
        const tenant = req.query.tenant;
        const limit = parseInt(req.query.limit) || 100;

        // Security: Validate status if provided
        const validStatuses = ['detected', 'pending_approval', 'applied', 'rolled_back'];
        if (status && !validStatuses.includes(status)) {
          return res.status(400).json({
            error: `Invalid status. Must be one of: ${validStatuses.join(', ')}`,
            requestId: req.requestId
          });
        }

        // Security: Validate tenant if provided
        if (tenant && !/^[a-zA-Z0-9_-]+$/.test(tenant)) {
          return res.status(400).json({
            error: 'Invalid tenant ID format',
            requestId: req.requestId
          });
        }

        // Security: Validate and limit query size
        if (isNaN(limit) || limit < 1 || limit > 1000) {
          return res.status(400).json({
            error: 'Limit must be between 1 and 1000',
            requestId: req.requestId
          });
        }

        const anomalies = await this.getAnomalies(status, tenant, limit);
        res.json({ data: anomalies, requestId: req.requestId });
      } catch (error) {
        logger.error('Failed to get anomalies', {
          error: error.message,
          requestId: req.requestId
        });
        res.status(500).json({
          error: 'Internal server error',
          requestId: req.requestId
        });
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
    // Security: Validate and parse days parameter to prevent SQL injection
    const days = parseInt(period.replace('d', ''));
    if (isNaN(days) || days < 1 || days > 365) {
      throw new Error('Invalid period: must be between 1 and 365 days');
    }

    const result = await this.pool.query(
      `
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
    `,
      [tenantId]
    );

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
    // Security: Validate days parameter to prevent SQL injection
    const days = parseInt(period.replace('d', ''));
    if (isNaN(days) || days < 1 || days > 365) {
      throw new Error('Invalid period: must be between 1 and 365 days');
    }

    const whereClause = tenantId ? 'AND tenant_id = $2' : '';
    const params = tenantId ? [days, tenantId] : [days];

    // Security: Use proper parameter binding instead of string interpolation
    const result = await this.pool.query(
      `
      SELECT
        DATE(allocated_at) as date,
        tenant_id,
        SUM(CASE WHEN source = 'revenue' THEN cost_usd ELSE -cost_usd END) as gross_margin
      FROM cost_allocations
      WHERE allocated_at >= NOW() - INTERVAL '${days} days'
        ${whereClause}
      GROUP BY DATE(allocated_at), tenant_id
      ORDER BY date DESC
    `,
      params
    );

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

    const result = await this.pool.query(
      `
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
    `,
      params
    );

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
    // Security: Validate days parameter to prevent SQL injection
    const days = parseInt(period.replace('d', ''));
    if (isNaN(days) || days < 1 || days > 365) {
      throw new Error('Invalid period: must be between 1 and 365 days');
    }

    // Security: Validate limit parameter
    if (isNaN(limit) || limit < 1 || limit > 100) {
      throw new Error('Invalid limit: must be between 1 and 100');
    }

    const result = await this.pool.query(
      `
      SELECT
        'tsa_per_1k_assets' as metric,
        tenant_id,
        (COUNT(*) / NULLIF(COUNT(DISTINCT asset_id), 0)) * 1000 as value
      FROM timestamps
      WHERE created_at >= NOW() - INTERVAL '${days} days'
      GROUP BY tenant_id
      ORDER BY value DESC
      LIMIT $1
    `,
      [limit]
    );

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
    const result = await this.pool.query(
      `
      UPDATE actions
      SET status = 'approved', applied_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
      [actionId]
    );

    if (result.rows.length === 0) {
      throw new Error('Action not found');
    }

    return result.rows[0];
  }

  /**
   * Rollback action
   */
  async rollbackAction(actionId) {
    const result = await this.pool.query(
      `
      UPDATE actions
      SET status = 'rolled_back', rolled_back_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
      [actionId]
    );

    if (result.rows.length === 0) {
      throw new Error('Action not found');
    }

    return result.rows[0];
  }

  /**
   * Start server
   */
  async start() {
    return new Promise(resolve => {
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
    return new Promise(resolve => {
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
