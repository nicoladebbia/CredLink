/**
 * Phase 36 Billing - Type Definitions
 * Self-Serve Onboarding & Billing System
 */

// ============================================================================
// TENANT TYPES
// ============================================================================

export interface Tenant {
  tenant_id: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
  plan: TenantPlan;
  trial: TenantTrial;
  policy: TenantPolicy;
  install: TenantInstall;
  usage: TenantUsage;
  billing: TenantBilling;
  created_at: string;
  updated_at: string;
  status: TenantStatus;
}

export type TenantPlan = 'starter' | 'pro' | 'enterprise';
export type TenantStatus = 'trial' | 'active' | 'grace' | 'suspended' | 'canceled';

export interface TenantTrial {
  ends_at: string;
  cap: {
    sign_assets: number;
  };
  used: {
    sign_assets: number;
  };
  is_active: boolean;
}

export interface TenantPolicy {
  mode: 'remote-first' | 'embedded-first' | 'hybrid';
  badge: boolean;
  verify_sdk_version: string;
  manifest_host: string;
}

export interface TenantInstall {
  domains: string[];
  cms: 'wordpress' | 'shopify' | 'custom' | 'none';
  manifest_host: string;
  link_header_configured: boolean;
  plugin_installed: boolean;
  demo_asset_verified: boolean;
  test_page_published: boolean;
  smoke_test_passed: boolean;
}

export interface TenantUsage {
  current_month: {
    sign_events: number;
    verify_events: number;
    rfc3161_timestamps: number;
  };
  lifetime: {
    sign_events: number;
    verify_events: number;
    rfc3161_timestamps: number;
  };
  last_reset: string;
}

export interface TenantBilling {
  next_invoice_date: string;
  amount_due: number;
  currency: string;
  payment_method_id?: string;
  card_last4?: string;
  card_brand?: string;
  dunning_status?: DunningStatus;
}

export type DunningStatus = 'current' | 'late' | 'grace' | 'suspended';

// ============================================================================
// USAGE METERING TYPES
// ============================================================================

export interface UsageEvent {
  tenant_id: string;
  event_type: 'sign_events' | 'verify_events' | 'rfc3161_timestamps';
  value: number;
  timestamp: string;
  metadata?: Record<string, any>;
}

export interface UsageWindow {
  tenant_id: string;
  window: string; // ISO datetime hour
  sign_events: number;
  verify_events: number;
  rfc3161_timestamps: number;
  created_at: string;
}

export interface UsageAggregate {
  tenant_id: string;
  period: 'hour' | 'day' | 'month';
  start_date: string;
  end_date: string;
  sign_events: number;
  verify_events: number;
  rfc3161_timestamps: number;
  cost_breakdown: UsageCostBreakdown;
}

export interface UsageCostBreakdown {
  base_plan: number;
  sign_events_overage: number;
  verify_events_usage: number;
  rfc3161_timestamps_usage: number;
  total: number;
}

// ============================================================================
// INSTALL HEALTH TYPES
// ============================================================================

export interface InstallHealth {
  tenant_id: string;
  embed_survival: number; // 0-1 percentage
  remote_survival: number; // 0-1 percentage
  badge_ok: boolean;
  status: 'green' | 'amber' | 'red';
  last_checked: string;
  remediation_steps: RemediationStep[];
  details: HealthCheckDetails;
}

export interface RemediationStep {
  id: string;
  title: string;
  description: string;
  action_type: 'install' | 'configure' | 'verify' | 'publish';
  completed: boolean;
  help_url?: string;
}

export interface HealthCheckDetails {
  link_header_present: boolean;
  manifest_accessible: boolean;
  demo_asset_embedded: boolean;
  demo_asset_remote: boolean;
  discoverable: boolean;
  smoke_test_results: SmokeTestResult[];
}

export interface SmokeTestResult {
  transform_type: string;
  embed_survived: boolean;
  remote_survived: boolean;
  badge_intact: boolean;
  error?: string;
}

// ============================================================================
// BILLING & SUBSCRIPTION TYPES
// ============================================================================

export interface SubscriptionPlan {
  id: string;
  name: string;
  stripe_price_id: string;
  monthly_price: number;
  currency: string;
  features: PlanFeature[];
  limits: PlanLimits;
}

export interface PlanFeature {
  id: string;
  name: string;
  description: string;
  included: boolean;
}

export interface PlanLimits {
  sign_events_included: number;
  verify_events_included: number;
  api_calls_per_minute: number;
  tenants_per_account: number;
  custom_domains: number;
}

export interface UsageTier {
  id: string;
  meter_id: string;
  up_to: number;
  unit_price: number;
  currency: string;
}

export interface InvoiceLineItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  amount: number;
  period: {
    start: string;
    end: string;
  };
  proration: boolean;
}

// ============================================================================
// ONBOARDING WIZARD TYPES
// ============================================================================

export interface OnboardingWizard {
  tenant_id: string;
  current_step: WizardStep;
  completed_steps: WizardStep[];
  step_data: Record<WizardStep, WizardStepData>;
  status: 'in_progress' | 'completed' | 'blocked';
  created_at: string;
  updated_at: string;
}

