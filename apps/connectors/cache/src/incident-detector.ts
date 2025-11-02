/**
 * Phase 19: Edge Cache & 5xx Policy - Incident Detection and Logging
 * Detects provider 5xx spikes and logs incidents with severity assessment
 */

import { createHash } from 'crypto';
import {
  CacheConfig,
  IncidentRecord,
  ProviderMetrics,
  IncidentDetectionResult
} from './types.js';

export class IncidentDetector {
  private config: CacheConfig;
  private incidents: Map<string, IncidentRecord> = new Map();
  private metricsHistory: Map<string, ProviderMetrics[]> = new Map();
  private baselineMetrics: Map<string, ProviderMetrics> = new Map();

  constructor(config: CacheConfig) {
    this.config = config;
  }

  /**
   * Record provider metrics for incident detection
   */
  recordMetrics(metrics: ProviderMetrics): void {
    const provider = metrics.provider;
    
    // Store metrics history
    if (!this.metricsHistory.has(provider)) {
      this.metricsHistory.set(provider, []);
    }
    
    const history = this.metricsHistory.get(provider)!;
    history.push(metrics);
    
    // Keep only recent metrics (within window size)
    const cutoffTime = new Date(Date.now() - this.config.incident_detection.window_size_minutes * 60 * 1000);
    const recentMetrics = history.filter(m => new Date(m.window_end) > cutoffTime);
    this.metricsHistory.set(provider, recentMetrics);
    
    // Update baseline (last 24 hours if available)
    this.updateBaseline(provider, recentMetrics);
    
    // Check for incidents
    this.detectIncidents(provider, recentMetrics);
  }

  /**
   * Update baseline metrics for comparison
   */
  private updateBaseline(provider: string, recentMetrics: ProviderMetrics[]): void {
    if (recentMetrics.length < 2) return;
    
    // Calculate baseline from older metrics (exclude most recent)
    const baselineMetrics = recentMetrics.slice(0, -1);
    
    if (baselineMetrics.length === 0) return;
    
    const baseline: ProviderMetrics = {
      provider,
      window_start: baselineMetrics[0].window_start,
      window_end: baselineMetrics[baselineMetrics.length - 1].window_end,
      total_requests: baselineMetrics.reduce((sum, m) => sum + m.total_requests, 0),
      successful_requests: baselineMetrics.reduce((sum, m) => sum + m.successful_requests, 0),
      error_requests: baselineMetrics.reduce((sum, m) => sum + m.error_requests, 0),
      rate_limited_requests: baselineMetrics.reduce((sum, m) => sum + m.rate_limited_requests, 0),
      timeout_requests: baselineMetrics.reduce((sum, m) => sum + m.timeout_requests, 0),
      connection_errors: baselineMetrics.reduce((sum, m) => sum + m.connection_errors, 0),
      error_rate: baselineMetrics.reduce((sum, m) => sum + m.error_rate, 0) / baselineMetrics.length,
      average_response_time_ms: baselineMetrics.reduce((sum, m) => sum + m.average_response_time_ms, 0) / baselineMetrics.length,
      p95_response_time_ms: Math.max(...baselineMetrics.map(m => m.p95_response_time_ms)),
      status_code_distribution: this.mergeStatusDistributions(baselineMetrics),
      endpoint_metrics: this.mergeEndpointMetrics(baselineMetrics)
    };
    
    this.baselineMetrics.set(provider, baseline);
  }

  /**
   * Detect incidents based on current metrics
   */
  private detectIncidents(provider: string, recentMetrics: ProviderMetrics[]): void {
    if (recentMetrics.length === 0) return;
    
    const currentMetrics = recentMetrics[recentMetrics.length - 1];
    const baseline = this.baselineMetrics.get(provider);
    
    // Skip if we don't have enough data
    if (currentMetrics.total_requests < this.config.incident_detection.min_requests) {
      return;
    }
    
    const detection = this.analyzeForIncidents(currentMetrics, baseline);
    
    if (detection.incident_detected) {
      this.createOrUpdateIncident(provider, detection, currentMetrics);
    } else {
      // Check if we should resolve existing incidents
      this.resolveIncidentsIfRecovered(provider, currentMetrics);
    }
  }

