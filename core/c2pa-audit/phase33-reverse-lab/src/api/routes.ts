/**
 * API Routes - Phase 33 Reverse Lab
 * REST API endpoints for job management, profiles, and system monitoring
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { nanoid } from 'nanoid';
import type { 
  JobSpec, 
  JobResult, 
  ProviderProfile, 
  ChangeEvent,
  ApiResponse,
  PaginatedResponse 
} from '@/types/index.js';
import { Orchestrator } from '@/orchestrator/index.js';
import { DocumentationAdapter } from '@/adapters/doc-adapter.js';

export async function registerApiRoutes(
  server: FastifyInstance, 
  orchestrator: Orchestrator,
  docAdapter: DocumentationAdapter
): Promise<void> {

  // ===== JOB MANAGEMENT =====

  // Submit new reverse lab job
  server.post('/api/v1/jobs', {
    schema: {
      tags: ['jobs'],
      summary: 'Submit a new reverse lab job',
      body: {
        type: 'object',
        required: ['providers', 'transforms', 'runs'],
        properties: {
          providers: { 
            type: 'array', 
            items: { type: 'string' }, 
            minItems: 1,
            description: 'List of provider IDs to test'
          },
          transforms: { 
            type: 'array', 
            items: { type: 'string' }, 
            minItems: 1,
            description: 'List of transform IDs to apply'
          },
          assets: { 
            type: 'array', 
            items: { type: 'string' },
            description: 'List of asset IDs to use (defaults to sentinel assets)'
          },
          runs: { 
            type: 'integer', 
            minimum: 1, 
            maximum: 10,
            default: 3,
            description: 'Number of runs per test case'
          },
          priority: { 
            type: 'string', 
            enum: ['low', 'normal', 'high', 'weekly'],
            default: 'normal',
            description: 'Job priority level'
          },
          timeout: { 
            type: 'integer', 
            minimum: 60000, 
            maximum: 3600000,
            description: 'Job timeout in milliseconds'
          },
          cacheBust: { 
            type: 'boolean',
            default: false,
            description: 'Whether to bypass caches'
          },
        },
      },
      response: {
        202: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                jobId: { type: 'string' },
                estimatedCases: { type: 'integer' },
                providers: { type: 'array', items: { type: 'string' } },
                transforms: { type: 'array', items: { type: 'string' } },
                priority: { type: 'string' },
              },
            },
            timestamp: { type: 'string' },
            requestId: { type: 'string' },
          },
        },
        400: { $ref: '#/components/schemas/ApiResponse' },
        403: { $ref: '#/components/schemas/ApiResponse' },
      },
    },
  }, async (request: FastifyRequest<{ Body: Partial<JobSpec> }>, reply: FastifyReply) => {
    try {
      // Forward to orchestrator's existing job endpoint
      const orchestratorReply = await orchestrator.getServer().inject({
        method: 'POST',
        url: '/reverse-lab/run',
        payload: request.body,
        headers: request.headers,
      });

      const response = JSON.parse(orchestratorReply.payload);
      
      reply.status(orchestratorReply.statusCode).send(response);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to submit job: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // Get job status and results
  server.get('/api/v1/jobs/:jobId', {
    schema: {
      tags: ['jobs'],
      summary: 'Get job status and results',
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: { type: 'string', description: 'Job ID' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          format: { 
            type: 'string', 
            enum: ['json', 'ndjson'],
            default: 'json',
            description: 'Response format'
          },
          includeDetails: { 
            type: 'boolean',
            default: false,
            description: 'Include detailed test case results'
          },
        },
      },
      response: {
        200: {
          oneOf: [
            { $ref: '#/components/schemas/ApiResponse' },
            { type: 'string', description: 'NDJSON stream' },
          ],
        },
        404: { $ref: '#/components/schemas/ApiResponse' },
      },
    },
  }, async (request: FastifyRequest<{ Params: { jobId: string }, Querystring: { format?: string; includeDetails?: boolean } }>, reply: FastifyReply) => {
    try {
      const headers = { ...request.headers };
      if (request.query.format === 'ndjson') {
        headers.accept = 'application/x-ndjson';
      }

      const orchestratorReply = await orchestrator.getServer().inject({
        method: 'GET',
        url: `/reverse-lab/results/${request.params.jobId}`,
        headers,
      });

      if (request.query.format === 'ndjson') {
        reply.type('application/x-ndjson');
        reply.send(orchestratorReply.payload);
      } else {
        const response = JSON.parse(orchestratorReply.payload);
        reply.status(orchestratorReply.statusCode).send(response);
      }
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to get job: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // List all jobs
  server.get('/api/v1/jobs', {
    schema: {
      tags: ['jobs'],
      summary: 'List all jobs',
      querystring: {
        type: 'object',
        properties: {
          status: { 
            type: 'string', 
            enum: ['pending', 'running', 'completed', 'failed', 'cancelled'],
            description: 'Filter by job status'
          },
          provider: { 
            type: 'string',
            description: 'Filter by provider ID'
          },
          limit: { 
            type: 'integer', 
            minimum: 1, 
            maximum: 100,
            default: 20,
            description: 'Maximum number of jobs to return'
          },
          offset: { 
            type: 'integer', 
            minimum: 0,
            default: 0,
            description: 'Number of jobs to skip'
          },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/PaginatedResponse' },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { status?: string; provider?: string; limit?: number; offset?: number } }>, reply: FastifyReply) => {
    try {
      // This would query the job database
      // For now, return mock data
      const jobs = [];
      
      reply.send({
        success: true,
        data: jobs,
        pagination: {
          page: Math.floor((request.query.offset || 0) / (request.query.limit || 20)) + 1,
          limit: request.query.limit || 20,
          total: 0,
          totalPages: 0,
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as PaginatedResponse);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to list jobs: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // Cancel a job
  server.delete('/api/v1/jobs/:jobId', {
    schema: {
      tags: ['jobs'],
      summary: 'Cancel a running job',
      params: {
        type: 'object',
        required: ['jobId'],
        properties: {
          jobId: { type: 'string' },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/ApiResponse' },
        404: { $ref: '#/components/schemas/ApiResponse' },
      },
    },
  }, async (request: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
    try {
      // Implementation would cancel the job
      reply.send({
        success: true,
        data: { cancelled: true, jobId: request.params.jobId },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to cancel job: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // ===== PROVIDER PROFILES =====

  // Get provider profiles
  server.get('/api/v1/profiles', {
    schema: {
      tags: ['profiles'],
      summary: 'Get provider behavior profiles',
      querystring: {
        type: 'object',
        properties: {
          provider: { 
            type: 'string',
            description: 'Filter by provider ID'
          },
          version: { 
            type: 'string',
            description: 'Filter by profile version'
          },
          limit: { 
            type: 'integer', 
            minimum: 1, 
            maximum: 100,
            default: 20,
          },
          offset: { 
            type: 'integer', 
            minimum: 0,
            default: 0,
          },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/PaginatedResponse' },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { provider?: string; version?: string; limit?: number; offset?: number } }>, reply: FastifyReply) => {
    try {
      const orchestratorReply = await orchestrator.getServer().inject({
        method: 'GET',
        url: '/profiles',
        query: request.query,
      });

      const response = JSON.parse(orchestratorReply.payload);
      reply.status(orchestratorReply.statusCode).send(response);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to get profiles: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // Get specific provider profile
  server.get('/api/v1/profiles/:providerId/:version', {
    schema: {
      tags: ['profiles'],
      summary: 'Get specific provider profile version',
      params: {
        type: 'object',
        required: ['providerId', 'version'],
        properties: {
          providerId: { type: 'string' },
          version: { type: 'string' },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/ApiResponse' },
        404: { $ref: '#/components/schemas/ApiResponse' },
      },
    },
  }, async (request: FastifyRequest<{ Params: { providerId: string; version: string } }>, reply: FastifyReply) => {
    try {
      // Implementation would fetch specific profile
      reply.send({
        success: true,
        data: null, // Profile data
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to get profile: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // Compare provider profiles
  server.get('/api/v1/profiles/:providerId/compare', {
    schema: {
      tags: ['profiles'],
      summary: 'Compare two provider profile versions',
      params: {
        type: 'object',
        required: ['providerId'],
        properties: {
          providerId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        required: ['from', 'to'],
        properties: {
          from: { type: 'string', description: 'From version' },
          to: { type: 'string', description: 'To version' },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/ApiResponse' },
      },
    },
  }, async (request: FastifyRequest<{ Params: { providerId: string }, Querystring: { from: string; to: string } }>, reply: FastifyReply) => {
    try {
      // Implementation would compare profiles
      reply.send({
        success: true,
        data: {
          providerId: request.params.providerId,
          from: request.query.from,
          to: request.query.to,
          changes: [], // Comparison results
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to compare profiles: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // ===== CHANGE EVENTS =====

  // Get change events
  server.get('/api/v1/events', {
    schema: {
      tags: ['events'],
      summary: 'Get optimizer behavior change events',
      querystring: {
        type: 'object',
        properties: {
          provider: { 
            type: 'string',
            description: 'Filter by provider ID'
          },
          severity: { 
            type: 'string', 
            enum: ['info', 'warning', 'critical'],
            description: 'Filter by severity level'
          },
          type: { 
            type: 'string', 
            enum: ['behavior_flip', 'header_drift', 'manifest_loss', 'manifest_gain'],
            description: 'Filter by change type'
          },
          from: { 
            type: 'string',
            format: 'date-time',
            description: 'Filter events from this date'
          },
          to: { 
            type: 'string',
            format: 'date-time',
            description: 'Filter events to this date'
          },
          limit: { 
            type: 'integer', 
            minimum: 1, 
            maximum: 100,
            default: 20,
          },
          offset: { 
            type: 'integer', 
            minimum: 0,
            default: 0,
          },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/PaginatedResponse' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orchestratorReply = await orchestrator.getServer().inject({
        method: 'GET',
        url: '/events',
        query: request.query,
      });

      const response = JSON.parse(orchestratorReply.payload);
      reply.status(orchestratorReply.statusCode).send(response);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to get events: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // Get specific change event
  server.get('/api/v1/events/:eventId', {
    schema: {
      tags: ['events'],
      summary: 'Get specific change event',
      params: {
        type: 'object',
        required: ['eventId'],
        properties: {
          eventId: { type: 'string' },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/ApiResponse' },
        404: { $ref: '#/components/schemas/ApiResponse' },
      },
    },
  }, async (request: FastifyRequest<{ Params: { eventId: string } }>, reply: FastifyReply) => {
    try {
      // Implementation would fetch specific event
      reply.send({
        success: true,
        data: null, // Event data
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to get event: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // ===== DOCUMENTATION =====

  // Get provider documentation snapshot
  server.get('/api/v1/docs/:providerId', {
    schema: {
      tags: ['documentation'],
      summary: 'Get provider documentation snapshot',
      params: {
        type: 'object',
        required: ['providerId'],
        properties: {
          providerId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        properties: {
          refresh: { 
            type: 'boolean',
            default: false,
            description: 'Force refresh of documentation cache'
          },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/ApiResponse' },
      },
    },
  }, async (request: FastifyRequest<{ Params: { providerId: string }, Querystring: { refresh?: boolean } }>, reply: FastifyReply) => {
    try {
      if (request.query.refresh) {
        docAdapter.clearCache();
      }

      const snapshot = await docAdapter.captureDocumentation(request.params.providerId);
      
      reply.send({
        success: true,
        data: snapshot,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to get documentation: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // Search provider documentation
  server.get('/api/v1/docs/:providerId/search', {
    schema: {
      tags: ['documentation'],
      summary: 'Search provider documentation',
      params: {
        type: 'object',
        required: ['providerId'],
        properties: {
          providerId: { type: 'string' },
        },
      },
      querystring: {
        type: 'object',
        required: ['q'],
        properties: {
          q: { 
            type: 'string',
            description: 'Search query'
          },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/ApiResponse' },
      },
    },
  }, async (request: FastifyRequest<{ Params: { providerId: string }, Querystring: { q: string } }>, reply: FastifyReply) => {
    try {
      const results = await docAdapter.searchDocumentation(request.params.providerId, request.query.q);
      
      reply.send({
        success: true,
        data: results,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to search documentation: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // Get C2PA statements from documentation
  server.get('/api/v1/docs/:providerId/c2pa', {
    schema: {
      tags: ['documentation'],
      summary: 'Extract C2PA-related statements from documentation',
      params: {
        type: 'object',
        required: ['providerId'],
        properties: {
          providerId: { type: 'string' },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/ApiResponse' },
      },
    },
  }, async (request: FastifyRequest<{ Params: { providerId: string } }>, reply: FastifyReply) => {
    try {
      const statements = await docAdapter.extractC2PAStatements(request.params.providerId);
      
      reply.send({
        success: true,
        data: statements,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to extract C2PA statements: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // ===== SYSTEM STATUS =====

  // Get system health and status
  server.get('/api/v1/system/status', {
    schema: {
      tags: ['system'],
      summary: 'Get system health and status',
      response: {
        200: { $ref: '#/components/schemas/ApiResponse' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const orchestratorReply = await orchestrator.getServer().inject({
        method: 'GET',
        url: '/system/status',
      });

      const response = JSON.parse(orchestratorReply.payload);
      reply.status(orchestratorReply.statusCode).send(response);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to get system status: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // Get system metrics
  server.get('/api/v1/system/metrics', {
    schema: {
      tags: ['system'],
      summary: 'Get system performance metrics',
      querystring: {
        type: 'object',
        properties: {
          period: { 
            type: 'string', 
            enum: ['1h', '24h', '7d', '30d'],
            default: '24h',
            description: 'Time period for metrics'
          },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/ApiResponse' },
      },
    },
  }, async (request: FastifyRequest<{ Querystring: { period?: string } }>, reply: FastifyReply) => {
    try {
      // Implementation would return system metrics
      reply.send({
        success: true,
        data: {
          period: request.query.period || '24h',
          metrics: {
            requests: { total: 0, successful: 0, failed: 0 },
            responseTime: { avg: 0, p95: 0, p99: 0 },
            jobs: { completed: 0, failed: 0, running: 0 },
            profiles: { generated: 0, cached: 0 },
            errors: { total: 0, byType: {} },
          },
        },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to get metrics: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });

  // ===== WEBHOOKS =====

  // Webhook for change event notifications
  server.post('/api/v1/webhooks/change-events', {
    schema: {
      tags: ['webhooks'],
      summary: 'Receive change event notifications',
      body: {
        type: 'object',
        required: ['type', 'data'],
        properties: {
          type: { type: 'string' },
          data: { type: 'object' },
          timestamp: { type: 'string' },
          signature: { type: 'string' },
        },
      },
      response: {
        200: { $ref: '#/components/schemas/ApiResponse' },
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Implementation would handle webhook
      reply.send({
        success: true,
        data: { received: true },
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    } catch (error) {
      reply.status(500).send({
        success: false,
        error: `Failed to process webhook: ${error.message}`,
        timestamp: new Date().toISOString(),
        requestId: request.id,
      } as ApiResponse);
    }
  });
}
