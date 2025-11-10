/**
 * Phase 40 Adversarial Edge Case Injection
 * Simulates theme churn and optimizer toggles to test experiment robustness
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

interface AdversarialScenario {
  id: string;
  name: string;
  description: string;
  type: 'theme_churn' | 'optimizer_toggle' | 'vendor_behavior_change';
  severity: 'low' | 'medium' | 'high';
  enabled: boolean;
  config: Record<string, any>;
}

interface ThemeChurnConfig {
  theme_name: string;
  thumbnail_regeneration: boolean;
  image_strip_meta_toggle: boolean;
  resize_quality_change: boolean;
  format_conversion: boolean;
  watermark_injection: boolean;
}

interface OptimizerToggleConfig {
  provider: 'cloudflare' | 'imgix' | 'fastly';
  preserve_credentials_enabled: boolean;
  compression_level: number;
  format_conversion: 'webp' | 'avif' | 'original';
  quality_override: number;
  strip_metadata: boolean;
}

interface VendorBehaviorConfig {
  vendor: 'wordpress' | 'cloudflare' | 'imgix' | 'fastly';
  behavior_change: string;
  previous_behavior: any;
  new_behavior: any;
  rollout_percentage: number;
}

interface EdgeCaseResult {
  scenario_id: string;
  tenant_id: string;
  experiment_arm: 'A_EMBED' | 'B_REMOTE';
  start_time: number;
  end_time: number;
  survival_before: {
    embed_survival_rate: number;
    remote_survival_rate: number;
  };
  survival_after: {
    embed_survival_rate: number;
    remote_survival_rate: number;
  };
  survival_delta: {
    embed_delta: number;
    remote_delta: number;
  };
  verdict: 'robust' | 'degraded' | 'failed';
  details: string[];
  recommendations: string[];
}

/**
 * Phase 40 Adversarial Edge Case Injector
 */
export class Phase40AdversarialInjector {
  private activeScenarios: Map<string, AdversarialScenario> = new Map();
  private scenarioResults: EdgeCaseResult[] = [];
  private tenantRoutes: Map<string, string[]> = new Map();

  constructor() {
    this.initializeDefaultScenarios();
  }

  /**
   * Initialize default adversarial scenarios
   */
  private initializeDefaultScenarios(): void {
    // WordPress theme churn scenarios
    this.registerScenario({
      id: 'wp-theme-aggressive-update',
      name: 'WordPress Aggressive Theme Update',
      description: 'Simulates aggressive theme update with thumbnail regeneration and metadata stripping',
      type: 'theme_churn',
      severity: 'high',
      enabled: false,
      config: {
        theme_name: 'AggressiveTheme 2.0',
        thumbnail_regeneration: true,
        image_strip_meta_toggle: true,
        resize_quality_change: true,
        format_conversion: true,
        watermark_injection: false
      } as ThemeChurnConfig
    });

    this.registerScenario({
      id: 'wp-theme-minimal-update',
      name: 'WordPress Minimal Theme Update',
      description: 'Simulates minor theme update with limited image processing',
      type: 'theme_churn',
      severity: 'low',
      enabled: false,
      config: {
        theme_name: 'MinimalTheme 1.1',
        thumbnail_regeneration: false,
        image_strip_meta_toggle: false,
        resize_quality_change: false,
        format_conversion: false,
        watermark_injection: false
      } as ThemeChurnConfig
    });

    // Cloudflare optimizer toggle scenarios
    this.registerScenario({
      id: 'cf-preserve-credentials-off',
      name: 'Cloudflare Preserve Credentials Disabled',
      description: 'Simulates Cloudflare disabling Preserve Content Credentials toggle',
      type: 'optimizer_toggle',
      severity: 'high',
      enabled: false,
      config: {
        provider: 'cloudflare',
        preserve_credentials_enabled: false,
        compression_level: 8,
        format_conversion: 'webp',
        quality_override: 85,
        strip_metadata: true
      } as OptimizerToggleConfig
    });

    this.registerScenario({
      id: 'cf-preserve-credentials-on',
      name: 'Cloudflare Preserve Credentials Enabled',
      description: 'Simulates Cloudflare enabling Preserve Content Credentials toggle',
      type: 'optimizer_toggle',
      severity: 'medium',
      enabled: false,
      config: {
        provider: 'cloudflare',
        preserve_credentials_enabled: true,
        compression_level: 6,
        format_conversion: 'original',
        quality_override: 90,
        strip_metadata: false
      } as OptimizerToggleConfig
    });

    // Imgix optimizer scenarios
    this.registerScenario({
      id: 'imgix-aggressive-compression',
      name: 'Imgix Aggressive Compression',
      description: 'Simulates Imgix applying aggressive compression and format conversion',
      type: 'optimizer_toggle',
      severity: 'high',
      enabled: false,
      config: {
        provider: 'imgix',
        preserve_credentials_enabled: false,
        compression_level: 10,
        format_conversion: 'avif',
        quality_override: 75,
        strip_metadata: true
      } as OptimizerToggleConfig
    });

    // Fastly IO scenarios
    this.registerScenario({
      id: 'fastly-default-stripping',
      name: 'Fastly IO Default Metadata Stripping',
      description: 'Simulates Fastly IO default behavior of stripping all metadata',
      type: 'optimizer_toggle',
      severity: 'high',
      enabled: false,
      config: {
        provider: 'fastly',
        preserve_credentials_enabled: false,
        compression_level: 7,
        format_conversion: 'webp',
        quality_override: 80,
        strip_metadata: true
      } as OptimizerToggleConfig
    });

    // Vendor behavior change scenarios
    this.registerScenario({
      id: 'vendor-wp-strip-meta-default',
      name: 'WordPress image_strip_meta Default Change',
      description: 'Simulates WordPress changing image_strip_meta default to true',
      type: 'vendor_behavior_change',
      severity: 'high',
      enabled: false,
      config: {
        vendor: 'wordpress',
        behavior_change: 'image_strip_meta_default',
        previous_behavior: { default: false },
        new_behavior: { default: true },
        rollout_percentage: 100
      } as VendorBehaviorConfig
    });
  }

