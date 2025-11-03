// Phase 21.11 Comprehensive Acceptance Tests
// Hard Binary Pass/Fail Criteria for Multi-Region DR Implementation

import { describe, it, before, after } from 'mocha';
import { expect } from 'chai';
import fetch from 'node-fetch';

// Security constants
const MAX_API_URL_LENGTH = 2048;
const MAX_ADMIN_TOKEN_LENGTH = 512;
const MAX_TENANT_ID_LENGTH = 100;
const MAX_TEST_HASH_LENGTH = 128;
const MAX_REASON_LENGTH = 200;
const MAX_JOB_ID_LENGTH = 100;
const MAX_METRIC_PATH_LENGTH = 200;
const MIN_TIMEOUT_MS = 1000;
const MAX_TIMEOUT_MS = 3600000; // 1 hour
const VALID_TENANT_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;
const VALID_HASH_PATTERN = /^[a-f0-9]{64}$/i;
const VALID_JOB_ID_PATTERN = /^[a-zA-Z0-9_-]+$/;

interface TestConfig {
  api_url: string;
  admin_token: string;
  test_tenant_id: string;
  timeout_ms: number;
}

interface TestResult {
  test_name: string;
  passed: boolean;
  duration_ms: number;
  error?: string;
  metrics?: any;
}

export class DRAcceptanceTests {
  private config: TestConfig;
  private results: TestResult[] = [];

  constructor(config: TestConfig) {
    this.validateConfig(config);
    this.config = this.sanitizeConfig(config);
  }

  private validateConfig(config: TestConfig): void {
    if (!config) {
      throw new Error('Test configuration is required');
    }

    // Validate API URL
    if (!config.api_url || typeof config.api_url !== 'string') {
      throw new Error('API URL is required and must be a string');
    }
    if (config.api_url.length > MAX_API_URL_LENGTH) {
      throw new Error('API URL exceeds maximum length');
    }
    try {
      new URL(config.api_url);
    } catch {
      throw new Error('API URL must be a valid URL');
    }

    // Validate admin token
    if (!config.admin_token || typeof config.admin_token !== 'string') {
      throw new Error('Admin token is required and must be a string');
    }
    if (config.admin_token.length > MAX_ADMIN_TOKEN_LENGTH) {
      throw new Error('Admin token exceeds maximum length');
    }

    // Validate tenant ID
    if (!config.test_tenant_id || typeof config.test_tenant_id !== 'string') {
      throw new Error('Test tenant ID is required and must be a string');
    }
    if (!VALID_TENANT_ID_PATTERN.test(config.test_tenant_id)) {
      throw new Error('Invalid tenant ID format');
    }
    if (config.test_tenant_id.length > MAX_TENANT_ID_LENGTH) {
      throw new Error('Tenant ID exceeds maximum length');
    }

    // Validate timeout
    if (!Number.isInteger(config.timeout_ms) || 
        config.timeout_ms < MIN_TIMEOUT_MS || 
        config.timeout_ms > MAX_TIMEOUT_MS) {
      throw new Error(`Timeout must be between ${MIN_TIMEOUT_MS} and ${MAX_TIMEOUT_MS} milliseconds`);
    }
  }

  private sanitizeConfig(config: TestConfig): TestConfig {
    return {
      api_url: this.sanitizeUrl(config.api_url),
      admin_token: config.admin_token, // Keep as-is for authentication
      test_tenant_id: config.test_tenant_id,
      timeout_ms: config.timeout_ms
    };
  }

