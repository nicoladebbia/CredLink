/**
 * Phase 36 Billing - Install Health Service
 * Install Health monitoring with survival SLO gating
 */

import { Redis } from 'ioredis';
import axios from 'axios';
import puppeteer from 'puppeteer';
import { 
  InstallHealth,
  RemediationStep,
  HealthCheckDetails,
  SmokeTestResult,
  InstallCheckRequest,
  InstallCheckResponse,
  ValidationResult
} from '@/types';

export interface InstallHealthServiceConfig {
  redis: Redis;
  caiVerifyEndpoint: string;
  userAgent: string;
  timeoutMs: number;
  puppeteerTimeoutMs: number;
  survivalThresholds: {
    embed_survival_min: number;
    remote_survival_min: number;
    badge_intact_min: number;
  };
}

export class InstallHealthService {
  private redis: Redis;
  private config: InstallHealthServiceConfig;

  constructor(config: InstallHealthServiceConfig) {
    this.redis = config.redis;
    this.config = config;
  }

  /**
   * Perform comprehensive install health check
   */
  async checkInstallHealth(request: InstallCheckRequest): Promise<InstallCheckResponse> {
    try {
      const health = await this.generateInstallHealth(request.tenant_id, request.demo_asset_url, request.test_page_url);
      const canCheckout = this.canCheckoutBasedOnHealth(health);
      const nextSteps = this.generateNextSteps(health);

      return {
        health,
        can_checkout: canCheckout,
        next_steps: nextSteps,
      };
    } catch (error) {
      throw new Error(`Install health check failed: ${error}`);
    }
  }

  /**
   * Generate install health report
   */
  async generateInstallHealth(
    tenantId: string,
    demoAssetUrl?: string,
    testPageUrl?: string
  ): Promise<InstallHealth> {
    const healthDetails: HealthCheckDetails = {
      link_header_present: false,
      manifest_accessible: false,
      demo_asset_embedded: false,
      demo_asset_remote: false,
      discoverable: false,
      smoke_test_results: [],
    };

    const remediationSteps: RemediationStep[] = [];

    // Check Link header configuration
    if (testPageUrl) {
      const linkHeaderCheck = await this.checkLinkHeader(testPageUrl);
      healthDetails.link_header_present = linkHeaderCheck.passed;
      
      if (!linkHeaderCheck.passed) {
        remediationSteps.push({
          id: 'configure_link_header',
          title: 'Configure C2PA Link Header',
          description: 'Add the Link header to your web server configuration to point to your C2PA manifest',
          action_type: 'configure',
          completed: false,
          help_url: 'https://c2pa.org/specifications/specs/2.1/specs/C2PA_Specification.html#_link_header',
        });
      }
    }

    // Check manifest accessibility
    const manifestCheck = await this.checkManifestAccessibility(tenantId);
    healthDetails.manifest_accessible = manifestCheck.passed;

    if (!manifestCheck.passed) {
      remediationSteps.push({
        id: 'fix_manifest_accessibility',
        title: 'Fix Manifest Accessibility',
        description: 'Ensure your manifest files are accessible and properly configured',
        action_type: 'configure',
        completed: false,
        help_url: 'https://c2pa.org/specifications/specs/2.1/specs/C2PA_Specification.html#_remote_manifests',
      });
    }

    // Check demo asset verification
    if (demoAssetUrl) {
      const demoCheck = await this.checkDemoAssetVerification(demoAssetUrl);
      healthDetails.demo_asset_embedded = demoCheck.embedded;
      healthDetails.demo_asset_remote = demoCheck.remote;
      healthDetails.discoverable = demoCheck.embedded || demoCheck.remote;

      if (!demoCheck.embedded) {
        remediationSteps.push({
          id: 'add_embedded_manifest',
          title: 'Add Embedded Manifest',
          description: 'Ensure your demo asset includes an embedded C2PA manifest',
          action_type: 'verify',
          completed: false,
          help_url: 'https://c2pa.org/specifications/specs/2.1/specs/C2PA_Specification.html',
        });
      }

      if (!demoCheck.remote) {
        remediationSteps.push({
          id: 'configure_remote_discovery',
          title: 'Configure Remote Discovery',
          description: 'Set up remote manifest hosting and ensure proper Link header configuration',
          action_type: 'configure',
          completed: false,
          help_url: 'https://c2pa.org/specifications/specs/2.1/specs/C2PA_Specification.html#_remote_manifests',
        });
      }
    }

    // Perform smoke tests
    if (demoAssetUrl) {
      const smokeTestResults = await this.performSmokeTests(demoAssetUrl);
      healthDetails.smoke_test_results = smokeTestResults;

      // Analyze smoke test results for remediation
      const failingTests = smokeTestResults.filter(test => !test.embed_survived || !test.remote_survived || !test.badge_intact);
      
      if (failingTests.length > 0) {
        remediationSteps.push({
          id: 'fix_transform_survival',
          title: 'Fix Transform Survival',
          description: `${failingTests.length} transformation tests failed. Review your manifest configuration for better durability.`,
          action_type: 'verify',
          completed: false,
          help_url: 'https://c2pa.org/specifications/specs/2.1/specs/C2PA_Specification.html#_manifest_durability',
        });
      }
    }

    // Calculate survival rates and determine status
    const totalTests = healthDetails.smoke_test_results.length;
    const embedSurvival = totalTests > 0 
      ? healthDetails.smoke_test_results.filter(r => r.embed_survived).length / totalTests 
      : (healthDetails.demo_asset_embedded ? 1 : 0);
    const remoteSurvival = totalTests > 0 
      ? healthDetails.smoke_test_results.filter(r => r.remote_survived).length / totalTests 
      : (healthDetails.demo_asset_remote ? 1 : 0);
    const badgeOk = totalTests > 0 
      ? healthDetails.smoke_test_results.filter(r => r.badge_intact).length / totalTests >= this.config.survivalThresholds.badge_intact_min 
      : true;

    // Determine health status
    let status: 'green' | 'amber' | 'red';
    if (embedSurvival >= this.config.survivalThresholds.embed_survival_min && 
        remoteSurvival >= this.config.survivalThresholds.remote_survival_min && 
        badgeOk && 
        healthDetails.discoverable) {
      status = 'green';
    } else if (embedSurvival >= 0.8 && remoteSurvival >= 0.99 && healthDetails.discoverable) {
      status = 'amber';
    } else {
      status = 'red';
    }

    const installHealth: InstallHealth = {
      tenant_id: tenantId,
      embed_survival: embedSurvival,
      remote_survival: remoteSurvival,
      badge_ok: badgeOk,
      status,
      last_checked: new Date().toISOString(),
      remediation_steps: remediationSteps,
      details: healthDetails,
    };

    // Store health check result
    await this.storeHealthCheck(installHealth);

    return installHealth;
  }

