/**
 * Phase 58 - Cost Engine v2 (FinOps)
 * Main orchestration engine for cost ingestion, allocation, detection, and remediation
 *
 * Purpose: Predict and prevent margin erosion before invoices land
 * Architecture: Ingest → Allocate → Detect → Act → Monitor
 */

import dotenv from 'dotenv';
import cron from 'node-cron';
import { createLogger } from './utils/logger.js';
import { CURReader } from '../ingestion/aws-cur/cur-reader.js';
import { LogpushReader } from '../ingestion/cloudflare-logpush/logpush-reader.js';
import { UsageReader } from '../ingestion/cloudflare-usage/usage-reader.js';
import { TSAMetrics } from '../ingestion/tsa-metrics/tsa-metrics.js';
import { CostAllocator } from '../allocation/allocator.js';
import { AnomalyDetector } from '../detection/anomaly-detector.js';
import { PolicyEngine } from '../policy/policy-engine.js';
import { DashboardServer } from '../dashboards/server.js';

// Security: Validate environment before loading
const requiredEnvVars = [
  'DB_HOST',
  'DB_PORT',
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'AWS_REGION',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_ACCOUNT_ID'
];

// Load environment configuration
dotenv.config();

// Security: Validate required environment variables
const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
if (missingVars.length > 0) {
  console.error('Missing required environment variables:', missingVars.join(', '));
  process.exit(1);
}

// Security: Set secure process defaults
process.env.NODE_ENV = process.env.NODE_ENV || 'production';
process.title = 'phase58-cost-engine';

const logger = createLogger('CostEngine');

/**
 * Cost Engine v2 - Main orchestration class
 */
class CostEngineV2 {
  constructor() {
    this.isInitialized = false;
    this.isShuttingDown = false;
    this.activeJobs = new Set();

    // Security: Validate component initialization
    try {
      this.curReader = new CURReader();
      this.logpushReader = new LogpushReader();
      this.usageReader = new UsageReader();
      this.tsaMetrics = new TSAMetrics();
      this.allocator = new CostAllocator();
      this.detector = new AnomalyDetector();
      this.policyEngine = new PolicyEngine();
      this.dashboard = new DashboardServer();
    } catch (error) {
      logger.error('Component initialization failed', { error: error.message });
      throw error;
    }

    this.isRunning = false;
  }

