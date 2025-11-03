// Phase 21.6 Observability, Consistency Sweeps & Status Page Integration
// Real-time monitoring with incident detection and automated status updates

export interface ObservabilityConfig {
  consistency_check_interval_seconds: number;
  metrics_collection_interval_seconds: number;
  alert_thresholds: {
    replication_lag_minutes: number;
    consistency_mismatch_percentage: number;
    error_rate_percentage: number;
    latency_p95_ms: number;
  };
  status_page_webhook?: string;
  monitoring_system_webhook?: string;
}

export interface SystemMetrics {
  timestamp: string;
  region: string;
  services: {
    api_gateway: ServiceMetrics;
    sign_service: ServiceMetrics;
    verify_service: ServiceMetrics;
    edge_relay: ServiceMetrics;
  };
  storage: {
    primary_bucket: StorageMetrics;
    secondary_bucket: StorageMetrics;
    replication_lag_seconds: number;
    replication_queue_depth: number;
  };
  coordination: {
    leader_status: LeaderMetrics;
    active_jobs: JobMetrics[];
  };
}

export interface ServiceMetrics {
  healthy: boolean;
  latency_p50_ms: number;
  latency_p95_ms: number;
  latency_p99_ms: number;
  error_rate_percentage: number;
  requests_per_second: number;
  uptime_percentage: number;
}

export interface StorageMetrics {
  total_objects: number;
  total_size_bytes: number;
  read_latency_ms: number;
  write_latency_ms: number;
  error_rate_percentage: number;
}

export interface LeaderMetrics {
  is_leader: boolean;
  leader_id?: string;
  lease_expires_at?: string;
  last_heartbeat: string;
  consecutive_heartbeats: number;
}

export interface JobMetrics {
  job_id: string;
  job_type: string;
  status: string;
  last_run_at?: string;
  consecutive_failures: number;
  avg_duration_ms: number;
}

export interface ConsistencySweepResult {
  sweep_id: string;
  timestamp: string;
  sample_size: number;
  mismatched_count: number;
  mismatch_percentage: number;
  auto_repaired_count: number;
  duration_ms: number;
  threshold_exceeded: boolean;
  actions_taken: string[];
  mismatches: Array<{
    hash: string;
    primary_etag?: string;
    secondary_etag?: string;
    primary_size?: number;
    secondary_size?: number;
  }>;
}

export interface IncidentAlert {
  incident_id: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  type: 'replication_lag' | 'consistency_mismatch' | 'service_outage' | 'leader_failure';
  title: string;
  description: string;
  affected_services: string[];
  metrics_snapshot: any;
  timestamp: string;
  acknowledged: boolean;
  resolved: boolean;
  resolved_at?: string;
}

export class ObservabilityService {
  private metricsHistory: SystemMetrics[] = [];
  private consistencySweeps: ConsistencySweepResult[] = [];
  private activeIncidents: Map<string, IncidentAlert> = new Map();
  private sweepTimer: NodeJS.Timeout | null = null;
  private metricsTimer: NodeJS.Timeout | null = null;
  
  private readonly MAX_HISTORY_SIZE = 1000;
  private readonly MAX_SWEEPS_SIZE = 100;
  private readonly MAX_INCIDENT_ID_LENGTH = 100;
  private readonly MAX_USER_NAME_LENGTH = 50;
  private readonly MAX_SERVICE_NAME_LENGTH = 50;
  private readonly MAX_DESCRIPTION_LENGTH = 500;
  private readonly MAX_TITLE_LENGTH = 100;
  private readonly MAX_WEBHOOK_LENGTH = 500;
  private readonly VALID_SEVERITIES = ['low', 'medium', 'high', 'critical'];
  private readonly VALID_TYPES = ['replication_lag', 'consistency_mismatch', 'service_outage', 'leader_failure'];
  private readonly VALID_SERVICES = ['api_gateway', 'sign_service', 'verify_service', 'edge_relay'];
  private readonly ID_LENGTH = 16;

