# Collision Scanning API and Events Implementation

## Overview
RESTful API and event-driven architecture for collision scanning, real-time notifications, and webhook integrations. Provides comprehensive endpoints for asset submission, collision queries, disposition management, and system monitoring.

## Dependencies
```json
{
  "dependencies": {
    "express": "^4.18.2",
    "cors": "^2.8.5",
    "helmet": "^7.1.0",
    "express-rate-limit": "^7.1.5",
    "express-validator": "^7.0.1",
    "jsonwebtoken": "^9.0.2",
    "bcrypt": "^5.1.1",
    "multer": "^1.4.5-lts.1",
    "axios": "^1.6.2",
    "node-cron": "^3.0.3",
    "ws": "^8.14.2",
    "eventemitter3": "^5.0.1",
    "zod": "^3.22.4",
    "openapi3-ts": "^4.2.0",
    "express-mongo-sanitize": "^2.2.0",
    "xss": "^1.0.14",
    "express-slow-down": "^2.0.1"
  }
}
```

## Core Implementation

### API Configuration
```typescript
export interface APIConfig {
  // Server Configuration
  server: {
    port: number;
    host: string;
    cors: {
      enabled: boolean;
      origins: string[];
      credentials: boolean;
    };
    rateLimit: {
      enabled: boolean;
      windowMs: number;
      max: number;
      skipSuccessfulRequests: boolean;
    };
    compression: boolean;
    trustProxy: boolean;
    keepAliveTimeout: number;
    headersTimeout: number;
  };
  
  // Authentication Configuration
  auth: {
    enabled: boolean;
    jwt: {
      secret: string;
      expiresIn: string;
      algorithm: string;
      issuer: string;
      audience: string;
    };
    apiKey: {
      enabled: boolean;
      headerName: string;
      length: number;
    };
    oauth: {
      enabled: boolean;
      providers: string[];
      scopes: string[];
    };
  };
  
  // API Configuration
  api: {
    version: string;
    prefix: string;
    documentation: {
      enabled: boolean;
      path: string;
      security: boolean;
    };
    validation: {
      strict: boolean;
      sanitize: boolean;
      customValidators: boolean;
    };
    pagination: {
      defaultLimit: number;
      maxLimit: number;
    };
  };
  
  // Webhook Configuration
  webhooks: {
    enabled: boolean;
    timeout: number;
    retries: number;
    retryDelay: number;
    batchSize: number;
    events: string[];
    signatureSecret: string;
  };
  
  // Events Configuration
  events: {
    websocket: {
      enabled: boolean;
      path: string;
      heartbeat: number;
      maxConnections: number;
      compression: boolean;
    };
    streaming: {
      enabled: boolean;
      bufferSize: number;
      flushInterval: number;
      maxBacklog: number;
    };
    persistence: {
      enabled: boolean;
      retention: number;
      compression: boolean;
    };
  };
  
  // Security Configuration
  security: {
    helmet: boolean;
    csrfProtection: boolean;
    xssProtection: boolean;
    sqlInjectionProtection: boolean;
    requestSizeLimit: number;
    responseHeaders: boolean;
  };
}

export interface CollisionAPIRequest {
  tenantId: string;
  assetId: string;
  imageUrl: string;
  manifestUrl: string;
  metadata?: Record<string, any>;
  options?: {
    priority?: 'low' | 'normal' | 'high' | 'critical';
    webhookUrl?: string;
    callbackUrl?: string;
    sensitivity?: number;
    includeCrossTenant?: boolean;
    timeout?: number;
    retryCount?: number;
  };
}

export interface CollisionAPIResponse {
  requestId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metadata: {
    submittedAt: Date;
    estimatedCompletion?: Date;
    actualCompletion?: Date;
    processingTime?: number;
    retryCount?: number;
  };
  results?: {
    collisions: CollisionResult[];
    totalFound: number;
    processedAt: Date;
  };
  errors?: Array<{
    code: string;
    message: string;
    timestamp: Date;
  }>;
}

export interface CollisionResult {
  assetId: string;
  similarity: number;
  confidence: number;
  matchType: 'pdq' | 'embedding' | 'ensemble';
  metadata: {
    matchedAt: Date;
    algorithm: string;
    threshold: number;
  };
}

export interface WebhookEvent {
  id: string;
  type: 'collision_detected' | 'processing_started' | 'processing_completed' | 'error' | 'disposition_updated';
  tenantId: string;
  timestamp: Date;
  data: any;
  retryCount: number;
  scheduledFor: Date;
}
```

