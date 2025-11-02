/**
 * Phase 13 Analytics - ClickHouse Client
 * High-performance analytics database client with connection pooling
 */

import { createClient } from '@clickhouse/client';
import { Logger } from 'winston';

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
  private client: any;
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
        max_memory_usage: 10000000000, // 10GB
        max_result_rows: 100000,
        max_result_bytes: 1000000000   // 1GB
      }
    });

    this.logger.info('ClickHouse client initialized', {
      host: config.host,
      database: config.database
    });
  }

  /**
   * Execute a parameterized query
   */
  async query<T = any>(sql: string, params?: Record<string, any>): Promise<QueryResult<T>> {
    const startTime = Date.now();
    
    try {
      this.logger.debug('Executing ClickHouse query', { 
        sql: sql.substring(0, 200) + '...',
        params 
      });

      const result = await this.client.query({
        query: sql,
        format: 'JSONEachRow',
        clickhouse_settings: {
          wait_end_of_query: 1,
          max_execution_time: 30
        },
        query_params: params || {}
      });

      const data = await result.json();
      const elapsed = Date.now() - startTime;

      this.logger.debug('ClickHouse query completed', {
        rows: data.length,
        elapsed: `${elapsed}ms`
      });

      return {
        data,
        rows: data.length,
        statistics: {
          elapsed,
          rows_read: data.length,
          bytes_read: JSON.stringify(data).length
        }
      };

    } catch (error) {
      const elapsed = Date.now() - startTime;
      
      this.logger.error('ClickHouse query failed', {
        error: error.message,
        sql: sql.substring(0, 200) + '...',
        params,
        elapsed: `${elapsed}ms`
      });

      throw new Error(`ClickHouse query failed: ${error.message}`);
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
        format,
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
        error: error.message,
        table,
        rows: data.length,
        elapsed: `${elapsed}ms`
      });

      throw new Error(`ClickHouse insert failed: ${error.message}`);
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
        error: error.message,
        ddl: ddl.substring(0, 200) + '...',
        elapsed: `${elapsed}ms`
      });

      throw new Error(`DDL execution failed: ${error.message}`);
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
          statistics: result.statistics
        }
      };
    } catch (error) {
      return {
        healthy: false,
        details: { error: error.message }
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
      this.logger.error('Error closing ClickHouse client', { error: error.message });
    }
  }

  /**
   * Create database schema
   */
  async createSchema(ddlPath: string): Promise<void> {
    const fs = require('fs');
    const path = require('path');
    
    try {
      const ddl = fs.readFileSync(ddlPath, 'utf8');
      const statements = ddl.split(';').filter(s => s.trim().length > 0);
      
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
        error: error.message,
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
        error: error.message
      };
    }
  }
}
