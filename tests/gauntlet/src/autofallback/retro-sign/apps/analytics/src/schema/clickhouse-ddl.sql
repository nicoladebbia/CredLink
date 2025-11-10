-- Phase 13 Analytics SKU - ClickHouse Schema v1.1
-- Single source of truth for all SLO, survival, and cost metrics

-- Deliveries: one row per asset delivery decision (from Worker/DO)
-- Core table for survival calculations and SLO monitoring
CREATE TABLE IF NOT EXISTS deliveries (
  ts DateTime64(3), 
  tenant LowCardinality(String), 
  route String,
  mode Enum8('remote'=1, 'embed'=2),
  remote_survives UInt8,   -- 1/0 observed survival
  embed_survives UInt8,    -- 1/0 only measured on preserve pages (sampled)
  policy Enum8('NORMAL'=1,'FALLBACK_REMOTE_ONLY'=2,'RECOVERY_GUARD'=3),
  provider LowCardinality(String),      -- cf, imgix, cloudinary, fastly, akamai, other
  ct LowCardinality(String),            -- content-type observed
  ms UInt32                              -- delivery pipeline latency (edge only)
) ENGINE = MergeTree
PARTITION BY toDate(ts) 
ORDER BY (tenant, route, ts)
TTL ts + INTERVAL 90 DAY; -- Retention policy

-- Verifications (API-side) - latency and success metrics
CREATE TABLE IF NOT EXISTS verify_events (
  ts DateTime64(3), 
  tenant LowCardinality(String), 
  route String,
  status Enum8('ok'=1,'fail'=2,'unknown'=3),
  verify_ms UInt32, 
  manifest_hash FixedString(64)
) ENGINE = MergeTree
PARTITION BY toDate(ts) 
ORDER BY (tenant, route, ts)
TTL ts + INTERVAL 90 DAY;

-- Signings - TSA profile tracking and latency
CREATE TABLE IF NOT EXISTS sign_events (
  ts DateTime64(3), 
  tenant LowCardinality(String), 
  asset_id String,
  mode Enum8('remote'=1, 'embed'=2), 
  status Enum8('ok'=1,'fail'=2),
  sign_ms UInt32, 
  tsa_profile LowCardinality(String)
) ENGINE = MergeTree
PARTITION BY toDate(ts) 
ORDER BY (tenant, ts)
TTL ts + INTERVAL 90 DAY;

-- Incidents (Phase 6) - state changes and automatic fallbacks
CREATE TABLE IF NOT EXISTS incidents (
  ts DateTime64(3), 
  tenant LowCardinality(String), 
  route String,
  state_from String, 
  state_to String, 
  reason String,
  rules Array(String), 
  id UUID
) ENGINE = MergeTree
PARTITION BY toDate(ts) 
ORDER BY (tenant, route, ts)
TTL ts + INTERVAL 365 DAY; -- Keep incidents longer

-- Cost ledger (snapshots from Phase 8 plan/run)
-- Billing-tied cost projections and actuals
CREATE TABLE IF NOT EXISTS cost_ledger (
  ts DateTime, 
  tenant LowCardinality(String),
  type Enum8('tsa'=1,'egress'=2,'compute'=3,'storage'=4,'plan'=5),
  units Float64, 
  unit_cost Float64, 
  total_cost Float64, 
  note String
) ENGINE = SummingMergeTree(total_cost)
ORDER BY (tenant, toStartOfDay(ts), type)
TTL ts + INTERVAL 730 DAY; -- Keep cost data 2 years

-- ========================================
-- MATERIALIZED VIEWS (Rollups for Performance)
-- ========================================

-- 5-min rollup survival by route & mode
-- Core for burn-rate calculations and SLO monitoring
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_survival_5m
TO mv_survival_5m_table
ENGINE = AggregatingMergeTree ORDER BY (tenant, route, window_start, mode)
AS SELECT
  tenant, route, mode,
  toStartOfFiveMinute(ts) AS window_start,
  sumState(remote_survives) AS remote_ok,
  sumState(1 - remote_survives) AS remote_fail,
  sumState(embed_survives) AS embed_ok,
  sumState(1 - embed_survives) AS embed_fail,
  countState() AS total