  /**
   * Register a new adversarial scenario
   */
  registerScenario(scenario: AdversarialScenario): void {
    this.activeScenarios.set(scenario.id, scenario);
  }

  /**
   * Enable/disable a scenario for testing
   */
  setScenarioEnabled(scenarioId: string, enabled: boolean): boolean {
    const scenario = this.activeScenarios.get(scenarioId);
    if (!scenario) {
      return false;
    }
    scenario.enabled = enabled;
    return true;
  }

  /**
   * Execute an adversarial scenario against specific tenant routes
   */
  async executeScenario(
    scenarioId: string,
    tenantId: string,
    routes: string[],
    durationMinutes: number = 60
  ): Promise<EdgeCaseResult> {
    const scenario = this.activeScenarios.get(scenarioId);
    if (!scenario) {
      throw new Error(`Scenario ${scenarioId} not found`);
    }

    const startTime = Date.now();
    console.log(`Executing adversarial scenario ${scenarioId} for tenant ${tenantId}`);

    // Record baseline survival metrics before scenario
    const baselineSurvival = await this.measureBaselineSurvival(tenantId, routes);

    // Apply the adversarial changes
    await this.applyScenarioChanges(scenario, tenantId, routes);

    // Wait for the specified duration to collect metrics
    await this.waitForDuration(durationMinutes * 60 * 1000);

    // Measure survival during scenario
    const duringSurvival = await this.measureSurvivalDuringScenario(tenantId, routes);

    // Revert changes
    await this.revertScenarioChanges(scenario, tenantId, routes);

    const endTime = Date.now();

    // Calculate results
    const embedDelta = duringSurvival.embed_survival_rate - baselineSurvival.embed_survival_rate;
    const remoteDelta = duringSurvival.remote_survival_rate - baselineSurvival.remote_survival_rate;

    const verdict = this.determineVerdict(embedDelta, remoteDelta, scenario.severity);
    const details = this.generateScenarioDetails(scenario, embedDelta, remoteDelta);
    const recommendations = this.generateRecommendations(verdict, scenario, embedDelta, remoteDelta);

    const result: EdgeCaseResult = {
      scenario_id: scenarioId,
      tenant_id: tenantId,
      experiment_arm: 'A_EMBED', // Focus on embed arm for adversarial testing
      start_time: startTime,
      end_time: endTime,
      survival_before: baselineSurvival,
      survival_after: duringSurvival,
      survival_delta: {
        embed_delta: embedDelta,
        remote_delta: remoteDelta
      },
      verdict,
      details,
      recommendations
    };

    this.scenarioResults.push(result);
    console.log(`Scenario ${scenarioId} completed with verdict: ${verdict}`);

    return result;
  }

