/**
 * C2PA Audit API Server
 * Fastify-based HTTP API for manifest diff and lineage analysis
 */

import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { 
  DiffRequest, 
  DiffResponse, 
  EvidencePack,
  C2PAError,
  ValidationError
} from '@/types';
import { ManifestParser } from '@/core/parser';
import { ManifestValidator } from '@/core/validator';
import { ManifestDiffer } from '@/core/differ';
import { LineageReconstructor } from '@/core/lineage';
import { 
  securityMiddleware,
  rateLimitMiddleware,
  validateInputMiddleware,
  csrfProtectionMiddleware
} from './security';

/**
 * C2PA Audit API Server implementation
 */
export class AuditAPIServer {
  private server: FastifyInstance;
  private trustAnchors: any[] = []; // Load from environment or config file
  // CRITICAL: Rate limiting maps for DoS protection
  private requestCounts: Map<string, number> = new Map();
  private requestWindows: Map<string, number> = new Map();

  constructor() {
    this.server = Fastify({
      logger: {
        level: 'info',
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: true,
            translateTime: 'HH:MM:ss Z',
            ignore: 'pid,hostname'
          }
        }
      },
      // CRITICAL: Security settings
      bodyLimit: 10 * 1024 * 1024, // 10MB body limit
      maxParamLength: 1000 // Prevent long parameter attacks
    });

    this.setupPlugins();
    this.registerRoutes();
    this.setErrorHandlers();
    this.setupSecurityHeaders();
    this.applySecurityMiddleware();
  }

  /**
   * CRITICAL: Apply comprehensive security middleware
   */
  private applySecurityMiddleware(): void {
    // Apply security middleware to all routes
    this.server.addHook('preHandler', async (request, reply) => {
      await securityMiddleware(request, reply);
    });
    
    // Apply additional security to sensitive endpoints
    this.server.addHook('preHandler', async (request, reply) => {
      if (request.url.startsWith('/audit/')) {
        await rateLimitMiddleware(request, reply);
        await validateInputMiddleware(request, reply);
        await csrfProtectionMiddleware(request, reply);
      }
    });
  }

  /**
   * Setup Fastify plugins
   */
  private setupPlugins(): void {
    // CORS for cross-origin requests - CRITICAL: Restrict in production
    this.server.register(cors, {
      origin: process.env.NODE_ENV === 'production' 
        ? ['https://yourdomain.com'] // Restrict to specific domains
        : true, // Allow all origins in development
      credentials: true
    });

    // Multipart for file uploads with strict limits
    this.server.register(multipart, {
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB limit (reduced for security)
        files: 2, // Maximum 2 files per request
        fields: 10, // Maximum 10 form fields
        fieldNameSize: 100, // Prevent long field names
        fieldSize: 1000 // Prevent large field values
      }
    });

    // Static files for UI
    this.server.register(staticPlugin, {
      root: new URL('./ui/public', import.meta.url),
      prefix: '/ui/',
      // CRITICAL: Prevent directory traversal
      constraints: { 
        fileName: (filename: string) => {
          // Block dangerous filenames
          const blocked = ['..', '\\', '/', '\0'];
          return !blocked.some(block => filename.includes(block));
        }
      }
    });
  }

  /**
   * Register API routes
   */
  private registerRoutes(): void {
    // Health check
    this.server.get('/health', () => ({
      status: 'healthy', 
      timestamp: new Date().toISOString(),
      version: '1.0.0'
    }));

    // Main diff endpoint with CRITICAL security controls
    this.server.post<{ Body: DiffRequest; Reply: DiffResponse }>(
      '/audit/diff',
      {
        schema: {
          body: {
            type: 'object',
            required: ['base', 'target', 'format'],
            properties: {
              base: {
                oneOf: [
                  { type: 'object', required: ['manifest_url'], properties: { manifest_url: { type: 'string', maxLength: 2048 } } },
                  { type: 'object', required: ['asset_url'], properties: { asset_url: { type: 'string', maxLength: 2048 } } },
                  { type: 'object', required: ['sidecar_url'], properties: { sidecar_url: { type: 'string', maxLength: 2048 } } }
                ]
              },
              target: {
                oneOf: [
                  { type: 'object', required: ['manifest_url'], properties: { manifest_url: { type: 'string', maxLength: 2048 } } },
                  { type: 'object', required: ['asset_url'], properties: { asset_url: { type: 'string', maxLength: 2048 } } },
                  { type: 'object', required: ['sidecar_url'], properties: { sidecar_url: { type: 'string', maxLength: 2048 } } }
                ]
              },
              format: {
                type: 'array',
                items: { type: 'string', enum: ['semantic', 'json-patch', 'merge-patch', 'lineage'] },
                minItems: 1,
                maxItems: 4 // Prevent excessive format requests
              }
            },
            additionalProperties: false // Prevent extra properties
          }
        }
      },
      async (request, reply) => {
        try {
          // CRITICAL: Rate limiting check (simplified implementation)
          const forwardedFor = request.headers['x-forwarded-for'];
          const clientIP = request.ip || (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) || 'unknown';
          if (!this.checkRateLimit(clientIP)) {
            return reply.code(429).send({ 
              error: 'Rate limit exceeded',
              validation: { base: [], target: [] }
            });
          }

          const startTime = Date.now();
          
          // CRITICAL: Validate URLs to prevent SSRF
          this.validateRequestUrls(request.body);
          
          // Parse base and target manifests
          const baseManifest = await this.parseManifestFromReference(request.body.base);
          const targetManifest = await this.parseManifestFromReference(request.body.target);

          // Validate both manifests
          const baseValidation = await ManifestValidator.validateManifest(baseManifest, this.trustAnchors);
          const targetValidation = await ManifestValidator.validateManifest(targetManifest, this.trustAnchors);

          // Update validation status in manifests
          baseManifest.claim_signature.validation_status = baseValidation;
          targetManifest.claim_signature.validation_status = targetValidation;

          const response: DiffResponse = {
            validation: {
              base: baseValidation.codes,
              target: targetValidation.codes
            }
          };

          // Generate requested diff formats
          for (const format of request.body.format) {
            switch (format) {
              case 'semantic':
                response.semantic = ManifestDiffer.generateSemanticDiff(baseManifest, targetManifest);
                break;
              
              case 'json-patch':
                response.json_patch = ManifestDiffer.generateJSONPatch(baseManifest, targetManifest);
                break;
              
              case 'merge-patch':
                response.merge_patch = ManifestDiffer.generateMergePatch(baseManifest, targetManifest);
                break;
              
              case 'lineage':
                response.lineage = await LineageReconstructor.buildLineage(targetManifest, this.trustAnchors);
                break;
            }
          }

          const processingTime = Date.now() - startTime;
          this.server.log.info(`Diff processed in ${processingTime}ms`);

          return response;

        } catch (error) {
          this.server.log.error({ msg: 'Diff processing failed', err: error });
          throw error;
        }
      }
    );

    // File upload diff endpoint
    this.server.post('/audit/diff/upload', async (request) => {
      try {
        const data = await request.files();
        const files = data as any;
        
        if (!files.base || !files.target) {
          throw new C2PAError('Both base and target files are required', 'MISSING_FILES');
        }

        // Read uploaded files
        const baseBuffer = await files.base.toBuffer();
        const targetBuffer = await files.target.toBuffer();

        // Parse manifests
        const baseManifest = await ManifestParser.parseManifest(baseBuffer);
        const targetManifest = await ManifestParser.parseManifest(targetBuffer);

        // Validate manifests
        const baseValidation = await ManifestValidator.validateManifest(baseManifest, this.trustAnchors);
        const targetValidation = await ManifestValidator.validateManifest(targetManifest, this.trustAnchors);

        baseManifest.claim_signature.validation_status = baseValidation;
        targetManifest.claim_signature.validation_status = targetValidation;

        // Generate full diff
        const response: DiffResponse = {
          semantic: ManifestDiffer.generateSemanticDiff(baseManifest, targetManifest),
          json_patch: ManifestDiffer.generateJSONPatch(baseManifest, targetManifest),
          merge_patch: ManifestDiffer.generateMergePatch(baseManifest, targetManifest),
          lineage: await LineageReconstructor.buildLineage(targetManifest, this.trustAnchors),
          validation: {
            base: baseValidation.codes,
            target: targetValidation.codes
          }
        };

        return response;

      } catch (error) {
        this.server.log.error({ msg: 'Upload diff processing failed', err: error });
        throw error;
      }
    });

    // Lineage analysis endpoint
    this.server.post('/audit/lineage', async (request) => {
      try {
        const body = request.body as any;
        
        if (!body.asset && !body.manifest) {
          throw new C2PAError('Asset or manifest reference is required', 'MISSING_REFERENCE');
        }

        const reference = body.asset || body.manifest;
        const manifest = await this.parseManifestFromReference(reference);
        
        const validation = await ManifestValidator.validateManifest(manifest, this.trustAnchors);
        manifest.claim_signature.validation_status = validation;

        const lineage = await LineageReconstructor.buildLineage(
          manifest, 
          this.trustAnchors,
          body.maxDepth || 10
        );

        return {
          lineage,
          validation: validation.codes,
          manifest_info: {
            hash: manifest.manifest_hash,
            generator: manifest.claim_generator,
            timestamp: manifest.timestamp
          }
        };

      } catch (error) {
        this.server.log.error({ msg: 'Lineage analysis failed', err: error });
        throw error;
      }
    });

    // Evidence pack export endpoint
    this.server.post('/audit/evidence-pack', async (request, reply) => {
      try {
        const body = request.body as any;
        
        if (!body.base || !body.target) {
          throw new C2PAError('Base and target references are required', 'MISSING_REFERENCES');
        }

        // Parse and validate manifests
        const baseManifest = await this.parseManifestFromReference(body.base);
        const targetManifest = await this.parseManifestFromReference(body.target);

        const baseValidation = await ManifestValidator.validateManifest(baseManifest, this.trustAnchors);
        const targetValidation = await ManifestValidator.validateManifest(targetManifest, this.trustAnchors);

        baseManifest.claim_signature.validation_status = baseValidation;
        targetManifest.claim_signature.validation_status = targetValidation;

        // Generate diff and lineage
        const semanticDiff = ManifestDiffer.generateSemanticDiff(baseManifest, targetManifest);
        const lineage = await LineageReconstructor.buildLineage(targetManifest, this.trustAnchors);

        // Create evidence pack
        const evidencePack: EvidencePack = {
          base_raw: JSON.stringify(baseManifest, null, 2),
          target_raw: JSON.stringify(targetManifest, null, 2),
          semantic_diff: semanticDiff,
          lineage_graph: lineage,
          verification_transcript: {
            base_verification: this.createVerificationTranscript(baseValidation),
            target_verification: this.createVerificationTranscript(targetValidation),
            timestamps: {
              base_validation: new Date().toISOString(),
              target_validation: new Date().toISOString(),
              export: new Date().toISOString()
            }
          },
          exported_at: new Date().toISOString()
        };

        // Set appropriate headers for download
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="evidence-pack-${Date.now()}.json"`);

        return evidencePack;

      } catch (error) {
        this.server.log.error({ msg: 'Evidence pack export failed', err: error });
        throw error;
      }
    });

    /**
     * Export evidence pack endpoint (alternative URL)
     */
    this.server.post('/audit/export/evidence-pack', async (request, reply) => {
      try {
        const body = request.body as any;
        
        if (!body.base || !body.target) {
          throw new C2PAError('Base and target references are required', 'MISSING_REFERENCES');
        }

        // Parse manifests
        const baseManifest = await this.parseManifestFromReference(body.base);
        const targetManifest = await this.parseManifestFromReference(body.target);

        // Validate manifests
        const baseValidation = await ManifestValidator.validateManifest(baseManifest, this.trustAnchors);
        const targetValidation = await ManifestValidator.validateManifest(targetManifest, this.trustAnchors);

        baseManifest.claim_signature.validation_status = baseValidation;
        targetManifest.claim_signature.validation_status = targetValidation;

        // Generate evidence pack
        const evidencePack = {
          base_raw: JSON.stringify(baseManifest, null, 2),
          target_raw: JSON.stringify(targetManifest, null, 2),
          semantic_diff: ManifestDiffer.generateSemanticDiff(baseManifest, targetManifest),
          lineage_graph: await LineageReconstructor.buildLineage(targetManifest, this.trustAnchors),
          verification_transcript: this.createVerificationTranscript({
            base: baseValidation,
            target: targetValidation
          }),
          exported_at: new Date().toISOString()
        };

        // Set appropriate headers for download
        reply.header('Content-Type', 'application/json');
        reply.header('Content-Disposition', `attachment; filename="evidence-pack-${Date.now()}.json"`);

        return evidencePack;

      } catch (error) {
        this.server.log.error({ msg: 'Evidence pack export failed', err: error });
        throw error;
      }
    });
  }

  /**
   * Set error handlers
   */
  private setErrorHandlers(): void {
    this.server.setErrorHandler((error, _request, reply) => {
      this.server.log.error(error);

      if (error instanceof C2PAError) {
        reply.status(400).send({
          error: {
            code: error.code,
            message: error.message,
            spec_reference: (error as any).spec_reference || 'https://spec.c2pa.org/specification-2.1/'
          }
        });
      } else if (error instanceof ValidationError) {
        reply.status(422).send({
          error: {
            code: error.code,
            message: error.message,
            validation_codes: error.validation_codes,
            spec_reference: (error as any).spec_reference || 'https://spec.c2pa.org/specification-2.1/#validation'
          }
        });
      } else {
        reply.status(500).send({
          error: {
            code: 'INTERNAL_ERROR',
            message: 'Internal server error'
          }
        });
      }
    });
  }

  /**
   * CRITICAL: Setup security headers
   */
  private setupSecurityHeaders(): void {
    this.server.addHook('onRequest', async (request, reply) => {
      reply.header('X-Content-Type-Options', 'nosniff');
      reply.header('X-Frame-Options', 'DENY');
      reply.header('X-XSS-Protection', '1; mode=block');
      reply.header('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      reply.header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self';");
    });
  }

  /**
   * CRITICAL: Simple rate limiting implementation
   * @param clientIP - Client IP address
   * @returns True if request is allowed
   */
  private checkRateLimit(clientIP: string): boolean {
    // Simple in-memory rate limiting (use Redis in production)
    const requests = this.requestCounts.get(clientIP) || 0;
    const windowStart = this.requestWindows.get(clientIP) || Date.now();
    const windowSize = 60 * 1000; // 1 minute window
    const maxRequests = 100; // Max 100 requests per minute
    
    if (Date.now() - windowStart > windowSize) {
      // Reset window
      this.requestCounts.set(clientIP, 1);
      this.requestWindows.set(clientIP, Date.now());
      return true;
    }
    
    if (requests >= maxRequests) {
      return false;
    }
    
    this.requestCounts.set(clientIP, requests + 1);
    return true;
  }

  /**
   * CRITICAL: Validate request URLs to prevent SSRF
   * @param body - Request body
   */
  private validateRequestUrls(body: any): void {
    const urls = [
      body.base?.manifest_url,
      body.base?.asset_url,
      body.base?.sidecar_url,
      body.target?.manifest_url,
      body.target?.asset_url,
      body.target?.sidecar_url
    ].filter(url => url);

    for (const url of urls) {
      if (!this.isValidUrl(url)) {
        throw new C2PAError('Invalid or unsafe URL', 'INVALID_URL');
      }
    }
  }

  /**
   * CRITICAL: Check if URL is safe for SSRF protection
   * @param url - URL to validate
   * @returns True if URL is safe
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      
      // Only allow http/https
      if (!['http:', 'https:'].includes(parsed.protocol)) {
        return false;
      }
      
      // Block private/internal ranges
      const hostname = parsed.hostname;
      if (this.isPrivateIP(hostname) || this.isLocalhost(hostname)) {
        return false;
      }
      
      // Block suspicious ports
      const blockedPorts = [22, 23, 25, 53, 135, 139, 445, 993, 995];
      if (parsed.port && blockedPorts.includes(parseInt(parsed.port))) {
        return false;
      }
      
      return true;
    } catch {
      return false;
    }
  }

  /**
   * CRITICAL: Check if hostname is a private IP
   * @param hostname - Hostname to check
   * @returns True if private IP
   */
  private isPrivateIP(hostname: string): boolean {
    const privateRanges = [
      /^10\./,
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./,
      /^192\.168\./,
      /^127\./,
      /^169\.254\./,
      /^::1$/,
      /^fc00:/,
      /^fe80:/
    ];
    
    return privateRanges.some(range => range.test(hostname));
  }

  /**
   * CRITICAL: Check if hostname is localhost
   * @param hostname - Hostname to check
   * @returns True if localhost
   */
  private isLocalhost(hostname: string): boolean {
    return hostname === 'localhost' || hostname === '0.0.0.0';
  }

  /**
   * Parse manifest from reference object
   * @param reference - Manifest reference object
   * @returns Parsed manifest
   */
  private async parseManifestFromReference(reference: any): Promise<any> {
    if (reference.manifest_url) {
      return await ManifestParser.parseManifest(reference.manifest_url);
    } else if (reference.asset_url) {
      return await ManifestParser.parseManifest(reference.asset_url);
    } else if (reference.sidecar_url) {
      return await ManifestParser.parseManifest(reference.sidecar_url);
    } else {
      throw new C2PAError('Invalid manifest reference', 'INVALID_REFERENCE');
    }
  }

  /**
   * Create verification transcript from validation status
   * @param validation - Validation status
   * @returns Verification transcript steps
   */
  private createVerificationTranscript(validation: any): any[] {
    const steps: any[] = [];
    
    // Add base validation steps
    if (validation.base) {
      steps.push(...validation.base.codes.map((code: string) => ({
        step: `base.${code}`,
        code: code,
        result: validation.base.valid,
        spec_reference: this.getSpecReference(code)
      })));
    }
    
    // Add target validation steps
    if (validation.target) {
      steps.push(...validation.target.codes.map((code: string) => ({
        step: `target.${code}`,
        code: code,
        result: validation.target.valid,
        spec_reference: this.getSpecReference(code)
      })));
    }
    
    return steps;
  }
  
  private getSpecReference(code: string): string {
    const specMap: Record<string, string> = {
      'manifest.structureValid': 'https://spec.c2pa.org/specification-2.1/#manifest-structure',
      'manifest.structureInvalid': 'https://spec.c2pa.org/specification-2.1/#manifest-structure',
      'signingCredential.trusted': 'https://spec.c2pa.org/specification-2.1/#signing-credential',
      'signingCredential.untrusted': 'https://spec.c2pa.org/specification-2.1/#signing-credential',
      'signature.valid': 'https://spec.c2pa.org/specification-2.1/#claim-signature',
      'signature.invalid': 'https://spec.c2pa.org/specification-2.1/#claim-signature',
      'timestamp.trusted': 'https://spec.c2pa.org/specification-2.1/#timestamp-evidence',
      'timestamp.untrusted': 'https://spec.c2pa.org/specification-2.1/#timestamp-evidence',
      'assertion.hashedURI.match': 'https://spec.c2pa.org/specification-2.1/#assertions',
      'assertion.hashedURI.mismatch': 'https://spec.c2pa.org/specification-2.1/#assertions',
      'ingredient.claimSignature.match': 'https://spec.c2pa.org/specification-2.1/#ingredients',
      'ingredient.manifestMissing': 'https://spec.c2pa.org/specification-2.1/#ingredients'
    };
    
    return specMap[code] || 'https://spec.c2pa.org/specification-2.1/';
  }

  /**
   * Start the API server
   * @param port - Port to listen on
   * @param host - Host to bind to
   */
  async start(port: number = 3000, host: string = '0.0.0.0'): Promise<void> {
    try {
      await this.server.listen({ port, host });
      this.server.log.info(`C2PA Audit API server listening on ${host}:${port}`);
    } catch (error) {
      this.server.log.error({ msg: 'Failed to start server', err: error });
      throw error;
    }
  }

  /**
   * Stop the API server
   */
  async stop(): Promise<void> {
    try {
      await this.server.close();
      this.server.log.info('C2PA Audit API server stopped');
    } catch (error) {
      this.server.log.error({ msg: 'Failed to stop server', err: error });
      throw error;
    }
  }

  /**
   * Get Fastify instance (for testing)
   * @returns Fastify instance
   */
  getServer(): FastifyInstance {
    return this.server;
  }
}