FROM deliveries 
GROUP BY tenant, route, mode, window_start;

-- Target table for survival rollups
CREATE TABLE IF NOT EXISTS mv_survival_5m_table (
  tenant LowCardinality(String),
  route String,
  mode Enum8('remote'=1, 'embed'=2'),
  window_start DateTime,
  remote_ok AggregateFunction(sum, UInt8),
  remote_fail AggregateFunction(sum, UInt8),
  embed_ok AggregateFunction(sum, UInt8),
  embed_fail AggregateFunction(sum, UInt8),
  total AggregateFunction(count)
) ENGINE = AggregatingMergeTree ORDER BY (tenant, route, window_start, mode);

-- Verify p95/p99 per 5m - latency SLO monitoring
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_verify_5m
TO mv_verify_5m_table
ENGINE = AggregatingMergeTree ORDER BY (tenant, route, window_start)
AS SELECT
  tenant, route, toStartOfFiveMinute(ts) AS window_start,
  quantileState(0.95)(verify_ms) AS p95,
  quantileState(0.99)(verify_ms) AS p99,
  quantileState(0.50)(verify_ms) AS p50,
  countState() AS n
FROM verify_events 
GROUP BY tenant, route, window_start;

-- Target table for verify rollups
CREATE TABLE IF NOT EXISTS mv_verify_5m_table (
  tenant LowCardinality(String),
  route String,
  window_start DateTime,
  p95 AggregateFunction(quantile, UInt32),
  p99 AggregateFunction(quantile, UInt32),
  p50 AggregateFunction(quantile, UInt32),
  n AggregateFunction(count)
) ENGINE = AggregatingMergeTree ORDER BY (tenant, route, window_start);

-- Sign latency rollups for cost calculations
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_sign_5m
TO mv_sign_5m_table
ENGINE = AggregatingMergeTree ORDER BY (tenant, window_start, tsa_profile)
AS SELECT
  tenant, toStartOfFiveMinute(ts) AS window_start, tsa_profile,
  countIf(status = 'ok') AS sign_ok,
  countIf(status = 'fail') AS sign_fail,
  quantileState(0.95)(sign_ms) AS p95,
  sumState(sign_ms) AS total_ms
FROM sign_events 
GROUP BY tenant, window_start, tsa_profile;

-- Target table for sign rollups
CREATE TABLE IF NOT EXISTS mv_sign_5m_table (
  tenant LowCardinality(String),
  window_start DateTime,
  tsa_profile LowCardinality(String),
  sign_ok AggregateFunction(count),
  sign_fail AggregateFunction(count),
  p95 AggregateFunction(quantile, UInt32),
  total_ms AggregateFunction(sum, UInt64)
) ENGINE = AggregatingMergeTree ORDER BY (tenant, window_start, tsa_profile);

-- ========================================
-- UTILITY VIEWS FOR DASHBOARDS
-- ========================================

-- 30-day survival view for SLO cards
CREATE VIEW IF NOT EXISTS v_survival_30d AS
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
  if(remote_ok + remote_fail > 0, remote_ok / (remote_ok + remote_fail), 0) AS remote_survival,
  if(embed_ok + embed_fail > 0, embed_ok / (embed_ok + embed_fail), 0) AS embed_survival
FROM mv_survival_5m_table
WHERE window_start >= now() - INTERVAL 30 DAY
GROUP BY tenant, route, mode;

-- Burn rate view for alerting
CREATE VIEW IF NOT EXISTS v_burn_rate AS
WITH target := 0.999
SELECT
  tenant,
  route,
  window_start,
  sumMerge(remote_ok) AS ok,
  sumMerge(remote_fail) AS fail,
  if(ok + fail > 0, ok / (ok + fail), 0) AS survival,
  if(ok + fail > 0, fail / ((1 - target) * (ok + fail)), 0) AS burn_rate,
  sumMerge(total) AS total_requests
FROM mv_survival_5m_table
GROUP BY tenant, route, window_start
HAVING total_requests > 0;
