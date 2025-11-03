// Phase 21.9 Health Endpoints Implementation
// /healthz and /readyz endpoints for DR monitoring

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StorageService } from './services/storage';
import { DurableObjectService } from './services/durable-objects';
import { SignerService } from './services/signer';
import { QueueService } from './services/queue';

interface HealthStatus {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  region: string;
  checks: {
    database: HealthCheck;
    storage: HealthCheck;
    durable_objects: HealthCheck;
    signer: HealthCheck;
    queue: HealthCheck;
  };
}

interface HealthCheck {
  status: 'ok' | 'error';
  latency_ms?: number;
  error?: string;
  details?: any;
}

interface ReadinessStatus extends HealthStatus {
  ready: boolean;
  replication_lag_seconds: number;
  queue_depth: number;
  leader_status: {
    is_leader: boolean;
    lease_expires?: string;
    last_heartbeat?: string;
  };
}

export class HealthEndpoints {
  private startTime: Date;
  private version: string;
  private region: string;
  private isPrimary: boolean;

  constructor(
    private storageService: StorageService,
    private durableObjectService: DurableObjectService,
    private signerService: SignerService,
    private queueService: QueueService
  ) {
    this.startTime = new Date();
    this.version = process.env.APP_VERSION || '1.0.0';
    this.region = process.env.REGION || 'enam';
    this.isPrimary = process.env.IS_PRIMARY === 'true';
  }

