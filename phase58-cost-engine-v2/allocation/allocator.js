/**
 * Cost Allocator
 * Implements FinOps allocation best practices with tag-based and heuristic allocation
 *
 * Reference: https://www.finops.org/framework/capabilities/cost-allocation/
 *
 * Allocation methods:
 * 1. Tag-based (tenant_id, environment, product)
 * 2. Heuristic (path/domain patterns)
 * 3. Confidence scoring for each allocation
 */

import { createLogger } from '../src/utils/logger.js';
import pg from 'pg';

const logger = createLogger('CostAllocator');
const { Pool } = pg;

export class CostAllocator {
  constructor() {
    // Security: Validate database configuration
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = parseInt(process.env.DB_PORT) || 5432;
    const dbName = process.env.DB_NAME || 'cost_engine';
    const dbUser = process.env.DB_USER || 'postgres';
    const dbPassword = process.env.DB_PASSWORD;

    // Security: Validate hostname to prevent injection
    if (!/^[a-zA-Z0-9.-]+$/.test(dbHost)) {
      throw new Error('Invalid database hostname');
    }

    // Security: Validate port range
    if (dbPort < 1 || dbPort > 65535) {
      throw new Error('Invalid database port');
    }

    // Security: Validate database name format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbName)) {
      throw new Error('Invalid database name format');
    }

