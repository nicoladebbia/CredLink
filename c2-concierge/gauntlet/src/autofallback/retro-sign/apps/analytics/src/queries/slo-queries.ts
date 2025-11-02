/**
 * Phase 13 Analytics - SLO Queries
 * Single source of truth SQL templates used by dashboards and reports
 */

export interface SurvivalMetrics {
  tenant: string;
  route: string;
  mode: 'remote' | 'embed';
  remote_ok: number;
  remote_fail: number;
  embed_ok: number;
  embed_fail: number;
  total: number;
  remote_survival: number;
  embed_survival: number;
}

export interface BurnRateMetrics {
  tenant: string;
  route: string;
  window_start: Date;
  ok: number;
  fail: number;
  survival: number;
  burn_rate: number;
  total_requests: number;
}

export interface LatencyMetrics {
  tenant: string;
  route: string;
  p50: number;
  p95: number;
  p99: number;
  sample_count: number;
}

export interface CostMetrics {
  tenant: string;
  sign_usd: number;
  verify_usd: number;
  storage_usd: number;
  egress_usd: number;
  total_usd: number;
  projected_monthly: number;
}

export interface IncidentMetrics {
  tenant: string;
  route: string;
  ts: Date;
  state_from: string;
  state_to: string;
  reason: string;
  rules: string[];
  id: string;
  duration_minutes?: number;
}

/**
 * Core SQL Templates - Same queries used by dashboards AND public reports
 */