  /**
   * Measure baseline survival metrics
   */
  private async measureBaselineSurvival(tenantId: string, routes: string[]): Promise<{
    embed_survival_rate: number;
    remote_survival_rate: number;
  }> {
    // In a real implementation, this would query actual metrics
    // For demo, return simulated baseline values
    return {
      embed_survival_rate: 0.95, // 95% baseline embed survival
      remote_survival_rate: 0.999 // 99.9% baseline remote survival
    };
  }

  /**
   * Apply scenario-specific changes
   */
  private async applyScenarioChanges(scenario: AdversarialScenario, tenantId: string, routes: string[]): Promise<void> {
    console.log(`Applying changes for scenario ${scenario.id}`);

    switch (scenario.type) {
      case 'theme_churn':
        await this.applyThemeChurn(scenario.config as ThemeChurnConfig, tenantId, routes);
        break;
      case 'optimizer_toggle':
        await this.applyOptimizerToggle(scenario.config as OptimizerToggleConfig, tenantId, routes);
        break;
      case 'vendor_behavior_change':
        await this.applyVendorBehaviorChange(scenario.config as VendorBehaviorConfig, tenantId, routes);
        break;
    }
  }

  /**
   * Apply WordPress theme churn effects
   */
  private async applyThemeChurn(config: ThemeChurnConfig, tenantId: string, routes: string[]): Promise<void> {
    // Simulate theme update effects
    if (config.thumbnail_regeneration) {
      console.log('Simulating thumbnail regeneration...');
      // In real implementation, this would trigger thumbnail regeneration
    }

    if (config.image_strip_meta_toggle) {
      console.log('Simulating image_strip_meta filter activation...');
      // In real implementation, this would activate the strip meta filter
    }

    if (config.format_conversion) {
      console.log('Simulating format conversion to WebP...');
      // In real implementation, this would convert images to WebP
    }
  }

  /**
   * Apply optimizer toggle effects
   */
  private async applyOptimizerToggle(config: OptimizerToggleConfig, tenantId: string, routes: string[]): Promise<void> {
    console.log(`Applying ${config.provider} optimizer settings...`);

    switch (config.provider) {
      case 'cloudflare':
        console.log(`Cloudflare Preserve Credentials: ${config.preserve_credentials_enabled}`);
        console.log(`Compression level: ${config.compression_level}`);
        console.log(`Format conversion: ${config.format_conversion}`);
        break;
      case 'imgix':
        console.log(`Imgix quality override: ${config.quality_override}`);
        console.log(`Strip metadata: ${config.strip_metadata}`);
        break;
      case 'fastly':
        console.log(`Fastly IO strip metadata: ${config.strip_metadata}`);
        break;
    }
  }

  /**
   * Apply vendor behavior change effects
   */
  private async applyVendorBehaviorChange(config: VendorBehaviorConfig, tenantId: string, routes: string[]): Promise<void> {
    console.log(`Applying ${config.vendor} behavior change: ${config.behavior_change}`);
    
    switch (config.vendor) {
      case 'wordpress':
        console.log('WordPress image_strip_meta default changed to true');
        break;
    }
  }

  /**
   * Measure survival during scenario execution
   */
  private async measureSurvivalDuringScenario(tenantId: string, routes: string[]): Promise<{
    embed_survival_rate: number;
    remote_survival_rate: number;
  }> {
    // In a real implementation, this would measure actual survival during the scenario
    // For demo, simulate degraded survival based on active scenarios
    const activeScenarios = Array.from(this.activeScenarios.values()).filter(s => s.enabled);
    
    let embedSurvivalRate = 0.95;
    let remoteSurvivalRate = 0.999;

    // Apply survival degradation based on active scenarios
    for (const scenario of activeScenarios) {
      if (scenario.severity === 'high') {
        embedSurvivalRate -= 0.15; // High severity reduces embed survival by 15%
      } else if (scenario.severity === 'medium') {
        embedSurvivalRate -= 0.08; // Medium severity reduces embed survival by 8%
      } else {
        embedSurvivalRate -= 0.03; // Low severity reduces embed survival by 3%
      }
    }

    // Remote survival is more robust but still affected
    for (const scenario of activeScenarios) {
      if (scenario.severity === 'high') {
        remoteSurvivalRate -= 0.005; // High severity reduces remote survival by 0.5%
      }
    }

    return {
      embed_survival_rate: Math.max(0, embedSurvivalRate),
      remote_survival_rate: Math.max(0.99, remoteSurvivalRate)
    };
  }

