/**
 * Phase 48 - Compliance v2 API Server
 * REST API Interface for Compliance Pack Generation
 */

import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import cors from '@fastify/cors';
import { CompliancePackGenerator, PackGenerationRequest as GenPackGenerationRequest, PackGenerationResponse } from './generator.js';
import { ComplianceReportingHarmonizer, ComplianceDataSource } from './reporting.js';
import { RetentionPolicyManager, RetentionPolicy } from './retention.js';
import { COMPLIANCE_ASSERTIONS, REGION_ASSERTION_MAP } from './assertions.js';

// API Interface Definitions
export interface CompliancePackAPIRequest {
  tenant_id: string;
  period: string;                    // YYYY-MM format
  regions: Array<"EU" | "UK" | "US" | "BR">;
  include_samples?: number;         // Default: 25
  format: "pdf" | "json" | "both";  // Default: "both"
  dry_run?: boolean;                // Default: false
}

// SECURITY: Added input validation interfaces
export interface ValidatedCompliancePackAPIRequest extends CompliancePackAPIRequest {
  tenant_id: string;                // Validated: non-empty, max 100 chars, alphanumeric
  period: string;                   // Validated: YYYY-MM format
  regions: Array<"EU" | "UK" | "US" | "BR">; // Validated: 1-4 regions, unique
  include_samples: number;          // Validated: 0-100
  format: "pdf" | "json" | "both";  // Validated: enum
  dry_run: boolean;                 // Validated: boolean
}

export interface RetentionPolicyAPIRequest {
  tenant_id: string;
  regions: Array<"EU" | "UK" | "US" | "BR">;
  existing_legal_hold?: boolean;    // Default: false
}

export interface ComplianceStatusAPIResponse {
  tenant_id: string;
  regions: Array<"EU" | "UK" | "US" | "BR">;
  status: "active" | "inactive" | "pending";
  last_pack_generated?: string;
  next_pack_scheduled?: string;
  retention_policy: RetentionPolicy;
  template_versions: Record<string, string>;
  compliance_score: number;
  alerts: Array<{
    type: "warning" | "error" | "info";
    message: string;
    timestamp: string;
  }>;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
}

interface ComplianceReportingConfig {
  [key: string]: unknown;
}

export class ComplianceAPIServer {
  private fastify: FastifyInstance;
  private generator: CompliancePackGenerator;
  private harmonizer: ComplianceReportingHarmonizer;
  private storageBaseUrl: string;

  constructor(storageBaseUrl: string = "https://api.c2concierge.com") {
    this.fastify = Fastify({
      logger: true,
      trustProxy: true
    });
    
    // SECURITY: Validate storage URL protocol
    if (!storageBaseUrl.startsWith('https://') && process.env.NODE_ENV === 'production') {
      throw new Error('HTTPS required for storage base URL in production');
    }
    
    this.storageBaseUrl = storageBaseUrl;
    this.harmonizer = new ComplianceReportingHarmonizer({} as ComplianceReportingConfig);
    this.generator = new CompliancePackGenerator(this.harmonizer, storageBaseUrl);
    
    this.setupRoutes();
    this.setupMiddleware();
  }

  private setupMiddleware() {
    // SECURITY: Add rate limiting before CORS (skip for health endpoint)
    this.fastify.addHook('preHandler', async (request, reply) => {
      // Skip auth for health endpoint
      if (request.url === '/health') {
        return;
      }
      
      // SECURITY: Rate limiting implementation placeholder
      // Production: Implement Redis-based rate limiting with configurable limits
      const clientIP = request.ip;
      
      // SECURITY: Authentication check
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Valid authentication required'
        });
      }
      
