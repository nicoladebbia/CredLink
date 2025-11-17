/**
 * Phase 13 Analytics - Schema Creation Script
 * Initialize ClickHouse database with tables and materialized views
 */

import { ClickHouseClient } from '../db/clickhouse';
import { createLogger } from '../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

async function createSchema() {
  const logger = createLogger('SchemaCreator');
  
  try {
    logger.info('Starting ClickHouse schema creation');

    // Initialize ClickHouse client
    const clickhouseConfig = {
      host: process.env.CLICKHOUSE_HOST || 'localhost',
      port: parseInt(process.env.CLICKHOUSE_PORT || '8123'),
      username: process.env.CLICKHOUSE_USER || 'default',
      password: process.env.CLICKHOUSE_PASSWORD || '',
      database: process.env.CLICKHOUSE_DATABASE || 'c2pa_analytics'
    };

    const client = new ClickHouseClient(clickhouseConfig, logger);

    // Test connection
    const health = await client.healthCheck();
    if (!health.healthy) {
      throw new Error('ClickHouse connection failed');
    }

    // Read and execute DDL
    const ddlPath = path.join(__dirname, '../schema/clickhouse-ddl.sql');
    
    if (!fs.existsSync(ddlPath)) {
      throw new Error(`DDL file not found: ${ddlPath}`);
    }

    const ddlContent = fs.readFileSync(ddlPath, 'utf8');
    
    // Split into individual statements and execute
    const statements = ddlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));

    for (const statement of statements) {
      try {
        await client.query(statement);
        logger.info('Schema statement executed', { 
          statement: statement.substring(0, 50) + '...' 
        });
      } catch (error) {
        logger.error('Schema statement failed', { 
          statement: statement.substring(0, 50) + '...',
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }
    }

    logger.info('Schema creation completed successfully');
    
    // Close connection
    if (client.close) {
      await client.close();
    }
    
  } catch (error) {
    logger.error('Schema creation failed', { error: error instanceof Error ? error.message : String(error) });
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  createSchema();
}

export { createSchema };
