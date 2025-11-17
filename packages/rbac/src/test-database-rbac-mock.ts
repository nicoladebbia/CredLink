#!/usr/bin/env node

/**
 * Mock DatabaseRBAC Test
 * Tests DatabaseRBAC logic without requiring actual PostgreSQL database
 */

import { DatabaseRBAC } from './database-rbac.js';
import { Subject, Action, Resource, Context } from './types.js';

// Mock Pool implementation that simulates PostgreSQL responses
class MockPool {
  private queries: Array<{ sql: string; params: any[] }> = [];
  
  async query(sql: string, params: any[] = []): Promise<any> {
    this.queries.push({ sql, params });
    
    // Mock responses for common queries
    if (sql.includes('SELECT version()')) {
      return {
        rows: [{ version: 'PostgreSQL 15.0 (mock)', current_time: new Date() }]
      };
    }
    
    if (sql.includes('rbac_health_check')) {
      return {
        rows: [{ status: 'healthy', last_migration: new Date().toISOString().split('T')[0] }]
      };
    }
    
    // Handle health check query for roles count
    if (sql.includes('SELECT COUNT(*) FROM roles')) {
      return {
        rows: [{ count: '5' }] // Mock 5 roles in database
      };
    }
    
    if (sql.includes('subject_roles') && sql.includes('SELECT r.role_id')) {
      // Return mock roles for testing
      return {
        rows: [
          { role_id: 'super_admin' },
          { role_id: 'image_signer' }
        ]
      };
    }
    
    if (sql.includes('permissions') && sql.includes('SELECT')) {
      // Return mock permissions
      return {
        rows: [
          { 
            id: 'super_admin_all',
            verb: '*',
            resource: '*',
            conditions: null
          }
        ]
      };
    }
    
    if (sql.includes('INSERT INTO rbac_audit_log')) {
      return { rows: [] };
    }
    
    // Default empty response
    return { rows: [] };
  }
  
  async connect(): Promise<any> {
    return {
      query: this.query.bind(this),
      release: () => {}
    };
  }
  
  async end(): Promise<void> {
    // Mock cleanup
  }
  
  // Required properties for DatabaseRBAC health check
  get totalCount(): number { return 5; }
  get idleCount(): number { return 3; }
  get waitingCount(): number { return 0; }
  
  on(event: string, callback: (...args: any[]) => void): void {
    // Mock event handling
    console.log(`Mock pool event: ${event}`);
  }
}

async function testDatabaseRBACWithMock() {
  console.log('🔍 Testing DatabaseRBAC with Mock PostgreSQL...');
  
  try {
    // Create mock pool
    const mockPool = new MockPool() as any;
    console.log('✅ Mock PostgreSQL pool created');

    // Test DatabaseRBAC initialization
    const rbac = new DatabaseRBAC(mockPool);
    console.log('✅ DatabaseRBAC instance created');

    // Test health check
    const health = await rbac.healthCheck();
    console.log('✅ DatabaseRBAC health check:', health);

    if (health.status !== 'healthy') {
      throw new Error(`DatabaseRBAC health check failed: ${JSON.stringify(health)}`);
    }

    // Test permission check with super admin
    const adminSubject: Subject = {
      user_id: 'admin-user',
      org_id: 'admin-org',
      roles: ['super_admin']
    };

    const adminAction: Action = { verb: 'sign', resource: 'images' };
    const adminResource: Resource = { type: 'images', org_id: 'admin-org' };
    const adminContext: Context = {
      timestamp: new Date(),
      request_id: 'mock-test-admin-123',
      ip_address: '127.0.0.1'
    };

    const adminResult = await rbac.check(adminSubject, adminAction, adminResource, adminContext);
    console.log('✅ Admin permission check:', adminResult);

    if (!adminResult.allow) {
      console.warn('⚠️  Admin permission check failed:', adminResult.reason);
    }

    // Test permission check with limited user
    const userSubject: Subject = {
      user_id: 'regular-user',
      org_id: 'user-org',
      roles: ['image_signer']
    };

    const userAction: Action = { verb: 'read', resource: 'images' };
    const userResource: Resource = { type: 'images', org_id: 'user-org' };
    const userContext: Context = {
      timestamp: new Date(),
      request_id: 'mock-test-user-456',
      ip_address: '127.0.0.1'
    };

    const userResult = await rbac.check(userSubject, userAction, userResource, userContext);
    console.log('✅ User permission check:', userResult);

    // Test getSubjectRoles method
    const roles = await rbac.getSubjectRoles('test-user', 'test-org');
    console.log('✅ getSubjectRoles result:', roles);

    // Test metrics
    const metrics = rbac.getMetrics();
    console.log('✅ DatabaseRBAC metrics:', metrics);

    // Verify metrics were updated
    if (metrics.checkCount === 0) {
      throw new Error('Metrics not being updated correctly');
    }

    console.log('🎉 DatabaseRBAC mock test completed successfully!');
    console.log('📊 Test Summary:');
    console.log(`   - Permission checks performed: ${metrics.checkCount}`);
    console.log(`   - Cache hits: ${metrics.cacheHits}`);
    console.log(`   - Average check duration: ${metrics.averageCheckDuration}ms`);
    
    return true;
    
  } catch (error) {
    console.error('❌ DatabaseRBAC mock test failed:', error);
    return false;
  }
}

// Run test if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testDatabaseRBACWithMock().then(success => {
    process.exit(success ? 0 : 1);
  });
}

export { testDatabaseRBACWithMock };
