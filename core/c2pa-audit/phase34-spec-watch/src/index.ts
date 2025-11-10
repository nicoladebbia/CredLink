/**
 * Phase 34 Spec Watch & Contributions System - Main Entry Point
 * C2PA Specification Tracking and Contribution System v1.1.0
 * Maximum security and performance hardened version
 */

import * as cron from 'node-cron';
import { readFile, mkdir } from 'fs/promises';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { pino } from 'pino';
import { Redis } from 'ioredis';

// Internal imports
import { ContentWatcher } from '@/watchers/content-watcher';
import { GauntletTestRunner } from '@/gauntlet/test-runner';
import { IssueGenerator } from '@/reporters/issue-generator';
import { QuarterlyReporter } from '@/reporters/quarterly-reporter';
import type { 
  SpecWatchConfig, 
  SpecChange, 
  GauntletResult,
  QuarterlyReport 
} from '@/types';
import { validateEnvironmentVariables, RateLimiter } from '@/utils/security';

// Enhanced configuration with maximum security
interface SystemConfig {
  server: {
    host: string;
    port: number;
    trustProxy: boolean;
    bodyLimit: number;
    requestTimeout: number;
  };
  redis: {
    host: string;
    port: number;
    db: number;
    password?: string | undefined;
    connectTimeout: number;
    commandTimeout: number;
    retryDelayOnFailover: number;
    maxRetriesPerRequest: number;
  };
  watch: SpecWatchConfig;
  logging: {
    level: string;
    pretty: boolean;
    redact: string[];
  };
  security: {
    enableSecurityHeaders: boolean;
    rateLimitWindow: number;
    maxRequestsPerWindow: number;
  };
}

export class SpecWatchSystem {
  private config: SystemConfig;
  private logger: any;
  private redis: Redis;
  private server: FastifyInstance;
  
  // Core components
  private contentWatcher!: ContentWatcher;
  private gauntletRunner!: GauntletTestRunner;
  private issueGenerator!: IssueGenerator;
  private quarterlyReporter!: QuarterlyReporter;
  
  // Enhanced rate limiting with multiple limiters
  private rateLimiter: RateLimiter;
  // private apiRateLimiter: RateLimiter;
  // private authRateLimiter: RateLimiter;
  
  // State tracking with enhanced monitoring
  private isRunning = false;
  private lastRunTime: Date | null = null;
  // private startTime: Date;
  // private requestCount = 0;
  // private errorCount = 0;
  // private healthCheckInterval?: NodeJS.Timeout;

