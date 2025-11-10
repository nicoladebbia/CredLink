/**
 * Phase 36 Billing - Billing Controller
 * HTTP endpoints for billing, plans, and Stripe integration
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { 
  SubscriptionPlan,
  UsageEvent,
  APIError,
  ValidationError
} from '../types';
import { StripeService, UsageService } from '../services';

export interface BillingControllerConfig {
  stripeService: StripeService;
  usageService: UsageService;
}

export class BillingController {
  private stripeService: StripeService;
  private usageService: UsageService;

  constructor(config: BillingControllerConfig) {
    this.stripeService = config.stripeService;
    this.usageService = config.usageService;
  }

  /**
   * Get available subscription plans
   */
  async getPlans(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const plans = await this.stripeService.getAvailablePlans();
      reply.status(200).send(plans);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Get usage tiers for a specific event type
   */
  async getUsageTiers(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { eventType } = request.params as { eventType: string };

      // CRITICAL: Validate event type parameter
      if (!eventType || typeof eventType !== 'string') {
        reply.status(400).send({
          code: 'INVALID_EVENT_TYPE',
          message: 'Event type is required and must be a string',
        });
        return;
      }
      
      const validEventTypes = ['sign_events', 'verify_events', 'rfc3161_timestamps'];
      if (!validEventTypes.includes(eventType)) {
        reply.status(400).send({
          code: 'INVALID_EVENT_TYPE',
          message: `Event type must be one of: ${validEventTypes.join(', ')}`,
        });
        return;
      }

      const tiers = await this.stripeService.getUsageTiers(eventType as any);
      reply.status(200).send(tiers);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Create customer portal session
   */
  async createCustomerPortalSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = (request as any).tenant; // From auth middleware
      const { return_url } = request.body as any;

      // CRITICAL: Validate tenant from auth middleware
      if (!tenantId) {
        reply.status(401).send({
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        });
        return;
      }

      // CRITICAL: Validate return URL
      if (!return_url || typeof return_url !== 'string') {
        reply.status(400).send({
          code: 'INVALID_RETURN_URL',
          message: 'Return URL is required and must be a string',
        });
        return;
      }

      // CRITICAL: Validate return URL format
      try {
        new URL(return_url);
      } catch {
        reply.status(400).send({
          code: 'INVALID_RETURN_URL',
          message: 'Return URL must be a valid URL',
        });
        return;
      }

      // Get tenant's Stripe customer ID
      const tenant = await this.getTenantById(tenantId);
      if (!tenant) {
        reply.status(404).send({
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
        });
        return;
      }

      const portalSession = await this.stripeService.createCustomerPortalSession(
        tenant.stripe_customer_id,
        return_url
      );

      reply.status(200).send({
        portal_url: portalSession.url,
        session_id: portalSession.id,
      });
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Create checkout session for subscription upgrade
   */
  async createCheckoutSession(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = (request as any).tenant; // From auth middleware
      const { price_id, success_url, cancel_url } = request.body as any;

      // Validate request
      await this.validateCheckoutSessionRequest(price_id, success_url, cancel_url);

      // Get tenant's Stripe customer ID
      const tenant = await this.getTenantById(tenantId);
      if (!tenant) {
        reply.status(404).send({
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
        });
        return;
      }

      const checkoutSession = await this.stripeService.createCheckoutSession(
        tenant.stripe_customer_id,
        price_id,
        success_url,
        cancel_url,
        { tenant_id: tenantId }
      );

      reply.status(200).send({
        checkout_url: checkoutSession.url,
        session_id: checkoutSession.id,
      });
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Get subscription details
   */
  async getSubscription(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = (request as any).tenant; // From auth middleware

      // Get tenant's subscription
      const tenant = await this.getTenantById(tenantId);
      if (!tenant) {
        reply.status(404).send({
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
        });
        return;
      }

      const subscription = await this.stripeService.getSubscriptionWithUsage(
        tenant.stripe_subscription_id
      );

      reply.status(200).send(subscription);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Update subscription (change plan)
   */
  async updateSubscription(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = (request as any).tenant; // From auth middleware
      const { price_id, proration_behavior } = request.body as any;

      // Validate request
      await this.validateUpdateSubscriptionRequest(price_id, proration_behavior);

      // Get tenant's subscription
      const tenant = await this.getTenantById(tenantId);
      if (!tenant) {
        reply.status(404).send({
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
        });
        return;
      }

      const updatedSubscription = await this.stripeService.updateSubscription(
        tenant.stripe_subscription_id,
        price_id,
        proration_behavior || 'create_prorations'
      );

      reply.status(200).send(updatedSubscription);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = (request as any).tenant; // From auth middleware
      const { immediate, reason } = request.body as any;

      // Get tenant's subscription
      const tenant = await this.getTenantById(tenantId);
      if (!tenant) {
        reply.status(404).send({
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
        });
        return;
      }

      const canceledSubscription = await this.stripeService.cancelSubscription(
        tenant.stripe_subscription_id,
        immediate || false
      );

      reply.status(200).send({
        subscription: canceledSubscription,
        canceled_at: new Date().toISOString(),
        reason: reason || 'Customer requested cancellation',
      });
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Get invoices
   */
  async getInvoices(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = (request as any).tenant; // From auth middleware
      const { limit, starting_after } = request.query as any;

      // Get tenant's Stripe customer ID
      const tenant = await this.getTenantById(tenantId);
      if (!tenant) {
        reply.status(404).send({
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
        });
        return;
      }

      // Get invoices from Stripe
      const invoices = await this.stripeService.getStripeInstance().invoices.list({
        customer: tenant.stripe_customer_id,
        limit: limit || 10,
        starting_after: starting_after,
      });

      reply.status(200).send({
        data: invoices.data,
        has_more: invoices.has_more,
        url: invoices.url,
      });
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Create refund
   */
  async createRefund(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = (request as any).tenant; // From auth middleware
      const { payment_intent_id, amount, reason } = request.body as any;

      // Validate request
      await this.validateRefundRequest(payment_intent_id, amount, reason);

      // Verify payment intent belongs to tenant
      const tenant = await this.getTenantById(tenantId);
      if (!tenant) {
        reply.status(404).send({
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
        });
        return;
      }

      // Get payment intent to verify ownership
      const paymentIntent = await this.stripeService.getStripeInstance().paymentIntents.retrieve(payment_intent_id);
      if (paymentIntent.customer !== tenant.stripe_customer_id) {
        reply.status(403).send({
          code: 'FORBIDDEN',
          message: 'Payment intent does not belong to this tenant',
        });
        return;
      }

      const refund = await this.stripeService.createRefund(
        payment_intent_id,
        amount,
        reason
      );

      reply.status(201).send(refund);
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Get usage statistics
   */
  async getUsageStats(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = (request as any).tenant; // From auth middleware
      const { start_date, end_date, granularity } = request.query as any;

      // Validate date range
      const startDate = start_date || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
      const endDate = end_date || new Date().toISOString();

      if (new Date(startDate) > new Date(endDate)) {
        reply.status(400).send({
          code: 'INVALID_DATE_RANGE',
          message: 'Start date must be before end date',
        });
        return;
      }

      const usageAggregates = await this.usageService.getUsage(
        tenantId,
        startDate,
        endDate,
        granularity || 'day'
      );

      reply.status(200).send({
        usage: usageAggregates,
        period: { start_date: startDate, end_date: endDate },
        granularity: granularity || 'day',
      });
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  /**
   * Get billing summary
   */
  async getBillingSummary(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { tenantId } = (request as any).tenant; // From auth middleware

      // Get tenant info
      const tenant = await this.getTenantById(tenantId);
      if (!tenant) {
        reply.status(404).send({
          code: 'TENANT_NOT_FOUND',
          message: 'Tenant not found',
        });
        return;
      }

      // Get subscription
      const subscription = await this.stripeService.getSubscriptionWithUsage(
        tenant.stripe_subscription_id
      );

      // Get current usage
      const currentUsage = await this.usageService.getCurrentMonthUsage(tenantId);

      // Get usage stats with trend
      const usageStats = await this.usageService.getUsageStats(tenantId);

      // Calculate costs
      const currentMonthAggregate = {
        tenant_id: tenantId,
        period: 'month' as const,
        start_date: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString(),
        end_date: new Date().toISOString(),
        sign_events: currentUsage.current_month.sign_events,
        verify_events: currentUsage.current_month.verify_events,
        rfc3161_timestamps: currentUsage.current_month.rfc3161_timestamps,
        cost_breakdown: {
          base_plan: 0,
          sign_events_overage: 0,
          verify_events_usage: 0,
          rfc3161_timestamps_usage: 0,
          total: 0,
        },
      };

      const costBreakdown = this.stripeService.calculateUsageCosts({
        signEvents: currentMonthAggregate.sign_events,
        verifyEvents: currentMonthAggregate.verify_events,
        rfc3161Timestamps: currentMonthAggregate.rfc3161_timestamps,
      });

      reply.status(200).send({
        tenant: {
          tenant_id: tenantId,
          plan: tenant.plan,
          status: tenant.status,
          created_at: tenant.created_at,
        },
        subscription: {
          id: subscription.id,
          status: subscription.status,
          current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
          trial_end: subscription.trial_end ? new Date(subscription.trial_end * 1000).toISOString() : null,
          cancel_at_period_end: subscription.cancel_at_period_end,
        },
        usage: {
          current_month: currentUsage.current_month,
          lifetime: currentUsage.lifetime,
          trend: usageStats.trend,
        },
        billing: {
          next_invoice_date: tenant.billing.next_invoice_date,
          amount_due: costBreakdown.totalCost,
          currency: 'usd',
          cost_breakdown: costBreakdown,
        },
      });
    } catch (error) {
      this.handleError(error, reply);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async validateCheckoutSessionRequest(
    priceId: string,
    successUrl: string,
    cancelUrl: string
  ): Promise<void> {
    const errors: ValidationError[] = [];

    if (!priceId || typeof priceId !== 'string') {
      errors.push({
        code: 'INVALID_PRICE_ID',
        message: 'Price ID is required',
        field: 'price_id',
        value: priceId,
      });
    }

    if (!successUrl || typeof successUrl !== 'string') {
      errors.push({
        code: 'INVALID_SUCCESS_URL',
        message: 'Success URL is required',
        field: 'success_url',
        value: successUrl,
      });
    } else {
      try {
        new URL(successUrl);
      } catch (error) {
        errors.push({
          code: 'INVALID_SUCCESS_URL',
          message: 'Success URL must be a valid URL',
          field: 'success_url',
          value: successUrl,
        });
      }
    }

    if (!cancelUrl || typeof cancelUrl !== 'string') {
      errors.push({
        code: 'INVALID_CANCEL_URL',
        message: 'Cancel URL is required',
        field: 'cancel_url',
        value: cancelUrl,
      });
    } else {
      try {
        new URL(cancelUrl);
      } catch (error) {
        errors.push({
          code: 'INVALID_CANCEL_URL',
          message: 'Cancel URL must be a valid URL',
          field: 'cancel_url',
          value: cancelUrl,
        });
      }
    }

    if (errors.length > 0) {
      const error: APIError = {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: { errorCount: errors.length },
      };
      throw error;
    }
  }

  private async validateUpdateSubscriptionRequest(
    priceId: string,
    prorationBehavior: string
  ): Promise<void> {
    const errors: ValidationError[] = [];

    if (!priceId || typeof priceId !== 'string') {
      errors.push({
        code: 'INVALID_PRICE_ID',
        message: 'Price ID is required',
        field: 'price_id',
        value: priceId,
      });
    }

    if (prorationBehavior && !['create_prorations', 'none', 'always_invoice'].includes(prorationBehavior)) {
      errors.push({
        code: 'INVALID_PRORATION_BEHAVIOR',
        message: 'Proration behavior must be one of: create_prorations, none, always_invoice',
        field: 'proration_behavior',
        value: prorationBehavior,
      });
    }

    if (errors.length > 0) {
      const error: APIError = {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: { errorCount: errors.length },
      };
      throw error;
    }
  }

  private async validateRefundRequest(
    paymentIntentId: string,
    amount: number,
    reason: string
  ): Promise<void> {
    const errors: ValidationError[] = [];

    if (!paymentIntentId || typeof paymentIntentId !== 'string') {
      errors.push({
        code: 'INVALID_PAYMENT_INTENT_ID',
        message: 'Payment intent ID is required',
        field: 'payment_intent_id',
        value: paymentIntentId,
      });
    }

    if (amount !== undefined && (typeof amount !== 'number' || amount <= 0)) {
      errors.push({
        code: 'INVALID_AMOUNT',
        message: 'Amount must be a positive number',
        field: 'amount',
        value: amount,
      });
    }

    if (reason && !['duplicate', 'fraudulent', 'requested_by_customer'].includes(reason)) {
      errors.push({
        code: 'INVALID_REASON',
        message: 'Reason must be one of: duplicate, fraudulent, requested_by_customer',
        field: 'reason',
        value: reason,
      });
    }

    if (errors.length > 0) {
      const error: APIError = {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: { errorCount: errors.length },
      };
      throw error;
    }
  }

  private async getTenantById(tenantId: string): Promise<any> {
    // This would integrate with the tenant service
    // For now, return a mock tenant
    return {
      tenant_id: tenantId,
      stripe_customer_id: 'cus_test',
      stripe_subscription_id: 'sub_test',
      plan: 'starter',
      status: 'trial',
      billing: {
        next_invoice_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  }

  private handleError(error: any, reply: FastifyReply): void {
    console.error('Billing controller error:', error);

    if (error.code && error.message) {
      // APIError
      const statusCode = this.getStatusCodeFromError(error.code);
      reply.status(statusCode).send(error);
    } else if (error.name === 'ValidationError') {
      // Validation error
      reply.status(400).send({
        code: 'VALIDATION_ERROR',
        message: error.message,
        details: error.details,
      });
    } else if (error.type && error.type.startsWith('Stripe')) {
      // Stripe error
      reply.status(400).send({
        code: 'STRIPE_ERROR',
        message: 'Payment processing error',
        details: {
          stripe_error: error.message,
          type: error.type,
          code: error.code,
        },
      });
    } else {
      // Unknown error
      reply.status(500).send({
        code: 'INTERNAL_ERROR',
        message: 'An internal error occurred',
        details: process.env['NODE_ENV'] === 'development' ? { error: error.message } : undefined,
      });
    }
  }

  private getStatusCodeFromError(errorCode: string): number {
    switch (errorCode) {
      case 'TENANT_NOT_FOUND':
        return 404;
      case 'VALIDATION_FAILED':
      case 'INVALID_PRICE_ID':
      case 'INVALID_SUCCESS_URL':
      case 'INVALID_CANCEL_URL':
      case 'INVALID_PRORATION_BEHAVIOR':
      case 'INVALID_PAYMENT_INTENT_ID':
      case 'INVALID_AMOUNT':
      case 'INVALID_REASON':
      case 'INVALID_EVENT_TYPE':
        return 400;
      case 'FORBIDDEN':
        return 403;
      case 'UNAUTHORIZED':
        return 401;
      default:
        return 500;
    }
  }
}