### Collision API Server
```typescript
import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { body, validationResult, param } from 'express-validator';
import jwt from 'jsonwebtoken';
import multer from 'multer';
import { EventEmitter } from 'eventemitter3';
import { WebSocketServer } from 'ws';
import pino from 'pino';

export class CollisionAPIServer {
  private config: APIConfig;
  private app: Application;
  private server: any;
  private wsServer: WebSocketServer;
  private eventEmitter: EventEmitter;
  private logger: pino.Logger;
  private collisionDetector: CollisionDetectionEngine;
  private storage: UnifiedStorageManager;

  constructor(
    config: APIConfig,
    collisionDetector: CollisionDetectionEngine,
    storage: UnifiedStorageManager
  ) {
    this.config = config;
    this.app = express();
    this.eventEmitter = new EventEmitter();
    this.logger = pino({ level: 'info' });
    this.collisionDetector = collisionDetector;
    this.storage = storage;

    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
    this.setupWebSocket();
    this.setupEventHandlers();
  }

  /**
   * Start API server
   */
  async start(): Promise<void> {
    try {
      this.server = this.app.listen(this.config.server.port, this.config.server.host);
      
      this.logger.info({
        port: this.config.server.port,
        host: this.config.server.host
      }, 'Collision API server started');

      // Start webhook processing
      if (this.config.webhooks.enabled) {
        await this.startWebhookProcessor();
      }

      // Start event streaming
      if (this.config.events.streaming.enabled) {
        await this.startEventStreaming();
      }

    } catch (error) {
      throw new Error(`API server start failed: ${error.message}`);
    }
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS
    if (this.config.server.cors.enabled) {
      this.app.use(cors({
        origin: this.config.server.cors.origins,
        credentials: true
      }));
    }

    // Rate limiting
    if (this.config.server.rateLimit.enabled) {
      this.app.use(rateLimit({
        windowMs: this.config.server.rateLimit.windowMs,
        max: this.config.server.rateLimit.max,
        message: 'Too many requests from this IP'
      }));
    }

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      this.logger.info({
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }, 'API request');
      next();
    });

    // Authentication middleware
    if (this.config.auth.enabled) {
      this.app.use(this.authenticate.bind(this));
    }
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    const router = express.Router();

    // Health check
    router.get('/health', this.healthCheck.bind(this));

    // Asset submission
    router.post('/assets/submit',
      this.validateAssetSubmission(),
      this.submitAsset.bind(this)
    );

    // Get submission status
    router.get('/assets/:requestId/status',
      this.validateRequestId(),
      this.getSubmissionStatus.bind(this)
    );

    // Get collision results
    router.get('/assets/:requestId/collisions',
      this.validateRequestId(),
      this.getCollisions.bind(this)
    );

    // Submit disposition
    router.post('/collisions/:collisionId/disposition',
      this.validateDisposition(),
      this.submitDisposition.bind(this)
    );

    // Batch operations
    router.post('/batch/submit',
      this.validateBatchSubmission(),
      this.submitBatch.bind(this)
    );

    // Search collisions
    router.get('/collisions/search',
      this.validateSearchQuery(),
      this.searchCollisions.bind(this)
    );

    // Analytics and metrics
    router.get('/analytics/metrics',
      this.getMetrics.bind(this)
    );

    // Webhook management
    router.post('/webhooks/register',
      this.validateWebhookRegistration(),
      this.registerWebhook.bind(this)
    );

    router.delete('/webhooks/:webhookId',
      this.validateWebhookId(),
      this.unregisterWebhook.bind(this)
    );

    // Apply routes with prefix
    this.app.use(this.config.api.prefix, router);

    // API documentation
    if (this.config.api.documentation.enabled) {
      this.setupDocumentation();
    }
  }

  /**
   * Submit asset for collision scanning
   */
  private async submitAsset(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array()
          }
        });
        return;
      }

      const request: CollisionAPIRequest = req.body;
      const requestId = this.generateRequestId();

      // Store request
      await this.storage.storeAPIRequest(requestId, request);

      // Emit processing started event
      this.eventEmitter.emit('processing_started', {
        requestId,
        tenantId: request.tenantId,
        assetId: request.assetId
      });

      // Start async processing
      this.processAssetAsync(requestId, request);

      // Send immediate response
      const response: CollisionAPIResponse = {
        requestId,
        status: 'pending',
        metadata: {
          submittedAt: new Date(),
          estimatedCompletion: new Date(Date.now() + 60000) // 1 minute estimate
        }
      };

      res.status(202).json(response);

    } catch (error) {
      this.logger.error({ error: error.message }, 'Asset submission failed');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  }

  /**
   * Get submission status
   */
  private async getSubmissionStatus(req: Request, res: Response): Promise<void> {
    try {
      const { requestId } = req.params;
      const status = await this.storage.getAPIRequestStatus(requestId);

      if (!status) {
        res.status(404).json({
          error: {
            code: 'NOT_FOUND',
            message: 'Request not found'
          }
        });
        return;
      }

      res.json(status);
    } catch (error) {
      this.logger.error({ error: error.message }, 'Status check failed');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  }

  /**
   * Get collision results
   */
  private async getCollisions(req: Request, res: Response): Promise<void> {
    try {
      const { requestId } = req.params;
      const { limit = 100, offset = 0 } = req.query;

      const collisions = await this.storage.getCollisionsByRequest(
        requestId,
        Number(limit),
        Number(offset)
      );

      res.json({
        requestId,
        collisions,
        totalCollisions: collisions.length,
        metadata: {
          limit: Number(limit),
          offset: Number(offset)
        }
      });
    } catch (error) {
      this.logger.error({ error: error.message }, 'Collision retrieval failed');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  }

  /**
   * Submit disposition for collision
   */
  private async submitDisposition(req: Request, res: Response): Promise<void> {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request parameters',
            details: errors.array()
          }
        });
        return;
      }

      const { collisionId } = req.params;
      const { label, notes, reviewedBy } = req.body;

      // Update collision disposition
      await this.storage.updateCollisionDisposition(collisionId, {
        label,
        notes,
        reviewedBy,
        reviewedAt: new Date()
      });

      // Emit disposition updated event
      this.eventEmitter.emit('disposition_updated', {
        collisionId,
        label,
        reviewedBy,
        timestamp: new Date()
      });

      res.json({
        collisionId,
        status: 'updated',
        disposition: {
          label,
          notes,
          reviewedBy,
          reviewedAt: new Date()
        }
      });
    } catch (error) {
      this.logger.error({ error: error.message }, 'Disposition submission failed');
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    }
  }

  /**
   * Process asset asynchronously
   */
  private async processAssetAsync(requestId: string, request: CollisionAPIRequest): Promise<void> {
    try {
      // Update status to processing
      await this.storage.updateAPIRequestStatus(requestId, 'processing');

      // Emit processing started event
      this.eventEmitter.emit('processing_started', {
        requestId,
        tenantId: request.tenantId,
        assetId: request.assetId
      });

      // Perform collision detection
      const startTime = performance.now();
      const collisions = await this.collisionDetector.detectCollisions({
        tenantId: request.tenantId,
        assetId: request.assetId,
        imageUrl: request.imageUrl,
        manifestUrl: request.manifestUrl,
        options: request.options
      });
      const processingTime = performance.now() - startTime;

      // Store results
      await this.storage.storeCollisionResults(requestId, collisions);

      // Update status to completed
      await this.storage.updateAPIRequestStatus(requestId, 'completed', {
        completedAt: new Date(),
        processingTime
      });

      // Emit collision detected events
      for (const collision of collisions) {
        this.eventEmitter.emit('collision_detected', {
          requestId,
          tenantId: request.tenantId,
          collision,
          timestamp: new Date()
        });
      }

      // Emit processing completed event
      this.eventEmitter.emit('processing_completed', {
        requestId,
        tenantId: request.tenantId,
        totalCollisions: collisions.length,
        processingTime,
        timestamp: new Date()
      });

      // Send webhook if configured
      if (request.options?.webhookUrl) {
        await this.sendWebhook(request.options.webhookUrl, {
          type: 'processing_completed',
          requestId,
          collisions,
          processingTime
        });
      }

    } catch (error) {
      this.logger.error({
        requestId,
        error: error.message
      }, 'Async processing failed');

      // Update status to failed
      await this.storage.updateAPIRequestStatus(requestId, 'failed', {
        error: error.message
      });

      // Emit error event
      this.eventEmitter.emit('error', {
        requestId,
        tenantId: request.tenantId,
        error: error.message,
        timestamp: new Date()
      });
    }
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocket(): void {
    if (!this.config.events.websocket.enabled) {
      return;
    }

    this.wsServer = new WebSocketServer({
      port: this.config.server.port + 1,
      path: this.config.events.websocket.path
    });

    this.wsServer.on('connection', (ws, req) => {
      this.logger.info({
        ip: req.socket.remoteAddress,
        userAgent: req.headers['user-agent']
      }, 'WebSocket client connected');

      // Send heartbeat
      const heartbeat = setInterval(() => {
        ws.ping();
      }, this.config.events.websocket.heartbeat);

      ws.on('message', (message) => {
        try {
          const data = JSON.parse(message.toString());
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
          this.logger.warn({ error: error.message }, 'Invalid WebSocket message');
        }
      });

      ws.on('close', () => {
        clearInterval(heartbeat);
        this.logger.info('WebSocket client disconnected');
      });

      // Subscribe to events
      this.subscribeToEvents(ws);
    });
  }

  /**
   * Setup event handlers
   */
  private setupEventHandlers(): void {
    // Handle collision detected events
    this.eventEmitter.on('collision_detected', async (data) => {
      // Send to WebSocket clients
      this.broadcastToWebSocket('collision_detected', data);

      // Send webhooks
      await this.sendEventWebhooks('collision_detected', data);

      // Store event if persistence is enabled
      if (this.config.events.persistence.enabled) {
        await this.storage.storeEvent('collision_detected', data);
      }
    });

    // Handle other event types
    this.eventEmitter.on('processing_started', (data) => {
      this.broadcastToWebSocket('processing_started', data);
    });

    this.eventEmitter.on('processing_completed', (data) => {
      this.broadcastToWebSocket('processing_completed', data);
    });

    this.eventEmitter.on('error', (data) => {
      this.broadcastToWebSocket('error', data);
    });

    this.eventEmitter.on('disposition_updated', (data) => {
      this.broadcastToWebSocket('disposition_updated', data);
    });
  }

  /**
   * Send webhook
   */
  private async sendWebhook(url: string, data: any): Promise<void> {
    try {
      const axios = require('axios');
      
      await axios.post(url, data, {
        timeout: this.config.webhooks.timeout,
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Collision-API/1.0'
        }
      });

      this.logger.info({ url }, 'Webhook sent successfully');
    } catch (error) {
      this.logger.error({
        url,
        error: error.message
      }, 'Webhook delivery failed');

      // Queue for retry if configured
      if (this.config.webhooks.retries > 0) {
        await this.queueWebhookRetry(url, data, 0);
      }
    }
  }

  /**
   * Queue webhook retry
   */
  private async queueWebhookRetry(
    url: string,
    data: any,
    retryCount: number
  ): Promise<void> {
    if (retryCount >= this.config.webhooks.retries) {
      this.logger.error({
        url,
        retryCount
      }, 'Webhook retry limit exceeded');
      return;
    }

    setTimeout(async () => {
      try {
        await this.sendWebhook(url, data);
      } catch (error) {
        await this.queueWebhookRetry(url, data, retryCount + 1);
      }
    }, this.config.webhooks.retryDelay * Math.pow(2, retryCount));
  }

  /**
   * Broadcast to WebSocket clients
   */
  private broadcastToWebSocket(event: string, data: any): void {
    if (!this.wsServer) {
      return;
    }

    const message = JSON.stringify({ event, data });
    
    this.wsServer.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(message);
      }
    });
  }

  /**
   * Enhanced authentication middleware with security controls
   */
  private authenticate(req: Request, res: Response, next: NextFunction): void {
    const authHeader = req.headers.authorization;
    const clientIP = req.ip || req.connection.remoteAddress;
    
    // SECURITY: Log authentication attempts
    this.logger.info({ 
      ip: clientIP,
      userAgent: req.headers['user-agent'],
      path: req.path 
    }, 'Authentication attempt');

    if (!authHeader) {
      // SECURITY: Rate limit failed auth attempts
      this.recordFailedAuth(clientIP);
      res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required'
        }
      });
      return;
    }

    // SECURITY: Validate authorization header format
    if (!authHeader.startsWith('Bearer ')) {
      this.recordFailedAuth(clientIP);
      res.status(401).json({
        error: {
          code: 'INVALID_AUTH_FORMAT',
          message: 'Invalid authorization header format'
        }
      });
      return;
    }

    try {
      const token = authHeader.substring(7); // Remove 'Bearer ' prefix
      
      // SECURITY: Validate token format and length
      if (!token || token.length < 10 || token.length > 1000) {
        throw new Error('Invalid token format');
      }

      // SECURITY: Enhanced JWT verification with claims validation
      const decoded = jwt.verify(token, this.config.auth.jwt.secret, {
        algorithms: ['HS256'],
        clockTolerance: 30, // 30 seconds clock skew tolerance
        maxAge: '1h' // Token expires after 1 hour
      }) as any;

      // SECURITY: Validate required claims
      if (!decoded.sub || !decoded.iss || !decoded.aud) {
        throw new Error('Missing required JWT claims');
      }

      // SECURITY: Validate issuer and audience
      if (decoded.iss !== this.config.auth.jwt.issuer) {
        throw new Error('Invalid token issuer');
      }

      if (!Array.isArray(decoded.aud) || !decoded.aud.includes(this.config.auth.jwt.audience)) {
        throw new Error('Invalid token audience');
      }

      // SECURITY: Check if token is revoked (implement token blacklist)
      if (this.isTokenRevoked(token)) {
        throw new Error('Token has been revoked');
      }

      // SECURITY: Add security context to request
      (req as any).user = {
        id: decoded.sub,
        tenantId: decoded.tenantId,
        roles: decoded.roles || [],
        permissions: decoded.permissions || [],
        authTime: decoded.iat,
        tokenHash: this.hashToken(token)
      };

      // SECURITY: Rate limit successful auth per user
      this.recordSuccessfulAuth(decoded.sub, clientIP);
      
      next();
    } catch (error) {
      this.recordFailedAuth(clientIP);
      this.logger.warn({ 
        ip: clientIP, 
        error: error.message,
        userAgent: req.headers['user-agent']
      }, 'Authentication failed');
      
      res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'Invalid authentication token'
        }
      });
    }
  }

  /**
   * Authorization middleware with role-based access control
   */
  private authorize(requiredRoles: string[], requiredPermissions: string[]) {
    return (req: Request, res: Response, next: NextFunction): void => {
      const user = (req as any).user;
      
      if (!user) {
        res.status(401).json({
          error: {
            code: 'UNAUTHORIZED',
            message: 'Authentication required'
          }
        });
        return;
      }

      // SECURITY: Check required roles
      const hasRequiredRoles = requiredRoles.every(role => 
        user.roles.includes(role) || user.roles.includes('admin')
      );

      // SECURITY: Check required permissions
      const hasRequiredPermissions = requiredPermissions.every(permission =>
        user.permissions.includes(permission) || user.roles.includes('admin')
      );

      if (!hasRequiredRoles || !hasRequiredPermissions) {
        this.logger.warn({
          userId: user.id,
          tenantId: user.tenantId,
          requiredRoles,
          requiredPermissions,
          userRoles: user.roles,
          userPermissions: user.permissions
        }, 'Authorization failed');

        res.status(403).json({
          error: {
            code: 'FORBIDDEN',
            message: 'Insufficient permissions'
          }
        });
        return;
      }

      next();
    };
  }

  /**
   * Rate limiting middleware for API endpoints
   */
  private rateLimit(options: {
    windowMs: number;
    max: number;
    skipSuccessfulRequests?: boolean;
  }) {
    const requests = new Map<string, { count: number; resetTime: number }>();

    return (req: Request, res: Response, next: NextFunction): void => {
      const key = req.ip || req.connection.remoteAddress;
      const now = Date.now();
      const windowStart = now - options.windowMs;

      // Clean up old entries
      for (const [ip, data] of requests.entries()) {
        if (data.resetTime < now) {
          requests.delete(ip);
        }
      }

      const requestData = requests.get(key);
      
      if (!requestData || requestData.resetTime < now) {
        // New window
        requests.set(key, { count: 1, resetTime: now + options.windowMs });
        return next();
      }

      if (requestData.count >= options.max) {
        res.status(429).json({
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Rate limit exceeded',
            retryAfter: Math.ceil((requestData.resetTime - now) / 1000)
          }
        });
        return;
      }

      requestData.count++;
      next();
    };
  }

  /**
   * Check if token is revoked (token blacklist)
   */
  private isTokenRevoked(token: string): boolean {
    // Implementation would check against Redis or database
    // For now, return false (no tokens revoked)
    return false;
  }

  /**
   * Hash token for audit purposes
   */
  private hashToken(token: string): string {
    const crypto = require('crypto');
    return crypto.createHash('sha256').update(token).digest('hex').substring(0, 16);
  }

  /**
   * Record failed authentication attempt
   */
  private recordFailedAuth(ip: string): void {
    // Implementation would record in Redis for rate limiting
    // and alert on suspicious patterns
  }

  /**
   * Record successful authentication
   */
  private recordSuccessfulAuth(userId: string, ip: string): void {
    // Implementation would record for audit and anomaly detection
  }

  /**
   * Validation middleware
   */
  private validateAssetSubmission() {
    return [
      body('tenantId').notEmpty().isString(),
      body('assetId').notEmpty().isString(),
      body('imageUrl').isURL(),
      body('manifestUrl').isURL(),
      body('options.priority').optional().isIn(['low', 'normal', 'high']),
      body('options.webhookUrl').optional().isURL(),
      body('options.sensitivity').optional().isFloat({ min: 0, max: 1 })
    ];
  }

  private validateRequestId() {
    return [
      param('requestId').notEmpty().isUUID()
    ];
  }

  private validateDisposition() {
    return [
      param('collisionId').notEmpty().isUUID(),
      body('label').isIn(['benign_variant', 'suspicious', 'not_similar', 'false_positive']),
      body('notes').optional().isString(),
      body('reviewedBy').notEmpty().isString()
    ];
  }

  private validateBatchSubmission() {
    return [
      body('requests').isArray({ min: 1, max: 100 }),
      body('requests.*.tenantId').notEmpty().isString(),
      body('requests.*.assetId').notEmpty().isString(),
      body('requests.*.imageUrl').isURL(),
      body('requests.*.manifestUrl').isURL()
    ];
  }

  private validateSearchQuery() {
    return [
      body('tenantId').optional().isString(),
      body('dateRange.start').optional().isISO8601(),
      body('dateRange.end').optional().isISO8601(),
      body('limit').optional().isInt({ min: 1, max: 1000 }),
      body('offset').optional().isInt({ min: 0 })
    ];
  }

  private validateWebhookRegistration() {
    return [
      body('url').isURL(),
      body('events').isArray(),
      body('events.*').isString(),
      body('secret').optional().isString()
    ];
  }

  private validateWebhookId() {
    return [
      param('webhookId').notEmpty().isUUID()
    ];
  }

  /**
   * Health check endpoint
   */
  private async healthCheck(req: Request, res: Response): Promise<void> {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: this.config.api.version,
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        services: {
          database: 'healthy', // Would check actual DB connection
          redis: 'healthy',    // Would check actual Redis connection
          collisionDetector: 'healthy'
        }
      };

      res.json(health);
    } catch (error) {
      res.status(503).json({
        status: 'unhealthy',
        error: error.message
      });
    }
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
      this.logger.error({
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
      }, 'Unhandled error');

      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Internal server error'
        }
      });
    });
  }

  /**
   * Generate request ID
   */
  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Stop server
   */
  async stop(): Promise<void> {
    if (this.server) {
      this.server.close();
    }
    
    if (this.wsServer) {
      this.wsServer.close();
    }

    this.logger.info('Collision API server stopped');
  }
}
```
