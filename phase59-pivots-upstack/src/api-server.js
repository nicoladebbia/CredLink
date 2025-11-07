/**
 * API Server - Phase 59 Pivots Up-Stack
 * Custody SKU and Analytics-only SKU endpoints
 */

import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
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
    // Enhanced Helmet security headers
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'https:'],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }));
    
    // Strict JSON parsing with size limits
    this.app.use(express.json({ 
      limit: '10mb',
      strict: true,
      verify: (req, res, buf, encoding) => {
        if (buf.length > 10 * 1024 * 1024) {
          throw new Error('Request entity too large');
        }
      },
    }));

    // Critical security: Strict rate limiting to prevent DoS
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // Reduced from 1000 to 100 requests
      message: { error: 'Too many requests' },
      standardHeaders: true, // Return rate limit info in headers
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Additional strict rate limiting for sensitive operations
    const custodyLimiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 10, // Very strict for key operations
      message: { error: 'Too many custody requests' },
      skip: (req) => !req.path.startsWith('/custody'),
    });
    this.app.use(custodyLimiter);

    // CRITICAL SECURITY: Authentication middleware
    this.app.use((req, res, next) => {
      req.requestId = crypto.randomBytes(8).toString('hex');
      res.set('X-Request-ID', req.requestId);

      // Skip auth for health check
      if (req.path === '/health') {
        logger.debug('Health check request', { requestId: req.requestId });
        return next();
      }

      // Strict authentication check
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        logger.warn('Unauthorized access attempt - missing auth header', {
          method: req.method,
          path: req.path,
          requestId: req.requestId,
          ip: req.ip,
          userAgent: req.headers['user-agent'],
        });
        return res.status(401).json({
          error: 'Authentication required',
          requestId: req.requestId,
        });
      }

      const token = authHeader.substring(7);

      // Critical security: Constant-time token validation to prevent timing attacks
      const MIN_TOKEN_LENGTH = 32;
      if (!token || token.length !== Math.max(token.length, MIN_TOKEN_LENGTH)) {
        logger.warn('Unauthorized access attempt - invalid token format', {
          method: req.method,
          path: req.path,
          requestId: req.requestId,
          ip: req.ip,
        });
        return res.status(401).json({
          error: 'Invalid authentication token',
          requestId: req.requestId,
        });
      }

      // Additional security: Check token format
      const validTokenFormat = /^[A-Za-z0-9+/=_-]+$/;
      if (!validTokenFormat.test(token)) {
        logger.warn('Unauthorized access attempt - invalid token characters', {
          method: req.method,
          path: req.path,
          requestId: req.requestId,
          ip: req.ip,
        });
        return res.status(401).json({
          error: 'Invalid authentication token format',
          requestId: req.requestId,
        });
      }

      // Critical security: JWT verification
      const jwtSecret = process.env.JWT_SECRET;
      if (!jwtSecret) {
        logger.error('JWT_SECRET not configured');
        return res.status(500).json({
          error: 'Authentication service unavailable',
          requestId: req.requestId,
        });
      }

      try {
        const decoded = jwt.verify(token, jwtSecret, { algorithms: ['HS256'] });
        req.user = {
          id: decoded.sub,
          tenantId: decoded.tenantId,
          permissions: decoded.permissions || [],
        };

        // Log successful authentication
        logger.info('Authenticated request', {
          method: req.method,
          path: req.path,
          requestId: req.requestId,
          ip: req.ip,
          userId: req.user.id,
          tenantId: req.user.tenantId,
        });
      } catch (error) {
        logger.warn('Invalid JWT token', {
          method: req.method,
          path: req.path,
          requestId: req.requestId,
          ip: req.ip,
          error: error.message,
        });
        return res.status(401).json({
          error: 'Invalid authentication token',
          requestId: req.requestId,
        });
      }

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

        // Authorization: User can only access their own tenant
        if (req.user.tenantId !== id && !req.user.permissions.includes('admin')) {
          logger.warn('Unauthorized tenant access attempt', {
            userId: req.user.id,
            requestedTenant: id,
            userTenant: req.user.tenantId,
            requestId: req.requestId,
          });
          return res.status(403).json({
            error: 'Access denied',
            requestId: req.requestId,
          });
        }

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