export const SLO_QUERIES = {
  // 30-day survival metrics for SLO cards
  SURVIVAL_30D: `
    WITH target := 0.999
    SELECT
      tenant,
      route,
      mode,
      sumMerge(remote_ok) AS remote_ok,
      sumMerge(remote_fail) AS remote_fail,
      sumMerge(embed_ok) AS embed_ok,
      sumMerge(embed_fail) AS embed_fail,
      sumMerge(total) AS total,
      round(remote_ok / (remote_ok + remote_fail), 4) AS remote_survival,
      round(embed_ok / (embed_ok + embed_fail), 4) AS embed_survival
    FROM mv_survival_5m_table
    WHERE tenant = {tenant:String}
      AND window_start >= now() - INTERVAL 30 DAY
      AND route = {route:String}
    GROUP BY tenant, route, mode
    ORDER BY mode, route
  `,

  // Burn rate calculation for alerting (5-minute window)
  BURN_RATE_5M: `
    WITH target := 0.999
    SELECT
      tenant,
      route,
      window_start,
      sumMerge(remote_ok) AS ok,
      sumMerge(remote_fail) AS fail,
      round(ok / (ok + fail), 4) AS survival,
      round(fail / ((1 - target) * (ok + fail)), 2) AS burn_rate,
      sumMerge(total) AS total_requests
    FROM mv_survival_5m_table
    WHERE tenant = {tenant:String}
      AND window_start >= now() - INTERVAL 5 MINUTE
    GROUP BY tenant, route, window_start
    HAVING total_requests > 0
    ORDER BY burn_rate DESC
  `,

  // Burn rate calculation for alerting (1-hour window)
  BURN_RATE_1H: `
    WITH target := 0.999
    SELECT
      tenant,
      route,
      sumMerge(remote_ok) AS ok,
      sumMerge(remote_fail) AS fail,
      round(ok / (ok + fail), 4) AS survival,
      round(fail / ((1 - target) * (ok + fail)), 2) AS burn_rate,
      sumMerge(total) AS total_requests
    FROM mv_survival_5m_table
    WHERE tenant = {tenant:String}
      AND window_start >= now() - INTERVAL 1 HOUR
    GROUP BY tenant, route
    HAVING total_requests > 0
    ORDER BY burn_rate DESC
  `,

  // Verify latency metrics (24 hours)
  VERIFY_LATENCY_24H: `
    SELECT
      tenant,
      route,
      round(quantileMerge(0.50)(p50), 0) AS p50,
      round(quantileMerge(0.95)(p95), 0) AS p95,
      round(quantileMerge(0.99)(p99), 0) AS p99,
      sumMerge(n) AS sample_count
    FROM mv_verify_5m_table
    WHERE tenant = {tenant:String}
      AND window_start >= now() - INTERVAL 24 HOUR
      ${route:raw}
    GROUP BY tenant, route
    ORDER BY route
  `,

  // Sign latency metrics (24 hours)
  SIGN_LATENCY_24H: `
    SELECT
      tenant,
      tsa_profile,
      round(quantileMerge(0.95)(p95), 0) AS p95,
      sumMerge(sign_ok) AS sign_ok,
      sumMerge(sign_fail) AS sign_fail
    FROM mv_sign_5m_table
    WHERE tenant = {tenant:String}
      AND window_start >= now() - INTERVAL 24 HOUR
    GROUP BY tenant, tsa_profile
    ORDER BY tsa_profile
  `,

  // Cost projections (MTD + forecast)
  COST_PROJECTIONS: `
    WITH 
      -- MTD calculations
      mtd_start := toStartOfMonth(now()),
      days_in_month := toDayOfMonth(date_sub(now(), INTERVAL 1 DAY)),
      current_day := toDayOfMonth(now()),
      
      -- Signing costs
      sign_events AS (
        SELECT 
          tenant,
          tsa_profile,
          sumMerge(sign_ok) AS total_signs
        FROM mv_sign_5m_table
        WHERE tenant = {tenant:String}
          AND window_start >= mtd_start
        GROUP BY tenant, tsa_profile
      ),
      
      -- Verify costs  
      verify_events AS (
        SELECT
          tenant,
          count() AS total_verifies
        FROM verify_events
        WHERE tenant = {tenant:String}
          AND ts >= mtd_start
          AND status = 'ok'
        GROUP BY tenant
      ),
      
      -- Storage costs (estimate from manifests)
      storage_gb AS (
        SELECT 
          tenant,
          50.0 AS estimated_gb -- TODO: Calculate from actual manifest storage
        ),
      
      -- Egress costs (estimate from delivery sample)
      egress_gb AS (
        SELECT
          tenant,
          sum(total_requests) * 0.5 / 1024 AS estimated_gb -- Assume 0.5MB avg asset
        FROM (
          SELECT sumMerge(total) AS total_requests
          FROM mv_survival_5m_table
          WHERE tenant = {tenant:String}
            AND window_start >= mtd_start
        )
        GROUP BY tenant
      )
      
    SELECT
      coalesce(s.tenant, v.tenant, st.tenant, e.tenant) AS tenant,
      
      -- Cost calculations
      round(s.total_signs * 0.01, 2) AS sign_usd,        -- $0.01 per sign
      round(v.total_verifies * 0.005, 2) AS verify_usd, -- $0.005 per verify
      round(st.estimated_gb * 0.023, 2) AS storage_usd, -- $0.023 per GB-month
      round(e.estimated_gb * 0.09, 2) AS egress_usd,    -- $0.09 per GB
      
      -- Totals and projections
      round(
        (s.total_signs * 0.01) + 
        (v.total_verifies * 0.005) + 
        (st.estimated_gb * 0.023) + 
        (e.estimated_gb * 0.09), 2
      ) AS total_usd,
      
      round(
        ((s.total_signs * 0.01) + 
         (v.total_verifies * 0.005) + 
         (st.estimated_gb * 0.023) + 
         (e.estimated_gb * 0.09)) * 
        (days_in_month / current_day), 2
      ) AS projected_monthly
      
    FROM sign_events s
    FULL OUTER JOIN verify_events v ON s.tenant = v.tenant
    FULL OUTER JOIN storage_gb st ON coalesce(s.tenant, v.tenant) = st.tenant
    FULL OUTER JOIN egress_gb e ON coalesce(s.tenant, v.tenant, st.tenant) = e.tenant
  `,

  // Recent incidents for dashboard table
  RECENT_INCIDENTS: `
    SELECT
      tenant,
      route,
      ts,
      state_from,
      state_to,
      reason,
      rules,
      toString(id) AS incident_id,
      CASE 
        WHEN state_to = 'NORMAL' THEN 'resolved'
        ELSE 'open'
      END AS status
    FROM incidents
    WHERE tenant = {tenant:String}
      AND ts >= now() - INTERVAL 7 DAY
      ${route:raw}
    ORDER BY ts DESC
    LIMIT 50
  `,

  // Daily survival matrix for public reports
  SURVIVAL_DAILY_MATRIX: `
    WITH target := 0.999
    SELECT
      toDate(window_start) AS date,
      route,
      mode,
      round(sumMerge(remote_ok) / (sumMerge(remote_ok) + sumMerge(remote_fail)), 4) AS survival_rate,
      sumMerge(total) AS total_requests
    FROM mv_survival_5m_table
    WHERE tenant = {tenant:String}
      AND window_start >= {start_date:DateTime}
      AND window_start <= {end_date:DateTime}
    GROUP BY date, route, mode
    ORDER BY date DESC, route, mode
  `,

  // Provider performance analysis
  PROVIDER_PERFORMANCE: `
    SELECT
      tenant,
      provider,
      route,
      count() AS deliveries,
      round(avg(remote_survives), 4) AS survival_rate,
      round(avg(ms), 0) AS avg_latency_ms,
      min(ts) AS first_seen,
      max(ts) AS last_seen
    FROM deliveries
    WHERE tenant = {tenant:String}
      AND ts >= now() - INTERVAL 7 DAY
    GROUP BY tenant, provider, route
    ORDER BY deliveries DESC
  `,

  // SLO status summary for cards
  SLO_STATUS_SUMMARY: `
    WITH 
      target_remote := 0.999,
      target_embed := 0.95,
      target_verify_p95 := 600,
      target_sign_p95 := 800,
      
      survival_data AS (
        SELECT
          route,
          mode,
          round(sumMerge(remote_ok) / (sumMerge(remote_ok) + sumMerge(remote_fail)), 4) AS survival
        FROM mv_survival_5m_table
        WHERE tenant = {tenant:String}
          AND window_start >= now() - INTERVAL 30 DAY
        GROUP BY route, mode
      ),
      
      latency_data AS (
        SELECT
          route,
          round(quantileMerge(0.95)(p95), 0) AS verify_p95
        FROM mv_verify_5m_table
        WHERE tenant = {tenant:String}
          AND window_start >= now() - INTERVAL 24 HOUR
        GROUP BY route
      )
      
    SELECT
      s.route,
      s.mode,
      s.survival,
      CASE 
        WHEN s.mode = 'remote' AND s.survival >= target_remote THEN 'PASS'
        WHEN s.mode = 'embed' AND s.survival >= target_embed THEN 'PASS'
        ELSE 'FAIL'
      END AS survival_slo_status,
      COALESCE(l.verify_p95, 0) AS verify_p95,
      CASE 
        WHEN l.verify_p95 <= target_verify_p95 OR l.verify_p95 IS NULL THEN 'PASS'
        ELSE 'FAIL'
      END AS latency_slo_status
    FROM survival_data s
    LEFT JOIN latency_data l ON s.route = l.route
    ORDER BY s.route, s.mode
  `
};

/**
 * Query parameter builders
 */
export const QueryBuilder = {
  withRouteFilter(route?: string) {
    return route ? `AND route = {route:String}` : '';
  },

  survivalParams(tenant: string, route?: string) {
    return {
      tenant,
      ...(route && { route })
    };
  },

  burnRateParams(tenant: string) {
    return { tenant };
  },

  latencyParams(tenant: string, route?: string) {
    return {
      tenant,
      ...(route && { route }),
      route: this.withRouteFilter(route)
    };
  },

  costParams(tenant: string) {
    return { tenant };
  },

  incidentParams(tenant: string, route?: string) {
    return {
      tenant,
      ...(route && { route }),
      route: this.withRouteFilter(route)
    };
  },

  reportParams(tenant: string, startDate: Date, endDate: Date) {
    return {
      tenant,
      start_date: startDate,
      end_date: endDate
    };
  }
};
