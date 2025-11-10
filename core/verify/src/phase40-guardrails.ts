/**
 * Phase 40 Guardrails and Auto-Failure Policies
 * Monitors experiment health and automatically triggers fallbacks when thresholds are breached
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface GuardrailThresholds {
  embed_survival_rate_min: number;        // 95% minimum embed survival
  remote_survival_rate_min: number;       // 99.9% minimum remote survival
  latency_p95_max_ms: number;             // Maximum P95 latency
  cost_per_1k_verifies_max: number;       // Maximum cost per 1k verifies
  error_rate_max: number;                 // Maximum error rate
  sample_size_min: number;                // Minimum sample size for decisions
  consecutive_failures_max: number;       // Max consecutive failures before auto-failure
}

interface AutoFailurePolicy {
  id: string;
  name: string;
  description: string;
  threshold_metric: string;
  threshold_value: number;
  comparison_operator: 'lt' | 'gt' | 'lte' | 'gte';
  action: 'warn' | 'force_remote' | 'pause_experiment' | 'emergency_stop';
  cooldown_minutes: number;
  enabled: boolean;
}

interface ExperimentHealth {
  tenant_id: string;
  timestamp: number;
  arm_a_health: {
    survival_rate: number;
    latency_p95_ms: number;
    cost_per_1k: number;
    error_rate: number;
    sample_size: number;
    status: 'healthy' | 'warning' | 'critical' | 'failed';
  };
  arm_b_health: {
    survival_rate: number;
    latency_p95_ms: number;
    cost_per_1k: number;
    error_rate: number;
    sample_size: number;
    status: 'healthy' | 'warning' | 'critical' | 'failed';
  };
  overall_status: 'healthy' | 'warning' | 'critical' | 'failed';
  active_guards: string[];
  auto_failures_triggered: string[];
  recommendations: string[];
}

interface GuardrailAction {
  policy_id: string;
  action_type: 'warn' | 'force_remote' | 'pause_experiment' | 'emergency_stop';
  tenant_id: string;
  triggered_at: number;
  metric_value: number;
  threshold_value: number;
  reason: string;
  expires_at?: number;
}

/**
 * Phase 40 Guardrails Service
 */
export class Phase40Guardrails {
  private thresholds: GuardrailThresholds;
  private policies: Map<string, AutoFailurePolicy> = new Map();
  private activeActions: Map<string, GuardrailAction> = new Map();
  private healthHistory: Map<string, ExperimentHealth[]> = new Map();
  private consecutiveFailures: Map<string, number> = new Map();

  constructor() {
    this.thresholds = {
      embed_survival_rate_min: 0.95,      // 95% minimum
      remote_survival_rate_min: 0.999,    // 99.9% minimum
      latency_p95_max_ms: 5000,           // 5 seconds max
      cost_per_1k_verifies_max: 0.50,     // $0.50 max
      error_rate_max: 0.05,               // 5% max error rate
      sample_size_min: 1000,              // 1000 minimum samples
      consecutive_failures_max: 3         // 3 consecutive failures
    };

    this.initializeDefaultPolicies();
  }

