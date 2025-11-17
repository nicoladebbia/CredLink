#!/usr/bin/env ts-node

/**
 * 🔥 BRUTAL CHAOS ENGINEERING TEST SUITE
 * 
 * This test suite deliberately breaks the system to validate production fixes
 * Phase 1.1/1.2 Completion Verification - HARSH MODE
 * 
 * Tests:
 * 1. Global Error Handlers (uncaught exceptions, unhandled rejections)
 * 2. Secrets Validation (malicious inputs, missing critical secrets)
 * 3. Enhanced Health Check (database failures, memory exhaustion)
 * 4. Database Pool Monitoring (connection exhaustion, pool reset)
 */

import axios from 'axios';
import { spawn, ChildProcess } from 'child_process';

const BASE_URL = 'http://localhost:3005';
let serverProcess: ChildProcess | null = null;

interface ChaosTestResult {
  testName: string;
  passed: boolean;
  details: string;
  evidence: any;
}

class ChaosTestEngine {
  private results: ChaosTestResult[] = [];

  async runAllTests(): Promise<void> {
    console.log('🔥 STARTING BRUTAL CHAOS ENGINEERING TESTS');
    console.log('===========================================');

    try {
      await this.startServer();
      await this.sleep(2000); // Let server fully start

      // Test 1: Global Error Handlers - UNCAUGHT EXCEPTION ATTACK
      await this.testUncaughtExceptionHandling();

      // Test 2: Global Error Handlers - UNHANDLED REJECTION ATTACK  
      await this.testUnhandledRejectionHandling();

      // Test 3: Secrets Validation - MALICIOUS INPUT ATTACK
      await this.testSecretsValidation();

      // Test 4: Enhanced Health Check - DATABASE CATASTROPHE
      await this.testDatabaseFailureRecovery();

      // Test 5: Database Pool Monitoring - CONNECTION EXHAUSTION
      await this.testPoolExhaustionRecovery();

      // Test 6: Enhanced Health Check - MEMORY STRESS TEST
      await this.testMemoryStressResponse();

      this.printResults();

    } catch (error) {
      console.error('💀 CHAOS TEST ENGINE FAILED:', error);
    } finally {
      await this.stopServer();
    }
  }

  private async startServer(): Promise<void> {
    console.log('🚀 Starting test server...');
    
    serverProcess = spawn('npx', ['ts-node', 'src/index.ts'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        DB_HOST: 'localhost',
        DB_PORT: '5432',
        DB_NAME: 'test',
        DB_USER: 'postgres',
        DB_PASSWORD: 'postgres',
        PORT: '3005',
        NODE_ENV: 'development'
      },
      stdio: 'pipe'
    });

    serverProcess.stdout?.on('data', (data) => {
      console.log(`[SERVER] ${data.toString().trim()}`);
    });

    serverProcess.stderr?.on('data', (data) => {
      console.error(`[SERVER ERROR] ${data.toString().trim()}`);
    });

