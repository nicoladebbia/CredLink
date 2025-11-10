/**
 * Phase 35 Public Survival Leaderboard - Main Entry Point
 * C2PA Content Credentials preservation testing and ranking system
 */

import * as cron from 'node-cron';
import { readFile, mkdir, writeFile } from 'fs/promises';
import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import { pino } from 'pino';
import { Redis } from 'ioredis';
import crypto from 'crypto';

// Internal imports
import { TestingEngine } from '@/core/testing-engine';
import { ScoringEngine } from '@/core/scoring-engine';
import { PlaybookGenerator } from '@/core/playbook-generator';
import { LeaderboardWebServer } from '@/web/server';
import { loadEnvironment, getConfigSummary } from '@/config/env';
import { AuthManager, createAuthMiddleware } from '@/utils/auth';
import { SecurityMonitor, createSecurityMonitoringMiddleware } from '@/utils/monitoring';
import { VENDORS } from '@/config/vendors';
import { TEST_ASSETS } from '@/config/test-assets';

import { 
  TestExecution, 
  LeaderboardData,
  RunMetadata,
  Playbook
} from '@/types';

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
    password?: string;
    maxRetriesPerRequest: number;
  };
  logging: {
    level: string;
    pretty: boolean;
  };
  testing: {
    outputDir: string;
    c2patoolPath: string;
    verifyToolPath: string;
    timeoutMs: number;
    maxConcurrentTests: number;
    retryAttempts: number;
    retryDelayMs: number;
  };
  leaderboard: {
    version: string;
    updateSchedule: string;
    retentionDays: number;
    publicResultsUrl: string;
  };
  security: {
    enableSecurityHeaders: boolean;
    rateLimitWindow: number;
    maxRequestsPerWindow: number;
  };
  jwtSecret: string;
  sessionTimeout: number;
  enableApiKeyAuth: boolean;
}

export class LeaderboardSystem {
  private config: SystemConfig;
  private logger: any;
  private redis: Redis;
  private server: FastifyInstance;
  
  // Core components
  private testingEngine: TestingEngine;
  private scoringEngine: ScoringEngine;
  private playbookGenerator: PlaybookGenerator;
  private webServer: LeaderboardWebServer;
  
  // Security components
  private authManager: AuthManager;
  private securityMonitor: SecurityMonitor;
  
  // State tracking
  private isRunning = false;
  private lastRunTime: Date | null = null;
  private currentRun: RunMetadata | null = null;
  private activeTests = new Map<string, TestExecution>();

