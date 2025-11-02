/**
 * Phase 19: Edge Cache & 5xx Policy - Types and Configuration
 * TTL by status, stale-while-revalidate, and incident logging
 */

export interface CacheConfig {
  ttl_by_status: {
    success: {
      default: number; // seconds
      min: number;
      max: number;
    };
    rate_limited: {
      default: number; // seconds
      min: number;
      max: number;
    };
    server_error: {
      default: number; // seconds
      min: number;
      max: number;
    };
    client_error: {
      default: number; // seconds
      min: number;
      max: number;
    };
  };
  stale_while_revalidate: {
    enabled: boolean;
    ttl_multiplier: number; // multiplier of base TTL
    max_ttl: number; // maximum stale TTL in seconds
  };
  incident_detection: {
    error_rate_threshold: number; // percentage (0-1)
    window_size_minutes: number;
    min_requests: number;
    spike_multiplier: number; // multiplier over baseline
  };
  storage: {
    type: 'memory' | 'redis' | 'r2';
    connection_string?: string;
    max_entries: number;
    cleanup_interval_seconds: number;
  };
}

export interface CacheEntry {
  key: string;
  value: any;
  status_code: number;
  created_at: number;
  expires_at: number;
  stale_until?: number;
  access_count: number;
  last_accessed: number;
  provider: string;
  request_type: string;
  etag?: string;
  last_modified?: string;
}

export interface CacheMetrics {
  total_entries: number;
  hit_rate: number;
  miss_rate: number;
  stale_hits: number;
  evictions: number;
  size_bytes: number;
  oldest_entry_age_seconds: number;
  newest_entry_age_seconds: number;
}

export interface IncidentRecord {
  id: string;
  provider: string;
  incident_type: '5xx_spike' | 'rate_limit_spike' | 'timeout_spike' | 'connection_error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  started_at: string;
  resolved_at?: string;
  duration_minutes?: number;
  error_rate: number;
  error_count: number;
  total_requests: number;
  affected_endpoints: string[];
  description: string;
  resolution_notes?: string;
  metadata: Record<string, any>;
}

export interface ProviderMetrics {
  provider: string;
  window_start: string;
  window_end: string;
  total_requests: number;
  successful_requests: number;
  error_requests: number;
  rate_limited_requests: number;
  timeout_requests: number;
  connection_errors: number;
  error_rate: number;
  average_response_time_ms: number;
  p95_response_time_ms: number;
  status_code_distribution: Record<string, number>;
  endpoint_metrics: Record<string, {
    requests: number;
    errors: number;
    error_rate: number;
    avg_response_time_ms: number;
  }>;
}

export interface CacheKey {
  provider: string;
  request_type: string;
  method: string;
  url: string;
  headers_hash?: string;
  params_hash?: string;
  tenant_id?: string;
}

export interface CacheOptions {
  ttl?: number;
  stale_while_revalidate?: boolean;
  etag?: string;
  if_none_match?: string;
  if_modified_since?: string;
  force_refresh?: boolean;
}

export interface CacheResult {
  hit: boolean;
  entry?: CacheEntry;
  stale?: boolean;
  background_refresh?: boolean;
  error?: string;
}

export interface IncidentDetectionResult {
  incident_detected: boolean;
  incident_type?: '5xx_spike' | 'rate_limit_spike' | 'timeout_spike' | 'connection_error';
  severity?: 'low' | 'medium' | 'high' | 'critical';
  error_rate: number;
  error_count: number;
  total_requests: number;
  threshold_exceeded: boolean;
  spike_detected: boolean;
  description: string;
}
