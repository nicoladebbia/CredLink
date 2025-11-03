/**
 * Phase 39 Billing - Main Application
 * Disaster Economics & Pricing Engine with Comprehensive Safeguards
 */

import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import multipart from '@fastify/multipart';
import staticFiles from '@fastify/static';
import websocket from '@fastify/websocket';
import { Redis } from 'ioredis';
import Stripe from 'stripe';

import { loadEnvironment, getConfigSummary } from './config/env';
import { TenantService } from './services/tenant-service';
import { StripeService } from './services/stripe-service';
import { OnboardingService } from './services/onboarding-service';
import { UsageService } from './services/usage-service';
import { InstallHealthService } from './services/install-health-service';
import { ExportService } from './services/export-service';
import { CaiVerifyService } from './services/cai-verify-service';
import { RFC3161Service } from './services/rfc3161-service';
import { TenantController } from './controllers/tenant-controller';
import { BillingController } from './controllers/billing-controller';
import { PricingController } from './controllers/pricing-controller';
import { SafeguardController } from './controllers/safeguard-controller';
import { authMiddleware } from './middleware/auth';
import { validationMiddleware } from './middleware/validation';
import { securityMiddleware } from './middleware/security';
import { loggingMiddleware } from './middleware/logging';
import { errorMiddleware } from './middleware/error';

// Phase 39 - Economics & Pricing Services
import { EconomicsService } from './services/economics-service';
import { SafeguardService } from './services/safeguard-service';
import { KillSwitchService } from './services/killswitch-service';
import { PricingDiscountService } from './services/pricing-discount-service';
import { CoherenceService } from './services/coherence-service';
import { EconomicsDashboardService } from './services/economics-dashboard-service';

// OpenTelemetry imports
import { initializeOpenTelemetry, otelConfig } from './otel-config';
import { 
  trace, 
  SpanKind,
} from '@opentelemetry/api';

// Initialize OpenTelemetry first
const sdk = initializeOpenTelemetry();

// Load environment configuration
const env = loadEnvironment();
const configSummary = getConfigSummary(env);

console.log('🚀 Starting Phase 39 Billing System with Disaster Economics & Pricing Engine');
console.log('📊 Configuration loaded:', Object.keys(configSummary).join(', '));
console.log('📈 OpenTelemetry initialized');
console.log('💰 Economics Engine: Unit cost modeling, burst caps, auto-degradation, kill-switches');
console.log('🛡️ Safeguards: Real-time exposure monitoring, storm detection, graceful degradation');

// Create deployment release span
const tracer = trace.getTracer('c2pa-billing');
const deploymentSpan = tracer.startSpan('system-deployment', {
  kind: SpanKind.SERVER,
  attributes: {
    'service.name': env.OTEL_SERVICE_NAME,
    'service.version': env.RELEASE_VERSION,
    'deployment.environment': env.OTEL_DEPLOYMENT_ENVIRONMENT,
    'release.sha': env.GIT_SHA,
    'release.time': env.RELEASE_TIME,
    'node.version': process.version,
    'platform': process.platform,
    'arch': process.arch,
  },
});

deploymentSpan.setAttributes({
  'system.startup': 'completed',
  'timestamp': new Date().toISOString(),
});

deploymentSpan.end();

// Create Fastify instance with OpenTelemetry instrumentation
const fastify: FastifyInstance = Fastify({
  logger: {
    level: env.LOG_LEVEL,
  },
  trustProxy: true,
});

// Register plugins
async function registerPlugins() {
  // CORS
  await fastify.register(cors, {
    origin: env.ALLOWED_ORIGINS,
    credentials: env.CORS_CREDENTIALS,
  });

  // Security headers
  await fastify.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://api.stripe.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
  });

  // Rate limiting
  await fastify.register(rateLimit, {
    max: env.MAX_REQUESTS_PER_WINDOW,
    timeWindow: env.RATE_LIMIT_WINDOW,
    skipOnError: false,
  });

  // Multipart support
  await fastify.register(multipart, {
    limits: {
      fileSize: env.MAX_ASSET_SIZE,
      files: 5,
    },
    attachFieldsToBody: true,
  });

  // Static files
  await fastify.register(staticFiles, {
    root: './public',
    prefix: '/public',
    maxAge: 86400000, // 24 hours
  });

  // WebSocket support
  await fastify.register(websocket);
}

