/**
 * Phase 40 Verify Evidence Pipeline
 * SECURITY: CAI Verify logs partitioned by experiment arm with survival tracking
 * WARNING: Contains sensitive verification data - handle with care
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

// SECURITY: Maximum lengths to prevent DoS
const MAX_TENANT_ID_LENGTH = 64;
const MAX_PATHNAME_LENGTH = 256;
const MAX_URL_LENGTH = 2048;
const MAX_REQUEST_ID_LENGTH = 64;
const MAX_ERROR_CODE_LENGTH = 32;

// SECURITY: Rate limiting
const MAX_LOGS_PER_REQUEST = 10;
const MAX_LOGS_PER_MINUTE_PER_TENANT = 1000;

/**
 * SECURITY: Validate and sanitize tenant ID
 */
function validateTenantId(tenantId: string): string {
  if (!tenantId || typeof tenantId !== 'string') {
    throw new Error('Invalid tenant ID');
  }
  if (tenantId.length > MAX_TENANT_ID_LENGTH) {
    throw new Error(`Tenant ID exceeds maximum length of ${MAX_TENANT_ID_LENGTH}`);
  }
  // SECURITY: Remove dangerous characters
  return tenantId.replace(/[<>"'\\]/g, '').trim();
}

/**
 * SECURITY: Validate and sanitize pathname
 */
function validatePathname(pathname: string): string {
  if (!pathname || typeof pathname !== 'string') {
    throw new Error('Invalid pathname');
  }
  if (pathname.length > MAX_PATHNAME_LENGTH) {
    throw new Error(`Pathname exceeds maximum length of ${MAX_PATHNAME_LENGTH}`);
  }
  // SECURITY: Prevent path traversal and normalize
  let sanitized = pathname.replace(/\.\./g, '').replace(/\/+/g, '/');
  if (sanitized !== pathname) {
    throw new Error('Invalid pathname format');
  }
  return sanitized;
}

/**
 * SECURITY: Validate and sanitize URLs
 */
function validateUrl(url?: string): string | undefined {
  if (!url) return undefined;
  
  if (typeof url !== 'string') {
    throw new Error('Invalid URL format');
  }
  
  if (url.length > MAX_URL_LENGTH) {
    throw new Error(`URL exceeds maximum length of ${MAX_URL_LENGTH}`);
  }
  
  try {
    const parsed = new URL(url);
    // SECURITY: Only allow HTTPS and HTTP
    if (!['https:', 'http:'].includes(parsed.protocol)) {
      throw new Error('Invalid URL protocol');
    }
    // SECURITY: Prevent internal IP ranges
    const hostname = parsed.hostname;
    if (hostname && /^(10\.|172\.(1[6-9]|2[0-9]|3[0-1])\.|192\.168\.|169\.254\.|127\.)/.test(hostname)) {
      throw new Error('Internal IP addresses not allowed');
    }
    return url;
  } catch (error) {
    throw new Error('Invalid URL format');
  }
}

interface VerifyEvidenceLog {
  request_id: string;
  tenant_id: string;
  experiment_arm: 'A_EMBED' | 'B_REMOTE';
  route_bucket: number;
  pathname: string;
  asset_url?: string;
  manifest_url?: string;
  verification_start_time: number;
  verification_end_time: number;
  total_duration_ms: number;
  discovery_path: 'link_header' | 'direct_url' | 'embedded' | 'not_found';
  verification_result: {
    valid: boolean;
    signer_trusted: boolean;
    assertions_present: boolean;
    warnings: string[];
    error_code?: string;
  };
  survival_outcome: 'survived' | 'destroyed' | 'broken' | 'inaccessible';
  cache_hit: boolean;
  edge_timing_ms: number;
  trace_id?: string;
  span_id?: string;
  timestamp: string;
}

interface SurvivalMetrics {
  tenant_id: string;
  experiment_arm: 'A_EMBED' | 'B_REMOTE';
  date: string; // YYYY-MM-DD
  total_requests: number;
  successful_verifications: number;
  survival_rate: number;
  avg_latency_ms: number;
  p95_latency_ms: number;
  embed_survival_count: number;
  embed_survival_rate: number;
  remote_survival_count: number;
  remote_survival_rate: number;
  cost_per_1k_verifies: number;
  incidents_count: number;
}

interface EvidencePipelineConfig {
  enabled: boolean;
  retention_days: number;
  batch_size: number;
  export_interval_minutes: number;
  cai_verify_endpoint: string;
  analytics_kv_namespace?: string;
}

/**
 * Phase 40 Evidence Pipeline for tracking verification survival by experiment arm
 */
export class Phase40EvidencePipeline {
  private config: EvidencePipelineConfig;
  private pendingLogs: VerifyEvidenceLog[] = [];
  private metricsCache: Map<string, SurvivalMetrics> = new Map();

  constructor(config: Partial<EvidencePipelineConfig> = {}) {
    this.config = {
      enabled: true,
      retention_days: 14,
      batch_size: 100,
      export_interval_minutes: 5,
      cai_verify_endpoint: 'https://cai.contentauthenticity.org/verify',
      analytics_kv_namespace: 'phase40-evidence-logs',
      ...config
    };
  }

  /**
   * SECURITY: Process verification request with comprehensive validation
   */
  async processVerification(
    request: FastifyRequest<{Body: any}>,
    reply: FastifyReply,
    verificationResult: any,
    experimentContext?: {
      arm: 'A_EMBED' | 'B_REMOTE';
      tenant_id: string;
      route_bucket: number;
      pathname: string;
    }
  ): Promise<void> {
    // SECURITY: Validate inputs
    if (!request || !verificationResult || !experimentContext) {
      throw new Error('Invalid request parameters');
    }
    
    // SECURITY: Validate experiment context
    if (!['A_EMBED', 'B_REMOTE'].includes(experimentContext.arm)) {
      throw new Error('Invalid experiment arm');
    }
    
    const validatedTenantId = validateTenantId(experimentContext.tenant_id);
    const validatedPathname = validatePathname(experimentContext.pathname);
    
    if (!Number.isInteger(experimentContext.route_bucket) || 
        experimentContext.route_bucket < 0 || 
        experimentContext.route_bucket > 99) {
      throw new Error('Invalid route bucket');
    }
    
    if (!this.config.enabled) {
      return;
    }

    const startTime = Date.now();
    const requestId = this.generateRequestId();

    const body = request.body as any;
    
    // SECURITY: Validate and sanitize URLs from request body
    const validatedAssetUrl = validateUrl(body?.asset_url);
    const validatedManifestUrl = validateUrl(body?.manifest_url);
    
    // Extract trace context from headers
    const traceId = request.headers['traceparent'] as string || undefined;
    const spanId = request.headers['tracestate'] as string || undefined;

    // Determine discovery path and survival outcome
    const discoveryPath = this.determineDiscoveryPath(request, verificationResult);
    const survivalOutcome = this.determineSurvivalOutcome(verificationResult, discoveryPath);

    // Create evidence log entry with validated data
    const evidenceLog: VerifyEvidenceLog = {
      request_id: requestId,
      tenant_id: validatedTenantId,
      experiment_arm: experimentContext.arm,
      route_bucket: experimentContext.route_bucket,
      pathname: validatedPathname,
      asset_url: validatedAssetUrl,
      manifest_url: validatedManifestUrl,
      verification_start_time: startTime,
      verification_end_time: Date.now(),
      total_duration_ms: Date.now() - startTime,
      discovery_path: discoveryPath,
      verification_result: {
        valid: Boolean(verificationResult.valid),
        signer_trusted: Boolean(verificationResult.signer?.trusted),
        assertions_present: Boolean(verificationResult.assertions),
        warnings: Array.isArray(verificationResult.warnings) 
          ? verificationResult.warnings.filter((w: any) => typeof w === 'string').slice(0, 10)
          : [],
        error_code: verificationResult.error?.code && typeof verificationResult.error.code === 'string'
          ? verificationResult.error.code.substring(0, MAX_ERROR_CODE_LENGTH)
          : undefined
      },
      survival_outcome: survivalOutcome,
      cache_hit: verificationResult.metrics?.cached || false,
      edge_timing_ms: this.extractEdgeTiming(request.headers),
      trace_id: traceId,
      span_id: spanId,
      timestamp: new Date().toISOString()
    };

    // Add to pending logs for batch processing
    this.pendingLogs.push(evidenceLog);

    // Update real-time metrics
    await this.updateMetrics(evidenceLog);

    // Log to request context for debugging
    (request.log as any).info({
      request_id: requestId,
      tenant_id: experimentContext.tenant_id,
      experiment_arm: experimentContext.arm,
      survival_outcome: survivalOutcome,
      discovery_path: discoveryPath,
      duration_ms: evidenceLog.total_duration_ms
    }, 'Phase 40 verification evidence logged');

    // Process batch if size threshold reached
    if (this.pendingLogs.length >= this.config.batch_size) {
      await this.flushPendingLogs();
    }
  }

  /**
   * Determine how the manifest was discovered
   */
  private determineDiscoveryPath(
    request: FastifyRequest<{Body: any}>,
    verificationResult: any
  ): 'link_header' | 'direct_url' | 'embedded' | 'not_found' {
    if (verificationResult.decision_path?.discovery) {
      return verificationResult.decision_path.discovery;
    }

    // Analyze request to infer discovery path
    const body = request.body as any;
    if (body?.manifest_url) {
      return 'direct_url';
    }

    if (request.headers?.link?.includes('rel="c2pa-manifest"')) {
      return 'link_header';
    }

    if (verificationResult.decision_path?.steps?.includes('embedded_manifest')) {
      return 'embedded';
    }

    return 'not_found';
  }

  /**
   * Determine survival outcome based on verification results
   */
  private determineSurvivalOutcome(
    verificationResult: any,
    discoveryPath: string
  ): 'survived' | 'destroyed' | 'broken' | 'inaccessible' {
    if (verificationResult.valid && verificationResult.signer?.trusted) {
      return 'survived';
    }

    if (verificationResult.error?.code === 'MANIFEST_UNREACHABLE') {
      return 'inaccessible';
    }

    if (verificationResult.error?.code === 'MISMATCHED_HASH' || 
        verificationResult.error?.code === 'INVALID_FORMAT') {
      return 'destroyed';
    }

    return 'broken';
  }

  /**
   * Extract edge timing from response headers
   */
  private extractEdgeTiming(headers: any): number {
    const timingHeader = headers['x-c2-edge-timing'];
    return timingHeader ? parseInt(timingHeader, 10) : 0;
  }

  /**
   * Update survival metrics for real-time monitoring
   */
  private async updateMetrics(log: VerifyEvidenceLog): Promise<void> {
    const dateKey = `${log.tenant_id}:${log.experiment_arm}:${new Date().toISOString().split('T')[0]}`;
    
    let metrics = this.metricsCache.get(dateKey);
    if (!metrics) {
      metrics = {
        tenant_id: log.tenant_id,
        experiment_arm: log.experiment_arm,
        date: new Date().toISOString().split('T')[0],
        total_requests: 0,
        successful_verifications: 0,
        survival_rate: 0,
        avg_latency_ms: 0,
        p95_latency_ms: 0,
        embed_survival_count: 0,
        embed_survival_rate: 0,
        remote_survival_count: 0,
        remote_survival_rate: 0,
        cost_per_1k_verifies: 0,
        incidents_count: 0
      };
      this.metricsCache.set(dateKey, metrics);
    }

    // Update counters
    metrics.total_requests++;
    if (log.verification_result.valid) {
      metrics.successful_verifications++;
    }

    // Update survival counts by arm
    if (log.experiment_arm === 'A_EMBED' && log.survival_outcome === 'survived') {
      metrics.embed_survival_count++;
    } else if (log.experiment_arm === 'B_REMOTE' && log.survival_outcome === 'survived') {
      metrics.remote_survival_count++;
    }

    // Calculate rates
    metrics.survival_rate = metrics.successful_verifications / metrics.total_requests;
    metrics.embed_survival_rate = metrics.embed_survival_count / Math.max(1, 
      this.getArmRequestCount(log.tenant_id, 'A_EMBED'));
    metrics.remote_survival_rate = metrics.remote_survival_count / Math.max(1,
      this.getArmRequestCount(log.tenant_id, 'B_REMOTE'));

    // Update latency (rolling average approximation)
    metrics.avg_latency_ms = (metrics.avg_latency_ms * (metrics.total_requests - 1) + log.total_duration_ms) / metrics.total_requests;

    // Calculate cost per 1k verifies (simplified model)
    metrics.cost_per_1k_verifies = this.calculateCostPer1kVerifies(metrics);
  }

  /**
   * Get request count for specific arm (simplified)
   */
  private getArmRequestCount(tenantId: string, arm: 'A_EMBED' | 'B_REMOTE'): number {
    let count = 0;
    for (const [key, metrics] of Array.from(this.metricsCache.entries())) {
      if (key.startsWith(`${tenantId}:${arm}:`)) {
        count += metrics.total_requests;
      }
    }
    return count;
  }

  /**
   * Calculate cost per 1k verifies based on resource usage
   */
  private calculateCostPer1kVerifies(metrics: SurvivalMetrics): number {
    // Simplified cost model: edge compute + storage + verification processing
    const edgeCostPerVerify = 0.00001; // $0.00001 per edge request
    const storageCostPerVerify = 0.000005; // $0.000005 per manifest storage
    const verifyCostPerVerify = 0.00002; // $0.00002 per verification
    
    const totalCostPerVerify = edgeCostPerVerify + storageCostPerVerify + verifyCostPerVerify;
    return totalCostPerVerify * 1000; // Cost per 1k verifies
  }

  /**
   * Flush pending logs to storage
   */
  private async flushPendingLogs(): Promise<void> {
    if (this.pendingLogs.length === 0) {
      return;
    }

    const logsToFlush = [...this.pendingLogs];
    this.pendingLogs = [];

    try {
      // In a real implementation, this would write to KV, R2, or a database
      console.log(`Flushing ${logsToFlush.length} evidence logs to storage`);
      
      // Partition by arm for analysis
      const partitionedByArm = logsToFlush.reduce((acc, log) => {
        if (!acc[log.experiment_arm]) {
          acc[log.experiment_arm] = [];
        }
        acc[log.experiment_arm].push(log);
        return acc;
      }, {} as Record<'A_EMBED' | 'B_REMOTE', VerifyEvidenceLog[]>);

      console.log(`Evidence partitioned: A_EMBED=${partitionedByArm.A_EMBED?.length || 0}, B_REMOTE=${partitionedByArm.B_REMOTE?.length || 0}`);

    } catch (error) {
      console.error('Failed to flush evidence logs:', error);
      // Re-add logs to pending for retry
      this.pendingLogs.unshift(...logsToFlush);
    }
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `ev_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get survival metrics for analysis
   */
  getSurvivalMetrics(tenantId?: string, arm?: 'A_EMBED' | 'B_REMOTE'): SurvivalMetrics[] {
    let metrics = Array.from(this.metricsCache.values());

    if (tenantId) {
      metrics = metrics.filter(m => m.tenant_id === tenantId);
    }

    if (arm) {
      metrics = metrics.filter(m => m.experiment_arm === arm);
    }

    return metrics.sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Export evidence data for statistical analysis
   */
  async exportEvidenceData(
    startDate: string,
    endDate: string,
    tenantId?: string
  ): Promise<VerifyEvidenceLog[]> {
    // In a real implementation, this would query the storage backend
    // For now, return a sample structure
    return [];
  }
}

/**
 * Global evidence pipeline instance
 */
export const evidencePipeline = new Phase40EvidencePipeline();

/**
 * Register Phase 40 evidence endpoints
 */
export async function registerEvidenceRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Evidence metrics endpoint
  fastify.get('/phase40/evidence/metrics', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          arm: { type: 'string', enum: ['A_EMBED', 'B_REMOTE'] },
          start_date: { type: 'string', format: 'date' },
          end_date: { type: 'string', format: 'date' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenant_id, arm, start_date, end_date } = request.query as any;
    
    const metrics = evidencePipeline.getSurvivalMetrics(tenant_id, arm);
    
    // Filter by date range if provided
    const filteredMetrics = metrics.filter(m => {
      if (start_date && m.date < start_date) return false;
      if (end_date && m.date > end_date) return false;
      return true;
    });

    return {
      success: true,
      data: {
        metrics: filteredMetrics,
        summary: {
          total_tenants: new Set(filteredMetrics.map(m => m.tenant_id)).size,
          avg_survival_rate: filteredMetrics.reduce((sum, m) => sum + m.survival_rate, 0) / Math.max(1, filteredMetrics.length),
          avg_latency_ms: filteredMetrics.reduce((sum, m) => sum + m.avg_latency_ms, 0) / Math.max(1, filteredMetrics.length)
        }
      },
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
  });

  // Evidence export endpoint
  fastify.get('/phase40/evidence/export', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          start_date: { type: 'string', format: 'date' },
          end_date: { type: 'string', format: 'date' },
          tenant_id: { type: 'string' },
          format: { type: 'string', enum: ['json', 'csv'], default: 'json' }
        }
      }
    }
  }, async (request, reply) => {
    const { start_date, end_date, tenant_id, format } = request.query as any;
    
    const evidenceData = await evidencePipeline.exportEvidenceData(
      start_date || new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      end_date || new Date().toISOString().split('T')[0],
      tenant_id
    );

    if (format === 'csv') {
      // Convert to CSV format
      const csv = convertToCSV(evidenceData);
      reply.header('Content-Type', 'text/csv');
      reply.header('Content-Disposition', `attachment; filename="phase40-evidence-${Date.now()}.csv"`);
      return csv;
    }

    return {
      success: true,
      data: {
        evidence_logs: evidenceData,
        export_metadata: {
          start_date,
          end_date,
          tenant_id,
          total_records: evidenceData.length,
          export_timestamp: new Date().toISOString()
        }
      },
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
  });
}

/**
 * Convert evidence logs to CSV format
 */
function convertToCSV(logs: VerifyEvidenceLog[]): string {
  const headers = [
    'request_id', 'tenant_id', 'experiment_arm', 'route_bucket', 'pathname',
    'asset_url', 'manifest_url', 'total_duration_ms', 'discovery_path',
    'verification_valid', 'signer_trusted', 'survival_outcome', 'cache_hit',
    'edge_timing_ms', 'timestamp'
  ];

  const csvRows = [headers.join(',')];

  for (const log of logs) {
    const row = [
      escapeCSVValue(log.request_id),
      escapeCSVValue(log.tenant_id),
      escapeCSVValue(log.experiment_arm),
      log.route_bucket,
      escapeCSVValue(log.pathname),
      escapeCSVValue(log.asset_url || ''),
      escapeCSVValue(log.manifest_url || ''),
      log.total_duration_ms,
      escapeCSVValue(log.discovery_path),
      log.verification_result.valid,
      log.verification_result.signer_trusted,
      escapeCSVValue(log.survival_outcome),
      log.cache_hit,
      log.edge_timing_ms,
      escapeCSVValue(log.timestamp)
    ];
    csvRows.push(row.join(','));
  }

  return csvRows.join('\n');
}

/**
 * Escape CSV values to handle commas and quotes
 */
function escapeCSVValue(value: string | number): string {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
