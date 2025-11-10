/**
 * Phase 36 Billing - Stripe Service
 * Stripe Billing integration with trials, usage, and webhooks
 */

import Stripe from 'stripe';
import { observabilityLogging } from './observability-service';
import { 
  SubscriptionPlan, 
  UsageTier, 
  InvoiceLineItem,
  StripeWebhookEvent,
  UsageEvent,
  Tenant,
  BillingError
} from '../types';

export interface StripeServiceConfig {
  secretKey: string;
  webhookSecret: string;
  apiVersion: string;
  prices: {
    starter: string;
    pro: string;
    enterprise: string;
  };
  meters: {
    sign_events: string;
    verify_events: string;
    rfc3161_timestamps: string;
  };
  enableRadar: boolean;
  enableSmartRetries: boolean;
}

export class StripeService {
  private stripe: Stripe;
  private config: StripeServiceConfig;

  constructor(config: StripeServiceConfig) {
    this.stripe = new Stripe(config.secretKey, {
      apiVersion: config.apiVersion as Stripe.LatestApiVersion,
      typescript: true,
    });
    this.config = config;
  }

  // CRITICAL: Provide controlled access to Stripe instance
  getStripeInstance(): Stripe {
    return this.stripe;
  }

  /**
   * Calculate usage costs for billing projections
   */
  calculateUsageCosts(usage: {
    signEvents: number;
    verifyEvents: number;
    rfc3161Timestamps: number;
  }): {
    signCost: number;
    verifyCost: number;
    timestampCost: number;
    totalCost: number;
  } {
    // Default pricing rates (in cents)
    const rates = {
      signEvent: 0.01, // $0.01 per sign event
      verifyEvent: 0.005, // $0.005 per verify event
      rfc3161Timestamp: 0.10, // $0.10 per timestamp
    };

    const signCost = usage.signEvents * rates.signEvent;
    const verifyCost = usage.verifyEvents * rates.verifyEvent;
    const timestampCost = usage.rfc3161Timestamps * rates.rfc3161Timestamp;
    const totalCost = signCost + verifyCost + timestampCost;

    return {
      signCost,
      verifyCost,
      timestampCost,
      totalCost,
    };
  }