  /**
   * Analyze metrics for incident conditions
   */
  private analyzeForIncidents(
    current: ProviderMetrics,
    baseline?: ProviderMetrics
  ): IncidentDetectionResult {
    const result: IncidentDetectionResult = {
      incident_detected: false,
      error_rate: current.error_rate,
      error_count: current.error_requests,
      total_requests: current.total_requests,
      threshold_exceeded: false,
      spike_detected: false,
      description: ''
    };

    // Check absolute error rate threshold
    if (current.error_rate >= this.config.incident_detection.error_rate_threshold) {
      result.incident_detected = true;
      result.threshold_exceeded = true;
      result.incident_type = '5xx_spike';
      result.severity = this.calculateSeverity(current.error_rate);
      result.description = `Error rate ${Math.round(current.error_rate * 100)}% exceeds threshold of ${Math.round(this.config.incident_detection.error_rate_threshold * 100)}%`;
    }

    // Check for spike over baseline
    if (baseline && current.error_rate > 0) {
      const errorRateIncrease = current.error_rate / Math.max(baseline.error_rate, 0.01);
      
      if (errorRateIncrease >= this.config.incident_detection.spike_multiplier) {
        result.incident_detected = true;
        result.spike_detected = true;
        result.incident_type = '5xx_spike';
        result.severity = this.calculateSeverity(current.error_rate, errorRateIncrease);
        result.description = `Error rate spike: ${Math.round(current.error_rate * 100)}% (${Math.round(errorRateIncrease)}x over baseline ${Math.round(baseline.error_rate * 100)}%)`;
      }
    }

    // Check for rate limit spikes
    const rateLimitRate = current.rate_limited_requests / Math.max(current.total_requests, 1);
    if (rateLimitRate >= 0.2) { // 20% rate limit rate
      result.incident_detected = true;
      result.incident_type = 'rate_limit_spike';
      result.severity = rateLimitRate >= 0.5 ? 'high' : 'medium';
      result.description = `High rate limit rate: ${Math.round(rateLimitRate * 100)}%`;
    }

    // Check for timeout spikes
    const timeoutRate = current.timeout_requests / Math.max(current.total_requests, 1);
    if (timeoutRate >= 0.1) { // 10% timeout rate
      result.incident_detected = true;
      result.incident_type = 'timeout_spike';
      result.severity = timeoutRate >= 0.3 ? 'high' : 'medium';
      result.description = `High timeout rate: ${Math.round(timeoutRate * 100)}%`;
    }

    // Check for connection errors
    const connectionErrorRate = current.connection_errors / Math.max(current.total_requests, 1);
    if (connectionErrorRate >= 0.05) { // 5% connection error rate
      result.incident_detected = true;
      result.incident_type = 'connection_error';
      result.severity = connectionErrorRate >= 0.15 ? 'high' : 'medium';
      result.description = `High connection error rate: ${Math.round(connectionErrorRate * 100)}%`;
    }

    return result;
  }

  /**
   * Calculate incident severity based on error rate and spike
   */
  private calculateSeverity(errorRate: number, spikeMultiplier?: number): 'low' | 'medium' | 'high' | 'critical' {
    if (errorRate >= 0.5) return 'critical';      // 50%+ errors
    if (errorRate >= 0.3) return 'high';         // 30%+ errors
    if (errorRate >= 0.15) return 'medium';      // 15%+ errors
    if (spikeMultiplier && spikeMultiplier >= 5) return 'high'; // 5x spike
    if (spikeMultiplier && spikeMultiplier >= 3) return 'medium'; // 3x spike
    return 'low';
  }

