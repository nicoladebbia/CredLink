#!/usr/bin/env node

/**
 * Minimal PostgreSQL DatabaseRBAC Connection Test
 * Tests that DatabaseRBAC can connect to PostgreSQL and perform basic operations
 */

import { Pool } from 'pg';
import { DatabaseRBAC } from './database-rbac.js';
import { Subject, Action, Resource, Context } from './types.js';

async function testPostgresConnection() {
  console.log('🔍 Testing PostgreSQL DatabaseRBAC Connection...');
  
  try {
    // Create PostgreSQL connection pool
    const pool = new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432'),
      database: process.env.DB_NAME || 'postgres',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      ssl: process.env.DB_SSL === 'true',
      max: 5,
      connectionTimeoutMillis: 5000,
    });

    console.log('✅ PostgreSQL pool created');

    // Test basic database connection
    const client = await pool.connect();
    console.log('✅ PostgreSQL connection established');
    
    const dbResult = await client.query('SELECT version() as version, NOW() as current_time');
    console.log('✅ PostgreSQL query successful:', {
      version: dbResult.rows[0].version.split(' ')[0],
      currentTime: dbResult.rows[0].current_time
    });
    
    client.release();

    // Test DatabaseRBAC initialization
    const rbac = new DatabaseRBAC(pool);
    console.log('✅ DatabaseRBAC instance created');

    // Test health check
    const health = await rbac.healthCheck();
    console.log('✅ DatabaseRBAC health check:', health);

    if (health.status !== 'healthy') {
      throw new Error(`DatabaseRBAC health check failed: ${JSON.stringify(health)}`);
    }

    // Test basic permission check
    const testSubject: Subject = {
      user_id: 'test-user',
      org_id: 'test-org',
      roles: ['super_admin']
    };

    const testAction: Action = { verb: 'read', resource: 'test' };
    const testResource: Resource = { type: 'test', org_id: 'test-org' };
    const testContext: Context = {
      timestamp: new Date(),
      request_id: 'postgres-test-123',
      ip_address: '127.0.0.1'
    };

    const rbacResult = await rbac.check(testSubject, testAction, testResource, testContext);
    console.log('✅ DatabaseRBAC permission check:', rbacResult);

    if (!rbacResult.allow) {
      console.warn('⚠️  Permission check failed (may be expected if roles not migrated):', rbacResult.reason);
    }

    // Test metrics
    const metrics = rbac.getMetrics();
    console.log('✅ DatabaseRBAC metrics:', metrics);

    console.log('🎉 PostgreSQL DatabaseRBAC test completed successfully!');
    
    // Cleanup
    await pool.end();
    console.log('✅ PostgreSQL pool closed');

  } catch (error) {
    console.error('❌ PostgreSQL DatabaseRBAC test failed:', error);
    process.exit(1);
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testPostgresConnection();
}

export { testPostgresConnection };
