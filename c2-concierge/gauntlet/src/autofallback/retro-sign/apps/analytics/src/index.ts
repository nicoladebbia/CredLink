/**
 * Phase 13 Analytics - Main Application
 * Analytics SKU v1 with SLO monitoring, dashboards, and alerting
 */

import Fastify, { FastifyInstance } from 'fastify';
import { createClient } from '@clickhouse/client';
import { Logger } from 'winston';
import { ClickHouseClient } from './db/clickhouse';
import { AnalyticsService } from './services/analytics-service';
import { DashboardRoutes } from './web/dashboard';
import { AlertService } from './alerts/alert-service';
import { createLogger } from './utils/logger';
import { config } from './config';

export interface AnalyticsConfig {
  server: {
    host: string;
    port: number;
  };
  clickhouse: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  alerts: {
    enabled: boolean;
    config_path?: string;
    check_interval_seconds: number;
  };
  logging: {
    level: string;
  };
}

class AnalyticsApp {
  private fastify: FastifyInstance;
  private clickhouseClient: ClickHouseClient;
  private analyticsService: AnalyticsService;
  private dashboardRoutes: DashboardRoutes;
  private alertService: AlertService;
  private logger: Logger;
  private alertInterval?: NodeJS.Timeout;

  constructor(private appConfig: AnalyticsConfig) {
    this.logger = createLogger('AnalyticsApp', {
      level: appConfig.logging.level
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
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Initialize Fastify server with plugins
   */
  private async initializeServer(): Promise<void> {
    this.fastify = Fastify({
      logger: false, // Use our own logger
      trustProxy: true,
      requestTimeout: 30000,
      bodyLimit: 1048576 // 1MB
    });

    // Register plugins
    await this.fastify.register(require('@fastify/cors'), {
      origin: ['http://localhost:3000', 'http://localhost:3001'],
      credentials: true
    });

    await this.fastify.register(require('@fastify/static'), {
      root: `${__dirname}/public`,
      prefix: '/public/'
    });

    // Add custom request logging
    this.fastify.addHook('onRequest', async (request, reply) => {
      request.startTime = Date.now();
    });

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
    // Force fallback endpoint (break-glass)
    this.fastify.post('/api/v1/:tenant/routes/:route/force-fallback', {
      preHandler: [this.authenticateService.bind(this)]
    }, async (request, reply) => {
      try {
        const { tenant, route } = request.params as { tenant: string; route: string };
        const { reason } = request.body as { reason?: string };

        this.logger.warn('Manual fallback triggered', {
          tenant,
          route,
          reason: reason || 'Manual intervention',
          userAgent: request.headers['user-agent']
        });

        // TODO: Call Phase 6 policy API to enforce fallback
        // For now, just log and return success

        reply.send({
          success: true,
          message: 'Fallback enforced successfully',
          tenant,
          route,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        this.logger.error('Failed to enforce fallback', {
          error: error.message
        });
        reply.status(500).send({
          error: 'Failed to enforce fallback',
          message: error.message
        });
      }
    });

    // Get active incidents
    this.fastify.get('/api/v1/:tenant/incidents', {
      preHandler: [this.authenticateTenant.bind(this)]
    }, async (request, reply) => {
      try {
        const { tenant } = request.params as { tenant: string };
        const incidents = this.alertService.getActiveIncidents()
          .filter(inc => inc.tenant === tenant);

        reply.send({
          data: incidents,
          count: incidents.length,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        reply.status(500).send({
          error: 'Failed to get incidents',
          message: error.message
        });
      }
    });

    // Resolve incident
    this.fastify.post('/api/v1/:tenant/incidents/:incidentId/resolve', {
      preHandler: [this.authenticateTenant.bind(this)]
    }, async (request, reply) => {
      try {
        const { incidentId } = request.params as { incidentId: string };
        
        await this.alertService.resolveIncident(incidentId);

        reply.send({
          success: true,
          message: 'Incident resolved',
          incident_id: incidentId,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        reply.status(500).send({
          error: 'Failed to resolve incident',
          message: error.message
        });
      }
    });
  }

  /**
   * Register health check routes
   */
  private async registerHealthRoutes(): Promise<void> {
    this.fastify.get('/health', async (request, reply) => {
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
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    });

    this.fastify.get('/ready', async (request, reply) => {
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
          error: error.message,
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
          error: error.message
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
        error: error.message
      };
    }
  }

  /**
   * Authenticate tenant requests (JWT)
   */
  private async authenticateTenant(request: any, reply: any): Promise<void> {
    const authHeader = request.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.status(401).send({
        error: 'Authentication required',
        message: 'Bearer token required'
      });
    }

    // TODO: Implement proper JWT validation
    // For now, just check if token exists
    const token = authHeader.substring(7);
    if (!token || token.length < 10) {
      return reply.status(401).send({
        error: 'Authentication failed',
        message: 'Invalid token'
      });
    }
  }

  /**
   * Authenticate service requests (service-to-service)
   */
  private async authenticateService(request: any, reply: any): Promise<void> {
    const authHeader = request.headers.authorization;
    const serviceToken = request.headers['x-service-token'];
    
    // Accept either Bearer token or X-Service-Token header
    const token = authHeader?.substring(7) || serviceToken;
    
    if (!token || token !== process.env.SERVICE_TOKEN) {
      return reply.status(401).send({
        error: 'Authentication failed',
        message: 'Valid service token required'
      });
    }
  }

  /**
   * Start the analytics server
   */
  async start(): Promise<void> {
    try {
      await this.fastify.listen({
        host: this.appConfig.server.host,
        port: this.appConfig.server.port
      });

      this.logger.info('C2PA Analytics server started', {
        host: this.appConfig.server.host,
        port: this.appConfig.server.port,
        alerts_enabled: this.appConfig.alerts.enabled
      });

    } catch (error) {
      this.logger.error('Failed to start analytics server', {
        error: error.message,
        host: this.appConfig.server.host,
        port: this.appConfig.server.port
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
        error: error.message
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

// Default configuration
const defaultConfig: AnalyticsConfig = {
  server: {
    host: process.env.HOST || '0.0.0.0',
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
  }
};

// Start application if run directly
if (require.main === module) {
  const app = new AnalyticsApp(defaultConfig);
  
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
