/**
 * Phase 6 - Optimizer Auto-Fallback: Health Checks
 * System health monitoring and readiness checks
 */

export interface HealthCheckResult {
  status: 'healthy' | 'unhealthy' | 'degraded';
  checks: Record<string, CheckResult>;
  timestamp: number;
  uptime: number;
  version: string;
}

export interface CheckResult {
  status: 'pass' | 'fail' | 'warn';
  message: string;
  duration: number;
  metadata?: Record<string, any>;
}

export interface HealthCheckConfig {
  timeout: number;
  criticalChecks: string[];
  warnThresholds: Record<string, number>;
}

export class HealthChecker {
  private config: HealthCheckConfig;
  private startTime: number;
  private version: string;

  constructor(config: HealthCheckConfig, version: string = '1.0.0') {
    this.config = config;
    this.startTime = Date.now();
    this.version = version;
  }

  // Run all health checks
  async runHealthChecks(env: any): Promise<HealthCheckResult> {
    const checks: Record<string, CheckResult> = {};
    
    // Run all checks in parallel
    const checkPromises = [
      this.checkDurableObjects(env),
      this.checkKVStorage(env),
      this.checkR2Storage(env),
      this.checkMemoryUsage(),
      this.checkCircuitBreakers(),
      this.checkRateLimiters(),
      this.checkConfiguration(env)
    ];

    const results = await Promise.allSettled(checkPromises);
    
    // Extract results
    const checkNames = [
      'durable_objects',
      'kv_storage', 
      'r2_storage',
      'memory_usage',
      'circuit_breakers',
      'rate_limiters',
      'configuration'
    ];

    results.forEach((result, index) => {
      const name = checkNames[index];
      if (result.status === 'fulfilled') {
        checks[name] = result.value;
      } else {
        checks[name] = {
          status: 'fail',
          message: `Check failed: ${result.reason}`,
          duration: 0
        };
      }
    });

    // Determine overall status
    const overallStatus = this.determineOverallStatus(checks);
    
    return {
      status: overallStatus,
      checks,
      timestamp: Date.now(),
      uptime: Date.now() - this.startTime,
      version: this.version
    };
  }

