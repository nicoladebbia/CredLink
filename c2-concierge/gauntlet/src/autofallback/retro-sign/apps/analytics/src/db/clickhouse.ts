/**
 * Phase 13 Analytics - ClickHouse Client
 * High-performance analytics database client with connection pooling
 */

import { createClient, ClickHouseClient as CHClient } from '@clickhouse/client';
import { Logger } from 'winston';
import { RequestValidator } from '../utils/validation';

export interface QueryResult<T> {
  data: T[];
  rows: number;
  queryStats: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

export interface ClickHouseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  max_connections?: number;
  request_timeout?: number;
}

export interface QueryResult<T = any> {
  data: T[];
  rows: number;
  statistics?: {
    elapsed: number;
    rows_read: number;
    bytes_read: number;
  };
}

export class ClickHouseClient {
  private client: CHClient;
  private logger: Logger;

  constructor(config: ClickHouseConfig, logger: Logger) {
    this.logger = logger;
    
    this.client = createClient({
      host: `${config.host}:${config.port}`,
      username: config.username,
      password: config.password,
      database: config.database,
      request_timeout: config.request_timeout || 30000,
      max_open_connections: config.max_connections || 10,
      clickhouse_settings: {
        async_insert: 1,
        wait_for_async_insert: 1,
        max_execution_time: 60,
        max_memory_usage: '10000000000', // 10GB
        max_result_rows: '100000',
        max_result_bytes: '1000000000'   // 1GB
      }
    });

    this.logger.info('ClickHouse client initialized', {
      host: config.host,
      database: config.database
    });
  }

  /**
   * Enhanced parameterized query with comprehensive security
   */
  async query<T = any>(sql: string, params?: Record<string, any>): Promise<QueryResult<T>> {
    const startTime = Date.now();
    
    try {
      // CRITICAL: Enhanced SQL query validation
      if (typeof sql !== 'string' || sql.length === 0) {
        throw new Error('SQL query must be a non-empty string');
      }

      if (sql.length > 100000) { // 100KB limit
        throw new Error('SQL query too large');
      }

      // Enhanced dangerous SQL pattern detection
      const dangerousPatterns = [
        // DDL operations
        /\b(DROP|TRUNCATE|ALTER|CREATE|RENAME)\b/i,
        // DML operations (should be handled through specific methods)
        /\b(DELETE|UPDATE|INSERT)\b/i,
        // Administrative operations
        /\b(EXEC|EXECUTE|SCRIPT|KILL|SHUTDOWN)\b/i,
        // Information disclosure
        /\b(INFORMATION_SCHEMA|SYS|MASTER|MSDB|mysql|pg_)\b/i,
        // File operations
        /\b(BULK|OPENROWSET|OPENDATASOURCE|LOAD_FILE)\b/i,
        // System functions
        /\b(SYSTEM|SHELL|CMD|EXECUTE_IMMEDIATE)\b/i,
        // Time-based attacks
        /\b(WAITFOR|SLEEP|BENCHMARK|PG_SLEEP)\b/i,
        // Union-based attacks
        /\bUNION\s+(ALL\s+)?SELECT\b/i,
        // Comment-based attacks
        /(--|;|\/\*|\*\/|#)/,
        // Boolean-based attacks
        /(\bOR\b.*=.*\bOR\b|\bAND\b.*=.*\bAND\b)/i,
        // Stored procedures
        /\b(xp_|sp_)\w*\b/i
      ];

      for (const pattern of dangerousPatterns) {
        if (pattern.test(sql)) {
          this.logger.error('Dangerous SQL pattern detected', { 
            sql: sql.substring(0, 100) + '...',
            pattern: pattern.source
          });
          throw new Error('Potentially dangerous SQL query detected');
        }
      }

      // Validate all parameters with enhanced security
      if (params) {
        if (Object.keys(params).length > 100) {
          throw new Error('Too many parameters in query');
        }

        for (const [key, value] of Object.entries(params)) {
          // Validate parameter names
          if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(key)) {
            throw new Error(`Invalid parameter name: ${key}`);
          }

          // Validate parameter values
          RequestValidator.validateSQLParam(value);
        }
      }

      // CRITICAL SECURITY: Enhanced logging without sensitive data
      this.logger.debug('Executing ClickHouse query', { 
        sql: sql.substring(0, 200) + (sql.length > 200 ? '...' : ''),
        paramCount: params ? Object.keys(params).length : 0,
        queryLength: sql.length
      });

      const result = await this.client.query({
        query: sql,
        format: 'JSONEachRow',
        clickhouse_settings: {
          wait_end_of_query: 1,
          max_execution_time: 30,
          max_memory_usage: '10000000000', // 10GB
          max_result_rows: '1000000',
          max_result_bytes: '1000000000' // 1GB
        },
        query_params: params || {}
      });

      const data = (await result.json()) as any[];
      
      // Validate result size
      if (data.length > 1000000) {
        this.logger.warn('Query returned unusually large result set', {
          rowCount: data.length
        });
      }
      
      return {
        data: data as T[],
        rows: data.length,
        queryStats: {
          elapsed: Date.now() - startTime,
          rows_read: data.length,
          bytes_read: JSON.stringify(data).length
        }
      };

    } catch (error) {
      const elapsed = Date.now() - startTime;
      
      // CRITICAL: Enhanced error logging without sensitive parameters
      this.logger.error('ClickHouse query failed', {
        error: error instanceof Error ? error.message : String(error),
        sql: sql.substring(0, 200) + (sql.length > 200 ? '...' : ''),
        elapsed: `${elapsed}ms`,
        paramCount: params ? Object.keys(params).length : 0
      });

      // Don't expose internal database errors to clients
      if (error instanceof Error && error.message.includes('detected')) {
        throw error; // Re-throw security errors
      }
      
      throw new Error('Database query failed');
    }
  }