  /**
   * Initialize default auto-failure policies
   */
  private initializeDefaultPolicies(): void {
    // Embed survival rate policy
    this.registerPolicy({
      id: 'embed-survival-rate',
      name: 'Embed Survival Rate Guardrail',
      description: 'Triggers when embed survival rate falls below 95%',
      threshold_metric: 'embed_survival_rate',
      threshold_value: 0.95,
      comparison_operator: 'lt',
      action: 'force_remote',
      cooldown_minutes: 60,
      enabled: true
    });

    // Remote survival rate policy
    this.registerPolicy({
      id: 'remote-survival-rate',
      name: 'Remote Survival Rate Guardrail',
      description: 'Triggers when remote survival rate falls below 99.9%',
      threshold_metric: 'remote_survival_rate',
      threshold_value: 0.999,
      comparison_operator: 'lt',
      action: 'emergency_stop',
      cooldown_minutes: 30,
      enabled: true
    });

    // Latency policy
    this.registerPolicy({
      id: 'latency-p95',
      name: 'P95 Latency Guardrail',
      description: 'Triggers when P95 latency exceeds 5 seconds',
      threshold_metric: 'latency_p95_ms',
      threshold_value: 5000,
      comparison_operator: 'gt',
      action: 'warn',
      cooldown_minutes: 15,
      enabled: true
    });

    // Cost policy
    this.registerPolicy({
      id: 'cost-per-1k',
      name: 'Cost per 1k Verifies Guardrail',
      description: 'Triggers when cost exceeds $0.50 per 1k verifies',
      threshold_metric: 'cost_per_1k',
      threshold_value: 0.50,
      comparison_operator: 'gt',
      action: 'force_remote',
      cooldown_minutes: 120,
      enabled: true
    });

    // Error rate policy
    this.registerPolicy({
      id: 'error-rate',
      name: 'Error Rate Guardrail',
      description: 'Triggers when error rate exceeds 5%',
      threshold_metric: 'error_rate',
      threshold_value: 0.05,
      comparison_operator: 'gt',
      action: 'pause_experiment',
      cooldown_minutes: 45,
      enabled: true
    });

    // Sample size policy
    this.registerPolicy({
      id: 'sample-size',
      name: 'Sample Size Guardrail',
      description: 'Warns when sample size is insufficient for statistical significance',
      threshold_metric: 'sample_size',
      threshold_value: 1000,
      comparison_operator: 'lt',
      action: 'warn',
      cooldown_minutes: 0, // No cooldown for warnings
      enabled: true
    });
  }

  /**
   * Register a new guardrail policy
   */
  registerPolicy(policy: AutoFailurePolicy): void {
    this.policies.set(policy.id, policy);
  }

  /**
   * Enable/disable a policy
   */
  setPolicyEnabled(policyId: string, enabled: boolean): boolean {
    const policy = this.policies.get(policyId);
    if (!policy) {
      return false;
    }
    policy.enabled = enabled;
    return true;
  }

  /**
   * Evaluate experiment health and trigger guardrails if needed
   */
  async evaluateExperimentHealth(
    tenantId: string,
    metrics: {
      arm_a: {
        survival_rate: number;
        latency_p95_ms: number;
        cost_per_1k: number;
        error_rate: number;
        sample_size: number;
      };
      arm_b: {
        survival_rate: number;
        latency_p95_ms: number;
        cost_per_1k: number;
        error_rate: number;
        sample_size: number;
      };
    }
  ): Promise<ExperimentHealth> {
    
    const timestamp = Date.now();
    
    // Evaluate arm health
    const armAHealth = this.evaluateArmHealth(metrics.arm_a, 'A_EMBED');
    const armBHealth = this.evaluateArmHealth(metrics.arm_b, 'B_REMOTE');
    
    // Determine overall status
    const overallStatus = this.determineOverallStatus(armAHealth.status, armBHealth.status);
    
    // Check guardrail policies
    const triggeredActions = await this.checkGuardrailPolicies(tenantId, metrics);
    
    // Generate recommendations
    const recommendations = this.generateHealthRecommendations(armAHealth, armBHealth, triggeredActions);
    
    const health: ExperimentHealth = {
      tenant_id: tenantId,
      timestamp: timestamp,
      arm_a_health: armAHealth,
      arm_b_health: armBHealth,
      overall_status: overallStatus,
      active_guards: triggeredActions.map(a => a.policy_id),
      auto_failures_triggered: triggeredActions.filter(a => a.action_type !== 'warn').map(a => a.policy_id),
      recommendations: recommendations
    };

    // Store health history
    if (!this.healthHistory.has(tenantId)) {
      this.healthHistory.set(tenantId, []);
    }
    this.healthHistory.get(tenantId)!.push(health);
    
    // Keep only last 100 health records
    const history = this.healthHistory.get(tenantId)!;
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }

    // Update consecutive failures counter
    this.updateConsecutiveFailures(tenantId, overallStatus);

