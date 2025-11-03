/**
 * Failover Controller with Precise Routing Logic
 * Handles provider selection, hedged requests, and flap dampening
 */

import { HealthMonitor } from '../health/health-monitor.js';
import { TSAProviderAdapter } from '../providers/provider-adapter.js';
import { TimeStampRequest, TimeStampResponse, PKIStatus } from '../types/rfc3161.js';

export interface FailoverConfig {
  hedgeDelayMs: number;
  maxConcurrentRequests: number;
  requestTimeoutMs: number;
  enableFlapDampening: boolean;
  failbackConsecutiveGreens: number;
}

export interface RequestResult {
  success: boolean;
  providerId: string;
  response?: TimeStampResponse;
  error?: string;
  latencyMs: number;
  wasHedged: boolean;
}

export class FailoverController {
  private activeRequests: Map<string, AbortController> = new Map();
  
  constructor(
    private healthMonitor: HealthMonitor,
    private adapters: Map<string, TSAProviderAdapter>,
    private config: FailoverConfig
  ) {}

  /**
   * Execute request with failover and hedging
   */
  async executeRequest(
    requestId: string,
    request: TimeStampRequest,
    preferredProviders: string[]
  ): Promise<RequestResult> {
    const routing = this.healthMonitor.getRoutingDecision(preferredProviders);
    
    if (!routing.primary) {
      return {
        success: false,
        providerId: 'none',
        error: `No healthy providers available: ${routing.reason}`,
        latencyMs: 0,
        wasHedged: false
      };
    }

    // Start primary request
    const primaryPromise = this.executeSingleRequest(requestId, request, routing.primary, false);
    
    // Start hedged requests after delay if configured
    const hedgedPromises: Promise<RequestResult>[] = [];
    
    if (routing.secondary.length > 0) {
      const hedgeTimer = setTimeout(() => {
        for (const providerId of routing.secondary.slice(0, 2)) { // Hedge up to 2 providers
          const hedgedPromise = this.executeSingleRequest(
            `${requestId}-hedge-${providerId}`, 
            request, 
            providerId, 
            true
          );
          hedgedPromises.push(hedgedPromise);
        }
      }, this.config.hedgeDelayMs);
      
      // Clean up hedge timer on completion
      primaryPromise.finally(() => clearTimeout(hedgeTimer));
    }

    try {
      // Wait for primary or first successful hedged request
      const result = await Promise.race([primaryPromise, ...hedgedPromises]);
      
      // Cancel remaining requests
      this.cancelRequest(requestId);
      
      return result;
      
    } catch (error) {
      // All requests failed
      this.cancelRequest(requestId);
      
      return {
        success: false,
        providerId: routing.primary,
        error: error instanceof Error ? error.message : 'All requests failed',
        latencyMs: 0,
        wasHedged: false
      };
    }
  }

  /**
   * Execute single request to specific provider
   */
  private async executeSingleRequest(
    requestId: string,
    request: TimeStampRequest,
    providerId: string,
    isHedged: boolean
  ): Promise<RequestResult> {
    const adapter = this.adapters.get(providerId);
    if (!adapter) {
      return {
        success: false,
        providerId,
        error: 'Provider adapter not found',
        latencyMs: 0,
        wasHedged: isHedged
      };
    }

    const startTime = Date.now();
    const abortController = new AbortController();
    this.activeRequests.set(requestId, abortController);

    try {
      // Add timeout to the request
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Request timeout')), this.config.requestTimeoutMs);
      });

      const providerPromise = adapter.sendRequest(request);
      
      // Race between provider response and timeout
      const providerResponse = await Promise.race([providerPromise, timeoutPromise]);
      
      const latencyMs = Date.now() - startTime;
      
      // Record health metrics
      this.healthMonitor.recordRequest(
        providerId,
        providerResponse.success,
        latencyMs,
        providerResponse.error ? this.classifyError(providerResponse.error) : undefined
      );

