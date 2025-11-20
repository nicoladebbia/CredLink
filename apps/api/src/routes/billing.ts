import { Router, Request, Response } from 'express';
import { logger } from '../utils/logger';
import { requirePermission } from '../middleware/rbac-auth';
import { stripeService } from '../services/stripe-service';
import { BillingService } from '../services/billing-service';
import { 
  BILLING_TIERS, 
  PAY_AS_YOU_GO, 
  calculatePayAsYouGoPrice,
  formatPrice 
} from '../config/billing-config';

const router: Router = Router();

/**
 * REVENUE-FIRST BILLING API
 * 
 * Simplified for $5k/month target:
 * 1. Pay-as-you-go certificate purchases (fastest revenue)
 * 2. One subscription tier ($49/month)
 * 3. Basic usage tracking
 * 4. Simple webhook handling
 */

// Get pricing tiers
router.get('/pricing', async (req, res) => {
  try {
    const pricing = {
      tiers: Object.values(BILLING_TIERS).map(tier => ({
        id: tier.id,
        name: tier.name,
        monthlyPrice: tier.monthlyPrice,
        yearlyPrice: tier.yearlyPrice,
        features: tier.features,
        popular: tier.popular,
      })),
      payAsYouGo: {
        certificatePrice: PAY_AS_YOU_GO.certificatePrice,
        bulkDiscount: PAY_AS_YOU_GO.bulkDiscount,
        enterpriseDiscount: PAY_AS_YOU_GO.enterpriseDiscount,
      },
    };

    res.json({ success: true, data: pricing });
  } catch (error) {
    logger.error('Failed to get pricing', { error });
    res.status(500).json({ success: false, error: 'Failed to get pricing' });
  }
});

// Create pay-as-you-go payment session (FASTEST REVENUE PATH)
router.post('/pay-as-you-go', async (req, res) => {
  try {
    const { quantity, userId, email } = req.body;

    // 🔥 CRITICAL SECURITY FIX: Comprehensive input validation
    if (!quantity || !userId || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Quantity, userId, and email are required' 
      });
    }
    
    // 🔥 REALISTIC SECURITY: Comprehensive SQL injection pattern detection
    // Prevents attacks that pass format validation but contain malicious content
    const sqlInjectionPatterns = [
      /('|(\-\-)|(;)|(\||\|)|(\*|\*))/i,
      /(exec(\s|\+)+(s|x)p\w+)/i,
      /(insert(\s|\+)+into)/i,
      /(delete(\s|\+)+from)/i,
      /(update(\s|\+)+\w+(\s|\+)+set)/i,
      /(drop(\s|\+)+(table|database))/i,
      /(union(\s|\+)+select)/i,
      /(select(\s|\+)+(\*|\w+)(\s|\+)+from)/i,
      /(create(\s|\+)+(table|database))/i,
      /(alter(\s|\+)+table)/i
    ];
    
    // Check all input fields for SQL injection patterns
    const allInputs = [email, userId, quantity.toString()];
    for (const input of allInputs) {
      if (sqlInjectionPatterns.some(pattern => pattern.test(input))) {
        logger.warn('SQL injection attempt detected', { input, ip: req.ip });
        return res.status(400).json({
          success: false,
          error: 'Invalid input format detected'
        });
      }
    }
    
    // Validate email format to prevent injection
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid email format'
      });
    }
    
    // Validate quantity is positive integer
    if (!Number.isInteger(quantity) || quantity <= 0 || quantity > 1000) {
      return res.status(400).json({
        success: false,
        error: 'Quantity must be a positive integer (max 1000)'
      });
    }
    
    // Validate userId format (UUID or alphanumeric)
    const userIdRegex = /^[a-zA-Z0-9-_]{8,64}$/;
    if (!userIdRegex.test(userId)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid user ID format'
      });
    }

    if (quantity < 1 || quantity > 1000) {
      return res.status(400).json({ 
        success: false, 
        error: 'Quantity must be between 1 and 1000' 
      });
    }

    // Create or get Stripe customer
    const customer = await stripeService.createOrGetCustomer(userId, email);

    // Calculate price with discounts
    const amount = calculatePayAsYouGoPrice(quantity);
    const description = `${quantity} Certificate${quantity > 1 ? 's' : ''} Purchase`;

    // Create payment session
    const session = await stripeService.createPaymentSession(
      customer.id,
      amount,
      userId,
      description
    );

    logger.info('Created pay-as-you-go session', { 
      userId, 
      quantity, 
      amount, 
      sessionId: session.id 
    });

    res.json({ 
      success: true, 
      data: { 
        sessionId: session.id, 
        url: session.url,
        amount,
        description
      } 
    });

  } catch (error) {
    logger.error('Failed to create pay-as-you-go session', { error });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create payment session' 
    });
  }
});