    // Security: Validate username format
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(dbUser)) {
      throw new Error('Invalid database username format');
    }

    if (!dbPassword) {
      throw new Error('DB_PASSWORD environment variable is required');
    }

    this.pool = new Pool({
      host: dbHost,
      port: dbPort,
      database: dbName,
      user: dbUser,
      password: dbPassword,
      ssl: process.env.DB_SSL === 'true',
      max: 10,
      // Security: Additional connection security
      connectionTimeoutMillis: 5000,
      query_timeout: 30000
    });

    // FinOps allocation configuration
    this.tagKeys = (process.env.ALLOCATION_TAG_KEYS || 'tenant_id,environment,product,team').split(
      ','
    );
    this.minConfidence = parseFloat(process.env.ALLOCATION_CONFIDENCE_MINIMUM) || 0.7;
    this.untaggedFallback = process.env.ALLOCATION_UNTAGGED_FALLBACK || 'shared';
  }

  /**
   * Initialize allocator (create tables if needed)
   */
  async initialize() {
    logger.info('Initializing cost allocator');

    try {
      await this.createTables();
      logger.info('Cost allocator initialized');
    } catch (error) {
      logger.error('Failed to initialize allocator', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Create database tables for cost allocation
   */
  async createTables() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS cost_allocations (
        id SERIAL PRIMARY KEY,
        cost_id VARCHAR(255) NOT NULL,
        source VARCHAR(50) NOT NULL,
        tenant_id VARCHAR(100),
        environment VARCHAR(50),
        product VARCHAR(100),
        team VARCHAR(100),
        cost_usd DECIMAL(12, 6) NOT NULL,
        usage_amount DECIMAL(12, 3),
        usage_unit VARCHAR(50),
        allocation_method VARCHAR(50) NOT NULL,
        confidence DECIMAL(3, 2) NOT NULL,
        metadata JSONB,
        allocated_at TIMESTAMP DEFAULT NOW(),
        created_at TIMESTAMP DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_allocations_tenant ON cost_allocations(tenant_id);
      CREATE INDEX IF NOT EXISTS idx_allocations_date ON cost_allocations(allocated_at);
      CREATE INDEX IF NOT EXISTS idx_allocations_source ON cost_allocations(source);
    `);
  }

  /**
   * Run allocation cycle
   * Allocates all unallocated cost records
   */
  async allocate() {
    logger.info('Starting allocation cycle');

    try {
      // Get unallocated cost records from staging
      const records = await this.getUnallocatedRecords();

      if (records.length === 0) {
        logger.info('No unallocated records found');
        return {
          allocatedLines: 0,
          unallocatedLines: 0,
          confidenceAvg: 1.0
        };
      }

      logger.info('Allocating cost records', { count: records.length });

      // Allocate each record
      const allocations = [];
      for (const record of records) {
        const allocation = await this.allocateRecord(record);
        if (allocation) {
          allocations.push(allocation);
        }
      }

      // Save allocations
      await this.saveAllocations(allocations);

      // Calculate stats
      const allocatedCount = allocations.filter(a => a.confidence >= this.minConfidence).length;
      const unallocatedCount = allocations.length - allocatedCount;
      const confidenceSum = allocations.reduce((sum, a) => sum + a.confidence, 0);
      const confidenceAvg = allocations.length > 0 ? confidenceSum / allocations.length : 0;

      logger.info('Allocation cycle completed', {
        allocatedLines: allocatedCount,
        unallocatedLines: unallocatedCount,
        confidenceAvg: confidenceAvg.toFixed(2)
      });

      return {
        allocatedLines: allocatedCount,
        unallocatedLines: unallocatedCount,
        confidenceAvg
      };
    } catch (error) {
      logger.error('Allocation cycle failed', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Get unallocated cost records from staging
   */
  async getUnallocatedRecords() {
    // In production, this would query a staging table
    // For now, return mock data
    return [];
  }

  /**
   * Allocate a single cost record
   * Returns allocation with tenant, confidence, and method
   */
  async allocateRecord(record) {
    // Try tag-based allocation first (highest confidence)
    const tagAllocation = this.allocateByTags(record);
    if (tagAllocation && tagAllocation.confidence >= 0.9) {
      return tagAllocation;
    }

    // Try heuristic allocation (medium confidence)
    const heuristicAllocation = this.allocateByHeuristics(record);
    if (heuristicAllocation && heuristicAllocation.confidence >= this.minConfidence) {
      return heuristicAllocation;
    }

    // Fallback to shared allocation (low confidence)
    return {
      costId: record.id,
      source: record.source,
      tenantId: this.untaggedFallback,
      environment: record.tags?.environment || 'unknown',
      product: record.tags?.product || 'unknown',
      team: record.tags?.team || 'unknown',
      costUsd: record.cost,
      usageAmount: record.usage_amount,
      usageUnit: record.usage_unit,
      allocationMethod: 'fallback',
      confidence: 0.3,
      metadata: {
        reason: 'no_tags_or_heuristics',
        originalRecord: record.id
      }
    };
  }

  /**
   * Allocate by resource tags (highest confidence)
   */
  allocateByTags(record) {
    const tags = record.tags || {};

    // Check for tenant_id tag
    if (tags.tenant_id) {
      return {
        costId: record.id,
        source: record.source,
        tenantId: tags.tenant_id,
        environment: tags.environment || 'production',
        product: tags.product || 'default',
        team: tags.team || 'default',
        costUsd: record.cost,
        usageAmount: record.usage_amount,
        usageUnit: record.usage_unit,
        allocationMethod: 'tag',
        confidence: 1.0,
        metadata: {
          tags: tags
        }
      };
    }

    return null;
  }

  /**
   * Allocate by heuristics (medium confidence)
   * Uses path patterns, domain names, etc.
   */
  allocateByHeuristics(record) {
    // Try to extract tenant from resource ID or ARN
    const tenantFromResource = this.extractTenantFromResourceId(record.resource_id);
    if (tenantFromResource) {
      return {
        costId: record.id,
        source: record.source,
        tenantId: tenantFromResource.tenantId,
        environment: tenantFromResource.environment || 'production',
        product: record.tags?.product || 'default',
        team: record.tags?.team || 'default',
        costUsd: record.cost,
        usageAmount: record.usage_amount,
        usageUnit: record.usage_unit,
        allocationMethod: 'heuristic',
        confidence: tenantFromResource.confidence,
        metadata: {
          heuristicType: 'resource_id',
          pattern: tenantFromResource.pattern
        }
      };
    }

    return null;
  }

  /**
   * Extract tenant ID from resource ID using patterns
   */
  extractTenantFromResourceId(resourceId) {
    if (!resourceId || typeof resourceId !== 'string') {
      return null;
    }

    // Pattern 1: tenant-{tenant_id}-resource
    const pattern1 = resourceId.match(/tenant-([a-z0-9-]+)-/i);
    if (pattern1) {
      return {
        tenantId: pattern1[1],
        environment: 'production',
        confidence: 0.8,
        pattern: 'tenant-prefix'
      };
    }

    // Pattern 2: /tenants/{tenant_id}/
    const pattern2 = resourceId.match(/\/tenants\/([a-z0-9-]+)\//i);
    if (pattern2) {
      return {
        tenantId: pattern2[1],
        environment: 'production',
        confidence: 0.75,
        pattern: 'path-based'
      };
    }

    // Pattern 3: {tenant_id}.subdomain.com
    const pattern3 = resourceId.match(/^([a-z0-9-]+)\./i);
    if (pattern3) {
      const subdomain = pattern3[1];
      if (subdomain !== 'www' && subdomain !== 'api' && subdomain !== 'cdn') {
        return {
          tenantId: subdomain,
          environment: 'production',
          confidence: 0.7,
          pattern: 'subdomain'
        };
      }
    }

    return null;
  }

  /**
   * Save allocations to database
   */
  async saveAllocations(allocations) {
    if (allocations.length === 0) {
      return;
    }

    const values = allocations.map(a => [
      a.costId,
      a.source,
      a.tenantId,
      a.environment,
      a.product,
      a.team,
      a.costUsd,
      a.usageAmount,
      a.usageUnit,
      a.allocationMethod,
      a.confidence,
      JSON.stringify(a.metadata)
    ]);

    const placeholders = values
      .map((_, i) => {
        const offset = i * 12;
        return `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12})`;
      })
      .join(',');

    await this.pool.query(
      `
      INSERT INTO cost_allocations (
        cost_id, source, tenant_id, environment, product, team,
        cost_usd, usage_amount, usage_unit, allocation_method, confidence, metadata
      ) VALUES ${placeholders}
    `,
      values.flat()
    );

    logger.info('Allocations saved', { count: allocations.length });
  }

  /**
   * Get allocation statistics
   */
  async getAllocationStats() {
    const result = await this.pool.query(
      `
      SELECT
        COUNT(*) as total_lines,
        COUNT(*) FILTER (WHERE confidence >= $1) as allocated_lines,
        COUNT(*) FILTER (WHERE confidence < $1) as unallocated_lines,
        AVG(confidence) as avg_confidence,
        allocation_method,
        COUNT(*) as count
      FROM cost_allocations
      WHERE allocated_at >= NOW() - INTERVAL '24 hours'
      GROUP BY allocation_method
    `,
      [this.minConfidence]
    );

    return result.rows;
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

export default CostAllocator;