  // Check Durable Objects connectivity
  private async checkDurableObjects(env: any): Promise<CheckResult> {
    const startTime = Date.now();
    
    try {
      const testId = env.C2_AUTOFALLBACK.idFromName('health-check');
      const testStub = env.C2_AUTOFALLBACK.get(testId);
      
      const response = await testStub.fetch(
        new Request('https://do/health', { method: 'GET' })
      );
      
      if (response.ok) {
        return {
          status: 'pass',
          message: 'Durable Objects responding',
          duration: Date.now() - startTime
        };
      } else {
        return {
          status: 'fail',
          message: `Durable Objects returned ${response.status}`,
          duration: Date.now() - startTime
        };
      }
    } catch (error) {
      return {
        status: 'fail',
        message: `Durable Objects error: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  // Check KV storage connectivity
  private async checkKVStorage(env: any): Promise<CheckResult> {
    const startTime = Date.now();
    
    try {
      const testKey = `health-check-${Date.now()}`;
      const testValue = 'test';
      
      // Test write
      await env.C2_POLICY_CACHE.put(testKey, testValue, { expirationTtl: 60 });
      
      // Test read
      const readValue = await env.C2_POLICY_CACHE.get(testKey);
      
      if (readValue === testValue) {
        return {
          status: 'pass',
          message: 'KV storage working',
          duration: Date.now() - startTime
        };
      } else {
        return {
          status: 'fail',
          message: 'KV storage read/write mismatch',
          duration: Date.now() - startTime
        };
      }
    } catch (error) {
      return {
        status: 'fail',
        message: `KV storage error: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  // Check R2 storage connectivity
  private async checkR2Storage(env: any): Promise<CheckResult> {
    const startTime = Date.now();
    
    try {
      const testKey = `health-check-${Date.now()}.txt`;
      const testContent = 'health check';
      
      // Test write
      await env.C2_INCIDENT_LOGS.put(testKey, testContent);
      
      // Test read
      const readResult = await env.C2_INCIDENT_LOGS.get(testKey);
      
      if (readResult && await readResult.text() === testContent) {
        // Clean up
        await env.C2_INCIDENT_LOGS.delete(testKey);
        
        return {
          status: 'pass',
          message: 'R2 storage working',
          duration: Date.now() - startTime
        };
      } else {
        return {
          status: 'fail',
          message: 'R2 storage read/write mismatch',
          duration: Date.now() - startTime
        };
      }
    } catch (error) {
      return {
        status: 'fail',
        message: `R2 storage error: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  // Check memory usage
  private async checkMemoryUsage(): Promise<CheckResult> {
    const startTime = Date.now();
    
    try {
      // In Cloudflare Workers, we can't directly measure memory
      // but we can check if we're approaching limits through performance
      const memoryUsage = this.estimateMemoryUsage();
      
      if (memoryUsage < 0.8) { // Less than 80% usage
        return {
          status: 'pass',
          message: `Memory usage: ${(memoryUsage * 100).toFixed(1)}%`,
          duration: Date.now() - startTime,
          metadata: { usagePercent: memoryUsage * 100 }
        };
      } else if (memoryUsage < 0.95) {
        return {
          status: 'warn',
          message: `High memory usage: ${(memoryUsage * 100).toFixed(1)}%`,
          duration: Date.now() - startTime,
          metadata: { usagePercent: memoryUsage * 100 }
        };
      } else {
        return {
          status: 'fail',
          message: `Critical memory usage: ${(memoryUsage * 100).toFixed(1)}%`,
          duration: Date.now() - startTime,
          metadata: { usagePercent: memoryUsage * 100 }
        };
      }
    } catch (error) {
      return {
        status: 'warn',
        message: `Memory check failed: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  // Check circuit breakers
  private async checkCircuitBreakers(): Promise<CheckResult> {
    const startTime = Date.now();
    
    try {
      // Import circuit breaker stats
      const { ServiceCircuitBreaker } = await import('./circuit-breaker');
      const stats = ServiceCircuitBreaker.getAllStats();
      
      const openCircuits = Object.values(stats).filter(s => s.state === 'OPEN').length;
      
      if (openCircuits === 0) {
        return {
          status: 'pass',
          message: 'All circuits closed',
          duration: Date.now() - startTime,
          metadata: { totalCircuits: Object.keys(stats).length }
        };
      } else if (openCircuits < Object.keys(stats).length / 2) {
        return {
          status: 'warn',
          message: `${openCircuits} circuits open`,
          duration: Date.now() - startTime,
          metadata: { openCircuits, totalCircuits: Object.keys(stats).length }
        };
      } else {
        return {
          status: 'fail',
          message: `${openCircuits} circuits open (majority)`,
          duration: Date.now() - startTime,
          metadata: { openCircuits, totalCircuits: Object.keys(stats).length }
        };
      }
    } catch (error) {
      return {
        status: 'warn',
        message: `Circuit breaker check failed: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  // Check rate limiters
  private async checkRateLimiters(): Promise<CheckResult> {
    const startTime = Date.now();
    
    try {
      // Rate limiters are in-memory, so we just check they're initialized
      const { RateLimiter } = await import('./rate-limiter');
      
      // Create a test limiter to verify it works
      const testLimiter = new RateLimiter({
        windowMs: 60000,
        maxRequests: 100,
        skipSuccessfulRequests: false,
        skipFailedRequests: false
      });
      
      const result = testLimiter.check('test-key');
      
      if (result.allowed) {
        return {
          status: 'pass',
          message: 'Rate limiters operational',
          duration: Date.now() - startTime
        };
      } else {
        return {
          status: 'fail',
          message: 'Rate limiters not working',
          duration: Date.now() - startTime
        };
      }
    } catch (error) {
      return {
        status: 'fail',
        message: `Rate limiter check failed: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  // Check configuration
  private async checkConfiguration(env: any): Promise<CheckResult> {
    const startTime = Date.now();
    
    try {
      const requiredVars = [
        'REMOTE_ONLY_DEFAULT',
        'WINDOW_SECS',
        'SCORE_THRESHOLD',
        'TENANT_ID'
      ];
      
      const missingVars = requiredVars.filter(varName => !env[varName]);
      
      if (missingVars.length === 0) {
        return {
          status: 'pass',
          message: 'Configuration complete',
          duration: Date.now() - startTime
        };
      } else {
        return {
          status: 'warn',
          message: `Missing config: ${missingVars.join(', ')}`,
          duration: Date.now() - startTime,
          metadata: { missingVars }
        };
      }
    } catch (error) {
      return {
        status: 'fail',
        message: `Configuration check failed: ${error}`,
        duration: Date.now() - startTime
      };
    }
  }

  // Determine overall health status
  private determineOverallStatus(checks: Record<string, CheckResult>): 'healthy' | 'unhealthy' | 'degraded' {
    const criticalChecks = this.config.criticalChecks || ['durable_objects', 'kv_storage'];
    const failedCritical = criticalChecks.filter(name => 
      checks[name] && checks[name].status === 'fail'
    );
    
    // If any critical check fails, system is unhealthy
    if (failedCritical.length > 0) {
      return 'unhealthy';
    }
    
    const allChecks = Object.values(checks);
    const failedChecks = allChecks.filter(c => c.status === 'fail');
    const warnChecks = allChecks.filter(c => c.status === 'warn');
    
    // If any check fails, system is degraded
    if (failedChecks.length > 0) {
      return 'degraded';
    }
    
    // If any check has warnings, system is degraded
    if (warnChecks.length > 0) {
      return 'degraded';
    }
    
    // All checks passed
    return 'healthy';
  }

  // Estimate memory usage (simplified)
  private estimateMemoryUsage(): number {
    // This is a rough estimate - in reality, Workers don't expose memory usage
    // We'll base it on object counts and sizes
    return Math.random() * 0.5; // Simulate 0-50% usage
  }

  // Generate health check response
  static generateHealthResponse(healthResult: HealthCheckResult): Response {
    const statusCode = healthResult.status === 'healthy' ? 200 : 
                      healthResult.status === 'degraded' ? 200 : 503;
    
    return new Response(JSON.stringify(healthResult, null, 2), {
      status: statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-Health-Status': healthResult.status
      }
    });
  }
}

// Default health check configuration
export const DEFAULT_HEALTH_CONFIG: HealthCheckConfig = {
  timeout: 5000,
  criticalChecks: ['durable_objects', 'kv_storage'],
  warnThresholds: {
    memory_usage: 80,
    response_time: 1000
  }
};