  /**
   * Create or update incident record
   */
  private createOrUpdateIncident(
    provider: string,
    detection: IncidentDetectionResult,
    metrics: ProviderMetrics
  ): void {
    const incidentId = this.generateIncidentId(provider, detection.incident_type!);
    const existingIncident = this.incidents.get(incidentId);

    if (existingIncident && !existingIncident.resolved_at) {
      // Update existing incident
      existingIncident.error_rate = Math.max(existingIncident.error_rate, detection.error_rate);
      existingIncident.error_count += detection.error_count;
      existingIncident.total_requests += detection.total_requests;
      existingIncident.severity = this.getHigherSeverity(existingIncident.severity, detection.severity!);
      existingIncident.description = detection.description;
    } else {
      // Create new incident
      const incident: IncidentRecord = {
        id: incidentId,
        provider,
        incident_type: detection.incident_type!,
        severity: detection.severity!,
        started_at: new Date().toISOString(),
        error_rate: detection.error_rate,
        error_count: detection.error_count,
        total_requests: detection.total_requests,
        affected_endpoints: Object.keys(metrics.endpoint_metrics),
        description: detection.description,
        metadata: {
          detection_timestamp: new Date().toISOString(),
          spike_multiplier: detection.spike_detected ? 
            detection.error_rate / Math.max(this.baselineMetrics.get(provider)?.error_rate || 0.01, 0.01) : undefined,
          threshold_exceeded: detection.threshold_exceeded,
          spike_detected: detection.spike_detected
        }
      };

      this.incidents.set(incidentId, incident);
      this.logIncident(incident);
    }
  }

  /**
   * Resolve incidents if provider has recovered
   */
  private resolveIncidentsIfRecovered(provider: string, currentMetrics: ProviderMetrics): void {
    const activeIncidents = Array.from(this.incidents.values())
      .filter(incident => incident.provider === provider && !incident.resolved_at);

    for (const incident of activeIncidents) {
      const isRecovered = this.checkRecovery(incident, currentMetrics);
      
      if (isRecovered) {
        incident.resolved_at = new Date().toISOString();
        incident.duration_minutes = Math.round(
          (new Date(incident.resolved_at).getTime() - new Date(incident.started_at).getTime()) / 60000
        );
        incident.resolution_notes = 'Provider error rate returned to normal levels';
        
        this.logIncidentResolution(incident);
      }
    }
  }

  /**
   * Check if provider has recovered from incident
   */
  private checkRecovery(incident: IncidentRecord, currentMetrics: ProviderMetrics): boolean {
    // Recovery criteria: error rate below threshold and stable for a period
    const recoveryThreshold = this.config.incident_detection.error_rate_threshold * 0.5; // 50% of threshold
    const recentHistory = this.metricsHistory.get(incident.provider) || [];
    
    // Check current metrics
    if (currentMetrics.error_rate > recoveryThreshold) {
      return false;
    }
    
    // Check last few data points for stability
    const recentPoints = recentHistory.slice(-3); // Last 3 data points
    if (recentPoints.length < 3) return false;
    
    const allBelowThreshold = recentPoints.every(m => m.error_rate <= recoveryThreshold);
    const stableErrorRate = Math.max(...recentPoints.map(m => m.error_rate)) - 
                           Math.min(...recentPoints.map(m => m.error_rate)) < 0.05; // Within 5%
    
    return allBelowThreshold && stableErrorRate;
  }

  /**
   * Generate incident ID
   */
  private generateIncidentId(provider: string, incidentType: string): string {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const data = `${provider}-${incidentType}-${timestamp}`;
    return createHash('sha256').update(data).digest('hex').substring(0, 16);
  }

  /**
   * Get higher severity between two severities
   */
  private getHigherSeverity(
    severity1: 'low' | 'medium' | 'high' | 'critical',
    severity2: 'low' | 'medium' | 'high' | 'critical'
  ): 'low' | 'medium' | 'high' | 'critical' {
    const severityOrder = { low: 1, medium: 2, high: 3, critical: 4 };
    return severityOrder[severity1] >= severityOrder[severity2] ? severity1 : severity2;
  }

  /**
   * Merge status code distributions
   */
  private mergeStatusDistributions(metrics: ProviderMetrics[]): Record<string, number> {
    const merged: Record<string, number> = {};
    
    for (const metric of metrics) {
      for (const [status, count] of Object.entries(metric.status_code_distribution)) {
        merged[status] = (merged[status] || 0) + count;
      }
    }
    
    return merged;
  }

