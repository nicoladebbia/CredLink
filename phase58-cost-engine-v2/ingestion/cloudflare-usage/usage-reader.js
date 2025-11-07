/**
 * Cloudflare Usage Reader
 * Reads Workers and R2 usage data via Cloudflare Analytics API
 * 
 * Workers Pricing: https://developers.cloudflare.com/workers/platform/pricing/
 * R2 Pricing: https://developers.cloudflare.com/r2/pricing/
 * 
 * R2 Zero Egress: No charges for egress when serving from R2
 */

import axios from 'axios';
import { createLogger } from '../../src/utils/logger.js';

const logger = createLogger('UsageReader');

export class UsageReader {
  constructor() {
    this.apiToken = process.env.CLOUDFLARE_API_TOKEN;
    this.accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
    this.zoneIds = (process.env.CLOUDFLARE_ZONE_IDS || '').split(',').filter(z => z);
    
    // Security: Validate configuration
    if (!this.apiToken) {
      throw new Error('CLOUDFLARE_API_TOKEN environment variable is required');
    }
    if (!this.accountId) {
      throw new Error('CLOUDFLARE_ACCOUNT_ID environment variable is required');
    }

    this.baseUrl = 'https://api.cloudflare.com/client/v4';
    
    // Pricing (USD, from env or defaults)
    this.pricing = {
      workersRequestPrice: parseFloat(process.env.WORKERS_PRICE_PER_REQUEST) || 0.00000015,
      workersCpuMsPrice: parseFloat(process.env.WORKERS_PRICE_PER_CPU_MS) || 0.000002,
      r2StorageGbPrice: parseFloat(process.env.R2_PRICE_PER_GB_MONTH) || 0.015,
      r2ClassAOpPrice: parseFloat(process.env.R2_PRICE_PER_CLASS_A_OP) || 0.0000045,
      r2ClassBOpPrice: parseFloat(process.env.R2_PRICE_PER_CLASS_B_OP) || 0.00000036,
      r2EgressPrice: parseFloat(process.env.R2_EGRESS_PRICE) || 0.0 // Zero egress!
    };
  }

  /**
   * Read latest usage data
   */
  async readLatest() {
    logger.info('Reading latest Cloudflare usage data');

    try {
      const [workersUsage, r2Usage] = await Promise.all([
        this.getWorkersUsage(),
        this.getR2Usage()
      ]);

      const costs = this.calculateCosts(workersUsage, r2Usage);

      logger.info('Usage data read successfully', {
        workers: workersUsage,
        r2: r2Usage,
        costs
      });

      return {
        workers: workersUsage,
        r2: r2Usage,
        costs,
        readAt: new Date().toISOString()
      };
    } catch (error) {
      logger.error('Failed to read usage data', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Get Workers usage via Analytics API
   */
  async getWorkersUsage() {
    try {
      // Get last 24 hours of Workers analytics
      const since = new Date(Date.now() - 86400000).toISOString();
      const until = new Date().toISOString();

      const response = await axios.get(
        `${this.baseUrl}/accounts/${this.accountId}/analytics_engine/sql`,
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          },
          params: {
            query: `
              SELECT
                SUM(requests) as total_requests,
                SUM(cpuTime) as total_cpu_ms,
                AVG(cpuTime / requests) as avg_cpu_ms_per_request
              FROM
                WorkersInvocationsAdaptive
              WHERE
                datetime >= '${since}'
                AND datetime <= '${until}'
            `
          }
        }
      );

      const data = response.data?.data?.[0] || {};
      
      return {
        requests: parseInt(data.total_requests) || 0,
        cpuMs: parseInt(data.total_cpu_ms) || 0,
        avgCpuMsPerRequest: parseFloat(data.avg_cpu_ms_per_request) || 0
      };
    } catch (error) {
      logger.error('Failed to get Workers usage', {
        error: error.message
      });
      return {
        requests: 0,
        cpuMs: 0,
        avgCpuMsPerRequest: 0
      };
    }
  }

  /**
   * Get R2 usage via GraphQL Analytics API
   */
  async getR2Usage() {
    try {
      const response = await axios.post(
        `${this.baseUrl}/accounts/${this.accountId}/r2/usage`,
        {},
        {
          headers: {
            'Authorization': `Bearer ${this.apiToken}`,
            'Content-Type': 'application/json'
          }
        }
      );

      const data = response.data?.result || {};
      
      return {
        storageGb: parseFloat(data.storage?.bytes || 0) / (1024 ** 3),
        classAOps: parseInt(data.operations?.class_a || 0),
        classBOps: parseInt(data.operations?.class_b || 0),
        egressGb: parseFloat(data.egress?.bytes || 0) / (1024 ** 3) // Should be 0!
      };
    } catch (error) {
      logger.error('Failed to get R2 usage', {
        error: error.message
      });
      return {
        storageGb: 0,
        classAOps: 0,
        classBOps: 0,
        egressGb: 0
      };
    }
  }

  /**
   * Calculate costs based on usage and pricing
   */
  calculateCosts(workersUsage, r2Usage) {
    // Workers costs
    const workersCost = {
      requests: workersUsage.requests * this.pricing.workersRequestPrice,
      compute: workersUsage.cpuMs * this.pricing.workersCpuMsPrice,
      total: 0
    };
    workersCost.total = workersCost.requests + workersCost.compute;

    // R2 costs
    const r2Cost = {
      storage: r2Usage.storageGb * (this.pricing.r2StorageGbPrice / 30), // Daily
      classAOps: r2Usage.classAOps * this.pricing.r2ClassAOpPrice,
      classBOps: r2Usage.classBOps * this.pricing.r2ClassBOpPrice,
      egress: r2Usage.egressGb * this.pricing.r2EgressPrice, // Should be $0!
      total: 0
    };
    r2Cost.total = r2Cost.storage + r2Cost.classAOps + r2Cost.classBOps + r2Cost.egress;

    return {
      workers: workersCost,
      r2: r2Cost,
      total: workersCost.total + r2Cost.total
    };
  }

  /**
   * Detect Workers CPU drift
   * Alert if CPU-ms per request increases significantly
   */
  detectCpuDrift(currentUsage, historicalAvg, threshold = 0.3) {
    const current = currentUsage.avgCpuMsPerRequest;
    const baseline = historicalAvg;
    
    if (baseline === 0) {
      return null;
    }

    const deltaPercent = ((current - baseline) / baseline) * 100;

    if (Math.abs(deltaPercent) > threshold * 100) {
      return {
        current,
        baseline,
        deltaPercent,
        severity: Math.abs(deltaPercent) / 100
      };
    }

    return null;
  }
}

export default UsageReader;