    return health;
  }

  /**
   * Evaluate individual arm health
   */
  private evaluateArmHealth(
    metrics: any,
    armType: 'A_EMBED' | 'B_REMOTE'
  ): ExperimentHealth['arm_a_health'] {
    let status: 'healthy' | 'warning' | 'critical' | 'failed' = 'healthy';
    const thresholds = armType === 'A_EMBED' ? 
      { survival: this.thresholds.embed_survival_rate_min } :
      { survival: this.thresholds.remote_survival_rate_min };

    // Check survival rate
    if (metrics.survival_rate < thresholds.survival * 0.9) {
      status = 'failed';
    } else if (metrics.survival_rate < thresholds.survival) {
      status = 'critical';
    }

    // Check latency
    if (metrics.latency_p95_ms > this.thresholds.latency_p95_max_ms * 1.5) {
      status = 'failed';
    } else if (metrics.latency_p95_ms > this.thresholds.latency_p95_max_ms) {
      status = status === 'failed' ? 'failed' : 'critical';
    } else if (metrics.latency_p95_ms > this.thresholds.latency_p95_max_ms * 0.8) {
      status = status === 'failed' || status === 'critical' ? status : 'warning';
    }

    // Check error rate
    if (metrics.error_rate > this.thresholds.error_rate_max * 2) {
      status = 'failed';
    } else if (metrics.error_rate > this.thresholds.error_rate_max) {
      status = status === 'failed' ? 'failed' : 'critical';
    }

    // Check cost
    if (metrics.cost_per_1k > this.thresholds.cost_per_1k_verifies_max * 2) {
      status = 'failed';
    } else if (metrics.cost_per_1k > this.thresholds.cost_per_1k_verifies_max) {
      status = status === 'failed' ? 'failed' : 'critical';
    }

    return {
      survival_rate: metrics.survival_rate,
      latency_p95_ms: metrics.latency_p95_ms,
      cost_per_1k: metrics.cost_per_1k,
      error_rate: metrics.error_rate,
      sample_size: metrics.sample_size,
      status: status
    };
  }

  /**
   * Determine overall experiment status
   */
  private determineOverallStatus(
    armAStatus: string,
    armBStatus: string
  ): 'healthy' | 'warning' | 'critical' | 'failed' {
    const statusPriority = {
      'failed': 4,
      'critical': 3,
      'warning': 2,
      'healthy': 1
    };

    const maxPriority = Math.max(
      statusPriority[armAStatus as keyof typeof statusPriority],
      statusPriority[armBStatus as keyof typeof statusPriority]
    );

    return Object.keys(statusPriority).find(key => 
      statusPriority[key as keyof typeof statusPriority] === maxPriority
    ) as 'healthy' | 'warning' | 'critical' | 'failed';
  }

  /**
   * Check all guardrail policies and trigger actions
   */
  private async checkGuardrailPolicies(
    tenantId: string,
    metrics: any
  ): Promise<GuardrailAction[]> {
    const triggeredActions: GuardrailAction[] = [];

    for (const policy of Array.from(this.policies.values())) {
      if (!policy.enabled) {
        continue;
      }

      // Check cooldown
      if (this.isPolicyInCooldown(tenantId, policy.id)) {
        continue;
      }

      // Get metric value based on policy
      const metricValue = this.getMetricValue(metrics, policy.threshold_metric);
      
      // Check if threshold is breached
      const thresholdBreached = this.evaluateThreshold(
        metricValue,
        policy.threshold_value,
        policy.comparison_operator
      );

      if (thresholdBreached) {
        const action: GuardrailAction = {
          policy_id: policy.id,
          action_type: policy.action,
          tenant_id: tenantId,
          triggered_at: Date.now(),
          metric_value: metricValue,
          threshold_value: policy.threshold_value,
          reason: this.generateActionReason(policy, metricValue),
          expires_at: policy.cooldown_minutes > 0 ? 
            Date.now() + (policy.cooldown_minutes * 60 * 1000) : undefined
        };

        triggeredActions.push(action);
        this.activeActions.set(`${tenantId}:${policy.id}`, action);

        // Execute the action
        await this.executeGuardrailAction(action);
      }
    }

    return triggeredActions;
  }

  /**
   * Get metric value for policy evaluation
   */
  private getMetricValue(metrics: any, metricName: string): number {
    switch (metricName) {
      case 'embed_survival_rate':
        return metrics.arm_a.survival_rate;
      case 'remote_survival_rate':
        return metrics.arm_b.survival_rate;
      case 'latency_p95_ms':
        return Math.max(metrics.arm_a.latency_p95_ms, metrics.arm_b.latency_p95_ms);
      case 'cost_per_1k':
        return Math.max(metrics.arm_a.cost_per_1k, metrics.arm_b.cost_per_1k);
      case 'error_rate':
        return Math.max(metrics.arm_a.error_rate, metrics.arm_b.error_rate);
      case 'sample_size':
        return Math.min(metrics.arm_a.sample_size, metrics.arm_b.sample_size);
      default:
        return 0;
    }
  }

  /**
   * Evaluate if threshold is breached
   */
  private evaluateThreshold(
    value: number,
    threshold: number,
    operator: 'lt' | 'gt' | 'lte' | 'gte'
  ): boolean {
    switch (operator) {
      case 'lt': return value < threshold;
      case 'gt': return value > threshold;
      case 'lte': return value <= threshold;
      case 'gte': return value >= threshold;
      default: return false;
    }
  }

  /**
   * Check if policy is in cooldown period
   */
  private isPolicyInCooldown(tenantId: string, policyId: string): boolean {
    const actionKey = `${tenantId}:${policyId}`;
    const action = this.activeActions.get(actionKey);
    
    if (!action || !action.expires_at) {
      return false;
    }

    if (Date.now() > action.expires_at) {
      this.activeActions.delete(actionKey);
      return false;
    }

    return true;
  }

  /**
   * Generate action reason message
   */
  private generateActionReason(policy: AutoFailurePolicy, metricValue: number): string {
    const operatorText = {
      'lt': 'below',
      'gt': 'above',
      'lte': 'at or below',
      'gte': 'at or above'
    };

    return `${policy.name}: ${policy.threshold_metric} (${metricValue}) is ${operatorText[policy.comparison_operator]} threshold (${policy.threshold_value})`;
  }

  /**
   * Execute guardrail action
   */
  private async executeGuardrailAction(action: GuardrailAction): Promise<void> {
    console.log(`Executing guardrail action: ${action.action_type} for tenant ${action.tenant_id}`);
    
    switch (action.action_type) {
      case 'warn':
        // Send warning notification
        await this.sendWarningNotification(action);
        break;
      
      case 'force_remote':
        // Force remote-only mode for tenant
        await this.forceRemoteMode(action.tenant_id);
        break;
      
      case 'pause_experiment':
        // Pause experiment for tenant
        await this.pauseExperiment(action.tenant_id);
        break;
      
      case 'emergency_stop':
        // Emergency stop all experiments
        await this.emergencyStop(action.tenant_id);
        break;
    }
  }

  /**
   * Send warning notification
   */
  private async sendWarningNotification(action: GuardrailAction): Promise<void> {
    // In a real implementation, this would send notifications
    console.log(`WARNING: ${action.reason}`);
  }

  /**
   * Force remote-only mode
   */
  private async forceRemoteMode(tenantId: string): Promise<void> {
    // In a real implementation, this would update configuration
    console.log(`FORCING REMOTE MODE for tenant ${tenantId}`);
  }

  /**
   * Pause experiment
   */
  private async pauseExperiment(tenantId: string): Promise<void> {
    // In a real implementation, this would pause the experiment
    console.log(`PAUSING EXPERIMENT for tenant ${tenantId}`);
  }

  /**
   * Emergency stop
   */
  private async emergencyStop(tenantId: string): Promise<void> {
    // In a real implementation, this would emergency stop
    console.log(`EMERGENCY STOP for tenant ${tenantId}`);
  }

  /**
   * Update consecutive failures counter
   */
  private updateConsecutiveFailures(tenantId: string, status: string): void {
    const currentCount = this.consecutiveFailures.get(tenantId) || 0;
    
    if (status === 'failed') {
      this.consecutiveFailures.set(tenantId, currentCount + 1);
    } else {
      this.consecutiveFailures.set(tenantId, 0);
    }
  }

  /**
   * Generate health recommendations
   */
  private generateHealthRecommendations(
    armAHealth: any,
    armBHealth: any,
    triggeredActions: GuardrailAction[]
  ): string[] {
    const recommendations: string[] = [];

    // Survival rate recommendations
    if (armAHealth.survival_rate < this.thresholds.embed_survival_rate_min) {
      recommendations.push('Embed survival rate below threshold - consider remote-only deployment');
    }

    if (armBHealth.survival_rate < this.thresholds.remote_survival_rate_min) {
      recommendations.push('Remote survival rate below threshold - investigate verification pipeline');
    }

    // Latency recommendations
    if (armAHealth.latency_p95_ms > this.thresholds.latency_p95_max_ms) {
      recommendations.push('High latency detected on embed arm - optimize edge processing');
    }

    // Cost recommendations
    if (armAHealth.cost_per_1k > this.thresholds.cost_per_1k_verifies_max) {
      recommendations.push('High cost on embed arm - review resource utilization');
    }

    // Sample size recommendations
    if (armAHealth.sample_size < this.thresholds.sample_size_min) {
      recommendations.push('Insufficient sample size - extend experiment duration');
    }

    // Action-based recommendations
    for (const action of triggeredActions) {
      switch (action.action_type) {
        case 'force_remote':
          recommendations.push('Auto-fallback activated: switched to remote-only mode');
          break;
        case 'pause_experiment':
          recommendations.push('Experiment paused due to threshold violations');
          break;
        case 'emergency_stop':
          recommendations.push('EMERGENCY: All experiments stopped immediately');
          break;
      }
    }

    return recommendations;
  }

  /**
   * Get current guardrail status
   */
  getGuardrailStatus(tenantId?: string): {
    policies: AutoFailurePolicy[];
    active_actions: GuardrailAction[];
    health_summary: {
      total_tenants: number;
      healthy_count: number;
      warning_count: number;
      critical_count: number;
      failed_count: number;
    };
  } {
    const policies = Array.from(this.policies.values());
    let activeActions = Array.from(this.activeActions.values());

    if (tenantId) {
      activeActions = activeActions.filter(action => action.tenant_id === tenantId);
    }

    // Calculate health summary
    const healthSummary = {
      total_tenants: this.healthHistory.size,
      healthy_count: 0,
      warning_count: 0,
      critical_count: 0,
      failed_count: 0
    };

    for (const [tenantId, healthHistory] of Array.from(this.healthHistory.entries())) {
      if (healthHistory.length > 0) {
        const latestHealth = healthHistory[healthHistory.length - 1];
        healthSummary[`${latestHealth.overall_status}_count` as keyof typeof healthSummary]++;
      }
    }

    return {
      policies,
      active_actions: activeActions,
      health_summary: healthSummary
    };
  }

  /**
   * Get health history for tenant
   */
  getHealthHistory(tenantId: string, limit: number = 50): ExperimentHealth[] {
    const history = this.healthHistory.get(tenantId) || [];
    return history.slice(-limit);
  }

  /**
   * Manually trigger a guardrail action
   */
  async triggerManualAction(
    tenantId: string,
    policyId: string,
    reason: string
  ): Promise<boolean> {
    const policy = this.policies.get(policyId);
    if (!policy) {
      return false;
    }

    const action: GuardrailAction = {
      policy_id: policyId,
      action_type: policy.action,
      tenant_id: tenantId,
      triggered_at: Date.now(),
      metric_value: 0,
      threshold_value: policy.threshold_value,
      reason: `Manual trigger: ${reason}`,
      expires_at: Date.now() + (policy.cooldown_minutes * 60 * 1000)
    };

    this.activeActions.set(`${tenantId}:${policyId}`, action);
    await this.executeGuardrailAction(action);

    return true;
  }
}

