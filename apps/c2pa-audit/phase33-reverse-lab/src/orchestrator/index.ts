/**
 * Orchestrator - Phase 33 Reverse Lab
 * Manages and schedules provider/transform jobs with RFC 9309 compliance
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { nanoid } from 'nanoid';
import cron from 'node-cron';
import Redis from 'ioredis';
import pino from 'pino';

import type { 
  JobSpec, 
  JobResult, 
  ProviderProfile, 
  ChangeEvent,
  ApiResponse,
  PaginatedResponse,
  Provider 
} from '@/types/index.js';

// Mock data for development when config files are missing
const PROVIDERS: Record<string, Provider> = {
  'cloudflare-images': {
    id: 'cloudflare-images',
    name: 'Cloudflare Images',
    baseUrl: 'https://images.cloudflare.com',
    docs: { reference: 'https://developers.cloudflare.com/images/' },
    headers: {},
    rateLimit: { rps: 5, concurrency: 1, backoffMs: 5000 },
    transforms: ['resize_1200', 'webp_q80']
  }
};

const getSentinelAssets = () => [
  { id: 'c2pa-demo-001', name: 'C2PA Demo Image 1' }
];
import { Fetcher } from '@/fetcher/index.js';
import { Verifier } from '@/verifier/index.js';
import { Profiler } from '@/profiler/index.js';
import { RobotsComplianceChecker } from '@/fetcher/robots-checker.js';

export interface OrchestratorConfig {
  port: number;
  host: string;
  redis: {
    host: string;
    port: number;
    password?: string;
    db: number;
  };
  rateLimit: {
    global: number;
    perProvider: number;
  };
  scheduling: {
    weeklyJob: string; // cron pattern
    dailyCheck: string; // cron pattern
  };
  timeouts: {
    job: number; // milliseconds
    request: number; // milliseconds
    verification: number; // milliseconds
  };
}

export class Orchestrator {
  private server: FastifyInstance;
  private redis: Redis;
  private logger: pino.Logger;
  private config: OrchestratorConfig;
  private fetcher: Fetcher;
  private verifier: Verifier;
  private profiler: Profiler;
  private robotsChecker: RobotsComplianceChecker;

  // Job tracking
  private activeJobs = new Map<string, JobResult>();
  private jobQueue: JobSpec[] = [];
  private providerRateLimiters = new Map<string, { lastRequest: number; count: number }>();

  constructor(config: OrchestratorConfig) {
    this.config = config;
    this.logger = pino({
      level: 'info',
      transport: { target: 'pino-pretty' },
    });

    this.redis = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password,
      db: config.redis.db,
      tls: config.redis.host !== 'localhost' && config.redis.host !== '127.0.0.1' ? { enabled: true } : undefined,
      maxRetriesPerRequest: 3,
    });

    this.server = Fastify({
      logger: false, // Use our own logger
      trustProxy: false, // Disable to prevent header spoofing
      requestTimeout: config.timeouts.request,
    });

    this.fetcher = new Fetcher({
      timeout: config.timeouts.request,
      maxConcurrency: 10,
      respectRobots: true,
      defaultHeaders: {
        'User-Agent': 'Mozilla/5.0 (compatible; C2PA-Analyzer/1.0)',
      },
      maxRedirects: 5,
      maxResponseSize: 10485760, // 10MB
    });

    this.verifier = new Verifier({
      timeout: config.timeouts.verification,
      cacheResults: true,
      strictMode: true,
      maxManifestSize: 10485760, // 10MB
      allowedAlgorithms: ['ES256', 'ES384', 'ES512', 'RS256', 'RS384', 'RS512'],
    });

    this.profiler = new Profiler({
      outputDir: './src/profiles',
      redis: this.redis,
      logger: this.logger,
      changeThreshold: 0.05, // 5% change threshold
      minSentinelFlips: 3, // Minimum 3 sentinel flips
    });

    this.robotsChecker = new RobotsComplianceChecker({
      cacheTtl: 3600000, // 1 hour
      defaultDelay: 5000, // 5 seconds
      maxDelay: 30000, // 30 seconds
      userAgent: 'Mozilla/5.0 (compatible; C2PA-Analyzer/1.0)',
    });

    this.setupServer();
    this.setupRoutes();
    this.setupScheduling();
  }

  private setupServer(): void {
    // Register plugins
    this.server.register(cors, {
      origin: ['https://github.com', 'https://nickiller04.github.io'],
      credentials: true,
    });

    // Security headers middleware
    this.server.addHook('onRequest', (request, reply, done) => {
      // Set security headers
      reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:;");
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('X-XSS-Protection', '1; mode=block');
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      reply.header('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
      
      // Remove server header
      reply.removeHeader('server');
      
      done();
    });

    this.server.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    });

    this.server.register(rateLimit, {
      max: this.config.rateLimit.global,
      timeWindow: '1 minute',
      skipOnError: false,
      keyGenerator: (req: FastifyRequest) => req.ip,
    });

    this.server.register(swagger, {
      swagger: {
        info: {
          title: 'C2PA Reverse Lab API',
          description: 'Optimizer Behavior Fingerprinting and Tracking System',
          version: '1.1.0',
          contact: {
            name: 'C2PA Audit Team',
            url: 'https://github.com/Nickiller04/c2-concierge',
          },
        },
        host: `${this.config.host}:${this.config.port}`,
        schemes: ['https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        tags: [
          { name: 'jobs', description: 'Job management' },
          { name: 'profiles', description: 'Provider profiles' },
          { name: 'events', description: 'Change events' },
          { name: 'system', description: 'System status' },
        ],
      },
    });

    this.server.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
    });

    // Error handling
    this.server.setErrorHandler((error: Error, request: FastifyRequest, reply: FastifyReply) => {
      this.logger.error({ error, requestId: request.id }, 'Request error');
      
      reply.status(500).send({
        success: false,
        error: 'Internal server error',
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    });
  }

  private setupRoutes(): void {
    // Health check
    this.server.get('/health', async (request: FastifyRequest, reply: FastifyReply) => {
      const redisStatus = await this.redis.ping().catch(() => 'error');
      const memoryUsage = process.memoryUsage();
      
      return {
        success: true,
        data: {
          status: 'healthy',
          uptime: process.uptime(),
          memory: {
            rss: memoryUsage.rss,
            heapUsed: memoryUsage.heapUsed,
            heapTotal: memoryUsage.heapTotal,
          },
          redis: redisStatus === 'PONG' ? 'connected' : 'error',
          activeJobs: this.activeJobs.size,
          queuedJobs: this.jobQueue.length,
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse;
    });

    // Job management
    this.server.post('/reverse-lab/run', {
      schema: {
        tags: ['jobs'],
        body: {
          type: 'object',
          required: ['providers', 'transforms', 'runs'],
          properties: {
            providers: { type: 'array', items: { type: 'string' }, minItems: 1 },
            transforms: { type: 'array', items: { type: 'string' }, minItems: 1 },
            assets: { type: 'array', items: { type: 'string' } },
            runs: { type: 'integer', minimum: 1, maximum: 10 },
            priority: { type: 'string', enum: ['low', 'normal', 'high', 'weekly'] },
            timeout: { type: 'integer', minimum: 60000, maximum: 3600000 },
            cacheBust: { type: 'boolean' },
          },
        },
      },
    }, async (request: FastifyRequest<{ Body: Partial<JobSpec> }>, reply: FastifyReply) => {
      const jobSpec: JobSpec = {
        id: nanoid(),
        providers: request.body.providers || Object.keys(PROVIDERS),
        transforms: request.body.transforms || [],
        assets: request.body.assets || getSentinelAssets().map((a: any) => a.id),
        runs: request.body.runs || 3,
        priority: request.body.priority || 'normal',
        timeout: request.body.timeout || this.config.timeouts.job,
        cacheBust: request.body.cacheBust || false,
        scheduledAt: new Date().toISOString(),
      };

      // Validate providers and transforms
      for (const providerId of jobSpec.providers) {
        if (!PROVIDERS[providerId]) {
          reply.status(400).send({
            success: false,
            error: `Unknown provider: ${providerId}`,
            timestamp: new Date().toISOString(),
            requestId: request.id,
          } as ApiResponse);
          return;
        }
      }

      // Check robots compliance before scheduling
      const compliantProviders = await this.checkRobotsCompliance(jobSpec.providers);
      const nonCompliant = jobSpec.providers.filter(p => !compliantProviders.includes(p));
      
      if (nonCompliant.length > 0) {
        this.logger.warn({ nonCompliant }, 'Skipping non-compliant providers');
        jobSpec.providers = compliantProviders;
      }

      if (jobSpec.providers.length === 0) {
        reply.status(403).send({
          success: false,
          error: 'No compliant providers available for crawling',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        } as ApiResponse);
        return;
      }

      // Queue the job
      this.jobQueue.push(jobSpec);
      
      // Initialize job result
      const jobResult: JobResult = {
        jobId: jobSpec.id,
        status: 'pending',
        startedAt: new Date().toISOString(),
        totalCases: jobSpec.providers.length * jobSpec.transforms.length * jobSpec.assets.length * jobSpec.runs,
        completedCases: 0,
        failedCases: 0,
        profiles: [],
        changeEvents: [],
        summary: {
          providersProcessed: 0,
          transformsTested: 0,
          assetsAnalyzed: 0,
          successRate: 0,
          duration: 0,
        },
      };

      this.activeJobs.set(jobSpec.id, jobResult);

      // Start job processing asynchronously
      this.processJob(jobSpec).catch(error => {
        this.logger.error({ jobId: jobSpec.id, error }, 'Job processing failed');
        jobResult.status = 'failed';
        jobResult.completedAt = new Date().toISOString();
      });

      reply.status(202).send({
        success: true,
        data: {
          jobId: jobSpec.id,
          estimatedCases: jobResult.totalCases,
          providers: jobSpec.providers,
          transforms: jobSpec.transforms,
          priority: jobSpec.priority,
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    });

    // Get job results
    this.server.get('/reverse-lab/results/:jobId', {
      schema: {
        tags: ['jobs'],
        params: {
          type: 'object',
          required: ['jobId'],
          properties: {
            jobId: { type: 'string' },
          },
        },
      },
    }, async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      const jobResult = this.activeJobs.get(request.params.jobId);
      
      if (!jobResult) {
        reply.status(404).send({
          success: false,
          error: 'Job not found',
          timestamp: new Date().toISOString(),
          requestId: request.id,
        } as ApiResponse);
        return;
      }

      // Return NDJSON stream for detailed results
      if (request.headers.accept === 'application/x-ndjson') {
        reply.type('application/x-ndjson');
        
        // Stream detailed results as NDJSON
        const profileData = await this.profiler.getJobProfiles(request.params.jobId);
        
        const ndjsonContent = profileData.map(profile => JSON.stringify(profile)).join('\n') + '\n';
        reply.send(ndjsonContent);
        return;
      }

      return {
        success: true,
        data: jobResult,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse;
    });

    // List provider profiles
    this.server.get('/profiles', {
      schema: {
        tags: ['profiles'],
        querystring: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0 },
          },
        },
      },
    }, async (request: FastifyRequest<{ Querystring: { provider?: string; limit?: number; offset?: number } }>, reply: FastifyReply) => {
      const provider = request.query.provider;
      const limit = request.query.limit || 20;
      const offset = request.query.offset || 0;

      const profiles = await this.profiler.listProfiles(provider, limit, offset);
      const total = await this.profiler.countProfiles(provider);

      return {
        success: true,
        data: profiles,
        pagination: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as PaginatedResponse;
    });

    // Get change events
    this.server.get('/events', {
      schema: {
        tags: ['events'],
        querystring: {
          type: 'object',
          properties: {
            provider: { type: 'string' },
            severity: { type: 'string', enum: ['info', 'warning', 'critical'] },
            limit: { type: 'integer', minimum: 1, maximum: 100 },
            offset: { type: 'integer', minimum: 0 },
          },
        },
      },
    }, async (request: FastifyRequest<{ Querystring: { provider?: string; severity?: string; limit?: number; offset?: number } }>, reply: FastifyReply) => {
      const provider = request.query.provider;
      const severity = request.query.severity;
      const limit = request.query.limit || 20;
      const offset = request.query.offset || 0;

      const events = await this.profiler.listChangeEvents(provider, severity, limit, offset);
      const total = await this.profiler.countChangeEvents(provider, severity);

      return {
        success: true,
        data: events,
        pagination: {
          page: Math.floor(offset / limit) + 1,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as PaginatedResponse;
    });

    // System status
    this.server.get('/system/status', {
      schema: {
        tags: ['system'],
      },
    }, async (request: FastifyRequest, _reply: FastifyReply) => {
      const providerStatuses = await Promise.all(
        (Object.entries(PROVIDERS) as [string, Provider][]).map(async ([id, provider]) => {
          const compliance = await this.robotsChecker.checkCompliance(provider.baseUrl);
          const rateLimit = this.providerRateLimiters.get(id);
          
          return {
            id,
            name: provider.name,
            robotsCompliant: compliance.allowed,
            crawlDelay: compliance.crawlDelay,
            rateLimited: rateLimit ? rateLimit.count >= provider.rateLimit.rps : false,
          };
        })
      );

      return {
        success: true,
        data: {
          providers: providerStatuses,
          scheduler: {
            weeklyJobRunning: cron.getTasks().has(this.config.scheduling.weeklyJob),
            dailyCheckRunning: cron.getTasks().has(this.config.scheduling.dailyCheck),
          },
          performance: {
            activeJobs: this.activeJobs.size,
            queuedJobs: this.jobQueue.length,
            redisConnected: this.redis.status === 'ready',
          },
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse;
    });
  }

  private setupScheduling(): void {
    // Weekly comprehensive matrix run
    cron.schedule(this.config.scheduling.weeklyJob, async () => {
      this.logger.info('Starting weekly comprehensive matrix run');
      
      const weeklyJob: JobSpec = {
        id: nanoid(),
        providers: Object.keys(PROVIDERS),
        transforms: [], // All transforms
        assets: [], // All assets
        runs: 3,
        priority: 'weekly',
        timeout: this.config.timeouts.job * 2, // Double timeout for weekly job
        cacheBust: true,
        scheduledAt: new Date().toISOString(),
      };

      this.jobQueue.push(weeklyJob);
    });

    // Daily compliance check
    cron.schedule(this.config.scheduling.dailyCheck, async () => {
      this.logger.info('Starting daily compliance check');
      
      for (const [providerId, provider] of Object.entries(PROVIDERS) as [string, Provider][]) {
        if (!provider) {
          this.logger.error({ providerId }, 'Provider not found in daily check');
          continue;
        }
        
        const compliance = await this.robotsChecker.checkCompliance(provider.baseUrl);
        
        if (!compliance.allowed) {
          this.logger.warn({ providerId, compliance }, 'Provider robots compliance check failed');
          
          // Create change event for compliance failure
          const event: ChangeEvent = {
            id: nanoid(),
            providerId,
            detectedAt: new Date().toISOString(),
            changeType: 'behavior_flip',
            severity: 'warning',
            oldProfileHash: 'compliant',
            newProfileHash: 'non-compliant',
            affectedTransforms: [],
            evidence: [`robots.txt blocked: ${compliance.disallowedPaths.join(', ')}`],
            proposedRuleDiff: { [providerId]: { blocked: true } },
            impact: {
              affectedTenants: 0,
              embedSurvivalDrop: 0,
              remoteSurvivalAffected: false,
            },
          };

          await this.profiler.saveChangeEvent(event);
        }
      }
    });
  }

  private async checkRobotsCompliance(providers: string[]): Promise<string[]> {
    const compliant: string[] = [];
    
    for (const providerId of providers) {
      const provider = PROVIDERS[providerId];
      if (!provider) {
        this.logger.error({ providerId }, 'Provider not found in compliance check');
        continue;
      }
      
      const compliance = await this.robotsChecker.checkCompliance(provider.baseUrl);
      
      if (compliance.allowed) {
        compliant.push(providerId);
      } else {
        this.logger.warn({ providerId, compliance }, 'Provider not robots compliant');
      }
    }
    
    return compliant;
  }

  private async processJob(jobSpec: JobSpec): Promise<void> {
    const jobResult = this.activeJobs.get(jobSpec.id);
    if (!jobResult) return;

    jobResult.status = 'running';
    const startTime = Date.now();

    try {
      // Process each provider
      for (const providerId of jobSpec.providers) {
        const provider = PROVIDERS[providerId];
        if (!provider) {
          this.logger.error({ providerId }, 'Provider not found');
          continue;
        }
        
        // Check rate limiting
        await this.checkRateLimit(providerId, provider);
        
        // Generate provider profile
        const profile = await this.profiler.generateProfile({
          provider,
          transforms: jobSpec.transforms,
          assets: jobSpec.assets,
          runs: jobSpec.runs,
          cacheBust: jobSpec.cacheBust || false,
          jobId: jobSpec.id,
        });

        jobResult.profiles.push(`${providerId}/${profile.versionHint.profileVersion}.json`);
        
        // Detect change events
        const changeEvents = await this.profiler.detectChanges(providerId, profile);
        jobResult.changeEvents.push(...changeEvents);
        
        jobResult.summary.providersProcessed++;
      }

      jobResult.status = 'completed';
      jobResult.summary.successRate = jobResult.completedCases / jobResult.totalCases;
    } catch (error) {
      this.logger.error({ jobId: jobSpec.id, error }, 'Job processing failed');
      jobResult.status = 'failed';
    } finally {
      jobResult.completedAt = new Date().toISOString();
      jobResult.summary.duration = Date.now() - startTime;
    }
  }

  private async checkRateLimit(providerId: string, provider: any): Promise<void> {
    const now = Date.now();
    const limiter = this.providerRateLimiters.get(providerId) || { lastRequest: 0, count: 0 };
    
    // Reset count if we're past the rate limit window
    if (now - limiter.lastRequest > 1000) { // 1 second window
      limiter.count = 0;
    }
    
    // Check if we've exceeded the rate limit
    if (limiter.count >= provider.rateLimit.rps) {
      const delay = provider.rateLimit.backoffMs;
      this.logger.debug({ providerId, delay }, 'Rate limit hit, backing off');
      await new Promise(resolve => setTimeout(resolve, delay));
      limiter.count = 0;
    }
    
    limiter.lastRequest = now;
    limiter.count++;
    this.providerRateLimiters.set(providerId, limiter);
  }

  async start(): Promise<void> {
    try {
      await this.redis.connect();
      this.logger.info('Connected to Redis');
      
      await this.server.listen({ 
        port: this.config.port, 
        host: this.config.host 
      });
      
      this.logger.info({ port: this.config.port, host: this.config.host }, 'Reverse Lab Orchestrator started');
    } catch (error) {
      this.logger.error({ error }, 'Failed to start orchestrator');
      throw error;
    }
  }

  async stop(): Promise<void> {
    this.logger.info('Shutting down orchestrator');
    
    // Wait for active jobs to complete or timeout
    const maxWaitTime = 30000; // 30 seconds
    const startTime = Date.now();
    
    while (this.activeJobs.size > 0 && Date.now() - startTime < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    await this.server.close();
    await this.redis.disconnect();
    
    this.logger.info('Orchestrator stopped');
  }

  getServer(): FastifyInstance {
    return this.server;
  }
}