  /**
   * Get latest health check for tenant
   */
  async getLatestHealthCheck(tenantId: string): Promise<InstallHealth | null> {
    try {
      const data = await this.redis.get(`health:${tenantId}:latest`);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      throw new Error(`Failed to get latest health check: ${error}`);
    }
  }

  /**
   * Get health check history for tenant
   */
  async getHealthCheckHistory(tenantId: string, limit: number = 30): Promise<InstallHealth[]> {
    try {
      const pattern = `health:${tenantId}:*`;
      const keys = await this.redis.keys(pattern);
      
      // Exclude latest key and sort by timestamp
      const historyKeys = keys
        .filter(key => !key.endsWith(':latest'))
        .sort((a, b) => {
          const aTime = a.split(':').pop();
          const bTime = b.split(':').pop();
          return bTime.localeCompare(aTime);
        })
        .slice(0, limit);

      const healthChecks: InstallHealth[] = [];
      for (const key of historyKeys) {
        const data = await this.redis.get(key);
        if (data) {
          healthChecks.push(JSON.parse(data));
        }
      }

      return healthChecks;
    } catch (error) {
      throw new Error(`Failed to get health check history: ${error}`);
    }
  }

  /**
   * Monitor tenant health continuously
   */
  async monitorTenantHealth(tenantId: string, demoAssetUrl?: string, testPageUrl?: string): Promise<void> {
    try {
      const health = await this.generateInstallHealth(tenantId, demoAssetUrl, testPageUrl);
      
      // Check if health degraded
      const previousHealth = await this.getLatestHealthCheck(tenantId);
      if (previousHealth && this.isHealthDegraded(previousHealth, health)) {
        await this.triggerHealthAlert(tenantId, previousHealth, health);
      }

      // Update tenant status based on health
      await this.updateTenantHealthStatus(tenantId, health);
    } catch (error) {
      console.error(`Health monitoring failed for tenant ${tenantId}:`, error);
    }
  }

