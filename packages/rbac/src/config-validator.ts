/**
 * BRUTAL RBAC Configuration Validator
 * 
 * Validates all required environment variables for DatabaseRBAC
 * This was missing - will cause silent production failures
 */

import { Pool } from 'pg';

export interface RBACConfig {
  db: {
    host: string;
    port: number;
    name: string;
    user: string;
    password: string;
    ssl: boolean;
    maxConnections: number;
    connectionTimeout: number;
  };
  cache: {
    ttl: number;
    maxSize: number;
  };
  security: {
    enableAuditLog: boolean;
    maxQueryTime: number;
    sanitizeInputs: boolean;
  };
}

export class RBACConfigValidator {
  /**
   * Validate all required environment variables
   */
  static validate(): RBACConfig {
    const errors: string[] = [];
    
    // Database configuration
    const dbHost = process.env.DB_HOST;
    const dbPort = process.env.DB_PORT;
    const dbName = process.env.DB_NAME;
    const dbUser = process.env.DB_USER;
    const dbPassword = process.env.DB_PASSWORD;
    const dbSsl = process.env.DB_SSL === 'true';
    
    if (!dbHost) errors.push('DB_HOST is required');
    if (!dbPort) errors.push('DB_PORT is required');
    if (!dbName) errors.push('DB_NAME is required');
    if (!dbUser) errors.push('DB_USER is required');
    if (!dbPassword) errors.push('DB_PASSWORD is required');
    
    // Validate port is numeric
    const port = parseInt(dbPort || '5432');
    if (isNaN(port) || port < 1 || port > 65535) {
      errors.push('DB_PORT must be a valid port number (1-65535)');
    }
    
    // Cache configuration
    const cacheTtl = parseInt(process.env.RBAC_CACHE_TTL || '300000');
    const cacheMaxSize = parseInt(process.env.RBAC_CACHE_MAX_SIZE || '1000');
    
    if (isNaN(cacheTtl) || cacheTtl < 0) {
      errors.push('RBAC_CACHE_TTL must be a positive number');
    }
    
    if (isNaN(cacheMaxSize) || cacheMaxSize < 1) {
      errors.push('RBAC_CACHE_MAX_SIZE must be a positive number');
    }
    
    // Security configuration
    const enableAuditLog = process.env.ENABLE_RBAC_AUDIT !== 'false';
    const maxQueryTime = parseInt(process.env.RBAC_MAX_QUERY_TIME || '5000');
    const sanitizeInputs = process.env.RBAC_SANITIZE_INPUTS !== 'false';
    
    if (isNaN(maxQueryTime) || maxQueryTime < 100) {
      errors.push('RBAC_MAX_QUERY_TIME must be at least 100ms');
    }
    
    if (errors.length > 0) {
      throw new Error(`RBAC Configuration validation failed:\n${errors.join('\n')}`);
    }
    
    return {
      db: {
        host: dbHost!,
        port,
        name: dbName!,
        user: dbUser!,
        password: dbPassword!,
        ssl: dbSsl,
        maxConnections: parseInt(process.env.RBAC_DB_MAX_CONNECTIONS || '10'),
        connectionTimeout: parseInt(process.env.RBAC_DB_CONNECTION_TIMEOUT || '5000')
      },
      cache: {
        ttl: cacheTtl,
        maxSize: cacheMaxSize
      },
      security: {
        enableAuditLog,
        maxQueryTime,
        sanitizeInputs
      }
    };
  }
  
  /**
   * Validate database connectivity
   */
  static async validateDatabaseConnection(config: RBACConfig['db']): Promise<boolean> {
    const pool = new Pool({
      host: config.host,
      port: config.port,
      database: config.name,
      user: config.user,
      password: config.password,
      ssl: config.ssl,
      max: 1,
      connectionTimeoutMillis: config.connectionTimeout
    });
    
    try {
      const client = await pool.connect();
      await client.query('SELECT 1');
      client.release();
      return true;
    } catch (error) {
      throw new Error(`Database connection failed: ${(error as Error).message}`);
    } finally {
      await pool.end();
    }
  }
}