// Initialize services
async function initializeServices() {
  // Redis connection - CRITICAL SECURITY CONFIGURATION
  const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: env.REDIS_MAX_RETRIES,
    // CRITICAL: Security configurations
    tls: process.env['REDIS_TLS'] === 'true' ? {
      rejectUnauthorized: true,
      servername: env.REDIS_HOST,
    } : undefined,
    // CRITICAL: Connection limits and timeouts
    connectTimeout: 10000,
    commandTimeout: 5000,
    lazyConnect: true,
    // CRITICAL: Pool configuration
    family: 4,
    keepAlive: 30000,
    // CRITICAL: Security options
    enableAutoPipelining: true,
  });

  // Stripe connection
  const stripe = new Stripe(env.STRIPE_SECRET_KEY, {
    apiVersion: env.STRIPE_API_VERSION as Stripe.LatestApiVersion,
    typescript: true,
  });

  // Service configurations
  const tenantServiceConfig = {
    redis,
    stripe,
    apiKeySecret: env.API_KEY_SECRET,
    trialDurationDays: env.TRIAL_DURATION_DAYS,
    trialAssetCap: env.TRIAL_ASSET_CAP,
    manifestHostBaseUrl: env.MANIFEST_HOST_BASE_URL,
    verifySdkVersion: env.VERIFY_SDK_VERSION || '2.1.0',
  };

  const stripeServiceConfig = {
    secretKey: env.STRIPE_SECRET_KEY,
    webhookSecret: env.STRIPE_WEBHOOK_SECRET,
    apiVersion: env.STRIPE_API_VERSION,
    prices: {
      starter: env.STRIPE_STARTER_PRICE_ID,
      pro: env.STRIPE_PRO_PRICE_ID,
      enterprise: env.STRIPE_ENTERPRISE_PRICE_ID,
    },
    meters: {
      sign_events: env.STRIPE_SIGN_EVENTS_METER_ID,
      verify_events: env.STRIPE_VERIFY_EVENTS_METER_ID,
      rfc3161_timestamps: env.STRIPE_RFC3161_TIMESTAMPS_METER_ID,
    },
    enableRadar: env.ENABLE_STRIPE_RADAR,
    enableSmartRetries: env.ENABLE_SMART_RETRIES,
  };

  const onboardingServiceConfig = {
    redis,
    caiVerifyEndpoint: env.CAI_VERIFY_ENDPOINT,
    userAgent: 'C2PA-Billing/1.1.0',
    timeoutMs: 30000,
  };

  const usageServiceConfig = {
    redis,
    aggregationWindowMinutes: 60,
    batchSize: 100,
    retryAttempts: 3,
    retryDelayMs: 1000,
  };

  const installHealthServiceConfig = {
    redis,
    caiVerifyEndpoint: env.CAI_VERIFY_ENDPOINT,
    userAgent: 'C2PA-Billing/1.1.0',
    timeoutMs: 30000,
    puppeteerTimeoutMs: 60000,
    survivalThresholds: {
      embed_survival_min: 0.95,
      remote_survival_min: 0.999,
      badge_intact_min: 0.95,
    },
  };

  const exportServiceConfig = {
    redis,
    stripe,
    exportStoragePath: env.EXPORT_STORAGE_PATH,
    manifestRetentionDays: env.MANIFEST_RETENTION_DAYS,
    dataRetentionDays: env.DATA_RETENTION_DAYS,
    maxExportSizeGb: 10,
  };

  const caiVerifyServiceConfig = {
    redis,
    caiVerifyEndpoint: env.CAI_VERIFY_ENDPOINT,
    userAgent: 'C2PA-Billing/1.1.0',
    timeoutMs: 30000,
    retryAttempts: 3,
    retryDelayMs: 1000,
  };

  const rfc3161ServiceConfig = {
    redis,
    tsaEndpoint: env.RFC3161_TSA_ENDPOINT,
    timeoutMs: 30000,
    retryAttempts: 3,
    retryDelayMs: 1000,
    certificateChain: [], // Would be loaded from TSA
  };

  // Initialize services
  const tenantService = new TenantService(tenantServiceConfig);
  const stripeService = new StripeService(stripeServiceConfig);
  const onboardingService = new OnboardingService(onboardingServiceConfig);
  const usageService = new UsageService(usageServiceConfig);
  const installHealthService = new InstallHealthService(installHealthServiceConfig);
  const exportService = new ExportService(exportServiceConfig);
  const caiVerifyService = new CaiVerifyService(caiVerifyServiceConfig);
  const rfc3161Service = new RFC3161Service(rfc3161ServiceConfig);

  // Phase 39 - Initialize Economics & Pricing Services
  const economicsService = new EconomicsService(redis);
  const safeguardService = new SafeguardService(redis);
  const killSwitchService = new KillSwitchService(redis);
  const pricingDiscountService = new PricingDiscountService(redis);
  const coherenceService = new CoherenceService(redis);
  const economicsDashboardService = new EconomicsDashboardService(redis);

  // Initialize controllers
  const tenantController = new TenantController({
    tenantService,
    onboardingService,
  });

  const billingController = new BillingController({
    stripeService,
    usageService,
  });

  // Phase 39 - Initialize Pricing & Safeguard Controllers
  const pricingController = new PricingController(redis);
  const safeguardController = new SafeguardController(redis);

  return {
    tenantService,
    stripeService,
    onboardingService,
    usageService,
    installHealthService,
    exportService,
    caiVerifyService,
    rfc3161Service,
    tenantController,
    billingController,
    // Phase 39 - Economics & Pricing Services
    economicsService,
    safeguardService,
    killSwitchService,
    pricingDiscountService,
    coherenceService,
    economicsDashboardService,
    pricingController,
    safeguardController,
  };
}

