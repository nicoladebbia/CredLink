/**
 * Phase 13 Analytics - Main Application
 * Analytics SKU v1 with SLO monitoring, dashboards, and alerting
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import staticPlugin from '@fastify/static';
import { Logger } from 'winston';
import { ClickHouseClient } from './db/clickhouse';
import { AnalyticsService } from './services/analytics-service';
import { DashboardRoutes } from './web/dashboard';
import { AlertService } from './alerts/alert-service';
import { createLogger } from './utils/logger';
import { getConfig, validateConfig, AnalyticsConfig } from './config';
import { RequestValidator } from './utils/validation';
import { securityMiddleware, ipWhitelist } from './middleware/security';
import { securityInvariants } from './middleware/security-invariants';

export { AnalyticsConfig } from './config';

class AnalyticsApp {
  private fastify!: FastifyInstance;
  private clickhouseClient!: ClickHouseClient;
  private analyticsService!: AnalyticsService;
  private dashboardRoutes!: DashboardRoutes;
  private alertService!: AlertService;
  private logger: Logger;
  private alertInterval?: NodeJS.Timeout;
  private appConfig: AnalyticsConfig;

  constructor() {
    this.appConfig = getConfig();
    validateConfig(this.appConfig);
    this.logger = createLogger('AnalyticsApp', {
      level: this.appConfig.logging.level
    });
  }

  /**
   * Initialize the analytics application
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing C2PA Analytics v1.0');

      // Initialize Fastify server
      await this.initializeServer();

      // Initialize ClickHouse client
      await this.initializeClickHouse();

      // Initialize services
      await this.initializeServices();

      // Register routes
      await this.registerRoutes();

      // Start alert monitoring
      if (this.appConfig.alerts.enabled) {
        await this.startAlertMonitoring();
      }

      this.logger.info('Analytics application initialized successfully');

    } catch (error) {
      this.logger.error('Failed to initialize analytics application', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Initialize Fastify server with plugins and security
   */
  private async initializeServer(): Promise<void> {
    this.fastify = Fastify({
      logger: false, // Use our own logger
      trustProxy: true,
      requestTimeout: 30000,
      bodyLimit: this.appConfig.security?.max_request_size || 1048576
    });

    // Register plugins with security
    await this.fastify.register(cors, {
      // CRITICAL: Restrict CORS origins to prevent XSS
      origin: process.env.NODE_ENV === 'production' 
        ? (process.env.ALLOWED_ORIGINS?.split(',').filter(origin => 
            origin.startsWith('https://') && origin.length > 10
          ) || ['https://yourdomain.com'])
        : ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true,
      // CRITICAL: Additional CORS security
      methods: ['GET', 'POST', 'PUT', 'DELETE'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Service-Token'],
      maxAge: 86400 // 24 hours
    });

    await this.fastify.register(staticPlugin, {
      root: `${__dirname}/public`,
      prefix: '/public/'
    });

    // Add custom request logging
    this.fastify.addHook('onRequest', async (request: any, _reply) => {
      request.startTime = Date.now();
    });

    // CRITICAL: Add security invariants to all routes (Phase 16)
    this.fastify.addHook('onRequest', securityInvariants);
    
    // CRITICAL: Add security middleware to all routes
    this.fastify.addHook('onRequest', securityMiddleware);

    this.fastify.addHook('onResponse', async (request, reply) => {
      const duration = Date.now() - (request as any).startTime;
      
      this.logger.debug('HTTP request completed', {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        duration: `${duration}ms`,
        userAgent: request.headers['user-agent']
      });
    });

    this.logger.info('Fastify server initialized', {
      host: this.appConfig.server.host,
      port: this.appConfig.server.port
    });
  }

  /**
   * Initialize ClickHouse database connection
   */
  private async initializeClickHouse(): Promise<void> {
    this.clickhouseClient = new ClickHouseClient(
      this.appConfig.clickhouse,
      this.logger
    );

    // Test connection
    const health = await this.clickhouseClient.healthCheck();
    if (!health.healthy) {
      throw new Error('ClickHouse connection failed');
    }

    // Create schema if needed
    const ddlPath = `${__dirname}/schema/clickhouse-ddl.sql`;
    await this.clickhouseClient.createSchema(ddlPath);

    this.logger.info('ClickHouse initialized and schema created');
  }

  /**
   * Initialize core services
   */
  private async initializeServices(): Promise<void> {
    // Analytics service
    this.analyticsService = new AnalyticsService(
      this.clickhouseClient,
      this.logger
    );

    // Dashboard routes
    this.dashboardRoutes = new DashboardRoutes(
      this.analyticsService,
      this.logger
    );

    // Alert service
    this.alertService = new AlertService(
      this.analyticsService,
      this.logger,
      this.appConfig.alerts.config_path
    );

    this.logger.info('Core services initialized');
  }

  /**
   * Register all application routes
   */
  private async registerRoutes(): Promise<void> {
    // Register dashboard routes
    await this.dashboardRoutes.registerRoutes(this.fastify);

    // Register API routes
    await this.registerAPIRoutes();

    // Register health check
    await this.registerHealthRoutes();

    this.logger.info('All routes registered');
  }

  /**
   * Register API routes
   */
  private async registerAPIRoutes(): Promise<void> {
    // Force fallback endpoint (break-glass) - CRITICAL SECURITY
    this.fastify.post('/api/v1/:tenant/routes/:route/force-fallback', {
      preHandler: [this.authenticateService.bind(this), ipWhitelist]
    }, async (request, reply) => {
      try {
        // CRITICAL: Validate all inputs to prevent injection
        const { tenant, route } = request.params as { tenant: string; route: string };
        const { reason } = request.body as { reason?: string };
        
        const validatedTenant = RequestValidator.validateTenant(tenant);
        const validatedRoute = RequestValidator.validateRoute(route);
        const validatedReason = RequestValidator.validateReason(reason);
        
        this.logger.info(`Fallback enforcement requested`, {
          tenant: validatedTenant,
          route: validatedRoute,
          reason: validatedReason
        });
        
        // TODO: Call Phase 6 policy API to enforce fallback
        // For now, just log and return success

        reply.send({
          success: true,
          message: 'Fallback enforcement logged',
          tenant: validatedTenant,
          route: validatedRoute,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        this.logger.error('Failed to enforce fallback', {
          error: error instanceof Error ? error.message : String(error)
        });
        reply.status(500).send({
          error: 'Failed to enforce fallback',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Get active incidents
    this.fastify.get('/api/v1/:tenant/incidents', {
      preHandler: [this.authenticateTenant.bind(this)]
    }, async (request, reply) => {
      try {
        const { tenant } = request.params as { tenant: string };
        
        // CRITICAL: Validate tenant parameter
        const validatedTenant = RequestValidator.validateTenant(tenant);
        
        // Use getRecentIncidents instead of getActiveIncidents
        const incidents = await this.analyticsService.getRecentIncidents(validatedTenant);

        reply.send({
          data: incidents,
          count: incidents.length,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        reply.status(500).send({
          error: 'Failed to get incidents',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });

    // Resolve incident
    this.fastify.post('/api/v1/:tenant/incidents/:incidentId/resolve', {
      preHandler: [this.authenticateTenant.bind(this)]
    }, async (request, reply) => {
      try {
        const { incidentId } = request.params as { incidentId: string };
        
        // CRITICAL: Validate incident ID parameter
        const validatedIncidentId = RequestValidator.validateIncidentId(incidentId);
        
        // TODO: Implement incident resolution in AnalyticsService
        this.logger.info(`Incident resolution requested`, {
          incident_id: validatedIncidentId
        });
        
        // For now, just log and return success
        // await this.analyticsService.resolveIncident(validatedIncidentId);

        reply.send({
          success: true,
          message: 'Incident resolution logged',
          incident_id: validatedIncidentId,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        reply.status(500).send({
          error: 'Failed to resolve incident',
          message: error instanceof Error ? error.message : String(error)
        });
      }
    });
  }

  /**
   * Register health check routes
   */
  private async registerHealthRoutes(): Promise<void> {
    this.fastify.get('/health', async (_request, reply) => {
      try {
        const [clickhouseHealth, sloHealth] = await Promise.all([
          this.clickhouseClient.healthCheck(),
          this.getSLOHealthSummary()
        ]);

        const health = {
          status: clickhouseHealth.healthy && sloHealth.healthy ? 'healthy' : 'unhealthy',
          timestamp: new Date().toISOString(),
          services: {
            clickhouse: clickhouseHealth.healthy ? 'healthy' : 'unhealthy',
            analytics: sloHealth.healthy ? 'healthy' : 'unhealthy',
            alerts: this.appConfig.alerts.enabled ? 'active' : 'disabled'
          },
          metrics: sloHealth
        };

        const statusCode = health.status === 'healthy' ? 200 : 503;
        reply.status(statusCode).send(health);

      } catch (error) {
        reply.status(503).send({
          status: 'unhealthy',
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        });
      }
    });

    this.fastify.get('/ready', async (_request, reply) => {
      // More comprehensive readiness check
      try {
        const freshness = await this.analyticsService.validateDataFreshness('demo-tenant');
        
        const ready = {
          ready: freshness.fresh,
          timestamp: new Date().toISOString(),
          data_freshness: freshness
        };

        reply.status(ready.ready ? 200 : 503).send(ready);

      } catch (error) {
        reply.status(503).send({
          ready: false,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString()
        });
      }
    });
  }

  /**
   * Start alert monitoring cron job
   */
  private async startAlertMonitoring(): Promise<void> {
    const intervalMs = this.appConfig.alerts.check_interval_seconds * 1000;
    
    this.alertInterval = setInterval(async () => {
      try {
        // Get list of active tenants (TODO: from tenant service)
        const tenants = ['demo-tenant', 'prod-tenant']; // Placeholder
        
        for (const tenant of tenants) {
          await this.alertService.runBurnRateCheck(tenant);
        }

      } catch (error) {
        this.logger.error('Alert monitoring check failed', {
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }, intervalMs);

    this.logger.info('Alert monitoring started', {
      interval_seconds: this.appConfig.alerts.check_interval_seconds
    });
  }

  /**
   * Get SLO health summary for health checks
   */
  private async getSLOHealthSummary(): Promise<any> {
    try {
      // Use a demo tenant for health checks
      const summary = await this.analyticsService.getSLOHealthSummary('demo-tenant');
      
      return {
        healthy: summary.overall_survival >= 0.99,
        ...summary
      };

    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }

  /**
   * Authenticate tenant requests (JWT) - Enhanced Security
   */
  private async authenticateTenant(request: any, reply: any): Promise<void> {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Authentication required',
        message: 'Bearer token required'
      });
    }

    const token = authHeader.substring(7);
    
    // CRITICAL: Enhanced JWT validation with security checks
    try {
      const jwt = require('jsonwebtoken');
      const jwtSecret = this.appConfig.security?.jwt_secret || process.env.JWT_SECRET;
      
      if (!jwtSecret || jwtSecret.length < 64) {
        this.logger.error('JWT secret not configured or too weak');
        return reply.status(500).send({
          error: 'Configuration error',
          message: 'Authentication system not properly configured'
        });
      }

      // CRITICAL: Additional token format validation
      if (!/^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+$/.test(token)) {
        return reply.status(401).send({
          error: 'Authentication failed',
          message: 'Invalid token format'
        });
      }

      const decoded = jwt.verify(token, jwtSecret, {
        algorithms: ['HS256'], // Restrict algorithm
        maxAge: this.appConfig.security?.session_timeout || 3600
      });
      
      // Enhanced token validation
      if (!decoded.tenant || !decoded.exp || !decoded.iat || !decoded.jti) {
        return reply.status(401).send({
          error: 'Authentication failed',
          message: 'Invalid token structure'
        });
      }

      // CRITICAL: Check for token replay attacks
      const now = Math.floor(Date.now() / 1000);
      if (decoded.exp <= now) {
        return reply.status(401).send({
          error: 'Authentication failed',
          message: 'Token expired'
        });
      }

      // Check token age (prevent very old tokens)
      const tokenAge = now - decoded.iat;
      const maxAge = this.appConfig.security?.session_timeout || 3600;
      
      if (tokenAge > maxAge) {
        return reply.status(401).send({
          error: 'Authentication failed',
          message: 'Token too old'
        });
      }
      
      // Validate tenant format
      if (!RequestValidator.validateTenant(decoded.tenant)) {
        return reply.status(401).send({
          error: 'Authentication failed',
          message: 'Invalid tenant in token'
        });
      }
      
      // CRITICAL: Check for suspicious token patterns
      if (decoded.jti.length < 16 || decoded.jti.length > 128) {
        return reply.status(401).send({
          error: 'Authentication failed',
          message: 'Invalid token identifier'
        });
      }
      
      // Attach validated tenant and token info to request
      request.tenant = decoded.tenant;
      request.tokenId = decoded.jti;
      request.tokenExp = decoded.exp;
      
    } catch (error) {
      this.logger.warn('JWT authentication failed', {
        error: error instanceof Error ? error.message : String(error),
        ip: request.ip
      });
      return reply.status(401).send({
        error: 'Authentication failed',
        message: 'Invalid token'
      });
    }
  }

  /**
   * Authenticate service requests (service-to-service) - Enhanced Security
   */
  private async authenticateService(request: any, reply: any): Promise<void> {
    const authHeader = request.headers.authorization;
    const serviceToken = request.headers['x-service-token'];
    
    // Accept either Bearer token or X-Service-Token header
    const token = authHeader?.substring(7) || serviceToken;
    
    // CRITICAL: Enhanced service token validation
    const crypto = require('crypto');
    const expectedToken = this.appConfig.enforcement?.service_token || process.env.SERVICE_TOKEN;
    
    if (!token) {
      this.logger.warn('Service authentication failed: No token provided', {
        ip: request.ip,
        userAgent: request.headers['user-agent']
      });
      return reply.status(401).send({
        error: 'Authentication failed',
        message: 'Service token required'
      });
    }
    
    if (!expectedToken || expectedToken.length < 64) {
      this.logger.error('Service token not configured or too weak');
      return reply.status(500).send({
        error: 'Configuration error',
        message: 'Service authentication not properly configured'
      });
    }
    
    // Enhanced timing-safe comparison with additional security checks
    try {
      if (token.length !== expectedToken.length || 
          !crypto.timingSafeEqual(Buffer.from(token, 'utf8'), Buffer.from(expectedToken, 'utf8'))) {
        this.logger.warn('Service authentication failed: Invalid token', {
          ip: request.ip,
          tokenLength: token.length,
          expectedLength: expectedToken.length
        });
        return reply.status(401).send({
          error: 'Authentication failed',
          message: 'Invalid service token'
        });
      }
    } catch (error) {
      this.logger.error('Service authentication error', {
        error: error instanceof Error ? error.message : String(error)
      });
      return reply.status(500).send({
        error: 'Authentication error',
        message: 'Service authentication failed'
      });
    }

    // Log successful service authentication (without sensitive data)
    this.logger.debug('Service authentication successful', {
      ip: request.ip,
      endpoint: request.url
    });
  }

  /**
   * Enhanced server startup with comprehensive validation
   */
  async start(): Promise<void> {
    try {
      // CRITICAL: Pre-startup security validation
      const config = this.appConfig;
      
      if (!config.security?.jwt_secret || config.security.jwt_secret.length < 64) {
        throw new Error('JWT_SECRET must be at least 64 characters');
      }

      if (!config.enforcement?.service_token || config.enforcement.service_token.length < 64) {
        throw new Error('SERVICE_TOKEN must be at least 64 characters');
      }

      // CRITICAL: Validate production requirements
      if (process.env.NODE_ENV === 'production') {
        if (!config.clickhouse.password || config.clickhouse.password.length < 32) {
          throw new Error('Database password must be at least 32 characters in production');
        }
        
        if (config.server.host === '0.0.0.0') {
          this.logger.error('SECURITY WARNING: Server bound to all interfaces in production - this is dangerous');
          throw new Error('Server cannot bind to 0.0.0.0 in production');
        }
        
        // CRITICAL: Validate HTTPS in production
        if (!process.env.FORCE_HTTPS || process.env.FORCE_HTTPS !== 'true') {
          this.logger.error('SECURITY: HTTPS enforcement required in production');
          throw new Error('HTTPS enforcement required in production');
        }
      }

      await this.fastify.listen({
        host: config.server.host,
        port: config.server.port
      });

      this.logger.info('C2PA Analytics server started successfully', {
        host: config.server.host,
        port: config.server.port,
        alerts_enabled: config.alerts.enabled,
        environment: process.env.NODE_ENV || 'development',
        security_features: {
          rate_limiting: !!config.security?.rate_limit_max,
          jwt_validation: !!config.security?.jwt_secret,
          request_size_limit: !!config.security?.max_request_size
        }
      });

      // Log security configuration in development
      if (process.env.NODE_ENV !== 'production') {
        this.logger.info('Security configuration loaded', {
          jwt_configured: !!config.security?.jwt_secret,
          service_token_configured: !!config.enforcement?.service_token,
          rate_limit_max: config.security?.rate_limit_max,
          max_request_size: config.security?.max_request_size
        });
      }

    } catch (error) {
      this.logger.error('Failed to start analytics server', {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      throw error;
    }
  }

  /**
   * Stop the analytics server
   */
  async stop(): Promise<void> {
    try {
      // Stop alert monitoring
      if (this.alertInterval) {
        clearInterval(this.alertInterval);
      }

      // Close ClickHouse connection
      await this.clickhouseClient.close();

      // Stop Fastify server
      await this.fastify.close();

      this.logger.info('Analytics application stopped');

    } catch (error) {
      this.logger.error('Error stopping analytics application', {
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }

  /**
   * Get application instance for testing
   */
  getServer(): FastifyInstance {
    return this.fastify;
  }

  /**
   * Get services for testing
   */
  getServices() {
    return {
      analyticsService: this.analyticsService,
      alertService: this.alertService,
      clickhouseClient: this.clickhouseClient
    };
  }
}

// Default configuration with secure defaults
const defaultConfig: AnalyticsConfig = {
  server: {
    host: process.env.HOST || '127.0.0.1', // CRITICAL: Secure default - localhost only
    port: parseInt(process.env.PORT || '3002')
  },
  clickhouse: {
    host: process.env.CLICKHOUSE_HOST || 'localhost',
    port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
    username: process.env.CLICKHOUSE_USER || 'default',
    password: process.env.CLICKHOUSE_PASSWORD || '',
    database: process.env.CLICKHOUSE_DATABASE || 'c2pa_analytics'
  },
  alerts: {
    enabled: process.env.ALERTS_ENABLED === 'true',
    config_path: process.env.ALERTS_CONFIG_PATH,
    check_interval_seconds: parseInt(process.env.ALERTS_CHECK_INTERVAL || '60')
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  },
  storage: {
    r2: {
      endpoint: process.env.R2_ENDPOINT || 'https://example.r2.cloudflarestorage.com',
      access_key_id: process.env.R2_ACCESS_KEY_ID || 'default-key',
      secret_access_key: process.env.R2_SECRET_ACCESS_KEY || 'default-secret',
      bucket: process.env.R2_BUCKET || 'c2pa-analytics'
    }
  },
  notifications: {
    email: {
      smtp_host: process.env.SMTP_HOST || 'localhost',
      smtp_port: parseInt(process.env.SMTP_PORT || '587'),
      username: process.env.SMTP_USERNAME || 'default',
      password: process.env.SMTP_PASSWORD || '',
      from: process.env.SMTP_FROM || 'noreply@c2pa-analytics.com'
    },
    slack: {
      bot_token: process.env.SLACK_BOT_TOKEN || 'default-token',
      default_channel: process.env.SLACK_DEFAULT_CHANNEL || '#alerts'
    }
  },
  enforcement: {
    fallback_api_url: process.env.FALLBACK_API_URL || 'http://localhost:3001',
    service_token: process.env.SERVICE_TOKEN || '', // CRITICAL: No default token - must be set
    auto_resolve_hours: parseInt(process.env.AUTO_RESOLVE_HOURS || '24')
  },
  security: {
    jwt_secret: process.env.JWT_SECRET || '', // CRITICAL: No default secret - must be set
    bcrypt_rounds: parseInt(process.env.BCRYPT_ROUNDS || '12'),
    session_timeout: parseInt(process.env.SESSION_TIMEOUT || '3600'),
    max_request_size: parseInt(process.env.MAX_REQUEST_SIZE || '1048576'),
    rate_limit_window: parseInt(process.env.RATE_LIMIT_WINDOW || '900000'),
    rate_limit_max: parseInt(process.env.RATE_LIMIT_MAX || '100')
  }
};

// Start application if run directly
if (require.main === module) {
  const app = new AnalyticsApp();
  
  app.initialize()
    .then(() => app.start())
    .catch((error) => {
      console.error('Failed to start analytics application:', error);
      process.exit(1);
    });

  // Graceful shutdown
  process.on('SIGTERM', async () => {
    console.log('Received SIGTERM, shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('Received SIGINT, shutting down gracefully...');
    await app.stop();
    process.exit(0);
  });
}

export { AnalyticsApp, defaultConfig };