  /**
   * Revert scenario changes
   */
  private async revertScenarioChanges(scenario: AdversarialScenario, tenantId: string, routes: string[]): Promise<void> {
    console.log(`Reverting changes for scenario ${scenario.id}`);
    // In a real implementation, this would revert all applied changes
  }

  /**
   * Wait for specified duration
   */
  private async waitForDuration(durationMs: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, Math.min(durationMs, 5000))); // Cap at 5 seconds for demo
  }

  /**
   * Determine verdict based on survival impact
   */
  private determineVerdict(embedDelta: number, remoteDelta: number, severity: string): 'robust' | 'degraded' | 'failed' {
    const embedImpact = Math.abs(embedDelta);
    const remoteImpact = Math.abs(remoteDelta);

    if (severity === 'high') {
      if (embedImpact > 0.10 || remoteImpact > 0.01) {
        return 'failed';
      } else if (embedImpact > 0.05 || remoteImpact > 0.005) {
        return 'degraded';
      }
    } else if (severity === 'medium') {
      if (embedImpact > 0.07 || remoteImpact > 0.008) {
        return 'failed';
      } else if (embedImpact > 0.03 || remoteImpact > 0.003) {
        return 'degraded';
      }
    } else {
      if (embedImpact > 0.05 || remoteImpact > 0.005) {
        return 'failed';
      } else if (embedImpact > 0.02 || remoteImpact > 0.002) {
        return 'degraded';
      }
    }

    return 'robust';
  }

  /**
   * Generate scenario details
   */
  private generateScenarioDetails(scenario: AdversarialScenario, embedDelta: number, remoteDelta: number): string[] {
    const details = [
      `Scenario: ${scenario.name}`,
      `Type: ${scenario.type}`,
      `Severity: ${scenario.severity}`,
      `Embed survival impact: ${(embedDelta * 100).toFixed(2)}%`,
      `Remote survival impact: ${(remoteDelta * 100).toFixed(2)}%`
    ];

    if (scenario.type === 'theme_churn') {
      details.push('Theme churn affected thumbnail generation and metadata preservation');
    } else if (scenario.type === 'optimizer_toggle') {
      details.push('Optimizer toggle affected compression and format conversion');
    }

    return details;
  }

  /**
   * Generate recommendations based on results
   */
  private generateRecommendations(verdict: string, scenario: AdversarialScenario, embedDelta: number, remoteDelta: number): string[] {
    const recommendations: string[] = [];

    if (verdict === 'failed') {
      recommendations.push('IMMEDIATE: Embed arm shows critical failure under this scenario');
      recommendations.push('ACTION: Force remote-only mode for affected routes');
      recommendations.push('REVIEW: Consider embed opt-in only for explicitly preserved paths');
    } else if (verdict === 'degraded') {
      recommendations.push('MONITOR: Embed arm shows degradation under this scenario');
      recommendations.push('CONSIDER: Implement auto-fallback thresholds');
      recommendations.push('TEST: Run longer duration tests to confirm impact');
    } else {
      recommendations.push('GOOD: Both arms remain robust under this scenario');
      recommendations.push('MONITOR: Continue observing for edge cases');
    }

    if (Math.abs(remoteDelta) > 0.001) {
      recommendations.push('INVESTIGATE: Remote arm shows unexpected impact');
    }

    return recommendations;
  }

  /**
   * Get all available scenarios
   */
  getScenarios(): AdversarialScenario[] {
    return Array.from(this.activeScenarios.values());
  }

  /**
   * Get scenario results
   */
  getScenarioResults(tenantId?: string, scenarioId?: string): EdgeCaseResult[] {
    let results = [...this.scenarioResults];

    if (tenantId) {
      results = results.filter(r => r.tenant_id === tenantId);
    }

    if (scenarioId) {
      results = results.filter(r => r.scenario_id === scenarioId);
    }

    return results.sort((a, b) => b.end_time - a.end_time);
  }

  /**
   * Get summary of all test results
   */
  getResultsSummary(): {
    total_scenarios: number;
    robust_count: number;
    degraded_count: number;
    failed_count: number;
    recommendations: string[];
  } {
    const results = this.scenarioResults;
    
    return {
      total_scenarios: results.length,
      robust_count: results.filter(r => r.verdict === 'robust').length,
      degraded_count: results.filter(r => r.verdict === 'degraded').length,
      failed_count: results.filter(r => r.verdict === 'failed').length,
      recommendations: this.generateOverallRecommendations(results)
    };
  }

  /**
   * Generate overall recommendations from all results
   */
  private generateOverallRecommendations(results: EdgeCaseResult[]): string[] {
    const recommendations: string[] = [];
    
    const failedScenarios = results.filter(r => r.verdict === 'failed');
    const degradedScenarios = results.filter(r => r.verdict === 'degraded');

    if (failedScenarios.length > 0) {
      recommendations.push(`${failedScenarios.length} scenarios caused embed arm failure`);
      recommendations.push('Remote-first approach recommended for production');
    }

    if (degradedScenarios.length > 0) {
      recommendations.push(`${degradedScenarios.length} scenarios caused embed arm degradation`);
      recommendations.push('Implement auto-fallback with 95% embed survival threshold');
    }

    if (results.length > 0 && failedScenarios.length === 0 && degradedScenarios.length === 0) {
      recommendations.push('All scenarios passed - embed arm is robust');
      recommendations.push('Consider embed for high-value, explicitly preserved content');
    }

    return recommendations;
  }
}