export type WizardStep = 
  | 'domain_setup'
  | 'manifest_config'
  | 'cms_selection'
  | 'plugin_install'
  | 'demo_asset_upload'
  | 'verify_demo'
  | 'publish_test_page'
  | 'smoke_test'
  | 'install_health_check'
  | 'billing_setup';

export interface WizardStepData {
  completed: boolean;
  data: Record<string, any>;
  validation_results?: ValidationResult[];
  errors?: string[];
  completed_at?: string;
}

export interface ValidationResult {
  check: string;
  passed: boolean;
  message: string;
  details?: Record<string, any>;
}

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

export interface CreateTenantRequest {
  email: string;
  company_name?: string;
  plan: TenantPlan;
  payment_method_id: string;
  domains: string[];
  cms: TenantInstall['cms'];
  manifest_host?: string;
}

export interface CreateTenantResponse {
  tenant_id: string;
  api_key: string;
  policy: TenantPolicy;
  trial: TenantTrial;
  wizard: OnboardingWizard;
  stripe_customer_id: string;
  stripe_subscription_id: string;
}

export interface ReportUsageRequest {
  events: UsageEvent[];
}

export interface InstallCheckRequest {
  tenant_id: string;
  demo_asset_url?: string;
  test_page_url?: string;
}

export interface InstallCheckResponse {
  health: InstallHealth;
  can_checkout: boolean;
  next_steps: RemediationStep[];
}

export interface CancelTenantRequest {
  export_data: boolean;
  reason?: string;
  feedback?: string;
}

export interface CancelTenantResponse {
  export_url?: string;
  cancellation_date: string;
  final_invoice_date: string;
  data_retention_days: number;
}

// ============================================================================
// WEBHOOK TYPES
// ============================================================================

export interface StripeWebhookEvent {
  id: string;
  object: string;
  api_version: string;
  created: number;
  data: {
    object: any;
    previous_attributes?: any;
  };
  livemode: boolean;
  pending_webhooks: number;
  request: {
    id: string | null;
    idempotency_key: string | null;
  };
  type: StripeWebhookType;
}

export type StripeWebhookType = 
  | 'invoice.payment_succeeded'
  | 'invoice.payment_failed'
  | 'customer.subscription.created'
  | 'customer.subscription.updated'
  | 'customer.subscription.deleted'
  | 'invoice.finalized'
  | 'charge.succeeded'
  | 'charge.failed'
  | 'payment_method.attached'
  | 'payment_method.detached';

// ============================================================================
// EXPORT TYPES
// ============================================================================

export interface TenantExport {
  tenant_id: string;
  export_id: string;
  status: 'preparing' | 'ready' | 'expired';
  created_at: string;
  expires_at: string;
  download_url?: string;
  file_size?: number;
  format: 'zip' | 'tar.gz';
  includes: ExportIncludes;
}

export interface ExportIncludes {
  manifests: boolean;
  verify_logs: boolean;
  invoices: boolean;
  compliance_reports: boolean;
  usage_data: boolean;
}

// ============================================================================
// RFC-3161 TIMESTAMP TYPES
// ============================================================================

export interface RFC3161TimestampRequest {
  tenant_id: string;
  asset_hash: string;
  content_url?: string;
  metadata?: Record<string, any>;
}

export interface RFC3161TimestampResponse {
  timestamp_id: string;
  timestamp_token: string; // Base64 encoded DER
  timestamp_url: string;
  verification_url: string;
  created_at: string;
}

export interface TimestampVerificationResult {
  valid: boolean;
  timestamp_time: string;
  hash_match: boolean;
  certificate_chain: string[];
  error?: string;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

export interface APIError {
  code: string;
  message: string;
  details?: Record<string, any>;
  request_id?: string;
}

export interface ValidationError extends APIError {
  field: string;
  value: any;
}

export interface BillingError extends APIError {
  stripe_error_type?: string;
  stripe_error_code?: string;
  decline_code?: string;
}

// ============================================================================
// CONFIGURATION TYPES
// ============================================================================

export interface BillingConfig {
  stripe: StripeConfig;
  trial: TrialConfig;
  usage: UsageConfig;
  limits: LimitsConfig;
  features: FeatureFlags;
}

export interface StripeConfig {
  secret_key: string;
  publishable_key: string;
  webhook_secret: string;
  api_version: string;
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
}

export interface TrialConfig {
  duration_days: number;
  asset_cap: number;
  card_required: boolean;
  auto_convert_to_paid: boolean;
}

export interface UsageConfig {
  aggregation_window_minutes: number;
  batch_size: number;
  retry_attempts: number;
  retry_delay_ms: number;
}

export interface LimitsConfig {
  max_asset_size_mb: number;
  max_tenants_per_account: number;
  max_api_calls_per_minute: number;
  max_export_size_gb: number;
}

export interface FeatureFlags {
  stripe_radar: boolean;
  smart_retries: boolean;
  usage_metering: boolean;
  rfc3161_timestamps: boolean;
  customer_portal: boolean;
  compliance_reports: boolean;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    per_page: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}

export interface DateRange {
  start_date: string;
  end_date: string;
}

export interface Metric {
  name: string;
  value: number;
  unit: string;
  timestamp: string;
  labels?: Record<string, string>;
}

export interface HealthCheck {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: {
    database: boolean;
    redis: boolean;
    stripe: boolean;
    storage: boolean;
  };
  timestamp: string;
  version: string;
}