  constructor(
    private config: ObservabilityConfig,
    private replicationService: any,
    private consistencyChecker: any,
    private leaderElectionService: any,
    private backgroundJobService: any
  ) {
    this.validateConstructor();
    this.setupMetricsCollection();
    this.setupConsistencySweeps();
  }

  private validateConstructor(): void {
    if (!this.config) {
      throw new Error('Configuration is required');
    }
    
    if (!Number.isInteger(this.config.consistency_check_interval_seconds) || 
        this.config.consistency_check_interval_seconds < 10 || 
        this.config.consistency_check_interval_seconds > 3600) {
      throw new Error('Invalid consistency check interval');
    }
    
    if (!Number.isInteger(this.config.metrics_collection_interval_seconds) || 
        this.config.metrics_collection_interval_seconds < 10 || 
        this.config.metrics_collection_interval_seconds > 3600) {
      throw new Error('Invalid metrics collection interval');
    }
    
    if (this.config.status_page_webhook && 
        (this.config.status_page_webhook.length > this.MAX_WEBHOOK_LENGTH || 
         !this.isValidWebhookUrl(this.config.status_page_webhook))) {
      throw new Error('Invalid status page webhook URL');
    }
    
    if (this.config.monitoring_system_webhook && 
        (this.config.monitoring_system_webhook.length > this.MAX_WEBHOOK_LENGTH || 
         !this.isValidWebhookUrl(this.config.monitoring_system_webhook))) {
      throw new Error('Invalid monitoring system webhook URL');
    }
  }