  /**
   * Execute insert for batch data loading
   */
  async insert(table: string, data: any[], format: string = 'JSONEachRow'): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Inserting data into ClickHouse', {
        table,
        rows: data.length
      });

      await this.client.insert({
        table,
        values: data,
        format: format as any,
        clickhouse_settings: {
          async_insert: 1,
          wait_for_async_insert: 1
        }
      });

      const elapsed = Date.now() - startTime;
      this.logger.info('Data inserted into ClickHouse', {
        table,
        rows: data.length,
        elapsed: `${elapsed}ms`
      });

    } catch (error) {
      const elapsed = Date.now() - startTime;
      
      this.logger.error('ClickHouse insert failed', {
        error: error instanceof Error ? error.message : String(error),
        table,
        rows: data.length,
        elapsed: `${elapsed}ms`
      });

      throw new Error(`ClickHouse insert failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Execute DDL statements (CREATE, ALTER, etc.)
   */
  async executeDDL(ddl: string): Promise<void> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Executing DDL', { 
        ddl: ddl.substring(0, 200) + '...' 
      });

      await this.client.exec({
        query: ddl,
        clickhouse_settings: {
          max_execution_time: 300 // 5 minutes for DDL
        }
      });

      const elapsed = Date.now() - startTime;
      this.logger.info('DDL executed successfully', {
        elapsed: `${elapsed}ms`
      });

    } catch (error) {
      const elapsed = Date.now() - startTime;
      
      this.logger.error('DDL execution failed', {
        error: error instanceof Error ? error.message : String(error),
        ddl: ddl.substring(0, 200) + '...',
        elapsed: `${elapsed}ms`
      });

      throw new Error(`DDL execution failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check database health
   */
  async healthCheck(): Promise<{ healthy: boolean; details: any }> {
    try {
      const result = await this.query('SELECT 1 as health_check');
      
      return {
        healthy: result.rows === 1,
        details: {
          rows: result.rows,
          statistics: result.queryStats
        }
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error instanceof Error ? error.message : String(error) }
      };
    }
  }

  /**
   * Get table statistics
   */
  async getTableStats(table: string): Promise<any> {
    const sql = `
      SELECT 
        name as table_name,
        engine,
        total_rows,
        total_bytes,
        uncompressed_bytes,
        compression_ratio
      FROM system.tables 
      WHERE database = currentDatabase() AND name = {table:String}
    `;

    const result = await this.query(sql, { table });
    return result.data[0] || null;
  }

  /**
   * Get query performance stats
   */
  async getQueryStats(limit: number = 10): Promise<any[]> {
    const sql = `
      SELECT 
        query,
        type,
        elapsed,
        read_rows,
        read_bytes,
        result_rows,
        result_bytes,
        memory_usage,
        query_start_time
      FROM system.query_log
      WHERE type = 'QueryFinish' 
        AND query_start_time >= now() - INTERVAL 1 HOUR
        AND query NOT LIKE '%system.query_log%'
      ORDER BY elapsed DESC
      LIMIT {limit:UInt32}
    `;

    const result = await this.query(sql, { limit });
    return result.data;
  }

  /**
   * Close the client connection
   */
  async close(): Promise<void> {
    try {
      await this.client.close();
      this.logger.info('ClickHouse client closed');
    } catch (error) {
      this.logger.error('Error closing ClickHouse client', { error: error instanceof Error ? error.message : String(error) });
    }
  }

  /**
   * Create database schema
   */
  async createSchema(ddlPath: string): Promise<void> {
    const fs = require('fs');
    
    try {
      const ddl = fs.readFileSync(ddlPath, 'utf8');
      const statements = ddl.split(';').filter((s: string) => s.trim().length > 0);
      
      this.logger.info('Creating ClickHouse schema', {
        statements: statements.length,
        path: ddlPath
      });

      for (const statement of statements) {
        if (statement.trim()) {
          await this.executeDDL(statement.trim());
        }
      }

      this.logger.info('ClickHouse schema created successfully');
    } catch (error) {
      this.logger.error('Failed to create ClickHouse schema', {
        error: error instanceof Error ? error.message : String(error),
        path: ddlPath
      });
      throw error;
    }
  }

  /**
   * Test query performance
   */
  async testQueryPerformance(sql: string, params?: Record<string, any>): Promise<any> {
    const startTime = Date.now();
    
    try {
      const result = await this.query(sql, params);
      const elapsed = Date.now() - startTime;
      
      return {
        success: true,
        elapsed,
        rows: result.rows,
        bytes: result.statistics?.bytes_read || 0
      };
    } catch (error) {
      const elapsed = Date.now() - startTime;
      
      return {
        success: false,
        elapsed,
        error: error instanceof Error ? error.message : String(error)
      };
    }
  }
}