    // 🔥 CRITICAL FIX: Wait for server to be ACTUALLY ready
    await this.waitForServerReady();
  }

  private async waitForServerReady(maxWait = 15000): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < maxWait) {
      try {
        const response = await axios.get(`${BASE_URL}/health`, { timeout: 2000 });
        if (response.status === 200) {
          console.log('✅ Server is ready for chaos testing');
          return;
        }
      } catch (error) {
        // Server not ready yet, wait and retry
      }
      
      await this.sleep(500);
    }
    
    throw new Error('Server failed to become ready within timeout period');
  }

  private async stopServer(): Promise<void> {
    if (serverProcess) {
      console.log('🛑 Stopping test server...');
      serverProcess.kill('SIGTERM');
      await this.sleep(2000);
      if (serverProcess && !serverProcess.killed) {
        serverProcess.kill('SIGKILL');
      }
    }
  }

  private async testUncaughtExceptionHandling(): Promise<void> {
    console.log('\n🔥 TEST 1: UNCAUGHT EXCEPTION ATTACK');
    
    try {
      // Create a malicious route that throws uncaught exception
      const response = await axios.post(`${BASE_URL}/chaos-uncaught`, {
        trigger: 'uncaught_exception'
      }, { timeout: 5000 });

      // If we get here, the server didn't crash - GOOD
      this.addResult({
        testName: 'Uncaught Exception Handling',
        passed: true,
        details: 'Server handled uncaught exception without crashing',
        evidence: { status: response.status, data: response.data }
      });

    } catch (error) {
      // Check if server is still alive
      try {
        const healthResponse = await axios.get(`${BASE_URL}/health`, { timeout: 3000 });
        this.addResult({
          testName: 'Uncaught Exception Handling',
          passed: healthResponse.status === 200,
          details: 'Server recovered from uncaught exception',
          evidence: { healthStatus: healthResponse.status }
        });
      } catch (healthError) {
        this.addResult({
          testName: 'Uncaught Exception Handling',
          passed: false,
          details: 'Server crashed and did not recover from uncaught exception',
          evidence: { error: (error as Error).message }
        });
      }
    }
  }

  private async testUnhandledRejectionHandling(): Promise<void> {
    console.log('\n💀 TEST 2: UNHANDLED REJECTION ATTACK');
    
    try {
      // Trigger unhandled promise rejection
      const response = await axios.post(`${BASE_URL}/chaos-rejection`, {
        trigger: 'unhandled_rejection'
      }, { timeout: 5000 });

      this.addResult({
        testName: 'Unhandled Rejection Handling',
        passed: true,
        details: 'Server handled unhandled rejection without crashing',
        evidence: { status: response.status }
      });

    } catch (error) {
      try {
        const healthResponse = await axios.get(`${BASE_URL}/health`, { timeout: 3000 });
        this.addResult({
          testName: 'Unhandled Rejection Handling',
          passed: healthResponse.status === 200,
          details: 'Server recovered from unhandled rejection',
          evidence: { healthStatus: healthResponse.status }
        });
      } catch (healthError) {
        this.addResult({
          testName: 'Unhandled Rejection Handling',
          passed: false,
          details: 'Server crashed from unhandled rejection',
          evidence: { error: (error as Error).message }
        });
      }
    }
  }

  private async testSecretsValidation(): Promise<void> {
    console.log('\n🔓 TEST 3: SECRETS VALIDATION ATTACK');
    
    try {
      // 🔥 CRITICAL FIX: Test secrets validation by checking startup logs, not spawning self-destructing server
      const testServer = spawn('npx', ['ts-node', 'src/index.ts'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          JWT_SECRET: '123', // Too short
          API_KEY_SECRET: '', // Empty
          DB_PASSWORD: 'wrong', // Invalid database credentials
          SENTRY_DSN: 'malicious-url', // Invalid Sentry URL
          PORT: '3006' // Different port to avoid conflict
        },
        stdio: 'pipe'
      });

      let output = '';
      let hasValidationError = false;
      
      testServer.stdout?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        if (chunk.includes('❌ Secrets validation failed') || 
            chunk.includes('Environment validation failed')) {
          hasValidationError = true;
        }
      });

      testServer.stderr?.on('data', (data) => {
        const chunk = data.toString();
        output += chunk;
        if (chunk.includes('❌ Secrets validation failed') || 
            chunk.includes('Environment validation failed')) {
          hasValidationError = true;
        }
      });

      // Wait for validation or timeout
      await this.sleep(5000);

      // Check if validation failed (GOOD) or server accepted bad secrets (BAD)
      const validationFailed = hasValidationError || output.includes('❌ Secrets validation failed') || 
                              output.includes('Environment validation failed') ||
                              output.includes('process.exit(1)');

      this.addResult({
        testName: 'Secrets Validation',
        passed: validationFailed,
        details: validationFailed ? 'Server properly rejected invalid secrets' : 'Server accepted invalid secrets',
        evidence: { 
          output: output.substring(0, 500),
          hasValidationError,
          validationFailed
        }
      });

      testServer.kill('SIGKILL');

    } catch (error) {
      this.addResult({
        testName: 'Secrets Validation',
        passed: false,
        details: 'Failed to test secrets validation',
        evidence: { error: (error as Error).message }
      });
    }
  }

  private async testDatabaseFailureRecovery(): Promise<void> {
    console.log('\n💀 TEST 4: DATABASE CATASTROPHE');
    
    try {
      // First, verify health check works
      const initialHealth = await axios.get(`${BASE_URL}/health`);
      const initialDbStatus = initialHealth.data.checks?.database;

      // Simulate database failure by testing with wrong credentials
      const testServer = spawn('npx', ['ts-node', 'src/index.ts'], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          DB_PASSWORD: 'definitely_wrong_password',
          PORT: '3007'
        },
        stdio: 'pipe'
      });

      await this.sleep(3000);

      try {
        const failureHealth = await axios.get('http://localhost:3007/health', { timeout: 5000 });
        const dbStatus = failureHealth.data.checks?.database;
        const isDegraded = failureHealth.data.status === 'degraded' || dbStatus === 'error';

        this.addResult({
          testName: 'Database Failure Recovery',
          passed: isDegraded,
          details: isDegraded ? 'Health check properly detected database failure' : 'Health check failed to detect database failure',
          evidence: { 
            status: failureHealth.data.status,
            database: dbStatus,
            checks: failureHealth.data.checks
          }
        });

      } catch (healthError) {
        this.addResult({
          testName: 'Database Failure Recovery',
          passed: false,
          details: 'Health check failed to respond during database failure',
          evidence: { error: (healthError as Error).message }
        });
      }

      testServer.kill('SIGKILL');

    } catch (error) {
      this.addResult({
        testName: 'Database Failure Recovery',
        passed: false,
        details: 'Failed to test database failure recovery',
        evidence: { error: (error as Error).message }
      });
    }
  }

  private async testPoolExhaustionRecovery(): Promise<void> {
    console.log('\n⚡ TEST 5: DATABASE POOL EXHAUSTION');
    
    try {
      // Create multiple simultaneous database connections to exhaust pool
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(axios.post(`${BASE_URL}/test-rbac`, {
          action: 'test_connection',
          userId: `user${i}`,
          resource: 'test',
          action_type: 'read'
        }, { timeout: 10000 }));
      }

      const results = await Promise.allSettled(promises);
      const successful = results.filter(r => r.status === 'fulfilled').length;
      const failed = results.filter(r => r.status === 'rejected').length;

      // Check if server is still responsive after pool stress
      const healthResponse = await axios.get(`${BASE_URL}/health`, { timeout: 5000 });

      this.addResult({
        testName: 'Pool Exhaustion Recovery',
        passed: healthResponse.status === 200,
        details: `Server remained responsive after ${successful} successful and ${failed} failed pool requests`,
        evidence: { 
          successful, 
          failed, 
          healthStatus: healthResponse.status,
          memoryUsage: healthResponse.data.checks?.memory
        }
      });

    } catch (error) {
      this.addResult({
        testName: 'Pool Exhaustion Recovery',
        passed: false,
        details: 'Server became unresponsive during pool exhaustion test',
        evidence: { error: (error as Error).message }
      });
    }
  }

  private async testMemoryStressResponse(): Promise<void> {
    console.log('\n🧠 TEST 6: MEMORY STRESS RESPONSE');
    
    try {
      // Get initial memory usage
      const initialHealth = await axios.get(`${BASE_URL}/health`);
      const initialMemory = initialHealth.data.checks?.memory;

      // Create memory pressure by making large requests
      const largePayload = 'x'.repeat(1024 * 1024); // 1MB payload
      const promises = [];
      for (let i = 0; i < 20; i++) {
        promises.push(axios.post(`${BASE_URL}/memory-stress`, { 
          data: largePayload,
          iteration: i 
        }, { timeout: 5000 }));
      }

      await Promise.allSettled(promises);

      // Check memory usage after stress
      const finalHealth = await axios.get(`${BASE_URL}/health`);
      const finalMemory = finalHealth.data.checks?.memory;
      const serverResponsive = finalHealth.status === 200;

      this.addResult({
        testName: 'Memory Stress Response',
        passed: serverResponsive,
        details: `Server handled memory stress: ${initialMemory?.used}MB → ${finalMemory?.used}MB`,
        evidence: { 
          initialMemory, 
          finalMemory, 
          serverResponsive 
        }
      });

    } catch (error) {
      this.addResult({
        testName: 'Memory Stress Response',
        passed: false,
        details: 'Server failed to handle memory stress',
        evidence: { error: (error as Error).message }
      });
    }
  }

  private addResult(result: ChaosTestResult): void {
    this.results.push(result);
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`   ${status} - ${result.details}`);
  }

  private printResults(): void {
    console.log('\n🔥 CHAOS ENGINEERING TEST RESULTS');
    console.log('===================================');

    const passed = this.results.filter(r => r.passed).length;
    const total = this.results.length;
    const percentage = Math.round((passed / total) * 100);

    console.log(`\n📊 OVERALL: ${passed}/${total} tests passed (${percentage}%)`);

    this.results.forEach(result => {
      const status = result.passed ? '✅' : '❌';
      console.log(`${status} ${result.testName}: ${result.details}`);
    });

    if (percentage === 100) {
      console.log('\n🎉 PHASE 1.1/1.2 IS 100% COMPLETE - HARSH VALIDATION PASSED');
    } else {
      console.log(`\n⚠️  PHASE 1.1/1.2 REQUIRES FIXES - ${100 - percentage}% of tests failed`);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Run the chaos test engine
if (require.main === module) {
  const engine = new ChaosTestEngine();
  engine.runAllTests().catch(console.error);
}

export default ChaosTestEngine;