  /**
   * Initialize all components with validation
   */
  async initialize() {
    if (this.isInitialized) {
      logger.warn('Cost Engine already initialized');
      return true;
    }

    logger.info('Initializing Cost Engine v2...');

    try {
      // Security: Initialize database connections with timeout
      const initPromises = [
        this.allocator.initialize(),
        this.detector.initialize(),
        this.policyEngine.initialize()
      ];

      await Promise.race([
        Promise.all(initPromises),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Initialization timeout')), 30000)
        )
      ]);

      // Start dashboard server
      await this.dashboard.start();

      this.isInitialized = true;
      logger.info('Cost Engine v2 initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Cost Engine v2', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Run hourly ingestion cycle with enhanced error handling
   */
  async runIngestCycle() {
    const jobId = 'ingest-cycle';

    if (this.isRunning || this.isShuttingDown) {
      logger.warn('Ingest cycle skipped - running or shutting down');
      return;
    }

    if (this.activeJobs.has(jobId)) {
      logger.warn('Ingest cycle already active');
      return;
    }

    this.activeJobs.add(jobId);
    this.isRunning = true;

    const startTime = Date.now();
    logger.info('Starting hourly ingest cycle');

    try {
      // Parallel ingestion from all sources with individual error handling
      const [curData, logpushData, usageData, tsaData] = await Promise.allSettled([
        this.curReader.readLatest(),
        this.logpushReader.readLatest(),
        this.usageReader.readLatest(),
        this.tsaMetrics.readLatest()
      ]);

      // Process results with detailed error tracking
      const results = {
        cur: curData.status === 'fulfilled' ? curData.value : null,
        logpush: logpushData.status === 'fulfilled' ? logpushData.value : null,
        usage: usageData.status === 'fulfilled' ? usageData.value : null,
        tsa: tsaData.status === 'fulfilled' ? tsaData.value : null
      };

      // Log individual failures
      if (curData.status === 'rejected') {
        logger.error('CUR ingestion failed', { error: curData.reason.message });
      }
      if (logpushData.status === 'rejected') {
        logger.error('Logpush ingestion failed', { error: logpushData.reason.message });
      }
      if (usageData.status === 'rejected') {
        logger.error('Usage ingestion failed', { error: usageData.reason.message });
      }
      if (tsaData.status === 'rejected') {
        logger.error('TSA metrics ingestion failed', { error: tsaData.reason.message });
      }

      const ingestedCount = Object.values(results).filter(r => r !== null).length;
      const duration = Date.now() - startTime;

      logger.info('Ingest cycle completed', {
        duration: `${duration}ms`,
        successRate: `${ingestedCount}/4`,
        sources: Object.keys(results).filter(k => results[k] !== null)
      });

      // Run allocation if we have data
      if (ingestedCount > 0) {
        await this.runAllocationCycle(results);
      }
    } catch (error) {
      logger.error('Ingest cycle failed', {
        error: error.message,
        duration: `${Date.now() - startTime}ms`
      });
    } finally {
      this.isRunning = false;
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Run cost allocation cycle with data validation
   */
  async runAllocationCycle(ingestedData) {
    const jobId = 'allocation-cycle';

    if (this.activeJobs.has(jobId)) {
      logger.warn('Allocation cycle already active');
      return;
    }

    this.activeJobs.add(jobId);
    const startTime = Date.now();

    logger.info('Starting allocation cycle');

    try {
      // Security: Validate ingested data before allocation
      if (!ingestedData || typeof ingestedData !== 'object') {
        throw new Error('Invalid ingested data format');
      }

      const allocationResult = await this.allocator.allocate(ingestedData);

      // Security: Validate allocation result
      if (!allocationResult || typeof allocationResult !== 'object') {
        throw new Error('Invalid allocation result');
      }

      const duration = Date.now() - startTime;

      logger.info('Allocation cycle completed', {
        duration: `${duration}ms`,
        allocatedLines: allocationResult.allocatedLines || 0,
        unallocatedLines: allocationResult.unallocatedLines || 0,
        confidenceAvg: allocationResult.confidenceAvg || 0
      });

      // Run detection after allocation
      await this.runDetectionCycle();
    } catch (error) {
      logger.error('Allocation cycle failed', {
        error: error.message,
        duration: `${Date.now() - startTime}ms`
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Run anomaly detection cycle with result validation
   */
  async runDetectionCycle() {
    const jobId = 'detection-cycle';

    if (this.activeJobs.has(jobId)) {
      logger.warn('Detection cycle already active');
      return;
    }

    this.activeJobs.add(jobId);
    const startTime = Date.now();

    logger.info('Starting detection cycle');

    try {
      const anomalies = await this.detector.detect();

      // Security: Validate anomalies array
      if (!Array.isArray(anomalies)) {
        throw new Error('Invalid anomalies detection result');
      }

      const duration = Date.now() - startTime;
      const highConfidence = anomalies.filter(a => a && a.confidence >= 0.8).length;

      logger.info('Detection cycle completed', {
        duration: `${duration}ms`,
        anomaliesFound: anomalies.length,
        highConfidence
      });

      // Process anomalies through policy engine
      if (anomalies.length > 0) {
        await this.runPolicyCycle(anomalies);
      }
    } catch (error) {
      logger.error('Detection cycle failed', {
        error: error.message,
        duration: `${Date.now() - startTime}ms`
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Run policy engine cycle with action validation
   */
  async runPolicyCycle(anomalies) {
    const jobId = 'policy-cycle';

    if (this.activeJobs.has(jobId)) {
      logger.warn('Policy cycle already active');
      return;
    }

    this.activeJobs.add(jobId);
    const startTime = Date.now();

    logger.info('Starting policy cycle', { anomalies: anomalies.length });

    try {
      // Security: Validate anomalies input
      if (!Array.isArray(anomalies) || anomalies.length === 0) {
        logger.warn('No valid anomalies to process');
        return;
      }

      const actions = await this.policyEngine.processAnomalies(anomalies);

      // Security: Validate actions result
      if (!Array.isArray(actions)) {
        throw new Error('Invalid policy engine result');
      }

      const duration = Date.now() - startTime;

      logger.info('Policy cycle completed', {
        duration: `${duration}ms`,
        actionsRecommended: actions.filter(a => a && a.status === 'recommended').length,
        actionsAutoApplied: actions.filter(a => a && a.status === 'applied').length,
        actionsAwaitingApproval: actions.filter(a => a && a.status === 'pending_approval').length
      });
    } catch (error) {
      logger.error('Policy cycle failed', {
        error: error.message,
        duration: `${Date.now() - startTime}ms`
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }

  /**
   * Start scheduled jobs with validation
   */
  startScheduledJobs() {
    if (!this.isInitialized) {
      throw new Error('Cannot start scheduled jobs - engine not initialized');
    }

    logger.info('Starting scheduled jobs');

    // Security: Validate cron schedules
    const schedules = [
      { name: 'ingestion', pattern: '0 * * * *', handler: () => this.runIngestCycle() },
      { name: 'detection', pattern: '15 * * * *', handler: () => this.runDetectionCycle() }
    ];

    schedules.forEach(({ name, pattern, handler }) => {
      if (!cron.validate(pattern)) {
        throw new Error(`Invalid cron pattern for ${name}: ${pattern}`);
      }

      cron.schedule(pattern, async () => {
        if (this.isShuttingDown) {
          logger.warn(`Skipping scheduled ${name} - system shutting down`);
          return;
        }

        logger.info(`Scheduled: Running ${name} cycle`);
        try {
          await handler();
        } catch (error) {
          logger.error(`Scheduled ${name} cycle failed`, { error: error.message });
        }
      });
    });

    logger.info('Scheduled jobs started');
  }

  /**
   * Graceful shutdown with timeout
   */
  async shutdown() {
    if (this.isShuttingDown) {
      logger.warn('Shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    logger.info('Shutting down Cost Engine v2...');

    try {
      // Wait for active jobs to complete or timeout
      const shutdownTimeout = 30000;
      const shutdownStart = Date.now();

      while (this.activeJobs.size > 0 && Date.now() - shutdownStart < shutdownTimeout) {
        logger.info('Waiting for active jobs to complete', {
          activeJobs: Array.from(this.activeJobs)
        });
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      // Force shutdown if timeout exceeded
      if (this.activeJobs.size > 0) {
        logger.warn('Shutdown timeout exceeded, forcing exit', {
          remainingJobs: Array.from(this.activeJobs)
        });
      }

      // Shutdown components in order
      const shutdownPromises = [
        this.dashboard.stop(),
        this.allocator.close(),
        this.detector.close(),
        this.policyEngine.close()
      ];

      await Promise.allSettled(shutdownPromises);

      logger.info('Cost Engine v2 shut down successfully');
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
    }
  }
}

/**
 * Main execution with comprehensive error handling
 */
async function main() {
  const engine = new CostEngineV2();

  try {
    // Security: Set process limits
    process.setMaxListeners(20);

    // Initialize with timeout
    await Promise.race([
      engine.initialize(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Initialization timeout')), 60000)
      )
    ]);

    // Run initial cycle immediately
    logger.info('Running initial ingest cycle');
    await engine.runIngestCycle();

    // Start scheduled jobs
    engine.startScheduledJobs();

    logger.info('Cost Engine v2 is running successfully');
  } catch (error) {
    logger.error('Fatal error in main', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  }

  // Security: Enhanced signal handlers
  const handleShutdown = async signal => {
    logger.info(`${signal} received, initiating graceful shutdown`);

    // Prevent multiple shutdown attempts
    process.removeAllListeners();

    try {
      await Promise.race([
        engine.shutdown(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Shutdown timeout')), 45000))
      ]);
      process.exit(0);
    } catch (error) {
      logger.error('Shutdown failed', { error: error.message });
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));

  // Security: Handle uncaught exceptions
  process.on('uncaughtException', error => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled rejection', {
      reason: reason?.message || reason,
      promise: promise.toString()
    });
    process.exit(1);
  });
}

// Security: Validate execution context
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error('Unhandled error in main execution:', error.message);
    process.exit(1);
  });
}

export { CostEngineV2 };
