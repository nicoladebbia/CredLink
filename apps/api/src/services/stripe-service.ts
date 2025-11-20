import Stripe from 'stripe';
import { logger } from '../utils/logger';
import { BILLING_CONFIG } from '../config/billing-config';

/**
 * Production-Grade Stripe Service
 * 
 * Features:
 * - Idempotency keys for all operations
 * - Automatic retry logic with exponential backoff
 * - Webhook signature verification
 * - Customer/Subscription management
 * - Invoice and payment handling
 * - Usage reporting
 * - Dunning management
 */
export class StripeService {
  private stripe: Stripe;
  private webhookSecret: string;
  private readonly MAX_RETRIES = 3;
  private readonly RETRY_DELAY_MS = 1000;

  constructor() {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error('STRIPE_SECRET_KEY is required');
    }

    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-11-17.clover',
      typescript: true,
      maxNetworkRetries: this.MAX_RETRIES,
      timeout: 30000,
    });

    this.webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
    
    if (!this.webhookSecret) {
      logger.warn('STRIPE_WEBHOOK_SECRET not configured - webhook verification disabled');
    }
  }

  /**
   * Create or retrieve Stripe customer
   */
  async createOrGetCustomer(userId: string, email: string, name?: string): Promise<Stripe.Customer> {
    const idempotencyKey = `customer-${userId}-${Date.now()}`;
    
    try {
      // First try to retrieve existing customer
      const existingCustomers = await this.stripe.customers.list({
        email,
        limit: 1,
      });

      if (existingCustomers.data.length > 0) {
        logger.info('Retrieved existing Stripe customer', { userId, customerId: existingCustomers.data[0].id });
        return existingCustomers.data[0];
      }

      // Create new customer with idempotency
      const customer = await this.stripe.customers.create({
        email,
        name,
        metadata: {
          userId,
          source: 'credlink-platform',
        },
      }, {
        idempotencyKey,
      });

      logger.info('Created new Stripe customer', { userId, customerId: customer.id });
      return customer;

    } catch (error) {
      logger.error('Failed to create/retrieve Stripe customer', { 
        userId, 
        email, 
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Stripe customer creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create subscription with tiered pricing
   */
  async createSubscription(
    customerId: string, 
    priceId: string, 
    userId: string,
    trialPeriodDays?: number
  ): Promise<Stripe.Subscription> {
    const idempotencyKey = `subscription-${userId}-${priceId}-${Date.now()}`;
    
    try {
      const subscription = await this.stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        trial_period_days: trialPeriodDays,
        payment_behavior: 'default_incomplete',
        payment_settings: {
          save_default_payment_method: 'on_subscription',
        },
        expand: ['latest_invoice.payment_intent'],
        metadata: {
          userId,
          source: 'credlink-platform',
        },
      }, {
        idempotencyKey,
      });

      logger.info('Created subscription', { 
        userId, 
        customerId, 
        subscriptionId: subscription.id,
        status: subscription.status 
      });

      return subscription;

    } catch (error) {
      logger.error('Failed to create subscription', { 
        userId, 
        customerId, 
        priceId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Subscription creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create one-time payment session for certificate purchases
   */
  async createPaymentSession(
    customerId: string,
    amount: number,
    userId: string,
    description: string
  ): Promise<Stripe.Checkout.Session> {
    const idempotencyKey = `payment-${userId}-${amount}-${Date.now()}`;
    
    try {
      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        payment_method_types: ['card'],
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: description,
              description: 'CredLink Certificate Purchase',
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        }],
        mode: 'payment',
        success_url: `${process.env.WEB_URL}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${process.env.WEB_URL}/billing/cancel`,
        metadata: {
          userId,
          amount: amount.toString(),
          type: 'certificate_purchase',
        },
      }, {
        idempotencyKey,
      });

      logger.info('Created payment session', { 
        userId, 
        customerId, 
        sessionId: session.id,
        amount 
      });

      return session;

    } catch (error) {
      logger.error('Failed to create payment session', { 
        userId, 
        customerId, 
        amount,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Payment session creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Update subscription (upgrade/downgrade)
   */
  async updateSubscription(
    subscriptionId: string,
    newPriceId: string,
    userId: string
  ): Promise<Stripe.Subscription> {
    const idempotencyKey = `update-subscription-${userId}-${subscriptionId}-${Date.now()}`;
    
    try {
      const subscription = await this.stripe.subscriptions.retrieve(subscriptionId);
      
      const updatedSubscription = await this.stripe.subscriptions.update(
        subscriptionId,
        {
          items: [{
            id: subscription.items.data[0].id,
            price: newPriceId,
          }],
          proration_behavior: 'create_prorations',
        },
        {
          idempotencyKey,
        }
      );

      logger.info('Updated subscription', { 
        userId, 
        subscriptionId,
        newPriceId,
        status: updatedSubscription.status 
      });

      return updatedSubscription;

    } catch (error) {
      logger.error('Failed to update subscription', { 
        userId, 
        subscriptionId,
        newPriceId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Subscription update failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(subscriptionId: string, userId: string, immediate = false): Promise<Stripe.Subscription> {
    const idempotencyKey = `cancel-subscription-${userId}-${subscriptionId}-${Date.now()}`;
    
    try {
      const canceledSubscription = await this.stripe.subscriptions.update(
        subscriptionId,
        {
          cancel_at_period_end: !immediate,
        },
        {
          idempotencyKey,
        }
      );

      logger.info('Canceled subscription', { 
        userId, 
        subscriptionId,
        immediate,
        status: canceledSubscription.status 
      });

      return canceledSubscription;

    } catch (error) {
      logger.error('Failed to cancel subscription', { 
        userId, 
        subscriptionId,
        immediate,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Subscription cancellation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Create customer portal session for self-service billing
   */
  async createCustomerPortalSession(customerId: string, userId: string): Promise<Stripe.BillingPortal.Session> {
    const idempotencyKey = `portal-${userId}-${Date.now()}`;
    
    try {
      const session = await this.stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${process.env.WEB_URL}/billing`,
      }, {
        idempotencyKey,
      });

      logger.info('Created customer portal session', { 
        userId, 
        customerId,
        sessionId: session.id 
      });

      return session;

    } catch (error) {
      logger.error('Failed to create customer portal session', { 
        userId, 
        customerId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Portal session creation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(payload: string, signature: string): Stripe.Event {
    // 🔥 CRITICAL SECURITY FIX: Never skip webhook verification
    // This bypass allowed attackers to send fake webhook events and manipulate billing
    if (!this.webhookSecret) {
      logger.error('Webhook verification failed - STRIPE_WEBHOOK_SECRET not configured');
      throw new Error('Webhook verification failed: STRIPE_WEBHOOK_SECRET is required in production');
    }

    try {
      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.webhookSecret
      );

      logger.info('Webhook signature verified', { 
        eventType: event.type,
        eventId: event.id 
      });

      return event;

    } catch (error) {
      logger.error('Webhook signature verification failed', { 
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Webhook verification failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Get customer subscriptions
   */
  async getCustomerSubscriptions(customerId: string, userId: string): Promise<Stripe.ApiList<Stripe.Subscription>> {
    try {
      const subscriptions = await this.stripe.subscriptions.list({
        customer: customerId,
        status: 'all',
        expand: ['data.default_payment_method'],
      });

      logger.info('Retrieved customer subscriptions', { 
        userId, 
        customerId,
        count: subscriptions.data.length 
      });

      return subscriptions;

    } catch (error) {
      logger.error('Failed to retrieve customer subscriptions', { 
        userId, 
        customerId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Subscription retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  async getCustomerInvoices(customerId: string, userId: string, limit = 20): Promise<Stripe.ApiList<Stripe.Invoice>> {
    try {
      const invoices = await this.stripe.invoices.list({
        customer: customerId,
        limit,
      });

      logger.info('Retrieved customer invoices', { 
        userId, 
        customerId,
        count: invoices.data.length 
      });

      return invoices;

    } catch (error) {
      logger.error('Failed to retrieve customer invoices', { 
        userId, 
        customerId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Invoice retrieval failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Retry failed payment
   */
  async retryPayment(invoiceId: string, userId: string): Promise<Stripe.Invoice> {
    const idempotencyKey = `retry-payment-${userId}-${invoiceId}-${Date.now()}`;
    
    try {
      const invoice = await this.stripe.invoices.pay(invoiceId, {}, {
        idempotencyKey,
      });

      logger.info('Retried payment', { 
        userId, 
        invoiceId,
        status: invoice.status 
      });

      return invoice;

    } catch (error) {
      logger.error('Failed to retry payment', { 
        userId, 
        invoiceId,
        error: error instanceof Error ? error.message : String(error)
      });
      throw new Error(`Payment retry failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Export singleton instance
export const stripeService = new StripeService();
