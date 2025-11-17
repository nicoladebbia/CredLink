/**
 * Security Monitor Configuration
 * Environment-based initialization for alert providers
 */

import { AlertProvider, SentryAlertProvider, PagerDutyAlertProvider, ConsoleFallbackProvider } from './alert-providers';

/**
 * Initialize alert providers based on environment configuration
 */
export function initializeAlertProviders(): AlertProvider[] {
  const providers: AlertProvider[] = [];

  // Always include console fallback as last resort
  providers.push(new ConsoleFallbackProvider());

  // Initialize Sentry if DSN is provided
  if (process.env.SENTRY_DSN) {
    try {
      providers.push(new SentryAlertProvider(process.env.SENTRY_DSN));
      console.log('✅ Sentry alert provider initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Sentry provider:', error);
    }
  }

  // Initialize PagerDuty if credentials are provided
  if (process.env.PAGERDUTY_API_KEY && process.env.PAGERDUTY_INTEGRATION_KEY) {
    try {
      providers.push(new PagerDutyAlertProvider(
        process.env.PAGERDUTY_API_KEY,
        process.env.PAGERDUTY_INTEGRATION_KEY
      ));
      console.log('✅ PagerDuty alert provider initialized');
    } catch (error) {
      console.error('❌ Failed to initialize PagerDuty provider:', error);
    }
  }

  // Log provider initialization status
  console.log(`🔒 Security monitor initialized with ${providers.length} alert providers`);
  
  return providers;
}

/**
 * Validate alert provider configuration
 */
export function validateAlertConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  // Check Sentry configuration
  if (process.env.SENTRY_DSN) {
    if (!process.env.SENTRY_DSN.startsWith('https://')) {
      errors.push('SENTRY_DSN must be a valid HTTPS URL');
    }
  }

  // Check PagerDuty configuration
  if (process.env.PAGERDUTY_API_KEY || process.env.PAGERDUTY_INTEGRATION_KEY) {
    if (!process.env.PAGERDUTY_API_KEY) {
      errors.push('PAGERDUTY_API_KEY is required when using PagerDuty');
    }
    if (!process.env.PAGERDUTY_INTEGRATION_KEY) {
      errors.push('PAGERDUTY_INTEGRATION_KEY is required when using PagerDuty');
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
