/**
 * API Server - Phase 59 Pivots Up-Stack
 * Custody SKU and Analytics-only SKU endpoints
 */

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { createLogger } from './utils/logger.js';
import { CustodyService } from '../custody/custody-service.js';
import { AnalyticsService } from '../analytics/analytics-service.js';

const logger = createLogger('APIServer');

export class APIServer {
  constructor() {
    this.app = express();
    this.port = parseInt(process.env.API_PORT) || 4000;
    this.custodyService = new CustodyService();
    this.analyticsService = new AnalyticsService();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(express.json({ limit: '10mb' }));

    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 1000,
      message: { error: 'Too many requests' },
    });
    this.app.use(limiter);

    this.app.use((req, res, next) => {
      req.requestId = Math.random().toString(36).substring(2, 15);
      res.set('X-Request-ID', req.requestId);
      logger.debug('Request', { method: req.method, path: req.path, requestId: req.requestId });
      next();
    });
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Custody endpoints
    this.app.post('/custody/tenants/:id/keys', async (req, res) => {
      try {
        const { id } = req.params;
        const { mode, rotation, region } = req.body;

        if (!mode || !['aws-kms', 'cloudhsm', 'yubihsm2'].includes(mode)) {
          return res.status(400).json({
            error: 'Invalid mode. Must be: aws-kms, cloudhsm, or yubihsm2',
            requestId: req.requestId,
          });
        }

        const result = await this.custodyService.provisionTenantKey(id, { mode, rotation, region });
        res.status(201).json(result);
      } catch (error) {
        logger.error('Failed to provision key', { error: error.message, requestId: req.requestId });
        res.status(500).json({ error: error.message, requestId: req.requestId });
      }
    });

    this.app.post('/custody/rotate', async (req, res) => {
      try {
        const { tenant, key_id, reason } = req.body;

        if (!tenant || !key_id) {
          return res
            .status(400)
            .json({ error: 'tenant and key_id required', requestId: req.requestId });
        }

        const result = await this.custodyService.rotateKey(tenant, key_id, reason);
        res.json(result);
      } catch (error) {
        logger.error('Failed to rotate key', { error: error.message, requestId: req.requestId });
        res.status(500).json({ error: error.message, requestId: req.requestId });
      }
    });

    this.app.get('/custody/evidence-packs', async (req, res) => {
      try {
        const { tenant, period } = req.query;

        if (!tenant) {
          return res.status(400).json({ error: 'tenant required', requestId: req.requestId });
        }

        const result = await this.custodyService.getEvidencePacks(tenant, period);
        res.json(result);
      } catch (error) {
        logger.error('Failed to get evidence packs', {
          error: error.message,
          requestId: req.requestId,
        });
        res.status(500).json({ error: error.message, requestId: req.requestId });
      }
    });

    // Analytics endpoints
    this.app.post('/ingest/verify', async (req, res) => {
      try {
        const { source, asset_id, result, manifest, provider, ts } = req.body;

        if (!source || !asset_id || !result || !manifest) {
          return res.status(400).json({
            error: 'source, asset_id, result, and manifest required',
            requestId: req.requestId,
          });
        }

        const ingestResult = await this.analyticsService.ingestVerifyResult(req.body);
        res.status(201).json(ingestResult);
      } catch (error) {
        logger.error('Failed to ingest verify result', {
          error: error.message,
          requestId: req.requestId,
        });
        res.status(500).json({ error: error.message, requestId: req.requestId });
      }
    });

    this.app.get('/analytics/survival', async (req, res) => {
      try {
        const { tenant, period } = req.query;

        if (!tenant) {
          return res.status(400).json({ error: 'tenant required', requestId: req.requestId });
        }

        const result = await this.analyticsService.getSurvivalAnalytics(tenant, period);
        res.json(result);
      } catch (error) {
        logger.error('Failed to get survival analytics', {
          error: error.message,
          requestId: req.requestId,
        });
        res.status(500).json({ error: error.message, requestId: req.requestId });
      }
    });

    this.app.get('/compliance/pack', async (req, res) => {
      try {
        const { tenant, period, regions } = req.query;

        if (!tenant || !period) {
          return res
            .status(400)
            .json({ error: 'tenant and period required', requestId: req.requestId });
        }

        const result = await this.analyticsService.getCompliancePack(tenant, period, regions);
        res.json(result);
      } catch (error) {
        logger.error('Failed to get compliance pack', {
          error: error.message,
          requestId: req.requestId,
        });
        res.status(500).json({ error: error.message, requestId: req.requestId });
      }
    });

    this.app.get('/analytics/breakage', async (req, res) => {
      try {
        const { tenant, period } = req.query;

        if (!tenant) {
          return res.status(400).json({ error: 'tenant required', requestId: req.requestId });
        }

        const result = await this.analyticsService.getBreakageAnalysis(tenant, period);
        res.json(result);
      } catch (error) {
        logger.error('Failed to get breakage analysis', {
          error: error.message,
          requestId: req.requestId,
        });
        res.status(500).json({ error: error.message, requestId: req.requestId });
      }
    });
  }

  async start() {
    return new Promise((resolve) => {
      this.server = this.app.listen(this.port, () => {
        logger.info('API Server started', { port: this.port });
        resolve();
      });
    });
  }

  async stop() {
    if (this.server) {
      return new Promise((resolve) => {
        this.server.close(() => {
          logger.info('API Server stopped');
          resolve();
        });
      });
    }
  }
}