  private isValidWebhookUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return ['http:', 'https:'].includes(parsed.protocol);
    } catch {
      return false;
    }
  }

  private sanitizeError(error: string): string {
    if (!error) return 'Unknown error';
    return error.substring(0, this.MAX_DESCRIPTION_LENGTH).replace(/[<>\"']/g, '');
  }

  private sanitizeInput(input: string, maxLength: number): string {
    if (!input) return '';
    return input.substring(0, maxLength).replace(/[<>\"']/g, '');
  }

  private validateIncidentId(incidentId: string): boolean {
    return !!incidentId && 
           incidentId.length > 0 && 
           incidentId.length <= this.MAX_INCIDENT_ID_LENGTH &&
           /^[a-zA-Z0-9_-]+$/.test(incidentId);
  }

  private validateUserName(userName: string): boolean {
    return !!userName && 
           userName.length > 0 && 
           userName.length <= this.MAX_USER_NAME_LENGTH &&
           /^[a-zA-Z0-9\s._-]+$/.test(userName);
  }

  private validateServiceName(serviceName: string): boolean {
    return this.VALID_SERVICES.includes(serviceName);
  }

  private generateSecureId(prefix: string): string {
    const timestamp = Date.now();
    const randomBytes = new Uint8Array(this.ID_LENGTH);
    crypto.getRandomValues(randomBytes);
    const random = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${prefix}_${timestamp}_${random}`;
  }

  /**
   * Start observability monitoring
   */
  async start(): Promise<void> {
    console.log('Starting observability service...');

    // Start metrics collection
    this.startMetricsCollection();

    // Start consistency sweeps
    this.startConsistencySweeps();

    console.log('Observability service started');
  }

  /**
   * Stop observability monitoring
   */
  async stop(): Promise<void> {
    console.log('Stopping observability service...');

    // Stop timers
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }

    if (this.metricsTimer) {
      clearInterval(this.metricsTimer);
      this.metricsTimer = null;
    }

    console.log('Observability service stopped');
  }

  /**
   * Get current system metrics
   */
  async getCurrentMetrics(): Promise<SystemMetrics> {
    const timestamp = new Date().toISOString();
    const region = 'enam'; // Would be determined from environment

    const services = await this.collectServiceMetrics();
    const storage = await this.collectStorageMetrics();
    const coordination = await this.collectCoordinationMetrics();

    const metrics: SystemMetrics = {
      timestamp,
      region,
      services,
      storage,
      coordination
    };

    // Store in history
    this.metricsHistory.push(metrics);
    if (this.metricsHistory.length > 1000) {
      this.metricsHistory.splice(0, this.metricsHistory.length - 1000);
    }

    // Check for alerts
    await this.checkAlerts(metrics);

    return metrics;
  }

  /**
   * Run consistency sweep
   */
  async runConsistencySweep(): Promise<ConsistencySweepResult> {
    const sweepId = this.generateSecureId('sweep');
    const startTime = Date.now();

    console.log(`Starting consistency sweep ${sweepId}`);

    try {
      // Run consistency check and auto-repair
      const result = await this.consistencyChecker.runConsistencyCheckAndRepair(1000);

      const sweepResult: ConsistencySweepResult = {
        sweep_id: sweepId,
        timestamp: new Date().toISOString(),
        sample_size: result.result.sample_count,
        mismatched_count: result.result.mismatched_count,
        mismatch_percentage: result.result.mismatch_percentage,
        auto_repaired_count: result.actions_taken.filter((action: string) => action.includes('repaired')).length,
        duration_ms: Date.now() - startTime,
        threshold_exceeded: result.threshold_exceeded,
        actions_taken: result.actions_taken,
        mismatches: result.result.mismatches
      };

      // Store sweep result with size limit
      this.consistencySweeps.push(sweepResult);
      if (this.consistencySweeps.length > this.MAX_SWEEPS_SIZE) {
        this.consistencySweeps.splice(0, this.consistencySweeps.length - this.MAX_SWEEPS_SIZE);
      }

      // Check for consistency alerts
      if (sweepResult.threshold_exceeded) {
        await this.createConsistencyAlert(sweepResult);
      }

      console.log(`Consistency sweep ${sweepId} completed`, {
        sample_size: sweepResult.sample_size,
        mismatch_percentage: sweepResult.mismatch_percentage,
        auto_repaired_count: sweepResult.auto_repaired_count,
        duration_ms: sweepResult.duration_ms
      });

      return sweepResult;

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      console.error(`Consistency sweep ${sweepId} failed:`, errorMsg);

      const failedResult: ConsistencySweepResult = {
        sweep_id: sweepId,
        timestamp: new Date().toISOString(),
        sample_size: 0,
        mismatched_count: 0,
        mismatch_percentage: 100,
        auto_repaired_count: 0,
        duration_ms: Date.now() - startTime,
        threshold_exceeded: true,
        actions_taken: [`Sweep failed: ${errorMsg}`],
        mismatches: []
      };

      // Create incident for sweep failure
      await this.createIncident({
        severity: 'high',
        type: 'consistency_mismatch',
        title: 'Consistency Sweep Failed',
        description: `Consistency sweep failed with error: ${errorMsg}`,
        affected_services: ['consistency_checker'],
        metrics_snapshot: failedResult,
        acknowledged: false,
        resolved: false
      });

      return failedResult;
    }
  }

  /**
   * Get observability dashboard data
   */
  getDashboardData(): {
    current_metrics: SystemMetrics | null;
    recent_sweeps: ConsistencySweepResult[];
    active_incidents: IncidentAlert[];
    metrics_history: SystemMetrics[];
    summary: {
      overall_health: 'healthy' | 'degraded' | 'critical';
      replication_lag_minutes: number;
      consistency_percentage: number;
      uptime_percentage: number;
      active_incidents_count: number;
    };
  } {
    const currentMetrics = this.metricsHistory.length > 0 ? 
      this.metricsHistory[this.metricsHistory.length - 1] : null;
    
    const recentSweeps = this.consistencySweeps.slice(-10);
    const activeIncidents = Array.from(this.activeIncidents.values());
    const metricsHistory = this.metricsHistory.slice(-100);

    // Calculate summary
    const summary = this.calculateSummary(currentMetrics, recentSweeps, activeIncidents);

    return {
      current_metrics: currentMetrics,
      recent_sweeps: recentSweeps,
      active_incidents: activeIncidents,
      metrics_history: metricsHistory,
      summary
    };
  }

  /**
   * Acknowledge incident
   */
  async acknowledgeIncident(incidentId: string, acknowledgedBy: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Validate inputs
      if (!this.validateIncidentId(incidentId)) {
        return { success: false, error: 'Invalid incident ID' };
      }

      if (!this.validateUserName(acknowledgedBy)) {
        return { success: false, error: 'Invalid user name' };
      }

      const incident = this.activeIncidents.get(incidentId);
      if (!incident) {
        return { success: false, error: 'Incident not found' };
      }

      incident.acknowledged = true;
      console.log(`Incident ${incidentId} acknowledged by ${this.sanitizeInput(acknowledgedBy, this.MAX_USER_NAME_LENGTH)}`);

      // Update status page
      await this.updateStatusPageForIncident(incident);

      return { success: true };
    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      return { success: false, error: `Failed to acknowledge incident: ${errorMsg}` };
    }
  }

  /**
   * Resolve incident
   */
  async resolveIncident(incidentId: string, resolvedBy: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      // Validate inputs
      if (!this.validateIncidentId(incidentId)) {
        return { success: false, error: 'Invalid incident ID' };
      }

      if (!this.validateUserName(resolvedBy)) {
        return { success: false, error: 'Invalid user name' };
      }

      const incident = this.activeIncidents.get(incidentId);
      if (!incident) {
        return { success: false, error: 'Incident not found' };
      }

      incident.resolved = true;
      incident.resolved_at = new Date().toISOString();
      console.log(`Incident ${incidentId} resolved by ${this.sanitizeInput(resolvedBy, this.MAX_USER_NAME_LENGTH)}`);

      // Update status page
      await this.updateStatusPageForIncident(incident);

      // Remove from active incidents after a delay
      setTimeout(() => {
        this.activeIncidents.delete(incidentId);
      }, 60000); // Keep for 1 minute for visibility

      return { success: true };
    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      return { success: false, error: `Failed to resolve incident: ${errorMsg}` };
    }
  }

  // Private helper methods

  private setupMetricsCollection(): void {
    // Set up periodic metrics collection
    this.metricsTimer = setInterval(async () => {
      try {
        await this.getCurrentMetrics();
      } catch (error) {
        console.error('Metrics collection failed:', this.sanitizeError(error instanceof Error ? error.message : 'Unknown error'));
      }
    }, this.config.metrics_collection_interval_seconds * 1000);
  }

  private setupConsistencySweeps(): void {
    // Set up periodic consistency sweeps
    this.sweepTimer = setInterval(async () => {
      try {
        await this.runConsistencySweep();
      } catch (error) {
        console.error('Consistency sweep failed:', this.sanitizeError(error instanceof Error ? error.message : 'Unknown error'));
      }
    }, this.config.consistency_check_interval_seconds * 1000);
  }

  private startMetricsCollection(): void {
    // Initial metrics collection
    this.getCurrentMetrics().catch(error => {
      console.error('Initial metrics collection failed:', error);
    });
  }

  private startConsistencySweeps(): void {
    // Initial consistency sweep
    this.runConsistencySweep().catch(error => {
      console.error('Initial consistency sweep failed:', error);
    });
  }

  private async collectServiceMetrics(): Promise<SystemMetrics['services']> {
    // This would collect metrics from actual services
    // For now, return placeholder data
    return {
      api_gateway: {
        healthy: true,
        latency_p50_ms: 45,
        latency_p95_ms: 120,
        latency_p99_ms: 250,
        error_rate_percentage: 0.1,
        requests_per_second: 150,
        uptime_percentage: 99.9
      },
      sign_service: {
        healthy: true,
        latency_p50_ms: 85,
        latency_p95_ms: 200,
        latency_p99_ms: 350,
        error_rate_percentage: 0.2,
        requests_per_second: 25,
        uptime_percentage: 99.8
      },
      verify_service: {
        healthy: true,
        latency_p50_ms: 35,
        latency_p95_ms: 95,
        latency_p99_ms: 180,
        error_rate_percentage: 0.05,
        requests_per_second: 300,
        uptime_percentage: 99.95
      },
      edge_relay: {
        healthy: true,
        latency_p50_ms: 25,
        latency_p95_ms: 65,
        latency_p99_ms: 120,
        error_rate_percentage: 0.01,
        requests_per_second: 500,
        uptime_percentage: 99.99
      }
    };
  }

  private async collectStorageMetrics(): Promise<SystemMetrics['storage']> {
    // Get replication lag
    const replicationLag = await this.replicationService.getReplicationLag();
    
    // Placeholder storage metrics
    return {
      primary_bucket: {
        total_objects: 100000,
        total_size_bytes: 5000000000, // 5GB
        read_latency_ms: 15,
        write_latency_ms: 25,
        error_rate_percentage: 0.01
      },
      secondary_bucket: {
        total_objects: 99500, // Slightly behind due to replication lag
        total_size_bytes: 4975000000,
        read_latency_ms: 18,
        write_latency_ms: 30,
        error_rate_percentage: 0.02
      },
      replication_lag_seconds: replicationLag.pending_count > 0 ? 120 : 5,
      replication_queue_depth: replicationLag.pending_count
    };
  }

  private async collectCoordinationMetrics(): Promise<SystemMetrics['coordination']> {
    // Get leader status
    const leaderStatus = await this.leaderElectionService.getStatus();
    
    // Get job status
    const jobStatus = this.backgroundJobService.getJobStatus();
    
    const jobMetrics: JobMetrics[] = jobStatus.map((job: any) => ({
      job_id: job.job_id,
      job_type: job.job_type,
      status: job.status,
      last_run_at: job.last_run_at,
      consecutive_failures: job.consecutive_failures,
      avg_duration_ms: 5000 // Placeholder
    }));

    return {
      leader_status: {
        is_leader: leaderStatus.is_leader,
        leader_id: leaderStatus.instance_id,
        lease_expires_at: leaderStatus.lease?.expires_at,
        last_heartbeat: new Date().toISOString(),
        consecutive_heartbeats: 100
      },
      active_jobs: jobMetrics
    };
  }

  private async checkAlerts(metrics: SystemMetrics): Promise<void> {
    // Check replication lag
    if (metrics.storage.replication_lag_seconds > this.config.alert_thresholds.replication_lag_minutes * 60) {
      await this.createReplicationLagAlert(metrics);
    }

    // Check service health
    for (const [serviceName, serviceMetrics] of Object.entries(metrics.services)) {
      if (!this.validateServiceName(serviceName)) {
        console.warn(`Invalid service name in metrics: ${serviceName}`);
        continue;
      }

      if (!serviceMetrics.healthy) {
        await this.createServiceOutageAlert(serviceName, metrics);
      }

      if (serviceMetrics.error_rate_percentage > this.config.alert_thresholds.error_rate_percentage) {
        await this.createHighErrorRateAlert(serviceName, metrics);
      }

      if (serviceMetrics.latency_p95_ms > this.config.alert_thresholds.latency_p95_ms) {
        await this.createHighLatencyAlert(serviceName, metrics);
      }
    }

    // Check leader status
    if (!metrics.coordination.leader_status.is_leader) {
      await this.createLeaderFailureAlert(metrics);
    }
  }

  private async createIncident(alert: Omit<IncidentAlert, 'incident_id' | 'timestamp' | 'acknowledged' | 'resolved'>): Promise<void> {
    try {
      // Validate alert data
      if (!this.VALID_SEVERITIES.includes(alert.severity)) {
        throw new Error('Invalid severity');
      }

      if (!this.VALID_TYPES.includes(alert.type)) {
        throw new Error('Invalid incident type');
      }

      if (!alert.title || alert.title.length > this.MAX_TITLE_LENGTH) {
        throw new Error('Invalid title');
      }

      if (!alert.description || alert.description.length > this.MAX_DESCRIPTION_LENGTH) {
        throw new Error('Invalid description');
      }

      if (!Array.isArray(alert.affected_services) || alert.affected_services.length === 0) {
        throw new Error('Invalid affected services');
      }

      // Validate affected services
      for (const service of alert.affected_services) {
        if (!this.validateServiceName(service)) {
          throw new Error(`Invalid affected service: ${service}`);
        }
      }

      const incident: IncidentAlert = {
        ...alert,
        incident_id: this.generateSecureId('inc'),
        timestamp: new Date().toISOString(),
        acknowledged: false,
        resolved: false
      };

      this.activeIncidents.set(incident.incident_id, incident);

      console.log('Incident created:', {
        incident_id: incident.incident_id,
        severity: incident.severity,
        type: incident.type,
        title: this.sanitizeInput(incident.title, this.MAX_TITLE_LENGTH)
      });

      // Update status page
      await this.updateStatusPageForIncident(incident);

      // Send monitoring alert
      if (this.config.monitoring_system_webhook) {
        await this.sendMonitoringAlert(incident);
      }
    } catch (error) {
      console.error('Failed to create incident:', this.sanitizeError(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  private async createReplicationLagAlert(metrics: SystemMetrics): Promise<void> {
    await this.createIncident({
      severity: 'high',
      type: 'replication_lag',
      title: 'Replication Lag Exceeded Threshold',
      description: `Replication lag is ${Math.round(metrics.storage.replication_lag_seconds / 60)} minutes, exceeding threshold of ${this.config.alert_thresholds.replication_lag_minutes} minutes`,
      affected_services: ['replication_service'],
      metrics_snapshot: metrics
    });
  }

  private async createConsistencyAlert(sweepResult: ConsistencySweepResult): Promise<void> {
    await this.createIncident({
      severity: 'critical',
      type: 'consistency_mismatch',
      title: 'Consistency Mismatch Detected',
      description: `Consistency sweep found ${sweepResult.mismatch_percentage.toFixed(2)}% mismatches, exceeding threshold`,
      affected_services: ['storage', 'replication_service'],
      metrics_snapshot: sweepResult
    });
  }

  private async createServiceOutageAlert(serviceName: string, metrics: SystemMetrics): Promise<void> {
    if (!this.validateServiceName(serviceName)) {
      console.warn(`Invalid service name for outage alert: ${serviceName}`);
      return;
    }

    await this.createIncident({
      severity: 'critical',
      type: 'service_outage',
      title: `${serviceName} Service Outage`,
      description: `${serviceName} service is unhealthy and not responding`,
      affected_services: [serviceName],
      metrics_snapshot: metrics
    });
  }

  private async createHighErrorRateAlert(serviceName: string, metrics: SystemMetrics): Promise<void> {
    if (!this.validateServiceName(serviceName)) {
      console.warn(`Invalid service name for error rate alert: ${serviceName}`);
      return;
    }

    await this.createIncident({
      severity: 'medium',
      type: 'service_outage',
      title: `${serviceName} High Error Rate`,
      description: `${serviceName} error rate is ${metrics.services[serviceName as keyof typeof metrics.services].error_rate_percentage}%, exceeding threshold`,
      affected_services: [serviceName],
      metrics_snapshot: metrics
    });
  }

  private async createHighLatencyAlert(serviceName: string, metrics: SystemMetrics): Promise<void> {
    if (!this.validateServiceName(serviceName)) {
      console.warn(`Invalid service name for latency alert: ${serviceName}`);
      return;
    }

    await this.createIncident({
      severity: 'medium',
      type: 'service_outage',
      title: `${serviceName} High Latency`,
      description: `${serviceName} P95 latency is ${metrics.services[serviceName as keyof typeof metrics.services].latency_p95_ms}ms, exceeding threshold`,
      affected_services: [serviceName],
      metrics_snapshot: metrics
    });
  }

  private async createLeaderFailureAlert(metrics: SystemMetrics): Promise<void> {
    await this.createIncident({
      severity: 'high',
      type: 'leader_failure',
      title: 'Leader Election Failure',
      description: 'No leader elected for background job coordination',
      affected_services: ['leader_election', 'background_jobs'],
      metrics_snapshot: metrics
    });
  }

  private async updateStatusPageForIncident(incident: IncidentAlert): Promise<void> {
    if (!this.config.status_page_webhook) {
      return;
    }

    try {
      const statusUpdate = {
        incident_id: incident.incident_id,
        status: incident.resolved ? 'resolved' : 'active',
        severity: incident.severity,
        title: this.sanitizeInput(incident.title, this.MAX_TITLE_LENGTH),
        description: this.sanitizeInput(incident.description, this.MAX_DESCRIPTION_LENGTH),
        affected_services: incident.affected_services,
        timestamp: incident.timestamp,
        resolved_at: incident.resolved_at
      };

      // Send to status page webhook with timeout and validation
      const response = await fetch(this.config.status_page_webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(statusUpdate),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Status page webhook returned ${response.status}`);
      }

    } catch (error) {
      console.error('Failed to update status page:', this.sanitizeError(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  private async sendMonitoringAlert(incident: IncidentAlert): Promise<void> {
    if (!this.config.monitoring_system_webhook) {
      return;
    }

    try {
      // Sanitize incident data before sending
      const sanitizedIncident = {
        ...incident,
        title: this.sanitizeInput(incident.title, this.MAX_TITLE_LENGTH),
        description: this.sanitizeInput(incident.description, this.MAX_DESCRIPTION_LENGTH)
      };

      // Send to monitoring system webhook with timeout
      const response = await fetch(this.config.monitoring_system_webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sanitizedIncident),
        signal: AbortSignal.timeout(10000) // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Monitoring webhook returned ${response.status}`);
      }

    } catch (error) {
      console.error('Failed to send monitoring alert:', this.sanitizeError(error instanceof Error ? error.message : 'Unknown error'));
    }
  }

  private calculateSummary(
    currentMetrics: SystemMetrics | null,
    recentSweeps: ConsistencySweepResult[],
    activeIncidents: IncidentAlert[]
  ): {
    overall_health: 'healthy' | 'degraded' | 'critical';
    replication_lag_minutes: number;
    consistency_percentage: number;
    uptime_percentage: number;
    active_incidents_count: number;
  } {
    if (!currentMetrics) {
      return {
        overall_health: 'critical',
        replication_lag_minutes: 0,
        consistency_percentage: 0,
        uptime_percentage: 0,
        active_incidents_count: activeIncidents.length
      };
    }

    // Calculate overall health
    let overallHealth: 'healthy' | 'degraded' | 'critical' = 'healthy';
    
    if (activeIncidents.some(inc => inc.severity === 'critical')) {
      overallHealth = 'critical';
    } else if (activeIncidents.some(inc => inc.severity === 'high') || 
               currentMetrics.storage.replication_lag_seconds > 300) {
      overallHealth = 'degraded';
    }

    // Calculate consistency percentage
    const latestSweep = recentSweeps[recentSweeps.length - 1];
    const consistencyPercentage = latestSweep ? 100 - latestSweep.mismatch_percentage : 100;

    // Calculate uptime (average across services)
    const serviceUptimes = Object.values(currentMetrics.services).map(s => s.uptime_percentage);
    const uptimePercentage = serviceUptimes.reduce((sum, uptime) => sum + uptime, 0) / serviceUptimes.length;

    return {
      overall_health: overallHealth,
      replication_lag_minutes: Math.round(currentMetrics.storage.replication_lag_seconds / 60),
      consistency_percentage: Math.round(consistencyPercentage),
      uptime_percentage: Math.round(uptimePercentage),
      active_incidents_count: activeIncidents.length
    };
  }

  private generateIncidentId(): string {
    return this.generateSecureId('inc');
  }

  private generateSweepId(): string {
    return this.generateSecureId('sweep');
  }
}
