/**
 * Phase 36 Billing - Tenant Service
 * Tenant provisioning, management, and API key handling
 */

import { randomBytes, createHash, timingSafeEqual } from 'crypto';
import { Redis } from 'ioredis';
import Stripe from 'stripe';
import { 
  Tenant, 
  TenantPlan, 
  TenantStatus, 
  CreateTenantRequest, 
  CreateTenantResponse,
  OnboardingWizard,
  TenantPolicy,
  TenantTrial,
  TenantInstall,
  TenantUsage,
  TenantBilling,
  WizardStep
} from '@/types';

export interface TenantServiceConfig {
  redis: Redis;
  stripe: Stripe;
  apiKeySecret: string;
  trialDurationDays: number;
  trialAssetCap: number;
  manifestHostBaseUrl: string;
  verifySdkVersion: string;
}

export class TenantService {
  private redis: Redis;
  private stripe: Stripe;
  private config: TenantServiceConfig;

  constructor(config: TenantServiceConfig) {
    this.redis = config.redis;
    this.stripe = config.stripe;
    this.config = config;
  }

  /**
   * Create a new tenant with Stripe integration
   */
  async createTenant(request: CreateTenantRequest): Promise<CreateTenantResponse> {
    const tenantId = this.generateTenantId();
    const apiKey = this.generateApiKey();
    const hashedApiKey = this.hashApiKey(apiKey);

    // Create Stripe customer
    const customer = await this.stripe.customers.create({
      email: request.email,
      name: request.company_name,
      metadata: {
        tenant_id: tenantId,
        created_by: 'self_serve_onboarding',
      },
    });

    // Create Stripe subscription with trial
    const subscription = await this.stripe.subscriptions.create({
      customer: customer.id,
      items: [{
        price: this.getStripePriceId(request.plan),
      }],
      trial_period_days: this.config.trialDurationDays,
      payment_behavior: 'default_incomplete',
      payment_settings: {
        save_default_payment_method: 'on_subscription',
        payment_method_types: ['card'],
      },
      metadata: {
        tenant_id: tenantId,
        plan: request.plan,
      },
    });

    // Initialize tenant data
    const tenant: Tenant = {
      tenant_id: tenantId,
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
      plan: request.plan,
      trial: this.initializeTrial(subscription.trial_end!),
      policy: this.initializePolicy(request, tenantId),
      install: this.initializeInstall(request, tenantId),
      usage: this.initializeUsage(),
      billing: this.initializeBilling(subscription),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      status: subscription.trial_end ? 'trial' : 'active',
    };

    // Initialize onboarding wizard
    const wizard = this.initializeWizard(tenantId);

    // Store tenant data
    await this.storeTenant(tenant);
    await this.storeApiKey(hashedApiKey, tenantId);
    await this.storeWizard(wizard);

    return {
      tenant_id: tenantId,
      api_key: apiKey,
      policy: tenant.policy,
      trial: tenant.trial,
      wizard,
      stripe_customer_id: customer.id,
      stripe_subscription_id: subscription.id,
    };
  }

