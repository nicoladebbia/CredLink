import { Pool, PoolClient } from 'pg';
import { createClient, RedisClientType } from 'redis';
import { logger } from './logger.js';
import { HealthCheckResult, ServiceHealth } from './types.js';

export class HealthChecker {
  private pool: Pool;
  private redisClient: RedisClientType;
  private checkHistory: Map<string, HealthCheckResult[]> = new Map();
  private readonly MAX_HISTORY = 100;

  constructor(pool: Pool, redisClient: RedisClientType) {
    this.pool = pool;
    this.redisClient = redisClient;
  }

  async checkDatabaseHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const result = await this.pool.query('SELECT 1 as health_check');
      const responseTime = Date.now() - startTime;
      
      return {
        component: 'postgresql',
        status: 'healthy',
        responseTime,
        details: {
          connectionCount: this.pool.totalCount,
          idleCount: this.pool.idleCount,
          waitingCount: this.pool.waitingCount
        },
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        component: 'postgresql',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Unknown database error',
        lastChecked: new Date()
      };
    }
  }

  async checkRedisHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const pong = await this.redisClient.ping();
      const responseTime = Date.now() - startTime;
      const info = await this.redisClient.info('memory');
      
      return {
        component: 'redis',
        status: pong === 'PONG' ? 'healthy' : 'unhealthy',
        responseTime,
        details: {
          ping: pong,
          memory: this.parseRedisMemoryInfo(info)
        },
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        component: 'redis',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Redis connection failed',
        lastChecked: new Date()
      };
    }
  }

  async checkManifestStoreHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      const manifestStoreUrl = process.env.MANIFEST_STORE_URL || 'http://localhost:3002';
      const response = await fetch(`${manifestStoreUrl}/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      const responseTime = Date.now() - startTime;
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const health = await response.json() as Record<string, any>;
      
      return {
        component: 'manifest_store',
        status: health.status === 'healthy' ? 'healthy' : 'degraded',
        responseTime,
        details: health,
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        component: 'manifest_store',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Manifest store unavailable',
        lastChecked: new Date()
      };
    }
  }

  async checkC2PAServiceHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // Test C2PA SDK functionality
      const testManifest = {
        claim_generator: 'test',
        timestamp: new Date().toISOString()
      };
      
      // This would be a mock validation to test the SDK
      const isValid = await this.validateC2PAManifest(testManifest);
      const responseTime = Date.now() - startTime;
      
      return {
        component: 'c2pa_sdk',
        status: isValid ? 'healthy' : 'degraded',
        responseTime,
        details: {
          sdk_version: '1.0.0', // Would be dynamic
          test_validation_passed: isValid
        },
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        component: 'c2pa_sdk',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'C2PA SDK error',
        lastChecked: new Date()
      };
    }
  }

  async checkCertificateManagerHealth(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    try {
      // Check certificate availability and expiration
      const cert = await this.getCurrentCertificate();
      const responseTime = Date.now() - startTime;
      
      const now = new Date();
      const expiresAt = new Date(cert.expires_at);
      const daysUntilExpiration = Math.floor((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      
      let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';
      if (daysUntilExpiration < 7) {
        status = 'degraded';
      }
      if (daysUntilExpiration < 1) {
        status = 'unhealthy';
      }
      
      return {
        component: 'certificate_manager',
        status,
        responseTime,
        details: {
          certificate_id: cert.id,
          expires_at: cert.expires_at,
          days_until_expiration: daysUntilExpiration
        },
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        component: 'certificate_manager',
        status: 'unhealthy',
        responseTime: Date.now() - startTime,
        errorMessage: error instanceof Error ? error.message : 'Certificate manager error',
        lastChecked: new Date()
      };
    }
  }

  async getOverallHealth(): Promise<ServiceHealth> {
    const checks = await Promise.allSettled([
      this.checkDatabaseHealth(),
      this.checkRedisHealth(),
      this.checkManifestStoreHealth(),
      this.checkC2PAServiceHealth(),
      this.checkCertificateManagerHealth()
    ]);

    const results: HealthCheckResult[] = checks
      .filter((result): result is PromiseFulfilledResult<HealthCheckResult> => result.status === 'fulfilled')
      .map(result => result.value);

    // Handle failed promises
    checks.forEach((result, index) => {
      if (result.status === 'rejected') {
        const components = ['postgresql', 'redis', 'manifest_store', 'c2pa_sdk', 'certificate_manager'];
        results.push({
          component: components[index],
          status: 'unhealthy',
          errorMessage: result.reason?.message || 'Health check failed',
          lastChecked: new Date()
        });
      }
    });

    const overallStatus = this.calculateOverallStatus(results);
    
    return {
      service: 'credlink-api',
      overallStatus,
      checks: results,
      uptime: process.uptime(),
      version: process.env.APP_VERSION || '1.0.0',
      timestamp: new Date()
    };
  }

  private calculateOverallStatus(checks: HealthCheckResult[]): 'healthy' | 'degraded' | 'unhealthy' {
    const unhealthyCount = checks.filter(c => c.status === 'unhealthy').length;
    const degradedCount = checks.filter(c => c.status === 'degraded').length;
    
    if (unhealthyCount > 0) return 'unhealthy';
    if (degradedCount > 0) return 'degraded';
    return 'healthy';
  }

  private parseRedisMemoryInfo(info: string): Record<string, string> {
    const lines = info.split('\r\n');
    const memory: Record<string, string> = {};
    
    for (const line of lines) {
      if (line.startsWith('used_memory:')) {
        memory.used = line.split(':')[1];
      }
      if (line.startsWith('used_memory_human:')) {
        memory.used_human = line.split(':')[1];
      }
    }
    
    return memory;
  }

  private async validateC2PAManifest(manifest: any): Promise<boolean> {
    // Mock C2PA validation - would use actual SDK
    return manifest && manifest.claim_generator && manifest.timestamp;
  }

  private async getCurrentCertificate(): Promise<any> {
    // Mock certificate check - would query actual certificate manager
    return {
      id: 'cert-123',
      expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() // 30 days from now
    };
  }
}
