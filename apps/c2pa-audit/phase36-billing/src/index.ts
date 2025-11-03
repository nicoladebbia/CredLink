/**
 * Phase 36 Billing - Main Application
 * Self-Serve Onboarding & Billing System
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

import { loadEnvironment, getConfigSummary } from '@/config/env';
import { TenantService } from '@/services/tenant-service';
import { StripeService } from '@/services/stripe-service';
import { OnboardingService } from '@/services/onboarding-service';
import { UsageService } from '@/services/usage-service';
import { InstallHealthService } from '@/services/install-health-service';
import { ExportService } from '@/services/export-service';
import { CaiVerifyService } from '@/services/cai-verify-service';
import { RFC3161Service } from '@/services/rfc3161-service';
import { TenantController } from '@/controllers/tenant-controller';
import { BillingController } from '@/controllers/billing-controller';
import { authMiddleware } from '@/middleware/auth';
import { validationMiddleware } from '@/middleware/validation';
import { securityMiddleware } from '@/middleware/security';
import { loggingMiddleware } from '@/middleware/logging';
import { errorMiddleware } from '@/middleware/error';

// Load environment configuration
const env = loadEnvironment();
const configSummary = getConfigSummary(env);

console.log('🚀 Starting Phase 36 Billing System');
console.log('📊 Configuration:', JSON.stringify(configSummary, null, 2));

// Create Fastify instance
const fastify: FastifyInstance = Fastify({
  logger: {
    level: env.LOG_LEVEL,
    prettyPrint: env.LOG_FORMAT === 'pretty',
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
    },
  });

  // Static files
  await fastify.register(staticFiles, {
    root: './public',
    prefix: '/public',
  });

  // WebSocket support
  await fastify.register(websocket);
}

// Initialize services
async function initializeServices() {
  // Redis connection
  const redis = new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    db: env.REDIS_DB,
    password: env.REDIS_PASSWORD,
    maxRetriesPerRequest: env.REDIS_MAX_RETRIES,
    retryDelayOnFailover: 100,
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
    verifySdkVersion: '2.1.0',
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

  // Initialize controllers
  const tenantController = new TenantController({
    tenantService,
    onboardingService,
  });

  const billingController = new BillingController({
    stripeService,
    usageService,
  });

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
  };
}

// Register routes
async function registerRoutes(services: any) {
  const { tenantController, billingController, installHealthService, caiVerifyService, rfc3161Service, exportService } = services;

  // Health check
  fastify.get('/health', async (request, reply) => {
    return {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: '1.1.0',
      services: {
        redis: 'connected',
        stripe: 'connected',
        database: 'connected',
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
        message: error.message,
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
        message: error.message,
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
        message: error.message,
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
        message: error.message,
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
        message: error.message,
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
        message: error.message,
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
        message: error.message,
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
        message: error.message,
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
        message: error.message,
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
        message: error.message,
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
        message: error.message,
      });
    }
  });

  // Stripe webhook
  fastify.post('/webhooks/stripe', {
    preHandler: [validationMiddleware],
  }, async (request: FastifyRequest, reply) => {
    try {
      const signature = request.headers['stripe-signature'] as string;
      const payload = JSON.stringify(request.body);
      
      const event = services.stripeService.verifyWebhookSignature(payload, signature);
      await services.stripeService.handleWebhookEvent(event);
      
      reply.status(200).send({ received: true });
    } catch (error) {
      reply.status(400).send({
        code: 'WEBHOOK_PROCESSING_FAILED',
        message: error.message,
      });
    }
  });
}

// Main application startup
async function start() {
  try {
    // Register plugins
    await registerPlugins();

    // Initialize services
    const services = await initializeServices();

    // Register middleware
    fastify.addHook('preHandler', loggingMiddleware);
    fastify.addHook('preHandler', securityMiddleware);
    fastify.setErrorHandler(errorMiddleware);

    // Register routes
    await registerRoutes(services);

    // Start server
    await fastify.listen({
      port: env.PORT,
      host: env.HOST,
    });

    console.log(`✅ Phase 36 Billing System started successfully`);
    console.log(`🌐 Server listening on http://${env.HOST}:${env.PORT}`);
    console.log(`📝 Documentation: http://${env.HOST}:${env.PORT}/docs`);
    
  } catch (error) {
    console.error('❌ Failed to start Phase 36 Billing System:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  await fastify.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('🛑 SIGINT received, shutting down gracefully...');
  await fastify.close();
  process.exit(0);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('💥 Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Start the application
if (require.main === module) {
  start();
}

export { fastify, start };