  async registerRoutes(fastify: FastifyInstance) {
    // Basic health check - for load balancer failover
    fastify.get('/healthz', {
      schema: {
        description: 'Basic health check for load balancer',
        tags: ['health'],
        response: {
          200: {
            type: 'string',
            description: 'Service is healthy'
          },
          503: {
            type: 'string',
            description: 'Service is unhealthy'
          }
        }
      }
    }, this.healthz.bind(this));

    // Readiness check - for traffic routing
    fastify.get('/readyz', {
      schema: {
        description: 'Readiness check for service dependencies',
        tags: ['health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              ready: { type: 'boolean' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              version: { type: 'string' },
              region: { type: 'string' },
              replication_lag_seconds: { type: 'number' },
              queue_depth: { type: 'number' },
              checks: {
                type: 'object',
                properties: {
                  database: { type: 'object' },
                  storage: { type: 'object' },
                  durable_objects: { type: 'object' },
                  signer: { type: 'object' },
                  queue: { type: 'object' }
                }
              }
            }
          }
        }
      }
    }, this.readyz.bind(this));

    // Detailed health check - for monitoring
    fastify.get('/health', {
      schema: {
        description: 'Detailed health check with all components',
        tags: ['health']
      }
    }, this.health.bind(this));

    // Live status check - for status page
    fastify.get('/status', {
      schema: {
        description: 'Live status for public status page',
        tags: ['health']
      }
    }, this.status.bind(this));
  }

  // Basic health check - returns simple "ok" or error
  private async healthz(request: FastifyRequest, reply: FastifyReply) {
    try {
      // Check if process is alive
      const uptime = Date.now() - this.startTime.getTime();
      
      // Basic checks that should always pass if service is running
      if (uptime < 0) {
        throw new Error('Invalid uptime');
      }

      reply.type('text/plain').send('ok');
    } catch (error) {
      request.log.error('Health check failed:', error);
      reply.code(503).type('text/plain').send('error');
    }
  }

  // Readiness check - verifies all dependencies are ready
  private async readyz(request: FastifyRequest, reply: FastifyReply) {
    try {
      const status = await this.getReadinessStatus();
      
      if (status.ready) {
        reply.code(200).send(status);
      } else {
        reply.code(503).send(status);
      }
    } catch (error) {
      request.log.error('Readiness check failed:', error);
      reply.code(503).send({
        status: 'error',
        ready: false,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Detailed health check
  private async health(request: FastifyRequest, reply: FastifyReply) {
    try {
      const status = await this.getHealthStatus();
      reply.code(200).send(status);
    } catch (error) {
      request.log.error('Health check failed:', error);
      reply.code(503).send({
        status: 'error',
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  // Live status for public status page
  private async status(request: FastifyRequest, reply: FastifyReply) {
    try {
      const healthStatus = await this.getHealthStatus();
      const readinessStatus = await this.getReadinessStatus();
      
      const publicStatus = {
        service: `verify-api-${this.region}`,
        status: healthStatus.status,
        region: this.region,
        is_primary: this.isPrimary,
        uptime_seconds: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
        version: this.version,
        timestamp: new Date().toISOString(),
        checks: {
          storage: healthStatus.checks.storage.status,
          durable_objects: healthStatus.checks.durable_objects.status,
          signer: healthStatus.checks.signer.status,
          queue: healthStatus.checks.queue.status
        },
        metrics: {
          replication_lag_seconds: readinessStatus.replication_lag_seconds,
          queue_depth: readinessStatus.queue_depth,
          leader_status: readinessStatus.leader_status
        }
      };

      reply.code(200).send(publicStatus);
    } catch (error) {
      request.log.error('Status check failed:', error);
      reply.code(503).send({
        service: `verify-api-${this.region}`,
        status: 'error',
        region: this.region,
        timestamp: new Date().toISOString(),
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  }

  private async getHealthStatus(): Promise<HealthStatus> {
    const startTime = Date.now();
    
    const checks = {
      database: await this.checkDatabase(),
      storage: await this.checkStorage(),
      durable_objects: await this.checkDurableObjects(),
      signer: await this.checkSigner(),
      queue: await this.checkQueue()
    };

    const overallStatus = Object.values(checks).every(check => check.status === 'ok') ? 'ok' : 'error';

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: Date.now() - this.startTime.getTime(),
      version: this.version,
      region: this.region,
      checks,
      latency_ms: Date.now() - startTime
    } as HealthStatus;
  }

  private async getReadinessStatus(): Promise<ReadinessStatus> {
    const healthStatus = await this.getHealthStatus();
    
    // Additional readiness checks
    const replicationLag = await this.getReplicationLag();
    const queueDepth = await this.getQueueDepth();
    const leaderStatus = await this.getLeaderStatus();
    
    // Service is ready if:
    // 1. All health checks pass
    // 2. Replication lag is acceptable (< 5 minutes)
    // 3. Queue depth is not critical (< 1000 items)
    // 4. Either this is primary and has leadership, or this is standby
    const ready = 
      healthStatus.status === 'ok' &&
      replicationLag < 300 && // 5 minutes
      queueDepth < 1000 &&
      (!this.isPrimary || leaderStatus.is_leader);

    return {
      ...healthStatus,
      ready,
      replication_lag_seconds: replicationLag,
      queue_depth: queueDepth,
      leader_status: leaderStatus
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Simple database connectivity check
      await this.storageService.ping();
      
      return {
        status: 'ok',
        latency_ms: Date.now() - startTime
      };
    } catch (error) {
      return {
        status: 'error',
        latency_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Database check failed'
      };
    }
  }

  private async checkStorage(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check R2 bucket connectivity
      const bucketName = process.env.R2_BUCKET || 'manifests-enam';
      await this.storageService.checkBucket(bucketName);
      
      return {
        status: 'ok',
        latency_ms: Date.now() - startTime,
        details: { bucket: bucketName }
      };
    } catch (error) {
      return {
        status: 'error',
        latency_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Storage check failed'
      };
    }
  }

  private async checkDurableObjects(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check Durable Object connectivity
      const coordinatorName = process.env.DO_COORDINATOR || 'leader-coordinator-enam';
      await this.durableObjectService.ping(coordinatorName);
      
      return {
        status: 'ok',
        latency_ms: Date.now() - startTime,
        details: { coordinator: coordinatorName }
      };
    } catch (error) {
      return {
        status: 'error',
        latency_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Durable Objects check failed'
      };
    }
  }

  private async checkSigner(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check signer service connectivity
      await this.signerService.healthCheck();
      
      return {
        status: 'ok',
        latency_ms: Date.now() - startTime
      };
    } catch (error) {
      return {
        status: 'error',
        latency_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Signer check failed'
      };
    }
  }

  private async checkQueue(): Promise<HealthCheck> {
    const startTime = Date.now();
    
    try {
      // Check queue service connectivity
      await this.queueService.ping();
      
      return {
        status: 'ok',
        latency_ms: Date.now() - startTime
      };
    } catch (error) {
      return {
        status: 'error',
        latency_ms: Date.now() - startTime,
        error: error instanceof Error ? error.message : 'Queue check failed'
      };
    }
  }

  private async getReplicationLag(): Promise<number> {
    try {
      if (!this.isPrimary) {
        return 0; // Standby doesn't track replication lag
      }
      
      const primaryBucket = process.env.R2_BUCKET || 'manifests-enam';
      const standbyBucket = process.env.REPLICATION_BUCKET || 'manifests-weur';
      
      return await this.storageService.getReplicationLag(primaryBucket, standbyBucket);
    } catch (error) {
      return 999; // Return high value to indicate error
    }
  }

  private async getQueueDepth(): Promise<number> {
    try {
      return await this.queueService.getDepth();
    } catch (error) {
      return 999; // Return high value to indicate error
    }
  }

  private async getLeaderStatus(): Promise<{
    is_leader: boolean;
    lease_expires?: string;
    last_heartbeat?: string;
  }> {
    try {
      if (!this.isPrimary) {
        return { is_leader: false };
      }
      
      return await this.durableObjectService.getLeaderStatus();
    } catch (error) {
      return { is_leader: false };
    }
  }
}
