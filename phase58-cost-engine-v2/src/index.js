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

// Load environment configuration
dotenv.config();

const logger = createLogger('CostEngine');

/**
 * Cost Engine v2 - Main orchestration class
 */
class CostEngineV2 {
  constructor() {
    this.curReader = new CURReader();
    this.logpushReader = new LogpushReader();
    this.usageReader = new UsageReader();
    this.tsaMetrics = new TSAMetrics();
    this.allocator = new CostAllocator();
    this.detector = new AnomalyDetector();
    this.policyEngine = new PolicyEngine();
    this.dashboard = new DashboardServer();
    
    this.isRunning = false;
  }

  /**
   * Initialize all components
   */
  async initialize() {
    logger.info('Initializing Cost Engine v2...');
    
    try {
      // Initialize database connections
      await this.allocator.initialize();
      await this.detector.initialize();
      await this.policyEngine.initialize();
      
      // Start dashboard server
      await this.dashboard.start();
      
      logger.info('Cost Engine v2 initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Cost Engine v2', { error: error.message });
      throw error;
    }
  }

  /**
   * Run hourly ingestion cycle
   * AWS CUR updates 3× daily, but we check hourly for new data
   */
  async runIngestCycle() {
    if (this.isRunning) {
      logger.warn('Ingest cycle already running, skipping');
      return;
    }

    this.isRunning = true;
    logger.info('Starting hourly ingest cycle');

    try {
      // Parallel ingestion from all sources
      const [curData, logpushData, usageData, tsaData] = await Promise.all([
        this.curReader.readLatest().catch(err => {
          logger.error('CUR ingestion failed', { error: err.message });
          return null;
        }),
        this.logpushReader.readLatest().catch(err => {
          logger.error('Logpush ingestion failed', { error: err.message });
          return null;
        }),
        this.usageReader.readLatest().catch(err => {
          logger.error('Usage ingestion failed', { error: err.message });
          return null;
        }),
        this.tsaMetrics.readLatest().catch(err => {
          logger.error('TSA metrics ingestion failed', { error: err.message });
          return null;
        })
      ]);

      const ingestedCount = [curData, logpushData, usageData, tsaData].filter(d => d !== null).length;
      logger.info(`Ingest cycle completed: ${ingestedCount}/4 sources successful`);

      // Run allocation if we have data
      if (ingestedCount > 0) {
        await this.runAllocationCycle();
      }
    } catch (error) {
      logger.error('Ingest cycle failed', { error: error.message });
    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Run cost allocation cycle
   * Maps costs to tenants using FinOps best practices
   */
  async runAllocationCycle() {
    logger.info('Starting allocation cycle');

    try {
      const allocationResult = await this.allocator.allocate();
      
      logger.info('Allocation cycle completed', {
        allocatedLines: allocationResult.allocatedLines,
        unallocatedLines: allocationResult.unallocatedLines,
        confidenceAvg: allocationResult.confidenceAvg
      });

      // Run detection after allocation
      await this.runDetectionCycle();
    } catch (error) {
      logger.error('Allocation cycle failed', { error: error.message });
    }
  }

  /**
   * Run anomaly detection cycle
   * Combines rule-based and baseline-based detection
   */
  async runDetectionCycle() {
    logger.info('Starting detection cycle');

    try {
      const anomalies = await this.detector.detect();
      
      logger.info('Detection cycle completed', {
        anomaliesFound: anomalies.length,
        highConfidence: anomalies.filter(a => a.confidence >= 0.8).length
      });

      // Process anomalies through policy engine
      if (anomalies.length > 0) {
        await this.runPolicyCycle(anomalies);
      }
    } catch (error) {
      logger.error('Detection cycle failed', { error: error.message });
    }
  }

  /**
   * Run policy engine cycle
   * Recommends or auto-applies remediation actions
   */
  async runPolicyCycle(anomalies) {
    logger.info('Starting policy cycle', { anomalies: anomalies.length });

    try {
      const actions = await this.policyEngine.processAnomalies(anomalies);
      
      logger.info('Policy cycle completed', {
        actionsRecommended: actions.filter(a => a.status === 'recommended').length,
        actionsAutoApplied: actions.filter(a => a.status === 'applied').length,
        actionsAwaitingApproval: actions.filter(a => a.status === 'pending_approval').length
      });
    } catch (error) {
      logger.error('Policy cycle failed', { error: error.message });
    }
  }

  /**
   * Start scheduled jobs
   */
  startScheduledJobs() {
    logger.info('Starting scheduled jobs');

    // Hourly ingestion (at minute 0)
    cron.schedule('0 * * * *', async () => {
      logger.info('Scheduled: Running hourly ingest cycle');
      await this.runIngestCycle();
    });

    // Detection every hour (at minute 15)
    cron.schedule('15 * * * *', async () => {
      logger.info('Scheduled: Running detection cycle');
      await this.runDetectionCycle();
    });

    logger.info('Scheduled jobs started');
  }

  /**
   * Graceful shutdown
   */
  async shutdown() {
    logger.info('Shutting down Cost Engine v2...');

    try {
      await this.dashboard.stop();
      await this.allocator.close();
      await this.detector.close();
      await this.policyEngine.close();
      
      logger.info('Cost Engine v2 shut down successfully');
    } catch (error) {
      logger.error('Error during shutdown', { error: error.message });
    }
  }
}

/**
 * Main execution
 */
async function main() {
  const engine = new CostEngineV2();

  try {
    // Initialize
    await engine.initialize();

    // Run initial cycle immediately
    logger.info('Running initial ingest cycle');
    await engine.runIngestCycle();

    // Start scheduled jobs
    engine.startScheduledJobs();

    logger.info('Cost Engine v2 is running');
  } catch (error) {
    logger.error('Fatal error in main', { error: error.message });
    process.exit(1);
  }

  // Graceful shutdown handlers
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received');
    await engine.shutdown();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.info('SIGINT received');
    await engine.shutdown();
    process.exit(0);
  });
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    logger.error('Unhandled error in main', { error: error.message });
    process.exit(1);
  });
}

export { CostEngineV2 };
