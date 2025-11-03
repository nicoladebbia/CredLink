/**
 * TSA Redundancy Service v1.1
 * Health-checked client with Durable Object queue and failover
 */

import { TimeStampRequest, TimeStampResponse, TenantTSAPolicy } from '../types/rfc3161.js';
import { TSA_PROVIDERS, getProviderById } from '../providers/provider-config.js';
import { createAdapter, TSAProviderAdapter } from '../providers/provider-adapter.js';
import { RFC3161Validator } from '../validator/rfc3161-validator.js';
import { TSAQueue, QueuedTSARequest } from '../queue/tsa-queue.js';

export interface TSASignRequest {
  imprint: Uint8Array;
  hashAlg: string;
  reqPolicy?: string;
  nonce?: bigint;
  tenant_id: string;
}

export interface TSASignResponse {
  success: boolean;
  tst?: Uint8Array;
  tsa_id?: string;
  policy_oid?: string;
  genTime?: Date;
  accuracy?: any;
  error?: string;
  retry_after?: number;
}

export interface ProviderHealth {
  providerId: string;
  healthy: boolean;
  lastCheck: Date;
  latencyMs: number;
  consecutiveFailures: number;
  lastError?: string;
}

export class TSAService {
  private adapters: Map<string, TSAProviderAdapter> = new Map();
  private validator: RFC3161Validator;
  private queue: TSAQueue;
  private healthStatus: Map<string, ProviderHealth> = new Map();
  
  // Configuration
  private readonly hedgeDelayMs = 300;
  private readonly healthProbeIntervalS = 10;
  private readonly failbackConsecutiveGreens = 3;
  
  // Health check timer
  private healthCheckTimer?: number;

  constructor() {
    this.validator = new RFC3161Validator();
    this.queue = new TSAQueue();
    
    // Initialize provider adapters
    this.initializeProviders();
    
    // Start health checks
    this.startHealthChecks();
  }

