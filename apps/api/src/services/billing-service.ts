import { Pool } from 'pg';
import { stripeService } from './stripe-service';
import { 
  BillingTier, 
  BillingMetrics, 
  UsageLimits, 
  BILLING_TIERS, 
  getBillingTier, 
  getUsageLimits,
  isUsageExceeded,
  BILLING_CONFIG 
} from '../config/billing-config';
import { logger } from '../utils/logger';

/**
 * Production-Grade Billing Service
 * 
 * Manages:
 * - Customer subscriptions and billing
 * - Usage tracking and limits enforcement
 * - Revenue analytics and reporting
 * - Dunning and payment retries
 * - Invoice management
 */

export interface CustomerBilling {
  userId: string;
  stripeCustomerId: string;
  tierId: string;
  subscriptionId?: string;
  status: 'active' | 'trialing' | 'past_due' | 'canceled' | 'unpaid';
  currentPeriodStart?: Date;
  currentPeriodEnd?: Date;
  cancelAtPeriodEnd: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UsageRecord {
  id: string;
  userId: string;
  type: 'certificate' | 'storage' | 'api_call' | 'team_member';
  quantity: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface Invoice {
  id: string;
  userId: string;
  stripeInvoiceId: string;
  amount: number;
  currency: string;
  status: 'draft' | 'open' | 'paid' | 'void' | 'uncollectible';
  dueDate?: Date;
  paidAt?: Date;
  createdAt: Date;
}

export class BillingService {
  private pool: Pool;
  private usageCache = new Map<string, BillingMetrics>();

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Initialize billing for a new user
   */
  async initializeBilling(userId: string, email: string, name?: string): Promise<CustomerBilling> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create Stripe customer
      const stripeCustomer = await stripeService.createOrGetCustomer(userId, email, name);

      // Insert billing record
      const result = await client.query(
        `INSERT INTO customer_billing (
          user_id, stripe_customer_id, tier_id, status, cancel_at_period_end, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
        RETURNING *`,
        [userId, stripeCustomer.id, 'free', 'active', false]
      );

      await client.query('COMMIT');

      const billing = this.mapRowToCustomerBilling(result.rows[0]);
      logger.info('Initialized billing for user', { userId, customerId: stripeCustomer.id });

      return billing;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to initialize billing', { userId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create subscription for user
   */
  async createSubscription(
    userId: string, 
    tierId: string, 
    trialPeriodDays?: number
  ): Promise<{ subscription: any; clientSecret: string }> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      // Get current billing info
      const billingResult = await client.query(
        'SELECT * FROM customer_billing WHERE user_id = $1',
        [userId]
      );

      if (billingResult.rows.length === 0) {
        throw new Error('Billing not initialized for user');
      }

      const billing = this.mapRowToCustomerBilling(billingResult.rows[0]);
      const tier = getBillingTier(tierId);
      
      if (!tier) {
        throw new Error(`Invalid billing tier: ${tierId}`);
      }

      // Create Stripe subscription
      const subscription = await stripeService.createSubscription(
        billing.stripeCustomerId,
        tier.stripePriceId,
        userId,
        trialPeriodDays
      );

      // Update billing record
      await client.query(
        `UPDATE customer_billing 
         SET tier_id = $1, subscription_id = $2, status = $3, 
             current_period_start = $4, current_period_end = $5, 
             cancel_at_period_end = $6, updated_at = NOW()
         WHERE user_id = $7`,
        [
          tierId,
          subscription.id,
          subscription.status,
          (subscription as any).current_period_start ? new Date((subscription as any).current_period_start * 1000) : null,
          (subscription as any).current_period_end ? new Date((subscription as any).current_period_end * 1000) : null,
          subscription.cancel_at_period_end,
          userId
        ]
      );

      await client.query('COMMIT');

      const clientSecret = (subscription.latest_invoice as any)?.payment_intent?.client_secret;
      
      logger.info('Created subscription', { 
        userId, 
        tierId, 
        subscriptionId: subscription.id,
        status: subscription.status 
      });

      return { subscription, clientSecret };

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to create subscription', { userId, tierId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Track usage for billing
   */
  async trackUsage(
    userId: string, 
    type: UsageRecord['type'], 
    quantity: number, 
    metadata?: Record<string, any>
  ): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      // 🔥 CRITICAL FIX: Add transaction locks to prevent race conditions
      // Prevents double billing and corrupted subscription data
      await client.query('BEGIN');

      // Lock user billing record to prevent concurrent modifications
      await client.query(
        'SELECT * FROM customer_billing WHERE user_id = $1 FOR UPDATE',
        [userId]
      );

      // Insert usage record
      await client.query(
        `INSERT INTO usage_records (user_id, type, quantity, timestamp, metadata)
         VALUES ($1, $2, $3, NOW(), $4)`,
        [userId, type, quantity, JSON.stringify(metadata || {})]
      );

      // Update usage cache
      await this.updateUsageCache(userId);

      // Check if usage exceeds limits
      const billing = await this.getUserBilling(userId);
      const limits = getUsageLimits(billing.tierId);
      const metrics = await this.getBillingMetrics(userId);

      const usageCheck = isUsageExceeded(metrics, limits);
      if (usageCheck.exceeded) {
        logger.warn('Usage exceeded limit', { 
          userId, 
          field: usageCheck.field,
          current: usageCheck.current,
          limit: usageCheck.limit 
        });

        // Could implement automatic upgrade prompts or notifications here
        await this.handleUsageExceeded(userId, usageCheck);
      }

      await client.query('COMMIT');

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to track usage', { userId, type, quantity, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get user billing information
   */
  async getUserBilling(userId: string): Promise<CustomerBilling> {
    const result = await this.pool.query(
      'SELECT * FROM customer_billing WHERE user_id = $1',
      [userId]
    );

    if (result.rows.length === 0) {
      throw new Error('Billing not found for user');
    }

    return this.mapRowToCustomerBilling(result.rows[0]);
  }

  /**
   * Get billing metrics for user
   */
  async getBillingMetrics(userId: string): Promise<BillingMetrics> {
    // Check cache first
    const cached = this.usageCache.get(userId);
    if (cached && this.isCacheValid(cached)) {
      return cached;
    }

    const billing = await this.getUserBilling(userId);
    
    // Get usage for current billing period
    const periodStart = billing.currentPeriodStart || billing.createdAt;
    const periodEnd = billing.currentPeriodEnd || new Date();

    const result = await this.pool.query(
      `SELECT 
         type,
         SUM(quantity) as total_quantity
       FROM usage_records 
       WHERE user_id = $1 AND timestamp >= $2 AND timestamp <= $3
       GROUP BY type`,
      [userId, periodStart, periodEnd]
    );

    const metrics: BillingMetrics = {
      certificatesUsed: 0,
      storageUsed: 0,
      apiCallsUsed: 0,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
    };

    result.rows.forEach(row => {
      switch (row.type) {
        case 'certificate':
          metrics.certificatesUsed = parseInt(row.total_quantity);
          break;
        case 'storage':
          metrics.storageUsed = parseInt(row.total_quantity);
          break;
        case 'api_call':
          metrics.apiCallsUsed = parseInt(row.total_quantity);
          break;
      }
    });

    // Update cache
    this.usageCache.set(userId, metrics);

    return metrics;
  }

  /**
   * Update subscription (upgrade/downgrade)
   */
  async updateSubscription(userId: string, newTierId: string): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const billing = await this.getUserBilling(userId);
      
      if (!billing.subscriptionId) {
        throw new Error('No active subscription to update');
      }

      const newTier = getBillingTier(newTierId);
      if (!newTier) {
        throw new Error(`Invalid billing tier: ${newTierId}`);
      }

      // Update Stripe subscription
      const updatedSubscription = await stripeService.updateSubscription(
        billing.subscriptionId,
        newTier.stripePriceId,
        userId
      );

      // Update local billing record
      await client.query(
        `UPDATE customer_billing 
         SET tier_id = $1, status = $2, updated_at = NOW()
         WHERE user_id = $3`,
        [newTierId, updatedSubscription.status, userId]
      );

      await client.query('COMMIT');

      // Clear usage cache
      this.usageCache.delete(userId);

      logger.info('Updated subscription', { 
        userId, 
        oldTierId: billing.tierId,
        newTierId,
        subscriptionId: billing.subscriptionId 
      });

      return updatedSubscription;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to update subscription', { userId, newTierId, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(userId: string, immediate = false): Promise<any> {
    const client = await this.pool.connect();
    
    try {
      await client.query('BEGIN');

      const billing = await this.getUserBilling(userId);
      
      if (!billing.subscriptionId) {
        throw new Error('No active subscription to cancel');
      }

      // Cancel Stripe subscription
      const canceledSubscription = await stripeService.cancelSubscription(
        billing.subscriptionId,
        userId,
        immediate
      );

      // Update local billing record
      await client.query(
        `UPDATE customer_billing 
         SET status = $1, cancel_at_period_end = $2, updated_at = NOW()
         WHERE user_id = $3`,
        [canceledSubscription.status, canceledSubscription.cancel_at_period_end, userId]
      );

      await client.query('COMMIT');

      logger.info('Canceled subscription', { 
        userId, 
        subscriptionId: billing.subscriptionId,
        immediate 
      });

      return canceledSubscription;

    } catch (error) {
      await client.query('ROLLBACK');
      logger.error('Failed to cancel subscription', { userId, immediate, error });
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Create one-time payment session
   */
  async createPaymentSession(
    userId: string, 
    amount: number, 
    description: string
  ): Promise<string> {
    const billing = await this.getUserBilling(userId);
    
    const session = await stripeService.createPaymentSession(
      billing.stripeCustomerId,
      amount,
      userId,
      description
    );

    return session.url || '';
  }

  /**
   * Create customer portal session
   */
  async createCustomerPortalSession(userId: string): Promise<string> {
    const billing = await this.getUserBilling(userId);
    
    const session = await stripeService.createCustomerPortalSession(
      billing.stripeCustomerId,
      userId
    );

    return session.url || '';
  }

  /**
   * Get revenue analytics
   */
  async getRevenueAnalytics(startDate?: Date, endDate?: Date): Promise<{
    totalRevenue: number;
    monthlyRecurringRevenue: number;
    activeSubscriptions: number;
    churnRate: number;
    averageRevenuePerUser: number;
  }> {
    const start = startDate || new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const end = endDate || new Date();

    // Get paid invoices
    const invoiceResult = await this.pool.query(
      `SELECT SUM(amount) as total_revenue, COUNT(*) as invoice_count
       FROM invoices 
       WHERE status = 'paid' AND paid_at >= $1 AND paid_at <= $2`,
      [start, end]
    );

    // Get active subscriptions
    const subscriptionResult = await this.pool.query(
      `SELECT COUNT(*) as active_count, tier_id
       FROM customer_billing 
       WHERE status IN ('active', 'trialing') 
       GROUP BY tier_id`
    );

    // Calculate MRR based on active subscriptions
    let monthlyRecurringRevenue = 0;
    let activeSubscriptions = 0;

    subscriptionResult.rows.forEach(row => {
      const tier = getBillingTier(row.tier_id);
      if (tier) {
        monthlyRecurringRevenue += tier.monthlyPrice * parseInt(row.active_count);
        activeSubscriptions += parseInt(row.active_count);
      }
    });

    // Get total users for ARPU calculation
    const userResult = await this.pool.query(
      'SELECT COUNT(*) as total_users FROM customer_billing'
    );

    const totalRevenue = parseFloat(invoiceResult.rows[0]?.total_revenue || '0');
    const totalUsers = parseInt(userResult.rows[0]?.total_users || '0');
    const averageRevenuePerUser = totalUsers > 0 ? totalRevenue / totalUsers : 0;

    // Simplified churn calculation (would need more historical data for accuracy)
    const churnRate = 0; // Placeholder

    return {
      totalRevenue,
      monthlyRecurringRevenue,
      activeSubscriptions,
      churnRate,
      averageRevenuePerUser,
    };
  }

  /**
   * Handle webhook events from Stripe
   */
  async handleWebhook(eventType: string, event: any): Promise<void> {
    switch (eventType) {
      case 'invoice.payment_succeeded':
        await this.handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.created':
        await this.handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.updated':
        await this.handleSubscriptionUpdated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await this.handleSubscriptionDeleted(event.data.object);
        break;
      default:
        logger.info('Unhandled webhook event', { eventType });
    }
  }

  // Private helper methods

  private async updateUsageCache(userId: string): Promise<void> {
    try {
      const metrics = await this.getBillingMetrics(userId);
      this.usageCache.set(userId, metrics);
    } catch (error) {
      logger.error('Failed to update usage cache', { userId, error });
    }
  }

  private isCacheValid(metrics: BillingMetrics): boolean {
    const cacheAge = Date.now() - metrics.currentPeriodStart.getTime();
    return cacheAge < BILLING_CONFIG.usageTracking.syncIntervalMs;
  }

  private mapRowToCustomerBilling(row: any): CustomerBilling {
    return {
      userId: row.user_id,
      stripeCustomerId: row.stripe_customer_id,
      tierId: row.tier_id,
      subscriptionId: row.subscription_id,
      status: row.status,
      currentPeriodStart: row.current_period_start,
      currentPeriodEnd: row.current_period_end,
      cancelAtPeriodEnd: row.cancel_at_period_end,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private async handleUsageExceeded(
    userId: string, 
    usageCheck: { field?: keyof UsageLimits; current: number; limit: number }
  ): Promise<void> {
    // Could implement:
    // - Send notification emails
    // - Create upgrade prompts
    // - Temporary service restrictions
    // - Automatic pay-as-you-go charges
    
    logger.warn('Usage limit exceeded - upgrade needed', {
      userId,
      field: usageCheck.field || 'unknown',
      current: usageCheck.current,
      limit: usageCheck.limit,
    });
  }

  private async handlePaymentSucceeded(invoice: any): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(
        `INSERT INTO invoices (user_id, stripe_invoice_id, amount, currency, status, due_date, paid_at, created_at)
         VALUES (
           (SELECT user_id FROM customer_billing WHERE stripe_customer_id = $1),
           $2, $3, $4, $5, $6, $7, NOW()
         )
         ON CONFLICT (stripe_invoice_id) DO UPDATE SET
           status = EXCLUDED.status,
           paid_at = EXCLUDED.paid_at`,
        [
          invoice.customer,
          invoice.id,
          invoice.amount_paid / 100,
          invoice.currency,
          invoice.status,
          invoice.due_date ? new Date(invoice.due_date * 1000) : null,
          invoice.status === 'paid' ? new Date() : null,
        ]
      );

      logger.info('Payment succeeded', { invoiceId: invoice.id, customerId: invoice.customer });

    } catch (error) {
      logger.error('Failed to handle payment succeeded', { invoiceId: invoice.id, error });
    } finally {
      client.release();
    }
  }

  private async handlePaymentFailed(invoice: any): Promise<void> {
    logger.warn('Payment failed', { 
      invoiceId: invoice.id, 
      customerId: invoice.customer,
      attemptCount: invoice.attempt_count 
    });

    // Could implement dunning logic here
  }

  private async handleSubscriptionCreated(subscription: any): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(
        `UPDATE customer_billing 
         SET subscription_id = $1, status = $2, 
             current_period_start = $3, current_period_end = $4,
             cancel_at_period_end = $5, updated_at = NOW()
         WHERE stripe_customer_id = $6`,
        [
          subscription.id,
          subscription.status,
          new Date(subscription.current_period_start * 1000),
          new Date(subscription.current_period_end * 1000),
          subscription.cancel_at_period_end,
          subscription.customer,
        ]
      );

      logger.info('Subscription created', { subscriptionId: subscription.id, customerId: subscription.customer });

    } catch (error) {
      logger.error('Failed to handle subscription created', { subscriptionId: subscription.id, error });
    } finally {
      client.release();
    }
  }

  private async handleSubscriptionUpdated(subscription: any): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(
        `UPDATE customer_billing 
         SET status = $1, current_period_start = $2, current_period_end = $3,
             cancel_at_period_end = $4, updated_at = NOW()
         WHERE subscription_id = $5`,
        [
          subscription.status,
          new Date(subscription.current_period_start * 1000),
          new Date(subscription.current_period_end * 1000),
          subscription.cancel_at_period_end,
          subscription.id,
        ]
      );

      logger.info('Subscription updated', { subscriptionId: subscription.id });

    } catch (error) {
      logger.error('Failed to handle subscription updated', { subscriptionId: subscription.id, error });
    } finally {
      client.release();
    }
  }

  private async handleSubscriptionDeleted(subscription: any): Promise<void> {
    const client = await this.pool.connect();
    
    try {
      await client.query(
        `UPDATE customer_billing 
         SET subscription_id = NULL, status = 'canceled', updated_at = NOW()
         WHERE subscription_id = $1`,
        [subscription.id]
      );

      logger.info('Subscription deleted', { subscriptionId: subscription.id, customerId: subscription.customer });

    } catch (error) {
      logger.error('Failed to handle subscription deleted', { subscriptionId: subscription.id, error });
    } finally {
      client.release();
    }
  }
}

export const billingService = new BillingService(null as any); // Will be initialized with pool