  private sanitizeUrl(url: string): string {
    if (!url || typeof url !== 'string') return '';
    return url.substring(0, MAX_API_URL_LENGTH).replace(/[<>"'\s]/g, '');
  }

  private sanitizeInput(input: string, maxLength: number): string {
    if (!input || typeof input !== 'string') return '';
    return input.substring(0, maxLength).replace(/[<>"'&]/g, '');
  }

  private sanitizeError(error: string): string {
    return this.sanitizeInput(error, 500);
  }

  private sanitizeTestName(name: string): string {
    return this.sanitizeInput(name, 100);
  }

  private validateTestHash(hash: string): boolean {
    return hash && 
           typeof hash === 'string' && 
           hash.length <= MAX_TEST_HASH_LENGTH &&
           (VALID_HASH_PATTERN.test(hash) || hash.startsWith('test-') || hash.startsWith('rpo-') || hash.startsWith('integrity-'));
  }

  private validateJobId(jobId: string): boolean {
    return jobId && 
           typeof jobId === 'string' && 
           jobId.length > 0 && 
           jobId.length <= MAX_JOB_ID_LENGTH &&
           VALID_JOB_ID_PATTERN.test(jobId);
  }

  private validateMetricPath(path: string): boolean {
    return path && 
           typeof path === 'string' && 
           path.length > 0 && 
           path.length <= MAX_METRIC_PATH_LENGTH &&
           /^[a-z0-9_.]+$/.test(path);
  }

  /**
   * Run all acceptance tests
   */
  async runAllTests(): Promise<{
    overall_passed: boolean;
    total_tests: number;
    passed_tests: number;
    failed_tests: number;
    results: TestResult[];
  }> {
    console.log('=== Running DR Acceptance Tests ===');
    
    // Clear previous results
    this.results = [];

    try {
      // Run test suites
      await this.testRPOCompliance();
      await this.testRTOCompliance();
      await this.testServiceContinuity();
      await this.testDataIntegrity();
      await this.testLeaderElection();
      await this.testConsistencyGuarantees();
      await this.testFailoverMechanisms();
      await this.testRecoveryProcedures();
      await this.testObservability();
      await this.testConfigurationManagement();

      // Calculate results
      const totalTests = this.results.length;
      const passedTests = this.results.filter(r => r.passed).length;
      const failedTests = totalTests - passedTests;
      const overallPassed = failedTests === 0;

      console.log(`=== Test Results ===`);
      console.log(`Total: ${totalTests}, Passed: ${passedTests}, Failed: ${failedTests}`);
      console.log(`Overall: ${overallPassed ? 'PASSED' : 'FAILED'}`);

      return {
        overall_passed: overallPassed,
        total_tests: totalTests,
        passed_tests: passedTests,
        failed_tests: failedTests,
        results: this.results
      };

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      console.error('Test suite failed:', errorMsg);
      return {
        overall_passed: false,
        total_tests: this.results.length,
        passed_tests: this.results.filter(r => r.passed).length,
        failed_tests: this.results.filter(r => !r.passed).length,
        results: this.results
      };
    }
  }

  private async runTest(testName: string, testFn: () => Promise<any>): Promise<void> {
    const sanitizedTestName = this.sanitizeTestName(testName);
    const startTime = Date.now();
    
    try {
      const result = await Promise.race([
        testFn(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Test timeout')), this.config.timeout_ms)
        )
      ]);

      this.results.push({
        test_name: sanitizedTestName,
        passed: true,
        duration_ms: Date.now() - startTime,
        metrics: result
      });

      console.log(`✓ ${sanitizedTestName} - PASSED (${Date.now() - startTime}ms)`);

    } catch (error) {
      const errorMsg = this.sanitizeError(error instanceof Error ? error.message : 'Unknown error');
      
      this.results.push({
        test_name: sanitizedTestName,
        passed: false,
        duration_ms: Date.now() - startTime,
        error: errorMsg
      });

      console.log(`✗ ${sanitizedTestName} - FAILED (${Date.now() - startTime}ms): ${errorMsg}`);
    }
  }

  // Test Suite 1: RPO Compliance
  private async testRPOCompliance(): Promise<void> {
    await this.runTest('RPO_Replication_Lag_Under_5_Minutes', async () => {
      // Store test manifest
      const testHash = `rpo-test-${Date.now()}`;
      
      if (!this.validateTestHash(testHash)) {
        throw new Error('Invalid test hash format');
      }
      
      const testData = { test: 'rpo-compliance', timestamp: new Date().toISOString() };
      
      const storeResponse = await fetch(`${this.config.api_url}/manifest/${testHash}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.admin_token}`
        },
        body: JSON.stringify(testData)
      });

      if (!storeResponse.ok) {
        throw new Error(`Failed to store test manifest: ${this.sanitizeInput(storeResponse.statusText, 100)}`);
      }

      // Wait for replication and check lag
      await this.waitForReplication(testHash, 300); // 5 minutes max
      
      const statusResponse = await fetch(`${this.config.api_url}/status`);
      if (!statusResponse.ok) {
        throw new Error('Failed to get status');
      }
      const status = await statusResponse.json() as any;
      
      const replicationLag = status.storage?.replication_lag_seconds;
      if (typeof replicationLag !== 'number' || replicationLag < 0) {
        throw new Error('Invalid replication lag value');
      }
      
      // Binary assertion: RPO must be ≤ 300 seconds (5 minutes)
      if (replicationLag > 300) {
        throw new Error(`RPO violation: replication lag ${replicationLag}s > 300s`);
      }

      return { replication_lag_seconds: replicationLag };
    });
  }

  // Test Suite 2: RTO Compliance
  private async testRTOCompliance(): Promise<void> {
    await this.runTest('RTO_Failover_Under_15_Minutes', async () => {
      const failoverStart = Date.now();
      
      // Validate target region
      const targetRegion = 'weur';
      if (!['enam', 'weur'].includes(targetRegion)) {
        throw new Error('Invalid target region');
      }
      
      // Trigger manual failover
      const failoverResponse = await fetch(`${this.config.api_url}/admin/failover/manual`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.admin_token}`
        },
        body: JSON.stringify({
          target_region: targetRegion,
          reason: this.sanitizeInput('acceptance_test', MAX_REASON_LENGTH)
        })
      });

      if (!failoverResponse.ok) {
        throw new Error(`Failed to trigger failover: ${this.sanitizeInput(failoverResponse.statusText, 100)}`);
      }

      // Wait for failover completion
      await this.waitForFailoverCompletion();
      
      const failoverTime = Date.now() - failoverStart;
      
      // Binary assertion: RTO must be ≤ 900 seconds (15 minutes)
      if (failoverTime > 900000) { // 15 minutes in ms
        throw new Error(`RTO violation: failover time ${failoverTime}ms > 900000ms`);
      }

      // Verify service is working in new region
      const healthResponse = await fetch(`${this.config.api_url}/healthz`);
      if (!healthResponse.ok) {
        throw new Error('Service not healthy after failover');
      }

      return { failover_time_ms: failoverTime };
    });
  }

  // Test Suite 3: Service Continuity
  private async testServiceContinuity(): Promise<void> {
    await this.runTest('Service_Continuity_During_Failover', async () => {
      // Test API functionality during failover
      const signPromises = Array.from({ length: 10 }, (_, i) => {
        const manifest = `continuity-test-${i}`;
        if (manifest.length > 50) {
          throw new Error('Manifest name too long');
        }
        
        return fetch(`${this.config.api_url}/sign`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            manifest: manifest,
            tenant_id: this.config.test_tenant_id
          })
        });
      });

      const signResults = await Promise.allSettled(signPromises);
      const failedSigns = signResults.filter(r => 
        r.status === 'rejected' || (r.status === 'fulfilled' && !r.value.ok)
      ).length;
      
      // Binary assertion: No more than 10% of requests should fail
      if (failedSigns > 1) {
        throw new Error(`Service continuity violation: ${failedSigns}/10 sign requests failed`);
      }

      // Test verify API
      const testHash = 'test-hash';
      if (!this.validateTestHash(testHash)) {
        throw new Error('Invalid test hash for verify API');
      }
      
      const verifyResponse = await fetch(`${this.config.api_url}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          manifest_hash: testHash,
          tenant_id: this.config.test_tenant_id
        })
      });

      if (!verifyResponse.ok) {
        throw new Error('Verify API not available during failover');
      }

      return { failed_sign_requests: failedSigns };
    });
  }

  // Test Suite 4: Data Integrity
  private async testDataIntegrity(): Promise<void> {
    await this.runTest('Data_Integrity_Across_Regions', async () => {
      const testHash = `integrity-${Date.now()}`;
      
      if (!this.validateTestHash(testHash)) {
        throw new Error('Invalid test hash format');
      }
      
      const testData = { 
        test: 'data-integrity', 
        checksum: 'abc123',
        timestamp: new Date().toISOString() 
      };

      // Store manifest
      const storeResponse = await fetch(`${this.config.api_url}/manifest/${testHash}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testData)
      });

      if (!storeResponse.ok) {
        throw new Error('Failed to store test manifest');
      }

      // Wait for replication
      await this.waitForReplication(testHash, 300);

      // Define region URLs with validation
      const regionUrls = [
        'https://api-enam.c2-concierge.com',
        'https://api-weur.c2-concierge.com'
      ];

      // Retrieve from both regions
      const primaryResponse = await fetch(`${regionUrls[0]}/manifest/${testHash}`);
      const secondaryResponse = await fetch(`${regionUrls[1]}/manifest/${testHash}`);

      if (!primaryResponse.ok || !secondaryResponse.ok) {
        throw new Error('Manifest not available in both regions');
      }

      const primaryData = await primaryResponse.json();
      const secondaryData = await secondaryResponse.json();

      // Validate response data
      if (!primaryData || !secondaryData) {
        throw new Error('Invalid response data from regions');
      }

      // Binary assertion: Data must be identical across regions
      if (JSON.stringify(primaryData) !== JSON.stringify(secondaryData)) {
        throw new Error('Data integrity violation: data differs between regions');
      }

      if (primaryData.checksum !== testData.checksum) {
        throw new Error('Data integrity violation: checksum corrupted');
      }

      return { regions_consistent: true, checksum_valid: true };
    });
  }

  // Test Suite 5: Leader Election
  private async testLeaderElection(): Promise<void> {
    await this.runTest('Leader_Election_Single_Leader', async () => {
      // Define region URLs with validation
      const regionUrls = [
        'https://api-enam.c2-concierge.com',
        'https://api-weur.c2-concierge.com'
      ];

      // Get leader status from both regions
      const enamLeaderResponse = await fetch(`${regionUrls[0]}/admin/leader/status`);
      const weurLeaderResponse = await fetch(`${regionUrls[1]}/admin/leader/status`);

      if (!enamLeaderResponse.ok || !weurLeaderResponse.ok) {
        throw new Error('Failed to get leader status');
      }

      const enamLeader = await enamLeaderResponse.json();
      const weurLeader = await weurLeaderResponse.json();

      // Validate leader responses
      if (typeof enamLeader?.is_leader !== 'boolean' || typeof weurLeader?.is_leader !== 'boolean') {
        throw new Error('Invalid leader status response');
      }

      // Binary assertion: Only one leader should exist
      const enamIsLeader = enamLeader.is_leader;
      const weurIsLeader = weurLeader.is_leader;

      if (enamIsLeader && weurIsLeader) {
        throw new Error('Leader election violation: multiple leaders detected');
      }

      if (!enamIsLeader && !weurIsLeader) {
        throw new Error('Leader election violation: no leader detected');
      }

      // Test job coordination
      const jobId = 'leader-election-test';
      if (!this.validateJobId(jobId)) {
        throw new Error('Invalid job ID format');
      }
      
      const jobResponse = await fetch(`${this.config.api_url}/admin/jobs/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.admin_token}`
        },
        body: JSON.stringify({
          job_id: jobId,
          job_type: 'anchor'
        })
      });

      if (!jobResponse.ok) {
        throw new Error('Job coordination failed');
      }

      return { 
        single_leader: true,
        leader_region: enamIsLeader ? 'enam' : 'weur',
        job_coordination_working: true
      };
    });
  }

  // Test Suite 6: Consistency Guarantees
  private async testConsistencyGuarantees(): Promise<void> {
    await this.runTest('Consistency_Guarantee_99.9_Percent', async () => {
      // Run consistency check
      const consistencyResponse = await fetch(`${this.config.api_url}/admin/consistency/check`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.admin_token}`
        },
        body: JSON.stringify({
          sample_size: 1000,
          auto_repair: false
        })
      });

      if (!consistencyResponse.ok) {
        throw new Error('Consistency check failed');
      }

      const consistencyResult = await consistencyResponse.json();
      
      // Validate consistency result
      if (typeof consistencyResult?.mismatch_percentage !== 'number' || 
          consistencyResult.mismatch_percentage < 0 || 
          consistencyResult.mismatch_percentage > 100) {
        throw new Error('Invalid consistency result');
      }
      
      const consistencyPercentage = 100 - consistencyResult.mismatch_percentage;

      // Binary assertion: Consistency must be ≥ 99.9%
      if (consistencyPercentage < 99.9) {
        throw new Error(`Consistency violation: ${consistencyPercentage}% < 99.9%`);
      }

      return { 
        consistency_percentage: consistencyPercentage,
        mismatched_count: consistencyResult.mismatched_count || 0
      };
    });
  }

  // Test Suite 7: Failover Mechanisms
  private async testFailoverMechanisms(): Promise<void> {
    await this.runTest('Automatic_Failover_Health_Checks', async () => {
      // Check health check configuration
      const cloudflareApiToken = process.env.CLOUDFLARE_API_TOKEN;
      if (!cloudflareApiToken || typeof cloudflareApiToken !== 'string') {
        throw new Error('CLOUDFLARE_API_TOKEN environment variable required');
      }
      
      const lbResponse = await fetch(`https://api.cloudflare.com/client/v4/load_balancers/c2-concierge-lb`, {
        headers: { 'Authorization': `Bearer ${cloudflareApiToken}` }
      });

      if (!lbResponse.ok) {
        throw new Error('Failed to get load balancer config');
      }

      const lbConfig = await lbResponse.json();
      
      // Validate load balancer response
      if (!lbConfig.result || !Array.isArray(lbConfig.result) || lbConfig.result.length === 0) {
        throw new Error('Invalid load balancer configuration response');
      }
      
      const healthChecks = lbConfig.result[0].health_checks;

      // Binary assertion: Health checks must be properly configured
      if (!healthChecks || !Array.isArray(healthChecks) || healthChecks.length === 0) {
        throw new Error('Health checks not configured');
      }

      const healthCheck = healthChecks[0];
      
      // Validate health check configuration
      if (typeof healthCheck.interval !== 'number' || healthCheck.interval <= 0) {
        throw new Error('Invalid health check interval');
      }
      
      if (typeof healthCheck.timeout !== 'number' || healthCheck.timeout <= 0) {
        throw new Error('Invalid health check timeout');
      }
      
      if (healthCheck.interval > 30) { // Should check at least every 30 seconds
        throw new Error(`Health check interval too long: ${healthCheck.interval}s`);
      }

      if (healthCheck.timeout > 10) { // Should timeout within 10 seconds
        throw new Error(`Health check timeout too long: ${healthCheck.timeout}s`);
      }

      return { 
        health_checks_configured: true,
        interval_seconds: healthCheck.interval,
        timeout_seconds: healthCheck.timeout
      };
    });
  }

  // Test Suite 8: Recovery Procedures
  private async testRecoveryProcedures(): Promise<void> {
    await this.runTest('Auto_Recovery_Primary_Region', async () => {
      // Validate target region
      const targetRegion = 'enam';
      if (!['enam', 'weur'].includes(targetRegion)) {
        throw new Error('Invalid target region for recovery');
      }
      
      // Simulate primary region recovery
      const recoveryResponse = await fetch(`${this.config.api_url}/admin/recovery/auto`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.admin_token}`
        },
        body: JSON.stringify({
          target_region: targetRegion,
          force: true
        })
      });

      if (!recoveryResponse.ok) {
        throw new Error('Auto recovery failed');
      }

      // Wait for recovery completion
      await this.waitForRecoveryCompletion();

      // Verify traffic returned to primary
      const statusResponse = await fetch(`${this.config.api_url}/status`);
      if (!statusResponse.ok) {
        throw new Error('Failed to get status after recovery');
      }
      
      const status = await statusResponse.json();
      
      // Validate status response
      if (!status || typeof status.active_region !== 'string') {
        throw new Error('Invalid status response');
      }

      // Binary assertion: Traffic should be back to primary
      if (status.active_region !== targetRegion) {
        throw new Error(`Auto recovery failed: traffic not returned to ${targetRegion}`);
      }

      return { 
        recovery_successful: true,
        active_region: status.active_region
      };
    });
  }

  // Test Suite 9: Observability
  private async testObservability(): Promise<void> {
    await this.runTest('Observability_Metrics_Collection', async () => {
      // Check metrics endpoints
      const metricsResponse = await fetch(`${this.config.api_url}/metrics`);
      if (!metricsResponse.ok) {
        throw new Error('Metrics endpoint not available');
      }

      const metrics = await metricsResponse.json();
      
      // Validate metrics response
      if (!metrics || typeof metrics !== 'object') {
        throw new Error('Invalid metrics response');
      }

      // Binary assertion: Critical metrics must be present
      const requiredMetrics = [
        'storage.replication_lag_seconds',
        'storage.replication_queue_depth',
        'coordination.leader_status',
        'services.api_gateway.healthy',
        'services.sign_service.healthy',
        'services.verify_service.healthy'
      ];

      for (const metric of requiredMetrics) {
        if (!this.validateMetricPath(metric)) {
          throw new Error(`Invalid metric path format: ${metric}`);
        }
        
        if (!this.hasMetric(metrics, metric)) {
          throw new Error(`Missing required metric: ${metric}`);
        }
      }

      // Check alerting
      const alertResponse = await fetch(`${this.config.api_url}/admin/alerts/test`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${this.config.admin_token}` }
      });

      if (!alertResponse.ok) {
        throw new Error('Alert system not working');
      }

      return { 
        metrics_available: true,
        alert_system_working: true,
        metrics_count: Object.keys(metrics).length
      };
    });
  }

  // Test Suite 10: Configuration Management
  private async testConfigurationManagement(): Promise<void> {
    await this.runTest('Per_Tenant_Configuration', async () => {
      // Test tenant configuration update
      const configUpdate = {
        replication_mode: 'strict',
        failover_policy: 'immediate',
        queue_budget: {
          max_queue_size: 100,
          max_replication_lag_seconds: 60
        }
      };

      // Validate configuration values
      if (!['strict', 'eventual'].includes(configUpdate.replication_mode)) {
        throw new Error('Invalid replication mode');
      }
      
      if (!['immediate', 'gradual'].includes(configUpdate.failover_policy)) {
        throw new Error('Invalid failover policy');
      }
      
      if (typeof configUpdate.queue_budget?.max_queue_size !== 'number' || 
          configUpdate.queue_budget.max_queue_size <= 0) {
        throw new Error('Invalid max queue size');
      }

      const configResponse = await fetch(`${this.config.api_url}/admin/tenant/${this.config.test_tenant_id}/config`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.admin_token}`
        },
        body: JSON.stringify(configUpdate)
      });

      if (!configResponse.ok) {
        throw new Error('Failed to update tenant configuration');
      }

      // Verify configuration applied
      const verifyResponse = await fetch(`${this.config.api_url}/admin/tenant/${this.config.test_tenant_id}/config`);
      if (!verifyResponse.ok) {
        throw new Error('Failed to verify tenant configuration');
      }
      
      const config = await verifyResponse.json();
      
      // Validate configuration response
      if (!config || typeof config !== 'object') {
        throw new Error('Invalid configuration response');
      }

      if (config.replication_mode !== 'strict') {
        throw new Error('Configuration update not applied');
      }

      return { 
        configuration_updated: true,
        replication_mode: config.replication_mode,
        failover_policy: config.failover_policy
      };
    });
  }

  // Helper methods

  private async waitForReplication(hash: string, maxWaitMs: number): Promise<void> {
    if (!this.validateTestHash(hash)) {
      throw new Error('Invalid test hash for replication wait');
    }
    
    if (!Number.isInteger(maxWaitMs) || maxWaitMs < 0 || maxWaitMs > 3600000) {
      throw new Error('Invalid max wait time');
    }
    
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWaitMs) {
      const statusResponse = await fetch(`${this.config.api_url}/status`);
      if (!statusResponse.ok) {
        throw new Error('Failed to get status during replication wait');
      }
      
      const status = await statusResponse.json();
      
      if (typeof status?.storage?.replication_lag_seconds !== 'number') {
        throw new Error('Invalid replication lag in status response');
      }
      
      if (status.storage.replication_lag_seconds < 10) { // Consider replicated if lag < 10s
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
    }
    
    throw new Error('Replication did not complete within timeout');
  }

  private async waitForFailoverCompletion(): Promise<void> {
    const startTime = Date.now();
    const maxWaitMs = 900000; // 15 minutes max
    
    while (Date.now() - startTime < maxWaitMs) {
      const statusResponse = await fetch(`${this.config.api_url}/status`);
      if (!statusResponse.ok) {
        throw new Error('Failed to get status during failover wait');
      }
      
      const status = await statusResponse.json();
      
      if (status?.active_region === 'weur' && status?.services?.api_gateway?.healthy) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    }
    
    throw new Error('Failover did not complete within timeout');
  }

  private async waitForRecoveryCompletion(): Promise<void> {
    const startTime = Date.now();
    const maxWaitMs = 300000; // 5 minutes max
    
    while (Date.now() - startTime < maxWaitMs) {
      const statusResponse = await fetch(`${this.config.api_url}/status`);
      if (!statusResponse.ok) {
        throw new Error('Failed to get status during recovery wait');
      }
      
      const status = await statusResponse.json();
      
      if (status?.active_region === 'enam' && status?.services?.api_gateway?.healthy) {
        return;
      }
      
      await new Promise(resolve => setTimeout(resolve, 10000)); // Wait 10 seconds
    }
    
    throw new Error('Recovery did not complete within timeout');
  }

  private hasMetric(metrics: any, path: string): boolean {
    if (!this.validateMetricPath(path)) {
      return false;
    }
    
    const parts = path.split('.');
    let current = metrics;
    
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        return false;
      }
      
      if (current[part] === undefined) {
        return false;
      }
      current = current[part];
    }
    
    return true;
  }
}

// Test runner
export async function runAcceptanceTests(): Promise<void> {
  // Validate environment variables
  const apiUrl = process.env.API_URL;
  const adminToken = process.env.ADMIN_TOKEN;
  const testTenantId = process.env.TEST_TENANT_ID;
  
  if (!apiUrl || typeof apiUrl !== 'string') {
    throw new Error('API_URL environment variable required and must be a string');
  }
  
  if (!adminToken || typeof adminToken !== 'string') {
    throw new Error('ADMIN_TOKEN environment variable required and must be a string');
  }
  
  if (!testTenantId || typeof testTenantId !== 'string') {
    throw new Error('TEST_TENANT_ID environment variable required and must be a string');
  }
  
  const config: TestConfig = {
    api_url: apiUrl,
    admin_token: adminToken,
    test_tenant_id: testTenantId,
    timeout_ms: 600000 // 10 minutes
  };

  const tests = new DRAcceptanceTests(config);
  const results = await tests.runAllTests();

  // Exit with appropriate code
  process.exit(results.overall_passed ? 0 : 1);
}

// Run tests if called directly
if (require.main === module) {
  runAcceptanceTests().catch(error => {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error('Test runner failed:', errorMsg);
    process.exit(1);
  });
}
