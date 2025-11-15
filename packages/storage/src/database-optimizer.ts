/**
 * P-2: Database Query Optimization
 * 
 * Optimizations for when ProofStorage is backed by a real database
 * - Indexes on frequently queried fields
 * - Connection pooling
 * - Query timeouts
 * - Read replicas for verification queries
 */

import { logger } from './logger';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  // Connection pool settings
  poolMin?: number;
  poolMax?: number;
  poolIdleTimeout?: number;
  // Query settings
  queryTimeout?: number;
  statementTimeout?: number;
  // Read replica settings
  readReplicaHost?: string;
  readReplicaPort?: number;
}

export interface QueryOptions {
  timeout?: number;
  useReplica?: boolean;
  retries?: number;
}

/**
 * Database optimizer for ProofStorage
 */
export class DatabaseOptimizer {
  private config: Required<DatabaseConfig>;
  private pool: any = null;
  private readPool: any = null;

  constructor(config: DatabaseConfig) {
    this.config = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      poolMin: config.poolMin ?? 2,
      poolMax: config.poolMax ?? 10,
      poolIdleTimeout: config.poolIdleTimeout ?? 30000,
      queryTimeout: config.queryTimeout ?? 10000,
      statementTimeout: config.statementTimeout ?? 30000,
      readReplicaHost: config.readReplicaHost ?? config.host,
      readReplicaPort: config.readReplicaPort ?? config.port
    };
  }

  /**
   * Initialize connection pools
   */
  async initialize(): Promise<void> {
    // PostgreSQL connection pooling
    try {
      const { Pool } = require('pg');
      
      // Primary pool for writes
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        min: this.config.poolMin,
        max: this.config.poolMax,
        idleTimeoutMillis: this.config.poolIdleTimeout,
        connectionTimeoutMillis: 5000,
        statement_timeout: this.config.statementTimeout,
        query_timeout: this.config.queryTimeout
      });

      // Read replica pool for read-heavy queries
      if (this.config.readReplicaHost !== this.config.host) {
        this.readPool = new Pool({
          host: this.config.readReplicaHost,
          port: this.config.readReplicaPort,
          database: this.config.database,
          user: this.config.user,
          password: this.config.password,
          min: this.config.poolMin,
          max: this.config.poolMax * 2, // More connections for read replica
          idleTimeoutMillis: this.config.poolIdleTimeout,
          connectionTimeoutMillis: 5000,
          statement_timeout: this.config.statementTimeout,
          query_timeout: this.config.queryTimeout
        });
        
        logger.info('Read replica pool initialized', {
          readReplicaHost: this.config.readReplicaHost
        });
      }

      logger.info('Database pools initialized', {
        poolMin: this.config.poolMin,
        poolMax: this.config.poolMax
      });
    } catch (error: any) {
      logger.error('Failed to initialize database pools', {
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Execute query with optimizations
   */
  async query<T = any>(
    sql: string,
    params: any[] = [],
    options: QueryOptions = {}
  ): Promise<T> {
    const pool = options.useReplica && this.readPool ? this.readPool : this.pool;
    
    if (!pool) {
      throw new Error('Database pool not initialized');
    }

    const timeout = options.timeout || this.config.queryTimeout;
    const retries = options.retries || 0;

    try {
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Query timeout')), timeout);
      });

      const queryPromise = pool.query(sql, params);
      const result = await Promise.race([queryPromise, timeoutPromise]);
      
      return result.rows as T;
    } catch (error: any) {
      if (retries > 0 && this.isRetryableError(error)) {
        logger.warn('Retrying query', { retries, error: error.message });
        await this.sleep(100 * (3 - retries)); // Exponential backoff
        return this.query(sql, params, { ...options, retries: retries - 1 });
      }
      
      logger.error('Query failed', {
        error: error.message,
        sql: sql.substring(0, 100)
      });
      throw error;
    }
  }

  /**
   * Create indexes for ProofStorage table
   */
  async createIndexes(): Promise<void> {
    if (!this.pool) {
      throw new Error('Database pool not initialized');
    }

    const indexes = [
      // Index on imageHash for fast lookups by hash
      `CREATE INDEX IF NOT EXISTS idx_proofs_image_hash 
       ON proofs(image_hash)`,
      
      // Index on proofUri for unique constraint and lookups
      `CREATE INDEX IF NOT EXISTS idx_proofs_proof_uri 
       ON proofs(proof_uri)`,
      
      // Index on timestamp for time-based queries
      `CREATE INDEX IF NOT EXISTS idx_proofs_timestamp 
       ON proofs(timestamp DESC)`,
      
      // Composite index for common query patterns
      `CREATE INDEX IF NOT EXISTS idx_proofs_hash_timestamp 
       ON proofs(image_hash, timestamp DESC)`,
      
      // Index on expiresAt for cleanup queries
      `CREATE INDEX IF NOT EXISTS idx_proofs_expires_at 
       ON proofs(expires_at) 
       WHERE expires_at IS NOT NULL`
    ];

    for (const indexSql of indexes) {
      try {
        await this.pool.query(indexSql);
        logger.info('Index created', { sql: indexSql.substring(0, 80) });
      } catch (error: any) {
        logger.warn('Index creation failed (may already exist)', {
          error: error.message
        });
      }
    }
  }

  /**
   * Get connection pool statistics
   */
  getPoolStats(): {
    primary: any;
    replica?: any;
  } {
    return {
      primary: this.pool ? {
        totalCount: this.pool.totalCount,
        idleCount: this.pool.idleCount,
        waitingCount: this.pool.waitingCount
      } : null,
      replica: this.readPool ? {
        totalCount: this.readPool.totalCount,
        idleCount: this.readPool.idleCount,
        waitingCount: this.readPool.waitingCount
      } : undefined
    };
  }

  /**
   * Close all connections
   */
  async close(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      logger.info('Primary pool closed');
    }
    if (this.readPool) {
      await this.readPool.end();
      logger.info('Read replica pool closed');
    }
  }

  private isRetryableError(error: any): boolean {
    // Retry on connection errors, not on constraint violations
    const retryableCodes = ['ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND'];
    return retryableCodes.includes(error.code);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Optimized queries for ProofStorage
 */
export class ProofQueries {
  constructor(private optimizer: DatabaseOptimizer) {}

  /**
   * Get proof by ID (use read replica)
   */
  async getProofById(proofId: string): Promise<any> {
    const sql = `
      SELECT * FROM proofs 
      WHERE proof_id = $1 
      AND (expires_at IS NULL OR expires_at > NOW())
    `;
    
    const results = await this.optimizer.query(
      sql,
      [proofId],
      { useReplica: true, timeout: 5000 }
    );
    
    return results[0] || null;
  }

  /**
   * Get proof by image hash (use read replica)
   */
  async getProofByHash(imageHash: string): Promise<any> {
    const sql = `
      SELECT * FROM proofs 
      WHERE image_hash = $1 
      AND (expires_at IS NULL OR expires_at > NOW())
      ORDER BY timestamp DESC 
      LIMIT 1
    `;
    
    const results = await this.optimizer.query(
      sql,
      [imageHash],
      { useReplica: true, timeout: 5000 }
    );
    
    return results[0] || null;
  }

  /**
   * Insert new proof (use primary)
   */
  async insertProof(proof: any): Promise<void> {
    const sql = `
      INSERT INTO proofs (
        proof_id, proof_uri, image_hash, manifest, 
        timestamp, signature, expires_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      ON CONFLICT (proof_id) DO NOTHING
    `;
    
    await this.optimizer.query(sql, [
      proof.proofId,
      proof.proofUri,
      proof.imageHash,
      JSON.stringify(proof.manifest),
      proof.timestamp,
      proof.signature,
      proof.expiresAt ? new Date(proof.expiresAt) : null
    ]);
  }

  /**
   * Get storage statistics (use read replica)
   */
  async getStats(): Promise<{ totalProofs: number }> {
    const sql = `
      SELECT COUNT(*) as total 
      FROM proofs 
      WHERE expires_at IS NULL OR expires_at > NOW()
    `;
    
    const results = await this.optimizer.query<{ total: string }[]>(
      sql,
      [],
      { useReplica: true, timeout: 10000 }
    );
    
    return {
      totalProofs: parseInt(results[0]?.total || '0', 10)
    };
  }

  /**
   * Cleanup expired proofs (use primary)
   */
  async cleanupExpired(): Promise<number> {
    const sql = `
      DELETE FROM proofs 
      WHERE expires_at IS NOT NULL 
      AND expires_at < NOW()
      RETURNING proof_id
    `;
    
    const results = await this.optimizer.query(sql, []);
    return results.length;
  }
}
