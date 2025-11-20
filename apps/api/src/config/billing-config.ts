/**
 * Production-Grade Billing Configuration
 * 
 * Defines pricing tiers, usage limits, and billing rules
 * All values configurable via environment variables
 */

export interface BillingTier {
  id: string;
  name: string;
  stripePriceId: string;
  monthlyPrice: number;
  yearlyPrice?: number;
  features: {
    certificatesPerMonth: number;
    storageGB: number;
    apiCallsPerMonth: number;
    teamMembers: number;
    prioritySupport: boolean;
    customBranding: boolean;
    bulkSigning: boolean;
    apiAccess: boolean;
    webhookAccess: boolean;
  };
  popular?: boolean;
}

export interface UsageLimits {
  certificates: number;
  storage: number; // in bytes
  apiCalls: number;
  teamMembers: number;
}

export interface BillingMetrics {
  certificatesUsed: number;
  storageUsed: number; // in bytes
  apiCallsUsed: number;
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
}

export const BILLING_TIERS: Record<string, BillingTier> = {
  free: {
    id: 'free',
    name: 'Starter',
    stripePriceId: process.env.STRIPE_PRICE_FREE || '',
    monthlyPrice: 0,
    features: {
      certificatesPerMonth: 5,
      storageGB: 1,
      apiCallsPerMonth: 100,
      teamMembers: 1,
      prioritySupport: false,
      customBranding: false,
      bulkSigning: false,
      apiAccess: false,
      webhookAccess: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Professional',
    stripePriceId: process.env.STRIPE_PRICE_PRO || 'price_1OqXXX', // Replace with actual price ID
    monthlyPrice: 49,
    yearlyPrice: 490, // 2 months free
    features: {
      certificatesPerMonth: 50,
      storageGB: 10,
      apiCallsPerMonth: 5000,
      teamMembers: 5,
      prioritySupport: true,
      customBranding: false,
      bulkSigning: true,
      apiAccess: true,
      webhookAccess: true,
    },
    popular: true,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    stripePriceId: process.env.STRIPE_PRICE_ENTERPRISE || 'price_1OqYYY', // Replace with actual price ID
    monthlyPrice: 199,
    yearlyPrice: 1990, // 2 months free
    features: {
      certificatesPerMonth: 500,
      storageGB: 100,
      apiCallsPerMonth: 50000,
      teamMembers: 50,
      prioritySupport: true,
      customBranding: true,
      bulkSigning: true,
      apiAccess: true,
      webhookAccess: true,
    },
  },
};

export const PAY_AS_YOU_GO = {
  certificatePrice: 5.00, // $5 per certificate
  bulkDiscount: {
    min: 10,
    discount: 0.1, // 10% discount for 10+ certificates
  },
  enterpriseDiscount: {
    min: 100,
    discount: 0.2, // 20% discount for 100+ certificates
  },
};

export const BILLING_CONFIG = {
  // Currency and locale
  currency: 'usd',
  locale: 'en-US',
  
  // Trial periods
  trialDays: {
    pro: 14,
    enterprise: 30,
  },
  
  // Usage tracking
  usageTracking: {
    syncIntervalMs: parseInt(process.env.USAGE_SYNC_INTERVAL_MS || '300000'), // 5 minutes
    retentionDays: parseInt(process.env.USAGE_RETENTION_DAYS || '365'),
  },
  
  // Dunning settings
  dunning: {
    retryDays: [3, 7, 14], // Days to retry failed payments
    gracePeriodDays: parseInt(process.env.GRACE_PERIOD_DAYS || '7'),
    maxRetries: parseInt(process.env.MAX_PAYMENT_RETRIES || '3'),
  },
  
  // Webhook settings
  webhooks: {
    timeoutMs: parseInt(process.env.WEBHOOK_TIMEOUT_MS || '30000'),
    retryAttempts: parseInt(process.env.WEBHOOK_RETRY_ATTEMPTS || '3'),
  },
  
  // Invoice settings
  invoices: {
    dueDays: parseInt(process.env.INVOICE_DUE_DAYS || '30'),
    reminderDays: [7, 3, 1], // Days before due to send reminders
  },
  
  // Tax settings
  tax: {
    enabled: process.env.TAX_CALCULATION_ENABLED === 'true',
    provider: process.env.TAX_PROVIDER || 'stripe', // stripe, taxjar, etc.
    autoTax: process.env.STRIPE_AUTOTAX_ENABLED === 'true',
  },
};

export function getBillingTier(tierId: string): BillingTier | null {
  return BILLING_TIERS[tierId] || null;
}

export function getUsageLimits(tierId: string): UsageLimits {
  const tier = getBillingTier(tierId);
  if (!tier) {
    return {
      certificates: 0,
      storage: 0,
      apiCalls: 0,
      teamMembers: 0,
    };
  }

  return {
    certificates: tier.features.certificatesPerMonth,
    storage: tier.features.storageGB * 1024 * 1024 * 1024, // Convert GB to bytes
    apiCalls: tier.features.apiCallsPerMonth,
    teamMembers: tier.features.teamMembers,
  };
}

export function calculatePayAsYouGoPrice(quantity: number): number {
  let price = quantity * PAY_AS_YOU_GO.certificatePrice;
  
  // Apply bulk discounts
  if (quantity >= PAY_AS_YOU_GO.enterpriseDiscount.min) {
    price *= (1 - PAY_AS_YOU_GO.enterpriseDiscount.discount);
  } else if (quantity >= PAY_AS_YOU_GO.bulkDiscount.min) {
    price *= (1 - PAY_AS_YOU_GO.bulkDiscount.discount);
  }
  
  return Math.round(price * 100) / 100; // Round to 2 decimal places
}

export function isUsageExceeded(
  metrics: BillingMetrics,
  limits: UsageLimits
): { exceeded: boolean; field?: keyof UsageLimits; current: number; limit: number } {
  if (metrics.certificatesUsed > limits.certificates) {
    return {
      exceeded: true,
      field: 'certificates',
      current: metrics.certificatesUsed,
      limit: limits.certificates,
    };
  }

  if (metrics.storageUsed > limits.storage) {
    return {
      exceeded: true,
      field: 'storage',
      current: metrics.storageUsed,
      limit: limits.storage,
    };
  }

  if (metrics.apiCallsUsed > limits.apiCalls) {
    return {
      exceeded: true,
      field: 'apiCalls',
      current: metrics.apiCallsUsed,
      limit: limits.apiCalls,
    };
  }

  return { exceeded: false, current: 0, limit: 0 };
}

export function getUpgradePath(currentTierId: string): BillingTier[] {
  const tiers = Object.values(BILLING_TIERS);
  const currentTier = getBillingTier(currentTierId);
  
  if (!currentTier) {
    return tiers;
  }

  // Sort by price and return tiers higher than current
  return tiers
    .filter(tier => tier.monthlyPrice > currentTier.monthlyPrice)
    .sort((a, b) => a.monthlyPrice - b.monthlyPrice);
}

export function formatPrice(amount: number, currency = BILLING_CONFIG.currency): string {
  return new Intl.NumberFormat(BILLING_CONFIG.locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

export function formatStorageSize(bytes: number): string {
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}
