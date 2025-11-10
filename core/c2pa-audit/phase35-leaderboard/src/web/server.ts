/**
 * Phase 35 Leaderboard - Web Server Interface
 * HTTP API and static site serving for leaderboard
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Redis } from 'ioredis';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { TestingEngine } from '@/core/testing-engine';
import { ScoringEngine } from '@/core/scoring-engine';
import { PlaybookGenerator } from '@/core/playbook-generator';
import { validateId } from '@/utils/security';
import { 
  createRateLimitMiddleware, 
  RateLimitConfig 
} from '@/utils/rate-limiter';
import {
  createValidationMiddleware,
  createSanitizationMiddleware,
  createSecurityHeadersMiddleware,
  createIPValidationMiddleware,
  createSizeLimitMiddleware,
  createUserAgentValidationMiddleware,
  GetVendorRequestSchema,
  GetPlaybookRequestSchema,
  SubmitCorrectionRequestSchema,
  SearchRequestSchema
} from '@/utils/validation';

import type { 
  LeaderboardData, 
  CorrectionSubmission
} from '@/types';

export interface WebServerConfig {
  fastify: FastifyInstance;
  redis: Redis;
  config: any;
  testingEngine: TestingEngine;
  scoringEngine: ScoringEngine;
  playbookGenerator: PlaybookGenerator;
}

export class LeaderboardWebServer {
  private config: WebServerConfig;
  
  constructor(config: WebServerConfig) {
    this.config = config;
  }

  /**
 * Sets up all API routes and static file serving
 */
setupRoutes(): void {
  // Setup security middleware first
  this.setupSecurityMiddleware();
  
  this.setupLeaderboardRoutes();
  this.setupVendorRoutes();
  this.setupPlaybookRoutes();
  this.setupCorrectionRoutes();
  this.setupDataRoutes();
  this.setupStaticRoutes();
  this.setupHealthRoutes();
}

/**
 * Sets up comprehensive security middleware
 */