// Create subscription (SECOND REVENUE PATH)
router.post('/subscribe', async (req, res) => {
  try {
    const { tierId, userId, email, trialPeriodDays } = req.body;

    if (!tierId || !userId || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'Tier ID, userId, and email are required' 
      });
    }

    // Only allow Pro tier for simplicity (can expand later)
    if (tierId !== 'pro') {
      return res.status(400).json({ 
        success: false, 
        error: 'Only Pro subscription is currently available' 
      });
    }

    // Create or get Stripe customer
    const customer = await stripeService.createOrGetCustomer(userId, email);

    // Create subscription
    const subscription = await stripeService.createSubscription(
      customer.id,
      BILLING_TIERS.pro.stripePriceId,
      userId,
      trialPeriodDays || 14 // 14-day trial for Pro
    );

    const clientSecret = (subscription.latest_invoice as any)?.payment_intent?.client_secret;

    logger.info('Created subscription', { 
      userId, 
      tierId, 
      subscriptionId: subscription.id,
      status: subscription.status 
    });

    res.json({ 
      success: true, 
      data: { 
        subscriptionId: subscription.id,
        clientSecret,
        status: subscription.status,
        currentPeriodEnd: (subscription as any).current_period_end || undefined
      } 
    });

  } catch (error) {
    logger.error('Failed to create subscription', { error });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create subscription' 
    });
  }
});

// Get customer billing status
router.get('/status/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    // For now, return mock status (would query database in real implementation)
    const status = {
      userId,
      tier: 'free',
      status: 'active',
      certificatesUsed: 0,
      certificatesLimit: 5,
      canUpgrade: true,
    };

    res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Failed to get billing status', { error });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get billing status' 
    });
  }
});

// Create customer portal session
router.post('/portal', async (req, res) => {
  try {
    const { userId, email } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ 
        success: false, 
        error: 'User ID and email are required' 
      });
    }

    // Create or get Stripe customer
    const customer = await stripeService.createOrGetCustomer(userId, email);

    // Create portal session
    const session = await stripeService.createCustomerPortalSession(
      customer.id,
      userId
    );

    logger.info('Created portal session', { userId, sessionId: session.id });

    res.json({ 
      success: true, 
      data: { 
        sessionId: session.id,
        url: session.url 
      } 
    });

  } catch (error) {
    logger.error('Failed to create portal session', { error });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to create portal session' 
    });
  }
});

// Stripe webhook handler (SIMPLIFIED - no queue needed for low volume)
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'] as string;
  
  try {
    const event = stripeService.verifyWebhookSignature(req.body, sig);
    
    logger.info('Processing webhook', { 
      type: event.type, 
      id: event.id 
    });

    // Handle critical events for revenue tracking
    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        break;
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;
      case 'customer.subscription.deleted':
        await handleSubscriptionCanceled(event.data.object);
        break;
      default:
        logger.info('Unhandled webhook event', { type: event.type });
    }

    res.json({ received: true });

  } catch (error) {
    logger.error('Webhook processing failed', { error });
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// Simple revenue analytics (for business tracking)
router.get('/analytics', async (req, res) => {
  try {
    // Mock analytics for now (would query database in real implementation)
    const analytics = {
      totalRevenue: 2450.00,
      monthlyRecurringRevenue: 980.00,
      oneTimeRevenue: 1470.00,
      activeSubscriptions: 20,
      certificatesSold: 294,
      averageOrderValue: 8.33,
    };

    res.json({ success: true, data: analytics });
  } catch (error) {
    logger.error('Failed to get analytics', { error });
    res.status(500).json({ 
      success: false, 
      error: 'Failed to get analytics' 
    });
  }
});

// Simplified webhook handlers (no BullMQ needed for low volume)
async function handleCheckoutCompleted(session: any) {
  logger.info('Checkout completed', { 
    sessionId: session.id,
    customerId: session.customer,
    amount: session.amount_total / 100,
    metadata: session.metadata
  });

  // Here you would:
  // 1. Update user's certificate credits
  // 2. Send confirmation email
  // 3. Track revenue analytics
}

async function handlePaymentSucceeded(invoice: any) {
  logger.info('Payment succeeded', { 
    invoiceId: invoice.id,
    customerId: invoice.customer,
    amount: invoice.amount_paid / 100
  });

  // Here you would:
  // 1. Update subscription status
  // 2. Grant subscription benefits
  // 3. Send receipt email
}

async function handlePaymentFailed(invoice: any) {
  logger.warn('Payment failed', { 
    invoiceId: invoice.id,
    customerId: invoice.customer,
    attemptCount: invoice.attempt_count
  });

  // Here you would:
  // 1. Notify user of payment failure
  // 2. Maybe restrict access temporarily
  // 3. Set up retry reminders
}

async function handleSubscriptionCreated(subscription: any) {
  logger.info('Subscription created', { 
    subscriptionId: subscription.id,
    customerId: subscription.customer,
    status: subscription.status
  });

  // Here you would:
  // 1. Update user's subscription status
  // 2. Grant Pro tier benefits
  // 3. Send welcome email
}

async function handleSubscriptionCanceled(subscription: any) {
  logger.info('Subscription canceled', { 
    subscriptionId: subscription.id,
    customerId: subscription.customer
  });

  // Here you would:
  // 1. Downgrade user to free tier
  // 2. Revoke Pro benefits
  // 3. Send cancellation confirmation
}

export default router;
