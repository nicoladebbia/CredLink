/**
 * Phase 36 Billing - Tenant Controller
 * HTTP endpoints for tenant management and onboarding
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { 
  CreateTenantRequest,
  CreateTenantResponse,
  WizardStep,
  WizardStepData,
  APIError,
  ValidationError
} from '@/types';
import { TenantService, OnboardingService } from '@/services';

export interface TenantControllerConfig {
  tenantService: TenantService;
  onboardingService: OnboardingService;
}

export class TenantController {
  private tenantService: TenantService;
  private onboardingService: OnboardingService;

  constructor(config: TenantControllerConfig) {
    this.tenantService = config.tenantService;
    this.onboardingService = config.onboardingService;
  }

  /**
   * Create a new tenant
   */
  async createTenant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const createRequest = request.body as CreateTenantRequest;

      // CRITICAL: Validate request structure
      if (!createRequest || typeof createRequest !== 'object') {
        reply.status(400).send({
          code: 'INVALID_REQUEST',
          message: 'Request body is required and must be an object',
        });
        return;
      }

      // Validate request
      await this.validateCreateTenantRequest(createRequest);

      // Create tenant
      const response = await this.tenantService.createTenant(createRequest);

      reply.status(201).send(response);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Get tenant by ID
   */
  async getTenant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = request.params as { tenantId: string };

      // CRITICAL: Validate tenant ID parameter
      if (!tenantId || typeof tenantId !== 'string' || tenantId.trim().length === 0) {
        reply.status(400).send({
          code: 'INVALID_TENANT_ID',
          message: 'Tenant ID is required and must be a non-empty string',
        });
        return;
      }

      // CRITICAL: Validate tenant ID format
      if (!/^t_[a-z0-9]+_[a-f0-9]{24}$/.test(tenantId)) {
        reply.status(400).send({
          code: 'INVALID_TENANT_ID_FORMAT',
          message: 'Tenant ID format is invalid',
        });
        return;
      }

      const tenant = await this.tenantService.getTenant(tenantId);

      if (!tenant) {
        reply.status(404).send({
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
        });
        return;
      }

      reply.status(200).send(tenant);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Update tenant
   */
  async updateTenant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = request.params as { tenantId: string };
      const updates = request.body as any;

      const tenant = await this.tenantService.updateTenant(tenantId, updates);
      reply.status(200).send(tenant);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Get tenant wizard
   */
  async getTenantWizard(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = request.params as { tenantId: string };
      const wizard = await this.onboardingService.getWizard(tenantId);

      if (!wizard) {
        reply.status(404).send({
          code: 'WIZARD_NOT_FOUND',
          message: 'Onboarding wizard not found',
        });
        return;
      }

      reply.status(200).send(wizard);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Execute wizard step
   */
  async executeWizardStep(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId, step } = request.params as { tenantId: string; step: WizardStep };
      const stepData = request.body as any;

      // Validate step
      if (!this.isValidWizardStep(step)) {
        reply.status(400).send({
          code: 'INVALID_WIZARD_STEP',
          message: `Invalid wizard step: ${step}`,
        });
        return;
      }

      // Execute step based on step type
      let result: WizardStepData;
      switch (step) {
        case 'domain_setup':
          result = await this.onboardingService.executeDomainSetup(tenantId, stepData.domains);
          break;
        case 'manifest_config':
          result = await this.onboardingService.executeManifestConfig(tenantId, stepData.manifest_host);
          break;
        case 'cms_selection':
          result = await this.onboardingService.executeCmsSelection(tenantId, stepData.cms);
          break;
        case 'plugin_install':
          result = await this.onboardingService.executePluginInstall(tenantId, stepData.test_url);
          break;
        case 'demo_asset_upload':
          result = await this.onboardingService.executeDemoAssetVerification(tenantId, stepData.demo_asset_url);
          break;
        case 'verify_demo':
          result = await this.onboardingService.executeDemoAssetVerification(tenantId, stepData.demo_asset_url);
          break;
        case 'publish_test_page':
          result = await this.onboardingService.executeTestPagePublish(tenantId, stepData.test_page_url);
          break;
        case 'smoke_test':
          result = await this.onboardingService.executeSmokeTest(tenantId, stepData.test_asset_url);
          break;
        case 'install_health_check':
          // This is handled by the install health controller
          reply.status(400).send({
            code: 'INVALID_ENDPOINT',
            message: 'Use /install/check endpoint for health checks',
          });
          return;
        case 'billing_setup':
          // This is handled by the billing controller
          reply.status(400).send({
            code: 'INVALID_ENDPOINT',
            message: 'Use /billing endpoints for setup',
          });
          return;
        default:
          reply.status(400).send({
            code: 'INVALID_WIZARD_STEP',
            message: `Unknown wizard step: ${step}`,
          });
          return;
      }

      // Update wizard
      const updatedWizard = await this.onboardingService.updateWizardStep(
        tenantId,
        step,
        stepData,
        result.completed
      );

      reply.status(200).send({
        step_result: result,
        wizard: updatedWizard,
      });
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Check if tenant can checkout
   */
  async canCheckout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = request.params as { tenantId: string };
      const canCheckout = await this.tenantService.canCheckout(tenantId);

      reply.status(200).send({
        can_checkout: canCheckout,
        tenant_id: tenantId,
      });
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Get tenant usage
   */
  async getTenantUsage(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = request.params as { tenantId: string };
      const usage = await this.tenantService.getTenantUsage(tenantId);

      reply.status(200).send(usage);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Cancel tenant
   */
  async cancelTenant(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = request.params as { tenantId: string };
      const { immediate, export_data, reason, feedback } = request.body as any;

      // This would integrate with the export service
      const cancelResponse = await this.tenantService.cancelTenant(tenantId, immediate || false);

      reply.status(200).send(cancelResponse);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async validateCreateTenantRequest(request: CreateTenantRequest): Promise<void> {
    const errors: ValidationError[] = [];

    // Validate email
    if (!request.email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.email)) {
      errors.push({
        code: 'INVALID_EMAIL',
        message: 'Valid email address is required',
        field: 'email',
        value: request.email,
      });
    }

    // Validate plan
    const validPlans = ['starter', 'pro', 'enterprise'];
    if (!request.plan || !validPlans.includes(request.plan)) {
      errors.push({
        code: 'INVALID_PLAN',
        message: `Plan must be one of: ${validPlans.join(', ')}`,
        field: 'plan',
        value: request.plan,
      });
    }

    // Validate payment method
    if (!request.payment_method_id || typeof request.payment_method_id !== 'string') {
      errors.push({
        code: 'INVALID_PAYMENT_METHOD',
        message: 'Payment method ID is required',
        field: 'payment_method_id',
        value: request.payment_method_id,
      });
    }

    // Validate domains
    if (!request.domains || !Array.isArray(request.domains) || request.domains.length === 0) {
      errors.push({
        code: 'INVALID_DOMAINS',
        message: 'At least one domain is required',
        field: 'domains',
        value: request.domains,
      });
    } else {
      for (const domain of request.domains) {
        if (!domain || typeof domain !== 'string') {
          errors.push({
            code: 'INVALID_DOMAIN',
            message: 'Each domain must be a valid string',
            field: 'domains',
            value: domain,
          });
        }
      }
    }

    // Validate CMS
    const validCmsTypes = ['wordpress', 'shopify', 'custom', 'none'];
    if (!request.cms || !validCmsTypes.includes(request.cms)) {
      errors.push({
        code: 'INVALID_CMS',
        message: `CMS must be one of: ${validCmsTypes.join(', ')}`,
        field: 'cms',
        value: request.cms,
      });
    }

    // Validate manifest host if provided
    if (request.manifest_host) {
      try {
        new URL(request.manifest_host);
        if (!request.manifest_host.startsWith('https://')) {
          errors.push({
            code: 'INVALID_MANIFEST_HOST',
            message: 'Manifest host must use HTTPS',
            field: 'manifest_host',
            value: request.manifest_host,
          });
        }
      } catch (error) {
        errors.push({
          code: 'INVALID_MANIFEST_HOST',
          message: 'Manifest host must be a valid URL',
          field: 'manifest_host',
          value: request.manifest_host,
        });
      }
    }

    if (errors.length > 0) {
      const error: APIError = {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: { errors },
      };
      throw error;
    }
  }

  private isValidWizardStep(step: string): step is WizardStep {
    const validSteps: WizardStep[] = [
      'domain_setup',
      'manifest_config',
      'cms_selection',
      'plugin_install',
      'demo_asset_upload',
      'verify_demo',
      'publish_test_page',
      'smoke_test',
      'install_health_check',
      'billing_setup',
    ];
    return validSteps.includes(step as WizardStep);
  }

  private handleError(error: any, reply: FastifyReply): void {
    console.error('Tenant controller error:', error);

    // CRITICAL: Generate unique error ID for tracking
    const errorId = `err_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    if (error.code && error.message) {
      // APIError
      const statusCode = this.getStatusCodeFromError(error.code);
      reply.status(statusCode).send({
        ...error,
        error_id: errorId,
        timestamp: new Date().toISOString(),
      });
    } else if (error.name === 'ValidationError') {
      // Validation error
      reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.details,
        error_id: errorId,
        timestamp: new Date().toISOString(),
      });
    } else if (error.name === 'StripeError') {
      // Stripe error
      reply.status(400).send({
        code: 'STRIPE_ERROR',
        message: 'Payment processing error',
        details: {
          stripe_error: error.message,
          type: error.type,
        },
        error_id: errorId,
        timestamp: new Date().toISOString(),
      });
    } else {
      // Unknown error
      reply.status(500).send({
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
        details: process.env['NODE_ENV'] === 'development' ? { error: error.message } : undefined,
        error_id: errorId,
        timestamp: new Date().toISOString(),
      });
    }
  }

  private getStatusCodeFromError(errorCode: string): number {
    switch (errorCode) {
      case 'TENANT_NOT_FOUND':
      case 'WIZARD_NOT_FOUND':
        return 404;
      case 'VALIDATION_FAILED':
      case 'INVALID_EMAIL':
      case 'INVALID_PLAN':
      case 'INVALID_PAYMENT_METHOD':
      case 'INVALID_DOMAINS':
      case 'INVALID_DOMAIN':
      case 'INVALID_CMS':
      case 'INVALID_MANIFEST_HOST':
      case 'INVALID_WIZARD_STEP':
      case 'INVALID_ENDPOINT':
        return 400;
      case 'TRIAL_LIMIT_EXCEEDED':
        return 429;
      case 'STRIPE_CARD_ERROR':
      case 'STRIPE_PAYMENT_FAILED':
        return 402;
      case 'UNAUTHORIZED':
      case 'INVALID_API_KEY':
        return 401;
      case 'FORBIDDEN':
        return 403;
      default:
        return 500;
    }
  }
}