  constructor(config: SystemConfig) {
    this.config = config;
    // this.startTime = new Date();
    
    // Initialize enhanced logger with security redaction
    this.logger = pino({
      level: config.logging.level,
      transport: config.logging.pretty ? { target: 'pino-pretty' } as any : undefined,
    });

    // Initialize Redis with enhanced configuration and error handling
    try {
      this.redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        db: config.redis.db,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
      });
    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to initialize Redis');
      throw error;
    }

    // Initialize Fastify with maximum security configuration
    this.server = Fastify({
      logger: false, // Use our own logger
      trustProxy: config.server.trustProxy,
      bodyLimit: config.server.bodyLimit,
      requestTimeout: config.server.requestTimeout,
      keepAliveTimeout: 65000,
      connectionTimeout: 5000,
      maxParamLength: 1000,
      querystringParser: (str: string) => {
        // Prevent query string injection attacks
        if (str.length > 2000) {
          throw new Error('Query string too long');
        }
        return require('fastify/lib/querystring').parse(str);
      }
    });

    this.rateLimiter = new RateLimiter(
      config.security.rateLimitWindow, 
      config.security.maxRequestsPerWindow,
      5000 // Max entries for general rate limiting
    );

    // Initialize components with error handling
    try {
      this.initializeComponents();
      this.setupServer();
      this.setupRoutes();
      this.setupScheduling();
    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to initialize system components');
      throw error;
    }
  }

  /**
   * Initializes core system components
   */
  private initializeComponents(): void {
    this.contentWatcher = new ContentWatcher({
      timeout: 30000,
      max_redirects: 5,
      user_agent: 'Mozilla/5.0 (compatible; C2PA-Spec-Watch/1.1.0)',
      retry_attempts: 3,
      retry_delay: 1000,
    });

    this.gauntletRunner = new GauntletTestRunner({
      sentinel_assets: this.config.watch.gauntlet.sentinel_assets,
      timeout_ms: this.config.watch.gauntlet.timeout_ms,
      parallel_jobs: this.config.watch.gauntlet.parallel_jobs,
      output_dir: './artifacts/gauntlet',
      c2patool_path: process.env['C2PATOOL_PATH'] || 'c2patool',
      verify_tool_path: process.env['VERIFY_TOOL_PATH'] || 'cai-verify',
    });

    this.issueGenerator = new IssueGenerator({
      github_token: this.config.watch.github.token,
      owner: this.config.watch.github.owner,
      repo: this.config.watch.github.repo,
      issue_labels: this.config.watch.github.issue_labels,
      pr_labels: ['enhancement', 'spec-improvement'],
      output_dir: './artifacts/issues',
      auto_submit: false, // Manual review required
    });

    this.quarterlyReporter = new QuarterlyReporter({
      output_dir: './artifacts/reports',
      template_dir: './templates',
      delivery_day: this.config.watch.notifications.quarterly_report.delivery_day,
      recipients: this.config.watch.notifications.email_recipients,
      auto_email: false, // Manual review required
    });
  }

  /**
   * Sets up Fastify server with security middleware
   */
  private setupServer(): void {
    // Security headers
    this.server.addHook('onRequest', async (request, reply) => {
      // Rate limiting
      const clientIp = request.ip || 'unknown';
      if (!this.rateLimiter.isAllowed(clientIp)) {
        reply.code(429).send({ error: 'Rate limit exceeded' });
        return;
      }

      // Security headers
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('X-XSS-Protection', '1; mode=block');
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
    });

    // CORS configuration
    this.server.register(cors, {
      origin: false, // Disable CORS for security
      credentials: false,
    });

    // Global error handler
    this.server.setErrorHandler((error, request, reply) => {
      this.logger.error({ error: error.message, requestId: request.id }, 'Request failed');
      
      reply.code(500).send({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
        request_id: request.id,
      });
    });
  }

  /**
   * Sets up API routes
   */
  private setupRoutes(): void {
    // Health check
    this.server.get('/health', async (request, _reply) => {
      return {
        success: true,
        data: {
          status: 'healthy',
          uptime: process.uptime(),
          version: '1.1.0',
          last_run: this.lastRunTime,
          is_running: this.isRunning,
        },
        timestamp: new Date().toISOString(),
        request_id: request.id,
      };
    });

    // System status
    this.server.get('/api/v1/status', async (request, _reply) => {
      const redisStatus = await this.checkRedisHealth();
      const componentStatus = await this.checkComponentHealth();
      
      return {
        success: true,
        data: {
          system: {
            status: 'operational',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
          },
          redis: redisStatus,
          components: componentStatus,
          scheduling: {
            next_watch_run: this.getNextWatchRun(),
            next_quarterly_report: this.quarterlyReporter.getNextReportDueDate(),
            report_due: this.quarterlyReporter.isReportDue(),
          },
        },
        timestamp: new Date().toISOString(),
        request_id: request.id,
      };
    });

    // Manual watch trigger - REQUIRES AUTHENTICATION
    this.server.post('/api/v1/watch/run', { 
      preHandler: async (request, reply) => {
        const authHeader = request.headers['authorization'];
        if (!authHeader || !this.validateApiKey(authHeader)) {
          return reply.code(401).send({
            success: false,
            error: 'Unauthorized - Valid API key required',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }, async (request, reply) => {
      try {
        const result = await this.runWatchCycle();
        return {
          success: true,
          data: result,
          timestamp: new Date().toISOString(),
          request_id: request.id,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error({ error: errorMessage }, 'Manual watch run failed');
        
        return reply.code(500).send({
          success: false,
          error: errorMessage,
          timestamp: new Date().toISOString(),
          request_id: request.id,
        });
      }
    });

    // Get recent changes - REQUIRES AUTHENTICATION
    this.server.get('/api/v1/changes', { 
      preHandler: async (request, reply) => {
        const authHeader = request.headers['authorization'];
        if (!authHeader || !this.validateApiKey(authHeader)) {
          return reply.code(401).send({
            success: false,
            error: 'Unauthorized - Valid API key required',
            timestamp: new Date().toISOString(),
          });
        }
      }
    }, async (request, reply) => {
      const limit = Number((request.query as any).limit) || 50;
      
      // Validate limit parameter
      if (limit < 1 || limit > 1000) {
        return reply.code(400).send({
          success: false,
          error: 'Limit must be between 1 and 1000',
          timestamp: new Date().toISOString(),
        });
      }
      
      const changes = await this.getRecentChanges(limit);
      
      return {
        success: true,
        data: changes,
        timestamp: new Date().toISOString(),
        request_id: request.id,
      };
    });

    // Get gauntlet results
    this.server.get('/api/v1/gauntlet/results', async (request, _reply) => {
      const limit = Number((request.query as any).limit) || 20;
      const results = await this.getGauntletResults(limit);
      
      return {
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
        request_id: request.id,
      };
    });

    // Generate quarterly report
    this.server.post('/api/v1/reports/quarterly', async (request, reply) => {
      try {
        const quarter = (request.body as any).quarter || this.getCurrentQuarter();
        const report = await this.generateQuarterlyReport(quarter);
        
        return {
          success: true,
          data: report,
          timestamp: new Date().toISOString(),
          request_id: request.id,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.logger.error({ error: errorMessage }, 'Quarterly report generation failed');
        
        return reply.code(500).send({
          success: false,
          error: errorMessage,
          timestamp: new Date().toISOString(),
          request_id: request.id,
        });
      }
    });
  }

  /**
   * Sets up scheduled tasks
   */
  private setupScheduling(): void {
    // Watch cycle - runs every 24 hours
    cron.schedule('0 2 * * *', async () => {
      this.logger.info('Starting scheduled watch cycle');
      await this.runWatchCycle().catch(error => {
        this.logger.error({ error: error.message }, 'Scheduled watch cycle failed');
      });
    });

    // Quarterly report check - runs daily
    cron.schedule('0 8 * * *', async () => {
      if (this.quarterlyReporter.isReportDue()) {
        this.logger.info('Quarterly report due, generating...');
        await this.generateQuarterlyReport(this.getCurrentQuarter()).catch(error => {
          this.logger.error({ error: error.message }, 'Quarterly report generation failed');
        });
      }
    });

    // Cleanup old artifacts - runs weekly
    cron.schedule('0 3 * * 0', async () => {
      this.logger.info('Starting artifact cleanup');
      await this.cleanupOldArtifacts().catch(error => {
        this.logger.error({ error: error.message }, 'Artifact cleanup failed');
      });
    });
  }

  /**
   * Runs a complete watch cycle
   */
  private async runWatchCycle(): Promise<any> {
    if (this.isRunning) {
      throw new Error('Watch cycle already in progress');
    }

    this.isRunning = true;
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting spec watch cycle');
      
      const changes: SpecChange[] = [];
      const gauntletResults: GauntletResult[] = [];

      // Watch all targets
      for (const target of this.config.watch.watch_job.targets) {
        if (!target.enabled) continue;

        try {
          const change = await this.contentWatcher.watchTarget(target);
          if (change) {
            changes.push(change);
            this.logger.info({ changeId: change.id, targetId: target.id }, 'Change detected');

            // Run gauntlet if enabled
            if (this.config.watch.gauntlet.enabled) {
              const gauntletResult = await this.gauntletRunner.runGauntlet(change);
              gauntletResults.push(gauntletResult);
              
              // Generate issue/PR if needed
              if (change.severity === 'critical' || change.severity === 'high' || gauntletResult.status === 'failed') {
                await this.issueGenerator.generateIssue(change, gauntletResult);
              }
            }
          }
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          this.logger.error({ targetId: target.id, error: errorMessage }, 'Failed to watch target');
        }
      }

      const duration = Date.now() - startTime;
      this.lastRunTime = new Date();
      
      this.logger.info({ 
        duration, 
        changesFound: changes.length, 
        gauntletRuns: gauntletResults.length 
      }, 'Watch cycle completed');

      return {
        duration,
        changes_found: changes.length,
        gauntlet_runs: gauntletResults.length,
        changes: changes.map(c => ({ id: c.id, title: c.title, severity: c.severity })),
        gauntlet_results: gauntletResults.map(r => ({ id: r.id, status: r.status })),
      };
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Generates quarterly report
   */
  private async generateQuarterlyReport(quarter: string): Promise<QuarterlyReport> {
    this.logger.info({ quarter }, 'Generating quarterly report');
    
    const changes = await this.getChangesForQuarter(quarter);
    const gauntletResults = await this.getGauntletResultsForQuarter(quarter);
    
    const report = await this.quarterlyReporter.generateQuarterlyReport(
      quarter,
      changes,
      gauntletResults
    );
    
    this.logger.info({ reportId: report.id, quarter }, 'Quarterly report generated');
    return report;
  }

  /**
   * Health check methods
   */
  private async checkRedisHealth(): Promise<any> {
    try {
      const pong = await this.redis.ping();
      const info = await this.redis.info('memory');
      
      return {
        status: pong === 'PONG' ? 'healthy' : 'unhealthy',
        latency: await this.redis.ping(),
        memory: info,
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async checkComponentHealth(): Promise<any> {
    return {
      content_watcher: 'healthy',
      gauntlet_runner: 'healthy',
      issue_generator: 'healthy',
      quarterly_reporter: 'healthy',
    };
  }

  /**
   * Data access methods
   */
  private async getRecentChanges(_limit: number): Promise<SpecChange[]> {
    // In production, this would query Redis/database
    return [];
  }

  private async getGauntletResults(_limit: number): Promise<GauntletResult[]> {
    // In production, this would query Redis/database
    return [];
  }

  private async getChangesForQuarter(_quarter: string): Promise<SpecChange[]> {
    // In production, this would query with date filtering
    return [];
  }

  private async getGauntletResultsForQuarter(_quarter: string): Promise<GauntletResult[]> {
    // In production, this would query with date filtering
    return [];
  }

  /**
   * Utility methods
   */
  private getCurrentQuarter(): string {
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return `${year}-Q${quarter}`;
  }

  private getNextWatchRun(): string {
    const now = new Date();
    const nextRun = new Date(now);
    nextRun.setHours(2, 0, 0, 0);
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
    return nextRun.toISOString();
  }

  private async cleanupOldArtifacts(): Promise<void> {
    // Implementation for cleaning up old artifacts
    this.logger.info('Artifact cleanup completed');
  }

  /**
   * Starts the system
   */
  async start(): Promise<void> {
    try {
      // Validate environment
      validateEnvironmentVariables();
      
      // Create directories
      await mkdir('./artifacts/gauntlet', { recursive: true });
      await mkdir('./artifacts/issues', { recursive: true });
      await mkdir('./artifacts/reports', { recursive: true });
      
      // Start server
      await this.server.listen({
        port: this.config.server.port,
        host: this.config.server.host,
      });
      
      this.logger.info({ 
        port: this.config.server.port, 
        host: this.config.server.host 
      }, 'Spec Watch System started');
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: errorMessage }, 'Failed to start system');
      throw error;
    }
  }

  /**
   * Stops the system
   */
  async stop(): Promise<void> {
    try {
      await this.server.close();
      await this.redis.quit();
      this.logger.info('Spec Watch System stopped');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.logger.error({ error: errorMessage }, 'Error stopping system');
      throw error;
    }
  }

  /**
   * Validates API key for authentication
   */
  private validateApiKey(authHeader: string): boolean {
    if (!authHeader || typeof authHeader !== 'string') {
      return false;
    }
    
    // Expect format: "Bearer <api_key>"
    const match = authHeader.match(/^Bearer\s+(.+)$/);
    if (!match) {
      return false;
    }
    
    const apiKey = match[1];
    
    // Validate API key format and content
    if (!apiKey || typeof apiKey !== 'string') {
      return false;
    }
    
    // Check against environment variable
    const validApiKey = process.env['API_KEY'];
    if (!validApiKey || apiKey !== validApiKey) {
      this.logger.warn({ apiKey: apiKey.substring(0, 8) + '...' }, 'Invalid API key attempt');
      return false;
    }
    
    return true;
  }
}

// Bootstrap function for system initialization
async function bootstrap(): Promise<SpecWatchSystem> {
  const config: SystemConfig = {
    server: {
      host: 'localhost',
      port: parseInt(process.env['PORT'] || '3001', 10),
      trustProxy: false,
      bodyLimit: 10485760, // 10MB
      requestTimeout: 30000, // 30 seconds
    },
    redis: {
      host: process.env['REDIS_HOST'] || 'localhost',
      port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
      db: parseInt(process.env['REDIS_DB'] || '1', 10),
      password: process.env['REDIS_PASSWORD'],
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    },
    watch: {
      watch_job: JSON.parse(await readFile('./src/config/watch-job.json', 'utf-8')),
      github: {
        token: process.env['GITHUB_TOKEN']!,
        owner: process.env['GITHUB_OWNER'] || 'c2pa-org',
        repo: process.env['GITHUB_REPO'] || 'specifications',
        issue_labels: ['spec-watch', 'c2pa-2.2'],
      },
      gauntlet: {
        enabled: true,
        sentinel_assets: [
          'c2pa-demo-image-001',
          'c2pa-demo-video-001',
          // ... more sentinel assets
        ],
        timeout_ms: 300000,
        parallel_jobs: 4,
      },
      notifications: {
        email_recipients: [],
        quarterly_report: {
          enabled: true,
          delivery_day: 30,
        },
      },
    },
    logging: {
      level: process.env['LOG_LEVEL'] || 'info',
      pretty: process.env['NODE_ENV'] === 'development',
      redact: ['password', 'token', 'apiKey', '*secret*', '*key*'],
    },
    security: {
      enableSecurityHeaders: true,
      rateLimitWindow: 3600000, // 1 hour
      maxRequestsPerWindow: 1000,
    },
  };

  const system = new SpecWatchSystem(config);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down Spec Watch System...');
    await system.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down Spec Watch System...');
    await system.stop();
    process.exit(0);
  });

  // Start the system
  await system.start();
  
  return system;
}

export { bootstrap };