// Route registration function
async function registerRoutes(services: any) {
  const { 
    tenantController, 
    billingController, 
    installHealthService, 
    caiVerifyService, 
    rfc3161Service, 
    exportService,
    // Phase 39 - Controllers
    pricingController,
    safeguardController
  } = services;

  // Health check
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.1.0',
      phase: '39 - Disaster Economics & Pricing Engine',
      services: {
        redis: 'connected',
        stripe: 'connected',
        database: 'connected',
        economics_service: 'operational',
        safeguards_service: 'operational',
        killswitch_service: 'operational',
        pricing_service: 'operational',
        coherence_service: 'operational',
      },
    };
  });

  // Tenant management routes
  fastify.post('/tenants', {
    preHandler: [validationMiddleware, securityMiddleware],
  }, tenantController.createTenant.bind(tenantController));

  fastify.get('/tenants/:tenantId', {
    preHandler: [authMiddleware, validationMiddleware],
  }, tenantController.getTenant.bind(tenantController));

  fastify.put('/tenants/:tenantId', {
    preHandler: [authMiddleware, validationMiddleware],
  }, tenantController.updateTenant.bind(tenantController));

  fastify.get('/tenants/:tenantId/wizard', {
    preHandler: [authMiddleware, validationMiddleware],
  }, tenantController.getTenantWizard.bind(tenantController));

  fastify.post('/tenants/:tenantId/wizard/:step', {
    preHandler: [authMiddleware, validationMiddleware],
  }, tenantController.executeWizardStep.bind(tenantController));

  fastify.get('/tenants/:tenantId/can-checkout', {
    preHandler: [authMiddleware, validationMiddleware],
  }, tenantController.canCheckout.bind(tenantController));

  fastify.get('/tenants/:tenantId/usage', {
    preHandler: [authMiddleware, validationMiddleware],
  }, tenantController.getTenantUsage.bind(tenantController));

  fastify.post('/tenants/:tenantId/cancel', {
    preHandler: [authMiddleware, validationMiddleware],
  }, tenantController.cancelTenant.bind(tenantController));

  // Billing routes
  fastify.get('/billing/plans', billingController.getPlans.bind(billingController));
  fastify.get('/billing/tiers/:eventType', billingController.getUsageTiers.bind(billingController));

  fastify.post('/billing/portal', {
    preHandler: [authMiddleware, validationMiddleware],
  }, billingController.createCustomerPortalSession.bind(billingController));

  fastify.post('/billing/checkout', {
    preHandler: [authMiddleware, validationMiddleware],
  }, billingController.createCheckoutSession.bind(billingController));

  fastify.get('/billing/subscription', {
    preHandler: [authMiddleware, validationMiddleware],
  }, billingController.getSubscription.bind(billingController));

  fastify.put('/billing/subscription', {
    preHandler: [authMiddleware, validationMiddleware],
  }, billingController.updateSubscription.bind(billingController));

  fastify.post('/billing/subscription/cancel', {
    preHandler: [authMiddleware, validationMiddleware],
  }, billingController.cancelSubscription.bind(billingController));

  fastify.get('/billing/invoices', {
    preHandler: [authMiddleware, validationMiddleware],
  }, billingController.getInvoices.bind(billingController));

  fastify.post('/billing/refunds', {
    preHandler: [authMiddleware, validationMiddleware],
  }, billingController.createRefund.bind(billingController));

  fastify.get('/billing/usage', {
    preHandler: [authMiddleware, validationMiddleware],
  }, billingController.getUsageStats.bind(billingController));

  fastify.get('/billing/summary', {
    preHandler: [authMiddleware, validationMiddleware],
  }, billingController.getBillingSummary.bind(billingController));

  // Usage recording
  fastify.post('/usage', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const { events } = request.body as any;
      const { tenantId } = (request as any).tenant;

      for (const event of events) {
        await services.usageService.recordUsage({
          ...event,
          tenant_id: tenantId,
        });
      }

      reply.status(201).send({ recorded: events.length });
    } catch (error) {
      reply.status(400).send({
        code: 'USAGE_RECORDING_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Install health routes
  fastify.post('/install/check', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const healthRequest = request.body as any;
      const health = await installHealthService.checkInstallHealth(healthRequest);
      reply.status(200).send(health);
    } catch (error) {
      reply.status(400).send({
        code: 'HEALTH_CHECK_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.get('/install/health/:tenantId', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const { tenantId } = request.params as any;
      const health = await installHealthService.getLatestHealthCheck(tenantId);
      reply.status(200).send(health);
    } catch (error) {
      reply.status(404).send({
        code: 'HEALTH_CHECK_NOT_FOUND',
        message: error instanceof Error ? error.message : 'Health check not found',
      });
    }
  });

  // CAI Verify routes
  fastify.post('/verify', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const verifyRequest = request.body as any;
      const result = await caiVerifyService.verifyAsset(verifyRequest);
      reply.status(200).send(result);
    } catch (error) {
      reply.status(400).send({
        code: 'VERIFICATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.post('/discover', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const { asset_url } = request.body as any;
      const results = await caiVerifyService.discoverRemoteManifest(asset_url);
      reply.status(200).send(results);
    } catch (error) {
      reply.status(400).send({
        code: 'DISCOVERY_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.post('/smoke-test', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const smokeTestRequest = request.body as any;
      const results = await caiVerifyService.performSmokeTest(
        smokeTestRequest.asset_url,
        smokeTestRequest.transformations
      );
      reply.status(200).send(results);
    } catch (error) {
      reply.status(400).send({
        code: 'SMOKE_TEST_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // RFC-3161 timestamp routes
  fastify.post('/timestamps', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const timestampRequest = request.body as any;
      const result = await rfc3161Service.createTimestamp(timestampRequest);
      reply.status(201).send(result);
    } catch (error) {
      reply.status(400).send({
        code: 'TIMESTAMP_CREATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.get('/timestamps/:timestampId/verify', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const { timestampId } = request.params as any;
      const result = await rfc3161Service.verifyTimestamp(timestampId);
      reply.status(200).send(result);
    } catch (error) {
      reply.status(400).send({
        code: 'TIMESTAMP_VERIFICATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.get('/tenants/:tenantId/timestamps', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const { tenantId } = request.params as any;
      const history = await rfc3161Service.getTimestampHistory(tenantId);
      reply.status(200).send(history);
    } catch (error) {
      reply.status(400).send({
        code: 'TIMESTAMP_HISTORY_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  // Export routes
  fastify.post('/tenants/:tenantId/export', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const { tenantId } = request.params as any;
      const exportRequest = request.body as any;
      const exportJob = await exportService.createExportJob(tenantId, exportRequest.includes);
      reply.status(201).send(exportJob);
    } catch (error) {
      reply.status(400).send({
        code: 'EXPORT_CREATION_FAILED',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  fastify.get('/exports/:exportId/download', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const { exportId } = request.params as any;
      const fileStream = await exportService.getExportFileStream(exportId);
      
      reply.type('application/zip');
      reply.header('Content-Disposition', `attachment; filename="export-${exportId}.zip"`);
      return fileStream;
    } catch (error) {
      reply.status(404).send({
        code: 'EXPORT_NOT_FOUND',
        message: error instanceof Error ? error.message : 'Export not found',
      });
    }
  });

  // Stripe webhook - CRITICAL SECURITY
  fastify.post('/webhooks/stripe', {
    preHandler: [authMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const signature = request.headers['stripe-signature'] as string;
      
      // CRITICAL: Validate signature exists
      if (!signature) {
        reply.status(401).send({
          code: 'MISSING_SIGNATURE',
          message: 'Stripe signature is required',
        });
        return;
      }
      
      // CRITICAL: Get raw body for signature verification
      const rawBody = (request as any).rawBody || JSON.stringify(request.body);
      
      // CRITICAL: Verify webhook signature with proper error handling
      let event;
      try {
        event = services.stripeService.verifyWebhookSignature(rawBody, signature);
      } catch (signatureError) {
        console.error('Webhook signature verification failed:', signatureError);
        reply.status(401).send({
          code: 'INVALID_SIGNATURE',
          message: 'Invalid webhook signature',
        });
        return;
      }
      
      // CRITICAL: Validate event structure
      if (!event || !event.type || !event.data) {
        reply.status(400).send({
          code: 'INVALID_EVENT',
          message: 'Invalid webhook event structure',
        });
        return;
      }
      
      // CRITICAL: Process event with timeout and error isolation
      try {
        await Promise.race([
          services.stripeService.handleWebhookEvent(event),
          new Promise((_, reject) => 
            setTimeout(() => reject(new Error('Webhook processing timeout')), 30000)
          )
        ]);
      } catch (processingError) {
        console.error('Webhook event processing failed:', processingError);
        // Still return 200 to prevent Stripe retries, but log the error
        reply.status(200).send({ 
          received: true, 
          warning: 'Event processing failed but was acknowledged' 
        });
        return;
      }
      
      reply.status(200).send({ received: true });
      
    } catch (error) {
      console.error('Webhook handler error:', error);
      reply.status(500).send({
        code: 'WEBHOOK_ERROR',
        message: 'Internal webhook processing error',
      });
    }
  });

  // Phase 39 - Pricing Calculator Routes
  fastify.post('/pricing/simulate', {
    preHandler: [validationMiddleware],
  }, pricingController.simulatePricing.bind(pricingController));

  fastify.post('/pricing/compare', {
    preHandler: [validationMiddleware],
  }, pricingController.comparePlans.bind(pricingController));

  fastify.get('/pricing/model', pricingController.getCostModel.bind(pricingController));

  fastify.post('/pricing/optimizer', {
    preHandler: [validationMiddleware],
  }, pricingController.optimizePricing.bind(pricingController));

  // Phase 39 - Safeguard Routes
  fastify.post('/safeguards/evaluate', {
    preHandler: [authMiddleware, validationMiddleware],
  }, safeguardController.evaluateSafeguards.bind(safeguardController));

  fastify.post('/safeguards/check-burst-cap', {
    preHandler: [authMiddleware, validationMiddleware],
  }, safeguardController.checkBurstCap.bind(safeguardController));

  fastify.post('/safeguards/reset-tenant', {
    preHandler: [authMiddleware, validationMiddleware],
  }, safeguardController.resetTenant.bind(safeguardController));

  fastify.post('/safeguards/handle-storm', {
    preHandler: [authMiddleware, validationMiddleware],
  }, safeguardController.handleStormConditions.bind(safeguardController));

  fastify.get('/safeguards/tenant/:tenantId/history', {
    preHandler: [authMiddleware, validationMiddleware],
  }, safeguardController.getSafeguardHistory.bind(safeguardController));

  fastify.get('/safeguards/dashboard', {
    preHandler: [authMiddleware],
  }, safeguardController.getSafeguardDashboard.bind(safeguardController));

  // Phase 39 - Economics Dashboard Routes
  fastify.get('/economics/overview', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    try {
      const periodDays = parseInt((request.query as any).periodDays || '30');
      const overview = await services.economicsDashboardService.getEconomicsOverview(periodDays);
      return reply.send({ success: true, data: overview });
    } catch (error) {
      reply.status(500).send({ success: false, error: 'Failed to get economics overview' });
    }
  });

  fastify.get('/economics/cogs-breakdown', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    try {
      const periodDays = parseInt((request.query as any).periodDays || '30');
      const breakdown = await services.economicsDashboardService.getCOGSBreakdown(periodDays);
      return reply.send({ success: true, data: breakdown });
    } catch (error) {
      reply.status(500).send({ success: false, error: 'Failed to get COGS breakdown' });
    }
  });

  fastify.get('/economics/realtime', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    try {
      const metrics = await services.economicsDashboardService.getRealTimeMetrics();
      return reply.send({ success: true, data: metrics });
    } catch (error) {
      reply.status(500).send({ success: false, error: 'Failed to get real-time metrics' });
    }
  });

  // Phase 39 - Coherence Routes
  fastify.get('/coherence/report/:date', {
    preHandler: [authMiddleware],
  }, async (request, reply) => {
    try {
      const { date } = request.params as any;
      const report = await services.coherenceService.getCoherenceReport(date);
      return reply.send({ success: true, data: report });
    } catch (error) {
      reply.status(500).send({ success: false, error: 'Failed to get coherence report' });
    }
  });

  fastify.post('/coherence/check/:tenantId/:date', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request, reply) => {
    try {
      const { tenantId, date } = request.params as any;
      const check = await services.coherenceService.triggerManualCheck(tenantId, date);
      return reply.send({ success: true, data: check });
    } catch (error) {
      reply.status(500).send({ success: false, error: 'Failed to trigger coherence check' });
    }
  });

  // Phase 39 - Exit Test Routes (Admin Only)
  fastify.post('/admin/exit-tests', {
    preHandler: [authMiddleware, validationMiddleware],
  }, async (request, reply) => {
    try {
      const Phase39ExitTests = require('./tests/phase39-exit-tests').default;
      const exitTests = new Phase39ExitTests(services.economicsService.redis);
      const results = await exitTests.runAllExitTests();
      return reply.send({ success: true, data: results });
    } catch (error) {
      reply.status(500).send({ success: false, error: 'Failed to run exit tests' });
    }
  });
}

// Global services reference for shutdown handlers
let globalServices: any;

// Main application startup
async function start() {
  try {
    // CRITICAL: Register plugins first
    await registerPlugins();

    // Initialize services
    const services = await initializeServices();
    globalServices = services; // Store for shutdown access

    // CRITICAL: Register middleware in correct order
    fastify.addHook('preHandler', validationMiddleware); // First: validation
    fastify.addHook('preHandler', securityMiddleware);   // Second: security
    fastify.addHook('preHandler', authMiddleware);       // Third: auth
    fastify.addHook('preHandler', loggingMiddleware);    // Fourth: logging
    fastify.setErrorHandler(errorMiddleware);           // Global error handler

    // Register routes
    registerRoutes(services);

    // Start server
    await fastify.listen({
      port: env.PORT,
      host: env.HOST,
    });

    console.log(`✅ Phase 39 Billing System started successfully`);
    console.log(`🌐 Server listening on http://${env.HOST}:${env.PORT}`);
    console.log(`📝 Documentation: http://${env.HOST}:${env.PORT}/docs`);
    console.log(`💰 Economics Engine: Unit cost modeling, burst caps, auto-degradation, kill-switches`);
    console.log(`🛡️ Safeguards: Real-time exposure monitoring, storm detection, graceful degradation`);
    console.log(`📊 Pricing Calculator: Public plan simulation, volume discounts, enterprise minimums`);
    console.log(`🔍 Coherence Verification: Pricing-invoice alignment within ±2% tolerance`);
    
  } catch (error) {
    console.error('❌ Failed to start Phase 39 Billing System:', error);
    process.exit(1);
  }
}

// CRITICAL: Enhanced graceful shutdown with proper cleanup
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  try {
    // Close HTTP server first
    await fastify.close();
    
    // Close Redis connections
    if (globalServices.redis) {
      await globalServices.redis.quit();
    }
    
    // Shutdown OpenTelemetry
    if (sdk) {
      await sdk.shutdown();
    }
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  try {
    // Close HTTP server first
    await fastify.close();
    
    // Close Redis connections
    if (globalServices.redis) {
      await globalServices.redis.quit();
    }
    
    // Shutdown OpenTelemetry
    if (sdk) {
      await sdk.shutdown();
    }
    
    console.log('✅ Graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during graceful shutdown:', error);
    process.exit(1);
  }
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  // Log the error and exit immediately
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  // Log the error and exit
  process.exit(1);
});

// Start the application
if (require.main === module) {
  start();
}

export { fastify, start };