/**
 * Global guardrails instance
 */
export const guardrails = new Phase40Guardrails();

/**
 * Register Phase 40 guardrails endpoints
 */
export async function registerGuardrailsRoutes(fastify: FastifyInstance): Promise<void> {
  
  // Health evaluation endpoint
  fastify.post('/phase40/guardrails/evaluate', {
    schema: {
      body: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          metrics: {
            type: 'object',
            properties: {
              arm_a: {
                type: 'object',
                properties: {
                  survival_rate: { type: 'number' },
                  latency_p95_ms: { type: 'number' },
                  cost_per_1k: { type: 'number' },
                  error_rate: { type: 'number' },
                  sample_size: { type: 'number' }
                }
              },
              arm_b: {
                type: 'object',
                properties: {
                  survival_rate: { type: 'number' },
                  latency_p95_ms: { type: 'number' },
                  cost_per_1k: { type: 'number' },
                  error_rate: { type: 'number' },
                  sample_size: { type: 'number' }
                }
              }
            }
          }
        },
        required: ['tenant_id', 'metrics']
      }
    }
  }, async (request, reply) => {
    const { tenant_id, metrics } = request.body as any;
    
    const health = await guardrails.evaluateExperimentHealth(tenant_id, metrics);
    
    return {
      success: true,
      data: health,
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
  });

  // Guardrail status endpoint
  fastify.get('/phase40/guardrails/status', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenant_id } = request.query as any;
    
    const status = guardrails.getGuardrailStatus(tenant_id);
    
    return {
      success: true,
      data: status,
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
  });

  // Health history endpoint
  fastify.get('/phase40/guardrails/history', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          limit: { type: 'number', minimum: 1, maximum: 100, default: 50 }
        },
        required: ['tenant_id']
      }
    }
  }, async (request, reply) => {
    const { tenant_id, limit } = request.query as any;
    
    const history = guardrails.getHealthHistory(tenant_id, limit);
    
    return {
      success: true,
      data: {
        health_history: history,
        summary: {
          total_records: history.length,
          latest_status: history.length > 0 ? history[history.length - 1].overall_status : 'unknown'
        }
      },
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
  });

  // Manual action trigger endpoint
  fastify.post('/phase40/guardrails/trigger', {
    schema: {
      body: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          policy_id: { type: 'string' },
          reason: { type: 'string' }
        },
        required: ['tenant_id', 'policy_id', 'reason']
      }
    }
  }, async (request, reply) => {
    const { tenant_id, policy_id, reason } = request.body as any;
    
    const success = await guardrails.triggerManualAction(tenant_id, policy_id, reason);
    
    if (!success) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'POLICY_NOT_FOUND',
          message: `Policy ${policy_id} not found`
        },
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString()
      });
    }

    return {
      success: true,
      data: {
        message: `Manual action triggered for policy ${policy_id}`,
        tenant_id: tenant_id,
        policy_id: policy_id,
        reason: reason
      },
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
  });

  // Policy management endpoint
  fastify.post('/phase40/guardrails/policies/toggle', {
    schema: {
      body: {
        type: 'object',
        properties: {
          policy_id: { type: 'string' },
          enabled: { type: 'boolean' }
        },
        required: ['policy_id', 'enabled']
      }
    }
  }, async (request, reply) => {
    const { policy_id, enabled } = request.body as any;
    
    const success = guardrails.setPolicyEnabled(policy_id, enabled);
    
    if (!success) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'POLICY_NOT_FOUND',
          message: `Policy ${policy_id} not found`
        },
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString()
      });
    }

    return {
      success: true,
      data: {
        policy_id: policy_id,
        enabled: enabled,
        message: `Policy ${policy_id} ${enabled ? 'enabled' : 'disabled'}`
      },
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
  });
}