/**
 * Global adversarial injector instance
 */
export const adversarialInjector = new Phase40AdversarialInjector();

/**
 * Register Phase 40 adversarial injection endpoints
 */
export async function registerAdversarialRoutes(fastify: FastifyInstance): Promise<void> {
  
  // List scenarios endpoint
  fastify.get('/phase40/adversarial/scenarios', async (request, reply) => {
    return {
      success: true,
      data: {
        scenarios: adversarialInjector.getScenarios(),
        summary: adversarialInjector.getResultsSummary()
      },
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
  });

  // Execute scenario endpoint
  fastify.post('/phase40/adversarial/execute', {
    schema: {
      body: {
        type: 'object',
        properties: {
          scenario_id: { type: 'string' },
          tenant_id: { type: 'string' },
          routes: { type: 'array', items: { type: 'string' } },
          duration_minutes: { type: 'number', minimum: 1, maximum: 1440, default: 60 }
        },
        required: ['scenario_id', 'tenant_id', 'routes']
      }
    }
  }, async (request, reply) => {
    const { scenario_id, tenant_id, routes, duration_minutes } = request.body as any;
    
    try {
      const result = await adversarialInjector.executeScenario(
        scenario_id,
        tenant_id,
        routes,
        duration_minutes
      );

      return {
        success: true,
        data: result,
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return reply.status(400).send({
        success: false,
        error: {
          code: 'SCENARIO_EXECUTION_FAILED',
          message: error instanceof Error ? error.message : 'Unknown error'
        },
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString()
      });
    }
  });

  // Get results endpoint
  fastify.get('/phase40/adversarial/results', {
    schema: {
      querystring: {
        type: 'object',
        properties: {
          tenant_id: { type: 'string' },
          scenario_id: { type: 'string' }
        }
      }
    }
  }, async (request, reply) => {
    const { tenant_id, scenario_id } = request.query as any;
    
    const results = adversarialInjector.getScenarioResults(tenant_id, scenario_id);
    const summary = adversarialInjector.getResultsSummary();

    return {
      success: true,
      data: {
        results: results,
        summary: summary
      },
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
  });

  // Toggle scenario endpoint
  fastify.post('/phase40/adversarial/toggle', {
    schema: {
      body: {
        type: 'object',
        properties: {
          scenario_id: { type: 'string' },
          enabled: { type: 'boolean' }
        },
        required: ['scenario_id', 'enabled']
      }
    }
  }, async (request, reply) => {
    const { scenario_id, enabled } = request.body as any;
    
    const success = adversarialInjector.setScenarioEnabled(scenario_id, enabled);
    
    if (!success) {
      return reply.status(404).send({
        success: false,
        error: {
          code: 'SCENARIO_NOT_FOUND',
          message: `Scenario ${scenario_id} not found`
        },
        request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date().toISOString()
      });
    }

    return {
      success: true,
      data: {
        scenario_id,
        enabled: enabled,
        message: `Scenario ${scenario_id} ${enabled ? 'enabled' : 'disabled'}`
      },
      request_id: `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString()
    };
  });
}