      // SECURITY: JWT validation implementation placeholder
      // Production: Implement proper JWT token validation with signature verification
    });

    // CORS configuration
    this.fastify.register(cors, {
      origin: false, // SECURITY: Disabled open origin, configure specific domains
      credentials: false // SECURITY: Disabled credentials until proper auth implemented
    });

    // Request validation middleware
    this.fastify.addHook('preHandler', async (request, reply) => {
      // Add API version headers
      reply.header('API-Version', 'v1');
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('X-XSS-Protection', '1; mode=block');
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      reply.header('Content-Security-Policy', "default-src 'self'");
    });

    // Error handling
    this.fastify.setErrorHandler((error, request, reply) => {
      // SECURITY: Log errors securely without exposing sensitive information
      if (error.validation) {
        reply.status(400).send({
          error: 'Validation Error',
          message: 'Request validation failed',
          details: error.validation
        });
        return;
      }

      // SECURITY: Generic error message to prevent information disclosure
      reply.status(500).send({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
        request_id: request.id
      });
    });
  }

  private setupRoutes() {
    // Health check endpoint
    this.fastify.get('/health', async (request, reply) => {
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        uptime: process.uptime()
      };
    });

    // Generate Compliance Pack
    this.fastify.post<{
      Body: CompliancePackAPIRequest;
      Reply: PackGenerationResponse | { error: string; details: ValidationError[] };
    }>('/compliance/packs', {
      // SECURITY: Enhanced validation schema with strict input sanitization
        schema: {
          body: {
            type: 'object',
            required: ['tenant_id', 'period', 'regions', 'format'],
            properties: {
              tenant_id: { 
                type: 'string', 
                minLength: 1, 
                maxLength: 100,
                pattern: '^[a-zA-Z0-9_-]+$',
                description: 'Tenant identifier (alphanumeric, underscore, hyphen only)'
              },
              period: { 
                type: 'string', 
                pattern: '^\\d{4}-(0[1-9]|1[0-2])$',
                description: 'Period in YYYY-MM format (valid months only)'
              },
              regions: { 
                type: 'array',
                items: { type: 'string', enum: ['EU', 'UK', 'US', 'BR'] },
                minItems: 1,
                maxItems: 4,
                uniqueItems: true
              },
              include_samples: { type: 'integer', minimum: 0, maximum: 100, default: 25 },
              format: { type: 'string', enum: ['pdf', 'json', 'both'], default: 'both' },
              dry_run: { type: 'boolean', default: false }
            }
          }
        }
    }, async (request, reply) => {
      try {
        const packRequest: GenPackGenerationRequest = {
          tenant_id: request.body.tenant_id,
          period: request.body.period,
          regions: request.body.regions,
          include_samples: request.body.include_samples || 25,
          format: request.body.format,
          dry_run: request.body.dry_run || false
        };

        // Validate period format
        const periodMatch = request.body.period.match(/^(\d{4})-(\d{2})$/);
        if (!periodMatch) {
          return reply.status(400).send({
            error: 'Invalid period format',
            details: [{
              field: 'period',
              message: 'Period must be in YYYY-MM format',
              code: 'INVALID_FORMAT'
            }]
          });
        }

        const [, year, month] = periodMatch;
        const monthNum = parseInt(month);
        if (monthNum < 1 || monthNum > 12) {
          return reply.status(400).send({
            error: 'Invalid month',
            details: [{
              field: 'period',
              message: 'Month must be between 01 and 12',
              code: 'INVALID_MONTH'
            }]
          });
        }

        // Get data source (in production, this would query your data store)
        const dataSource = await this.getDataSource(request.body.tenant_id, request.body.period);

        // Generate compliance pack
        const response = await this.generator.generatePack(packRequest, dataSource);

        if (response.status === "error") {
          return reply.status(500).send({
            error: response.error || "Unknown error",
            details: [{ field: "general", message: response.error || "Unknown error", code: "GENERATION_FAILED" }]
          });
        }

        // SECURITY: Sanitize response to prevent sensitive data exposure
        const sanitizedResponse: PackGenerationResponse = {
          status: "ok",
          pack_url_pdf: response.pack_url_pdf,
          pack_url_json: response.pack_url_json,
          template_versions: response.template_versions,
          generated_at: response.generated_at
        };

        // SECURITY: Log successful generation without sensitive data
        request.log.info({
          tenant_id: request.body.tenant_id,
          period: request.body.period,
          regions: request.body.regions,
          generated_at: response.generated_at
        }, 'Compliance pack generated successfully');

        return reply.status(200).send(sanitizedResponse);

      } catch (error) {
        request.log.error({ error }, "Failed to generate compliance pack");
        return reply.status(500).send({
          error: "Internal Server Error",
          details: [{ field: "general", message: "Failed to generate compliance pack", code: "INTERNAL_ERROR" }]
        });
      }
    });

    // Get Retention Policy
    this.fastify.post<{
      Body: RetentionPolicyAPIRequest;
      Reply: RetentionPolicy | { error: string; details: ValidationError[] };
    }>('/compliance/retention', {
      schema: {
        body: {
          type: 'object',
          required: ['tenant_id', 'regions'],
          properties: {
            tenant_id: { type: 'string', minLength: 1, maxLength: 100 },
            regions: { 
              type: 'array',
              items: { type: 'string', enum: ['EU', 'UK', 'US', 'BR'] },
              minItems: 1,
              maxItems: 4,
              uniqueItems: true
            },
            existing_legal_hold: { type: 'boolean', default: false }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const policy = RetentionPolicyManager.calculateRetentionPolicy(
          request.body.tenant_id,
          request.body.regions,
          request.body.existing_legal_hold || false
        );

        // Validate policy
        const validation = RetentionPolicyManager.validatePolicy(policy);
        if (!validation.valid) {
          request.log.warn({
            tenant_id: request.body.tenant_id,
            violations: validation.violations
          }, 'Retention policy validation failed');
        }

        return reply.status(200).send(policy);

      } catch (error) {
        request.log.error({ error }, "Failed to calculate retention policy");
        return reply.status(500).send({
          error: "Internal Server Error",
          details: [{ field: "general", message: "Failed to calculate retention policy", code: "INTERNAL_ERROR" }]
        });
      }
    });

    // Get Compliance Status
    this.fastify.get<{
      Params: { tenant_id: string };
      Querystring: { regions?: string };
      Reply: ComplianceStatusAPIResponse | { error: string; details: ValidationError[] };
    }>('/compliance/status/:tenant_id', {
      schema: {
        params: {
          tenant_id: { type: 'string', minLength: 1, maxLength: 100 }
        },
        querystring: {
          regions: { 
            type: 'string',
            pattern: '^(EU|UK|US|BR)(,(EU|UK|US|BR))*$',
            description: 'Comma-separated list of regions'
          }
        }
      }
    }, async (request, reply) => {
      try {
        const regions = request.query.regions 
          ? (request.query.regions.split(',').map(r => r.trim()) as Array<"EU" | "UK" | "US" | "BR">)
          : ["EU", "UK", "US", "BR"];

        // Get current retention policy
        const retentionPolicy = RetentionPolicyManager.calculateRetentionPolicy(
          request.params.tenant_id,
          regions as Array<"EU" | "UK" | "US" | "BR">,
          false
        );

        // In production, this would query your database for actual status
        const status: ComplianceStatusAPIResponse = {
          tenant_id: request.params.tenant_id,
          regions: regions as Array<"EU" | "UK" | "US" | "BR">,
          status: 'active',
          last_pack_generated: '2025-10-01T00:00:00Z',
          next_pack_scheduled: '2025-11-01T00:00:00Z',
          retention_policy: retentionPolicy,
          template_versions: {
            "eu_ai": "1.1.0",
            "dsa26": "1.2.0",
            "uk_osa": "1.0.2",
            "us_ftc": "1.0.1",
            "br_lgpd": "1.0.0",
            "us_state_advisory": "1.0.0-advisory"
          },
          compliance_score: 98.5,
          alerts: [
            {
              type: 'info',
              message: 'Monthly compliance pack scheduled for November 1',
              timestamp: new Date().toISOString()
            }
          ]
        };
        return reply.status(200).send(status);

      } catch (error) {
        request.log.error({ error }, "Failed to retrieve compliance status");
        return reply.status(500).send({
          error: "Internal Server Error",
          details: [{ field: "general", message: "Failed to retrieve compliance status", code: "INTERNAL_ERROR" }]
        });
      }
    });

    // Get Available Templates
    this.fastify.get<{
      Querystring: { region?: string };
      Reply: { templates: Record<string, any>; total_count: number; region: string } | { error: string; details: ValidationError[] };
    }>('/compliance/templates', {
      schema: {
        querystring: {
          region: { type: 'string', enum: ['EU', 'UK', 'US', 'BR'] }
        }
      }
    }, async (request, reply) => {
      try {
        // Filter by region if specified
        let templates: Record<string, any> = COMPLIANCE_ASSERTIONS;
        if (request.query.region) {
          const regionAssertions = REGION_ASSERTION_MAP[request.query.region as "EU" | "UK" | "US" | "BR"] || [];
          const filteredEntries = Object.entries(COMPLIANCE_ASSERTIONS).filter(([key]) =>
            (regionAssertions as readonly string[]).includes(key)
          );
          templates = Object.fromEntries(filteredEntries);
        }

        return reply.status(200).send({
          templates,
          total_count: Object.keys(templates).length,
          region: request.query.region || "all"
        });

      } catch (error) {
        request.log.error({ error }, "Failed to retrieve templates");
        return reply.status(500).send({
          error: "Internal Server Error",
          details: [{ field: "general", message: "Failed to retrieve templates", code: "INTERNAL_ERROR" }]
        });
      }
    });

    // Validate Compliance Data
    this.fastify.post<{
      Body: { data: ComplianceDataSource; regions: Array<"EU" | "UK" | "US" | "BR"> };
      Reply: { valid: boolean; violations: Array<{ type: string; message: string }> } | { error: string; details: ValidationError[] };
    }>('/compliance/validate', {
      schema: {
        body: {
          type: 'object',
          required: ['data', 'regions'],
          properties: {
            data: { type: 'object' },
            regions: { 
              type: 'array',
              items: { type: 'string', enum: ['EU', 'UK', 'US', 'BR'] },
              minItems: 1,
              maxItems: 4
            }
          }
        }
      }
    }, async (request, reply) => {
      try {
        const violations: Array<{ type: string; message: string }> = [];

        // Validate data completeness for each region
        for (const region of request.body.regions) {
          const regionAssertions = REGION_ASSERTION_MAP[region as keyof typeof REGION_ASSERTION_MAP];
          
          for (const assertionType of regionAssertions) {
            const hasAssertion = request.body.data.manifests.some(m => 
              m.assertions[assertionType]
            );

            if (!hasAssertion) {
              violations.push({
                type: 'missing_assertion',
                message: `Missing required assertion '${assertionType}' for region '${region}'`
              });
            }
          }
        }

        // Validate TSA receipts
        if (request.body.data.manifests.length > 0 && request.body.data.tsa_receipts.length === 0) {
          violations.push({
            type: 'missing_tsa',
            message: 'TSA receipts are missing for signed manifests'
          });
        }

        return reply.status(200).send({
          valid: violations.length === 0,
          violations
        });

      } catch (error) {
        request.log.error({ error }, "Failed to validate compliance data");
        return reply.status(500).send({
          error: "Internal Server Error",
          details: [{ field: "general", message: "Failed to validate compliance data", code: "INTERNAL_ERROR" }]
        });
      }
    });
  }

  // Helper methods
  
  /**
   * Get compliance data source for tenant and period (mock implementation)
   */
  private async getDataSource(tenantId: string, period: string): Promise<ComplianceDataSource> {
    // In production, this would query your actual data stores
    // For now, return mock data
    return {
      manifests: [],
      verify_outcomes: [],
      badge_logs: [],
      ad_metadata: [],
      tsa_receipts: []
    };
  }

  /**
   * Start the API server
   */
  async start(port: number = 3000): Promise<void> {
    try {
      await this.fastify.listen({ port, host: '0.0.0.0' });
      // SECURITY: Removed console.log to prevent information disclosure
      // Use proper logging in production
    } catch (error) {
      // SECURITY: Removed console.error to prevent information disclosure
      // Use proper logging in production
      process.exit(1);
    }
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    try {
      await this.fastify.close();
      // SECURITY: Removed console.log to prevent information disclosure
      // Use proper logging in production
    } catch (error) {
      // SECURITY: Removed console.error to prevent information disclosure
      // Use proper logging in production
    }
  }

  /**
   * Get Fastify instance (for testing)
   */
  getServer(): FastifyInstance {
    return this.fastify;
  }
}

// Export for easy usage
export default ComplianceAPIServer;

// CLI support
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new ComplianceAPIServer();
  // SECURITY: Validate PORT environment variable
  const portStr = process.env.PORT || '3000';
  const port = parseInt(portStr, 10);
  
  if (isNaN(port) || port < 1 || port > 65535) {
    // SECURITY: Use proper error handling instead of console.error
    process.exit(1);
  }
  
  server.start(port).catch(() => {
    // SECURITY: Use proper error handling instead of console.error
    process.exit(1);
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    // SECURITY: Removed console.log to prevent information disclosure
    await server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    // SECURITY: Removed console.log to prevent information disclosure
    await server.stop();
    process.exit(0);
  });
}