private setupSecurityMiddleware(): void {
  const { fastify } = this.config;
  
  // Apply security middleware to all routes
  fastify.addHook('preHandler', createSecurityHeadersMiddleware());
  fastify.addHook('preHandler', createSanitizationMiddleware());
  fastify.addHook('preHandler', createIPValidationMiddleware());
  fastify.addHook('preHandler', createSizeLimitMiddleware(10 * 1024 * 1024)); // 10MB
  fastify.addHook('preHandler', createUserAgentValidationMiddleware());
  
  // Rate limiting configuration
  const rateLimitConfig: RateLimitConfig = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 100, // 100 requests per window
    keyGenerator: (request) => request.ip,
  };
  
  fastify.addHook('preHandler', createRateLimitMiddleware(this.config.redis, rateLimitConfig));
}

  /**
   * Main leaderboard endpoints
   */
  private setupLeaderboardRoutes(): void {
    const { fastify } = this.config;

    // Get latest leaderboard
    fastify.get('/api/leaderboard', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await this.config.redis.get('leaderboard:latest');
        
        if (!data) {
          return this.sendError(reply, 404, 'No leaderboard data available');
        }

        const leaderboardData: LeaderboardData = JSON.parse(data);
        
        return this.sendSuccess(reply, 200, {
          summary: leaderboardData.summary,
          vendors: leaderboardData.vendors.map(v => ({
            vendor: v.vendor,
            scores: v.scores,
            lastTested: leaderboardData.run.timestamp,
            status: 'current' as const,
            actions: [
              {
                type: 'view-details' as const,
                label: 'View Details',
                url: `/leaderboard/vendor/${v.vendor.id}`
              },
              {
                type: 'get-green' as const,
                label: 'Get Green Guide',
                url: `/leaderboard/playbooks/${v.vendor.id}`
              },
              {
                type: 'reproduce' as const,
                label: 'Reproduce Tests',
                url: `/leaderboard/data/${leaderboardData.run.id}.zip`
              }
            ]
          }))
        });
      } catch (error) {
        return this.sendError(reply, 500, 'Failed to retrieve leaderboard data');
      }
    });

    // Get leaderboard history
    fastify.get('/api/leaderboard/history', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const runIds = await this.config.redis.zrange('leaderboard:runs', 0, -1);
        const history = [];
        
        for (const runId of runIds.slice(0, 10)) { // Last 10 runs
          const data = await this.config.redis.get(`leaderboard:${runId}`);
          if (data) {
            const leaderboardData: LeaderboardData = JSON.parse(data);
            history.push({
              id: leaderboardData.run.id,
              timestamp: leaderboardData.run.timestamp,
              version: leaderboardData.run.version,
              summary: leaderboardData.summary
            });
          }
        }
        
        return this.sendSuccess(reply, 200, { history });
      } catch (error) {
        return this.sendError(reply, 500, 'Failed to retrieve leaderboard history');
      }
    });

    // Get specific run
    fastify.get('/api/leaderboard/run/:runId', 
      { preHandler: createValidationMiddleware(GetVendorRequestSchema) as any },
      async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { runId } = (request as any).validated as { runId: string };
        
        if (!validateId(runId)) {
          return this.sendError(reply, 400, 'Invalid run ID');
        }
        
        const data = await this.config.redis.get(`leaderboard:${runId}`);
        
        if (!data) {
          return this.sendError(reply, 404, 'Run not found');
        }
        
        const leaderboardData: LeaderboardData = JSON.parse(data);
        return this.sendSuccess(reply, 200, leaderboardData);
      } catch (error) {
        return this.sendError(reply, 500, 'Failed to retrieve run data');
      }
    });
  }

  /**
   * Vendor-specific endpoints
   */
  private setupVendorRoutes(): void {
    const { fastify } = this.config;

    // Get vendor details
    fastify.get('/api/vendor/:vendorId', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { vendorId } = request.params as { vendorId: string };
        
        if (!validateId(vendorId)) {
          return this.sendError(reply, 400, 'Invalid vendor ID');
        }
        
        const data = await this.config.redis.get('leaderboard:latest');
        if (!data) {
          return this.sendError(reply, 404, 'No leaderboard data available');
        }
        
        const leaderboardData: LeaderboardData = JSON.parse(data);
        const vendorData = leaderboardData.vendors.find(v => v.vendor.id === vendorId);
        
        if (!vendorData) {
          return this.sendError(reply, 404, 'Vendor not found');
        }
        
        return this.sendSuccess(reply, 200, {
          vendor: vendorData.vendor,
          executions: vendorData.executions,
          scores: vendorData.scores,
          trends: vendorData.trends,
          lastRun: leaderboardData.run.timestamp
        });
      } catch (error) {
        return this.sendError(reply, 500, 'Failed to retrieve vendor data');
      }
    });

    // Get vendor score breakdown
    fastify.get('/api/vendor/:vendorId/scores', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { vendorId } = request.params as { vendorId: string };
        
        if (!validateId(vendorId)) {
          return this.sendError(reply, 400, 'Invalid vendor ID');
        }
        
        const data = await this.config.redis.get('leaderboard:latest');
        if (!data) {
          return this.sendError(reply, 404, 'No leaderboard data available');
        }
        
        const leaderboardData: LeaderboardData = JSON.parse(data);
        const vendorData = leaderboardData.vendors.find(v => v.vendor.id === vendorId);
        
        if (!vendorData) {
          return this.sendError(reply, 404, 'Vendor not found');
        }
        
        const explanations = this.config.scoringEngine.generateScoreExplanation(
          vendorId,
          vendorData.scores,
          vendorData.executions
        );
        
        const recommendations = this.config.scoringEngine.generateImprovementRecommendations(
          vendorData.scores
        );
        
        return this.sendSuccess(reply, 200, {
          scores: vendorData.scores,
          explanations,
          recommendations,
          validation: this.config.scoringEngine.validateScores(vendorData.scores)
        });
      } catch (error) {
        return this.sendError(reply, 500, 'Failed to retrieve score breakdown');
      }
    });
  }

  /**
   * Playbook endpoints
   */
  private setupPlaybookRoutes(): void {
    const { fastify } = this.config;

    // Get vendor playbook
    fastify.get('/api/playbooks/:vendorId', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { vendorId } = request.params as { vendorId: string };
        const { targetScore } = request.query as { targetScore?: string };
        
        if (!validateId(vendorId)) {
          return this.sendError(reply, 400, 'Invalid vendor ID');
        }
        
        const target = targetScore ? parseInt(targetScore) : 90;
        if (isNaN(target) || target < 0 || target > 100) {
          return this.sendError(reply, 400, 'Invalid target score');
        }
        
        const data = await this.config.redis.get('leaderboard:latest');
        if (!data) {
          return this.sendError(reply, 404, 'No leaderboard data available');
        }
        
        const leaderboardData: LeaderboardData = JSON.parse(data);
        const vendorData = leaderboardData.vendors.find(v => v.vendor.id === vendorId);
        
        if (!vendorData) {
          return this.sendError(reply, 404, 'Vendor not found');
        }
        
        const playbook = this.config.playbookGenerator.generatePlaybook(
          vendorId,
          vendorData.scores,
          target
        );
        
        return this.sendSuccess(reply, 200, playbook);
      } catch (error) {
        return this.sendError(reply, 500, 'Failed to generate playbook');
      }
    });

    // List all playbooks
    fastify.get('/api/playbooks', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await this.config.redis.get('leaderboard:latest');
        if (!data) {
          return this.sendError(reply, 404, 'No leaderboard data available');
        }
        
        const leaderboardData: LeaderboardData = JSON.parse(data);
        const playbooks = leaderboardData.vendors.map(v => ({
          vendorId: v.vendor.id,
          vendorName: v.vendor.name,
          category: v.vendor.category,
          currentScore: v.scores.default,
          bestPracticeScore: v.scores.bestPractice,
          grade: v.scores.grade.bestPractice,
          estimatedTimeMinutes: v.scores.improvement.estimatedTimeMinutes,
          difficulty: v.scores.improvement.difficulty
        }));
        
        return this.sendSuccess(reply, 200, { playbooks });
      } catch (error) {
        return this.sendError(reply, 500, 'Failed to retrieve playbooks');
      }
    });
  }

  /**
   * Correction submission endpoints
   */
  private setupCorrectionRoutes(): void {
    const { fastify } = this.config;

    // Submit correction
    fastify.post('/api/corrections', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const correction = request.body as CorrectionSubmission;
        
        // Validate correction data
        if (!this.validateCorrection(correction)) {
          return this.sendError(reply, 400, 'Invalid correction data');
        }
        
        // Generate correction ID
        const correctionId = `correction-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        correction.id = correctionId;
        correction.submittedAt = new Date();
        correction.status = 'pending';
        
        // Store correction
        await this.config.redis.setex(
          `correction:${correctionId}`,
          86400 * 30, // 30 days
          JSON.stringify(correction)
        );
        
        // Add to corrections queue
        await this.config.redis.lpush('corrections:queue', correctionId);
        
        this.config.config.logger.info({ correctionId, vendorId: correction.vendorId }, 'Correction submitted');
        
        return this.sendSuccess(reply, 201, { 
          correctionId,
          status: 'pending',
          message: 'Correction submitted successfully. We will review within 7 days.'
        });
      } catch (error) {
        return this.sendError(reply, 500, 'Failed to submit correction');
      }
    });

    // Get correction status
    fastify.get('/api/corrections/:correctionId', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { correctionId } = request.params as { correctionId: string };
        
        if (!validateId(correctionId)) {
          return this.sendError(reply, 400, 'Invalid correction ID');
        }
        
        const data = await this.config.redis.get(`correction:${correctionId}`);
        if (!data) {
          return this.sendError(reply, 404, 'Correction not found');
        }
        
        const correction: CorrectionSubmission = JSON.parse(data);
        
        // Return limited data for privacy
        return this.sendSuccess(reply, 200, {
          id: correction.id,
          vendorId: correction.vendorId,
          correctionType: correction.correctionType,
          status: correction.status,
          submittedAt: correction.submittedAt,
          reviewNotes: correction.reviewNotes,
          retestDate: correction.retestDate
        });
      } catch (error) {
        return this.sendError(reply, 500, 'Failed to retrieve correction status');
      }
    });
  }

  /**
   * Data download endpoints
   */
  private setupDataRoutes(): void {
    const { fastify } = this.config;

    // Get data downloads
    fastify.get('/api/data', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { runId } = request.query as { runId?: string };
        
        let data;
        if (runId) {
          data = await this.config.redis.get(`leaderboard:${runId}`);
        } else {
          data = await this.config.redis.get('leaderboard:latest');
        }
        
        if (!data) {
          return this.sendError(reply, 404, 'No data available');
        }
        
        const leaderboardData: LeaderboardData = JSON.parse(data);
        
        return this.sendSuccess(reply, 200, {
          runId: leaderboardData.run.id,
          artifacts: leaderboardData.artifacts.map(artifact => ({
            type: artifact.type,
            filename: artifact.filename,
            size: artifact.size,
            downloadUrl: artifact.downloadUrl,
            hash: artifact.hash
          }))
        });
      } catch (error) {
        return this.sendError(reply, 500, 'Failed to retrieve data downloads');
      }
    });

    // Download specific artifact
    fastify.get('/data/:filename', async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { filename } = request.params as { filename: string };
        
        // Validate filename
        if (!filename.match(/^[a-zA-Z0-9._-]+$/)) {
          return this.sendError(reply, 400, 'Invalid filename');
        }
        
        const filePath = join(this.config.config.testing.outputDir, 'public', filename);
        
        try {
          const fileContent = await readFile(filePath);
          
          reply.header('Content-Type', 'application/octet-stream');
          reply.header('Content-Disposition', `attachment; filename="${filename}"`);
          reply.header('Cache-Control', 'public, max-age=31536000');
          
          return reply.send(fileContent);
        } catch (fileError) {
          return this.sendError(reply, 404, 'File not found');
        }
      } catch (error) {
        return this.sendError(reply, 500, 'Failed to download file');
      }
    });
  }

  /**
   * Static file serving
   */
  private setupStaticRoutes(): void {
    const { fastify } = this.config;

    // Register static file serving
    void this.config.fastify.register(require('@fastify/static'), {
      root: join(__dirname, '../../public'),
      prefix: '/public/',
    } as any);

    // Serve documentation
    fastify.get('/leaderboard/methodology', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const methodologyPath = join(__dirname, '../../docs/methodology.md');
        const content = await readFile(methodologyPath, 'utf-8');
        
        reply.header('Content-Type', 'text/markdown');
        return reply.send(content);
      } catch (error) {
        return this.sendError(reply, 404, 'Methodology documentation not found');
      }
    });

    // Main leaderboard page
    fastify.get('/leaderboard', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const indexPath = join(__dirname, '../../public/leaderboard/index.html');
        const content = await readFile(indexPath, 'utf-8');
        
        reply.header('Content-Type', 'text/html');
        return reply.send(content);
      } catch (error) {
        return this.sendError(reply, 404, 'Leaderboard page not found');
      }
    });
  }

  /**
   * Health and monitoring endpoints
   */
  private setupHealthRoutes(): void {
    const { fastify } = this.config;

    // Health check
    fastify.get('/health', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const redisHealth = await this.checkRedisHealth();
        const systemHealth = await this.checkSystemHealth();
        
        return this.sendSuccess(reply, 200, {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          version: '1.1.0',
          health: {
            redis: redisHealth,
            system: systemHealth
          }
        });
      } catch (error) {
        return this.sendError(reply, 500, 'Health check failed');
      }
    });

    // System status
    fastify.get('/api/status', async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const data = await this.config.redis.get('leaderboard:latest');
        const lastRun = data ? JSON.parse(data).run : null;
        
        return this.sendSuccess(reply, 200, {
          system: {
            status: 'operational',
            uptime: process.uptime(),
            memory: process.memoryUsage(),
            version: '1.1.0'
          },
          lastRun,
          activeTests: this.config.testingEngine.getActiveTestCount(),
          nextUpdate: this.getNextUpdateTime()
        });
      } catch (error) {
        return this.sendError(reply, 500, 'Failed to get system status');
      }
    });
  }

  /**
   * Helper methods
   */
  private sendSuccess(reply: FastifyReply, statusCode: number, data: any): void {
    reply.code(statusCode).send({
      success: true,
      data,
      timestamp: new Date().toISOString(),
      requestId: this.generateRequestId()
    });
  }

  private sendError(reply: FastifyReply, statusCode: number, message: string): void {
    reply.code(statusCode).send({
      success: false,
      error: message,
      timestamp: new Date().toISOString(),
      requestId: this.generateRequestId()
    });
  }

  private generateRequestId(): string {
    return `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private validateCorrection(correction: CorrectionSubmission): boolean {
    return (
      !!correction.vendorId &&
      !!correction.correctionType &&
      !!correction.description &&
      !!correction.submitterInfo &&
      !!correction.submitterInfo.name &&
      !!correction.submitterInfo.email &&
      correction.submitterInfo.email.includes('@')
    );
  }

  private async checkRedisHealth(): Promise<any> {
    try {
      const start = Date.now();
      await this.config.redis.ping();
      const latency = Date.now() - start;
      
      return {
        status: 'healthy',
        latency,
        connected: true
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error instanceof Error ? error.message : String(error),
        connected: false
      };
    }
  }

  private async checkSystemHealth(): Promise<any> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    
    return {
      status: 'healthy',
      memory: {
        used: memUsage.heapUsed,
        total: memUsage.heapTotal,
        external: memUsage.external
      },
      cpu: cpuUsage,
      uptime: process.uptime()
    };
  }

  private getNextUpdateTime(): string {
    // Simple calculation - in production this would parse the cron schedule
    const nextUpdate = new Date();
    nextUpdate.setDate(nextUpdate.getDate() + ((1 + 7 - nextUpdate.getDay()) % 7 || 7));
    nextUpdate.setHours(2, 0, 0, 0);
    return nextUpdate.toISOString();
  }
}