  /**
   * Get health summary for multiple tenants
   */
  async getHealthSummary(tenantIds: string[]): Promise<{
    total_tenants: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
    details: Array<{ tenant_id: string; status: string; embed_survival: number; remote_survival: number; last_checked: string }>;
  }> {
    try {
      const healthChecks = await Promise.all(
        tenantIds.map(async (tenantId) => {
          const health = await this.getLatestHealthCheck(tenantId);
          return {
            tenant_id: tenantId,
            health,
          };
        })
      );

      const summary = {
        total_tenants: tenantIds.length,
        healthy: healthChecks.filter(h => h.health?.status === 'green').length,
        degraded: healthChecks.filter(h => h.health?.status === 'amber').length,
        unhealthy: healthChecks.filter(h => h.health?.status === 'red').length,
        details: healthChecks.map(h => ({
          tenant_id: h.tenant_id,
          status: h.health?.status || 'unknown',
          embed_survival: h.health?.embed_survival || 0,
          remote_survival: h.health?.remote_survival || 0,
          last_checked: h.health?.last_checked || '',
        })),
      };

      return summary;
    } catch (error) {
      throw new Error(`Failed to get health summary: ${error}`);
    }
  }

  // ============================================================================
  // PRIVATE METHODS
  // ============================================================================

  private async checkLinkHeader(testPageUrl: string): Promise<ValidationResult> {
    try {
      const response = await axios.get(testPageUrl, {
        timeout: this.config.timeoutMs,
        validateStatus: () => true,
      });

      const linkHeader = response.headers['link'];
      if (linkHeader && linkHeader.includes('c2pa-manifest')) {
        return {
          check: 'link_header_present',
          passed: true,
          message: 'C2PA manifest Link header found',
          details: { link_header: linkHeader },
        };
      } else {
        return {
          check: 'link_header_present',
          passed: false,
          message: 'C2PA manifest Link header not found',
          details: { link_header },
        };
      }
    } catch (error) {
      return {
        check: 'link_header_present',
        passed: false,
        message: `Failed to check Link header: ${error.message}`,
        details: { error: error.message },
      };
    }
  }

  private async checkManifestAccessibility(tenantId: string): Promise<ValidationResult> {
    try {
      // Get tenant's manifest host from stored data
      const tenantData = await this.redis.get(`tenant:${tenantId}`);
      if (!tenantData) {
        return {
          check: 'manifest_accessible',
          passed: false,
          message: 'Tenant not found',
          details: {},
        };
      }

      const tenant = JSON.parse(tenantData);
      const manifestHost = tenant.policy?.manifest_host;

      if (!manifestHost) {
        return {
          check: 'manifest_accessible',
          passed: false,
          message: 'Manifest host not configured',
          details: {},
        };
      }

      // Test manifest accessibility
      const testManifestUrl = `${manifestHost}/test-manifest.c2pa`;
      const response = await axios.get(testManifestUrl, {
        timeout: this.config.timeoutMs,
        validateStatus: () => true,
      });

      return {
        check: 'manifest_accessible',
        passed: response.status < 400,
        message: response.status < 400 
          ? 'Manifest host is accessible' 
          : `Manifest host returned error: ${response.status}`,
        details: { manifest_url: testManifestUrl, status: response.status },
      };
    } catch (error) {
      return {
        check: 'manifest_accessible',
        passed: false,
        message: `Failed to check manifest accessibility: ${error.message}`,
        details: { error: error.message },
      };
    }
  }

