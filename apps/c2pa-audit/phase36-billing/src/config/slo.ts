// SLO Configuration - Monthly Targets (30 days)
export const SLO_CONFIG = {
  // Survival SLOs
  survival: {
    remote: {
      target: 0.999, // 99.9%
      errorBudget: 0.001, // 0.1%
      window: '30d',
      description: 'Remote survival ratio (verified_remote_ok / verified_total)',
    },
    embed: {
      target: 0.95, // 95%
      errorBudget: 0.05, // 5%
      window: '30d',
      description: 'Embed survival ratio (verified_embedded_ok / verified_total)',
    },
  },
  
  // Latency SLOs (p95)
  latency: {
    verify: {
      target: 600, // ms
      window: '30d',
      description: 'Verify API p95 latency',
    },
    sign: {
      embed: {
        target: 800, // ms
        window: '30d',
        description: 'Sign p95 latency (embed)',
      },
      remote: {
        target: 400, // ms
        window: '30d',
        description: 'Sign p95 latency (remote)',
      },
    },
    tsa: {
      target: 300, // ms
      window: '30d',
      description: 'TSA p95 latency when enabled',
    },
    manifestFetch: {
      target: 200, // ms
      window: '30d',
      description: 'Manifest fetch latency (edge→store)',
    },
  },
  
  // Error Rate SLOs
  errorRate: {
    overall: {
      target: 0.01, // 1%
      window: '30d',
      description: 'Overall error rate',
    },
    verifyFail: {
      target: 0.005, // 0.5%
      window: '30d',
      description: 'Verify failure rate',
    },
    discoveryFail: {
      target: 0.002, // 0.2%
      window: '30d',
      description: 'Discovery failure rate',
    },
    tsaError: {
      target: 0.01, // 1%
      window: '30d',
      description: 'TSA error rate per vendor',
    },
  },
  
  // Cache Performance SLOs
  cache: {
    hitRatio: {
      target: 0.85, // 85%
      window: '30d',
      description: 'Cache hit ratio',
    },
  },
  
  // Cost SLOs
  cost: {
    logIngestPerTenant: {
      target: 1000000000, // 1GB bytes per month
      window: '30d',
      description: 'Log ingest cap per tenant (bytes)',
    },
  },
} as const;

// Burn Rate Alert Configuration
export const BURN_RATE_ALERTS = {
  // Multi-window, multi-threshold alerts (Google SRE guidance)
  paging: [
    {
      name: 'critical_burn_rate',
      burnRate: 14.4,
      window: '1h',
      description: 'Page if burn-rate ≥ 14.4× for 1h',
    },
    {
      name: 'high_burn_rate',
      burnRate: 6.0,
      window: '6h',
      description: 'Page if burn-rate ≥ 6× for 6h',
    },
  ],
  
  ticketing: [
    {
      name: 'moderate_burn_rate',
      burnRate: 2.0,
      window: '24h',
      description: 'Ticket if burn-rate ≥ 2× for 24h',
    },
  ],
  
  // Latency alerts
  latency: [
    {
      name: 'verify_latency_p99',
      metric: 'verify_latency_ms',
      percentile: 99,
      threshold: 1200, // 2x SLO target
      window: '5m',
      severity: 'warning',
    },
    {
      name: 'sign_latency_p99',
      metric: 'sign_latency_ms',
      percentile: 99,
      threshold: 1600, // 2x SLO target
      window: '5m',
      severity: 'warning',
    },
    {
      name: 'tsa_latency_p95',
      metric: 'tsa_latency_ms',
      percentile: 95,
      threshold: 600, // 2x SLO target
      window: '5m',
      severity: 'critical',
    },
  ],
  
  // Error rate alerts
  errorRate: [
    {
      name: 'verify_error_rate',
      metric: 'verify_error_rate',
      threshold: 0.02, // 2x SLO target
      window: '5m',
      severity: 'warning',
    },
    {
      name: 'tsa_error_rate',
      metric: 'tsa_error_rate',
      threshold: 0.02, // 2x SLO target
      window: '5m',
      severity: 'critical',
    },
  ],
  
  // Cache alerts
  cache: [
    {
      name: 'cache_hit_ratio',
      metric: 'cache_hit_ratio',
      threshold: 0.7, // Below SLO target
      window: '10m',
      severity: 'warning',
    },
  ],
} as const;

