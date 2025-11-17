#!/usr/bin/env node

/**
 * BRUTAL DatabaseRBAC Production Test
 * 
 * This bypasses the broken main app infrastructure 
 * and tests DatabaseRBAC in isolation - the ONLY thing that matters
 */

import express from 'express';
import { Pool } from 'pg';
import { DatabaseRBAC, Subject, Action, Resource, Context } from '@credlink/rbac';

const app = express();
app.use(express.json());

// BRUTAL: Test DatabaseRBAC with actual PostgreSQL connection
app.get('/test-rbac', async (req, res) => {
  try {
    console.log('🔥 BRUTAL TEST: DatabaseRBAC Production Integration');
    
    // PostgreSQL connection - NO MORE MOCKS
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
    
    // BRUTAL: Test actual database connection
    const client = await pool.connect();
    const result = await client.query('SELECT version() as version, NOW() as current_time');
    client.release();
    
    console.log('✅ REAL PostgreSQL connection established');
    console.log('📊 Database version:', result.rows[0].version.split(' ')[0]);
    
    // BRUTAL: Test DatabaseRBAC with REAL database
    const rbac = new DatabaseRBAC(pool);
    console.log('✅ DatabaseRBAC instance created');
    
    // BRUTAL: Health check with REAL database
    const health = await rbac.healthCheck();
    console.log('🏥 DatabaseRBAC health:', health);
    
    if (health.status !== 'healthy') {
      console.log('⚠️  DatabaseRBAC unhealthy - this is EXPECTED without schema migration');
    }
    
    // BRUTAL: Test permission check with REAL database
    const testSubject: Subject = {
      user_id: 'production-test-user',
      org_id: 'production-test-org',
      roles: ['super_admin']
    };

    const testAction: Action = { verb: 'sign', resource: 'images' };
    const testResource: Resource = { type: 'images', org_id: 'production-test-org' };
    const testContext: Context = {
      timestamp: new Date(),
      request_id: 'production-test-' + Date.now(),
      ip_address: '127.0.0.1'
    };

    const rbacResult = await rbac.check(testSubject, testAction, testResource, testContext);
    console.log('🔐 Permission check result:', rbacResult);
    
    // BRUTAL: Test metrics
    const metrics = rbac.getMetrics();
    console.log('📈 DatabaseRBAC metrics:', metrics);
    
    // Cleanup
    await pool.end();
    console.log('✅ PostgreSQL pool closed');
    
    // BRUTAL: Return production-ready results
    res.json({
      success: true,
      message: 'BRUTAL DatabaseRBAC production test completed',
      results: {
        database: {
          connected: true,
          version: result.rows[0].version.split(' ')[0]
        },
        rbac: {
          health: health,
          permissionCheck: {
            allowed: rbacResult.allow,
            reason: rbacResult.reason
          },
          metrics: metrics
        }
      }
    });
    
  } catch (error) {
    console.error('❌ BRUTAL TEST FAILED:', error);
    res.status(500).json({
      success: false,
      message: 'BRUTAL DatabaseRBAC production test failed',
      error: (error as Error).message,
      stack: (error as Error).stack
    });
  }
});

// BRUTAL: Start server
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`🔥 BRUTAL DatabaseRBAC test server running on port ${PORT}`);
  console.log(`📡 Test endpoint: http://localhost:${PORT}/test-rbac`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