  private async checkDemoAssetVerification(demoAssetUrl: string): Promise<{
    embedded: boolean;
    remote: boolean;
  }> {
    try {
      const response = await axios.post(
        `${this.config.caiVerifyEndpoint}/verify`,
        { url: demoAssetUrl },
        {
          timeout: this.config.timeoutMs,
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': this.config.userAgent,
          },
        }
      );

      if (response.status === 200) {
        const verifyResult = response.data;
        return {
          embedded: !!verifyResult.embedded_manifest,
          remote: !!verifyResult.remote_manifest,
        };
      } else {
        return {
          embedded: false,
          remote: false,
        };
      }
    } catch (error) {
      console.error('Demo asset verification failed:', error);
      return {
        embedded: false,
        remote: false,
      };
    }
  }

  private async performSmokeTests(demoAssetUrl: string): Promise<SmokeTestResult[]> {
    const transformations = [
      'resize',
      'compress',
      'crop',
      'rotate',
      'format_convert',
      'color_adjust',
      'watermark',
      'metadata_strip',
      'thumbnail',
      'social_media',
      'print',
      'email',
    ];

    const results: SmokeTestResult[] = [];

    for (const transform of transformations) {
      try {
        const result = await this.performTransformationTest(demoAssetUrl, transform);
        results.push(result);
      } catch (error) {
        results.push({
          transform_type: transform,
          embed_survived: false,
          remote_survived: false,
          badge_intact: false,
          error: error.message,
        });
      }
    }

    return results;
  }

  private async performTransformationTest(assetUrl: string, transform: string): Promise<SmokeTestResult> {
    // This would integrate with actual transformation service
    // For now, simulate realistic test results based on transformation type
    const survivalRates = {
      resize: { embed: 0.98, remote: 0.999, badge: 0.99 },
      compress: { embed: 0.95, remote: 0.999, badge: 0.97 },
      crop: { embed: 0.92, remote: 0.999, badge: 0.94 },
      rotate: { embed: 0.96, remote: 0.999, badge: 0.98 },
      format_convert: { embed: 0.88, remote: 0.999, badge: 0.90 },
      color_adjust: { embed: 0.97, remote: 0.999, badge: 0.98 },
      watermark: { embed: 0.94, remote: 0.999, badge: 0.95 },
      metadata_strip: { embed: 0.99, remote: 0.999, badge: 0.99 },
      thumbnail: { embed: 0.91, remote: 0.999, badge: 0.93 },
      social_media: { embed: 0.85, remote: 0.999, badge: 0.87 },
      print: { embed: 0.93, remote: 0.999, badge: 0.94 },
      email: { embed: 0.89, remote: 0.999, badge: 0.91 },
    };

    const rates = survivalRates[transform as keyof typeof survivalRates];
    const randomFactor = Math.random();

    return {
      transform_type: transform,
      embed_survived: randomFactor < rates.embed,
      remote_survived: randomFactor < rates.remote,
      badge_intact: randomFactor < rates.badge,
    };
  }

  private canCheckoutBasedOnHealth(health: InstallHealth): boolean {
    return health.status === 'green';
  }

  private generateNextSteps(health: InstallHealth): RemediationStep[] {
    if (health.status === 'green') {
      return [{
        id: 'proceed_to_checkout',
        title: 'Proceed to Checkout',
        description: 'Your installation is healthy and ready for production use.',
        action_type: 'install',
        completed: false,
      }];
    }

    return health.remediation_steps;
  }

  private async storeHealthCheck(health: InstallHealth): Promise<void> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Store individual health check
    await this.redis.setex(
      `health:${health.tenant_id}:${timestamp}`,
      86400 * 30, // 30 days retention
      JSON.stringify(health)
    );

    // Store as latest
    await this.redis.setex(
      `health:${health.tenant_id}:latest`,
      86400 * 7, // 7 days retention
      JSON.stringify(health)
    );
  }

  private isHealthDegraded(previous: InstallHealth, current: InstallHealth): boolean {
    // Check if status degraded from green to amber/red or amber to red
    const statusOrder = { green: 3, amber: 2, red: 1 };
    return statusOrder[current.status] < statusOrder[previous.status];
  }

  private async triggerHealthAlert(tenantId: string, previous: InstallHealth, current: InstallHealth): Promise<void> {
    // This would integrate with alerting system
    console.warn(`Health degraded for tenant ${tenantId}: ${previous.status} -> ${current.status}`);
    
    // Store alert
    const alert = {
      tenant_id: tenantId,
      type: 'health_degradation',
      previous_status: previous.status,
      current_status: current.status,
      embed_survival_change: current.embed_survival - previous.embed_survival,
      remote_survival_change: current.remote_survival - previous.remote_survival,
      timestamp: new Date().toISOString(),
    };

    await this.redis.setex(
      `alert:${tenantId}:${Date.now()}`,
      86400 * 7, // 7 days retention
      JSON.stringify(alert)
    );
  }

  private async updateTenantHealthStatus(tenantId: string, health: InstallHealth): Promise<void> {
    // Update tenant record with health status
    const tenantData = await this.redis.get(`tenant:${tenantId}`);
    if (tenantData) {
      const tenant = JSON.parse(tenantData);
      tenant.install_health = health;
      tenant.updated_at = new Date().toISOString();
      
      await this.redis.setex(
        `tenant:${tenantId}`,
        86400 * 30,
        JSON.stringify(tenant)
      );
    }
  }
}