// SLI Definitions (PromQL queries)
export const SLI_QUERIES = {
  // Survival SLIs
  survival_remote_ratio: 'sum(rate(verify_ok_total{discovery="remote"}[30d])) / sum(rate(verify_total_total[30d]))',
  survival_embed_ratio: 'sum(rate(verify_ok_total{discovery="embedded",path="preserve"}[30d])) / sum(rate(verify_total_total[30d]))',
  
  // Latency SLIs
  verify_latency_p95: 'histogram_quantile(0.95, sum(rate(verify_latency_ms_bucket[30d])) by (le))',
  verify_latency_p99: 'histogram_quantile(0.99, sum(rate(verify_latency_ms_bucket[30d])) by (le))',
  sign_latency_p95: 'histogram_quantile(0.95, sum(rate(sign_latency_ms_bucket[30d])) by (le,sign_type))',
  sign_latency_p99: 'histogram_quantile(0.99, sum(rate(sign_latency_ms_bucket[30d])) by (le,sign_type))',
  tsa_latency_p95: 'histogram_quantile(0.95, sum(rate(tsa_latency_ms_bucket[30d])) by (le,tsa_vendor))',
  manifest_fetch_latency_p95: 'histogram_quantile(0.95, sum(rate(manifest_fetch_latency_ms_bucket[30d])) by (le))',
  
  // Error Rate SLIs
  overall_error_rate: 'sum(rate(error_total{class!="4xx"}[30d])) / sum(rate(request_total[30d]))',
  verify_error_rate: 'sum(rate(verify_fail_total[30d])) / sum(rate(verify_total_total[30d]))',
  discovery_error_rate: 'sum(rate(discovery_fail_total[30d])) / sum(rate(verify_total_total[30d]))',
  tsa_error_rate: 'sum(rate(tsa_error_total[30d])) by (tsa_vendor)',
  
  // Cache SLIs
  cache_hit_ratio: 'sum(rate(cache_hit_total[30d])) / sum(rate(cache_request_total[30d]))',
  
  // Cost SLIs
  log_ingest_per_tenant: 'sum(rate(log_bytes_total[30d])) by (tenant_id)',
  
  // Business SLIs
  sign_events_total: 'sum(rate(sign_events_total[30d])) by (tenant_id)',
  verify_events_total: 'sum(rate(verify_events_total[30d])) by (tenant_id)',
  cost_accrual_usd: 'sum(rate(cost_accrual_usd_total[30d])) by (tenant_id)',
} as const;

// Burn Rate Calculations
export const calculateBurnRate = (currentValue: number, targetValue: number): number => {
  const errorBudgetConsumed = Math.max(0, 1 - (currentValue / targetValue));
  const errorBudget = 1 - targetValue;
  const burnRate = errorBudgetConsumed / errorBudget;
  return burnRate;
};

// Error Budget Status
export const getErrorBudgetStatus = (sliCurrent: number, sloTarget: number, periodElapsed: number) => {
  const errorBudget = 1 - sloTarget;
  const errorBudgetConsumed = Math.max(0, 1 - (sliCurrent / sloTarget));
  const errorBudgetRemaining = errorBudget - errorBudgetConsumed;
  const burnRate = calculateBurnRate(sliCurrent, sloTarget);
  
  return {
    errorBudget,
    errorBudgetConsumed,
    errorBudgetRemaining,
    burnRate,
    status: burnRate > 14.4 ? 'critical' : burnRate > 6 ? 'warning' : burnRate > 2 ? 'caution' : 'healthy',
    timeToExhaust: burnRate > 0 ? (errorBudgetRemaining / burnRate) * periodElapsed : Infinity,
  };
};

// SLO Validation
export const validateSLO = (sliCurrent: number, sloTarget: number): boolean => {
  return sliCurrent >= sloTarget;
};

// Alert Threshold Validation
export const validateAlertThreshold = (metric: number, threshold: number, operator: 'gt' | 'lt' = 'gt'): boolean => {
  return operator === 'gt' ? metric > threshold : metric < threshold;
};

// Export types for external use
export type SLOConfig = typeof SLO_CONFIG;
export type BurnRateAlerts = typeof BURN_RATE_ALERTS;
export type SLIQueries = typeof SLI_QUERIES;
export type ErrorBudgetStatus = ReturnType<typeof getErrorBudgetStatus>;