  constructor(config: SystemConfig) {
    this.config = config;
    
    // Initialize enhanced logger
    this.logger = pino({
      level: config.logging.level,
      transport: config.logging.pretty ? { target: 'pino-pretty' } as any : undefined,
    });

    // Initialize Redis with enhanced configuration
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
      logger: false,
      trustProxy: config.server.trustProxy,
      bodyLimit: config.server.bodyLimit,
      requestTimeout: config.server.requestTimeout,
      maxParamLength: 1000,
      querystringParser: (str: string) => {
        if (str.length > 2000) {
          throw new Error('Query string too long');
        }
        return require('fastify/lib/querystring').parse(str);
      }
    });

    // Initialize core components
    this.testingEngine = new TestingEngine({
      outputDir: config.testing.outputDir,
      c2patoolPath: config.testing.c2patoolPath,
      verifyToolPath: config.testing.verifyToolPath,
      timeoutMs: config.testing.timeoutMs,
      maxConcurrentTests: config.testing.maxConcurrentTests,
      retryAttempts: config.testing.retryAttempts,
      retryDelayMs: config.testing.retryDelayMs
    });

    this.scoringEngine = new ScoringEngine({
      weights: {
        'embedded-manifest-survival': 0.35,
        'remote-manifest-honored': 0.25,
        'verifier-discovery-reliability': 0.15,
        'docs-alignment': 0.15,
        'reproducibility': 0.10
      },
      thresholds: {
        green: 90,
        yellow: 75,
        red: 0
      },
      enableBonusPoints: true,
      enablePenaltyPoints: false
    });

    this.playbookGenerator = new PlaybookGenerator({
      includeCodeExamples: true,
      includeCurlCommands: true,
      includeVerificationSteps: true,
      difficulty: 'all'
    });

    this.webServer = new LeaderboardWebServer({
      fastify: this.server,
      redis: this.redis,
      config: config,
      testingEngine: this.testingEngine,
      scoringEngine: this.scoringEngine,
      playbookGenerator: this.playbookGenerator
    });

    // Initialize security components
    this.authManager = new AuthManager(this.redis, {
      jwtSecret: config.jwtSecret,
      sessionTimeout: config.sessionTimeout,
      maxSessionsPerUser: 5,
      enableApiKeyAuth: config.enableApiKeyAuth
    });

    this.securityMonitor = new SecurityMonitor(this.redis, {
      eventRetentionDays: 30,
      alertThresholds: {
        authFailuresPerMinute: 10,
        rateLimitHitsPerMinute: 50,
        suspiciousPatternsPerMinute: 20
      },
      blockThresholds: {
        authFailuresPerHour: 50,
        suspiciousEventsPerHour: 100
      }
    });

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
    this.logger.info('Initializing Leaderboard System components...');
    
    // Ensure output directories exist
    this.ensureDirectories();
    
    // Validate environment
    this.validateEnvironment();
    
    this.logger.info('System components initialized successfully');
  }

  /**
   * Ensures required directories exist
   */
  private async ensureDirectories(): Promise<void> {
    const directories = [
      this.config.testing.outputDir,
      `${this.config.testing.outputDir}/transformed`,
      `${this.config.testing.outputDir}/artifacts`,
      `${this.config.testing.outputDir}/reports`,
      `${this.config.testing.outputDir}/public`
    ];

    for (const dir of directories) {
      try {
        await mkdir(dir, { recursive: true });
      } catch (error) {
        this.logger.error({ error, dir }, 'Failed to create directory');
      }
    }
  }

  /**
   * Validates environment and dependencies
   */
  private validateEnvironment(): void {
    // Environment validation is now handled by loadEnvironment()
    // Test external dependencies
    this.validateExternalDependencies();
  }

  /**
   * Validates external tools and services
   */
  private validateExternalDependencies(): void {
    // Test c2patool availability
    try {
      require('child_process').execSync(`${this.config.testing.c2patoolPath} --version`, { timeout: 5000 });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        this.logger.error(`c2patool not found at ${this.config.testing.c2patoolPath}`);
      } else if (error.signal === 'SIGTERM') {
        this.logger.error(`c2patool timed out at ${this.config.testing.c2patoolPath}`);
      } else {
        this.logger.error(`c2patool failed with error code ${error.status} at ${this.config.testing.c2patoolPath}`);
      }
      throw new Error(`c2patool not available at ${this.config.testing.c2patoolPath}`);
    }

    // Test Redis connection
    this.redis.ping().catch((error) => {
      throw new Error(`Redis connection failed: ${error.message}`);
    });
  }

  /**
   * Sets up Fastify server with comprehensive security
   */
  private setupServer(): void {
    this.logger.info('Setting up secure web server...');

    // Register security plugins
    this.server.register(cors, {
      origin: process.env['ALLOWED_ORIGINS']?.split(',') || ['http://localhost:3000'],
      credentials: true
    });

    // Add security monitoring middleware
    this.server.addHook('preHandler', createSecurityMonitoringMiddleware(this.securityMonitor) as any);

    // Add security headers with CSP nonce support
    if (this.config.security.enableSecurityHeaders) {
      this.server.addHook('onRequest', async (_request, reply) => {
        const nonce = crypto.randomBytes(16).toString('base64');
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('X-Frame-Options', 'DENY');
        reply.header('X-XSS-Protection', '1; mode=block');
        reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
        reply.header('Content-Security-Policy', 
          `default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'nonce-${nonce}'; ` +
          `img-src 'self' data: https:; font-src 'self' https:; connect-src 'self' https:; ` +
          `object-src 'none'; base-uri 'self'; frame-ancestors 'none';`
        );
        reply.header('X-Permitted-Cross-Domain-Policies', 'none');
        reply.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      });
    }

    this.logger.info('Web server configured successfully');
  }

  /**
   * Sets up API routes
   */
  private setupRoutes(): void {
    this.logger.info('Setting up API routes...');
    
    // Delegate to web server
    this.webServer.setupRoutes();
    
    this.logger.info('API routes configured successfully');
  }

  /**
   * Sets up automated scheduling
   */
  private setupScheduling(): void {
    this.logger.info('Setting up automated scheduling...');

    // Weekly leaderboard update
    cron.schedule(this.config.leaderboard.updateSchedule, async () => {
      this.logger.info('Starting scheduled leaderboard update...');
      await this.runLeaderboardUpdate();
    }, {
      scheduled: false
    });

    this.logger.info(`Scheduling configured with pattern: ${this.config.leaderboard.updateSchedule}`);
  }

  /**
   * Starts the leaderboard system
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Leaderboard system is already running');
    }

    this.logger.info('Starting Leaderboard System...');

    try {
      // Start web server
      await this.server.listen({
        port: this.config.server.port,
        host: this.config.server.host
      });

      // Start scheduling
      cron.getTasks().forEach(task => task.start());

      this.isRunning = true;
      this.logger.info(`Leaderboard System started successfully on ${this.config.server.host}:${this.config.server.port}`);

    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Failed to start Leaderboard System');
      throw error;
    }
  }

  /**
   * Stops the leaderboard system
   */
  async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping Leaderboard System...');

    try {
      // Stop scheduling
      cron.getTasks().forEach(task => task.stop());

      // Cancel active tests
      for (const [id] of this.activeTests) {
        await this.testingEngine.cancelExecution(id);
      }

      // Stop web server
      await this.server.close();

      // Close Redis connection
      await this.redis.quit();

      this.isRunning = false;
      this.logger.info('Leaderboard System stopped successfully');

    } catch (error) {
      this.logger.error({ error: error instanceof Error ? error.message : String(error) }, 'Error stopping Leaderboard System');
      throw error;
    }
  }

  /**
   * Runs complete leaderboard update
   */
  async runLeaderboardUpdate(): Promise<LeaderboardData> {
    const runId = this.generateRunId();
    
    this.currentRun = {
      id: runId,
      version: this.config.leaderboard.version,
      timestamp: new Date(),
      commitHash: this.getCurrentCommitHash(),
      testEnvironment: this.getTestEnvironment(),
      duration: 0,
      status: 'running'
    };

    this.logger.info({ runId }, 'Starting leaderboard update...');

    try {
      const startTime = Date.now();
      
      // Execute test matrix
      const vendorData = await this.executeTestMatrix();
      
      // Calculate scores
      const summary = this.calculateSummary(vendorData);
      
      // Generate artifacts
      const artifacts = await this.generateArtifacts(runId);
      
      const leaderboardData: LeaderboardData = {
        run: this.currentRun,
        vendors: vendorData,
        summary,
        artifacts
      };

      // Update run metadata
      this.currentRun.duration = Date.now() - startTime;
      this.currentRun.status = 'completed';

      // Store results
      await this.storeResults(leaderboardData);
      
      this.lastRunTime = new Date();
      this.logger.info({ runId, duration: this.currentRun.duration }, 'Leaderboard update completed successfully');

      return leaderboardData;

    } catch (error) {
      if (this.currentRun) {
        this.currentRun.status = 'failed';
      }
      
      this.logger.error({ error: error instanceof Error ? error.message : String(error), runId }, 'Leaderboard update failed');
      throw error;
    }
  }

  /**
   * Executes complete test matrix for all vendors
   */
  private async executeTestMatrix(): Promise<any[]> {
    const vendorData: any[] = [];
    
    for (const vendor of VENDORS) {
      this.logger.info({ vendor: vendor.id }, 'Testing vendor...');
      
      try {
        // Execute default configuration tests
        const defaultExecutions = await this.testingEngine.executeVendorTests(
          vendor, 
          TEST_ASSETS, 
          'default'
        );
        
        // Execute best practice configuration tests
        const bestPracticeExecutions = await this.testingEngine.executeVendorTests(
          vendor, 
          TEST_ASSETS, 
          'best-practice'
        );
        
        const allExecutions = [...defaultExecutions, ...bestPracticeExecutions];
        
        // Calculate scores
        const scores = this.scoringEngine.calculateVendorScores(
          vendor.id,
          allExecutions,
          this.getVendorDocumentation(vendor)
        );
        
        // Update vendor scoring
        vendor.scoring = {
          defaultScore: scores.default,
          bestPracticeScore: scores.bestPractice,
          dimensions: scores.dimensions.map(d => ({
            name: d.dimensionId,
            points: d.bestPracticeScore,
            weight: 0.2,
            description: '',
            result: {
              passed: d.bestPracticeScore > 75,
              score: d.bestPracticeScore,
              details: {} as any,
              evidence: []
            }
          })),
          lastUpdated: new Date(),
          grade: scores.grade.bestPractice,
          improvementPath: scores.improvement.prerequisites
        };
        
        vendorData.push({
          vendor,
          executions: allExecutions,
          scores,
          trends: []
        });
        
        this.logger.info({ vendor: vendor.id, defaultScore: scores.default, bestPracticeScore: scores.bestPractice }, 'Vendor testing completed');
        
      } catch (error) {
        this.logger.error({ error: error instanceof Error ? error.message : String(error), vendor: vendor.id }, 'Vendor testing failed');
      }
    }
    
    return vendorData;
  }

  /**
   * Calculates summary statistics
   */
  private calculateSummary(vendorData: any[]): any {
    const totalVendors = vendorData.length;
    const totalTests = vendorData.reduce((sum, v) => sum + v.executions.length, 0);
    
    const scores = vendorData.map(v => v.scores);
    const averageDefaultScore = scores.reduce((sum, s) => sum + s.default, 0) / totalVendors;
    const averageBestPracticeScore = scores.reduce((sum, s) => sum + s.bestPractice, 0) / totalVendors;
    
    const greenVendors = scores.filter(s => s.grade.bestPractice === 'green').length;
    const yellowVendors = scores.filter(s => s.grade.bestPractice === 'yellow').length;
    const redVendors = scores.filter(s => s.grade.bestPractice === 'red').length;
    
    return {
      totalVendors,
      totalTests,
      averageDefaultScore: Math.round(averageDefaultScore),
      averageBestPracticeScore: Math.round(averageBestPracticeScore),
      greenVendors,
      yellowVendors,
      redVendors,
      testDuration: vendorData.reduce((sum, v) => sum + v.executions.reduce((s: number, e: TestExecution) => s + e.duration, 0), 0)
    };
  }

  /**
   * Generates data artifacts
   */
  private async generateArtifacts(runId: string): Promise<any[]> {
    const artifacts: any[] = [];
    
    // Generate NDJSON results
    const ndjsonPath = `${this.config.testing.outputDir}/public/${runId}-results.ndjson`;
    const ndjsonContent = this.generateNDJSONResults();
    await writeFile(ndjsonPath, ndjsonContent);
    
    artifacts.push({
      type: 'ndjson',
      filename: `${runId}-results.ndjson`,
      path: ndjsonPath,
      hash: this.createHash(ndjsonContent),
      downloadUrl: `${this.config.leaderboard.publicResultsUrl}/${runId}-results.ndjson`,
      size: ndjsonContent.length
    });
    
    return artifacts;
  }

  /**
   * Stores results in Redis and filesystem
   */
  private async storeResults(data: LeaderboardData): Promise<void> {
    // Store in Redis for quick access
    await this.redis.setex(
      `leaderboard:latest`,
      86400 * 7, // 7 days
      JSON.stringify(data)
    );
    
    await this.redis.setex(
      `leaderboard:${data.run.id}`,
      86400 * this.config.leaderboard.retentionDays,
      JSON.stringify(data)
    );
    
    // Store historical data
    await this.redis.zadd(
      'leaderboard:runs',
      data.run.timestamp.getTime(),
      data.run.id
    );
  }

  /**
   * Utility methods
   */
  private generateRunId(): string {
    return `run-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCurrentCommitHash(): string {
    try {
      return require('child_process').execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
    } catch {
      return 'unknown';
    }
  }

  private getTestEnvironment(): any {
    return {
      nodeVersion: process.version,
      c2paToolVersion: '0.10.0',
      verifyToolVersion: '1.0.0',
      os: process.platform,
      arch: process.arch,
      memory: require('os').totalmem(),
      cpu: require('os').cpus()[0].model
    };
  }

  private getVendorDocumentation(vendor: any): Record<string, string> {
    return {
      main: vendor.docsUrl,
      c2pa: vendor.docsUrl,
      support: vendor.supportUrl || ''
    };
  }

  private generateNDJSONResults(): string {
    // Generate NDJSON format for public consumption
    return '';
  }

  private createHash(content: string): string {
    return require('crypto').createHash('sha256').update(content).digest('hex');
  }

  /**
   * Public API methods
   */
  async getLatestResults(): Promise<LeaderboardData | null> {
    const data = await this.redis.get('leaderboard:latest');
    return data ? JSON.parse(data) : null;
  }

  async getResults(runId: string): Promise<LeaderboardData | null> {
    const data = await this.redis.get(`leaderboard:${runId}`);
    return data ? JSON.parse(data) : null;
  }

  async getPlaybook(vendorId: string, targetScore: number = 90): Promise<Playbook> {
    const latestResults = await this.getLatestResults();
    if (!latestResults) {
      throw new Error('No leaderboard results available');
    }

    const vendorData = latestResults.vendors.find(v => v.vendor.id === vendorId);
    if (!vendorData) {
      throw new Error(`Vendor not found: ${vendorId}`);
    }

    return this.playbookGenerator.generatePlaybook(
      vendorId,
      vendorData.scores,
      targetScore
    );
  }
}

// Bootstrap function with secure configuration loading
async function bootstrap(): Promise<void> {
  // Load and validate environment configuration
  const env = loadEnvironment();
  const configSummary = getConfigSummary(env);
  
  console.log('🔒 Secure configuration loaded:', JSON.stringify(configSummary, null, 2));
  
  const config: SystemConfig = {
    server: {
      host: env.HOST,
      port: env.PORT,
      trustProxy: process.env['TRUST_PROXY'] === 'true',
      bodyLimit: env.BODY_LIMIT,
      requestTimeout: env.REQUEST_TIMEOUT,
    },
    redis: {
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      db: env.REDIS_DB,
      password: env.REDIS_PASSWORD,
      maxRetriesPerRequest: env.REDIS_MAX_RETRIES,
    },
    logging: {
      level: env.LOG_LEVEL,
      pretty: env.LOG_FORMAT === 'pretty',
    },
    testing: {
      outputDir: env.OUTPUT_DIR,
      c2patoolPath: env.C2PATOOL_PATH,
      verifyToolPath: env.VERIFY_TOOL_PATH,
      timeoutMs: env.TEST_TIMEOUT,
      maxConcurrentTests: env.MAX_CONCURRENT_TESTS,
      retryAttempts: env.RETRY_ATTEMPTS,
      retryDelayMs: env.RETRY_DELAY,
    },
    leaderboard: {
      version: '1.1.0',
      updateSchedule: env.UPDATE_SCHEDULE,
      retentionDays: env.RETENTION_DAYS,
      publicResultsUrl: env.PUBLIC_RESULTS_URL,
    },
    security: {
      enableSecurityHeaders: env.ENABLE_SECURITY_HEADERS,
      rateLimitWindow: env.RATE_LIMIT_WINDOW,
      maxRequestsPerWindow: env.MAX_REQUESTS,
    },
    jwtSecret: env.JWT_SECRET,
    sessionTimeout: env.SESSION_TIMEOUT,
    enableApiKeyAuth: env.ENABLE_API_KEY_AUTH,
  };

  const system = new LeaderboardSystem(config);
  
  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\nShutting down Leaderboard System...');
    await system.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\nShutting down Leaderboard System...');
    await system.stop();
    process.exit(0);
  });

  try {
    await system.start();
  } catch (error) {
    console.error('Failed to start Leaderboard System:', error);
    process.exit(1);
  }
}

// Start system if running directly
if (require.main === module) {
  bootstrap().catch((error) => {
    console.error('Bootstrap failed:', error);
    process.exit(1);
  });
}

export { bootstrap };