      return {
        success: providerResponse.success,
        providerId,
        response: providerResponse.response,
        error: providerResponse.error,
        latencyMs,
        wasHedged: isHedged
      };

    } catch (error) {
      const latencyMs = Date.now() - startTime;
      
      // Record failure
      this.healthMonitor.recordRequest(
        providerId,
        false,
        latencyMs,
        error instanceof Error ? this.classifyError(error.message) : 'unknownError'
      );

      return {
        success: false,
        providerId,
        error: error instanceof Error ? error.message : 'Request failed',
        latencyMs,
        wasHedged: isHedged
      };

    } finally {
      this.activeRequests.delete(requestId);
    }
  }

  /**
   * Cancel request and all its hedged variants
   */
  private cancelRequest(requestId: string): void {
    const controller = this.activeRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.activeRequests.delete(requestId);
    }

    // Cancel hedged requests
    for (const [key, controller] of this.activeRequests) {
      if (key.startsWith(requestId + '-hedge-')) {
        controller.abort();
        this.activeRequests.delete(key);
      }
    }
  }

  /**
   * Classify error type for health monitoring
   */
  private classifyError(error: string): string {
    if (error.includes('timeNotAvailable')) return 'timeNotAvailable';
    if (error.includes('systemFailure')) return 'systemFailure';
    if (error.includes('badAlg')) return 'badAlg';
    if (error.includes('Connection') || error.includes('ECONNREFUSED')) return 'connectionFailure';
    if (error.includes('timeout')) return 'timeout';
    if (error.includes('HTTP 4') || error.includes('HTTP 5')) return 'httpError';
    if (error.includes('Policy')) return 'policyError';
    if (error.includes('Nonce')) return 'nonceError';
    
    return 'unknownError';
  }

  /**
   * Get current failover status
   */
  getFailoverStatus(): {
    activeRequests: number;
    routingDecisions: Record<string, { primary: string | null; secondary: string[]; reason: string }>;
    providerHealth: Record<string, { status: string; p95Latency: number; successRate: number }>;
  } {
    const routingDecisions: Record<string, any> = {};
    const providerHealth: Record<string, any> = {};

    // Sample routing decision for common tenant configurations
    const commonConfigs = [
      ['digicert', 'globalsign', 'sectigo'],
      ['globalsign', 'digicert', 'sectigo'],
      ['sectigo', 'digicert', 'globalsign']
    ];

    for (let i = 0; i < commonConfigs.length; i++) {
      const config = commonConfigs[i];
      const routing = this.healthMonitor.getRoutingDecision(config);
      routingDecisions[`config-${i + 1}`] = routing;
    }

    // Get provider health summary
    for (const providerId of this.adapters.keys()) {
      const health = this.healthMonitor.getHealth(providerId);
      if (health) {
        providerHealth[providerId] = {
          status: health.status,
          p95Latency: health.p95LatencyMs,
          successRate: health.successRate
        };
      }
    }

    return {
      activeRequests: this.activeRequests.size,
      routingDecisions,
      providerHealth
    };
  }

  /**
   * Check if provider should be failed back
   */
  shouldFailback(providerId: string): boolean {
    if (!this.config.enableFlapDampening) {
      return this.healthMonitor.isHealthy(providerId);
    }

    const health = this.healthMonitor.getHealth(providerId);
    if (!health) return false;

    return health.consecutiveSuccesses >= this.config.failbackConsecutiveGreens &&
           health.status === 'green';
  }

  /**
   * Force failover to specific provider (for testing)
   */
  async forceFailover(providerId: string, request: TimeStampRequest): Promise<RequestResult> {
    return this.executeSingleRequest(`force-${Date.now()}`, request, providerId, false);
  }

  /**
   * Get failover statistics
   */
  getStatistics(): {
    totalRequests: number;
    hedgedRequests: number;
    failedOverRequests: number;
    averageFailoverTime: number;
    providerUtilization: Record<string, number>;
  } {
    // TODO: Implement statistics tracking
    // This would track failover events, timing, and provider usage
    
    return {
      totalRequests: 0,
      hedgedRequests: 0,
      failedOverRequests: 0,
      averageFailoverTime: 0,
      providerUtilization: {}
    };
  }

  /**
   * Cleanup resources
   */
  shutdown(): void {
    // Cancel all active requests
    for (const controller of this.activeRequests.values()) {
      controller.abort();
    }
    this.activeRequests.clear();
  }
}