  /**
   * Get tenant by ID
   */
  async getTenant(tenantId: string): Promise<Tenant | null> {
    try {
      const data = await this.redis.get(`tenant:${tenantId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      throw new Error(`Failed to get tenant: ${error}`);
    }
  }

  /**
   * Get tenant by API key
   */
  async getTenantByApiKey(apiKey: string): Promise<Tenant | null> {
    try {
      const hashedApiKey = this.hashApiKey(apiKey);
      const tenantId = await this.redis.get(`api_key:${hashedApiKey}`);
      
      if (!tenantId) {
        return null;
      }

      return this.getTenant(tenantId);
    } catch (error) {
      throw new Error(`Failed to get tenant by API key: ${error}`);
    }
  }

  /**
   * Update tenant
   */
  async updateTenant(tenantId: string, updates: Partial<Tenant>): Promise<Tenant> {
    const existing = await this.getTenant(tenantId);
    if (!existing) {
      throw new Error('Tenant not found');
    }

    const updated = {
      ...existing,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    await this.storeTenant(updated);
    return updated;
  }

  /**
   * Update tenant install status
   */
  async updateInstallStatus(tenantId: string, installUpdates: Partial<TenantInstall>): Promise<void> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    tenant.install = {
      ...tenant.install,
      ...installUpdates,
    };

    tenant.updated_at = new Date().toISOString();
    await this.storeTenant(tenant);
  }

  /**
   * Update wizard step
   */
  async updateWizardStep(tenantId: string, step: WizardStep, data: any, completed: boolean = true): Promise<OnboardingWizard> {
    const wizard = await this.getWizard(tenantId);
    if (!wizard) {
      throw new Error('Wizard not found');
    }

    wizard.step_data[step] = {
      completed,
      data,
      completed_at: completed ? new Date().toISOString() : undefined,
    };

    if (completed && !wizard.completed_steps.includes(step)) {
      wizard.completed_steps.push(step);
    }

    // Update current step
    const allSteps: WizardStep[] = [
      'domain_setup', 'manifest_config', 'cms_selection', 'plugin_install',
      'demo_asset_upload', 'verify_demo', 'publish_test_page', 'smoke_test',
      'install_health_check', 'billing_setup'
    ];

    const nextStep = allSteps.find(s => !wizard.completed_steps.includes(s));
    wizard.current_step = nextStep || 'billing_setup';
    wizard.status = nextStep ? 'in_progress' : 'completed';
    wizard.updated_at = new Date().toISOString();

    await this.storeWizard(wizard);
    return wizard;
  }

  /**
   * Check if tenant can checkout (install health is green)
   */
  async canCheckout(tenantId: string): Promise<boolean> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      return false;
    }

    const wizard = await this.getWizard(tenantId);
    if (!wizard) {
      return false;
    }

    // Must complete all steps except billing_setup
    const requiredSteps: WizardStep[] = [
      'domain_setup', 'manifest_config', 'cms_selection', 'plugin_install',
      'demo_asset_upload', 'verify_demo', 'publish_test_page', 'smoke_test',
      'install_health_check'
    ];

    return requiredSteps.every(step => wizard.completed_steps.includes(step));
  }

  /**
   * Get tenant usage
   */
  async getTenantUsage(tenantId: string): Promise<TenantUsage> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    return tenant.usage;
  }

  /**
   * Increment usage counter
   */
  async incrementUsage(tenantId: string, eventType: 'sign_events' | 'verify_events' | 'rfc3161_timestamps', value: number = 1): Promise<void> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    // Check trial limits
    if (tenant.status === 'trial' && eventType === 'sign_events') {
      if (tenant.usage.current_month.sign_events + value > tenant.trial.cap.sign_assets) {
        throw new Error('Trial asset limit exceeded');
      }
    }

    // Update usage counters
    tenant.usage.current_month[eventType] += value;
    tenant.usage.lifetime[eventType] += value;
    tenant.updated_at = new Date().toISOString();

    await this.storeTenant(tenant);

    // Push usage to Stripe (async)
    this.pushUsageToStripe(tenant.stripe_customer_id, eventType, value).catch(error => {
      console.error(`Failed to push usage to Stripe for tenant ${tenantId}:`, error);
    });
  }

  /**
   * Cancel tenant subscription
   */
  async cancelTenant(tenantId: string, immediate: boolean = false): Promise<void> {
    const tenant = await this.getTenant(tenantId);
    if (!tenant) {
      throw new Error('Tenant not found');
    }

    if (immediate) {
      await this.stripe.subscriptions.cancel(tenant.stripe_subscription_id);
    } else {
      await this.stripe.subscriptions.update(tenant.stripe_subscription_id, {
        cancel_at_period_end: true,
      });
    }

    tenant.status = 'canceled';
    tenant.updated_at = new Date().toISOString();
    await this.storeTenant(tenant);
  }

  /**
   * Get wizard for tenant
   */
  async getWizard(tenantId: string): Promise<OnboardingWizard | null> {
    try {
      const data = await this.redis.get(`wizard:${tenantId}`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      throw new Error(`Failed to get wizard: ${error}`);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private generateTenantId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = randomBytes(12).toString('hex');
    return `t_${timestamp}_${randomPart}`;
  }

  private generateApiKey(): string {
    // Generate cryptographically secure API key with maximum entropy
    const timestamp = Date.now().toString(36);
    const randomPart = randomBytes(32).toString('hex');
    const entropy = randomBytes(16).toString('base64').replace(/[+/=]/g, '');
    
    return `c2pa_${timestamp}_${randomPart}_${entropy}`;
  }

  private hashApiKey(apiKey: string): string {
    return createHash('sha256').update(apiKey).digest('hex');
  }

  private getStripePriceId(plan: TenantPlan): string {
    switch (plan) {
      case 'starter':
        return process.env['STRIPE_STARTER_PRICE_ID']!;
      case 'pro':
        return process.env['STRIPE_PRO_PRICE_ID']!;
      case 'enterprise':
        return process.env['STRIPE_ENTERPRISE_PRICE_ID']!;
      default:
        throw new Error(`Unknown plan: ${plan}`);
    }
  }

  private initializeTrial(trialEnd: number): TenantTrial {
    const now = new Date();
    const endTime = new Date(trialEnd * 1000);

    return {
      ends_at: endTime.toISOString(),
      cap: {
        sign_assets: this.config.trialAssetCap,
      },
      used: {
        sign_assets: 0,
      },
      is_active: endTime > now,
    };
  }

  private initializePolicy(request: CreateTenantRequest, tenantId: string): TenantPolicy {
    return {
      mode: 'remote-first',
      badge: true,
      verify_sdk_version: this.config.verifySdkVersion,
      manifest_host: request.manifest_host || `${this.config.manifestHostBaseUrl}/${tenantId}`,
    };
  }

  private initializeInstall(request: CreateTenantRequest, tenantId: string): TenantInstall {
    return {
      domains: request.domains,
      cms: request.cms,
      manifest_host: request.manifest_host || `${this.config.manifestHostBaseUrl}/${tenantId}`,
      link_header_configured: false,
      plugin_installed: false,
      demo_asset_verified: false,
      test_page_published: false,
      smoke_test_passed: false,
    };
  }

  private initializeUsage(): TenantUsage {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    return {
      current_month: {
        sign_events: 0,
        verify_events: 0,
        rfc3161_timestamps: 0,
      },
      lifetime: {
        sign_events: 0,
        verify_events: 0,
        rfc3161_timestamps: 0,
      },
      last_reset: startOfMonth.toISOString(),
    };
  }

  private initializeBilling(subscription: Stripe.Subscription): TenantBilling {
    return {
      next_invoice_date: new Date(subscription.current_period_end * 1000).toISOString(),
      amount_due: 0,
      currency: 'usd',
    };
  }

  private initializeWizard(tenantId: string): OnboardingWizard {
    return {
      tenant_id: tenantId,
      current_step: 'domain_setup',
      completed_steps: [],
      step_data: {},
      status: 'in_progress',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  }

  private async storeTenant(tenant: Tenant): Promise<void> {
    await this.redis.setex(
      `tenant:${tenant.tenant_id}`,
      86400 * 30, // 30 days TTL
      JSON.stringify(tenant)
    );
  }

  private async storeApiKey(hashedApiKey: string, tenantId: string): Promise<void> {
    await this.redis.setex(
      `api_key:${hashedApiKey}`,
      86400 * 365, // 1 year TTL
      tenantId
    );
  }

  private async storeWizard(wizard: OnboardingWizard): Promise<void> {
    await this.redis.setex(
      `wizard:${wizard.tenant_id}`,
      86400 * 30, // 30 days TTL
      JSON.stringify(wizard)
    );
  }

  /**
   * Push usage event to Stripe for billing
   */
  private async pushUsageToStripe(
    customerId: string,
    eventType: 'sign_events' | 'verify_events' | 'rfc3161_timestamps',
    value: number,
    metadata?: Record<string, string>
  ): Promise<void> {
    const tenant = await this.getTenant(customerId);
    if (!tenant) {
      return;
    }

    const meterId = this.getMeterId(eventType);
    if (!meterId) {
      return;
    }

    try {
      await this.stripe.billing.meterEvent.create({
        event_name: eventType,
        payload: {
          value: value.toString(),
          stripe_customer_id: tenant.stripe_customer_id,
        },
        timestamp: Math.floor(Date.now() / 1000),
      });
    } catch (error) {
      console.error(`Stripe usage push failed for ${eventType}:`, error);
      throw error;
    }
  }

  private getMeterId(eventType: 'sign_events' | 'verify_events' | 'rfc3161_timestamps'): string | null {
    switch (eventType) {
      case 'sign_events':
        return process.env['STRIPE_SIGN_EVENTS_METER_ID']!;
      case 'verify_events':
        return process.env['STRIPE_VERIFY_EVENTS_METER_ID']!;
      case 'rfc3161_timestamps':
        return process.env['STRIPE_RFC3161_TIMESTAMPS_METER_ID']!;
      default:
        return null;
    }
  }
}