  /**
   * Merge endpoint metrics
   */
  private mergeEndpointMetrics(metrics: ProviderMetrics[]): Record<string, any> {
    const merged: Record<string, any> = {};
    
    for (const metric of metrics) {
      for (const [endpoint, endpointMetric] of Object.entries(metric.endpoint_metrics)) {
        if (!merged[endpoint]) {
          merged[endpoint] = {
            requests: 0,
            errors: 0,
            error_rate: 0,
            avg_response_time_ms: 0
          };
        }
        
        merged[endpoint].requests += endpointMetric.requests;
        merged[endpoint].errors += endpointMetric.errors;
        merged[endpoint].avg_response_time_ms += endpointMetric.avg_response_time_ms;
      }
    }
    
    // Calculate averages
    for (const endpoint of Object.keys(merged)) {
      const endpointMetric = merged[endpoint];
      endpointMetric.error_rate = endpointMetric.errors / Math.max(endpointMetric.requests, 1);
      endpointMetric.avg_response_time_ms /= Object.keys(metrics).length;
    }
    
    return merged;
  }

  /**
   * Log incident creation/update
   */
  private logIncident(incident: IncidentRecord): void {
    console.error(`🚨 INCIDENT DETECTED: ${incident.provider} - ${incident.incident_type} (${incident.severity})`);
    console.error(`   Started: ${incident.started_at}`);
    console.error(`   Error Rate: ${Math.round(incident.error_rate * 100)}%`);
    console.error(`   Description: ${incident.description}`);
    console.error(`   Affected Endpoints: ${incident.affected_endpoints.join(', ')}`);
  }

  /**
   * Log incident resolution
   */
  private logIncidentResolution(incident: IncidentRecord): void {
    console.log(`✅ INCIDENT RESOLVED: ${incident.provider} - ${incident.incident_type}`);
    console.log(`   Duration: ${incident.duration_minutes} minutes`);
    console.log(`   Resolution: ${incident.resolution_notes}`);
  }

  /**
   * Get active incidents
   */
  getActiveIncidents(): IncidentRecord[] {
    return Array.from(this.incidents.values())
      .filter(incident => !incident.resolved_at)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  }

  /**
   * Get all incidents
   */
  getAllIncidents(): IncidentRecord[] {
    return Array.from(this.incidents.values())
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  }

  /**
   * Get incidents by provider
   */
  getIncidentsByProvider(provider: string): IncidentRecord[] {
    return Array.from(this.incidents.values())
      .filter(incident => incident.provider === provider)
      .sort((a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime());
  }

  /**
   * Get incident summary statistics
   */
  getIncidentSummary(): {
    total_incidents: number;
    active_incidents: number;
    resolved_incidents: number;
    by_severity: Record<string, number>;
    by_type: Record<string, number>;
    by_provider: Record<string, number>;
    average_duration_minutes: number;
    longest_incident_minutes: number;
  } {
    const incidents = Array.from(this.incidents.values());
    const activeIncidents = incidents.filter(i => !i.resolved_at);
    const resolvedIncidents = incidents.filter(i => i.resolved_at);

    const bySeverity: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byProvider: Record<string, number> = {};

    for (const incident of incidents) {
      bySeverity[incident.severity] = (bySeverity[incident.severity] || 0) + 1;
      byType[incident.incident_type] = (byType[incident.incident_type] || 0) + 1;
      byProvider[incident.provider] = (byProvider[incident.provider] || 0) + 1;
    }

    const durations = resolvedIncidents
      .filter(i => i.duration_minutes !== undefined)
      .map(i => i.duration_minutes!);

    const averageDuration = durations.length > 0 ? 
      durations.reduce((sum, d) => sum + d, 0) / durations.length : 0;
    const longestDuration = durations.length > 0 ? Math.max(...durations) : 0;

    return {
      total_incidents: incidents.length,
      active_incidents: activeIncidents.length,
      resolved_incidents: resolvedIncidents.length,
      by_severity: bySeverity,
      by_type: byType,
      by_provider: byProvider,
      average_duration_minutes: Math.round(averageDuration),
      longest_incident_minutes: longestDuration
    };
  }
}