  /**
   * Main endpoint: /tsa/sign
   * Hot path with immediate routing and hedged requests
   */
  async sign(request: TSASignRequest): Promise<TSASignResponse> {
    try {
      // Get tenant policy
      const tenantPolicy = await this.getTenantPolicy(request.tenant_id);
      if (!tenantPolicy) {
        return {
          success: false,
          error: 'Unknown tenant or no TSA policy configured'
        };
      }

      // Determine routing priority
      const routing = this.determineRouting(tenantPolicy);
      
      // Try primary provider with hedging
      const result = await this.tryProvidersWithHedging(request, routing, tenantPolicy);
      
      if (result.success) {
        return result;
      }

      // All providers failed - enqueue for retry
      const queuedRequest: QueuedTSARequest = {
        id: this.generateRequestId(),
        tenant_id: request.tenant_id,
        imprint: request.imprint,
        hashAlg: request.hashAlg,
        reqPolicy: request.reqPolicy,
        nonce: request.nonce,
        timestamp: Date.now(),
        retryCount: 0,
        maxRetries: 3
      };

      const enqueueResult = await this.queue.enqueue(queuedRequest);
      
      if (enqueueResult.accepted) {
        return {
          success: false,
          error: 'All TSA providers unavailable, request queued',
          retry_after: 60 // 60 seconds
        };
      } else {
        return {
          success: false,
          error: `Queue unavailable: ${enqueueResult.reason}`
        };
      }

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Try providers with hedging and failover
   */
  private async tryProvidersWithHedging(
    request: TSASignRequest,
    routing: string[],
    tenantPolicy: TenantTSAPolicy
  ): Promise<TSASignResponse> {
    const timestampRequest: TimeStampRequest = {
      hashAlgorithm: request.hashAlg,
      messageImprint: request.imprint,
      reqPolicy: request.reqPolicy,
      nonce: request.nonce,
      certReq: true
    };

    const promises: Promise<TSASignResponse>[] = [];
    let primaryAttempted = false;

    for (const providerId of routing) {
      const adapter = this.adapters.get(providerId);
      const health = this.healthStatus.get(providerId);
      
      if (!adapter || !health?.healthy) {
        continue; // Skip unhealthy providers
      }

      const attempt = this.attemptProvider(adapter, timestampRequest, tenantPolicy);
      
      if (!primaryAttempted) {
        // Primary request - wait for it
        primaryAttempted = true;
        const result = await attempt;
        
        if (result.success) {
          return result;
        }
        
        // Primary failed, start hedged requests to remaining providers
        continue;
      }

      // Hedged request - don't wait, start in background
      promises.push(attempt);
    }

    // Wait for any hedged requests to complete
    if (promises.length > 0) {
      try {
        const result = await Promise.race(promises);
        if (result.success) {
          return result;
        }
      } catch {
        // Ignore hedged request failures
      }
    }

    return {
      success: false,
      error: 'All providers failed'
    };
  }

  /**
   * Attempt to get timestamp from specific provider
   */
  private async attemptProvider(
    adapter: TSAProviderAdapter,
    request: TimeStampRequest,
    tenantPolicy: TenantTSAPolicy
  ): Promise<TSASignResponse> {
    try {
      const providerResponse = await adapter.sendRequest(request);
      
      if (!providerResponse.success || !providerResponse.response) {
        return {
          success: false,
          error: providerResponse.error || 'Provider returned failure'
        };
      }

      // Verify the response token
      const verificationResult = await this.validator.validateToken(
        providerResponse.response.timeStampToken!,
        {
          hashAlgorithm: {
            algorithm: request.hashAlgorithm,
            parameters: null
          },
          hashedMessage: request.messageImprint
        },
        request.nonce,
        tenantPolicy.acceptedTrustAnchors
      );

      if (!verificationResult.valid) {
        return {
          success: false,
          error: verificationResult.reason || 'Token validation failed'
        };
      }

      return {
        success: true,
        tst: new Uint8Array(), // TODO: Encode actual token
        tsa_id: adapter.getId(),
        policy_oid: verificationResult.policy,
        genTime: verificationResult.genTime,
        accuracy: verificationResult.accuracy
      };

    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Provider attempt failed'
      };
    }
  }

  /**
   * Determine routing order based on tenant policy and health
   */
  private determineRouting(tenantPolicy: TenantTSAPolicy): string[] {
    const routing: string[] = [];
    
    for (const providerId of tenantPolicy.routing_priority) {
      const health = this.healthStatus.get(providerId);
      if (health?.healthy) {
        routing.push(providerId);
      }
    }
    
    return routing;
  }

  /**
   * Initialize provider adapters
   */
  private initializeProviders(): void {
    for (const provider of Object.values(TSA_PROVIDERS)) {
      try {
        const adapter = createAdapter(provider);
        this.adapters.set(provider.id, adapter);
        
        // Initialize health status
        this.healthStatus.set(provider.id, {
          providerId: provider.id,
          healthy: false, // Will be determined by first health check
          lastCheck: new Date(),
          latencyMs: 0,
          consecutiveFailures: 0
        });
      } catch (error) {
        console.error(`Failed to initialize adapter for ${provider.id}:`, error);
      }
    }
  }

  /**
   * Start periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthChecks();
    }, this.healthProbeIntervalS * 1000) as unknown as number;
  }

  /**
   * Perform health checks on all providers
   */
  private async performHealthChecks(): Promise<void> {
    const promises: Promise<void>[] = [];
    
    for (const [providerId, adapter] of this.adapters) {
      promises.push(this.checkProviderHealth(providerId, adapter));
    }
    
    await Promise.all(promises);
  }

  /**
   * Check health of specific provider
   */
  private async checkProviderHealth(providerId: string, adapter: TSAProviderAdapter): Promise<void> {
    try {
      const healthResult = await adapter.healthCheck();
      const currentHealth = this.healthStatus.get(providerId)!;
      
      currentHealth.lastCheck = new Date();
      currentHealth.latencyMs = healthResult.latencyMs;
      
      if (healthResult.healthy) {
        currentHealth.consecutiveFailures = 0;
        currentHealth.lastError = undefined;
        
        // Mark as healthy after consecutive greens
        if (!currentHealth.healthy && currentHealth.consecutiveFailures === 0) {
          currentHealth.healthy = true;
        }
      } else {
        currentHealth.consecutiveFailures++;
        currentHealth.lastError = healthResult.error;
        currentHealth.healthy = false;
      }
      
    } catch (error) {
      const currentHealth = this.healthStatus.get(providerId)!;
      currentHealth.consecutiveFailures++;
      currentHealth.lastError = error instanceof Error ? error.message : 'Health check failed';
      currentHealth.healthy = false;
      currentHealth.lastCheck = new Date();
    }
  }

  /**
   * Process queued requests
   */
  async processQueue(): Promise<void> {
    const requests = await this.queue.drain(50);
    
    for (const request of requests) {
      try {
        const signRequest: TSASignRequest = {
          imprint: request.imprint,
          hashAlg: request.hashAlg,
          reqPolicy: request.reqPolicy,
          nonce: request.nonce,
          tenant_id: request.tenant_id
        };
        
        const result = await this.sign(signRequest);
        
        if (result.success) {
          await this.queue.complete(request.id);
        } else {
          await this.queue.fail(request.id, true);
        }
      } catch (error) {
        await this.queue.fail(request.id, true);
      }
    }
  }

  /**
   * Get service status
   */
  getStatus(): {
    providers: Record<string, ProviderHealth>;
    queue: any;
    uptime: number;
  } {
    const providers: Record<string, ProviderHealth> = {};
    
    for (const [providerId, health] of this.healthStatus) {
      providers[providerId] = { ...health };
    }
    
    return {
      providers,
      queue: this.queue.getStats(),
      uptime: process.uptime()
    };
  }

  /**
   * Generate unique request ID
   */
  private generateRequestId(): string {
    return `tsa-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get tenant policy (placeholder - would load from config/database)
   */
  private async getTenantPolicy(tenant_id: string): Promise<TenantTSAPolicy | null> {
    // TODO: Implement tenant policy loading
    // For now, return default policy
    return {
      tenant_id,
      accepted_trust_anchors: [
        {
          name: 'DigiCert TSA Root',
          pem: '-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----',
          ekuRequired: '1.3.6.1.5.5.7.3.8'
        }
      ],
      accepted_policy_oids: ['2.16.840.1.114412.7.1'],
      routing_priority: ['digicert', 'globalsign', 'sectigo'],
      sla: {
        p95_latency_ms: 900,
        monthly_error_budget_pct: 1.0
      }
    };
  }

  /**
   * Cleanup resources
   */
  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }
  }
}