  /**
   * Create customer with enhanced fraud detection
   */
  async createCustomer(email: string, name?: string, metadata?: Record<string, string>): Promise<Stripe.Customer> {
    try {
      // CRITICAL: Input validation before Stripe API call
      if (!email || typeof email !== 'string') {
        throw new Error('Valid email address is required');
      }
      
      // Strict email validation
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!emailRegex.test(email)) {
        throw new Error('Invalid email format');
      }
      
      // Email length limits
      if (email.length > 254) {
        throw new Error('Email address too long');
      }
      
      // Name validation if provided
      if (name) {
        if (typeof name !== 'string' || name.length > 100) {
          throw new Error('Invalid name format or length');
        }
        
        // Check for dangerous patterns in name
        const dangerousPatterns = /<script|javascript:|data:|vbscript:|on\w+=/i;
        if (dangerousPatterns.test(name)) {
          throw new Error('Invalid characters in name');
        }
      }
      
      // Metadata validation
      if (metadata) {
        for (const [key, value] of Object.entries(metadata)) {
          if (typeof key !== 'string' || typeof value !== 'string') {
            throw new Error('Metadata keys and values must be strings');
          }
          if (key.length > 40 || value.length > 500) {
            throw new Error('Metadata key or value too long');
          }
        }
      }
      
      const customerParams: Stripe.CustomerCreateParams = {
        email,
        name,
        metadata,
        address: {
          country: 'US', // Default for tax calculation
        },
      };

      // Enable Radar fraud detection
      if (this.config.enableRadar) {
        customerParams.payment_method = 'card';
      }

      return await this.stripe.customers.create(customerParams);
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to create customer');
    }
  }

  /**
   * Create subscription with trial and usage billing
   */
  async createSubscription(
    customerId: string,
    priceId: string,
    trialDays: number = 14,
    paymentMethodId?: string
  ): Promise<Stripe.Subscription> {
    try {
      const subscriptionParams: Stripe.SubscriptionCreateParams = {
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: trialDays,
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
          payment_method_types: ['card'],
        },
        expand: ['latest_invoice.payment_intent'],
      };

      if (paymentMethodId) {
        subscriptionParams.default_payment_method = paymentMethodId;
      }

      // Enable Smart Retries for failed payments
      if (this.config.enableSmartRetries) {
        subscriptionParams.billing_cycle_anchor = undefined;
        subscriptionParams.proration_behavior = 'create_prorations';
      }

      return await this.stripe.subscriptions.create(subscriptionParams);
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to create subscription');
    }
  }

  /**
   * Update subscription with proration
   */
  async updateSubscription(
    subscriptionId: string,
    priceId: string,
    prorationBehavior: Stripe.SubscriptionUpdateParams.ProrationBehavior = 'create_prorations'
  ): Promise<Stripe.Subscription> {
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      
      return await this.stripe.subscriptions.update(subscriptionId, {
        items: [{
          id: subscription.items.data[0].id,
          price: priceId,
        }],
        proration_behavior: prorationBehavior,
        expand: ['latest_invoice.payment_intent'],
      });
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to update subscription');
    }
  }

  /**
   * Cancel subscription (immediate or at period end)
   */
  async cancelSubscription(
    subscriptionId: string,
    immediate: boolean = false
  ): Promise<Stripe.Subscription> {
    try {
      if (immediate) {
        return await this.stripe.subscriptions.cancel(subscriptionId);
      } else {
        return await this.stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true,
        });
      }
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to cancel subscription');
    }
  }

  /**
   * Create usage event for metered billing
   */
  async createUsageEvent(event: UsageEvent, customerId: string): Promise<Stripe.Billing.MeterEvent> {
    try {
      const meterId = this.getMeterId(event.event_type);
      if (!meterId) {
        throw new Error(`Unknown event type: ${event.event_type}`);
      }

      return await this.stripe.billing.meterEvents.create({
        event_name: event.event_type as 'sign_events' | 'verify_events' | 'rfc3161_timestamps',
        payload: {
          value: event.value.toString(),
          stripe_customer_id: customerId,
        },
        timestamp: Math.floor(new Date(event.timestamp).getTime() / 1000)
      });
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to create usage event');
    }
  }

  /**
   * Create usage event batch for efficiency
   */
  async createUsageEventsBatch(events: UsageEvent[], customerId: string): Promise<Stripe.Billing.MeterEvent[]> {
    const promises = events.map(event => this.createUsageEvent(event, customerId));
    return Promise.all(promises);
  }

  /**
   * Get subscription with usage
   */
  async getSubscriptionWithUsage(subscriptionId: string): Promise<Stripe.Subscription> {
    try {
      return await this.stripe.subscriptions.retrieve(subscriptionId, {
        expand: ['latest_invoice', 'customer'],
      });
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to retrieve subscription');
    }
  }

  /**
   * Get customer subscriptions
   */
  async getCustomerSubscriptions(customerId: string): Promise<Stripe.ApiList<Stripe.Subscription>> {
    try {
      return await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        expand: ['data.latest_invoice'],
      });
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to retrieve customer subscriptions');
    }
  }

  /**
   * Create invoice for one-time charges
   */
  async createInvoice(
    customerId: string,
    description?: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.Invoice> {
    try {
      return await this.stripe.invoices.create({
        customer: customerId,
        description,
        metadata,
        auto_advance: true,
      });
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to create invoice');
    }
  }

  /**
   * Create invoice item for custom charges
   */
  async createInvoiceItem(
    customerId: string,
    amount: number,
    currency: string = 'usd',
    description?: string,
    metadata?: Record<string, string>
  ): Promise<Stripe.InvoiceItem> {
    try {
      return await this.stripe.invoiceItems.create({
        customer: customerId,
        amount,
        currency,
        description,
        metadata,
      });
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to create invoice item');
    }
  }

  /**
   * Process refund with proration logic
   */
  async createRefund(
    paymentIntentId: string,
    amount?: number,
    reason?: Stripe.RefundCreateParams.Reason,
    metadata?: Record<string, string>
  ): Promise<Stripe.Refund> {
    try {
      return await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount,
        reason,
        metadata,
      });
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to create refund');
    }
  }

  /**
   * Get available plans with pricing
   */
  async getAvailablePlans(): Promise<SubscriptionPlan[]> {
    try {
      const plans: SubscriptionPlan[] = [];

      // Starter plan
      const starterPrice = await this.stripe.prices.retrieve(this.config.prices.starter);
      plans.push({
        id: 'starter',
        name: 'Starter',
        stripe_price_id: starterPrice.id,
        monthly_price: starterPrice.unit_amount! / 100,
        currency: starterPrice.currency,
        features: [
          { id: 'remote-first', name: 'Remote-First Manifests', description: 'Host manifests remotely for better performance', included: true },
          { id: 'badge', name: 'C2PA Badge', description: 'Display authenticity badge on content', included: true },
          { id: 'basic-support', name: 'Basic Support', description: 'Email support during business hours', included: true },
          { id: 'api-access', name: 'API Access', description: 'Full API access for integrations', included: true },
        ],
        limits: {
          sign_events_included: 500,
          verify_events_included: 10000,
          api_calls_per_minute: 60,
          tenants_per_account: 1,
          custom_domains: 2,
        },
      });

      // Pro plan
      const proPrice = await this.stripe.prices.retrieve(this.config.prices.pro);
      plans.push({
        id: 'pro',
        name: 'Pro',
        stripe_price_id: proPrice.id,
        monthly_price: proPrice.unit_amount! / 100,
        currency: proPrice.currency,
        features: [
          { id: 'remote-first', name: 'Remote-First Manifests', description: 'Host manifests remotely for better performance', included: true },
          { id: 'badge', name: 'C2PA Badge', description: 'Display authenticity badge on content', included: true },
          { id: 'priority-support', name: 'Priority Support', description: '24/7 priority support with SLA', included: true },
          { id: 'api-access', name: 'API Access', description: 'Full API access for integrations', included: true },
          { id: 'advanced-analytics', name: 'Advanced Analytics', description: 'Detailed usage analytics and reports', included: true },
          { id: 'custom-branding', name: 'Custom Branding', description: 'Custom badge and verification page branding', included: true },
        ],
        limits: {
          sign_events_included: 2000,
          verify_events_included: 50000,
          api_calls_per_minute: 300,
          tenants_per_account: 5,
          custom_domains: 10,
        },
      });

      // Enterprise plan
      const enterprisePrice = await this.stripe.prices.retrieve(this.config.prices.enterprise);
      plans.push({
        id: 'enterprise',
        name: 'Enterprise',
        stripe_price_id: enterprisePrice.id,
        monthly_price: enterprisePrice.unit_amount! / 100,
        currency: enterprisePrice.currency,
        features: [
          { id: 'remote-first', name: 'Remote-First Manifests', description: 'Host manifests remotely for better performance', included: true },
          { id: 'badge', name: 'C2PA Badge', description: 'Display authenticity badge on content', included: true },
          { id: 'dedicated-support', name: 'Dedicated Support', description: 'Dedicated account manager and 24/7 phone support', included: true },
          { id: 'api-access', name: 'API Access', description: 'Full API access for integrations', included: true },
          { id: 'advanced-analytics', name: 'Advanced Analytics', description: 'Detailed usage analytics and custom reports', included: true },
          { id: 'custom-branding', name: 'Custom Branding', description: 'Custom badge and verification page branding', included: true },
          { id: 'sla-guarantee', name: 'SLA Guarantee', description: '99.9% uptime SLA with financial guarantees', included: true },
          { id: 'custom-integrations', name: 'Custom Integrations', description: 'Custom integration development and support', included: true },
          { id: 'on-premise-option', name: 'On-Premise Option', description: 'Option for on-premise deployment', included: true },
        ],
        limits: {
          sign_events_included: 10000,
          verify_events_included: 250000,
          api_calls_per_minute: 1000,
          tenants_per_account: 25,
          custom_domains: 100,
        },
      });

      return plans;
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to retrieve plans');
    }
  }

  /**
   * Get usage tiers for pricing
   */
  async getUsageTiers(eventType: 'sign_events' | 'verify_events' | 'rfc3161_timestamps'): Promise<UsageTier[]> {
    try {
      const meterId = this.getMeterId(eventType);
      const meter = await this.stripe.billing.meters.retrieve(meterId);
      
      return []; // Meter prices would need to be configured separately
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to retrieve usage tiers');
    }
  }

  /**
   * Create customer portal session
   */
  async createCustomerPortalSession(customerId: string, returnUrl?: string): Promise<Stripe.BillingPortal.Session> {
    try {
      // CRITICAL: Validate return URL to prevent open redirect
      let validatedReturnUrl: string;
      if (returnUrl) {
        // Validate return URL against allowed origins
        const allowedOrigins = process.env['ALLOWED_ORIGINS']?.split(',').map(o => o.trim()) || ['http://localhost:3000'];
        
        let isValidUrl = false;
        for (const origin of allowedOrigins) {
          if (returnUrl.startsWith(origin)) {
            isValidUrl = true;
            break;
          }
        }
        
        if (!isValidUrl) {
          throw new Error('Invalid return URL: not in allowed origins');
        }
        
        // Additional URL validation
        try {
          const url = new URL(returnUrl);
          if (!['http:', 'https:'].includes(url.protocol)) {
            throw new Error('Invalid return URL protocol');
          }
          if (url.hostname.includes('..') || url.pathname.includes('..')) {
            throw new Error('Invalid return URL: path traversal detected');
          }
          validatedReturnUrl = returnUrl;
        } catch (urlError) {
          throw new Error('Invalid return URL format');
        }
      } else {
        validatedReturnUrl = `${process.env['ALLOWED_ORIGINS']?.split(',')[0]}/billing`;
      }
      
      return await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: validatedReturnUrl,
      });
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to create customer portal session');
    }
  }

  /**
   * Create checkout session for subscription upgrade/new purchase
   */
  async createCheckoutSession(
    customerId: string,
    priceId: string,
    successUrl: string,
    cancelUrl: string,
    metadata?: Record<string, string | number | boolean>
  ): Promise<Stripe.Checkout.Session> {
    try {
      // CRITICAL: Validate URLs to prevent open redirect
      const allowedOrigins = process.env['ALLOWED_ORIGINS']?.split(',').map(o => o.trim()) || ['http://localhost:3000'];
      
      function validateUrl(url: string, urlType: string): string {
        let isValidUrl = false;
        for (const origin of allowedOrigins) {
          if (url.startsWith(origin)) {
            isValidUrl = true;
            break;
          }
        }
        
        if (!isValidUrl) {
          throw new Error(`Invalid ${urlType}: not in allowed origins`);
        }
        
        try {
          const parsedUrl = new URL(url);
          if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error(`Invalid ${urlType} protocol`);
          }
          if (parsedUrl.hostname.includes('..') || parsedUrl.pathname.includes('..')) {
            throw new Error(`Invalid ${urlType}: path traversal detected`);
          }
          return url;
        } catch (urlError) {
          throw new Error(`Invalid ${urlType} format`);
        }
      }
      
      const validatedSuccessUrl = validateUrl(successUrl, 'success URL');
      const validatedCancelUrl = validateUrl(cancelUrl, 'cancel URL');
      
      // Convert metadata values to strings for Stripe compatibility
      const stringMetadata = metadata ? 
        Object.fromEntries(
          Object.entries(metadata).map(([key, value]) => [key, String(value)])
        ) : undefined;

      return await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price: priceId,
          quantity: 1,
        }],
        mode: 'subscription',
        success_url: validatedSuccessUrl,
        cancel_url: validatedCancelUrl,
        metadata: stringMetadata,
        allow_promotion_codes: true,
        billing_address_collection: 'auto',
      });
    } catch (error) {
      throw this.handleStripeError(error, 'Failed to create checkout session');
    }
  }

  /**
   * Verify webhook signature with replay attack protection
   */
  verifyWebhookSignature(payload: string, signature: string): StripeWebhookEvent {
    try {
      // CRITICAL: Validate inputs
      if (!payload || typeof payload !== 'string') {
        throw new Error('Invalid payload: must be non-empty string');
      }
      if (!signature || typeof signature !== 'string') {
        throw new Error('Invalid signature: must be non-empty string');
      }
      if (!this.config.webhookSecret) {
        throw new Error('Webhook secret not configured');
      }

      // CRITICAL: Extract and validate timestamp to prevent replay attacks
      const timestampMatch = signature.match(/t=(\d+)/);
      if (!timestampMatch) {
        throw new Error('Missing timestamp in signature');
      }
      
      const webhookTimestamp = parseInt(timestampMatch[1]);
      const currentTime = Math.floor(Date.now() / 1000);
      const maxAge = 300; // 5 minutes
      
      if (Math.abs(currentTime - webhookTimestamp) > maxAge) {
        throw new Error('Webhook timestamp too old or too far in the future');
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.config.webhookSecret
      );
      
      // CRITICAL: Validate event structure
      if (!event || !event.type || !event.data) {
        throw new Error('Invalid webhook event structure');
      }
      
      // CRITICAL: Additional validation for high-risk events
      const highRiskEvents = [
        'customer.subscription.deleted',
        'invoice.payment_failed',
        'payment_method.attached'
      ];
      
      if (highRiskEvents.includes(event.type)) {
        observabilityLogging.warn(`High-risk webhook event received: ${event.type}`, {
          event_type: event.type,
          event_id: event.id,
          created: event.created,
          service: 'stripe-webhook'
        });
      }
      
      return event as StripeWebhookEvent;
    } catch (error) {
      throw new Error(`Webhook signature verification failed: ${error}`);
    }
  }

  /**
   * Handle webhook events
   */
  async handleWebhookEvent(event: StripeWebhookEvent): Promise<void> {
    // CRITICAL: Validate event before processing
    if (!event || !event.type || !event.data) {
      throw new Error('Invalid webhook event structure');
    }

    try {
      switch (event.type) {
        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event);
          break;
        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event);
          break;
        case 'customer.subscription.created':
          await this.handleSubscriptionCreated(event);
          break;
        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event);
          break;
        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event);
          break;
        case 'invoice.finalized':
          await this.handleInvoiceFinalized(event);
          break;
        case 'charge.succeeded':
          await this.handleChargeSucceeded(event);
          break;
        case 'charge.failed':
          await this.handleChargeFailed(event);
          break;
        default:
          observabilityLogging.info(`Unhandled webhook event type: ${event.type}`, {
            event_type: event.type,
            service: 'stripe-webhook'
          });
      }
    } catch (error: any) {
      observabilityLogging.error(`Error handling webhook event ${event.type}`, {
        event_type: event.type,
        error_message: error?.message || 'Unknown error',
        service: 'stripe-webhook'
      });
      // Don't re-throw webhook errors to prevent webhook delivery failures
      // Log the error and continue processing
    }
  }

  // ============================================================================
  // PRIVATE WEBHOOK HANDLERS
  // ============================================================================

  private async handlePaymentSucceeded(event: StripeWebhookEvent): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    observabilityLogging.info(`Payment succeeded for customer`, {
      customer_id: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || 'unknown',
      amount: invoice.amount_paid / 100,
      currency: invoice.currency,
      invoice_id: invoice.id,
      service: 'stripe-webhook'
    });
    // Update tenant status, send confirmation email, etc.
  }

  private async handlePaymentFailed(event: StripeWebhookEvent): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    observabilityLogging.warn(`Payment failed for customer`, {
      customer_id: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || 'unknown',
      invoice_id: invoice.id,
      service: 'stripe-webhook'
    });
    // Trigger dunning process, update tenant status, send notification
  }

  private async handleSubscriptionCreated(event: StripeWebhookEvent): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    observabilityLogging.info(`Subscription created`, {
      subscription_id: subscription.id,
      customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || 'unknown',
      status: subscription.status,
      service: 'stripe-webhook'
    });
    // Initialize tenant usage tracking, send welcome email
  }

  private async handleSubscriptionUpdated(event: StripeWebhookEvent): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    observabilityLogging.info(`Subscription updated`, {
      subscription_id: subscription.id,
      customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || 'unknown',
      status: subscription.status,
      service: 'stripe-webhook'
    });
    // Handle plan changes, trial ends, etc.
  }

  private async handleSubscriptionDeleted(event: StripeWebhookEvent): Promise<void> {
    const subscription = event.data.object as Stripe.Subscription;
    observabilityLogging.info(`Subscription deleted`, {
      subscription_id: subscription.id,
      customer_id: typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id || 'unknown',
      service: 'stripe-webhook'
    });
    // Handle cancellation, data export, etc.
  }

  private async handleInvoiceFinalized(event: StripeWebhookEvent): Promise<void> {
    const invoice = event.data.object as Stripe.Invoice;
    observabilityLogging.info(`Invoice finalized`, {
      invoice_id: invoice.id,
      customer_id: typeof invoice.customer === 'string' ? invoice.customer : invoice.customer?.id || 'unknown',
      amount: invoice.amount_due / 100,
      currency: invoice.currency,
      service: 'stripe-webhook'
    });
    // Send invoice email, update billing records
  }

  private async handleChargeSucceeded(event: StripeWebhookEvent): Promise<void> {
    const charge = event.data.object as Stripe.Charge;
    observabilityLogging.info(`Charge succeeded`, {
      charge_id: charge.id,
      customer_id: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id || 'unknown',
      amount: charge.amount / 100,
      currency: charge.currency,
      service: 'stripe-webhook'
    });
    // Update payment records, send receipts
  }

  private async handleChargeFailed(event: StripeWebhookEvent): Promise<void> {
    const charge = event.data.object as Stripe.Charge;
    observabilityLogging.warn(`Charge failed`, {
      charge_id: charge.id,
      customer_id: typeof charge.customer === 'string' ? charge.customer : charge.customer?.id || 'unknown',
      amount: charge.amount / 100,
      currency: charge.currency,
      service: 'stripe-webhook'
    });
    // Handle charge failures, update customer status
  }

  // ============================================================================
  // PRIVATE UTILITIES
  // ============================================================================

  private getMeterId(eventType: 'sign_events' | 'verify_events' | 'rfc3161_timestamps'): string {
    switch (eventType) {
      case 'sign_events':
        return this.config.meters.sign_events;
      case 'verify_events':
        return this.config.meters.verify_events;
      case 'rfc3161_timestamps':
        return this.config.meters.rfc3161_timestamps;
      default:
        throw new Error(`Unknown event type: ${eventType}`);
    }
  }

  private handleStripeError(error: any, context: string): BillingError {
    // Log the full error for debugging
    observabilityLogging.error(`Stripe error in ${context}`, {
      error_type: error.type,
      error_code: error.code,
      error_message: error.message,
      decline_code: error.decline_code,
      service: 'stripe-service'
    });

    if (error.type === 'StripeCardError') {
      return {
        code: 'STRIPE_CARD_ERROR',
        message: 'Your card was declined',
        stripe_error_type: error.type,
        stripe_error_code: error.code,
        decline_code: error.decline_code,
      };
    } else if (error.type === 'StripeRateLimitError') {
      return {
        code: 'STRIPE_RATE_LIMIT',
        message: 'Rate limit exceeded, please try again',
        stripe_error_type: error.type,
      };
    } else if (error.type === 'StripeInvalidRequestError') {
      return {
        code: 'STRIPE_INVALID_REQUEST',
        message: 'Invalid request to payment processor',
        stripe_error_type: error.type,
        stripe_error_code: error.code,
      };
    } else if (error.type === 'StripeAPIError') {
      return {
        code: 'STRIPE_API_ERROR',
        message: 'Payment processing error, please try again',
        stripe_error_type: error.type,
      };
    } else if (error.type === 'StripeConnectionError') {
      return {
        code: 'STRIPE_CONNECTION_ERROR',
        message: 'Network error with payment processor, please try again',
        stripe_error_type: error.type,
      };
    } else {
      return {
        code: 'STRIPE_UNKNOWN_ERROR',
        message: `${context}: ${error.message}`,
        stripe_error_type: error.type,
      };
    }
  }
}
